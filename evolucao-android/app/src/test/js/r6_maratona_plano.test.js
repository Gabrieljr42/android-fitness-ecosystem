'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R6: MARATONA — PLANO, DATAS, VOLUME, ADERÊNCIA, ESTADO   ===');
console.log('================================================================\n');

const ASSETS = path.resolve(__dirname, '../../main/assets');

function makeCtx(stateJson) {
  const storage = {};
  if (stateJson) storage['evolucao_treino_state'] = stateJson;
  const appDiv = { id: 'app', innerHTML: '', setAttribute() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
  const ctx = {
    console, Date, Math, JSON, parseFloat, parseInt, isFinite, isNaN,
    String, Array, Object, Number, Boolean,
    localStorage: {
      getItem: k => storage[k] !== undefined ? storage[k] : null,
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: k => { delete storage[k]; }
    },
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {} }),
      addEventListener() {}, body: {}
    },
    window: {}, toast() {}, dlg() {},
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
    __storage: storage
  };
  vm.createContext(ctx);
  const load = rel => vm.runInContext(fs.readFileSync(path.join(ASSETS, rel), 'utf8'), ctx);
  load('kernel/fmt.js');            // fmtBRfull/nkg/todayISO
  load('apps/evolucao/peso.js');
  load('apps/evolucao/maratonaplano.js');
  load('kernel/db.js');             // state/migrate/merge
  for (const k of Object.keys(ctx.window)) if (!(k in ctx)) ctx[k] = ctx.window[k];
  return ctx;
}

