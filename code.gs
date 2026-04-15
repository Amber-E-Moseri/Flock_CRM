// ============================================================
// CALL TRACKER v3.1 — Google Apps Script
// ============================================================

const SHEET_PEOPLE       = 'PEOPLE';
const SHEET_INTERACTIONS = 'INTERACTIONS';
const SHEET_FOLLOWUPS    = 'FOLLOWUPS';
const SHEET_SETTINGS     = 'SETTINGS';
const SHEET_TODOS        = 'TODOS';

const RESULT_REACHED       = 'Reached';
const STATUS_CALL_BACK     = 'Call Back';
const STATUS_TO_BE_REACHED = 'To Be Reached';
const STATUS_COMPLETED     = 'Completed';

const CACHE_KEY_DUE  = 'duePeople';
const CACHE_KEY_PPL  = 'people';
const CACHE_KEY_TODAY = 'todayCount';
const CACHE_KEY_TODOS_ALL = 'todosAll';
const CACHE_TTL      = 300; // 5 minutes
const CACHE_TTL_SHORT = 120; // 2 minutes


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

    if (action === 'setActive') {
      const personId = e.parameter.personId || '';
      const active   = e.parameter.active   || 'false';
      return json_(api_setActive(personId, active));
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

    if (action === 'getRoleFrequency') {
      return json_(api_getRoleFrequency());
    }

    if (action === 'getAnalytics') {
      return json_(api_getAnalytics());
    }

    if (action === 'debugAnalytics') {
      return json_(api_debugAnalytics());
    }

    if (action === 'searchInteractions') {
      const query = e.parameter.query || '';
      return json_(api_searchInteractions(query));
    }

    if (action === 'getPersonNotes') {
      const personId = e.parameter.personId || '';
      return json_(api_getPersonNotes(personId));
    }

    if (action === 'savePersonNotes') {
      const body = JSON.parse(e.parameter.payload || '{}');
      return json_(api_savePersonNotes(body.personId, body.notes));
    }

    // ── NEW: today's call count from LastAttempt ──
    if (action === 'getTodayCount') {
      return json_(api_getTodayCount());
    }

    if (action === 'getTodos') {
      const personId = e.parameter.personId || '';
      return json_(api_getTodos(personId));
    }

    if (action === 'saveTodos') {
      const body = JSON.parse(e.parameter.payload || '{}');
      return json_(api_saveTodos(body));
    }

    if (action === 'updateTodo') {
      const todoId = e.parameter.todoId || '';
      const done   = e.parameter.done   || 'false';
      return json_(api_updateTodo(todoId, done));
    }

    if (action === 'updateTodoText') {
      const todoId = e.parameter.todoId || '';
      const text   = e.parameter.text   || '';
      return json_(api_updateTodoText(todoId, text));
    }

    if (action === 'updateTodoDueDate') {
      const todoId  = e.parameter.todoId || '';
      const dueDate = e.parameter.dueDate !== undefined ? e.parameter.dueDate : '';
      return json_(api_updateTodoDueDate(todoId, dueDate));
    }

    if (action === 'updateTodoAssignee') {
      const todoId = e.parameter.todoId || '';
      const personId = e.parameter.personId || '';
      const personName = e.parameter.personName || '';
      return json_(api_updateTodoAssignee(todoId, personId, personName));
    }

    if (action === 'deleteTodo') {
      const todoId = e.parameter.todoId || '';
      return json_(api_deleteTodo(todoId));
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
    if (str.length < 90000) {
      CacheService.getScriptCache().put(key, str, CACHE_TTL);
    }
  } catch(e) {}
}

function cacheBust_() {
  CacheService.getScriptCache().removeAll([
    CACHE_KEY_DUE,
    CACHE_KEY_PPL,
    CACHE_KEY_TODAY,
    CACHE_KEY_TODOS_ALL
  ]);
}

function getSheetValues_(sheet) {
  if (!sheet) return [[]];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [[]];
  return sheet.getRange(1, 1, lastRow, lastCol).getValues();
}

function headerMap_(headers) {
  const m = {};
  headers.forEach((h, i) => { m[String(h)] = i; });
  return m;
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
                              'LastAttempt','LastSuccessfulContact','NextDueDate','DueStatus','Priority','Fellowship','Notes'];
  const interactionHeaders = ['InteractionID','Timestamp','PersonID','FullName','Channel',
                              'Result','OutcomeType','Summary','NextAction','NextActionDateTime','Processed'];
  const followupHeaders    = ['TaskID','CreatedAt','PersonID','TaskType','DueDateTime',
                              'Status','LinkedInteractionID','CompletedAt','CompletionNote'];
  const settingsData       = [
    ['NOTIFICATIONS_ENABLED','true'],
    ['REMINDER_EMAIL','your@email.com'],
    ['MORNING_REMINDER_HOUR','8'],
    ['DUESTATUS_REFRESH_HOUR','1'],
    ['MONDAY_FOLLOWUPS_HOUR','8'],
    ['TIMEZONE',''],
    ['YOUR_NAME','Pastor'],
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

  const todoHeaders = ['TodoID','CreatedAt','PersonID','PersonName','InteractionID','Text','DueDate','Done','CompletedAt'];
  ensureSheet(SHEET_PEOPLE, peopleHeaders);
  ensureSheet(SHEET_INTERACTIONS, interactionHeaders);
  ensureSheet(SHEET_FOLLOWUPS, followupHeaders);
  ensureSheet(SHEET_TODOS, todoHeaders);

  let settings = ss.getSheetByName(SHEET_SETTINGS);
  if (!settings) {
    settings = ss.insertSheet(SHEET_SETTINGS);
    settings.getRange(1, 1, settingsData.length, 2).setValues(settingsData);
    settings.getRange(1, 1, settingsData.length, 1).setFontWeight('bold');
  }

  SpreadsheetApp.getUi().alert('✅ Call Tracker setup complete!');
}


