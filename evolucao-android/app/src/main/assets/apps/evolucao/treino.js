/* apps/evolucao/treino.js */
/* ---------- TREINO (estilo MacroFactor Workouts) ---------- */
/* Tela única por exercício durante o treino: carrossel de exercícios,
   tabela de sets minimalista 5 colunas, teclado numérico fixo com botão RIR. */

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
function rirLabel(q, fallbackTarget){
  if(q == null || isNaN(q)){
    var fb = fallbackTarget != null ? fallbackTarget : 2;
    return fb >= 6 ? '6+' : String(fb);
  }
  return q >= 6 ? '6+' : String(q);
}
function mfRirFor(set){
  if(!set) return null;
  var v = set.rir !== undefined ? set.rir : (set.RIR !== undefined ? set.RIR : null);
  if(v===null || v===undefined || v==='') return null;
  v=parseFloat(v);
  if(!isFinite(v)) return null;
  return v>=6?6:Math.max(0,Math.min(5,v));
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
  var target = defaultRirFor(ex);
  var selected = kbdRir;
  if(selected == null && kbdEdit != null){
    var current = mfSetRows(ex)[kbdEdit.si];
    selected = mfRirFor(current);
  }
  if(selected == null) selected = target;
  var values = [0, 1, 2, 3, 4, 5, 6];
  return '<div class="mf-rirbar"><div class="mf-rirbar-title">RIR realizado</div>' + values.map(function(q){
    var key = q === 6 ? '6+' : String(q);
    return '<button class="mf-rcirc' + (selected === q ? ' on' : '') + '" data-rirsel="' + key + '" style="--rir:' + rirColor(q) + '" aria-label="RIR ' + key + '">' + key + '</button>';
  }).join('') + '</div>';
}

function isUnilateralEx(exo){
  if(!exo) return false;
  if(exo.unilateral === true) return true;
  return Progression.isUnilateral(exo.n);
}

