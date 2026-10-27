import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function readJsonIfExists<T>(file: string): T | undefined {
  if (!fs.existsSync(file)) return undefined;
  return readJson<T>(file);
}

/** Atomic-ish write: temp file then rename, so a crash never leaves a half-written JSON. */
export function writeJson(file: string, data: unknown, mode?: number): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode });
  fs.renameSync(tmp, file);
  if (mode !== undefined && process.platform !== 'win32') fs.chmodSync(file, mode);
}

export function writeText(file: string, text: string): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, 'utf8');
}
