/* apps/evolucao/views/treino.js */
/* ---------- TREINO (estilo MacroFactor Workouts) ---------- */
/* Tela única por exercício durante o treino: carrossel de exercícios,
   tabela de sets com meta automática, teclado numérico fixo com botão RIR. */

var mfEx = 0;                       // índice do exercício ativo no carrossel
var kbdBuf = '';                    // buffer do teclado numérico custom
var kbdMode = 'w';                  // 'w' carga | 'r' reps | 'p' parciais (legado)
var kbdOpen = false;                // teclado sob demanda (só quando editando algo)
var kbdEdit = null;                 // {si: index da série editada} | null (nova série)
var mfDetail = null;                // nome do exercício na página de detalhes
var mfPreview = false;              // resumo do treino antes de iniciar
var mfComplete = false;             // tela de conclusão após salvar a sessão
var mfCompleteSession = null;       // sessão recém-salva usada pela tela de conclusão
var mfKeepPlan = false;             // mantém as últimas cargas como padrão do plano
var mfNotes = {};                   // notas do treino por exercício (draft)

var RIR_COLORS = {0:'#ef4444', 1:'#f97316', 2:'#eab308', 3:'#a3e635', 4:'#4ade80', 5:'#22d3ee', 6:'#3b82f6'};

/* kernel/app.js chama decorateTreino() após cada render da aba Treino.
   No novo design o RIR já é nativo na tabela de séries, então este
   decorator não precisa fazer nada (placeholder de compatibilidade). */
function decorateTreino(){}

function rirColor(q){ return RIR_COLORS[q] || '#3b82f6'; }
function rirLabel(q){ return q==null ? '?' : (q>=6?'6+':String(q)); }
function mfRirFor(set){
  if(!set) return null;
  var v = set.rir !== undefined ? set.rir : (set.RIR !== undefined ? set.RIR : null);
  if(v===null || v===undefined || v==='') return null;
  v=parseFloat(v);
  if(!isFinite(v)) return null;
  return v>=6?6:Math.max(0,Math.min(5,v));
}

/* ---------- cabeçalho / resumo ---------- */
function setupBanner(){
  if(typeof window==='undefined' || !window.isSecureContext) return '';
  var parts=[];
  var ns=notifState();
  if(ns==='default') parts.push('<button class="cta sm" id="btnNotify" style="flex:1">🔔 Ativar notificações</button>');
  if(deferredPrompt) parts.push('<button class="cta sm" id="btnInstall" style="flex:1;background:var(--card2);color:var(--txt);box-shadow:none;border:1px solid var(--line)">📲 Instalar app</button>');
  if(!parts.length) return '';
  return '<div class="card mf-setupbanner" style="border-color:rgba(74,222,128,.4)"><div class="mf-setupcopy">Deixe pronto pra usar na academia:</div><div class="row">'+parts.join('')+'</div></div>';
}

function lastSummaryHTML(){
  if(!lastSummary || !state.ficha[lastSummary.day]) return '';
  if(lastSummary.mode==='curto') return '<div class="card" style="border-color:rgba(96,165,250,.42)"><div class="summaryline"><span class="summarybadge ok">CURTO</span><div><b>Treino curto registrado</b><div class="sub" style="margin:2px 0 0">As séries realizadas contam para o histórico, mas o volume faltante não penaliza suas metas.</div></div><button class="ic" id="dismissSummary">✕</button></div></div>';
  var day=state.ficha[lastSummary.day], items=[];
  day.ex.forEach(function(exo){
    var m=Progression.calcularMeta(state.ficha,state.sessions,lastSummary.day,exo.n,state.settings.progressao);
    if(m.status==='travado'||m.status==='volume-baixo') items.push('<div class="summaryline"><span class="summarybadge '+(m.status==='travado'?'stall':'low')+'">'+(m.status==='travado'?'TRAVADO':'VOLUME BAIXO')+'</span><div><b>'+esc(exo.n)+'</b><div class="sub" style="margin:2px 0 0">'+esc(m.motivo)+'</div></div></div>');
  });
  if(!items.length) items.push('<div class="summaryline"><span class="summarybadge ok">OK</span><div><b>Treino sem alertas</b><div class="sub" style="margin:2px 0 0">As metas foram atualizadas para a próxima sessão.</div></div></div>');
  return '<div class="card" style="border-color:rgba(251,191,36,.42)"><div class="ex-head"><div class="ex-name">Resumo de '+lastSummary.day+' · '+fmtBR(lastSummary.date)+'</div><button class="ic" id="dismissSummary">✕</button></div>'+items.join('')+'</div>';
}

/* ---------- carrossel de exercícios ---------- */
function carouselHTML(day, active){
  var exs=state.ficha[day].ex;
  var items=exs.map(function(exo,i){
    var sets=state.draft.entries[exo.n]||[], done=workSets(sets).length, met=done>=exo.sets;
    return '<div class="mf-item'+(i===active?' on':'')+'" data-mfex="'+i+'">'+
      '<div class="mf-photo">'+exIcon(exo.n)+'</div>'+
      '<div class="mf-cap'+(met?' met':'')+'">'+esc(exo.n.split(' ')[0])+'</div>'+
      (i===active?'<i class="mf-bar"></i>':'')+'</div>';
  }).join('');
  return '<div class="mf-carousel">'+items+
    '<div class="mf-item add" id="mfAddEx"><div class="mf-photo" style="border-style:dashed"><span style="font-size:22px;color:var(--mut)">+</span></div><div class="mf-cap">Adicionar</div></div></div>';
}

/* A linha da tabela representa o plano executável. Os placeholders não entram
   no estado salvo: só viram uma série real quando o usuário confirma. */
function mfPlaceholder(ex, n){
  var d=state.draft, exo=exerciseForName(ex,d.day), sets=workSets(d.entries[ex]||[]), last=sets[sets.length-1];
  var previous=lastEntry(ex,d.day), previousSets=previous?workSets(previous.sets||[]):[], previousLast=previousSets[previousSets.length-1];
  return {
    w:last?last.w:(exo&&exo.lastW!=null?exo.lastW:(previousLast?previousLast.w:null)),
    r:last?last.r:(exo&&exo.lastR!=null?exo.lastR:(previousLast?previousLast.r:null)),
    phantom:true, wu:false, warmup:false, done:false, __workIndex:n-1
  };
}
function mfCopyRow(set, entryIndex, workIndex){
  var row=Object.assign({},set); row.__entryIndex=entryIndex; row.__workIndex=workIndex; return row;
}
function mfSetRows(ex){
  var d=state.draft, real=d.entries[ex]||[], warmups=[], works=[], workIndex=0;
  real.forEach(function(set,index){
    if(isWarmup(set)) warmups.push(mfCopyRow(set,index,null));
    else { works.push(mfCopyRow(set,index,workIndex)); workIndex++; }
  });
  var out=warmups.slice(), exo=exerciseForName(ex,d.day), target=exo?exo.sets:0;
  works.forEach(function(row){ out.push(row); });
  for(var i=works.length;i<target;i++){
    var ph=mfPlaceholder(ex,i+1); ph.__entryIndex=-1; out.push(ph);
  }
  return out;
}
function mfEntryIndex(ex,rowIndex){
  var row=mfSetRows(ex)[rowIndex]; return row&&row.__entryIndex!=null?row.__entryIndex:-1;
}

