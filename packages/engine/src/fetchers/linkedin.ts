import type { Fetcher, FetchContext, FetchResult } from './types.js';
import type { Lead, FetchStatus } from '../schema/index.js';
import { htmlToText, innerHtmlOf, textOf, truncate, collapseWhitespace, decodeEntities } from './html.js';
import {
  classifyText,
  isAuthwallUrl,
  isClosedText,
  isNotFoundText,
  isSignInText,
  statusForHttp,
  statusForLength,
  OK_MIN_CHARS,
} from './classify.js';
import { DESKTOP_UA, errorMessage, expandMore, innerTextOf, mainText, openPage, scrollToBottom, sleep } from './page.js';

export { classifyText } from './classify.js';

const GUEST_API = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';
const GUEST_TIMEOUT_MS = 20_000;
const RETRY_WAIT_MS = 3_000;
const DESCRIPTION_SELECTORS = [
  '.show-more-less-html__markup',
  '.description__text',
  '[class*="description__text"]',
  '[class*="jobs-description"]',
];

export interface GuestParse {
  title?: string;
  company?: string;
  location?: string;
  description: string;
  closed: boolean;
  postedAt?: string;
}

/** Pure parser for the HTML fragment served by the LinkedIn guest job API. */
export function parseGuestHtml(html: string): GuestParse {
  const title =
    textOf(html, { tag: 'h1' }) ??
    textOf(html, { classToken: 'top-card-layout__title' }) ??
    textOf(html, { classToken: 'topcard__title' });

  let company = textOf(html, { classToken: 'topcard__org-name-link' });
  if (!company) {
    const subline = innerHtmlOf(html, { classToken: 'top-card-layout__second-subline' });
    if (subline) company = textOf(subline, { tag: 'a' });
  }

  const location = textOf(html, { classToken: 'topcard__flavor--bullet' });

  const descriptionHtml =
    innerHtmlOf(html, { classToken: 'show-more-less-html__markup' }) ??
    innerHtmlOf(html, { classToken: 'description__text' });
  const description = descriptionHtml ? htmlToText(descriptionHtml) : '';

  const plain = collapseWhitespace(decodeEntities(html.replace(/<[^>]+>/g, ' ')));
  const closed = isClosedText(plain);
  const postedAt = textOf(html, { classToken: 'posted-time-ago__text' });

  return { title, company, location, description, closed, postedAt };
}

interface GuestFetch {
  status: FetchStatus;
  parsed?: GuestParse;
  error?: string;
}

/** Strategy A: the unauthenticated guest endpoint, no browser. */
async function fetchGuest(externalId: string, ctx: FetchContext): Promise<GuestFetch> {
  const url = GUEST_API + encodeURIComponent(externalId);
  const headers = {
    'User-Agent': DESKTOP_UA,
    'Accept-Language': 'en-US,en;q=0.9',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  let retried = false;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(GUEST_TIMEOUT_MS) });
    } catch (err) {
      return { status: 'blocked', error: `guest fetch failed: ${errorMessage(err)}` };
    }

    if (isAuthwallUrl(res.url)) {
      await res.body?.cancel().catch(() => undefined);
      return { status: 'authwall', error: `redirected to ${res.url}` };
    }
    if (res.status === 429 || res.status === 999) {
      await res.body?.cancel().catch(() => undefined);
      if (retried) return { status: 'blocked', error: `HTTP ${res.status} from guest API` };
      retried = true;
      ctx.log.debug(`linkedin guest API returned ${res.status}, retrying once in ${RETRY_WAIT_MS}ms`);
      await sleep(RETRY_WAIT_MS);
      continue;
    }
    if (res.status === 404 || res.status === 410) {
      // The guest API 404s for postings LinkedIn has removed; the public page
      // then redirects to a job search (trk=missing_jd_redirect). Treat as closed.
      await res.body?.cancel().catch(() => undefined);
      return { status: 'closed', error: `removed from LinkedIn (HTTP ${res.status})` };
    }
    if (res.status >= 400) {
      await res.body?.cancel().catch(() => undefined);
      return { status: 'blocked', error: `HTTP ${res.status} from guest API` };
    }

    const html = await res.text();
    const parsed = parseGuestHtml(html);
    if (parsed.closed) return { status: 'closed', parsed };
    if (!parsed.description && isSignInText(html)) return { status: 'authwall', parsed, error: 'guest API served a sign-in page' };
    return { status: statusForLength(parsed.description), parsed };
  }
}

