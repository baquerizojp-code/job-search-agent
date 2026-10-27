import { createHash } from 'node:crypto';

const TRACKING_PARAMS = /^(utm_|trk|tracking|refid|ref|src|source|midtoken|midsig|trkemail|eid|otptoken|lipi|li_)/i;

/** Strip tracking params and fragments; keep the path. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith('?')) s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}

export function urlHash(url: string): string {
  return createHash('sha1').update(canonicalUrl(url)).digest('hex').slice(0, 12);
}

export function canonicalLinkedInUrl(id: string): string {
  return `https://www.linkedin.com/jobs/view/${id}`;
}

/** Matches LinkedIn job ids in any URL form, including /comm/ redirect links. */
export const LINKEDIN_JOB_ID_RE = /(?:\/comm)?\/jobs\/view\/(\d+)/g;

export function linkedInIdFromUrl(url: string): string | undefined {
  const m = /(?:\/comm)?\/jobs\/view\/(\d+)/.exec(url);
  return m?.[1];
}
