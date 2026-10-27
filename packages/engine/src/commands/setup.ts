import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { openContext, emit, type GlobalOpts } from './context.js';
import { saveConfig, saveSecrets } from '../core/config.js';
import { createSheetProvider } from '../providers/sheet/index.js';
import type { Config } from '../schema/index.js';

/** Senders we probe for when detecting which job boards already email the user. */
export const KNOWN_ALERT_SENDERS: { source: string; sender: string }[] = [
  { source: 'linkedin', sender: 'jobalerts-noreply@linkedin.com' },
  { source: 'linkedin', sender: 'jobs-noreply@linkedin.com' },
  { source: 'indeed', sender: 'indeed.com' },
  { source: 'glassdoor', sender: 'glassdoor.com' },
  { source: 'wellfound', sender: 'wellfound.com' },
  { source: 'remotive', sender: 'remotive.com' },
  { source: 'weworkremotely', sender: 'weworkremotely.com' },
  { source: 'himalayas', sender: 'himalayas.app' },
  { source: 'getonboard', sender: 'getonbrd.com' },
  { source: 'remoteok', sender: 'remoteok.com' },
];

function cancel(): never {
  p.cancel('Nothing changed.');
  process.exit(0);
}

async function mailSetup(opts: GlobalOpts & { provider?: Config['mail']['provider']; user?: string; appPassword?: string; yes?: boolean }, cmd: Command) {
  const ctx = openContext({ ...cmd.optsWithGlobals(), ...opts });
  const { config, secrets, log } = ctx;
  const interactive = !opts.yes && process.stdin.isTTY;
  let provider = opts.provider ?? config.mail.provider;

  if (interactive) {
    p.intro('Mailbox setup');
    const choice = await p.select({
      message: 'How should the engine read your job-alert emails?',
      options: [
        { value: 'gmail-imap', label: 'Gmail with an app password (IMAP)', hint: 'needs 2-Step Verification; no Google Cloud project' },
        { value: 'host-connector', label: 'My agent has Gmail or Outlook tools (connector, plugin or MCP server)', hint: 'Outlook users: this one; see references/mail-setup.md' },
        { value: 'host-browser', label: 'My agent has a browser', hint: 'the agent opens Gmail/Outlook web with my session' },
      ],
      initialValue: provider,
    });
    if (p.isCancel(choice)) cancel();
    provider = choice as Config['mail']['provider'];
  }

  if (provider === 'gmail-imap') {
    let user = opts.user ?? secrets.gmail?.user ?? config.mail.address ?? '';
    let appPassword = opts.appPassword ?? secrets.gmail?.appPassword ?? '';
    if (interactive) {
      p.note([
        '1. Turn on 2-Step Verification: https://myaccount.google.com/signinoptions/two-step-verification',
        '2. Create an app password: https://myaccount.google.com/apppasswords (name it "job-search")',
        '3. Paste the 16-character password below. It is stored only in ~/.job-search/secrets.json.',
      ].join('\n'), 'Gmail app password');
      const u = await p.text({ message: 'Gmail address', initialValue: user, validate: (v = "") => (v.includes('@') ? undefined : 'Enter the full address') });
      if (p.isCancel(u)) cancel();
      user = u;
      const pw = await p.password({ message: 'App password', validate: (v = "") => (v.replace(/\s/g, '').length >= 16 ? undefined : 'Expected 16 characters') });
      if (p.isCancel(pw)) cancel();
      appPassword = pw.replace(/\s/g, '');
    }
    if (!user || !appPassword) throw new Error('Gmail setup needs --user and --app-password (or run interactively).');
    log.redact(appPassword);

    const { GmailImapProvider } = await import('../providers/mail/gmail-imap.js');
    const mail = new GmailImapProvider({ user, appPassword, log });
    const spin = interactive ? p.spinner() : undefined;
    spin?.start('Connecting to Gmail');
    await mail.connect();
    const detected: string[] = [];
    try {
      await mail.ensureFolders(config.mail.folders);
      const since = new Date(Date.now() - 30 * 86_400_000);
      for (const k of KNOWN_ALERT_SENDERS) {
        const found = await mail.listAlerts({ senders: [k.sender], since, limit: 1, folders: config.mail.folders, archive: false });
        if (found.length) detected.push(k.sender);
      }
    } finally {
      await mail.close();
    }
    spin?.stop(`Connected. Folders ready. Alert senders found in the last 30 days: ${detected.length ? detected.join(', ') : 'none yet'}`);

    let senders = [...new Set([...config.mail.senders, ...detected])];
    if (interactive) {
      const picked = await p.multiselect({
        message: 'Which senders are job alerts? (space to toggle)',
        options: [...new Set([...senders, ...KNOWN_ALERT_SENDERS.map((k) => k.sender)])].map((s) => ({ value: s, label: s })),
        initialValues: senders,
        required: true,
      });
      if (p.isCancel(picked)) cancel();
      senders = picked as string[];
    }
    saveSecrets({ ...secrets, gmail: { user, appPassword } });
    saveConfig(ctx.workspace, { ...config, mail: { ...config.mail, provider, address: user, senders } });
    if (interactive) p.outro('Gmail configured.');
    emit({ provider, address: user, senders, folders: config.mail.folders });
    return;
  }

  if (provider === 'outlook-mcp') {
    throw new Error('The engine does not read Outlook directly. Use --provider host-connector with the Outlook MCP server or connector (see references/mail-setup.md in the skill).');
  }

  saveConfig(ctx.workspace, { ...config, mail: { ...config.mail, provider } });
  if (interactive) p.outro(`Mail mode set to ${provider}. The agent will read the mailbox and call \`jobsearch ingest\`.`);
  emit({ provider, senders: config.mail.senders, folders: config.mail.folders });
}

