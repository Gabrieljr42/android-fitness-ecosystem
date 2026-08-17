'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 1 — ADVERSARIAL STRESS TEST SUITE ===');
console.log('=== MILESTONE 2: PROGRESSION, ANATOMY, TELEMETRY & STORAGE ===');
console.log('================================================================\n');

// Load core modules
const Progression = require('../../main/assets/core/progressao.js');
const BodyVisualizer = require('../../main/assets/apps/evolucao/body-visualizer.js');

// Setup VM environment for kernel and views
function setupContext() {
  const dummyEl = {
    onclick: null,
    oninput: null,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    style: {},
    value: '',
    textContent: '',
    innerHTML: '',
    querySelectorAll: () => [],
    querySelector: () => null,
    getAttribute: () => null,
    setAttribute: () => {}
  };

  const windowObj = {
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
    isSecureContext: false
  };

  const ctx = {
    console: console,
    KEY: 'evolucao_treino_state',
    Progression: Progression,
    BodyVisualizer: BodyVisualizer,
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
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    document: {
      getElementById: () => dummyEl,
      querySelector: () => dummyEl,
      querySelectorAll: () => [],
      createElement: () => dummyEl,
      addEventListener: () => {},
      body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } }
    },
    window: windowObj,
    self: windowObj,
    localStorage: {
      _store: {},
      getItem: function(k) { return this._store[k] !== undefined ? this._store[k] : null; },
      setItem: function(k, v) { this._store[k] = String(v); },
      removeItem: function(k) { delete this._store[k]; },
      clear: function() { this._store = {}; }
    },
    navigator: {},
    tab: 'treino',
    state: null,
    initRest: () => {},
    initLiveTimer: () => {},
    toast: () => {},
    vibrate: () => {},
    celebrate: () => {},
    dlg: () => {}
  };

  vm.createContext(ctx);

  const baseDir = path.resolve(__dirname, '../../main/assets');
  const loadScript = (relPath) => {
    const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
    vm.runInContext(code, ctx);
  };

  loadScript('kernel/fmt.js');
  loadScript('kernel/icons.js');
  loadScript('kernel/charts.js');
  loadScript('apps/evolucao/exercicios/nomes.js');
  loadScript('apps/evolucao/dados.js');
  loadScript('kernel/db.js');
  loadScript('apps/evolucao/logic.js');
  loadScript('apps/evolucao/views/corrida.js');

  return ctx;
}

const ctx = setupContext();

// =============================================================================
// SUITE 1: PROGRESSION ENGINE INVARIANTS & ADVERSARIAL CASES
// =============================================================================
console.log('--- SUITE 1: Progression Engine Calculation Invariants ---');

// Test 1.1: parseRange with diverse and malformed range expressions
{
  console.log('Test 1.1: parseRange boundary and adversarial string parsing');
  const cases = [
    { input: '8-12', expected: { min: 8, max: 12 } },
    { input: '6 - 10', expected: { min: 6, max: 10 } },
    { input: '15 a 20', expected: { min: 15, max: 20 } },
    { input: '10 ate 12', expected: { min: 10, max: 12 } },
    { input: '5 to 8', expected: { min: 5, max: 8 } },
    { input: '10', expected: { min: 10, max: 10 } },
    { input: '12\u201315', expected: { min: 12, max: 15 } }, // en-dash
    { input: '12\u201415', expected: { min: 12, max: 15 } }, // em-dash
    { input: '0-0', expected: { min: 1, max: 1 } },
    { input: '-5 to 10', expected: { min: 5, max: 10 } },
    { input: '', expected: { min: 1, max: 1 } },
    { input: null, expected: { min: 1, max: 1 } },
    { input: undefined, expected: { min: 1, max: 1 } },
    { input: 'invalid', expected: { min: 1, max: 1 } },
    { input: '20-10', expected: { min: 20, max: 20 } } // inverted range fallback
  ];

  cases.forEach((tc, idx) => {
    const res = Progression.parseRange(tc.input);
    assert.strictEqual(res.min, tc.expected.min, `parseRange #${idx} min for '${tc.input}' expected ${tc.expected.min}, got ${res.min}`);
    assert.strictEqual(res.max, tc.expected.max, `parseRange #${idx} max for '${tc.input}' expected ${tc.expected.max}, got ${res.max}`);
    assert(res.min <= res.max, `parseRange invariant min <= max violated for '${tc.input}'`);
  });
  console.log('  -> parseRange passed all 15 boundary cases.');
}

