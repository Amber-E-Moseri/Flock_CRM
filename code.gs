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
const CACHE_KEY_CAD  = 'peopleWithCadence';
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

    if (action === 'getInteractions') {
      const personId = e.parameter.personId || '';
      return json_(api_getInteractions(personId));
    }

    if (action === 'getPeopleWithCadence') {
      return json_(api_getPeopleWithCadence());
    }

    if (action === 'saveCadence') {
      const personId    = e.parameter.personId    || '';
      const cadenceDays = parseInt(e.parameter.cadenceDays) || 0;
      return json_(api_saveCadence(personId, cadenceDays));
    }

    if (action === 'getSettings') {
      return json_(api_getSettings());
    }

    if (action === 'saveSetting') {
      const key = e.parameter.key || '';
      const val = e.parameter.val !== undefined ? e.parameter.val : '';
      return json_(api_saveSetting(key, val));
    }

    if (action === 'addPerson') {
      const body = JSON.parse(e.parameter.payload || '{}');
      return json_(api_addPerson(body));
    }

    if (action === 'setActive') {
      const personId = e.parameter.personId || '';
      const active   = e.parameter.active === 'true';
      return json_(api_setActive(personId, active));
    }

    if (action === 'editPerson') {
      const body = JSON.parse(e.parameter.payload || '{}');
      return json_(api_editPerson(body));
    }

    if (action === 'getAnalytics') {
      return json_(api_getAnalytics());
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
  CacheService.getScriptCache().removeAll([CACHE_KEY_DUE, CACHE_KEY_PPL, CACHE_KEY_CAD]);
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
    ['MONDAY_FOLLOWUPS_HOUR','8'],
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


// ─── API: GET INTERACTIONS FOR PERSON ────────────────────────

function api_getInteractions(personId) {
  if (!personId) return [];
  const cacheKey = 'interactions_' + personId;
  const cached = cacheGet_(cacheKey);
  if (cached) return cached;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INTERACTIONS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const h    = data[0].map(v => v.toString().trim().toLowerCase().replace(/\s/g,''));
  const idx  = k => h.indexOf(k);

  const result = data.slice(1)
    .filter(row => String(row[idx('personid')]) === String(personId))
    .map(row => ({
      id:         row[idx('interactionid')],
      timestamp:  row[idx('timestamp')]           ? formatDate_(row[idx('timestamp')])           : '',
      result:     row[idx('result')]              || '',
      outcome:    row[idx('outcometype')]         || '',
      summary:    row[idx('summary')]             || '',
      nextAction: row[idx('nextaction')]          || '',
      nextDt:     row[idx('nextactiondatetime')]  ? formatDate_(row[idx('nextactiondatetime')])  : ''
    }))
    .reverse(); // newest first

  cachePut_(cacheKey, result);
  return result;
}


// ─── API: GET PEOPLE WITH CADENCE ────────────────────────────
// CadenceDays is fixed at column E (index 4, 0-based)

const CADENCE_COL = 4; // Column E (0-based)

function api_getPeopleWithCadence() {
  const cached = cacheGet_(CACHE_KEY_CAD);
  if (cached) return cached;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
  if (!sheet) return [];

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const idx     = h => headers.indexOf(h);

  const result = data.slice(1)
    .filter(row => row[idx('fullname')])  // all people, active or not
    .map(row => {
      const raw = Number(row[CADENCE_COL]);
      return {
        id:          row[idx('personid')],
        name:        row[idx('fullname')],
        cadenceDays: raw > 0 ? raw : 30,
        isDefault:   !(raw > 0),
        fellowship:  row[idx('fellowship')] || '',
        role:        row[idx('role')]       || '',
        priority:    row[idx('priority')]   || '',
        active:      isActiveVal_(row[idx('active')])
      };
    })
    .filter(p => p.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  cachePut_(CACHE_KEY_CAD, result);
  return result;
}


// ─── API: SAVE CADENCE ───────────────────────────────────────

function api_saveCadence(personId, cadenceDays) {
  if (!personId)   return { success: false, error: 'Missing personId.' };
  if (!cadenceDays || cadenceDays < 1) return { success: false, error: 'Cadence must be at least 1 day.' };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
  if (!sheet) return { success: false, error: 'PEOPLE sheet not found.' };

  const data   = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pidCol = headers.indexOf('personid');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pidCol]) === String(personId)) {
      sheet.getRange(i + 1, CADENCE_COL + 1).setValue(cadenceDays); // column E = CADENCE_COL + 1
      cacheBust_();
      return { success: true };
    }
  }
  return { success: false, error: 'Person not found.' };
}


// ─── API: GET / SAVE APP SETTINGS ────────────────────────────

const SETTINGS_META = {
  REMINDER_EMAIL:         { label: 'Reminder Email', desc: 'Email address(es) to receive daily and weekly reminders. Separate multiple with commas.' },
  MORNING_REMINDER_HOUR:  { label: 'Morning Reminder Hour', desc: 'Hour (0–23) to send the daily due-now email.' },
  MONDAY_FOLLOWUPS_HOUR:  { label: 'Weekly Summary Hour', desc: 'Hour (0–23) to send the Monday weekly summary email.' },
  TIMEZONE:               { label: 'Timezone', desc: 'Timezone string, e.g. America/New_York. Leave blank to use spreadsheet default.' }
};

