const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/gas-test-harness');

function parseJsonOutput(textOutput) {
  return JSON.parse(textOutput.getContent());
}

function baseSheets() {
  return {
    PEOPLE: [[
      'PersonID', 'FullName', 'Role', 'CadenceDays', 'Active',
      'LastAttempt', 'LastSuccessfulContact', 'NextDueDate', 'DueStatus', 'Priority', 'Fellowship', 'Notes'
    ]],
    INTERACTIONS: [[
      'InteractionID', 'Timestamp', 'PersonID', 'FullName', 'Channel',
      'Result', 'OutcomeType', 'Summary', 'NextAction', 'NextActionDateTime', 'Processed'
    ]],
    FOLLOWUPS: [[
      'TaskID', 'CreatedAt', 'PersonID', 'TaskType', 'DueDateTime',
      'Status', 'LinkedInteractionID', 'CompletedAt', 'CompletionNote'
    ]],
    SETTINGS: [
      ['NOTIFICATIONS_ENABLED', 'true'],
      ['TIMEZONE', 'UTC'],
      ['YOUR_NAME', 'Pastor']
    ],
    TODOS: [[
      'TodoID', 'CreatedAt', 'PersonID', 'PersonName', 'InteractionID', 'Text', 'DueDate', 'Done', 'CompletedAt'
    ]]
  };
}

test('sanitize_ trims and enforces max length', () => {
  const { context } = createHarness({ sheets: baseSheets() });
  assert.equal(context.sanitize_('  hello  ', 10), 'hello');
  assert.throws(() => context.sanitize_('x'.repeat(11), 10), /max length/i);
});

test('doPost handles malformed JSON payload safely', () => {
  const { context } = createHarness({ sheets: baseSheets() });
  const out = context.doPost({ postData: { contents: '{bad json' }, parameter: {} });
  const body = parseJsonOutput(out);
  assert.equal(body.success, false);
  assert.match(body.error, /Invalid JSON body/i);
});

test('normalizeResponse_ returns predictable shapes', () => {
  const { context } = createHarness({ sheets: baseSheets() });
  assert.equal(JSON.stringify(context.normalizeResponse_([1, 2])), JSON.stringify({ success: true, data: [1, 2] }));
  assert.equal(JSON.stringify(context.normalizeResponse_({ a: 1 })), JSON.stringify({ success: true, a: 1 }));
  assert.equal(JSON.stringify(context.normalizeResponse_({ error: 'x' })), JSON.stringify({ success: false, error: 'x' }));
});

test('api_saveInteraction rejects callback/follow-up without date', () => {
  const sheets = baseSheets();
  sheets.PEOPLE.push(['P1', 'Alice', 'Member', 14, true, '', '', '', 'To Be Reached', '', '', '']);
  const { context } = createHarness({ sheets });
  const res = context.api_saveInteraction({
    personId: 'P1',
    fullName: 'Alice',
    result: 'Reached',
    nextAction: 'Callback',
    summary: 'Need to call back'
  });
  assert.equal(res.success, false);
  assert.match(res.error, /date is required/i);
});

test('api_saveInteraction updates interaction + people and auto-closes open followups', () => {
  const sheets = baseSheets();
  sheets.PEOPLE.push(['P1', 'Alice', 'Member', 7, true, '', '', '', 'To Be Reached', '', '', '']);
  sheets.FOLLOWUPS.push(['T1', new Date('2026-01-01T00:00:00Z'), 'P1', 'Callback', new Date('2026-01-05T00:00:00Z'), 'Open', 'I-old', '', '']);
  const h = createHarness({ sheets });

  h.scriptCache.put('duePeople', '{"x":1}');
  const res = h.context.api_saveInteraction({
    personId: 'P1',
    fullName: 'Alice',
    result: 'Reached',
    nextAction: 'None',
    summary: 'Great conversation'
  });

  assert.equal(res.success, true);
  const interactions = h.spreadsheet.getSheetByName('INTERACTIONS').rows;
  assert.equal(interactions.length, 2);
  assert.equal(interactions[1][2], 'P1');
  assert.equal(interactions[1][5], 'Reached');
  assert.equal(interactions[1][6], 'Successful');

  const people = h.spreadsheet.getSheetByName('PEOPLE').rows[1];
  assert.ok(people[5] instanceof Date);
  assert.ok(people[6] instanceof Date);
  assert.equal(people[8], 'Completed');
  assert.ok(people[7] instanceof Date);

  const followup = h.spreadsheet.getSheetByName('FOLLOWUPS').rows[1];
  assert.equal(followup[5], 'Done');
  assert.ok(followup[7] instanceof Date);
  assert.match(String(followup[8]), /Auto-closed/i);

  assert.equal(h.scriptCache.get('duePeople'), null);
});