// Test 1.2: roundToIncrement precision and edge increments
{
  console.log('Test 1.2: roundToIncrement invariants');
  assert.strictEqual(Progression.roundToIncrement(82.3, 2.5), 82.5);
  assert.strictEqual(Progression.roundToIncrement(83.8, 2.5), 85.0);
  assert.strictEqual(Progression.roundToIncrement(10, 5), 10);
  assert.strictEqual(Progression.roundToIncrement(12.4, 5), 10);
  assert.strictEqual(Progression.roundToIncrement(12.5, 5), 15);
  assert.strictEqual(Progression.roundToIncrement(1.0, 2.5), 2.5, 'Minimum value should be increment if positive');
  assert.strictEqual(Progression.roundToIncrement(0, 2.5), 2.5);
  assert.strictEqual(Progression.roundToIncrement(82.345, 0), 82.3, 'Increment 0 should round to 1 decimal place');
  console.log('  -> roundToIncrement verified.');
}

// Test 1.3: rirFor, capabilityForSet and zero/negative loads/reps
{
  console.log('Test 1.3: rirFor and capabilityForSet defensive boundary checks');
  
  // rirFor boundaries
  assert.strictEqual(Progression.rirFor({ rir: 0 }), 0);
  assert.strictEqual(Progression.rirFor({ rir: 6 }), 6);
  assert.strictEqual(Progression.rirFor({ rir: 10 }), 6, 'RIR > 6 clamped to 6');
  assert.strictEqual(Progression.rirFor({ rir: -5 }), 0, 'Negative RIR clamped to 0');
  assert.strictEqual(Progression.rirFor({ rir: '3' }), 3);
  assert.strictEqual(Progression.rirFor({ RIR: 4 }), 4, 'Case tolerance RIR');
  assert.strictEqual(Progression.rirFor({ rpeRir: 1 }), 1, 'Legacy rpeRir field support');
  assert.strictEqual(Progression.rirFor({ rir: null }), null);
  assert.strictEqual(Progression.rirFor({ rir: undefined }), null);
  assert.strictEqual(Progression.rirFor({ rir: '' }), null);
  assert.strictEqual(Progression.rirFor({ rir: 'invalid' }), null);

  // capabilityForSet with zero and positive loads
  const validSet = { w: 100, r: 10, rir: 2 };
  const cap = Progression.capabilityForSet(validSet);
  assert(cap !== null);
  assert.strictEqual(cap.weight, 100);
  assert.strictEqual(cap.reps, 10);
  assert.strictEqual(cap.rir, 2);
  assert.strictEqual(cap.failureReps, 12);
  assert.strictEqual(cap.score, 100 * (1 + 12 / 30));

  // Invalid sets (negative load, zero reps, missing reps)
  assert.strictEqual(Progression.capabilityForSet({ w: -10, r: 10 }), null);
  assert.strictEqual(Progression.capabilityForSet({ w: 100, r: 0 }), null);
  assert.strictEqual(Progression.capabilityForSet({ w: 100, r: -5 }), null);
  assert.strictEqual(Progression.capabilityForSet(null), null);
  assert.strictEqual(Progression.capabilityForSet(undefined), null);

  // Zero load (bodyweight) with valid reps
  const bwSet = { w: 0, r: 15, rir: 1 };
  const bwCap = Progression.capabilityForSet(bwSet);
  assert(bwCap !== null);
  assert.strictEqual(bwCap.weight, 0);
  assert.strictEqual(bwCap.score, 0);

  console.log('  -> rirFor and capabilityForSet validated.');
}

// Test 1.4: seriesDeTrabalho filtering invariants
{
  console.log('Test 1.4: seriesDeTrabalho filtering rules');
  
  // Mixed warmup and work sets
  const sets1 = [
    { w: 40, r: 15, wu: true },
    { w: 60, r: 10, wu: true },
    { w: 100, r: 8, wu: false },
    { w: 100, r: 8, wu: false }
  ];
  const work1 = Progression.seriesDeTrabalho(sets1);
  assert.strictEqual(work1.length, 2);
  assert.strictEqual(work1[0].w, 100);

  // Implicit warmup deduction (no explicit wu flag -> 85% threshold of max weight)
  const sets2 = [
    { w: 40, r: 15 },
    { w: 70, r: 10 },
    { w: 100, r: 8 },
    { w: 90, r: 8 }
  ];
  const work2 = Progression.seriesDeTrabalho(sets2);
  // 100 is max -> 0.85 * 100 = 85 -> 90 and 100 are kept (2 sets)
  assert.strictEqual(work2.length, 2);
  assert.strictEqual(work2[0].w, 100);
  assert.strictEqual(work2[1].w, 90);

  // All invalid sets
  assert.strictEqual(Progression.seriesDeTrabalho([]).length, 0);
  assert.strictEqual(Progression.seriesDeTrabalho(null).length, 0);
  assert.strictEqual(Progression.seriesDeTrabalho([{ w: -10, r: 0 }]).length, 0);

  console.log('  -> seriesDeTrabalho invariants verified.');
}

