/* apps/evolucao/views/progresso.js */
/* ---------- PROGRESSO & DAVELY BLE SCALE INTEGRATION (Milestone M4) ---------- */

// -----------------------------------------------------------------------------
// 9-State Finite State Machine (FSM) & Session Protection Model
// States: IDLE, REQUESTING_PERMISSION, SCANNING, WAITING_FOR_SCALE, MEASURING, STABLE, SAVING, DONE, ERROR
// -----------------------------------------------------------------------------
var scaleSm = {
  current: 'IDLE',
  scanning: false,
  measurementSessionId: null,
  stableMeasurementHandled: false,
  liveWeightKg: null,
  lockedWeightKg: null,
  lockedImpedanceRaw: 0,
  lockedMac: null,
  errorMessage: null,
  errorCode: null,
  watchdogTimer: null,
  timeoutSec: 45,
  lastTelemetry: null
};

if (typeof window !== 'undefined') {
  window.scaleSm = scaleSm;
}

function stopScaleWatchdog() {
  if (scaleSm.watchdogTimer) {
    clearTimeout(scaleSm.watchdogTimer);
    scaleSm.watchdogTimer = null;
  }
}

function startScaleWatchdog() {
  stopScaleWatchdog();
  scaleSm.watchdogTimer = setTimeout(function() {
    if (scaleSm.current === 'SCANNING' || scaleSm.current === 'WAITING_FOR_SCALE' || scaleSm.current === 'MEASURING') {
      var bridge = (typeof window !== 'undefined' && window.AndroidBridge) ? window.AndroidBridge : null;
      try {
        if (bridge && typeof bridge.stopScaleMeasurement === 'function') {
          bridge.stopScaleMeasurement();
        }
      } catch (e) {}
      scaleSm.scanning = false;
      scaleSm.current = 'ERROR';
      scaleSm.errorCode = 408;
      scaleSm.errorMessage = 'Tempo limite esgotado (45s). Nenhuma balança detectada.';
      updateScaleUi();
    }
  }, scaleSm.timeoutSec * 1000);
}

function startScaleMeasurementFlow() {
  var bridge = (typeof window !== 'undefined' && window.AndroidBridge) ? window.AndroidBridge : null;
  var hasPerms = true;
  if (bridge && typeof bridge.hasBlePermissions === 'function') {
    try {
      hasPerms = bridge.hasBlePermissions();
    } catch (e) {
      hasPerms = false;
    }
  }

  if (!hasPerms) {
    scaleSm.current = 'REQUESTING_PERMISSION';
    try {
      if (bridge && typeof bridge.requestBlePermissions === 'function') {
        bridge.requestBlePermissions();
      }
    } catch (e) {
      scaleSm.current = 'ERROR';
      scaleSm.errorCode = 105;
      scaleSm.errorMessage = 'Erro ao solicitar permissões Bluetooth';
    }
    updateScaleUi();
    return;
  }

  initiateScaleScan();
}

function initiateScaleScan() {
  stopScaleWatchdog();
  scaleSm.current = 'SCANNING';
  scaleSm.scanning = true;
  scaleSm.measurementSessionId = 'scale_session_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
  scaleSm.stableMeasurementHandled = false;
  scaleSm.liveWeightKg = null;
  scaleSm.lockedWeightKg = null;
  scaleSm.lockedImpedanceRaw = 0;
  scaleSm.lockedMac = null;
  scaleSm.errorMessage = null;
  scaleSm.errorCode = null;

  var bridge = (typeof window !== 'undefined' && window.AndroidBridge) ? window.AndroidBridge : null;
  try {
    if (bridge && typeof bridge.startScaleMeasurement === 'function') {
      bridge.startScaleMeasurement();
    }
  } catch (e) {
    scaleSm.scanning = false;
    scaleSm.current = 'ERROR';
    scaleSm.errorCode = 105;
    scaleSm.errorMessage = 'Erro ao iniciar medição BLE: ' + (e.message || e);
    updateScaleUi();
    return;
  }

  startScaleWatchdog();
  scaleSm.current = 'WAITING_FOR_SCALE';
  updateScaleUi();
}

function cancelScaleMeasurement() {
  stopScaleWatchdog();
  var bridge = (typeof window !== 'undefined' && window.AndroidBridge) ? window.AndroidBridge : null;
  if (scaleSm.scanning && bridge) {
    try {
      if (typeof bridge.stopScaleMeasurement === 'function') {
        bridge.stopScaleMeasurement();
      }
    } catch (e) {}
  }
  scaleSm.current = 'IDLE';
  scaleSm.scanning = false;
  scaleSm.liveWeightKg = null;
  scaleSm.lockedWeightKg = null;
  scaleSm.lockedImpedanceRaw = 0;
  scaleSm.lockedMac = null;
  scaleSm.stableMeasurementHandled = false;
  scaleSm.errorMessage = null;
  scaleSm.errorCode = null;
  updateScaleUi();
}

