'use strict';

const assert = require('assert');
const path = require('path');
const P = require('../../main/assets/core/progressao.js');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER M1: PROGRESSAO ADVERSARIAL STRESS SUITE ===');
console.log('================================================================\n');

function plan(name, reps, sets, eq, inc, customProg) {
  const p = { n: name, reps: reps, sets: sets || 3, eq: eq, inc: inc };
  if (customProg) p.progressao = customProg;
  return p;
}

function fichaFor(ex) { return { A: { nome: 'Teste', ex: [ex] } }; }

function session(id, date, name, sets) {
  const entries = {};
  entries[name] = sets;
  return { id: id, date: date, day: 'A', entries: entries };
}

function meta(ex, sessions, settings) {
  return P.calcularMeta(fichaFor(ex), sessions, 'A', ex.n, settings);
}

function sets(count, weight, reps, rir) {
  return Array.from({ length: count }, function () {
    const set = { w: weight, r: reps, wu: false };
    if (rir !== undefined && rir !== null) set.rir = rir;
    return set;
  });
}

let totalAssertions = 0;
function check(condition, message) {
  totalAssertions++;
  assert(condition, message);
}

// =============================================================================
// SUITE 1: EXTREME LOADS & FRACTIONAL INCREMENTS
// =============================================================================
console.log('--- SUITE 1: Extreme Loads & Increments ---');

// 1.1 Ultra-light load (1kg dumbbell, inc = 0.5)
{
  const p1 = plan('Elevacao lateral leve', '10-15', 3, 'halter', 0.5);
  const m1 = meta(p1, [session(1, '2026-08-01', p1.n, sets(3, 1.0, 10, 2))]);
  check(m1.status === 'manter', '1kg x 10 in 10-15 @ 2 RIR must be manter');
  check(m1.carga === 1.0, '1kg load must be maintained');
  check(m1.repsMeta === 11, 'repsMeta must advance from 10 to 11');

  // Reaching top of range (15 reps) on 1kg
  const m1Top = meta(p1, [session(1, '2026-08-01', p1.n, sets(3, 1.0, 15, 2))]);
  check(m1Top.status === 'subir', '1kg x 15 in 10-15 @ 2 RIR must trigger subir');
  check(m1Top.carga === 1.5, 'Load must advance to 1.5kg (1.0 + 0.5)');
  check(m1Top.repsMeta >= 10, 'Target reps must be in range');
}

// 1.2 Ultra-heavy load (200kg, 300kg, 500kg squat/deadlift, inc = 5.0)
{
  const pHeavy = plan('Agachamento pesado', '3-5', 3, 'barra', 5.0);
  const mHeavy = meta(pHeavy, [session(1, '2026-08-01', pHeavy.n, sets(3, 200.0, 3, 2))]);
  check(mHeavy.status === 'manter', '200kg x 3 in 3-5 @ 2 RIR must be manter');
  check(mHeavy.carga === 200.0, '200kg load must be maintained');
  check(mHeavy.repsMeta === 4, 'repsMeta must advance from 3 to 4');

  const mHeavyTop = meta(pHeavy, [session(1, '2026-08-01', pHeavy.n, sets(3, 200.0, 5, 2))]);
  check(mHeavyTop.status === 'subir', '200kg x 5 in 3-5 @ 2 RIR must trigger subir');
  check(mHeavyTop.carga === 205.0, 'Load must advance to 205kg');

  // 500kg extreme boundary
  const p500 = plan('Leg press monstro', '6-10', 3, 'maquina', 10.0);
  const m500 = meta(p500, [session(1, '2026-08-01', p500.n, sets(3, 500.0, 7, 2))]);
  check(m500.status === 'manter', '500kg x 7 in 6-10 @ 2 RIR must be manter');
  check(m500.carga === 500.0, '500kg load must be maintained');
  check(m500.repsMeta === 8, 'repsMeta must advance to 8');
}

// 1.3 Bodyweight exercises (inc = 0, load = 0kg)
{
  const pBW = plan('Barra fixa BW', '6-10', 3, 'corporal', 0);
  for (let r = 6; r < 10; r++) {
    const mBW = meta(pBW, [session(1, '2026-08-01', pBW.n, sets(3, 0, r, 2))]);
    check(mBW.status === 'manter', 'BW x ' + r + ' reps must be manter');
    check(mBW.carga === 0, 'BW load must remain 0kg');
    check(mBW.repsMeta === r + 1, 'BW repsMeta must advance from ' + r + ' to ' + (r + 1));
  }
}

