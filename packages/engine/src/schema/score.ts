import { z } from 'zod';

export const DIMENSIONS = {
  skills_overlap: 50,
  role_fit: 20,
  geo_remote: 5,
  domain_fit: 15,
  company_signal: 10,
} as const;
export type Dimension = keyof typeof DIMENSIONS;

export const VerdictSchema = z.enum(['Apply', 'Review', 'Skip']);
export type Verdict = z.infer<typeof VerdictSchema>;

/** Apply >= 70, Review 50-69, Skip < 50 on the internal 0-100 scale. */
export function verdictFor(total: number): Verdict {
  if (total >= 70) return 'Apply';
  if (total >= 50) return 'Review';
  return 'Skip';
}

/** Visible 1-10 score: floor(total/10), never below 1. Apply >= 7, Review 5-6, Skip < 5. */
export function visibleScore(total: number): number {
  return Math.max(1, Math.min(10, Math.floor(total / 10)));
}

const dim = (max: number) => z.number().int().min(0).max(max);

export const ScoreSchema = z
  .object({
    jobId: z.string().min(1),
    company: z.string().min(1),
    role: z.string().min(1),
    location: z.string().default('Not specified'),
    skills_overlap: dim(DIMENSIONS.skills_overlap),
    role_fit: dim(DIMENSIONS.role_fit),
    geo_remote: dim(DIMENSIONS.geo_remote),
    domain_fit: dim(DIMENSIONS.domain_fit),
    company_signal: dim(DIMENSIONS.company_signal),
    total: z.number().int().min(0).max(100),
    verdict: VerdictSchema,
    match_summary: z.string().max(300),
    red_flags: z.string().max(300).default(''),
  })
  .superRefine((s, ctx) => {
    const sum = s.skills_overlap + s.role_fit + s.geo_remote + s.domain_fit + s.company_signal;
    if (sum !== s.total) {
      ctx.addIssue({ code: 'custom', path: ['total'], message: `total ${s.total} != sum of dimensions ${sum}` });
    }
    const expected = verdictFor(s.total);
    if (s.verdict !== expected) {
      ctx.addIssue({ code: 'custom', path: ['verdict'], message: `verdict ${s.verdict} but total ${s.total} maps to ${expected}` });
    }
  });
export type Score = z.infer<typeof ScoreSchema>;

/**
 * The file shape only. Each entry is validated on its own with ScoreSchema in
 * commit, so one bad score is reported back instead of rejecting the batch.
 */
export const ScoresFileSchema = z.object({
  run: z.string(),
  batch: z.number().int().min(1),
  scores: z.array(z.unknown()),
});
export type ScoresFile = z.infer<typeof ScoresFileSchema>;
