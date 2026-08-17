'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- Mock DOM & Storage Harness ---
function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(),
    attributes: {},
    classList: {
      _classes: new Set(),
      add: function(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove: function(...cls) { cls.forEach(c => this._classes.delete(c)); },
      toggle: function(c, force) {
        if (force === true) { this._classes.add(c); return true; }
        if (force === false) { this._classes.delete(c); return false; }
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        this._classes.add(c); return true;
      },
      contains: function(c) { return this._classes.has(c); }
    },
    style: {},
    children: [],
    parentElement: null,
    value: '',
    textContent: '',
    _innerHTML: '',
    onclick: null,
    listeners: {},
    addEventListener: function(evt, fn) {
      if (!this.listeners[evt]) this.listeners[evt] = [];
      this.listeners[evt].push(fn);
    },
    removeEventListener: function(evt, fn) {
      if (this.listeners[evt]) {
        this.listeners[evt] = this.listeners[evt].filter(f => f !== fn);
      }
    },
    setAttribute: function(name, val) { this.attributes[name] = String(val); },
    getAttribute: function(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; },
    removeAttribute: function(name) { delete this.attributes[name]; },
    hasAttribute: function(name) { return this.attributes[name] !== undefined; },
    appendChild: function(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    scrollIntoView: function() {},
    focus: function() {},
    click: function() {
      if (typeof this.onclick === 'function') {
        this.onclick({ currentTarget: this, target: this, preventDefault: () => {}, stopPropagation: () => {} });
      }
    },
    querySelector: function(sel) { return null; },
    querySelectorAll: function(sel) { return []; }
  };

  Object.defineProperty(el, 'innerHTML', {
    get: function() { return this._innerHTML; },
    set: function(val) {
      this._innerHTML = val;
      this.children = [];
    }
  });

  return el;
}

const storageMap = new Map();
const localStorageMock = {
  getItem: (k) => storageMap.has(k) ? storageMap.get(k) : null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
};

const appContainer = createMockElement('div');
appContainer.setAttribute('id', 'app');

const toastElement = createMockElement('div');
toastElement.setAttribute('id', 'toast');

const windowObj = {
  addEventListener: () => {},
  removeEventListener: () => {},
  scrollTo: () => {},
  AndroidBridge: null
};

// --- Timezone Mock Helper ---
// Creates a custom MockDate that strictly models local year/month/day/time and negative UTC offset
class MockDateTime {
  constructor(year, month, day, hours = 0, minutes = 0, seconds = 0, ms = 0, offsetMinutes = -180) {
    this._year = year;
    this._month = month; // 1-indexed (1 = Jan, 8 = Aug, 12 = Dec)
    this._day = day;
    this._hours = hours;
    this._minutes = minutes;
    this._seconds = seconds;
    this._ms = ms;
    this._offsetMinutes = offsetMinutes; // e.g. -180 for UTC-3
  }

  getFullYear() { return this._year; }
  getMonth() { return this._month - 1; } // 0-indexed per JS standard
  getDate() { return this._day; }
  getHours() { return this._hours; }
  getMinutes() { return this._minutes; }
  getSeconds() { return this._seconds; }
  getMilliseconds() { return this._ms; }
  getTimezoneOffset() { return -this._offsetMinutes; } // JS Date convention: UTC-3 is +180

  getDay() {
    // Determine day of week for local calendar date
    const d = new Date(Date.UTC(this._year, this._month - 1, this._day, 12, 0, 0));
    return d.getUTCDay();
  }

  getTime() {
    // UTC Epoch ms = Local time converted to UTC
    const localUtcMs = Date.UTC(this._year, this._month - 1, this._day, this._hours, this._minutes, this._seconds, this._ms);
    return localUtcMs - (this._offsetMinutes * 60 * 1000);
  }

  toISOString() {
    const utcEpoch = this.getTime();
    const d = new Date(utcEpoch);
    return d.toISOString();
  }

  valueOf() {
    return this.getTime();
  }
}

let activeMockNow = null;

