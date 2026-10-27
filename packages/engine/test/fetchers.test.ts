import { describe, it, expect } from 'vitest';
import { htmlToText, truncate, decodeEntities, innerHtmlOf, textOf } from '../src/fetchers/html.js';
import { parseGuestHtml } from '../src/fetchers/linkedin.js';
import { classifyText, statusForHttp } from '../src/fetchers/classify.js';
import { classifyGeneric, cleanTitle } from '../src/fetchers/generic.js';
import { applyAgentPostings, fetcherFor } from '../src/fetchers/index.js';
import type { Posting, AgentPosting, Lead } from '../src/schema/index.js';

const LONG = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10); // ~570 chars

const GUEST_FRAGMENT = `
<section class="top-card-layout">
  <div class="top-card-layout__card">
    <h1 class="top-card-layout__title topcard__title">Senior &amp; Staff Engineer</h1>
    <h4 class="top-card-layout__second-subline">
      <span class="topcard__flavor">
        <a class="topcard__org-name-link topcard__flavor--black-link" href="https://www.linkedin.com/company/acme">Acme Corp</a>
      </span>
      <span class="topcard__flavor topcard__flavor--bullet">Guayaquil, Ecuador</span>
      <span class="posted-time-ago__text topcard__flavor--metadata">2 weeks ago</span>
    </h4>
  </div>
</section>
<section class="description">
  <div class="description__text description__text--rich">
    <section class="show-more-less-html">
      <div class="show-more-less-html__markup relative overflow-hidden">
        <p><strong>About the role</strong></p>
        <p>${LONG}</p>
        <ul><li>Build <a href="https://example.com/x">great things</a></li><li>Ship &nbsp;fast</li></ul>
        <img src="https://example.com/pixel.gif" alt="pixel" />
        <div><div>Nested closing div</div></div>
      </div>
    </section>
  </div>
</section>`;

const CLOSED_FRAGMENT = `
<section class="top-card-layout">
  <h1 class="top-card-layout__title">Data Scientist</h1>
  <div class="top-card-layout__second-subline"><a href="/company/beta">Beta Labs</a></div>
  <span class="topcard__flavor--bullet">Remote</span>
  <figcaption class="closed-job__flavor--closed">No longer accepting applications</figcaption>
</section>
<div class="description__text"><p>Short description.</p></div>`;

describe('html helpers', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('A &amp; B &lt;c&gt; &#39;q&#39; &#x41; &nbsp;x &unknown;')).toBe("A & B <c> 'q' A  x &unknown;");
  });

  it('htmlToText drops images, keeps link text, collapses whitespace', () => {
    const text = htmlToText('<p>Hello   <a href="https://x.y/z">world</a></p>\n\n\n<img src="a.png" alt="pic"><p>Bye</p>');
    expect(text).toBe('Hello world\n\nBye');
    expect(text).not.toContain('https://x.y/z');
    expect(text).not.toContain('a.png');
  });

  it('htmlToText honours maxChars', () => {
    const text = htmlToText(`<p>${LONG}</p>`, { maxChars: 100 });
    expect(text.length).toBeLessThanOrEqual(100);
  });

  it('truncate cuts at a word boundary and reports it', () => {
    expect(truncate('short text', 100)).toEqual({ text: 'short text', truncated: false });
    expect(truncate('exactly ten', 11)).toEqual({ text: 'exactly ten', truncated: false });
    const r = truncate('the quick brown fox jumps over the lazy dog', 20);
    expect(r.truncated).toBe(true);
    expect(r.text).toBe('the quick brown fox');
    expect(r.text.length).toBeLessThanOrEqual(20);
    const noSpace = truncate('a'.repeat(50), 20);
    expect(noSpace).toEqual({ text: 'a'.repeat(20), truncated: true });
    expect(truncate('abc', 0)).toEqual({ text: '', truncated: true });
  });

  it('innerHtmlOf balances nested same-name tags', () => {
    const html = '<div class="a"><div>inner</div> tail</div><div class="b">other</div>';
    expect(innerHtmlOf(html, { classToken: 'a' })).toBe('<div>inner</div> tail');
    expect(innerHtmlOf(html, { classToken: 'b' })).toBe('other');
    expect(innerHtmlOf(html, { classToken: 'missing' })).toBeUndefined();
    expect(textOf('<h1 class="x y">  Hi &amp; bye </h1>', { tag: 'h1' })).toBe('Hi & bye');
  });
});

