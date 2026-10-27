import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from './fsutil.js';

export type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
  /** Register a string that must never appear in logs (passwords, script URLs). */
  redact(secret: string | undefined): void;
}

/**
 * Daily log file in <workspace>/logs/YYYY-MM-DD.log (debug and up) plus
 * stderr (info and up, or quiet). Secrets registered with redact() are masked.
 */
export function createLogger(workspace: string, day: string, opts: { quiet?: boolean; verbose?: boolean } = {}): Logger {
  const dir = path.join(workspace, 'logs');
  ensureDir(dir);
  const file = path.join(dir, `${day}.log`);
  const secrets: string[] = [];
  const mask = (s: string) => secrets.reduce((acc, sec) => acc.split(sec).join('***'), s);
  const stderrLevel: Level = opts.quiet ? 'error' : opts.verbose ? 'debug' : 'info';

  const write = (level: Level, msg: string, meta?: unknown) => {
    const extra = meta === undefined ? '' : ' ' + mask(typeof meta === 'string' ? meta : JSON.stringify(meta));
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${mask(msg)}${extra}`;
    fs.appendFileSync(file, line + '\n');
    if (ORDER[level] >= ORDER[stderrLevel]) process.stderr.write(line + '\n');
  };

  return {
    debug: (m, x) => write('debug', m, x),
    info: (m, x) => write('info', m, x),
    warn: (m, x) => write('warn', m, x),
    error: (m, x) => write('error', m, x),
    redact: (s) => { if (s && s.length >= 6) secrets.push(s); },
  };
}

export const silentLogger: Logger = {
  debug() {}, info() {}, warn() {}, error() {}, redact() {},
};
