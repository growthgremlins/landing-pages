/**
 * TMC multi-step form analytics -> Google Sheet.
 *
 * The landing page (landing-pages-TMC/tmc-MULTISTEP) sends small batches of
 * events with navigator.sendBeacon. This script:
 *   - appends every event to "Events" (raw columns + Time (ET), What happened,
 *     Who, Since landing)
 *   - keeps one row per visitor on "People" up to date: outcome, source, device,
 *     picks, friction, engagement and a plain-English Journey
 *   - "Journey" tab: pick a person from the dropdown, see their full timeline
 *   - "Funnel" and "Drop-off & Entry" summarise People, test visits excluded
 *
 * Nothing typed is ever sent, except first name + last 4 of the phone for people
 * who submit ("Rosie · 7549"). Rows join to the GHL lead by transaction id.
 *
 * SETUP / UPDATING THIS SCRIPT:
 *   1. Sheet > Extensions > Apps Script. Replace everything in Code.gs with this
 *      file. Save.
 *   2. Pick `setup` in the function dropdown > Run (approve the prompt the first
 *      time). It rebuilds People / Journey / Funnel / Drop-off from all Events,
 *      so past visits appear too. Safe to re-run any time.
 *   3. Deploy > Manage deployments > pencil (edit) > Version: New version >
 *      Deploy. The /exec URL stays the same, so the page needs no change.
 *   (First install only: Deploy > New deployment > Web app, Execute as: Me,
 *   Who has access: Anyone, and put the /exec URL in index.html and
 *   thank-you.html as ANALYTICS_URL.)
 */

var TZ = 'America/New_York';
var EVENTS_TAB = 'Events';
var PEOPLE_TAB = 'People';

var HEADERS = [
  'received_at', 'client_ts', 'session_id', 'event', 'step', 'target', 'detail',
  'entry_point', 'max_step', 'seconds_on_page', 'device', 'viewport_w', 'gclid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'loc',
  'referrer', 'landing_url', 'transaction_id', 'city', 'who',
  'Time (ET)', 'What happened', 'Since landing'
];

var PEOPLE_HEADERS = [
  'Person', 'First seen (ET)', 'Last seen (ET)', 'Who', 'Outcome', 'Came from',
  'Entered form via', 'Device', 'City', 'Time on page', 'Time in form', 'Picked',
  'Friction', 'Engagement', 'Journey', 'Session id', 'Transaction id', 'Test',
  // hidden helper columns for the summary tabs + the saved state
  'max_step', 'submitted', 'started', 'saw_form', 'day', 'last_field', 'state'
];

// Anything else is dropped, so a stray or hostile POST can't invent rows.
var ALLOWED = {
  page_view: 1, click: 1, scroll_depth: 1, form_view: 1, form_start: 1,
  step_view: 1, choice: 1, condition_toggle: 1, field_focus: 1, field_filled: 1,
  validation_error: 1, back: 1, submit_attempt: 1, submit_success: 1,
  submit_error: 1, bot_blocked: 1, thank_you_view: 1, session_end: 1
};
var MAX_EVENTS_PER_POST = 50;

// People who submitted before names were recorded, matched to GHL contacts by
// submit time (to the second).
var BACKFILL_WHO = {
  's-mugtqbto-vye6q9': 'John · 6697',
  's-muhfhjrc-a6xifx': 'Rosie · 7549'
};

// ============================================================================
// Pure helpers (no Apps Script services): translation and per-person summary.
// ============================================================================

var STEP_NAMES = { 1: 'Service', 2: 'Vehicle', 3: 'Details', 4: 'Contact' };
var PKG_NAMES = { standard: 'Standard', premium: 'Premium', elite: 'Elite' };
var FAQ_NAMES = {
  1: 'What is mobile detailing?', 2: 'How long does it take?', 3: 'What products do you use?',
  4: 'Detailing vs a car wash', 5: 'Satisfaction guarantee', 6: 'What areas do you serve?'
};
var FIELD_NAMES = { year: 'Year', make: 'Make', model: 'Model', first_name: 'First name', phone: 'Phone', message: 'Message' };
var ENTRY_NAMES = {
  hero_get_quote: 'Hero "Get a fast quote" button', hero_scroll_arrow: 'Hero scroll arrow',
  contact_get_quote: 'Contact button', contact_form: 'Contact form (bottom)',
  in_hero_desktop: 'Form in hero (desktop)', scrolled: 'Scrolled to the form'
};

