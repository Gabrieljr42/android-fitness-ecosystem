/* apps/evolucao/views/corrida.js — Aba de Corrida, Modos Contínuo e Intervalado, Timer e Gráficos */

/* ==========================================================================
   Estado e Variáveis do Módulo de Corrida
   ========================================================================== */
var corridaMode = 'continua'; // 'continua' | 'intervalada'
var corridaChartTab = 'distancia'; // 'distancia' | 'pace'
var lastDeletedCorrida = null;

// Rascunho / Valores padrão dos formulários
var draftCorridaForm = {
  // Modo Contínuo
  continua: {
    distanciaKm: 5.0,
    duracaoMin: 30,
    duracaoSec: 0,
    data: null,
    notas: ''
  },
  // Modo Intervalado
  intervalada: {
    tiroMin: 1,
    tiroSec: 0,
    tiroKmh: 9.0,
    recupMin: 1,
    recupSec: 0,
    recupKmh: 3.0,
    ciclos: 8,
    warmupMin: 0,
    warmupSec: 0,
    warmupKmh: 5.0,
    cooldownMin: 0,
    cooldownSec: 0,
    cooldownKmh: 4.0,
    data: null,
    notas: ''
  }
};

// Temporizador Interativo de Intervalos (Live Interval Runner)
var liveIntervalRunner = {
  active: false,
  paused: false,
  currentPhaseIdx: 0,
  secondsLeft: 0,
  totalElapsed: 0,
  phases: [],
  timerId: null,
  config: null
};

/* ==========================================================================
   Funções de Cálculo Matemático e Formatação
   ========================================================================== */

/**
 * Obtém o peso mais recente do usuário (kg) para cálculo de gasto calórico.
 */
function getLatestWeight(){
  if(typeof state !== 'undefined' && state && state.peso && state.peso.length){
    var sorted = state.peso.slice().sort(function(a,b){ return a.date < b.date ? -1 : 1; });
    var latest = sorted[sorted.length - 1];
    if(latest && latest.kg && Number(latest.kg) > 0) return Number(latest.kg);
  }
  return 75;
}

/**
 * Calcula o pace em segundos por quilômetro a partir da distância e tempo.
 */
function calcPaceSec(distKm, tempoSeg){
  var d = parseFloat(distKm), t = parseFloat(tempoSeg);
  if(!d || isNaN(d) || d <= 0 || !t || isNaN(t) || t <= 0) return 0;
  return t / d;
}

/**
 * Formata o pace em "M:SS min/km".
 */
function fmtPace(paceSec){
  if(!isFinite(paceSec) || paceSec <= 0) return '--:-- min/km';
  var s = Math.round(paceSec);
  var m = Math.floor(s / 60);
  var sec = s % 60;
  return m + ':' + String(sec).padStart(2, '0') + ' min/km';
}

/**
 * Calcula a velocidade média em km/h.
 */
function calcSpeedKmh(distKm, tempoSeg){
  var d = parseFloat(distKm), t = parseFloat(tempoSeg);
  if(!d || isNaN(d) || d <= 0 || !t || isNaN(t) || t <= 0) return 0;
  return (d * 3600) / t;
}

/**
 * Estima o gasto calórico aproximado (kcal = Peso * Distância * 1.036).
 */
function calcCaloriesBurned(distKm, tempoSeg, weight){
  var d = parseFloat(distKm) || 0;
  var w = (weight !== undefined && weight !== null && Number(weight) > 0) ? Number(weight) : getLatestWeight();
  return Math.round(w * d * 1.036);
}

/**
 * Realiza o cálculo composto detalhado de uma sessão de corrida intervalada.
 */
function calcIntervalRunTotal(cfg){
  cfg = cfg || {};
  var tiroMin = parseFloat(cfg.tiroMin) || 0;
  var tiroSec = parseFloat(cfg.tiroSec) || 0;
  var tiroDurSec = tiroMin * 60 + tiroSec;
  var tiroKmh = parseFloat(cfg.tiroKmh) || 0;

  var recupMin = parseFloat(cfg.recupMin) || 0;
  var recupSec = parseFloat(cfg.recupSec) || 0;
  var recupDurSec = recupMin * 60 + recupSec;
  var recupKmh = parseFloat(cfg.recupKmh) || 0;

  var ciclos = parseInt(cfg.ciclos, 10) || 1;
  if(ciclos < 1) ciclos = 1;

  var warmupMin = parseFloat(cfg.warmupMin) || 0;
  var warmupSec = parseFloat(cfg.warmupSec) || 0;
  var warmupDurSec = warmupMin * 60 + warmupSec;
  var warmupKmh = parseFloat(cfg.warmupKmh) || 0;

  var cooldownMin = parseFloat(cfg.cooldownMin) || 0;
  var cooldownSec = parseFloat(cfg.cooldownSec) || 0;
  var cooldownDurSec = cooldownMin * 60 + cooldownSec;
  var cooldownKmh = parseFloat(cfg.cooldownKmh) || 0;

  var distWarmup = (warmupDurSec / 3600) * warmupKmh;
  var distTiroCycle = (tiroDurSec / 3600) * tiroKmh;
  var distRecupCycle = (recupDurSec / 3600) * recupKmh;
  var distCiclos = ciclos * (distTiroCycle + distRecupCycle);
  var distCooldown = (cooldownDurSec / 3600) * cooldownKmh;

  var totalDistKm = distWarmup + distCiclos + distCooldown;
  var totalDurationSec = warmupDurSec + ciclos * (tiroDurSec + recupDurSec) + cooldownDurSec;

  var avgSpeedKmh = totalDurationSec > 0 ? (totalDistKm * 3600) / totalDurationSec : 0;
  var avgPaceSec = totalDistKm > 0 ? totalDurationSec / totalDistKm : 0;
  var kcal = calcCaloriesBurned(totalDistKm, totalDurationSec);

  return {
    totalDistKm: Math.round(totalDistKm * 100) / 100,
    totalDurationSec: totalDurationSec,
    avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
    avgPaceSec: Math.round(avgPaceSec),
    paceFormatted: fmtPace(avgPaceSec),
    kcal: kcal,
    ciclos: ciclos,
    warmupSec: warmupDurSec,
    warmupKmh: warmupKmh,
    tiroSec: tiroDurSec,
    tiroKmh: tiroKmh,
    recupSec: recupDurSec,
    recupKmh: recupKmh,
    cooldownSec: cooldownDurSec,
    cooldownKmh: cooldownKmh
  };
}

/**
 * Calcula a distância cumulativa de cardio percorrida na semana corrente (segunda a domingo).
 */
function weekCardioDistance(){
  if(typeof state === 'undefined' || !state || !state.corridas) return 0;
  var now = new Date(), dow = (now.getDay() + 6) % 7, mon = new Date(now);
  mon.setDate(now.getDate() - dow); mon.setHours(0,0,0,0);
  return (state.corridas || []).filter(function(c){
    return new Date(c.date + 'T00:00:00') >= mon;
  }).reduce(function(acc, c){ return acc + (Number(c.distanciaKm) || 0); }, 0);
}

