import { convert } from 'html-to-text';
import type { Lead, MailMessage } from '../../schema/index.js';
import { LINKEDIN_JOB_ID_RE, canonicalLinkedInUrl } from '../../core/jobid.js';
import type { EmailExtractor } from './types.js';

interface Details {
  title?: string;
  company?: string;
  location?: string;
}

const SEPARATOR = ' · ';
const MAX_FIELD = 200;

function clean(s: string | undefined): string | undefined {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t && t.length <= MAX_FIELD ? t : undefined;
}

/** Line that reads "Company · Location" (LinkedIn's separator is a middle dot). */
function splitCompanyLocation(line: string): Pick<Details, 'company' | 'location'> | undefined {
  const idx = line.indexOf(SEPARATOR);
  if (idx < 0) return undefined;
  const company = clean(line.slice(0, idx));
  const location = clean(line.slice(idx + SEPARATOR.length));
  if (!company) return undefined;
  return { company, location };
}

const NOISE_RE = /^(view job|see job|apply now|easy apply|\d+\s+(applicants?|connections?|school alumni|company alumni))/i;
const JOB_URL_RE = /\/jobs\/view\/(\d+)/;
const WINDOW = 3;

interface Candidate extends Details {
  score: number;
}

/**
 * Finds "Company · Location" near a line that mentions the job id, in either
 * direction, since the two layouts differ: plain-text alerts read
 * title / "Company · Location" / URL (look back), while html-to-text and
 * mailparser render anchors as "Title [href]" or title / [href] / "Company ·
 * Location" (look forward). Every occurrence of the id is tried and the best
 * scored candidate (most fields, then nearest) wins.
 */
function detailsFromLines(lines: string[], id: string): Details | undefined {
  let best: Candidate | undefined;
  for (let at = 0; at < lines.length; at++) {
    if (!lines[at]!.includes(`/jobs/view/${id}`)) continue;
    const c = candidateAt(lines, at, id);
    if (c && (!best || c.score > best.score)) best = c;
  }
  if (!best) return undefined;
  const { score: _score, ...details } = best;
  return details;
}

function isOtherJobLine(line: string, id: string): boolean {
  const m = JOB_URL_RE.exec(line);
  return !!m && m[1] !== id;
}

/** Nearest "Company · Location" line walking from `at` in `step` direction; noise and same-job lines are skipped. */
function nearestCompanyLine(lines: string[], at: number, id: string, step: 1 | -1): { index: number; distance: number } | undefined {
  let distance = 0;
  for (let i = at + step; i >= 0 && i < lines.length && distance < WINDOW; i += step) {
    const line = lines[i]!;
    if (isOtherJobLine(line, id)) return undefined;
    if (NOISE_RE.test(line) || line.includes(`/jobs/view/${id}`)) continue;
    distance++;
    if (line.includes(SEPARATOR)) return { index: i, distance };
  }
  return undefined;
}

function titleLine(lines: string[], i: number): string | undefined {
  const line = lines[i];
  if (!line || NOISE_RE.test(line) || /https?:\/\//.test(line) || JOB_URL_RE.test(line)) return undefined;
  return clean(line);
}

function candidateAt(lines: string[], at: number, id: string): Candidate | undefined {
  // "Title [href]" as rendered by html-to-text: drop the bracketed href and any URL fragment.
  const inline = clean(lines[at]!.replace(/\[[^\]]*\]/g, '').replace(/\S*\/jobs\/view\/\S*/g, '').replace(/https?:\/\/\S+/g, ''));
  const inlineTitle = inline && !NOISE_RE.test(inline) ? inline : undefined;

  const back = nearestCompanyLine(lines, at, id, -1);
  const fwd = nearestCompanyLine(lines, at, id, 1);
  // An inline title means the html layout, where the card's own company line follows;
  // otherwise the nearest wins and ties go to the plain-text layout (company before URL).
  const nearest = back && fwd && fwd.distance < back.distance ? fwd : back ?? fwd;
  const pick = inlineTitle ? fwd ?? back : nearest;
  if (!pick) return inlineTitle ? { title: inlineTitle, score: 1 } : undefined;

  const cl = splitCompanyLocation(lines[pick.index]!);
  const title = inlineTitle ?? (pick === fwd ? titleLine(lines, at - 1) : titleLine(lines, pick.index - 1));
  return { title, ...cl, score: (title ? 1 : 0) + (cl ? 1 : 0) + (WINDOW - pick.distance) / 10 };
}

function nonEmptyLines(s: string): string[] {
  return s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function htmlToLines(html: string): string[] {
  try {
    const text = convert(html, {
      wordwrap: false,
      selectors: [
        { selector: 'img', format: 'skip' },
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      ],
    });
    return nonEmptyLines(text);
  } catch {
    return [];
  }
}

export function extractLinkedInIds(...bodies: string[]): string[] {
  const ids: string[] = [];
  for (const body of bodies) {
    for (const m of body.matchAll(LINKEDIN_JOB_ID_RE)) {
      const id = m[1]!;
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export const linkedInExtractor: EmailExtractor = {
  name: 'linkedin',
  // Sent by LinkedIn, or forwarded by the user (sender is then the user, but
  // the body still carries linkedin.com/jobs/view/<id> links).
  matches: (msg) =>
    msg.from.toLowerCase().includes('linkedin.com') ||
    /linkedin\.com\/(?:comm\/)?jobs\/view\/\d+/i.test(msg.html) ||
    /linkedin\.com\/(?:comm\/)?jobs\/view\/\d+/i.test(msg.text),
  extract(msg: MailMessage): Lead[] {
    const ids = extractLinkedInIds(msg.html, msg.text);
    if (ids.length === 0) return [];
    const textLines = nonEmptyLines(msg.text);
    const htmlLines = msg.html ? htmlToLines(msg.html) : [];

    return ids.map((id) => {
      let details: Details | undefined;
      try {
        details = detailsFromLines(textLines, id);
        if (!details?.title) details = detailsFromLines(htmlLines, id) ?? details;
      } catch {
        details = undefined;
      }
      return {
        source: 'linkedin',
        externalId: id,
        url: canonicalLinkedInUrl(id),
        title: details?.title,
        company: details?.company,
        location: details?.location,
        snippet: msg.subject || undefined,
        messageIds: [msg.id],
      };
    });
  },
};