function entryName(e) {
  if (!e) return '';
  var m = /^package:(\w+)/.exec(e);
  if (m) return (PKG_NAMES[m[1]] || m[1]) + ' package card';
  return ENTRY_NAMES[e] || e;
}

function clickText(t) {
  var m;
  if ((m = /^pkg:(\w+):(\w+)$/.exec(t))) {
    var name = PKG_NAMES[m[1]] || m[1];
    return { learn_more: 'Opened ' + name + ' details', request_booking: 'Tapped Request booking (' + name + ')',
             card: 'Tapped the ' + name + ' card', show_less: 'Closed ' + name + ' details' }[m[2]] || ('Tapped ' + name + ' ' + m[2]);
  }
  if ((m = /^faq:(\d+)$/.exec(t))) return 'Opened FAQ: ' + (FAQ_NAMES[m[1]] || '#' + m[1]);
  if (/^form(_bottom)?:/.test(t)) return '';               // covered by choice / step rows
  var map = {
    'header:call': 'Tapped Call (header)', 'hero:call': 'Tapped Call (hero)', 'svc_cta:call': 'Tapped Call (services)',
    'faq:call': 'Tapped Call (FAQ)', 'contact:call': 'Tapped Call (contact)', 'sticky:call': 'Tapped Call (sticky bar)',
    'hero:get_quote': 'Tapped "Get a fast quote"', 'hero:scroll_arrow': 'Tapped the scroll arrow',
    'hero:rating': 'Tapped the star rating', 'contact:get_quote': 'Tapped "Get my quote" (contact)',
    'svc_tab:interior': 'Viewed Interior services', 'svc_tab:exterior': 'Viewed Exterior services',
    'reviews:open': 'Enlarged a review', 'reviews:dot': 'Moved through reviews', 'reviews:next': 'Next review',
    'reviews:prev': 'Previous review', 'page:×': 'Closed a review', 'footer:privacy': 'Opened Privacy Policy',
    'footer:terms': 'Opened Terms', 'form:privacy': 'Opened Privacy Policy', 'form:terms': 'Opened Terms'
  };
  if (map[t]) return map[t];
  return t ? 'Tapped ' + t : '';
}

/** Plain-English line for one event, or '' for events that are just noise. */
function whatHappened(ev) {
  switch (ev.event) {
    case 'page_view': return 'Landed on the page (' + sourceOf(ev) + ')';
    case 'form_view': return 'Saw the form';
    case 'form_start': return 'Started the form via ' + entryName(ev.entry_point);
    case 'choice': return 'Picked ' + ev.detail;
    case 'step_view': return (ev.detail === 'back' ? 'Went back to step ' : 'Moved to step ') + ev.step + ' · ' + (STEP_NAMES[ev.step] || '');
    case 'condition_toggle': {
      var parts = String(ev.detail).split(':');
      return (parts[1] === 'off' ? 'Unticked ' : 'Ticked ') + parts[0];
    }
    case 'field_focus': return 'Tapped ' + (FIELD_NAMES[ev.target] || ev.target);
    case 'field_filled': return 'Filled ' + (FIELD_NAMES[ev.target] || ev.target);
    case 'validation_error': return 'Error: ' + ev.detail;
    case 'back': return '';
    case 'submit_attempt': return 'Pressed Get My Quote';
    case 'submit_success': return '✅ Submitted' + (ev.who ? ' as ' + ev.who : '');
    case 'submit_error': return '⚠ Submit failed (' + ev.detail + ')';
    case 'bot_blocked': return '🤖 Blocked as a bot';
    case 'thank_you_view': return 'Saw the thank-you page';
    case 'scroll_depth': return String(ev.detail) === '100' ? 'Scrolled to the bottom' : '';
    case 'session_end': return 'Left the page';
    case 'click': return clickText(ev.target);
  }
  return '';
}