// ─── API: GET PEOPLE ─────────────────────────────────────────

function api_getPeople() {
  const cached = cacheGet_(CACHE_KEY_PPL);
  if (cached) return cached;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
  if (!sheet) return [];

  const data    = getSheetValues_(sheet);
  if (!data.length || !data[0] || !data[0].length) return [];
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INTERACTIONS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const h    = data[0].map(v => v.toString().trim().toLowerCase().replace(/\s/g,''));
  const idx  = k => h.indexOf(k);

  return data.slice(1)
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
    .reverse();
}


// ─── API: GET PEOPLE WITH CADENCE ────────────────────────────

const CADENCE_COL = 3; // Column D (0-based index)

function api_getPeopleWithCadence() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
  if (!sheet) return [];

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const idx     = h => headers.indexOf(h);

  return data.slice(1)
    .map(row => {
      const raw      = Number(row[idx('cadencedays')]);
      const isActive = isActiveVal_(row[idx('active')]);
      return {
        id:          row[idx('personid')],
        name:        row[idx('fullname')],
        cadenceDays: raw > 0 ? raw : 30,
        isDefault:   !(raw > 0),
        fellowship:  row[idx('fellowship')] || '',
        role:        row[idx('role')]       || '',
        active:      isActive
      };
    })
    .filter(p => p.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}


// ─── API: SAVE CADENCE ───────────────────────────────────────

function api_saveCadence(personId, cadenceDays) {
  if (!personId)   return { success: false, error: 'Missing personId.' };
  if (!cadenceDays || cadenceDays < 1) return { success: false, error: 'Cadence must be at least 1 day.' };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
  if (!sheet) return { success: false, error: 'PEOPLE sheet not found.' };

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pidCol  = headers.indexOf('personid');
  const cadCol  = headers.indexOf('cadencedays');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pidCol]) === String(personId)) {
      sheet.getRange(i + 1, cadCol + 1).setValue(cadenceDays);
      cacheBust_();
      return { success: true };
    }
  }
  return { success: false, error: 'Person not found.' };
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

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pidCol]) === String(personId)) {
      sheet.getRange(i + 1, actCol + 1).setValue(active === 'true' ? true : false);
      cacheBust_();
      return { success: true };
    }
  }
  return { success: false, error: 'Person not found.' };
}


// ─── API: GET / SAVE APP SETTINGS ────────────────────────────

const SETTINGS_META = {
  NOTIFICATIONS_ENABLED:  { label: 'Notifications',         desc: 'Turn daily and weekly reminder notifications on or off.' },
  REMINDER_EMAIL:         { label: 'Reminder Email',        desc: 'Email address(es) to receive daily and weekly reminders. Separate multiple with commas.' },
  MORNING_REMINDER_HOUR:  { label: 'Morning Reminder Hour', desc: 'Hour (0–23) to send the daily due-now email.' },
  DUESTATUS_REFRESH_HOUR: { label: 'Due Status Refresh Hour', desc: 'Hour (0–23) to automatically refresh due statuses.' },
  MONDAY_FOLLOWUPS_HOUR:  { label: 'Weekly Summary Hour',   desc: 'Hour (0–23) to send the Monday weekly summary email.' },
  TIMEZONE:               { label: 'Timezone',              desc: 'Timezone string, e.g. America/New_York. Leave blank to use spreadsheet default.' },
  YOUR_NAME:              { label: 'Your Name',             desc: 'Your first name — shown in the home screen greeting and email reminders.' }
};

function api_getSettings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  if (!sheet) return [];
  ensureSettingKey_(sheet, 'NOTIFICATIONS_ENABLED', 'true');
  const data = sheet.getDataRange().getValues();
  return data.map(function(row) {
    const key  = String(row[0]).trim();
    const val  = String(row[1] === null || row[1] === undefined ? '' : row[1]).trim();
    const meta = SETTINGS_META[key] || { label: key, desc: '' };
    return { key: key, val: val, label: meta.label, desc: meta.desc, hidden: !!meta.hidden };
  }).filter(function(r) { return r.key && !r.hidden; });
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

    for (let i = 1; i < data.length; i++) {
      if (isActiveVal_(data[i][idx('active')]) &&
          String(data[i][idx('fullname')]).trim().toLowerCase() === name.toLowerCase()) {
        return { success: false, error: 'A person with this name already exists.' };
      }
    }

    const pid     = 'P' + Date.now();
    const cadence = parseInt(payload.cadenceDays) > 0 ? parseInt(payload.cadenceDays) : 30;
    const now     = new Date();

    const row = new Array(headers.length).fill('');
    if (idx('personid')   >= 0) row[idx('personid')]    = pid;
    if (idx('fullname')   >= 0) row[idx('fullname')]    = name;
    if (idx('role')       >= 0) row[idx('role')]        = String(payload.role       || '').trim();
    if (idx('fellowship') >= 0) row[idx('fellowship')]  = String(payload.fellowship || '').trim();
    if (idx('cadencedays')>= 0) row[idx('cadencedays')] = cadence;
    if (idx('active')     >= 0) row[idx('active')]      = true;
    // New people start as Scheduled with no explicit due date,
    // so they appear in the "No Date Set" bucket until first planning/log.
    if (idx('nextduedate')>= 0) row[idx('nextduedate')] = '';
    if (idx('duestatus')  >= 0) row[idx('duestatus')]   = 'Scheduled';
    if (idx('priority')   >= 0) row[idx('priority')]    = String(payload.priority   || '').trim();

    sheet.appendRow(row);
    cacheBust_();
    return { success: true, personId: pid, name: name };
  } catch(e) {
    return { success: false, error: e.message };
  }
}


// ─── DUPLICATE INTERACTION CHECK ─────────────────────────────

