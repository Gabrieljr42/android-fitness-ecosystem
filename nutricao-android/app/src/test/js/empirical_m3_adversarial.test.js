'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== [NUTRITRACK] EMPIRICAL ADVERSARIAL STRESS SUITE (M3)     ===');
console.log('================================================================\n');

// 1. Mock DOM and Global Environment
function createMockElement(tag = 'div') {
  return {
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
    querySelector: function(s) { return createMockElement('div'); },
    querySelectorAll: function(s) { return []; },
    addEventListener: function(event, handler) { this['on' + event] = handler; }
  };
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

// Load NutriTrack scripts in exact browser order
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
  globalThis.save = typeof save !== 'undefined' ? save : null;
  globalThis.load = typeof load !== 'undefined' ? load : null;
  globalThis.dayMeals = typeof dayMeals !== 'undefined' ? dayMeals : null;
  globalThis.dayTotals = typeof dayTotals !== 'undefined' ? dayTotals : null;
  globalThis.fmt = typeof fmt !== 'undefined' ? fmt : null;
  globalThis.PLANO_SEMANAL = typeof PLANO_SEMANAL !== 'undefined' ? PLANO_SEMANAL : null;
  globalThis.getDiaMacros = typeof getDiaMacros !== 'undefined' ? getDiaMacros : null;
  globalThis.getRefeicaoMacros = typeof getRefeicaoMacros !== 'undefined' ? getRefeicaoMacros : null;
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
// SECTION 1: MIFFLIN-ST JEOR TDEE MATHEMATICAL ACCURACY & INVARIANTS
// =============================================================================
console.log('--- SEÇÃO 1: Matemática Mifflin-St Jeor, BMR e TDEE ---');

test('1.1: BMR formula verification for males and females across age and weight spectrums', () => {
  // Test Male: 10 * peso + 6.25 * alt - 5 * idade + 5
  // Test Female: 10 * peso + 6.25 * alt - 5 * idade - 161
  const profiles = [
    { peso: 70, alt: 175, idade: 25, bmrM: 10*70 + 6.25*175 - 5*25 + 5, bmrF: 10*70 + 6.25*175 - 5*25 - 161 },
    { peso: 50, alt: 160, idade: 30, bmrM: 10*50 + 6.25*160 - 5*30 + 5, bmrF: 10*50 + 6.25*160 - 5*30 - 161 },
    { peso: 100, alt: 190, idade: 40, bmrM: 10*100 + 6.25*190 - 5*40 + 5, bmrF: 10*100 + 6.25*190 - 5*40 - 161 },
    { peso: 130, alt: 180, idade: 60, bmrM: 10*130 + 6.25*180 - 5*60 + 5, bmrF: 10*130 + 6.25*180 - 5*60 - 161 }
  ];

  for (const p of profiles) {
    const resM = context.calcBMR({ peso: p.peso, altura: p.alt, idade: p.idade, sexo: 'm' });
    const resF = context.calcBMR({ peso: p.peso, altura: p.alt, idade: p.idade, sexo: 'f' });
    assert.strictEqual(resM, p.bmrM);
    assert.strictEqual(resF, p.bmrF);
    assert.strictEqual(resM - resF, 166, 'Diferença de sexo deve ser exatamente 166 kcal');
  }
});

test('1.2: TDEE calculation with global profile and PAL factor variations', () => {
  context.profile.peso = 75;
  context.profile.altura = 175;
  context.profile.idade = 30;
  context.profile.sexo = 'm';
  context.profile.atividade = 1.4;

  // BMR = 10*75 + 6.25*175 - 5*30 + 5 = 1698.75
  // TDEE = 1698.75 * 1.4 = 2378.25 -> 2378
  assert.strictEqual(context.calcTDEE(), 2378);

  // PAL = 1.2 (Sedentário) -> 1698.75 * 1.2 = 2038.5 -> 2039
  context.profile.atividade = 1.2;
  assert.strictEqual(context.calcTDEE(), 2039);

  // PAL = 1.6 (Moderado) -> 1698.75 * 1.6 = 2718
  context.profile.atividade = 1.6;
  assert.strictEqual(context.calcTDEE(), 2718);

  // PAL = 1.8 (Intenso) -> 1698.75 * 1.8 = 3057.75 -> 3058
  context.profile.atividade = 1.8;
  assert.strictEqual(context.calcTDEE(), 3058);

  // Check Female profile
  context.profile.sexo = 'f';
  context.profile.atividade = 1.4;
  // BMR = 10*75 + 6.25*175 - 5*30 - 161 = 1532.75
  // TDEE = 1532.75 * 1.4 = 2145.85 -> 2146
  assert.strictEqual(context.calcTDEE(), 2146);
});

test('1.3: Robustness against null, undefined, empty, or zero biometrics', () => {
  assert(Number.isFinite(context.calcBMR(null)));
  assert(Number.isFinite(context.calcBMR({})));
  assert(Number.isFinite(context.calcBMR({ peso: 0, altura: 0, idade: 0 })));
  assert(Number.isFinite(context.calcTDEE()));
});

// =============================================================================
// SECTION 2: MACRO BAR PERCENTAGES & BOUNDARY CONDITIONS
// =============================================================================
console.log('\n--- SEÇÃO 2: Barras de Macros, Balanço Energético e Limites Numéricos ---');

test('2.1: Macro percentage clamping function (0% to 100%) and division-by-zero defense', () => {
  const pct = (v, m) => Math.min(100, Math.max(0, Math.round(v / (m || 1) * 100)));

  // Zero consumed with standard target
  assert.strictEqual(pct(0, 150), 0);

  // Partial consumption (50%)
  assert.strictEqual(pct(75, 150), 50);

  // Exact target reached (100%)
  assert.strictEqual(pct(150, 150), 100);

  // Surplus / overflow (200%) -> clamped to 100%
  assert.strictEqual(pct(300, 150), 100);
  assert.strictEqual(pct(1000, 150), 100);

  // Zero target (division by zero protection)
  assert.strictEqual(pct(0, 0), 0);
  assert.strictEqual(pct(100, 0), 100);

  // Null / undefined target
  assert.strictEqual(pct(0, null), 0);
  assert.strictEqual(pct(50, null), 100);
  assert.strictEqual(pct(0, undefined), 0);
  assert.strictEqual(pct(50, undefined), 100);
});

test('2.2: Net Energy Balance (I - G = L) under Deficit, Zero Intake, Fasting & Surplus', () => {
  const targetKcal = 2200;

  // Case A: Deficit (I = 1800, G = 400 => L = 1400, Deficit = 800)
  {
    const I = 1800, G = 400;
    const L = I - G;
    const isSurplus = L > targetKcal;
    const remaining = targetKcal - L;
    assert.strictEqual(L, 1400);
    assert.strictEqual(isSurplus, false);
    assert.strictEqual(remaining, 800);
  }

  // Case B: Fasting with heavy exercise (I = 0, G = 900 => L = -900)
  {
    const I = 0, G = 900;
    const L = I - G;
    const netPct = Math.min(100, Math.max(0, Math.round(Math.max(0, L) / (targetKcal || 1) * 100)));
    assert.strictEqual(L, -900);
    assert.strictEqual(netPct, 0, 'Saldo líquido negativo deve resultar em barra de 0% sem quebra');
  }

  // Case C: Huge Surplus (I = 4500, G = 300 => L = 4200, Surplus = +2000)
  {
    const I = 4500, G = 300;
    const L = I - G;
    const isSurplus = L > targetKcal;
    const surplusVal = L - targetKcal;
    const netPct = Math.min(100, Math.max(0, Math.round(Math.max(0, L) / (targetKcal || 1) * 100)));
    assert.strictEqual(L, 4200);
    assert.strictEqual(isSurplus, true);
    assert.strictEqual(surplusVal, 2000);
    assert.strictEqual(netPct, 100);
  }
});

test('2.3: Zero grams macro boundaries (zero protein, carb, fat meals)', () => {
  context.meals.length = 0;
  const testDate = '2026-08-16';

  // Add meal with only protein
  context.meals.push({
    id: 'm_prot_only',
    date: testDate,
    nome: 'Shake Proteico Isolado',
    itens: [{ nome: 'Whey Isolado', porcao_g: 30, kcal: 120, proteina_g: 30, carbo_g: 0, gordura_g: 0 }]
  });

  const totals = context.dayTotals(testDate);
  assert.strictEqual(totals.kcal, 120);
  assert.strictEqual(totals.p, 30);
  assert.strictEqual(totals.c, 0);
  assert.strictEqual(totals.g, 0);
});

// =============================================================================
// SECTION 3: LOCALSTORAGE SERIALIZATION & DATA DESERIALIZATION INTEGRITY
// =============================================================================
console.log('\n--- SEÇÃO 3: Persistência LocalStorage, Hábitos, Água e Metas ---');

test('3.1: Water Tracking Lifecycle (Quick-add, goal update, clamping, daily reset)', () => {
  mockLocalStorage.clear();
  const testDate = '2026-08-16';

  // Default goal
  assert.strictEqual(context.getWaterGoal(), 3000);

  // Set goal with bounds enforcement [500, 10000]
  assert.strictEqual(context.setWaterGoal(2500), 2500);
  assert.strictEqual(context.setWaterGoal(200), 500);   // clamped to min 500
  assert.strictEqual(context.setWaterGoal(20000), 10000); // clamped to max 10000
  context.setWaterGoal(3000);

  // Intake additions
  assert.strictEqual(context.getWaterIntake(testDate), 0);
  assert.strictEqual(context.addWaterIntake(250, testDate), 250);
  assert.strictEqual(context.addWaterIntake(500, testDate), 750);
  assert.strictEqual(context.addWaterIntake(350, testDate), 1100);
  assert.strictEqual(context.getWaterIntake(testDate), 1100);

  // Daily reset
  assert.strictEqual(context.setWaterIntake(0, testDate), 0);
  assert.strictEqual(context.getWaterIntake(testDate), 0);
});

test('3.2: Creatine Toggle (1-tap daily idempotency and state transition)', () => {
  mockLocalStorage.clear();
  const testDate = '2026-08-16';

  assert.strictEqual(context.getCreatinaStatus(testDate), false);
  assert.strictEqual(context.toggleCreatina(testDate), true);
  assert.strictEqual(context.getCreatinaStatus(testDate), true);
  assert.strictEqual(context.toggleCreatina(testDate), false);
  assert.strictEqual(context.getCreatinaStatus(testDate), false);
});

test('3.3: Custom Food CRUD and Nutrient Normalization', () => {
  mockLocalStorage.clear();

  // Create custom food
  const newFood = {
    nome: 'Panqueca de Aveia',
    porcao_g: 120,
    kcal: 240,
    proteina_g: 16,
    carbo_g: 32,
    gordura_g: 4,
    p: 13.3,
    c: 26.7,
    g: 3.3,
    custom: true
  };
  context.saveAlim(newFood);

  let list = context.userAlims();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].nome, 'Panqueca de Aveia');

  // Update
  context.updateCustomFood(0, {
    nome: 'Panqueca de Aveia c/ Banana',
    porcao_g: 150,
    kcal: 300,
    proteina_g: 18,
    carbo_g: 45,
    gordura_g: 5
  });

  list = context.userAlims();
  assert.strictEqual(list[0].nome, 'Panqueca de Aveia c/ Banana');
  assert.strictEqual(list[0].kcal, 300);

  // Delete
  const deleted = context.deleteCustomFood(0);
  assert.strictEqual(deleted.nome, 'Panqueca de Aveia c/ Banana');
  assert.strictEqual(context.userAlims().length, 0);
});

