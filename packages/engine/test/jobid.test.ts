import { describe, expect, it } from 'vitest';
import { canonicalLinkedInUrl, canonicalUrl, linkedInIdFromUrl, urlHash } from '../src/core/jobid.js';

describe('canonicalUrl', () => {
  it('strips trackingId, refId and utm_* but keeps other params', () => {
    const url = 'https://www.linkedin.com/comm/jobs/view/4404044430/?trackingId=abc&refId=xyz&utm_source=mail&utm_medium=email&currentJobId=9#top';
    expect(canonicalUrl(url)).toBe('https://www.linkedin.com/comm/jobs/view/4404044430/?currentJobId=9');
  });

  it('drops a dangling ? and lowercases the host', () => {
    expect(canonicalUrl('https://Remotive.COM/remote-jobs/x?utm_source=a')).toBe('https://remotive.com/remote-jobs/x');
    expect(canonicalUrl('https://example.com/jobs/1?trk=eml')).toBe('https://example.com/jobs/1');
  });

  it('returns the trimmed input when it is not a URL', () => {
    expect(canonicalUrl('  not a url ')).toBe('not a url');
  });

  it('hashes the canonical form', () => {
    expect(urlHash('https://x.com/jobs/1?utm_source=a')).toBe(urlHash('https://x.com/jobs/1'));
    expect(urlHash('https://x.com/jobs/1')).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('linkedInIdFromUrl', () => {
  it('reads ids from /comm/jobs/view/ and /jobs/view/ links', () => {
    expect(linkedInIdFromUrl('https://www.linkedin.com/comm/jobs/view/123/?trackingId=a')).toBe('123');
    expect(linkedInIdFromUrl('https://www.linkedin.com/jobs/view/4404044430')).toBe('4404044430');
    expect(linkedInIdFromUrl('https://www.linkedin.com/jobs/search/')).toBeUndefined();
    expect(canonicalLinkedInUrl('123')).toBe('https://www.linkedin.com/jobs/view/123');
  });
});
