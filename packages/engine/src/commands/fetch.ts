import fs from 'node:fs';
import type { Command } from 'commander';
import { openContext, emit, type GlobalOpts } from './context.js';
import { runFetch } from '../core/pipeline.js';
import { RunDir } from '../core/run.js';
import { readJson, writeJson } from '../core/fsutil.js';
import { AgentPostingSchema, IngestFileSchema } from '../schema/index.js';
import { applyAgentPostings } from '../fetchers/index.js';
import { z } from 'zod';

interface FetchOpts extends GlobalOpts {
  postings?: string;
  sheetRows?: string;
  dryRun?: boolean;
}

/** Second phase of fetch: merge postings the agent read with its own browser into the batches. */
function mergeAgentPostings(ctx: ReturnType<typeof openContext>, file: string) {
  const run = new RunDir(ctx.workspace, ctx.stamp);
  const raw = readJson<unknown>(file);
  const agentPostings = z.array(AgentPostingSchema).parse(Array.isArray(raw) ? raw : (raw as { postings: unknown[] }).postings);
  let filled = 0;
  for (const batch of run.listBatches()) {
    const before = batch.postings.filter((p) => p.fetchStatus === 'ok').length;
    batch.postings = applyAgentPostings(batch.postings, agentPostings, ctx.config.fetch.descriptionMaxChars);
    filled += batch.postings.filter((p) => p.fetchStatus === 'ok').length - before;
    run.writeBatch(batch);
  }
  const pending = run.listBatches().flatMap((b) => b.postings).filter((p) => p.fetchStatus !== 'ok' && p.fetchStatus !== 'closed');
  writeJson(run.file('pending-urls.json'), { run: ctx.stamp, urls: pending.map((p) => ({ jobId: p.jobId, url: p.url, status: p.fetchStatus, title: p.title, company: p.company })) });
  ctx.log.info(`${filled} postings completed from the agent, ${pending.length} still pending`);
  return { run: ctx.stamp, filled, pending: pending.length, batches: run.listBatches().length };
}

export function registerFetch(program: Command): void {
  program
    .command('fetch')
    .description('Read new alert emails, extract job leads, fetch descriptions and write runs/<date>/batch-NN.json')
    .option('--postings <file>', 'merge postings the agent read with its browser (JSON array of {url, title, company, location, description})')
    .option('--sheet-rows <file>', 'current Sheet rows dumped by the agent (host-connector sheet mode)')
    .option('--dry-run', 'do not fetch descriptions, do not touch the mailbox')
    .action(async (opts: FetchOpts, cmd: Command) => {
      const ctx = openContext({ ...cmd.optsWithGlobals(), ...opts });
      if (opts.postings) {
        emit(mergeAgentPostings(ctx, opts.postings));
        return;
      }
      const summary = await runFetch({ ...ctx, sheetRowsFile: opts.sheetRows, dryRun: opts.dryRun });
      emit(summary);
    });

  program
    .command('ingest')
    .description('Like fetch, but the alert emails come from a JSON file produced by the agent (host-connector / host-browser modes)')
    .requiredOption('--input <file>', 'JSON { messages: [{ id, from, subject, date, text, html }] }')
    .option('--sheet-rows <file>', 'current Sheet rows dumped by the agent (host-connector sheet mode)')
    .option('--dry-run', 'do not fetch descriptions')
    .action(async (opts: FetchOpts & { input: string }, cmd: Command) => {
      const ctx = openContext({ ...cmd.optsWithGlobals(), ...opts });
      if (!fs.existsSync(opts.input)) throw new Error(`Input file not found: ${opts.input}`);
      const file = IngestFileSchema.parse(readJson(opts.input));
      const summary = await runFetch({ ...ctx, messages: file.messages, sheetRowsFile: opts.sheetRows, dryRun: opts.dryRun });
      emit(summary);
    });
}
