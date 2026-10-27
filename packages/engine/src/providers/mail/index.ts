import type { Config, Secrets } from '../../schema/index.js';
import type { Logger } from '../../core/logger.js';
import type { MailProvider } from './types.js';

export type { MailProvider, MailFolders } from './types.js';

/**
 * Returns a provider the engine drives itself, or undefined for the host
 * modes (host-connector, host-browser) where the agent reads the mailbox.
 */
export async function createMailProvider(config: Config, secrets: Secrets, log: Logger): Promise<MailProvider | undefined> {
  switch (config.mail.provider) {
    case 'gmail-imap': {
      if (!secrets.gmail) throw new Error('Gmail is configured but no app password is saved. Run `jobsearch mail setup`.');
      const { GmailImapProvider } = await import('./gmail-imap.js');
      log.redact(secrets.gmail.appPassword);
      return new GmailImapProvider({ user: secrets.gmail.user, appPassword: secrets.gmail.appPassword, log });
    }
    case 'outlook-mcp':
      throw new Error('Outlook support arrives in milestone 3. Use host-connector or host-browser mode meanwhile.');
    case 'host-connector':
    case 'host-browser':
      return undefined;
  }
}

export function isHostMailMode(config: Config): boolean {
  return config.mail.provider === 'host-connector' || config.mail.provider === 'host-browser';
}
