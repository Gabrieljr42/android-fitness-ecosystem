/* apps/evolucao/views/maratona.js — Maratona BH 2027
   Plano = autoridade (maratonaplano.js). Executado = corridas[]. Estado do
   usuário em state.marathonState (associações/dor/notas) — nunca duplica
   histórico de corridas nem cálculo de peso (usa apps/evolucao/peso.js). */

var marView = 'semana';           // 'semana' | 'historico'
var marWeekNum = null;            // null = semana atual pela data

function _msEsc(s){ return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s); }
function _msKg(v){ return typeof nkg === 'function' ? nkg(v) : v; }

function maratonaState(){
  if (!state.marathonState || typeof state.marathonState !== 'object') {
    state.marathonState = { assoc: {}, pain: {}, notes: {} };
  }
  var ms = state.marathonState;
  if (!ms.assoc) ms.assoc = {};
  if (!ms.pain) ms.pain = {};
  if (!ms.notes) ms.notes = {};
  return ms;
}

function maratonaDayKeyFor(dateIso){
  var dow = new Date(dateIso + 'T00:00:00').getDay(); // 0=dom
  return ({2:'ter',4:'qui',6:'sab',0:'dom'})[dow] || null;
}

function maratonaRunsInWeek(planWeek){
  return (state.corridas || []).filter(function(c){
    var d = String((c && (c.date || c.data)) || '').slice(0,10);
    return d >= planWeek.start && d <= planWeek.end;
  }).sort(function(a,b){ return (a.date<b.date?-1:a.date>b.date?1:0); });
}

