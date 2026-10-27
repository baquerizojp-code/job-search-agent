import path from 'node:path';
import type { Config, Lead, MailMessage, Posting, Secrets, SheetRow } from '../schema/index.js';
import { jobIdOf } from '../schema/index.js';
import type { Logger } from './logger.js';
import { RunDir, runStatePath, type RunState } from './run.js';
import { readJsonIfExists, writeJson } from './fsutil.js';
import { canonicalUrl } from './jobid.js';
import { createMailProvider, isHostMailMode } from '../providers/mail/index.js';
import { createSheetProvider } from '../providers/sheet/index.js';
import { extractorsFor, extractLeads } from '../sources/email/index.js';
import { fetchPostings } from '../fetchers/index.js';
import fs from 'node:fs';

export interface FetchOptions {
  workspace: string;
  config: Config;
  secrets: Secrets;
  log: Logger;
  stamp: string;
  /** Messages supplied by the agent (ingest). When undefined the engine reads the mailbox. */
  messages?: MailMessage[];
  /** JSON dump of current Sheet rows, for host-connector sheet mode. */
  sheetRowsFile?: string;
  dryRun?: boolean;
}

export interface FetchSummary {
  run: string;
  runDir: string;
  messages: number;
  leads: number;
  newLeads: number;
  duplicates: number;
  carriedOver: number;
  postings: number;
  batches: number;
  pending: number;
  pendingUrlsFile?: string;
  mode: Config['fetch']['mode'];
  mailProvider: string;
  sheetProvider: string;
}

interface Carryover {
  leads: (Lead & { attempts: number })[];
}

/** Keys already present in the Sheet: job ids and canonical links. */
export async function loadKnownKeys(opts: Pick<FetchOptions, 'config' | 'secrets' | 'log' | 'sheetRowsFile'>, run: RunDir): Promise<Set<string>> {
  const sheet = createSheetProvider(opts.config.sheet.provider, {
    url: opts.secrets.appsScript?.url,
    secret: opts.secrets.appsScript?.secret,
    runDir: run.dir,
    rowsFile: opts.sheetRowsFile,
    log: opts.log,
  });
  const keys = new Set<string>();
  for (const tab of ['Jobs', 'Skipped'] as const) {
    const rows = await sheet.listRows(tab);
    for (const r of rows) {
      if (r.jobId) keys.add(r.jobId);
      if (r.link) keys.add(canonicalUrl(r.link));
    }
  }
  opts.log.info(`Sheet knows ${keys.size} keys (job ids + links)`);
  return keys;
}

function mergeLeads(all: Lead[]): Lead[] {
  const byId = new Map<string, Lead>();
  for (const lead of all) {
    const id = jobIdOf(lead);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { ...lead, messageIds: [...lead.messageIds] });
      continue;
    }
    prev.title ??= lead.title;
    prev.company ??= lead.company;
    prev.location ??= lead.location;
    prev.snippet ??= lead.snippet;
    for (const m of lead.messageIds) if (!prev.messageIds.includes(m)) prev.messageIds.push(m);
  }
  return [...byId.values()];
}

/** Leads from earlier runs that could not be fetched or scored; retried up to 3 times. */
function loadCarryover(workspace: string, currentStamp: string): Carryover['leads'] {
  const runsDir = path.join(workspace, 'runs');
  if (!fs.existsSync(runsDir)) return [];
  const stamps = fs.readdirSync(runsDir).filter((s) => s < currentStamp).sort().slice(-3);
  const out: Carryover['leads'] = [];
  for (const s of stamps) {
    const c = readJsonIfExists<Carryover>(path.join(runsDir, s, 'carryover.json'));
    if (c) out.push(...c.leads);
  }
  return out;
}

