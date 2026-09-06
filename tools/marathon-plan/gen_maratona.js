'use strict';
/* Gera evolucao-android/app/src/main/assets/apps/evolucao/maratonaplano.js
   a partir do JSON extraído do xlsx.
   Fonte autoritativa: Plano_Maratona_BH_2027.xlsx (aba Plano Semanal +
   Visão Geral + Guia). Executar a partir da raiz: node tools/marathon-plan/gen_maratona.js */
const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'maratona_plan_raw.json'), 'utf8'));

// Excel serial → ISO (epoch 1899-12-30, UTC para estabilidade da conversão;
// a data resultante é tratada como data de calendário local depois)
function serialToISO(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

const weekly = raw['Plano Semanal'];
const weeks = [];
for (const r of weekly) {
  if (!r || !r.cells) continue;
  const c = r.cells;
  if (!c || typeof c[0] !== 'number') continue; // cabeçalho/linha vazia
  weeks.push({
    week: c[0],
    start: serialToISO(c[1]),
    end: serialToISO(c[2]),
    phase: String(c[3] || ''),
    targetKm: c[4],
    longRunKm: c[5],
    runsPerWeek: c[6],
    sessions: { ter: String(c[7] || ''), qui: String(c[8] || ''), sab: String(c[9] || ''), dom: String(c[10] || '') },
    focus: String(c[11] || ''),
    strength: String(c[12] || '')
  });
}
weeks.sort((a, b) => a.week - b.week);
if (weeks.length !== 38) { console.error('Esperava 38 semanas, obtive ' + weeks.length); process.exit(1); }

const ov = raw['Visão Geral'];
function ovCell(row, col) { const r = ov.find(x => x && x.row === row); return r ? r.cells[col] : null; }
const meta = {
  name: String(ovCell(2, 0) || 'PROJETO 42K'),
  raceDate: serialToISO(ovCell(6, 1)),
  startDate: serialToISO(ovCell(7, 1)),
  totalWeeks: ovCell(8, 1),
  objective: String(ovCell(9, 1) || ''),
  totalKm: ovCell(10, 1),
  peakWeekKm: ovCell(11, 1),
  longestLongRunKm: ovCell(12, 1),
  howToRead: String(ovCell(15, 0) || ''),
  checkpoints: [],
  rules: []
};
for (let row = 6; row <= 10; row++) {
  const wk = ovCell(row, 3), desc = ovCell(row, 4);
  if (wk && desc) meta.checkpoints.push({ week: Number(String(wk).replace(/\D/g, '')), label: String(desc) });
}
const guia = raw['Guia'] || [];
for (const r of guia) {
  if (!r || !r.cells) continue;
  const tema = r.cells[0], regra = r.cells[1];
  if (tema && regra && tema !== 'Tema') meta.rules.push({ tema: String(tema), regra: String(regra) });
}

const js = `/* apps/evolucao/maratonaplano.js — PLANO AUTORITATIVO da Maratona BH 2027.
   GERADO a partir de Plano_Maratona_BH_2027.xlsx (não editar à mão; regenere
   com tools/marathon-plan/gen_maratona.js). Datas em ISO local (segunda→domingo). */

var MARATONA_META = ${JSON.stringify(meta, null, 1)};

var MARATONA_PLAN = ${JSON.stringify(weeks, null, 1)};

/* ---------- helpers (usam apenas o plano acima + corridas[]) ---------- */

/** Semana do plano que contém a data ISO (limites inclusivos, fuso local). */
function maratonaWeekForDate(iso) {
  var d = String(iso || '').slice(0, 10);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(d)) return null;
  for (var i = 0; i < MARATONA_PLAN.length; i++) {
    if (d >= MARATONA_PLAN[i].start && d <= MARATONA_PLAN[i].end) return MARATONA_PLAN[i];
  }
  return null;
}

function maratonaWeekByNumber(n) {
  for (var i = 0; i < MARATONA_PLAN.length; i++) if (MARATONA_PLAN[i].week === n) return MARATONA_PLAN[i];
  return null;
}

/** Volume real (km) das corridas registradas dentro da semana do plano. */
function maratonaActualKm(corridas, planWeek) {
  var total = 0;
  (Array.isArray(corridas) ? corridas : []).forEach(function(c) {
    var d = String((c && (c.date || c.data)) || '').slice(0, 10);
    if (d >= planWeek.start && d <= planWeek.end) {
      var km = Number(c.distanciaKm);
      if (isFinite(km) && km > 0) total += km;
    }
  });
  return Math.round(total * 10) / 10;
}

/** Longão realizado na semana: associação explícita vence; sem associação,
 *  sugere a maior corrida da semana. */
function maratonaLongRunInfo(corridas, planWeek, assoc) {
  var inWeek = (Array.isArray(corridas) ? corridas : []).filter(function(c) {
    var d = String((c && (c.date || c.data)) || '').slice(0, 10);
    return d >= planWeek.start && d <= planWeek.end && isFinite(Number(c.distanciaKm));
  });
  var explicit = null;
  if (assoc && Array.isArray(assoc.longRunIds)) {
    for (var i = 0; i < inWeek.length; i++) {
      if (assoc.longRunIds.indexOf(String(inWeek[i].id)) >= 0) { explicit = inWeek[i]; break; }
    }
  }
  var best = null;
  inWeek.forEach(function(c) {
    if (!best || Number(c.distanciaKm) > Number(best.distanciaKm)) best = c;
  });
  var chosen = explicit || best;
  return {
    explicit: !!explicit,
    run: chosen,
    km: chosen ? Math.round(Number(chosen.distanciaKm) * 10) / 10 : 0,
    suggestion: !explicit && best ? String(best.id) : null
  };
}

/** Aderência: 100% no alvo; desvios PARA QUALQUER lado reduzem a nota.
 *  score = max(0, 100 − |pct−100|). 140% do volume NÃO é "melhor" que 100%.
 *  Status: >=90 'no plano' · 70–89 'próximo' · <70 'abaixo' · pct>120 'acima ⚠'. */
function maratonaAdherence(actualKm, targetKm) {
  if (!(targetKm > 0)) return { pct: null, score: null, status: 'sem meta' };
  var pct = Math.round((actualKm / targetKm) * 100);
  var score = Math.max(0, 100 - Math.abs(pct - 100));
  var status;
  if (pct > 120) status = 'acima ⚠';
  else if (score >= 90) status = 'no plano';
  else if (score >= 70) status = 'próximo';
  else status = 'abaixo';
  return { pct: pct, score: score, status: status };
}

function maratonaCumulative(corridas) {
  var planned = 0, actual = 0;
  var rows = MARATONA_PLAN.map(function(w) {
    planned += w.targetKm;
    var act = maratonaActualKm(corridas, w);
    actual += act;
    return { week: w.week, plannedKm: Math.round(planned * 10) / 10, actualKm: Math.round(actual * 10) / 10 };
  });
  return rows;
}

var api = {
  MARATONA_META: MARATONA_META,
  MARATONA_PLAN: MARATONA_PLAN,
  maratonaWeekForDate: maratonaWeekForDate,
  maratonaWeekByNumber: maratonaWeekByNumber,
  maratonaActualKm: maratonaActualKm,
  maratonaLongRunInfo: maratonaLongRunInfo,
  maratonaAdherence: maratonaAdherence,
  maratonaCumulative: maratonaCumulative
};

if (typeof window !== 'undefined') {
  window.MARATONA_META = MARATONA_META;
  window.MARATONA_PLAN = MARATONA_PLAN;
  window.maratonaWeekForDate = maratonaWeekForDate;
  window.maratonaWeekByNumber = maratonaWeekByNumber;
  window.maratonaActualKm = maratonaActualKm;
  window.maratonaLongRunInfo = maratonaLongRunInfo;
  window.maratonaAdherence = maratonaAdherence;
  window.maratonaCumulative = maratonaCumulative;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
`;
// Nota: a cauda acima (objeto api + guard window + export Node) reproduz o
// arquivo canônico byte a byte — o export Node é dependência viva de
// strava.test.js via require(). Não remover.

const out = path.resolve(__dirname, '..', '..', 'evolucao-android', 'app', 'src', 'main', 'assets', 'apps', 'evolucao', 'maratonaplano.js');
fs.writeFileSync(out, js, 'utf8');
console.log('Gerado:', out, '(' + weeks.length + ' semanas)');
console.log('Início:', meta.startDate, '· Prova:', meta.raceDate, '· Checkpoints:', meta.checkpoints.map(c => 'S' + c.week).join(','));
console.log('Semana 1:', JSON.stringify(weeks[0]).slice(0, 200));
console.log('Semana 38:', JSON.stringify(weeks[37]).slice(0, 200));
