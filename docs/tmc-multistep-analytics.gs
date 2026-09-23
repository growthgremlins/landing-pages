/**
 * TMC multi-step form analytics -> Google Sheet.
 *
 * Receives the event batches that landing-pages-TMC/tmc-MULTISTEP (index.html's
 * trk() module and thank-you.html) send with navigator.sendBeacon, and appends
 * one row per event to the "Events" tab. The Funnel, Sessions and
 * "Drop-off & Entry" tabs are live formulas over Events.
 *
 * Nothing the visitor types is ever sent here - only which buttons they press,
 * which fields they touch and how far they get. A row joins to its GHL lead via
 * session_id (MS Session ID) or transaction_id (MS Transaction ID).
 *
 * SETUP (once):
 *   1. Open the Sheet > Extensions > Apps Script. Replace everything in Code.gs
 *      with this file. Save.
 *   2. Pick `setup` in the function dropdown > Run. Approve the permissions
 *      prompt (it only touches this spreadsheet).
 *   3. Deploy > New deployment > type "Web app".
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      Deploy, and copy the Web app URL (ends in /exec).
 *   4. That URL goes into ANALYTICS_URL in both index.html and thank-you.html.
 *
 * Changing this script later: Deploy > Manage deployments > edit (pencil) >
 * Version: New version. That keeps the same /exec URL, so the page needs no
 * change.
 */

var EVENTS_TAB = 'Events';

var HEADERS = [
  'received_at', 'client_ts', 'session_id', 'event', 'step', 'target', 'detail',
  'entry_point', 'max_step', 'seconds_on_page', 'device', 'viewport_w', 'gclid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'loc',
  'referrer', 'landing_url', 'transaction_id'
];

// Anything else is dropped, so a stray or hostile POST can't invent rows.
var ALLOWED = {
  page_view: 1, click: 1, scroll_depth: 1, form_view: 1, form_start: 1,
  step_view: 1, choice: 1, condition_toggle: 1, field_focus: 1, field_filled: 1,
  validation_error: 1, back: 1, submit_attempt: 1, submit_success: 1,
  submit_error: 1, bot_blocked: 1, thank_you_view: 1, session_end: 1
};

var MAX_EVENTS_PER_POST = 50;

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ctx = data.ctx || {};
    var events = (data.events || []).slice(0, MAX_EVENTS_PER_POST);
    var now = new Date();
    var rows = [];

    events.forEach(function (x) {
      if (!x || !ALLOWED[x.e]) return;
      rows.push([
        now, text(x.ts), text(ctx.session_id), x.e, num(x.step), text(x.target),
        text(x.detail), text(x.entry), num(x.max_step), num(x.secs), text(ctx.device),
        num(ctx.viewport_w), text(ctx.gclid), text(ctx.utm_source), text(ctx.utm_medium),
        text(ctx.utm_campaign), text(ctx.utm_term), text(ctx.utm_content), text(ctx.loc),
        text(ctx.referrer), text(ctx.landing_url), text(x.tid)
      ]);
    });

    if (rows.length) {
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        var sh = eventsSheet();
        sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
      } finally {
        lock.releaseLock();
      }
    }
  } catch (err) {
    console.error(err);
  }
  // sendBeacon never reads this; it is here for a manual test.
  return ContentService.createTextOutput('ok');
}

// Visiting the /exec URL in a browser should show "ok" - a quick live check.
function doGet() {
  return ContentService.createTextOutput('ok');
}

// Strings are capped, and anything that starts like a formula is escaped, so
// a crafted value can never execute in the Sheet.
function text(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function num(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(v);
  return isFinite(n) ? n : text(v);
}

function eventsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(EVENTS_TAB);
  if (!sh) {
    // The Sheet was created from a CSV, so its only tab carries the file's
    // name. Adopt it as Events.
    sh = ss.getSheets()[0];
    sh.setName(EVENTS_TAB);
  }
  return sh;
}

