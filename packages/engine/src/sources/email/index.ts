import type { Lead, MailMessage } from '../../schema/index.js';
import type { EmailExtractor } from './types.js';
import { linkedInExtractor } from './linkedin.js';
import { genericExtractor } from './generic.js';

export type { EmailExtractor } from './types.js';
export { linkedInExtractor } from './linkedin.js';
export { genericExtractor } from './generic.js';

/** Every known extractor, generic last. */
export const ALL_EXTRACTORS: readonly EmailExtractor[] = [linkedInExtractor, genericExtractor];

/** Named extractors in the given order; unknown names are dropped; generic is always last. */
export function extractorsFor(names: string[]): EmailExtractor[] {
  const byName = new Map(ALL_EXTRACTORS.map((e) => [e.name, e]));
  const picked: EmailExtractor[] = [];
  for (const name of names) {
    const e = byName.get(name);
    if (e && e !== genericExtractor && !picked.includes(e)) picked.push(e);
  }
  picked.push(genericExtractor);
  return picked;
}

/** Runs only the first extractor that matches, so LinkedIn mail never falls through to generic. */
export function extractLeads(msg: MailMessage, extractors: readonly EmailExtractor[]): Lead[] {
  return extractors.find((e) => e.matches(msg))?.extract(msg) ?? [];
}