/**
 * Ordena a lista de corridas cronologicamente (mais antigas primeiro para gráficos).
 */
function sortedCorridas(){
  if(typeof state === 'undefined' || !state || !state.corridas) return [];
  return state.corridas.slice().sort(function(a,b){
    return a.date === b.date ? (Number(a.id||0) - Number(b.id||0)) : (a.date < b.date ? -1 : 1);
  });
}

/* ==========================================================================
   Temporizador Interativo de Intervalos (Live Runner)
   ========================================================================== */

function buildIntervalPhases(cfg){
  var calc = calcIntervalRunTotal(cfg);
  var phases = [];

  if(calc.warmupSec > 0 && calc.warmupKmh > 0){
    phases.push({
      type: 'warmup',
      label: 'Aquecimento',
      emoji: '🔥',
      color: '#f59e0b',
      durSec: calc.warmupSec,
      speedKmh: calc.warmupKmh,
      desc: 'Caminhada ou trote leve preparatório'
    });
  }

  for(var i = 1; i <= calc.ciclos; i++){
    phases.push({
      type: 'tiro',
      label: 'Tiro de Corrida',
      emoji: '🏃',
      color: '#f97a53',
      durSec: calc.tiroSec,
      speedKmh: calc.tiroKmh,
      cycleNum: i,
      totalCycles: calc.ciclos,
      desc: 'Ciclo ' + i + '/' + calc.ciclos + ' — Acelere na esteira!'
    });
    phases.push({
      type: 'recup',
      label: 'Recuperação',
      emoji: '🚶',
      color: '#3b82f6',
      durSec: calc.recupSec,
      speedKmh: calc.recupKmh,
      cycleNum: i,
      totalCycles: calc.ciclos,
      desc: 'Ciclo ' + i + '/' + calc.ciclos + ' — Caminhada para recuperar o fôlego'
    });
  }

  if(calc.cooldownSec > 0 && calc.cooldownKmh > 0){
    phases.push({
      type: 'cooldown',
      label: 'Desaquecimento',
      emoji: '❄️',
      color: '#10b981',
      durSec: calc.cooldownSec,
      speedKmh: calc.cooldownKmh,
      desc: 'Volta à calma e normalização cardíaca'
    });
  }

  return phases;
}

function startLiveIntervalSession(cfg){
  initAudio();
  var phases = buildIntervalPhases(cfg);
  if(!phases.length){
    toast('Configure durações válidas para os intervalos.');
    return;
  }

  liveIntervalRunner.active = true;
  liveIntervalRunner.paused = false;
  liveIntervalRunner.phases = phases;
  liveIntervalRunner.currentPhaseIdx = 0;
  liveIntervalRunner.secondsLeft = phases[0].durSec;
  liveIntervalRunner.totalElapsed = 0;
  liveIntervalRunner.config = cfg;

  if(liveIntervalRunner.timerId) clearInterval(liveIntervalRunner.timerId);
  liveIntervalRunner.timerId = setInterval(tickLiveInterval, 1000);

  beep();
  vibrate([150, 75, 150]);
  render();
}

function tickLiveInterval(){
  if(!liveIntervalRunner.active || liveIntervalRunner.paused) return;

  liveIntervalRunner.totalElapsed++;
  liveIntervalRunner.secondsLeft--;

  var cur = liveIntervalRunner.phases[liveIntervalRunner.currentPhaseIdx];

  // Avisos sonoros nos últimos 3 segundos
  if(liveIntervalRunner.secondsLeft >= 1 && liveIntervalRunner.secondsLeft <= 3){
    beep();
  }

  // Transição de fase
  if(liveIntervalRunner.secondsLeft <= 0){
    liveIntervalRunner.currentPhaseIdx++;
    if(liveIntervalRunner.currentPhaseIdx < liveIntervalRunner.phases.length){
      var next = liveIntervalRunner.phases[liveIntervalRunner.currentPhaseIdx];
      liveIntervalRunner.secondsLeft = next.durSec;
      beep();
      vibrate([200, 100, 200]);
    } else {
      // Treino concluído com sucesso!
      finishLiveInterval(true);
      return;
    }
  }

  updateLiveTimerDOM();
}

function updateLiveTimerDOM(){
  var timerEl = document.getElementById('liveRunnerTime');
  if(timerEl){
    timerEl.textContent = fmtClock(liveIntervalRunner.secondsLeft);
  }
  var elapsedEl = document.getElementById('liveRunnerElapsed');
  if(elapsedEl){
    elapsedEl.textContent = fmtClock(liveIntervalRunner.totalElapsed);
  }
}

function togglePauseLiveInterval(){
  liveIntervalRunner.paused = !liveIntervalRunner.paused;
  render();
}

function skipLiveIntervalPhase(){
  if(!liveIntervalRunner.active) return;
  liveIntervalRunner.currentPhaseIdx++;
  if(liveIntervalRunner.currentPhaseIdx < liveIntervalRunner.phases.length){
    var next = liveIntervalRunner.phases[liveIntervalRunner.currentPhaseIdx];
    liveIntervalRunner.secondsLeft = next.durSec;
    beep();
    vibrate([100, 50, 100]);
    render();
  } else {
    finishLiveInterval(true);
  }
}

function stopLiveIntervalPrompt(){
  dlg({
    title: 'Interromper Treino',
    sub: 'Deseja encerrar a sessão intervalada e salvar o progresso realizado até aqui?',
    ok: 'Salvar e Sair',
    onOk: function(){
      finishLiveInterval(true);
    },
    onCancel: function(){
      cancelLiveInterval();
    }
  });
}

function cancelLiveInterval(){
  if(liveIntervalRunner.timerId) clearInterval(liveIntervalRunner.timerId);
  liveIntervalRunner.active = false;
  liveIntervalRunner.paused = false;
  render();
}

function finishLiveInterval(saveSession){
  if(liveIntervalRunner.timerId) clearInterval(liveIntervalRunner.timerId);
  liveIntervalRunner.active = false;
  liveIntervalRunner.paused = false;

  if(saveSession && liveIntervalRunner.config){
    var calc = calcIntervalRunTotal(liveIntervalRunner.config);
    var newCorrida = {
      id: Date.now(),
      date: draftCorridaForm.intervalada.data || todayISO(),
      hora: new Date().toTimeString().slice(0, 5),
      mode: 'intervalada',
      tipo: 'intervalada',
      distanciaKm: calc.totalDistKm,
      duracaoSeg: calc.totalDurationSec,
      paceMinKm: calc.paceFormatted,
      ritmoMedioSegKm: calc.avgPaceSec,
      velocidadeMediaKmh: calc.avgSpeedKmh,
      calorias: calc.kcal,
      intervalos: {
        tiroMin: draftCorridaForm.intervalada.tiroMin,
        tiroSec: draftCorridaForm.intervalada.tiroSec,
        tiroKmh: draftCorridaForm.intervalada.tiroKmh,
        recupMin: draftCorridaForm.intervalada.recupMin,
        recupSec: draftCorridaForm.intervalada.recupSec,
        recupKmh: draftCorridaForm.intervalada.recupKmh,
        ciclos: draftCorridaForm.intervalada.ciclos,
        warmupMin: draftCorridaForm.intervalada.warmupMin,
        warmupSec: draftCorridaForm.intervalada.warmupSec,
        warmupKmh: draftCorridaForm.intervalada.warmupKmh,
        cooldownMin: draftCorridaForm.intervalada.cooldownMin,
        cooldownSec: draftCorridaForm.intervalada.cooldownSec,
        cooldownKmh: draftCorridaForm.intervalada.cooldownKmh
      },
      notas: draftCorridaForm.intervalada.notas || 'Sessão intervalada concluída'
    };

    state.corridas = state.corridas || [];
    state.corridas.push(newCorrida);
    save();
    celebrate();
    toast('Treino intervalado salvo com sucesso! 🏆');
  }

  render();
}