test('3.4: Weekly Meal Plan consistency across all 7 days', () => {
  const plan = context.PLANO_SEMANAL;
  assert.strictEqual(plan.length, 7);

  const dias = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  for (let i = 0; i < dias.length; i++) {
    const diaObj = plan[i];
    assert.strictEqual(diaObj.dia, dias[i]);
    const macros = context.getDiaMacros(diaObj);
    assert(macros.totalKcal > 2500, `Dia ${dias[i]} deve ter meta calórica adequada`);
    assert(macros.totalP > 100, `Dia ${dias[i]} deve ter proteína calculada`);
  }
});

test('3.5: Full Backup, Wipe, and Restore serialization roundtrip', () => {
  mockLocalStorage.clear();
  bridgeCalls.length = 0;

  vm.runInContext(`
    meals = [
      { id: 'm_test_1', date: '2026-08-16', hour: '12:30', nome: 'Almoço', itens: [{ nome: 'Frango', kcal: 250 }] }
    ];
    activities = [
      { id: 'a_test_1', date: '2026-08-16', nome: 'Corrida', kcal_gasto: 350, duracaoMin: 30, met: 8.8 }
    ];
  `, context);
  context.habits = { '2026-08-16': { creatina: true } };
  context.water = { '2026-08-16': 2500 };
  context.apikey = 'AIzaSyAdversarialTestKey';
  context.save('nt_meals', vm.runInContext('meals', context));
  context.save('nt_activities', vm.runInContext('activities', context));
  context.save('nt_habits', context.habits);
  context.save('nt_water', context.water);
  context.save('nt_apikey', context.apikey);

  // Backup
  context.doBackup();
  const backupEntry = bridgeCalls.find(c => c.method === 'saveBackup');
  assert(backupEntry, 'doBackup deve invocar AndroidBridge.saveBackup');
  const backupJson = backupEntry.json;

// Wipe
context.wipeAll();
context.confirmWipeAll(); // contrato novo: modal + confirmacao
assert.strictEqual(vm.runInContext('meals.length', context), 0);
  assert.strictEqual(vm.runInContext('activities.length', context), 0);

  // Restore
  class MockFileReader {
    readAsText() {
      this.result = backupJson;
      if (typeof this.onload === 'function') this.onload();
    }
  }
  context.FileReader = MockFileReader;
  context.doRestore({ name: 'nutritrack-backup.json' });

  // Verify restored state
  assert.strictEqual(vm.runInContext('meals.length', context), 1);
  assert.strictEqual(vm.runInContext('meals[0].id', context), 'm_test_1');
  assert.strictEqual(vm.runInContext('activities.length', context), 1);
  assert.strictEqual(vm.runInContext('activities[0].id', context), 'a_test_1');
  assert.strictEqual(context.getCreatinaStatus('2026-08-16'), true);
  assert.strictEqual(context.getWaterIntake('2026-08-16'), 2500);
});

