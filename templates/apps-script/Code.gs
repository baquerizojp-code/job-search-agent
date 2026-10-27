/**
 * @OnlyCurrentDoc
 *
 * Job Search tracker: bound Apps Script web app.
 *
 * The jobsearch engine talks to this script over HTTPS so it can read and
 * write the tracker Sheet without Google OAuth credentials on your machine.
 * The script only ever touches the spreadsheet it is bound to.
 *
 * DEPLOY STEPS
 * 1. Open the tracker Sheet (your copy of the template) and go to
 *    Extensions > Apps Script. Replace the contents of Code.gs with this file
 *    and save.
 * 2. Project Settings (gear icon) > Script properties > Add script property:
 *    Property: JOBSEARCH_SECRET   Value: a long random string (24+ chars).
 * 3. Deploy > New deployment > Select type: Web app.
 *    Description: jobsearch. Execute as: Me. Who has access: Anyone.
 *    Click Deploy, authorize the script for this spreadsheet, then copy the
 *    Web app URL (it ends in /exec).
 * 4. Run `jobsearch sheet setup` and paste the /exec URL and the secret.
 *    It calls the `setup` action, which creates the Jobs and Skipped tabs.
 * 5. Browser check: open <exec URL>?action=ping&secret=<your secret>.
 *
 * GOTCHA: after editing this code you must publish a new version
 * (Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy)
 * or the /exec URL keeps serving the old code.
 *
 * PROTOCOL
 * POST body (text/plain, JSON): { "secret": "...", "action": "...", ...params }
 * Every response: { "ok": true, "data": ... } or { "ok": false, "error": "..." }
 * Actions: ping | setup | append | list | update-status
 */

// Must match SHEET_HEADERS in packages/engine/src/schema/sheet.ts.
var HEADERS = [
  'Date', 'Source', 'Company', 'Role', 'Location', 'Link', 'Score', 'Verdict',
  'Match Summary', 'Red Flags', 'Status', 'Status Updated', 'Notes', 'Job ID',
];

var STATUSES = ['New', 'Preparing', 'Applied', 'Interview', 'Offer', 'Rejected', 'Closed'];
var TABS = ['Jobs', 'Skipped'];

// Column widths in pixels, same order as HEADERS.
var COLUMN_WIDTHS = [95, 90, 160, 220, 140, 220, 60, 80, 320, 220, 100, 110, 220, 110];

var LOCK_TIMEOUT_MS = 30000;

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '{}');
  } catch (err) {
    return respond({ ok: false, error: 'Invalid JSON body' });
  }
  return respond(handle(body));
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'ping') {
    return respond(handle({ action: 'ping', secret: p.secret }));
  }
  return ContentService
    .createTextOutput('jobsearch tracker web app. POST JSON {secret, action, ...} ' +
      'with action one of: ping, setup, append, list, update-status. ' +
      'Browser check: ?action=ping&secret=...')
    .setMimeType(ContentService.MimeType.TEXT);
}

function respond(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function handle(body) {
  try {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object' };
    if (!checkSecret(body.secret)) return { ok: false, error: 'Unauthorized: bad or missing secret' };
    switch (body.action) {
      case 'ping': return { ok: true, data: actionPing() };
      case 'setup': return { ok: true, data: withLock(actionSetup) };
      case 'append': return { ok: true, data: withLock(function () { return actionAppend(body); }) };
      case 'list': return { ok: true, data: actionList(body) };
      case 'update-status': return { ok: true, data: withLock(function () { return actionUpdateStatus(body); }) };
      default: return { ok: false, error: 'Unknown action: ' + String(body.action) };
    }
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function checkSecret(given) {
  var expected = PropertiesService.getScriptProperties().getProperty('JOBSEARCH_SECRET');
  return typeof expected === 'string' && expected.length > 0 &&
    typeof given === 'string' && given === expected;
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function actionPing() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = ss.getSheets().map(function (s) { return s.getName(); });
  var headers = {};
  TABS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    headers[name] = sheet ? headersMatch(readHeaders(sheet)) : false;
  });
  return { spreadsheet: ss.getName(), tabs: tabs, headers: headers, headersExpected: HEADERS };
}

function actionSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var created = [];
  TABS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      created.push(name);
    }
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    for (var i = 0; i < COLUMN_WIDTHS.length; i++) sheet.setColumnWidth(i + 1, COLUMN_WIDTHS[i]);
    // Keep Link and Job ID as plain text so Sheets does not reformat them.
    var textCols = [HEADERS.indexOf('Link') + 1, HEADERS.indexOf('Job ID') + 1];
    textCols.forEach(function (c) { sheet.getRange(2, c, sheet.getMaxRows() - 1, 1).setNumberFormat('@'); });
  });
  var jobs = ss.getSheetByName('Jobs');
  var statusCol = HEADERS.indexOf('Status') + 1;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUSES, true)
    .setAllowInvalid(true)
    .build();
  jobs.getRange(2, statusCol, jobs.getMaxRows() - 1, 1).setDataValidation(rule);
  return { created: created, tabs: TABS, headers: HEADERS };
}

