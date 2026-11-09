import fs from 'node:fs';
import path from 'node:path';
import { convert } from 'html-to-text';

/** File formats `cv import` understands. */
export type CvFormat = 'markdown' | 'text' | 'docx' | 'pdf';

/** Below this many characters a PDF is almost certainly a scan (images, no text layer). */
const MIN_PDF_TEXT = 200;

export function detectFormat(file: string): CvFormat {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.txt') return 'text';
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.doc') throw new Error('Old .doc files are not supported. Save the CV as .docx or PDF and try again.');
  throw new Error(`Unsupported CV format "${ext || 'no extension'}". Use PDF, Word (.docx), Markdown or plain text.`);
}

/** Plain text of every page of a PDF, pages separated by a blank line. */
export async function pdfText(data: Uint8Array): Promise<{ text: string; pages: number }> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(data);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  return { text: text.join('\n\n').replace(/[ \t]+\n/g, '\n').trim(), pages: totalPages };
}

/**
 * Read a CV in any supported format and return readable text that keeps the
 * headings and bullets. The agent rewrites it into cv/cv.md, so this only has
 * to be faithful, not pretty.
 */
export async function importCv(file: string): Promise<{ text: string; format: CvFormat; warnings: string[] }> {
  if (!fs.existsSync(file)) throw new Error(`CV not found: ${file}`);
  const format = detectFormat(file);
  const warnings: string[] = [];

  if (format === 'markdown' || format === 'text') {
    return { text: fs.readFileSync(file, 'utf8').trim(), format, warnings };
  }

  if (format === 'docx') {
    const mammoth = await import('mammoth');
    const { value: html, messages } = await mammoth.convertToHtml(
      { path: file },
      { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => p:fresh"] },
    );
    // Unknown paragraph styles still convert as plain paragraphs; only real problems are worth reporting.
    for (const m of messages) if (m.type === 'warning' && !/^Unrecognised (paragraph|run) style/.test(m.message)) warnings.push(m.message);
    const text = convert(html, {
      wordwrap: false,
      selectors: [
        { selector: 'h1', format: 'heading', options: { uppercase: false, leadingLineBreaks: 2, trailingLineBreaks: 1 } },
        { selector: 'h2', format: 'heading', options: { uppercase: false, leadingLineBreaks: 2, trailingLineBreaks: 1 } },
        { selector: 'h3', format: 'heading', options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'ul', options: { itemPrefix: '- ' } },
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'table', format: 'dataTable' },
      ],
    });
    if (/<table/i.test(html)) warnings.push('The CV uses tables; their text was kept, but check the order of what came out of them.');
    return { text: text.trim(), format, warnings };
  }

  const { text, pages } = await pdfText(new Uint8Array(fs.readFileSync(file)));
  if (text.replace(/\s/g, '').length < MIN_PDF_TEXT) {
    throw new Error('This PDF has almost no text layer (probably a scan). Read it with your own file or image tools, or ask the user for a Word or text version.');
  }
  if (pages > 3) warnings.push(`The PDF has ${pages} pages; expect to cut it down to two.`);
  return { text, format, warnings };
}

/** Render an HTML document to PDF with Playwright's Chromium (already required for job pages). */
export async function htmlToPdf(html: string, out: string, paper: 'letter' | 'a4'): Promise<void> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: out, format: paper === 'a4' ? 'A4' : 'Letter', printBackground: false, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
