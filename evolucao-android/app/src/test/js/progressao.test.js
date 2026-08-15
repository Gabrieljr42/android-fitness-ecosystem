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

console.log('progressao.test.js: OK');
