'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const Progression = require('../../main/assets/core/progressao.js');
const storage = {
  data: {},
  fail: false,
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; },
  setItem(key, value) { if (this.fail) throw new Error('quota'); this.data[key] = String(value); }
};
const bridge = {
  plans: [],
  acks: [],
  publishWearPlan(json) { this.plans.push(json); },
  confirmWearEventsApplied(json) { this.acks.push(json); },
  requestWearInboxDrain() {},
  syncWorkoutState() {}
};
const windowObject = { AndroidBridge: bridge, crypto: crypto.webcrypto, scrollTo() {} };
const context = {
  console,
  Progression,
  Date,
  Math,
  JSON,
  String,
  Number,
  Array,
  Object,
  RegExp,
  parseFloat,
  parseInt,
  isFinite,
  localStorage: storage,
  window: windowObject,
  self: windowObject,
  crypto: crypto.webcrypto,
  setTimeout: () => 1,
  clearTimeout: () => {},
  AndroidBridge: bridge
};
vm.createContext(context);
const assets = path.resolve(__dirname, '../../main/assets');
function load(relative) {
  vm.runInContext(fs.readFileSync(path.join(assets, relative), 'utf8'), context, { filename: relative });
}
load('kernel/fmt.js');
load('apps/evolucao/exercicios/nomes.js');
load('apps/evolucao/dados.js');
load('kernel/db.js');
load('apps/evolucao/logic.js');
load('apps/evolucao/wear-sync.js');

const api = windowObject.EvolucaoWear;
const INSTANCE = '10000000-0000-4000-8000-000000000001';
let sequence = 0;

function reset(day = 'A') {
  context.state = context.migrate(JSON.parse(JSON.stringify(context.DEFAULT_STATE)));
  context.state.draft.day = day;
  context.state.draft.date = '2026-08-23';
  context.state.draft.dateExplicit = true;
  context.state.draft.entries = {};
  context.state.draft.warmupMode = {};
  context.state.draft.startedAt = 1777000000000;
  storage.data = {};
  storage.fail = false;
  bridge.plans = [];
  bridge.acks = [];
  sequence = 0;
}

function plan() { return JSON.parse(api.exportPlanJson('{}')); }
function envelope(events, envelopeId) {
  return {
    protocolVersion: 1,
    envelopeId: envelopeId || crypto.randomUUID(),
    origin: 'WEAR',
    originInstanceId: INSTANCE,
    createdAt: 1777000010000 + sequence,
    events
  };
}
function completed(p, prescription, overrides = {}) {
  const ex = p.exercises.find(e => e.prescriptions.some(s => s.setId === prescription.setId));
  sequence += 1;
  return Object.assign({
    protocolVersion: 1,
    eventType: 'COMPLETED_SET',
    eventId: crypto.randomUUID(),
    sessionId: p.sessionId,
    planId: p.planId,
    planRevision: p.planRevision,
    logicalDate: p.logicalDate,
    occurredAt: 1777000020000 + sequence,
    createdAt: 1777000020100 + sequence,
    origin: 'WEAR',
    originInstanceId: INSTANCE,
    originSequence: sequence,
    exerciseId: ex.exerciseId,
    setId: prescription.setId,
    setKind: prescription.setKind,
    loadMode: 'EXTERNAL',
    loadGrams: 32500,
    reps: 9,
    partialReps: 0,
    rir: prescription.setKind === 'WORK' ? 2 : null,
    targetRir: prescription.targetRir,
    completedSides: ex.unilateral ? 2 : 1
  }, overrides);
}
function finish(p, heads, eventId) {
  sequence += 1;
  return {
    protocolVersion: 1,
    eventType: 'SESSION_FINISHED',
    eventId: eventId || crypto.randomUUID(),
    sessionId: p.sessionId,
    planId: p.planId,
    planRevision: p.planRevision,
    logicalDate: p.logicalDate,
    occurredAt: 1777000100000 + sequence,
    createdAt: 1777000100100 + sequence,
    origin: 'WEAR',
    originInstanceId: INSTANCE,
    originSequence: sequence,
    mode: context.state.draft.sessionMode === 'curto' ? 'SHORT' : 'NORMAL',
    durationSeconds: 1800,
    finalSetHeads: heads
  };
}
function resultFor(result, eventId) { return result.results.find(r => r.eventId === eventId); }

console.log('=== Wear sync JS adapter ===');

// 1. A/B/C export and stable identity/revision.
for (const day of ['A', 'B', 'C']) {
  reset(day);
  const first = plan();
  const second = plan();
  assert.strictEqual(first.day, day);
  assert.strictEqual(first.protocolVersion, 1);
  assert.strictEqual(first.planId, second.planId);
  assert.strictEqual(first.sessionId, second.sessionId);
  assert.strictEqual(first.planRevision, second.planRevision);
  assert(first.exercises.length > 0 && first.exercises.every(e => e.exerciseId.startsWith('ex_')));
}
console.log('✓ exportação A/B/C e identidade estável');

