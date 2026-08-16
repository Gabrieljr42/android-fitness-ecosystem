/* apps/evolucao/views/historico.js */
/* ---------- HISTÓRICO ---------- */
function renderHistorico(){
  var ss=sortedSessions().reverse();
  var h='<h1>Histórico</h1><div class="sub">'+ss.length+' treino(s) registrado(s) · toque pra expandir</div>';
  if(!ss.length) return h+'<div class="card"><div class="empty"><div class="big">🗓</div><div class="t">Nada por aqui ainda</div><div class="s">Salve seu primeiro treino na aba Treino.</div></div></div>';
  h+='<div class="card">';
  ss.forEach(function(s){
    var vol=0,n=0;
    Object.keys(s.entries).forEach(function(k){ s.entries[k].forEach(function(){ n++; }); workSets(s.entries[k]).forEach(function(x){ vol+=x.w*x.r; }); });
    var det=Object.keys(s.entries).map(function(k){
      return '<div class="line"><b>'+esc(k)+':</b> '+s.entries[k].map(function(x){
        return (isWarmup(x)?'(aq) ':'')+nkg(x.w)+'×'+x.r+(x.p?('+'+x.p+'p'):'');
      }).join('  ·  ')+'</div>';
    }).join('');
    var anatMini = (typeof BodyVisualizer !== 'undefined') ?
      '<div class="sess-anat" style="margin:10px auto 4px;max-width:240px">' + BodyVisualizer.renderSessionAnatomy(s, { height: 135 }) + '</div>' : '';
    h+='<div class="sess" data-id="'+s.id+'"><div class="sess-top"><div class="badge">'+s.day+'</div>'+
      '<div class="grow"><div style="font-weight:700">'+fmtBRfull(s.date)+'</div>'+
      '<div class="meta">'+n+' séries'+(s.duration?' · '+fmtDur(s.duration):'')+(s.mode==='curto'?' · treino curto':'')+' · '+Math.round(vol)+' kg de volume</div></div>'+ 
      '<button class="del" data-del="'+s.id+'">✕</button></div><div class="det">'+det+anatMini+'</div></div>';
  });
  return h+'</div>';
}
function bindHistorico(){
  document.querySelectorAll('.sess').forEach(function(el){ el.onclick=function(){ el.classList.toggle('open'); }; });
  document.querySelectorAll('[data-del]').forEach(function(b){ b.onclick=function(ev){ ev.stopPropagation();
    dlg({title:'Apagar treino', sub:'Este treino será removido do histórico.', dangerous:true, ok:'Apagar', onOk:function(){
      var id=+b.getAttribute('data-del');
      state.sessions=state.sessions.filter(function(s){return s.id!==id;}); save(); render();
      toast('Treino apagado');
    }});
  };});
}

function qRir(set){
  if(!set) return null;
  var v=set.rir!==undefined?set.rir:(set.RIR!==undefined?set.RIR:null);
  if(v===null||v===undefined||v==='') return null;
  v=parseFloat(v); if(!isFinite(v)) return null;
  return v>=6?6:Math.max(0,Math.min(5,v));
}
function decorateHistoricoRir(){
  var ss=sortedSessions().reverse();
  document.querySelectorAll('.sess').forEach(function(el, si){
    var session=ss[si]; if(!session) return;
    var lines=el.querySelectorAll('.det .line'), lineIndex=0;
    Object.keys(session.entries||{}).forEach(function(name){
      var line=lines[lineIndex++]; if(!line) return;
      var values=(session.entries[name]||[]).map(function(set){ return qRir(set); }).filter(function(q){ return q!==null; });
      if(values.length){ var tag=document.createElement('span'); tag.className='rirtag'; tag.style.marginLeft='6px'; tag.textContent='RIR '+values.join('/'); line.appendChild(tag); }
    });
  });
}