// =============================================================================
// SECTION 4: NATIVE BRIDGE COMPATIBILITY & ERROR HANDLING
// =============================================================================
console.log('\n--- SEÇÃO 4: Lembretes de Refeições e Bridge Nativa ---');

test('4.1: Meal reminders serialization and AndroidBridge.syncAlarms invocation', () => {
  bridgeCalls.length = 0;
  mockLocalStorage.clear();

  const customLembretes = [
    { id: 'cafe', nome: 'Café da manhã', hora: '07:00', ativo: true },
    { id: 'almoco', nome: 'Almoço', hora: '12:00', ativo: true }
  ];

  context.saveLembretes(customLembretes);

  const syncAlarmCall = bridgeCalls.find(c => c.method === 'syncAlarms');
  assert(syncAlarmCall, 'saveLembretes deve invocar syncAlarms na bridge nativa');
  const parsed = JSON.parse(syncAlarmCall.json);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].hora, '07:00');
});

test('4.2: testarNotificacao triggers sendNotification and vibrate safely', () => {
  bridgeCalls.length = 0;
  context.testarNotificacao();

  const notifCall = bridgeCalls.find(c => c.method === 'sendNotification');
  const vibCall = bridgeCalls.find(c => c.method === 'vibrate');
  assert(notifCall, 'testarNotificacao deve chamar sendNotification');
  assert(vibCall, 'testarNotificacao deve chamar vibrate');
  assert.strictEqual(vibCall.ms, 150);
});

console.log('\n================================================================');
console.log(`=== TODOS OS ${passCount} TESTES EMPÍRICOS PASSARAM COM SUCESSO! ===`);
console.log('================================================================\n');
process.exit(0);
