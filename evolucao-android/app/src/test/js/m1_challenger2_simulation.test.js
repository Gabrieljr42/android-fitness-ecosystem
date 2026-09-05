'use strict';

const assert = require('assert');
const P = require('../../main/assets/core/progressao.js');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 2: M1 ADVERSARIAL DOUBLE PROGRESSION ===');
console.log('================================================================\n');

function plan(name, reps, sets, eq, inc, opts) {
  const p = { n: name, reps: reps, sets: sets || 3, eq: eq, inc: inc };
  if (opts) p.progressao = opts;
  return p;
}

function fichaFor(ex) {
  return { A: { nome: 'Treino A', ex: [ex] } };
}

function session(id, date, name, sets, extra) {
  const entries = {};
  entries[name] = sets;
  const s = { id: id, date: date, day: 'A', entries: entries };
  if (extra) Object.assign(s, extra);
  return s;
}

function meta(ex, sessions, settings) {
  return P.calcularMeta(fichaFor(ex), sessions, 'A', ex.n, settings);
}

function makeSets(count, weight, reps, rir) {
  return Array.from({ length: count }, () => {
    const s = { w: weight, r: reps, wu: false };
    if (rir !== undefined && rir !== null) s.rir = rir;
    return s;
  });
}

let totalAssertions = 0;
function check(condition, msg) {
  totalAssertions++;
  assert(condition, msg);
}

// =============================================================================
// TEST SUITE 1: 10+ WORKOUT MULTI-SESSION CLOSED-LOOP SIMULATION
// =============================================================================
console.log('--- SUITE 1: Multi-Session Double Progression Simulation (10+ Workouts) ---');

function runClosedLoopSimulation(profileName, exPlan, initialLoad, initialReps, targetRir, totalWorkouts) {
  console.log(`Simulating Profile: ${profileName} (${exPlan.reps} reps, inc: ${exPlan.inc}kg, targetRir: ${targetRir})`);
  const range = P.parseRange(exPlan.reps);
  const history = [];
  let currentLoad = initialLoad;
  let currentReps = initialReps;
  let promotions = 0;

  for (let workout = 1; workout <= totalWorkouts; workout++) {
    const dateStr = `2026-09-${String(workout).padStart(2, '0')}`;
    const performedSets = makeSets(exPlan.sets, currentLoad, currentReps, targetRir);
    history.push(session(workout, dateStr, exPlan.n, performedSets));

    const result = meta(exPlan, history);
    check(result !== null, `Workout ${workout}: result must not be null`);

    if (result.status === 'manter') {
      check(result.carga === currentLoad, `Workout ${workout}: on manter, load must be ${currentLoad}kg, got ${result.carga}`);
      check(result.repsMeta === currentReps + 1 || (currentReps >= range.max && result.repsMeta === range.max),
        `Workout ${workout}: repsMeta must advance by 1 (expected ${currentReps + 1}, got ${result.repsMeta})`);
      check(result.repsMeta <= (result.perfil && result.perfil.expandRepRange ? range.max + 4 : range.max),
        `Workout ${workout}: repsMeta must not exceed ceiling`);
      
      currentReps = result.repsMeta;
    } else if (result.status === 'subir') {
      promotions++;
      check(result.carga === currentLoad + exPlan.inc,
        `Workout ${workout}: on subir, load must advance by exactly 1 increment (${currentLoad} -> ${currentLoad + exPlan.inc}), got ${result.carga}`);
      check(result.repsMeta >= range.min,
        `Workout ${workout}: on subir, repsMeta must be >= range.min (${range.min}), got ${result.repsMeta}`);
      check(result.repsMeta <= range.max + 4,
        `Workout ${workout}: on subir, repsMeta must be reasonable, got ${result.repsMeta}`);

      currentLoad = result.carga;
      currentReps = result.repsMeta;
    } else {
      assert.fail(`Workout ${workout}: unexpected status ${result.status}`);
    }
  }

  check(promotions >= 2, `${profileName}: must achieve at least 2 load promotions across ${totalWorkouts} workouts (achieved ${promotions})`);
  check(currentLoad > initialLoad, `${profileName}: final load (${currentLoad}kg) must exceed initial load (${initialLoad}kg)`);
  console.log(`  -> ${profileName} successfully executed ${totalWorkouts} workouts, ${promotions} load promotions (${initialLoad}kg -> ${currentLoad}kg).\n`);
}