// 2. Revision changes while set identity and completed overlay survive.
reset('A');
let p = plan();
let work = p.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
const setEvent = completed(p, work);
let appliedResult = api.applyEventsJson(envelope([setEvent]));
assert.strictEqual(resultFor(appliedResult, setEvent.eventId).status, 'APPLIED');
const originalSetId = work.setId;
context.state.ficha.A.ex[0].rest += 30;
const revised = plan();
work = revised.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
assert.strictEqual(revised.planRevision, p.planRevision + 1);
assert.strictEqual(work.setId, originalSetId);
assert.strictEqual(context.state.draft.entries[context.state.ficha.A.ex[0].n][0].syncSetId, originalSetId);
console.log('✓ revisão de plano preserva IDs e overlay concluído');

// 3. Duplicate event is a success without a duplicate set.
const duplicateResult = api.applyEventsJson(envelope([setEvent]));
assert.strictEqual(resultFor(duplicateResult, setEvent.eventId).status, 'ALREADY_APPLIED');
assert.strictEqual(context.state.draft.entries[context.state.ficha.A.ex[0].n].length, 1);
console.log('✓ retry idempotente não duplica série');

// 4. Out-of-order edit blocks, then drains when base arrives.
reset('A');
p = plan();
work = p.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
const base = completed(p, work);
const edit = Object.assign({}, base, {
  eventType: 'SET_EDITED',
  eventId: crypto.randomUUID(),
  baseEventId: base.eventId,
  originSequence: base.originSequence + 1,
  occurredAt: base.occurredAt + 1000,
  createdAt: base.createdAt + 1000,
  reps: 11
});
delete edit.eventTypeNever;
let outOfOrder = api.applyEventsJson(envelope([edit]));
assert.strictEqual(resultFor(outOfOrder, edit.eventId).status, 'BLOCKED');
outOfOrder = api.applyEventsJson(envelope([base]));
assert.strictEqual(resultFor(outOfOrder, base.eventId).status, 'APPLIED');
assert.strictEqual(resultFor(outOfOrder, edit.eventId).status, 'APPLIED');
assert.strictEqual(context.state.draft.entries[context.state.ficha.A.ex[0].n][0].r, 11);
console.log('✓ evento fora de ordem é persistido e conciliado');

// 5. Rename keeps canonical opaque ID and routes into the renamed entry.
reset('A');
const canonicalId = context.state.ficha.A.ex[0].id;
context.state.ficha.A.ex[0].aliases.push(context.state.ficha.A.ex[0].n);
context.state.ficha.A.ex[0].n = 'Supino principal renomeado';
p = plan();
assert.strictEqual(p.exercises[0].exerciseId, canonicalId);
work = p.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
const renamedEvent = completed(p, work);
assert.strictEqual(resultFor(api.applyEventsJson(envelope([renamedEvent])), renamedEvent.eventId).status, 'APPLIED');
assert.strictEqual(context.state.draft.entries['Supino principal renomeado'][0].r, 9);
console.log('✓ rename/alias preserva o exercício canônico');

// 6. Warmup flags, bodyweight zero, partials and RIR are materialized compatibly.
reset('A');
const exerciseName = context.state.ficha.A.ex[0].n;
context.state.draft.warmupMode[exerciseName] = true;
p = plan();
const warm = p.exercises[0].prescriptions.find(s => s.setKind === 'WARMUP');
const warmEvent = completed(p, warm, { loadMode: 'BODYWEIGHT', loadGrams: 0, reps: 12, partialReps: 3, rir: null, completedSides: 1 });
assert.strictEqual(resultFor(api.applyEventsJson(envelope([warmEvent])), warmEvent.eventId).status, 'APPLIED');
const warmStored = context.state.draft.entries[exerciseName][0];
assert.strictEqual(warmStored.w, 0);
assert.strictEqual(warmStored.wu, true);
assert.strictEqual(warmStored.warmup, true);
assert.strictEqual(warmStored.p, 3);
assert.strictEqual(context.state.draft.warmupMode[exerciseName], false);
console.log('✓ aquecimento, peso corporal, parciais e flags legadas');