function isDuplicateInteraction_(payload) {
  const cache  = CacheService.getScriptCache();
  const keyObj = {
    personId:           payload.personId           || '',
    result:             payload.result             || '',
    nextAction:         payload.nextAction         || '',
    summary:            (payload.summary           || '').slice(0, 80),
    nextActionDateTime: payload.nextActionDateTime || ''
  };
  const key = 'dup_' + Utilities.base64EncodeWebSafe(JSON.stringify(keyObj)).slice(0, 200);
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

  const now          = new Date();
  const iId          = 'I' + now.getTime();
  const outcomeType  = deriveOutcomeType_(payload.result);
  const nextActionDT = payload.nextActionDateTime ? new Date(payload.nextActionDateTime) : '';
  const channel      = String(payload.channel || 'Call').trim() || 'Call';

  if ((payload.nextAction === 'Callback' || payload.nextAction === 'Follow-up') &&
      !(nextActionDT instanceof Date && !isNaN(nextActionDT))) {
    throw new Error('Callback / follow-up date is required.');
  }

  interactions.appendRow([
    iId, now, payload.personId, payload.fullName || '', channel,
    payload.result, outcomeType, payload.summary || '',
    payload.nextAction || 'None', nextActionDT, true
  ]);
  incrementTodayInteractionCount_(now);

  const pData = getSheetValues_(people);
  const pH    = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pMap  = headerMap_(pH);
  const pIdx  = h => pMap[h];

  for (let i = 1; i < pData.length; i++) {
    if (String(pData[i][pIdx('personid')]) !== String(payload.personId)) continue;

    const rowNum = i + 1;
    const rowVals = pData[i].slice();
    rowVals[pIdx('lastattempt')] = now;

    if (outcomeType === 'Successful') {
      rowVals[pIdx('lastsuccessfulcontact')] = now;
    }

    if (payload.nextAction === 'Callback' || payload.nextAction === 'Follow-up') {
      rowVals[pIdx('nextduedate')] = nextActionDT;
      rowVals[pIdx('duestatus')]   = STATUS_CALL_BACK;
    } else if (outcomeType === 'Successful') {
      const cadence = Number(pData[i][pIdx('cadencedays')]) > 0
        ? Number(pData[i][pIdx('cadencedays')])
        : 30;
      const nextDue = resolveNextActionDateTime_(nextActionDT, cadence, now);
      rowVals[pIdx('nextduedate')] = nextDue;
      rowVals[pIdx('duestatus')]   = STATUS_COMPLETED;
      closeOpenFollowupsForPerson_(followups, payload.personId, now);
    }
    people.getRange(rowNum, 1, 1, pH.length).setValues([rowVals]);

    break;
  }

  if (payload.nextAction && payload.nextAction !== 'None') {
    followups.appendRow([
      'T' + now.getTime(), now, payload.personId, payload.nextAction,
      nextActionDT || '', 'Open', iId, '', ''
    ]);
  }

  cacheBust_();
  return { success: true, interactionId: iId };
}

function todayKey_(dateObj, tz) {
  const d = dateObj instanceof Date ? dateObj : new Date();
  const zone = tz || getSetting_('TIMEZONE') || SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  return Utilities.formatDate(d, zone, 'yyyy-MM-dd');
}

function incrementTodayInteractionCount_(dateObj) {
  try {
    const key = 'todayCountProp:' + todayKey_(dateObj);
    const props = PropertiesService.getScriptProperties();
    const curr = parseInt(props.getProperty(key) || '0', 10) || 0;
    props.setProperty(key, String(curr + 1));
  } catch (e) {}
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


// ─── API: GET DUE PEOPLE ─────────────────────────────────────

function api_getDuePeople() {
  const cached = cacheGet_(CACHE_KEY_DUE);
  if (cached) return cached;

  const result = computeDuePeople_();
  cachePut_(CACHE_KEY_DUE, result);
  return result;
}

function computeDuePeople_() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const people    = ss.getSheetByName(SHEET_PEOPLE);
  const followups = ss.getSheetByName(SHEET_FOLLOWUPS);
  if (!people) return { callbacks:[], overdue:[], today:[], thisWeek:[], nextWeek:[], noDate:[] };

  const pData = getSheetValues_(people);
  if (!pData.length || !pData[0] || !pData[0].length) return { callbacks:[], overdue:[], today:[], thisWeek:[], nextWeek:[], noDate:[] };
  const pH    = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx  = h => pH.indexOf(h);

  const fData = followups ? getSheetValues_(followups) : [[]];
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

  // Only callbacks, overdue, today, thisWeek and nextWeek are returned.
  // People due beyond 14 days are intentionally excluded — they don't need
  // attention yet and would clutter the dashboard.
  // People with no due date at all still appear in noDate.
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

    // Newly added/scheduled people should appear under "No Date Set"
    // until a concrete due date workflow is created for them.
    if (String(status || '').trim().toLowerCase() === 'scheduled') {
      buckets.noDate.push(person);
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
      // Beyond 14 days: intentionally not shown on dashboard.
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

function refreshDueStatuses() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const people    = ss.getSheetByName(SHEET_PEOPLE);
  const followups = ss.getSheetByName(SHEET_FOLLOWUPS);
  if (!people) return;

  const pData = people.getDataRange().getValues();
  const pH    = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx  = h => pH.indexOf(h);
  const dsCol = pIdx('duestatus');

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


// ─── API: TODAY'S CALL COUNT ─────────────────────────────────
// Counts INTERACTIONS rows logged today (true call logs count).
// Used by the "X calls logged today" counter on the dashboard.

function api_getTodayCount() {
  const cached = cacheGet_(CACHE_KEY_TODAY);
  if (cached && typeof cached.count === 'number') return cached;

  const tz = getSetting_('TIMEZONE') || SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  const todayKey = todayKey_(new Date(), tz);
  try {
    const propKey = 'todayCountProp:' + todayKey;
    const propVal = PropertiesService.getScriptProperties().getProperty(propKey);
    if (propVal != null && propVal !== '') {
      const fromProp = { count: parseInt(propVal, 10) || 0 };
      cachePut_(CACHE_KEY_TODAY, fromProp);
      return fromProp;
    }
  } catch (e) {}

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INTERACTIONS);
  if (!sheet) return { count: 0 };

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { count: 0 };

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h).trim().toLowerCase().replace(/\s/g,''));
  const tsIdx = headers.indexOf('timestamp');
  if (tsIdx < 0) return { count: 0 };

  const timestampVals = sheet.getRange(2, tsIdx + 1, lastRow - 1, 1).getValues();
  let count = 0;
  for (let i = 0; i < timestampVals.length; i++) {
    const raw = timestampVals[i][0];
    if (!raw) continue;
    const d = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(d.getTime())) continue;
    const rowDay = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (rowDay === todayKey) count++;
  }

  const result = { count };
  try {
    PropertiesService.getScriptProperties().setProperty('todayCountProp:' + todayKey, String(count));
  } catch (e) {}
  cachePut_(CACHE_KEY_TODAY, result);
  return result;
}