function actionAppend(body) {
  var sheet = requireTab(body.tab);
  var rows = body.rows;
  if (!Array.isArray(rows)) throw new Error('append: rows must be an array of arrays');
  if (rows.length === 0) return { appended: 0 };
  var cols = HEADERS.length;
  var values = rows.map(function (r) {
    if (!Array.isArray(r)) throw new Error('append: each row must be an array');
    var out = [];
    for (var i = 0; i < cols; i++) out.push(i < r.length && r[i] != null ? r[i] : '');
    return out;
  });
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    sheet.getRange(1, 1, 1, cols).setValues([HEADERS]);
    lastRow = 1;
  }
  sheet.getRange(lastRow + 1, 1, values.length, cols).setValues(values);
  return { appended: values.length };
}

function actionList(body) {
  var sheet = requireTab(body.tab);
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var lastRow = sheet.getLastRow();
  var headers = lastRow >= 1 ? readHeaders(sheet) : HEADERS.slice();
  var cols = Math.max(headers.length, 1);
  var rows = [];
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, cols).getValues();
    rows = values
      .map(function (r) { return r.map(function (v) { return serialize(v, tz); }); })
      .filter(function (r) { return r.some(function (v) { return v !== ''; }); });
  }
  var since = typeof body.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? body.since : null;
  if (since) {
    var dateIdx = headers.indexOf('Date');
    if (dateIdx >= 0) rows = rows.filter(function (r) { return String(r[dateIdx]) >= since; });
  }
  return { headers: headers, rows: rows };
}

function actionUpdateStatus(body) {
  var jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
  var status = typeof body.status === 'string' ? body.status.trim() : '';
  var note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!jobId) throw new Error('update-status: jobId is required');
  if (STATUSES.indexOf(status) < 0) throw new Error('update-status: status must be one of ' + STATUSES.join(', '));

  var sheet = requireTab('Jobs');
  var headers = readHeaders(sheet);
  var idCol = headers.indexOf('Job ID') + 1;
  var statusCol = headers.indexOf('Status') + 1;
  var updatedCol = headers.indexOf('Status Updated') + 1;
  var notesCol = headers.indexOf('Notes') + 1;
  if (!idCol || !statusCol || !updatedCol || !notesCol) throw new Error('Jobs tab is missing expected columns; run setup');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { updated: false };
  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  var rowIndex = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === jobId) { rowIndex = i + 2; break; }
  }
  if (rowIndex < 0) return { updated: false };

  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  sheet.getRange(rowIndex, statusCol).setValue(status);
  sheet.getRange(rowIndex, updatedCol).setValue(today);
  if (note) {
    var cell = sheet.getRange(rowIndex, notesCol);
    var existing = String(cell.getValue() || '').trim();
    cell.setValue(existing ? existing + '\n' + today + ': ' + note : today + ': ' + note);
  }
  return { updated: true, row: rowIndex };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireTab(name) {
  if (TABS.indexOf(name) < 0) throw new Error('tab must be one of ' + TABS.join(', '));
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Tab "' + name + '" not found; run setup');
  return sheet;
}

function readHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (v) { return String(v).trim(); });
}

function headersMatch(actual) {
  if (actual.length < HEADERS.length) return false;
  for (var i = 0; i < HEADERS.length; i++) if (actual[i] !== HEADERS[i]) return false;
  return true;
}

function serialize(v, tz) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return v;
}