/* ==========================================================================
   Renderização da View de Corrida (renderCorrida)
   ========================================================================== */

function renderCorrida(){
  var goalKm = Number(state.cardioGoalKm) || 15;
  var weekKm = weekCardioDistance();
  var pct = goalKm > 0 ? Math.min(100, Math.round((weekKm / goalKm) * 100)) : 0;
  var corridas = sortedCorridas();
  var historyDesc = corridas.slice().reverse();

  var h = '';

  // 1. Cabeçalho da Aba
  h += '<div class="mf-dashboard-head" style="margin-bottom:12px">';
  h += '  <div>';
  h += '    <span class="mf-eyebrow">Cardio & Treino de Corrida</span>';
  h += '    <h1>Corrida</h1>';
  h += '    <div class="sub">Monitore ritmo, volume e treinos intervalados</div>';
  h += '  </div>';
  h += '  <span class="mf-dashboard-mark"><svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#ffffff;stroke-width:2.2;fill:none">' + NAV_ICONS.corrida + '</svg></span>';
  h += '</div>';

  // 1b. Sessão planejada de hoje (Maratona) — banner leve, sem rediseñar
  if (typeof maratonaWeekForDate === 'function' && typeof MARATONA_PLAN !== 'undefined') {
    var planWk = maratonaWeekForDate(todayISO());
    if (planWk) {
      var dayKey = ({2:'ter',4:'qui',6:'sab',0:'dom'})[new Date(todayISO() + 'T00:00:00').getDay()];
      var planTxt = dayKey ? planWk.sessions[dayKey] : '';
      if (planTxt) {
        h += '<div class="card" style="padding:12px 14px;margin-bottom:14px;display:flex;gap:10px;align-items:center;justify-content:space-between">';
        h += '  <div style="min-width:0"><div class="small" style="color:var(--mut)">Treino planejado hoje · Semana ' + planWk.week + '</div>';
        h += '  <b style="display:block;margin-top:2px">' + esc(planTxt) + '</b></div>';
        h += '  <button class="rpill" id="goMaratonaBtn" style="flex-shrink:0">Maratona →</button>';
        h += '</div>';
      }
    }
  }

  // 2. Overlay do Live Interval Timer (quando ativo)
  if(liveIntervalRunner.active){
    var curPhase = liveIntervalRunner.phases[liveIntervalRunner.currentPhaseIdx];
    h += '<div class="card" style="border:1px solid var(--border-focus);background:var(--card);padding:18px;margin-bottom:14px">';
    h += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
    h += '    <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;color:#ffffff">' + curPhase.emoji + ' ' + esc(curPhase.label) + '</span>';
    if(curPhase.cycleNum){
      h += '    <span style="font-size:11px;font-weight:700;background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--txt-secondary);padding:3px 9px;border-radius:999px">Ciclo ' + curPhase.cycleNum + ' / ' + curPhase.totalCycles + '</span>';
    }
    h += '  </div>';

    h += '  <div style="text-align:center;padding:12px 0">';
    h += '    <div id="liveRunnerTime" style="font-size:48px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1;letter-spacing:-1px;color:#ffffff">' + fmtClock(liveIntervalRunner.secondsLeft) + '</div>';
    h += '    <div style="font-size:13px;color:var(--txt-secondary);font-weight:600;margin-top:6px">' + esc(curPhase.desc) + '</div>';
    h += '    <div style="font-size:16px;font-weight:700;color:var(--txt-primary);background:var(--bg-input);border:1px solid var(--border-subtle);padding:7px 16px;border-radius:12px;display:inline-block;margin-top:10px">';
    h += '      Velocidade Esteira: <b style="color:#ffffff">' + nkg(curPhase.speedKmh) + ' km/h</b>';
    h += '    </div>';
    h += '  </div>';

    h += '  <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--mut);border-top:1px solid var(--line);padding-top:10px;margin-top:8px">';
    h += '    <span>Tempo Total: <b id="liveRunnerElapsed" style="color:var(--txt)">' + fmtClock(liveIntervalRunner.totalElapsed) + '</b></span>';
    h += '    <span>Fase ' + (liveIntervalRunner.currentPhaseIdx + 1) + ' de ' + liveIntervalRunner.phases.length + '</span>';
    h += '  </div>';

    h += '  <div style="display:flex;gap:8px;margin-top:12px">';
    h += '    <button class="cta sm" id="btnLivePause" style="flex:1;background:var(--card2);color:var(--txt);border:1px solid var(--line)">' + (liveIntervalRunner.paused ? '▶ Continuar' : '⏸ Pausar') + '</button>';
    h += '    <button class="cta sm" id="btnLiveSkip" style="flex:1;background:var(--card2);color:var(--txt);border:1px solid var(--line)">⏭ Pular Fase</button>';
    h += '    <button class="cta sm" id="btnLiveStop" style="flex:1;background:var(--status-danger-dim);color:var(--status-danger);border:1px solid rgba(248,113,113,0.25)">⏹ Concluir</button>';
    h += '  </div>';
    h += '</div>';
  }

  // 3. Card de Meta Semanal de Cardio & Volume Cumulativo
  h += '<div class="card">';
  h += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  h += '    <span style="font-size:11px;font-weight:700;color:var(--txt-secondary);text-transform:uppercase;letter-spacing:0.6px">Meta Semanal de Cardio</span>';
  h += '    <button id="btnEditCardioGoal" class="rtag" style="cursor:pointer;padding:3px 9px">⚙️ Ajustar Meta</button>';
  h += '  </div>';
  h += '  <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">';
  h += '    <span style="font-size:28px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums">' + nkg(weekKm) + ' <small style="font-size:14px;color:var(--txt-secondary);font-weight:600">km</small></span>';
  h += '    <span style="font-size:13px;color:var(--txt-secondary)">de <b>' + nkg(goalKm) + ' km</b> meta (' + pct + '%)</span>';
  h += '  </div>';
  h += '  <div style="height:8px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:999px;overflow:hidden;margin-bottom:4px">';
  h += '    <div style="height:100%;width:' + pct + '%;background:#ffffff;border-radius:999px;transition:width 0.4s ease"></div>';
  h += '  </div>';
  h += '</div>';

  // 4. Seletor de Modo de Registro: [ Corrida Contínua | Intervalada ]
  h += '<div class="seg" style="margin-bottom:12px">';
  h += '  <button data-cmode="continua" class="' + (corridaMode === 'continua' ? 'on' : '') + '">🏃 Corrida Contínua</button>';
  h += '  <button data-cmode="intervalada" class="' + (corridaMode === 'intervalada' ? 'on' : '') + '">⚡ Intervalada / Alternada</button>';
  h += '</div>';

  // 5. Formulário do Modo Selecionado
  if(corridaMode === 'continua'){
    // --- Modo 1: Corrida Contínua ---
    var cDist = draftCorridaForm.continua.distanciaKm || 5.0;
    var cMin = draftCorridaForm.continua.duracaoMin !== undefined ? draftCorridaForm.continua.duracaoMin : 30;
    var cSec = draftCorridaForm.continua.duracaoSec !== undefined ? draftCorridaForm.continua.duracaoSec : 0;
    var cDate = draftCorridaForm.continua.data || todayISO();
    var cNotas = draftCorridaForm.continua.notas || '';

    var totalSec = cMin * 60 + cSec;
    var paceSec = calcPaceSec(cDist, totalSec);
    var paceFmt = fmtPace(paceSec);
    var speedKmh = calcSpeedKmh(cDist, totalSec);
    var kcalEst = calcCaloriesBurned(cDist, totalSec);

    h += '<div class="card">';
    h += '  <h2 style="margin:2px 0 10px;color:var(--txt)">Nova Corrida Contínua</h2>';

    // Distância
    h += '  <span class="flabel">Distância Percorrida (km)</span>';
    h += '  <div class="row" style="margin-bottom:12px">';
    h += '    <div class="step" style="flex:1">';
    h += '      <button id="btnCDistMinus">−0.5</button>';
    h += '      <input id="inputCDist" type="number" inputmode="decimal" step="0.1" min="0.1" value="' + cDist + '">';
    h += '      <button id="btnCDistPlus">+0.5</button>';
    h += '    </div>';
    h += '  </div>';

    // Duração (Minutos e Segundos)
    h += '  <div class="addgrid" style="margin-bottom:12px">';
    h += '    <div>';
    h += '      <span class="flabel">Minutos</span>';
    h += '      <div class="step">';
    h += '        <button id="btnCMinMinus">−1</button>';
    h += '        <input id="inputCMin" type="number" inputmode="numeric" step="1" min="0" value="' + cMin + '">';
    h += '        <button id="btnCMinPlus">+1</button>';
    h += '      </div>';
    h += '    </div>';
    h += '    <div>';
    h += '      <span class="flabel">Segundos</span>';
    h += '      <div class="step">';
    h += '        <button id="btnCSecMinus">−5</button>';
    h += '        <input id="inputCSec" type="number" inputmode="numeric" step="5" min="0" max="59" value="' + cSec + '">';
    h += '        <button id="btnCSecPlus">+5</button>';
    h += '      </div>';
    h += '    </div>';
    h += '  </div>';

    // Preview em tempo real de Métricas (Pace, Velocidade, Calorias)
    h += '  <div class="stat" style="margin:6px 0 14px">';
    h += '    <div><div class="v">' + paceFmt + '</div><div class="l">Ritmo / Pace</div></div>';
    h += '    <div><div class="v">' + nkg(speedKmh) + ' <small style="font-size:11px">km/h</small></div><div class="l">Velocidade</div></div>';
    h += '    <div><div class="v">' + kcalEst + ' <small style="font-size:11px">kcal</small></div><div class="l">Calorias</div></div>';
    h += '  </div>';

    // Data e Notas
    h += '  <div class="row" style="margin-bottom:10px">';
    h += '    <input id="inputCDate" class="txt" type="date" value="' + cDate + '" style="flex:1">';
    h += '  </div>';
    h += '  <input id="inputCNotas" class="txt" type="text" placeholder="Observações (ex.: esteira 1% inclinação, rua, FC 150 bpm)" value="' + esc(cNotas) + '" style="margin-bottom:14px">';

    // Botão Salvar
    h += '  <button class="cta" id="btnSalvarCorridaContinua" style="background:#ffffff;color:#09090b">Salvar Corrida</button>';
    h += '</div>';

  } else {
    // --- Modo 2: Corrida Intervalada / Alternada ---
    var iv = draftCorridaForm.intervalada;
    var iCalc = calcIntervalRunTotal(iv);
    var iDate = iv.data || todayISO();
    var iNotas = iv.notas || '';

    h += '<div class="card">';
    h += '  <h2 style="margin:2px 0 10px;color:var(--txt)">Estrutura de Intervalos</h2>';

    // Tiro / Corrida (Duração e Velocidade)
    h += '  <div style="background:var(--card2);border:1px solid var(--border-subtle);border-radius:14px;padding:12px;margin-bottom:11px">';
    h += '    <span style="font-size:11.5px;font-weight:700;color:var(--txt-primary);text-transform:uppercase;letter-spacing:0.5px">🏃 Tiro / Corrida de Alta Intensidade</span>';
    h += '    <div class="addgrid" style="margin-top:8px">';
    h += '      <div>';
    h += '        <span class="flabel">Duração (min)</span>';
    h += '        <div class="step">';
    h += '          <button id="btnITiroMinMinus">−0.5</button>';
    h += '          <input id="inputITiroMin" type="number" inputmode="decimal" step="0.5" min="0.5" value="' + iv.tiroMin + '">';
    h += '          <button id="btnITiroMinPlus">+0.5</button>';
    h += '        </div>';
    h += '      </div>';
    h += '      <div>';
    h += '        <span class="flabel">Velocidade Esteira (km/h)</span>';
    h += '        <div class="step">';
    h += '          <button id="btnITiroKmhMinus">−0.5</button>';
    h += '          <input id="inputITiroKmh" type="number" inputmode="decimal" step="0.5" min="1" value="' + iv.tiroKmh + '">';
    h += '          <button id="btnITiroKmhPlus">+0.5</button>';
    h += '        </div>';
    h += '      </div>';
    h += '    </div>';
    h += '  </div>';

    // Recuperação / Caminhada (Duração e Velocidade)
    h += '  <div style="background:var(--card2);border:1px solid var(--border-subtle);border-radius:14px;padding:12px;margin-bottom:11px">';
    h += '    <span style="font-size:11.5px;font-weight:700;color:var(--txt-secondary);text-transform:uppercase;letter-spacing:0.5px">🚶 Recuperação / Caminhada</span>';
    h += '    <div class="addgrid" style="margin-top:8px">';
    h += '      <div>';
    h += '        <span class="flabel">Duração (min)</span>';
    h += '        <div class="step">';
    h += '          <button id="btnIRecupMinMinus">−0.5</button>';
    h += '          <input id="inputIRecupMin" type="number" inputmode="decimal" step="0.5" min="0.5" value="' + iv.recupMin + '">';
    h += '          <button id="btnIRecupMinPlus">+0.5</button>';
    h += '        </div>';
    h += '      </div>';
    h += '      <div>';
    h += '        <span class="flabel">Velocidade Esteira (km/h)</span>';
    h += '        <div class="step">';
    h += '          <button id="btnIRecupKmhMinus">−0.5</button>';
    h += '          <input id="inputIRecupKmh" type="number" inputmode="decimal" step="0.5" min="1" value="' + iv.recupKmh + '">';
    h += '          <button id="btnIRecupKmhPlus">+0.5</button>';
    h += '        </div>';
    h += '      </div>';
    h += '    </div>';
    h += '  </div>';

    // Repetições (Ciclos N)
    h += '  <div style="margin-bottom:11px">';
    h += '    <span class="flabel">Número de Repetições / Ciclos (N)</span>';
    h += '    <div class="step">';
    h += '      <button id="btnICiclosMinus">−1</button>';
    h += '      <input id="inputICiclos" type="number" inputmode="numeric" step="1" min="1" max="50" value="' + iv.ciclos + '">';
    h += '      <button id="btnICiclosPlus">+1</button>';
    h += '    </div>';
    h += '  </div>';

    // Aquecimento e Desaquecimento (Warmup / Cooldown opcionais)
    h += '  <details style="margin-bottom:12px;background:var(--card2);border:1px solid var(--line);border-radius:12px;padding:10px">';
    h += '    <summary style="font-size:12px;font-weight:700;color:var(--txt-secondary);cursor:pointer;text-transform:uppercase;letter-spacing:0.4px">Opções Avançadas (Aquecimento / Desaquecimento)</summary>';
    h += '    <div style="margin-top:10px">';
    h += '      <div class="addgrid" style="margin-bottom:8px">';
    h += '        <div>';
    h += '          <span class="flabel">Aquecimento (min)</span>';
    h += '          <input id="inputIWarmupMin" class="txt" type="number" step="0.5" min="0" value="' + iv.warmupMin + '">';
    h += '        </div>';
    h += '        <div>';
    h += '          <span class="flabel">Veloc. Aquec. (km/h)</span>';
    h += '          <input id="inputIWarmupKmh" class="txt" type="number" step="0.5" min="0" value="' + iv.warmupKmh + '">';
    h += '        </div>';
    h += '      </div>';
    h += '      <div class="addgrid">';
    h += '        <div>';
    h += '          <span class="flabel">Desaquecimento (min)</span>';
    h += '          <input id="inputICooldownMin" class="txt" type="number" step="0.5" min="0" value="' + iv.cooldownMin + '">';
    h += '        </div>';
    h += '        <div>';
    h += '          <span class="flabel">Veloc. Desaquec. (km/h)</span>';
    h += '          <input id="inputICooldownKmh" class="txt" type="number" step="0.5" min="0" value="' + iv.cooldownKmh + '">';
    h += '        </div>';
    h += '      </div>';
    h += '    </div>';
    h += '  </details>';

    // Totais Calculados Automaticamente
    h += '  <div class="stat" style="margin:6px 0 12px">';
    h += '    <div><div class="v">' + nkg(iCalc.totalDistKm) + ' <small style="font-size:10.5px">km</small></div><div class="l">Distância Total</div></div>';
    h += '    <div><div class="v">' + fmtDur(iCalc.totalDurationSec) + '</div><div class="l">Duração Total</div></div>';
    h += '    <div><div class="v">' + iCalc.paceFormatted + '</div><div class="l">Pace Médio</div></div>';
    h += '  </div>';

    // Data e Notas
    h += '  <div class="row" style="margin-bottom:10px">';
    h += '    <input id="inputIDate" class="txt" type="date" value="' + iDate + '" style="flex:1">';
    h += '  </div>';
    h += '  <input id="inputINotas" class="txt" type="text" placeholder="Observações (ex.: protocolo esteira 8 ciclos 1x1 min)" value="' + esc(iNotas) + '" style="margin-bottom:14px">';

    // Ações: Iniciar Timer ou Salvar Manual
    h += '  <button class="cta" id="btnIniciarTreinoIntervalado" style="background:#ffffff;color:#09090b;margin-bottom:8px">▶ Iniciar Sessão com Timer</button>';
    h += '  <button class="cta sm" id="btnSalvarTreinoIntervalado" style="background:var(--card2);color:var(--txt);border:1px solid var(--line)">Salvar Registro sem Timer</button>';
    h += '</div>';
  }

  // 6. Seção de Gráficos de Evolução (Pace e Distância)
  h += '<h2>Evolução & Progresso de Corrida</h2>';
  h += '<div class="card">';
  h += '  <div class="seg" style="margin-bottom:12px">';
  h += '    <button data-ctab="distancia" class="' + (corridaChartTab === 'distancia' ? 'on' : '') + '">Distância (km)</button>';
  h += '    <button data-ctab="pace" class="' + (corridaChartTab === 'pace' ? 'on' : '') + '">Ritmo / Pace (min/km)</button>';
  h += '  </div>';

  if(corridas.length < 2){
    h += '  <div class="empty"><svg viewBox="0 0 24 24"><polyline points="4 18 9 13 13 15.5 20 7"/><polyline points="16 7 20 7 20 11"/><line x1="4" y1="21" x2="20" y2="21"/></svg><div class="t">Sem dados de corrida suficientes</div><div class="s">Registre pelo menos 2 sessões de corrida para visualizar seus gráficos de evolução.</div></div>';
  } else {
    if(corridaChartTab === 'distancia'){
      var ptsDist = corridas.map(function(c){ return { x: c.date, y: Number(c.distanciaKm) || 0 }; });
      h += chartSVG(ptsDist, '#ffffff');
      var totalKm = corridas.reduce(function(a,c){ return a + (Number(c.distanciaKm)||0); }, 0);
      var avgKm = totalKm / corridas.length;
      h += '  <div class="stat"><div><div class="v">' + nkg(totalKm) + ' km</div><div class="l">Volume Total</div></div>';
      h += '  <div><div class="v">' + nkg(avgKm) + ' km</div><div class="l">Média / Sessão</div></div>';
      h += '  <div><div class="v pos">' + corridas.length + '</div><div class="l">Sessões</div></div></div>';
    } else {
      var ptsPace = corridas.map(function(c){ return { x: c.date, y: Number(c.ritmoMedioSegKm) || calcPaceSec(c.distanciaKm, c.duracaoSeg) }; });
      h += paceChartSVG(ptsPace, '#ffffff');
      var paces = ptsPace.map(function(p){ return p.y; }).filter(function(y){ return y > 0; });
      var bestPace = paces.length ? Math.min.apply(null, paces) : 0;
      var avgPace = paces.length ? (paces.reduce(function(a,b){return a+b;},0)/paces.length) : 0;
      h += '  <div class="stat"><div><div class="v pos">' + fmtPace(bestPace) + '</div><div class="l">Melhor Pace</div></div>';
      h += '  <div><div class="v">' + fmtPace(avgPace) + '</div><div class="l">Pace Médio</div></div>';
      h += '  <div><div class="v">' + corridas.length + '</div><div class="l">Sessões</div></div></div>';
    }
  }
  h += '</div>';

  // 7. Histórico de Sessões de Corrida
  h += '<h2>Histórico de Corridas</h2>';
  h += '<div class="sub" style="margin-bottom:8px">' + historyDesc.length + ' sessão(ões) registrada(s) · toque para ver detalhes</div>';

  if(!historyDesc.length){
    h += '<div class="card"><div class="empty"><div class="big">🏃</div><div class="t">Nenhuma corrida registrada</div><div class="s">Registre sua primeira corrida contínua ou intervalada acima!</div></div></div>';
  } else {
    h += '<div class="card">';
    historyDesc.forEach(function(c){
      var isInterval = (c.mode === 'intervalada' || c.tipo === 'intervalada');
      var badgeHtml = isInterval ?
        '<span style="background:var(--card2);border:1px solid var(--border-subtle);color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;text-transform:uppercase">Intervalada</span>' :
        '<span style="background:var(--card2);border:1px solid var(--border-subtle);color:var(--txt-secondary);font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;text-transform:uppercase">Contínua</span>';

      var paceStr = c.paceMinKm || fmtPace(c.ritmoMedioSegKm || calcPaceSec(c.distanciaKm, c.duracaoSeg));
      var durStr = fmtDur(c.duracaoSeg || 0);

      h += '<div class="sess" data-cid="' + c.id + '">';
      h += '  <div class="sess-top">';
      h += '    <div class="badge" style="background:var(--card2);border:1px solid var(--border-subtle);color:#ffffff">' + (isInterval ? '⚡' : '🏃') + '</div>';
      h += '    <div class="grow">';
      h += '      <div style="display:flex;align-items:center;gap:6px;font-weight:700">';
      h += '        <span>' + fmtBRfull(c.date) + '</span>' + badgeHtml;
      h += '      </div>';
      h += '      <div class="meta"><b>' + nkg(c.distanciaKm) + ' km</b> em ' + durStr + ' · ritmo ' + paceStr + '</div>';
      h += '    </div>';
      h += '    <button class="del" data-delcorrida="' + c.id + '">✕</button>';
      h += '  </div>';

      // Detalhes expansíveis da sessão
      h += '  <div class="det">';
      h += '    <div class="line"><b>Velocidade Média:</b> ' + nkg(c.velocidadeMediaKmh || calcSpeedKmh(c.distanciaKm, c.duracaoSeg)) + ' km/h</div>';
      h += '    <div class="line"><b>Calorias Estimadas:</b> ' + (c.calorias || calcCaloriesBurned(c.distanciaKm, c.duracaoSeg)) + ' kcal</div>';
      if(isInterval && c.intervalos){
        var ivInfo = c.intervalos;
        h += '    <div class="line"><b>Estrutura:</b> ' + (ivInfo.ciclos || 1) + ' ciclos × [Tiro ' + (ivInfo.tiroMin||1) + 'm @ ' + nkg(ivInfo.tiroKmh||9) + ' km/h + Recup ' + (ivInfo.recupMin||1) + 'm @ ' + nkg(ivInfo.recupKmh||3) + ' km/h]</div>';
      }
      if(c.notas){
        h += '    <div class="line"><b>Notas:</b> ' + esc(c.notas) + '</div>';
      }
      h += '  </div>';
      h += '</div>';
    });
    h += '</div>';
  }

  return h;
}

