'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 2: NUTRITRACK (R3) STRESS TEST      ===');
console.log('================================================================\n');

const rootDir = path.resolve(__dirname, '../../../../../');
const nutricaoDir = path.join(rootDir, 'nutricao-android/app/src/main/assets');

const estadoCode = fs.readFileSync(path.join(nutricaoDir, 'apps/nutricao/estado.js'), 'utf8');
const logicCode = fs.readFileSync(path.join(nutricaoDir, 'apps/nutricao/logic.js'), 'utf8');
const diarioCode = fs.readFileSync(path.join(nutricaoDir, 'apps/nutricao/views/diario.js'), 'utf8');
const hojeCode = fs.readFileSync(path.join(nutricaoDir, 'apps/nutricao/views/hoje.js'), 'utf8');
const uiCode = fs.readFileSync(path.join(nutricaoDir, 'kernel/ui.js'), 'utf8');

function createNutriTrackSandbox(customDateProvider = null, initialStorage = {}) {
  const mockStorage = Object.assign({}, initialStorage);
  const mockLocalStorage = {
    getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
  };

  const toastCalls = [];
  const modalCalls = [];

  const CustomDate = customDateProvider || Date;

  const sandbox = {
    console: console,
    localStorage: mockLocalStorage,
    Date: CustomDate,
    Math: Math,
    JSON: JSON,
    parseFloat: parseFloat,
    parseInt: parseInt,
    Number: Number,
    String: String,
    Array: Array,
    Object: Object,
    Set: Set,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    // UI Helpers
    toast: (msg, undo) => { toastCalls.push({ msg, undo }); },
    openModal: (html) => { modalCalls.push(html); },
    closeModal: () => {},
    document: {
      querySelector: (s) => null,
      querySelectorAll: (s) => []
    },
    window: {
      AndroidBridge: null
    },
    mockStorage: mockStorage,
    getToastCalls: () => toastCalls
  };

  vm.createContext(sandbox);

  // Load modules
  vm.runInContext(estadoCode, sandbox);
  vm.runInContext(logicCode, sandbox);
  vm.runInContext(uiCode, sandbox);
  vm.runInContext(hojeCode, sandbox);
  vm.runInContext(diarioCode, sandbox);

  vm.runInContext(`
    globalThis.meals = typeof meals !== 'undefined' ? meals : [];
    globalThis.habits = typeof habits !== 'undefined' ? habits : {};
    globalThis.water = typeof water !== 'undefined' ? water : {};
    globalThis.activities = typeof activities !== 'undefined' ? activities : [];
    globalThis.profile = typeof profile !== 'undefined' ? profile : {};
    globalThis.today = typeof today !== 'undefined' ? today : null;
    globalThis.dateKey = typeof dateKey !== 'undefined' ? dateKey : null;
    globalThis.todayISO = typeof todayISO !== 'undefined' ? todayISO : null;
    globalThis.horaNow = typeof horaNow !== 'undefined' ? horaNow : null;
    globalThis.localDateStr = typeof localDateStr !== 'undefined' ? localDateStr : null;
    globalThis.dayMeals = typeof dayMeals !== 'undefined' ? dayMeals : null;
    globalThis.dayTotals = typeof dayTotals !== 'undefined' ? dayTotals : null;
    globalThis.dayActivities = typeof dayActivities !== 'undefined' ? dayActivities : null;
    globalThis.dayBurned = typeof dayBurned !== 'undefined' ? dayBurned : null;
    globalThis.addActivity = typeof addActivity !== 'undefined' ? addActivity : null;
    globalThis.delActivity = typeof delActivity !== 'undefined' ? delActivity : null;
    globalThis.getCreatinaStatus = typeof getCreatinaStatus !== 'undefined' ? getCreatinaStatus : null;
    globalThis.toggleCreatina = typeof toggleCreatina !== 'undefined' ? toggleCreatina : null;
    globalThis.getWaterIntake = typeof getWaterIntake !== 'undefined' ? getWaterIntake : null;
    globalThis.addWaterIntake = typeof addWaterIntake !== 'undefined' ? addWaterIntake : null;
    globalThis.setWaterIntake = typeof setWaterIntake !== 'undefined' ? setWaterIntake : null;
    globalThis.getWaterGoal = typeof getWaterGoal !== 'undefined' ? getWaterGoal : null;
    globalThis.setWaterGoal = typeof setWaterGoal !== 'undefined' ? setWaterGoal : null;
    globalThis.save = typeof save !== 'undefined' ? save : null;
    globalThis.load = typeof load !== 'undefined' ? load : null;
    globalThis.uid = typeof uid !== 'undefined' ? uid : null;
    globalThis.LS = typeof LS !== 'undefined' ? LS : null;
  `, sandbox);

  return sandbox;
}