function sourceOf(ev) {
  if (ev.gclid) return 'Google Ads';
  if (ev.utm_source) return ev.utm_source + (ev.utm_medium ? ' / ' + ev.utm_medium : '');
  var r = String(ev.referrer || '');
  if (/google\./i.test(r)) return 'Google (organic)';
  if (/facebook\.|fb\.|instagram\./i.test(r)) return 'Facebook / Instagram';
  if (/bing\./i.test(r)) return 'Bing';
  if (!r || /tmcleansedrive\.com/i.test(r)) return 'Direct';
  return r.replace(/^https?:\/\//, '').split('/')[0];
}

function deviceOf(ev) {
  // Before the fix, phones reported the 980px default layout width.
  if (String(ev.viewport_w) === '980') return 'Phone';
  return { mobile: 'Phone', tablet: 'Tablet', desktop: 'Desktop' }[ev.device] || '';
}

function isTest(ev) {
  var u = String(ev.landing_url || '');
  if (ev.session_id === 'no-session' || /^s-setup/.test(ev.session_id)) return true;
  if (/^(SHEETTEST|TEST)/i.test(ev.gclid || '') || /^(sheettest|setup-check|test)$/i.test(ev.utm_source || '')) return true;
  return !!u && !/tmcleansedrive\.com/i.test(u);
}

function mmss(sec) {
  sec = Math.max(0, Math.round(sec));
  var m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function dur(sec) {
  if (sec == null || isNaN(sec)) return '';
  sec = Math.max(0, Math.round(sec));
  var m = Math.floor(sec / 60), s = sec % 60;
  return m ? m + 'm ' + s + 's' : s + 's';
}

function newPerson(sid) {
  return { sid: sid, first: 0, last: 0, who: BACKFILL_WHO[sid] || '', tid: '', source: '', entry: '',
           device: '', city: '', maxStep: 0, submitted: false, started: false, sawForm: false, bot: false,
           formStartMs: 0, submitMs: 0, service: '', pkg: '', conds: [], errors: 0, backs: 0, reviews: 0, pkgDetails: 0,
           faqs: 0, calls: 0, lastField: '', journey: [], test: false };
}

/** Folds one event into a person's summary. `ms` is the event's client time. */
function applyEvent(p, ev, ms) {
  if (!p.first || ms < p.first) p.first = ms;
  if (ms > p.last) p.last = ms;
  if (isTest(ev)) p.test = true;
  if (!p.source && ev.event === 'page_view') p.source = sourceOf(ev);
  var dev = deviceOf(ev);
  if (dev && ev.event !== 'thank_you_view') p.device = dev;
  if (ev.city) p.city = ev.city;
  if (ev.who) p.who = ev.who;
  if (ev.transaction_id) p.tid = ev.transaction_id;
  switch (ev.event) {
    case 'form_view': p.sawForm = true; break;
    // The first start is the one that counts (someone can come back after
    // submitting and start again); nothing after a submit changes the picks.
    case 'form_start':
      p.started = true;
      if (!p.entry) p.entry = ev.entry_point;
      if (!p.formStartMs) p.formStartMs = ms;
      if (p.maxStep < 1) p.maxStep = 1;
      break;
    case 'choice': if (!p.submitted) p.service = ev.detail; break;
    case 'step_view': if (+ev.step > p.maxStep) p.maxStep = +ev.step; break;
    case 'condition_toggle': {
      if (p.submitted) break;
      var c = String(ev.detail).split(':');
      var i = p.conds.indexOf(c[0]);
      if (c[1] === 'off') { if (i > -1) p.conds.splice(i, 1); } else if (i < 0) p.conds.push(c[0]);
      break;
    }
    case 'field_focus': case 'field_filled': p.lastField = FIELD_NAMES[ev.target] || ev.target; break;
    case 'validation_error': p.errors++; break;
    case 'back': p.backs++; break;
    case 'submit_success': if (!p.submitted) p.submitMs = ms; p.submitted = true; break;
    case 'bot_blocked': p.bot = true; break;
    case 'click': {
      var t = ev.target;
      if (t === 'reviews:open') p.reviews++;
      if (/^pkg:\w+:learn_more$/.test(t)) p.pkgDetails++;
      var m = /^pkg:(\w+):request_booking$/.exec(t);
      if (m && !p.submitted) p.pkg = PKG_NAMES[m[1]] || m[1];
      if (/^faq:\d+$/.test(t)) p.faqs++;
      if (/:call$/.test(t)) p.calls++;
      break;
    }
  }
  var line = whatHappened(ev);
  if (line) {
    var prev = p.journey[p.journey.length - 1];
    // "Tapped Make ... Filled Make" reads as one step. The browser reports a
    // field as filled only once the next one is tapped, so look back 3 lines.
    if (/^Filled /.test(line)) {
      var tapped = line.replace(/^Filled /, 'Tapped ');
      for (var k = p.journey.length - 1; k >= Math.max(0, p.journey.length - 3); k--) {
        if (p.journey[k].x === tapped) { p.journey[k].x = line; return p; }
        if (p.journey[k].x === line) return p;           // already said
      }
    }
    var base = prev ? prev.x.replace(/ ×\d+$/, '') : '';
    if (prev && base === line && line !== 'Left the page') {
      var n = (/ ×(\d+)$/.exec(prev.x) || [0, 1])[1];
      prev.x = line + ' ×' + (+n + 1);                  // "Enlarged a review ×3"
    } else if (!(line === 'Left the page' && prev && prev.x === line)) {
      p.journey.push({ t: ms, x: line });
      if (p.journey.length > 150) p.journey.shift();
    }
  }
  return p;
}

function outcomeOf(p) {
  if (p.bot) return '🤖 Bot blocked';
  if (p.submitted) return '✅ Submitted';
  if (p.started) return '❌ Left at step ' + p.maxStep + ' (' + (STEP_NAMES[p.maxStep] || '') + ')';
  if (p.sawForm) return '👀 Saw the form, didn\'t start';
  return '👀 Browsed only';
}

function journeyText(p) {
  return p.journey.map(function (j) { return mmss((j.t - p.first) / 1000) + ' ' + j.x; }).join('  →  ');
}

function pickedText(p) {
  return [p.service, p.pkg ? p.pkg + ' package' : '', p.conds.join(', ')].filter(String).join(' · ');
}
function frictionText(p) {
  var a = [];
  if (p.errors) a.push(p.errors + (p.errors > 1 ? ' errors' : ' error'));
  if (p.backs) a.push(p.backs + (p.backs > 1 ? ' backs' : ' back'));
  return a.join(' · ');
}
function engagementText(p) {
  var a = [];
  if (p.reviews) a.push('Enlarged ' + p.reviews + (p.reviews > 1 ? ' reviews' : ' review'));
  if (p.pkgDetails) a.push('Opened ' + p.pkgDetails + ' package detail' + (p.pkgDetails > 1 ? 's' : ''));
  if (p.faqs) a.push(p.faqs + ' FAQ' + (p.faqs > 1 ? 's' : ''));
  if (p.calls) a.push('Tapped Call ×' + p.calls);
  return a.join(' · ');
}

/** The dropdown label: unique, readable. */
function personLabel(p, fmt) {
  var who = p.who || ((p.device || 'Unknown') + ' visitor');
  var tag = p.bot ? '🤖' : p.submitted ? '✅' : p.started ? '❌ step ' + p.maxStep : '👀';
  return who + ' — ' + fmt(p.first, 'MMM d h:mm a') + ' — ' + tag + ' [' + String(p.sid).slice(-4) + ']';
}

function personRow(p, fmt) {
  var state = JSON.stringify(p);
  return [
    personLabel(p, fmt), fmt(p.first, 'MMM d, h:mm a'), fmt(p.last, 'MMM d, h:mm a'), p.who, outcomeOf(p),
    p.source, entryName(p.entry), p.device, p.city, dur((p.last - p.first) / 1000),
    // Submitters: form start -> submit. Everyone else: form start -> last seen.
    p.formStartMs ? dur(((p.submitMs || p.last) - p.formStartMs) / 1000) : '', pickedText(p), frictionText(p), engagementText(p),
    journeyText(p), p.sid, p.tid, p.test ? 'test' : '',
    p.maxStep, p.submitted ? 1 : 0, p.started ? 1 : 0, p.sawForm ? 1 : 0, fmt(p.first, 'yyyy-MM-dd'),
    p.lastField, state
  ];
}

/** Event object from a raw Events row (array in HEADERS order). */
function rowToEvent(r) {
  var ev = {};
  for (var i = 0; i < 24; i++) ev[HEADERS[i]] = r[i] === undefined || r[i] === null ? '' : r[i];
  return ev;
}
function eventMs(ev) {
  if (ev.client_ts instanceof Date) return ev.client_ts.getTime();
  var t = Date.parse(ev.client_ts);
  if (!isNaN(t)) return t;
  return ev.received_at instanceof Date ? ev.received_at.getTime() : Date.parse(ev.received_at) || 0;
}

// ============================================================================
// Web app
// ============================================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ctx = data.ctx || {};
    var events = (data.events || []).slice(0, MAX_EVENTS_PER_POST);
    var now = new Date();
    var raw = [];
    events.forEach(function (x) {
      if (!x || !ALLOWED[x.e]) return;
      raw.push([
        now, text(x.ts), text(ctx.session_id), x.e, num(x.step), text(x.target),
        text(x.detail), text(x.entry), num(x.max_step), num(x.secs), text(ctx.device),
        num(ctx.viewport_w), text(ctx.gclid), text(ctx.utm_source), text(ctx.utm_medium),
        text(ctx.utm_campaign), text(ctx.utm_term), text(ctx.utm_content), text(ctx.loc),
        text(ctx.referrer), text(ctx.landing_url), text(x.tid), text(ctx.city), text(x.who)
      ]);
    });
    if (!raw.length) return ContentService.createTextOutput('ok');

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var people = ss.getSheetByName(PEOPLE_TAB);
      var sid = raw[0][2];
      var found = people ? findPerson(people, sid) : null;
      var p = found ? JSON.parse(found.state) : newPerson(sid);

      var rows = raw.map(function (r) {
        var ev = rowToEvent(r);
        var ms = eventMs(ev);
        applyEvent(p, ev, ms);
        return r.concat([fmt(ms, 'MMM d, h:mm:ss a'), whatHappened(ev), mmss((ms - p.first) / 1000)]);
      });
      var ev = eventsSheet();
      ev.getRange(ev.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);

      if (people) {
        var out = personRow(p, fmt);
        if (found) people.getRange(found.row, 1, 1, out.length).setValues([out]);
        else { people.insertRowBefore(2); people.getRange(2, 1, 1, out.length).setValues([out]); }
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err);
  }
  return ContentService.createTextOutput('ok');
}

