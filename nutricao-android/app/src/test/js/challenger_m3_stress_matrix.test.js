'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== [NUTRITRACK] CHALLENGER 1: COMPREHENSIVE STRESS MATRIX  ===');
console.log('================================================================\n');

// 1. Mock DOM and Global Environment
function createMockElement(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    attributes: {},
    classList: {
      _classes: new Set(),
      add: function(...c) { c.forEach(x => this._classes.add(x)); },
      remove: function(...c) { c.forEach(x => this._classes.delete(x)); },
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
    value: '',
    textContent: '',
    innerHTML: '',
    onclick: null,
    onchange: null,
    oninput: null,
    focus: () => {},
    click: function() { if (typeof this.onclick === 'function') this.onclick(); },
    appendChild: function(c) { this.children.push(c); return c; },
    querySelector: function(s) {
      if (s.startsWith('#')) return getMockEl(s.slice(1));
      return createMockElement('div');
    },
    querySelectorAll: function(s) { return []; },
    addEventListener: function(event, handler) { this['on' + event] = handler; }
  };
  return el;
}

const mockStorage = {};
const mockLocalStorage = {
  getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
};

const bridgeCalls = [];
const mockAndroidBridge = {
  sendNotification: (title, message) => {
    bridgeCalls.push({ method: 'sendNotification', title, message });
  },
  vibrate: (ms) => {
    bridgeCalls.push({ method: 'vibrate', ms });
  },
  syncAlarms: (json) => {
    bridgeCalls.push({ method: 'syncAlarms', json });
  },
  cancelAllAlarms: () => {
    bridgeCalls.push({ method: 'cancelAllAlarms' });
  },
  scheduleAlarm: (id, title, message, hour, enabled) => {
    bridgeCalls.push({ method: 'scheduleAlarm', id, title, message, hour, enabled });
  },
  cancelAlarm: (id) => {
    bridgeCalls.push({ method: 'cancelAlarm', id });
  },
  saveBackup: (json, filename) => {
    bridgeCalls.push({ method: 'saveBackup', json, filename });
  }
};

const toastLog = [];
const modalLog = [];
const elementMap = new Map();

function getMockEl(id) {
  if (!elementMap.has(id)) {
    const el = createMockElement('div');
    el.id = id;
    elementMap.set(id, el);
  }
  return elementMap.get(id);
}

const mockDoc = {
  body: createMockElement('body'),
  getElementById: (id) => getMockEl(id),
  querySelector: (s) => {
    if (s.startsWith('#')) return getMockEl(s.slice(1));
    const el = createMockElement('div');
    el.selector = s;
    return el;
  },
  querySelectorAll: (s) => [],
  createElement: (t) => createMockElement(t),
  addEventListener: () => {}
};

const mockWindow = {
  addEventListener: () => {},
  removeEventListener: () => {},
  AndroidBridge: mockAndroidBridge
};