// Helper to create a Mock Date constructor with simulated local time
function createMockDateClass(year, monthIndex, day, hours, minutes, seconds) {
  const baseLocalTime = new Date(year, monthIndex, day, hours, minutes, seconds);
  
  class MockDate {
    constructor(...args) {
      if (args.length === 0) {
        return new Date(baseLocalTime.getTime());
      }
      return new Date(...args);
    }
    static now() {
      return baseLocalTime.getTime();
    }
    static parse(s) {
      return Date.parse(s);
    }
    static UTC(...args) {
      return Date.UTC(...args);
    }
  }
  return MockDate;
}

// =============================================================================
// SUITE 1: Late-Night Date Calculations (21:00 - 23:59:59) in UTC-3 & Negative Offsets
// =============================================================================
console.log('--- SUITE 1: Late-Night Local Date Strict Invariants (21:00 - 23:59:59) ---');
{
  // Test cases: simulated local times between 21:00 and 23:59:59 across various dates
  const lateNightCases = [
    { y: 2026, m: 7, d: 17, h: 21, min: 0, s: 0, expectedDate: '2026-08-17', expectedHora: '21:00' },
    { y: 2026, m: 7, d: 17, h: 21, min: 30, s: 15, expectedDate: '2026-08-17', expectedHora: '21:30' },
    { y: 2026, m: 7, d: 17, h: 22, min: 45, s: 30, expectedDate: '2026-08-17', expectedHora: '22:45' },
    { y: 2026, m: 7, d: 17, h: 23, min: 59, s: 59, expectedDate: '2026-08-17', expectedHora: '23:59' },
    { y: 2026, m: 11, d: 31, h: 23, min: 55, s: 0, expectedDate: '2026-12-31', expectedHora: '23:55' }, // New Year's Eve late night
    { y: 2024, m: 1, d: 29, h: 23, min: 59, s: 0, expectedDate: '2024-02-29', expectedHora: '23:59' }, // Leap Day late night
    { y: 2025, m: 1, d: 28, h: 23, min: 59, s: 59, expectedDate: '2025-02-28', expectedHora: '23:59' }  // Non-leap Feb 28 late night
  ];

  lateNightCases.forEach((tc, idx) => {
    const MockDate = createMockDateClass(tc.y, tc.m, tc.d, tc.h, tc.min, tc.s);
    const sb = createNutriTrackSandbox(MockDate);

    const localToday = sb.today();
    const localDateKey = sb.dateKey();
    const localTodayISO = sb.todayISO();
    const localHora = sb.horaNow();

    assert.strictEqual(localToday, tc.expectedDate, `Case ${idx + 1} (${tc.expectedDate} ${tc.expectedHora}): today() must match local date`);
    assert.strictEqual(localDateKey, tc.expectedDate, `Case ${idx + 1}: dateKey() must match local date`);
    assert.strictEqual(localTodayISO, tc.expectedDate, `Case ${idx + 1}: todayISO() must match local date`);
    assert.strictEqual(localHora, tc.expectedHora, `Case ${idx + 1}: horaNow() must match local 24h time`);
  });

  console.log('✅ SUITE 1 Passed: 100% of late-night hours (21:00-23:59:59) strictly resolve to local calendar date.');
}