function renderMaratona(){
  ensureDraft();
  var todayIso = todayISO();
  var cur = maratonaWeekForDate(todayIso);
  var wk = marWeekNum ? maratonaWeekByNumber(marWeekNum) : cur;
  if (!wk) {
    // Antes do plano ou depois dele: ancora na 1ª/última e avisa
    var before = !cur && !marWeekNum && MARATONA_PLAN.length &&
      todayIso < MARATONA_PLAN[0].start;
    wk = before ? MARATONA_PLAN[0] : MARATONA_PLAN[MARATONA_PLAN.length - 1];
  }
  var isCurrent = cur && cur.week === wk.week;
  var isFuture = cur ? wk.week > cur.week : (todayIso < wk.start ? false : true);
  var futurePlanned = !cur || wk.week > cur.week;

  var ms = maratonaState();
  var wAssoc = ms.assoc[wk.week] || {};

  var actual = maratonaActualKm(state.corridas, wk);
  var adh = maratonaAdherence(actual, wk.targetKm);
  var diff = Math.round((actual - wk.targetKm) * 10) / 10;

  var h = '<div class="mf-dashboard-head"><div><span class="mf-eyebrow">' + _msEsc(MARATONA_META.name) + '</span>' +
    '<h1>Semana ' + wk.week + ' de ' + MARATONA_PLAN.length + '</h1>' +
    '<div class="sub">' + _msEsc(wk.phase) + ' · ' + fmtBRfull(wk.start) + ' – ' + fmtBRfull(wk.end) +
    (isCurrent ? ' · <b>semana atual</b>' : (futurePlanned ? ' · planejada' : ' · passada')) + '</div></div></div>';

  // Navegação de semanas
  h += '<div class="mf-qrow" style="grid-template-columns:auto 1fr auto;margin-bottom:10px">' +
    '<button class="mf-tool" id="marPrev" ' + (wk.week <= 1 ? 'disabled' : '') + '>‹ Anterior</button>' +
    '<button class="mf-tool" id="marToday"' + (isCurrent ? ' disabled' : '') + '>Ir para hoje</button>' +
    '<button class="mf-tool" id="marNext" ' + (wk.week >= MARATONA_PLAN.length ? 'disabled' : '') + '>Próxima ›</button></div>';

  h += '<div class="seg" style="margin-bottom:12px">' +
    '<button data-marview="semana" class="' + (marView === 'semana' ? 'on' : '') + '">Semana</button>' +
    '<button data-marview="historico" class="' + (marView === 'historico' ? 'on' : '') + '">Histórico</button></div>';

  if (marView === 'historico') return h + renderMaratonaHistorico();

  // ---- Status da semana ----
  var pctTxt = adh.pct == null ? '—' : adh.pct + '%';
  h += '<div class="stat" style="margin-bottom:12px"><div>' +
    '<div class="v">' + _msKg(actual) + '</div><div class="l">km realizados</div></div>' +
    '<div><div class="v">' + _msKg(wk.targetKm) + '</div><div class="l">km planejados</div></div>' +
    '<div><div class="v ' + (diff >= 0 ? 'pos' : 'neg') + '">' + (diff >= 0 ? '+' : '') + _msKg(diff) + '</div><div class="l">diferença</div></div></div>';
  h += '<div class="mf-metarow"><span class="mf-metachip ' +
    (adh.status === 'no plano' ? 'keep' : adh.status === 'abaixo' ? 'down' : adh.status === 'acima ⚠' ? 'up' : 'low') +
    '" title="Aderência = 100 − |pct−100|; exagerar também reduz a nota">' +
    pctTxt + ' da meta · aderência ' + (adh.score == null ? '—' : adh.score) + ' · ' + adh.status + '</span></div>';
  h += '<div class="hint" style="margin:8px 0 0">Não compense km perdidos — semanas leves são parte do plano.</div>';

  // ---- Sessões planejadas ----
  h += '<h2 style="margin-top:16px">Sessões da semana</h2><div class="card">';
  var days = [['ter','Terça'],['qui','Quinta'],['sab','Sábado'],['dom','Domingo / Longão']];
  var runsInWeek = maratonaRunsInWeek(wk);
  days.forEach(function(d){
    var txt = wk.sessions[d[0]];
    if (!txt) return;
    var chosen = (wAssoc.days && wAssoc.days[d[0]]) || '';
    h += '<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle)">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">' +
      '<b style="flex:1">' + _msEsc(txt) + '</b><span class="chip">' + d[1] + '</span></div>';
    if (runsInWeek.length) {
      h += '<select data-marassoc="' + d[0] + '" style="margin-top:6px;width:100%">' +
        '<option value="">— associar corrida (auto) —</option>' +
        runsInWeek.map(function(c){
          var cid = String(c.id);
          return '<option value="' + cid + '"' + (cid === chosen ? ' selected' : '') + '>' +
            fmtBRfull(String(c.date||c.data||'').slice(0,10)) + ' · ' + nkg(c.distanciaKm) + ' km</option>';
        }).join('') + '</select>';
    }
    h += '</div>';
  });
  if (!wk.sessions.ter && !wk.sessions.qui && !wk.sessions.sab && !wk.sessions.dom) {
    h += '<div class="empty"><div class="t">Sem sessões</div></div>';
  }
  h += '</div>';

  // ---- Longão ----
  var lr = maratonaLongRunInfo(state.corridas, wk, wAssoc);
  h += '<h2 style="margin-top:16px">Longão da semana</h2><div class="card">' +
    '<div class="stat"><div><div class="v">' + _msKg(lr.km) + '</div><div class="l">realizado</div></div>' +
    '<div><div class="v">' + _msKg(wk.longRunKm) + '</div><div class="l">alvo</div></div>' +
    '<div><div class="v ' + (lr.km >= wk.longRunKm ? 'pos' : 'neg') + '">' + (lr.km >= wk.longRunKm ? '✓' : '—') + '</div><div class="l">' +
    (lr.explicit ? 'associado' : (lr.suggestion ? 'sugerido' : 'nenhum')) + '</div></div></div>' +
    '<div class="hint" style="margin-top:8px">Longão é tempo em pé — esforço fácil, caminhar vale.</div></div>';

  // ---- Peso médio da semana (agregador canônico) ----
  var series = typeof pesoWeeklySeries === 'function' ? pesoWeeklySeries(state.peso) : [];
  var wSeries = series.filter(function(s){ return s.weekStart === wk.start; });
  var prevSeries = series.filter(function(s){ return s.weekStart === pesoShiftWeek(wk.start,-1); });
  h += '<h2 style="margin-top:16px">Peso médio da semana</h2><div class="card">' +
    (wSeries.length
      ? '<div class="stat"><div><div class="v">' + _msKg(wSeries[0].avg) + '</div><div class="l">kg (média)</div></div>' +
        '<div><div class="v" style="font-size:14px">' + wSeries[0].days + ' dia(s)</div><div class="l">de pesagem</div></div>' +
        '<div><div class="v" style="font-size:14px">' + (prevSeries.length ? ('vs ' + _msKg(prevSeries[0].avg)) : '—') + '</div><div class="l">sem. anterior</div></div></div>'
      : '<div class="empty"><div class="t">Sem pesagens nesta semana</div></div>') +
    '</div>';

  // ---- Dor + notas ----
  var pain = ms.pain[wk.start]; 
  h += '<h2 style="margin-top:16px">Dor &amp; observações</h2><div class="card">' +
    '<label>Dor máxima da semana (0–10)</label><div class="row">' +
    '<input id="marPain" type="number" min="0" max="10" step="1" style="width:90px" value="' + (pain == null ? '' : pain) + '" placeholder="0–10"/>' +
    '<span class="small" style="align-self:center;color:' + (pain >= 4 ? 'var(--danger,#ff6b6b)' : 'var(--mut)') + '">' +
    (pain == null ? '' : pain >= 7 ? '⚠ dor alta — reduza/avalie' : pain >= 4 ? 'atenção à passada' : 'ok') + '</span></div>' +
    '<label style="margin-top:10px">Observações da semana</label>' +
    '<textarea id="marNotes" rows="2" maxlength="500" placeholder="Como foi a semana?">' + _msEsc(ms.notes[wk.start] || '') + '</textarea>' +
    '<button class="cta sm" id="marSaveWk" style="margin-top:10px;width:100%">Salvar dor &amp; notas</button>' +
    '<div class="hint" style="margin-top:8px">Dor que altera a passada ou persiste: reduza e avalie.</div></div>';

  // ---- Checkpoints ----
  var nextCp = MARATONA_META.checkpoints.find(function(c){ return c.week >= wk.week && c.week < MARATONA_META.totalWeeks + 1; }) ||
               MARATONA_META.checkpoints[MARATONA_META.checkpoints.length - 1];
  var cpDone = ms.checkpoints && ms.checkpoints[wk.week];
  var weeksToCp = nextCp ? nextCp.week - wk.week : null;
  h += '<h2 style="margin-top:16px">Checkpoint</h2><div class="card">' +
    '<div class="mf-metarow"><span class="mf-metachip keep">Próximo: ' + _msEsc(nextCp.label) + '</span></div>' +
    '<div class="hint" style="margin:8px 0 0">Semana ' + nextCp.week + ' — faltam ' + Math.max(0, weeksToCp) + ' semana(s).' +
    (cpDone ? ' Confirmado por você ✓' : '') + '</div>' +
    (weeksToCp === 0 && !cpDone ? '<button class="cta sm" id="marCpConfirm" style="margin-top:8px;width:100%">Confirmar checkpoint desta semana</button>' : '') +
    '<div class="hint" style="margin-top:6px">Checkpoint só é confirmado por você — não basta um treino longo.</div></div>';

  // ---- Foco + força ----
  h += '<h2 style="margin-top:16px">Foco &amp; força</h2><div class="card">' +
    '<div class="small" style="color:var(--mut)">Foco da semana</div><div style="margin-bottom:8px">' + _msEsc(wk.focus) + '</div>' +
    '<div class="small" style="color:var(--mut)">Força sugerida</div><div>' + _msEsc(wk.strength) + '</div></div>';

  // ---- Regras do plano (Guia) ----
  h += '<details style="margin-top:12px"><summary style="cursor:pointer;color:var(--mut)">Regras do projeto (planilha)</summary><div class="card" style="margin-top:8px">' +
    MARATONA_META.rules.map(function(r){ return '<div style="padding:5px 0;border-bottom:1px solid var(--border-subtle)"><b>' + _msEsc(r.tema) + '</b> — ' + _msEsc(r.regra) + '</div>'; }).join('') +
    '<div class="hint" style="margin-top:8px">' + _msEsc(MARATONA_META.objective) + '</div></div></details>';

  return h;
}

