// ============================================================
// CALL TRACKER v2.0 — Google Apps Script
// ============================================================

const SHEET_PEOPLE       = 'PEOPLE';
const SHEET_INTERACTIONS = 'INTERACTIONS';
const SHEET_FOLLOWUPS    = 'FOLLOWUPS';
const SHEET_SETTINGS     = 'SETTINGS';

const RESULT_REACHED       = 'Reached';
const STATUS_CALL_BACK     = 'Call Back';
const STATUS_TO_BE_REACHED = 'To Be Reached';
const STATUS_COMPLETED     = 'Completed';

const CACHE_KEY_DUE  = 'duePeople';
const CACHE_KEY_PPL  = 'people';
const CACHE_TTL      = 300; // 5 minutes


// ─── ACTIVE STATUS HELPER ────────────────────────────────────

function isActiveVal_(val) {
  if (val === true)  return true;
  if (val === false) return false;
  const s = String(val === null || val === undefined ? '' : val).trim().toUpperCase();
  if (s === '' || s === 'TRUE' || s === 'YES' || s === 'Y' || s === 'ACTIVE') return true;
  if (s === 'FALSE' || s === 'NO' || s === 'N' || s === 'INACTIVE') return false;
  return true;
}


// ─── WEB APP ENTRY POINT ─────────────────────────────────────

function getAppUrl_() {
  return ScriptApp.getService().getUrl();
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : null;

    if (action === 'quickStats') {
      const d = api_getDuePeople();
      return json_({
        callbacks: (d.callbacks||[]).length,
        overdue:   (d.overdue  ||[]).length,
        today:     (d.today    ||[]).length
      });
    }

    if (action === 'duePeople') {
      return json_(api_getDuePeople());
    }

    if (action === 'people') {
      return json_(api_getPeople());
    }

    if (action === 'saveInteraction') {
      const body = JSON.parse(e.parameter.payload || '{}');
      return json_(api_saveInteraction(body));
    }

    return json_({ ok: true });

  } catch (err) {
    return json_({ error: err.message });
  }
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ─── CACHE HELPERS ───────────────────────────────────────────

function cacheGet_(key) {
  try {
    const val = CacheService.getScriptCache().get(key);
    return val ? JSON.parse(val) : null;
  } catch(e) { return null; }
}

function cachePut_(key, data) {
  try {
    const str = JSON.stringify(data);
    // Apps Script cache limit is 100KB per entry
    if (str.length < 90000) {
      CacheService.getScriptCache().put(key, str, CACHE_TTL);
    }
  } catch(e) {}
}

function cacheBust_() {
  CacheService.getScriptCache().removeAll([CACHE_KEY_DUE, CACHE_KEY_PPL]);
}


// ─── SETTINGS ────────────────────────────────────────────────

function getSetting_(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (const row of data) {
    if (String(row[0]).trim().toUpperCase() === key.toUpperCase()) {
      return String(row[1]).trim();
    }
  }
  return null;
}


// ─── SETUP ───────────────────────────────────────────────────

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const peopleHeaders      = ['PersonID','FullName','Role','CadenceDays','Active',
                              'LastAttempt','LastSuccessfulContact','NextDueDate','DueStatus','Priority','Fellowship'];
  const interactionHeaders = ['InteractionID','Timestamp','PersonID','FullName','Channel',
                              'Result','OutcomeType','Summary','NextAction','NextActionDateTime','Processed'];
  const followupHeaders    = ['TaskID','CreatedAt','PersonID','TaskType','DueDateTime',
                              'Status','LinkedInteractionID','CompletedAt','CompletionNote'];
  const settingsData       = [
    ['REMINDER_EMAIL','your@email.com'],
    ['MORNING_REMINDER_HOUR','8'],
    ['DUESTATUS_REFRESH_HOUR','1'],
    ['MONDAY_FOLLOWUPS_HOUR','8'],
    ['DUE_SOON_DAYS','2'],
    ['TIMEZONE',''],
  ];

  function ensureSheet(name, headers) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    }
    return sheet;
  }

  ensureSheet(SHEET_PEOPLE, peopleHeaders);
  ensureSheet(SHEET_INTERACTIONS, interactionHeaders);
  ensureSheet(SHEET_FOLLOWUPS, followupHeaders);

  let settings = ss.getSheetByName(SHEET_SETTINGS);
  if (!settings) {
    settings = ss.insertSheet(SHEET_SETTINGS);
    settings.getRange(1, 1, settingsData.length, 2).setValues(settingsData);
    settings.getRange(1, 1, settingsData.length, 1).setFontWeight('bold');
  }

  SpreadsheetApp.getUi().alert('✅ Call Tracker setup complete!');
}


