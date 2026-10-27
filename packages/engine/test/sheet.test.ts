import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SHEET_HEADERS, type SheetRow } from '../src/schema/index.js';
import { silentLogger } from '../src/core/logger.js';
import { AppsScriptSheetProvider } from '../src/providers/sheet/apps-script.js';
import { HostConnectorSheetProvider, type SheetCommitFile } from '../src/providers/sheet/host-connector.js';
import { createSheetProvider } from '../src/providers/sheet/index.js';

const SECRET = 'test-secret-0123456789';
const JOB_ID = SHEET_HEADERS.indexOf('Job ID');

function row(over: Partial<SheetRow> = {}): SheetRow {
  return {
    date: '2026-10-27', source: 'linkedin', company: 'Acme', role: 'Staff Engineer', location: 'Remote',
    link: 'https://www.linkedin.com/jobs/view/1', score: 8, verdict: 'Apply', matchSummary: 'Good fit',
    redFlags: '', status: 'New', statusUpdated: '', notes: '', jobId: 'job-1', ...over,
  };
}

/**
 * In-memory stand-in for templates/apps-script/Code.gs. Google answers a POST
 * to /exec with a 302 to script.googleusercontent.com, which fetch follows as
 * a GET with no body, so all the work happens on the POST and the redirect
 * target only serves the stashed JSON result.
 */