function renderMaratonaHistorico(){
  var cur = maratonaWeekForDate(todayISO());
  var h = '';

  // Gráfico 1: volume semanal planejado x realizado
  h += '<h2>Volume semanal — planejado × realizado</h2><div class="card">';
  var maxKm = Math.max.apply(null, MARATONA_PLAN.map(function(w){ return Math.max(w.targetKm, maratonaActualKm(state.corridas, w)); }).concat([1]));
  MARATONA_PLAN.forEach(function(w){
    var act = maratonaActualKm(state.corridas, w);
    var isNow = cur && cur.week === w.week;
    h += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0' + (isNow ? ';background:rgba(255,255,255,.06)' : '') + '" title="S' + w.week + ': ' + act + '/' + w.targetKm + ' km">' +
      '<span class="small" style="width:26px;color:var(--mut)">S' + w.week + '</span>' +
      '<div style="flex:1;height:9px;background:var(--card2,#202024);border-radius:5px;position:relative">' +
      '<i style="position:absolute;left:0;top:0;bottom:0;width:' + Math.min(100, w.targetKm / maxKm * 100) + '%;border:1px solid rgba(255,255,255,.35);border-radius:5px"></i>' +
      '<i style="position:absolute;left:0;top:1px;bottom:1px;width:' + Math.min(100, act / maxKm * 100) + '%;background:#ffffff;border-radius:4px"></i></div>' +
      '<span class="small" style="width:74px;text-align:right">' + act + '/' + w.targetKm + '</span></div>';
  });
  h += '<div class="hint" style="margin-top:8px">Barra branca = realizado; contorno = planejado.</div></div>';

  // Gráfico 2: longão planejado × realizado
  h += '<h2 style="margin-top:14px">Progressão do longão</h2><div class="card">';
  var maxLR = Math.max.apply(null, MARATONA_PLAN.map(function(w){ return w.longRunKm; }).concat([1]));
  MARATONA_PLAN.forEach(function(w){
    var lr = maratonaLongRunInfo(state.corridas, w, (state.marathonState||{}).assoc ? state.marathonState.assoc[w.week] : null);
    h += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0">' +
      '<span class="small" style="width:26px;color:var(--mut)">S' + w.week + '</span>' +
      '<div style="flex:1;height:8px;background:var(--card2,#202024);border-radius:5px;position:relative">' +
      '<i style="position:absolute;left:0;top:0;bottom:0;width:' + Math.min(100, w.longRunKm / maxLR * 100) + '%;border:1px solid rgba(255,255,255,.3);border-radius:5px"></i>' +
      '<i style="position:absolute;left:0;top:1px;bottom:1px;width:' + Math.min(100, lr.km / maxLR * 100) + '%;background:#a1a1aa;border-radius:4px"></i></div>' +
      '<span class="small" style="width:84px;text-align:right">' + lr.km + '/' + w.longRunKm + ' km</span></div>';
  });
  h += '</div>';

  // Gráfico 3: acumulado
  h += '<h2 style="margin-top:14px">Distância acumulada</h2><div class="card">';
  var cum = maratonaCumulative(state.corridas);
  var doneRows = cum.filter(function(r){ return r.actualKm > 0 || r.plannedKm > 0; });
  if (typeof chartSVG === 'function' && cum.length > 1) {
    h += chartSVG(cum.map(function(r){ return { x: 'S' + r.week, y: r.plannedKm }; }), '#71717a');
    if (doneRows.some(function(r){ return r.actualKm > 0; })) {
      h += chartSVG(cum.map(function(r){ return { x: 'S' + r.week, y: r.actualKm }; }), '#ffffff');
    }
    var lastRow = cum[cum.length - 1];
    h += '<div class="sub" style="margin:8px 0 0">Planejado total: <b>' + lastRow.plannedKm + ' km</b> · Realizado até agora: <b>' +
      (cum.reduce(function(a,r){ return a + r.actualKm; }, 0)).toFixed(1) + ' km</b></div>';
  } else {
    h += '<div class="empty"><div class="t">Gráfico indisponível</div></div>';
  }
  h += '</div>';

  // Gráfico 4: tendência de aderência (somente semanas já ocorridas)
  h += '<h2 style="margin-top:14px">Aderência por semana</h2><div class="card">';
  var past = MARATONA_PLAN.filter(function(w){ return !cur || w.week <= cur.week; });
  if (!past.length) {
    h += '<div class="empty"><div class="t">O plano ainda não começou</div></div>';
  } else {
    past.slice(-12).forEach(function(w){
      var a = maratonaActualKm(state.corridas, w);
      var ad = maratonaAdherence(a, w.targetKm);
      h += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0">' +
        '<span class="small" style="width:26px;color:var(--mut)">S' + w.week + '</span>' +
        '<div style="flex:1;height:8px;background:var(--card2,#202024);border-radius:5px">' +
        '<i style="display:block;height:100%;width:' + (ad.score == null ? 0 : ad.score) + '%;background:' +
        (ad.status === 'no plano' ? '#4ade80' : ad.status === 'próximo' ? '#eab308' : ad.status === 'acima ⚠' ? '#f97316' : '#ef4444') +
        ';border-radius:5px"></i></div>' +
        '<span class="small" style="width:86px;text-align:right">' + (ad.pct == null ? '—' : ad.pct + '% · ' + ad.status.split(' ')[0]) + '</span></div>';
    });
    h += '<div class="hint" style="margin-top:8px">Aderência = 100 − |pct − 100|. Passar 40% do volume vale menos que bater a meta.</div>';
  }
  h += '</div>';
  return h;
}

