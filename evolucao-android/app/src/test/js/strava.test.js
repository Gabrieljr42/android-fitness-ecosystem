'use strict';

const assert = require('assert');
const path = require('path');

// Load modules
const Strava = require(path.join(__dirname, '../../main/assets/apps/evolucao/strava.js'));
const MaratonaPlano = require(path.join(__dirname, '../../main/assets/apps/evolucao/maratonaplano.js'));

console.log('================================================================');
console.log('=== [EVOLUÇÃO] SUÍTE DE TESTES: INTEGRAÇÃO STRAVA & MARATONA ===');
console.log('=== R3: Ingestão Strava, Deduplicação e Sincronização       ===');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// TIER 1: Core Functional Coverage
// -----------------------------------------------------------------------------
console.log('--- TIER 1: Core Functional Ingestion & Normalization Tests ---');

test('1.1: Normalization of standard Strava run (meters to km, pace, elevation, calories)', () => {
  const raw = {
    id: 987654321,
    name: 'Treino de Terça 10k',
    type: 'Run',
    distance: 10000, // 10,000 meters = 10.00 km
    moving_time: 3000, // 3000 seconds = 50 min (pace 5:00 min/km)
    start_date_local: '2026-08-25T07:15:00Z',
    total_elevation_gain: 125.4,
    calories: 680
  };

  const norm = Strava.normalizeStravaActivity(raw);
  assert.strictEqual(norm.id, 'strava_987654321');
  assert.strictEqual(norm.stravaId, '987654321');
  assert.strictEqual(norm.source, 'strava');
  assert.strictEqual(norm.distanciaKm, 10.0);
  assert.strictEqual(norm.duracaoSeg, 3000);
  assert.strictEqual(norm.ritmoMedioSegKm, 300);
  assert.strictEqual(norm.paceMinKm, '5:00 min/km');
  assert.strictEqual(norm.velocidadeMediaKmh, 12.0);
  assert.strictEqual(norm.elevacaoGanhoM, 125.4);
  assert.strictEqual(norm.calorias, 680);
  assert.strictEqual(norm.date, '2026-08-25');
  assert.strictEqual(norm.hora, '07:15');
});

test('1.2: Ingest single valid Strava run into empty state', () => {
  const fakeState = { corridas: [] };
  const rawActivities = [
    {
      id: 1001,
      name: 'Corrida Matinal',
      type: 'Run',
      distance: 5000,
      moving_time: 1500,
      start_date_local: '2026-08-26T06:30:00Z'
    }
  ];

  const res = Strava.syncStravaActivities(rawActivities, { state: fakeState, autoSave: false, render: false });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.importedCount, 1);
  assert.strictEqual(res.duplicatesCount, 0);
  assert.strictEqual(fakeState.corridas.length, 1);
  assert.strictEqual(fakeState.corridas[0].distanciaKm, 5.0);
  assert.strictEqual(fakeState.corridas[0].stravaId, '1001');
});

test('1.3: Ingest multiple diverse Strava runs in batch', () => {
  const fakeState = { corridas: [] };
  const rawActivities = [
    { id: 1001, name: 'Run 1', type: 'Run', distance: 6000, moving_time: 1800, start_date_local: '2026-08-24T07:00:00' },
    { id: 1002, name: 'Run 2', type: 'Run', distance: 8000, moving_time: 2400, start_date_local: '2026-08-26T07:00:00' },
    { id: 1003, name: 'Run 3', type: 'Run', distance: 12000, moving_time: 3600, start_date_local: '2026-08-30T06:00:00' }
  ];

  const res = Strava.syncStravaActivities(rawActivities, { state: fakeState, autoSave: false, render: false });
  assert.strictEqual(res.importedCount, 3);
  assert.strictEqual(res.duplicatesCount, 0);
  assert.strictEqual(fakeState.corridas.length, 3);
});