function retryScaleMeasurement() {
  stopScaleWatchdog();
  startScaleMeasurementFlow();
}

function saveScaleMeasurement() {
  if (scaleSm.current !== 'STABLE' || scaleSm.lockedWeightKg == null) return;
  scaleSm.current = 'SAVING';
  var t = (typeof todayISO === 'function') ? todayISO() : new Date().toISOString().split('T')[0];
  if (typeof state !== 'undefined' && state && Array.isArray(state.peso)) {
    state.peso = state.peso.filter(function(p) { return p.date !== t; });
    state.peso.push({
      date: t,
      kg: scaleSm.lockedWeightKg,
      impedanceRaw: scaleSm.lockedImpedanceRaw || 0,
      embeddedMac: scaleSm.lockedMac || null,
      source: 'ble'
    });
  }
  if (typeof save === 'function') save();
  if (typeof vibrate === 'function') vibrate(15);
  if (typeof toast === 'function') toast('Peso registrado');
  scaleSm.current = 'DONE';
  scaleSm.current = 'IDLE';
  scaleSm.scanning = false;
  if (typeof render === 'function') render();
  else updateScaleUi();
}

// -----------------------------------------------------------------------------
// Global Native Bridge Event Callbacks
// -----------------------------------------------------------------------------
function onScaleMeasurement(packet) {
  if (!scaleSm.scanning) return;
  if (scaleSm.current === 'IDLE' || scaleSm.current === 'DONE' || scaleSm.current === 'ERROR') return;
  if (!packet || typeof packet.weightKg !== 'number') return;
  if (packet.weightKg < 5.0) return; // step-off / tare noise filter

  if (!packet.stable) {
    scaleSm.current = 'MEASURING';
    scaleSm.liveWeightKg = packet.weightKg;
    startScaleWatchdog(); // Reset watchdog on live traffic
    updateScaleUi();
  } else {
    if (scaleSm.stableMeasurementHandled) {
      return; // Session duplicate suppression: drop identical stable burst packets
    }
    scaleSm.stableMeasurementHandled = true;
    stopScaleWatchdog();
    scaleSm.current = 'STABLE';
    scaleSm.liveWeightKg = packet.weightKg;
    scaleSm.lockedWeightKg = packet.weightKg;
    scaleSm.lockedImpedanceRaw = packet.impedanceRaw || 0;
    scaleSm.lockedMac = packet.embeddedMac || null;
    scaleSm.scanning = false;

    var bridge = (typeof window !== 'undefined' && window.AndroidBridge) ? window.AndroidBridge : null;
    try {
      if (bridge && typeof bridge.stopScaleMeasurement === 'function') {
        bridge.stopScaleMeasurement();
      }
    } catch (e) {}

    if (typeof vibrate === 'function') vibrate(15);
    updateScaleUi();
  }
}

function onScaleStateChanged(data) {
  if (!data) return;
  if (data.scanning !== undefined) {
    scaleSm.scanning = !!data.scanning;
  }
  if (data.state === 'IDLE' && scaleSm.current !== 'STABLE' && scaleSm.current !== 'ERROR' && scaleSm.current !== 'SAVING') {
    scaleSm.current = 'IDLE';
    updateScaleUi();
  }
}

function onScaleError(err) {
  stopScaleWatchdog();
  scaleSm.scanning = false;
  scaleSm.current = 'ERROR';
  scaleSm.errorCode = err ? (err.code || 100) : 100;
  scaleSm.errorMessage = err ? (err.message || err.msg || 'Erro no scanner BLE') : 'Erro no scanner BLE';
  var bridge = (typeof window !== 'undefined' && window.AndroidBridge) ? window.AndroidBridge : null;
  try {
    if (bridge && typeof bridge.stopScaleMeasurement === 'function') {
      bridge.stopScaleMeasurement();
    }
  } catch (e) {}
  updateScaleUi();
}

function onScalePermissionResult(granted) {
  if (scaleSm.current !== 'REQUESTING_PERMISSION') return;
  if (granted) {
    initiateScaleScan();
  } else {
    stopScaleWatchdog();
    scaleSm.scanning = false;
    scaleSm.current = 'ERROR';
    scaleSm.errorCode = 103;
    scaleSm.errorMessage = 'Permissão Bluetooth não concedida.';
    updateScaleUi();
  }
}

function onScaleTelemetry(data) {
  if (data) scaleSm.lastTelemetry = data;
}

