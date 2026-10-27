import fs from 'node:fs';
import type { Command } from 'commander';
import { openContext, emit, type GlobalOpts } from './context.js';
import { createSheetProvider } from '../providers/sheet/index.js';
import { createMailProvider, isHostMailMode } from '../providers/mail/index.js';
import { resolveWorkspace } from '../core/paths.js';
import { configPath } from '../core/config.js';

interface Check { name: string; ok: boolean; detail: string }

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check Node, workspace, secrets, Chromium, mailbox and tracker connectivity')
    .action(async (opts: GlobalOpts, cmd: Command) => {
      const checks: Check[] = [];
      const major = Number(process.versions.node.split('.')[0]);
      checks.push({ name: 'node', ok: major >= 20, detail: `v${process.versions.node}` });

      const workspace = resolveWorkspace(cmd.optsWithGlobals().workspace);
      const hasConfig = fs.existsSync(configPath(workspace));
      checks.push({ name: 'workspace', ok: hasConfig, detail: hasConfig ? workspace : `${workspace} has no config.json (run jobsearch init)` });
      if (!hasConfig) { emit({ ok: false, checks }); process.exitCode = 1; return; }

      const ctx = openContext({ ...cmd.optsWithGlobals(), ...opts, quiet: true });
      for (const f of ['profile.md', 'rubric.md']) {
        const ok = fs.existsSync(`${workspace}/${f}`);
        checks.push({ name: f, ok, detail: ok ? 'present' : 'missing: the agent writes it during setup (interview)' });
      }

      try {
        const { chromium } = await import('playwright');
        const exe = chromium.executablePath();
        const ok = fs.existsSync(exe);
        checks.push({ name: 'chromium', ok: ok || ctx.config.fetch.mode === 'browser-first', detail: ok ? exe : 'not installed: run `npx playwright install chromium` (or set fetch.mode to browser-first)' });
      } catch (e) {
        checks.push({ name: 'chromium', ok: false, detail: String(e) });
      }

      if (isHostMailMode(ctx.config)) {
        checks.push({ name: 'mail', ok: true, detail: `${ctx.config.mail.provider}: the agent reads the mailbox` });
      } else {
        try {
          const mail = await createMailProvider(ctx.config, ctx.secrets, ctx.log);
          if (mail) { await mail.connect(); await mail.close(); }
          checks.push({ name: 'mail', ok: true, detail: `${ctx.config.mail.provider} login ok (${ctx.config.mail.address ?? ''})` });
        } catch (e) {
          checks.push({ name: 'mail', ok: false, detail: (e as Error).message });
        }
      }

      try {
        const sheet = createSheetProvider(ctx.config.sheet.provider, { url: ctx.secrets.appsScript?.url, secret: ctx.secrets.appsScript?.secret, runDir: workspace, log: ctx.log });
        const ping = await sheet.ping();
        checks.push({ name: 'sheet', ok: ping.ok, detail: `${ctx.config.sheet.provider}: ${ping.detail ?? (ping.ok ? 'ok' : 'failed')}` });
      } catch (e) {
        checks.push({ name: 'sheet', ok: false, detail: (e as Error).message });
      }

      const ok = checks.every((c) => c.ok);
      emit({ ok, checks });
      if (!ok) process.exitCode = 1;
    });
}