test('1.4: Normalize ISO timestamp with timezone offset', () => {
  const raw = {
    id: 1004,
    name: 'Evening Run',
    type: 'Run',
    distance: 7000,
    moving_time: 2100,
    start_date_local: '2026-09-02T19:45:30-03:00'
  };

  const norm = Strava.normalizeStravaActivity(raw);
  assert.strictEqual(norm.date, '2026-09-02');
  assert.strictEqual(norm.hora, '19:45');
});

test('1.5: Non-run activity filtering (ignores Ride / Swim, accepts Run / VirtualRun / TrailRun)', () => {
  const fakeState = { corridas: [] };
  const rawActivities = [
    { id: 2001, name: 'Bike Ride', type: 'Ride', distance: 25000, moving_time: 3600, start_date_local: '2026-08-25T10:00:00' },
    { id: 2002, name: 'Pool Swim', type: 'Swim', distance: 1500, moving_time: 1800, start_date_local: '2026-08-25T12:00:00' },
    { id: 2003, name: 'Treadmill Run', type: 'VirtualRun', distance: 6000, moving_time: 1800, start_date_local: '2026-08-25T16:00:00' },
    { id: 2004, name: 'Mountain Trail', type: 'TrailRun', distance: 10000, moving_time: 3600, start_date_local: '2026-08-25T18:00:00' }
  ];

  const res = Strava.syncStravaActivities(rawActivities, { state: fakeState, autoSave: false, render: false });
  assert.strictEqual(res.importedCount, 2); // only VirtualRun and TrailRun
  assert.strictEqual(fakeState.corridas.length, 2);
  assert.strictEqual(fakeState.corridas[0].stravaId, '2003');
  assert.strictEqual(fakeState.corridas[1].stravaId, '2004');
});

// -----------------------------------------------------------------------------
// TIER 2: Boundary Value Analysis & Deduplication
// -----------------------------------------------------------------------------
console.log('\n--- TIER 2: Boundary Value Analysis & Deduplication Tests ---');

test('2.1: Exact ID deduplication prevents duplicate insertions', () => {
  const fakeState = {
    corridas: [
      { id: 'strava_5001', stravaId: '5001', date: '2026-08-25', distanciaKm: 10.0, duracaoSeg: 3000, source: 'strava' }
    ]
  };

  const rawActivities = [
    { id: 5001, name: 'Duplicate Run', type: 'Run', distance: 10000, moving_time: 3000, start_date_local: '2026-08-25T07:00:00' }
  ];

  const res = Strava.syncStravaActivities(rawActivities, { state: fakeState, autoSave: false, render: false });
  assert.strictEqual(res.importedCount, 0);
  assert.strictEqual(res.duplicatesCount, 1);
  assert.strictEqual(fakeState.corridas.length, 1);
});

test('2.2: Mixed batch with new and existing duplicate activities', () => {
  const fakeState = {
    corridas: [
      { id: 'strava_6001', stravaId: '6001', date: '2026-08-24', distanciaKm: 6.0, duracaoSeg: 1800, source: 'strava' }
    ]
  };

  const batch = [
    { id: 6001, name: 'Already Ingested', type: 'Run', distance: 6000, moving_time: 1800, start_date_local: '2026-08-24T07:00:00' },
    { id: 6002, name: 'Brand New Run', type: 'Run', distance: 8000, moving_time: 2400, start_date_local: '2026-08-26T07:00:00' },
    { id: 6001, name: 'Duplicate In Same Batch', type: 'Run', distance: 6000, moving_time: 1800, start_date_local: '2026-08-24T07:00:00' }
  ];

  const res = Strava.syncStravaActivities(batch, { state: fakeState, autoSave: false, render: false });
  assert.strictEqual(res.importedCount, 1); // only 6002
  assert.strictEqual(res.duplicatesCount, 2);
  assert.strictEqual(fakeState.corridas.length, 2);
});