describe('parseGuestHtml', () => {
  it('extracts title, company, location, description and posted date', () => {
    const p = parseGuestHtml(GUEST_FRAGMENT);
    expect(p.title).toBe('Senior & Staff Engineer');
    expect(p.company).toBe('Acme Corp');
    expect(p.location).toBe('Guayaquil, Ecuador');
    expect(p.postedAt).toBe('2 weeks ago');
    expect(p.closed).toBe(false);
    expect(p.description).toContain('About the role');
    expect(p.description).toContain('great things');
    expect(p.description).toContain('Nested closing div');
    expect(p.description).not.toContain('pixel.gif');
    expect(p.description).not.toContain('example.com');
    expect(p.description.length).toBeGreaterThan(500);
  });

  it('detects a closed posting and falls back to the second-subline link and description__text', () => {
    const p = parseGuestHtml(CLOSED_FRAGMENT);
    expect(p.closed).toBe(true);
    expect(p.title).toBe('Data Scientist');
    expect(p.company).toBe('Beta Labs');
    expect(p.location).toBe('Remote');
    expect(p.description).toBe('Short description.');
  });

  it('returns an empty description for an unrelated fragment', () => {
    const p = parseGuestHtml('<html><body><p>nothing here</p></body></html>');
    expect(p.description).toBe('');
    expect(p.title).toBeUndefined();
    expect(p.closed).toBe(false);
  });
});

describe('classifyText', () => {
  const ok = LONG;
  it('authwall by URL wins over everything', () => {
    expect(classifyText('https://www.linkedin.com/authwall?trk=x', ok)).toBe('authwall');
    expect(classifyText('https://www.linkedin.com/login', ok)).toBe('authwall');
    expect(classifyText('https://www.linkedin.com/checkpoint/challenge', ok)).toBe('authwall');
  });
  it('sign-in prompt without a description is an authwall', () => {
    expect(classifyText('https://www.linkedin.com/jobs/view/1/', 'Sign in to view more jobs. Join LinkedIn')).toBe('authwall');
    expect(classifyText('https://www.linkedin.com/jobs/view/1/', 'Join LinkedIn footer ' + ok, ok)).toBe('ok');
  });
  it('Cloudflare challenge is blocked', () => {
    expect(classifyText('https://jobs.example.com/x', 'Just a moment... Checking your browser')).toBe('blocked');
    expect(classifyText('https://jobs.example.com/x', 'Verify you are human to continue')).toBe('blocked');
  });
  it('closed wins over length', () => {
    expect(classifyText('https://www.linkedin.com/jobs/view/1/', 'No longer accepting applications. ' + ok)).toBe('closed');
  });
  it('length thresholds: 200 is ok, 199 partial, empty is empty', () => {
    expect(classifyText('https://x.y/', 'a'.repeat(200))).toBe('ok');
    expect(classifyText('https://x.y/', 'a'.repeat(199))).toBe('partial');
    expect(classifyText('https://x.y/', '   ')).toBe('empty');
  });
  it('statusForHttp maps 404 to empty and 403/429 to blocked', () => {
    expect(statusForHttp(404)).toBe('empty');
    expect(statusForHttp(403)).toBe('blocked');
    expect(statusForHttp(429)).toBe('blocked');
    expect(statusForHttp(200)).toBeUndefined();
  });
});