// Test 1.5: calcularMeta progression logic under various historical scenarios
{
  console.log('Test 1.5: calcularMeta double progression, deload and RIR model');

  const ficha = {
    A: {
      nome: 'Treino A',
      ex: [
        { n: 'Supino reto c/ halteres', id: 'supino_reto', sets: 3, reps: '8-12', eq: 'halter', inc: 2.5, perSide: true },
        { n: 'Agachamento hack', id: 'agachamento_hack', sets: 4, reps: '6-10', eq: 'maquina', inc: 5.0, perSide: false }
      ]
    }
  };

  // Scenario A: Empty history -> returns initial reference state
  const metaEmpty = Progression.calcularMeta(ficha, [], 'A', 'Supino reto c/ halteres', {});
  assert.strictEqual(metaEmpty.status, 'inicial');
  assert.strictEqual(metaEmpty.repsMeta, 8);
  assert.strictEqual(metaEmpty.carga, null);

  // Scenario B: Perfect performance hitting ceiling in decision sets -> status "subir"
  const sessionsUp = [
    {
      id: 1,
      date: '2026-08-10',
      day: 'A',
      entries: {
        'Supino reto c/ halteres': [
          { w: 30, r: 12, done: true },
          { w: 30, r: 12, done: true },
          { w: 30, r: 12, done: true }
        ]
      }
    }
  ];
  const metaUp = Progression.calcularMeta(ficha, sessionsUp, 'A', 'Supino reto c/ halteres', {});
  assert.strictEqual(metaUp.status, 'subir');
  assert.strictEqual(metaUp.carga, 32.5, 'Next load should be 30 + 2.5 = 32.5 kg');
  assert.strictEqual(metaUp.repsMeta, 8, 'Target reps should reset to range min 8');

  // Scenario C: Sustained under minimum reps across 2 full sessions -> status "reduzir" (deload)
  const sessionsDeload = [
    {
      id: 1,
      date: '2026-08-01',
      day: 'A',
      entries: {
        'Supino reto c/ halteres': [
          { w: 35, r: 6, done: true },
          { w: 35, r: 5, done: true },
          { w: 35, r: 5, done: true }
        ]
      }
    },
    {
      id: 2,
      date: '2026-08-08',
      day: 'A',
      entries: {
        'Supino reto c/ halteres': [
          { w: 35, r: 6, done: true },
          { w: 35, r: 5, done: true },
          { w: 35, r: 5, done: true }
        ]
      }
    }
  ];
  const metaDeload = Progression.calcularMeta(ficha, sessionsDeload, 'A', 'Supino reto c/ halteres', { deloadPct: 10 });
  assert.strictEqual(metaDeload.status, 'reduzir');
  // 35 * 0.90 = 31.5 -> rounded to 2.5 inc = 32.5
  assert.strictEqual(metaDeload.carga, 32.5);
  assert.strictEqual(metaDeload.repsMeta, 8);

  // Scenario D: Intermediate performance -> status "manter"
  const sessionsKeep = [
    {
      id: 1,
      date: '2026-08-10',
      day: 'A',
      entries: {
        'Supino reto c/ halteres': [
          { w: 30, r: 10, done: true },
          { w: 30, r: 9, done: true },
          { w: 30, r: 8, done: true }
        ]
      }
    }
  ];
  const metaKeep = Progression.calcularMeta(ficha, sessionsKeep, 'A', 'Supino reto c/ halteres', {});
  assert.strictEqual(metaKeep.status, 'manter');
  assert.strictEqual(metaKeep.carga, 30);
  assert(metaKeep.repsMeta >= 9, 'Target reps should aim for progression within range');

  console.log('  -> calcularMeta progression scenarios validated.');
}

console.log('✅ SUITE 1 Passed: Progression engine calculations and invariants are 100% sound.\n');


// =============================================================================
// SUITE 2: BODY VISUALIZER resolveColor & SVG RENDERING
// =============================================================================
console.log('--- SUITE 2: Body Visualizer resolveColor & SVG Rendering ---');