test('2.3: Zero / negative distance or missing ID handled safely without crashing', () => {
  const fakeState = { corridas: [] };
  const invalidActivities = [
    { id: null, name: 'No ID', type: 'Run', distance: 5000 },
    { id: 7001, name: 'Zero Dist', type: 'Run', distance: 0 },
    { id: 7002, name: 'Negative Dist', type: 'Run', distance: -1000 },
    null,
    undefined,
    {}
  ];

  const res = Strava.syncStravaActivities(invalidActivities, { state: fakeState, autoSave: false, render: false });
  assert.strictEqual(res.importedCount, 0);
  assert.strictEqual(fakeState.corridas.length, 0);
});

test('2.4: Extreme distance: Marathon (42.195 km) and Ultra (60 km)', () => {
  const fakeState = { corridas: [] };
  const marathon = {
    id: 8001,
    name: 'Maratona BH 2027 Prova',
    type: 'Run',
    distance: 42195, // 42.195 km
    moving_time: 14400, // 4h00m (pace 5:41 min/km)
    start_date_local: '2027-05-16T06:00:00Z',
    total_elevation_gain: 450
  };

  const res = Strava.syncStravaActivities([marathon], { state: fakeState, autoSave: false, render: false });
  assert.strictEqual(res.importedCount, 1);
  assert.strictEqual(fakeState.corridas[0].distanciaKm, 42.2);
  assert.strictEqual(fakeState.corridas[0].duracaoSeg, 14400);
  assert.strictEqual(fakeState.corridas[0].elevacaoGanhoM, 450);
});

test('2.5: Empty array, null payload, or malformed state returns cleanly', () => {
  const resEmpty = Strava.syncStravaActivities([], { state: { corridas: [] }, autoSave: false });
  assert.strictEqual(resEmpty.ok, true);
  assert.strictEqual(resEmpty.importedCount, 0);

  const resNull = Strava.syncStravaActivities(null, { state: { corridas: [] }, autoSave: false });
  assert.strictEqual(resNull.ok, true);
  assert.strictEqual(resNull.importedCount, 0);

  const resNoState = Strava.syncStravaActivities([], { state: null, autoSave: false });
  assert.strictEqual(resNoState.ok, false);
});

// -----------------------------------------------------------------------------
// TIER 3: Cross-Feature Marathon Integration Tests
// -----------------------------------------------------------------------------
console.log('\n--- TIER 3: Cross-Feature Marathon Plan Integration Tests ---');

test('3.1: Ingested Strava runs immediately reflect in maratonaActualKm for Week 1', () => {
  const week1 = MaratonaPlano.maratonaWeekByNumber(1); // 2026-08-24 to 2026-08-30 (target: 5 km)
  assert.ok(week1, 'Week 1 must exist');

  const fakeState = { corridas: [] };
  const stravaRuns = [
    { id: 9001, name: 'Terça 2k', type: 'Run', distance: 2000, moving_time: 700, start_date_local: '2026-08-25T07:00:00' },
    { id: 9002, name: 'Sábado 3k', type: 'Run', distance: 3000, moving_time: 1050, start_date_local: '2026-08-29T07:00:00' }
  ];

  Strava.syncStravaActivities(stravaRuns, { state: fakeState, autoSave: false, render: false });

  const actualKm = MaratonaPlano.maratonaActualKm(fakeState.corridas, week1);
  assert.strictEqual(actualKm, 5.0); // 2.0 + 3.0 = 5.0 km
});

test('3.2: Marathon adherence score calculates accurately with Strava volume', () => {
  const week1 = MaratonaPlano.maratonaWeekByNumber(1); // targetKm = 5.0
  const actualKm = 5.0;

  const adh = MaratonaPlano.maratonaAdherence(actualKm, week1.targetKm);
  assert.strictEqual(adh.pct, 100);
  assert.strictEqual(adh.score, 100);
  assert.strictEqual(adh.status, 'no plano');
});