if (typeof window !== 'undefined') {
  window.onScaleMeasurement = onScaleMeasurement;
  window.onScaleStateChanged = onScaleStateChanged;
  window.onScaleError = onScaleError;
  window.onScalePermissionResult = onScalePermissionResult;
  window.onScaleTelemetry = onScaleTelemetry;
}

// -----------------------------------------------------------------------------
// Dynamic UI Synchronization
// -----------------------------------------------------------------------------
function updateScaleUi() {
  if (typeof document === 'undefined') return;
  var card = document.getElementById('bleScaleCard');
  var btnWrap = document.getElementById('bleMeasureBtnWrap');
  if (!card) {
    if (typeof render === 'function') render();
    return;
  }

  var isBleActive = (scaleSm.current !== 'IDLE');
  if (btnWrap) btnWrap.style.display = isBleActive ? 'none' : 'block';
  card.style.display = isBleActive ? 'block' : 'none';

  var cardCls = 'ble-scale-card';
  if (scaleSm.current === 'MEASURING' || scaleSm.current === 'SCANNING' || scaleSm.current === 'WAITING_FOR_SCALE') {
    cardCls += ' measuring';
  } else if (scaleSm.current === 'STABLE') {
    cardCls += ' stable';
  } else if (scaleSm.current === 'ERROR') {
    cardCls += ' error';
  }
  card.className = cardCls;

  var badge = document.getElementById('bleScaleBadge');
  var weightEl = document.getElementById('bleLiveWeight');
  var statusEl = document.getElementById('bleScaleStatus');
  var actionsEl = document.getElementById('bleScaleActions');

  var badgeText = 'Buscando...';
  var statusText = 'Suba na balança com pés descalços';
  var weightHtml = '--.- <small>kg</small>';

  if (scaleSm.current === 'REQUESTING_PERMISSION') {
    badgeText = 'Permissão';
    statusText = 'Solicitando permissão Bluetooth no sistema...';
  } else if (scaleSm.current === 'WAITING_FOR_SCALE' || scaleSm.current === 'SCANNING') {
    badgeText = 'Buscando...';
    statusText = 'Suba na balança para iniciar a pesagem';
  } else if (scaleSm.current === 'MEASURING') {
    badgeText = 'Pesando...';
    statusText = 'Pesando... Permaneça imóvel na balança';
    if (scaleSm.liveWeightKg != null) {
      var formattedLive = (typeof nkg === 'function') ? nkg(scaleSm.liveWeightKg) : scaleSm.liveWeightKg;
      weightHtml = formattedLive + ' <small>kg</small>';
    }
  } else if (scaleSm.current === 'STABLE') {
    badgeText = 'Estabilizado ✓';
    statusText = 'Peso estabilizado com sucesso!';
    if (scaleSm.lockedWeightKg != null) {
      var formattedLocked = (typeof nkg === 'function') ? nkg(scaleSm.lockedWeightKg) : scaleSm.lockedWeightKg;
      weightHtml = formattedLocked + ' <small>kg</small>';
    }
  } else if (scaleSm.current === 'ERROR') {
    badgeText = 'Erro' + (scaleSm.errorCode ? ' ' + scaleSm.errorCode : '');
    statusText = scaleSm.errorMessage || 'Falha na medição com a balança';
  }

  if (badge) badge.textContent = badgeText;
  if (weightEl) weightEl.innerHTML = weightHtml;
  if (statusEl) statusEl.textContent = statusText;

  var bioEl = document.getElementById('bleScaleBio');
  if (scaleSm.current === 'STABLE' && scaleSm.lockedImpedanceRaw > 0) {
    if (!bioEl) {
      var wrap = card.querySelector('.ble-live-weight-wrap');
      if (wrap) {
        bioEl = document.createElement('div');
        bioEl.id = 'bleScaleBio';
        bioEl.className = 'ble-scale-bio';
        wrap.appendChild(bioEl);
      }
    }
    if (bioEl) bioEl.textContent = 'Bioimpedância: ' + scaleSm.lockedImpedanceRaw + ' raw counts';
  } else if (bioEl && bioEl.parentNode) {
    bioEl.parentNode.removeChild(bioEl);
  }

  if (actionsEl) {
    var showActions = (scaleSm.current === 'STABLE' || scaleSm.current === 'ERROR' || scaleSm.current === 'WAITING_FOR_SCALE' || scaleSm.current === 'MEASURING' || scaleSm.current === 'REQUESTING_PERMISSION');
    actionsEl.style.display = showActions ? 'flex' : 'none';

    var showSaveBtn = (scaleSm.current === 'STABLE');
    var showRetryBtn = (scaleSm.current === 'STABLE' || scaleSm.current === 'ERROR');
    var cancelLabel = (scaleSm.current === 'ERROR') ? 'Fechar' : 'Cancelar';

    actionsEl.innerHTML = (showSaveBtn ? '<button class="cta sm" id="btnSaveBleWeight" style="flex:2;background:var(--ok);color:#09090b">Salvar</button>' : '') +
      (showRetryBtn ? '<button class="bigbtn secondary sm" id="btnRetryBleWeight" style="flex:1">Repetir</button>' : '') +
      '<button class="bigbtn secondary sm" id="btnCancelBleWeight" style="flex:1">' + cancelLabel + '</button>';

    var bSave = document.getElementById('btnSaveBleWeight') || document.getElementById('pConfirmSaveBtn');
    if (bSave) bSave.onclick = function() { saveScaleMeasurement(); };
    var bRetry = document.getElementById('btnRetryBleWeight') || document.getElementById('pRetryScaleBtn');
    if (bRetry) bRetry.onclick = function() { retryScaleMeasurement(); };
    var bCancel = document.getElementById('btnCancelBleWeight') || document.getElementById('pCancelScaleBtn');
    if (bCancel) bCancel.onclick = function() { cancelScaleMeasurement(); };
  }
}

