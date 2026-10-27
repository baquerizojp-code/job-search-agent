import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { simpleParser } from 'mailparser';
import { toMailMessage } from '../src/providers/mail/gmail-imap.js';
import { ALL_EXTRACTORS, extractLeads, extractorsFor, genericExtractor, linkedInExtractor } from '../src/sources/email/index.js';
import { LeadSchema, type MailMessage } from '../src/schema/index.js';

async function fixture(name: string, id = `msg-${name}`): Promise<MailMessage> {
  const raw = readFileSync(path.join(__dirname, 'fixtures', name));
  return toMailMessage(await simpleParser(raw), id);
}

describe('linkedInExtractor', () => {
  it('matches LinkedIn senders only', async () => {
    expect(linkedInExtractor.matches(await fixture('linkedin-multipart.eml'))).toBe(true);
    expect(linkedInExtractor.matches(await fixture('remotive-digest.eml'))).toBe(false);
  });

  it('extracts ids from both html and text, deduped and in order', async () => {
    const msg = await fixture('linkedin-multipart.eml', 'm1');
    const leads = linkedInExtractor.extract(msg);
    expect(leads.map((l) => l.externalId)).toEqual(['4404044430', '4411223344', '4422334455', '4433445566']);
    for (const lead of leads) {
      expect(LeadSchema.safeParse(lead).success).toBe(true);
      expect(lead.source).toBe('linkedin');
      expect(lead.messageIds).toEqual(['m1']);
      expect(lead.url).toBe(`https://www.linkedin.com/jobs/view/${lead.externalId}`);
      expect(lead.url).not.toMatch(/trackingId|refId|comm/);
    }
  });

  it('parses title, company and location from the text part', async () => {
    const [a, b, c, d] = linkedInExtractor.extract(await fixture('linkedin-multipart.eml'));
    expect(a).toMatchObject({ title: 'Senior AI Engineer', company: 'Acme Corp', location: 'Guayaquil, Ecuador (Remote)' });
    expect(b).toMatchObject({ title: 'Machine Learning Engineer, Aquaculture', company: 'Blue Ocean Labs', location: 'Lima, Peru (Hybrid)' });
    expect(c).toMatchObject({ title: 'Staff Data Scientist', company: 'Globex', location: 'Remote' });
    // Only in the html part: falls back to the html heuristic.
    expect(d).toMatchObject({ title: 'Applied Scientist, Computer Vision', company: 'Initech', location: 'Quito, Ecuador' });
  });

  it('parses details from html-only alerts and decodes entities', async () => {
    const parsed = await fixture('linkedin-html-only.eml');
    // mailparser synthesizes `text` from html; also force the pure-html path.
    for (const msg of [parsed, { ...parsed, text: '' }]) {
      const leads = linkedInExtractor.extract(msg);
      expect(leads.map((l) => l.externalId)).toEqual(['4455667788', '4466778899']);
      expect(leads[0]).toMatchObject({ title: 'Lead ML Engineer & Data Platform', company: 'Aquatech S.A.', location: 'Guayaquil, Ecuador' });
      expect(leads[1]).toMatchObject({ title: 'Senior Backend Engineer (Python)', company: 'Nimbus', location: 'Remote' });
    }
  });

  it('never throws on garbage and leaves fields undefined', () => {
    const msg: MailMessage = { id: 'x', from: 'a@linkedin.com', subject: '', text: 'https://www.linkedin.com/jobs/view/123', html: '<div><<<>>></div><a href="/jobs/view/123"></a>' };
    const leads = linkedInExtractor.extract(msg);
    expect(leads).toHaveLength(1);
    expect(leads[0]!.title).toBeUndefined();
    expect(leads[0]!.company).toBeUndefined();
    expect(leads[0]!.location).toBeUndefined();
    expect(linkedInExtractor.extract({ id: 'y', from: 'a@linkedin.com', subject: '', text: '', html: '' })).toEqual([]);
  });
});

describe('genericExtractor', () => {
  it('keeps only job-posting links, deduped by canonical url, with tracking stripped', async () => {
    const msg = await fixture('remotive-digest.eml', 'g1');
    const leads = genericExtractor.extract(msg);
    const urls = leads.map((l) => l.url);
    expect(urls).toEqual([
      'https://remotive.com/remote-jobs/software-dev/machine-learning-engineer-1900001',
      'https://remotive.com/remote-jobs/software-dev/ai-product-engineer-1900002',
      'https://boards.greenhouse.io/wave/jobs/5550001?gh_src=newsletter',
      'https://example.com/careers/staff-ml-engineer',
      'https://remotive.com/remote-jobs/software-dev',
    ]);
    for (const lead of leads) {
      expect(LeadSchema.safeParse(lead).success).toBe(true);
      expect(lead).toMatchObject({ source: 'generic', snippet: msg.subject, messageIds: ['g1'] });
      expect(lead.title).toBeUndefined();
      expect(lead.externalId).toMatch(/^[0-9a-f]{12}$/);
    }
    expect(urls.join(' ')).not.toMatch(/unsubscribe|settings|help|privacy|login|assets|track\./);
  });

  it('caps at 50 leads per message', () => {
    const html = Array.from({ length: 80 }, (_, i) => `<a href="https://x.com/jobs/${i}">j</a>`).join('');
    expect(genericExtractor.extract({ id: 'c', from: 'x', subject: '', text: '', html })).toHaveLength(50);
  });
});

describe('extractorsFor / extractLeads', () => {
  it('orders named extractors and always appends generic', () => {
    expect(extractorsFor(['linkedin', 'generic']).map((e) => e.name)).toEqual(['linkedin', 'generic']);
    expect(extractorsFor(['generic', 'linkedin']).map((e) => e.name)).toEqual(['linkedin', 'generic']);
    expect(extractorsFor(['nope']).map((e) => e.name)).toEqual(['generic']);
    expect(extractorsFor([]).map((e) => e.name)).toEqual(['generic']);
    expect(ALL_EXTRACTORS.at(-1)?.name).toBe('generic');
  });

  it('runs only the first matching extractor', async () => {
    const li = await fixture('linkedin-multipart.eml');
    const leads = extractLeads(li, extractorsFor(['linkedin']));
    expect(leads.every((l) => l.source === 'linkedin')).toBe(true);
    expect(leads).toHaveLength(4);

    const generic = extractLeads(await fixture('remotive-digest.eml'), extractorsFor(['linkedin']));
    expect(generic.every((l) => l.source === 'generic')).toBe(true);
    expect(extractLeads(li, [])).toEqual([]);
  });
});

describe('forwarded LinkedIn alerts', () => {
  it('are matched by their job links even when the sender is the user', async () => {
    const { linkedInExtractor } = await import('../src/sources/email/index.js');
    const msg = {
      id: 'fwd-1', from: 'someone@gmail.com', subject: 'Fwd: You may be a fit for Acme',
      text: '---------- Forwarded message ---------\nAI Engineer\nAcme · Remote\nhttps://www.linkedin.com/comm/jobs/view/4371014660/?trackingId=x',
      html: '',
    };
    expect(linkedInExtractor.matches(msg)).toBe(true);
    const leads = linkedInExtractor.extract(msg);
    expect(leads.map((l) => l.externalId)).toEqual(['4371014660']);
    expect(linkedInExtractor.matches({ ...msg, text: 'no jobs here', html: '' })).toBe(false);
  });
});