// ─── API: GET PEOPLE ─────────────────────────────────────────
// FIX: cached — avoids a sheet read on every Log page load

function api_getPeople() {
  const cached = cacheGet_(CACHE_KEY_PPL);
  if (cached) return cached;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
  if (!sheet) return [];

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const idx     = h => headers.indexOf(h);

  const result = data.slice(1)
    .filter(row => isActiveVal_(row[idx('active')]))
    .map(row => ({ id: row[idx('personid')], name: row[idx('fullname')] }))
    .filter(p => p.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  cachePut_(CACHE_KEY_PPL, result);
  return result;
}


// ─── API: GET OPTIONS ────────────────────────────────────────

function api_getOptions() {
  return {
    results:     ['Reached', 'No Answer', 'Left Message', 'Rescheduled Call'],
    nextActions: ['None', 'Callback', 'Follow-up']
  };
}


// ─── DUPLICATE GUARD ─────────────────────────────────────────

function isDuplicateInteraction_(payload) {
  const cache  = CacheService.getScriptCache();
  const keyObj = {
    personId:          payload.personId          || '',
    result:            payload.result            || '',
    nextAction:        payload.nextAction        || '',
    summary:           payload.summary           || '',
    nextActionDateTime:payload.nextActionDateTime|| ''
  };
  const key = 'dup_' + Utilities.base64EncodeWebSafe(JSON.stringify(keyObj));
  if (cache.get(key)) return true;
  cache.put(key, '1', 15);
  return false;
}


// ─── API: SAVE INTERACTION ───────────────────────────────────

function api_saveInteraction(payload) {
  try {
    return saveInteractionCore_(payload);
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function saveInteractionCore_(payload) {
  const ss           = SpreadsheetApp.getActiveSpreadsheet();
  const interactions = ss.getSheetByName(SHEET_INTERACTIONS);
  const people       = ss.getSheetByName(SHEET_PEOPLE);
  const followups    = ss.getSheetByName(SHEET_FOLLOWUPS);

  if (isDuplicateInteraction_(payload)) throw new Error('Duplicate blocked.');
  if (!payload.personId || !payload.result) throw new Error('Missing required fields.');

  const now         = new Date();
  const iId         = 'I' + now.getTime();
  const outcomeType = deriveOutcomeType_(payload.result);
  const nextActionDT= payload.nextActionDateTime ? new Date(payload.nextActionDateTime) : '';

  if ((payload.nextAction === 'Callback' || payload.nextAction === 'Follow-up') &&
      !(nextActionDT instanceof Date && !isNaN(nextActionDT))) {
    throw new Error('Callback / follow-up date is required.');
  }

  interactions.appendRow([
    iId, now, payload.personId, payload.fullName || '', 'Call',
    payload.result, outcomeType, payload.summary || '',
    payload.nextAction || 'None', nextActionDT, true
  ]);

  const pData = people.getDataRange().getValues();
  const pH    = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx  = h => pH.indexOf(h);

  for (let i = 1; i < pData.length; i++) {
    if (String(pData[i][pIdx('personid')]) !== String(payload.personId)) continue;

    const rowNum = i + 1;

    // FIX: batch all writes to this row into one setValues call
    const updates = {};
    updates[pIdx('lastattempt')] = now;

    if (outcomeType === 'Successful') {
      updates[pIdx('lastsuccessfulcontact')] = now;
    }

    if (payload.nextAction === 'Callback' || payload.nextAction === 'Follow-up') {
      updates[pIdx('nextduedate')] = nextActionDT;
      updates[pIdx('duestatus')]   = STATUS_CALL_BACK;
    } else if (outcomeType === 'Successful') {
      const cadence = Number(pData[i][pIdx('cadencedays')]) || 30;
      const nextDue = resolveNextActionDateTime_(nextActionDT, cadence, now);
      updates[pIdx('nextduedate')] = nextDue;
      updates[pIdx('duestatus')]   = STATUS_COMPLETED;
      closeOpenFollowupsForPerson_(followups, payload.personId, now);
    }

    // Write each changed column individually (avoids overwriting untouched columns)
    for (const [colIdx, val] of Object.entries(updates)) {
      people.getRange(rowNum, Number(colIdx) + 1).setValue(val);
    }

    break;
  }

  if (payload.nextAction && payload.nextAction !== 'None') {
    followups.appendRow([
      'T' + now.getTime(), now, payload.personId, payload.nextAction,
      nextActionDT || '', 'Open', iId, '', ''
    ]);
  }

  // FIX: removed refreshDueStatuses() here — it was running on every single
  // call log and writing to every person row. The daily trigger handles it.
  // Instead we just bust the cache so the next read gets fresh data.
  cacheBust_();

  return { success: true, interactionId: iId };
}

function deriveOutcomeType_(result) {
  return result === RESULT_REACHED ? 'Successful' : 'Attempt';
}

function resolveNextActionDateTime_(nextActionDT, cadenceDays, fromDate) {
  if (nextActionDT instanceof Date && !isNaN(nextActionDT)) return nextActionDT;
  const d = new Date(fromDate);
  d.setDate(d.getDate() + (cadenceDays || 30));
  return d;
}

function closeOpenFollowupsForPerson_(sheet, personId, now) {
  const data    = sheet.getDataRange().getValues();
  const h       = data[0].map(v => v.toString().trim().toLowerCase().replace(/\s/g,''));
  const pidIdx  = h.indexOf('personid');
  const statIdx = h.indexOf('status');
  const compIdx = h.indexOf('completedat');
  const noteIdx = h.indexOf('completionnote');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pidIdx]) === String(personId) && data[i][statIdx] === 'Open') {
      sheet.getRange(i+1, statIdx+1).setValue('Done');
      sheet.getRange(i+1, compIdx+1).setValue(now);
      sheet.getRange(i+1, noteIdx+1).setValue('Auto-closed: successful contact');
    }
  }
}