// 7. Unilateral side one is acknowledged causally but only side two materializes the set.
reset('B');
p = plan();
const unilateral = p.exercises.find(e => e.unilateral);
assert(unilateral);
work = unilateral.prescriptions.find(s => s.setKind === 'WORK');
const oneSide = completed(p, work, { completedSides: 1 });
let unilateralResult = api.applyEventsJson(envelope([oneSide]));
assert.strictEqual(resultFor(unilateralResult, oneSide.eventId).status, 'APPLIED');
assert.strictEqual((context.state.draft.entries[unilateral.name] || []).length, 0);
const secondSide = Object.assign({}, oneSide, {
  eventType: 'SET_EDITED',
  eventId: crypto.randomUUID(),
  baseEventId: oneSide.eventId,
  originSequence: oneSide.originSequence + 1,
  occurredAt: oneSide.occurredAt + 1000,
  createdAt: oneSide.createdAt + 1000,
  completedSides: 2
});
unilateralResult = api.applyEventsJson(envelope([secondSide]));
assert.strictEqual(resultFor(unilateralResult, secondSide.eventId).status, 'APPLIED');
assert.strictEqual(context.state.draft.entries[unilateral.name].length, 1);
assert.strictEqual(context.state.draft.entries[unilateral.name][0].syncHeadEventId, secondSide.eventId);
console.log('✓ unilateral confirma o primeiro lado e materializa somente após o segundo');

// 8. Simultaneous phone/Wear completion is explicit, deterministic and non-duplicating.
reset('A');
p = plan();
work = p.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
const simultaneousName = context.state.ficha.A.ex[0].n;
context.state.draft.entries[simultaneousName] = [{ w: 40, r: 12, rir: 1, done: true }];
const simultaneousWear = completed(p, work, { loadGrams: 50000, reps: 8, rir: 2 });
const simultaneousResult = api.applyEventsJson(envelope([simultaneousWear]));
assert.strictEqual(resultFor(simultaneousResult, simultaneousWear.eventId).status, 'CONFLICT_STORED');
assert.strictEqual(context.state.draft.entries[simultaneousName].length, 1);
assert.strictEqual(context.state.draft.entries[simultaneousName][0].w, 50);
assert.strictEqual(context.state.draft.entries[simultaneousName][0].r, 8);
assert.strictEqual(context.state.draft.entries[simultaneousName][0].syncSetId, work.setId);
assert.strictEqual(context.state.wearSync.conflicts.slice(-1)[0].kind, 'PHONE_AND_WEAR_COMPLETED');
assert.strictEqual(context.state.wearSync.conflicts.slice(-1)[0].phoneValue.w, 40);
console.log('✓ telefone e Wear simultâneos geram conflito auditável; Wear prevalece');

// 9. Short finish is exactly-once and keeps the explicit logical date.
reset('A');
context.state.draft.sessionMode = 'curto';
p = plan();
work = p.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
const completeForFinish = completed(p, work);
api.applyEventsJson(envelope([completeForFinish]));
const finishEvent = finish(p, { [work.setId]: completeForFinish.eventId });
let finishResult = api.applyEventsJson(envelope([finishEvent]));
assert.strictEqual(resultFor(finishResult, finishEvent.eventId).status, 'APPLIED');
assert.strictEqual(context.state.sessions.length, 1);
assert.strictEqual(context.state.sessions[0].mode, 'curto');
assert.strictEqual(context.state.sessions[0].date, '2026-08-23');
finishResult = api.applyEventsJson(envelope([finishEvent]));
assert.strictEqual(resultFor(finishResult, finishEvent.eventId).status, 'ALREADY_APPLIED');
assert.strictEqual(context.state.sessions.length, 1);
const secondFinish = finish(p, { [work.setId]: completeForFinish.eventId });
finishResult = api.applyEventsJson(envelope([secondFinish]));
assert.strictEqual(resultFor(finishResult, secondFinish.eventId).status, 'CONFLICT_STORED');
assert.strictEqual(context.state.sessions.length, 1);
console.log('✓ finalização curta exatamente uma vez e data lógica explícita');

// 10. A localStorage crash window produces no ack/mutation and replay succeeds.
reset('A');
p = plan();
work = p.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
const crashEvent = completed(p, work);
storage.fail = true;
const before = JSON.stringify(context.state);
const failed = api.applyEventsJson(envelope([crashEvent]));
assert.strictEqual(failed.ok, false);
assert.strictEqual(failed.error, 'PERSIST_FAILED');
assert.strictEqual(JSON.stringify(context.state), before);
storage.fail = false;
assert.strictEqual(resultFor(api.applyEventsJson(envelope([crashEvent])), crashEvent.eventId).status, 'APPLIED');
console.log('✓ crash antes da persistência não confirma nem perde replay');

// 11. Backup merge keeps Wear ledger and semantic session dedupe ignores sync metadata.
const current = JSON.parse(JSON.stringify(context.state));
const incoming = JSON.parse(JSON.stringify(context.state));
incoming.wearSync.appliedEvents['20000000-0000-4000-8000-000000000001'] = { fingerprint: 'backup' };
const merged = context.mergeState(current, incoming).state;
assert(merged.wearSync.appliedEvents[crashEvent.eventId]);
assert(merged.wearSync.appliedEvents['20000000-0000-4000-8000-000000000001']);
console.log('✓ backup preserva ledger Wear');