// 1. Bench Press: 6-10 reps, 5kg inc (14 sessions)
runClosedLoopSimulation('Bench Press (Supino reto)', plan('Supino reto com barra', '6-10', 3, 'barra', 5), 60, 6, 2, 14);

// 2. Squat: 8-12 reps, 5kg inc (15 sessions)
runClosedLoopSimulation('Squat (Agachamento livre)', plan('Agachamento livre com barra', '8-12', 3, 'barra', 5), 80, 8, 2, 15);

// 3. Bicep Curl: 8-12 reps, 2.5kg inc (14 sessions)
runClosedLoopSimulation('Bicep Curl (Rosca direta)', plan('Rosca direta com halter', '8-12', 3, 'halter', 2.5), 12.5, 8, 2, 14);

// 4. Lateral Raise: 12-15 reps, 2kg inc (12 sessions)
runClosedLoopSimulation('Lateral Raise (Elevação lateral)', plan('Elevação lateral com halteres', '12-15', 3, 'halter', 2), 10, 12, 2, 12);

console.log('✅ Passed Suite 1: All 4 exercise profiles completed 10+ consecutive sessions in closed loop.\n');

// =============================================================================
// TEST SUITE 2: PLATEAU & STALL HANDLING
// =============================================================================
console.log('--- SUITE 2: Plateau & Stall Handling ---');

// 2.1 RIR mode plateau: Athlete stuck at 45kg x 8 reps for 4 consecutive workouts
{
  console.log('Test 2.1: RIR Mode - Athlete stalled at 45kg x 8 reps @ 2 RIR');
  const ex = plan('Puxada aberta', '8-12', 3, 'polia', 5);
  const history = [];
  for (let i = 1; i <= 4; i++) {
    history.push(session(i, `2026-09-0${i}`, ex.n, makeSets(3, 45, 8, 2)));
    const res = meta(ex, history);
    check(res.status === 'manter', `Stall session ${i}: status must be manter`);
    check(res.carga === 45, `Stall session ${i}: load must stay 45kg`);
    check(res.repsMeta === 9, `Stall session ${i}: repsMeta must persistently guide to seek 9 reps`);
  }
  console.log('  -> RIR mode persistently drives progression target to break the stall.');
}

// 2.2 Legacy mode plateau: Athlete logs same load and same reps for 3+ sessions without RIR
{
  console.log('Test 2.2: Legacy Mode - 3 consecutive identical sessions trigger "travado" status');
  const ex = plan('Remada baixa', '8-12', 3, 'polia', 5);
  const history = [
    session(1, '2026-09-01', ex.n, makeSets(3, 50, 9)),
    session(2, '2026-09-03', ex.n, makeSets(3, 50, 9)),
    session(3, '2026-09-05', ex.n, makeSets(3, 50, 9))
  ];
  const res = meta(ex, history);
  check(res.status === 'travado', `Legacy plateau must trigger status 'travado', got ${res.status}`);
  check(res.carga === 50, 'Load should remain 50kg');
  check(res.repsMeta === 10, 'Target should seek minReps + 1');
  console.log('  -> Legacy mode correctly detects plateau and assigns "travado" status.');
}

console.log('✅ Passed Suite 2: Plateau & stall scenarios handled correctly.\n');

// =============================================================================
// TEST SUITE 3: FAILURE, DEGRADATION & DELOAD HANDLING
// =============================================================================
console.log('--- SUITE 3: Failure, Degradation & Deload Handling ---');