test('api_saveInteraction with nextAction creates follow-up row and sets callback status', () => {
  const sheets = baseSheets();
  sheets.PEOPLE.push(['P2', 'Bob', 'Member', 30, true, '', '', '', 'To Be Reached', '', '', '']);
  const h = createHarness({ sheets });
  const dueIso = '2026-04-20T10:30:00Z';

  const res = h.context.api_saveInteraction({
    personId: 'P2',
    fullName: 'Bob',
    result: 'No Answer',
    nextAction: 'Callback',
    nextActionDateTime: dueIso,
    summary: 'No answer'
  });

  assert.equal(res.success, true);
  const people = h.spreadsheet.getSheetByName('PEOPLE').rows[1];
  assert.equal(people[8], 'Call Back');
  assert.ok(people[7] instanceof Date);

  const followups = h.spreadsheet.getSheetByName('FOLLOWUPS').rows;
  assert.equal(followups.length, 2);
  assert.equal(followups[1][2], 'P2');
  assert.equal(followups[1][3], 'Callback');
  assert.equal(followups[1][5], 'Open');
});

test('duplicate prevention blocks immediate duplicate interaction payload', () => {
  const sheets = baseSheets();
  sheets.PEOPLE.push(['P3', 'Cara', 'Member', 30, true, '', '', '', 'To Be Reached', '', '', '']);
  const { context } = createHarness({ sheets });
  const payload = {
    personId: 'P3',
    fullName: 'Cara',
    result: 'Reached',
    nextAction: 'None',
    summary: 'Same note'
  };
  const first = context.api_saveInteraction(payload);
  const second = context.api_saveInteraction(payload);
  assert.equal(first.success, true);
  assert.equal(second.success, false);
  assert.match(second.error, /Duplicate blocked/i);
});

test('computeDuePeople buckets callbacks, overdue, today and noDate correctly', () => {
  const sheets = baseSheets();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
  const inThreeDays = new Date(now.getTime() + 3 * 86400000);
  sheets.PEOPLE.push(['P10', 'Callback Person', '', 30, true, '', '', inThreeDays, 'To Be Reached', '', '', '']);
  sheets.PEOPLE.push(['P11', 'Overdue Person', '', 30, true, '', '', yesterday, 'To Be Reached', '', '', '']);
  sheets.PEOPLE.push(['P12', 'Today Person', '', 30, true, '', '', today, 'To Be Reached', '', '', '']);
  sheets.PEOPLE.push(['P13', 'Scheduled Person', '', 30, true, '', '', '', 'Scheduled', '', '', '']);
  sheets.PEOPLE.push(['P14', 'NoDate Person', '', 30, true, '', '', '', '', '', '', '']);
  sheets.FOLLOWUPS.push(['F1', now, 'P10', 'Callback', inThreeDays, 'Open', 'I1', '', '']);

  const { context } = createHarness({ sheets });
  const result = context.computeDuePeople_();
  assert.equal(result.callbacks.length, 1);
  assert.equal(result.overdue.length, 1);
  assert.equal(result.today.length, 1);
  assert.equal(result.noDate.length, 2);
});

test('doGet blocks write actions via GET', () => {
  const { context } = createHarness({ sheets: baseSheets() });
  const out = context.doGet({ parameter: { action: 'saveInteraction' } });
  const body = parseJsonOutput(out);
  assert.equal(body.success, false);
  assert.match(body.error, /requires POST/i);
});

test('api_addPerson rejects duplicate active name', () => {
  const sheets = baseSheets();
  sheets.PEOPLE.push(['P50', 'Existing Person', 'Member', 28, true, '', '', '', 'Scheduled', '', '', '']);
  const { context } = createHarness({ sheets });
  const res = context.api_addPerson({ name: 'existing person', cadenceDays: 30 });
  assert.equal(res.success, false);
  assert.match(res.error, /already exists/i);
});

process.on('exit', () => {
  if (process.exitCode === undefined) {
    process.exitCode = 0;
  }
});