// 12. Unknown fields, absurd values and oversized queues fail closed.
reset('A');
p = plan();
work = p.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
const hostile = completed(p, work, { reps: 999 });
let hostileResult = api.applyEventsJson(envelope([hostile]));
assert.strictEqual(resultFor(hostileResult, hostile.eventId).status, 'REJECTED');
const withCode = completed(p, work); withCode.javascript = 'window.attack()';
hostileResult = api.applyEventsJson(envelope([withCode]));
assert.strictEqual(resultFor(hostileResult, withCode.eventId).status, 'REJECTED');
const tooMany = Array.from({ length: 65 }, () => completed(p, work, { eventId: crypto.randomUUID() }));
assert.strictEqual(api.applyEventsJson(envelope(tooMany)).error, 'INVALID_ENVELOPE');
console.log('✓ limites e campos desconhecidos falham fechados');

// 13. Native callback is emitted only after durable application.
reset('A');
p = plan();
work = p.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
const nativeEvent = completed(p, work);
const callback = JSON.parse(api.consumeNativeInbox(JSON.stringify(envelope([nativeEvent]))));
assert.strictEqual(callback.ok, true);
assert.strictEqual(bridge.acks.length, 1);
assert.strictEqual(JSON.parse(bridge.acks[0]).results[0].eventId, nativeEvent.eventId);
console.log('✓ bridge confirma somente depois do commit JS');

// 14. Phone-completed set is published and bumps the revision.
reset('A');
p = plan();
work = p.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
assert.deepStrictEqual(p.phoneCompletedSetIds, []);
assert.strictEqual(p.phoneRest, null);
const phoneName = context.state.ficha.A.ex[0].n;
context.state.draft.entries[phoneName] = [{ w: 40, r: 8, done: true }];
const progressed = plan();
assert.deepStrictEqual(progressed.phoneCompletedSetIds, [work.setId]);
assert.strictEqual(progressed.planRevision, p.planRevision + 1);
assert.strictEqual(progressed.phoneRest, null);
console.log('✓ série feita no telefone é publicada e avança a revisão');

// 15. Identical republish is stable (no revision churn).
const stable = plan();
assert.strictEqual(stable.planRevision, progressed.planRevision);
assert.deepStrictEqual(stable.phoneCompletedSetIds, [work.setId]);
console.log('✓ republicação idêntica não gera revisão nova');

// 16. Phone rest goes out while running/paused and clears when dismissed.
reset('A');
p = plan();
context.rest = { on: true, done: false, paused: false, remain: 90, end: Date.now() + 90000, label: 'Supino' };
let resting = plan();
assert.strictEqual(resting.phoneRest.running, true);
assert.strictEqual(resting.phoneRest.paused, false);
assert.strictEqual(resting.phoneRest.durationSeconds, 90);
assert(resting.phoneRest.endWallClockMillis > Date.now());
assert.strictEqual(resting.planRevision, p.planRevision + 1);
context.rest = { on: false, done: false, paused: true, remain: 42, end: 0, label: '' };
const pausedPlan = plan();
assert.strictEqual(pausedPlan.phoneRest.running, false);
assert.strictEqual(pausedPlan.phoneRest.paused, true);
assert.strictEqual(pausedPlan.phoneRest.remainingWhenPausedSeconds, 42);
context.rest = { on: false, done: false, paused: false, remain: 0, end: 0, label: '' };
const cleared = plan();
assert.strictEqual(cleared.phoneRest, null);
delete context.rest;
console.log('✓ descanso do telefone (correndo/pausado/limpo) é publicado');

// 17. Only done entries map; warmups map to warmup buckets.
reset('A');
p = plan();
const wName = context.state.ficha.A.ex[0].n;
context.state.draft.warmupMode[wName] = true;
const withWarm = plan();
const warmPresc = withWarm.exercises[0].prescriptions.find(s => s.setKind === 'WARMUP');
work = withWarm.exercises[0].prescriptions.find(s => s.setKind === 'WORK');
assert(warmPresc);
context.state.draft.entries[wName] = [
  { w: 20, r: 12, done: true, wu: true, warmup: true },
  { w: 40, r: 8, done: false }
];
const mapped = plan();
assert.deepStrictEqual(mapped.phoneCompletedSetIds, [warmPresc.setId]);
console.log('✓ só entradas concluídas mapeiam (aquecimento no bucket certo)');

console.log('wear_sync.test.js: OK (17 cenários, 80+ asserções)');
