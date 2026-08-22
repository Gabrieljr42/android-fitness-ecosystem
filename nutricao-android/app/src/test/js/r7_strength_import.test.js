'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R7: IMPORTAÇÃO EVOLUÇÃO — MUSCULAÇÃO NÃO DESAPARECE      ===');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Replica FIELMENTE a saída de WorkoutProvider.java (tipo musculacao, campos
// derivados w/r→cargaKg/repeticoes, sets newest-first, warmups incluídos).
function providerPayload(date, sessions) {
  return {
    schemaVersion: 1,
    source: 'com.evolucao.treino',
    date,
    generatedAt: '2026-08-22T21:00:00.000Z',
    sessions
  };
}

// Forma real do normalizeStrength para um treino A com 2 exercícios
function javaStrength(date, opts = {}) {
  return {
    tipo: 'musculacao',
    type: 'musculacao',
    nome: opts.nome || (opts.day ? ('Treino ' + opts.day) : 'Treino'),
    name: opts.nome || (opts.day ? ('Treino ' + opts.day) : 'Treino'),
    dia: opts.day || '',
    duration: 3600,
    duracaoSeg: 3600,
    exercicios: [
      {
        nome: 'Supino reto c/ halteres',
        series: [ // newest-first (iteração reversa do Java)
          { serie: 3, repeticoes: 10, reps: 10, cargaKg: 30, carga: 30, rir: 2, concluida: true },
          { serie: 2, repeticoes: 10, reps: 10, cargaKg: 30, carga: 30, rir: 2, concluida: true },
          { serie: 1, repeticoes: 8, reps: 8, cargaKg: 27.5, carga: 27.5, rir: 3, aquecimento: true, concluida: true }
        ]
      },
      {
        nome: 'Voador',
        series: [
          { serie: 3, repeticoes: 12, reps: 12, cargaKg: 45, carga: 45, rir: 2, concluida: true }
        ]
      }
    ],
    notas: 'Supino reto c/ halteres: bom ritmo'
  };
}

function javaRun(date, km) {
  return {
    tipo: 'corrida',
    type: 'corrida',
    nome: 'Corrida',
    name: 'Corrida',
    distanciaKm: km,
    duracaoSeg: 1500,
    duration: 1500,
    ritmoMedioSegKm: Math.round(1500 / km),
    paceMinKm: +(1500 / km / 60).toFixed(2),
    velocidadeMediaKmh: +(km / (1500 / 3600)).toFixed(2),
    calorias: Math.round(km * 70)
  };
}

const ASSETS = path.resolve(__dirname, '../../main/assets');

function makeCtx(bridgeRaw, todayStr) {
  const byId = {};
  ['evolucaoWorkoutStatus', 'textoAtividade'].forEach(id => { byId[id] = { value: '', innerHTML: '' }; });
  const win = {};
  const ctx = {
    console, Date, Math, JSON, parseFloat, parseInt, isFinite, isNaN,
    String, Array, Object, Number, Boolean,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    document: {
      querySelector: sel => (typeof sel === 'string' && sel.startsWith('#')) ? (byId[sel.slice(1)] || null) : null,
      querySelectorAll: () => [],
      getElementById: id => byId[id] || null,
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {} }),
      addEventListener() {}, body: {}
    },
    window: win,
    $: sel => (typeof sel === 'string' && sel.startsWith('#')) ? (byId[sel.slice(1)] || null) : null,
    $$: () => [],
    toast() {},
    openModal() {}, closeModal() {},
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    __today: todayStr || '2026-08-22'
  };
  vm.createContext(ctx);
  // hoje() controlável p/ cenário cross-midnight
  vm.runInContext(`function today(){ return __today; }`, ctx);
  vm.runInContext(fs.readFileSync(path.join(ASSETS, 'apps/nutricao/estado.js'), 'utf8'), ctx);
  // estado.js redefine today via localDateStr — restaurar override APÓS load
  vm.runInContext('__today = ' + JSON.stringify(ctx.__today) + '; function today(){ return __today; }', ctx);
  vm.runInContext(fs.readFileSync(path.join(ASSETS, 'core/gemini.js'), 'utf8'), ctx);
  for (const k of Object.keys(win)) if (!(k in ctx)) ctx[k] = win[k];
  ctx.window.AndroidBridge = { getEvolucaoWorkout: () => bridgeRaw === undefined ? null : bridgeRaw };
  ctx.AndroidBridge = ctx.window.AndroidBridge;
  return { ctx, byId };
}

