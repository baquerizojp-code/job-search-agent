import { SHEET_HEADERS, rowFromValues, rowToValues, type SheetRow, type SheetTab } from '../../schema/index.js';
import type { Logger } from '../../core/logger.js';
import type { SheetProvider } from './types.js';

export interface AppsScriptSheetProviderOptions {
  /** The /exec URL of the deployed web app. Never logged. */
  url: string;
  /** Must equal the JOBSEARCH_SECRET script property. Never logged. */
  secret: string;
  log: Logger;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

interface PingData {
  spreadsheet: string;
  tabs: string[];
  headers: Record<string, boolean>;
}

interface ListData {
  headers: string[];
  rows: unknown[][];
}

/**
 * Talks to the bound Apps Script web app in templates/apps-script/Code.gs.
 *
 * Every call is a POST with a text/plain JSON body: that content type avoids a
 * CORS preflight and is what Apps Script expects. Google answers the POST with
 * a 302 to script.googleusercontent.com which fetch follows as a GET, so the
 * script must do all its work on the POST and the redirect only carries the
 * JSON result back.
 */
export class AppsScriptSheetProvider implements SheetProvider {
  readonly name = 'apps-script';
  private readonly url: string;
  private readonly secret: string;
  private readonly log: Logger;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: AppsScriptSheetProviderOptions) {
    this.url = opts.url;
    this.secret = opts.secret;
    this.log = opts.log;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.log.redact(this.url);
    this.log.redact(this.secret);
  }

  async ping(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const data = await this.call<PingData>('ping');
      const missing = ['Jobs', 'Skipped'].filter((t) => !data.tabs.includes(t));
      const badHeaders = Object.entries(data.headers ?? {}).filter(([, ok]) => !ok).map(([t]) => t);
      if (missing.length) return { ok: false, detail: `missing tabs: ${missing.join(', ')} (run setup)` };
      if (badHeaders.length) return { ok: false, detail: `headers do not match on: ${badHeaders.join(', ')} (run setup)` };
      return { ok: true, detail: `spreadsheet "${data.spreadsheet}", tabs ${data.tabs.join(', ')}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Creates the Jobs and Skipped tabs with headers, frozen row and Status validation. */
  async setup(): Promise<{ created: string[] }> {
    const data = await this.call<{ created: string[] }>('setup');
    this.log.info('sheet setup done', { created: data.created });
    return { created: data.created };
  }

  async listRows(tab: SheetTab): Promise<Partial<SheetRow>[]> {
    const data = await this.call<ListData>('list', { tab });
    const headers = data.headers?.length ? data.headers : [...SHEET_HEADERS];
    return (data.rows ?? []).map((r) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return rowFromValues(obj);
    });
  }

  async appendRows(tab: SheetTab, rows: SheetRow[]): Promise<{ appended: number; deferred: boolean }> {
    if (rows.length === 0) return { appended: 0, deferred: false };
    const data = await this.call<{ appended: number }>('append', { tab, rows: rows.map(rowToValues) });
    this.log.info(`appended ${data.appended} row(s) to ${tab}`);
    return { appended: data.appended, deferred: false };
  }

  async updateStatus(jobId: string, status: string, note?: string): Promise<{ updated: boolean; deferred: boolean }> {
    const data = await this.call<{ updated: boolean }>('update-status', { jobId, status, note });
    if (!data.updated) this.log.warn(`update-status: job ${jobId} not found in Jobs`);
    return { updated: data.updated, deferred: false };
  }

  private async call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const body = JSON.stringify({ ...params, action, secret: this.secret });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let text: string;
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow',
        signal: controller.signal,
      });
      text = await res.text();
      if (!res.ok) throw new Error(`apps-script ${action}: HTTP ${res.status}`);
    } catch (err) {
      if (controller.signal.aborted) throw new Error(`apps-script ${action}: timed out after ${this.timeoutMs} ms`);
      if (err instanceof Error && err.message.startsWith('apps-script ')) throw err;
      // Do not forward the cause: undici errors can carry the hostname of the script URL.
      throw new Error(`apps-script ${action}: request failed (${err instanceof Error ? err.message : 'network error'})`);
    } finally {
      clearTimeout(timer);
    }

    let parsed: Envelope<T>;
    try {
      parsed = JSON.parse(text) as Envelope<T>;
    } catch {
      if (/<html/i.test(text)) {
        throw new Error(`apps-script ${action}: got an HTML page instead of JSON. ` +
          'Check the deployment is a Web app with "Who has access: Anyone" and that the URL ends in /exec.');
      }
      throw new Error(`apps-script ${action}: non-JSON response (${text.slice(0, 80).replace(/\s+/g, ' ')})`);
    }
    if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) {
      throw new Error(`apps-script ${action}: malformed response`);
    }
    if (!parsed.ok) throw new Error(`apps-script ${action}: ${parsed.error}`);
    return parsed.data;
  }
}