function rirBarHTML(ex){
  var selected = kbdRir;
  if(selected==null && kbdEdit!=null){
    var current=mfSetRows(ex)[kbdEdit.si];
    selected=mfRirFor(current);
  }
  var values=[0,1,2,3,4,5,6,null];
  return '<div class="mf-rirbar"><div class="mf-rirbar-title">RIR realizado</div>'+values.map(function(q){
    var key=q==null?'?':(q===6?'6+':String(q));
    return '<button class="mf-rcirc'+(selected===q?' on':'')+'" data-rirsel="'+key+'" style="--rir:'+rirColor(q)+'" aria-label="RIR '+key+'">'+key+'</button>';
  }).join('')+'</div>';
}

/* ---------- render ---------- */
function renderTreino(){
  if(mfComplete) return renderComplete();
  if(mfDetail) return renderExDetail();
  ensureDraft();
  var d=state.draft, day=state.ficha[d.day];
  if(mfPreview) return renderPreview(d, day);
  if(mfEx<0 || mfEx>=day.ex.length) mfEx=0;
  var exo=day.ex[mfEx], ex=exo.n;
  var meta=Progression.calcularMeta(state.ficha,state.sessions,d.day,ex,state.settings.progressao);
  var sets=d.entries[ex]||[], setsWork=workSets(sets);
  var isPR = draftBestE1rm(ex) > bestE1rm(ex)+0.01 && draftBestE1rm(ex)>0;
  var totalDone=0, totalGoal=0;
  day.ex.forEach(function(e){ var s=workSets(d.entries[e.n]||[]); totalDone+=s.length; totalGoal+=e.sets; });
  var warmOn = !!d.warmupMode[ex];

  var h='<div class="mf-session"><div><span class="mf-eyebrow">Treino '+d.day+' · '+esc(day.nome)+'</span><strong>'+(d.startedAt?fmtDur((Date.now()-d.startedAt)/1000):'Pronto para registrar')+'</strong></div><div class="mf-sessioncount">'+totalDone+'<small>/'+totalGoal+' séries</small></div></div>';
  h+='<div class="mf-sessiontools"><div class="mf-days">';
  ['A','B','C'].forEach(function(k){ h+='<button class="mf-day'+(d.day===k?' on':'')+'" data-day="'+k+'">'+k+'</button>'; });
  h+='</div><button class="mf-tool" id="dateBtn">'+(d.date===todayISO()?'Hoje':fmtBR(d.date))+'</button><button class="mf-tool" data-session-mode="'+(d.sessionMode==='normal'?'curto':'normal')+'">'+(d.sessionMode==='curto'?'Curto':'Completo')+'</button><button class="mf-tool" id="mfPreviewBtn">Resumo</button></div>';
  h+=lastSummaryHTML();
  h+=setupBanner();
    if(calOpen) h+=calendarHTML(d.date);
  /* conteudo do treino (espaco reservado para o teclado fixo na base) */
  h+='<div class="mf-work">';
  /* carrossel */
  h+=carouselHTML(d.day, mfEx);

  /* cabeçalho do exercício */
  h+='<div class="mf-exhead"><div class="mf-exl" data-mfinfo="'+exo.id+'"><div class="mf-exas"><div class="mf-series">Série '+Math.min(setsWork.length+1,exo.sets)+' de '+exo.sets+'</div><div class="mf-extit">'+esc(ex)+'</div><div class="mf-exsub">'+(exo.reps+' reps por série · descanso '+fmtClock(exo.rest))+'</div></div></div></div>'+
    '<div class="mf-acts">'+
    '<button class="mf-act" data-mfinfo="'+exo.id+'" title="Histórico e progressão do exercício"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" stroke-width="2"/><line x1="8" y1="6" x2="8" y2="12" stroke="currentColor" stroke-width="2"/><line x1="12" y1="13" x2="16" y2="13" stroke="currentColor" stroke-width="2"/><line x1="12" y1="16.5" x2="16" y2="16.5" stroke="currentColor" stroke-width="2"/></svg>Info</button>'+
    '<button class="mf-act'+(warmOn?' warm':'')+'" data-warm="'+mfEx+'">Warm Up</button>'+
    '<button class="mf-act" data-mfnote="'+mfEx+'">Notas</button></div>';
  if(isPR) h+='<div class="pr" style="display:inline-block;margin:0 0 8px;padding:4px 10px">✦ RECORDE PESSOAL</div>';

  /* meta automática */
  h+='<div class="mf-metarow"><span class="mf-metachip '+metaCss(meta.status)+'" title="'+esc(meta.motivo)+'">'+metaLabel(meta,exo)+(meta.targetRir!=null?' · alvo '+meta.targetRir+' RIR':'')+'</span>'+
    (meta.carga!=null?'<span class="mf-metaauto">Auto · '+nkg(meta.carga)+' kg × '+meta.repsMeta+(exo.perSide?' / lado':'')+'</span>':'')+'</div>';

  /* tabela de sets (células Carga/Reps clicáveis; teclado abre sob demanda) */
  var nextSet = exo.sets + (setsWork.length >= exo.sets ? 1 : setsWork.length + 1);
  h+='<div class="mf-table"><div class="mf-th"><span>Set</span><span>Auto ⇄</span><span>Lb</span><span>Reps</span><span></span><span></span><span></span></div>'; /* header MF: Set · Auto ⇄ · Lb · Reps · RIR · ✓ */
  var showWork = 0;
  mfSetRows(ex).forEach(function(s,si){
    var ph=!!s.phantom;
    var wu = isWarmup(s);
    var q = ph?null:mfRirFor(s), qDisplay=ph?(meta.targetRir!=null?meta.targetRir:null):q;
    if(!wu) showWork++;
    h+='<div class="mf-setrow'+(wu?' wu':'')+(ph?' ph':'')+'">';
    h+='<div class="mf-idx">'+(wu?'AQ':String(showWork+(wu?0:0)))+'</div>';
    h+='<div class="mf-auto">'+(wu?'—':(meta.carga==null?'—':'<span class="mf-auto-arrow">&#8594;</span>'+nkg(meta.carga)+' kg x '+meta.repsMeta+'<b>+</b>'))+'</div>';
    h+='<div class="mf-cell mf-w'+(kbdEdit&&kbdEdit.si===si?' on':'')+(ph?' phc':'')+'" data-cell="w" data-row="'+si+'">'+(ph&&s.w==null?'–':nkg(s.w))+'</div>';
    h+='<div class="mf-cell mf-r'+(kbdEdit&&kbdEdit.si===si?' on':'')+(ph?' phc':'')+'" data-cell="r" data-row="'+si+'">'+(ph&&s.r==null?'–':s.r+(s.p?('+'+s.p+'p'):''))+'</div>';
    h+='<div class="mf-rir'+(ph?' phr':'')+'"'+(qDisplay!=null?' style="--rir:'+rirColor(qDisplay)+(q!=null?';background:'+rirColor(q)+';color:#fff':'')+'"':'')+'>'+rirLabel(qDisplay)+'</div>';
    h+='<button class="mf-chk'+(s.done?' done':'')+'" data-done="'+mfEx+':'+si+'" aria-label="'+(s.done?'Desmarcar':'Marcar')+' série'+(ph?' (registrar)':'')+'">'+(s.done?'&#10003;':'')+'</button>';
    h+='<button class="mf-rm" data-rm="'+mfEx+':'+si+'" title="Remover série">'+(ph?'':'✕')+'</button>';
    h+='</div>';
  });
  h+='<div class="mf-setrow mf-add-row" id="mfAddSet" style="justify-content:center"><div class="mf-idx">+</div></div>';
  h+='</div>';

  /* mapa RIR horizontal: a assinatura visual fica disponível sem abrir diálogo */
  h+=rirBarHTML(ex);

  /* controles rápidos */
  h+='<div class="mf-qrow" style="grid-template-columns:1fr 1fr">';
  h+='<button class="mf-q'+(warmOn?' warmq':'')+'" id="mfWarmAdd" style="'+(warmOn?'background:rgba(255,201,77,.16);border-color:var(--gold);color:var(--gold)':'')+'">🔥 Aquecimento</button>';
  h+='<button class="mf-q ghost" id="mfSwap" title="Mover o exercício no dia">⇄ Trocar ordem</button>';
  h+='</div>';

  /* teclado numérico custom (sob demanda: abre ao tocar numa célula) */
  if(kbdOpen) h+=kbdHTML(ex);

  /* finalizar */
  var n=0; Object.keys(d.entries).forEach(function(k){ n+=d.entries[k].length; });
  h+='<div class="mf-finish"><button class="cta" id="saveSess" style="box-shadow:none">✓ Finalizar treino'+(n?' · '+n+' séries':'')+'</button>'+
    '<div class="hint">Ao adicionar cada série, o timer de descanso começa sozinho e te avisa na hora certa.</div></div></div>';
  return h;
}