// Visiting the /exec URL in a browser should show "ok" - a quick live check.
function doGet() { return ContentService.createTextOutput('ok'); }

function findPerson(sheet, sid) {
  var col = PEOPLE_HEADERS.indexOf('Session id') + 1;
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var hit = sheet.getRange(2, col, last - 1, 1).createTextFinder(sid).matchEntireCell(true).findNext();
  if (!hit) return null;
  var row = hit.getRow();
  return { row: row, state: sheet.getRange(row, PEOPLE_HEADERS.length).getValue() };
}

function fmt(ms, pattern) { return ms ? Utilities.formatDate(new Date(ms), TZ, pattern) : ''; }

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
  if (!sh) { sh = ss.getSheets()[0]; sh.setName(EVENTS_TAB); }
  return sh;
}

// ============================================================================
// Setup: run from the editor. Safe to re-run; never deletes Events.
// ============================================================================

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  var ev = eventsSheet();
  ev.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  ev.setFrozenRows(1);

  rebuildPeople();
  buildJourney(ss);
  buildFunnel(ss);
  buildDropoff(ss);
  ['Sessions'].forEach(function (n) { var s = ss.getSheetByName(n); if (s) ss.deleteSheet(s); });   // replaced by People
  ss.setActiveSheet(ss.getSheetByName(PEOPLE_TAB));
}

