import path from 'node:path';
import fs from 'node:fs';
import { SHEET_HEADERS, rowFromValues, rowToValues, type SheetRow, type SheetTab } from '../../schema/index.js';
import { readJsonIfExists, writeJson } from '../../core/fsutil.js';
import type { Logger } from '../../core/logger.js';
import type { SheetProvider } from './types.js';

export interface HostConnectorSheetProviderOptions {
  /** Run directory where commit.json is accumulated. */
  runDir: string;
  /** JSON with the current Sheet contents, produced by the agent from its Sheets tool. Defaults to <runDir>/sheet-rows.json. */
  rowsFile?: string;
  log: Logger;
}

export type SheetValues = (string | number)[];

/** Shape of <runDir>/commit.json: everything the agent must write to the Sheet with its own tool. */
export interface SheetCommitFile {
  headers: readonly string[];
  appendRows: Record<SheetTab, SheetValues[]>;
  statusUpdates: { jobId: string; status: string; note?: string }[];
}

/** Shape of the rows file the agent writes before a run: rows as arrays or header-keyed objects. */
export type SheetRowsFile = Partial<Record<SheetTab, (unknown[] | Record<string, unknown>)[]>>;

const JOB_ID_INDEX = SHEET_HEADERS.indexOf('Job ID');

export const COMMIT_FILE = 'commit.json';
export const ROWS_FILE = 'sheet-rows.json';

/**
 * Sheet provider for hosts where the agent (not the engine) holds the Google
 * Sheets tool. Reads come from a rows file the agent exported; writes are
 * queued in commit.json for the agent to apply after the run.
 */
export class HostConnectorSheetProvider implements SheetProvider {
  readonly name = 'host-connector';
  readonly commitFile: string;
  readonly rowsFile: string;
  private readonly log: Logger;

  constructor(opts: HostConnectorSheetProviderOptions) {
    this.commitFile = path.join(opts.runDir, COMMIT_FILE);
    this.rowsFile = opts.rowsFile ?? path.join(opts.runDir, ROWS_FILE);
    this.log = opts.log;
  }

  async ping(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: 'host-connector: the agent writes the Sheet' };
  }

  async listRows(tab: SheetTab): Promise<Partial<SheetRow>[]> {
    if (!fs.existsSync(this.rowsFile)) {
      this.log.warn(`host-connector: no rows file at ${this.rowsFile}; treating ${tab} as empty (dedupe disabled)`);
      return [];
    }
    const file = readJsonIfExists<SheetRowsFile>(this.rowsFile) ?? {};
    const rows = file[tab];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r): r is unknown[] | Record<string, unknown> => r != null && typeof r === 'object')
      .map((r) => rowFromValues(r))
      // A raw Sheets export often includes the header row; drop it along with empty rows.
      .filter((r) => (r.jobId || r.link) && r.jobId !== 'Job ID');
  }

  async appendRows(tab: SheetTab, rows: SheetRow[]): Promise<{ appended: number; deferred: boolean }> {
    if (rows.length === 0) return { appended: 0, deferred: true };
    const commit = this.readCommit();
    const queued = new Set(
      [...commit.appendRows.Jobs, ...commit.appendRows.Skipped].map((v) => String(v[JOB_ID_INDEX] ?? '')),
    );
    let appended = 0;
    for (const row of rows) {
      if (queued.has(row.jobId)) continue;
      queued.add(row.jobId);
      commit.appendRows[tab].push(rowToValues(row));
      appended += 1;
    }
    this.writeCommit(commit);
    this.log.info(`host-connector: queued ${appended} row(s) for ${tab} in ${COMMIT_FILE}`);
    return { appended, deferred: true };
  }

  async updateStatus(jobId: string, status: string, note?: string): Promise<{ updated: boolean; deferred: boolean }> {
    const commit = this.readCommit();
    const entry = { jobId, status, ...(note ? { note } : {}) };
    const idx = commit.statusUpdates.findIndex((u) => u.jobId === jobId);
    if (idx >= 0) commit.statusUpdates[idx] = entry;
    else commit.statusUpdates.push(entry);
    this.writeCommit(commit);
    this.log.info(`host-connector: queued status ${status} for ${jobId} in ${COMMIT_FILE}`);
    return { updated: true, deferred: true };
  }

  private readCommit(): SheetCommitFile {
    const existing = readJsonIfExists<Partial<SheetCommitFile>>(this.commitFile);
    return {
      headers: SHEET_HEADERS,
      appendRows: {
        Jobs: existing?.appendRows?.Jobs ?? [],
        Skipped: existing?.appendRows?.Skipped ?? [],
      },
      statusUpdates: existing?.statusUpdates ?? [],
    };
  }

  private writeCommit(commit: SheetCommitFile): void {
    writeJson(this.commitFile, commit);
  }
}