function mfGetBufferValues(current, exo){
  var w = parseFloat(kbdW);
  var r = parseInt(kbdR, 10);
  var p = (kbdMode === 'p' && kbdP !== '0') ? (parseInt(kbdP, 10) || 0) : (current && current.p ? current.p : 0);
  var sets = state.draft && exo ? (state.draft.entries[exo.n] || []) : [];
  var last = workSets(sets)[workSets(sets).length - 1];
  var defW = last ? last.w : (exo && exo.lastW != null ? exo.lastW : 20);
  var defR = last ? last.r : (exo && exo.lastR != null ? exo.lastR : 10);

  if(isNaN(w)) w = current && current.w != null ? current.w : defW;
  if(isNaN(r)) r = current && current.r != null ? current.r : defR;
  return { w: w, r: r, p: p };
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

  /* Cabeçalho minimalista despoluído (sem botão Curto/Completo topo e sem setup banner) */
  var h='<div class="mf-session"><div><span class="mf-eyebrow">Treino '+d.day+' · '+esc(day.nome)+'</span><strong>'+(d.startedAt?fmtDur((Date.now()-d.startedAt)/1000):'Pronto para registrar')+'</strong></div><div class="mf-sessioncount">'+totalDone+'<small>/'+totalGoal+' séries</small></div></div>';
  h+='<div class="mf-sessiontools"><div class="mf-days">';
  ['A','B','C'].forEach(function(k){ h+='<button class="mf-day'+(d.day===k?' on':'')+'" data-day="'+k+'">'+k+'</button>'; });
  h+='</div><button class="mf-tool" id="dateBtn">'+(d.date===todayISO()?'Hoje':fmtBR(d.date))+'</button><button class="mf-tool" id="mfPreviewBtn">Resumo</button></div>';
  if(calOpen) h+=calendarHTML(d.date);

  /* conteudo do treino */
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
  var targetRirEx = meta.targetRir != null ? meta.targetRir : defaultRirFor(ex);
  h+='<div class="mf-metarow"><span class="mf-metachip '+metaCss(meta.status)+'" title="'+esc(meta.motivo)+'">'+metaLabel(meta,exo)+(targetRirEx!=null?' · alvo '+targetRirEx+' RIR':'')+'</span>'+
    (meta.carga!=null?'<span class="mf-metaauto">Auto · '+nkg(meta.carga)+' kg × '+meta.repsMeta+(exo.perSide?' / lado':'')+'</span>':'')+'</div>';

  /* tabela de sets minimalista: 5 colunas (Set | Carga | Reps | RIR | ✓) */
  h+='<div class="mf-table"><div class="mf-th"><span>Set</span><span>Carga</span><span>Reps</span><span>RIR</span><span>✓</span></div>';
  var showWork = 0;
  mfSetRows(ex).forEach(function(s,si){
    var ph=!!s.phantom;
    var wu = isWarmup(s);
    var q = ph?null:mfRirFor(s);
    var qDisplay = ph ? targetRirEx : (q != null ? q : targetRirEx);
    var isManual = !ph && (s.rirManual === true || (s.rir != null && s.rir !== targetRirEx));
    if(!wu) showWork++;

    var isPendingSide1 = d.unilateralPending && d.unilateralPending.ex === ex && d.unilateralPending.setIndex === si;

    h+='<div class="mf-setrow'+(wu?' wu':'')+(ph?' ph':'')+(isPendingSide1?' mf-side-pending':'')+'">';
    h+='<div class="mf-idx">'+(wu?'AQ':String(showWork))+'</div>';
    h+='<div class="mf-cell mf-w'+(kbdEdit&&kbdEdit.si===si?' on':'')+(ph?' phc':'')+'" data-cell="w" data-row="' + si + '">' + (ph&&s.w==null?'–':nkg(s.w)) + '</div>';
    h+='<div class="mf-cell mf-r'+(kbdEdit&&kbdEdit.si===si?' on':'')+(ph?' phc':'')+'" data-cell="r" data-row="' + si + '">' + (ph&&s.r==null?'–':s.r+(s.p?('+'+s.p+'p'):'')) + '</div>';

    var rirBadgeStyle = isManual ?
      ('style="--rir:'+rirColor(qDisplay)+';background:'+rirColor(qDisplay)+';color:#fff;font-weight:900"') :
      ('style="--rir:'+rirColor(qDisplay)+';border:1.5px solid '+rirColor(qDisplay)+';color:'+rirColor(qDisplay)+';background:transparent;font-weight:800"');
    h+='<div class="mf-rir'+(ph?' phr':'')+(isManual?' rir-manual':'')+'" '+rirBadgeStyle+'>'+rirLabel(qDisplay, targetRirEx)+'</div>';

    var chkContent = s.done ? '&#10003;' : (isPendingSide1 ? '½' : '');
    var chkClass = 'mf-chk' + (s.done ? ' done' : '') + (isPendingSide1 ? ' side-pending' : '');
    var chkTitle = isPendingSide1 ? 'Concluir Lado 2' : ((s.done ? 'Desmarcar' : 'Marcar') + ' série' + (ph ? ' (registrar)' : ''));
    h+='<button class="'+chkClass+'" data-done="'+mfEx+':'+si+'" aria-label="'+chkTitle+'" title="'+chkTitle+'">'+chkContent+'</button>';
    h+='</div>';
  });
  h+='<div class="mf-setrow mf-add-row" id="mfAddSet" style="justify-content:center"><div class="mf-idx">+</div></div>';
  h+='</div>';

  /* controles rápidos */
  h+='<div class="mf-qrow" style="grid-template-columns:1fr 1fr">';
  h+='<button class="mf-q'+(warmOn?' warmq':'')+'" id="mfWarmAdd" style="'+(warmOn?'background:rgba(255,201,77,.16);border-color:var(--gold);color:var(--gold)':'')+'">🔥 Aquecimento</button>';
  h+='<button class="mf-q ghost" id="mfSwap" title="Mover o exercício no dia">⇄ Trocar ordem</button>';
  h+='</div>';

  /* teclado numérico custom (sob demanda: abre ao tocar numa célula) */
  if(kbdOpen) h+=kbdHTML(ex);

  /* CTA de finalização inteligente (F2.3) */
  var totalEx = day.ex.length;
  var isLastEx = (mfEx === totalEx - 1);
  var allExDone = day.ex.every(function(e, i){ return todosConcluidos(i); });

  h+='<div class="mf-finish">';
  if(isLastEx || allExDone){
    h+='<button class="cta" id="saveSess" style="box-shadow:none">✓ Finalizar treino'+(totalDone?' · '+totalDone+' séries':'')+'</button>'+
      '<div class="hint">Suas cargas e repetições serão salvas e o histórico atualizado.</div>';
  } else {
    var nextExName = day.ex[mfEx + 1] ? day.ex[mfEx + 1].n : '';
    h+='<button class="cta sm ghost" id="mfNextEx">Próximo exercício: '+esc(nextExName)+' →</button>'+
      '<div style="text-align:center;margin-top:12px">'+
      '<button class="btn-link" id="saveSessEarly" style="font-size:12px;color:var(--mut);background:none;border:0;cursor:pointer">Encerrar treino mais cedo...</button>'+
      '</div>';
  }
  h+='</div></div>';
  return h;
}