let passed = 0;

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 1: somente musculação é encontrada e rotulada ---');
{
  const payload = providerPayload('2026-08-22', [javaStrength('2026-08-22', { day: 'A' })]);
  const h = makeCtx(JSON.stringify(payload));
  h.ctx.__evolucaoWorkoutResult = h.ctx.getEvolucaoWorkout(h.ctx.today());
  const r = h.ctx.__evolucaoWorkoutResult;
  assert(r.ok, 'normalize aceita payload real do provider: ' + JSON.stringify(r.error || {}));
  assert.strictEqual(r.payload.sessions.length, 1);
  assert.strictEqual(r.payload.sessions[0].tipo, 'musculacao');
  assert.strictEqual(r.payload.sessions[0].exercicios.length, 2);
  assert.strictEqual(r.payload.sessions[0].exercicios[0].series.length, 3);
  assert.strictEqual(r.payload.sessions[0].exercicios[0].series[2].aquecimento, true, 'warmup preservado');
  assert(Number.isFinite(r.payload.sessions[0].exercicios[0].series[0].cargaKg));
  const summary = h.ctx.evolucaoWorkoutSummary(r);
  assert(summary.includes('Treino importado'), 'summary positivo');
  assert(/Treino A · 2 exercício/.test(summary), 'rótulo mostra exercícios (não "A" seco): ' + summary.slice(0, 140));
  assert(summary.includes('60 min'), 'duração visível');
  console.log('✅ strength-only: normaliza, resume "Treino A · 2 exercícios · 60 min".');
  passed += 8;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: dia misto — força E corrida no mesmo payload ---');
{
  const payload = providerPayload('2026-08-22', [
    javaRun('2026-08-22', 4.2),
    javaStrength('2026-08-22', { day: 'B' })
  ]);
  const h = makeCtx(JSON.stringify(payload));
  const r = h.ctx.getEvolucaoWorkout(h.ctx.today());
  assert(r.ok);
  assert.strictEqual(r.payload.sessions.length, 2);
  const tipos = r.payload.sessions.map(s => s.tipo).sort();
  assert.deepStrictEqual(tipos, ['corrida', 'musculacao'], 'ambos os tipos coexistem');
  const promptBody = h.ctx.apiBodyAtividade('', { id: 'test-model', label: 'Test', thinkingLevel: 'low' }, { peso: 75 }, r.payload);
  const txt = JSON.stringify(promptBody);
  // prompt embutido sofre escape do stringify externo — checar chaves/valores
  assert(txt.includes('distanciaKm') && txt.includes('4.2'), 'corrida presente no prompt');
  assert(txt.includes('cargaKg'), 'força presente no prompt');
  const summary = h.ctx.evolucaoWorkoutSummary(r);
  assert(/Corrida/.test(summary) && /Treino B/.test(summary), 'summary lista ambos: ' + summary.slice(0, 160));
  console.log('✅ mixed: nenhum tipo suprime o outro.');
  passed += 5;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: corrida-only segue funcionando ---');
{
  const payload = providerPayload('2026-08-22', [javaRun('2026-08-22', 6)]);
  const h = makeCtx(JSON.stringify(payload));
  const r = h.ctx.getEvolucaoWorkout(h.ctx.today());
  assert(r.ok && r.payload.sessions[0].tipo === 'corrida');
  assert(Number(r.payload.sessions[0].distanciaKm) === 6);
  console.log('✅ corrida-only intacto.');
  passed += 2;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: sem atividade → erro honesto ---');
{
  let h = makeCtx(JSON.stringify(providerPayload('2026-08-22', [])));
  let r = h.ctx.getEvolucaoWorkout(h.ctx.today());
  assert(!r.ok && r.error.code === 'EMPTY_WORKOUT');

  h = makeCtx(undefined);
  r = h.ctx.getEvolucaoWorkout(h.ctx.today());
  assert(!r.ok, 'bridge null → erro tratado');
  console.log('✅ neither: EMPTY_WORKOUT / bridge indisponível.');
  passed += 3;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: cross-midnight — finishedAt resgata treino ---');
{
  // Rascunho aberto em 21/08 e finalizado após meia-noite:
  // session.date=2026-08-21, finishedAt=2026-08-22.
  const s = javaStrength('2026-08-21', { day: 'C' });
  s.date = '2026-08-21';
  s.finishedAt = '2026-08-22';
  const payloadOld = providerPayload('2026-08-21', [s]);
  const h = makeCtx(JSON.stringify(payloadOld), '2026-08-22'); // consulta HOJE
  let r = h.ctx.getEvolucaoWorkout(h.ctx.today());
  assert(!r.ok, 'provider antigo filtra só por date → invisível (motiva o fix)');
  // Provider NOVO casa por date OU finishedAt (replicando o fix Java):
  const payloadNew = { schemaVersion: 1, source: 'com.evolucao.treino', date: '2026-08-22',
    generatedAt: 'x', sessions: [Object.assign({}, s)] };
  const h2 = makeCtx(JSON.stringify(payloadNew), '2026-08-22');
  r = h2.ctx.getEvolucaoWorkout(h2.ctx.today());
  assert(r.ok, 'finishedAt faz o treino aparecer hoje');
  assert.strictEqual(r.payload.sessions[0].tipo, 'musculacao');
  console.log('✅ finishedAt resolve o caso "treino que passou da meia-noite".');
  passed += 4;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 6: fixture legada do teste de bridge atualizada p/ forma REAL ---');
{
  // Garante que a forma canônica (tipo musculacao + rir minúsculo + cargaKg
  // derivados) passa pelo mesmo caminho usado antes com fixture idealizada.
  const s = javaStrength('2026-08-22', { day: 'A' });
  delete s.notas; // notas ausentes são válidas
  const h = makeCtx(JSON.stringify(providerPayload('2026-08-22', [s])));
  const r = h.ctx.getEvolucaoWorkout(h.ctx.today());
  assert(r.ok);
  assert(!JSON.stringify(r.payload).includes('"notas"'));
  console.log('✅ contrato real (sem notas) normaliza limpo.');
  passed += 2;
}

console.log('\n================================================================');
if (passed >= 24) {
  console.log(`ALL ${passed} STRENGTH-IMPORT TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`Expected >= 24 markers, got ${passed}`);
  process.exit(1);
}