export async function runFetch(opts: FetchOptions): Promise<FetchSummary> {
  const { config, secrets, log, stamp, workspace } = opts;
  const run = new RunDir(workspace, stamp);
  const existingState = readJsonIfExists<RunState>(runStatePath(run));
  if (existingState?.committedAt) {
    log.warn(`Run ${stamp} was already committed at ${existingState.committedAt}; new leads will be added as extra batches.`);
  }

  const known = await loadKnownKeys(opts, run);
  // Leads already placed in batches of this same run (fetch called twice in a day).
  for (const b of run.listBatches()) for (const p of b.postings) known.add(p.jobId);

  // 1. Messages
  let messages = opts.messages;
  const mail = messages ? undefined : await createMailProvider(config, secrets, log);
  const hostMode = isHostMailMode(config);
  if (!messages) {
    if (!mail) throw new Error(`Mail provider ${config.mail.provider} needs messages from the agent. Use \`jobsearch ingest --input emails.json\`.`);
    await mail.connect();
    try {
      await mail.ensureFolders(config.mail.folders);
      const since = new Date(Date.now() - config.mail.lookbackDays * 86_400_000);
      messages = await mail.listAlerts({ senders: config.mail.senders, since, folders: config.mail.folders, archive: config.mail.archiveAlerts, limit: 200 });
    } finally {
      await mail.close();
    }
  }
  log.info(`${messages.length} alert emails to process`);

  // 2. Leads
  const extractors = extractorsFor(config.sources.email);
  const rawLeads: Lead[] = [];
  const leadsPerMessage = new Map<string, number>();
  for (const msg of messages) {
    const leads = extractLeads(msg, extractors);
    leadsPerMessage.set(msg.id, leads.length);
    rawLeads.push(...leads);
    log.debug(`message ${msg.id} "${msg.subject}" -> ${leads.length} leads`);
  }
  const merged = mergeLeads(rawLeads);
  const carried = loadCarryover(workspace, stamp).filter((l) => !known.has(jobIdOf(l)) && l.attempts < 3);
  const fresh = merged.filter((l) => !known.has(jobIdOf(l)) && !known.has(canonicalUrl(l.url)));
  const duplicates = merged.length - fresh.length;
  const candidates = mergeLeads([...fresh, ...carried]).slice(0, config.fetch.maxPostingsPerRun);
  log.info(`${merged.length} leads, ${fresh.length} new, ${duplicates} already tracked, ${carried.length} carried over`);

  // Messages whose every lead is already tracked can be marked processed right away.
  const newMessageIds = new Set(candidates.flatMap((l) => l.messageIds));
  const emptyMessageIds = messages.map((m) => m.id).filter((id) => !newMessageIds.has(id));

  // 3. Postings
  let postings: Posting[];
  if (config.fetch.mode === 'engine' && !opts.dryRun) {
    postings = await fetchPostings(candidates, {
      log,
      descriptionMaxChars: config.fetch.descriptionMaxChars,
      timeBudgetSec: config.fetch.timeBudgetSec,
      headless: config.fetch.headless,
      maxPostings: config.fetch.maxPostingsPerRun,
    });
  } else {
    postings = candidates.map((l) => ({ ...l, jobId: jobIdOf(l), description: l.snippet ?? '', descriptionTruncated: false, fetchStatus: 'pending' as const }));
  }

  const pending = postings.filter((p) => p.fetchStatus !== 'ok' && p.fetchStatus !== 'closed');
  const pendingFile = run.file('pending-urls.json');
  writeJson(pendingFile, { run: stamp, urls: pending.map((p) => ({ jobId: p.jobId, url: p.url, status: p.fetchStatus, title: p.title, company: p.company })) });

  const existingBatches = run.listBatches().length;
  const batches = existingBatches + run.writeBatches(postings, config.fetch.batchSize, existingBatches);

  const state: RunState = {
    run: stamp,
    startedAt: existingState?.startedAt ?? new Date().toISOString(),
    mailProvider: config.mail.provider,
    sheetProvider: config.sheet.provider,
    messageIds: [...new Set([...(existingState?.messageIds ?? []), ...newMessageIds])],
    emptyMessageIds: [...new Set([...(existingState?.emptyMessageIds ?? []), ...emptyMessageIds])],
    counters: {
      ...(existingState?.counters ?? {}),
      messages: (existingState?.counters.messages ?? 0) + messages.length,
      leads: (existingState?.counters.leads ?? 0) + merged.length,
      duplicates: (existingState?.counters.duplicates ?? 0) + duplicates,
      carriedOver: carried.length,
      postings: (existingState?.counters.postings ?? 0) + postings.length,
    },
  };
  writeJson(runStatePath(run), state);

  // Messages with nothing new are processed now when the engine owns the mailbox.
  if (mail && emptyMessageIds.length && !opts.dryRun) {
    await mail.connect();
    try { await mail.markProcessed(emptyMessageIds, config.mail.folders); } finally { await mail.close(); }
    log.info(`${emptyMessageIds.length} emails with nothing new marked processed`);
  } else if (hostMode && emptyMessageIds.length) {
    log.info(`${emptyMessageIds.length} emails with nothing new; the agent should label them processed (listed in run.json emptyMessageIds)`);
  }

  return {
    run: stamp,
    runDir: run.dir,
    messages: messages.length,
    leads: merged.length,
    newLeads: fresh.length,
    duplicates,
    carriedOver: carried.length,
    postings: postings.length,
    batches,
    pending: pending.length,
    pendingUrlsFile: pending.length ? pendingFile : undefined,
    mode: config.fetch.mode,
    mailProvider: config.mail.provider,
    sheetProvider: config.sheet.provider,
  };
}

export function postingToRow(p: Posting, score: { total: number; verdict: SheetRow['verdict']; company: string; role: string; location: string; match_summary: string; red_flags: string }, visible: number, stamp: string): SheetRow {
  return {
    date: stamp,
    source: p.source,
    company: score.company || p.company || 'Unknown',
    role: score.role || p.title || 'Unknown',
    location: score.location || p.location || 'Not specified',
    link: p.url,
    score: visible,
    verdict: score.verdict,
    matchSummary: score.match_summary,
    redFlags: score.red_flags,
    status: 'New',
    statusUpdated: '',
    notes: p.fetchStatus === 'partial' || p.fetchStatus === 'pending' ? `scored from ${p.fetchStatus} description` : '',
    jobId: p.jobId,
  };
}
