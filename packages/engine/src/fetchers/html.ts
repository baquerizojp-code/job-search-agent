import { convert } from 'html-to-text';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
};

/** Decode numeric and common named HTML entities. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/** Collapse runs of blank lines and horizontal whitespace; trim. */
export function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface HtmlToTextOptions {
  maxChars?: number;
}

/**
 * HTML to readable plain text: images dropped, links reduced to their text,
 * whitespace collapsed. When maxChars is given the result is truncated at a
 * word boundary.
 */
export function htmlToText(html: string, opts: HtmlToTextOptions = {}): string {
  const raw = convert(html, {
    wordwrap: false,
    preserveNewlines: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'noscript', format: 'skip' },
      { selector: 'h1', options: { uppercase: false } },
      { selector: 'h2', options: { uppercase: false } },
      { selector: 'h3', options: { uppercase: false } },
      { selector: 'h4', options: { uppercase: false } },
      { selector: 'h5', options: { uppercase: false } },
      { selector: 'h6', options: { uppercase: false } },
      { selector: 'table', format: 'dataTable' },
    ],
  });
  const text = collapseWhitespace(decodeEntities(raw));
  return opts.maxChars !== undefined ? truncate(text, opts.maxChars).text : text;
}

export interface ElementQuery {
  /** Tag name to match (case-insensitive); any tag when omitted. */
  tag?: string;
  /** A single class token that must appear in the element's class attribute. */
  classToken?: string;
}

const VOID_TAGS = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'wbr', 'area', 'base', 'col', 'embed', 'param', 'track']);

function classTokens(attrs: string): string[] {
  const m = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  const value = m?.[1] ?? m?.[2] ?? m?.[3] ?? '';
  return value.split(/\s+/).filter(Boolean);
}

/**
 * innerHTML of the first element matching the query, found with a tag
 * scanner that balances nested same-name tags. Good enough for the small,
 * well-formed fragments LinkedIn serves; not a general HTML parser.
 */
export function innerHtmlOf(html: string, query: ElementQuery): string | undefined {
  const wantTag = query.tag?.toLowerCase();
  const tagRe = /<\/?([a-zA-Z][\w:-]*)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0].startsWith('</')) continue;
    const name = m[1]!.toLowerCase();
    const attrs = m[2] ?? '';
    if (wantTag && name !== wantTag) continue;
    if (query.classToken && !classTokens(attrs).includes(query.classToken)) continue;
    if (VOID_TAGS.has(name) || attrs.trimEnd().endsWith('/')) return '';
    const start = tagRe.lastIndex;
    let depth = 1;
    const walker = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
    walker.lastIndex = start;
    let w: RegExpExecArray | null;
    while ((w = walker.exec(html)) !== null) {
      if (w[1] === '/') depth--;
      else if (!w[0].endsWith('/>')) depth++;
      if (depth === 0) return html.slice(start, w.index);
    }
    return html.slice(start);
  }
  return undefined;
}

/** Plain text of the first matching element (entities decoded, whitespace collapsed). */
export function textOf(html: string, query: ElementQuery): string | undefined {
  const inner = innerHtmlOf(html, query);
  if (inner === undefined) return undefined;
  const text = collapseWhitespace(decodeEntities(inner.replace(/<[^>]+>/g, ' ')));
  return text || undefined;
}

export interface Truncated {
  text: string;
  truncated: boolean;
}

/** Cut text to at most `max` characters, preferring a word boundary. */
export function truncate(text: string, max: number): Truncated {
  if (max <= 0) return { text: '', truncated: text.length > 0 };
  if (text.length <= max) return { text, truncated: false };
  const head = text.slice(0, max);
  const lastSpace = Math.max(head.lastIndexOf(' '), head.lastIndexOf('\n'));
  // Back off to the last whitespace unless it would throw away most of the budget.
  const cut = lastSpace >= Math.floor(max * 0.6) ? head.slice(0, lastSpace) : head;
  return { text: cut.trimEnd(), truncated: true };
}