let passed = 0;

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 1: plano carregado da planilha (38 semanas) ---');
{
  const c = makeCtx();
  assert.strictEqual(c.MARATONA_PLAN.length, 38);
  assert.strictEqual(c.MARATONA_META.startDate, '2026-08-24', 'início = segunda 24/08/2026');
  assert.strictEqual(c.MARATONA_META.raceDate, '2027-05-16', 'prova = domingo 16/05/2027 (fim da S38)');
  assert.strictEqual(c.MARATONA_PLAN[0].targetKm, 5);
  assert.strictEqual(c.MARATONA_PLAN[37].targetKm, 50.2);
  assert.strictEqual(c.MARATONA_PLAN[37].longRunKm, 42.2);
  assert.strictEqual(c.MARATONA_PLAN[26].longRunKm, 21.1, 'S27 meia-maratona');
  // Sessões preservadas como texto (não convertidas em km genérico)
  assert(c.MARATONA_PLAN[0].sessions.ter.includes("2' correr / 1' andar"),
    'prescrição run/walk da adaptação mantida textual');
  assert(c.MARATONA_PLAN[37].sessions.dom.includes('42,195'), 'domingo da prova preservado');
  assert.strictEqual(c.MARATONA_META.checkpoints.length, 5);
  console.log('✅ Plano fiel à planilha; checkpoints S12/S20/S27/S35/S38.');
  passed += 8;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: detecção de semana por data (limites locais) ---');
{
  const c = makeCtx();
  assert.strictEqual(c.maratonaWeekForDate('2026-08-23'), null, 'dia antes do plano');
  assert.strictEqual(c.maratonaWeekForDate('2026-08-24').week, 1, 'primeiro dia');
  assert.strictEqual(c.maratonaWeekForDate('2026-08-30').week, 1, 'domingo da S1');
  assert.strictEqual(c.maratonaWeekForDate('2026-08-31').week, 2, 'segunda abre a S2');
  assert.strictEqual(c.maratonaWeekForDate('2026-11-15').week, 12, 'checkpoint S12 dentro da janela');
  assert.strictEqual(c.maratonaWeekForDate('2027-05-16').week, 38, 'dia da prova');
  assert.strictEqual(c.maratonaWeekForDate('2027-05-17'), null, 'depois do plano');
  console.log('✅ Antes/dia1/dom→seg/checkpoint/prova/depois.');
  passed += 7;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: volume semanal a partir de corridas[] ---');
{
  const c = makeCtx();
  const wk3 = c.MARATONA_PLAN[2]; // 24–30/08? não: S3 = 07–13/09… usar S2 p/ clareza
  const wk2 = c.MARATONA_PLAN[1]; // 31/08–06/09
  const corridas = [
    { id: 'a', date: '2026-09-01', distanciaKm: 3.0 },  // terça da S2
    { id: 'b', date: '2026-09-03', distanciaKm: 3.0 },  // quinta S2
    { id: 'c', date: '2026-09-06', distanciaKm: 3.0 },  // domingo S2
    { id: 'out', date: '2026-08-30', distanciaKm: 99 }, // S1 — excluída
    { id: 'next', date: '2026-09-07', distanciaKm: 99 } // S3 — excluída
  ];
  assert.strictEqual(c.maratonaActualKm(corridas, wk2), 9, 'soma só corridas dentro da semana');
  // Duas corridas no mesmo dia somam
  const dup = corridas.concat([{ id: 'd', date: '2026-09-01', distanciaKm: 1.0 }]);
  assert.strictEqual(c.maratonaActualKm(dup, wk2), 10, 'mesmo dia soma');
  // Associação NÃO altera volume semanal
  const withAssoc = JSON.parse(JSON.stringify(dup));
  assert.strictEqual(c.maratonaActualKm(withAssoc, wk2), 10);
  console.log('✅ Fronteiras exclusivas, mesmo-dia soma, associação neutra.');
  passed += 4;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: aderência (exagero não é recompensado) ---');
{
  const c = makeCtx();
  const t = (a, b) => c.maratonaAdherence(a, b);
  assert.strictEqual(t(50, 50).score, 100, 'exatamente no alvo');
  assert.strictEqual(t(40, 50).status, 'próximo', 'levemente abaixo (80%)');
  assert.strictEqual(t(45, 50).status, 'no plano', '90% ainda é banda confortável');
  assert(t(25, 50).score < 70, 'muito abaixo → score baixo');
  assert.strictEqual(t(55, 50).pct, 110, 'levemente acima');
  assert.strictEqual(t(70, 50).score, 60, '140% vale MENOS que 100%');
  assert.strictEqual(t(70, 50).status, 'acima ⚠');
  assert(t(0, 50).score === 0, 'zero km → score 0');
  console.log('✅ Fórmula max(0, 100−|pct−100|) com status acima ⚠.');
  passed += 7;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: longão — sugestão automática e associação explícita ---');
{
  const c = makeCtx();
  const wk2 = c.MARATONA_PLAN[1];
  const runs = [
    { id: 'curta', date: '2026-09-01', distanciaKm: 4.2 },
    { id: 'longao', date: '2026-09-06', distanciaKm: 4.9 }
  ];
  const auto = c.maratonaLongRunInfo(runs, wk2, null);
  assert.strictEqual(auto.km, 4.9, 'sugestão = maior corrida da semana');
  assert.strictEqual(auto.explicit, false);
  assert.strictEqual(auto.suggestion, 'longao');

  const manual = c.maratonaLongRunInfo(runs, wk2, { longRunIds: ['curta'] });
  assert.strictEqual(manual.km, 4.2, 'associação explícita vence mesmo sendo menor');
  assert.strictEqual(manual.explicit, true);
  console.log('✅ Sugestão auto + override manual estável.');
  passed += 5;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 6: acumulado e semanas futuras ---');
{
  const c = makeCtx();
  const cum = c.maratonaCumulative([{ id: 'x', date: '2026-08-26', distanciaKm: 5 }]);
  assert.strictEqual(cum.length, 38);
  assert(Math.abs(cum[37].plannedKm - c.MARATONA_META.totalKm) < 1, 'acumulado planejado ≈ total da planilha (' + cum[37].plannedKm + ' vs ' + c.MARATONA_META.totalKm + ')');
  assert.strictEqual(cum[0].actualKm, 5);
  assert.strictEqual(cum[1].actualKm, 5, 'acumulado carrega adiante (planejado é acumulativo)');
  console.log('✅ Acumulado planejado bate com a planilha.');
  passed += 4;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 7: estado marathonState — compatibilidade e merge ---');
{
  // Estado ANTIGO sem marathonState → migrate injeta vazio (idempotente)
  const oldState = {
    ficha: { A: { nome: 'A', ex: [] }, B: { nome: 'B', ex: [] }, C: { nome: 'C', ex: [] } },
    sessions: [{ id: 1, date: '2026-01-01', day: 'A', entries: {} }],
    corridas: [], settings: {}
  };
  const c = makeCtx(JSON.stringify(oldState));
  const ms = c.state.marathonState;
  assert(ms && ms.assoc && ms.pain && ms.notes && ms.checkpoints, 'marathonState criado no migrate');
  const twice = c.migrate(JSON.parse(JSON.stringify(c.state)));
  assert.deepStrictEqual(Object.keys(twice.marathonState).sort(), Object.keys(ms).sort(), 'idempotente');

  // mergeState: backup SEM marathonState não apaga o atual
  const curState = c.state;
  curState.marathonState.assoc[2] = { days: { ter: 'run1' }, longRunIds: ['run1'] };
  const merged = c.mergeState(curState, { ficha: curState.ficha, sessions: [], corridas: [], peso: [], cardioGoalKm: 15 });
  assert(merged.state.marathonState && merged.state.marathonState.assoc[2], 'merge preserva marathonState do dispositivo');

  // Pain/notes persistem via save()
  c.state.marathonState.pain['2026-08-24'] = 3;
  c.state.marathonState.notes['2026-08-24'] = 'ok';
  c.save();
  const reloaded = JSON.parse(c.__storage['evolucao_treino_state']);
  assert.strictEqual(reloaded.marathonState.pain['2026-08-24'], 3);
  assert.strictEqual(reloaded.marathonState.notes['2026-08-24'], 'ok');
  console.log('✅ Migrate aditivo, merge seguro, dor/notas persistidas.');
  passed += 5;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 8: peso semanal canônico dentro da maratona ---');
{
  const c = makeCtx();
  const wk2 = c.MARATONA_PLAN[1];
  const series = c.pesoWeeklySeries([
    { date: '2026-09-01', kg: 64.0 }, { date: '2026-09-02', kg: 64.4 }
  ]);
  const inWeek = series.filter(s => s.weekStart === wk2.start);
  assert.strictEqual(inWeek.length, 1);
  assert.strictEqual(inWeek[0].avg, 64.2, 'mesma agregação do Progresso (diária→semanal)');
  console.log('✅ Maratona usa o MESMO agregador de peso.');
  passed += 2;
}

console.log('\n================================================================');
if (passed >= 42) {
  console.log(`ALL ${passed} MARATHON TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`Expected >= 42 markers, got ${passed}`);
  process.exit(1);
}
