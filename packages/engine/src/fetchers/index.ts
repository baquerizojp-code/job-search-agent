import type { Browser } from 'playwright';
import type { Lead, Posting } from '../schema/index.js';
import type { Logger } from '../core/logger.js';
import type { Fetcher, FetchContext, FetchResult } from './types.js';
import { jobIdOf } from '../schema/index.js';
import { linkedInFetcher } from './linkedin.js';
import { genericFetcher } from './generic.js';
import { errorMessage, sleep } from './page.js';

export type { Fetcher, FetchContext, FetchResult } from './types.js';
export { applyAgentPostings } from './agent.js';
export { htmlToText, truncate, decodeEntities } from './html.js';
export { classifyText } from './classify.js';
export { parseGuestHtml, linkedInFetcher } from './linkedin.js';
export { genericFetcher } from './generic.js';

const FETCHERS: Fetcher[] = [linkedInFetcher, genericFetcher];

export function fetcherFor(lead: Lead): Fetcher {
  return FETCHERS.find((f) => f.matches(lead)) ?? genericFetcher;
}

export interface FetchPostingsOptions {
  log: Logger;
  descriptionMaxChars: number;
  /** Stop starting new fetches once this many seconds have elapsed. */
  timeBudgetSec: number;
  headless: boolean;
  /** Fetch at most this many leads; the rest stay pending. */
  maxPostings: number;
  /** Parallel fetches. Default 1: LinkedIn rate-limits aggressively. */
  concurrency?: number;
  /** Random pause between requests, in ms. Default 1000-2000. */
  jitterMs?: [number, number];
}

function jitter([min, max]: [number, number]): number {
  return min + Math.random() * Math.max(0, max - min);
}

function pendingPosting(lead: Lead, error?: string): Posting {
  const p: Posting = { ...lead, jobId: jobIdOf(lead), description: '', descriptionTruncated: false, fetchStatus: 'pending' };
  if (error) p.fetchError = error;
  return p;
}

function toPosting(lead: Lead, r: FetchResult, maxChars: number): Posting {
  const p: Posting = {
    ...lead,
    jobId: jobIdOf(lead),
    title: r.title || lead.title,
    company: r.company || lead.company,
    location: r.location || lead.location,
    description: r.description,
    descriptionTruncated: r.descriptionTruncated ?? r.description.length >= maxChars,
    fetchStatus: r.status,
    fetchedAt: new Date().toISOString(),
  };
  if (r.error) p.fetchError = r.error;
  return p;
}

/**
 * Fetch descriptions for leads, one Posting per lead, in input order. Leads
 * not reached inside the time budget or beyond maxPostings come back with
 * fetchStatus 'pending'. A single failing fetch never aborts the run.
 */
export async function fetchPostings(leads: Lead[], opts: FetchPostingsOptions): Promise<Posting[]> {
  const { log, descriptionMaxChars } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const jitterRange = opts.jitterMs ?? [1_000, 2_000];
  const deadline = Date.now() + opts.timeBudgetSec * 1_000;

  let browserPromise: Promise<Browser> | undefined;
  const ctx: FetchContext = {
    log,
    descriptionMaxChars,
    browser: () => {
      if (!browserPromise) {
        browserPromise = import('playwright').then(({ chromium }) => {
          log.debug(`launching chromium (headless=${opts.headless})`);
          return chromium.launch({ headless: opts.headless });
        });
        // A failed launch must not poison later attempts.
        browserPromise.catch(() => { browserPromise = undefined; });
      }
      return browserPromise;
    },
  };

  const results: Posting[] = leads.map((lead) => pendingPosting(lead));
  const queue = leads.map((lead, index) => ({ lead, index })).slice(0, Math.max(0, opts.maxPostings));
  let budgetHit = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      if (Date.now() > deadline) {
        if (!budgetHit) {
          budgetHit = true;
          log.warn(`fetch time budget of ${opts.timeBudgetSec}s exceeded; ${queue.length + 1} lead(s) left pending`);
        }
        return;
      }
      const { lead, index } = item;
      const fetcher = fetcherFor(lead);
      const id = jobIdOf(lead);
      const started = Date.now();
      let posting: Posting;
      try {
        const r = await fetcher.fetch(lead, ctx);
        posting = toPosting(lead, r, descriptionMaxChars);
      } catch (err) {
        const msg = errorMessage(err);
        posting = toPosting(lead, { status: 'empty', description: '', error: msg }, descriptionMaxChars);
      }
      results[index] = posting;
      const ms = Date.now() - started;
      log.info(
        `fetch ${lead.source} ${lead.externalId} -> ${posting.fetchStatus} (${posting.description.length} chars, ${ms}ms, ${fetcher.name})` +
          (posting.fetchError ? ` error: ${posting.fetchError}` : ''),
      );
      if (queue.length > 0) await sleep(jitter(jitterRange));
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
  } finally {
    if (browserPromise) {
      await browserPromise.then((b) => b.close()).catch((err) => log.debug(`browser close failed: ${errorMessage(err)}`));
    }
  }

  const pending = results.filter((p) => p.fetchStatus === 'pending').length;
  if (pending > 0) log.info(`${pending} lead(s) left pending`);
  return results;
}