// Test 2.1: resolveColor thresholding & high-contrast monochromatic token mapping
{
  console.log('Test 2.1: resolveColor ratio thresholds');
  
  // Base / inactive (score 0, negative, or undefined)
  const base1 = BodyVisualizer.render; // verify exists
  assert.strictEqual(typeof BodyVisualizer.render, 'function');

  // Test internal resolveColor logic through renderSessionAnatomy color outputs
  // Case A: 0 score -> base neutral fill #27272a, opacity 0.45
  const svgEmpty = BodyVisualizer.renderSessionAnatomy({ entries: {} });
  assert(svgEmpty.includes('fill="var(--anat-base, #27272a)"'));
  assert(svgEmpty.includes('opacity="0.45"'));

  // Case B: High volume (ratio >= 0.75) -> primary active fill #ffffff, opacity 1.0
  const sessionActive = {
    entries: {
      'Supino reto': [{ w: 100, r: 10 }, { w: 100, r: 10 }, { w: 100, r: 10 }, { w: 100, r: 10 }] // 4 sets chest
    }
  };
  const svgActive = BodyVisualizer.renderSessionAnatomy(sessionActive);
  assert(svgActive.includes('fill="var(--anat-active, #ffffff)"'));
  assert(svgActive.includes('opacity="1.0"') || svgActive.includes('opacity="1"'));

  // Case C: Secondary active (0.4 <= ratio < 0.75)
  // Supino has secondary shoulders: 0.4 -> shoulders ratio = (4 * 0.4) / 4 = 0.4 -> secondary active
  assert(svgActive.includes('data-muscle="shoulders"'));
  assert(svgActive.includes('fill="var(--anat-sec, #71717a)"'));

  console.log('  -> resolveColor token and opacity mappings verified.');
}

// Test 2.2: 100% active muscle groups
{
  console.log('Test 2.2: 100% active muscle groups across all 10 anatomical regions');
  const fullMuscles = {
    chest: 10, back: 10, shoulders: 10, biceps: 10, triceps: 10,
    abs: 10, quads: 10, hamstrings: 10, calves: 10, glutes: 10
  };

  const svgFull = BodyVisualizer.render(fullMuscles);
  assert(typeof svgFull === 'string');
  assert(svgFull.startsWith('<svg') && svgFull.endsWith('</svg>'));
  
  // When all scores are 10 (maxScore = 10), all ratios are 1.0 (>= 0.75), so every muscle group must be active
  BodyVisualizer.MUSCLE_GROUPS.forEach(g => {
    assert(svgFull.includes(`data-muscle="${g}"`), `SVG must contain group for '${g}'`);
  });

  // Verify none of the muscle groups are rendered with base neutral opacity 0.45
  const regexMuscleGroups = /<g class="anat-m" data-muscle="([^"]+)" fill="([^"]+)" opacity="([^"]+)">/g;
  let match;
  let matchCount = 0;
  while ((match = regexMuscleGroups.exec(svgFull)) !== null) {
    matchCount++;
    const [, muscle, fill, opacity] = match;
    assert.strictEqual(fill, 'var(--anat-active, #ffffff)', `Muscle ${muscle} should have active fill`);
    assert(opacity === '1.0' || opacity === '1', `Muscle ${muscle} should have full opacity`);
  }
  // There are 13 <g class="anat-m"> tags in SVG (some muscles appear in both front and back like shoulders, calves)
  assert(matchCount >= 10, `Found ${matchCount} anatomical muscle elements, expected at least 10`);

  console.log('  -> 100% active muscle rendering verified.');
}

// Test 2.3: Malformed, null and NaN inputs in SVG rendering
{
  console.log('Test 2.3: Malformed & adversarial inputs in BodyVisualizer');
  
  const malformedInputs = [
    null,
    undefined,
    {},
    { chest: NaN, back: Infinity, quads: -50, glutes: 'invalid' },
    { unknownMuscle: 100 }
  ];

  malformedInputs.forEach((input, i) => {
    assert.doesNotThrow(() => {
      const svg = BodyVisualizer.render(input);
      assert(typeof svg === 'string', `Malformed input #${i} should return string`);
      assert(svg.includes('viewBox="0 0 300 200"'), `Malformed input #${i} should have valid viewBox`);
      assert(!svg.includes('NaN'), `Malformed input #${i} should not output NaN in SVG`);
      assert(!svg.includes('Infinity'), `Malformed input #${i} should not output Infinity in SVG`);
    }, `BodyVisualizer.render failed on input #${i}`);
  });

  console.log('  -> Malformed data robustness verified.');
}

console.log('✅ SUITE 2 Passed: Body visualizer coloring and SVG generation are robust and precise.\n');


// =============================================================================
// SUITE 3: RUNNING TELEMETRY CALCULATIONS & BOUNDARY CONDITIONS
// =============================================================================
console.log('--- SUITE 3: Running Telemetry Calculations & Edge Math ---');
const { calcPaceSec, fmtPace, calcSpeedKmh, calcCaloriesBurned, calcIntervalRunTotal } = ctx;

