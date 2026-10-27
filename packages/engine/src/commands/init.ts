import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { ConfigSchema, DEFAULT_CONFIG } from '../schema/index.js';
import { configPath, saveConfig } from '../core/config.js';
import { ensureDir, writeJson, writeText } from '../core/fsutil.js';
import { pointerPath, resolveWorkspace } from '../core/paths.js';
import { emit } from './context.js';

const WORKSPACE_README = `# Job search workspace

Created by the job-search agent skill. Everything personal lives here:

- config.json: mail, Sheet, fetch and source settings (no secrets)
- profile.md, rubric.md: what the agent scores against (written during setup)
- cv/: your CV in Markdown plus generated docx and pdf
- runs/YYYY-MM-DD/: batches, scores and reports of each run
- logs/: daily logs with secrets redacted

Secrets (mail password, Sheet script URL) are stored outside this folder, in ~/.job-search/.
`;

export function registerInit(program: Command): void {
  program
    .command('init [dir]')
    .description('Create the workspace folder with a default config.json and register it as the current workspace')
    .option('-y, --yes', 'accept defaults without prompting')
    .option('--language <code>', 'language for interviews and documents (en, es, ...)')
    .option('--timezone <tz>', 'IANA time zone, e.g. America/Guayaquil')
    .option('--cv <file>', 'copy an existing Markdown CV into cv/source.md')
    .option('--cloud', 'also copy the skill into .claude/skills and .agents/skills (needed for cloud routines)')
    .action(async (dir: string | undefined, opts: { yes?: boolean; language?: string; timezone?: string; cv?: string; cloud?: boolean }) => {
      const workspace = dir ? path.resolve(dir) : resolveWorkspace();
      const exists = fs.existsSync(configPath(workspace));
      const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      let language = opts.language ?? 'en';
      let timezone = opts.timezone ?? sysTz;

      if (!opts.yes && process.stdin.isTTY) {
        p.intro('job-search workspace');
        if (exists) {
          const ok = await p.confirm({ message: `A workspace already exists at ${workspace}. Keep its config and only fill gaps?`, initialValue: true });
          if (p.isCancel(ok) || !ok) { p.cancel('Nothing changed.'); return; }
        }
        const lang = await p.select({
          message: 'Language for the interview, CV and reports',
          options: [{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }, { value: 'pt', label: 'Português' }],
          initialValue: language,
        });
        if (p.isCancel(lang)) { p.cancel('Nothing changed.'); return; }
        language = lang;
        const tz = await p.text({ message: 'Time zone (IANA)', initialValue: timezone, validate: (v = "") => (v.includes('/') || v === 'UTC' ? undefined : 'Use an IANA name like America/Guayaquil') });
        if (p.isCancel(tz)) { p.cancel('Nothing changed.'); return; }
        timezone = tz;
      }

      for (const sub of ['cv', 'cv/tailored', 'runs', 'state', 'logs', 'linkedin']) ensureDir(path.join(workspace, sub));
      const existing = exists ? ConfigSchema.parse(JSON.parse(fs.readFileSync(configPath(workspace), 'utf8'))) : DEFAULT_CONFIG;
      const config = ConfigSchema.parse({ ...existing, language, timezone });
      saveConfig(workspace, config);
      if (!fs.existsSync(path.join(workspace, 'README.md'))) writeText(path.join(workspace, 'README.md'), WORKSPACE_README);
      if (!fs.existsSync(path.join(workspace, '.gitignore'))) writeText(path.join(workspace, '.gitignore'), 'logs/\nruns/*/batch-*.json\nstate/\n');
      if (opts.cv) {
        if (!fs.existsSync(opts.cv)) throw new Error(`CV not found: ${opts.cv}`);
        fs.copyFileSync(opts.cv, path.join(workspace, 'cv', 'source.md'));
      }
      writeJson(pointerPath(), { workspace });
      if (opts.cloud) copySkillIntoWorkspace(workspace);
      if (!opts.yes && process.stdin.isTTY) p.outro(`Workspace ready at ${workspace}`);
      emit({ workspace, config: configPath(workspace), language, timezone, cloudSkillCopied: Boolean(opts.cloud) });
    });
}

/** Cloud routines only see files committed in the workspace repo, so copy the skill in. */
function copySkillIntoWorkspace(workspace: string): void {
  // fileURLToPath, not URL.pathname: handles spaces (%20) and Windows drive letters.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../../skills/job-search'),      // monorepo checkout (src/commands -> repo root)
    path.resolve(here, '../../../skills/job-search'),         // dist/commands inside the published package
    path.resolve(here, '../../skills/job-search'),
  ];
  const src = candidates.find((c) => fs.existsSync(path.join(c, 'SKILL.md')));
  if (!src) throw new Error('Could not find the bundled skill folder to copy. Install it with `npx skills add baquerizojp-code/job-search-agent` instead.');
  for (const dest of ['.claude/skills/job-search', '.agents/skills/job-search']) {
    fs.cpSync(src, path.join(workspace, dest), { recursive: true });
  }
}
