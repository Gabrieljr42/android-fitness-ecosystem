/* ==========================================================================
   KERNEL UI — Calendar, Rest Timer, Toast, Dialog & Live Duration
   ========================================================================== */

var calMonth = typeof calMonth !== 'undefined' ? calMonth : null;
var calOpen = typeof calOpen !== 'undefined' ? calOpen : false;
var WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
var MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
var DOWFULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function dowShort(iso) { 
  return DOWFULL[new Date(iso + 'T00:00:00').getDay()].slice(0, 3); 
}

function daysInMonth(y, m) { 
  return new Date(y, m + 1, 0).getDate(); 
}

function isoOf(y, m, day) { 
  return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0'); 
}

function openCal(iso) { 
  var p = iso.split('-'); 
  calMonth = { y: +p[0], m: +p[1] - 1 }; 
  calOpen = true; 
}

function calendarHTML(selectedISO) {
  var y = calMonth.y, m = calMonth.m;
  var first = new Date(y, m, 1).getDay();
  var dim = daysInMonth(y, m);
  var todayIso = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);
  var cells = '';
  
  for (var i = 0; i < first; i++) {
    cells += '<div class="calcell blank">·</div>';
  }
  for (var day = 1; day <= dim; day++) {
    var iso = isoOf(y, m, day);
    var cls = 'calcell' + (iso === todayIso ? ' today' : '') + (iso === selectedISO ? ' sel' : '');
    cells += '<div class="' + cls + '" data-iso="' + iso + '">' + day + '</div>';
  }
  
  return '<div class="calpop">' +
    '<div class="calhead"><button class="calnav" id="calPrev" type="button">‹</button>' +
    '<span>' + MONTHS[m] + ' ' + y + '</span><button class="calnav" id="calNext" type="button">›</button></div>' +
    '<div class="calwd">' + WD.map(function(w) { return '<div>' + w + '</div>'; }).join('') + '</div>' +
    '<div class="calgrid">' + cells + '</div>' +
    '<button class="cta sm" id="calToday" type="button" style="width:100%;margin-top:10px">Hoje</button>' +
    '</div>';
}

/* ---------- Rest Timer (Timestamp-based, sobrevive a re-render) ---------- */
var rest = { end: 0, remain: 0, on: false, done: false, iv: null, label: '' };

function restLeft() { 
  return rest.on ? Math.max(0, (rest.end - Date.now()) / 1000) : rest.remain; 
}

function nativeRestStart() {
  try { 
    if (window.AndroidBridge && window.AndroidBridge.startRestNotification) {
      window.AndroidBridge.startRestNotification(
        String(rest.label || ''), 
        Math.round(Number(rest.end)), 
        !!(typeof state !== 'undefined' && state.settings && state.settings.alarm)
      ); 
    }
  } catch (e) {}
}

function nativeRestStop() {
  try { 
    if (window.AndroidBridge && window.AndroidBridge.stopRestNotification) {
      window.AndroidBridge.stopRestNotification(); 
    }
  } catch (e) {}
}

function nativeRestDone() {
  try { 
    if (window.AndroidBridge && window.AndroidBridge.restDoneNotification) {
      window.AndroidBridge.restDoneNotification(
        String(rest.label || ''), 
        !!(typeof state !== 'undefined' && state.settings && state.settings.alarm)
      ); 
    }
  } catch (e) {}
}

function paintRest() {
  var el = document.getElementById('rest');
  if (!el) return;
  
  var rTime = document.getElementById('rTime');
  var rLbl = document.getElementById('rLbl');
  if (rTime) rTime.textContent = typeof fmtClock === 'function' ? fmtClock(restLeft()) : String(Math.round(restLeft()));
  if (rLbl) rLbl.textContent = rest.done ? 'pronto!' : 'descanso';
  
  el.classList.toggle('done', rest.done);
  el.classList.toggle('paused', !rest.on && !rest.done);
  
  var bar = el.querySelector('.rbar i');
  if (bar) { 
    var pct = rest.remain > 0 ? Math.min(100, Math.max(0, restLeft() / rest.remain * 100)) : (rest.done ? 100 : 0); 
    bar.style.width = pct + '%'; 
  }
}

function restTick() {
  if (!rest.on) return;
  if (restLeft() <= 0) { 
    rest.on = false; 
    rest.done = true; 
    rest.remain = 0; 
    clearInterval(rest.iv); 
    onRestDone(); 
  }
  paintRest();
}

