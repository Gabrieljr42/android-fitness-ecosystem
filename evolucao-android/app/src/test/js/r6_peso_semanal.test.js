'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R6: TENDÊNCIA SEMANAL DE PESO (agregação canônica)        ===');
console.log('================================================================\n');

const ASSETS = path.resolve(__dirname, '../../main/assets');

function makeCtx() {
  const ctx = {
    console, Date, Math, JSON, String, Array, Object, Number, isFinite,
    window: {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ASSETS, 'apps/evolucao/peso.js'), 'utf8'), ctx);
  for (const k of Object.keys(ctx.window)) if (!(k in ctx)) ctx[k] = ctx.window[k];
  return ctx;
}

let passed = 0;
const ctx = makeCtx();

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 1: fronteiras de semana (segunda→domingo, local) ---');
{
  assert.strictEqual(ctx.pesoWeekStartISO('2026-08-17'), '2026-08-17', 'segunda = início');
  assert.strictEqual(ctx.pesoWeekStartISO('2026-08-23'), '2026-08-17', 'domingo cai na mesma semana');
  assert.strictEqual(ctx.pesoWeekStartISO('2026-08-24'), '2026-08-24', 'seguinte abre nova semana');
  assert.strictEqual(ctx.pesoShiftWeek('2026-08-24', -1), '2026-08-17', 'shift -1 semana');
  assert.strictEqual(ctx.pesoShiftWeek('2026-08-17', 1), '2026-08-24', 'shift +1 semana');
  console.log('OK seg/dom/seg+1 e deslocamentos.');
  passed += 5;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: múltiplas pesagens no mesmo dia → média diária ---');
{
  const input = [
    { date: '2026-08-17', kg: 64.0 },
    { date: '2026-08-17', kg: 64.2 },
    { date: '2026-08-17', kg: 64.1 }, // média do dia = 64.1
    { date: '2026-08-18', kg: 64.3 }
  ];
  const daily = ctx.pesoDailyMeans(input);
  assert.strictEqual(daily.length, 2);
  assert.strictEqual(daily[0].mean, 64.1, 'média diária de segunda (3 pesagens)');
  assert.strictEqual(daily[0].samples, 3);
  const weekly = ctx.pesoWeeklySeries(input);
  assert.strictEqual(weekly.length, 1);
  assert.strictEqual(weekly[0].avg, 64.2, 'semana = média das médias diárias ((64.1+64.3)/2), NÃO soma bruta');
  assert.strictEqual(weekly[0].days, 2, 'dois DIOS na média, não três registros');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(input)),
    [{ date: '2026-08-17', kg: 64.0 }, { date: '2026-08-17', kg: 64.2 }, { date: '2026-08-17', kg: 64.1 }, { date: '2026-08-18', kg: 64.3 }],
    'entrada original intocada (sem migração)');
  console.log('OK 3 pesagens de segunda valem 1 dia; entrada imutável.');
  passed += 6;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: variação semana a semana (sobe/desce/igual) ---');
{
  const up = ctx.pesoWeeklySeries([
    { date: '2026-08-10', kg: 63.9 }, { date: '2026-08-12', kg: 64.0 },   // sem A ≈ 63.95→64.0? média=(63.95)=63.95 arredondado 63.95→64.0? compute exact:
    { date: '2026-08-17', kg: 64.2 }
  ]);
  // semA: uma média diária (63.95); semB: 64.2 → delta=+0.25
  const dUp = ctx.pesoWeekDelta(up);
  assert(Math.abs(dUp.deltaKg - 0.25) < 1e-9, 'subida +0.25 (obtido ' + dUp.deltaKg + ')');
  assert.strictEqual(dUp.contiguous, true);

  const down = ctx.pesoWeeklySeries([
    { date: '2026-08-10', kg: 65.0 },
    { date: '2026-08-17', kg: 64.5 }
  ]);
  const dDown = ctx.pesoWeekDelta(down);
  assert.strictEqual(dDown.deltaKg, -0.5, 'queda −0.5');

  const flat = ctx.pesoWeeklySeries([
    { date: '2026-08-10', kg: 64.0 },
    { date: '2026-08-17', kg: 64.0 }
  ]);
  assert.strictEqual(ctx.pesoWeekDelta(flat).deltaKg, 0, 'peso igual → 0');
  assert.strictEqual(ctx.pesoTrendLabel(0.4), 'subindo');
  assert.strictEqual(ctx.pesoTrendLabel(-0.4), 'caindo');
  assert.strictEqual(ctx.pesoTrendLabel(0.05), 'estável');
  console.log('OK deltas (+/−/=) e rótulos de tendência com banda estável ±0,15 kg.');
  passed += 7;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: dados esparsos (honestidade) ---');
{
  assert.strictEqual(JSON.stringify(ctx.pesoWeeklySeries([])), '[]', 'vazio → série vazia');
  assert.strictEqual(ctx.pesoWeekDelta([]), null);
  assert.strictEqual(ctx.pesoWeekDelta([{ weekStart: '2026-08-17', avg: 64 }]), null, 'uma semana → sem delta');

  const single = ctx.pesoWeeklySeries([{ date: '2026-08-19', kg: 64.1 }]);
  assert.strictEqual(single.length, 1);
  assert.strictEqual(single[0].days, 1);
  assert.strictEqual(single[0].reliable, false, '1 pesagem marcada como pouco confiável');

  // Semana anterior pulada: contígua=false (UI mostra *)
  const skipped = ctx.pesoWeeklySeries([
    { date: '2026-07-27', kg: 63.0 },           // semana -3
    { date: '2026-08-17', kg: 64.0 }            // atual
  ]);
  const dSk = ctx.pesoWeekDelta(skipped);
  assert.strictEqual(dSk.contiguous, false, 'semana anterior ausente detectada');
  assert.strictEqual(dSk.deltaKg, 1.0);

  // Semana anterior inteira sem dados entre duas cheias
  const hole = ctx.pesoWeeklySeries([
    { date: '2026-08-03', kg: 63.0 },
    { date: '2026-08-17', kg: 64.0 }
  ]);
  assert.strictEqual(ctx.pesoWeekDelta(hole).contiguous, false);
  console.log('OK vazio/única/semana pulada sinalizados sem inventar dados.');
  passed += 8;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: histórico existente (formato antigo peso[]) ---');
{
  const legacy = [
    { date: '2026-06-01', kg: 62.5 },
    { date: '2026-06-02', kg: 62.7 },
    { date: '2026-06-03', kg: 62.6 },
    { date: '2026-06-08', kg: 63.0 },
    { date: '2026-06-09', kg: 63.1 }
  ];
  const series = ctx.pesoWeeklySeries(legacy);
  assert.strictEqual(series.length, 2);
  assert.strictEqual(series[0].weekStart, '2026-06-01');
  assert.strictEqual(series[0].avg, 62.6, 'média da 1ª semana');
  assert.strictEqual(series[1].avg, 63.05);
  const trend = ctx.pesoRecentTrend(series, 4);
  assert(trend && Math.abs(trend.changeKg - 0.45) < 1e-9, 'últimas 4 semanas: +0.45');
  assert.strictEqual(trend.spanWeeks, 2);
  console.log('OK formato legado {date,kg} funciona sem transformação.');
  passed += 4;
}

console.log('\n================================================================');
if (passed >= 30) {
  console.log(`ALL ${passed} WEEKLY-WEIGHT TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`Expected >= 30 markers, got ${passed}`);
  process.exit(1);
}