// -----------------------------------------------------------------------------
// View Rendering Pipeline
// -----------------------------------------------------------------------------
function renderProgresso() {
  var exs = (typeof allExercises === 'function') ? allExercises() : [];
  if (typeof progressEx === 'undefined' || !progressEx || exs.indexOf(progressEx) < 0) {
    progressEx = exs[0] || '';
  }
  var weekStart = new Date(), monday = (weekStart.getDay() + 6) % 7; weekStart.setDate(weekStart.getDate() - monday); weekStart.setHours(0, 0, 0, 0);
  var sessionsList = (typeof state !== 'undefined' && state && state.sessions) ? state.sessions : [];
  var weekSessions = sessionsList.filter(function(s) { return new Date(s.date + 'T00:00:00') >= weekStart; });
  var weekSets = 0;
  weekSessions.forEach(function(s) {
    Object.keys(s.entries || {}).forEach(function(name) {
      if (typeof workSets === 'function') {
        weekSets += workSets(s.entries[name] || []).length;
      }
    });
  });

  var targetSets = 0;
  if (typeof state !== 'undefined' && state && state.ficha && state.ficha.A && state.ficha.B && state.ficha.C) {
    targetSets = state.ficha.A.ex.concat(state.ficha.B.ex, state.ficha.C.ex).reduce(function(a, e) { return a + (e.sets || 0); }, 0);
  }
  var pct = targetSets ? Math.min(100, Math.round(weekSets / targetSets * 100)) : 0;
  var recent = (typeof sortedSessions === 'function') ? sortedSessions().slice(-6).reverse() : [];
  var h = '<div class="mf-dashboard-head"><div><span class="mf-eyebrow">Resumo da semana</span><h1>Dashboard</h1><div class="sub">Treine com clareza. Progrida com consistência.</div></div><span class="mf-dashboard-mark">' + weekSessions.length + '</span></div>';
  h += '<div class="mf-dash-rings"><div class="mf-dash-ring" style="--pct:' + pct + '%"><div><b>' + pct + '%</b><small>sets alvo</small></div></div><div class="mf-dash-stat"><b>' + weekSets + '</b><small>séries esta semana</small></div><div class="mf-dash-stat"><b>' + sessionsList.length + '</b><small>treinos registrados</small></div></div>';
  h += '<div class="mf-dash-section"><div class="mf-dash-section-head"><h2>Registros recentes</h2><span>últimos treinos</span></div><div class="mf-recent-records">';
  if (!recent.length) h += '<div class="mf-recent-empty">Seu primeiro treino aparece aqui.</div>';
  recent.forEach(function(s) {
    var vol = 0, sets = 0;
    Object.keys(s.entries || {}).forEach(function(name) {
      if (typeof workSets === 'function') {
        workSets(s.entries[name] || []).forEach(function(x) { vol += (x.w || 0) * (x.r || 0); sets++; });
      }
    });
    var bar = Math.min(100, Math.round((vol / 5000) * 100));
    var dateFormatted = (typeof fmtBR === 'function') ? fmtBR(s.date) : s.date;
    var volFormatted = (typeof nkg === 'function') ? nkg(vol) : vol;
    h += '<div class="mf-recent-row"><span class="mf-recent-date">' + dateFormatted + '</span><div class="mf-recent-bar"><i style="width:' + bar + '%"></i></div><b>' + volFormatted + ' kg</b><small>' + sets + ' sets</small></div>';
  });
  h += '</div></div>';

  // Evolução por exercício
  h += '<h2>Evolução por exercício</h2>';
  var escFn = (typeof esc === 'function') ? esc : function(x) { return x; };
  var metricVal = (typeof metric !== 'undefined') ? metric : 'max';
  h += '<div class="card"><select id="exSel">' + exs.map(function(e) { return '<option' + (e === progressEx ? ' selected' : '') + '>' + escFn(e) + '</option>'; }).join('') + '</select>' +
    '<div style="height:10px"></div><div class="seg">' +
    '<button data-m="max" class="' + (metricVal === 'max' ? 'on' : '') + '">Carga máx</button>' +
    '<button data-m="e1rm" class="' + (metricVal === 'e1rm' ? 'on' : '') + '">Força (1RM)</button>' +
    '<button data-m="vol" class="' + (metricVal === 'vol' ? 'on' : '') + '">Volume</button></div><div style="height:12px"></div>';

  var pts = [];
  if (typeof sortedSessions === 'function') {
    sortedSessions().forEach(function(s) {
      var sets = (typeof entryForExercise === 'function') ? entryForExercise(s, progressEx) : (s.entries && s.entries[progressEx]);
      if (!sets || !sets.length) return;
      var work = (typeof workSets === 'function') ? workSets(sets) : sets;
      if (!work.length) return;
      var v = 0;
      if (metricVal === 'max') v = Math.max.apply(null, work.map(function(x) { return x.w || 0; }));
      else if (metricVal === 'e1rm') v = Math.max.apply(null, work.map(function(x) { return (typeof e1rm === 'function') ? e1rm(x.w || 0, x.r || 0) : (x.w || 0); }));
      else v = work.reduce(function(a, x) { return a + ((x.w || 0) * (x.r || 0)); }, 0);
      pts.push({ x: s.date, y: Math.round(v * 10) / 10 });
    });
  }

  if (pts.length < 2) {
    h += '<div class="empty"><svg viewBox="0 0 24 24"><polyline points="4 18 9 13 13 15.5 20 7"/><polyline points="16 7 20 7 20 11"/><line x1="4" y1="21" x2="20" y2="21"/></svg><div class="t">Sem dados ainda</div><div class="s">Registre séries de treino na aba Treino para ver sua evolução aqui.</div></div>';
  } else {
    if (typeof chartSVG === 'function') h += chartSVG(pts, '#ffffff');
    if (pts.length >= 2) {
      var f = pts[0].y, l = pts[pts.length - 1].y, diff = l - f, pctVal = f ? Math.round(diff / f * 1000) / 10 : 0, cls = diff >= 0 ? 'pos' : 'neg', sg = diff >= 0 ? '+' : '';
      var fStr = (typeof nkg === 'function') ? nkg(f) : f;
      var lStr = (typeof nkg === 'function') ? nkg(l) : l;
      h += '<div class="stat"><div><div class="v">' + fStr + '</div><div class="l">início</div></div>' +
        '<div><div class="v">' + lStr + '</div><div class="l">atual</div></div>' +
        '<div><div class="v ' + cls + '">' + sg + pctVal + '%</div><div class="l">evolução</div></div></div>';
    }
  }
  h += '</div>';

  // -------------------------------------------------------------------------
  // PESO CORPORAL SECTION (BLE Scale & Manual Entry)
  // -------------------------------------------------------------------------
  h += '<h2>Peso corporal</h2>';
  h += '<div class="card">';

  // Medir com a Balança CTA (visible when IDLE)
  var showMeasureBtn = (scaleSm.current === 'IDLE');
  h += '<div id="bleMeasureBtnWrap" style="' + (showMeasureBtn ? 'margin-bottom:14px' : 'display:none;margin-bottom:14px') + '">' +
    '<button class="cta" id="btnBleMeasure" style="display:flex;align-items:center;justify-content:center;gap:8px;background:#ffffff;color:#09090b;width:100%">' +
    '<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2"><path d="M6 3v18"/><circle cx="16" cy="16" r="5"/><line x1="16" y1="13" x2="16" y2="19"/></svg>' +
    'Medir com a balança' +
    '</button>' +
    '</div>';

  // BLE Scale Measurement Card
  var isBleActive = (scaleSm.current !== 'IDLE');
  var cardCls = 'ble-scale-card';
  if (scaleSm.current === 'MEASURING' || scaleSm.current === 'SCANNING' || scaleSm.current === 'WAITING_FOR_SCALE') {
    cardCls += ' measuring';
  } else if (scaleSm.current === 'STABLE') {
    cardCls += ' stable';
  } else if (scaleSm.current === 'ERROR') {
    cardCls += ' error';
  }

  var badgeText = 'Buscando...';
  var statusText = 'Suba na balança com pés descalços';
  var weightHtml = '--.- <small>kg</small>';

  if (scaleSm.current === 'REQUESTING_PERMISSION') {
    badgeText = 'Permissão';
    statusText = 'Solicitando permissão Bluetooth no sistema...';
  } else if (scaleSm.current === 'WAITING_FOR_SCALE' || scaleSm.current === 'SCANNING') {
    badgeText = 'Buscando...';
    statusText = 'Suba na balança para iniciar a pesagem';
  } else if (scaleSm.current === 'MEASURING') {
    badgeText = 'Pesando...';
    statusText = 'Pesando... Permaneça imóvel na balança';
    if (scaleSm.liveWeightKg != null) {
      var formattedLive2 = (typeof nkg === 'function') ? nkg(scaleSm.liveWeightKg) : scaleSm.liveWeightKg;
      weightHtml = formattedLive2 + ' <small>kg</small>';
    }
  } else if (scaleSm.current === 'STABLE') {
    badgeText = 'Estabilizado ✓';
    statusText = 'Peso estabilizado com sucesso!';
    if (scaleSm.lockedWeightKg != null) {
      var formattedLocked2 = (typeof nkg === 'function') ? nkg(scaleSm.lockedWeightKg) : scaleSm.lockedWeightKg;
      weightHtml = formattedLocked2 + ' <small>kg</small>';
    }
  } else if (scaleSm.current === 'ERROR') {
    badgeText = 'Erro' + (scaleSm.errorCode ? ' ' + scaleSm.errorCode : '');
    statusText = scaleSm.errorMessage || 'Falha na medição com a balança';
  }

  var showActions = (scaleSm.current === 'STABLE' || scaleSm.current === 'ERROR' || scaleSm.current === 'WAITING_FOR_SCALE' || scaleSm.current === 'MEASURING' || scaleSm.current === 'REQUESTING_PERMISSION');
  var showSaveBtn = (scaleSm.current === 'STABLE');
  var showRetryBtn = (scaleSm.current === 'STABLE' || scaleSm.current === 'ERROR');
  var cancelLabel = (scaleSm.current === 'ERROR') ? 'Fechar' : 'Cancelar';

  h += '<div class="' + cardCls + '" id="bleScaleCard" style="' + (isBleActive ? '' : 'display:none') + '">' +
    '<div class="ble-scale-header">' +
    '<div class="ble-scale-title">Balança Davely</div>' +
    '<div class="ble-scale-badge" id="bleScaleBadge">' + badgeText + '</div>' +
    '</div>' +
    '<div class="ble-live-weight-wrap">' +
    '<div class="ble-live-weight" id="bleLiveWeight">' + weightHtml + '</div>' +
    '<div class="ble-scale-status" id="bleScaleStatus">' + statusText + '</div>';

  if (scaleSm.current === 'STABLE' && scaleSm.lockedImpedanceRaw > 0) {
    h += '<div class="ble-scale-bio" id="bleScaleBio">Bioimpedância: ' + scaleSm.lockedImpedanceRaw + ' raw counts</div>';
  }

  h += '</div>' +
    '<div class="ble-scale-actions" id="bleScaleActions" style="' + (showActions ? 'display:flex' : 'display:none') + '">' +
    (showSaveBtn ? '<button class="cta sm" id="btnSaveBleWeight" style="flex:2;background:var(--ok);color:#09090b">Salvar</button>' : '') +
    (showRetryBtn ? '<button class="bigbtn secondary sm" id="btnRetryBleWeight" style="flex:1">Repetir</button>' : '') +
    '<button class="bigbtn secondary sm" id="btnCancelBleWeight" style="flex:1">' + cancelLabel + '</button>' +
    '</div>' +
    '</div>';

  // Manual weight input controls (100% backward compatible)
  var pesoList = (typeof state !== 'undefined' && state && Array.isArray(state.peso)) ? state.peso : [];
  var lastWeightVal = (pesoList.length ? pesoList.slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; })[pesoList.length - 1].kg : '');

  h += '<div class="row">' +
    '<div class="step" style="flex:1"><button id="pMinus">−</button>' +
    '<input id="pesoIn" type="number" inputmode="decimal" step="0.1" min="0" placeholder="kg" value="' + lastWeightVal + '"><button id="pPlus">+</button></div>' +
    '<button class="cta sm" id="pesoAdd" style="flex:0 0 auto;width:auto;padding:12px 16px">Salvar hoje</button></div><div style="height:12px"></div>';

  var pp = pesoList.slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; }).map(function(p) { return { x: p.date, y: p.kg }; });

  // Diário | Semanal (tendência p/ bulking — média diária→semanal)
  var viewMode = (typeof pesoViewMode !== 'undefined' && pesoViewMode === 'semanal') ? 'semanal' : 'diario';
  h += '<div class="seg" style="margin-bottom:10px">' +
    '<button data-pvm="diario" class="' + (viewMode === 'diario' ? 'on' : '') + '">Diário</button>' +
    '<button data-pvm="semanal" class="' + (viewMode === 'semanal' ? 'on' : '') + '">Semanal</button></div>';

  if (viewMode === 'semanal') {
    h += renderPesoSemanal(pesoList);
  } else if (pp.length < 2) {
    h += '<div class="empty"><svg viewBox="0 0 24 24"><path d="M6 3v18"/><circle cx="16" cy="16" r="5"/><line x1="16" y1="13" x2="16" y2="19"/></svg><div class="t">Nenhuma pesagem</div><div class="s">Registre seu peso hoje para acompanhar a tendência ao longo do tempo.</div></div>';
  } else {
    if (typeof chartSVG === 'function') h += chartSVG(pp, '#ffffff');
    if (pp.length) {
      var lastKgStr = (typeof nkg === 'function') ? nkg(pp[pp.length - 1].y) : pp[pp.length - 1].y;
      var lastDateStr = (typeof fmtBRfull === 'function') ? fmtBRfull(pp[pp.length - 1].x) : pp[pp.length - 1].x;
      h += '<div class="sub" style="margin:10px 0 0">Último: <b style="color:var(--txt)">' + lastKgStr + ' kg</b> · ' + lastDateStr + '</div>';
    }
  }

  h += '<div class="hint">Bulking limpo: ~0,25–0,5 kg por semana. Pese-se em jejum, 1–2×/semana.</div>' +
    '<div style="margin-top:10px"><button class="rpill" id="pBleDiagBtn" style="width:100%;justify-content:center;padding:8px 12px">🔬 Diagnóstico BLE da Balança Davely</button></div></div>';

  return h;
}