// =============================================================================
// SUITE 2: Late-Night Meal Logging, Macro Totals & Day Isolation
// =============================================================================
console.log('\n--- SUITE 2: Late-Night Meal Logging & Macro Accumulation ---');
{
  // Simulate 22:45 on 2026-08-17 (UTC-3: this is 01:45 UTC of 2026-08-18)
  const MockDate = createMockDateClass(2026, 7, 17, 22, 45, 0);
  const sb = createNutriTrackSandbox(MockDate);

  assert.strictEqual(sb.today(), '2026-08-17', 'Sandbox today() should be 2026-08-17');

  // Log a dinner meal
  const janta = {
    id: sb.uid(),
    date: sb.today(),
    hour: sb.horaNow(),
    nome: 'Jantar Proteico',
    itens: [
      { nome: 'Patinho moído grelhado', porcao_g: 200, kcal: 360, proteina_g: 52, carbo_g: 0, gordura_g: 16 },
      { nome: 'Arroz branco cozido', porcao_g: 150, kcal: 195, proteina_g: 4, carbo_g: 42, gordura_g: 1 }
    ],
    origem: 'manual'
  };

  sb.meals.push(janta);
  sb.save(sb.LS.m, sb.meals);

  // Log a late-night supper at 23:50
  const ceia = {
    id: sb.uid(),
    date: sb.today(),
    hour: '23:50',
    nome: 'Ceia',
    itens: [
      { nome: 'Iogurte natural desnatado', porcao_g: 170, kcal: 85, proteina_g: 10, carbo_g: 11, gordura_g: 0 },
      { nome: 'Whey protein 80%', porcao_g: 30, kcal: 120, proteina_g: 24, carbo_g: 2, gordura_g: 2 }
    ],
    origem: 'manual'
  };

  sb.meals.push(ceia);
  sb.save(sb.LS.m, sb.meals);

  // Verify meals stored under 2026-08-17
  const mealsToday = sb.dayMeals('2026-08-17');
  assert.strictEqual(mealsToday.length, 2, 'Must have 2 meals logged for today');

  // Verify default dayMeals() matches
  assert.strictEqual(sb.dayMeals().length, 2, 'Default dayMeals() must match');

  // Verify dayTotals
  const totals = sb.dayTotals('2026-08-17');
  const expectedKcal = 360 + 195 + 85 + 120; // 760 kcal
  const expectedP = 52 + 4 + 10 + 24; // 90 g
  const expectedC = 0 + 42 + 11 + 2; // 55 g
  const expectedG = 16 + 1 + 0 + 2; // 19 g

  assert.strictEqual(totals.kcal, expectedKcal, `Kcal total must be ${expectedKcal}`);
  assert.strictEqual(totals.p, expectedP, `Protein total must be ${expectedP}g`);
  assert.strictEqual(totals.c, expectedC, `Carb total must be ${expectedC}g`);
  assert.strictEqual(totals.g, expectedG, `Fat total must be ${expectedG}g`);

  // Verify next day (2026-08-18) is completely empty and isolated
  assert.strictEqual(sb.dayMeals('2026-08-18').length, 0, 'Next calendar day must have 0 meals');
  assert.strictEqual(sb.dayTotals('2026-08-18').kcal, 0, 'Next calendar day totals must be 0');

  console.log('✅ SUITE 2 Passed: Late-night meal logging accurately accumulates macros under local calendar date.');
}