// 1.4 Fractional increments: 0.25kg, 0.5kg, 1.25kg
{
  const increments = [0.25, 0.5, 1.25];
  increments.forEach(function (inc) {
    const pFrac = plan('Fracionario ' + inc, '8-12', 3, 'halter', inc);
    const mFrac = meta(pFrac, [session(1, '2026-08-01', pFrac.n, sets(3, 10.0, 8, 2))]);
    check(mFrac.status === 'manter');
    check(mFrac.carga === 10.0);
    check(mFrac.repsMeta === 9);

    const mFracTop = meta(pFrac, [session(1, '2026-08-01', pFrac.n, sets(3, 10.0, 12, 2))]);
    check(mFracTop.status === 'subir');
    check(Math.abs(mFracTop.carga - (10.0 + inc)) < 0.001, 'Carga must advance by ' + inc + ', got ' + mFracTop.carga);
  });
}

console.log('Suite 1 Passed (' + totalAssertions + ' assertions checked).');

// =============================================================================
// SUITE 2: EXTREME REP RANGES
// =============================================================================
console.log('\n--- SUITE 2: Extreme Rep Ranges ---');

const testRanges = [
  '3-5',
  '4-6',
  '6-10',
  '8-12',
  '10-15',
  '15-20',
  '20-30',
  '5-5',
  '10-10'
];

testRanges.forEach(function (rStr) {
  const parsed = P.parseRange(rStr);
  const pRange = plan('Ex ' + rStr, rStr, 3, 'maquina', 5.0);

  const weight = 60.0;
  const mMin = meta(pRange, [session(1, '2026-08-01', pRange.n, sets(3, weight, parsed.min, 2))]);
  if (parsed.min < parsed.max) {
    check(mMin.status === 'manter', 'Range ' + rStr + ' at min must be manter');
    check(mMin.repsMeta === parsed.min + 1, 'Range ' + rStr + ' repsMeta must be min + 1 (' + (parsed.min + 1) + '), got ' + mMin.repsMeta);
  } else {
    check(mMin.status === 'subir', 'Fixed range ' + rStr + ' at target must trigger subir');
    check(mMin.carga === weight + 5.0, 'Fixed range load must advance');
  }

  // Test at range.max
  const mMax = meta(pRange, [session(1, '2026-08-01', pRange.n, sets(3, weight, parsed.max, 2))]);
  check(mMax.status === 'subir', 'Range ' + rStr + ' at max must trigger subir');
  check(mMax.carga === weight + 5.0, 'Range ' + rStr + ' load must advance by 5kg');
});

console.log('Suite 2 Passed (' + totalAssertions + ' assertions checked).');

// =============================================================================
// SUITE 3: ALL RIR LEVELS (0, 1, 2, 3, 4, 5) & TARGET RIR COMBINATIONS
// =============================================================================
console.log('\n--- SUITE 3: RIR Exhaustive Matrix & Capacity Modeling ---');

const rirLevels = [0, 1, 2, 3, 4, 5];
const targetRirLevels = [0, 1, 2, 3];

targetRirLevels.forEach(function (targetRir) {
  rirLevels.forEach(function (performedRir) {
    const pRir = plan('RIR test T' + targetRir + '_P' + performedRir, '8-12', 3, 'maquina', 5.0, { targetRir: targetRir });
    const mRir = meta(pRir, [session(1, '2026-08-01', pRir.n, sets(3, 50.0, 8, performedRir))]);

    check(mRir !== null, 'Result must not be null for Target ' + targetRir + ', Performed ' + performedRir);
    check(mRir.modelo === 'rir', 'Must use RIR model');
    check(typeof mRir.carga === 'number' && mRir.carga > 0, 'Prescribed load must be positive number');
    check(typeof mRir.repsMeta === 'number' && mRir.repsMeta >= 1, 'Prescribed reps must be positive integer');

    if (performedRir >= targetRir + 3) {
      check(mRir.status === 'subir', 'Performing 8 reps @ ' + performedRir + ' RIR with target ' + targetRir + ' should trigger subir');
    } else if (performedRir === targetRir) {
      check(mRir.status === 'manter', 'Matching target RIR ' + targetRir + ' on 8 reps must maintain load');
      check(mRir.carga === 50.0, 'Load must stay at 50kg');
      check(mRir.repsMeta === 9, 'RepsMeta must advance to 9');
    }
  });
});

console.log('Suite 3 Passed (' + totalAssertions + ' assertions checked).');

// =============================================================================
// SUITE 4: MONOTONICITY & PROGRESSIVE OVERLOAD PROPERTIES
// =============================================================================
console.log('\n--- SUITE 4: Monotonicity & Step Consistency ---');

