import { loadConfig, loadSecrets } from '../core/config.js';
import { createLogger, type Logger } from '../core/logger.js';
import { resolveWorkspace, todayStamp } from '../core/paths.js';
import type { Config, Secrets } from '../schema/index.js';

export interface GlobalOpts {
  workspace?: string;
  quiet?: boolean;
  verbose?: boolean;
  run?: string;
}

export interface Ctx {
  workspace: string;
  config: Config;
  secrets: Secrets;
  log: Logger;
  stamp: string;
}

/** Shared bootstrap for every command that needs a configured workspace. */
export function openContext(opts: GlobalOpts): Ctx {
  const workspace = resolveWorkspace(opts.workspace);
  const config = loadConfig(workspace);
  const secrets = loadSecrets();
  const stamp = opts.run ?? todayStamp(config.timezone);
  const log = createLogger(workspace, todayStamp(config.timezone), { quiet: opts.quiet, verbose: opts.verbose });
  log.redact(secrets.gmail?.appPassword);
  log.redact(secrets.appsScript?.secret);
  log.redact(secrets.appsScript?.url);
  return { workspace, config, secrets, log, stamp };
}

/** Machine-readable result on stdout; the agent parses this. */
export function emit(result: unknown): void {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