// ─── API: GET DUE PEOPLE ────────────────────────────────────
// FIX: cached — avoids a full sheet read on every dashboard load

function api_getDuePeople() {
  const cached = cacheGet_(CACHE_KEY_DUE);
  if (cached) return cached;

  const result = computeDuePeople_();
  cachePut_(CACHE_KEY_DUE, result);
  return result;
}

function computeDuePeople_() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const people  = ss.getSheetByName(SHEET_PEOPLE);
  const followups = ss.getSheetByName(SHEET_FOLLOWUPS);
  if (!people) return { callbacks:[], overdue:[], today:[], thisWeek:[], nextWeek:[], noDate:[] };

  const pData = people.getDataRange().getValues();
  const pH    = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx  = h => pH.indexOf(h);

  const fData = followups ? followups.getDataRange().getValues() : [[]];
  const fH    = fData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const fIdx  = h => fH.indexOf(h);

  const openFollowups = {};
  for (let i = 1; i < fData.length; i++) {
    if (String(fData[i][fIdx('status')]) === 'Open') {
      const pid = String(fData[i][fIdx('personid')]);
      if (!openFollowups[pid]) openFollowups[pid] = [];
      openFollowups[pid].push({
        type: fData[i][fIdx('tasktype')],
        due:  fData[i][fIdx('duedatetime')]
      });
    }
  }

  const now         = new Date();
  const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd    = new Date(todayStart.getTime() + 86400000);
  const weekEnd     = new Date(todayStart.getTime() + 7  * 86400000);
  const nextWeekEnd = new Date(todayStart.getTime() + 14 * 86400000);

  const buckets = { callbacks:[], overdue:[], today:[], thisWeek:[], nextWeek:[], noDate:[] };

  for (let i = 1; i < pData.length; i++) {
    const row = pData[i];
    if (!isActiveVal_(row[pIdx('active')])) continue;

    const pid   = String(row[pIdx('personid')]);
    const name  = row[pIdx('fullname')];
    const due   = row[pIdx('nextduedate')];
    const lastA = row[pIdx('lastattempt')];
    const prio  = row[pIdx('priority')];
    const status= row[pIdx('duestatus')];

    const person = {
      id: pid, name, priority: prio, status,
      lastAttempt: lastA ? formatDate_(lastA) : null,
      nextDueDate: due   ? formatDate_(due)   : null
    };

    if (openFollowups[pid]) {
      person.callbackDue = openFollowups[pid][0].due
        ? formatDate_(openFollowups[pid][0].due) : null;
      buckets.callbacks.push(person);
      continue;
    }

    if (!due) {
      buckets.noDate.push(person);
    } else {
      const d = new Date(due);
      if      (d < todayStart)  buckets.overdue.push(person);
      else if (d < todayEnd)    buckets.today.push(person);
      else if (d < weekEnd)     buckets.thisWeek.push(person);
      else if (d < nextWeekEnd) buckets.nextWeek.push(person);
    }
  }

  return buckets;
}