// -----------------------------------------------------------------------------
// Tendência semanal de peso (usa apps/evolucao/peso.js — agregação canônica)
// -----------------------------------------------------------------------------
var pesoViewMode = 'diario';

function renderPesoSemanal(pesoList) {
  var series = (typeof pesoWeeklySeries === 'function') ? pesoWeeklySeries(pesoList) : [];
  if (!series.length) {
    return '<div class="empty"><svg viewBox="0 0 24 24"><path d="M6 3v18"/><circle cx="16" cy="16" r="5"/><line x1="16" y1="13" x2="16" y2="19"/></svg><div class="t">Sem dados semanais</div><div class="s">Registre pesagens para ver a média semanal.</div></div>';
  }
  var cur = series[series.length - 1];
  var delta = (typeof pesoWeekDelta === 'function') ? pesoWeekDelta(series) : null;
  var trend = (typeof pesoTrendLabel === 'function') ? pesoTrendLabel(delta ? delta.deltaKg : null) : '';
  var recent = (typeof pesoRecentTrend === 'function') ? pesoRecentTrend(series, 4) : null;

  var h = '';
  // Semana atual
  h += '<div class="stat" style="margin-bottom:12px"><div>' +
    '<div class="v">' + (typeof nkg === 'function' ? nkg(cur.avg) : cur.avg) + '</div><div class="l">média da semana</div></div>' +
    '<div><div class="v ' + (delta && delta.deltaKg >= 0 ? 'pos' : 'neg') + '">' +
    (delta ? ((delta.deltaKg >= 0 ? '+' : '') + (typeof nkg === 'function' ? nkg(delta.deltaKg) : delta.deltaKg) + ' kg') : '—') +
    '</div><div class="l">' + (delta && !delta.contiguous ? 'vs. semana anterior*' : 'vs. semana anterior') + '</div></div>' +
    '<div><div class="v" style="font-size:14px">' + (trend ? trend : '—') + '</div><div class="l">tendência</div></div></div>';

  if (delta && !delta.contiguous) {
    h += '<div class="hint" style="margin:0 0 10px">*Semana anterior sem pesagens — comparação usa a última semana com dados.</div>';
  }
  if (delta && !delta.reliable) {
    h += '<div class="hint" style="margin:0 0 10px">⚠ Poucas pesagens em uma das semanas — tendência menos confiável.</div>';
  }

  // Gráfico semanal
  var pts = series.map(function(w) { return { x: w.weekStart, y: w.avg }; });
  if (pts.length >= 2 && typeof chartSVG === 'function') {
    h += chartSVG(pts, '#ffffff');
  } else {
    h += '<div class="hint" style="margin:8px 0">Mínimo de 2 semanas para o gráfico.</div>';
  }

  // Últimas 4 semanas
  if (recent) {
    var sign = recent.changeKg >= 0 ? '+' : '';
    h += '<div class="sub" style="margin:10px 0 6px">Últimas ' + recent.weeks + ' semanas</div>';
    h += '<div class="stat"><div><div class="v">' + (typeof nkg === 'function' ? nkg(recent.firstAvg) : recent.firstAvg) + '</div><div class="l">1ª média</div></div>' +
      '<div><div class="v">' + (typeof nkg === 'function' ? nkg(recent.lastAvg) : recent.lastAvg) + '</div><div class="l">última média</div></div>' +
      '<div><div class="v ' + (recent.changeKg >= 0 ? 'pos' : 'neg') + '">' + sign + (typeof nkg === 'function' ? nkg(recent.changeKg) : recent.changeKg) + ' kg</div><div class="l">variação</div></div></div>';
  }
  return h;
}