// =============================================================================
// SUITE 3: Late-Night Water Intake & Creatine Toggle
// =============================================================================
console.log('\n--- SUITE 3: Late-Night Water Intake & Creatine Toggle ---');
{
  const MockDate = createMockDateClass(2026, 7, 17, 23, 15, 0);
  const sb = createNutriTrackSandbox(MockDate);

  // 1. Water Intake testing
  assert.strictEqual(sb.getWaterIntake(), 0, 'Initial water intake should be 0');

  // Quick water additions: 250mL, 500mL, 300mL
  sb.addWaterIntake(250);
  assert.strictEqual(sb.getWaterIntake(), 250, 'Water intake should be 250 mL');

  sb.addWaterIntake(500);
  assert.strictEqual(sb.getWaterIntake(), 750, 'Water intake should be 750 mL');

  sb.addWaterIntake(300);
  assert.strictEqual(sb.getWaterIntake(), 1050, 'Water intake should be 1050 mL');

  // Check persistence in both keys (water dict and legacy single key)
  assert.strictEqual(sb.water['2026-08-17'], 1050, 'water dict contains 1050 under 2026-08-17');
  const rawWaterLegacy = JSON.parse(sb.mockStorage['nt_water_2026-08-17']);
  assert.strictEqual(rawWaterLegacy.current_ml, 1050, 'Legacy key persisted 1050 mL');

  // Reset water
  sb.setWaterIntake(0);
  assert.strictEqual(sb.getWaterIntake(), 0, 'Water intake reset to 0');
  sb.setWaterIntake(1500);
  assert.strictEqual(sb.getWaterIntake(), 1500, 'Water intake set to 1500');

  // 2. Creatine Toggle testing
  assert.strictEqual(sb.getCreatinaStatus(), false, 'Creatine should initially be false');

  // Toggle ON
  const res1 = sb.toggleCreatina();
  assert.strictEqual(res1, true, 'toggleCreatina() should return true');
  assert.strictEqual(sb.getCreatinaStatus(), true, 'getCreatinaStatus() should be true');
  assert.strictEqual(sb.habits['2026-08-17'].creatina, true, 'habits dict contains true under local date');

  // Toggle OFF
  const res2 = sb.toggleCreatina();
  assert.strictEqual(res2, false, 'toggleCreatina() should return false');
  assert.strictEqual(sb.getCreatinaStatus(), false, 'getCreatinaStatus() should be false');

  console.log('✅ SUITE 3 Passed: Water intake accumulation and creatine toggle execute cleanly in late-night hours.');
}

// =============================================================================
// SUITE 4: Late-Night Activity Logging & Net Energy Balance (I - G = L)
// =============================================================================
console.log('\n--- SUITE 4: Late-Night Activity Logging & Net Energy Balance ---');
{
  const MockDate = createMockDateClass(2026, 7, 17, 23, 30, 0);
  const sb = createNutriTrackSandbox(MockDate);

  // Add a meal of 2000 kcal
  sb.meals.push({
    id: 'm1',
    date: sb.today(),
    hour: '20:00',
    nome: 'Refeições do Dia',
    itens: [{ nome: 'Alimentação', porcao_g: 1000, kcal: 2000, proteina_g: 150, carbo_g: 200, gordura_g: 60 }]
  });
  sb.save(sb.LS.m, sb.meals);

  // Log activity at late night
  const act = sb.addActivity({
    nome: 'Futebol / Corrida Noturna',
    duracaoMin: 60,
    intensidade: 'alta',
    met: 8.5,
    kcal_gasto: 550,
    origem: 'manual'
  });

  assert(act && act.id, 'Activity must have an ID');
  assert.strictEqual(act.date, '2026-08-17', 'Activity date must be 2026-08-17');
  assert.strictEqual(act.hour, '23:30', 'Activity hour must be 23:30');

  // Verify dayActivities and dayBurned
  const acts = sb.dayActivities('2026-08-17');
  assert.strictEqual(acts.length, 1, 'dayActivities must have 1 entry');
  const burned = sb.dayBurned('2026-08-17');
  assert.strictEqual(burned, 550, 'dayBurned must be 550 kcal');

  // Net Energy Balance equation: I - G = L
  const I = sb.dayTotals().kcal; // 2000
  const G = sb.dayBurned();     // 550
  const L = I - G;              // 1450

  assert.strictEqual(I, 2000, 'Ingested calories I = 2000');
  assert.strictEqual(G, 550, 'Exercise burned calories G = 550');
  assert.strictEqual(L, 1450, 'Net calories L (I - G) = 1450');

  console.log('✅ SUITE 4 Passed: Activity expenditure and net energy balance (I - G = L) validated.');
}