// Context setup
const context = {
  console: console,
  Date: class extends Date {
    constructor(...args) {
      if (args.length === 0 && activeMockNow) {
        return activeMockNow;
      }
      super(...args);
    }
    static now() {
      if (activeMockNow) return activeMockNow.getTime();
      return Date.now();
    }
  },
  Math: Math,
  JSON: JSON,
  parseFloat: parseFloat,
  parseInt: parseInt,
  isFinite: isFinite,
  isNaN: isNaN,
  String: String,
  Array: Array,
  Object: Object,
  Number: Number,
  document: {
    getElementById: (id) => {
      if (id === 'app') return appContainer;
      if (id === 'toast') return toastElement;
      return createMockElement('div');
    },
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  window: windowObj,
  self: windowObj,
  localStorage: localStorageMock,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('apps/nutricao/estado.js');
loadScript('apps/nutricao/logic.js');
loadScript('apps/nutricao/views/hoje.js');
loadScript('apps/nutricao/views/diario.js');

vm.runInContext(`
  globalThis.getMeals = () => meals;
  globalThis.setMeals = (m) => { meals = m; };
  globalThis.addMealToState = (m) => { meals.push(m); };
`, context);

console.log('=== [NUTRITRACK] Executando Suíte de Regressão R4 (r4_nutricao_regression.test.js) ===\n');

// -----------------------------------------------------------------------------
// SUITE 1: STRICT LOCAL TIMEZONE CALCULATION ACROSS NIGHTTIME HOURS IN NEGATIVE OFFSETS (R3)
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Strict Local Timezone Calculation in Negative Offsets (UTC-3 to UTC-8) ---');

// Test 1.1: UTC-3 (Brasília / São Paulo, -180m) across nighttime hours
{
  console.log('Test 1.1: UTC-3 across nighttime hours (20:00, 21:00, 21:30, 22:45, 23:59:59)');
  const offset = -180;
  const testCases = [
    { h: 20, m: 0, s: 0 },
    { h: 21, m: 0, s: 0 },
    { h: 21, m: 30, s: 0 },
    { h: 22, m: 45, s: 0 },
    { h: 23, m: 59, s: 59 }
  ];

  testCases.forEach(tc => {
    const mock = new MockDateTime(2026, 8, 17, tc.h, tc.m, tc.s, 0, offset);
    activeMockNow = mock;

    const todayVal = context.today();
    const dateKeyVal = context.dateKey(mock);
    const localDateStrVal = context.localDateStr(mock);
    const todayIsoVal = context.todayISO();

    // Verify UTC drift would produce tomorrow in toISOString
    if (tc.h >= 21) {
      assert(mock.toISOString().startsWith('2026-08-18'), `At ${tc.h}:${tc.m} UTC is already tomorrow (2026-08-18)`);
    }

    // Strict assertions: All NutriTrack date functions must return the local calendar date
    assert.strictEqual(todayVal, '2026-08-17', `today() at ${tc.h}:${tc.m} UTC-3 must be '2026-08-17'`);
    assert.strictEqual(dateKeyVal, '2026-08-17', `dateKey() at ${tc.h}:${tc.m} UTC-3 must be '2026-08-17'`);
    assert.strictEqual(localDateStrVal, '2026-08-17', `localDateStr() at ${tc.h}:${tc.m} UTC-3 must be '2026-08-17'`);
    assert.strictEqual(todayIsoVal, '2026-08-17', `todayISO() at ${tc.h}:${tc.m} UTC-3 must be '2026-08-17'`);

    // Verify horaNow formatting in local 24h time
    const expectedHourStr = String(tc.h).padStart(2, '0') + ':' + String(tc.m).padStart(2, '0');
    assert.strictEqual(context.horaNow(mock), expectedHourStr, `horaNow() must be ${expectedHourStr}`);
  });
}

// Test 1.2: UTC-4 (Manaus / Santiago, -240m) across nighttime hours
{
  console.log('Test 1.2: UTC-4 across nighttime hours (20:00, 22:00, 23:59:59)');
  const offset = -240;
  const testCases = [
    { h: 20, m: 0, s: 0 },
    { h: 22, m: 0, s: 0 },
    { h: 23, m: 59, s: 59 }
  ];

  testCases.forEach(tc => {
    const mock = new MockDateTime(2026, 8, 17, tc.h, tc.m, tc.s, 0, offset);
    activeMockNow = mock;

    assert.strictEqual(context.today(), '2026-08-17', `today() at ${tc.h}:${tc.m} UTC-4 must be '2026-08-17'`);
    assert.strictEqual(context.dateKey(mock), '2026-08-17');
    assert.strictEqual(context.localDateStr(mock), '2026-08-17');
    assert.strictEqual(context.todayISO(), '2026-08-17');
  });
}

// Test 1.3: UTC-5 (Bogota / Lima / New York EST, -300m) across nighttime hours
{
  console.log('Test 1.3: UTC-5 across nighttime hours (20:00, 23:45, 23:59:59)');
  const offset = -300;
  const testCases = [
    { h: 20, m: 0, s: 0 },
    { h: 23, m: 45, s: 0 },
    { h: 23, m: 59, s: 59 }
  ];

  testCases.forEach(tc => {
    const mock = new MockDateTime(2026, 8, 17, tc.h, tc.m, tc.s, 0, offset);
    activeMockNow = mock;

    assert.strictEqual(context.today(), '2026-08-17', `today() at ${tc.h}:${tc.m} UTC-5 must be '2026-08-17'`);
    assert.strictEqual(context.dateKey(mock), '2026-08-17');
    assert.strictEqual(context.localDateStr(mock), '2026-08-17');
  });
}

// Test 1.4: UTC-8 (Los Angeles PST / Pacific, -480m) across nighttime hours
{
  console.log('Test 1.4: UTC-8 across nighttime hours (20:00, 23:30, 23:59:59)');
  const offset = -480;
  const testCases = [
    { h: 20, m: 0, s: 0 },
    { h: 23, m: 30, s: 0 },
    { h: 23, m: 59, s: 59 }
  ];

  testCases.forEach(tc => {
    const mock = new MockDateTime(2026, 8, 17, tc.h, tc.m, tc.s, 0, offset);
    activeMockNow = mock;

    assert.strictEqual(context.today(), '2026-08-17', `today() at ${tc.h}:${tc.m} UTC-8 must be '2026-08-17'`);
    assert.strictEqual(context.dateKey(mock), '2026-08-17');
    assert.strictEqual(context.localDateStr(mock), '2026-08-17');
  });
}

// -----------------------------------------------------------------------------
// SUITE 2: MIDNIGHT ROLLOVER BOUNDARIES (23:59:59 -> 00:00:01) (R3)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Midnight Rollover Boundaries (23:59:59 -> 00:00:01) ---');

// Test 2.1: Strict date change at 00:00:00 local time
{
  console.log('Test 2.1: Local date changes strictly at local midnight in UTC-3');
  const offset = -180;

  // 1 second before midnight: 23:59:59 on Aug 17
  const preMidnight = new MockDateTime(2026, 8, 17, 23, 59, 59, 0, offset);
  activeMockNow = preMidnight;
  assert.strictEqual(context.today(), '2026-08-17', '23:59:59 must be 2026-08-17');

  // Exact midnight: 00:00:00 on Aug 18
  const midnight = new MockDateTime(2026, 8, 18, 0, 0, 0, 0, offset);
  activeMockNow = midnight;
  assert.strictEqual(context.today(), '2026-08-18', '00:00:00 must flip to 2026-08-18');

  // 1 second after midnight: 00:00:01 on Aug 18
  const postMidnight = new MockDateTime(2026, 8, 18, 0, 0, 1, 0, offset);
  activeMockNow = postMidnight;
  assert.strictEqual(context.today(), '2026-08-18', '00:00:01 must be 2026-08-18');
}

// -----------------------------------------------------------------------------
// SUITE 3: MONTH-END AND YEAR-END BOUNDARIES (R3)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Month-End and Year-End Boundaries ---');

// Test 3.1: August 31, 23:30 (Month transition to September in UTC-3)
{
  console.log('Test 3.1: August 31, 23:30 (Month-end boundary in UTC-3)');
  const offset = -180;

  const aug31Night = new MockDateTime(2026, 8, 31, 23, 30, 0, 0, offset);
  activeMockNow = aug31Night;

  // In UTC, this is September 1st, 02:30 AM
  assert(aug31Night.toISOString().startsWith('2026-09-01'), 'UTC string is Sept 1');
  assert.strictEqual(context.today(), '2026-08-31', 'today() must be Aug 31');
  assert.strictEqual(context.dateKey(aug31Night), '2026-08-31');

  // September 1, 00:00:01
  const sep1Morning = new MockDateTime(2026, 9, 1, 0, 0, 1, 0, offset);
  activeMockNow = sep1Morning;
  assert.strictEqual(context.today(), '2026-09-01', 'today() flips to Sept 1 at local midnight');
}

// Test 3.2: December 31, 23:45 (Year transition to next year in UTC-3)
{
  console.log('Test 3.2: December 31, 23:45 (Year-end boundary in UTC-3)');
  const offset = -180;

  const dec31Night = new MockDateTime(2026, 12, 31, 23, 45, 0, 0, offset);
  activeMockNow = dec31Night;

  // In UTC, this is January 1st of the next year (2027-01-01)
  assert(dec31Night.toISOString().startsWith('2027-01-01'), 'UTC string is 2027-01-01');
  assert.strictEqual(context.today(), '2026-12-31', 'today() must remain 2026-12-31');
  assert.strictEqual(context.dateKey(dec31Night), '2026-12-31');

  // January 1, 00:00:01
  const jan1Morning = new MockDateTime(2027, 1, 1, 0, 0, 1, 0, offset);
  activeMockNow = jan1Morning;
  assert.strictEqual(context.today(), '2027-01-01', 'today() flips to 2027-01-01 at local midnight');
}

// Test 3.3: Leap Year: February 28 / February 29 (Year 2028 in UTC-3)
{
  console.log('Test 3.3: Leap year boundaries (Feb 28 23:59 -> Feb 29 23:59 in 2028)');
  const offset = -180;

  const feb28 = new MockDateTime(2028, 2, 28, 23, 59, 0, 0, offset);
  activeMockNow = feb28;
  assert.strictEqual(context.today(), '2028-02-28');

  const feb29 = new MockDateTime(2028, 2, 29, 23, 59, 59, 0, offset);
  activeMockNow = feb29;
  assert.strictEqual(context.today(), '2028-02-29', 'Leap day Feb 29 preserved');

  const mar1 = new MockDateTime(2028, 3, 1, 0, 0, 1, 0, offset);
  activeMockNow = mar1;
  assert.strictEqual(context.today(), '2028-03-01', 'March 1 starts after leap day');
}

// -----------------------------------------------------------------------------
// SUITE 4: STATE INTEGRITY ACROSS MEALS, BURNED CALORIES, WATER, CREATINE & DIARY (R3 & R4.3)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: State Integrity Across Meals, Activity, Water, Creatine & Diary ---');

// Test 4.1: Late night meal recording and dayMeals/dayTotals retrieval
{
  console.log('Test 4.1: Late night meal addition at 22:30 UTC-3 assigned to current local date');
  const offset = -180;
  const lateNight = new MockDateTime(2026, 8, 17, 22, 30, 0, 0, offset);
  activeMockNow = lateNight;

  context.setMeals([]);
  const currentDate = context.today(); // '2026-08-17'

  // Add meal at 22:30
  const meal = {
    id: 'm_late_1',
    date: currentDate,
    hour: context.horaNow(lateNight),
    nome: 'Ceia Noturna',
    itens: [
      { nome: 'Iogurte Natural', porcao_g: 170, kcal: 120, proteina_g: 10, carbo_g: 12, gordura_g: 4 },
      { nome: 'Whey Protein', porcao_g: 30, kcal: 120, proteina_g: 24, carbo_g: 2, gordura_g: 1 }
    ],
    origem: 'manual'
  };
  context.addMealToState(meal);

  // Retrieve today's meals
  const todaysMeals = context.dayMeals();
  assert.strictEqual(todaysMeals.length, 1, 'Refeição noturna deve ser recuperada em dayMeals()');
  assert.strictEqual(todaysMeals[0].date, '2026-08-17');
  assert.strictEqual(todaysMeals[0].hour, '22:30');

  // Verify totals
  const totals = context.dayTotals();
  assert.strictEqual(totals.kcal, 240, 'Total de calorias deve ser 240 kcal');
  assert.strictEqual(totals.p, 34, 'Total de proteína deve ser 34g');

  // Query next day: should be empty
  assert.strictEqual(context.dayMeals('2026-08-18').length, 0, 'Dia seguinte não deve conter refeições');
}

// Test 4.2: Late night activity recording and dayBurned calculation
{
  console.log('Test 4.2: Late night activity at 23:15 UTC-3 assigned to current local date');
  const offset = -180;
  const lateNight = new MockDateTime(2026, 8, 17, 23, 15, 0, 0, offset);
  activeMockNow = lateNight;

  context.activities = [];
  context.addActivity({
    nome: 'Alongamento & Mobilidade',
    duracaoMin: 30,
    kcal_gasto: 95,
    origem: 'manual'
  });

  const acts = context.dayActivities();
  assert.strictEqual(acts.length, 1, 'Atividade deve ser registrada para hoje');
  assert.strictEqual(acts[0].date, '2026-08-17');
  assert.strictEqual(acts[0].hour, '23:15');

  const burned = context.dayBurned();
  assert.strictEqual(burned, 95, 'Gasto calórico do dia deve ser 95 kcal');
}

// Test 4.3: Hydration state (getWaterIntake / addWaterIntake) late night isolation
{
  console.log('Test 4.3: Hydration logging at 22:45 UTC-3 persists to current local date');
  const offset = -180;
  const lateNight = new MockDateTime(2026, 8, 17, 22, 45, 0, 0, offset);
  activeMockNow = lateNight;

  context.water = {};
  context.setWaterIntake(0);

  context.addWaterIntake(500);
  context.addWaterIntake(250);

  assert.strictEqual(context.getWaterIntake(), 750, 'Consumo de água deve ser 750 mL para 2026-08-17');
  assert.strictEqual(context.getWaterIntake('2026-08-18'), 0, 'Dia 2026-08-18 deve iniciar zerado');
}

// Test 4.4: Creatine status (getCreatinaStatus / toggleCreatina) late night isolation
{
  console.log('Test 4.4: Creatine tracking at 23:45 UTC-3 persists to current local date');
  const offset = -180;
  const lateNight = new MockDateTime(2026, 8, 17, 23, 45, 0, 0, offset);
  activeMockNow = lateNight;

  context.habits = {};
  assert.strictEqual(context.getCreatinaStatus(), false, 'Status inicial false');

  context.toggleCreatina();
  assert.strictEqual(context.getCreatinaStatus(), true, 'Creatina tomada hoje (2026-08-17)');
  assert.strictEqual(context.getCreatinaStatus('2026-08-18'), false, 'Amanhã deve iniciar como false (reset diário)');
}

// Test 4.5: Diary 7-Day Window evaluation at late night hour
{
  console.log('Test 4.5: Diary 7-Day Window calculated relative to local date across midnight boundary');
  const offset = -180;
  const lateNight = new MockDateTime(2026, 8, 17, 22, 45, 0, 0, offset);
  activeMockNow = lateNight;

  // Build the 7-day window using the same logic as renderDiario in diario.js
  const ds = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(activeMockNow.getFullYear(), activeMockNow.getMonth(), activeMockNow.getDate() - i);
    ds.push(context.dateKey(d));
  }

  assert.strictEqual(ds.length, 7, 'Janela do diário deve conter exatamente 7 dias');
  assert.strictEqual(ds[6], '2026-08-17', 'O último dia da janela deve ser hoje (2026-08-17)');
  assert.strictEqual(ds[0], '2026-08-11', 'O primeiro dia da janela deve ser 2026-08-11');
  assert.deepStrictEqual(ds, [
    '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17'
  ], 'Os 7 dias devem ser contíguos e alinhados à timezone local');
}

// Reset active mock
activeMockNow = null;

console.log('\n======================================================');
console.log('r4_nutricao_regression.test.js: OK (Todos os testes passaram com sucesso!)');
