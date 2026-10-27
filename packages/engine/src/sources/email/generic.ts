import type { Lead, MailMessage } from '../../schema/index.js';
import { canonicalUrl, urlHash } from '../../core/jobid.js';
import type { EmailExtractor } from './types.js';

const MAX_PER_MESSAGE = 50;

// "/jobs/", "/remote-jobs/", "/viewjob", "/careers/", "/empleos/", "/apply"...
const JOB_PATH_RE = /(?:^|[/_-])jobs?\/|\/(viewjob|job-listing|careers?\/|positions?\/|openings?\/|vacanc|empleos?\/|oferta|apply)/i;
// Tested against host + path + query: unsubscribe/settings/help/privacy/login pages and click-tracking redirects.
const DROP_RE = /unsubscribe|settings|preferences|tracking|track\.|\/track\b|\/click\b|\/help\b|privacy|login|signin|sign-in|signup|sign-up|\/terms\b|optout|opt-out/i;
const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|pdf)$/i;

const HREF_RE = /href\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
const BARE_URL_RE = /https?:\/\/[^\s<>"'()[\]]+/gi;

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

export function collectUrls(html: string, text: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(HREF_RE)) out.push(decodeEntities(m[1] ?? m[2] ?? ''));
  for (const m of text.matchAll(BARE_URL_RE)) out.push(m[0].replace(/[.,;:!?]+$/, ''));
  return out.filter((u) => /^https?:\/\//i.test(u));
}

export function isJobUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const path = u.pathname.toLowerCase();
    return JOB_PATH_RE.test(path) && !DROP_RE.test(u.hostname + path + u.search) && !ASSET_RE.test(path);
  } catch {
    return false;
  }
}

export const genericExtractor: EmailExtractor = {
  name: 'generic',
  matches: () => true,
  extract(msg: MailMessage): Lead[] {
    const seen = new Set<string>();
    const leads: Lead[] = [];
    for (const raw of collectUrls(msg.html, msg.text)) {
      if (leads.length >= MAX_PER_MESSAGE) break;
      if (!isJobUrl(raw)) continue;
      const url = canonicalUrl(raw);
      if (seen.has(url)) continue;
      seen.add(url);
      leads.push({
        source: 'generic',
        externalId: urlHash(url),
        url,
        snippet: msg.subject || undefined,
        messageIds: [msg.id],
      });
    }
    return leads;
  },
};