// Test 3.1: calcPaceSec edge cases
{
  console.log('Test 3.1: calcPaceSec division-by-zero, negatives and micro-distances');
  assert.strictEqual(calcPaceSec(0, 1500), 0, '0 distance -> pace 0');
  assert.strictEqual(calcPaceSec(5.0, 0), 0, '0 time -> pace 0');
  assert.strictEqual(calcPaceSec(-5.0, 1500), 0, 'negative distance -> pace 0');
  assert.strictEqual(calcPaceSec(5.0, -1500), 0, 'negative time -> pace 0');
  assert.strictEqual(calcPaceSec(NaN, 1500), 0, 'NaN distance -> pace 0');
  assert.strictEqual(calcPaceSec(5.0, NaN), 0, 'NaN time -> pace 0');
  assert.strictEqual(calcPaceSec(null, 1500), 0, 'null distance -> pace 0');
  assert.strictEqual(calcPaceSec(undefined, 1500), 0, 'undefined distance -> pace 0');

  // Micro distance: 0.001 km (1 meter) in 10s -> pace = 10 / 0.001 = 10000 s/km
  const microPace = calcPaceSec(0.001, 10);
  assert.strictEqual(microPace, 10000);

  // Ultra distance: 100 km in 36000s (10 hours) -> pace = 360 s/km (6:00 min/km)
  const ultraPace = calcPaceSec(100, 36000);
  assert.strictEqual(ultraPace, 360);

  console.log('  -> calcPaceSec edge cases passed.');
}

// Test 3.2: calcSpeedKmh edge cases
{
  console.log('Test 3.2: calcSpeedKmh division-by-zero, negatives and micro-speeds');
  assert.strictEqual(calcSpeedKmh(0, 1500), 0, '0 distance -> speed 0');
  assert.strictEqual(calcSpeedKmh(5.0, 0), 0, '0 time -> speed 0');
  assert.strictEqual(calcSpeedKmh(-5.0, 1500), 0, 'negative distance -> speed 0');
  assert.strictEqual(calcSpeedKmh(5.0, -1500), 0, 'negative time -> speed 0');
  assert.strictEqual(calcSpeedKmh(NaN, 1500), 0, 'NaN distance -> speed 0');
  assert.strictEqual(calcSpeedKmh(5.0, NaN), 0, 'NaN time -> speed 0');

  // 10 km in 3600s -> 10 km/h
  assert.strictEqual(calcSpeedKmh(10, 3600), 10);
  // 5 km in 1500s -> 12 km/h
  assert.strictEqual(calcSpeedKmh(5, 1500), 12);

  console.log('  -> calcSpeedKmh edge cases passed.');
}

// Test 3.3: Mathematical Invariant between Pace and Speed
{
  console.log('Test 3.3: Invariant: Speed(km/h) * Pace(h/km) == 1');
  const testPoints = [
    { d: 1.0, t: 300 },
    { d: 5.0, t: 1500 },
    { d: 10.0, t: 2700 },
    { d: 21.0975, t: 5400 },
    { d: 42.195, t: 10800 },
    { d: 0.5, t: 120 }
  ];

  testPoints.forEach((pt, i) => {
    const paceSec = calcPaceSec(pt.d, pt.t);
    const speedKmh = calcSpeedKmh(pt.d, pt.t);
    const paceHours = paceSec / 3600;
    const product = speedKmh * paceHours;
    assert(Math.abs(product - 1.0) < 1e-9, `Invariant speed * pace == 1 failed for point #${i} (${product})`);
  });
  console.log('  -> Speed and Pace reciprocal invariant verified.');
}

// Test 3.4: fmtPace formatting
{
  console.log('Test 3.4: fmtPace string formatting');
  assert.strictEqual(fmtPace(0), '--:-- min/km');
  assert.strictEqual(fmtPace(-10), '--:-- min/km');
  assert.strictEqual(fmtPace(NaN), '--:-- min/km');
  assert.strictEqual(fmtPace(Infinity), '--:-- min/km');
  assert.strictEqual(fmtPace(300), '5:00 min/km');
  assert.strictEqual(fmtPace(326), '5:26 min/km');
  assert.strictEqual(fmtPace(3599), '59:59 min/km');
  assert.strictEqual(fmtPace(3600), '60:00 min/km');
  assert.strictEqual(fmtPace(59), '0:59 min/km');
  console.log('  -> fmtPace verified.');
}