// ─── EMAIL FUNCTIONS ─────────────────────────────────────────

function sendMorningDueNowReminder() {
  const data     = api_getDuePeople();
  const appUrl   = 'https://pikcalltracker.netlify.app/';
  const emails   = getSetting_('REMINDER_EMAIL');
  const notifRaw = String(getSetting_('NOTIFICATIONS_ENABLED') || 'true').trim().toLowerCase();
  const notificationsOn = !(notifRaw === 'false' || notifRaw === '0' || notifRaw === 'off' || notifRaw === 'no');
  const userName = getSetting_('YOUR_NAME') || 'Pastor';
  if (!notificationsOn || !emails || emails === 'true' || emails === 'false') return;

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

  function dueTodayTodos_() {
    try {
      const tz = getSetting_('TIMEZONE') || SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone();
      const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
      const res = api_getTodos('');
      const todos = (res && Array.isArray(res.todos)) ? res.todos : [];
      return todos.filter(t => {
        if (!t || t.done) return false;
        const raw = t.dueDateIso || t.dueDate;
        if (!raw) return false;
        const d = new Date(raw);
        if (isNaN(d.getTime())) return false;
        return Utilities.formatDate(d, tz, 'yyyy-MM-dd') === todayKey;
      });
    } catch (e) {
      return [];
    }
  }

  function todoSection_(todos) {
    if (!todos || !todos.length) return '';
    return `<div style="margin-bottom:22px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;color:#7a5a00;margin-bottom:10px;">Tasks Due Today (${todos.length})</div>
      ${todos.map(function(t){
        return `<div style="border:1px solid #eee0b8;background:#faf5e8;border-radius:16px;padding:14px 16px;margin-bottom:10px;">
          <div style="font-size:15px;font-weight:700;color:#1a1a18;margin-bottom:4px;">${safe_(t.personName || 'My Task')}</div>
          <div style="font-size:13px;color:#5f5d57;line-height:1.6;">${safe_(t.text || '')}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  const dueTodos = dueTodayTodos_();
  const totalDue = (data.callbacks||[]).length + (data.overdue||[]).length + (data.today||[]).length + dueTodos.length;

  const html = `
    <div style="margin:0;padding:24px 0;background:#f4f1eb;font-family:Arial,Helvetica,sans-serif;color:#1a1a18;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e0d5;border-radius:20px;overflow:hidden;">
        <tr><td style="background:#244c43;padding:28px 32px 20px;">
          <div style="font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:#d7c28b;font-weight:700;margin-bottom:8px;">Pastoral Call Tracker</div>
          <div style="font-family:Georgia,serif;font-size:32px;color:#fff;font-weight:700;margin-bottom:10px;">Good morning, ${safe_(userName)}.</div>
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
          ${todoSection_(dueTodos)}
          <div style="text-align:center;margin:22px 0 8px;"><a href="${appUrl}" style="display:inline-block;background:#244c43;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:14px;">Open Dashboard</a></div>
          <div style="text-align:center;font-size:13px;color:#7a7870;margin-top:10px;">Start with callbacks, then overdue, then due today.</div>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e0d5;padding:18px 32px;background:#faf9f6;font-size:12px;color:#7a7870;">This reminder was generated by your Call Tracker system.</td></tr>
      </table>
    </div>`;

  sendEmailToMany_(emails, `Call Tracker — Due Today (${totalDue})`, html);
}

function sendMondayFollowupsThisWeek() {
  const data     = api_getDuePeople();
  const appUrl   = 'https://pikcalltracker.netlify.app/';
  const emails   = getSetting_('REMINDER_EMAIL');
  const notifRaw = String(getSetting_('NOTIFICATIONS_ENABLED') || 'true').trim().toLowerCase();
  const notificationsOn = !(notifRaw === 'false' || notifRaw === '0' || notifRaw === 'off' || notifRaw === 'no');
  const userName = getSetting_('YOUR_NAME') || 'Pastor';
  if (!notificationsOn || !emails || emails === 'true' || emails === 'false') return;

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
          <div style="font-family:Georgia,serif;font-size:32px;color:#fff;font-weight:700;margin-bottom:10px;">Hi ${safe_(userName)}, here's your week.</div>
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
  const cleanSubject = stripEmoji_(subject).replace(/\s{2,}/g, ' ').trim();
  const cleanHtmlBody = stripEmoji_(htmlBody);
  emailsStr.split(',').map(e => e.trim()).filter(Boolean)
    .forEach(email => GmailApp.sendEmail(email, cleanSubject, '', { htmlBody: cleanHtmlBody }));
}

function stripEmoji_(input) {
  return String(input == null ? '' : input)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '');
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


// ─── API: DEBUG ANALYTICS ────────────────────────────────────

function api_debugAnalytics() {
  try {
    const ss         = SpreadsheetApp.getActiveSpreadsheet();
    const interSheet = ss.getSheetByName(SHEET_INTERACTIONS);
    if (!interSheet) return { error: 'No INTERACTIONS sheet' };

    const iData = interSheet.getDataRange().getValues();
    const iH    = iData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const iIdx  = k => iH.indexOf(k);

    const sample = iData.slice(1, 6).map(row => ({
      timestamp:   String(row[iIdx('timestamp')]),
      tsType:      typeof row[iIdx('timestamp')],
      tsIsDate:    row[iIdx('timestamp')] instanceof Date,
      outcometype: row[iIdx('outcometype')],
      result:      row[iIdx('result')],
      personid:    row[iIdx('personid')]
    }));

    return {
      headers:   iH,
      totalRows: iData.length - 1,
      sample,
      now:       new Date().toString()
    };
  } catch(e) {
    return { error: e.message };
  }
}


// ─── API: ANALYTICS ──────────────────────────────────────────

function api_getAnalytics() {
  try {
    const ss          = SpreadsheetApp.getActiveSpreadsheet();
    const interSheet  = ss.getSheetByName(SHEET_INTERACTIONS);
    const peopleSheet = ss.getSheetByName(SHEET_PEOPLE);
    if (!interSheet) return { summary:{}, weeksData:[], silentPeople:[] };

    const iData = interSheet.getDataRange().getValues();
    const iH    = iData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const iIdx  = k => iH.indexOf(k);

    const now    = new Date();
    const msDay  = 86400000;
    const msWeek = 7 * msDay;

    const weekStart = (d) => {
      const dt  = new Date(d);
      const day = dt.getDay();
      const diff = (day === 0 ? -6 : 1 - day);
      const mon = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + diff);
      mon.setHours(0,0,0,0);
      return mon;
    };

    const thisMonday = weekStart(now);
    const weeks = [];
    for (let w = 11; w >= 0; w--) {
      const start = new Date(thisMonday.getTime() - w * msWeek);
      const end   = new Date(start.getTime() + msWeek);
      const label = start.toLocaleDateString('en-US', { month:'short', day:'numeric' });
      weeks.push({ start, end, label, total: 0, reached: 0 });
    }

    const thisWeekStart    = thisMonday;
    const thisWeekEnd      = new Date(thisMonday.getTime() + msWeek);
    const lastContactByPid = {};
    let thisWeekTotal      = 0;

    for (let i = 1; i < iData.length; i++) {
      const row     = iData[i];
      const tsRaw   = row[iIdx('timestamp')];
      const outcome = String(row[iIdx('outcometype')] || '').trim();
      const result  = String(row[iIdx('result')]      || '').trim();
      const pid     = String(row[iIdx('personid')]   || '');
      const name    = String(row[iIdx('fullname')]   || '');
      if (!tsRaw || !pid) continue;

      const ts = tsRaw instanceof Date ? tsRaw : new Date(tsRaw);
      if (isNaN(ts.getTime())) continue;

      const isReached = outcome === 'Successful' || result === 'Reached';

      if (isReached) {
        if (!lastContactByPid[pid] || ts > lastContactByPid[pid].date) {
          lastContactByPid[pid] = { date: ts, name };
        }
      }

      for (let w = 0; w < weeks.length; w++) {
        if (ts >= weeks[w].start && ts < weeks[w].end) {
          weeks[w].total++;
          if (isReached) weeks[w].reached++;
          break;
        }
      }

      if (ts >= thisWeekStart && ts < thisWeekEnd) thisWeekTotal++;
    }

    const thisWkReached = weeks[weeks.length - 1].reached;
    const lastWkReached = weeks[weeks.length - 2] ? weeks[weeks.length - 2].reached : 0;
    let weekChange = null;
    if (lastWkReached > 0) {
      weekChange = Math.round((thisWkReached - lastWkReached) / lastWkReached * 100);
    } else if (thisWkReached > 0) {
      weekChange = 100;
    }

    const uniquePeople  = Object.keys(lastContactByPid).length;
    const sixWeeksAgo   = new Date(now.getTime() - 42 * msDay);
    const pData         = peopleSheet ? peopleSheet.getDataRange().getValues() : [[]];
    const pH            = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const pIdx          = k => pH.indexOf(k);

    const calledThisWeekPids  = new Set();
    const reachedThisWeekPids = new Set();

    for (let i = 1; i < iData.length; i++) {
      const row      = iData[i];
      const tsRaw2   = row[iIdx('timestamp')];
      const outcome2 = String(row[iIdx('outcometype')] || '').trim();
      const result2  = String(row[iIdx('result')]      || '').trim();
      const pid2     = String(row[iIdx('personid')]   || '');
      if (!tsRaw2 || !pid2) continue;
      const ts2 = tsRaw2 instanceof Date ? tsRaw2 : new Date(tsRaw2);
      if (isNaN(ts2.getTime())) continue;
      if (ts2 >= thisWeekStart && ts2 < thisWeekEnd) {
        calledThisWeekPids.add(pid2);
        if (outcome2 === 'Successful' || result2 === 'Reached') {
          reachedThisWeekPids.add(pid2);
        }
      }
    }

    const thisWeekDue        = calledThisWeekPids.size;
    const thisWeekDueReached = reachedThisWeekPids.size;
    const completedThisWeek  = thisWeekDueReached;

    const silentPeople = [];
    for (let i = 1; i < pData.length; i++) {
      if (!isActiveVal_(pData[i][pIdx('active')])) continue;
      const pid  = String(pData[i][pIdx('personid')]);
      const name = String(pData[i][pIdx('fullname')] || '').trim();
      if (!name) continue;

      const last = lastContactByPid[pid];
      if (!last || last.date < sixWeeksAgo) {
        const weeksSince = last ? Math.floor((now - last.date) / msWeek) : null;
        silentPeople.push({
          pid,
          name,
          lastContact: last ? last.date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : null,
          weeksSince
        });
      }
    }
    silentPeople.sort((a, b) => {
      if (!a.lastContact) return -1;
      if (!b.lastContact) return 1;
      return (a.weeksSince || 0) > (b.weeksSince || 0) ? -1 : 1;
    });

    return {
      summary: {
        thisWeekTotal,
        thisWeekDue,
        thisWeekDueReached,
        completedThisWeek,
        weekChange,
        uniquePeople
      },
      weeksData: weeks.map(w => ({
        label:   w.label,
        total:   w.total,
        reached: w.reached
      })),
      silentPeople
    };

  } catch(e) {
    return { error: e.message, summary:{}, weeksData:[], silentPeople:[] };
  }
}