function wearRestPublish() {
  try { if (typeof window !== 'undefined' && window.EvolucaoWear && window.EvolucaoWear.schedulePublish) window.EvolucaoWear.schedulePublish(); } catch (_) {}
}

function startRest(sec, label) {
  rest.end = Date.now() + sec * 1000; 
  rest.remain = sec; 
  rest.on = true; 
  rest.done = false; 
  rest.paused = false;
  rest.label = label || '';
  
  var el = document.getElementById('rest');
  if (el) el.classList.remove('hidden');
  
  nativeRestStart();
  paintRest();
  wearRestPublish();
  clearInterval(rest.iv); 
  rest.iv = setInterval(restTick, 250);
}

function adjustRest(delta) {
  if (rest.done) { 
    rest.done = false; 
    rest.on = true; 
    rest.end = Date.now() + Math.max(5, delta) * 1000; 
    nativeRestStart(); 
  } else if (rest.on) { 
    rest.end += delta * 1000; 
    if (restLeft() <= 0) { 
      rest.end = Date.now() + 1; 
    } 
    nativeRestStart(); 
    wearRestPublish();
  } else { 
    rest.remain = Math.max(0, rest.remain + delta); 
  }
  paintRest();
}

function toggleRest() {
  if (rest.done) { 
    hideRest(); 
    return; 
  }
  if (rest.on) { 
    rest.remain = restLeft(); 
    rest.on = false; 
    rest.paused = true;
    nativeRestStop(); 
    wearRestPublish();
  } else { 
    rest.end = Date.now() + rest.remain * 1000; 
    rest.on = true; 
    rest.paused = false;
    nativeRestStart(); 
    wearRestPublish();
  }
  paintRest();
}

function hideRest() { 
  rest.on = false; 
  rest.done = false; 
  rest.paused = false;
  rest.remain = 0;
  clearInterval(rest.iv); 
  nativeRestStop(); 
  wearRestPublish();
  var el = document.getElementById('rest');
  if (el) el.classList.add('hidden'); 
}

function onRestDone() {
  if (typeof vibrate === 'function') vibrate([140, 70, 140, 70, 220]);
  nativeRestDone();
  
  var hasAlarm = typeof state !== 'undefined' && state.settings && state.settings.alarm;
  if (window.AndroidBridge) { 
    if (hasAlarm && typeof beep === 'function') beep(); 
    if (typeof toast === 'function') toast('Descanso concluído — bora!'); 
    return; 
  }
  if (hasAlarm) { 
    if (typeof beep === 'function') beep(); 
    if (typeof notify === 'function') notify('Descanso concluído 💪', (rest.label ? rest.label + ' — ' : '') + 'Hora da próxima série!'); 
  }
  if (typeof toast === 'function') toast('⏱ Descanso concluído — bora!');
}

function initRest() {
  var rMinus = document.getElementById('rMinus');
  var rPlus = document.getElementById('rPlus');
  var rTap = document.getElementById('rTap');
  var rClose = document.getElementById('rClose');
  
  if (rMinus) rMinus.onclick = function() { if (typeof initAudio === 'function') initAudio(); adjustRest(-15); };
  if (rPlus) rPlus.onclick = function() { if (typeof initAudio === 'function') initAudio(); adjustRest(15); };
  if (rTap) rTap.onclick = function() { if (typeof initAudio === 'function') initAudio(); toggleRest(); };
  if (rClose) rClose.onclick = hideRest;
}

function initLiveTimer() {
  setInterval(function() {
    if (typeof checkDraftInactivity === 'function') {
      var reset = checkDraftInactivity();
      if (reset) {
        var elReset = document.getElementById('liveDur');
        if (elReset) elReset.textContent = 'Pronto para registrar';
        if (typeof render === 'function') render();
        return;
      }
    }
    var el = document.getElementById('liveDur');
    if (el && typeof state !== 'undefined' && state.draft && state.draft.startedAt) {
      el.textContent = '⏱ ' + (typeof fmtDur === 'function' ? fmtDur((Date.now() - state.draft.startedAt) / 1000) : '') + ' treinando';
    } else if (el && typeof state !== 'undefined' && state.draft && !state.draft.startedAt) {
      el.textContent = 'Pronto para registrar';
    }
  }, 1000);
}