// Property 4.1: Progression Monotonicity across every step in range
{
  const repRanges = ['6-10', '8-12', '10-15', '15-20'];
  repRanges.forEach(function (rStr) {
    const parsed = P.parseRange(rStr);
    const pMono = plan('Mono ' + rStr, rStr, 3, 'maquina', 5.0);

    for (let r = parsed.min; r <= parsed.max; r++) {
      const m = meta(pMono, [session(1, '2026-08-01', pMono.n, sets(3, 60.0, r, 2))]);
      check(m.carga >= 60.0, 'Load must never decrease for reps ' + r + ' in ' + rStr + ', got ' + m.carga);
      
      if (m.status === 'manter') {
        check(m.carga === 60.0, 'Load must remain 60.0kg');
        check(m.repsMeta >= r + 1, 'When maintaining, repsMeta (' + m.repsMeta + ') must be >= performed + 1 (' + (r + 1) + ')');
      } else if (m.status === 'subir') {
        check(m.carga === 65.0, 'When advancing, load must be 65.0kg');
        check(m.repsMeta >= parsed.min, 'When advancing, repsMeta must be >= range.min');
      }
    }
  });
}

// Property 4.2: Top-of-range Load Advancement
{
  const repRanges = ['4-6', '6-10', '8-12', '10-15', '12-15'];
  repRanges.forEach(function (rStr) {
    const parsed = P.parseRange(rStr);
    const pTop = plan('Top ' + rStr, rStr, 3, 'maquina', 5.0);
    const m = meta(pTop, [session(1, '2026-08-01', pTop.n, sets(3, 60.0, parsed.max, 2))]);
    check(m.status === 'subir', 'Top of range ' + parsed.max + ' in ' + rStr + ' must be subir');
    check(m.carga === 65.0, 'Prescribed load must be 65.0kg (60 + 5)');
  });
}

// Property 4.3: Strict Prevention of Downward Rep Inflation (Problem 2 Generalization)
{
  const testSets = [
    { inc: 1.25, weights: [10.0, 11.25, 12.5, 13.75, 15.0, 20.0, 30.0] },
    { inc: 2.0, weights: [10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 30.0] },
    { inc: 2.5, weights: [10.0, 12.5, 15.0, 17.5, 20.0, 22.5, 25.0, 30.0] },
    { inc: 5.0, weights: [15.0, 20.0, 25.0, 30.0, 40.0, 50.0, 60.0, 80.0] }
  ];
  const ranges = ['6-10', '8-12', '10-15'];

  ranges.forEach(function (rStr) {
    const parsed = P.parseRange(rStr);
    testSets.forEach(function (ts) {
      ts.weights.forEach(function (w) {
        const pAntiInflation = plan('AntiInflation', rStr, 3, 'halter', ts.inc);
        for (let r = parsed.min; r < parsed.max; r++) {
          const m = meta(pAntiInflation, [session(1, '2026-08-01', pAntiInflation.n, sets(3, w, r, 2))]);
          check(m.carga >= w, 'Load must NEVER step down on valid working sets (' + w + 'kg x ' + r + ' reps in ' + rStr + ')');
          if (m.status === 'manter') {
            check(m.repsMeta === r + 1, 'Prescribed reps must be ' + (r + 1) + ', got ' + m.repsMeta);
            check(m.repsMeta <= parsed.max + 4, 'Prescribed reps ' + m.repsMeta + ' must not exceed ceiling');
          }
        }
      });
    });
  });
}

console.log('Suite 4 Passed (' + totalAssertions + ' assertions checked).');

// =============================================================================
// SUITE 5: UNEQUAL REPS IN MULTI-SET SESSIONS
// =============================================================================
console.log('\n--- SUITE 5: Multi-Set Unequal Reps Invariance ---');

