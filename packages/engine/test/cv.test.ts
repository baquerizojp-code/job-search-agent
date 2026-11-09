import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCv, parseInline, docLines } from '../src/core/cv/parse.js';
import { lintCv } from '../src/core/cv/lint.js';
import { renderDocx, renderHtml } from '../src/core/cv/render.js';
import { importCv, htmlToPdf, pdfText, detectFormat } from '../src/core/cv/io.js';
import { checkLinkedinProfile, LINKEDIN_LIMITS } from '../src/core/linkedin.js';

const GOOD = fs.readFileSync(path.join(__dirname, 'fixtures', 'cv-good.md'), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jobsearch-cv-'));
const lint = (md: string) => lintCv(md, parseCv(md));
const rules = (issues: { rule: string }[]) => issues.map((i) => i.rule);

function chromiumInstalled(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { chromium } = require('playwright') as typeof import('playwright');
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

describe('cv parse', () => {
  it('splits name, preamble, sections, roles and bullets', () => {
    const doc = parseCv(GOOD);
    expect(doc.name).toBe('Maria Example');
    expect(doc.preamble).toHaveLength(2);
    expect(doc.sections.map((s) => s.title)).toEqual(['Summary', 'Skills', 'Experience', 'Education', 'Languages']);
    const exp = doc.sections[2];
    expect(exp.blocks.filter((b) => b.kind === 'subheading')).toHaveLength(2);
    expect(exp.blocks.find((b) => b.kind === 'bullets')).toMatchObject({ kind: 'bullets', items: expect.arrayContaining([expect.any(Array)]) });
  });

  it('reduces links to text and keeps bold and italic runs', () => {
    expect(parseInline('[linkedin.com/in/x](https://www.linkedin.com/in/x)')).toEqual([{ text: 'linkedin.com/in/x' }]);
    expect(parseInline('[Portfolio](https://example.com)')).toEqual([{ text: 'Portfolio (https://example.com)' }]);
    expect(parseInline('**Bold:** text *it*')).toEqual([{ text: 'Bold:', bold: true }, { text: ' text ' }, { text: 'it', italic: true }]);
    expect(parseInline('snake_case_name stays')).toEqual([{ text: 'snake_case_name stays' }]);
  });
});

describe('cv lint', () => {
  it('passes a CV that follows the guide', () => {
    const r = lint(GOOD);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.stats.experienceBullets).toBe(5);
  });

  it('blocks tables, images, html, em dashes, placeholders and missing sections', () => {
    const bad = `# Jane Doe\n\nNYC | jane@example.com\n\n## Experience\n\n| Role | Company |\n|---|---|\n\n![logo](x.png)\n\n<b>bold</b>\n\n- Led a team — fast\n- Grew revenue by [confirm: %]\n`;
    const r = lint(bad);
    expect(r.ok).toBe(false);
    expect(rules(r.errors)).toEqual(expect.arrayContaining(['no-tables', 'no-images', 'no-html', 'no-em-dash', 'no-placeholders', 'section-summary', 'section-skills', 'section-education']));
  });

  it('warns about missing time zone, first person, numeric dates, missing Remote and unquantified bullets', () => {
    const weak = `# Jane Doe\n\njane@example.com\n\n## Summary\n\nI build things.\n\n## Skills\n\n- Python\n\n## Experience\n\n### Engineer, Acme\n03/2021 to Present\n\n- Built dashboards\n- Improved processes\n- Helped the team\n\n## Education\n\n- B.Sc.\n`;
    expect(rules(lint(weak).warnings)).toEqual(expect.arrayContaining(['contact-timezone', 'first-person', 'date-format', 'remote-marker', 'quantify']));
  });
});

describe('cv render and import', () => {
  it('builds a .docx whose text imports back with every section', async () => {
    const dir = tmp();
    const file = path.join(dir, 'cv.docx');
    fs.writeFileSync(file, await renderDocx(parseCv(GOOD)));
    const { text, format } = await importCv(file);
    expect(format).toBe('docx');
    for (const needle of ['Maria Example', 'Summary', 'Experience', 'Senior Integration Engineer, Acme Corp', '- Built 40+ API integrations', 'UTC-5']) {
      expect(text).toContain(needle);
    }
  });

  it('renders single-column HTML with escaped text', () => {
    const html = renderHtml(parseCv('# A <B>\n\n## Summary\n\nx & y\n'));
    expect(html).toContain('A &lt;B&gt;');
    expect(html).toContain('x &amp; y');
    expect(html).not.toMatch(/<table|column-count|<img/);
  });

  it('imports Markdown as is and rejects unsupported formats', async () => {
    const dir = tmp();
    const md = path.join(dir, 'cv.md');
    fs.writeFileSync(md, GOOD);
    expect((await importCv(md)).text).toBe(GOOD.trim());
    expect(() => detectFormat('cv.doc')).toThrow(/docx/);
    expect(() => detectFormat('cv.pages')).toThrow(/Unsupported/);
  });

  it.skipIf(!chromiumInstalled())('builds a PDF an ATS can read back, within two pages', async () => {
    const dir = tmp();
    const pdf = path.join(dir, 'cv.pdf');
    const doc = parseCv(GOOD);
    await htmlToPdf(renderHtml(doc), pdf, 'letter');
    const { text, pages } = await pdfText(new Uint8Array(fs.readFileSync(pdf)));
    expect(pages).toBeLessThanOrEqual(2);
    for (const line of docLines(doc).slice(0, 8)) expect(text.replace(/\s+/g, ' ')).toContain(line.replace(/\s+/g, ' ').slice(0, 30));
    const reimported = await importCv(pdf);
    expect(reimported.format).toBe('pdf');
  }, 60_000);
});

describe('linkedin check', () => {
  const profile = (about: string) => `# LinkedIn profile\n\n## Headline\n\nIntegration Engineer | APIs and automation\n\n## About\n\n${about}\n\n## Experience\n\n### Senior Integration Engineer | Acme Corp\nDates: March 2022 to Present\nLocation: Remote\n\n- Built 40+ API integrations\n\n## Skills\n\nREST APIs, n8n, Zapier, PostgreSQL\n`;

  it('passes a draft within limits and counts what will be pasted', () => {
    const r = checkLinkedinProfile(profile('Short about.'));
    expect(r.ok).toBe(true);
    expect(r.checks.find((c) => c.name === 'Skills (count)')?.chars).toBe(4);
    expect(r.checks.find((c) => c.name.endsWith('(description)'))?.chars).toBe('• Built 40+ API integrations'.length);
  });

  it('flags an About over the limit and missing sections', () => {
    const r = checkLinkedinProfile(profile('x'.repeat(LINKEDIN_LIMITS.about + 1)));
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === 'About')).toMatchObject({ ok: false, limit: 2600 });
    expect(checkLinkedinProfile('# LinkedIn profile\n').errors).toEqual(['Missing "## Headline".', 'Missing "## About".']);
  });
});