/* ==========================================================================
   Event Binding e Interatividade da View (bindCorrida)
   ========================================================================== */

function bindCorrida(){
  // 1. Alternância de Modo (Contínua vs Intervalada)
  // Banner Maratona: atalho para a aba do plano
  var goMar = document.getElementById('goMaratonaBtn');
  if (goMar) goMar.onclick = function(){ tab = 'maratona'; render(); };

  document.querySelectorAll('[data-cmode]').forEach(function(btn){
    btn.onclick = function(){
      corridaMode = btn.getAttribute('data-cmode');
      render();
    };
  });

  // 2. Alternância de Gráfico (Distância vs Pace)
  document.querySelectorAll('[data-ctab]').forEach(function(btn){
    btn.onclick = function(){
      corridaChartTab = btn.getAttribute('data-ctab');
      render();
    };
  });

  // 3. Ajuste de Meta Semanal de Cardio
  var btnGoal = document.getElementById('btnEditCardioGoal');
  if(btnGoal){
    btnGoal.onclick = function(){
      dlg({
        title: 'Meta Semanal de Cardio',
        sub: 'Defina a meta de distância (km) que você deseja percorrer semanalmente:',
        input: true,
        num: true,
        value: state.cardioGoalKm || 15,
        ph: 'Ex.: 15',
        ok: 'Salvar Meta',
        onOk: function(val){
          var n = parseFloat(String(val).replace(',', '.'));
          if(!isNaN(n) && n > 0){
            state.cardioGoalKm = Math.round(n * 10) / 10;
            save();
            toast('Meta de cardio atualizada!');
            render();
          }
        }
      });
    };
  }

  // 4. Controles do Live Interval Runner
  var btnLivePause = document.getElementById('btnLivePause');
  if(btnLivePause) btnLivePause.onclick = togglePauseLiveInterval;
  var btnLiveSkip = document.getElementById('btnLiveSkip');
  if(btnLiveSkip) btnLiveSkip.onclick = skipLiveIntervalPhase;
  var btnLiveStop = document.getElementById('btnLiveStop');
  if(btnLiveStop) btnLiveStop.onclick = stopLiveIntervalPrompt;

  // 5. Handlers do Modo Contínuo
  if(corridaMode === 'continua'){
    var inDist = document.getElementById('inputCDist');
    var inMin = document.getElementById('inputCMin');
    var inSec = document.getElementById('inputCSec');
    var inDate = document.getElementById('inputCDate');
    var inNotas = document.getElementById('inputCNotas');

    if(inDist){
      inDist.oninput = function(){ draftCorridaForm.continua.distanciaKm = parseFloat(inDist.value) || 0; };
      inDist.onchange = function(){ render(); };
    }
    if(inMin){
      inMin.oninput = function(){ draftCorridaForm.continua.duracaoMin = parseInt(inMin.value, 10) || 0; };
      inMin.onchange = function(){ render(); };
    }
    if(inSec){
      inSec.oninput = function(){ draftCorridaForm.continua.duracaoSec = parseInt(inSec.value, 10) || 0; };
      inSec.onchange = function(){ render(); };
    }
    if(inDate) inDate.onchange = function(){ draftCorridaForm.continua.data = inDate.value; };
    if(inNotas) inNotas.oninput = function(){ draftCorridaForm.continua.notas = inNotas.value; };

    var btnCDistMinus = document.getElementById('btnCDistMinus');
    if(btnCDistMinus) btnCDistMinus.onclick = function(){
      var v = Math.max(0.1, Math.round(((parseFloat(inDist.value) || 0) - 0.5) * 10) / 10);
      inDist.value = v; draftCorridaForm.continua.distanciaKm = v; render();
    };
    var btnCDistPlus = document.getElementById('btnCDistPlus');
    if(btnCDistPlus) btnCDistPlus.onclick = function(){
      var v = Math.round(((parseFloat(inDist.value) || 0) + 0.5) * 10) / 10;
      inDist.value = v; draftCorridaForm.continua.distanciaKm = v; render();
    };

    var btnCMinMinus = document.getElementById('btnCMinMinus');
    if(btnCMinMinus) btnCMinMinus.onclick = function(){
      var v = Math.max(0, (parseInt(inMin.value, 10) || 0) - 1);
      inMin.value = v; draftCorridaForm.continua.duracaoMin = v; render();
    };
    var btnCMinPlus = document.getElementById('btnCMinPlus');
    if(btnCMinPlus) btnCMinPlus.onclick = function(){
      var v = (parseInt(inMin.value, 10) || 0) + 1;
      inMin.value = v; draftCorridaForm.continua.duracaoMin = v; render();
    };

    var btnCSecMinus = document.getElementById('btnCSecMinus');
    if(btnCSecMinus) btnCSecMinus.onclick = function(){
      var v = Math.max(0, (parseInt(inSec.value, 10) || 0) - 5);
      inSec.value = v; draftCorridaForm.continua.duracaoSec = v; render();
    };
    var btnCSecPlus = document.getElementById('btnCSecPlus');
    if(btnCSecPlus) btnCSecPlus.onclick = function(){
      var v = Math.min(55, (parseInt(inSec.value, 10) || 0) + 5);
      inSec.value = v; draftCorridaForm.continua.duracaoSec = v; render();
    };

    var btnSalvarC = document.getElementById('btnSalvarCorridaContinua');
    if(btnSalvarC){
      btnSalvarC.onclick = function(){
        var dist = parseFloat(inDist ? inDist.value : draftCorridaForm.continua.distanciaKm);
        var min = parseInt(inMin ? inMin.value : draftCorridaForm.continua.duracaoMin, 10) || 0;
        var sec = parseInt(inSec ? inSec.value : draftCorridaForm.continua.duracaoSec, 10) || 0;
        var totalSec = min * 60 + sec;

        if(isNaN(dist) || dist <= 0){
          toast('Informe uma distância válida.');
          return;
        }
        if(totalSec <= 0){
          toast('Informe uma duração maior que zero.');
          return;
        }

        var paceSec = calcPaceSec(dist, totalSec);
        var paceFmt = fmtPace(paceSec);
        var speedKmh = calcSpeedKmh(dist, totalSec);
        var kcal = calcCaloriesBurned(dist, totalSec);

        var newCorrida = {
          id: Date.now(),
          date: (inDate && inDate.value) || draftCorridaForm.continua.data || todayISO(),
          hora: new Date().toTimeString().slice(0, 5),
          mode: 'continua',
          tipo: 'continua',
          distanciaKm: Math.round(dist * 100) / 100,
          duracaoSeg: totalSec,
          paceMinKm: paceFmt,
          ritmoMedioSegKm: Math.round(paceSec),
          velocidadeMediaKmh: Math.round(speedKmh * 10) / 10,
          calorias: kcal,
          notas: (inNotas ? inNotas.value : draftCorridaForm.continua.notas) || ''
        };

        state.corridas = state.corridas || [];
        state.corridas.push(newCorrida);
        save();
        celebrate();
        toast('Corrida registrada com sucesso! 🏃');
        render();
      };
    }
  }

  // 6. Handlers do Modo Intervalado
  if(corridaMode === 'intervalada'){
    var iv = draftCorridaForm.intervalada;
    var inITiroMin = document.getElementById('inputITiroMin');
    var inITiroKmh = document.getElementById('inputITiroKmh');
    var inIRecupMin = document.getElementById('inputIRecupMin');
    var inIRecupKmh = document.getElementById('inputIRecupKmh');
    var inICiclos = document.getElementById('inputICiclos');
    var inIWarmupMin = document.getElementById('inputIWarmupMin');
    var inIWarmupKmh = document.getElementById('inputIWarmupKmh');
    var inICooldownMin = document.getElementById('inputICooldownMin');
    var inICooldownKmh = document.getElementById('inputICooldownKmh');
    var inIDate = document.getElementById('inputIDate');
    var inINotas = document.getElementById('inputINotas');

    if(inITiroMin) inITiroMin.onchange = function(){ iv.tiroMin = parseFloat(inITiroMin.value)||0; render(); };
    if(inITiroKmh) inITiroKmh.onchange = function(){ iv.tiroKmh = parseFloat(inITiroKmh.value)||0; render(); };
    if(inIRecupMin) inIRecupMin.onchange = function(){ iv.recupMin = parseFloat(inIRecupMin.value)||0; render(); };
    if(inIRecupKmh) inIRecupKmh.onchange = function(){ iv.recupKmh = parseFloat(inIRecupKmh.value)||0; render(); };
    if(inICiclos) inICiclos.onchange = function(){ iv.ciclos = parseInt(inICiclos.value,10)||1; render(); };
    if(inIWarmupMin) inIWarmupMin.onchange = function(){ iv.warmupMin = parseFloat(inIWarmupMin.value)||0; render(); };
    if(inIWarmupKmh) inIWarmupKmh.onchange = function(){ iv.warmupKmh = parseFloat(inIWarmupKmh.value)||0; render(); };
    if(inICooldownMin) inICooldownMin.onchange = function(){ iv.cooldownMin = parseFloat(inICooldownMin.value)||0; render(); };
    if(inICooldownKmh) inICooldownKmh.onchange = function(){ iv.cooldownKmh = parseFloat(inICooldownKmh.value)||0; render(); };
    if(inIDate) inIDate.onchange = function(){ iv.data = inIDate.value; };
    if(inINotas) inINotas.oninput = function(){ iv.notas = inINotas.value; };

    var btnITiroMinMinus = document.getElementById('btnITiroMinMinus');
    if(btnITiroMinMinus) btnITiroMinMinus.onclick = function(){
      iv.tiroMin = Math.max(0.5, Math.round(((parseFloat(iv.tiroMin)||1) - 0.5) * 10) / 10);
      render();
    };
    var btnITiroMinPlus = document.getElementById('btnITiroMinPlus');
    if(btnITiroMinPlus) btnITiroMinPlus.onclick = function(){
      iv.tiroMin = Math.round(((parseFloat(iv.tiroMin)||1) + 0.5) * 10) / 10;
      render();
    };

    var btnITiroKmhMinus = document.getElementById('btnITiroKmhMinus');
    if(btnITiroKmhMinus) btnITiroKmhMinus.onclick = function(){
      iv.tiroKmh = Math.max(1, Math.round(((parseFloat(iv.tiroKmh)||9) - 0.5) * 10) / 10);
      render();
    };
    var btnITiroKmhPlus = document.getElementById('btnITiroKmhPlus');
    if(btnITiroKmhPlus) btnITiroKmhPlus.onclick = function(){
      iv.tiroKmh = Math.round(((parseFloat(iv.tiroKmh)||9) + 0.5) * 10) / 10;
      render();
    };

    var btnIRecupMinMinus = document.getElementById('btnIRecupMinMinus');
    if(btnIRecupMinMinus) btnIRecupMinMinus.onclick = function(){
      iv.recupMin = Math.max(0.5, Math.round(((parseFloat(iv.recupMin)||1) - 0.5) * 10) / 10);
      render();
    };
    var btnIRecupMinPlus = document.getElementById('btnIRecupMinPlus');
    if(btnIRecupMinPlus) btnIRecupMinPlus.onclick = function(){
      iv.recupMin = Math.round(((parseFloat(iv.recupMin)||1) + 0.5) * 10) / 10;
      render();
    };

    var btnIRecupKmhMinus = document.getElementById('btnIRecupKmhMinus');
    if(btnIRecupKmhMinus) btnIRecupKmhMinus.onclick = function(){
      iv.recupKmh = Math.max(1, Math.round(((parseFloat(iv.recupKmh)||3) - 0.5) * 10) / 10);
      render();
    };
    var btnIRecupKmhPlus = document.getElementById('btnIRecupKmhPlus');
    if(btnIRecupKmhPlus) btnIRecupKmhPlus.onclick = function(){
      iv.recupKmh = Math.round(((parseFloat(iv.recupKmh)||3) + 0.5) * 10) / 10;
      render();
    };

    var btnICiclosMinus = document.getElementById('btnICiclosMinus');
    if(btnICiclosMinus) btnICiclosMinus.onclick = function(){
      iv.ciclos = Math.max(1, (parseInt(iv.ciclos,10)||8) - 1);
      render();
    };
    var btnICiclosPlus = document.getElementById('btnICiclosPlus');
    if(btnICiclosPlus) btnICiclosPlus.onclick = function(){
      iv.ciclos = (parseInt(iv.ciclos,10)||8) + 1;
      render();
    };

    // Iniciar com Live Timer
    var btnIniciar = document.getElementById('btnIniciarTreinoIntervalado');
    if(btnIniciar){
      btnIniciar.onclick = function(){
        startLiveIntervalSession(iv);
      };
    }

    // Salvar Manualmente sem Timer
    var btnSalvarI = document.getElementById('btnSalvarTreinoIntervalado');
    if(btnSalvarI){
      btnSalvarI.onclick = function(){
        var calc = calcIntervalRunTotal(iv);
        if(calc.totalDurationSec <= 0 || calc.totalDistKm <= 0){
          toast('Configure parâmetros de intervalos válidos.');
          return;
        }

        var newCorrida = {
          id: Date.now(),
          date: (inIDate && inIDate.value) || iv.data || todayISO(),
          hora: new Date().toTimeString().slice(0, 5),
          mode: 'intervalada',
          tipo: 'intervalada',
          distanciaKm: calc.totalDistKm,
          duracaoSeg: calc.totalDurationSec,
          paceMinKm: calc.paceFormatted,
          ritmoMedioSegKm: calc.avgPaceSec,
          velocidadeMediaKmh: calc.avgSpeedKmh,
          calorias: calc.kcal,
          intervalos: {
            tiroMin: iv.tiroMin,
            tiroSec: iv.tiroSec,
            tiroKmh: iv.tiroKmh,
            recupMin: iv.recupMin,
            recupSec: iv.recupSec,
            recupKmh: iv.recupKmh,
            ciclos: iv.ciclos,
            warmupMin: iv.warmupMin,
            warmupSec: iv.warmupSec,
            warmupKmh: iv.warmupKmh,
            cooldownMin: iv.cooldownMin,
            cooldownSec: iv.cooldownSec,
            cooldownKmh: iv.cooldownKmh
          },
          notas: (inINotas ? inINotas.value : iv.notas) || ''
        };

        state.corridas = state.corridas || [];
        state.corridas.push(newCorrida);
        save();
        celebrate();
        toast('Sessão intervalada registrada! ⚡');
        render();
      };
    }
  }

  // 7. Expansão e Exclusão no Histórico de Corridas
  document.querySelectorAll('.sess[data-cid]').forEach(function(el){
    el.onclick = function(){
      el.classList.toggle('open');
    };
  });

  document.querySelectorAll('[data-delcorrida]').forEach(function(btn){
    btn.onclick = function(ev){
      ev.stopPropagation();
      var id = Number(btn.getAttribute('data-delcorrida'));
      dlg({
        title: 'Apagar corrida',
        sub: 'Esta sessão de corrida será excluída do histórico.',
        dangerous: true,
        ok: 'Apagar',
        onOk: function(){
          var idx = (state.corridas || []).findIndex(function(c){ return c.id === id; });
          if(idx >= 0){
            lastDeletedCorrida = { corrida: state.corridas[idx], index: idx };
            state.corridas.splice(idx, 1);
            save();
            toastWithUndo('Corrida apagada');
            render();
          }
        }
      });
    };
  });
}

