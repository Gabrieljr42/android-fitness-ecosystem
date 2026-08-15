/* kernel/fmt.js — escape, formatação e áudio/vibração */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---------- diálogo customizado (substitui prompt/confirm do browser) ---------- */
var dlgQueue=null;
function dlg(cfg){
  var back=document.getElementById('dlgBack'), box=document.getElementById('dlg');
  var T='<h3>'+esc(cfg.title||'')+'</h3>';
  var S='<div class="dsub">'+esc(cfg.sub||'')+'</div>';
  var A=[];
  if(cfg.input){ A.push('<input class="txt" id="dlgIn" type="'+(cfg.num?'number':'text')+'" '+(cfg.num?'inputmode="decimal" step="0.5"':'')+' value="'+esc(cfg.value||'')+'" placeholder="'+esc(cfg.ph||'')+'">'); }
  if(cfg.seg){ A.push('<div class="seg">'+cfg.seg.map(function(o,i){ return '<button type="button" data-si="'+i+'" class="'+(cfg.segVal===o?'on':'')+'">'+esc(o)+'</button>'; }).join('')+'</div>'); }
  if(cfg.dangerous) A.push('<div class="drow"><button type="button" class="ghost" id="dlgCancel">Cancelar</button><button type="button" class="dg" id="dlgOk">'+esc(cfg.ok||'Confirmar')+'</button></div>');
  else if(cfg.cancel===false) A.push('<div class="drow"><button type="button" class="ok" id="dlgOk">'+esc(cfg.ok||'OK')+'</button></div>');
  else A.push('<div class="drow"><button type="button" class="ghost" id="dlgCancel">Cancelar</button><button type="button" class="ok" id="dlgOk">'+esc(cfg.ok||'Salvar')+'</button></div>');
  box.innerHTML=T+S+A.join('');
  box._val=cfg.value||'';
  box._segVal=cfg.segVal||null;
  back.classList.add('show');
  var inp=document.getElementById('dlgIn');
  if(inp){ inp.focus(); try{ inp.setSelectionRange(inp.value.length,inp.value.length); }catch(e){} }
  document.getElementById('dlgOk').onclick=function(){ var v=inp?inp.value:(box._segVal==null?true:box._segVal); dlgClose(); if(cfg.onOk) cfg.onOk(v); };
  var cn=document.getElementById('dlgCancel'); if(cn) cn.onclick=function(){ dlgClose(); if(cfg.onCancel) cfg.onCancel(); };
  if(cfg.seg) box.querySelectorAll('[data-si]').forEach(function(b){ b.onclick=function(){ box._segVal=cfg.seg[+b.getAttribute('data-si')]; box.querySelectorAll('[data-si]').forEach(function(x){ x.classList.toggle('on',x===b); }); }; });
  if(inp) inp.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); document.getElementById('dlgOk').click(); } };
}
function dlgClose(){ document.getElementById('dlgBack').classList.remove('show'); }
document.getElementById('dlgBack').onclick=function(e){ if(e.target===this) dlgClose(); };
function boxSel(){ return document.getElementById('dlg')._segVal; }
function dlgAskSide(){ var out={v:false}; dlg({title:'Carga por lado?', sub:'Se sim, o app registra a carga de cada lado separadamente (ex.: halteres).', onOk:function(){ out.v=true; }, onCancel:function(){ out.v=false; }}); return out; }

/* ---------- celebração: pulso do badge de recorde + confete discreto ---------- */
function celebrate(){
  var reduced=typeof window!=='undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced) return;
  var pr=document.querySelector('.pr.pulse');
  if(!pr){ var prs=document.querySelectorAll('.pr'); if(prs.length){ pr=prs[prs.length-1]; pr.classList.add('pulse'); } }
  var c=document.getElementById('confetti');
  c.innerHTML=''; c.classList.add('on');
  var colors=['#4ade80','#22c55e','#fbbf24','#60a5fa','#eaf0f7'];
  for(var i=0;i<14;i++){
    var d=document.createElement('i');
    d.style.left=(4+Math.random()*92)+'%';
    d.style.background=colors[i%colors.length];
    d.style.animationDelay=(Math.random()*.45)+'s';
    d.style.opacity=.9;
    c.appendChild(d);
  }
  clearTimeout(c._tm); c._tm=setTimeout(function(){ c.classList.remove('on'); },2400);
}
function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fmtBR(iso){ var p=iso.split('-'); return p[2]+'/'+p[1]; }
function fmtBRfull(iso){ var p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function nkg(n){ return (Math.round(n*10)/10).toString().replace('.',','); }
function fmtClock(s){ s=Math.max(0,Math.round(s)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
function fmtDur(sec){
  sec=Math.max(0,Math.round(sec));
  var m=Math.floor(sec/60);
  if(m<1) return '<1 min';
  if(m<60) return m+' min';
  var h=Math.floor(m/60), mm=m%60;
  return h+'h'+(mm?' '+mm+'min':'');
}
function e1rm(w,r){ return r>1 ? w*(1+r/30) : w; }
function vibrate(ms){
  try{ if(typeof navigator!=='undefined' && navigator.vibrate) navigator.vibrate(ms); }catch(e){}
  try{ if(typeof window!=='undefined' && window.AndroidBridge && window.AndroidBridge.vibrate){ var d=Array.isArray(ms)?ms.reduce(function(a,b){return a+b;},0):ms; window.AndroidBridge.vibrate(d|0); } }catch(e){}
}

/* ---- áudio + notificação (silenciosa no sistema — o único som é o beep abaixo) ---- */
var audioCtx=null;
function initAudio(){
  try{
    if(!audioCtx && (window.AudioContext||window.webkitAudioContext)) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
  }catch(e){}
}
function beep(){
  if(!audioCtx) return;
  [[0,880],[0.22,880],[0.44,1175]].forEach(function(p){
    var o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination); o.type='sine'; o.frequency.value=p[1];
    var t0=audioCtx.currentTime+p[0];
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.exponentialRampToValueAtTime(0.45,t0+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+0.16);
    o.start(t0); o.stop(t0+0.18);
  });
}
function askNotify(){ try{ if(typeof Notification!=='undefined' && Notification.permission==='default') Notification.requestPermission(); }catch(e){} }
function notify(title, body){
  try{ if(typeof window!=='undefined' && window.AndroidBridge && window.AndroidBridge.sendNotification){ window.AndroidBridge.sendNotification(String(title), String(body)); return; } }catch(e){}
  try{ if(typeof Notification!=='undefined' && Notification.permission==='granted') new Notification(title, {body:body, tag:'evo-rest', renotify:true, silent:true}); }catch(e){}
}

function toast(msg){
  var t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._tm); t._tm=setTimeout(function(){ t.classList.remove('show'); },1900);
}