function api_getSettings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  return data.map(function(row) {
    const key  = String(row[0]).trim();
    const val  = String(row[1] === null || row[1] === undefined ? '' : row[1]).trim();
    const meta = SETTINGS_META[key];
    if (!meta || meta.hidden) return null;
    return { key: key, val: val, label: meta.label, desc: meta.desc };
  }).filter(Boolean);
}

function api_saveSetting(key, val) {
  if (!key) return { success: false, error: 'Missing key.' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  if (!sheet) return { success: false, error: 'SETTINGS sheet not found.' };
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === key.toUpperCase()) {
      sheet.getRange(i + 1, 2).setValue(val);
      return { success: true };
    }
  }
  // Key not found — append it
  sheet.appendRow([key, val]);
  return { success: true };
}


// ─── API: ADD PERSON ─────────────────────────────────────────

function api_addPerson(payload) {
  try {
  const name = String(payload.name || '').trim();
  if (!name) return { success: false, error: 'Full name is required.' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEOPLE);
  if (!sheet) return { success: false, error: 'PEOPLE sheet not found.' };

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const idx     = h => headers.indexOf(h);

  // Duplicate name check (case-insensitive, active people only)
  for (let i = 1; i < data.length; i++) {
    if (isActiveVal_(data[i][idx('active')]) &&
        String(data[i][idx('fullname')]).trim().toLowerCase() === name.toLowerCase()) {
      return { success: false, error: 'A person with this name already exists.' };
    }
  }

  const firstName = name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const fellowshipInitials = String(payload.fellowship || '')
    .trim().split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('');
  const pid = firstName + (fellowshipInitials ? '-' + fellowshipInitials : '') + '-' + Date.now().toString().slice(-4);
  const cadence  = parseInt(payload.cadenceDays) > 0 ? parseInt(payload.cadenceDays) : 30;
  const now      = new Date();
  const nextDue  = new Date(now.getTime() + cadence * 86400000);

  // Build row matching header order: PersonID, FullName, Role, CadenceDays, Active,
  // LastAttempt, LastSuccessfulContact, NextDueDate, DueStatus, Priority, Fellowship
  const row = new Array(headers.length).fill('');
  if (idx('personid')   >= 0) row[idx('personid')]   = pid;
  if (idx('fullname')   >= 0) row[idx('fullname')]   = name;
  if (idx('role')       >= 0) row[idx('role')]       = String(payload.role        || '').trim();
  if (idx('fellowship') >= 0) row[idx('fellowship')] = String(payload.fellowship  || '').trim();
  if (idx('cadencedays')>= 0) row[idx('cadencedays')]= cadence;
  if (idx('active')     >= 0) row[idx('active')]     = true;
  if (idx('nextduedate')>= 0) row[idx('nextduedate')]= nextDue;
  if (idx('duestatus')  >= 0) row[idx('duestatus')]  = STATUS_TO_BE_REACHED;
  if (idx('priority')   >= 0) row[idx('priority')]   = String(payload.priority    || '').trim();

  sheet.appendRow(row);
  cacheBust_();
  return { success: true, personId: pid, name: name };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ─── API: SET ACTIVE ─────────────────────────────────────────

function api_setActive(personId, active) {
  if (!personId) return { success: false, error: 'Missing personId.' };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
  if (!sheet) return { success: false, error: 'PEOPLE sheet not found.' };

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pidCol  = headers.indexOf('personid');
  const actCol  = headers.indexOf('active');
  if (actCol < 0) return { success: false, error: 'Active column not found.' };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pidCol]) === String(personId)) {
      sheet.getRange(i + 1, actCol + 1).setValue(active);
      // Auto-close any open followups when marking inactive
      if (!active) {
        const followups = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_FOLLOWUPS);
        if (followups) closeOpenFollowupsForPerson_(followups, personId, new Date(), 'Auto-closed: person marked inactive');
      }
      cacheBust_();
      return { success: true };
    }
  }
  return { success: false, error: 'Person not found.' };
}


// ─── API: EDIT PERSON ────────────────────────────────────────

function api_editPerson(payload) {
  try {
    const personId = String(payload.personId || '').trim();
    if (!personId) return { success: false, error: 'Missing personId.' };

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
    if (!sheet) return { success: false, error: 'PEOPLE sheet not found.' };

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const idx     = h => headers.indexOf(h);
    const pidCol  = idx('personid');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][pidCol]) !== personId) continue;
      const rowNum = i + 1;
      if (payload.name       !== undefined && idx('fullname')   >= 0) sheet.getRange(rowNum, idx('fullname')   + 1).setValue(String(payload.name      || '').trim());
      if (payload.role       !== undefined && idx('role')       >= 0) sheet.getRange(rowNum, idx('role')       + 1).setValue(String(payload.role       || '').trim());
      if (payload.fellowship !== undefined && idx('fellowship') >= 0) sheet.getRange(rowNum, idx('fellowship') + 1).setValue(String(payload.fellowship  || '').trim());
      if (payload.priority   !== undefined && idx('priority')   >= 0) sheet.getRange(rowNum, idx('priority')   + 1).setValue(String(payload.priority   || '').trim());
      cacheBust_();
      return { success: true };
    }
    return { success: false, error: 'Person not found.' };
  } catch(e) {
    return { success: false, error: e.message };
  }
}


