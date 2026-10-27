import type { Config, Lead, Posting, Score, Secrets, SheetRow } from '../schema/index.js';
import { ScoreSchema, visibleScore } from '../schema/index.js';
import type { Logger } from './logger.js';
import { RunDir, runStatePath, type RunState } from './run.js';
import { readJsonIfExists, writeJson, writeText } from './fsutil.js';
import { createMailProvider, isHostMailMode } from '../providers/mail/index.js';
import { createSheetProvider } from '../providers/sheet/index.js';
import { postingToRow } from './pipeline.js';

export interface CommitOptions {
  workspace: string;
  config: Config;
  secrets: Secrets;
  log: Logger;
  stamp: string;
  sheetRowsFile?: string;
  dryRun?: boolean;
}

export interface ScoreError {
  batch: number;
  jobId: string;
  issues: string[];
}

export interface CommitSummary {
  run: string;
  runDir: string;
  scored: number;
  apply: number;
  review: number;
  skip: number;
  closed: number;
  unscored: number;
  carriedOver: number;
  written: { Jobs: number; Skipped: number };
  deferred: boolean;
  processedMessageIds: number;
  errors: ScoreError[];
  reportFile: string;
  commitFile?: string;
}

/** Validate every scores-NN.json against its batch; returns errors the agent must fix. */
export function validateScores(run: RunDir): { scores: Map<string, Score>; errors: ScoreError[] } {
  const batches = run.listBatches();
  const postingIds = new Set(batches.flatMap((b) => b.postings.map((p) => p.jobId)));
  const scores = new Map<string, Score>();
  const errors: ScoreError[] = [];
  for (const file of run.listScores()) {
    for (const raw of file.scores as unknown[]) {
      const parsed = ScoreSchema.safeParse(raw);
      const jobId = (raw as { jobId?: string })?.jobId ?? '?';
      if (!parsed.success) {
        errors.push({ batch: file.batch, jobId, issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
        continue;
      }
      if (!postingIds.has(parsed.data.jobId)) {
        errors.push({ batch: file.batch, jobId, issues: ['jobId not present in any batch of this run'] });
        continue;
      }
      scores.set(parsed.data.jobId, parsed.data);
    }
  }
  return { scores, errors };
}

export async function runCommit(opts: CommitOptions): Promise<CommitSummary> {
  const { config, secrets, log, stamp, workspace } = opts;
  const run = new RunDir(workspace, stamp);
  const state = readJsonIfExists<RunState>(runStatePath(run));
  if (!state) throw new Error(`No run.json for ${stamp}. Run \`jobsearch fetch\` first.`);

  const batches = run.listBatches();
  const postings: Posting[] = batches.flatMap((b) => b.postings);
  const { scores, errors } = validateScores(run);
  if (errors.length) {
    writeJson(run.file('commit-errors.json'), { run: stamp, errors });
    log.error(`${errors.length} invalid scores; fix them in the scores files and re-run commit (details in commit-errors.json)`);
  }

  const rows: { Jobs: SheetRow[]; Skipped: SheetRow[] } = { Jobs: [], Skipped: [] };
  const unscored: Posting[] = [];
  let closed = 0;
  const alreadyWritten = new Set((readJsonIfExists<{ jobIds: string[] }>(run.file('written.json'))?.jobIds) ?? []);

  for (const p of postings) {
    if (alreadyWritten.has(p.jobId)) continue;
    if (p.fetchStatus === 'closed') {
      closed += 1;
      rows.Skipped.push({ ...postingToRow(p, { total: 0, verdict: 'Skip', company: p.company ?? '', role: p.title ?? '', location: p.location ?? '', match_summary: 'Posting closed before scoring', red_flags: 'closed' }, 1, stamp), status: 'Closed' });
      continue;
    }
    const s = scores.get(p.jobId);
    if (!s) { unscored.push(p); continue; }
    const row = postingToRow(p, s, visibleScore(s.total), stamp);
    (s.verdict === 'Skip' ? rows.Skipped : rows.Jobs).push(row);
  }

  // Unscored postings (authwall, pending, agent skipped them) are retried in later runs, up to 3 times.
  const carry: (Lead & { attempts: number })[] = [];
  const prevCarry = new Map((readJsonIfExists<{ leads: (Lead & { attempts: number })[] }>(run.file('carryover.json'))?.leads ?? []).map((l) => [l.source + ':' + l.externalId, l.attempts]));
  for (const p of unscored) {
    const attempts = (prevCarry.get(p.jobId) ?? 0) + 1;
    const { jobId: _j, description: _d, descriptionTruncated: _t, fetchStatus, fetchedAt: _f, fetchError: _e, ...lead } = p;
    if (attempts >= 3) {
      rows.Skipped.push(postingToRow(p, { total: 0, verdict: 'Skip', company: p.company ?? '', role: p.title ?? '', location: p.location ?? '', match_summary: `Could not be read or scored after ${attempts} runs (${fetchStatus})`, red_flags: 'unreadable' }, 1, stamp));
    } else {
      carry.push({ ...lead, attempts });
    }
  }
  if (!opts.dryRun) writeJson(run.file('carryover.json'), { leads: carry });

  // Write to the tracker.
  const sheet = createSheetProvider(config.sheet.provider, {
    url: secrets.appsScript?.url, secret: secrets.appsScript?.secret, runDir: run.dir, rowsFile: opts.sheetRowsFile, log,
  });
  let deferred = false;
  const written = { Jobs: 0, Skipped: 0 };
  if (!opts.dryRun) {
    for (const tab of ['Jobs', 'Skipped'] as const) {
      if (!rows[tab].length) continue;
      const r = await sheet.appendRows(tab, rows[tab]);
      written[tab] = r.appended;
      deferred = deferred || r.deferred;
    }
    writeJson(run.file('written.json'), { jobIds: [...alreadyWritten, ...rows.Jobs.map((r) => r.jobId), ...rows.Skipped.map((r) => r.jobId)] });
  }

  // Mark emails processed.
  const toProcess = [...new Set([...state.messageIds, ...state.emptyMessageIds])];
  const hostMode = isHostMailMode(config);
  if (!opts.dryRun && toProcess.length && !hostMode) {
    const mail = await createMailProvider(config, secrets, log);
    if (mail) {
      await mail.connect();
      try { await mail.markProcessed(toProcess, config.mail.folders); } finally { await mail.close(); }
    }
  }
  let commitFile: string | undefined;
  if (hostMode || deferred) {
    commitFile = run.file('commit.json');
    const existing = readJsonIfExists<Record<string, unknown>>(commitFile) ?? {};
    writeJson(commitFile, { ...existing, run: stamp, processedMessageIds: toProcess, mailProvider: config.mail.provider, sheetProvider: config.sheet.provider });
  }

  const summary: CommitSummary = {
    run: stamp,
    runDir: run.dir,
    scored: scores.size,
    apply: rows.Jobs.filter((r) => r.verdict === 'Apply').length,
    review: rows.Jobs.filter((r) => r.verdict === 'Review').length,
    skip: rows.Skipped.length - closed,
    closed,
    unscored: unscored.length,
    carriedOver: carry.length,
    written,
    deferred,
    processedMessageIds: toProcess.length,
    errors,
    reportFile: run.file('report.md'),
    commitFile,
  };
  writeText(summary.reportFile, renderReport(summary, rows, state));
  if (!opts.dryRun) writeJson(runStatePath(run), { ...state, committedAt: new Date().toISOString(), counters: { ...state.counters, scored: scores.size, written: written.Jobs + written.Skipped } });
  return summary;
}

function renderReport(s: CommitSummary, rows: { Jobs: SheetRow[]; Skipped: SheetRow[] }, state: RunState): string {
  const line = (r: SheetRow) => `| ${r.score} | ${r.verdict} | ${r.company} | ${r.role} | ${r.location} | ${r.link} |`;
  const jobs = [...rows.Jobs].sort((a, b) => b.score - a.score);
  const lines = [
    `# Job search run ${s.run}`,
    '',
    `Emails: ${state.counters.messages ?? 0} · Leads: ${state.counters.leads ?? 0} · Already tracked: ${state.counters.duplicates ?? 0} · Scored: ${s.scored}`,
    `Apply: ${s.apply} · Review: ${s.review} · Skip: ${s.skip} · Closed: ${s.closed} · Unscored (retry later): ${s.carriedOver}`,
    s.deferred ? '' : `Written to tracker: ${s.written.Jobs} rows in Jobs, ${s.written.Skipped} in Skipped.`,
    s.deferred ? 'Rows are waiting in commit.json for the agent to append with its Sheets tool.' : '',
    '',
    '| Score | Verdict | Company | Role | Location | Link |',
    '|---|---|---|---|---|---|',
    ...jobs.map(line),
    '',
    s.errors.length ? `## Invalid scores (${s.errors.length})\n\n` + s.errors.map((e) => `- batch ${e.batch} ${e.jobId}: ${e.issues.join('; ')}`).join('\n') : '',
  ];
  return lines.filter((l) => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