// Test 3.5: calcCaloriesBurned calculation
{
  console.log('Test 3.5: calcCaloriesBurned calculation');
  assert.strictEqual(calcCaloriesBurned(0, 1000, 75), 0);
  assert.strictEqual(calcCaloriesBurned(5.0, 1500, 70), Math.round(70 * 5.0 * 1.036));
  assert.strictEqual(calcCaloriesBurned(10.0, 3000, 80), Math.round(80 * 10.0 * 1.036));
  // Negative / zero weight fallback
  assert.strictEqual(calcCaloriesBurned(5.0, 1500, 0), Math.round(75 * 5.0 * 1.036), 'Fallback to default 75kg');
  console.log('  -> calcCaloriesBurned verified.');
}

// Test 3.6: calcIntervalRunTotal complex and edge cases
{
  console.log('Test 3.6: calcIntervalRunTotal zero, micro and max intervals');
  
  // Case A: All 0s config
  const zeroCfg = {
    tiroMin: 0, tiroSec: 0, tiroKmh: 0,
    recupMin: 0, recupSec: 0, recupKmh: 0,
    ciclos: 0,
    warmupMin: 0, warmupSec: 0, warmupKmh: 0,
    cooldownMin: 0, cooldownSec: 0, cooldownKmh: 0
  };
  const zeroRes = calcIntervalRunTotal(zeroCfg);
  assert.strictEqual(zeroRes.totalDistKm, 0);
  assert.strictEqual(zeroRes.totalDurationSec, 0);
  assert.strictEqual(zeroRes.avgSpeedKmh, 0);
  assert.strictEqual(zeroRes.avgPaceSec, 0);
  assert.strictEqual(zeroRes.paceFormatted, '--:-- min/km');

  // Case B: Negative inputs (defensive formatting check)
  const negCfg = {
    tiroMin: -2, tiroSec: -30, tiroKmh: -10,
    recupMin: 0, recupSec: 0, recupKmh: 0,
    ciclos: -5
  };
  const negRes = calcIntervalRunTotal(negCfg);
  assert.strictEqual(negRes.ciclos, 1, 'Negative ciclos fallback to minimum 1');
  assert.strictEqual(negRes.paceFormatted, '--:-- min/km', 'Negative duration/pace gracefully formats to fallback string');

  // Case C: 50 cycles HIIT protocol
  const maxCfg = {
    tiroMin: 0, tiroSec: 30, tiroKmh: 14.0, // 30s @ 14 km/h
    recupMin: 0, recupSec: 30, recupKmh: 5.0,  // 30s @ 5 km/h
    ciclos: 50,
    warmupMin: 5, warmupSec: 0, warmupKmh: 6.0, // 5m @ 6 km/h = 0.5 km
    cooldownMin: 5, cooldownSec: 0, cooldownKmh: 4.0 // 5m @ 4 km/h = 0.333 km
  };
  const maxRes = calcIntervalRunTotal(maxCfg);
  // Total duration: 300s (warmup) + 50 * (30s + 30s) + 300s (cooldown) = 300 + 3000 + 300 = 3600s (60 min)
  assert.strictEqual(maxRes.totalDurationSec, 3600);
  // Distance:
  // Warmup: 5min * 6kmh / 60 = 0.5 km
  // Cooldown: 5min * 4kmh / 60 = 0.3333 km
  // 1 cycle: (30s/3600 * 14) + (30s/3600 * 5) = (0.11666 + 0.04166) = 0.15833 km
  // 50 cycles: 7.9166 km
  // Total: 0.5 + 7.9166 + 0.3333 = 8.75 km
  assert.strictEqual(maxRes.totalDistKm, 8.75);
  assert.strictEqual(maxRes.avgSpeedKmh, 8.8);
  assert.strictEqual(maxRes.ciclos, 50);

  // Invariant verification
  const computedDuration = maxRes.warmupSec + maxRes.ciclos * (maxRes.tiroSec + maxRes.recupSec) + maxRes.cooldownSec;
  assert.strictEqual(maxRes.totalDurationSec, computedDuration, 'Total duration must match phase sum invariant');

  console.log('  -> calcIntervalRunTotal passed all stress scenarios.');
}

console.log('✅ SUITE 3 Passed: Running telemetry calculations and boundary math verified.\n');


// =============================================================================
// SUITE 4: LOCALSTORAGE SERIALIZATION, MIGRATION & MERGE INVARIANTS
// =============================================================================
console.log('--- SUITE 4: LocalStorage Serialization, Migration & Merge Invariants ---');
const { DEFAULT_STATE, migrate, mergeState } = ctx;

