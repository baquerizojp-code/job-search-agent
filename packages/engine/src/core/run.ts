import path from 'node:path';
import fs from 'node:fs';
import { BatchFileSchema, ScoresFileSchema, type BatchFile, type Posting, type ScoresFile } from '../schema/index.js';
import { ensureDir, readJson, writeJson } from './fsutil.js';

/** Files of one run live in <workspace>/runs/<YYYY-MM-DD>/ */
export class RunDir {
  readonly dir: string;
  constructor(readonly workspace: string, readonly stamp: string) {
    this.dir = path.join(workspace, 'runs', stamp);
    ensureDir(this.dir);
  }

  file(name: string): string {
    return path.join(this.dir, name);
  }

  batchFile(n: number): string {
    return this.file(`batch-${String(n).padStart(2, '0')}.json`);
  }

  scoresFile(n: number): string {
    return this.file(`scores-${String(n).padStart(2, '0')}.json`);
  }

  listBatches(): BatchFile[] {
    return fs.readdirSync(this.dir)
      .filter((f) => /^batch-\d+\.json$/.test(f))
      .sort()
      .map((f) => BatchFileSchema.parse(readJson(this.file(f))));
  }

  listScores(): ScoresFile[] {
    return fs.readdirSync(this.dir)
      .filter((f) => /^scores-\d+\.json$/.test(f))
      .sort()
      .map((f) => ScoresFileSchema.parse(readJson(this.file(f))));
  }

  /** Writes batch files numbered from startAt + 1; returns how many were written. */
  writeBatches(postings: Posting[], batchSize: number, startAt = 0): number {
    let n = 0;
    for (let i = 0; i < postings.length; i += batchSize) {
      n += 1;
      const batch: BatchFile = { run: this.stamp, batch: startAt + n, postings: postings.slice(i, i + batchSize) };
      writeJson(this.batchFile(startAt + n), batch);
    }
    return n;
  }

  writeBatch(batch: BatchFile): void {
    writeJson(this.batchFile(batch.batch), batch);
  }
}

/** Per-run bookkeeping that survives between fetch and commit. */
export interface RunState {
  run: string;
  startedAt: string;
  mailProvider: string;
  sheetProvider: string;
  /** Message ids whose leads ended up in batches; marked processed on commit. */
  messageIds: string[];
  /** Message ids that had no leads at all (already in sheet or nothing extracted); processed immediately. */
  emptyMessageIds: string[];
  counters: Record<string, number>;
  committedAt?: string;
}

export function runStatePath(run: RunDir): string {
  return run.file('run.json');
}
