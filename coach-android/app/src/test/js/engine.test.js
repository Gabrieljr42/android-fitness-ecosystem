'use strict';

const assert = require('node:assert/strict');
const engine = require('../../main/assets/www/js/engine.js');

function metric(key, value, unit, source = 'HEALTH_CONNECT') {
  return {
    key, value, unit, source, sourceRecordId: 'e:' + key,
    observedAtEpochMs: 1, status: 'OBSERVED', confidence: 1, contractVersion: 1
  };
}

function absent(key, unit) {
  return {
    key, value: null, unit, source: 'LOCAL_ESTIMATE', sourceRecordId: null,
    observedAtEpochMs: null, status: 'ABSENT', confidence: 0, contractVersion: 1
  };
}

function snapshot(overrides = {}) {
  return Object.assign({
    contractVersion: 1,
    logicalDate: '2026-08-23',
    zoneId: 'America/Sao_Paulo',
    createdAtEpochMs: 100,
    isDemo: false,
    hash: 'abc123',
    checkIn: null,
    metrics: {
      'recovery.sleepMinutes': absent('recovery.sleepMinutes', 'min'),
      'activity.steps': absent('activity.steps', 'count'),
      'recovery.restingHeartRate': absent('recovery.restingHeartRate', 'bpm'),
      'body.weightKg': absent('body.weightKg', 'kg')
    }
  }, overrides);
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('is deterministic and does not mutate its input', () => {
  const input = snapshot();
  const before = JSON.stringify(input);
  assert.deepEqual(engine.analyze(input), engine.analyze(input));
  assert.equal(JSON.stringify(input), before);
});

test('missing sleep is not interpreted as zero sleep', () => {
  const result = engine.analyze(snapshot());
  assert.equal(result.readiness.score, null);
  assert.equal(result.readiness.label, 'dados insuficientes');
  assert.equal(result.proposals[0].operation, 'maintain_plan');
});

test('steps are never treated as a running workout', () => {
  const input = snapshot();
  input.metrics['activity.steps'] = metric('activity.steps', 18000, 'count');
  const result = engine.analyze(input);
  assert.equal(result.dimensions.runningLoad.status, 'insufficient_data');
  assert.match(result.dimensions.runningLoad.message, /não são tratados como corrida/i);
});

test('poor sleep produces a conservative intervention', () => {
  const input = snapshot();
  input.metrics['recovery.sleepMinutes'] = metric('recovery.sleepMinutes', 260, 'min');
  const result = engine.analyze(input);
  assert.ok(result.readiness.score < 45);
  assert.equal(result.proposals[0].operation, 'reduce_set');
});

test('joint pain blocks aggressive progression', () => {
  const input = snapshot({ checkIn: {
    logicalDate: '2026-08-23', energy: 5, perceivedSleepQuality: 5, motivation: 5,
    soreness: {}, jointPainFlag: true, note: null, recordedAtEpochMs: 1,
    source: 'CHECK_IN', contractVersion: 1
  }});
  const result = engine.analyze(input);
  assert.equal(result.safety.aggressiveChangesBlocked, true);
  assert.equal(result.proposals[0].operation, 'safety_hold');
});

test('severe soreness blocks aggressive progression', () => {
  const input = snapshot({ checkIn: {
    logicalDate: '2026-08-23', energy: 5, perceivedSleepQuality: 5, motivation: 5,
    soreness: { QUADS: 'SEVERE' }, jointPainFlag: false, note: null, recordedAtEpochMs: 1,
    source: 'CHECK_IN', contractVersion: 1
  }});
  const result = engine.analyze(input);
  assert.equal(result.safety.aggressiveChangesBlocked, true);
  assert.match(result.safety.flags[0], /Quadríceps/);
});

test('running and fueling remain explicitly insufficient without their own records', () => {
  const result = engine.analyze(snapshot());
  assert.equal(result.dimensions.runningLoad.score, null);
  assert.equal(result.dimensions.fueling.score, null);
  assert.equal(result.dimensions.fueling.status, 'insufficient_data');
});

test('registered Evolução run is shown without converting steps', () => {
  const input = snapshot();
  input.metrics['activity.steps'] = metric('activity.steps', 18000, 'count');
  input.metrics['running.sessionCount'] = metric('running.sessionCount', 1, 'count', 'EVOLUCAO');
  input.metrics['running.distanceKm'] = metric('running.distanceKm', 8.24, 'km', 'EVOLUCAO');
  input.metrics['running.durationMinutes'] = metric('running.durationMinutes', 47, 'min', 'EVOLUCAO');
  const result = engine.analyze(input);
  assert.equal(result.dimensions.runningLoad.status, 'observed');
  assert.match(result.dimensions.runningLoad.message, /Evolução hoje: 1 corrida · 8,2 km · 47 min/);
});

test('NutriTrack aggregates are factual and keep the score null', () => {
  const input = snapshot();
  input.metrics['nutrition.mealCount'] = metric('nutrition.mealCount', 4, 'count', 'NUTRITRACK');
  input.metrics['nutrition.energyKcal'] = metric('nutrition.energyKcal', 1850, 'kcal', 'NUTRITRACK');
  input.metrics['nutrition.proteinG'] = metric('nutrition.proteinG', 132, 'g', 'NUTRITRACK');
  input.metrics['nutrition.waterMl'] = metric('nutrition.waterMl', 2000, 'ml', 'NUTRITRACK');
  input.metrics['nutrition.target.energyKcal'] = metric('nutrition.target.energyKcal', 2200, 'kcal', 'NUTRITRACK');
  input.metrics['nutrition.target.proteinG'] = metric('nutrition.target.proteinG', 150, 'g', 'NUTRITRACK');
  input.metrics['nutrition.target.waterMl'] = metric('nutrition.target.waterMl', 3000, 'ml', 'NUTRITRACK');
  const result = engine.analyze(input);
  assert.equal(result.dimensions.fueling.status, 'observed');
  assert.equal(result.dimensions.fueling.score, null);
  assert.equal(result.dimensions.fueling.isDMinusOne, false);
  assert.match(result.dimensions.fueling.message, /NutriTrack hoje: 1\.850\/2\.200 kcal/);
});

test('NutriTrack D-1 fallback is clearly identified in fuel card message', () => {
  const input = snapshot();
  // Logical date is 2026-08-23, but nutrition sourceRecordId is from 2026-08-22 (D-1)
  const d1Metric = (key, val, unit) => ({
    key, value: val, unit, source: 'NUTRITRACK', sourceRecordId: 'nutritrack:2026-08-22:' + key,
    observedAtEpochMs: 1, status: 'OBSERVED', confidence: 1, contractVersion: 1
  });
  input.metrics['nutrition.mealCount'] = d1Metric('nutrition.mealCount', 3, 'count');
  input.metrics['nutrition.energyKcal'] = d1Metric('nutrition.energyKcal', 2050, 'kcal');
  input.metrics['nutrition.proteinG'] = d1Metric('nutrition.proteinG', 145, 'g');
  input.metrics['nutrition.waterMl'] = d1Metric('nutrition.waterMl', 2400, 'ml');

  const result = engine.analyze(input);
  assert.equal(result.dimensions.fueling.status, 'observed');
  assert.equal(result.dimensions.fueling.isDMinusOne, true);
  assert.match(result.dimensions.fueling.message, /NutriTrack ontem \(D-1\): 2\.050 kcal · 145 g proteína · 2,4 L água/);
});

test('Scenario 6: Morning briefing with empty today nutrition displays D-1 totals as observed reference', () => {
  const morningSnapshot = snapshot({ logicalDate: '2026-08-27' });
  // D-1 nutrition from 2026-08-26
  morningSnapshot.metrics['nutrition.energyKcal'] = {
    key: 'nutrition.energyKcal', value: 2150, unit: 'kcal', source: 'NUTRITRACK',
    sourceRecordId: 'nutritrack:2026-08-26:nutrition.energyKcal',
    observedAtEpochMs: 1, status: 'OBSERVED', confidence: 1, contractVersion: 1, isDMinusOne: true
  };
  morningSnapshot.metrics['nutrition.proteinG'] = {
    key: 'nutrition.proteinG', value: 160, unit: 'g', source: 'NUTRITRACK',
    sourceRecordId: 'nutritrack:2026-08-26:nutrition.proteinG',
    observedAtEpochMs: 1, status: 'OBSERVED', confidence: 1, contractVersion: 1, isDMinusOne: true
  };

  const result = engine.analyze(morningSnapshot);
  assert.equal(result.dimensions.fueling.status, 'observed');
  assert.equal(result.dimensions.fueling.isDMinusOne, true);
  assert.match(result.dimensions.fueling.message, /NutriTrack ontem \(D-1\): 2\.150 kcal · 160 g proteína/);
});

test('readiness confidence stays below high without a personal baseline', () => {
  const input = snapshot({ checkIn: {
    logicalDate: '2026-08-23', energy: 5, perceivedSleepQuality: 5, motivation: 5,
    soreness: {}, jointPainFlag: false, note: null, recordedAtEpochMs: 1,
    source: 'CHECK_IN', contractVersion: 1
  }});
  input.metrics['recovery.sleepMinutes'] = metric('recovery.sleepMinutes', 480, 'min');
  const result = engine.analyze(input);
  assert.ok(result.readiness.confidence < 0.75);
  assert.equal(result.readiness.confidenceLabel, 'moderada');
});

test('absence of reported soreness is not presented as perfect muscle recovery', () => {
  const result = engine.analyze(snapshot({ checkIn: {
    logicalDate: '2026-08-23', energy: 3, perceivedSleepQuality: 3, motivation: 3,
    soreness: { QUADS: 'NONE' }, jointPainFlag: false, note: null, recordedAtEpochMs: 1,
    source: 'CHECK_IN', contractVersion: 1
  }}));
  const quads = result.dimensions.muscleReadiness.find(row => row.region === 'QUADS');
  assert.equal(quads.status, 'none');
  assert.equal(quads.score, null);
});

test('proposal copy does not invent evidence for a change', () => {
  const result = engine.analyze(snapshot());
  assert.equal(result.proposals[0].title, 'Manter o treino previsto');
  assert.match(result.proposals[0].reason, /não há evidência suficiente/i);
});

test('rejects malformed or incompatible input', () => {
  assert.throws(() => engine.analyze(null), /snapshot inválido/);
  assert.throws(() => engine.analyze(snapshot({ contractVersion: 2 })), /incompatível/);
});

let failures = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok - ' + name); }
  catch (error) { failures++; console.error('not ok - ' + name + '\n' + error.stack); }
}
console.log('\n' + tests.length + ' tests, ' + failures + ' failures');
process.exitCode = failures ? 1 : 0;