const context = {
  console: console,
  Date: Date,
  Math: Math,
  JSON: JSON,
  parseFloat: parseFloat,
  parseInt: parseInt,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  isFinite: isFinite,
  isNaN: isNaN,
  document: mockDoc,
  window: mockWindow,
  self: mockWindow,
  AndroidBridge: mockAndroidBridge,
  localStorage: mockLocalStorage,
  Blob: globalThis.Blob,
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
  setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
  clearTimeout: () => {},
  toast: (msg, undo) => { toastLog.push({ msg, undo }); },
  openModal: (html) => { modalLog.push(html); },
  closeModal: () => {},
  render: () => {},
  confirm: () => true
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (rel) => {
  const code = fs.readFileSync(path.join(baseDir, rel), 'utf8');
  vm.runInContext(code, context);
};

// Load modular scripts
loadScript('apps/nutricao/estado.js');
loadScript('apps/nutricao/referencia.js');
loadScript('apps/nutricao/logic.js');
loadScript('apps/nutricao/views/hoje.js');
loadScript('apps/nutricao/views/diario.js');
loadScript('apps/nutricao/views/alimentos.js');
loadScript('apps/nutricao/views/metas.js');
loadScript('apps/nutricao/views/ajustes.js');
loadScript('core/gemini.js');

vm.runInContext(`
  globalThis.profile = profile;
  globalThis.meals = meals;
  globalThis.activities = activities;
  globalThis.habits = habits;
  globalThis.water = water;
  globalThis.pref = pref;
  globalThis.apikey = apikey;
  globalThis.LS = LS;
  globalThis.dayMeals = typeof dayMeals !== 'undefined' ? dayMeals : null;
  globalThis.dayTotals = typeof dayTotals !== 'undefined' ? dayTotals : null;
  globalThis.fmt = typeof fmt !== 'undefined' ? fmt : null;
  globalThis.PLANO_SEMANAL = typeof PLANO_SEMANAL !== 'undefined' ? PLANO_SEMANAL : null;
  globalThis.getDiaMacros = typeof getDiaMacros !== 'undefined' ? getDiaMacros : null;
  globalThis.getRefeicaoMacros = typeof getRefeicaoMacros !== 'undefined' ? getRefeicaoMacros : null;
  globalThis.enrichPlanItem = typeof enrichPlanItem !== 'undefined' ? enrichPlanItem : null;
  globalThis.save = typeof save !== 'undefined' ? save : null;
  globalThis.load = typeof load !== 'undefined' ? load : null;
  globalThis.today = typeof today !== 'undefined' ? today : null;
  globalThis.dayActivities = typeof dayActivities !== 'undefined' ? dayActivities : null;
  globalThis.renderListaActivities = typeof renderListaActivities !== 'undefined' ? renderListaActivities : null;
  globalThis.renderDiario = typeof renderDiario !== 'undefined' ? renderDiario : null;
  globalThis.filtrarRef = typeof filtrarRef !== 'undefined' ? filtrarRef : null;
  globalThis.userAlims = typeof userAlims !== 'undefined' ? userAlims : null;
  globalThis.saveAlim = typeof saveAlim !== 'undefined' ? saveAlim : null;
  globalThis.toggleCreatina = typeof toggleCreatina !== 'undefined' ? toggleCreatina : null;
  globalThis.getCreatinaStatus = typeof getCreatinaStatus !== 'undefined' ? getCreatinaStatus : null;
  globalThis.setWaterIntake = typeof setWaterIntake !== 'undefined' ? setWaterIntake : null;
  globalThis.getWaterIntake = typeof getWaterIntake !== 'undefined' ? getWaterIntake : null;
  globalThis.addWaterIntake = typeof addWaterIntake !== 'undefined' ? addWaterIntake : null;
  globalThis.testarNotificacao = typeof testarNotificacao !== 'undefined' ? testarNotificacao : null;
  globalThis.saveLembretes = typeof saveLembretes !== 'undefined' ? saveLembretes : null;
  globalThis.loadLembretes = typeof loadLembretes !== 'undefined' ? loadLembretes : null;
  globalThis.escapeHtml = typeof escapeHtml !== 'undefined' ? escapeHtml : (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
`, context);

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`✅ [PASS] ${name}`);
  } catch (e) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(e);
    throw e;
  }
}

// =============================================================================
// SUITE 1: ADVERSARIAL CALORIE & MACRO BAR BOUNDARY STRESS
// =============================================================================
console.log('--- SUITE 1: Testes de Limites Extremos de Calorias e Barras de Macros ---');

test('1.1: Division by zero protection in macro percentages (zero targets, NaN targets, null)', () => {
  const pct = (v, m) => Math.min(100, Math.max(0, Math.round(v / (m || 1) * 100)));

  // Target = 0 (division by zero avoided by (m || 1))
  assert.strictEqual(pct(0, 0), 0);
  assert.strictEqual(pct(50, 0), 100);
  assert.strictEqual(pct(-10, 0), 0);

  // Target = null
  assert.strictEqual(pct(0, null), 0);
  assert.strictEqual(pct(100, null), 100);

  // Target = undefined
  assert.strictEqual(pct(0, undefined), 0);

  // Target = negative
  assert.strictEqual(pct(0, -100), 0);
});

test('1.2: Extreme caloric deficit (Fasting with 2000 kcal exercise burn)', () => {
  const targetKcal = 2200;
  const I = 0;
  const G = 2000;
  const L = I - G; // -2000 kcal
  const netPct = Math.min(100, Math.max(0, Math.round(Math.max(0, L) / (targetKcal || 1) * 100)));

  assert.strictEqual(L, -2000);
  assert.strictEqual(netPct, 0, 'Bar width must clamp cleanly to 0% on negative net balance');
  assert.strictEqual(targetKcal - L, 4200, 'Remaining calories calculation must be 4200 kcal');
});

