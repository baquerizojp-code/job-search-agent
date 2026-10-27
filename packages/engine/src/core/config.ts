import path from 'node:path';
import { ConfigSchema, type Config, SecretsSchema, type Secrets } from '../schema/index.js';
import { readJsonIfExists, writeJson } from './fsutil.js';
import { secretsPath } from './paths.js';

export function configPath(workspace: string): string {
  return path.join(workspace, 'config.json');
}

export function loadConfig(workspace: string): Config {
  const raw = readJsonIfExists<unknown>(configPath(workspace));
  if (!raw) throw new Error(`No config.json in ${workspace}. Run \`jobsearch init\` first.`);
  return ConfigSchema.parse(raw);
}

export function saveConfig(workspace: string, config: Config): void {
  writeJson(configPath(workspace), ConfigSchema.parse(config));
}

export function loadSecrets(): Secrets {
  const raw = readJsonIfExists<unknown>(secretsPath());
  return SecretsSchema.parse(raw ?? {});
}

export function saveSecrets(secrets: Secrets): void {
  writeJson(secretsPath(), SecretsSchema.parse(secrets), 0o600);
}
