import type { Command } from 'commander';
import { openContext, emit, type GlobalOpts } from './context.js';
import { runCommit } from '../core/commit.js';

export function registerCommit(program: Command): void {
  program
    .command('commit')
    .description('Validate runs/<date>/scores-NN.json, write rows to the tracker, mark emails processed, write report.md')
    .option('--sheet-rows <file>', 'current Sheet rows dumped by the agent (host-connector sheet mode)')
    .option('--dry-run', 'validate and render the report without writing anywhere')
    .action(async (opts: GlobalOpts & { sheetRows?: string; dryRun?: boolean }, cmd: Command) => {
      const ctx = openContext({ ...cmd.optsWithGlobals(), ...opts });
      const summary = await runCommit({ ...ctx, sheetRowsFile: opts.sheetRows, dryRun: opts.dryRun });
      emit(summary);
      if (summary.errors.length) process.exitCode = 2;
    });
}