// Test 4.1: DEFAULT_STATE integrity and schema compliance
{
  console.log('Test 4.1: DEFAULT_STATE schema compliance');
  assert(DEFAULT_STATE.ficha && typeof DEFAULT_STATE.ficha === 'object');
  assert(Array.isArray(DEFAULT_STATE.ficha.A.ex), 'Ficha A must have ex array');
  assert(Array.isArray(DEFAULT_STATE.ficha.B.ex), 'Ficha B must have ex array');
  assert(Array.isArray(DEFAULT_STATE.ficha.C.ex), 'Ficha C must have ex array');
  assert(Array.isArray(DEFAULT_STATE.sessions), 'DEFAULT_STATE.sessions must be array');
  assert(Array.isArray(DEFAULT_STATE.corridas), 'DEFAULT_STATE.corridas must be array');
  assert(Array.isArray(DEFAULT_STATE.peso), 'DEFAULT_STATE.peso must be array');
  assert.strictEqual(typeof DEFAULT_STATE.cardioGoalKm, 'number');
  assert(DEFAULT_STATE.settings && typeof DEFAULT_STATE.settings === 'object');
  console.log('  -> DEFAULT_STATE schema verified.');
}

// Test 4.2: migrate() robustness with legacy, empty, and corrupted states
{
  console.log('Test 4.2: migrate() robustness and idempotence');
  
  // Case A: Empty object {}
  const migratedEmpty = migrate({});
  assert(Array.isArray(migratedEmpty.sessions));
  assert(Array.isArray(migratedEmpty.corridas));
  assert(Array.isArray(migratedEmpty.peso));
  assert.strictEqual(migratedEmpty.cardioGoalKm, 15);
  assert(migratedEmpty.ficha && migratedEmpty.ficha.A);
  assert(migratedEmpty.settings && migratedEmpty.settings.progressao);

  // Case B: Idempotence: migrate(migrate(s)) === migrate(s)
  const once = migrate({ sessions: [{ id: 1, date: '2026-08-01', day: 'A', entries: {} }] });
  const twice = migrate(JSON.parse(JSON.stringify(once)));
  assert.strictEqual(JSON.stringify(once), JSON.stringify(twice), 'migrate() must be strictly idempotent');

  // Case C: Legacy entry flags (warmup -> wu, and RIR out of bounds clamping)
  const legacyEntriesState = {
    sessions: [
      {
        id: 10,
        date: '2026-08-01',
        day: 'A',
        entries: {
          'Supino reto': [
            { w: 40, r: 12, warmup: true },
            { w: 80, r: 8, warmup: false, rir: 10 },
            { w: 80, r: 8, rir: -5 },
            { w: 80, r: 8, rir: 'invalid' }
          ]
        }
      }
    ]
  };
  const migratedFlags = migrate(legacyEntriesState);
  const sets = migratedFlags.sessions[0].entries['Supino reto'];
  assert.strictEqual(sets[0].wu, true, 'Legacy warmup flag converted to wu');
  assert.strictEqual(sets[1].rir, 6, 'RIR 10 clamped to 6');
  assert.strictEqual(sets[2].rir, 0, 'Negative RIR clamped to 0');
  assert.strictEqual(sets[3].rir, undefined, 'Invalid RIR property stripped');

  console.log('  -> migrate() verified.');
}