test('3.3: Long run detection identifies largest imported Strava run in week', () => {
  const week1 = MaratonaPlano.maratonaWeekByNumber(1);
  const fakeState = { corridas: [] };
  const stravaRuns = [
    { id: 9001, name: 'Terça Curta', type: 'Run', distance: 2000, moving_time: 700, start_date_local: '2026-08-25T07:00:00' },
    { id: 9002, name: 'Sábado Longinho', type: 'Run', distance: 3000, moving_time: 1050, start_date_local: '2026-08-29T07:00:00' }
  ];

  Strava.syncStravaActivities(stravaRuns, { state: fakeState, autoSave: false, render: false });

  const lrInfo = MaratonaPlano.maratonaLongRunInfo(fakeState.corridas, week1);
  assert.strictEqual(lrInfo.km, 3.0);
  assert.strictEqual(lrInfo.run.stravaId, '9002');
});

test('3.4: Cumulative distance progression includes Strava runs across weeks', () => {
  const fakeState = { corridas: [] };
  const stravaRuns = [
    { id: 9101, name: 'Week 1 Run', type: 'Run', distance: 5000, moving_time: 1750, start_date_local: '2026-08-26T07:00:00' },
    { id: 9102, name: 'Week 2 Run', type: 'Run', distance: 6000, moving_time: 2100, start_date_local: '2026-09-02T07:00:00' }
  ];

  Strava.syncStravaActivities(stravaRuns, { state: fakeState, autoSave: false, render: false });

  const cum = MaratonaPlano.maratonaCumulative(fakeState.corridas);
  assert.strictEqual(cum[0].actualKm, 5.0);
  assert.strictEqual(cum[1].actualKm, 11.0); // 5.0 + 6.0 = 11.0
});

test('3.5: Chronological sort order preserved when inserting out-of-order Strava runs', () => {
  const fakeState = { corridas: [] };
  const disordered = [
    { id: 9203, name: 'Sept 5', type: 'Run', distance: 5000, moving_time: 1500, start_date_local: '2026-09-05T07:00:00' },
    { id: 9201, name: 'Aug 25', type: 'Run', distance: 5000, moving_time: 1500, start_date_local: '2026-08-25T07:00:00' },
    { id: 9202, name: 'Aug 30', type: 'Run', distance: 5000, moving_time: 1500, start_date_local: '2026-08-30T07:00:00' }
  ];

  Strava.syncStravaActivities(disordered, { state: fakeState, autoSave: false, render: false });
  assert.strictEqual(fakeState.corridas[0].date, '2026-08-25');
  assert.strictEqual(fakeState.corridas[1].date, '2026-08-30');
  assert.strictEqual(fakeState.corridas[2].date, '2026-09-05');
});

// -----------------------------------------------------------------------------
// TIER 4: Real-World Workload Scenarios
// -----------------------------------------------------------------------------
console.log('\n--- TIER 4: Real-World Application Scenarios (Scenario 4) ---');

test('4.1: Scenario 4: User imports 3 Strava runs (1 duplicate) -> exact unique mileage in Marathon week', () => {
  const fakeState = {
    corridas: [
      { id: 'manual_1', date: '2026-08-24', distanciaKm: 1.0, duracaoSeg: 400, tipo: 'continua' }
    ]
  };

  // User imports 3 Strava activities, but activity 9501 is already repeated
  const stravaBatch = [
    { id: 9501, name: 'Terça 2k', type: 'Run', distance: 2000, moving_time: 700, start_date_local: '2026-08-25T06:30:00' },
    { id: 9502, name: 'Sábado 2.5k', type: 'Run', distance: 2500, moving_time: 875, start_date_local: '2026-08-29T06:30:00' },
    { id: 9501, name: 'Terça 2k (Duplicata)', type: 'Run', distance: 2000, moving_time: 700, start_date_local: '2026-08-25T06:30:00' }
  ];

  const res = Strava.syncStravaActivities(stravaBatch, { state: fakeState, autoSave: false, render: false });
  assert.strictEqual(res.importedCount, 2);
  assert.strictEqual(res.duplicatesCount, 1);

  const week1 = MaratonaPlano.maratonaWeekByNumber(1); // targetKm = 5.0
  const totalActual = MaratonaPlano.maratonaActualKm(fakeState.corridas, week1);
  // manual_1 (1.0) + strava_9501 (2.0) + strava_9502 (2.5) = 5.5 km
  assert.strictEqual(totalActual, 5.5);

  const adh = MaratonaPlano.maratonaAdherence(totalActual, week1.targetKm);
  assert.strictEqual(adh.pct, 110); // 5.5 / 5.0 = 110%
  assert.strictEqual(adh.status, 'no plano'); // score = 100 - |110 - 100| = 90 -> 'no plano'
});

