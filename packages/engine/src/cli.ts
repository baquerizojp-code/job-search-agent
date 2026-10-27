#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { registerInit } from './commands/init.js';
import { registerSetup } from './commands/setup.js';
import { registerFetch } from './commands/fetch.js';
import { registerCommit } from './commands/commit.js';
import { registerDoctor } from './commands/doctor.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command()
  .name('jobsearch')
  .description('Engine for the job-search agent skill: reads job-alert emails, fetches postings, keeps a Google Sheet tracker')
  .version(version)
  .option('-w, --workspace <dir>', 'workspace folder (default: ~/job-search or the one registered by init)')
  .option('--run <YYYY-MM-DD>', 'operate on a specific run instead of today')
  .option('-q, --quiet', 'only errors on stderr')
  .option('-v, --verbose', 'debug output on stderr');

registerInit(program);
registerSetup(program);
registerFetch(program);
registerCommit(program);
registerDoctor(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${msg}\n`);
  process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
  process.exit(1);
});