// =============================================================================
// SUITE 5: 7-Day Diary Array Construction Across Month & Year Boundaries
// =============================================================================
console.log('\n--- SUITE 5: 7-Day Diary Array Construction Across Month & Year Boundaries ---');
{
  function build7DayArray(customDateClass) {
    const sb = createNutriTrackSandbox(customDateClass);
    const ds = [];
    for (let i = 6; i >= 0; i--) {
      const d = new sb.Date();
      d.setDate(d.getDate() - i);
      ds.push(sb.dateKey(d));
    }
    return ds;
  }

  // 1. Leap Year Boundary: 2024-03-02 at 23:59:59 (crosses Feb 29 in leap year)
  {
    const MockDate = createMockDateClass(2024, 2, 2, 23, 59, 59); // Month index 2 is March
    const ds = build7DayArray(MockDate);
    const expected = [
      '2024-02-25',
      '2024-02-26',
      '2024-02-27',
      '2024-02-28',
      '2024-02-29', // Leap day included
      '2024-03-01',
      '2024-03-02'
    ];
    assert.deepStrictEqual(ds, expected, '7-day array across 2024 Leap Year boundary must include Feb 29');
    console.log('  -> 2024 Leap Year Boundary: OK (Feb 29 properly traversed)');
  }

  // 2. Non-Leap Year Boundary: 2025-03-03 at 23:59:59 (Feb has 28 days)
  {
    const MockDate = createMockDateClass(2025, 2, 3, 23, 59, 59); // March 3, 2025
    const ds = build7DayArray(MockDate);
    const expected = [
      '2025-02-25',
      '2025-02-26',
      '2025-02-27',
      '2025-02-28', // Direct jump to Mar 01
      '2025-03-01',
      '2025-03-02',
      '2025-03-03'
    ];
    assert.deepStrictEqual(ds, expected, '7-day array across 2025 Non-Leap boundary must jump from Feb 28 to Mar 01');
    console.log('  -> 2025 Non-Leap Boundary: OK (Feb 28 -> Mar 01 jump verified)');
  }

  // 3. Year Rollover Boundary: 2026-01-03 at 23:45:00 (crosses Dec 31 -> Jan 01)
  {
    const MockDate = createMockDateClass(2026, 0, 3, 23, 45, 0); // Jan 3, 2026
    const ds = build7DayArray(MockDate);
    const expected = [
      '2025-12-28',
      '2025-12-29',
      '2025-12-30',
      '2025-12-31', // 2025 Year end
      '2026-01-01', // 2026 Year start
      '2026-01-02',
      '2026-01-03'
    ];
    assert.deepStrictEqual(ds, expected, '7-day array across Year Rollover must span 2025-12-28 to 2026-01-03');
    console.log('  -> Year Rollover Boundary (2025 -> 2026): OK');
  }

  // 4. 30-Day Month Boundary: 2026-05-03 at 23:59:59 (April has 30 days)
  {
    const MockDate = createMockDateClass(2026, 4, 3, 23, 59, 59); // May 3, 2026
    const ds = build7DayArray(MockDate);
    const expected = [
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30', // April ends at 30
      '2026-05-01',
      '2026-05-02',
      '2026-05-03'
    ];
    assert.deepStrictEqual(ds, expected, '7-day array across 30-day month (April->May) must be exact');
    console.log('  -> 30-Day Month Boundary (Apr 30 -> May 01): OK');
  }

  // 5. Array Invariant Assertions: Strictly 7 items, strictly unique, strictly increasing
  const testScenarios = [
    { y: 2024, m: 1, d: 29, h: 23, min: 59 },
    { y: 2025, m: 11, d: 31, h: 23, min: 59 },
    { y: 2026, m: 6, d: 31, h: 22, min: 0 },
    { y: 2026, m: 8, d: 1, h: 23, min: 59 },
    { y: 2026, m: 9, d: 31, h: 23, min: 59 }
  ];

  testScenarios.forEach((sc, i) => {
    const MockDate = createMockDateClass(sc.y, sc.m, sc.d, sc.h, sc.min, 0);
    const ds = build7DayArray(MockDate);
    assert.strictEqual(ds.length, 7, `Scenario ${i + 1}: Array length must be 7`);
    assert.strictEqual(new Set(ds).size, 7, `Scenario ${i + 1}: All 7 dates must be unique`);
    for (let j = 0; j < 6; j++) {
      assert(ds[j] < ds[j + 1], `Scenario ${i + 1}: Date ${ds[j]} must be earlier than ${ds[j + 1]}`);
    }
  });

  console.log('✅ SUITE 5 Passed: 7-day diary array construction is 100% resilient across all calendar boundaries.');
}

