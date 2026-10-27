import type { AgentPosting, Posting } from '../schema/index.js';
import { canonicalUrl, linkedInIdFromUrl } from '../core/jobid.js';
import { truncate } from './html.js';

function urlKey(url: string): string {
  return canonicalUrl(url).replace(/\/+$/, '').toLowerCase();
}

/** Keys under which a posting or agent posting can be matched. */
function keysOf(p: { jobId?: string; url: string; source?: string }): string[] {
  const keys: string[] = [];
  if (p.jobId) keys.push(`id:${p.jobId}`);
  keys.push(`url:${urlKey(p.url)}`);
  const liId = linkedInIdFromUrl(p.url);
  if (liId) keys.push(`id:linkedin:${liId}`);
  return keys;
}

/**
 * Fill postings with descriptions the agent read with its own browser.
 * Matching is by jobId, canonical URL (trailing slash ignored) or, for
 * LinkedIn, the numeric id in the URL. Unmatched postings are returned as is.
 */
export function applyAgentPostings(postings: Posting[], agentPostings: AgentPosting[], maxChars: number): Posting[] {
  const byKey = new Map<string, AgentPosting>();
  for (const ap of agentPostings) {
    for (const k of keysOf(ap)) if (!byKey.has(k)) byKey.set(k, ap);
  }

  const now = new Date().toISOString();
  return postings.map((p) => {
    const match = keysOf(p).map((k) => byKey.get(k)).find((ap): ap is AgentPosting => ap !== undefined);
    if (!match) return p;
    const cut = truncate(match.description.trim(), maxChars);
    const next: Posting = {
      ...p,
      title: match.title?.trim() || p.title,
      company: match.company?.trim() || p.company,
      location: match.location?.trim() || p.location,
      description: cut.text,
      descriptionTruncated: cut.truncated,
      fetchStatus: match.closed ? 'closed' : cut.text ? 'ok' : 'empty',
      fetchedAt: now,
    };
    delete next.fetchError;
    return next;
  });
}