// 3.1 Single session failure below range.min with small under-rep (e.g. 17.5kg x 5 in 6-10) -> maintains load & seeks min
{
  console.log('Test 3.1: Single session below range.min maintains load and seeks range.min');
  const ex = plan('Supino reto halteres', '6-10', 3, 'halter', 2.5);
  const history = [
    session(1, '2026-09-01', ex.n, makeSets(3, 17.5, 5, 2)) // 5 reps < 6 range.min
  ];
  const res = meta(ex, history);
  check(res.status === 'manter', `Single under-min session must be manter, got ${res.status}`);
  check(res.carga === 17.5, `Load must stay 17.5kg, got ${res.carga}`);
  check(res.repsMeta === 6, `Target reps must seek range.min (6), got ${res.repsMeta}`);
  console.log('  -> Single bad session does not prematurely deload.');
}

// 3.2 Two consecutive sessions below range.min (e.g. 50kg x 6 in 8-12) MUST trigger deload / reduction
{
  console.log('Test 3.2: Two consecutive sessions below range.min trigger "reduzir"');
  const ex = plan('Supino reto', '8-12', 3, 'barra', 5);
  const history = [
    session(1, '2026-09-01', ex.n, makeSets(3, 50, 6, 2)),
    session(2, '2026-09-03', ex.n, makeSets(3, 50, 6, 2))
  ];
  const res = meta(ex, history);
  check(res.status === 'reduzir', `Two under-min sessions must trigger reduzir, got ${res.status}`);
  check(res.carga === 45, `Load must be reduced to 45kg, got ${res.carga}`);
  check(res.repsMeta === 10, `Reps must rebuild within range (10 reps), got ${res.repsMeta}`);
  console.log('  -> Sustained underperformance cleanly triggers deload.');
}

// 3.3 Deload recovery: After load reduction, athlete hits range.max at lower load -> steps back up
{
  console.log('Test 3.3: Deload recovery cycle');
  const ex = plan('Supino reto', '8-12', 3, 'barra', 5);
  const history = [
    session(1, '2026-09-01', ex.n, makeSets(3, 50, 6, 2)),
    session(2, '2026-09-03', ex.n, makeSets(3, 50, 6, 2)), // triggered reduction to 45kg
    session(3, '2026-09-06', ex.n, makeSets(3, 45, 10, 2)), // recovering at 45kg
    session(4, '2026-09-09', ex.n, makeSets(3, 45, 12, 2))  // hit ceiling at 45kg
  ];
  const res = meta(ex, history);
  check(res.status === 'subir', `After hitting 12 reps at 45kg, status must be subir, got ${res.status}`);
  check(res.carga === 50, `Load must progress back to 50kg, got ${res.carga}`);
  console.log('  -> Deload recovery successfully cycles back to higher load.');
}

console.log('✅ Passed Suite 3: Failure and deload mechanics verified.\n');

// =============================================================================
// TEST SUITE 4: ADVERSARIAL EDGE CASES & BOUNDARIES
// =============================================================================
console.log('--- SUITE 4: Adversarial Edge Cases & Boundary Conditions ---');

// 4.1 Asymmetric / Uneven reps across sets in a single session
{
  console.log('Test 4.1: Asymmetric reps across sets (Set 1: 10, Set 2: 9, Set 3: 8 in 8-12)');
  const ex = plan('Supino inclinado', '8-12', 3, 'halter', 2);
  const mixedSets = [
    { w: 24, r: 10, rir: 2, wu: false },
    { w: 24, r: 9, rir: 2, wu: false },
    { w: 24, r: 8, rir: 2, wu: false }
  ];
  const history = [session(1, '2026-09-01', ex.n, mixedSets)];
  const res = meta(ex, history);
  check(res.status === 'manter', 'Status must be manter');
  check(res.carga === 24, 'Load must stay 24kg');
  // minReps is 8, so target must be minReps + 1 = 9
  check(res.repsMeta === 9, `Target reps must be based on weakest decision set (8 + 1 = 9), got ${res.repsMeta}`);
  console.log('  -> Asymmetric set performance correctly anchored to minimum completed reps.');
}