export interface BrowserFetch {
  status: FetchStatus;
  title?: string;
  company?: string;
  location?: string;
  description: string;
  error?: string;
}

/** Strategy B: the public job page in headless Chromium. */
export async function fetchLinkedInWithBrowser(externalId: string, ctx: FetchContext): Promise<BrowserFetch> {
  const browser = await ctx.browser();
  const url = `https://www.linkedin.com/jobs/view/${encodeURIComponent(externalId)}/`;
  const { context, page, response } = await openPage(browser, url);
  try {
    const finalUrl = page.url();
    if (isAuthwallUrl(finalUrl)) {
      return { status: 'authwall', description: '', error: `redirected to ${finalUrl}` };
    }
    const http = response?.status();
    const byHttp = http !== undefined ? statusForHttp(http) : undefined;
    if (byHttp) return { status: byHttp, description: '', error: `HTTP ${http}` };

    await expandMore(page);
    await sleep(1_500);

    let text = await mainText(page);
    if (text.length < 1_500) {
      await scrollToBottom(page);
      await sleep(2_000);
      text = await mainText(page);
    }

    const description = await innerTextOf(page, DESCRIPTION_SELECTORS);
    const title = await innerTextOf(page, ['h1']);
    const company = await innerTextOf(page, ['.topcard__org-name-link', '[class*="company-name"]']);
    const location = await innerTextOf(page, ['.topcard__flavor--bullet', '[class*="bullet"]']);

    // The page text is only used for signals (closed, sign-in, challenge);
    // the description must come from a description element, otherwise the
    // footer and language picker of an error page would pass as a posting.
    const status = classifyText(finalUrl, text, description);
    const result: BrowserFetch = { status, description, title, company, location };
    if (status === 'authwall') result.error = 'LinkedIn asked to sign in';
    else if (status === 'empty') result.error = isNotFoundText(text) ? 'job page not found' : 'no description element on page';
    return result;
  } finally {
    await context.close().catch(() => undefined);
  }
}

function shouldUseBrowser(a: GuestFetch): boolean {
  if (a.status === 'blocked' || a.status === 'authwall') return true;
  return a.status === 'empty' && !a.parsed?.description;
}

export const linkedInFetcher: Fetcher = {
  name: 'linkedin',
  matches(lead: Lead): boolean {
    return lead.source === 'linkedin';
  },
  async fetch(lead: Lead, ctx: FetchContext): Promise<FetchResult> {
    const a = await fetchGuest(lead.externalId, ctx);
    ctx.log.debug(`linkedin guest ${lead.externalId}: ${a.status}${a.error ? ` (${a.error})` : ''}`);

    let result: FetchResult;
    if (!shouldUseBrowser(a)) {
      const p: Partial<GuestParse> = a.parsed ?? {};
      result = { status: a.status, description: p.description ?? '', title: p.title, company: p.company, location: p.location };
      if (a.error) result.error = a.error;
    } else {
      let b: BrowserFetch;
      try {
        b = await fetchLinkedInWithBrowser(lead.externalId, ctx);
      } catch (err) {
        const msg = errorMessage(err);
        ctx.log.debug(`linkedin browser ${lead.externalId} failed: ${msg}`);
        b = { status: a.status === 'empty' ? 'empty' : a.status, description: '', error: `${a.error ?? a.status}; browser: ${msg}` };
      }
      ctx.log.debug(`linkedin browser ${lead.externalId}: ${b.status}${b.error ? ` (${b.error})` : ''}`);
      result = {
        status: b.status,
        description: b.description,
        title: b.title || a.parsed?.title,
        company: b.company || a.parsed?.company,
        location: b.location || a.parsed?.location,
      };
      if (b.error) result.error = b.error;
    }

    const cut = truncate(result.description, ctx.descriptionMaxChars);
    result.description = cut.text;
    result.descriptionTruncated = cut.truncated;
    if (result.status === 'ok' && cut.text.length < OK_MIN_CHARS) result.status = statusForLength(cut.text);
    return result;
  },
};
