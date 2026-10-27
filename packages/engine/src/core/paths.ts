import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/** `~/.job-search`: machine-level settings and secrets, never inside the workspace. */
export function homeDir(): string {
  return process.env.JOBSEARCH_HOME ?? path.join(os.homedir(), '.job-search');
}

export function secretsPath(): string {
  return path.join(homeDir(), 'secrets.json');
}

export function pointerPath(): string {
  return path.join(homeDir(), 'workspace.json');
}

/**
 * Resolve the workspace directory: explicit flag, then JOBSEARCH_WORKSPACE,
 * then the pointer file written by `init`, then ~/job-search.
 */
export function resolveWorkspace(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  if (process.env.JOBSEARCH_WORKSPACE) return path.resolve(process.env.JOBSEARCH_WORKSPACE);
  try {
    const p = JSON.parse(fs.readFileSync(pointerPath(), 'utf8')) as { workspace?: string };
    if (p.workspace) return p.workspace;
  } catch {
    /* no pointer yet */
  }
  return path.join(os.homedir(), 'job-search');
}

export function todayStamp(tz?: string): string {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(d); // YYYY-MM-DD
}