function bindMaratona(){
  var prev = document.getElementById('marPrev');
  if (prev) prev.onclick = function(){ if (marWeekNum == null) { var c = maratonaWeekForDate(todayISO()); marWeekNum = c ? c.week : MARATONA_PLAN.length; } if (marWeekNum > 1) { marWeekNum--; render(); } };
  var next = document.getElementById('marNext');
  if (next) next.onclick = function(){ if (marWeekNum == null) { var c = maratonaWeekForDate(todayISO()); marWeekNum = c ? c.week : 1; } if (marWeekNum < MARATONA_PLAN.length) { marWeekNum++; render(); } };
  var todayBtn = document.getElementById('marToday');
  if (todayBtn) todayBtn.onclick = function(){ marWeekNum = null; render(); };

  document.querySelectorAll('[data-marview]').forEach(function(b){
    b.onclick = function(){ marView = b.getAttribute('data-marview'); render(); };
  });

  var d = state.draft;
  document.querySelectorAll('[data-marassoc]').forEach(function(sel){
    sel.onchange = function(){
      var day = sel.getAttribute('data-marassoc');
      var wkN = (marWeekNum != null) ? marWeekNum : (maratonaWeekForDate(todayISO()) || MARATONA_PLAN[0]).week;
      var ms = maratonaState();
      if (!ms.assoc[wkN]) ms.assoc[wkN] = {};
      if (!ms.assoc[wkN].days) ms.assoc[wkN].days = {};
      ms.assoc[wkN].days[day] = sel.value || '';
      save(); toast('Associação salva'); vibrate(10);
    };
  });

  var saveWk = document.getElementById('marSaveWk');
  if (saveWk) saveWk.onclick = function(){
    var startIso = (marWeekNum ? maratonaWeekByNumber(marWeekNum) : maratonaWeekForDate(todayISO()) || MARATONA_PLAN[0]).start;
    var painEl = document.getElementById('marPain');
    var notesEl = document.getElementById('marNotes');
    var ms = maratonaState();
    var p = painEl && painEl.value !== '' ? Math.max(0, Math.min(10, parseInt(painEl.value, 10))) : null;
    if (p == null) delete ms.pain[startIso]; else ms.pain[startIso] = p;
    ms.notes[startIso] = notesEl ? String(notesEl.value || '').slice(0, 500) : '';
    save(); toast('Semana salva'); vibrate(15); render();
  };

  var cpBtn = document.getElementById('marCpConfirm');
  if (cpBtn) cpBtn.onclick = function(){
    var wk = marWeekNum ? maratonaWeekByNumber(marWeekNum) : maratonaWeekForDate(todayISO());
    if (!wk) return;
    dlg({ title: 'Confirmar checkpoint', sub: wk.label || '', ok: 'Confirmar',
      onOk: function(){
        var ms = maratonaState();
        if (!ms.checkpoints) ms.checkpoints = {};
        ms.checkpoints[wk.week] = true;
        save(); toast('Checkpoint confirmado ✓'); render();
      }});
  };
}