describe('generic helpers', () => {
  it('cleanTitle strips only the last company suffix segment', () => {
    expect(cleanTitle('Staff Engineer | Acme')).toBe('Staff Engineer');
    expect(cleanTitle('Staff Engineer - Acme Careers')).toBe('Staff Engineer');
    expect(cleanTitle('Staff Engineer – Acme')).toBe('Staff Engineer');
    expect(cleanTitle('Software Engineer (.NET) - Remote Work | REF#1 | LinkedIn')).toBe('Software Engineer (.NET) - Remote Work | REF#1');
    expect(cleanTitle('Plain')).toBe('Plain');
  });
  it('classifyGeneric treats a cross-host login redirect as authwall and same-host login path too', () => {
    expect(classifyGeneric('https://jobs.acme.com/123', 'https://auth.acme.com/login?next=x', LONG)).toBe('authwall');
    expect(classifyGeneric('https://jobs.acme.com/123', 'https://jobs.acme.com/123', LONG)).toBe('ok');
    expect(classifyGeneric('https://jobs.acme.com/123', 'https://jobs.acme.com/123', LONG, 403)).toBe('blocked');
    expect(classifyGeneric('https://jobs.acme.com/123', 'https://jobs.acme.com/123', LONG, 404)).toBe('empty');
    expect(classifyGeneric('https://jobs.acme.com/123', 'https://jobs.acme.com/123', 'Just a moment', 503)).toBe('blocked');
  });
});

function lead(over: Partial<Lead> = {}): Lead {
  return { source: 'linkedin', externalId: '123', url: 'https://www.linkedin.com/jobs/view/123', messageIds: [], ...over };
}
function posting(over: Partial<Posting> = {}): Posting {
  return { ...lead(), jobId: 'linkedin:123', description: '', descriptionTruncated: false, fetchStatus: 'authwall', fetchError: 'x', ...over };
}

describe('fetcherFor', () => {
  it('routes linkedin leads to the LinkedIn fetcher and everything else to generic', () => {
    expect(fetcherFor(lead()).name).toBe('linkedin');
    expect(fetcherFor(lead({ source: 'indeed', url: 'https://indeed.com/viewjob?jk=1' })).name).toBe('generic');
  });
});

describe('applyAgentPostings', () => {
  it('matches by jobId and fills fields, clearing the error', () => {
    const agent: AgentPosting[] = [{ url: 'https://example.com/whatever', jobId: 'linkedin:123', title: 'T', company: 'C', location: 'L', description: LONG }];
    const [out] = applyAgentPostings([posting()], agent, 10_000);
    expect(out!.fetchStatus).toBe('ok');
    expect(out!.title).toBe('T');
    expect(out!.company).toBe('C');
    expect(out!.location).toBe('L');
    expect(out!.description).toBe(LONG.trim());
    expect(out!.descriptionTruncated).toBe(false);
    expect(out!.fetchError).toBeUndefined();
    expect(out!.fetchedAt).toBeTruthy();
  });

  it('matches by canonical URL ignoring tracking params and trailing slash', () => {
    const agent: AgentPosting[] = [{ url: 'https://www.linkedin.com/jobs/view/123/?trk=abc&refId=zzz', description: LONG }];
    const [out] = applyAgentPostings([posting({ title: 'keep' })], agent, 10_000);
    expect(out!.fetchStatus).toBe('ok');
    expect(out!.title).toBe('keep');
  });

  it('marks closed postings and truncates long descriptions', () => {
    const agent: AgentPosting[] = [{ url: 'https://www.linkedin.com/jobs/view/123', description: LONG, closed: true }];
    const [out] = applyAgentPostings([posting()], agent, 100);
    expect(out!.fetchStatus).toBe('closed');
    expect(out!.descriptionTruncated).toBe(true);
    expect(out!.description.length).toBeLessThanOrEqual(100);
  });

  it('leaves unmatched postings untouched', () => {
    const p = posting({ externalId: '999', jobId: 'linkedin:999', url: 'https://www.linkedin.com/jobs/view/999' });
    const [out] = applyAgentPostings([p], [{ url: 'https://www.linkedin.com/jobs/view/123', description: LONG }], 10_000);
    expect(out).toEqual(p);
  });
});

describe('removed LinkedIn postings', () => {
  it('a missing_jd_redirect landing page counts as closed', () => {
    expect(classifyText('https://www.linkedin.com/jobs/search?trk=missing_jd_redirect&position=1', 'Cashier The Home Depot', '')).toBe('closed');
  });
});