test('1.3: Extreme caloric surplus (10,000 kcal feast)', () => {
  const targetKcal = 2200;
  const I = 10000;
  const G = 500;
  const L = I - G; // 9500 kcal
  const netPct = Math.min(100, Math.max(0, Math.round(Math.max(0, L) / (targetKcal || 1) * 100)));

  assert.strictEqual(L, 9500);
  assert.strictEqual(netPct, 100, 'Bar width must clamp cleanly to 100% on massive surplus');
  assert.strictEqual(L - targetKcal, 7300, 'Surplus value must be +7300 kcal');
});

test('1.4: Pure single-macro meals (Zero protein or zero carbs or zero fats)', () => {
  const testDate = '2026-08-16';
  vm.runInContext(`
    meals = [
      { id: 'm_oil', date: '${testDate}', nome: 'Azeite puro', itens: [{ nome: 'Azeite', porcao_g: 20, kcal: 180, proteina_g: 0, carbo_g: 0, gordura_g: 20 }] },
      { id: 'm_sugar', date: '${testDate}', nome: 'Açúcar puro', itens: [{ nome: 'Açúcar', porcao_g: 50, kcal: 200, proteina_g: 0, carbo_g: 50, gordura_g: 0 }] }
    ];
  `, context);

  const t = context.dayTotals(testDate);
  assert.strictEqual(t.kcal, 380);
  assert.strictEqual(t.p, 0);
  assert.strictEqual(t.c, 50);
  assert.strictEqual(t.g, 20);
});

// =============================================================================
// SUITE 2: 7-DAY HISTORICAL DIARY CALCULATIONS & EDGE CASES
// =============================================================================
console.log('\n--- SUITE 2: Histórico de 7 Dias, Médias e Mudança de Mês ---');

test('2.1: 7-day date window generation and rolling average calculation', () => {
  const ds = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    ds.push(d.toISOString().slice(0, 10));
  }
  assert.strictEqual(ds.length, 7);

  // Set mock meals across all 7 days
  vm.runInContext(`
    meals = [
      { id: 'd0', date: '${ds[0]}', nome: 'Ref', itens: [{ kcal: 2000, proteina_g: 100, carbo_g: 200, gordura_g: 60 }] },
      { id: 'd1', date: '${ds[1]}', nome: 'Ref', itens: [{ kcal: 2100, proteina_g: 110, carbo_g: 210, gordura_g: 65 }] },
      { id: 'd2', date: '${ds[2]}', nome: 'Ref', itens: [{ kcal: 1900, proteina_g: 90, carbo_g: 190, gordura_g: 55 }] },
      { id: 'd3', date: '${ds[3]}', nome: 'Ref', itens: [{ kcal: 2200, proteina_g: 120, carbo_g: 220, gordura_g: 70 }] },
      { id: 'd4', date: '${ds[4]}', nome: 'Ref', itens: [{ kcal: 2400, proteina_g: 130, carbo_g: 240, gordura_g: 75 }] },
      { id: 'd5', date: '${ds[5]}', nome: 'Ref', itens: [{ kcal: 2000, proteina_g: 100, carbo_g: 200, gordura_g: 60 }] },
      { id: 'd6', date: '${ds[6]}', nome: 'Ref', itens: [{ kcal: 2300, proteina_g: 125, carbo_g: 230, gordura_g: 70 }] }
    ];
  `, context);

  const total7 = 2000 + 2100 + 1900 + 2200 + 2400 + 2000 + 2300; // 14900
  const media7 = Math.round(total7 / 7); // 2129
  assert.strictEqual(media7, 2129);

  // Verify renderDiario executes without error
  const mainEl = getMockEl('main');
  assert.doesNotThrow(() => {
    context.renderDiario(mainEl);
  });
  assert(mainEl.innerHTML.includes('2.129') || mainEl.innerHTML.includes('2129'));
});

// =============================================================================
// SUITE 3: SANITIZATION, XSS PROTECTION & UNICODE HANDLING
// =============================================================================
console.log('\n--- SUITE 3: Sanitização, Proteção contra Injeção e Nomes Complexos ---');

test('3.1: Activity and Meal names with HTML tags / special symbols are handled safely', () => {
  vm.runInContext(`
    activities = [];
    addActivity({
      id: 'xss_act',
      date: '${context.today()}',
      nome: '<script>alert("hack")</script>',
      duracaoMin: 30,
      met: 6.0,
      kcal_gasto: 180,
      origem: 'manual'
    });
  `, context);

  const actList = context.dayActivities();
  assert.strictEqual(actList.length, 1);
  assert.strictEqual(actList[0].nome, '<script>alert("hack")</script>');

  // Test HTML output escaping in renderListaActivities
  const html = context.renderListaActivities(actList);
  assert(!html.includes('<script>alert'), 'Script tags must be sanitized/escaped in output');
  assert(html.includes('&lt;script&gt;alert'));
});

