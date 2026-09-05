'use strict';

var assert = require('assert');
var P = require('../../main/assets/core/progressao.js');

function plan(name, reps, sets, eq, inc) {
  return { n: name, reps: reps, sets: sets || 3, eq: eq, inc: inc };
}
function fichaFor(ex) { return { A: { nome: 'Teste', ex: [ex] } }; }
function session(id, date, name, sets) {
  var entries = {}; entries[name] = sets; return { id: id, date: date, day: 'A', entries: entries };
}
function meta(ex, sessions, settings) {
  return P.calcularMeta(fichaFor(ex), sessions, 'A', ex.n, settings);
}
function sets(count, weight, reps, extra) {
  return Array.from({length: count}, function () {
    var set = {w: weight, r: reps, wu: false};
    if (extra) Object.keys(extra).forEach(function (key) { set[key] = extra[key]; });
    return set;
  });
}
function datedSessions(count, name, values) {
  return Array.from({length: count}, function (_, i) {
    return session(i, '2026-08-' + String(1 + i).padStart(2, '0'), name, values(i));
  });
}

var pulldown = plan('Puxada aberta', '8-12', 4, 'polia', 5);
assert.strictEqual(meta(pulldown, [session(1, '2026-08-01', pulldown.n, sets(4, 50, 12))]).status, 'subir');
assert.strictEqual(meta(pulldown, [session(1, '2026-08-01', pulldown.n, sets(4, 50, 12))]).carga, 55);

/* Reaching the top of the range is progress, not a plateau. */
var legPress = plan('Leg press 45', '8-12', 4, 'maquina', 5);
assert.strictEqual(meta(legPress, datedSessions(6, legPress.n, function () { return sets(4, 80, 12); })).status, 'subir');

/* Same load and same performance for three complete sessions is a plateau. */
var row = plan('Remada baixa', '8-12', 4, 'polia', 5);
assert.strictEqual(meta(row, datedSessions(4, row.n, function () { return sets(4, 50, 10); })).status, 'travado');

/* A single set cannot authorize a load increase on a four-set compound. */
var dumbbell = plan('Supino reto c/ halteres', '6-10', 4, 'halter', 2.5);
var dumbbellMeta = meta(dumbbell, [session(1, '2026-08-01', dumbbell.n, sets(1, 17.5, 10))]);
assert.strictEqual(dumbbellMeta.status, 'manter');
assert.strictEqual(dumbbellMeta.carga, 17.5);

/* Large stack jumps are bridged by repetitions before changing load. */
var reverseFly = plan('Crucifixo inverso', '10-12', 3, 'maquina', 5);
var reverseBase = meta(reverseFly, [session(1, '2026-08-01', reverseFly.n, sets(3, 25, 12))]);
assert.strictEqual(reverseBase.status, 'manter');
assert.strictEqual(reverseBase.repsMeta, 13);
var reverseReady = meta(reverseFly, [
  session(1, '2026-08-01', reverseFly.n, sets(3, 25, 12)),
  session(2, '2026-08-02', reverseFly.n, sets(3, 25, 14))
]);
assert.strictEqual(reverseReady.status, 'subir');
assert.strictEqual(reverseReady.carga, 30);

/* Deload uses the configured percentage and needs two complete bad sessions. */
var reduce = plan('Teste reducao', '8-12', 3, 'maquina', 5);
var reduceMeta = meta(reduce, datedSessions(2, reduce.n, function () { return sets(3, 50, 6); }), {deloadPct: 20});
assert.strictEqual(reduceMeta.status, 'reduzir');
assert.strictEqual(reduceMeta.carga, 40);
assert.strictEqual(meta(reduce, [session(1, '2026-08-01', reduce.n, sets(3, 50, 6))]).status, 'manter');

assert.deepStrictEqual(P.seriesDeTrabalho([
  {w:2.5,r:7}, {w:20,r:5}, {w:40,r:5}, {w:50,r:12}, {w:50,r:10}, {w:50,r:10}
]).map(function (s) { return s.w; }), [50, 50, 50]);