/* ---------- teclado numérico custom sob demanda (estilo MF) ---------- */
function kbdHTML(ex){
  var buf = mfKbdBuffer();
  var ctx = kbdEdit!=null ? (ex+' · Set '+(setLabelIdx(kbdEdit.si)+1)) : (ex+' · Nova série');
  var closeBtn = '<button class="mf-kclose" id="mfKbdClose" title="Fechar">✕</button>';
  return '<div class="mf-kbd open" id="mfKbd">'+
    '<div class="mf-khead">'+ctx+' '+closeBtn+'</div>'+
    '<div class="mf-kfield">'+
      '<button class="mf-kmod'+(kbdMode==='w'?' on':'')+'" data-kmod="w"><span class="mf-kmodv">'+buf.w+'</span>Carga</button>'+
      '<button class="mf-kmod'+(kbdMode==='r'?' on':'')+'" data-kmod="r"><span class="mf-kmodv">'+buf.r+'</span>Reps</button>'+
      '<button class="mf-kmod mf-ksw" id="mfKbdSwitch" data-kbd-switch title="Alternar carga e repetições">&#8596;</button>'+
      '<button class="mf-krir" id="mfRirBtn">RIR · '+rirLabel(mfRirSel())+'</button></div>'+ 
    '<div class="mf-kgrid">'+
      ['1','2','3','⇄','4','5','6','RIR','7','8','9','F','0','⌫','−','✓'].map(function(k){
        var cls='mf-key';
        if(k==='✓'||k==='F') cls+=' ok'; if(k==='⌫'||k==='−'||k==='RIR'||k==='⇄') cls+=' fn';
        var disp = k==='⇄' ? '&#128430;' : k;
        return '<button class="'+cls+'" data-key="'+k+'">'+disp+'</button>';
      }).join('')+'</div></div>';
}
function mfTempP(){ return mfKbdBuffer().p || '0'; }
function setLabelIdx(si){
  var d=state.draft, exo=state.ficha[d.day].ex[mfEx], row=mfSetRows(exo.n)[si];
  return row&&row.__workIndex!=null?row.__workIndex:0;
}
function kbdClose(){ kbdOpen=false; kbdEdit=null; render(); }
var kbdFresh=false; // buffer espelha série existente: próximo dígito substitui o valor
function kbdOpenFor(mode, si){ kbdMode=mode; kbdEdit=(si==null?null:{si:si}); kbdOpen=true;
  var d=state.draft, exo=state.ficha[d.day].ex[mfEx], rows=mfSetRows(exo.n), row=si==null?null:rows[si];
  if(kbdEdit&&row) kbdEdit.entryIndex=row.__entryIndex;
  kbdFresh=false;
  if(row){
    kbdW=row.w==null?'':String(row.w); kbdR=row.r==null?'':String(row.r); kbdP=row.p!=null?String(row.p):'0';
    kbdFresh=row.w!=null||row.r!=null;
  } else { kbdW=''; kbdR=''; kbdP='0'; }
  kbdRir=null; render();
  var row=document.querySelector('.mf-cell.on'); if(row) row.scrollIntoView({block:'nearest'});
  var kbd=document.getElementById('mfKbd'); if(kbd) kbd.classList.add('mf-kbdin');
}
function mfKbdBuffer(){
  /* buffer por modo persistido em variáveis */
  return {w: kbdW, r: kbdR, p: kbdP};
}
var kbdW='', kbdR='', kbdP='0';
function mfRirSel(){
  if(kbdRir!=null) return kbdRir;
  var d=state&&state.draft, exo=d&&d.day&&state.ficha[d.day]&&state.ficha[d.day].ex[mfEx];
  return exo?defaultRirFor(exo.n):2;
}
var kbdRir = null;            // seleção do modo RIR (null = número)

/* Atualiza somente o teclado já aberto. Digitar não deve substituir #app:
   isso preserva a posição, o foco e impede a animação de entrada de reiniciar. */
function syncKbdUI(){
  var kbd=document.getElementById('mfKbd');
  if(!kbd) return;
  var buf=mfKbdBuffer();
  ['w','r','p'].forEach(function(mode){
    var button=kbd.querySelector('[data-kmod="'+mode+'"]');
    if(!button) return;
    button.classList.toggle('on',kbdMode===mode);
    var value=button.querySelector('.mf-kmodv'); if(value) value.textContent=buf[mode];
  });
  var rir=document.getElementById('mfRirBtn');
  if(rir) rir.textContent='RIR · '+rirLabel(mfRirSel());
}