{
  const pUnequal = plan('Supino multi-set', '8-12', 3, 'barra', 5.0);
  
  // Set 1 = 10, Set 2 = 9, Set 3 = 8 -> minReps = 8 -> repsMeta = 9
  const m1 = meta(pUnequal, [session(1, '2026-08-01', pUnequal.n, [
    { w: 50, r: 10, rir: 2 },
    { w: 50, r: 9, rir: 2 },
    { w: 50, r: 8, rir: 2 }
  ])]);
  check(m1.status === 'manter');
  check(m1.carga === 50);
  check(m1.repsMeta === 9, 'repsMeta must be minReps + 1 (9), got ' + m1.repsMeta);

  // Set 1 = 11, Set 2 = 10, Set 3 = 9 -> minReps = 9 -> repsMeta = 10
  const m2 = meta(pUnequal, [session(1, '2026-08-01', pUnequal.n, [
    { w: 50, r: 11, rir: 2 },
    { w: 50, r: 10, rir: 2 },
    { w: 50, r: 9, rir: 2 }
  ])]);
  check(m2.status === 'manter');
  check(m2.carga === 50);
  check(m2.repsMeta === 10, 'repsMeta must be minReps + 1 (10)');

  // Set 1 = 12, Set 2 = 12, Set 3 = 11 -> capacity delta > 2% -> triggers subir 55kg x 8 reps
  const m3 = meta(pUnequal, [session(1, '2026-08-01', pUnequal.n, [
    { w: 50, r: 12, rir: 2 },
    { w: 50, r: 12, rir: 2 },
    { w: 50, r: 11, rir: 2 }
  ])]);
  check(m3.status === 'subir');
  check(m3.carga === 55);
  check(m3.repsMeta === 8);

  // All sets at 12 -> triggers subir
  const m4 = meta(pUnequal, [session(1, '2026-08-01', pUnequal.n, [
    { w: 50, r: 12, rir: 2 },
    { w: 50, r: 12, rir: 2 },
    { w: 50, r: 12, rir: 2 }
  ])]);
  check(m4.status === 'subir');
  check(m4.carga === 55);
}

console.log('Suite 5 Passed (' + totalAssertions + ' assertions checked).');

// =============================================================================
// SUITE 6: PROPERTY-BASED RANDOM FUZZING (1000 RANDOM SESSIONS)
// =============================================================================
console.log('\n--- SUITE 6: Property-Based Randomized Fuzzing (1000 Iterations) ---');

function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

for (let iter = 0; iter < 1000; iter++) {
  const minR = randomInt(4, 12);
  const maxR = minR + randomInt(2, 6);
  const rStr = minR + '-' + maxR;
  const inc = randomChoice([0, 0.5, 1.25, 2.5, 5.0]);
  const currentWeight = inc === 0 ? 0 : randomChoice([10, 20, 30, 45, 60, 80, 100, 150]);
  const targetRir = randomChoice([0, 1, 2, 3]);
  const performedRir = randomChoice([0, 1, 2, 3, 4, 5]);
  const performedReps = randomInt(Math.max(1, minR - 3), maxR + 3);
  const numSets = randomInt(1, 4);

  const pFuzz = plan('FuzzEx', rStr, numSets, 'maquina', inc, { targetRir: targetRir });
  const setsData = sets(numSets, currentWeight, performedReps, performedRir);
  const result = meta(pFuzz, [session(1, '2026-08-01', pFuzz.n, setsData)]);

  // Universal Invariants:
  check(result !== null && typeof result === 'object', 'Iteration ' + iter + ': Result must be an object');
  check(['manter', 'subir', 'reduzir', 'travado', 'volume-baixo', 'inicial'].indexOf(result.status) >= 0, 
    'Iteration ' + iter + ': Status must be valid enum, got ' + result.status);
  check(typeof result.carga === 'number' || result.carga === null, 'Iteration ' + iter + ': Carga must be number or null');
  check(typeof result.repsMeta === 'number' && Number.isInteger(result.repsMeta) && result.repsMeta >= 1, 
    'Iteration ' + iter + ': repsMeta must be positive integer, got ' + result.repsMeta);

  if (result.carga !== null && inc > 0) {
    const remainder = (result.carga / inc) % 1;
    check(Math.abs(remainder) < 0.001 || Math.abs(remainder - 1) < 0.001, 
      'Iteration ' + iter + ': Carga ' + result.carga + ' must be multiple of inc ' + inc);
  }

  // When performed reps are strictly within range and matching target RIR:
  if (performedReps >= minR && performedReps <= maxR && performedRir === targetRir && numSets >= pFuzz.sets) {
    check(result.carga >= currentWeight, 'Iteration ' + iter + ': Load must not decrease on valid in-range set');
  }

  // Top-of-range advancement invariant:
  const pct = currentWeight > 0 ? inc / currentWeight : 0;
  if (performedReps >= maxR && performedRir === targetRir && numSets >= pFuzz.sets && inc > 0 && pct <= 0.10) {
    check(result.status === 'subir', 'Iteration ' + iter + ': Top-of-range must be subir');
    check(result.carga > currentWeight, 'Iteration ' + iter + ': Load must increase');
  }
}

console.log('Suite 6 Passed (1000 randomized iterations passed without violation).');

console.log('\n================================================================');
console.log('ALL ADVERSARIAL STRESS TESTS PASSED EMPIRICALLY! Total checks: ' + totalAssertions);
console.log('================================================================\n');