var noHistory = plan('Sem historico', '8-12', 3, 'maquina', 5);
assert.strictEqual(meta(noHistory, []).status, 'inicial');
assert.strictEqual(meta(noHistory, []).carga, null);

var lowVolume = plan('Volume incompleto', '8-12', 4, 'maquina', 5);
assert.strictEqual(meta(lowVolume, [0, 1, 2].map(function (i) {
  return session(i, '2026-08-' + String(1 + i).padStart(2, '0'), lowVolume.n,
    i !== 0 ? sets(2, 50, 10) : sets(4, 50, 10));
})).status, 'volume-baixo');

/* Short sessions are evidence but missing volume never causes a penalty. */
var shortFailure = plan('Falha em treino curto', '8-12', 4, 'maquina', 5);
var shortFailureMeta = meta(shortFailure, [Object.assign(session(1, '2026-08-14', shortFailure.n, sets(1, 50, 6)), {mode: 'curto'})]);
assert.strictEqual(shortFailureMeta.status, 'manter');
assert.notStrictEqual(shortFailureMeta.status, 'reduzir');

var shortVolume = plan('Treino curto', '8-12', 4, 'maquina', 5);
var shortVolumeMeta = meta(shortVolume, [0, 1, 2].map(function (i) {
  return Object.assign(session(i, '2026-08-' + String(10 + i).padStart(2, '0'), shortVolume.n, sets(2, 50, 10)), {mode: 'curto'});
}));
assert.strictEqual(shortVolumeMeta.status, 'manter');
assert.notStrictEqual(shortVolumeMeta.status, 'volume-baixo');

var shortAfterNormal = plan('Curto depois do normal', '8-12', 4, 'maquina', 5);
var normalBase = session(1, '2026-08-01', shortAfterNormal.n, sets(4, 50, 12));
var shortFollowup = Object.assign(session(2, '2026-08-02', shortAfterNormal.n, sets(2, 50, 6)), {mode: 'curto'});
var shortAfterNormalMeta = meta(shortAfterNormal, [normalBase, shortFollowup]);
assert.strictEqual(shortAfterNormalMeta.status, 'manter');
assert.strictEqual(shortAfterNormalMeta.carga, 50);
assert.notStrictEqual(shortAfterNormalMeta.status, 'reduzir');

/* A per-exercise override can use fewer decision sets without changing volume. */
var override = plan('Elevacao lateral', '10-12', 4, 'maquina', 5);
override.progressao = {decisionSets: 2, incrementLimitPct: 0.15};
assert.strictEqual(meta(override, [session(1, '2026-08-01', override.n, sets(2, 35, 12))]).status, 'subir');

/* RIR is part of capacity: reps + RIR can authorize progress even below the rep ceiling. */
var rirGuard = plan('Supino com barra', '7-9', 3, 'barra', 5);
var rirProgress = meta(rirGuard, [session(1, '2026-08-01', rirGuard.n, sets(3, 10, 8, {rir: 3}))]);
assert.strictEqual(rirProgress.status, 'subir');
assert.strictEqual(rirProgress.modelo, 'rir');
assert.strictEqual(rirProgress.targetRir, 2);

/* MacroFactor-style equivalent performances have the same capacity signal. */
[[8, 3], [9, 2], [10, 1], [11, 0]].forEach(function (pair) {
  var equivalent = plan('Equivalente ' + pair[0], '7-9', 1, 'maquina', 5);
  var m = meta(equivalent, [session(1, '2026-08-01', equivalent.n, sets(1, 100, pair[0], {rir: pair[1]}))]);
  assert.strictEqual(m.status, 'subir');
  assert.strictEqual(m.carga, 105);
  assert.strictEqual(m.repsMeta, 7);
});

/* Missing RIR keeps the compatible legacy engine. */
var noRirFallback = plan('Sem RIR', '8-12', 3, 'maquina', 5);
assert.strictEqual(meta(noRirFallback, [session(1, '2026-08-01', noRirFallback.n, sets(3, 50, 12))]).modelo, 'legado');