/** Replays every Events row: fills the plain-English columns and rebuilds People. */
function rebuildPeople() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ev = eventsSheet();
  var last = ev.getLastRow();
  var data = last > 1 ? ev.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];

  var bySid = {}, order = [];
  data.forEach(function (r) {
    var e = rowToEvent(r);
    (bySid[e.session_id] = bySid[e.session_id] || []).push({ r: r, e: e, ms: eventMs(e) });
  });
  var extra = [];
  var peopleRows = [];
  Object.keys(bySid).forEach(function (sid) {
    var list = bySid[sid].sort(function (a, b) { return a.ms - b.ms; });
    var p = newPerson(sid);
    list.forEach(function (x) {
      applyEvent(p, x.e, x.ms);
      x.out = [fmt(x.ms, 'MMM d, h:mm:ss a'), whatHappened(x.e), mmss((x.ms - p.first) / 1000)];
    });
    peopleRows.push(p);
  });
  data.forEach(function (r) {
    var e = rowToEvent(r);
    var hit = bySid[e.session_id].filter(function (x) { return x.r === r; })[0];
    extra.push(hit.out);
  });
  if (extra.length) ev.getRange(2, 25, extra.length, 3).setValues(extra);

  peopleRows.sort(function (a, b) { return b.first - a.first; });
  var sh = ss.getSheetByName(PEOPLE_TAB) || ss.insertSheet(PEOPLE_TAB, 0);
  sh.clear();
  sh.getRange(1, 1, 1, PEOPLE_HEADERS.length).setValues([PEOPLE_HEADERS]).setFontWeight('bold').setBackground('#e6f7f9');
  if (peopleRows.length) sh.getRange(2, 1, peopleRows.length, PEOPLE_HEADERS.length).setValues(peopleRows.map(function (p) { return personRow(p, fmt); }));
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  sh.hideColumns(PEOPLE_HEADERS.indexOf('max_step') + 1, 7);
  sh.setColumnWidth(1, 330);
  sh.setColumnWidths(2, 3, 130);
  sh.setColumnWidth(5, 190);
  sh.setColumnWidth(15, 900);
  sh.getRange('O:O').setWrap(true);
  // Grey out test visits.
  var rules = [SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$R2="test"').setFontColor('#9ca3af').setRanges([sh.getRange('A2:R')]).build()];
  sh.setConditionalFormatRules(rules);
}

