import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { emit } from './context.js';
import { resolveWorkspace } from '../core/paths.js';
import { checkLinkedinProfile } from '../core/linkedin.js';

export function registerLinkedin(program: Command): void {
  const linkedin = program.command('linkedin').description('Helpers for the browser-assisted LinkedIn profile sync');

  linkedin.command('check')
    .description('Check linkedin/profile.md against LinkedIn character limits before pasting')
    .option('-i, --input <file>', 'profile file (default: linkedin/profile.md)')
    .action((opts: { input?: string }, cmd: Command) => {
      const workspace = resolveWorkspace(cmd.optsWithGlobals().workspace as string | undefined);
      const input = path.resolve(opts.input ?? path.join(workspace, 'linkedin', 'profile.md'));
      if (!fs.existsSync(input)) throw new Error(`No LinkedIn draft at ${input}. Write it first (see references/linkedin-sync.md).`);
      const result = checkLinkedinProfile(fs.readFileSync(input, 'utf8'));
      emit({ input, ...result });
      if (!result.ok) process.exitCode = 2;
    });
}
