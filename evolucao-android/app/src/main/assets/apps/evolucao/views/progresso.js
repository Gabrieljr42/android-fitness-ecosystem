/* apps/evolucao/views/progresso.js */
/* ---------- PROGRESSO ---------- */
function renderProgresso(){
  var exs=allExercises();
  if(!progressEx || exs.indexOf(progressEx)<0) progressEx=exs[0]||'';
  var weekStart=new Date(), monday=(weekStart.getDay()+6)%7; weekStart.setDate(weekStart.getDate()-monday); weekStart.setHours(0,0,0,0);
  var weekSessions=state.sessions.filter(function(s){ return new Date(s.date+'T00:00:00')>=weekStart; });
  var weekSets=0; weekSessions.forEach(function(s){ Object.keys(s.entries||{}).forEach(function(name){ weekSets+=workSets(s.entries[name]||[]).length; }); });
  var targetSets=state.ficha.A.ex.concat(state.ficha.B.ex,state.ficha.C.ex).reduce(function(a,e){ return a+e.sets; },0);
  var pct=targetSets?Math.min(100,Math.round(weekSets/targetSets*100)):0;
  var recent=sortedSessions().slice(-6).reverse();
  var h='<div class="mf-dashboard-head"><div><span class="mf-eyebrow">Resumo da semana</span><h1>Dashboard</h1><div class="sub">Treine com clareza. Progrida com consistência.</div></div><span class="mf-dashboard-mark">'+weekSessions.length+'</span></div>';
  h+='<div class="mf-dash-rings"><div class="mf-dash-ring" style="--pct:'+pct+'%"><div><b>'+pct+'%</b><small>sets alvo</small></div></div><div class="mf-dash-stat"><b>'+weekSets+'</b><small>séries esta semana</small></div><div class="mf-dash-stat"><b>'+state.sessions.length+'</b><small>treinos registrados</small></div></div>';
  h+='<div class="mf-dash-section"><div class="mf-dash-section-head"><h2>Registros recentes</h2><span>últimos treinos</span></div><div class="mf-recent-records">';
  if(!recent.length) h+='<div class="mf-recent-empty">Seu primeiro treino aparece aqui.</div>';
  recent.forEach(function(s){
    var vol=0, sets=0; Object.keys(s.entries||{}).forEach(function(name){ workSets(s.entries[name]||[]).forEach(function(x){ vol+=x.w*x.r; sets++; }); });
    var bar=Math.min(100,Math.round((vol/5000)*100));
    h+='<div class="mf-recent-row"><span class="mf-recent-date">'+fmtBR(s.date)+'</span><div class="mf-recent-bar"><i style="width:'+bar+'%"></i></div><b>'+nkg(vol)+' kg</b><small>'+sets+' sets</small></div>';
  });
  h+='</div></div>';
  h+='<h2>Evolução por exercício</h2>';
  h+='<div class="card"><select id="exSel">'+exs.map(function(e){return '<option'+(e===progressEx?' selected':'')+'>'+esc(e)+'</option>';}).join('')+'</select>'+
    '<div style="height:10px"></div><div class="seg">'+
    '<button data-m="max" class="'+(metric==='max'?'on':'')+'">Carga máx</button>'+
    '<button data-m="e1rm" class="'+(metric==='e1rm'?'on':'')+'">Força (1RM)</button>'+
    '<button data-m="vol" class="'+(metric==='vol'?'on':'')+'">Volume</button></div><div style="height:12px"></div>';
  var pts=[];
  sortedSessions().forEach(function(s){
    var sets=entryForExercise(s,progressEx); if(!sets||!sets.length) return;
    var work=workSets(sets);
    if(!work.length) return;
    var v;
    if(metric==='max') v=Math.max.apply(null,work.map(function(x){return x.w;}));
    else if(metric==='e1rm') v=Math.max.apply(null,work.map(function(x){return e1rm(x.w,x.r);}));
    else v=work.reduce(function(a,x){return a+x.w*x.r;},0);
    pts.push({x:s.date, y:Math.round(v*10)/10});
  });
  if(pts.length<2){
    h+='<div class="empty"><svg viewBox="0 0 24 24"><polyline points="4 18 9 13 13 15.5 20 7"/><polyline points="16 7 20 7 20 11"/><line x1="4" y1="21" x2="20" y2="21"/></svg><div class="t">Sem dados ainda</div><div class="s">Registre séries de treino na aba Treino para ver sua evolução aqui.</div></div>';
  } else {
  h+=chartSVG(pts, '#ffffff');
  if(pts.length>=2){
    var f=pts[0].y, l=pts[pts.length-1].y, diff=l-f, pct=f?Math.round(diff/f*1000)/10:0, cls=diff>=0?'pos':'neg', sg=diff>=0?'+':'';
    h+='<div class="stat"><div><div class="v">'+nkg(f)+'</div><div class="l">início</div></div>'+
      '<div><div class="v">'+nkg(l)+'</div><div class="l">atual</div></div>'+
      '<div><div class="v '+cls+'">'+sg+pct+'%</div><div class="l">evolução</div></div></div>';
  }
  } // fim do else pts.length<2
  h+='</div>';
  h+='<h2>Peso corporal</h2><div class="card"><div class="row">'+
    '<div class="step" style="flex:1"><button id="pMinus">−</button>'+
    '<input id="pesoIn" type="number" inputmode="decimal" step="0.1" min="0" placeholder="kg" value="'+(state.peso.length?state.peso.slice().sort(function(a,b){return a.date<b.date?-1:1;})[state.peso.length-1].kg:'')+'"><button id="pPlus">+</button></div>'+
    '<button class="cta sm" id="pesoAdd" style="flex:0 0 auto;width:auto;padding:12px 16px">Salvar hoje</button></div><div style="height:12px"></div>';
  var pp=state.peso.slice().sort(function(a,b){return a.date<b.date?-1:1;}).map(function(p){return {x:p.date,y:p.kg};});
  if(pp.length<2){
    h+='<div class="empty"><svg viewBox="0 0 24 24"><path d="M6 3v18"/><circle cx="16" cy="16" r="5"/><line x1="16" y1="13" x2="16" y2="19"/></svg><div class="t">Nenhuma pesagem</div><div class="s">Registre seu peso hoje para acompanhar a tendência ao longo do tempo.</div></div>';
  } else {
  h+=chartSVG(pp,'#ffffff');
  if(pp.length) h+='<div class="sub" style="margin:10px 0 0">Último: <b style="color:var(--txt)">'+nkg(pp[pp.length-1].y)+' kg</b> · '+fmtBRfull(pp[pp.length-1].x)+'</div>';
  }
  h+='<div class="hint">Bulking limpo: ~0,25–0,5 kg por semana. Pese-se em jejum, 1–2×/semana.</div></div>';
  return h;
}
function bindProgresso(){
  document.getElementById('exSel').onchange=function(e){ progressEx=e.target.value; render(); };
  document.querySelectorAll('[data-m]').forEach(function(b){ b.onclick=function(){ metric=b.getAttribute('data-m'); render(); }; });
  document.getElementById('pMinus').onclick=function(){ var el=document.getElementById('pesoIn'); el.value=Math.max(0,Math.round(((parseFloat(el.value)||0)-0.1)*10)/10); };
  document.getElementById('pPlus').onclick=function(){ var el=document.getElementById('pesoIn'); el.value=Math.round(((parseFloat(el.value)||0)+0.1)*10)/10; };
  document.getElementById('pesoAdd').onclick=function(){
    var kg=parseFloat(document.getElementById('pesoIn').value);
    if(isNaN(kg)||kg<=0){ toast('Digite um peso válido'); return; }
    var t=todayISO(); state.peso=state.peso.filter(function(p){return p.date!==t;});
    state.peso.push({date:t, kg:kg}); save(); vibrate(15); toast('Peso registrado'); render();
  };
}