// Test 4.3: mergeState() non-destructive union and deduplication invariants
{
  console.log('Test 4.3: mergeState() deduplication and non-destructive invariant');
  
  const curState = {
    ficha: {
      A: { nome: 'Peito', ex: [{ n: 'Supino reto', id: 'supino_reto' }] },
      B: { nome: 'Costas', ex: [] },
      C: { nome: 'Perna', ex: [] }
    },
    sessions: [
      { id: 1, date: '2026-08-01', day: 'A', mode: 'normal', entries: { 'Supino reto': [{ w: 80, r: 10 }] } }
    ],
    corridas: [
      { id: 101, date: '2026-08-01', mode: 'continua', distanciaKm: 5.0, duracaoSeg: 1500 }
    ],
    peso: [{ date: '2026-08-01', kg: 75 }],
    cardioGoalKm: 20,
    draft: { day: null, date: null, entries: {} },
    settings: DEFAULT_STATE.settings
  };

  const incomingState = {
    ficha: {
      A: { nome: 'Peito', ex: [{ n: 'Supino reto', id: 'supino_reto' }, { n: 'Crucifixo', id: 'crucifixo' }] },
      B: { nome: 'Costas', ex: [{ n: 'Puxada', id: 'puxada' }] },
      C: { nome: 'Perna', ex: [] }
    },
    sessions: [
      // Duplicate session (same signature)
      { id: 1, date: '2026-08-01', day: 'A', mode: 'normal', entries: { 'Supino reto': [{ w: 80, r: 10 }] } },
      // New session
      { id: 2, date: '2026-08-03', day: 'A', mode: 'normal', entries: { 'Crucifixo': [{ w: 20, r: 12 }] } }
    ],
    corridas: [
      // Duplicate corrida
      { id: 101, date: '2026-08-01', mode: 'continua', distanciaKm: 5.0, duracaoSeg: 1500 },
      // New corrida
      { id: 102, date: '2026-08-04', mode: 'intervalada', distanciaKm: 3.0, duracaoSeg: 1200 }
    ],
    peso: [
      { date: '2026-08-01', kg: 75 }, // Duplicate date
      { date: '2026-08-05', kg: 74.5 } // New date
    ],
    cardioGoalKm: 15
  };

  const curBeforeCopy = JSON.parse(JSON.stringify(curState));
  const incBeforeCopy = JSON.parse(JSON.stringify(incomingState));

  const mergeRes = mergeState(curState, incomingState);

  // Invariant 1: Source objects not mutated
  assert.deepStrictEqual(JSON.parse(JSON.stringify(curState)), curBeforeCopy, 'curState must not be mutated by mergeState');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(incomingState)), incBeforeCopy, 'incomingState must not be mutated by mergeState');

  // Invariant 2: Correct additions without duplicate inflation
  assert.strictEqual(mergeRes.addedSessions, 1, 'Exactly 1 new session added');
  assert.strictEqual(mergeRes.state.sessions.length, 2, 'Merged sessions total 2');
  assert.strictEqual(mergeRes.addedCorridas, 1, 'Exactly 1 new corrida added');
  assert.strictEqual(mergeRes.state.corridas.length, 2, 'Merged corridas total 2');
  assert.strictEqual(mergeRes.addedPeso, 1, 'Exactly 1 new peso date added');
  assert.strictEqual(mergeRes.state.peso.length, 2, 'Merged peso entries total 2');
  assert.strictEqual(mergeRes.state.ficha.A.ex.length, 2, 'Ficha A merged 1 new exercise (Crucifixo)');
  assert.strictEqual(mergeRes.state.ficha.B.ex.length, 1, 'Ficha B merged 1 new exercise (Puxada)');

  console.log('  -> mergeState() deduplication and invariants verified.');
}

// Test 4.4: Full JSON roundtrip serialization stress test
{
  console.log('Test 4.4: Full state JSON roundtrip serialization');
  
  const complexState = {
    ficha: DEFAULT_STATE.ficha,
    sessions: Array.from({ length: 50 }, (_, i) => ({
      id: 1000 + i,
      date: `2026-08-${String(i % 30 + 1).padStart(2, '0')}`,
      day: ['A', 'B', 'C'][i % 3],
      mode: i % 5 === 0 ? 'curto' : 'normal',
      entries: {
        'Supino reto c/ halteres': [
          { w: 30 + (i * 0.5), r: 10, done: true, rir: i % 4 }
        ]
      },
      notes: { 'Supino reto c/ halteres': 'Nota de treino com caracteres especiais: áéíóú / ç & <tags>' }
    })),
    corridas: Array.from({ length: 30 }, (_, i) => ({
      id: 2000 + i,
      date: `2026-08-${String(i % 30 + 1).padStart(2, '0')}`,
      mode: i % 2 === 0 ? 'continua' : 'intervalada',
      distanciaKm: 5.0 + (i * 0.2),
      duracaoSeg: 1500 + (i * 30),
      notas: 'Corrida na esteira com 1% inclinação "teste"'
    })),
    peso: Array.from({ length: 20 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      kg: 75.0 - (i * 0.1)
    })),
    cardioGoalKm: 25,
    draft: { day: null, date: null, entries: {} },
    settings: DEFAULT_STATE.settings
  };

  const jsonStr = JSON.stringify(complexState);
  assert(typeof jsonStr === 'string' && jsonStr.length > 5000);
  
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(JSON.stringify(parsed), jsonStr, 'JSON serialization roundtrip must preserve exact object tree');

  // Verify LocalStorage simulated persistence
  ctx.localStorage.setItem(ctx.KEY, jsonStr);
  const loadedRaw = ctx.localStorage.getItem(ctx.KEY);
  assert.strictEqual(loadedRaw, jsonStr);

  const loadedState = ctx.load();
  assert.strictEqual(loadedState.sessions.length, 50);
  assert.strictEqual(loadedState.corridas.length, 30);
  assert.strictEqual(loadedState.peso.length, 20);

  console.log('  -> JSON serialization roundtrip verified.');
}

console.log('✅ SUITE 4 Passed: LocalStorage serialization, migration and merge invariants verified.\n');

console.log('================================================================');
console.log('🎉 ALL CHALLENGER 1 ADVERSARIAL TEST SUITES PASSED EMPIRICALLY!');
console.log('================================================================\n');
