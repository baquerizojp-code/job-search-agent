import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ScoreSchema, verdictFor, visibleScore } from '../src/schema/index.js';
import { RunDir } from '../src/core/run.js';
import { validateScores } from '../src/core/commit.js';

const base = { jobId: 'linkedin:1', company: 'Acme', role: 'AI Engineer', location: 'Remote', match_summary: 'ok', red_flags: '' };

describe('score validation', () => {
  it('maps totals to bands and visible 1-10', () => {
    expect(verdictFor(70)).toBe('Apply');
    expect(verdictFor(69)).toBe('Review');
    expect(verdictFor(49)).toBe('Skip');
    expect(visibleScore(0)).toBe(1);
    expect(visibleScore(69)).toBe(6);
    expect(visibleScore(100)).toBe(10);
  });

  it('rejects a total that is not the sum, and a verdict outside its band', () => {
    const dims = { skills_overlap: 40, role_fit: 20, geo_remote: 5, domain_fit: 15, company_signal: 8 };
    expect(ScoreSchema.safeParse({ ...base, ...dims, total: 88, verdict: 'Apply' }).success).toBe(true);
    expect(ScoreSchema.safeParse({ ...base, ...dims, total: 89, verdict: 'Apply' }).success).toBe(false);
    expect(ScoreSchema.safeParse({ ...base, ...dims, total: 88, verdict: 'Review' }).success).toBe(false);
    expect(ScoreSchema.safeParse({ ...base, ...dims, skills_overlap: 51, total: 99, verdict: 'Apply' }).success).toBe(false);
  });

  it('reports one bad score without rejecting the rest of the file', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'js-'));
    const run = new RunDir(ws, '2026-01-01');
    const posting = (id: string) => ({ source: 'linkedin', externalId: id, url: `https://www.linkedin.com/jobs/view/${id}`, messageIds: [], jobId: `linkedin:${id}`, description: '', descriptionTruncated: false, fetchStatus: 'ok' });
    fs.writeFileSync(run.batchFile(1), JSON.stringify({ run: '2026-01-01', batch: 1, postings: [posting('1'), posting('2')] }));
    const dims = { skills_overlap: 10, role_fit: 10, geo_remote: 5, domain_fit: 5, company_signal: 5 };
    fs.writeFileSync(run.scoresFile(1), JSON.stringify({ run: '2026-01-01', batch: 1, scores: [
      { ...base, jobId: 'linkedin:1', ...dims, total: 35, verdict: 'Skip' },
      { ...base, jobId: 'linkedin:2', ...dims, total: 36, verdict: 'Skip' },
    ] }));
    const { scores, errors } = validateScores(run);
    expect(scores.size).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.jobId).toBe('linkedin:2');
  });
});