// ─── API: ROLE FREQUENCY ─────────────────────────────────────

function api_getRoleFrequency() {
  try {
    const ss          = SpreadsheetApp.getActiveSpreadsheet();
    const peopleSheet = ss.getSheetByName(SHEET_PEOPLE);
    const interSheet  = ss.getSheetByName(SHEET_INTERACTIONS);
    if (!peopleSheet || !interSheet) return { roles: [] };

    const pData      = peopleSheet.getDataRange().getValues();
    const pH         = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const pIdx       = h => pH.indexOf(h);
    const personRole = {};
    for (let i = 1; i < pData.length; i++) {
      if (!isActiveVal_(pData[i][pIdx('active')])) continue;
      const pid  = String(pData[i][pIdx('personid')]);
      const role = String(pData[i][pIdx('role')] || '').trim() || 'No Role';
      personRole[pid] = role;
    }

    const iData           = interSheet.getDataRange().getValues();
    const iH              = iData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const iIdx            = h => iH.indexOf(h);
    const contactsByPerson = {};

    for (let i = 1; i < iData.length; i++) {
      const outcome = String(iData[i][iIdx('outcometype')] || '').trim();
      const result  = String(iData[i][iIdx('result')]      || '').trim();
      if (outcome !== 'Successful' && result !== 'Reached') continue;
      const pid   = String(iData[i][iIdx('personid')]);
      const tsRaw = iData[i][iIdx('timestamp')];
      if (!tsRaw) continue;
      const d = tsRaw instanceof Date ? tsRaw : new Date(tsRaw);
      if (isNaN(d.getTime())) continue;
      if (!contactsByPerson[pid]) contactsByPerson[pid] = [];
      contactsByPerson[pid].push(d);
    }

    const roleGaps = {};
    for (const [pid, dates] of Object.entries(contactsByPerson)) {
      if (dates.length < 2) continue;
      dates.sort((a, b) => a - b);
      let totalGap = 0;
      for (let i = 1; i < dates.length; i++) {
        totalGap += (dates[i] - dates[i-1]) / 86400000;
      }
      const avgGap = totalGap / (dates.length - 1);
      const role   = personRole[pid] || 'No Role';
      if (!roleGaps[role]) roleGaps[role] = [];
      roleGaps[role].push({ pid, avgGap, contactCount: dates.length });
    }

    const roles = Object.entries(roleGaps).map(([role, people]) => {
      const avgDays = Math.round(people.reduce((s, p) => s + p.avgGap, 0) / people.length);
      return { role, avgDays, peopleCount: people.length };
    }).sort((a, b) => a.avgDays - b.avgDays);

    return { roles };
  } catch(e) {
    return { roles: [], error: e.message };
  }
}