/* ---------- página de detalhes do exercício ---------- */
function renderExDetail(){
  var exo = mfDetailEx();
  if(!exo) { mfDetail=null; return renderTreino(); }
  var ex=exo.n;
  var pts=[]; var lastPts=[];
  sortedSessions().forEach(function(s){
    var sets=entryForExercise(s,ex); if(!sets||!sets.length) return;
    var work=workSets(sets); if(!work.length) return;
    var max=Math.max.apply(null,work.map(function(x){return x.w;}));
    pts.push({x:s.date, y:Math.round(max*10)/10});
    lastPts.push({date:s.date, sets:work, rirs:work.map(function(x){return mfRirFor(x);})});
  });
  var best=allTimeBest(ex), e1=bestE1rm(ex), prev=lastEntry(ex);
  var h='<div class="mf-detail"><div class="mf-detailhead"><button class="mf-back" id="mfBack">← Voltar</button></div>'+
    '<div class="mf-dexh"><div class="mf-ext" style="width:58px;height:58px;border-radius:14px">'+exIcon(ex)+'</div>'+
    '<div class="mf-exas"><div class="mf-extit" style="font-size:18px">'+esc(ex)+'</div>'+
    '<div class="mf-exsub">'+exo.reps+' reps por série · ⏱ '+fmtClock(exo.rest)+' · '+bestTotal(ex,exo)+'</div></div></div>';
  h+='<div class="stat" style="margin-top:10px"><div><div class="v">'+(best.w==null?'–':nkg(best.w)+'×'+best.r)+'</div><div class="l">melhor série</div></div>'+
    '<div><div class="v">'+(e1>0?nkg(e1):'–')+'</div><div class="l">1RM estimado</div></div>'+
    '<div><div class="v">'+pts.length+'</div><div class="l">sessões</div></div></div>';
  if(pts.length<2){
    h+='<div class="card" style="margin-top:12px"><div class="empty"><div class="big">📈</div><div class="t">Registre séries deste exercício</div><div class="s">Com 2 ou mais sessões você vê a curva de progressão aqui.</div></div></div>';
  } else {
    h+='<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Evolução da carga máxima</h2>'+chartSVG(pts,'#4d7cff')+'</div>';
  }
  /* histórico por sessão */
  h+='<h2>Últimas sessões</h2><div class="card">';
  if(!lastPts.length){
    h+='<div class="empty"><div class="t">Nada ainda</div><div class="s">Treine este exercício para ver o histórico aqui.</div></div>';
  }
  lastPts.slice().reverse().slice(0,10).forEach(function(lp){
    var rirs=lp.rirs.filter(function(q){return q!=null;});
    h+='<div class="mf-dsess"><div class="mf-dsdate"><b>'+fmtBRfull(lp.date)+'</b>'+(rirs.length?' <span class="rirtag" style="margin-left:6px">RIR '+rirs.join('/')+'</span>':'')+'</div>'+
      '<div class="mf-dssets">'+lp.sets.map(function(x){ return '<span class="chip">'+(isWarmup(x)?'<span class="wtag">AQ</span>':'')+
        '<b>'+nkg(x.w)+'</b><span class="n">kg × '+x.r+(x.p?('+'+x.p+'p'):'')+'</span></span>'; }).join('')+'</div></div>';
  });
  h+='</div></div>';
  return h;
}
function mfDetailEx(){
  var days=['A','B','C'];
  for(var d=0;d<days.length;d++){
    var list=state.ficha[days[d]].ex;
    for(var i=0;i<list.length;i++) if((list[i].id||exerciseIdFor(list[i].n))===mfDetail) return list[i];
  }
  return null;
}
function allTimeBest(ex){
  var b={w:null,r:0};
  state.sessions.forEach(function(s){ workSets(entryForExercise(s,ex)||[]).forEach(function(x){
    if(x.w>b.w || (x.w===b.w && x.r>b.r)) b={w:x.w,r:x.r};
  }); });
  workSets((state.draft.entries[ex]||[])).forEach(function(x){
    if(x.w>b.w || (x.w===b.w && x.r>b.r)) b={w:x.w,r:x.r};
  });
  return b;
}
function bestTotal(ex,exo){
  var b=allTimeBest(ex);
  return b.w==null ? 'Sem séries registradas' : 'Total: '+nkg(b.w*b.r)+' kg numa série';
}
function exerciseIdFor(name){ return name.toLowerCase().replace(/[^a-z0-9]+/g,'-'); }

/* ---------- decorate ---------- */
function metaCss(status){ return status==='subir'?'up':status==='travado'?'stall':status==='volume-baixo'?'low':status==='reduzir'?'down':status==='manter'?'keep':'initial'; }
function metaLabel(meta, exo){
  var side=exo.perSide?' por lado':'';
  if(meta.status==='subir') return '↑ '+(meta.carga==null?'?':nkg(meta.carga))+' kg'+side;
  if(meta.status==='manter') return '→ manter '+(meta.carga==null?'?':nkg(meta.carga))+' kg · buscar '+meta.repsMeta;
  if(meta.status==='reduzir') return '↓ '+(meta.carga==null?'?':nkg(meta.carga))+' kg'+side;
  if(meta.status==='travado') return '⚠ travado há '+(state.settings.progressao.stallSessions||3)+' sessões';
  if(meta.status==='volume-baixo') return '⚠ faltam séries';
  return '• base · reps '+meta.repsMeta;
}
function metaPlaceholder(meta){ return (meta.carga==null?'?':nkg(meta.carga))+' × '+meta.repsMeta; }

/* ---------- RIR (lógica do usuário preservada) ---------- */
function defaultRirFor(ex){
  var exo=exerciseForName(ex,state.draft&&state.draft.day);
  var cfg=state.settings.progressao;
  return exo&&exo.progressao&&exo.progressao.targetRir!=null ? exo.progressao.targetRir : cfg.targetRir;
}
function lastRirFor(ex){
  var d=state.draft, current=d.entries[ex]||[];
  for(var i=current.length-1;i>=0;i--) if(!isWarmup(current[i])&&mfRirFor(current[i])!==null) return mfRirFor(current[i]);
  return null;
}

function todosConcluidos(exIndex){
  var d=state.draft, exo=state.ficha[d.day].ex[exIndex], sets=workSets(d.entries[exo.n]||[]);
  return sets.length>=exo.sets && sets.every(function(set){ return set.done===true; });
}

