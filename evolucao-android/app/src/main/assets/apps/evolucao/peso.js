/* apps/evolucao/peso.js — agregação canônica de peso corporal (diária/semanal)
   Semanas seguem o calendário local SEGUNDA→DOMINGO (mesma convenção do
   contador de treinos em logic.js.weekCount). Todas as datas são strings
   'YYYY-MM-DD' interpretadas no fuso LOCAL ('T00:00:00'), nunca UTC.

   Consumidores: views/progresso.js (aba Peso) e views/maratona.js
   (Peso médio da semana). NÃO duplicar esta lógica em outros módulos. */

var PESO_TREND_STABLE_KG = 0.15; // faixa considerada "estável"

function pesoIsoFromDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** Segunda-feira da semana da data informada (fuso local). */
function pesoWeekStartISO(iso) {
  var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  var dow = (d.getDay() + 6) % 7; // 0=segunda … 6=domingo
  d.setDate(d.getDate() - dow);
  return pesoIsoFromDate(d);
}

function pesoShiftWeek(iso, weeks) {
  var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + weeks * 7);
  return pesoIsoFromDate(d);
}

function pesoNormalize(list) {
  return (Array.isArray(list) ? list : [])
    .map(function(p) {
      var date = p && (p.date || p.data);
      var kg = p ? Number(p.kg != null ? p.kg : p.peso) : NaN;
      if (!date || !isFinite(kg)) return null;
      return { date: String(date).slice(0, 10), kg: kg };
    })
    .filter(Boolean);
}

/** Média POR DIA primeiro: vários registros no mesmo dia contam como um único
 *  dia na média semanal (evita viés de frequência de pesagem). */
function pesoDailyMeans(pesoList) {
  var norm = pesoNormalize(pesoList);
  var byDate = {};
  var order = [];
  norm.forEach(function(r) {
    if (!byDate[r.date]) { byDate[r.date] = { sum: 0, n: 0 }; order.push(r.date); }
    byDate[r.date].sum += r.kg;
    byDate[r.date].n += 1;
  });
  return order.sort().map(function(date) {
    var a = byDate[date];
    return { date: date, mean: Math.round((a.sum / a.n) * 100) / 100, samples: a.n };
  });
}

/** Série semanal ascendente: média da semana = média das médias diárias. */
function pesoWeeklySeries(pesoList) {
  var daily = pesoDailyMeans(pesoList);
  var byWeek = {};
  var weekOrder = [];
  daily.forEach(function(d) {
    var wk = pesoWeekStartISO(d.date);
    if (!wk) return;
    if (!byWeek[wk]) { byWeek[wk] = { sum: 0, days: 0, samples: 0 }; weekOrder.push(wk); }
    byWeek[wk].sum += d.mean;
    byWeek[wk].days += 1;
    byWeek[wk].samples += d.samples;
  });
  return weekOrder.sort().map(function(weekStart) {
    var w = byWeek[weekStart];
    return {
      weekStart: weekStart,
      avg: Math.round((w.sum / w.days) * 100) / 100,
      days: w.days,
      samples: w.samples,
      reliable: w.days >= 3 // ≤2 dias de pesagem = tendência menos confiável
    };
  });
}

/** Variação semana anterior → última (null se não houver semana anterior
 *  imediatamente contígua OU com dados). */
function pesoWeekDelta(series) {
  if (!Array.isArray(series) || series.length < 2) return null;
  var cur = series[series.length - 1];
  var prev = series[series.length - 2];
  var contiguous = pesoShiftWeek(cur.weekStart, -1) === prev.weekStart;
  var delta = Math.round((cur.avg - prev.avg) * 100) / 100;
  return {
    deltaKg: delta,
    pct: prev.avg ? Math.round((delta / prev.avg) * 1000) / 10 : null,
    contiguous: contiguous,
    reliable: !!(cur.reliable && prev.reliable)
  };
}

function pesoTrendLabel(deltaKg) {
  if (deltaKg == null || !isFinite(deltaKg)) return '';
  if (deltaKg > PESO_TREND_STABLE_KG) return 'subindo';
  if (deltaKg < -PESO_TREND_STABLE_KG) return 'caindo';
  return 'estável';
}

/** Resumo das últimas N semanas (padrão 4): primeira→última média e variação
 *  total. Retorna null quando não há pelo menos duas semanas. */
function pesoRecentTrend(series, weeks) {
  var n = Math.max(2, weeks || 4);
  if (!Array.isArray(series) || series.length < 2) return null;
  var slice = series.slice(-n);
  var first = slice[0], last = slice[slice.length - 1];
  return {
    weeks: slice.length,
    firstAvg: first.avg,
    lastAvg: last.avg,
    changeKg: Math.round((last.avg - first.avg) * 100) / 100,
    spanWeeks: Math.round((new Date(last.weekStart + 'T00:00:00') - new Date(first.weekStart + 'T00:00:00')) / (7 * 86400000)) + 1
  };
}

if (typeof window !== 'undefined') {
  window.pesoWeekStartISO = pesoWeekStartISO;
  window.pesoShiftWeek = pesoShiftWeek;
  window.pesoDailyMeans = pesoDailyMeans;
  window.pesoWeeklySeries = pesoWeeklySeries;
  window.pesoWeekDelta = pesoWeekDelta;
  window.pesoTrendLabel = pesoTrendLabel;
  window.pesoRecentTrend = pesoRecentTrend;
}