/* High-repetition exercises use reps first and do not rely on e1RM. */
var calf = plan('Panturrilha sentado', '12-15', 3, 'maquina', 5);
assert.strictEqual(meta(calf, [session(1, '2026-08-01', calf.n, sets(3, 30, 15))]).repsMeta, 16);
assert.strictEqual(meta(calf, [
  session(1, '2026-08-01', calf.n, sets(3, 30, 15)),
  session(2, '2026-08-02', calf.n, sets(3, 30, 17))
]).status, 'subir');

/* Exercise aliases preserve the history after a rename. */
var aliased = plan('Nome atual', '8-12', 3, 'maquina', 5);
aliased.id = 'ex_nome-atual';
aliased.aliases = ['Nome antigo'];
assert.strictEqual(meta(aliased, [session(1, '2026-08-01', 'Nome antigo', sets(3, 50, 12))]).status, 'subir');

/* =========================================================================
 * Milestone 1 (R1): Evolução Dupla Progressão / RIR Tests
 * ========================================================================= */

/* Problem 1: Double Progression Rep Increment (45kg x 8 in 8-12 @ 2 RIR -> 45kg seeking 9 reps) */
var doubleProgPlan = plan('Puxada aberta R1', '8-12', 3, 'polia', 5);
var dpMeta1 = meta(doubleProgPlan, [session(1, '2026-08-01', doubleProgPlan.n, sets(3, 45, 8, { rir: 2 }))]);
assert.strictEqual(dpMeta1.status, 'manter', 'Status should be manter for 45kg x 8 in 8-12 @ 2 RIR');
assert.strictEqual(dpMeta1.carga, 45, 'Carga should remain 45kg');
assert.strictEqual(dpMeta1.repsMeta, 9, 'RepsMeta should advance to 9 reps');

/* Problem 1 Sequential progression: 45kg x 9 -> 10, 45kg x 10 -> 11, 45kg x 12 -> subir 50kg */
var dpMeta2 = meta(doubleProgPlan, [session(1, '2026-08-01', doubleProgPlan.n, sets(3, 45, 9, { rir: 2 }))]);
assert.strictEqual(dpMeta2.status, 'manter');
assert.strictEqual(dpMeta2.carga, 45);
assert.strictEqual(dpMeta2.repsMeta, 10);

var dpMeta3 = meta(doubleProgPlan, [session(1, '2026-08-01', doubleProgPlan.n, sets(3, 45, 10, { rir: 2 }))]);
assert.strictEqual(dpMeta3.status, 'manter');
assert.strictEqual(dpMeta3.carga, 45);
assert.strictEqual(dpMeta3.repsMeta, 11);

var dpMeta4 = meta(doubleProgPlan, [session(1, '2026-08-01', doubleProgPlan.n, sets(3, 45, 12, { rir: 2 }))]);
assert.strictEqual(dpMeta4.status, 'subir', 'Status should be subir after achieving top of range (12 reps)');
assert.strictEqual(dpMeta4.carga, 50, 'Carga should increase by increment (50kg)');
assert.strictEqual(dpMeta4.repsMeta, 8, 'RepsMeta should reset to range.min (8 reps)');

/* Problem 2: Strict Range Candidate Selection (17.5kg x 7 in 6-10 @ 2 RIR -> 17.5kg seeking 8 reps, never 15kg x 14) */
var dbBench = plan('Supino reto c/ halteres R1', '6-10', 3, 'halter', 2.5);
var dbBenchMeta = meta(dbBench, [session(1, '2026-08-01', dbBench.n, sets(3, 17.5, 7, { rir: 2 }))]);
assert.strictEqual(dbBenchMeta.status, 'manter');
assert.strictEqual(dbBenchMeta.carga, 17.5);
assert.strictEqual(dbBenchMeta.repsMeta, 8);
assert.notStrictEqual(dbBenchMeta.carga, 15, 'Should never downgrade load on valid in-range set');
assert.notStrictEqual(dbBenchMeta.repsMeta, 14, 'Should never inflate reps above range.max on downstep');

/* Boundary Case: Exactly at range.min (6 reps in 6-10 @ 2 RIR) */
var dbBenchMin = meta(dbBench, [session(1, '2026-08-01', dbBench.n, sets(3, 17.5, 6, { rir: 2 }))]);
assert.strictEqual(dbBenchMin.status, 'manter');
assert.strictEqual(dbBenchMin.carga, 17.5);
assert.strictEqual(dbBenchMin.repsMeta, 7);