async function sheetSetup(opts: GlobalOpts & { provider?: Config['sheet']['provider']; url?: string; secret?: string; sheetUrl?: string; yes?: boolean }, cmd: Command) {
  const ctx = openContext({ ...cmd.optsWithGlobals(), ...opts });
  const { config, secrets, log } = ctx;
  const interactive = !opts.yes && process.stdin.isTTY;
  let provider = opts.provider ?? config.sheet.provider;

  if (interactive) {
    p.intro('Tracker (Google Sheet) setup');
    const choice = await p.select({
      message: 'How should rows reach your Google Sheet?',
      options: [
        { value: 'host-connector', label: 'My agent already has a Google Sheets / Drive tool', hint: 'no setup; the agent appends rows' },
        { value: 'apps-script', label: 'Through a Sheet with the job-search Apps Script web app', hint: 'works from any agent and from cron; about 5 minutes once' },
      ],
      initialValue: provider,
    });
    if (p.isCancel(choice)) cancel();
    provider = choice as Config['sheet']['provider'];
  }

  if (provider === 'apps-script') {
    let url = opts.url ?? secrets.appsScript?.url ?? '';
    let secret = opts.secret ?? secrets.appsScript?.secret ?? '';
    if (interactive) {
      p.note([
        '1. Create a blank Google Sheet (sheets.new), open Extensions > Apps Script and paste templates/apps-script/Code.gs from the repo.',
        '2. Extensions > Apps Script > Project Settings > Script properties: add JOBSEARCH_SECRET with a long random value.',
        '3. Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone > Deploy, authorize, copy the /exec URL.',
      ].join('\n'), 'Apps Script web app');
      const u = await p.text({ message: 'Web app URL (ends with /exec)', initialValue: url, validate: (v = "") => (/^https:\/\/script\.google\.com\/.+\/exec$/.test(v) ? undefined : 'Expected https://script.google.com/macros/s/.../exec') });
      if (p.isCancel(u)) cancel();
      url = u;
      const s = await p.password({ message: 'JOBSEARCH_SECRET value', validate: (v = "") => (v.length >= 8 ? undefined : 'At least 8 characters') });
      if (p.isCancel(s)) cancel();
      secret = s;
    }
    if (!url || !secret) throw new Error('Apps Script setup needs --url and --secret (or run interactively).');
    log.redact(url); log.redact(secret);
    const sheet = createSheetProvider('apps-script', { url, secret, runDir: ctx.workspace, log });
    const spin = interactive ? p.spinner() : undefined;
    spin?.start('Checking the web app');
    const setupResult = await sheet.setup?.();
    const ping = await sheet.ping();
    spin?.stop(ping.ok ? `Tracker ready: ${ping.detail ?? 'ok'}` : `Problem: ${ping.detail}`);
    if (!ping.ok) throw new Error(`Sheet ping failed: ${ping.detail}`);
    saveSecrets({ ...secrets, appsScript: { url, secret } });
    saveConfig(ctx.workspace, { ...config, sheet: { ...config.sheet, provider, url: opts.sheetUrl ?? config.sheet.url } });
    if (interactive) p.outro('Sheet configured.');
    emit({ provider, ping, setup: setupResult ?? null });
    return;
  }

  saveConfig(ctx.workspace, { ...config, sheet: { ...config.sheet, provider, url: opts.sheetUrl ?? config.sheet.url } });
  if (interactive) p.outro('Sheet mode set to host-connector. The agent appends rows from runs/<date>/commit.json.');
  emit({ provider, url: opts.sheetUrl ?? config.sheet.url ?? null });
}

export function registerSetup(program: Command): void {
  const mail = program.command('mail').description('Mailbox configuration');
  mail
    .command('setup')
    .description('Choose how alert emails are read (Gmail app password, host connector, host browser) and detect alert senders')
    .option('--provider <name>', 'gmail-imap | host-connector | host-browser')
    .option('--user <email>', 'Gmail address (non-interactive)')
    .option('--app-password <pw>', 'Gmail app password (non-interactive; prefer the prompt)')
    .option('-y, --yes', 'non-interactive')
    .action(mailSetup);

  const sheet = program.command('sheet').description('Tracker (Google Sheet) configuration');
  sheet
    .command('setup')
    .description('Connect the tracker: host connector, or a Sheet with the job-search Apps Script web app')
    .option('--provider <name>', 'apps-script | host-connector')
    .option('--url <url>', 'Apps Script web app /exec URL (non-interactive)')
    .option('--secret <value>', 'JOBSEARCH_SECRET (non-interactive)')
    .option('--sheet-url <url>', 'the spreadsheet URL, for reports and the agent')
    .option('-y, --yes', 'non-interactive')
    .action(sheetSetup);
}
