import type { MailMessage } from '../../schema/index.js';
import type { Logger } from '../../core/logger.js';

export interface MailFolders {
  alerts: string;
  processed: string;
  applications: string;
}

export interface ListAlertsOptions {
  senders: string[];
  since: Date;
  /** Max messages to return (newest first). */
  limit?: number;
}

/**
 * Everything the engine needs from a mailbox. Implementations: gmail-imap,
 * outlook-mcp. In host-connector / host-browser modes the agent does this
 * work and hands the engine JSON instead.
 */
export interface MailProvider {
  readonly name: string;
  connect(): Promise<void>;
  close(): Promise<void>;
  /** Create the three folders/labels if missing. */
  ensureFolders(folders: MailFolders): Promise<void>;
  /**
   * Alert emails from the given senders, newer than `since`, that are not yet
   * in the processed folder. Implementations may also move them into the
   * alerts folder (archiving from the inbox) when `archive` is true.
   */
  listAlerts(opts: ListAlertsOptions & { folders: MailFolders; archive: boolean }): Promise<MailMessage[]>;
  /** Move messages into the processed folder (or label them) and mark them read. */
  markProcessed(ids: string[], folders: MailFolders): Promise<void>;
  /** Emails mentioning a company since a date, used by status sync (M5). */
  searchByCompany(company: string, since: Date, folders: MailFolders): Promise<MailMessage[]>;
}

export interface MailProviderContext {
  log: Logger;
}