function freshTab(ss, name) {
  var sh = ss.getSheetByName(name);
  if (sh) sh.clear(); else sh = ss.insertSheet(name);
  return sh;
}

// People helper columns: S max_step, T submitted, U started, V saw_form, W day, X last_field.
function buildJourney(ss) {
  var sh = freshTab(ss, 'Journey');
  sh.getRange('A1').setValue('Person:').setFontWeight('bold');
  sh.getRange('B1').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName(PEOPLE_TAB).getRange('A2:A'), true).build());
  sh.getRange('B1').setValue(ss.getSheetByName(PEOPLE_TAB).getRange('A2').getValue()).setFontWeight('bold').setBackground('#fff8dc');
  sh.getRange('A3:D3').setValues([['Summary', '', '', '']]).setFontWeight('bold');
  sh.getRange('A4').setFormula('=IF($B$1="",,TRANSPOSE(FILTER(People!B1:N1, People!B1:N1<>"")))');
  sh.getRange('B4').setFormula('=IF($B$1="",,TRANSPOSE(INDEX(People!B2:N, MATCH($B$1, People!A2:A, 0))))');
  sh.getRange('A19:C19').setValues([['Since landing', 'What happened', 'Time (ET)']]).setFontWeight('bold').setBackground('#e6f7f9');
  sh.getRange('A20').setFormula(
    // Events are appended in time order, so no SORT (the mm:ss text would sort wrong).
    '=IF($B$1="",,IFERROR(FILTER({Events!AA2:AA, Events!Z2:Z, Events!Y2:Y}, ' +
    'Events!C2:C=INDEX(People!P2:P, MATCH($B$1, People!A2:A, 0)), Events!Z2:Z<>""), "No events yet"))');
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 520);
  sh.setColumnWidth(3, 170);
}