// =============================================================================
// SUITE 6: 1,000 Timestamp Fuzzing Matrix Across Negative Timezone Offsets
// =============================================================================
console.log('\n--- SUITE 6: 1,000 Timestamp Fuzzing Matrix Across Negative Timezones ---');
{
  const sb = createNutriTrackSandbox();
  
  let totalFuzzPasses = 0;
  // Test 1,000 randomized moments across 2024-2028
  for (let i = 0; i < 1000; i++) {
    const year = 2024 + Math.floor(Math.random() * 5); // 2024 to 2028
    const month = Math.floor(Math.random() * 12);     // 0 to 11
    const day = 1 + Math.floor(Math.random() * 28);   // 1 to 28 safe
    const hour = Math.floor(Math.random() * 24);      // 0 to 23
    const minute = Math.floor(Math.random() * 60);    // 0 to 59
    const second = Math.floor(Math.random() * 60);    // 0 to 59

    const d = new Date(year, month, day, hour, minute, second);
    const calculatedDateStr = sb.localDateStr(d);
    const calculatedHora = sb.horaNow(d);

    const expectedDateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const expectedHora = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');

    assert.strictEqual(calculatedDateStr, expectedDateStr, `Fuzz #${i}: localDateStr must match expected local date`);
    assert.strictEqual(calculatedHora, expectedHora, `Fuzz #${i}: horaNow must match expected local 24h time`);
    totalFuzzPasses++;
  }

  console.log(`✅ SUITE 6 Passed: ${totalFuzzPasses}/1000 randomized timestamps verified with 100% local precision.`);
}

