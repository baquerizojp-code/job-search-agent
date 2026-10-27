import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { MailMessage } from '../../schema/index.js';
import type { Logger } from '../../core/logger.js';
import type { ListAlertsOptions, MailFolders, MailProvider } from './types.js';

export interface GmailImapOptions {
  user: string;
  appPassword: string;
  log: Logger;
}

const DAY_MS = 86_400_000;
const ALL_MAIL_FALLBACK = '[Gmail]/All Mail';
const UID_PREFIX = 'uid:';

/** Gmail quotes label names containing spaces in X-GM-RAW queries ("Job Search/Processed"). */
function gmailLabel(name: string): string {
  const label = name.replace(/[\s"]+/g, ' ').trim();
  return label.includes(' ') ? `"${label}"` : label;
}

/** Gmail's newer_than only takes whole days. */
function newerThan(since: Date): string {
  return `newer_than:${Math.max(1, Math.ceil((Date.now() - since.getTime()) / DAY_MS))}d`;
}

/** `from:` accepts full addresses or bare domains (`from:linkedin.com`), never `@domain`. */
function fromClause(senders: string[]): string {
  const parts = senders.map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.length === 1 ? `from:${parts[0]}` : `from:(${parts.join(' OR ')})`;
}

/** Pure mailparser -> MailMessage mapping, exported so tests can run it on .eml fixtures. */
export function toMailMessage(parsed: ParsedMail, id: string, threadId?: string): MailMessage {
  const html = parsed.html || parsed.textAsHtml || '';
  return {
    id,
    threadId,
    from: parsed.from?.text ?? '',
    subject: parsed.subject ?? '',
    date: parsed.date?.toISOString(),
    text: parsed.text ?? '',
    html: typeof html === 'string' ? html : '',
  };
}

function describeError(err: unknown): Error {
  const e = err as { message?: string; code?: string; authenticationFailed?: boolean; serverResponseCode?: string };
  if (e?.authenticationFailed || e?.serverResponseCode === 'AUTHENTICATIONFAILED') {
    return new Error(
      'Gmail rejected the login. Check that 2-Step Verification is on for the account and that the app password ' +
        '(16 characters, from myaccount.google.com/apppasswords) is correct and belongs to this address.',
    );
  }
  if (e?.code && /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ECONNRESET/.test(e.code)) {
    return new Error(`Could not reach imap.gmail.com (${e.code}). Check the network connection.`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export class GmailImapProvider implements MailProvider {
  readonly name = 'gmail-imap';
  private readonly client: ImapFlow;
  private readonly log: Logger;
  private allMailPath = ALL_MAIL_FALLBACK;
  /** MailMessage id -> UID in All Mail, so markProcessed can address messages without a second search. */
  private readonly uidById = new Map<string, number>();

  constructor(opts: GmailImapOptions) {
    this.log = opts.log;
    this.log.redact(opts.appPassword);
    this.client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: opts.user, pass: opts.appPassword },
      logger: false,
    });
    // Socket/TLS drops after connect() arrive as 'error' events; unhandled they would crash the process.
    this.client.on('error', (err: Error) => this.log.warn('gmail-imap connection error', { error: err.message }));
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (err) {
      throw describeError(err);
    }
    // Gmail exposes All Mail (every message except Spam/Trash) with the \All special-use flag.
    // Its display name is localized, so find it by flag and keep the literal as a fallback.
    const boxes = await this.client.list();
    this.allMailPath = boxes.find((b) => b.specialUse === '\\All')?.path ?? ALL_MAIL_FALLBACK;
    this.log.debug('gmail-imap connected', { allMail: this.allMailPath });
  }

  async close(): Promise<void> {
    try {
      await this.client.logout();
    } catch (err) {
      this.log.debug('gmail-imap logout failed', { error: (err as Error).message });
    }
  }

  async ensureFolders(folders: MailFolders): Promise<void> {
    // Gmail labels are IMAP mailboxes; "/" nests them (parent "Job Search", child "Alerts").
    const existing = new Set((await this.client.list()).map((b) => b.path));
    for (const path of [folders.alerts, folders.processed, folders.applications]) {
      if (existing.has(path)) continue;
      try {
        await this.client.mailboxCreate(path);
        this.log.info(`created label ${path}`);
      } catch (err) {
        const e = err as { responseText?: string; serverResponseCode?: string };
        if (e.serverResponseCode === 'ALREADYEXISTS' || /ALREADYEXISTS/i.test(e.responseText ?? '')) continue;
        throw err;
      }
    }
  }

  private async searchUids(gmraw: string): Promise<number[]> {
    this.log.debug('gmail-imap search', { gmraw });
    const result = await this.client.search({ gmraw }, { uid: true });
    return Array.isArray(result) ? result : [];
  }

  private async fetchMessages(uids: number[]): Promise<{ msg: MailMessage; raw: FetchMessageObject }[]> {
    if (uids.length === 0) return [];
    // Range is interpreted as UIDs only via the options argument; `uid: true` in the query just echoes the UID back.
    const fetched = await this.client.fetchAll(uids, { uid: true, source: true, envelope: true, labels: true, emailId: true }, { uid: true });
    const out: { msg: MailMessage; raw: FetchMessageObject }[] = [];
    for (const raw of fetched) {
      if (!raw.source) continue;
      // emailId is Gmail's X-GM-MSGID, stable across folders and sessions; UIDs are per-mailbox.
      const id = raw.emailId ?? `${UID_PREFIX}${raw.uid}`;
      this.uidById.set(id, raw.uid);
      try {
        out.push({ msg: toMailMessage(await simpleParser(raw.source), id, raw.threadId), raw });
      } catch (err) {
        this.log.warn(`could not parse message uid ${raw.uid}`, { error: (err as Error).message });
      }
    }
    // Gmail assigns UIDs in arrival order, so descending UID is newest first.
    return out.sort((a, b) => b.raw.uid - a.raw.uid);
  }

  async listAlerts(opts: ListAlertsOptions & { folders: MailFolders; archive: boolean }): Promise<MailMessage[]> {
    const { senders, since, limit, folders, archive } = opts;
    await this.client.mailboxOpen(this.allMailPath);
    const query = [fromClause(senders), newerThan(since), `-label:${gmailLabel(folders.processed)}`].filter(Boolean).join(' ');
    const uids = await this.searchUids(query);
    const newest = limit ? uids.sort((a, b) => b - a).slice(0, limit) : uids;
    const items = await this.fetchMessages(newest);

    if (archive) {
      const toArchive = items.filter(({ raw }) => !raw.labels?.has(folders.alerts)).map(({ raw }) => raw.uid);
      if (toArchive.length > 0) {
        // With useLabels the "flags" are Gmail labels; removing \Inbox is what "archive" means in Gmail.
        await this.client.messageFlagsAdd(toArchive, [folders.alerts], { uid: true, useLabels: true });
        await this.client.messageFlagsRemove(toArchive, ['\\Inbox'], { uid: true, useLabels: true });
        this.log.info(`archived ${toArchive.length} alert email(s) into ${folders.alerts}`);
      }
    }
    return items.map(({ msg }) => msg);
  }

  private async resolveUids(ids: string[]): Promise<number[]> {
    const uids: number[] = [];
    for (const id of ids) {
      let uid = this.uidById.get(id);
      if (uid === undefined && id.startsWith(UID_PREFIX)) uid = Number(id.slice(UID_PREFIX.length));
      if (uid === undefined) {
        // Not seen in this session: look the X-GM-MSGID up in All Mail.
        const found = await this.client.search({ emailId: id }, { uid: true });
        uid = Array.isArray(found) ? found[0] : undefined;
      }
      if (uid !== undefined && Number.isFinite(uid)) uids.push(uid);
      else this.log.warn(`markProcessed: message ${id} not found`);
    }
    return uids;
  }

  async markProcessed(ids: string[], folders: MailFolders): Promise<void> {
    if (ids.length === 0) return;
    await this.client.mailboxOpen(this.allMailPath);
    const uids = await this.resolveUids(ids);
    if (uids.length === 0) return;
    await this.client.messageFlagsAdd(uids, [folders.processed], { uid: true, useLabels: true });
    await this.client.messageFlagsRemove(uids, [folders.alerts], { uid: true, useLabels: true });
    await this.client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
    this.log.info(`marked ${uids.length} email(s) as processed`);
  }

  async searchByCompany(company: string, since: Date, _folders: MailFolders): Promise<MailMessage[]> {
    await this.client.mailboxOpen(this.allMailPath);
    const uids = await this.searchUids(`"${company.replace(/"/g, ' ').trim()}" ${newerThan(since)}`);
    const newest = uids.sort((a, b) => b - a).slice(0, 20);
    return (await this.fetchMessages(newest)).map(({ msg }) => msg);
  }
}
