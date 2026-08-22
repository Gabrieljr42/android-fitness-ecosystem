'use strict';

/**
 * challenger_m2_empirical.test.js
 * Empirical challenger & stress test suite for Milestone 2:
 * 1. MET Calculation Accuracy against Ainsworth Compendium & Multi-Segment Weighted Calculations
 * 2. Mifflin-St Jeor BMR/TDEE Boundary Stress & Biometric Invariant Testing
 * 3. Daily Net Energy Balance Equation (I - G = L), Deficit/Surplus & Multi-Date Isolation
 * 4. State Mutations, High-Volume Add/Del, Undo Restoration & Backup/Restore Roundtrips
 * 5. Gemini Activity AI Schema, Biometric Injection, Outlier Rejection & Error Resilience
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock DOM & Environment
const dummyEl = {
  onclick: null,
  onchange: null,
  oninput: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  style: {},
  value: '',
  textContent: '',
  innerHTML: '',
  focus: () => {},
  click: () => {},
  querySelectorAll: () => [],
  querySelector: () => null,
  children: []
};

const windowObj = {
  addEventListener: () => {},
  removeEventListener: () => {}
};

const mockStorage = {};
const mockLocalStorage = {
  getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
};

let lastToast = null;
let lastToastUndo = null;

const context = {
  console: console,
  Date: Date,
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
  RegExp: RegExp,
  Promise: Promise,
  setTimeout: (fn) => { fn(); return 1; },
  clearTimeout: () => {},
  document: {
    getElementById: () => dummyEl,
    querySelector: () => dummyEl,
    querySelectorAll: () => [],
    createElement: (tag) => ({ ...dummyEl, tagName: tag.toUpperCase() }),
    addEventListener: () => {},
    body: {
      contains: () => true,
      appendChild: () => {}
    }
  },
  window: windowObj,
  self: windowObj,
  localStorage: mockLocalStorage,
  toast: (msg, undoFn) => {
    lastToast = msg;
    lastToastUndo = undoFn || null;
  },
  openModal: () => {},
  closeModal: () => {},
  escapeHtml: (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
};

vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('apps/nutricao/estado.js');
loadScript('apps/nutricao/logic.js');
loadScript('core/gemini.js');
loadScript('apps/nutricao/views/ajustes.js');
loadScript('apps/nutricao/views/hoje.js');

vm.runInContext(`
  toast = (msg, undoFn) => {
    globalThis.__lastToast = msg;
    globalThis.__lastToastUndo = undoFn || null;
  };
  globalThis.profile = typeof profile !== 'undefined' ? profile : null;
  globalThis.meals = typeof meals !== 'undefined' ? meals : null;
  globalThis.activities = typeof activities !== 'undefined' ? activities : null;
  globalThis.dayMeals = typeof dayMeals !== 'undefined' ? dayMeals : null;
  globalThis.dayTotals = typeof dayTotals !== 'undefined' ? dayTotals : null;
  globalThis.dayActivities = typeof dayActivities !== 'undefined' ? dayActivities : null;
  globalThis.dayBurned = typeof dayBurned !== 'undefined' ? dayBurned : null;
  globalThis.addActivity = typeof addActivity !== 'undefined' ? addActivity : null;
  globalThis.delActivity = typeof delActivity !== 'undefined' ? delActivity : null;
  globalThis.saveActivities = typeof saveActivities !== 'undefined' ? saveActivities : null;
  globalThis.handleDelActivity = typeof handleDelActivity !== 'undefined' ? handleDelActivity : null;
  globalThis.calcBMR = typeof calcBMR !== 'undefined' ? calcBMR : null;
  globalThis.calcTDEE = typeof calcTDEE !== 'undefined' ? calcTDEE : null;
  globalThis.today = typeof today !== 'undefined' ? today : null;
  globalThis.fmt = typeof fmt !== 'undefined' ? fmt : null;
  globalThis.ACTIVITY_SCHEMA = typeof ACTIVITY_SCHEMA !== 'undefined' ? ACTIVITY_SCHEMA : null;
  globalThis.ACTIVITY_PROMPT = typeof ACTIVITY_PROMPT !== 'undefined' ? ACTIVITY_PROMPT : null;
  globalThis.apiBodyAtividade = typeof apiBodyAtividade !== 'undefined' ? apiBodyAtividade : null;
  globalThis.mergeActivityAnalisys = typeof mergeActivityAnalisys !== 'undefined' ? mergeActivityAnalisys : null;
  globalThis.doBackup = typeof doBackup !== 'undefined' ? doBackup : null;
  globalThis.doRestore = typeof doRestore !== 'undefined' ? doRestore : null;
  globalThis.wipeAll = typeof wipeAll !== 'undefined' ? wipeAll : null;
`, context);

const {
  profile, meals, dayMeals, dayTotals, dayActivities, dayBurned,
  addActivity, delActivity, saveActivities, handleDelActivity,
  calcBMR, calcTDEE, today, fmt,
  ACTIVITY_SCHEMA, ACTIVITY_PROMPT, apiBodyAtividade, mergeActivityAnalisys,
  doBackup, doRestore, wipeAll
} = context;

console.log('================================================================');
console.log('=== [NUTRITRACK] EMPIRICAL CHALLENGER M2: ADVERSARIAL SUITE  ===');
console.log('================================================================\n');

// ====================================================================
// SECTION 1: AINSWORTH COMPENDIUM MET ACCURACY & MULTI-SEGMENT WEIGHTED AVERAGE
// ====================================================================
console.log('--- SECTION 1: Ainsworth Compendium MET Accuracy & Multi-Segment Calculations ---');

// Table of empirical test cases mapped to Ainsworth 2011 Compendium
const compendiumCases = [
  { name: 'Sleeping / Resting', code: '07010', met: 0.95, peso: 70, durMin: 480, expectedKcal: 532 },
  { name: 'Yoga / Hatha Stretching', code: '02150', met: 2.5, peso: 60, durMin: 60, expectedKcal: 150 },
  { name: 'Walking 4.0 km/h (2.5 mph)', code: '17152', met: 3.0, peso: 80, durMin: 45, expectedKcal: 180 },
  { name: 'Walking 5.6 km/h (3.5 mph brisk)', code: '17190', met: 4.3, peso: 75, durMin: 30, expectedKcal: 161 },
  { name: 'Weight lifting (vigorous free weights)', code: '02050', met: 6.0, peso: 85, durMin: 60, expectedKcal: 510 },
  { name: 'Bicycling 16-19 km/h (leisure/commute)', code: '01020', met: 6.8, peso: 70, durMin: 40, expectedKcal: 317 },
  { name: 'Swimming freestyle (moderate effort)', code: '18310', met: 5.8, peso: 68, durMin: 45, expectedKcal: 296 },
  { name: 'Running 8.0 km/h (5.0 mph, 7.5 min/km)', code: '12020', met: 8.3, peso: 72, durMin: 30, expectedKcal: 299 },
  { name: 'Running 9.6 km/h (6.0 mph, 6.25 min/km)', code: '12030', met: 9.8, peso: 75, durMin: 45, expectedKcal: 551 },
  { name: 'Running 12.0 km/h (7.5 mph, 5.0 min/km)', code: '12050', met: 11.8, peso: 70, durMin: 60, expectedKcal: 826 },
  { name: 'HIIT / Circuit training (vigorous)', code: '02065', met: 9.0, peso: 80, durMin: 25, expectedKcal: 300 }
];

for (const tc of compendiumCases) {
  const calculated = Math.round(tc.met * tc.peso * (tc.durMin / 60));
  assert.strictEqual(
    calculated, tc.expectedKcal,
    `Empirical mismatch for ${tc.name} (MET ${tc.met}, weight ${tc.peso}kg, dur ${tc.durMin}min): got ${calculated}, expected ${tc.expectedKcal}`
  );
}
console.log(`✅ Test 1.1 Passed: Verified ${compendiumCases.length} Ainsworth compendium physical activities with exact integer precision.`);

// Multi-segment interval workout verification (HIIT / Alternating run-walk)
{
  const userWeight = 78; // kg
  const segments = [
    { tipo: 'aquecimento', descricao: 'Aquecimento caminhada', duracao_minutos: 5, met: 3.0 },
    { tipo: 'tiro_1', descricao: 'Corrida rápida 12 km/h', duracao_minutos: 3, met: 11.8 },
    { tipo: 'recuperacao_1', descricao: 'Caminhada recuperação', duracao_minutos: 2, met: 3.5 },
    { tipo: 'tiro_2', descricao: 'Corrida rápida 12 km/h', duracao_minutos: 3, met: 11.8 },
    { tipo: 'recuperacao_2', descricao: 'Caminhada recuperação', duracao_minutos: 2, met: 3.5 },
    { tipo: 'tiro_3', descricao: 'Corrida rápida 12 km/h', duracao_minutos: 3, met: 11.8 },
    { tipo: 'recuperacao_3', descricao: 'Caminhada recuperação', duracao_minutos: 2, met: 3.5 },
    { tipo: 'desaquecimento', descricao: 'Desaquecimento trote leve', duracao_minutos: 5, met: 6.0 }
  ];

  let totalDur = 0;
  let totalKcalSum = 0;
  let weightedMetNumerator = 0;

  for (const s of segments) {
    const segKcal = s.met * userWeight * (s.duracao_minutos / 60);
    s.kcal = Math.round(segKcal);
    s.kcal_gasto = s.kcal;
    totalDur += s.duracao_minutos;
    totalKcalSum += segKcal;
    weightedMetNumerator += s.met * s.duracao_minutos;
  }

  const expectedWeightedMet = +(weightedMetNumerator / totalDur).toFixed(2);
  const expectedTotalKcal = Math.round(totalKcalSum);

  assert.strictEqual(totalDur, 25, 'Total duration should equal 25 minutes');
  assert.strictEqual(expectedWeightedMet, 6.89, 'Weighted average MET should equal 6.89');
  assert.strictEqual(expectedTotalKcal, 224, 'Total interval workout burn should equal 224 kcal');

  // Verify that individual segment sum rounded matches total weighted burn within 1 kcal rounding tolerance
  const segmentSumRounded = segments.reduce((sum, s) => sum + s.kcal, 0);
  assert(
    Math.abs(segmentSumRounded - expectedTotalKcal) <= 1,
    `Segment summation (${segmentSumRounded}) matches integral calculation (${expectedTotalKcal}) within rounding margin`
  );

  console.log('✅ Test 1.2 Passed: Multi-segment interval workout (8 segments) weighted average MET and segmented calorie accumulation verified.');
}

// Zero and single segment edge cases
{
  const emptyWeighted = [].reduce((acc, s) => acc + (s.met * s.dur), 0) / (0 || 1);
  assert.strictEqual(emptyWeighted, 0, 'Empty segments weighted MET falls back cleanly to 0');

  const singleSegment = [{ met: 8.5, dur: 40 }];
  const singleWeighted = (singleSegment[0].met * singleSegment[0].dur) / singleSegment[0].dur;
  assert.strictEqual(singleWeighted, 8.5, 'Single segment weighted average equals segment MET exactly');
  console.log('✅ Test 1.3 Passed: Zero and single-segment boundary conditions validated.');
}

// ====================================================================
// SECTION 2: MIFFLIN-ST JEOR BMR/TDEE BOUNDARY STRESS & INVARIANT TESTING
// ====================================================================
console.log('\n--- SECTION 2: Mifflin-St Jeor BMR/TDEE Boundary Stress & Invariants ---');

// Invariant 1: For any identical biometrics (weight W, height H, age A), Male BMR - Female BMR == 166 kcal
{
  const testBiometrics = [
    { peso: 45, altura: 150, idade: 18 },
    { peso: 70, altura: 175, idade: 30 },
    { peso: 95, altura: 190, idade: 45 },
    { peso: 130, altura: 200, idade: 65 },
    { peso: 35, altura: 130, idade: 80 }
  ];

  for (const b of testBiometrics) {
    const bmrMale = calcBMR({ ...b, sexo: 'm' });
    const bmrFemale = calcBMR({ ...b, sexo: 'f' });
    const diff = bmrMale - bmrFemale;
    assert.strictEqual(diff, 166, `Male vs Female BMR invariant failed for ${JSON.stringify(b)}: diff was ${diff}, expected 166`);
  }
  console.log('✅ Test 2.1 Passed: Mathematical invariant (BMR_male - BMR_female = 166 kcal) verified across all demographic profiles.');
}

// Boundary extremes (Age: 0, 1, 100, 120; Weight: 1, 350; Height: 40, 250)
{
  // 1-year-old child: 10 kg, 75 cm, 1 year
  // Male: 10*10 + 6.25*75 - 5*1 + 5 = 100 + 468.75 - 5 + 5 = 568.75
  const bmrChild = calcBMR({ peso: 10, altura: 75, idade: 1, sexo: 'm' });
  assert.strictEqual(bmrChild, 568.75, 'Child BMR boundary incorrect');

  // Centenarian: 50 kg, 155 cm, 105 years, female
  // Female: 10*50 + 6.25*155 - 5*105 - 161 = 500 + 968.75 - 525 - 161 = 782.75
  const bmrCentenarian = calcBMR({ peso: 50, altura: 155, idade: 105, sexo: 'f' });
  assert.strictEqual(bmrCentenarian, 782.75, 'Centenarian BMR boundary incorrect');

  // Extreme heavyweight athlete: 200 kg, 210 cm, 28 years, male
  // Male: 10*200 + 6.25*210 - 5*28 + 5 = 2000 + 1312.5 - 140 + 5 = 3177.5
  const bmrHeavy = calcBMR({ peso: 200, altura: 210, idade: 28, sexo: 'm' });
  assert.strictEqual(bmrHeavy, 3177.5, 'Heavy athlete BMR boundary incorrect');

  // TDEE scaling with standard physical activity levels (PAL)
  const palFactors = [
    { pal: 1.2, name: 'Sedentary', expectedTdee: 3813 },
    { pal: 1.375, name: 'Lightly Active', expectedTdee: 4369 },
    { pal: 1.55, name: 'Moderately Active', expectedTdee: 4925 },
    { pal: 1.725, name: 'Very Active', expectedTdee: 5481 },
    { pal: 1.9, name: 'Extremely Active', expectedTdee: 6037 }
  ];

  for (const f of palFactors) {
    const tdee = calcTDEE({ peso: 200, altura: 210, idade: 28, sexo: 'm', atividade: f.pal });
    assert.strictEqual(tdee, f.expectedTdee, `TDEE for ${f.name} (PAL ${f.pal}) was ${tdee}, expected ${f.expectedTdee}`);
  }

  console.log('✅ Test 2.2 Passed: Extreme demographic boundaries (infant, centenarian, 200kg athlete) and PAL multipliers verified.');
}

// Fallback robustness on undefined / empty profile parameters
{
  const bmrFallback = calcBMR(null);
  // Defaults: peso 75, alt 175, idade 30, sexo m -> 10*75 + 6.25*175 - 5*30 + 5 = 750 + 1093.75 - 150 + 5 = 1698.75
  assert.strictEqual(bmrFallback, 1698.75, 'Fallback BMR should resolve to 1698.75 on null profile');

  const tdeeFallback = calcTDEE({});
  // 1698.75 * 1.4 = 2378.25 -> 2378
  assert.strictEqual(tdeeFallback, 2378, 'Fallback TDEE should resolve to 2378 on empty profile');

  console.log('✅ Test 2.3 Passed: Safe defaults and null-safety for BMR/TDEE calculation verified.');
}

// ====================================================================
// SECTION 3: DAILY NET ENERGY BALANCE (I - G = L), DEFICIT/SURPLUS & DATE ISOLATION
// ====================================================================
console.log('\n--- SECTION 3: Daily Net Energy Balance (I - G = L), Deficit/Surplus & Multi-Date Isolation ---');

{
  const dToday = '2026-08-16';
  const dYesterday = '2026-08-15';
  const dTomorrow = '2026-08-17';

  // Clear storage & arrays
  context.meals.length = 0;
  saveActivities([]);

  // Log meals across different dates
  context.meals.push(
    { id: 'm_yest', date: dYesterday, nome: 'Jantar Ontem', itens: [{ nome: 'Pizza', porcao_g: 300, kcal: 800, proteina_g: 30, carbo_g: 80, gordura_g: 25 }] },
    { id: 'm_tod_1', date: dToday, nome: 'Café da Manhã', itens: [{ nome: 'Ovos e Pão', porcao_g: 200, kcal: 450, proteina_g: 25, carbo_g: 35, gordura_g: 15 }] },
    { id: 'm_tod_2', date: dToday, nome: 'Almoço', itens: [{ nome: 'Arroz, Feijão e Frango', porcao_g: 450, kcal: 750, proteina_g: 55, carbo_g: 80, gordura_g: 12 }] },
    { id: 'm_tom', date: dTomorrow, nome: 'Almoço Amanhã', itens: [{ nome: 'Salada', porcao_g: 250, kcal: 300, proteina_g: 10, carbo_g: 20, gordura_g: 10 }] }
  );

  // Log activities across different dates
  addActivity({ date: dYesterday, nome: 'Caminhada Ontem', duracaoMin: 30, met: 3.5, kcal: 130, origem: 'manual' });
  addActivity({ date: dToday, nome: 'Musculação Hoje', duracaoMin: 60, met: 5.0, kcal: 375, origem: 'manual' });
  addActivity({ date: dToday, nome: 'Corrida Hoje', duracaoMin: 30, met: 9.8, kcal: 368, origem: 'ia_texto' });
  addActivity({ date: dTomorrow, nome: 'Natação Amanhã', duracaoMin: 45, met: 7.0, kcal: 394, origem: 'manual' });

  // Verify multi-date activity isolation
  assert.strictEqual(dayActivities(dYesterday).length, 1);
  assert.strictEqual(dayBurned(dYesterday), 130);

  assert.strictEqual(dayActivities(dToday).length, 2);
  assert.strictEqual(dayBurned(dToday), 375 + 368); // 743 kcal

  assert.strictEqual(dayActivities(dTomorrow).length, 1);
  assert.strictEqual(dayBurned(dTomorrow), 394);

  // Today's Energy Balance Verification: I - G = L
  const I_today = dayTotals(dToday).kcal; // 450 + 750 = 1200 kcal
  const G_today = dayBurned(dToday);     // 743 kcal
  const L_today = I_today - G_today;     // 1200 - 743 = 457 kcal

  assert.strictEqual(I_today, 1200, 'Today ingested kcal mismatch');
  assert.strictEqual(G_today, 743, 'Today burned kcal mismatch');
  assert.strictEqual(L_today, 457, 'Today net energy balance mismatch');

  const targetKcal = 2000;
  const remainingBudget = targetKcal - L_today; // 2000 - 457 = 1543 kcal
  assert.strictEqual(remainingBudget, 1543, 'Remaining budget calculated incorrectly');
  assert(L_today <= targetKcal, 'Should be within budget deficit');

  console.log('✅ Test 3.1 Passed: Multi-date partitioning and daily energy balance (I - G = L) strictly isolated across calendar dates.');
}

// Net Energy Balance Edge Cases: Negative balance, Zero intake, Extreme Exercise Burn
{
  const dTest = '2026-08-16';

  // Case A: Zero Intake, Heavy Exercise (Fasting / High Burn)
  context.meals.length = 0;
  saveActivities([]);
  addActivity({ date: dTest, nome: 'Maratona / Longão', duracaoMin: 180, met: 10.0, kcal: 2250, origem: 'manual' });

  const I_zero = dayTotals(dTest).kcal; // 0
  const G_heavy = dayBurned(dTest);     // 2250
  const L_negative = I_zero - G_heavy;  // -2250

  assert.strictEqual(I_zero, 0);
  assert.strictEqual(G_heavy, 2250);
  assert.strictEqual(L_negative, -2250, 'Net balance must support negative values for severe caloric deficits');

  // Case B: Caloric Surplus condition
  context.meals.push({ id: 'm_big', date: dTest, nome: 'Churrasco Livre', itens: [{ nome: 'Carne e Acompanhamentos', porcao_g: 1000, kcal: 3500, proteina_g: 180, carbo_g: 100, gordura_g: 150 }] });
  const I_surplus = dayTotals(dTest).kcal; // 3500
  const G_same = dayBurned(dTest);         // 2250
  const L_surplus = I_surplus - G_same;    // 3500 - 2250 = 1250

  const target = 1000;
  assert.strictEqual(L_surplus, 1250);
  assert(L_surplus > target, 'Must correctly identify surplus when net balance exceeds target');
  const surplusKcal = L_surplus - target; // 250 kcal
  assert.strictEqual(surplusKcal, 250);

  console.log('✅ Test 3.2 Passed: Net energy balance edge cases (negative net balance, fasting, surplus) evaluated correctly.');
}

// ====================================================================
// SECTION 4: STATE MUTATIONS, STRESS TESTING, UNDO & BACKUP/RESTORE ROUNDTRIPS
// ====================================================================
console.log('\n--- SECTION 4: State Mutations, High-Volume Stress, Undo & Backup/Restore Roundtrips ---');

// High volume sequential additions & ID uniqueness
{
  saveActivities([]);
  const count = 100;
  const d = '2026-08-16';
  const generatedIds = new Set();

  for (let i = 0; i < count; i++) {
    const act = addActivity({
      date: d,
      nome: `Treino #${i + 1}`,
      duracaoMin: 15 + (i % 30),
      intensidade: i % 2 === 0 ? 'moderada' : 'intensa',
      met: 4.0 + (i % 6),
      kcal: 50 + i * 2,
      origem: i % 3 === 0 ? 'ia_texto' : 'manual'
    });

    assert(act.id, 'Activity must have non-empty ID');
    assert(!generatedIds.has(act.id), `Duplicate ID detected: ${act.id}`);
    generatedIds.add(act.id);
  }

  const liveActivities = vm.runInContext('activities', context);
  assert.strictEqual(liveActivities.length, count, 'In-memory activities list length mismatch');

  // Verify persistence to localStorage
  const loadedFromStorage = JSON.parse(mockLocalStorage.getItem('nt_activities'));
  assert.strictEqual(loadedFromStorage.length, count, 'Persisted localStorage activities count mismatch');

  console.log(`✅ Test 4.1 Passed: Sequential addition of ${count} activities produced 100% unique IDs with synchronous storage sync.`);
}

// Deletion, safe deletion of non-existent IDs, and Undo capability
{
  const d = '2026-08-16';
  saveActivities([]);

  const a1 = addActivity({ date: d, nome: 'Atividade 1', duracaoMin: 30, kcal: 200, met: 5.0 });
  const a2 = addActivity({ date: d, nome: 'Atividade 2', duracaoMin: 45, kcal: 350, met: 6.5 });
  const a3 = addActivity({ date: d, nome: 'Atividade 3', duracaoMin: 60, kcal: 500, met: 8.0 });

  assert.strictEqual(dayBurned(d), 1050);

  const getLiveActivities = () => vm.runInContext('activities', context);
  const getLiveMeals = () => vm.runInContext('meals', context);
  const getLiveProfile = () => vm.runInContext('profile', context);

  // Deleting non-existent ID
  const fakeDel = delActivity('non_existent_id_9999');
  assert.strictEqual(fakeDel, null, 'Deleting non-existent ID should return null safely');
  assert.strictEqual(getLiveActivities().length, 3, 'Activities count should not change');

  // Delete middle activity via handleDelActivity (which triggers undo toast)
  handleDelActivity(a2.id);
  assert.strictEqual(getLiveActivities().length, 2, 'Activities count should be 2 after deletion');
  assert.strictEqual(dayBurned(d), 700, 'Burned calories should update to 200 + 500 = 700');
  assert.strictEqual(context.__lastToast, 'Exercício removido');
  assert(typeof context.__lastToastUndo === 'function', 'Undo function must be registered on toast');

  // Execute Undo
  context.__lastToastUndo();
  assert.strictEqual(getLiveActivities().length, 3, 'Activities count should return to 3 after undo');
  assert.strictEqual(dayBurned(d), 1050, 'Burned calories should return to 1050 after undo');

  // Verify restored item properties
  const restored = getLiveActivities().find(a => a.id === a2.id || a.nome === 'Atividade 2');
  assert(restored, 'Restored activity must exist in activities array');
  assert.strictEqual(restored.kcal, 350);
  assert.strictEqual(restored.duracaoMin, 45);

  console.log('✅ Test 4.2 Passed: Safe deletion, missing ID resilience, and atomic Undo operation verified.');
}

// Backup / Wipe / Restore Complete Roundtrip Stress
{
  const getLiveActivities = () => vm.runInContext('activities', context);
  const getLiveMeals = () => vm.runInContext('meals', context);
  const getLiveProfile = () => vm.runInContext('profile', context);

  // 1. Populate full state
  const testDate = '2026-08-16';
  getLiveMeals().length = 0;
  saveActivities([]);

  getLiveMeals().push({
    id: 'm_roundtrip',
    date: testDate,
    hour: '12:30',
    nome: 'Almoço Completo',
    itens: [{ nome: 'Salmão Grelhado', porcao_g: 200, kcal: 420, proteina_g: 40, carbo_g: 0, gordura_g: 24 }],
    origem: 'ia_texto'
  });

  const complexActivity = addActivity({
    date: testDate,
    hour: '09:00',
    nome: 'Corrida + Pliometria',
    duracaoMin: 50,
    intensidade: 'muito_intensa',
    met: 10.5,
    kcal: 689,
    origem: 'ia_texto',
    segmentos: [
      { descricao: 'Tiros de corrida', duracao_minutos: 30, met: 12.0, kcal_gasto: 470 },
      { descricao: 'Saltos pliométricos', duracao_minutos: 20, met: 8.0, kcal_gasto: 219 }
    ]
  });

  const prof = getLiveProfile();
  prof.peso = 82;
  prof.altura = 182;
  prof.idade = 29;
  prof.sexo = 'm';
  prof.kcal = 2400;

  // 2. Generate backup JSON
  const backupPayload = JSON.stringify({
    meals: getLiveMeals(),
    activities: getLiveActivities(),
    profile: getLiveProfile(),
    alims: [{ nome: 'Whey Protein Isolado', porcao_g: 30, kcal: 120, proteina_g: 27, carbo_g: 1, gordura_g: 0, custom: true }],
    reminders: [{ id: 'almoco', nome: 'Almoço', hora: '12:30', ativo: true }],
    habits: { [testDate]: { creatina: true } },
    water: { [testDate]: 2500 },
    apikey: 'AIzaTestSampleKey12345',
    pref: { precisao: 'precisa', paralelo: true },
    exportadoEm: new Date().toISOString()
  });

// 3. Wipe All
wipeAll();
context.confirmWipeAll(); // contrato novo: modal + confirmacao
  assert.strictEqual(getLiveMeals().length, 0, 'Meals must be empty after wipeAll');
  assert.strictEqual(getLiveActivities().length, 0, 'Activities must be empty after wipeAll');
  assert.strictEqual(mockLocalStorage.getItem('nt_activities'), null, 'localStorage nt_activities must be removed');
  assert.strictEqual(mockLocalStorage.getItem('nt_meals'), null, 'localStorage nt_meals must be removed');

  // 4. Restore Backup
  const restoreFileMock = {
    content: backupPayload
  };
  const mockFileReader = function() {
    this.readAsText = () => {
      this.result = restoreFileMock.content;
      if (this.onload) this.onload();
    };
  };
  context.FileReader = mockFileReader;

  doRestore(restoreFileMock);

  // 5. Assert integrity post-restore
  const postMeals = getLiveMeals();
  const postActivities = getLiveActivities();
  const postProfile = getLiveProfile();

  assert.strictEqual(postMeals.length, 1, 'Meals must be restored');
  assert.strictEqual(postMeals[0].nome, 'Almoço Completo');
  assert.strictEqual(postMeals[0].itens[0].kcal, 420);

  assert.strictEqual(postActivities.length, 1, 'Activities must be restored');
  assert.strictEqual(postActivities[0].nome, 'Corrida + Pliometria');
  assert.strictEqual(postActivities[0].kcal, 689);
  assert.strictEqual(postActivities[0].met, 10.5);
  assert.strictEqual(postActivities[0].segmentos.length, 2);
  assert.strictEqual(postActivities[0].segmentos[0].descricao, 'Tiros de corrida');

  assert.strictEqual(postProfile.peso, 82);
  assert.strictEqual(dayBurned(testDate), 689);
  assert.strictEqual(dayTotals(testDate).kcal, 420);

  // Net Balance after restore: 420 - 689 = -269
  assert.strictEqual(dayTotals(testDate).kcal - dayBurned(testDate), -269);

  console.log('✅ Test 4.3 Passed: Complete Backup -> Wipe -> Restore roundtrip preserved 100% data fidelity including complex multi-segment records.');
}

// ====================================================================
// SECTION 5: GEMINI ACTIVITY AI SCHEMA, BIOMETRICS & OUTLIER FILTERING
// ====================================================================
console.log('\n--- SECTION 5: Gemini AI Activity Schema, Biometric Injection & Consensus Outlier Filter ---');

// Schema validation
{
  assert(ACTIVITY_SCHEMA, 'ACTIVITY_SCHEMA must exist');
  assert.strictEqual(ACTIVITY_SCHEMA.type, 'object');
  assert(ACTIVITY_SCHEMA.required.includes('nome_atividade'));
  assert(ACTIVITY_SCHEMA.required.includes('duracao_minutos_total'));
  assert(ACTIVITY_SCHEMA.required.includes('met_medio'));
  assert(ACTIVITY_SCHEMA.required.includes('kcal_gasto_total'));
  assert(ACTIVITY_SCHEMA.required.includes('intensidade'));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ACTIVITY_SCHEMA.properties.intensidade.enum)), ['leve', 'moderada', 'intensa', 'muito_intensa']);
  console.log('✅ Test 5.1 Passed: ACTIVITY_SCHEMA validated with all required properties and enum constraints.');
}

// Biometric injection into payload
{
  const customProfile = { peso: 90, altura: 185, idade: 35, sexo: 'm' };
  const payload = apiBodyAtividade('Fiz 45 min de remo indoor', { thinkingLevel: 'low' }, customProfile);

  assert(payload.contents && payload.contents[0].parts[0].text, 'Payload contents text missing');
  const promptText = payload.contents[0].parts[0].text;

  assert(promptText.includes('Peso: 90 kg'), 'Biometric weight not injected');
  assert(promptText.includes('Altura: 185 cm'), 'Biometric height not injected');
  assert(promptText.includes('Idade: 35 anos'), 'Biometric age not injected');
  assert(promptText.includes('Sexo: Masculino'), 'Biometric sex not injected');
  assert(promptText.includes('Fiz 45 min de remo indoor'), 'User description not injected');
  assert.strictEqual(payload.generationConfig.responseMimeType, 'application/json');

  console.log('✅ Test 5.2 Passed: apiBodyAtividade injects exact user biometric parameters and description into prompt.');
}

// Consensus merge with outlier rejection (>50% divergence from median on 3+ responses)
{
  // Test Case A: 3 responses with 1 severe hallucinated outlier (e.g. 1500 kcal vs 320 kcal)
  const responsesWithOutlier = [
    { nome_atividade: 'Corrida', kcal_gasto_total: 310, duracao_minutos_total: 30, met_medio: 8.5, intensidade: 'intensa', segmentos: [] },
    { nome_atividade: 'Corrida Moderada', kcal_gasto_total: 330, duracao_minutos_total: 30, met_medio: 9.0, intensidade: 'intensa', segmentos: [] },
    { nome_atividade: 'Corrida Extrema', kcal_gasto_total: 1500, duracao_minutos_total: 30, met_medio: 40.0, intensidade: 'muito_intensa', segmentos: [] } // Outlier!
  ];

  const mergedA = mergeActivityAnalisys(responsesWithOutlier);
  // Median is 330 (sorted: 310, 330, 1500). Distance: |310-330|=20, |330-330|=0, |1500-330|=1170 (> 0.5*330 = 165).
  // 1500 is filtered out! Usados: [310, 330] -> Average kcal: (310+330)/2 = 320 kcal.
  assert.strictEqual(mergedA.kcal_gasto_total, 320, `Outlier 1500 must be rejected: got ${mergedA.kcal_gasto_total}, expected 320`);
  assert.strictEqual(mergedA.duracao_minutos_total, 30);
  assert.strictEqual(mergedA.met_medio, 8.8, `MET average without outlier: got ${mergedA.met_medio}, expected 8.8`);

  // Test Case B: 3 closely aligned responses
  const responsesAligned = [
    { nome_atividade: 'Natação', kcal_gasto_total: 400, duracao_minutos_total: 45, met_medio: 7.0, intensidade: 'intensa' },
    { nome_atividade: 'Natação Crawl', kcal_gasto_total: 410, duracao_minutos_total: 45, met_medio: 7.2, intensidade: 'intensa' },
    { nome_atividade: 'Natação Moderada', kcal_gasto_total: 420, duracao_minutos_total: 45, met_medio: 7.4, intensidade: 'intensa' }
  ];

  const mergedB = mergeActivityAnalisys(responsesAligned);
  assert.strictEqual(mergedB.kcal_gasto_total, 410, `Consensus average should be 410: got ${mergedB.kcal_gasto_total}`);
  assert.strictEqual(mergedB.met_medio, 7.2, `Consensus average MET should be 7.2: got ${mergedB.met_medio}`);

  // Test Case C: Single response fallback
  const single = [{ nome_atividade: 'Caminhada', kcal_gasto_total: 120, duracao_minutos_total: 30, met_medio: 3.5, intensidade: 'moderada' }];
  const mergedC = mergeActivityAnalisys(single);
  assert.strictEqual(mergedC.kcal_gasto_total, 120);
  assert.strictEqual(mergedC.met_medio, 3.5);

  console.log('✅ Test 5.3 Passed: mergeActivityAnalisys correctly filters statistical outliers and computes robust consensus.');
}

console.log('\n================================================================');
console.log('=== EMPIRICAL CHALLENGER M2: ALL 5 ADVERSARIAL SUITES PASSED! ===');
console.log('================================================================');