// 4.2 Single top set with warmup sets
{
  console.log('Test 4.2: Warmup sets filtering in work-set decision');
  const ex = plan('Agachamento', '6-10', 3, 'barra', 5);
  const setsWithWu = [
    { w: 40, r: 12, wu: true },
    { w: 70, r: 6, wu: true },
    { w: 100, r: 8, rir: 2, wu: false },
    { w: 100, r: 8, rir: 2, wu: false },
    { w: 100, r: 8, rir: 2, wu: false }
  ];
  const history = [session(1, '2026-09-01', ex.n, setsWithWu)];
  const res = meta(ex, history);
  check(res.status === 'manter');
  check(res.carga === 100);
  check(res.repsMeta === 9);
  console.log('  -> Warmups filtered out, working sets evaluated accurately.');
}

// 4.3 High RIR (easy set) vs Low RIR (failure set)
{
  console.log('Test 4.3: RIR sensitivity (0 RIR vs 4 RIR)');
  const ex = plan('Desenvolvimento', '8-12', 3, 'halter', 2);
  // Athlete does 10 reps @ 4 RIR (capacity = 10 + 4 = 14 reps to failure -> can jump to 22kg x 8 reps)
  const resEasy = meta(ex, [session(1, '2026-09-01', ex.n, makeSets(3, 20, 10, 4))]);
  check(resEasy.status === 'subir', '10 reps @ 4 RIR indicates surplus capacity, allowing load advance');
  check(resEasy.carga === 22, 'Load advances to 22kg');
  check(resEasy.repsMeta === 8, 'RepsMeta at new load is 8');

  // Athlete does 8 reps @ 0 RIR (true failure, capacity = 8 reps to failure -> 6 reps @ 2 RIR on 20kg, so 18kg x 10 reps @ 2 RIR is optimal)
  const resFailure = meta(ex, [session(1, '2026-09-01', ex.n, makeSets(3, 20, 8, 0))]);
  check(resFailure.status === 'manter', '8 reps @ 0 RIR status is manter');
  check(resFailure.carga === 18, 'Load adjusts to 18kg to achieve target 2 RIR within 8-12 range');
  check(resFailure.repsMeta === 10, 'Target seeks 10 reps on 18kg');
  console.log('  -> RIR mathematical signal evaluated accurately.');
}

// 4.4 Large jump dumbbell bridging (repsCeiling expansion)
{
  console.log('Test 4.4: Large jump dumbbell bridging (repsCeiling above range.max)');
  // 10kg dumbbell with 2.5kg jump = 25% jump (exceeds default incrementLimitPct 10%)
  const ex = plan('Elevação lateral halteres', '10-12', 3, 'halter', 2.5);
  const res12 = meta(ex, [session(1, '2026-09-01', ex.n, makeSets(3, 10, 12))]);
  // Ceiling expands to 15 reps to build sufficient bridge strength before jumping 25% in load
  check(res12.status === 'manter', 'Large jump should bridge with reps before increasing load');
  check(res12.repsMeta === 13, `Reps target should be 13, got ${res12.repsMeta}`);

  // Once athlete achieves ceiling (15 reps), load increases to 12.5kg
  const res15 = meta(ex, [
    session(1, '2026-09-01', ex.n, makeSets(3, 10, 12)),
    session(2, '2026-09-03', ex.n, makeSets(3, 10, 15))
  ]);
  check(res15.status === 'subir', 'Reaching expanded ceiling triggers load increase');
  check(res15.carga === 12.5, 'Load advances to 12.5kg');
  console.log('  -> Large dumbbell jump bridging verified.');
}

console.log('✅ Passed Suite 4: All adversarial edge cases and boundaries validated.\n');

console.log('================================================================');
console.log(`🎉 EMPIRICAL CHALLENGER 2: ALL TESTS PASSED (${totalAssertions} assertions verified)!`);
console.log('================================================================\n');
