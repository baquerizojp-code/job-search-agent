import { z } from 'zod';

export const SHEET_HEADERS = [
  'Date', 'Source', 'Company', 'Role', 'Location', 'Link', 'Score', 'Verdict',
  'Match Summary', 'Red Flags', 'Status', 'Status Updated', 'Notes', 'Job ID',
] as const;

export const StatusSchema = z.enum(['New', 'Preparing', 'Applied', 'Interview', 'Offer', 'Rejected', 'Closed']);
export type Status = z.infer<typeof StatusSchema>;

export const SheetRowSchema = z.object({
  date: z.string(),
  source: z.string(),
  company: z.string(),
  role: z.string(),
  location: z.string(),
  link: z.string(),
  score: z.number().int().min(1).max(10),
  verdict: z.enum(['Apply', 'Review', 'Skip']),
  matchSummary: z.string(),
  redFlags: z.string(),
  status: z.string().default('New'),
  statusUpdated: z.string().default(''),
  notes: z.string().default(''),
  jobId: z.string(),
});
export type SheetRow = z.infer<typeof SheetRowSchema>;

export type SheetTab = 'Jobs' | 'Skipped';

/** Order of values as they are written to the Sheet, matching SHEET_HEADERS. */
export function rowToValues(r: SheetRow): (string | number)[] {
  return [r.date, r.source, r.company, r.role, r.location, r.link, r.score, r.verdict,
    r.matchSummary, r.redFlags, r.status, r.statusUpdated, r.notes, r.jobId];
}

/** Tolerant parse of a row coming back from any Sheet provider (header-keyed object or positional array). */
export function rowFromValues(v: Record<string, unknown> | unknown[]): Partial<SheetRow> {
  const arr = Array.isArray(v) ? v : SHEET_HEADERS.map((h) => (v as Record<string, unknown>)[h]);
  const s = (i: number) => (arr[i] == null ? '' : String(arr[i]));
  const score = Number(arr[6]);
  return {
    date: s(0), source: s(1), company: s(2), role: s(3), location: s(4), link: s(5),
    score: Number.isFinite(score) ? score : undefined,
    verdict: (['Apply', 'Review', 'Skip'].includes(s(7)) ? s(7) : undefined) as SheetRow['verdict'] | undefined,
    matchSummary: s(8), redFlags: s(9), status: s(10), statusUpdated: s(11), notes: s(12), jobId: s(13),
  };
}
