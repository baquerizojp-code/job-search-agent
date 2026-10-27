import type { Fetcher, FetchContext, FetchResult } from './types.js';
import type { Lead } from '../schema/index.js';
import { truncate } from './html.js';
import { classifyText, isAuthwallUrl, statusForHttp, statusForLength, OK_MIN_CHARS } from './classify.js';
import { errorMessage, innerTextOf, mainText, openPage, sleep } from './page.js';

const TITLE_SEPARATORS = /(\s+(?:\||-|–|—|::|•|·)\s+)/;

/** `document.title` without its last " | Company" style segment. */
export function cleanTitle(docTitle: string): string {
  const parts = docTitle.split(TITLE_SEPARATORS);
  // split with a capturing group yields [seg, sep, seg, sep, seg...]
  const kept = parts.length >= 3 ? parts.slice(0, -2) : parts;
  return kept.join('').trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Status for a generic page: a cross-host redirect to a login page is an
 * authwall; otherwise the shared text rules apply.
 */
export function classifyGeneric(leadUrl: string, finalUrl: string, text: string, httpStatus?: number): FetchResult['status'] {
  if (hostOf(finalUrl) !== hostOf(leadUrl) && isAuthwallUrl(finalUrl)) return 'authwall';
  const byHttp = httpStatus !== undefined ? statusForHttp(httpStatus) : undefined;
  if (byHttp) return byHttp;
  return classifyText(finalUrl, text);
}

export const genericFetcher: Fetcher = {
  name: 'generic',
  matches(): boolean {
    return true;
  },
  async fetch(lead: Lead, ctx: FetchContext): Promise<FetchResult> {
    const browser = await ctx.browser();
    const { context, page, response } = await openPage(browser, lead.url);
    try {
      await sleep(1_500);
      const finalUrl = page.url();
      const httpStatus = response?.status();
      const text = await mainText(page);

      const docTitle = await page.title().catch(() => '');
      const title = cleanTitle(docTitle) || (await innerTextOf(page, ['h1']));

      let status = classifyGeneric(lead.url, finalUrl, text, httpStatus);
      const result: FetchResult = { status, description: '', title: title || undefined };
      if (status === 'authwall') result.error = `redirected to ${finalUrl}`;
      else if (status === 'blocked') result.error = httpStatus && httpStatus >= 400 ? `HTTP ${httpStatus}` : 'challenge page';
      else if (status === 'empty' && httpStatus && httpStatus >= 400) result.error = `HTTP ${httpStatus}`;

      if (status === 'ok' || status === 'partial' || status === 'closed') {
        const cut = truncate(text, ctx.descriptionMaxChars);
        result.description = cut.text;
        result.descriptionTruncated = cut.truncated;
        if (status === 'ok' && cut.text.length < OK_MIN_CHARS) status = statusForLength(cut.text);
        result.status = status;
      }
      return result;
    } catch (err) {
      return { status: 'empty', description: '', error: errorMessage(err) };
    } finally {
      await context.close().catch(() => undefined);
    }
  },
};