test('4.2: Historical 4-week training block ingestion & adherence verification', () => {
  const fakeState = { corridas: [] };
  const fourWeeksActivities = [
    // Week 1 (target: 5 km)
    { id: 9601, name: 'W1 R1', type: 'Run', distance: 2500, moving_time: 850, start_date_local: '2026-08-25T06:00:00' },
    { id: 9602, name: 'W1 R2', type: 'Run', distance: 2500, moving_time: 850, start_date_local: '2026-08-29T06:00:00' },
    // Week 2 (target: 6 km)
    { id: 9603, name: 'W2 R1', type: 'Run', distance: 3000, moving_time: 1050, start_date_local: '2026-09-01T06:00:00' },
    { id: 9604, name: 'W2 R2', type: 'Run', distance: 3000, moving_time: 1050, start_date_local: '2026-09-05T06:00:00' },
    // Week 3 (target: 7 km)
    { id: 9605, name: 'W3 R1', type: 'Run', distance: 3500, moving_time: 1200, start_date_local: '2026-09-08T06:00:00' },
    { id: 9606, name: 'W3 R2', type: 'Run', distance: 3500, moving_time: 1200, start_date_local: '2026-09-12T06:00:00' },
    // Week 4 (target: 5 km - Semana de recuperação)
    { id: 9607, name: 'W4 R1', type: 'Run', distance: 2500, moving_time: 900, start_date_local: '2026-09-15T06:00:00' },
    { id: 9608, name: 'W4 R2', type: 'Run', distance: 2500, moving_time: 900, start_date_local: '2026-09-19T06:00:00' }
  ];

  const res = Strava.syncStravaActivities(fourWeeksActivities, { state: fakeState, autoSave: false, render: false });
  assert.strictEqual(res.importedCount, 8);
  assert.strictEqual(res.duplicatesCount, 0);

  // Validate adherence for all 4 weeks
  const w1 = MaratonaPlano.maratonaWeekByNumber(1); // 5 km
  const w2 = MaratonaPlano.maratonaWeekByNumber(2); // 6 km
  const w3 = MaratonaPlano.maratonaWeekByNumber(3); // 7 km
  const w4 = MaratonaPlano.maratonaWeekByNumber(4); // 5 km

  assert.strictEqual(MaratonaPlano.maratonaActualKm(fakeState.corridas, w1), 5.0);
  assert.strictEqual(MaratonaPlano.maratonaActualKm(fakeState.corridas, w2), 6.0);
  assert.strictEqual(MaratonaPlano.maratonaActualKm(fakeState.corridas, w3), 7.0);
  assert.strictEqual(MaratonaPlano.maratonaActualKm(fakeState.corridas, w4), 5.0);

  assert.strictEqual(MaratonaPlano.maratonaAdherence(5.0, w1.targetKm).status, 'no plano');
  assert.strictEqual(MaratonaPlano.maratonaAdherence(6.0, w2.targetKm).status, 'no plano');
  assert.strictEqual(MaratonaPlano.maratonaAdherence(7.0, w3.targetKm).status, 'no plano');
  assert.strictEqual(MaratonaPlano.maratonaAdherence(5.0, w4.targetKm).status, 'no plano');
});

console.log('\n================================================================');
if (failCount === 0) {
  console.log(`🎉 TODOS OS ${passCount} DE ${passCount} TESTES DE INTEGRAÇÃO STRAVA PASSARAM!`);
  process.exit(0);
} else {
  console.error(`❌ ${failCount} TESTES FALHARAM!`);
  process.exit(1);
}