// ─── API: ANALYTICS ──────────────────────────────────────────

function api_getAnalytics() {
  try {
    const ss           = SpreadsheetApp.getActiveSpreadsheet();
    const interactions = ss.getSheetByName(SHEET_INTERACTIONS);
    if (!interactions) return { weeksData: [], summary: {} };

    const data = interactions.getDataRange().getValues();
    const h    = data[0].map(v => v.toString().trim().toLowerCase().replace(/\s/g,''));
    const idx  = k => h.indexOf(k);

    const now       = new Date();
    const NUM_WEEKS = 12;

    // Build week buckets: Mon–Sun, going back NUM_WEEKS weeks
    const weeks = [];
    // Find most recent Monday
    const dayOfWeek = now.getDay(); // 0=Sun
    const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMon   = new Date(now);
    thisMon.setHours(0,0,0,0);
    thisMon.setDate(thisMon.getDate() - daysToMon);

    for (let w = NUM_WEEKS - 1; w >= 0; w--) {
      const start = new Date(thisMon);
      start.setDate(start.getDate() - w * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      weeks.push({ start, end, total: 0, reached: 0, attempts: 0, label: '' });
      // Label: "Dec 2", "Dec 9" etc
      weeks[weeks.length - 1].label = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Tally interactions into week buckets
    let totalAll = 0, reachedAll = 0;
    const personSet = new Set();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const ts  = row[idx('timestamp')];
      if (!ts) continue;
      const d = new Date(ts);
      if (isNaN(d)) continue;

      const outcome = String(row[idx('outcometype')] || '').trim();
      const pid     = String(row[idx('personid')]    || '').trim();

      totalAll++;
      if (outcome === 'Successful') reachedAll++;
      if (pid) personSet.add(pid);

      for (let w = 0; w < weeks.length; w++) {
        if (d >= weeks[w].start && d < weeks[w].end) {
          weeks[w].total++;
          if (outcome === 'Successful') weeks[w].reached++;
          else weeks[w].attempts++;
          break;
        }
      }
    }

    // This week vs last week
    const thisWeekTotal = weeks[weeks.length - 1].total;
    const lastWeekTotal = weeks[weeks.length - 2] ? weeks[weeks.length - 2].total : 0;
    const weekChange    = lastWeekTotal > 0 ? Math.round((thisWeekTotal - lastWeekTotal) / lastWeekTotal * 100) : null;

    // Reach rate
    const reachRate = totalAll > 0 ? Math.round(reachedAll / totalAll * 100) : 0;

    // Best week
    const bestWeek = weeks.reduce((best, w) => w.total > best.total ? w : best, weeks[0]);

    return {
      weeksData: weeks.map(w => ({
        label:    w.label,
        total:    w.total,
        reached:  w.reached,
        attempts: w.attempts
      })),
      summary: {
        totalAll,
        reachedAll,
        reachRate,
        thisWeekTotal,
        lastWeekTotal,
        weekChange,
        bestWeekLabel: bestWeek.label,
        bestWeekCount: bestWeek.total,
        uniquePeople:  personSet.size
      }
    };
  } catch(e) {
    return { error: e.message };
  }
}


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

  if (nextActionDT instanceof Date && !isNaN(nextActionDT) && nextActionDT <= new Date()) {
    throw new Error('Callback / follow-up date must be in the future.');
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
      const cadence = Number(pData[i][CADENCE_COL]) > 0
        ? Number(pData[i][CADENCE_COL])   // use column E if set
        : 30;                              // fall back to 30 days
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

  // Bust global cache + this person's interaction cache
  cacheBust_();
  CacheService.getScriptCache().remove('interactions_' + payload.personId);

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

function closeOpenFollowupsForPerson_(sheet, personId, now, note) {
  const data    = sheet.getDataRange().getValues();
  const h       = data[0].map(v => v.toString().trim().toLowerCase().replace(/\s/g,''));
  const pidIdx  = h.indexOf('personid');
  const statIdx = h.indexOf('status');
  const compIdx = h.indexOf('completedat');
  const noteIdx = h.indexOf('completionnote');
  const closeNote = note || 'Auto-closed: successful contact';

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pidIdx]) === String(personId) && data[i][statIdx] === 'Open') {
      sheet.getRange(i+1, statIdx+1).setValue('Done');
      sheet.getRange(i+1, compIdx+1).setValue(now);
      sheet.getRange(i+1, noteIdx+1).setValue(closeNote);
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

  const morningHour = parseInt(getSetting_('MORNING_REMINDER_HOUR')) || 8;
  const mondayHour  = parseInt(getSetting_('MONDAY_FOLLOWUPS_HOUR'))  || 8;

  ScriptApp.newTrigger('refreshDueStatuses').timeBased().everyDays(1).atHour(1).create();
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
