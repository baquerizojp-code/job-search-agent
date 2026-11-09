import { docLines, plainText, type CvDoc, type Section } from './parse.js';

/**
 * Deterministic checks from skills/job-search/references/cv-ats-guide.md.
 * Errors block `cv build`; warnings are reported for the agent to fix or explain.
 */

export interface LintIssue { rule: string; message: string; line?: number }
export interface LintResult { ok: boolean; errors: LintIssue[]; warnings: LintIssue[]; stats: { words: number; sections: string[]; experienceBullets: number; bulletsWithNumbers: number } }

/** Standard section names ATS parsers key on, matched loosely ("Work Experience" counts as Experience). */
const REQUIRED_SECTIONS: { rule: string; label: string; re: RegExp }[] = [
  { rule: 'section-summary', label: 'Summary', re: /summary|profile|resumen|perfil/i },
  { rule: 'section-skills', label: 'Skills', re: /skills|habilidades|competencias/i },
  { rule: 'section-experience', label: 'Experience', re: /experience|experiencia/i },
  { rule: 'section-education', label: 'Education', re: /education|educaci[oó]n|formaci[oó]n/i },
];

/** About two pages of a single-column CV at 10-11pt. */
const MAX_WORDS = 1100;

const FIRST_PERSON_RE = /\b(I|I'm|I've|I'd|me|my|mine|myself)\b|\b(yo|me|mi|mis)\s/;
const NUMERIC_DATE_RE = /\b(0?[1-9]|1[0-2])[/.-](19|20)\d{2}\b/;
const PLACEHOLDER_RE = /\[(confirm|confirmar|todo|tbd|xx+)[^\]]*\]/i;

export function lintCv(markdown: string, doc: CvDoc): LintResult {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');

  lines.forEach((text, i) => {
    const line = i + 1;
    if (/^\s*\|.*\|\s*$/.test(text)) errors.push({ rule: 'no-tables', message: 'Tables break ATS parsing; use plain lines or bullets.', line });
    if (/!\[[^\]]*\]\(/.test(text)) errors.push({ rule: 'no-images', message: 'Images and icons are not read by an ATS; remove them.', line });
    if (/<\/?[a-z][^>]*>/i.test(text)) errors.push({ rule: 'no-html', message: 'Raw HTML is not allowed; use plain Markdown.', line });
    if (text.includes('—')) errors.push({ rule: 'no-em-dash', message: 'Em dash found; use a comma, colon or "to".', line });
    if (PLACEHOLDER_RE.test(text)) errors.push({ rule: 'no-placeholders', message: `Unresolved placeholder "${PLACEHOLDER_RE.exec(text)?.[0]}": ask the user and fill it in.`, line });
    if (NUMERIC_DATE_RE.test(text)) warnings.push({ rule: 'date-format', message: 'Write dates as "Month YYYY" (for example "March 2024").', line });
  });

  if (!doc.name) errors.push({ rule: 'name', message: 'The first line must be "# Full Name".' });

  const titles = doc.sections.map((s) => s.title);
  for (const req of REQUIRED_SECTIONS) {
    if (!titles.some((t) => req.re.test(t))) errors.push({ rule: req.rule, message: `Missing a "${req.label}" section (use that exact heading).` });
  }

  const contact = doc.preamble.map((b) => (b.kind === 'bullets' ? b.items.map(plainText).join(' ') : plainText(b.runs))).join(' ');
  if (!/[^\s@]+@[^\s@]+\.[^\s@]+/.test(contact)) warnings.push({ rule: 'contact-email', message: 'No email in the lines under the name.' });
  if (!/\b(UTC|GMT)\s?[+\-−]?\s?\d/i.test(contact)) warnings.push({ rule: 'contact-timezone', message: 'State the time zone under the name (for example "UTC-5"); remote recruiters filter on it.' });

  for (const l of docLines(doc)) {
    if (FIRST_PERSON_RE.test(l)) { warnings.push({ rule: 'first-person', message: `First-person wording: "${l.slice(0, 80)}"` }); break; }
  }

  const experience: Section | undefined = doc.sections.find((s) => /experience|experiencia/i.test(s.title));
  let experienceBullets = 0;
  let bulletsWithNumbers = 0;
  if (experience) {
    const text = experience.blocks.map((b) => (b.kind === 'bullets' ? b.items.map(plainText).join('\n') : plainText(b.runs))).join('\n');
    if (!/remote|remoto/i.test(text)) warnings.push({ rule: 'remote-marker', message: 'No role in Experience is marked Remote; mark remote roles explicitly.' });
    for (const b of experience.blocks) {
      if (b.kind !== 'bullets') continue;
      for (const item of b.items) {
        experienceBullets++;
        if (/\d/.test(plainText(item))) bulletsWithNumbers++;
      }
    }
    if (experienceBullets > 0 && bulletsWithNumbers / experienceBullets < 0.3) {
      warnings.push({ rule: 'quantify', message: `Only ${bulletsWithNumbers} of ${experienceBullets} experience bullets carry a number; ask the user for real metrics (never invent them).` });
    }
  }

  const words = docLines(doc).join(' ').split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) warnings.push({ rule: 'length', message: `${words} words, likely more than two pages; shorten the oldest roles to one line each.` });

  return { ok: errors.length === 0, errors, warnings, stats: { words, sections: titles, experienceBullets, bulletsWithNumbers } };
}