/* ---------- bind ---------- */
function bindTreino(){
  if(mfComplete) return bindComplete();
  if(mfPreview) return bindPreview();
  if(mfDetail) return bindExDetail();
  var d=state.draft;
  var bn=document.getElementById('btnNotify'); if(bn) bn.onclick=enableNotify;
  var bi=document.getElementById('btnInstall'); if(bi) bi.onclick=doInstall;
  var ds=document.getElementById('dismissSummary'); if(ds) ds.onclick=function(){ lastSummary=null; render(); };
  document.querySelectorAll('[data-day]').forEach(function(b){ b.onclick=function(){
    var k=b.getAttribute('data-day'); if(k===d.day) return;
    if(Object.keys(d.entries).length){
      dlg({title:'Trocar de dia', sub:'As séries não salvas serão descartadas. Continuar?', dangerous:true, ok:'Trocar', onOk:function(){
        d.day=k; d.entries={}; d.startedAt=null; d.warmupMode={}; d.sessionMode='normal'; calOpen=false; mfEx=0; mfNotes={}; save(); render();
      }});
      return;
    }
    d.day=k; d.entries={}; d.startedAt=null; d.warmupMode={}; d.sessionMode='normal'; calOpen=false; mfEx=0; mfNotes={}; save(); render();
  };});
  document.querySelectorAll('[data-session-mode]').forEach(function(b){ b.onclick=function(){
    d.sessionMode=b.getAttribute('data-session-mode')==='curto'?'curto':'normal'; save(); render();
  };});
  var dateBtn=document.getElementById('dateBtn');
  if(dateBtn) dateBtn.onclick=function(){ if(calOpen){ calOpen=false; } else { openCal(d.date); } render(); };
  var previewBtn=document.getElementById('mfPreviewBtn');
  if(previewBtn) previewBtn.onclick=function(){ mfPreview=true; kbdReset(); render(); };
  if(calOpen){
    document.getElementById('calPrev').onclick=function(){ calMonth.m--; if(calMonth.m<0){calMonth.m=11; calMonth.y--;} render(); };
    document.getElementById('calNext').onclick=function(){ calMonth.m++; if(calMonth.m>11){calMonth.m=0; calMonth.y++;} render(); };
    document.getElementById('calToday').onclick=function(){ d.date=todayISO(); calOpen=false; save(); render(); };
    document.querySelectorAll('.calcell[data-iso]').forEach(function(c){ c.onclick=function(){ d.date=c.getAttribute('data-iso'); calOpen=false; save(); render(); }; });
  }
  /* carrossel */
  document.querySelectorAll('[data-mfex]').forEach(function(b){ b.onclick=function(){
    mfEx=+b.getAttribute('data-mfex'); kbdReset(); render();
    var el=document.querySelector('.mf-item.on'); if(el) el.scrollIntoView({inline:'center',block:'nearest'});
  };});
  var addEx=document.getElementById('mfAddEx');
  if(addEx) addEx.onclick=function(){
    dlg({title:'Adicionar exercício', input:true, value:'', onOk:function(v){
      var name=String(v).trim(); if(!name){ toast('Digite o nome do exercício'); return; }
      var exo=exerciseForName(name,d.day);
      if(exo){ toast('Exercício já está na ficha do dia'); return; }
      var defs=restFor(name); var t=targetFor(name);
      state.ficha[d.day].ex.push({n:name, id:exerciseIdFor(name), sets:t.sets, reps:t.reps, rest:defs, inc:null, eq:null, perSide:false});
      save(); toast(name+' adicionado'); render();
    }});
  };
  /* ações do exercício */
  document.querySelectorAll('[data-warm]').forEach(function(b){ b.onclick=function(){
    var idx=+b.getAttribute('data-warm'), ex=state.ficha[d.day].ex[idx].n;
    d.warmupMode[ex]=!d.warmupMode[ex]; kbdReset(); save(); render();
  };});
  document.querySelectorAll('[data-mfinfo]').forEach(function(b){ b.onclick=function(){
    mfDetail=b.getAttribute('data-mfinfo'); mfEx=0; render();
  };});
  document.querySelectorAll('[data-mfnote]').forEach(function(b){ b.onclick=function(){
    var idx=+b.getAttribute('data-mfnote'), exo=state.ficha[d.day].ex[idx];
    var cur=mfNotes[exo.n]||'';
    dlg({title:'Notas · '+exo.n, sub:'Anotações livres sobre este exercício no treino de hoje.', input:true, value:cur, onOk:function(v){
      mfNotes[exo.n]=String(v||''); render();
    }});
  };});
  var wa=document.getElementById('mfWarmAdd'); if(wa) wa.onclick=function(){
    var exo=state.ficha[d.day].ex[mfEx], ex=exo.n;
    if(!d.entries[ex]) d.entries[ex]=[];
    if(!d.startedAt) d.startedAt=Date.now();
    var last=(d.entries[ex]||[]).filter(isWarmup).pop(), lw=last?last.w:null;
    var entryIndex=d.entries[ex].length;
    d.entries[ex].push({w:lw||20, r:10, wu:true, warmup:true});
    var rowIndex=mfSetRows(ex).findIndex(function(row){ return row.__entryIndex===entryIndex; });
    save(); vibrate(15); kbdOpenFor('w', rowIndex<0?null:rowIndex);
  };
  var sw=document.getElementById('mfSwap'); if(sw) sw.onclick=function(){
    var day=state.ficha[d.day];
    if(mfEx<=0){ toast('Esse exercício já é o primeiro do dia'); return; }
    var tmp=day.ex[mfEx-1]; day.ex[mfEx-1]=day.ex[mfEx]; day.ex[mfEx]=tmp;
    mfEx--; save(); render();
  };
  /* células clicáveis da tabela (abre o teclado sob demanda) */
  document.querySelectorAll('[data-cell]').forEach(function(c){ c.onclick=function(){
    kbdOpenFor(c.getAttribute('data-cell'), +c.getAttribute('data-row'));
  };});
  document.querySelectorAll('[data-rirsel]').forEach(function(b){ b.onclick=function(){
    var value=b.getAttribute('data-rirsel'), q=value==='?'?null:(value==='6+'?6:parseInt(value,10));
    kbdRir=q;
    if(kbdEdit!=null){
      var activeEx=state.ficha[d.day].ex[mfEx].n, rows=mfSetRows(activeEx), current=rows[kbdEdit.si], entryIndex=current?current.__entryIndex:-1;
      if(entryIndex>=0) current=d.entries[activeEx][entryIndex];
      if(current && !isWarmup(current)){ current.rir=q; save(); }
    }
    if(!kbdOpen){ kbdOpenFor('r',null); kbdRir=q; }
    syncKbdUI();
    render();
    vibrate(12);
  };});
  document.querySelectorAll('[data-done]').forEach(function(b){ b.onclick=function(){
    var p=b.getAttribute('data-done').split(':'), exoDone=state.ficha[d.day].ex[+p[0]], rowsDone=mfSetRows(exoDone.n), current=rowsDone[+p[1]];
    if(!current) return;
    if(current.phantom){
      var phantomEx=exoDone.n, phantomSet={w:current.w==null?20:current.w,r:current.r==null?10:current.r,wu:false,warmup:false,done:true,rir:null};
      if(!d.entries[phantomEx]) d.entries[phantomEx]=[];
      if(!d.startedAt) d.startedAt=Date.now();
      var phWarmCount=(d.entries[phantomEx]||[]).filter(isWarmup).length;
      if(kbdRir!=null) phantomSet.rir=Math.max(0,Math.min(6,kbdRir));   /* grava o RIR que estava selecionado */
      if(current.__workIndex!=null){ d.entries[phantomEx].splice(phWarmCount+current.__workIndex, 0, phantomSet); }
      else { d.entries[phantomEx].push(phantomSet); }
      save(); vibrate(20);
      if(state.settings.restAuto){ initAudio(); startRest(exoDone.rest||90, phantomEx); }
      if(state.settings.autoAdvance!==false && todosConcluidos(+p[0]) && mfEx<state.ficha[d.day].ex.length-1){
        mfEx=+p[0]+1; kbdReset(); render(); toast('Próximo exercício: '+state.ficha[d.day].ex[mfEx].n); return;
      }
      kbdOpenFor('w',findNextPhantom(phantomEx)); return;
    }
    current=d.entries[exoDone.n][current.__entryIndex]; if(!current) return;
    current.done=!current.done; save(); vibrate(current.done?20:10);
    if(current.done && state.settings.autoAdvance!==false && todosConcluidos(+p[0])){
      if(mfEx<state.ficha[d.day].ex.length-1){
        mfEx=+p[0]+1; kbdReset(); render();
        var nextEl=document.querySelector('.mf-item.on'); if(nextEl) nextEl.scrollIntoView({inline:'center',block:'nearest'});
        toast('Próximo exercício: '+state.ficha[d.day].ex[mfEx].n);
        return;
      }
    }
    render();
  };});
  /* adicionar série extra dentro da tabela */
  var as=document.getElementById('mfAddSet'); if(as) as.onclick=function(){ kbdOpenFor('w', null); };
  /* botão fechar do teclado */
  var kbClose=document.getElementById('mfKbdClose'); if(kbClose) kbClose.onclick=kbdClose;
  /* teclado */
  document.querySelectorAll('[data-kmod]').forEach(function(b){ b.onclick=function(){
    kbdMode=b.getAttribute('data-kmod'); if(kbdMode==='r') kbdRir=null; syncKbdUI();
  };});
  var kbdSwitch=document.getElementById('mfKbdSwitch'); if(kbdSwitch) kbdSwitch.onclick=function(){
    kbdMode=kbdMode==='w'?'r':'w'; syncKbdUI();
  };
  var rb=document.getElementById('mfRirBtn'); if(rb) rb.onclick=function(){
    var bar=document.querySelector('.mf-rirbar');
    if(bar) bar.scrollIntoView({block:'center',behavior:'smooth'});
    toast('Escolha o RIR na linha colorida');
  };
  document.querySelectorAll('[data-key]').forEach(function(b){ b.onclick=function(){
    var k=b.getAttribute('data-key');
    if(k==='✓'){ kbdCommit(); return; }
    if(k==='⇄'){ kbdMode = kbdMode==='w' ? 'r' : 'w'; syncKbdUI(); return; }
    if(k==='RIR'){
      var rirBar=document.querySelector('.mf-rirbar');
      if(rirBar) rirBar.scrollIntoView({block:'center',behavior:'smooth'});
      return;
    }
    if(k==='F'){
      var active=state.ficha[d.day].ex[mfEx].n;
      if(kbdEdit!=null){ var activeSet=(d.entries[active]||[])[kbdEdit.entryIndex]; if(activeSet){ activeSet.wu=!isWarmup(activeSet); activeSet.warmup=activeSet.wu; save(); } }
      else d.warmupMode[active]=!d.warmupMode[active];
      syncKbdUI(); render(); return;
    }
    if(k==='⌫'){
      if(kbdMode==='w') kbdW=String(kbdW).slice(0,-1);
      else if(kbdMode==='r') kbdR=String(kbdR).slice(0,-1);
      else kbdP=String(Math.max(0,(parseInt(kbdP,10)||0)-1));
      kbdFresh=false;
      syncKbdUI(); return;
    }
    if(k==='−'){
      if(kbdMode==='w'){ var w=parseFloat(kbdW)||0; kbdW=String(Math.max(0,Math.round((w-2.5)*2)/2)); }
      else if(kbdMode==='r'){ var r=parseInt(kbdR,10)||1; kbdR=String(Math.max(1,r-1)); }
      syncKbdUI(); return;
    }
    if(k==='±'){
      if(kbdMode==='w'){ var w2=parseFloat(kbdW)||0; kbdW=String(Math.round((w2+2.5)*2)/2); }
      else if(kbdMode==='r'){ var r2=parseInt(kbdR,10)||1; kbdR=String(r2+1); }
      syncKbdUI(); return;
    }
    if(k==='0.0'){ if(kbdMode==='w'){ var w3=(parseFloat(kbdW)||0); kbdW=String(Math.max(0,Math.round(w3*2-1)/2)); } kbdFresh=false; syncKbdUI(); return; }
    if(kbdFresh){ /* buffer espelha a série: primeiro dígito substitui o valor */
      kbdFresh=false;
      if(kbdMode==='w') kbdW=''; else if(kbdMode==='r') kbdR=''; else kbdP='0';
    }
    var target = kbdMode==='w'?kbdW:kbdMode==='r'?kbdR:kbdP;
    var next = (target||'') + (k==='.25'?k:k);
    if(kbdMode==='w'){
      if(k==='.' ) return;
      var num = parseFloat(next);
      if(isFinite(num)) kbdW=String(num);
    } else if(kbdMode==='r'){
      var num2 = parseInt(next,10);
      if(isFinite(num2)) kbdR=String(num2);
    } else kbdP=String(Math.max(0,parseInt(next,10)||0));
    syncKbdUI();
  };});
  document.querySelectorAll('[data-rm]').forEach(function(x){ x.onclick=function(){
    var p=x.getAttribute('data-rm').split(':'), ex=state.ficha[d.day].ex[+p[0]].n, entryIndex=mfEntryIndex(ex,+p[1]);
    if(entryIndex<0) return;
    d.entries[ex].splice(entryIndex,1); if(!d.entries[ex].length) delete d.entries[ex];
    if(!Object.keys(d.entries).length) d.startedAt=null;
    kbdReset(); save(); render();
  };});
  document.getElementById('saveSess').onclick=function(){
    if(!Object.keys(d.entries).length){ toast('Nenhuma série registrada'); return; }
    var dur = d.startedAt ? Math.max(1, Math.round((Date.now()-d.startedAt)/1000)) : null;
    var savedSession={id:Date.now(), date:d.date, day:d.day, mode:d.sessionMode==='curto'?'curto':'normal', entries:d.entries, duration:dur, notes:mfNotes};
    state.sessions.push(savedSession);
    lastSummary={day:d.day,date:d.date,mode:d.sessionMode};
    mfCompleteSession=savedSession; mfComplete=true; mfKeepPlan=false;
    state.draft={day:null, date:null, entries:{}, warmupMode:{}, startedAt:null, sessionMode:'normal'};
    mfNotes={}; kbdReset();
    save(); hideRest(); vibrate([15,40,15]); render();
  };
}
function kbdReset(){ kbdW=''; kbdR=''; kbdP='0'; kbdRir=null; kbdOpen=false; kbdEdit=null; }
function findNextPhantom(ex,start){
  var rows=mfSetRows(ex);
  for(var i=start||0;i<rows.length;i++) if(rows[i].phantom&&!isWarmup(rows[i])) return i;
  return null;
}
function kbdCommit(){
  var d=state.draft, exo=state.ficha[d.day].ex[mfEx], ex=exo.n;
  var rows=mfSetRows(ex), editRow=kbdEdit!=null?rows[kbdEdit.si]:null, sets=d.entries[ex]||[], setsWork=workSets(sets);
  var last=setsWork[setsWork.length-1], defW=last?last.w:20, defR=last?last.r:10;
  var w=parseFloat(kbdW), r=parseInt(kbdR,10), p=(kbdMode==='p'&&kbdP!=='0')?parseInt(kbdP,10)||0:0;
  if(isNaN(w)) w=editRow&&editRow.w!=null?editRow.w:defW;
  if(isNaN(r)) r=editRow&&editRow.r!=null?editRow.r:defR;
  if(!isFinite(w)||w<0){ toast('Digite a carga'); return; }
  if(!isFinite(r)||r<1){ toast('Digite as repetições'); return; }
  if(kbdMode==='p'){ kbdP=String(Math.max(0,(parseInt(kbdP,10)||0)+1)); syncKbdUI(); return; }

  /* edição de uma linha real: confirma e mantém o teclado aberto (foco na próxima linha da meta) */
  if(kbdEdit!=null && editRow && !editRow.phantom && kbdEdit.entryIndex>=0){
    var existing=sets[kbdEdit.entryIndex];
    if(kbdMode==='w') existing.w=w;
    else if(kbdMode==='r') existing.r=r;
    else existing.p=p;
    if(!isWarmup(existing) && kbdRir!=null) existing.rir=Math.max(0,Math.min(6,kbdRir));
    save(); kbdW=''; kbdR=''; kbdP='0'; kbdRir=null;
    kbdOpenFor('w',findNextPhantom(ex,kbdEdit.si+1));
    return;
  }
  /* edição de uma linha phantom (novo valor digitado antes de confirmar): materializa na posição da linha */
  if(kbdEdit!=null && editRow && editRow.phantom && editRow.__workIndex!=null){
    var warmCount=(d.entries[ex]||[]).filter(isWarmup).length;
    d.entries[ex].splice(warmCount+editRow.__workIndex, 0, setObj);
    save(); vibrate(15);
    var isPR2 = draftBestE1rm(ex) > bestE1rm(ex)+0.01 && draftBestE1rm(ex)>0;
    if(isPR2) celebrate();
    if(state.settings.restAuto){ initAudio(); if(state.settings.alarm) askNotify(); startRest(exo.rest||90, ex); }
    if(!warmOn && state.settings.autoAdvance!==false && todosConcluidos(mfEx) && mfEx<state.ficha[d.day].ex.length-1){
      mfEx++; kbdReset(); render(); toast('Próximo exercício: '+state.ficha[d.day].ex[mfEx].n); return;
    }
    kbdW=''; kbdR=''; kbdP='0'; kbdRir=null;
    kbdOpenFor('w',findNextPhantom(ex,kbdEdit.si+1));
    return;
  }

  /* confirma um phantom (ou uma série extra) como linha real concluída.
     Insere na posição da linha da tabela (aquecimentos antes, depois o __workIndex),
     assim cada série mantém a identidade da sua linha — como no MF. */
  if(!d.entries[ex]) d.entries[ex]=[];
  if(!d.startedAt) d.startedAt=Date.now();
  var warmOn=!!d.warmupMode[ex];
  var setObj={w:w, r:r, wu:warmOn, warmup:warmOn, done:true};
  if(p>0) setObj.p=p;
  if(!warmOn && kbdRir!=null){
    setObj.rir=Math.max(0,Math.min(6,kbdRir));
    setObj.targetRir=Progression.calcularMeta(state.ficha,state.sessions,d.day,ex,state.settings.progressao).targetRir;
  }
  /* phantom confirmado com os valores exibidos na linha (✓ direto, sem digitar) ou série extra:
     phantom mantém a posição da linha da meta; série extra vai para o fim */
  if(kbdEdit!=null && editRow && editRow.phantom && editRow.__workIndex!=null){
    var warmCount=(d.entries[ex]||[]).filter(isWarmup).length;
    d.entries[ex].splice(warmCount+editRow.__workIndex, 0, setObj);
  } else { d.entries[ex].push(setObj); }
  save(); vibrate(15);
  var isPR = draftBestE1rm(ex) > bestE1rm(ex)+0.01 && draftBestE1rm(ex)>0;
  if(isPR) celebrate();
  if(state.settings.restAuto){ initAudio(); if(state.settings.alarm) askNotify(); startRest(exo.rest||90, ex); }
  if(!warmOn && state.settings.autoAdvance!==false && todosConcluidos(mfEx) && mfEx<state.ficha[d.day].ex.length-1){
    mfEx++; kbdReset(); render(); toast('Próximo exercício: '+state.ficha[d.day].ex[mfEx].n); return;
  }
  kbdW=''; kbdR=''; kbdP='0'; kbdRir=null; kbdMode='w';
  kbdOpenFor('w',findNextPhantom(ex,kbdEdit?kbdEdit.si+1:0));
}