// ─── API: SEARCH INTERACTIONS ────────────────────────────────

function api_searchInteractions(query) {
  if (!query || query.trim().length < 2) return { results: [] };
  const q = query.trim().toLowerCase();

  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const interSheet  = ss.getSheetByName(SHEET_INTERACTIONS);
  const peopleSheet = ss.getSheetByName(SHEET_PEOPLE);
  if (!interSheet) return { results: [] };

  const iData = interSheet.getDataRange().getValues();
  const iH    = iData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const iIdx  = k => iH.indexOf(k);

  const nameMap = {};
  if (peopleSheet) {
    const pData = peopleSheet.getDataRange().getValues();
    const pH    = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const pIdx  = k => pH.indexOf(k);
    for (let i = 1; i < pData.length; i++) {
      nameMap[String(pData[i][pIdx('personid')])] = String(pData[i][pIdx('fullname')] || '');
    }
  }

  const results = [];
  for (let i = 1; i < iData.length; i++) {
    const row     = iData[i];
    const summary = String(row[iIdx('summary')]    || '').toLowerCase();
    const result  = String(row[iIdx('result')]     || '').toLowerCase();
    const name    = String(row[iIdx('fullname')]   || '').toLowerCase();
    const next    = String(row[iIdx('nextaction')] || '').toLowerCase();

    if (summary.indexOf(q) >= 0 || result.indexOf(q) >= 0 ||
        name.indexOf(q) >= 0 || next.indexOf(q) >= 0) {
      const pid   = String(row[iIdx('personid')] || '');
      const tsRaw = row[iIdx('timestamp')];
      results.push({
        interactionId: row[iIdx('interactionid')] || '',
        personId:      pid,
        personName:    nameMap[pid] || row[iIdx('fullname')] || '',
        timestamp:     tsRaw ? formatDate_(tsRaw) : '',
        result:        row[iIdx('result')]      || '',
        outcome:       row[iIdx('outcometype')] || '',
        summary:       row[iIdx('summary')]     || '',
        nextAction:    row[iIdx('nextaction')]  || ''
      });
    }
  }

  results.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  return { results: results.slice(0, 50), total: results.length, query };
}


// ─── API: PERSON NOTES ───────────────────────────────────────

function api_getPersonNotes(personId) {
  if (!personId) return { notes: '' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
  if (!sheet) return { notes: '' };

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const idx     = h => headers.indexOf(h);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idx('personid')]) === String(personId)) {
      const notesCol = idx('notes');
      const notes    = notesCol >= 0 ? String(data[i][notesCol] || '') : '';
      return { notes, personId };
    }
  }
  return { notes: '', personId };
}