function buildFunnel(ss) {
  var sh = freshTab(ss, 'Funnel');
  sh.getRange('A1:F1').setValues([['Real visitors (tests excluded)', 'All', 'Phone', 'Tablet', 'Desktop', '% of visitors']]).setFontWeight('bold');
  var gates = [
    ['Visitors', ''], ['Saw the form', ',People!V2:V,1'], ['Started the form', ',People!U2:U,1'],
    ['Reached step 2 · Vehicle', ',People!U2:U,1,People!S2:S,">=2"'], ['Reached step 3 · Details', ',People!U2:U,1,People!S2:S,">=3"'],
    ['Reached step 4 · Contact', ',People!U2:U,1,People!S2:S,">=4"'], ['Submitted', ',People!T2:T,1']
  ];
  gates.forEach(function (g, i) {
    var r = i + 2, base = 'People!R2:R,"<>test",People!P2:P,"<>"' + g[1];
    sh.getRange(r, 1).setValue(g[0]);
    sh.getRange(r, 2).setFormula('=COUNTIFS(' + base + ')');
    sh.getRange(r, 3).setFormula('=COUNTIFS(' + base + ',People!H2:H,"Phone")');
    sh.getRange(r, 4).setFormula('=COUNTIFS(' + base + ',People!H2:H,"Tablet")');
    sh.getRange(r, 5).setFormula('=COUNTIFS(' + base + ',People!H2:H,"Desktop")');
    sh.getRange(r, 6).setFormula('=IFERROR(B' + r + '/$B$2,0)');
  });
  sh.getRange('F2:F8').setNumberFormat('0.0%');
  sh.getRange('A11').setValue('By day').setFontWeight('bold');
  sh.getRange('A12').setFormula(
    '=QUERY(People!A2:X, "select W, count(P), sum(V), sum(U), sum(T) where R <> \'test\' and P <> \'\' group by W order by W desc ' +
    'label W \'Day\', count(P) \'Visitors\', sum(V) \'Saw form\', sum(U) \'Started\', sum(T) \'Submitted\'", 0)');
  sh.autoResizeColumns(1, 6);
}

function buildDropoff(ss) {
  var sh = freshTab(ss, 'Drop-off & Entry');
  var real = "R <> 'test' and P <> ''";
  var blocks = [
    ['A1', 'Where people stopped (started, not submitted)',
     '=QUERY(People!A2:X, "select E, count(P) where ' + real + ' and U = 1 and T = 0 group by E order by count(P) desc label E \'Outcome\', count(P) \'People\'", 0)'],
    ['D1', 'Last field touched before leaving',
     '=QUERY(People!A2:X, "select X, count(P) where ' + real + ' and U = 1 and T = 0 group by X order by count(P) desc label X \'Field\', count(P) \'People\'", 0)'],
    ['G1', 'How people entered the form',
     '=QUERY(People!A2:X, "select G, count(P), sum(T) where ' + real + ' and U = 1 group by G order by count(P) desc label G \'Entered via\', count(P) \'Started\', sum(T) \'Submitted\'", 0)'],
    ['K1', 'Where visitors came from',
     '=QUERY(People!A2:X, "select F, count(P), sum(U), sum(T) where ' + real + ' group by F order by count(P) desc label F \'Source\', count(P) \'Visitors\', sum(U) \'Started\', sum(T) \'Submitted\'", 0)'],
    ['P1', 'What people press (real visitors)',
     '=QUERY(Events!A2:AA, "select Z, count(C) where D = \'click\' and Z <> \'\' and U contains \'tmcleansedrive.com\' group by Z order by count(C) desc limit 40 label Z \'Pressed\', count(C) \'Times\'", 0)'],
    ['S1', 'Errors people hit',
     '=QUERY(Events!A2:AA, "select G, count(C) where D = \'validation_error\' and U contains \'tmcleansedrive.com\' group by G order by count(C) desc label G \'Error\', count(C) \'Times\'", 0)']
  ];
  blocks.forEach(function (b) {
    var cell = sh.getRange(b[0]);
    cell.setValue(b[1]).setFontWeight('bold');
    cell.offset(1, 0).setFormula(b[2]);
  });
}