/* ---------- preview e tela de conclusão ---------- */
function muscleForExercise(name){
  var s=(name||'').toLowerCase();
  if(/supino|voador|crucifixo/.test(s)) return 'Peito';
  if(/eleva|desenvolvimento|tríceps|triceps/.test(s)) return 'Ombros e braços';
  if(/puxada|remada|serrote/.test(s)) return 'Costas';
  if(/rosca/.test(s)) return 'Bíceps';
  if(/agach|leg press|stiff|terra|flexora|extensora|panturr|abdutor|adutor|pélvica|pelvica/.test(s)) return 'Pernas';
  return 'Corpo inteiro';
}
function renderPreview(d, day){
  var totalSets=0, estimated=0, groups={};
  day.ex.forEach(function(exo){
    totalSets+=exo.sets; estimated+=exo.sets*45+exo.rest;
    var group=muscleForExercise(exo.n); groups[group]=(groups[group]||0)+exo.sets;
  });
  var groupNames=Object.keys(groups).slice(0,4);
  var h='<div class="mf-preview">'+
    '<div class="mf-preview-head"><button class="mf-back" id="mfPreviewBack">&#8592;</button><div><span class="mf-eyebrow">Treino '+d.day+'</span><h1>'+esc(day.nome)+'</h1></div></div>'+
    '<div class="mf-preview-meta"><span>'+day.ex.length+' exercícios</span><span>'+totalSets+' séries</span><span>~'+Math.max(1,Math.round(estimated/60))+' min</span></div>'+
    '<h2 class="mf-section-title">Músculos alvo</h2><div class="mf-targets">'+groupNames.map(function(group){ return '<div class="mf-target"><span class="mf-target-icon">'+group.slice(0,1)+'</span><div><b>'+esc(group)+'</b><small>'+groups[group]+' séries</small></div></div>'; }).join('')+'</div>'+
    '<div class="mf-preview-title"><div><strong>'+day.ex.length+' exercícios</strong><small>Estimativa aproximada de duração</small></div><span class="mf-preview-plus">+</span></div>';
  day.ex.forEach(function(exo){
    var target=exo.progressao&&exo.progressao.targetRir!=null?exo.progressao.targetRir:state.settings.progressao.targetRir;
    h+='<div class="mf-preview-ex"><div class="mf-preview-thumb">'+exIcon(exo.n)+'</div><div class="mf-preview-exbody"><strong>'+esc(exo.n)+'</strong><div class="mf-preview-sets">'+Array.from({length:exo.sets},function(_,i){ return '<span><i>'+((i+1))+'</i> '+esc(exo.reps)+' reps</span>'; }).join('')+'</div><div class="mf-chipline"><span>'+esc(muscleForExercise(exo.n))+'</span><span>'+target+' RIR alvo</span></div></div><div class="mf-preview-rirs">'+Array.from({length:Math.min(exo.sets,5)},function(){ return '<i style="--rir:'+rirColor(target)+'">'+rirLabel(target)+'</i>'; }).join('')+'</div></div>';
  });
  h+='<div class="mf-preview-cta"><button class="cta mf-cta-black" id="mfStartWorkout">Iniciar treino</button></div></div>';
  return h;
}
function bindPreview(){
  var back=document.getElementById('mfPreviewBack'); if(back) back.onclick=function(){ mfPreview=false; render(); };
  var start=document.getElementById('mfStartWorkout'); if(start) start.onclick=function(){ mfPreview=false; render(); };
}
function completeStats(session){
  var volume=0, reps=0, e1=0, count=0;
  Object.keys(session.entries||{}).forEach(function(name){ workSets(session.entries[name]||[]).forEach(function(set){ volume+=set.w*set.r; reps+=set.r; e1=Math.max(e1,e1rm(set.w,set.r)); count++; }); });
  return {volume:Math.round(volume), reps:reps, e1rm:Math.round(e1), count:count};
}
function completionAnatomy(){
  return '<svg class="mf-anatomy-svg" viewBox="0 0 260 150" aria-label="Músculos trabalhados"><g fill="#e7e8eb"><circle cx="76" cy="18" r="10"/><path d="M67 31c-8 7-13 18-13 31l-8 34 12 2 7-26 3 29-8 38h13l8-35 8 35h13l-8-38 3-29 7 26 12-2-8-34c0-13-5-24-13-31z"/><circle cx="184" cy="18" r="10"/><path d="M175 31c-8 7-13 18-13 31l-8 34 12 2 7-26 3 29-8 38h13l8-35 8 35h13l-8-38 3-29 7 26 12-2-8-34c0-13-5-24-13-31z"/></g><g fill="#315ff4"><path d="M62 43c8-10 28-10 36 0l-3 20H65zM166 43c8-10 28-10 36 0l-3 20h-30z"/><path d="M59 65l-8 29 8 2 10-27zM201 65l8 29-8 2-10-27z"/><path d="M69 70h29l-3 28H72zM172 70h29l-3 28h-23z"/></g><g fill="#f97a53"><path d="M73 101h21l-4 28H75zM177 101h21l-4 28h-15z"/></g></svg>';
}
function renderComplete(){
  if(!mfCompleteSession){ mfComplete=false; return renderTreino(); }
  var session=mfCompleteSession, stats=completeStats(session);
  var h='<div class="mf-complete"><div class="mf-complete-top"><button class="mf-back" id="mfCompleteClose">&#10005;</button><strong>Treino concluído</strong><span class="mf-more">&#8942;</span></div>'+
    '<p class="mf-complete-date">'+fmtBRfull(session.date)+' · Treino '+session.day+'</p>'+completionAnatomy()+
    '<div class="mf-records"><div class="mf-rcard"><span class="mf-record-icon">&#127942;</span><b>'+nkg(stats.volume)+' kg</b><small>Volume</small></div><div class="mf-rcard"><span class="mf-record-icon">&#9733;</span><b>'+stats.reps+' reps</b><small>Repetições</small></div><div class="mf-rcard"><span class="mf-record-icon">&#9670;</span><b>'+nkg(stats.e1rm)+' kg</b><small>1RM estimado</small></div></div>'+ 
    '<h2 class="mf-section-title">Resumo do treino</h2><div class="mf-breakdown">';
  Object.keys(session.entries||{}).forEach(function(name){
    var sets=workSets(session.entries[name]||[]); if(!sets.length) return;
    h+='<div class="mf-breakdown-row"><div><strong>'+esc(name)+'</strong><small>'+sets.length+' séries · '+nkg(sets.reduce(function(a,x){return a+x.w*x.r;},0))+' kg</small></div><span>&#10003;</span></div>';
  });
  h+='</div><div class="mf-keep-row"><div><strong>Salvar mudanças no plano</strong><small>Usar as últimas cargas e repetições como padrão.</small></div><div class="toggle'+(mfKeepPlan?' on':'')+'" id="mfKeepPlanTg"><div class="knob"></div></div></div><button class="cta mf-cta-black" id="mfCompleteDone">Pronto</button></div>';
  return h;
}
function bindComplete(){
  var close=document.getElementById('mfCompleteClose'); if(close) close.onclick=function(){ mfComplete=false; mfCompleteSession=null; render(); };
  var toggle=document.getElementById('mfKeepPlanTg'); if(toggle) toggle.onclick=function(){ mfKeepPlan=!mfKeepPlan; toggle.classList.toggle('on',mfKeepPlan); };
  var done=document.getElementById('mfCompleteDone'); if(done) done.onclick=function(){
    if(mfKeepPlan && mfCompleteSession){
      Object.keys(mfCompleteSession.entries||{}).forEach(function(name){
        var exo=exerciseForName(name,mfCompleteSession.day), sets=workSets(mfCompleteSession.entries[name]||[]), last=sets[sets.length-1];
        if(exo&&last){ exo.lastW=last.w; exo.lastR=last.r; }
      });
    }
    save(); mfComplete=false; mfCompleteSession=null; mfKeepPlan=false; render();
  };
}

/* ---------- bind da página de detalhes ---------- */
function bindExDetail(){
  var bk=document.getElementById('mfBack'); if(bk) bk.onclick=function(){ mfDetail=null; render(); };
}