// -----------------------------------------------------------------------------
// DOM Event Binding
// -----------------------------------------------------------------------------
function bindProgresso() {
  if (typeof document === 'undefined') return;
  var exSel = document.getElementById('exSel');
  if (exSel) exSel.onchange = function(e) { progressEx = e.target.value; if (typeof render === 'function') render(); };

  document.querySelectorAll('[data-m]').forEach(function(b) {
    b.onclick = function() { metric = b.getAttribute('data-m'); if (typeof render === 'function') render(); };
  });

  document.querySelectorAll('[data-pvm]').forEach(function(b) {
    b.onclick = function() {
      pesoViewMode = b.getAttribute('data-pvm');
      if (typeof vibrate === 'function') vibrate(10);
      if (typeof render === 'function') render();
    };
  });

  var pMinus = document.getElementById('pMinus');
  if (pMinus) {
    pMinus.onclick = function() {
      var el = document.getElementById('pesoIn');
      if (el) el.value = Math.max(0, Math.round(((parseFloat(el.value) || 0) - 0.1) * 10) / 10);
    };
  }

  var pPlus = document.getElementById('pPlus');
  if (pPlus) {
    pPlus.onclick = function() {
      var el = document.getElementById('pesoIn');
      if (el) el.value = Math.round(((parseFloat(el.value) || 0) + 0.1) * 10) / 10;
    };
  }

  var pesoAdd = document.getElementById('pesoAdd');
  if (pesoAdd) {
    pesoAdd.onclick = function() {
      var el = document.getElementById('pesoIn');
      var kg = el ? parseFloat(el.value) : NaN;
      if (isNaN(kg) || kg <= 0) {
        if (typeof toast === 'function') toast('Digite um peso válido');
        return;
      }
      var t = (typeof todayISO === 'function') ? todayISO() : new Date().toISOString().split('T')[0];
      if (typeof state !== 'undefined' && state && Array.isArray(state.peso)) {
        state.peso = state.peso.filter(function(p) { return p.date !== t; });
        state.peso.push({ date: t, kg: kg });
      }
      if (typeof save === 'function') save();
      if (typeof vibrate === 'function') vibrate(15);
      if (typeof toast === 'function') toast('Peso registrado');
      if (typeof render === 'function') render();
    };
  }

  var btnMeasure = document.getElementById('btnBleMeasure') || document.getElementById('pStartScaleBtn');
  if (btnMeasure) {
    btnMeasure.onclick = function() { startScaleMeasurementFlow(); };
  }

  var btnSave = document.getElementById('btnSaveBleWeight') || document.getElementById('pConfirmSaveBtn');
  if (btnSave) {
    btnSave.onclick = function() { saveScaleMeasurement(); };
  }

  var btnRetry = document.getElementById('btnRetryBleWeight') || document.getElementById('pRetryScaleBtn');
  if (btnRetry) {
    btnRetry.onclick = function() { retryScaleMeasurement(); };
  }

  var btnCancel = document.getElementById('btnCancelBleWeight') || document.getElementById('pCancelScaleBtn');
  if (btnCancel) {
    btnCancel.onclick = function() { cancelScaleMeasurement(); };
  }

  var pBle = document.getElementById('pBleDiagBtn');
  if (pBle) {
    pBle.onclick = function() {
      var diag = (typeof window !== 'undefined' && window.BleDiag) ? window.BleDiag : (typeof BleDiag !== 'undefined' ? BleDiag : null);
      if (diag && typeof diag.open === 'function') {
        diag.open();
      }
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderProgresso: renderProgresso,
    bindProgresso: bindProgresso,
    scaleSm: scaleSm,
    startScaleMeasurementFlow: startScaleMeasurementFlow,
    initiateScaleScan: initiateScaleScan,
    cancelScaleMeasurement: cancelScaleMeasurement,
    retryScaleMeasurement: retryScaleMeasurement,
    saveScaleMeasurement: saveScaleMeasurement,
    stopScaleWatchdog: stopScaleWatchdog,
    startScaleWatchdog: startScaleWatchdog,
    updateScaleUi: updateScaleUi,
    onScaleMeasurement: onScaleMeasurement,
    onScaleStateChanged: onScaleStateChanged,
    onScaleError: onScaleError,
    onScalePermissionResult: onScalePermissionResult,
    onScaleTelemetry: onScaleTelemetry
  };
}