function formatDate_(d) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  } catch(e) { return String(d); }
}


// ─── REFRESH DUE STATUSES ────────────────────────────────────
// FIX: now uses a single batch write instead of one setValue per row

function refreshDueStatuses() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const people  = ss.getSheetByName(SHEET_PEOPLE);
  const followups = ss.getSheetByName(SHEET_FOLLOWUPS);
  if (!people) return;

  const pData = people.getDataRange().getValues();
  const pH    = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx  = h => pH.indexOf(h);
  const dsCol = pIdx('duestatus'); // 0-based

  const fData = followups ? followups.getDataRange().getValues() : [[]];
  const fH    = fData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const fIdx  = h => fH.indexOf(h);

  const openPeople = new Set();
  for (let i = 1; i < fData.length; i++) {
    if (String(fData[i][fIdx('status')]) === 'Open') {
      openPeople.add(String(fData[i][fIdx('personid')]));
    }
  }

  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const todayEnd = todayStart.getTime() + 86400000;

  // Build the entire status column as an array, then write once
  const statusValues = [];
  for (let i = 1; i < pData.length; i++) {
    const pid = String(pData[i][pIdx('personid')]);
    const due = pData[i][pIdx('nextduedate')];
    let status;

    if (openPeople.has(pid)) {
      status = STATUS_CALL_BACK;
    } else if (!due || new Date(due).getTime() < todayEnd) {
      status = STATUS_TO_BE_REACHED;
    } else {
      status = STATUS_COMPLETED;
    }

    statusValues.push([status]);
  }

  if (statusValues.length > 0) {
    // One write call instead of N individual setValue calls
    people.getRange(2, dsCol + 1, statusValues.length, 1).setValues(statusValues);
  }

  cacheBust_();
}


// ─── API: QUICK STATS ────────────────────────────────────────

function api_getQuickStats() {
  const data = api_getDuePeople();
  return {
    callbacks: (data.callbacks || []).length,
    overdue:   (data.overdue   || []).length,
    today:     (data.today     || []).length
  };
}


// ─── EMAIL FUNCTIONS ─────────────────────────────────────────

