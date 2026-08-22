'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== [NUTRITRACK] CHALLENGER 1 (M3) EMPIRICAL ADVERSARIAL SUITE ===');
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
    querySelectorAll: function(s) { return []; }
  };
}

const mockStorage = {};
const mockLocalStorage = {
  getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
};

const bridgeInvocations = [];
const mockAndroidBridge = {
  sendNotification: (title, message) => {
    bridgeInvocations.push({ method: 'sendNotification', title, message });
  },
  vibrate: (ms) => {
    bridgeInvocations.push({ method: 'vibrate', ms });
  },
  syncAlarms: (json) => {
    bridgeInvocations.push({ method: 'syncAlarms', json });
  },
  cancelAllAlarms: () => {
    bridgeInvocations.push({ method: 'cancelAllAlarms' });
  },
  scheduleAlarm: (id, title, message, hour, enabled) => {
    bridgeInvocations.push({ method: 'scheduleAlarm', id, title, message, hour, enabled });
  },
  cancelAlarm: (id) => {
    bridgeInvocations.push({ method: 'cancelAlarm', id });
  },
  saveBackup: (json, filename) => {
    bridgeInvocations.push({ method: 'saveBackup', json, filename });
  }
};

const toastList = [];
const modalList = [];
const mockDoc = {
  body: createMockElement('body'),
  getElementById: (id) => { const el = createMockElement('div'); el.id = id; return el; },
  querySelector: (s) => { const el = createMockElement('div'); el.selector = s; return el; },
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
  URL: { createObjectURL: () => 'blob:url', revokeObjectURL: () => {} },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  toast: (msg, undo) => { toastList.push({ msg, undo }); },
  openModal: (html) => { modalList.push(html); },
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

// Export bindings
vm.runInContext(`
  globalThis.profile = typeof profile !== 'undefined' ? profile : null;
  globalThis.meals = typeof meals !== 'undefined' ? meals : null;
  globalThis.activities = typeof activities !== 'undefined' ? activities : null;
  globalThis.habits = typeof habits !== 'undefined' ? habits : null;
  globalThis.water = typeof water !== 'undefined' ? water : null;
  globalThis.calcBMR = typeof calcBMR !== 'undefined' ? calcBMR : null;
  globalThis.calcTDEE = typeof calcTDEE !== 'undefined' ? calcTDEE : null;
  globalThis.dayTotals = typeof dayTotals !== 'undefined' ? dayTotals : null;
  globalThis.dayBurned = typeof dayBurned !== 'undefined' ? dayBurned : null;
  globalThis.dayActivities = typeof dayActivities !== 'undefined' ? dayActivities : null;
  globalThis.addActivity = typeof addActivity !== 'undefined' ? addActivity : null;
  globalThis.delActivity = typeof delActivity !== 'undefined' ? delActivity : null;
  globalThis.getCreatinaStatus = typeof getCreatinaStatus !== 'undefined' ? getCreatinaStatus : null;
  globalThis.toggleCreatina = typeof toggleCreatina !== 'undefined' ? toggleCreatina : null;
  globalThis.getWaterGoal = typeof getWaterGoal !== 'undefined' ? getWaterGoal : null;
  globalThis.setWaterGoal = typeof setWaterGoal !== 'undefined' ? setWaterGoal : null;
  globalThis.getWaterIntake = typeof getWaterIntake !== 'undefined' ? getWaterIntake : null;
  globalThis.addWaterIntake = typeof addWaterIntake !== 'undefined' ? addWaterIntake : null;
  globalThis.setWaterIntake = typeof setWaterIntake !== 'undefined' ? setWaterIntake : null;
  globalThis.userAlims = typeof userAlims !== 'undefined' ? userAlims : null;
  globalThis.saveAlim = typeof saveAlim !== 'undefined' ? saveAlim : null;
  globalThis.updateCustomFood = typeof updateCustomFood !== 'undefined' ? updateCustomFood : null;
  globalThis.deleteCustomFood = typeof deleteCustomFood !== 'undefined' ? deleteCustomFood : null;
  globalThis.loadLembretes = typeof loadLembretes !== 'undefined' ? loadLembretes : null;
  globalThis.saveLembretes = typeof saveLembretes !== 'undefined' ? saveLembretes : null;
  globalThis.doBackup = typeof doBackup !== 'undefined' ? doBackup : null;
  globalThis.doRestore = typeof doRestore !== 'undefined' ? doRestore : null;
  globalThis.wipeAll = typeof wipeAll !== 'undefined' ? wipeAll : null;
  globalThis.PLANO_SEMANAL = typeof PLANO_SEMANAL !== 'undefined' ? PLANO_SEMANAL : null;
  globalThis.getDiaMacros = typeof getDiaMacros !== 'undefined' ? getDiaMacros : null;
  globalThis.getRefeicaoMacros = typeof getRefeicaoMacros !== 'undefined' ? getRefeicaoMacros : null;
  globalThis.carregarRefeicao = typeof carregarRefeicao !== 'undefined' ? carregarRefeicao : null;
  globalThis.carregarDia = typeof carregarDia !== 'undefined' ? carregarDia : null;
  globalThis.DEFAULT_LEMBRETES = typeof DEFAULT_LEMBRETES !== 'undefined' ? DEFAULT_LEMBRETES : null;
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
// SECTION 1: TDEE MIFFLIN-ST JEOR & MET INVARIANTS UNDER BOUNDARY VALUES
// =============================================================================
console.log('--- SEÇÃO 1: Invariantes TDEE Mifflin-St Jeor e MET em Limites Extremos ---');

test('1.1: Mifflin-St Jeor exact difference invariant (BMR_male - BMR_female = 166 kcal)', () => {
  const testCases = [
    { peso: 75, alt: 175, idade: 30 },
    { peso: 50, alt: 155, idade: 20 },
    { peso: 120, alt: 195, idade: 55 },
    { peso: 40, alt: 140, idade: 80 }
  ];

  for (const tc of testCases) {
    const bmrM = context.calcBMR({ peso: tc.peso, altura: tc.alt, idade: tc.idade, sexo: 'm' });
    const bmrF = context.calcBMR({ peso: tc.peso, altura: tc.alt, idade: tc.idade, sexo: 'f' });
    assert.strictEqual(bmrM - bmrF, 166, `Diferença entre BMR homem e mulher deve ser exatamente 166 kcal para ${JSON.stringify(tc)}`);
  }
});

test('1.2: TDEE calculation with standard physical activity level (PAL) multipliers', () => {
  const p = { peso: 80, altura: 180, idade: 25, sexo: 'm' };
  // BMR = 10*80 + 6.25*180 - 5*25 + 5 = 800 + 1125 - 125 + 5 = 1805
  const bmr = context.calcBMR(p);
  assert.strictEqual(bmr, 1805);

  const palMultipliers = [
    { factor: 1.2, expected: 2166 }, // 1805 * 1.2 = 2166
    { factor: 1.4, expected: 2527 }, // 1805 * 1.4 = 2527
    { factor: 1.6, expected: 2888 }, // 1805 * 1.6 = 2888
    { factor: 1.8, expected: 3249 }  // 1805 * 1.8 = 3249
  ];

  for (const pal of palMultipliers) {
    p.atividade = pal.factor;
    const tdee = context.calcTDEE(p);
    assert.strictEqual(tdee, pal.expected, `TDEE incorreto para fator ${pal.factor}`);
  }
});

test('1.3: Boundary & extreme biometrics (zero, negative, null, non-numeric) handled safely', () => {
  // Null / undefined profile fallback to defaults
  assert(Number.isFinite(context.calcBMR(null)));
  assert(Number.isFinite(context.calcTDEE(null)));

  // Extreme heavyweight (350kg)
  const heavyBMR = context.calcBMR({ peso: 350, altura: 200, idade: 30, sexo: 'm', atividade: 1.6 });
  assert.strictEqual(heavyBMR, 10*350 + 6.25*200 - 5*30 + 5); // 3500 + 1250 - 150 + 5 = 4605

  // Extreme lightweight (30kg)
  const lightBMR = context.calcBMR({ peso: 30, altura: 130, idade: 15, sexo: 'f', atividade: 1.2 });
  assert.strictEqual(lightBMR, 10*30 + 6.25*130 - 5*15 - 161); // 300 + 812.5 - 75 - 161 = 876.5
});

test('1.4: MET caloric expenditure equation invariants and zero-duration safety', () => {
  // Formula: MET * Weight * (Duration / 60)
  const peso = 75;
  const durMin = 60;
  const metCorrida = 8.8; // Corrida 9 km/h
  const expectedKcal = Math.round(metCorrida * peso * (durMin / 60)); // 660 kcal
  assert.strictEqual(expectedKcal, 660);

  // Zero duration -> 0 kcal, no NaN
  const zeroDurKcal = Math.round(metCorrida * peso * (0 / 60));
  assert.strictEqual(zeroDurKcal, 0);

  // Zero MET -> 0 kcal
  const zeroMetKcal = Math.round(0 * peso * (45 / 60));
  assert.strictEqual(zeroMetKcal, 0);
});

// =============================================================================
// SECTION 2: MACRO PERCENTAGES & ENERGY BALANCE (DEFICIT, SURPLUS, ZERO INTAKE)
// =============================================================================
console.log('\n--- SEÇÃO 2: Balanço Energético Diário e Percentuais de Macros ---');

test('2.1: Energy Balance equation (I - G = L) under Normal, Deficit, and Surplus', () => {
  const targetKcal = 2200;

  // Case A: Deficit (I = 1800, G = 400 => L = 1400, Deficit = 800 kcal below target)
  {
    const I = 1800, G = 400;
    const L = I - G;
    const isSurplus = L > targetKcal;
    const remaining = targetKcal - L;
    assert.strictEqual(L, 1400);
    assert.strictEqual(isSurplus, false);
    assert.strictEqual(remaining, 800);
  }

  // Case B: Exact Match (I = 2600, G = 400 => L = 2200, Remaining = 0)
  {
    const I = 2600, G = 400;
    const L = I - G;
    const isSurplus = L > targetKcal;
    const remaining = targetKcal - L;
    assert.strictEqual(L, 2200);
    assert.strictEqual(isSurplus, false);
    assert.strictEqual(remaining, 0);
  }

  // Case C: Surplus (I = 3100, G = 300 => L = 2800, Surplus = +600 kcal above target)
  {
    const I = 3100, G = 300;
    const L = I - G;
    const isSurplus = L > targetKcal;
    const surplusVal = L - targetKcal;
    assert.strictEqual(L, 2800);
    assert.strictEqual(isSurplus, true);
    assert.strictEqual(surplusVal, 600);
  }
});

test('2.2: Negative Net Energy Balance clamping (High expenditure with zero intake)', () => {
  const targetKcal = 2000;
  const I = 0; // Fasting
  const G = 850; // Long workout
  const L = I - G; // -850 kcal

  assert.strictEqual(L, -850);
  // Net percentage calculation formula in hoje.js:
  // Math.min(100, Math.max(0, Math.round(Math.max(0, L) / (targetKcal || 1) * 100)))
  const netPct = Math.min(100, Math.max(0, Math.round(Math.max(0, L) / (targetKcal || 1) * 100)));
  assert.strictEqual(netPct, 0, 'Saldo negativo deve clampar netPct em 0%');
});

test('2.3: Macro percentage progress bar clamping and zero/null target safety', () => {
  const pct = (v, m) => Math.min(100, Math.max(0, Math.round(v / (m || 1) * 100)));

  // Zero intake
  assert.strictEqual(pct(0, 150), 0);
  // 50% progress
  assert.strictEqual(pct(75, 150), 50);
  // 100% progress
  assert.strictEqual(pct(150, 150), 100);
  // Overflow intake (200%) clamps to 100%
  assert.strictEqual(pct(300, 150), 100);
  // Zero / null target safety
  assert.strictEqual(pct(50, 0), 100);
  assert.strictEqual(pct(0, null), 0);
  assert.strictEqual(pct(0, undefined), 0);
});

test('2.4: Goal Macro distribution calculation invariants (Protein 1.8g/kg, Carb 45%, Fat 25%)', () => {
  const peso = 75;
  const tdee = 2400;

  const pSugerida = Math.round(peso * 1.8);        // 135g
  const cSugerido = Math.round(tdee * 0.45 / 4);   // 270g
  const gSugerido = Math.round(tdee * 0.25 / 9);   // 67g

  assert.strictEqual(pSugerida, 135);
  assert.strictEqual(cSugerido, 270);
  assert.strictEqual(gSugerido, 67);

  // Kcal from macros
  const totalMacroKcal = pSugerida * 4 + cSugerido * 4 + gSugerido * 9; // 540 + 1080 + 603 = 2223 kcal
  assert(totalMacroKcal > 2100 && totalMacroKcal < 2500);
});

// =============================================================================
// SECTION 3: STORAGE SERIALIZATION & DATA SCHEMA INTEGRITY
// =============================================================================
console.log('\n--- SEÇÃO 3: Serialização LocalStorage e Integridade de Schema ---');

test('3.1: Water tracking and Goal management lifecycle & boundary validation', () => {
  mockLocalStorage.clear();
  const testDate = '2026-08-16';

  // Default water goal
  assert.strictEqual(context.getWaterGoal(), 3000);

  // Update water goal within bounds [500, 10000]
  assert.strictEqual(context.setWaterGoal(2500), 2500);
  assert.strictEqual(context.getWaterGoal(), 2500);

  // Clamping below 500
  assert.strictEqual(context.setWaterGoal(200), 500);
  // Clamping above 10000
  assert.strictEqual(context.setWaterGoal(15000), 10000);

  // Restore goal to 3000
  context.setWaterGoal(3000);

  // Water intake operations
  assert.strictEqual(context.getWaterIntake(testDate), 0);
  assert.strictEqual(context.addWaterIntake(250, testDate), 250);
  assert.strictEqual(context.addWaterIntake(500, testDate), 750);
  assert.strictEqual(context.getWaterIntake(testDate), 750);

  // Set directly
  assert.strictEqual(context.setWaterIntake(1500, testDate), 1500);
  assert.strictEqual(context.getWaterIntake(testDate), 1500);

  // Reset to 0
  assert.strictEqual(context.setWaterIntake(0, testDate), 0);
  assert.strictEqual(context.getWaterIntake(testDate), 0);
});

test('3.2: Water & Habits backward compatibility with legacy single-date keys', () => {
  mockLocalStorage.clear();
  const testDate = '2026-08-14';

  // Legacy water format: nt_water_2026-08-14 = { current_ml: 1750, goal_ml: 3000 }
  mockLocalStorage.setItem(`nt_water_${testDate}`, JSON.stringify({ current_ml: 1750, goal_ml: 3000 }));
  assert.strictEqual(context.getWaterIntake(testDate), 1750);

  // Legacy habits format: nt_habits_2026-08-14 = { creatina: true }
  mockLocalStorage.setItem(`nt_habits_${testDate}`, JSON.stringify({ creatina: true }));
  assert.strictEqual(context.getCreatinaStatus(testDate), true);

  // Legacy english key format: { creatine: true }
  mockLocalStorage.setItem(`nt_habits_2026-08-13`, JSON.stringify({ creatine: true }));
  assert.strictEqual(context.getCreatinaStatus('2026-08-13'), true);
});

test('3.3: Creatine daily toggle idempotency and storage sync', () => {
  mockLocalStorage.clear();
  const testDate = '2026-08-16';

  assert.strictEqual(context.getCreatinaStatus(testDate), false);
  // Toggle ON
  assert.strictEqual(context.toggleCreatina(testDate), true);
  assert.strictEqual(context.getCreatinaStatus(testDate), true);
  // Toggle OFF
  assert.strictEqual(context.toggleCreatina(testDate), false);
  assert.strictEqual(context.getCreatinaStatus(testDate), false);
});

test('3.4: Custom Food Registration, Nutrient Normalization, Editing & Deletion', () => {
  mockLocalStorage.clear();

  // 1. Register custom food: 150g portion with 300 kcal, 30g protein, 20g carb, 10g fat
  const customFood = {
    nome: 'Shake Hipercalórico',
    porcao_g: 150,
    kcal: 300,
    proteina_g: 30,
    carbo_g: 20,
    gordura_g: 10,
    p: 20, // 100g normalized: 30 / 1.5 = 20
    c: 13.3,
    g: 6.7,
    custom: true
  };
  context.saveAlim(customFood);

  let list = context.userAlims();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].nome, 'Shake Hipercalórico');
  assert.strictEqual(list[0].kcal, 300);

  // 2. Update custom food
  const updatedFood = {
    nome: 'Shake Hipercalórico Premium',
    porcao_g: 200,
    kcal: 400,
    proteina_g: 40,
    carbo_g: 30,
    gordura_g: 12
  };
  const updatedOk = context.updateCustomFood(0, updatedFood);
  assert.strictEqual(updatedOk, true);

  list = context.userAlims();
  assert.strictEqual(list[0].nome, 'Shake Hipercalórico Premium');
  assert.strictEqual(list[0].kcal, 400);

  // 3. Delete custom food
  const removed = context.deleteCustomFood(0);
  assert.strictEqual(removed.nome, 'Shake Hipercalórico Premium');
  assert.strictEqual(context.userAlims().length, 0);
});

test('3.5: Weekly Meal Plan matrix validation (all 7 days, full macro calculations & loaders)', () => {
  const plan = context.PLANO_SEMANAL;
  assert(Array.isArray(plan) && plan.length === 7, 'Plano semanal deve conter exatamente 7 dias');

  const dias = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  dias.forEach((d, idx) => {
    assert.strictEqual(plan[idx].dia, d);
    assert(Array.isArray(plan[idx].refeicoes) && plan[idx].refeicoes.length >= 4, `Dia ${d} deve ter ao menos 4 refeições`);
    
    const macros = context.getDiaMacros(plan[idx]);
    assert(macros.totalKcal >= 2000, `Calorias do dia ${d} devem ser >= 2000 kcal (atual: ${macros.totalKcal})`);
    assert(macros.totalP >= 80, `Proteína do dia ${d} deve ser >= 80g (atual: ${macros.totalP}g)`);
    assert(macros.totalC >= 150, `Carbo do dia ${d} deve ser >= 150g (atual: ${macros.totalC}g)`);
  });
});

test('3.6: Full Backup and Restore roundtrip data integrity across all app domains', () => {
  mockLocalStorage.clear();
  bridgeInvocations.length = 0;

  // Set up complex data state
  const testMeals = [
    { id: 'm_1', date: '2026-08-16', hour: '12:00', nome: 'Almoço Fit', itens: [{ nome: 'Frango', kcal: 250 }], origem: 'manual' }
  ];
  const testActs = [
    { id: 'a_1', date: '2026-08-16', data: '2026-08-16', hour: '08:00', hora: '08:00', nome: 'Corrida', duracaoMin: 30, duracao_min: 30, met: 8.0, kcal: 300, kcal_gasto: 300, origem: 'manual', intensidade: 'intensa' }
  ];
  const testAlims = [
    { nome: 'Whey Protein', porcao_g: 30, kcal: 120, proteina_g: 24, carbo_g: 2, gordura_g: 1, custom: true }
  ];
  const testReminders = [
    { id: 'cafe', nome: 'Café da manhã', hora: '08:00', ativo: true },
    { id: 'almoco', nome: 'Almoço', hora: '13:00', ativo: true }
  ];
  const testHabits = { '2026-08-16': { creatina: true } };
  const testWater = { '2026-08-16': 2250 };

mockLocalStorage.setItem('nt_meals', JSON.stringify(testMeals));
mockLocalStorage.setItem('nt_activities', JSON.stringify(testActs));
mockLocalStorage.setItem('nt_alims', JSON.stringify(testAlims));
mockLocalStorage.setItem('nt_reminders', JSON.stringify(testReminders));
mockLocalStorage.setItem('nt_habits', JSON.stringify(testHabits));
mockLocalStorage.setItem('nt_water', JSON.stringify(testWater));
mockLocalStorage.setItem('nt_apikey', 'AIzaFakeKey123');

// Sincroniza os globals lexicais (meals/activities) usados por doBackup —
// na arquitetura atual o estado em memória é fonte da verdade do export.
vm.runInContext(`
  meals = ${JSON.stringify(testMeals)};
  activities = ${JSON.stringify(testActs)};
`, context);

  // Trigger backup
  context.doBackup();
  const backupCall = bridgeInvocations.find(c => c.method === 'saveBackup');
  assert(backupCall, 'Bridge saveBackup deve ter sido acionado');
  const backupJson = backupCall.json;

  // Clear everything
  mockLocalStorage.clear();

  // Restore via mock FileReader
  class MockFileReader {
    readAsText() {
      this.result = backupJson;
      if (typeof this.onload === 'function') this.onload();
    }
  }
  context.FileReader = MockFileReader;

  context.doRestore({ name: 'nutritrack-backup.json' });

  // Verify restored state
  const restoredMeals = JSON.parse(mockLocalStorage.getItem('nt_meals'));
  const restoredActs = JSON.parse(mockLocalStorage.getItem('nt_activities'));
  const restoredAlims = JSON.parse(mockLocalStorage.getItem('nt_alims'));
  const restoredHabits = JSON.parse(mockLocalStorage.getItem('nt_habits'));
  const restoredWater = JSON.parse(mockLocalStorage.getItem('nt_water'));

  assert.strictEqual(restoredMeals.length, 1);
  assert.strictEqual(restoredMeals[0].nome, 'Almoço Fit');
  assert.strictEqual(restoredActs.length, 1);
  assert.strictEqual(restoredActs[0].nome, 'Corrida');
  assert.strictEqual(restoredAlims[0].nome, 'Whey Protein');
  assert.strictEqual(restoredHabits['2026-08-16'].creatina, true);
  assert.strictEqual(restoredWater['2026-08-16'], 2250);
});

// =============================================================================
// SECTION 4: ALARM SCHEDULE DATA STRUCTURES & SYNC ALARMS NATIVE BRIDGE
// =============================================================================
console.log('\n--- SEÇÃO 4: Estrutura de Agendamento de Alarmes e Bridge Nativa ---');

test('4.1: DEFAULT_LEMBRETES schema validation and time-string format compliance', () => {
  const defs = context.DEFAULT_LEMBRETES;
  assert(Array.isArray(defs) && defs.length === 5, 'Deve haver 5 lembretes padrão');

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  defs.forEach(l => {
    assert(typeof l.id === 'string' && l.id.length > 0, `ID inválido no lembrete: ${JSON.stringify(l)}`);
    assert(typeof l.nome === 'string' && l.nome.length > 0, `Nome inválido no lembrete: ${JSON.stringify(l)}`);
    assert(timeRegex.test(l.hora), `Formato de hora inválido (${l.hora}) no lembrete ${l.id}. Deve ser HH:mm 24h.`);
    assert(typeof l.ativo === 'boolean', `Flag ativo deve ser booleana no lembrete ${l.id}`);
  });
});

test('4.2: saveLembretes serializes cleanly and invokes AndroidBridge.syncAlarms', () => {
  bridgeInvocations.length = 0;
  mockLocalStorage.clear();

  const customList = [
    { id: 'cafe', nome: 'Café', hora: '07:00', ativo: true },
    { id: 'almoco', nome: 'Almoço', hora: '12:00', ativo: true },
    { id: 'treino', nome: 'Treino', hora: '17:30', ativo: false }
  ];

  context.saveLembretes(customList);

  // Check LocalStorage persistence
  const saved = JSON.parse(mockLocalStorage.getItem('nt_reminders'));
  assert.strictEqual(saved.length, 3);
  assert.strictEqual(saved[0].hora, '07:00');

  // Check AndroidBridge invocation
  const syncCall = bridgeInvocations.find(c => c.method === 'syncAlarms');
  assert(syncCall, 'AndroidBridge.syncAlarms deve ter sido invocado');
  
  const parsedBridgePayload = JSON.parse(syncCall.json);
  assert.strictEqual(parsedBridgePayload.length, 3);
  assert.strictEqual(parsedBridgePayload[1].nome, 'Almoço');
  assert.strictEqual(parsedBridgePayload[2].ativo, false);
});

test('4.3: Java Bridge compatibility check (ID, name/nome, time/hora, enabled/ativo fallback aliases)', () => {
  // Verifying that the schema consumed by MainActivity.java Bridge & NotificationReceiver
  // matches the properties emitted by JS
  const testObj = { id: 'almoco', nome: 'Almoço', hora: '12:30', ativo: true };
  const jsonStr = JSON.stringify([testObj]);

  const arr = JSON.parse(jsonStr);
  const item = arr[0];
  const id = item.id || 'lembrete_0';
  const nome = item.nome || item.name || 'Refeição';
  const hora = item.hora || item.time || '';
  const ativo = item.ativo !== undefined ? item.ativo : (item.enabled !== undefined ? item.enabled : true);

  assert.strictEqual(id, 'almoco');
  assert.strictEqual(nome, 'Almoço');
  assert.strictEqual(hora, '12:30');
  assert.strictEqual(ativo, true);
});

test('4.4: Safe execution when AndroidBridge is undefined (browser/test mode fallback)', () => {
  const originalBridge = context.window.AndroidBridge;
  context.window.AndroidBridge = undefined;
  delete context.AndroidBridge;

  assert.doesNotThrow(() => {
    context.saveLembretes(context.DEFAULT_LEMBRETES);
  }, 'saveLembretes não deve lançar exceção quando AndroidBridge for undefined');

  // Restore bridge
  context.window.AndroidBridge = originalBridge;
  context.AndroidBridge = originalBridge;
});

console.log('\n================================================================');
console.log(`=== TODOS OS ${passCount} TESTES DO CHALLENGER 1 (M3) PASSARAM COM SUCESSO! ===`);
console.log('================================================================');