function api_savePersonNotes(personId, notes) {
  if (!personId) return { success: false, error: 'Missing personId.' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEOPLE);
  if (!sheet) return { success: false, error: 'PEOPLE sheet not found.' };

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const idx     = h => headers.indexOf(h);

  let notesCol = idx('notes');
  if (notesCol < 0) {
    const newCol = data[0].length + 1;
    sheet.getRange(1, newCol).setValue('Notes').setFontWeight('bold')
      .setBackground('#1a73e8').setFontColor('#ffffff');
    notesCol = newCol - 1;
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idx('personid')]) === String(personId)) {
      sheet.getRange(i + 1, notesCol + 1).setValue(notes || '');
      return { success: true };
    }
  }
  return { success: false, error: 'Person not found.' };
}



// ─── API: TODOS ──────────────────────────────────────────────

function api_getTodos(personId) {
  try {
    const cached = cacheGet_(CACHE_KEY_TODOS_ALL);
    if (cached && Array.isArray(cached.todos)) {
      const filtered = personId
        ? cached.todos.filter(t => String(t.personId) === String(personId))
        : cached.todos;
      return { todos: filtered };
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TODOS);
    if (!sheet || sheet.getLastRow() < 2) return { todos: [] };
    ensureTodoDueDateColumn_(sheet);

    const data    = getSheetValues_(sheet);
    if (!data.length || !data[0] || !data[0].length) return { todos: [] };
    const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const idx     = h => headers.indexOf(h);

    const todos = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (personId && String(row[idx('personid')]) !== String(personId)) continue;
      todos.push({
        id:            String(row[idx('todoid')]        || ''),
        createdAt:     row[idx('createdat')] ? formatDate_(row[idx('createdat')]) : '',
        personId:      String(row[idx('personid')]      || ''),
        personName:    String(row[idx('personname')]    || ''),
        interactionId: String(row[idx('interactionid')] || ''),
        text:          String(row[idx('text')]          || ''),
        dueDate:       (idx('duedate') >= 0 && row[idx('duedate')]) ? formatDate_(row[idx('duedate')]) : '',
        dueDateIso:    (idx('duedate') >= 0 && row[idx('duedate')]) ? Utilities.formatDate(new Date(row[idx('duedate')]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
        done:          row[idx('done')] === true || String(row[idx('done')]).toUpperCase() === 'TRUE',
        completedAt:   row[idx('completedat')] ? formatDate_(row[idx('completedat')]) : '',
        _dueRaw:       (idx('duedate') >= 0 ? row[idx('duedate')] : ''),
        _createdRaw:   row[idx('createdat')] || ''
      });
    }

    // Open todos first, then done; within each group newest first
    todos.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const ad = a._dueRaw ? new Date(a._dueRaw).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b._dueRaw ? new Date(b._dueRaw).getTime() : Number.MAX_SAFE_INTEGER;
      if (ad !== bd) return ad - bd; // earlier due first
      return new Date(b._createdRaw || 0).getTime() - new Date(a._createdRaw || 0).getTime();
    });

    todos.forEach(t => { delete t._createdRaw; delete t._dueRaw; });
    cachePut_(CACHE_KEY_TODOS_ALL, { todos: todos });

    if (personId) {
      return { todos: todos.filter(t => String(t.personId) === String(personId)) };
    }
    return { todos };
  } catch(e) {
    return { todos: [], error: e.message };
  }
}

function api_saveTodos(payload) {
  try {
    const { interactionId, personId, personName, todos } = payload;
    if (!personId || !Array.isArray(todos) || !todos.length) return { success: false, error: 'Missing fields.' };

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_TODOS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_TODOS);
      sheet.getRange(1,1,1,9).setValues([['TodoID','CreatedAt','PersonID','PersonName','InteractionID','Text','DueDate','Done','CompletedAt']])
        .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    }
    ensureTodoDueDateColumn_(sheet);

    const now = new Date();
    todos.forEach((t, i) => {
      const text = String(t.text || '').trim();
      if (!text) return;
      const dueDate = parseDueDate_(t.dueDate);
      sheet.appendRow([
        'TD' + now.getTime() + '_' + i,
        now,
        personId,
        personName || '',
        interactionId || '',
        text,
        dueDate || '',
        false,
        ''
      ]);
    });

    cacheBust_();
    return { success: true, saved: todos.length };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function api_updateTodo(todoId, done) {
  try {
    if (!todoId) return { success: false, error: 'Missing todoId.' };
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TODOS);
    if (!sheet) return { success: false, error: 'TODOS sheet not found.' };
    if (sheet.getLastRow() < 2) return { success: false, error: 'Todo not found.' };
    ensureTodoDueDateColumn_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const hMap = headerMap_(headers);
    const idx  = h => hMap[h];
    const isDone  = done === 'true';
    if (idx('todoid') < 0 || idx('done') < 0 || idx('completedat') < 0) {
      return { success: false, error: 'TODOS headers are invalid.' };
    }
    const idCol = idx('todoid') + 1;
    const found = sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1)
      .createTextFinder(String(todoId))
      .matchEntireCell(true)
      .findNext();
    if (!found) return { success: false, error: 'Todo not found.' };
    const row = found.getRow();
    sheet.getRange(row, idx('done') + 1).setValue(isDone);
    sheet.getRange(row, idx('completedat') + 1).setValue(isDone ? new Date() : '');
    cacheBust_();
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
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
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const people    = ss.getSheetByName('PEOPLE');
  const followups = ss.getSheetByName('FOLLOWUPS');
  const pData     = people.getDataRange().getValues();
  const pH        = pData[0].map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
  const pIdx      = h => pH.indexOf(h);
  const fData     = followups ? followups.getDataRange().getValues() : [[]];
  const fH        = fData[0].map(h => String(h).trim().toLowerCase().replace(/\s/g,''));
  const fIdx      = h => fH.indexOf(h);

  Logger.log('PEOPLE HEADERS: '   + JSON.stringify(pH));
  Logger.log('FOLLOWUP HEADERS: ' + JSON.stringify(fH));

  for (let i = 1; i < pData.length; i++) {
    Logger.log(JSON.stringify({
      row:       i+1,
      name:      pData[i][pIdx('fullname')],
      activeRaw: pData[i][pIdx('active')],
      isActive:  isActiveVal_(pData[i][pIdx('active')]),
      dueRaw:    pData[i][pIdx('nextduedate')]
    }));
  }

  Logger.log(JSON.stringify(computeDuePeople_(), null, 2));
}

