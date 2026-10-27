import { z } from 'zod';

export const MailProviderNameSchema = z.enum(['gmail-imap', 'outlook-mcp', 'host-connector', 'host-browser']);
export const SheetProviderNameSchema = z.enum(['apps-script', 'host-connector']);

export const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  language: z.string().default('en'),
  timezone: z.string().default('UTC'),
  mail: z.object({
    provider: MailProviderNameSchema.default('gmail-imap'),
    address: z.string().optional(),
    folders: z.object({
      alerts: z.string().default('Job Search/Alerts'),
      processed: z.string().default('Job Search/Processed'),
      applications: z.string().default('Job Search/Applications'),
    }).prefault({}),
    /** Sender addresses or domains whose emails are job alerts. */
    senders: z.array(z.string()).default(['jobalerts-noreply@linkedin.com']),
    /** Move alert emails out of the inbox into the alerts folder when first seen. */
    archiveAlerts: z.boolean().default(true),
    /** Only look at emails newer than this many days. */
    lookbackDays: z.number().int().min(1).max(90).default(14),
  }).prefault({}),
  sheet: z.object({
    provider: SheetProviderNameSchema.default('apps-script'),
    /** Spreadsheet URL, informative only (the Apps Script URL lives in secrets). */
    url: z.string().optional(),
    tabs: z.object({ jobs: z.string().default('Jobs'), skipped: z.string().default('Skipped') }).prefault({}),
  }).prefault({}),
  fetch: z.object({
    /** engine: Playwright in the engine; browser-first: the agent reads every posting with its own browser. */
    mode: z.enum(['engine', 'browser-first']).default('engine'),
    maxPostingsPerRun: z.number().int().min(1).default(60),
    timeBudgetSec: z.number().int().min(30).default(600),
    descriptionMaxChars: z.number().int().min(500).default(5000),
    batchSize: z.number().int().min(1).max(50).default(15),
    headless: z.boolean().default(true),
  }).prefault({}),
  /** How the daily run is triggered; informative, written by the agent during setup. */
  schedule: z.object({
    kind: z.enum(['none', 'claude-desktop', 'codex-desktop', 'claude-cloud', 'launchd', 'task-scheduler', 'cron']).default('none'),
    time: z.string().optional(),
  }).prefault({}),
  sources: z.object({
    /** Email extractors enabled, in priority order. 'generic' is always the fallback. */
    email: z.array(z.string()).default(['linkedin', 'generic']),
    feeds: z.array(z.object({ name: z.string(), keywords: z.array(z.string()).default([]) })).default([]),
  }).prefault({}),
});
export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});