function toastWithUndo(msg){
  var t = document.getElementById('toast');
  if(!t){
    toast(msg);
    return;
  }
  t.innerHTML = esc(msg) + ' <button id="toastUndoBtn" style="background:#ffffff;color:#09090b;border:0;padding:3px 10px;border-radius:999px;margin-left:8px;font-weight:700;font-size:11px;cursor:pointer">DESFAZER</button>';
  t.classList.add('show');
  clearTimeout(t._tm);

  var undoBtn = document.getElementById('toastUndoBtn');
  if(undoBtn){
    undoBtn.onclick = function(e){
      e.stopPropagation();
      if(lastDeletedCorrida){
        state.corridas = state.corridas || [];
        state.corridas.splice(lastDeletedCorrida.index, 0, lastDeletedCorrida.corrida);
        save();
        lastDeletedCorrida = null;
        toast('Corrida restaurada ✓');
        render();
      }
    };
  }

  t._tm = setTimeout(function(){ t.classList.remove('show'); }, 4000);
}

function decorateCorrida(){
  // Hook de decoração visual caso necessário
}

// Exportações para compatibilidade em ambientes Node.js / testes
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    calcPaceSec: calcPaceSec,
    fmtPace: fmtPace,
    calcSpeedKmh: calcSpeedKmh,
    calcCaloriesBurned: calcCaloriesBurned,
    calcIntervalRunTotal: calcIntervalRunTotal,
    weekCardioDistance: weekCardioDistance,
    buildIntervalPhases: buildIntervalPhases,
    getLatestWeight: getLatestWeight,
    renderCorrida: renderCorrida,
    bindCorrida: bindCorrida
  };
}