/* Boundary Case: Exactly at range.max (10 reps in 6-10 @ 2 RIR) */
var dbBenchMax = meta(dbBench, [session(1, '2026-08-01', dbBench.n, sets(3, 17.5, 10, { rir: 2 }))]);
assert.strictEqual(dbBenchMax.status, 'subir');
assert.strictEqual(dbBenchMax.carga, 20.0);
assert.strictEqual(dbBenchMax.repsMeta, 6);

/* Boundary Case: Above range.max (11 reps in 6-10 @ 2 RIR) */
var dbBenchAbove = meta(dbBench, [session(1, '2026-08-01', dbBench.n, sets(3, 17.5, 11, { rir: 2 }))]);
assert.strictEqual(dbBenchAbove.status, 'subir');
assert.strictEqual(dbBenchAbove.carga, 20.0);

/* Boundary Case: Below range.min single session (5 reps in 6-10 @ 2 RIR) -> maintain & seek range.min */
var dbBenchUnder1 = meta(dbBench, [session(1, '2026-08-01', dbBench.n, sets(3, 17.5, 5, { rir: 2 }))]);
assert.strictEqual(dbBenchUnder1.status, 'manter');
assert.strictEqual(dbBenchUnder1.carga, 17.5);
assert.strictEqual(dbBenchUnder1.repsMeta, 6);

/* Boundary Case: Below range.min sustained 2 sessions in 8-12 @ 2 RIR (50kg x 6 reps) -> reduce to 45kg x 10 */
var reducePlan812 = plan('Supino barra R1', '8-12', 3, 'barra', 5);
var reduceMeta812 = meta(reducePlan812, [
  session(1, '2026-08-01', reducePlan812.n, sets(3, 50, 6, { rir: 2 })),
  session(2, '2026-08-03', reducePlan812.n, sets(3, 50, 6, { rir: 2 }))
]);
assert.strictEqual(reduceMeta812.status, 'reduzir');
assert.strictEqual(reduceMeta812.carga, 45);
assert.strictEqual(reduceMeta812.repsMeta, 10);

/* Boundary Case: Below range.min sustained 2 sessions in 6-10 @ 2 RIR (17.5kg x 4 reps) -> reduce to 15kg x 10 */
var dbBenchUnder2 = meta(dbBench, [
  session(1, '2026-08-01', dbBench.n, sets(3, 17.5, 4, { rir: 2 })),
  session(2, '2026-08-03', dbBench.n, sets(3, 17.5, 4, { rir: 2 }))
]);
assert.strictEqual(dbBenchUnder2.status, 'reduzir');
assert.strictEqual(dbBenchUnder2.carga, 15.0);
assert.strictEqual(dbBenchUnder2.repsMeta, 10);

/* Boundary Case: Fractional increment (e.g. 1.25kg) */
var microPlan = plan('Desenvolvimento halteres', '8-12', 3, 'halter', 1.25);
var microMeta1 = meta(microPlan, [session(1, '2026-08-01', microPlan.n, sets(3, 12.5, 8, { rir: 2 }))]);
assert.strictEqual(microMeta1.status, 'manter');
assert.strictEqual(microMeta1.carga, 12.5);
assert.strictEqual(microMeta1.repsMeta, 9);
var microMetaMax = meta(microPlan, [session(1, '2026-08-01', microPlan.n, sets(3, 12.5, 12, { rir: 2 }))]);
assert.strictEqual(microMetaMax.status, 'subir');
assert.strictEqual(microMetaMax.carga, 13.75);

/* Boundary Case: Bodyweight / Zero increment (inc = 0) */
var bodyweightPlan = plan('Barra fixa', '6-10', 3, 'corporal', 0);
var bwMeta1 = meta(bodyweightPlan, [session(1, '2026-08-01', bodyweightPlan.n, sets(3, 0, 6, { rir: 2 }))]);
assert.strictEqual(bwMeta1.status, 'manter');
assert.strictEqual(bwMeta1.carga, 0);
assert.strictEqual(bwMeta1.repsMeta, 7);

