import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { emit } from './context.js';
import { resolveWorkspace } from '../core/paths.js';
import { readJsonIfExists, writeText } from '../core/fsutil.js';
import { configPath } from '../core/config.js';
import { importCv, htmlToPdf, pdfText } from '../core/cv/io.js';
import { parseCv } from '../core/cv/parse.js';
import { lintCv } from '../core/cv/lint.js';
import { renderDocx, renderHtml } from '../core/cv/render.js';

/** Copy a CV in any supported format into <workspace>/cv/source.md. Shared with `init --cv`. */
export async function importCvIntoWorkspace(workspace: string, file: string) {
  const { text, format, warnings } = await importCv(path.resolve(file));
  const source = path.join(workspace, 'cv', 'source.md');
  writeText(source, text + '\n');
  return { source, format, chars: text.length, words: text.split(/\s+/).filter(Boolean).length, warnings };
}

function workspaceOf(cmd: Command): string {
  return resolveWorkspace(cmd.optsWithGlobals().workspace as string | undefined);
}

export function registerCv(program: Command): void {
  const cv = program.command('cv').description('Import, check and build the CV (Markdown to Word and PDF)');

  cv.command('import <file>')
    .description('Read a CV (PDF, .docx, Markdown or text) and save its text as cv/source.md')
    .action(async (file: string, _opts: unknown, cmd: Command) => {
      const result = await importCvIntoWorkspace(workspaceOf(cmd), file);
      emit({ ok: true, ...result });
    });

  cv.command('lint')
    .description('Check a CV in Markdown against the ATS rules (default: cv/cv.md)')
    .option('-i, --input <file>', 'Markdown CV to check')
    .action((opts: { input?: string }, cmd: Command) => {
      const input = path.resolve(opts.input ?? path.join(workspaceOf(cmd), 'cv', 'cv.md'));
      if (!fs.existsSync(input)) throw new Error(`No CV at ${input}. Write it first (see references/cv-ats-guide.md).`);
      const md = fs.readFileSync(input, 'utf8');
      const result = lintCv(md, parseCv(md));
      emit({ input, ...result });
      if (!result.ok) process.exitCode = 2;
    });

  cv.command('build')
    .description('Lint, then render the Markdown CV to .docx and .pdf next to it (or into --out)')
    .option('-i, --input <file>', 'Markdown CV to build (default: cv/cv.md)')
    .option('-o, --out <dir>', 'output folder (default: the input folder)')
    .option('--paper <size>', 'letter or a4 (default: a4 when the workspace time zone is outside the Americas)')
    .option('--no-pdf', 'only build the .docx (no Chromium needed)')
    .action(async (opts: { input?: string; out?: string; paper?: string; pdf: boolean }, cmd: Command) => {
      const workspace = workspaceOf(cmd);
      const input = path.resolve(opts.input ?? path.join(workspace, 'cv', 'cv.md'));
      if (!fs.existsSync(input)) throw new Error(`No CV at ${input}. Write it first (see references/cv-ats-guide.md).`);
      const md = fs.readFileSync(input, 'utf8');
      const doc = parseCv(md);
      const lint = lintCv(md, doc);
      if (!lint.ok) {
        emit({ ok: false, input, built: false, lint });
        process.exitCode = 2;
        return;
      }

      const outDir = path.resolve(opts.out ?? path.dirname(input));
      fs.mkdirSync(outDir, { recursive: true });
      const base = path.join(outDir, path.basename(input, path.extname(input)));
      const config = readJsonIfExists<{ language?: string; timezone?: string }>(configPath(workspace)) ?? {};
      const paper = opts.paper === 'a4' || opts.paper === 'letter' ? opts.paper : config.timezone?.startsWith('America/') ? 'letter' : 'a4';

      const docx = `${base}.docx`;
      fs.writeFileSync(docx, await renderDocx(doc));
      const warnings = [...lint.warnings];
      const result: Record<string, unknown> = { ok: true, input, docx, warnings, stats: lint.stats };

      if (opts.pdf) {
        const pdf = `${base}.pdf`;
        try {
          await htmlToPdf(renderHtml(doc, config.language), pdf, paper);
          const { pages } = await pdfText(new Uint8Array(fs.readFileSync(pdf)));
          Object.assign(result, { pdf, paper, pages });
          if (pages > 2) warnings.push({ rule: 'pages', message: `The PDF has ${pages} pages; aim for two at most.` });
        } catch (e) {
          Object.assign(result, { ok: false, pdfError: `${(e as Error).message.split('\n')[0]} (run \`npx playwright install chromium\`, or build with --no-pdf)` });
          process.exitCode = 1;
        }
      }
      emit(result);
    });
}
