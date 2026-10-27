import { z } from 'zod';

/**
 * A job lead extracted from an alert email or a feed, before the
 * description has been fetched.
 */
export const LeadSchema = z.object({
  /** Source identifier: linkedin, indeed, glassdoor, wellfound, generic, remotive... */
  source: z.string().min(1),
  /** Stable id inside the source (LinkedIn numeric id, or a hash of the URL). */
  externalId: z.string().min(1),
  /** Canonical URL without tracking parameters. */
  url: z.string().url(),
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  /** Whatever the email carried for this job (a few lines at most). */
  snippet: z.string().optional(),
  postedAt: z.string().optional(),
  /** Mail message ids that referenced this lead (for marking processed). */
  messageIds: z.array(z.string()).default([]),
});
export type Lead = z.infer<typeof LeadSchema>;

/** `source:externalId`, the key used for dedup across the Sheet and runs. */
export function jobIdOf(lead: Pick<Lead, 'source' | 'externalId'>): string {
  return `${lead.source}:${lead.externalId}`;
}