/* 20-Combination Matrix across rep ranges (4-6, 6-10, 8-12, 10-15, 12-15) and RIR targets (0, 1, 2, 3) */
var matrixRanges = ['4-6', '6-10', '8-12', '10-15', '12-15'];
var matrixRIRs = [0, 1, 2, 3];
var matrixLoads = { '4-6': 80, '6-10': 30, '8-12': 45, '10-15': 50, '12-15': 50 };
var matrixIncs = { '4-6': 5, '6-10': 2.5, '8-12': 5, '10-15': 2.5, '12-15': 2.5 };

matrixRanges.forEach(function (rStr) {
  var parsed = P.parseRange(rStr);
  matrixRIRs.forEach(function (targetRir) {
    var p = plan('Matrix ' + rStr, rStr, 3, 'maquina', matrixIncs[rStr]);
    p.progressao = { targetRir: targetRir };
    var weight = matrixLoads[rStr];

    // Intermediate reps (at min): maintains load and advances rep target
    var mMin = meta(p, [session(1, '2026-08-01', p.n, sets(3, weight, parsed.min, { rir: targetRir }))]);
    assert.strictEqual(mMin.status, 'manter', 'Matrix ' + rStr + ' @ RIR ' + targetRir + ' should maintain at min reps');
    assert.strictEqual(mMin.carga, weight);
    assert.strictEqual(mMin.repsMeta, parsed.min + 1, 'Matrix ' + rStr + ' @ RIR ' + targetRir + ' should prescribe minReps + 1');

    // Max reps: advances load by 1 increment
    var mMax = meta(p, [session(1, '2026-08-01', p.n, sets(3, weight, parsed.max, { rir: targetRir }))]);
    assert.strictEqual(mMax.status, 'subir', 'Matrix ' + rStr + ' @ RIR ' + targetRir + ' should advance load at max reps');
    assert.strictEqual(mMax.carga, weight + matrixIncs[rStr], 'Matrix ' + rStr + ' @ RIR ' + targetRir + ' load should advance by increment');
    assert(mMax.repsMeta >= parsed.min, 'Matrix ' + rStr + ' @ RIR ' + targetRir + ' repsMeta should be >= range.min');
  });
});

/* Tier 4 Scenario: Multi-Session Double Progression Lifecycle */
var cyclePlan = plan('Supino inclinado c/ halteres', '8-12', 3, 'halter', 2);
var cycleHistory = [];

// Session 1: Baseline 24kg x 8 @ 2 RIR
cycleHistory.push(session(1, '2026-08-01', cyclePlan.n, sets(3, 24, 8, { rir: 2 })));
var c1 = meta(cyclePlan, cycleHistory);
assert.strictEqual(c1.status, 'manter');
assert.strictEqual(c1.carga, 24);
assert.strictEqual(c1.repsMeta, 9);

// Session 2: 24kg x 9 @ 2 RIR
cycleHistory.push(session(2, '2026-08-04', cyclePlan.n, sets(3, 24, 9, { rir: 2 })));
var c2 = meta(cyclePlan, cycleHistory);
assert.strictEqual(c2.status, 'manter');
assert.strictEqual(c2.carga, 24);
assert.strictEqual(c2.repsMeta, 10);

// Session 3: 24kg x 10 @ 2 RIR
cycleHistory.push(session(3, '2026-08-07', cyclePlan.n, sets(3, 24, 10, { rir: 2 })));
var c3 = meta(cyclePlan, cycleHistory);
assert.strictEqual(c3.status, 'manter');
assert.strictEqual(c3.carga, 24);
assert.strictEqual(c3.repsMeta, 11);

// Session 4: 24kg x 12 @ 2 RIR -> Hits ceiling, triggers load progression to 26kg
cycleHistory.push(session(4, '2026-08-10', cyclePlan.n, sets(3, 24, 12, { rir: 2 })));
var c4 = meta(cyclePlan, cycleHistory);
assert.strictEqual(c4.status, 'subir');
assert.strictEqual(c4.carga, 26);
assert.strictEqual(c4.repsMeta, 9);

console.log('progressao.test.js: OK');
