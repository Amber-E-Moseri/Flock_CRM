const fs = require('fs');
const path = require('path');
const vm = require('vm');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateUtc(date, format) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  if (format === 'yyyy-MM-dd') {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  if (format === 'MMM d, yyyy') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  }
  return d.toISOString();
}

class MockRange {
  constructor(sheet, row, col, numRows = 1, numCols = 1) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
    this._finderOptions = null;
  }

  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r += 1) {
      const rowIdx = this.row - 1 + r;
      const row = this.sheet.rows[rowIdx] || [];
      const vals = [];
      for (let c = 0; c < this.numCols; c += 1) {
        vals.push(row[this.col - 1 + c] !== undefined ? row[this.col - 1 + c] : '');
      }
      out.push(vals);
    }
    return out;
  }

  setValues(values) {
    for (let r = 0; r < values.length; r += 1) {
      const rowIdx = this.row - 1 + r;
      if (!this.sheet.rows[rowIdx]) this.sheet.rows[rowIdx] = [];
      for (let c = 0; c < values[r].length; c += 1) {
        this.sheet.rows[rowIdx][this.col - 1 + c] = values[r][c];
      }
    }
    return this;
  }

  setValue(value) {
    return this.setValues([[value]]);
  }

  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }

  createTextFinder(text) {
    this._finderOptions = { text: String(text), matchEntireCell: false };
    return this;
  }

  matchEntireCell(flag) {
    if (this._finderOptions) this._finderOptions.matchEntireCell = !!flag;
    return this;
  }

  findNext() {
    if (!this._finderOptions) return null;
    const target = this._finderOptions.text;
    for (let r = this.row - 1; r < this.row - 1 + this.numRows; r += 1) {
      const row = this.sheet.rows[r] || [];
      const val = String(row[this.col - 1] ?? '');
      const ok = this._finderOptions.matchEntireCell ? (val === target) : val.includes(target);
      if (ok) {
        return { getRow: () => r + 1 };
      }
    }
    return null;
  }
}

class MockSheet {
  constructor(name, rows) {
    this.name = name;
    this.rows = (rows || []).map((r) => r.slice());
  }

  getDataRange() {
    return new MockRange(this, 1, 1, this.getLastRow(), this.getLastColumn());
  }

  getRange(row, col, numRows = 1, numCols = 1) {
    return new MockRange(this, row, col, numRows, numCols);
  }

  getLastRow() {
    return this.rows.length;
  }

  getLastColumn() {
    if (!this.rows.length) return 0;
    return this.rows.reduce((m, r) => Math.max(m, r.length), 0);
  }

  appendRow(row) {
    this.rows.push(row.slice());
  }

  deleteRow(rowNumber) {
    this.rows.splice(rowNumber - 1, 1);
  }

  insertColumnBefore(colNumber) {
    this.rows = this.rows.map((r) => {
      const next = r.slice();
      next.splice(colNumber - 1, 0, '');
      return next;
    });
  }
}

class MockSpreadsheet {
  constructor(sheetMap) {
    this.sheets = {};
    Object.keys(sheetMap || {}).forEach((name) => {
      this.sheets[name] = new MockSheet(name, sheetMap[name]);
    });
  }

  getSheetByName(name) {
    return this.sheets[name] || null;
  }

  insertSheet(name) {
    const sh = new MockSheet(name, []);
    this.sheets[name] = sh;
    return sh;
  }

  getSpreadsheetTimeZone() {
    return 'UTC';
  }
}

function createCache() {
  const map = new Map();
  return {
    map,
    get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    put(key, value) {
      map.set(key, String(value));
    },
    remove(key) {
      map.delete(key);
    },
    removeAll(keys) {
      (keys || []).forEach((k) => map.delete(k));
    }
  };
}

function createHarness(options = {}) {
  const spreadsheet = new MockSpreadsheet(options.sheets || {});
  const scriptCache = createCache();
  const scriptProperties = new Map();

  const context = {
    console,
    Date,
    JSON,
    Math,
    Object,
    String,
    Number,
    Boolean,
    Array,
    RegExp,
    Set,
    Map,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    ScriptApp: {
      getService() {
        return { getUrl: () => 'https://example.test/exec' };
      },
      getProjectTriggers() { return []; },
      deleteTrigger() {},
      newTrigger() {
        const chain = {
          timeBased: () => chain,
          everyDays: () => chain,
          atHour: () => chain,
          onWeekDay: () => chain,
          create: () => chain
        };
        return chain;
      },
      WeekDay: { MONDAY: 'MONDAY' }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      getActive: () => spreadsheet,
      getUi: () => ({ alert() {}, createMenu: () => ({ addItem() { return this; }, addToUi() {} }) })
    },
    CacheService: {
      getScriptCache: () => scriptCache
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => scriptProperties.has(k) ? scriptProperties.get(k) : null,
        setProperty: (k, v) => { scriptProperties.set(k, String(v)); }
      })
    },
    Utilities: {
      formatDate: (date, _tz, format) => formatDateUtc(date, format),
      base64EncodeWebSafe: (input) => Buffer.from(String(input), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    },
    Session: {
      getScriptTimeZone: () => 'UTC'
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {}
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({
        content: String(text),
        setMimeType() { return this; },
        getContent() { return this.content; }
      })
    },
    GmailApp: { sendEmail() {} },
    Logger: { log() {} }
  };

  vm.createContext(context);
  const codePath = path.resolve(__dirname, '../../code.gs');
  const code = fs.readFileSync(codePath, 'utf8');
  vm.runInContext(code, context, { filename: 'code.gs' });

  return {
    context,
    spreadsheet,
    scriptCache,
    scriptProperties
  };
}

module.exports = { createHarness };