function api_updateTodoText(todoId, text) {
  try {
    if (!todoId) return { success: false, error: 'Missing todoId.' };
    const nextText = String(text || '').trim();
    if (!nextText) return { success: false, error: 'Task text cannot be empty.' };

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TODOS);
    if (!sheet) return { success: false, error: 'TODOS sheet not found.' };
    if (sheet.getLastRow() < 2) return { success: false, error: 'Todo not found.' };
    ensureTodoDueDateColumn_(sheet);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const hMap = headerMap_(headers);
    const idIdx = hMap['todoid'];
    const textIdx = hMap['text'];
    if (idIdx < 0 || textIdx < 0) return { success: false, error: 'TODOS headers are invalid.' };
    const found = sheet.getRange(2, idIdx + 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(String(todoId))
      .matchEntireCell(true)
      .findNext();
    if (!found) return { success: false, error: 'Todo not found.' };
    sheet.getRange(found.getRow(), textIdx + 1).setValue(nextText);
    cacheBust_();
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function api_deleteTodo(todoId) {
  try {
    if (!todoId) return { success: false, error: 'Missing todoId.' };
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TODOS);
    if (!sheet) return { success: false, error: 'TODOS sheet not found.' };
    if (sheet.getLastRow() < 2) return { success: false, error: 'Todo not found.' };
    ensureTodoDueDateColumn_(sheet);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const hMap = headerMap_(headers);
    const idIdx = hMap['todoid'];
    if (idIdx < 0) return { success: false, error: 'TODOS headers are invalid.' };
    const found = sheet.getRange(2, idIdx + 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(String(todoId))
      .matchEntireCell(true)
      .findNext();
    if (!found) return { success: false, error: 'Todo not found.' };
    sheet.deleteRow(found.getRow());
    cacheBust_();
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function api_updateTodoDueDate(todoId, dueDate) {
  try {
    if (!todoId) return { success: false, error: 'Missing todoId.' };
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TODOS);
    if (!sheet) return { success: false, error: 'TODOS sheet not found.' };
    if (sheet.getLastRow() < 2) return { success: false, error: 'Todo not found.' };
    ensureTodoDueDateColumn_(sheet);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const hMap = headerMap_(headers);
    const idIdx = hMap['todoid'];
    const dueIdx = hMap['duedate'];
    if (idIdx < 0 || dueIdx < 0) return { success: false, error: 'TODOS headers are invalid.' };

    const found = sheet.getRange(2, idIdx + 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(String(todoId))
      .matchEntireCell(true)
      .findNext();
    if (!found) return { success: false, error: 'Todo not found.' };

    const parsed = parseDueDate_(dueDate);
    sheet.getRange(found.getRow(), dueIdx + 1).setValue(parsed || '');
    cacheBust_();
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function ensureSettingKey_(sheet, key, defaultVal) {
  if (!sheet || !key) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() === String(key).trim().toUpperCase()) return;
  }
  sheet.appendRow([key, defaultVal == null ? '' : defaultVal]);
}

function api_updateTodoAssignee(todoId, personId, personName) {
  try {
    if (!todoId) return { success: false, error: 'Missing todoId.' };
    if (!personId) return { success: false, error: 'Missing personId.' };

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TODOS);
    if (!sheet) return { success: false, error: 'TODOS sheet not found.' };
    if (sheet.getLastRow() < 2) return { success: false, error: 'Todo not found.' };
    ensureTodoDueDateColumn_(sheet);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(h => h.toString().trim().toLowerCase().replace(/\s/g,''));
    const hMap = headerMap_(headers);
    const idIdx = hMap['todoid'];
    const pidIdx = hMap['personid'];
    const pnameIdx = hMap['personname'];
    if (idIdx < 0 || pidIdx < 0 || pnameIdx < 0) {
      return { success: false, error: 'TODOS headers are invalid.' };
    }

    const found = sheet.getRange(2, idIdx + 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(String(todoId))
      .matchEntireCell(true)
      .findNext();
    if (!found) return { success: false, error: 'Todo not found.' };

    const row = found.getRow();
    const nextName = String(personName || '').trim();
    sheet.getRange(row, pidIdx + 1).setValue(String(personId));
    sheet.getRange(row, pnameIdx + 1).setValue(nextName || 'My Tasks');
    cacheBust_();
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function ensureTodoDueDateColumn_(sheet) {
  const sh = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TODOS);
  if (!sh) return false;
  const headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(h => String(h).trim());
  const normalized = headerRow.map(h => h.toLowerCase().replace(/\s/g,''));
  if (normalized.indexOf('duedate') >= 0) return true;

  const donePos = normalized.indexOf('done');
  if (donePos >= 0) {
    sh.insertColumnBefore(donePos + 1);
    sh.getRange(1, donePos + 1).setValue('DueDate')
      .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  } else {
    const newCol = sh.getLastColumn() + 1;
    sh.getRange(1, newCol).setValue('DueDate')
      .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  }
  return true;
}

function parseDueDate_(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  d.setHours(0, 0, 0, 0);
  return d;
}