function createMockAppsScript() {
  const tabs: Record<string, unknown[][]> = {};
  const results = new Map<string, unknown>();
  const seen = { postContentTypes: [] as string[], echoHits: 0 };
  let nextId = 0;

  const handle = (body: Record<string, unknown>): unknown => {
    if (body.secret !== SECRET) return { ok: false, error: 'Unauthorized: bad or missing secret' };
    switch (body.action) {
      case 'ping':
        return { ok: true, data: { spreadsheet: 'Tracker', tabs: Object.keys(tabs), headers: Object.fromEntries(Object.keys(tabs).map((t) => [t, true])) } };
      case 'setup': {
        const created: string[] = [];
        for (const t of ['Jobs', 'Skipped']) if (!tabs[t]) { tabs[t] = []; created.push(t); }
        return { ok: true, data: { created } };
      }
      case 'append': {
        const rows = body.rows as unknown[][];
        tabs[body.tab as string].push(...rows);
        return { ok: true, data: { appended: rows.length } };
      }
      case 'list':
        return { ok: true, data: { headers: [...SHEET_HEADERS], rows: tabs[body.tab as string] } };
      case 'update-status': {
        const r = tabs.Jobs.find((x) => x[JOB_ID] === body.jobId);
        if (!r) return { ok: true, data: { updated: false } };
        r[SHEET_HEADERS.indexOf('Status')] = body.status;
        r[SHEET_HEADERS.indexOf('Status Updated')] = '2026-10-27';
        if (body.note) r[SHEET_HEADERS.indexOf('Notes')] = `2026-10-27: ${String(body.note)}`;
        return { ok: true, data: { updated: true } };
      }
      default:
        return { ok: false, error: `Unknown action: ${String(body.action)}` };
    }
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/exec') {
      seen.postContentTypes.push(String(req.headers['content-type']));
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const id = String(++nextId);
        results.set(id, handle(JSON.parse(raw)));
        const { port } = server.address() as { port: number };
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/echo?id=${id}` });
        res.end();
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/echo') {
      seen.echoHits += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results.get(url.searchParams.get('id') ?? '')));
      return;
    }
    if (url.pathname === '/html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body>Sign in</body></html>');
      return;
    }
    if (url.pathname === '/hang') return; // never answers; exercises the timeout
    res.writeHead(404);
    res.end();
  });

  return { server, tabs, seen };
}

describe('AppsScriptSheetProvider', () => {
  const mock = createMockAppsScript();
  let base = '';

  beforeAll(async () => {
    await new Promise<void>((r) => mock.server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(mock.server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((r) => mock.server.close(() => r())));

  const provider = () => new AppsScriptSheetProvider({ url: `${base}/exec`, secret: SECRET, log: silentLogger });

  it('ping reports missing tabs before setup, then setup creates them', async () => {
    const p = provider();
    const before = await p.ping();
    expect(before.ok).toBe(false);
    expect(before.detail).toContain('missing tabs');

    expect(await p.setup()).toEqual({ created: ['Jobs', 'Skipped'] });
    const after = await p.ping();
    expect(after.ok).toBe(true);
    expect(after.detail).toContain('Tracker');
  });

  it('follows the 302 and posts text/plain JSON', async () => {
    await provider().ping();
    expect(mock.seen.echoHits).toBeGreaterThan(0);
    expect(mock.seen.postContentTypes.every((ct) => ct.startsWith('text/plain'))).toBe(true);
  });

  it('append, list and update-status round-trip through rowToValues/rowFromValues', async () => {
    const p = provider();
    expect(await p.appendRows('Jobs', [])).toEqual({ appended: 0, deferred: false });
    const res = await p.appendRows('Jobs', [row(), row({ jobId: 'job-2', link: 'https://www.linkedin.com/jobs/view/2', score: 5, verdict: 'Review' })]);
    expect(res).toEqual({ appended: 2, deferred: false });
    expect(mock.tabs.Jobs).toHaveLength(2);
    expect(mock.tabs.Jobs[0]).toHaveLength(SHEET_HEADERS.length);

    const listed = await p.listRows('Jobs');
    expect(listed).toHaveLength(2);
    expect(listed[0]).toMatchObject({ company: 'Acme', score: 8, verdict: 'Apply', jobId: 'job-1' });
    expect(listed[1]).toMatchObject({ score: 5, verdict: 'Review', jobId: 'job-2' });

    expect(await p.updateStatus('job-2', 'Applied', 'sent CV')).toEqual({ updated: true, deferred: false });
    expect(await p.updateStatus('nope', 'Applied')).toEqual({ updated: false, deferred: false });
    const again = await p.listRows('Jobs');
    expect(again[1]).toMatchObject({ status: 'Applied', statusUpdated: '2026-10-27', notes: '2026-10-27: sent CV' });
    expect(await p.listRows('Skipped')).toEqual([]);
  });

  it('surfaces a wrong secret as an Error', async () => {
    const bad = new AppsScriptSheetProvider({ url: `${base}/exec`, secret: 'wrong-secret-xxxxxx', log: silentLogger });
    await expect(bad.listRows('Jobs')).rejects.toThrow(/Unauthorized/);
    const ping = await bad.ping();
    expect(ping.ok).toBe(false);
    expect(ping.detail).toMatch(/Unauthorized/);
  });

  it('explains an HTML sign-in page and times out on a hanging server', async () => {
    const html = new AppsScriptSheetProvider({ url: `${base}/html`, secret: SECRET, log: silentLogger });
    await expect(html.listRows('Jobs')).rejects.toThrow(/Who has access: Anyone/);

    const hang = new AppsScriptSheetProvider({ url: `${base}/hang`, secret: SECRET, log: silentLogger, timeoutMs: 150 });
    await expect(hang.listRows('Jobs')).rejects.toThrow(/timed out after 150 ms/);
  });

  it('never leaks the url or secret through the logger', () => {
    const redacted: string[] = [];
    const log = { ...silentLogger, redact: (s: string | undefined) => { if (s) redacted.push(s); } };
    new AppsScriptSheetProvider({ url: `${base}/exec`, secret: SECRET, log });
    expect(redacted).toEqual([`${base}/exec`, SECRET]);
  });

  it('is what the factory builds from secrets', async () => {
    const p = createSheetProvider('apps-script', { log: silentLogger, url: `${base}/exec`, secret: SECRET });
    expect(p.name).toBe('apps-script');
    expect((await p.ping()).ok).toBe(true);
    expect(() => createSheetProvider('apps-script', { log: silentLogger, url: `${base}/exec` })).toThrow(/jobsearch sheet setup/);
  });
});

describe('HostConnectorSheetProvider', () => {
  let runDir = '';
  beforeEach(() => {
    runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobsearch-sheet-'));
  });
  const readCommit = () => JSON.parse(fs.readFileSync(path.join(runDir, 'commit.json'), 'utf8')) as SheetCommitFile;

  it('ping is always ok and listRows warns and returns [] without a rows file', async () => {
    const warned: string[] = [];
    const log = { ...silentLogger, warn: (m: string) => { warned.push(m); } };
    const p = new HostConnectorSheetProvider({ runDir, log });
    expect(await p.ping()).toEqual({ ok: true, detail: 'host-connector: the agent writes the Sheet' });
    expect(await p.listRows('Jobs')).toEqual([]);
    expect(warned[0]).toMatch(/no rows file/);
  });

  it('listRows accepts arrays and header-keyed objects', async () => {
    const rowsFile = path.join(runDir, 'rows.json');
    fs.writeFileSync(rowsFile, JSON.stringify({
      Jobs: [
        [...SHEET_HEADERS],
        ['2026-10-20', 'linkedin', 'Acme', 'Dev', 'Remote', 'https://x/1', 7, 'Review', '', '', 'New', '', '', 'job-1'],
        { Date: '2026-10-21', Company: 'Beta', Score: '9', Verdict: 'Apply', Link: 'https://x/2', 'Job ID': 'job-2' },
      ],
      Skipped: [{ 'Job ID': 'job-3', Link: 'https://x/3' }],
    }));
    const p = new HostConnectorSheetProvider({ runDir, rowsFile, log: silentLogger });
    const jobs = await p.listRows('Jobs');
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ company: 'Acme', score: 7, verdict: 'Review', jobId: 'job-1' });
    expect(jobs[1]).toMatchObject({ company: 'Beta', score: 9, verdict: 'Apply', jobId: 'job-2' });
    expect(await p.listRows('Skipped')).toHaveLength(1);
  });

  it('appendRows and updateStatus accumulate into commit.json, merging and deduping', async () => {
    const p = new HostConnectorSheetProvider({ runDir, log: silentLogger });
    expect(await p.appendRows('Jobs', [row(), row({ jobId: 'job-2' })])).toEqual({ appended: 2, deferred: true });
    expect(await p.appendRows('Skipped', [row({ jobId: 'job-3', verdict: 'Skip' })])).toEqual({ appended: 1, deferred: true });

    // A second provider instance (next command invocation) must merge, not overwrite.
    const p2 = new HostConnectorSheetProvider({ runDir, log: silentLogger });
    expect(await p2.appendRows('Jobs', [row({ jobId: 'job-2' }), row({ jobId: 'job-4' })])).toEqual({ appended: 1, deferred: true });
    expect(await p2.updateStatus('job-1', 'Applied', 'first')).toEqual({ updated: true, deferred: true });
    expect(await p2.updateStatus('job-1', 'Interview')).toEqual({ updated: true, deferred: true });
    expect(await p2.updateStatus('job-9', 'Closed')).toEqual({ updated: true, deferred: true });

    const commit = readCommit();
    expect(commit.headers).toEqual([...SHEET_HEADERS]);
    expect(commit.appendRows.Jobs.map((v) => v[JOB_ID])).toEqual(['job-1', 'job-2', 'job-4']);
    expect(commit.appendRows.Skipped.map((v) => v[JOB_ID])).toEqual(['job-3']);
    expect(commit.appendRows.Jobs[0]).toHaveLength(SHEET_HEADERS.length);
    expect(commit.statusUpdates).toEqual([
      { jobId: 'job-1', status: 'Interview' },
      { jobId: 'job-9', status: 'Closed' },
    ]);
    expect(fs.readdirSync(runDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('is what the factory builds from a run dir', () => {
    expect(createSheetProvider('host-connector', { log: silentLogger, runDir }).name).toBe('host-connector');
    expect(() => createSheetProvider('host-connector', { log: silentLogger })).toThrow(/run directory/);
  });
});

describe('templates/apps-script/Code.gs', () => {
  it('declares the same HEADERS as SHEET_HEADERS and the same statuses as StatusSchema', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../templates/apps-script/Code.gs'), 'utf8');
    const headers = /var HEADERS = \[([\s\S]*?)\];/.exec(src)?.[1] ?? '';
    const parsed = JSON.parse(`[${headers.replace(/'/g, '"').replace(/,\s*$/, '')}]`) as string[];
    expect(parsed).toEqual([...SHEET_HEADERS]);
    const statuses = /var STATUSES = \[([\s\S]*?)\];/.exec(src)?.[1] ?? '';
    expect(JSON.parse(`[${statuses.replace(/'/g, '"')}]`)).toEqual(['New', 'Preparing', 'Applied', 'Interview', 'Offer', 'Rejected', 'Closed']);
    expect(src.startsWith('/**\n * @OnlyCurrentDoc')).toBe(true);
  });
});