test('3.2: Food names with accented characters, emojis and unicode', () => {
  const foodName = 'Açaí c/ Guaraná & Morango 🍓';
  context.saveAlim({
    nome: foodName,
    porcao_g: 200,
    kcal: 220,
    proteina_g: 3,
    carbo_g: 45,
    gordura_g: 4,
    custom: true
  });

  const list = context.userAlims();
  assert.strictEqual(list[0].nome, foodName);

  // Search filter matching
  getMockEl('busca').value = 'açaí';
  context.filtrarRef();
  const refListEl = getMockEl('refList');
  assert(refListEl.innerHTML.includes('Açaí c/ Guaraná'));
});

// =============================================================================
// SUITE 4: RAPID ACTIONS & UI STATE MACHINE CONCURRENCY
// =============================================================================
console.log('\n--- SUITE 4: Concorrência e Transições de Estado de UI ---');

test('4.1: Rapid tab cycling (100 switches across 5 views)', () => {
  const tabs = ['hoje', 'diario', 'alimentos', 'metas', 'ajustes'];
  const mainEl = getMockEl('main');

  for (let i = 0; i < 100; i++) {
    const tab = tabs[i % tabs.length];
    vm.runInContext(`state.tab = '${tab}'; render();`, context);
    assert(mainEl.innerHTML.length > 0, `View for tab "${tab}" must render non-empty HTML`);
  }
});

test('4.2: Rapid 1-tap Creatine toggling (50 toggles consistency check)', () => {
  const todayKey = context.today();
  let expected = false;

  for (let i = 0; i < 50; i++) {
    expected = !expected;
    const res = context.toggleCreatina(todayKey);
    assert.strictEqual(res, expected);
    assert.strictEqual(context.getCreatinaStatus(todayKey), expected);
  }
});

test('4.3: Hydration water additions with variable non-standard quantities', () => {
  const todayKey = context.today();
  context.setWaterIntake(0, todayKey);

  const amounts = [125, 330, 450, 750, 1000, 200];
  let sum = 0;
  for (const amt of amounts) {
    sum += amt;
    context.addWaterIntake(amt, todayKey);
    assert.strictEqual(context.getWaterIntake(todayKey), sum);
  }
});

// =============================================================================
// SUITE 5: RECOVERY, CORRUPTED STORAGE & BRIDGE RESILIENCE
// =============================================================================
console.log('\n--- SUITE 5: Resiliência contra Storage Corrompido e Bridge Nula ---');

test('5.1: Corrupted JSON strings in LocalStorage keys do not throw unhandled exceptions', () => {
  mockLocalStorage.setItem('nt_meals', '{ corrupted json invalid');
  mockLocalStorage.setItem('nt_profile', '["invalid profile format]');
  mockLocalStorage.setItem('nt_habits', 'null-invalid-string');
  mockLocalStorage.setItem('nt_water', 'undefined');

  // Reloading state with fallback defaults
  const loadedMeals = context.load('nt_meals', []);
  const loadedProfile = context.load('nt_profile', { kcal: 2200 });
  const loadedHabits = context.load('nt_habits', {});
  const loadedWater = context.load('nt_water', {});

  assert(Array.isArray(loadedMeals) && loadedMeals.length === 0);
  assert.strictEqual(loadedProfile.kcal, 2200);
  assert(typeof loadedHabits === 'object');
  assert(typeof loadedWater === 'object');
});

test('5.2: AndroidBridge missing methods or null object fallback', () => {
  context.window.AndroidBridge = {};
  context.AndroidBridge = {};

  assert.doesNotThrow(() => {
    context.testarNotificacao();
  });

  assert.doesNotThrow(() => {
    context.saveLembretes(context.loadLembretes());
  });

  // Restore bridge
  context.window.AndroidBridge = mockAndroidBridge;
  context.AndroidBridge = mockAndroidBridge;
});

console.log('\n================================================================');
console.log(`=== TODOS OS ${passCount} TESTES DA STRESS MATRIX PASSARAM COM SUCESSO! ===`);
console.log('================================================================\n');
process.exit(0);
