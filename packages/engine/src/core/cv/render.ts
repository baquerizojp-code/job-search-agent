import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { Block, CvDoc, Run } from './parse.js';

/**
 * Single-column renderers for a parsed CV. Both outputs keep real text and
 * real heading styles (no tables, columns, text boxes or images) so an ATS
 * can parse them.
 */

const FONT = 'Calibri';

// ---------- docx ----------

function docxRuns(runs: Run[]): TextRun[] {
  return runs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic }));
}

function docxBlocks(blocks: Block[], centered = false): Paragraph[] {
  const out: Paragraph[] = [];
  for (const b of blocks) {
    if (b.kind === 'subheading') {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: docxRuns(b.runs), spacing: { before: 160, after: 40 }, keepNext: true }));
    } else if (b.kind === 'paragraph') {
      out.push(new Paragraph({ children: docxRuns(b.runs), alignment: centered ? AlignmentType.CENTER : undefined, spacing: { after: 60 } }));
    } else {
      for (const item of b.items) out.push(new Paragraph({ children: docxRuns(item), bullet: { level: 0 }, spacing: { after: 40 } }));
    }
  }
  return out;
}

export async function renderDocx(doc: CvDoc): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: doc.name })] }),
    ...docxBlocks(doc.preamble, true),
  ];
  for (const s of doc.sections) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: s.title })],
      spacing: { before: 240, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 2 } },
      keepNext: true,
    }));
    children.push(...docxBlocks(s.blocks));
  }

  const document = new Document({
    creator: doc.name,
    title: `${doc.name} CV`,
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } }, // 10.5pt
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 36, bold: true }, paragraph: { spacing: { after: 80 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, allCaps: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 22, bold: true } },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 864, bottom: 864, left: 936, right: 936 } } }, children }],
  });
  return Packer.toBuffer(document);
}

// ---------- HTML (source for the PDF) ----------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function htmlRuns(runs: Run[]): string {
  return runs.map((r) => {
    let t = esc(r.text);
    if (r.italic) t = `<em>${t}</em>`;
    if (r.bold) t = `<strong>${t}</strong>`;
    return t;
  }).join('');
}

function htmlBlocks(blocks: Block[]): string {
  return blocks.map((b) => {
    if (b.kind === 'subheading') return `<h3>${htmlRuns(b.runs)}</h3>`;
    if (b.kind === 'paragraph') return `<p>${htmlRuns(b.runs)}</p>`;
    return `<ul>${b.items.map((i) => `<li>${htmlRuns(i)}</li>`).join('')}</ul>`;
  }).join('\n');
}

export function renderHtml(doc: CvDoc, lang = 'en'): string {
  const sections = doc.sections.map((s) => `<section>\n<h2>${esc(s.title)}</h2>\n${htmlBlocks(s.blocks)}\n</section>`).join('\n');
  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><title>${esc(doc.name)} CV</title>
<style>
  @page { margin: 0.6in 0.65in; }
  body { font-family: ${FONT}, Carlito, Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.3; color: #111; margin: 0; }
  h1 { font-size: 18pt; text-align: center; margin: 0 0 4pt; }
  header p { text-align: center; margin: 0 0 2pt; }
  /* No text-transform: Chromium bakes it into the PDF text layer, and ATS parsers should read "Experience", not "EXPERIENCE". */
  h2 { font-size: 12pt; letter-spacing: 0.02em; border-bottom: 0.75pt solid #999; padding-bottom: 2pt; margin: 12pt 0 5pt; break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 8pt 0 1pt; break-after: avoid; }
  p { margin: 0 0 3pt; }
  ul { margin: 2pt 0 4pt; padding-left: 14pt; }
  li { margin: 0 0 2pt; }
</style></head>
<body>
<header>
<h1>${esc(doc.name)}</h1>
${htmlBlocks(doc.preamble)}
</header>
${sections}
</body></html>
`;
}