/* ---------- teclado numérico custom sob demanda (estilo MF) ---------- */
function kbdHTML(ex){
  var buf = mfKbdBuffer();
  var rows = mfSetRows(ex);
  var editRow = kbdEdit != null ? rows[kbdEdit.si] : null;
  var isExistingRealSet = kbdEdit != null && editRow && !editRow.phantom && kbdEdit.entryIndex >= 0;
  var ctx = kbdEdit!=null ? (ex+' · Set '+(setLabelIdx(kbdEdit.si)+1)) : (ex+' · Nova série');
  var delBtn = isExistingRealSet ? '<button class="mf-kdel" id="mfKbdDel" title="Excluir série" style="background:transparent;border:0;color:var(--danger,#ff6b6b);font-size:15px;cursor:pointer;padding:2px 8px;margin-right:6px">🗑️</button>' : '';
  var closeBtn = '<button class="mf-kclose" id="mfKbdClose" title="Fechar">✕</button>';
  return '<div class="mf-kbd open" id="mfKbd">'+
    '<div class="mf-khead"><span>'+ctx+'</span><div style="display:flex;align-items:center">'+delBtn+closeBtn+'</div></div>'+
    rirBarHTML(ex)+
    '<div class="mf-kgrid">'+
      ['1','2','3','\u21c6','4','5','6','RIR','7','8','9','P','\u232b','0','\u2713'].map(function(k){
        var cls='mf-key';
        if(k==='\u2713'||k==='P') cls+=' ok'; if(k==='\u232b'||k==='RIR'||k==='\u21c6') cls+=' fn';
        return '<button class="'+cls+'" data-key="'+k+'">'+k+'</button>';
      }).join('')+'</div></div>';
}
function mfTempP(){ return mfKbdBuffer().p || '0'; }
function setLabelIdx(si){
  var d=state.draft, exo=state.ficha[d.day].ex[mfEx], row=mfSetRows(exo.n)[si];
  return row&&row.__workIndex!=null?row.__workIndex:0;
}
function kbdClose(){ kbdOpen=false; kbdEdit=null; render(); }
var kbdFresh=false; // buffer espelha série existente: próximo dígito substitui o valor
function kbdOpenFor(mode, si){
  kbdMode=mode; kbdEdit=(si==null?null:{si:si}); kbdOpen=true;
  var d=state.draft, exo=state.ficha[d.day].ex[mfEx], rows=mfSetRows(exo.n), row=si==null?null:rows[si];
  if(kbdEdit&&row) kbdEdit.entryIndex=row.__entryIndex;
  kbdFresh=false;
  if(row){
    kbdW=row.w==null?'':String(row.w); kbdR=row.r==null?'':String(row.r); kbdP=row.p!=null?String(row.p):'0';
    kbdFresh=row.w!=null||row.r!=null;
    if(row.rir!=null) kbdRir=row.rir;
  } else { kbdW=''; kbdR=''; kbdP='0'; kbdRir=null; }
  render();
  var rowEl=document.querySelector('.mf-cell.on'); if(rowEl) rowEl.scrollIntoView({block:'nearest'});
  var kbd=document.getElementById('mfKbd'); if(kbd) kbd.classList.add('mf-kbdin');
}
function mfKbdBuffer(){
  return {w: kbdW, r: kbdR, p: kbdP};
}
var kbdW='', kbdR='', kbdP='0';
function mfRirSel(){
  if(kbdRir!=null) return kbdRir;
  var d=state&&state.draft, exo=d&&d.day&&state.ficha[d.day]&&state.ficha[d.day].ex[mfEx];
  return exo?defaultRirFor(exo.n):2;
}
var kbdRir = null;

