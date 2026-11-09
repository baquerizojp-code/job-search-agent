/**
 * Parser for the small Markdown subset a CV is written in (see
 * skills/job-search/references/cv-ats-guide.md): `#` name, `##` sections,
 * `###` sub-headings (roles, projects), bullets, one-line paragraphs, and
 * inline **bold**, *italic* and [links](url). Anything else is kept as plain
 * text; `lint` is what flags constructs an ATS cannot read.
 */

export interface Run { text: string; bold?: boolean; italic?: boolean }

export type Block =
  | { kind: 'subheading'; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'bullets'; items: Run[][] };

export interface Section { title: string; blocks: Block[] }

export interface CvDoc {
  name: string;
  /** Lines between the name and the first section: headline, contact line. */
  preamble: Block[];
  sections: Section[];
}

const BULLET_RE = /^\s*[-*+•]\s+(.*)$/;
const RULE_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;

export function parseCv(markdown: string): CvDoc {
  const doc: CvDoc = { name: '', preamble: [], sections: [] };
  let blocks = doc.preamble;

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim() || RULE_RE.test(line)) continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      if (level === 1 && !doc.name) {
        doc.name = plainText(parseInline(text));
      } else if (level <= 2) {
        const section: Section = { title: plainText(parseInline(text)), blocks: [] };
        doc.sections.push(section);
        blocks = section.blocks;
      } else {
        blocks.push({ kind: 'subheading', runs: parseInline(text) });
      }
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      const item = parseInline(bullet[1].trim());
      if (last?.kind === 'bullets') last.items.push(item);
      else blocks.push({ kind: 'bullets', items: [item] });
      continue;
    }

    blocks.push({ kind: 'paragraph', runs: parseInline(line.trim()) });
  }
  return doc;
}

/** Inline Markdown to runs. Links become their text, or `text (url)` when the text is not the URL itself. */
export function parseInline(text: string): Run[] {
  const linked = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const bare = (s: string) => s.replace(/^(https?:\/\/)?(www\.)?/i, '').replace(/\/$/, '');
    return bare(label) === bare(url) ? label : `${label} (${url})`;
  });
  const runs: Run[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_(?![A-Za-z0-9])/g;
  let at = 0;
  for (let m = re.exec(linked); m; m = re.exec(linked)) {
    if (m.index > at) runs.push({ text: linked.slice(at, m.index) });
    if (m[1] ?? m[2]) runs.push({ text: (m[1] ?? m[2]) as string, bold: true });
    else runs.push({ text: (m[3] ?? m[4]) as string, italic: true });
    at = m.index + m[0].length;
  }
  if (at < linked.length) runs.push({ text: linked.slice(at) });
  return runs.filter((r) => r.text.length > 0);
}

export function plainText(runs: Run[]): string {
  return runs.map((r) => r.text).join('');
}

/** Every line of visible text in the document, in order (used by lint and by tests). */
export function docLines(doc: CvDoc): string[] {
  const lines = [doc.name];
  const add = (b: Block) => {
    if (b.kind === 'bullets') b.items.forEach((i) => lines.push(plainText(i)));
    else lines.push(plainText(b.runs));
  };
  doc.preamble.forEach(add);
  for (const s of doc.sections) {
    lines.push(s.title);
    s.blocks.forEach(add);
  }
  return lines.filter(Boolean);
}