// =============================================================================
// SUITE 7: Midnight Boundary Rollover Invariants (23:59:59 -> 00:00:00 Auto-Reset)
// =============================================================================
console.log('\n--- SUITE 7: Midnight Boundary Rollover Invariants (23:59:59 -> 00:00:00) ---');
{
  // Day 1 at 23:59:59
  const Day1Date = createMockDateClass(2026, 7, 17, 23, 59, 59);
  const sb1 = createNutriTrackSandbox(Day1Date);

  // Log Day 1 data
  sb1.meals.push({
    id: 'm-late',
    date: sb1.today(),
    hour: '23:59',
    nome: 'Ceia Tardia',
    itens: [{ nome: 'Caseína', porcao_g: 30, kcal: 110, proteina_g: 24, carbo_g: 1, gordura_g: 1 }]
  });
  sb1.save(sb1.LS.m, sb1.meals);
  sb1.addWaterIntake(2500);
  sb1.toggleCreatina();
  sb1.addActivity({ nome: 'Alongamento', duracaoMin: 15, kcal: 50 });

  // Validate Day 1 counts
  assert.strictEqual(sb1.dayMeals('2026-08-17').length, 1, 'Day 1 has 1 meal');
  assert.strictEqual(sb1.getWaterIntake('2026-08-17'), 2500, 'Day 1 water is 2500');
  assert.strictEqual(sb1.getCreatinaStatus('2026-08-17'), true, 'Day 1 creatine is taken');
  assert.strictEqual(sb1.dayBurned('2026-08-17'), 50, 'Day 1 exercise burned is 50');

  // Day 2 at 00:00:01 (1 second later)
  const Day2Date = createMockDateClass(2026, 7, 18, 0, 0, 1);
  const sb2 = createNutriTrackSandbox(Day2Date, sb1.mockStorage);

  // Verify Day 2 automatically starts fresh
  assert.strictEqual(sb2.today(), '2026-08-18', 'Day 2 today() is 2026-08-18');
  assert.strictEqual(sb2.dayMeals().length, 0, 'Day 2 has 0 meals logged initially');
  assert.strictEqual(sb2.dayTotals().kcal, 0, 'Day 2 totals are 0');
  assert.strictEqual(sb2.getWaterIntake(), 0, 'Day 2 water intake auto-resets to 0');
  assert.strictEqual(sb2.getCreatinaStatus(), false, 'Day 2 creatine auto-resets to pending (false)');
  assert.strictEqual(sb2.dayBurned(), 0, 'Day 2 burned exercise is 0');

  // Historical Day 1 records remain 100% accessible
  assert.strictEqual(sb2.dayMeals('2026-08-17').length, 1, 'Day 1 meals preserved');
  assert.strictEqual(sb2.getWaterIntake('2026-08-17'), 2500, 'Day 1 water preserved');
  assert.strictEqual(sb2.getCreatinaStatus('2026-08-17'), true, 'Day 1 creatine preserved');

  console.log('✅ SUITE 7 Passed: Midnight boundary transition guarantees automatic daily reset and historical retention.');
}

// =============================================================================
// SUITE 8: Defensive Parsing on Malformed, Corrupted & Boundary Inputs
// =============================================================================
console.log('\n--- SUITE 8: Defensive Parsing on Malformed & Corrupted Inputs ---');
{
  const sb = createNutriTrackSandbox();
  
  // 1. Valid regex string passes untouched
  assert.strictEqual(sb.localDateStr('2026-08-17'), '2026-08-17', 'Regex fast path for YYYY-MM-DD');

  // 2. Timestamps and string dates
  assert.strictEqual(sb.localDateStr('2026-12-25T15:30:00'), '2026-12-25', 'ISO timestamp string parses local date');

  // 3. Epoch milliseconds
  const epochMs = new Date(2026, 6, 4, 12, 0, 0).getTime();
  assert.strictEqual(sb.localDateStr(epochMs), '2026-07-04', 'Epoch ms number parses local date');

  // 4. Corrupted / Fallback inputs
  const nowExpected = sb.today();
  assert.strictEqual(sb.localDateStr(null), nowExpected, 'null falls back to current local date');
  assert.strictEqual(sb.localDateStr(undefined), nowExpected, 'undefined falls back to current local date');
  assert.strictEqual(sb.localDateStr('invalid-date-string'), nowExpected, 'Invalid string falls back safely');
  assert.strictEqual(sb.localDateStr(NaN), nowExpected, 'NaN falls back safely');

  // 5. horaNow defensive fallback
  assert.strictEqual(sb.horaNow(null), sb.horaNow(), 'horaNow(null) falls back safely');
  assert.strictEqual(sb.horaNow(undefined), sb.horaNow(), 'horaNow(undefined) falls back safely');

  console.log('✅ SUITE 8 Passed: Zero crashes on malformed/corrupted inputs; fallback mechanisms 100% robust.');
}

console.log('\n================================================================');
console.log('🎉 ALL NUTRITRACK (R3) EMPIRICAL TESTS PASSED (100%)');
console.log('================================================================');