function sendMorningDueNowReminder() {
  const data   = api_getDuePeople();
  const appUrl = 'https://pikcalltracker.netlify.app/';
  const emails = getSetting_('REMINDER_EMAIL');
  if (!emails) return;

  function safe_(v) {
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function personCard_(p, type) {
    const bg  = { callback:'#edf4f1', overdue:'#fef3f2', today:'#faf5e8' };
    const bdr = { callback:'#dce9e4', overdue:'#f3d1cc', today:'#eee0b8' };
    let line  = p.callbackDue ? 'Callback due: '+safe_(p.callbackDue)
              : p.nextDueDate ? 'Due: '+safe_(p.nextDueDate)
              : 'No date set';
    return `
      <div style="border:1px solid ${bdr[type]};background:${bg[type]};border-radius:16px;padding:14px 16px;margin-bottom:10px;">
        <div style="font-size:15px;font-weight:700;color:#1a1a18;margin-bottom:4px;">${safe_(p.name)}</div>
        <div style="font-size:13px;color:#5f5d57;line-height:1.6;">${line}${p.lastAttempt?' • Last: '+safe_(p.lastAttempt):''}${p.priority?' • Priority: '+safe_(p.priority):''}</div>
      </div>`;
  }

  function section_(title, color, list, type) {
    if (!list || !list.length) return '';
    return `<div style="margin-bottom:22px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;color:${color};margin-bottom:10px;">${title} (${list.length})</div>
      ${list.map(p => personCard_(p, type)).join('')}
    </div>`;
  }

  const totalDue = (data.callbacks||[]).length + (data.overdue||[]).length + (data.today||[]).length;

  const html = `
    <div style="margin:0;padding:24px 0;background:#f4f1eb;font-family:Arial,Helvetica,sans-serif;color:#1a1a18;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e0d5;border-radius:20px;overflow:hidden;">
        <tr><td style="background:#244c43;padding:28px 32px 20px;">
          <div style="font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:#d7c28b;font-weight:700;margin-bottom:8px;">Pastoral Call Tracker</div>
          <div style="font-family:Georgia,serif;font-size:32px;color:#fff;font-weight:700;margin-bottom:10px;">Morning Reminder</div>
          <div style="font-size:14px;color:#e8f1ed;">${safe_(new Date().toDateString())}</div>
        </td></tr>
        <tr><td style="padding:20px 32px 10px;background:#faf9f6;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="33%" style="padding-right:8px;"><div style="background:#fff;border:1px solid #e5e0d5;border-radius:14px;padding:16px 12px;text-align:center;"><div style="font-size:28px;font-weight:700;color:#244c43;">${(data.callbacks||[]).length}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7a7870;font-weight:700;">Callbacks</div></div></td>
            <td width="33%" style="padding:0 4px;"><div style="background:#fff;border:1px solid #e5e0d5;border-radius:14px;padding:16px 12px;text-align:center;"><div style="font-size:28px;font-weight:700;color:#b42318;">${(data.overdue||[]).length}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7a7870;font-weight:700;">Overdue</div></div></td>
            <td width="33%" style="padding-left:8px;"><div style="background:#fff;border:1px solid #e5e0d5;border-radius:14px;padding:16px 12px;text-align:center;"><div style="font-size:28px;font-weight:700;color:#b89146;">${(data.today||[]).length}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7a7870;font-weight:700;">Due Today</div></div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:12px 32px 8px;">
          ${section_('🔴 Callbacks','#244c43',data.callbacks||[],'callback')}
          ${section_('🟠 Overdue','#b42318',data.overdue||[],'overdue')}
          ${section_('🟡 Due Today','#b89146',data.today||[],'today')}
          ${totalDue===0?'<p style="font-size:14px;color:#027a48;margin:8px 0 18px;">✅ All caught up. Nothing due today.</p>':''}
          <div style="text-align:center;margin:22px 0 8px;"><a href="${appUrl}" style="display:inline-block;background:#244c43;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:14px;">Open Dashboard</a></div>
          <div style="text-align:center;font-size:13px;color:#7a7870;margin-top:10px;">Start with callbacks, then overdue, then due today.</div>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e0d5;padding:18px 32px;background:#faf9f6;font-size:12px;color:#7a7870;">This reminder was generated by your Call Tracker system.</td></tr>
      </table>
    </div>`;

  sendEmailToMany_(emails, `Call Tracker — Due Today (${totalDue})`, html);
}

function sendMondayFollowupsThisWeek() {
  const data   = api_getDuePeople();
  const appUrl = 'https://pikcalltracker.netlify.app/';
  const emails = getSetting_('REMINDER_EMAIL');
  if (!emails) return;

  function safe_(v) {
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function personCard_(p, type) {
    const bg  = { callback:'#edf4f1', overdue:'#fef3f2', today:'#faf5e8', week:'#eff6ff', nodate:'#f7f7f5' };
    const bdr = { callback:'#dce9e4', overdue:'#f3d1cc', today:'#eee0b8', week:'#cfe0f5', nodate:'#e5e0d5' };
    let line  = p.callbackDue ? 'Callback due: '+safe_(p.callbackDue)
              : p.nextDueDate ? 'Due: '+safe_(p.nextDueDate)
              : 'No date set';
    return `
      <div style="border:1px solid ${bdr[type]};background:${bg[type]};border-radius:16px;padding:14px 16px;margin-bottom:10px;">
        <div style="font-size:15px;font-weight:700;color:#1a1a18;margin-bottom:4px;">${safe_(p.name)}</div>
        <div style="font-size:13px;color:#5f5d57;line-height:1.6;">${line}${p.lastAttempt?' • Last: '+safe_(p.lastAttempt):''}${p.priority?' • Priority: '+safe_(p.priority):''}</div>
      </div>`;
  }

  function section_(title, color, list, type) {
    if (!list || !list.length) return '';
    return `<div style="margin-bottom:22px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;color:${color};margin-bottom:10px;">${title} (${list.length})</div>
      ${list.map(p => personCard_(p, type)).join('')}
    </div>`;
  }

  const totalDue = (data.callbacks||[]).length + (data.overdue||[]).length +
                   (data.today||[]).length + (data.thisWeek||[]).length + (data.noDate||[]).length;

  const html = `
    <div style="margin:0;padding:24px 0;background:#f4f1eb;font-family:Arial,Helvetica,sans-serif;color:#1a1a18;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e0d5;border-radius:20px;overflow:hidden;">
        <tr><td style="background:#244c43;padding:28px 32px 20px;">
          <div style="font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:#d7c28b;font-weight:700;margin-bottom:8px;">Pastoral Call Tracker</div>
          <div style="font-family:Georgia,serif;font-size:32px;color:#fff;font-weight:700;margin-bottom:10px;">Weekly Summary</div>
          <div style="font-size:14px;color:#e8f1ed;">Week of ${safe_(new Date().toDateString())}</div>
        </td></tr>
        <tr><td style="padding:12px 32px 8px;">
          ${section_('🔴 Callbacks','#244c43',data.callbacks||[],'callback')}
          ${section_('🟠 Overdue','#b42318',data.overdue||[],'overdue')}
          ${section_('🟡 Due Today','#b89146',data.today||[],'today')}
          ${section_('🔵 This Week','#2d4a6b',data.thisWeek||[],'week')}
          ${section_('⚪ No Due Date','#7a7870',data.noDate||[],'nodate')}
          ${totalDue===0?'<p style="font-size:14px;color:#027a48;margin:8px 0 18px;">✅ All caught up for the week.</p>':''}
          <div style="text-align:center;margin:22px 0 8px;"><a href="${appUrl}" style="display:inline-block;background:#244c43;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:14px;">Open Dashboard</a></div>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e0d5;padding:18px 32px;background:#faf9f6;font-size:12px;color:#7a7870;">This weekly summary was generated by your Call Tracker system.</td></tr>
      </table>
    </div>`;

  sendEmailToMany_(emails, `Call Tracker — Weekly Summary (${totalDue})`, html);
}

function sendEmailToMany_(emailsStr, subject, htmlBody) {
  emailsStr.split(',').map(e => e.trim()).filter(Boolean)
    .forEach(email => GmailApp.sendEmail(email, subject, '', { htmlBody }));
}


// ─── TRIGGERS ────────────────────────────────────────────────

function resetAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  const refreshHour = parseInt(getSetting_('DUESTATUS_REFRESH_HOUR')) || 1;
  const morningHour = parseInt(getSetting_('MORNING_REMINDER_HOUR'))  || 8;
  const mondayHour  = parseInt(getSetting_('MONDAY_FOLLOWUPS_HOUR'))  || 8;

  ScriptApp.newTrigger('refreshDueStatuses').timeBased().everyDays(1).atHour(refreshHour).create();
  ScriptApp.newTrigger('sendMorningDueNowReminder').timeBased().everyDays(1).atHour(morningHour).create();
  ScriptApp.newTrigger('sendMondayFollowupsThisWeek').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(mondayHour).create();

  SpreadsheetApp.getUi().alert('✅ Triggers set up successfully!');
}


// ─── MENU ────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📞 Call Tracker')
    .addItem('Setup / Fix Headers',      'setupSystem')
    .addItem('Reset All Triggers',       'resetAllTriggers')
    .addItem('Refresh Due Statuses Now', 'refreshDueStatuses')
    .addItem('Send Morning Email Now',   'sendMorningDueNowReminder')
    .addItem('Send Weekly Email Now',    'sendMondayFollowupsThisWeek')
    .addToUi();
}


// ─── DEBUG ───────────────────────────────────────────────────

function debugDuePeople() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const people  = ss.getSheetByName('PEOPLE');
  const followups = ss.getSheetByName('FOLLOWUPS');
  const pData   = people.getDataRange().getValues();
  const pH      = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx    = h => pH.indexOf(h);
  const fData   = followups ? followups.getDataRange().getValues() : [[]];
  const fH      = fData[0].map(h => String(h).trim().toLowerCase().replace(/\s/g,''));
  const fIdx    = h => fH.indexOf(h);

  Logger.log('PEOPLE HEADERS: '   + JSON.stringify(pH));
  Logger.log('FOLLOWUP HEADERS: ' + JSON.stringify(fH));

  for (let i = 1; i < pData.length; i++) {
    Logger.log(JSON.stringify({
      row: i+1, name: pData[i][pIdx('fullname')],
      activeRaw: pData[i][pIdx('active')], isActive: isActiveVal_(pData[i][pIdx('active')]),
      dueRaw: pData[i][pIdx('nextduedate')]
    }));
  }

  Logger.log(JSON.stringify(computeDuePeople_(), null, 2));
}
