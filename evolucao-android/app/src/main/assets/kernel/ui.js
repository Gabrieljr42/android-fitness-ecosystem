/* kernel/ui.js — calendário, toast, diálogo, celebração, rest timer */
/* ---------- calendário próprio (não depende do widget nativo) ---------- */
var WD=['D','S','T','Q','Q','S','S'];
var MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
var DOWFULL=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
function dowShort(iso){ return DOWFULL[new Date(iso+'T00:00:00').getDay()].slice(0,3); }
function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function isoOf(y,m,day){ return y+'-'+String(m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'); }
function openCal(iso){ var p=iso.split('-'); calMonth={y:+p[0], m:+p[1]-1}; calOpen=true; }
function calendarHTML(selectedISO){
  var y=calMonth.y, m=calMonth.m;
  var first=new Date(y,m,1).getDay();
  var dim=daysInMonth(y,m);
  var todayIso=todayISO();
  var cells='';
  for(var i=0;i<first;i++) cells+='<div class="calcell blank">·</div>';
  for(var day=1; day<=dim; day++){
    var iso=isoOf(y,m,day);
    var cls='calcell'+(iso===todayIso?' today':'')+(iso===selectedISO?' sel':'');
    cells+='<div class="'+cls+'" data-iso="'+iso+'">'+day+'</div>';
  }
  return '<div class="calpop"><div class="calhead"><button class="calnav" id="calPrev">‹</button>'+
    '<span>'+MONTHS[m]+' '+y+'</span><button class="calnav" id="calNext">›</button></div>'+
    '<div class="calwd">'+WD.map(function(w){return '<div>'+w+'</div>';}).join('')+'</div>'+
    '<div class="calgrid">'+cells+'</div>'+
    '<button class="cta sm" id="calToday" style="width:100%;margin-top:10px">Hoje</button></div>';
}

/* ---------- rest timer (timestamp-based, sobrevive a re-render) ---------- */
var rest={end:0, remain:0, on:false, done:false, iv:null, label:''};
function restLeft(){ return rest.on ? Math.max(0,(rest.end-Date.now())/1000) : rest.remain; }
function nativeRestStart(){
  try{ if(window.AndroidBridge && window.AndroidBridge.startRestNotification) window.AndroidBridge.startRestNotification(String(rest.label||''), Math.round(Number(rest.end)), !!(state.settings && state.settings.alarm)); }catch(e){}
}
function nativeRestStop(){
  try{ if(window.AndroidBridge && window.AndroidBridge.stopRestNotification) window.AndroidBridge.stopRestNotification(); }catch(e){}
}
function nativeRestDone(){
  try{ if(window.AndroidBridge && window.AndroidBridge.restDoneNotification) window.AndroidBridge.restDoneNotification(String(rest.label||''), !!(state.settings && state.settings.alarm)); }catch(e){}
}
function paintRest(){
  var el=document.getElementById('rest');
  document.getElementById('rTime').textContent=fmtClock(restLeft());
  document.getElementById('rLbl').textContent=rest.done?'pronto!':'descanso';
  el.classList.toggle('done', rest.done);
  el.classList.toggle('paused', !rest.on && !rest.done);
  /* barra de progresso (design de referência): pill com preenchimento */
  var bar=el.querySelector('.rbar i');
  if(bar){ var pct = rest.remain>0 ? Math.min(100,Math.max(0,restLeft()/rest.remain*100)) : (rest.done?100:0); bar.style.width=pct+'%'; }
  /* timer sempre logo abaixo do cabeçalho (nunca no meio da tela) */
  var hdr=document.querySelector('header');
  if(hdr){
    el.style.top=(hdr.getBoundingClientRect().bottom + 8)+'px';
  }
  document.body.classList.toggle('rest-up', !el.classList.contains('hidden') && document.body.classList.contains('workout-active'));
}
function restTick(){
  if(!rest.on) return;
  if(restLeft()<=0){ rest.on=false; rest.done=true; rest.remain=0; clearInterval(rest.iv); onRestDone(); }
  paintRest();
}
function startRest(sec, label){
  rest.end=Date.now()+sec*1000; rest.remain=sec; rest.on=true; rest.done=false; rest.label=label||'';
  document.getElementById('rest').classList.remove('hidden');
  nativeRestStart();
  paintRest();
  clearInterval(rest.iv); rest.iv=setInterval(restTick,250);
}
function adjustRest(delta){
  if(rest.done){ rest.done=false; rest.on=true; rest.end=Date.now()+Math.max(5,delta)*1000; nativeRestStart(); }
  else if(rest.on){ rest.end+=delta*1000; if(restLeft()<=0){ rest.end=Date.now()+1; } nativeRestStart(); }
  else { rest.remain=Math.max(0,rest.remain+delta); }
  paintRest();
}
function toggleRest(){
  if(rest.done){ hideRest(); return; }
  if(rest.on){ rest.remain=restLeft(); rest.on=false; nativeRestStop(); }
  else { rest.end=Date.now()+rest.remain*1000; rest.on=true; nativeRestStart(); }
  paintRest();
}
function hideRest(){ rest.on=false; rest.done=false; clearInterval(rest.iv); nativeRestStop(); document.getElementById('rest').classList.add('hidden'); }
function onRestDone(){
  vibrate([140,70,140,70,220]);
  nativeRestDone();
  if(window.AndroidBridge){ if(state.settings.alarm) beep(); toast('Descanso concluído — bora!'); return; }
  if(state.settings.alarm){ beep(); notify('Descanso concluído 💪', (rest.label?rest.label+' — ':'')+'Hora da próxima série!'); }
  toast('⏱ Descanso concluído — bora!');
}
function initRest(){
  document.getElementById('rMinus').onclick=function(){ initAudio(); adjustRest(-15); };
  document.getElementById('rPlus').onclick=function(){ initAudio(); adjustRest(15); };
  document.getElementById('rTap').onclick=function(){ initAudio(); toggleRest(); };
  document.getElementById('rClose').onclick=hideRest;
}
function initLiveTimer(){
  setInterval(function(){
    var el=document.getElementById('liveDur');
    if(el && state.draft && state.draft.startedAt){
      el.textContent='⏱ '+fmtDur((Date.now()-state.draft.startedAt)/1000)+' treinando';
    }
  }, 1000);
}
