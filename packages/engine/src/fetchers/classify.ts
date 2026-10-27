import type { FetchStatus } from '../schema/index.js';

/** A description this long or longer counts as a full fetch. */
export const OK_MIN_CHARS = 200;

const AUTHWALL_URL_RE = /authwall|\/login|checkpoint|\/signin|\/sign-in|\/auth\b/i;
const CLOSED_RE = /no longer accepting applications|this job is no longer available|job (?:posting )?has (?:been )?closed|position has been filled/i;
const SIGNIN_RE = /sign in to view|join linkedin|sign in to see who you already know|join now to see/i;
const NOT_FOUND_RE = /page not found|this page doesn.t exist|job not found|couldn.t find (?:this|the) job|no longer exists/i;
const CHALLENGE_RE = /just a moment|verify you are human|attention required|checking your browser|enable javascript and cookies to continue|access denied/i;

export function isAuthwallUrl(url: string): boolean {
  return AUTHWALL_URL_RE.test(url);
}

/** LinkedIn redirects removed postings to a search page with this marker. */
export const REMOVED_URL_RE = /[?&]trk=(?:missing|expired)_jd_redirect/i;

export function isClosedText(text: string): boolean {
  return CLOSED_RE.test(text);
}

export function isSignInText(text: string): boolean {
  return SIGNIN_RE.test(text);
}

export function isNotFoundText(text: string): boolean {
  return NOT_FOUND_RE.test(text);
}

export function isChallengeText(text: string): boolean {
  return CHALLENGE_RE.test(text);
}

/** Status for a description by length alone. */
export function statusForLength(description: string): Extract<FetchStatus, 'ok' | 'partial' | 'empty'> {
  const n = description.trim().length;
  if (n >= OK_MIN_CHARS) return 'ok';
  if (n > 0) return 'partial';
  return 'empty';
}

/**
 * Decide the fetch status of a page from its final URL, its visible text and
 * the description that was extracted from it. `description` defaults to
 * `text` when the caller could not isolate it.
 *
 * Precedence: authwall URL > challenge page > closed > sign-in prompt with no
 * real description > length rules.
 */
export function classifyText(url: string, text: string, description: string = text): FetchStatus {
  if (isAuthwallUrl(url)) return 'authwall';
  if (isChallengeText(text) && description.trim().length < OK_MIN_CHARS) return 'blocked';
  if (REMOVED_URL_RE.test(url) || isClosedText(text)) return 'closed';
  if (isSignInText(text) && description.trim().length < OK_MIN_CHARS) return 'authwall';
  return statusForLength(description);
}

/** Map an HTTP status to a fetch status, or undefined when the body should be parsed. */
export function statusForHttp(code: number): Extract<FetchStatus, 'blocked' | 'empty'> | undefined {
  if (code === 404 || code === 410) return 'empty';
  if (code >= 400) return 'blocked';
  return undefined;
}