/**
 * Run once from the editor. Safe to re-run: it rebuilds the three report tabs
 * and never touches the Events rows.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ev = eventsSheet();
  ev.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  ev.setFrozenRows(1);

  buildSessions(ss);
  buildFunnel(ss);
  buildDropoff(ss);
  ss.setActiveSheet(ss.getSheetByName('Funnel'));
}

function freshTab(ss, name) {
  var sh = ss.getSheetByName(name);
  if (sh) sh.clear(); else sh = ss.insertSheet(name);
  return sh;
}

// Column letters in Events: C session_id, D event, E step, F target, G detail,
// H entry_point, J seconds_on_page, K device, M gclid.

// One row per session that STARTED the form - the base for drop-off analysis.
function buildSessions(ss) {
  var sh = freshTab(ss, 'Sessions');
  sh.getRange('A1:J1').setValues([[
    'session_id', 'entry_point', 'max_step', 'submitted', 'last_field', 'device',
    'secs_in_form', 'validation_errors', 'backs', 'gclid'
  ]]).setFontWeight('bold');
  sh.setFrozenRows(1);
  // FILTER, not XLOOKUP over a concatenated key: inside BYROW/LAMBDA the
  // concatenated range is not evaluated as an array and every row gave #N/A.
  sh.getRange('A2').setFormula('=IFERROR(UNIQUE(FILTER(Events!C2:C, Events!D2:D="form_start")),)');
  sh.getRange('B2').setFormula('=BYROW(A2:A, LAMBDA(s, IF(s="",, IFERROR(INDEX(FILTER(Events!H2:H, Events!C2:C=s, Events!D2:D="form_start"), 1), ""))))');
  sh.getRange('C2').setFormula('=BYROW(A2:A, LAMBDA(s, IF(s="",, MAX(1, MAXIFS(Events!E2:E, Events!C2:C, s, Events!D2:D, "step_view")))))');
  sh.getRange('D2').setFormula('=BYROW(A2:A, LAMBDA(s, IF(s="",, IF(COUNTIFS(Events!C2:C, s, Events!D2:D, "submit_success")>0, 1, 0))))');
  // Last field touched = the latest field_focus or field_filled row.
  sh.getRange('E2').setFormula('=BYROW(A2:A, LAMBDA(s, IF(s="",, IFERROR(CHOOSEROWS(FILTER(Events!F2:F, Events!C2:C=s, (Events!D2:D="field_focus")+(Events!D2:D="field_filled")), -1), "(none)"))))');
  sh.getRange('F2').setFormula('=BYROW(A2:A, LAMBDA(s, IF(s="",, XLOOKUP(s, Events!C2:C, Events!K2:K, ""))))');
  sh.getRange('G2').setFormula('=BYROW(A2:A, LAMBDA(s, IF(s="",, MAXIFS(Events!J2:J, Events!C2:C, s) - IFERROR(INDEX(FILTER(Events!J2:J, Events!C2:C=s, Events!D2:D="form_start"), 1), 0))))');
  sh.getRange('H2').setFormula('=BYROW(A2:A, LAMBDA(s, IF(s="",, COUNTIFS(Events!C2:C, s, Events!D2:D, "validation_error"))))');
  sh.getRange('I2').setFormula('=BYROW(A2:A, LAMBDA(s, IF(s="",, COUNTIFS(Events!C2:C, s, Events!D2:D, "back"))))');
  sh.getRange('J2').setFormula('=BYROW(A2:A, LAMBDA(s, IF(s="",, XLOOKUP(s, Events!C2:C, Events!M2:M, ""))))');
}

// Unique sessions through each gate, overall and by device.
function buildFunnel(ss) {
  var sh = freshTab(ss, 'Funnel');
  sh.getRange('A1:F1').setValues([[
    'Gate', 'Sessions', '% of page views', '% of previous gate', 'Mobile', 'Desktop + tablet'
  ]]).setFontWeight('bold');
  var gates = [
    ['Page view', 'page_view', ''],
    ['Saw the form', 'form_view', ''],
    ['Started the form', 'form_start', ''],
    ['Reached step 2 (Vehicle)', 'step_view', 2],
    ['Reached step 3 (Details)', 'step_view', 3],
    ['Reached step 4 (Contact)', 'step_view', 4],
    ['Pressed Get My Quote', 'submit_attempt', ''],
    ['Submitted', 'submit_success', ''],
    ['Saw thank-you page', 'thank_you_view', '']
  ];
  gates.forEach(function (g, i) {
    var r = i + 2;
    var crit = 'Events!D2:D, "' + g[1] + '"' + (g[2] ? ', Events!E2:E, ' + g[2] : '');
    sh.getRange(r, 1).setValue(g[0]);
    sh.getRange(r, 2).setFormula('=COUNTUNIQUEIFS(Events!C2:C, ' + crit + ')');
    sh.getRange(r, 3).setFormula('=IFERROR(B' + r + '/$B$2, 0)');
    sh.getRange(r, 4).setFormula(r === 2 ? '=1' : '=IFERROR(B' + r + '/B' + (r - 1) + ', 0)');
    sh.getRange(r, 5).setFormula('=COUNTUNIQUEIFS(Events!C2:C, ' + crit + ', Events!K2:K, "mobile")');
    sh.getRange(r, 6).setFormula('=COUNTUNIQUEIFS(Events!C2:C, ' + crit + ', Events!K2:K, "<>mobile")');
  });
  sh.getRange('C2:D10').setNumberFormat('0.0%');
  sh.autoResizeColumns(1, 6);
}

// Where starters stop, what they touched last, which entry converts, what gets
// pressed, and which errors fire.
function buildDropoff(ss) {
  var sh = freshTab(ss, 'Drop-off & Entry');
  var blocks = [
    ['A1', 'Form starters who did NOT submit: last step reached',
     '=QUERY(Sessions!A2:J, "select C, count(A) where A is not null and D = 0 group by C label C \'Last step\', count(A) \'Sessions\'", 0)'],
    ['D1', 'Non-submitters: last field touched',
     '=QUERY(Sessions!A2:J, "select E, count(A) where A is not null and D = 0 group by E order by count(A) desc label E \'Last field\', count(A) \'Sessions\'", 0)'],
    ['G1', 'Entry point: started vs submitted',
     '=QUERY(Sessions!A2:J, "select B, count(A), sum(D) where A is not null group by B order by count(A) desc label B \'Entry point\', count(A) \'Started\', sum(D) \'Submitted\'", 0)'],
    ['K1', 'What people press (top 50)',
     '=QUERY(Events!A2:V, "select F, count(C) where D = \'click\' group by F order by count(C) desc limit 50 label F \'Pressed\', count(C) \'Times\'", 0)'],
    ['N1', 'Validation errors',
     '=QUERY(Events!A2:V, "select G, count(C) where D = \'validation_error\' group by G order by count(C) desc label G \'Error\', count(C) \'Times\'", 0)'],
    ['Q1', 'Service picked (step 1)',
     '=QUERY(Events!A2:V, "select G, count(C) where D = \'choice\' group by G order by count(C) desc label G \'Service\', count(C) \'Times\'", 0)'],
    ['T1', 'Conditions ticked',
     '=QUERY(Events!A2:V, "select G, count(C) where D = \'condition_toggle\' and G ends with \':on\' group by G order by count(C) desc label G \'Condition\', count(C) \'Times\'", 0)']
  ];
  blocks.forEach(function (b) {
    var cell = sh.getRange(b[0]);
    cell.setValue(b[1]).setFontWeight('bold');
    cell.offset(1, 0).setFormula(b[2]);
  });
}