function syncKbdUI(){
  var kbd=document.getElementById('mfKbd');
  if(!kbd) return;
  var cmode = (kbdMode==='p' ? 'r' : kbdMode);
  var cell=document.querySelector('.mf-cell.on[data-cell="'+cmode+'"]');
  if(cell){ cell.textContent=(kbdMode==='w'?nkg(kbdW||null):(kbdMode==='r'?kbdR:kbdP+'p')); }
  var sel=mfRirSel();
  var selKey=(sel==null?'2':(sel===6?'6+':String(sel)));
  kbd.querySelectorAll('[data-rirsel]').forEach(function(b){ b.classList.toggle('on',b.getAttribute('data-rirsel')===selKey); });
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
  var best=allTimeBest(ex), e1=bestE1rm(ex);
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

/* ---------- RIR e Unilateral Flow ---------- */
function defaultRirFor(ex){
  var exo=exerciseForName(ex,state.draft&&state.draft.day);
  var cfg=state.settings&&state.settings.progressao;
  if(exo&&exo.progressao&&exo.progressao.targetRir!=null) return exo.progressao.targetRir;
  if(cfg&&cfg.targetRir!=null) return cfg.targetRir;
  return 2;
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

function handleSetCompletion(exo, rowIndex, setObj, currentIsPhantom){
  var d = state.draft;
  var isUnilateral = isUnilateralEx(exo);

  if(isUnilateral){
    var pending = d.unilateralPending;
    var isSide2 = pending && pending.ex === exo.n && pending.setIndex === rowIndex;

    if(!isSide2){
      // Side 1 concluído: dispara timer intra-set de 30s
      d.unilateralPending = {
        ex: exo.n,
        setIndex: rowIndex,
        side: 1,
        w: setObj.w,
        r: setObj.r,
        p: setObj.p || 0,
        rir: setObj.rir,
        rirManual: setObj.rirManual
      };
      save();
      vibrate([25, 40, 25]);
      if(state.settings.restAuto){
        initAudio();
        startRest(30, 'Trocar de lado · ' + exo.n);
      }
      toast('Lado 1 concluído! Troque de lado (30s)');
      render();
      return;
    } else {
      // Side 2 concluído
      d.unilateralPending = null;
    }
  }

  if(currentIsPhantom){
    if(!d.entries[exo.n]) d.entries[exo.n] = [];
    var phWarmCount = (d.entries[exo.n] || []).filter(isWarmup).length;
    if(setObj.__workIndex != null){
      d.entries[exo.n].splice(phWarmCount + setObj.__workIndex, 0, setObj);
    } else {
      d.entries[exo.n].push(setObj);
    }
  } else {
    var existing = d.entries[exo.n] ? d.entries[exo.n][setObj.__entryIndex] : null;
    if(existing){
      existing.w = setObj.w;
      existing.r = setObj.r;
      if(setObj.p > 0) existing.p = setObj.p;
      existing.rir = setObj.rir;
      existing.rirManual = setObj.rirManual;
      existing.done = true;
    }
  }

  save();
  vibrate(20);

  var isPR = draftBestE1rm(exo.n) > bestE1rm(exo.n) + 0.01 && draftBestE1rm(exo.n) > 0;
  if(isPR) celebrate();

  if(state.settings.restAuto){
    initAudio();
    if(state.settings.alarm) askNotify();
    startRest(exo.rest || 90, exo.n);
  }

  if(state.settings.autoAdvance !== false && todosConcluidos(mfEx) && mfEx < state.ficha[d.day].ex.length - 1){
    mfEx++;
    kbdReset();
    render();
    var nextEl = document.querySelector('.mf-item.on');
    if(nextEl) nextEl.scrollIntoView({inline: 'center', block: 'nearest'});
    toast('Próximo exercício: ' + state.ficha[d.day].ex[mfEx].n);
    return;
  }

  kbdReset();
  render();
}

function promptFinishSession(){
  var d = state.draft;
  if(!d || !Object.keys(d.entries).length){ toast('Nenhuma série registrada'); return; }
  var totalDone = 0, totalGoal = 0;
  var day = state.ficha[d.day];
  if(day && Array.isArray(day.ex)){
    day.ex.forEach(function(e){
      var s = workSets(d.entries[e.n] || []).filter(function(x){ return x.done !== false; });
      totalDone += s.length;
      totalGoal += e.sets;
    });
  }
  var dur = d.startedAt ? Math.max(1, Math.round((Date.now() - d.startedAt) / 1000)) : null;
  var isShortDefault = totalDone < totalGoal;
  var defaultMode = isShortDefault ? 'Treino Curto' : 'Treino Completo';
  var subtitle = totalDone + ' de ' + totalGoal + ' séries concluídas' + (dur ? ' · ' + fmtDur(dur) : '') +
    '\n\nClassifique a sessão para o algoritmo de progressão:';

  dlg({
    title: 'Finalizar Treino ' + d.day,
    sub: subtitle,
    seg: ['Treino Completo', 'Treino Curto'],
    segVal: defaultMode,
    ok: 'Concluir Treino',
    onOk: function(selected){
      var mode = (selected === 'Treino Curto' || selected === 'curto') ? 'curto' : 'normal';
      var durFinal = d.startedAt ? Math.max(1, Math.round((Date.now() - d.startedAt) / 1000)) : null;
      var savedSession = {
        id: Date.now(),
        date: d.date,
        day: d.day,
        mode: mode,
        entries: d.entries,
        duration: durFinal,
        notes: mfNotes
      };
      state.sessions.push(savedSession);
      lastSummary = { day: d.day, date: d.date, mode: mode };
      mfCompleteSession = savedSession;
      mfComplete = true;
      mfKeepPlan = false;
      state.draft = { day: null, date: null, entries: {}, warmupMode: {}, startedAt: null, sessionMode: 'normal', unilateralPending: null };
      mfNotes = {};
      kbdReset();
      save();
      hideRest();
      vibrate([15, 40, 15]);
      render();
    }
  });
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
        d.day=k; d.entries={}; d.startedAt=null; d.warmupMode={}; d.sessionMode='normal'; d.unilateralPending=null; calOpen=false; mfEx=0; mfNotes={}; save(); render();
      }});
      return;
    }
    d.day=k; d.entries={}; d.startedAt=null; d.warmupMode={}; d.sessionMode='normal'; d.unilateralPending=null; calOpen=false; mfEx=0; mfNotes={}; save(); render();
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
    var value=b.getAttribute('data-rirsel'), q=value==='6+'?6:parseInt(value,10);
    kbdRir=isFinite(q)?Math.max(0,Math.min(6,q)):2;
    if(kbdEdit!=null){
      var activeEx=state.ficha[d.day].ex[mfEx].n, rows=mfSetRows(activeEx), current=rows[kbdEdit.si], entryIndex=current?current.__entryIndex:-1;
      if(entryIndex>=0 && d.entries[activeEx] && d.entries[activeEx][entryIndex]){
        current=d.entries[activeEx][entryIndex];
        if(!isWarmup(current)){ current.rir=kbdRir; current.rirManual=true; save(); }
      }
    }
    if(!kbdOpen){ kbdOpenFor('r',null); }
    syncKbdUI();
    render();
    vibrate(12);
  };});

  /* Checkmark / Concluir série com buffer commit (F1.1 & F2.2) */
  document.querySelectorAll('[data-done]').forEach(function(b){ b.onclick=function(){
    var p=b.getAttribute('data-done').split(':');
    var exoIdx = +p[0], rowIdx = +p[1];
    var exoDone = state.ficha[d.day].ex[exoIdx];
    var rowsDone = mfSetRows(exoDone.n);
    var current = rowsDone[rowIdx];
    if(!current) return;

    var isEditingCurrent = kbdEdit != null && kbdEdit.si === rowIdx;
    var buf = isEditingCurrent ? mfGetBufferValues(current, exoDone) : { w: current.w, r: current.r, p: current.p || 0 };
    var wVal = buf.w != null ? buf.w : (exoDone.lastW != null ? exoDone.lastW : 20);
    var rVal = buf.r != null ? buf.r : (exoDone.lastR != null ? exoDone.lastR : 10);
    var pVal = buf.p || 0;

    var meta = Progression.calcularMeta(state.ficha, state.sessions, d.day, exoDone.n, state.settings.progressao);
    var targetRir = meta.targetRir != null ? meta.targetRir : defaultRirFor(exoDone.n);
    var rirVal = kbdRir != null ? Math.max(0, Math.min(6, kbdRir)) : targetRir;
    var rirManual = kbdRir != null;

    if(!d.startedAt) d.startedAt = Date.now();

    if(current.phantom){
      var phantomSet = {
        w: wVal,
        r: rVal,
        wu: false,
        warmup: false,
        done: true,
        rir: rirVal,
        rirManual: rirManual,
        targetRir: targetRir,
        __workIndex: current.__workIndex
      };
      if(pVal > 0) phantomSet.p = pVal;
      handleSetCompletion(exoDone, rowIdx, phantomSet, true);
      return;
    }

    var existingEntry = d.entries[exoDone.n] ? d.entries[exoDone.n][current.__entryIndex] : null;
    if(!existingEntry) return;

    if(!existingEntry.done){
      existingEntry.w = wVal;
      existingEntry.r = rVal;
      if(pVal > 0) existingEntry.p = pVal;
      existingEntry.rir = rirVal;
      existingEntry.rirManual = rirManual;
      existingEntry.__entryIndex = current.__entryIndex;
      handleSetCompletion(exoDone, rowIdx, existingEntry, false);
    } else {
      // Desmarcar série já feita
      existingEntry.done = false;
      if(d.unilateralPending && d.unilateralPending.ex === exoDone.n && d.unilateralPending.setIndex === rowIdx){
        d.unilateralPending = null;
      }
      save();
      vibrate(10);
      render();
    }
  };});

  /* adicionar série extra dentro da tabela */
  var as=document.getElementById('mfAddSet'); if(as) as.onclick=function(){ kbdOpenFor('w', null); };
  /* botão fechar do teclado */
  var kbClose=document.getElementById('mfKbdClose'); if(kbClose) kbClose.onclick=kbdClose;
  /* botão excluir série no cabeçalho do teclado (F2.1) */
  var kbDel=document.getElementById('mfKbdDel');
  if(kbDel && kbdEdit != null){
    kbDel.onclick = function(){
      var activeEx = state.ficha[d.day].ex[mfEx].n;
      var rows = mfSetRows(activeEx);
      var current = rows[kbdEdit.si];
      var entryIdx = current ? current.__entryIndex : -1;
      if(entryIdx >= 0 && d.entries[activeEx]){
        d.entries[activeEx].splice(entryIdx, 1);
        if(!d.entries[activeEx].length) delete d.entries[activeEx];
        if(!Object.keys(d.entries).length) d.startedAt = null;
      }
      kbdReset(); save(); render();
    };
  }

  /* teclado numérico */
  document.querySelectorAll('[data-key]').forEach(function(b){ b.onclick=function(){
    var k=b.getAttribute('data-key');
    if(k==='✓'){ kbdCommit(); return; }
    if(k==='\u21c6'){ kbdMode = kbdMode==='w' ? 'r' : 'w'; if(kbdMode==='r') kbdRir=null;
      var _row = kbdEdit!=null ? mfSetRows(state.ficha[state.draft.day].ex[mfEx].n)[kbdEdit.si] : null;
      kbdFresh = !!(_row && (kbdMode==='w' ? _row.w!=null : _row.r!=null));
      syncKbdUI(); return; }
    if(k==='RIR'){
      var rirBar=document.querySelector('.mf-rirbar');
      if(rirBar) rirBar.classList.toggle('mf-rirbar-off');
      return;
    }
    if(k==='P'){
      kbdMode='p'; kbdFresh=false;
      var _prow = kbdEdit!=null ? mfSetRows(state.ficha[state.draft.day].ex[mfEx].n)[kbdEdit.si] : null;
      kbdP = (_prow && _prow.p) ? String(_prow.p) : '0';
      syncKbdUI(); return;
    }
    if(k==='\u232b'){
      if(kbdMode==='w') kbdW=String(kbdW).slice(0,-1);
      else if(kbdMode==='r') kbdR=String(kbdR).slice(0,-1);
      else kbdP=String(Math.max(0,(parseInt(kbdP,10)||0)-1));
      kbdFresh=false;
      syncKbdUI(); return;
    }
    if(k==='±'){
      if(kbdMode==='w'){ var w2=parseFloat(kbdW)||0; kbdW=String(Math.round((w2+2.5)*2)/2); }
      else if(kbdMode==='r'){ var r2=parseInt(kbdR,10)||1; kbdR=String(r2+1); }
      syncKbdUI(); return;
    }
    if(k==='0.0'){ if(kbdMode==='w'){ var w3=(parseFloat(kbdW)||0); kbdW=String(Math.max(0,Math.round(w3*2-1)/2)); } kbdFresh=false; syncKbdUI(); return; }
    if(kbdFresh){
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

  /* Navegação e Finalização (F2.3) */
  var nextExBtn = document.getElementById('mfNextEx');
  if(nextExBtn){
    nextExBtn.onclick = function(){
      if(mfEx < state.ficha[d.day].ex.length - 1){
        mfEx++;
        kbdReset();
        render();
        var nextEl = document.querySelector('.mf-item.on');
        if(nextEl) nextEl.scrollIntoView({inline: 'center', block: 'nearest'});
      }
    };
  }
  var saveBtn = document.getElementById('saveSess');
  if(saveBtn) saveBtn.onclick = promptFinishSession;
  var saveEarlyBtn = document.getElementById('saveSessEarly');
  if(saveEarlyBtn) saveEarlyBtn.onclick = promptFinishSession;
}
function kbdReset(){ kbdW=''; kbdR=''; kbdP='0'; kbdRir=null; kbdOpen=false; kbdEdit=null; }
function findNextPhantom(ex,start){
  var rows=mfSetRows(ex);
  for(var i=start||0;i<rows.length;i++) if(rows[i].phantom&&!isWarmup(rows[i])) return i;
  return null;
}
function kbdCommit(){
  var d=state.draft, exo=state.ficha[d.day].ex[mfEx], ex=exo.n;
  var rows=mfSetRows(ex), editRow = kbdEdit!=null?rows[kbdEdit.si]:null;
  var buf = mfGetBufferValues(editRow, exo);
  var w = buf.w, r = buf.r, p = buf.p;

  if(!isFinite(w) || w<0){ toast('Digite a carga'); return; }
  if(!isFinite(r) || r<1){ toast('Digite as repetições'); return; }
  if(kbdMode==='p' && kbdP==='0'){ toast('Digite as parciais'); return; }

  var meta=Progression.calcularMeta(state.ficha,state.sessions,d.day,ex,state.settings.progressao);
  var targetRir = meta.targetRir != null ? meta.targetRir : defaultRirFor(ex);
  var rirVal = kbdRir != null ? Math.max(0, Math.min(6, kbdRir)) : targetRir;
  var rirManual = kbdRir != null;

  /* edição de uma linha real: atualiza carga, reps e RIR simultaneamente (F1.1 & F1.2) */
  if(kbdEdit!=null && editRow && !editRow.phantom && kbdEdit.entryIndex>=0){
    var existing=d.entries[ex] ? d.entries[ex][kbdEdit.entryIndex] : null;
    if(existing){
      existing.w = w;
      existing.r = r;
      if(p > 0) existing.p = p; else delete existing.p;
      if(!isWarmup(existing)){
        existing.rir = rirVal;
        existing.rirManual = rirManual;
      }
    }
    save();
    kbdReset();
    render();
    return;
  }

  /* confirma um phantom (ou nova série) */
  if(!d.entries[ex]) d.entries[ex]=[];
  if(!d.startedAt) d.startedAt=Date.now();
  var warmOn=!!d.warmupMode[ex];
  var setObj={w:w, r:r, wu:warmOn, warmup:warmOn, done:true};
  if(p>0) setObj.p=p;
  if(!warmOn){
    setObj.rir=rirVal;
    setObj.rirManual=rirManual;
    setObj.targetRir=targetRir;
  }
  var commitInPosition=kbdEdit!=null && editRow && editRow.phantom && editRow.__workIndex!=null;
  if(commitInPosition){
    setObj.__workIndex = editRow.__workIndex;
    handleSetCompletion(exo, kbdEdit.si, setObj, true);
  } else {
    handleSetCompletion(exo, rows.length, setObj, true);
  }
}

/* ---------- preview e tela de conclusão com BodyVisualizer (F1.3) ---------- */
function muscleForExercise(name){
  if(typeof BodyVisualizer !== 'undefined'){
    var summary = BodyVisualizer.getMuscleSummary(BodyVisualizer.getMusclesForExercise(name));
    if(summary.length) return summary[0].label;
  }
  var s=(name||'').toLowerCase();
  if(/supino|voador|crucifixo/.test(s)) return 'Peito';
  if(/eleva|desenvolvimento|tríceps|triceps/.test(s)) return 'Ombros e braços';
  if(/puxada|remada|serrote/.test(s)) return 'Costas';
  if(/rosca/.test(s)) return 'Bíceps';
  if(/agach|leg press|stiff|terra|flexora|extensora|panturr|abdutor|adutor|pélvica|pelvica/.test(s)) return 'Pernas';
  return 'Geral';
}

function renderPreview(d, day){
  var totalSets=0, estimated=0;
  day.ex.forEach(function(exo){
    totalSets+=exo.sets; estimated+=exo.sets*45+exo.rest;
  });

  var h='<div class="mf-preview">'+
    '<div class="mf-preview-head"><button class="mf-back" id="mfPreviewBack">&#8592;</button><div><span class="mf-eyebrow">Treino '+d.day+'</span><h1>'+esc(day.nome)+'</h1></div></div>'+
    '<div class="mf-preview-meta"><span>'+day.ex.length+' exercícios</span><span>'+totalSets+' séries</span><span>~'+Math.max(1,Math.round(estimated/60))+' min</span></div>'+
    '<h2 class="mf-section-title">Músculos alvo</h2>'+
    (typeof BodyVisualizer !== 'undefined' ? BodyVisualizer.renderDayAnatomy(day, { height: 155 }) : '')+
    '<div class="mf-preview-title"><div><strong>'+day.ex.length+' exercícios</strong><small>Estimativa aproximada de duração</small></div><span class="mf-preview-plus">+</span></div>';
  day.ex.forEach(function(exo){
    var target=exo.progressao&&exo.progressao.targetRir!=null?exo.progressao.targetRir:defaultRirFor(exo.n);
    var mGroup = muscleForExercise(exo.n);
    h+='<div class="mf-preview-ex"><div class="mf-preview-thumb">'+exIcon(exo.n)+'</div><div class="mf-preview-exbody"><strong>'+esc(exo.n)+'</strong><div class="mf-preview-sets">'+Array.from({length:exo.sets},function(_,i){ return '<span><i>'+((i+1))+'</i> '+esc(exo.reps)+' reps</span>'; }).join('')+'</div><div class="mf-chipline"><span>'+esc(mGroup)+'</span><span>'+target+' RIR alvo</span></div></div><div class="mf-preview-rirs">'+Array.from({length:Math.min(exo.sets,5)},function(){ return '<i style="--rir:'+rirColor(target)+'">'+rirLabel(target)+'</i>'; }).join('')+'</div></div>';
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
function completionAnatomy(session){
  if(typeof BodyVisualizer !== 'undefined'){
    return BodyVisualizer.renderSessionAnatomy(session, { height: 165 });
  }
  return '<svg class="mf-anatomy-svg" viewBox="0 0 300 200"></svg>';
}
function renderComplete(){
  if(!mfCompleteSession){ mfComplete=false; return renderTreino(); }
  var session=mfCompleteSession, stats=completeStats(session);
  var muscleList = (typeof BodyVisualizer !== 'undefined') ? BodyVisualizer.getMuscleSummary(BodyVisualizer.getMusclesForSession(session)) : [];

  var h='<div class="mf-complete"><div class="mf-complete-top"><button class="mf-back" id="mfCompleteClose">&#10005;</button><strong>Treino concluído</strong><span class="mf-more">&#8942;</span></div>'+
    '<p class="mf-complete-date">'+fmtBRfull(session.date)+' · Treino '+session.day+(session.mode==='curto'?' · Treino Curto':'')+'</p>'+
    completionAnatomy(session)+
    (muscleList.length ? (
      '<div class="mf-chipline" style="justify-content:center;margin:4px 0 14px;flex-wrap:wrap;display:flex;gap:6px">'+
      muscleList.map(function(m){ return '<span class="rtag" style="background:var(--card2,#222226);color:var(--txt,#f3f4f6)">'+m.label+' · '+Math.round(m.score)+' sets</span>'; }).join('')+
      '</div>'
    ) : '')+
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
