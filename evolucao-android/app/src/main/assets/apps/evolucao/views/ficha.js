/* apps/evolucao/views/ficha.js */
/* ---------- FICHA ---------- */
function parseRest(str, cur){
  str=String(str).trim(); if(!str) return cur;
  var sec;
  if(str.indexOf(':')>=0){ var p=str.split(':'); sec=(parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0); }
  else sec=parseInt(str,10)||0;
  return Math.min(900, Math.max(10, sec));
}
function parseTarget(str, cur){
  str=String(str).trim();
  var m=str.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  if(!m) return cur;
  return { sets:Math.max(1,Math.min(10,parseInt(m[1],10)||cur.sets)), reps:m[2].trim().slice(0,10) };
}
function renderFicha(){
  var st=state.settings;
  var h='<h1>Ficha</h1><div class="sub">Nome renomeia · 🎯 meta · ⏱ descanso · setas reordenam</div>';
  ['A','B','C'].forEach(function(d){
    h+='<h2>'+d+' — '+esc(state.ficha[d].nome)+'</h2><div class="card">';
    state.ficha[d].ex.forEach(function(exo,i){
      h+='<div class="exrow2"><div class="exrow-top">'+exIcon(exo.n)+
        '<span class="name" data-rn="'+d+':'+i+'">'+esc(exo.n)+'</span>'+
        '<button class="ic dg" data-rm="'+d+':'+i+'">✕</button></div>'+
        '<div class="exrow-bottom">'+
          '<button class="rpill" data-inc="'+d+':'+i+'">inc '+nkg(exo.inc)+' kg</button>'+ 
          '<button class="rpill" data-side="'+d+':'+i+'">'+(exo.perSide?'lado':'total')+'</button>'+ 
          '<button class="rpill" data-target="'+d+':'+i+'">🎯 '+exo.sets+'×'+esc(exo.reps)+'</button>'+
          '<button class="rpill" data-rest="'+d+':'+i+'">⏱ '+fmtClock(exo.rest)+'</button>'+
          '<button class="ic" data-up="'+d+':'+i+'">↑</button>'+
          '<button class="ic" data-dn="'+d+':'+i+'">↓</button>'+
        '</div></div>';
    });
    h+='<div class="row" style="margin-top:10px"><input class="txt grow" id="add'+d+'" placeholder="Novo exercício..."><button class="cta sm" data-addex="'+d+'" style="width:auto;flex:0 0 auto;padding:11px 16px">+</button></div></div>';
  });

  var secure = (typeof window!=='undefined' && window.isSecureContext);
  var ns=notifState();
  var notifTxt = !secure ? 'abra pelo link publicado (https) para ativar'
    : ns==='unsupported' ? 'indisponível neste navegador'
    : ns==='granted' ? 'ativadas ✓ (só o som do app, sem duplicar)'
    : ns==='denied' ? 'bloqueadas — libere nas config. do navegador'
    : 'toque em “Ativar notificações” abaixo';
  var setupBtns=[];
  if(secure && ns==='default') setupBtns.push('<button class="cta sm" id="fNotify" style="flex:1">🔔 Ativar notificações</button>');
  if(secure && deferredPrompt) setupBtns.push('<button class="cta sm" id="fInstall" style="flex:1;background:var(--card2);color:var(--txt);box-shadow:none;border:1px solid var(--line)">📲 Instalar app</button>');
  h+='<h2>Descanso · avisos</h2><div class="card">'+
    '<div class="setrow"><div class="lbl">Iniciar timer automático<small>começa a contar assim que você adiciona uma série</small></div>'+
    '<div class="toggle'+(st.restAuto?' on':'')+'" id="tgAuto"><div class="knob"></div></div></div>'+
    '<div class="setrow"><div class="lbl">Som + notificação ao terminar<small>'+notifTxt+'</small></div>'+ 
    '<div class="toggle'+(st.alarm?' on':'')+'" id="tgAlarm"><div class="knob"></div></div></div>'+ 
    '<div class="setrow"><div class="lbl">Avançar ao concluir exercício<small>Ao marcar todas as séries, abre automaticamente o próximo exercício.</small></div>'+ 
    '<div class="toggle'+(st.autoAdvance!==false?' on':'')+'" id="tgAdvance"><div class="knob"></div></div></div>'+ 
    (setupBtns.length?'<div class="row" style="margin-top:11px">'+setupBtns.join('')+'</div>':'')+
    '<div class="hint" style="text-align:left">Os tempos já vêm ajustados por exercício (compostos pesados ~2,5–3 min, isoladores ~60–90 s). O aviso funciona melhor com o app aberto na tela.</div></div>';

  h+='<h2>Progressão</h2><div class="card"><div class="setrow"><div class="lbl">Sugestão automática de carga<small>Dupla progressão com volume, travamento e aquecimento separados.</small></div><div class="toggle'+(st.progressao.enabled?' on':'')+'" id="tgProgress"><div class="knob"></div></div></div>'+ 
    '<div class="row" style="margin-top:10px"><button class="rpill" id="stallBtn">Travado: '+st.progressao.stallSessions+' sessões</button><button class="rpill" id="deloadBtn">Deload: '+st.progressao.deloadPct+'%</button></div>'+ 
    '<div class="hint" style="text-align:left">O incremento e o equipamento são inferidos pelo nome e podem ser ajustados nos dados do backup.</div></div>';

  var nativeSave = (typeof window!=='undefined' && window.AndroidBridge && window.AndroidBridge.saveBackup);
  h+='<h2>Dados</h2><div class="card"><div class="databtns">'+
    '<button id="expBtn">⬇ Fazer backup</button><button id="impBtn">⬆ Restaurar arquivo</button><button class="dg" id="wipeBtn">Apagar tudo</button></div>'+
    '<input type="file" id="impFile" accept=".json,application/json" style="display:none">'+
    (nativeSave?'':'<div id="backupBox" style="display:none;margin-top:10px">'+
      '<div class="hint" style="text-align:left;margin-top:0">Se o download não abrir sozinho, copie o texto abaixo e salve num arquivo .json:</div>'+
      '<textarea id="backupText" class="ta" readonly style="height:70px;margin-top:6px"></textarea>'+
      '<button class="cta sm" id="copyBackup" style="width:100%;margin-top:6px">📋 Copiar texto</button></div>')+
    '<div class="setrow" style="margin-top:6px"><div class="lbl">Ou cole um backup em texto<small>útil se o seletor de arquivo não abrir</small></div></div>'+
    '<textarea id="pasteRestore" class="ta" placeholder="Cole aqui o conteúdo do arquivo de backup..." style="height:60px;margin-bottom:8px"></textarea>'+
    '<button class="cta sm" id="pasteRestoreBtn" style="width:100%">Restaurar deste texto</button>'+
    '<div class="hint" style="text-align:left">Restaurar sempre <b style="color:var(--txt)">combina</b> com o que já está salvo aqui — nada do que você já registrou é perdido ou sobrescrito. No celular: menu do navegador → "Adicionar à tela inicial" pra abrir como app.</div></div>';
  return h;
}
function doImportJSON(text){
  try{
    var incoming = migrate(JSON.parse(text));
    if(!incoming.ficha||!incoming.sessions) throw 0;
    var r = mergeState(state, incoming);
    state = r.state; save();
    toast('Backup combinado: +'+r.addedSessions+' treino(s), +'+r.addedPeso+' pesagem(ns)');
    render();
  }catch(err){ toast('Arquivo/texto inválido'); }
}
function bindFicha(){
  function P(a){ var p=a.split(':'); return {d:p[0], i:+p[1]}; }
  document.querySelectorAll('[data-rn]').forEach(function(el){ el.onclick=function(){
    var p=P(el.getAttribute('data-rn')), exo=state.ficha[p.d].ex[p.i];
    dlg({title:'Renomear exercício', sub:'O nome anterior fica registrado como apelido (histórico preservado).', input:true, value:exo.n, onOk:function(v){
      var nv=String(v||'').trim(); if(!nv) return;
      if(nv!==exo.n) exo.aliases=uniqueStrings((exo.aliases||[]).concat([exo.n]));
      exo.n=nv; save(); render();
    }});
  };});
  document.querySelectorAll('[data-target]').forEach(function(b){ b.onclick=function(){
    var p=P(b.getAttribute('data-target')), exo=state.ficha[p.d].ex[p.i];
    dlg({title:'Meta de séries × reps', sub:'Ex.: 3x12 ou 4x8-10.', input:true, value:exo.sets+'x'+exo.reps, onOk:function(v){
      var t=parseTarget(v,{sets:exo.sets,reps:exo.reps}); exo.sets=t.sets; exo.reps=t.reps; save(); render();
    }});
  };});
  document.querySelectorAll('[data-rest]').forEach(function(b){ b.onclick=function(){
    var p=P(b.getAttribute('data-rest')), cur=state.ficha[p.d].ex[p.i].rest;
    dlg({title:'Descanso do exercício', sub:'Em segundos (ex.: 90) ou no formato m:ss (ex.: 2:30).', input:true, num:true, value:fmtClock(cur), onOk:function(v){
      state.ficha[p.d].ex[p.i].rest=parseRest(v,cur); save(); render();
    }});
  };});
  document.querySelectorAll('[data-inc]').forEach(function(b){ b.onclick=function(){
    var p=P(b.getAttribute('data-inc')), exo=state.ficha[p.d].ex[p.i];
    dlg({title:'Menor incremento disponível', sub:'Em kg (ex.: 2.5).', input:true, num:true, value:exo.inc, onOk:function(v){
      var value=parseFloat(String(v).replace(',','.')); if(isFinite(value)&&value>=0&&value<=100){ exo.inc=Math.round(value*10)/10; save(); render(); }
    }});
  };});
  document.querySelectorAll('[data-side]').forEach(function(b){ b.onclick=function(){
    var p=P(b.getAttribute('data-side')), exo=state.ficha[p.d].ex[p.i];
    exo.perSide=!exo.perSide; save(); render();
  };});
  document.querySelectorAll('[data-up]').forEach(function(b){ b.onclick=function(){
    var p=P(b.getAttribute('data-up')), a=state.ficha[p.d].ex; if(p.i===0)return;
    var t=a[p.i-1]; a[p.i-1]=a[p.i]; a[p.i]=t; save(); render();
  };});
  document.querySelectorAll('[data-dn]').forEach(function(b){ b.onclick=function(){
    var p=P(b.getAttribute('data-dn')), a=state.ficha[p.d].ex; if(p.i>=a.length-1)return;
    var t=a[p.i+1]; a[p.i+1]=a[p.i]; a[p.i]=t; save(); render();
  };});
  document.querySelectorAll('[data-rm]').forEach(function(b){ b.onclick=function(){
    var p=P(b.getAttribute('data-rm'));
    dlg({title:'Remover exercício', sub:'"'+state.ficha[p.d].ex[p.i].n+'" será removido da ficha (o histórico de treinos é mantido).', dangerous:true, ok:'Remover', onOk:function(){
      state.ficha[p.d].ex.splice(p.i,1); save(); render();
    }});
  };});
  document.querySelectorAll('[data-addex]').forEach(function(b){ b.onclick=function(){
    var d=b.getAttribute('data-addex'), inp=document.getElementById('add'+d), v=inp.value.trim();
    if(!v)return; var t=targetFor(v); state.ficha[d].ex.push(EX(v,restFor(v),t.sets,t.reps)); save(); render();
  };});
  document.getElementById('tgAuto').onclick=function(){ state.settings.restAuto=!state.settings.restAuto; save(); render(); };
  document.getElementById('tgAlarm').onclick=function(){
    state.settings.alarm=!state.settings.alarm;
    if(state.settings.alarm){ initAudio(); askNotify(); }
    save(); render();
  };
  document.getElementById('tgAdvance').onclick=function(){ state.settings.autoAdvance=state.settings.autoAdvance===false; save(); render(); };
  document.getElementById('tgProgress').onclick=function(){ state.settings.progressao.enabled=!state.settings.progressao.enabled; save(); render(); };
  document.getElementById('stallBtn').onclick=function(){
    dlg({title:'Sessões para considerar travado', sub:'Após quantas sessões sem progresso sugerir ajuste de carga (2–10).', input:true, num:true, value:state.settings.progressao.stallSessions, onOk:function(v){
      var n=parseInt(v,10); if(n>=2&&n<=10){ state.settings.progressao.stallSessions=n; save(); render(); }
    }});
  };
  document.getElementById('deloadBtn').onclick=function(){
    dlg({title:'Percentual de deload', sub:'Redução de carga sugerida após travamento (0–50%).', input:true, num:true, value:state.settings.progressao.deloadPct, onOk:function(v){
      var n=parseFloat(v); if(isFinite(n)&&n>=0&&n<=50){ state.settings.progressao.deloadPct=n; save(); render(); }
    }});
  };
  var fn=document.getElementById('fNotify'); if(fn) fn.onclick=enableNotify;
  var fi=document.getElementById('fInstall'); if(fi) fi.onclick=doInstall;

  var nativeSave = (typeof window!=='undefined' && window.AndroidBridge && window.AndroidBridge.saveBackup);
  document.getElementById('expBtn').onclick=function(){
    var json=JSON.stringify(state,null,1);
    var fname='evolucao-treino-backup-'+todayISO()+'.json';
    if(nativeSave){ window.AndroidBridge.saveBackup(json, fname); return; }
    try{
      var blob=new Blob([json],{type:'application/json'});
      var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fname;
      document.body.appendChild(a); a.click(); a.remove();
    }catch(e){}
    var box=document.getElementById('backupBox'), ta=document.getElementById('backupText');
    if(box){ box.style.display='block'; ta.value=json; }
    toast('Backup gerado');
  };
  document.getElementById('impBtn').onclick=function(){ document.getElementById('impFile').click(); };
  document.getElementById('impFile').onchange=function(e){
    var f=e.target.files[0]; if(!f)return; var rd=new FileReader();
    rd.onload=function(){ doImportJSON(rd.result); };
    rd.readAsText(f);
  };
  var cb=document.getElementById('copyBackup');
  if(cb) cb.onclick=function(){
    var ta=document.getElementById('backupText'); ta.select();
    try{ navigator.clipboard.writeText(ta.value).then(function(){ toast('Copiado ✓'); }); }
    catch(e){ try{ document.execCommand('copy'); toast('Copiado ✓'); }catch(e2){ toast('Selecione e copie manualmente'); } }
  };
  document.getElementById('pasteRestoreBtn').onclick=function(){
    var v=document.getElementById('pasteRestore').value.trim();
    if(!v){ toast('Cole o texto do backup primeiro'); return; }
    doImportJSON(v);
  };
  document.getElementById('wipeBtn').onclick=function(){
    dlg({title:'Apagar todos os dados', sub:'Todos os treinos, pesagens e a ficha serão apagados. Faça um backup antes, se quiser.', dangerous:true, ok:'Apagar tudo', onOk:function(){
      state=JSON.parse(JSON.stringify(DEFAULT_STATE)); save(); render();
    }});
  };
}
function decorateFicha(){
  document.querySelectorAll('.exrow2 .name').forEach(function(nameEl){
    var found=null;
    ['A','B','C'].some(function(day){ return state.ficha[day].ex.some(function(exo){ if(exo.n===nameEl.textContent){ found=exo; return true; } return false; }); });
    if(!found) return;
    var row=nameEl.closest('.exrow2'), bottom=row&&row.querySelector('.exrow-bottom');
    if(!bottom || bottom.querySelector('.eqpill')) return;
    var btn=document.createElement('button'); btn.className='rpill eqpill'; btn.textContent='⚙ '+(found.eq||'maquina')+' · +'+nkg(found.inc||0)+(found.perSide?' / lado':'');
    window.__eqExo=found;
    bottom.appendChild(btn);
    btn.onclick=function(){
      var curEq=found.eq||'maquina';
      dlg({title:'Equipamento e incremento', sub:'Escolha o equipamento; o incremento é o menor peso disponível neste exercício.', seg:['halter','polia','maquina','barra','corporal'], segVal:curEq, onOk:function(){
        var eq=boxSel();
        if(eq==='halter'){
          dlg({title:'Carga por lado?', sub:'Se sim, o app registra a carga de cada lado separadamente (ex.: halteres).', onOk:function(){ dlgEqInc(eq, true); }, onCancel:function(){ dlgEqInc(eq, false); }});
        } else { dlgEqInc(eq, false); }
      }});
    };
  });
}
function dlgEqInc(eq, perSide){
  var exo=window.__eqExo||null;
  dlg({title:'Incremento em kg', sub:'Menor peso disponível neste exercício.', input:true, num:true, value:(exo&&exo.inc==null?Progression.defaultInc(eq):exo&&exo.inc), onOk:function(v){
    var inc=parseFloat(String(v).replace(',','.'));
    if(!isFinite(inc)||inc<0) return;
    if(exo){ exo.eq=eq; exo.inc=inc; exo.perSide=perSide; save(); render(); }
  }});
}

/* Adds autoregulation controls to the modular ficha without coupling them to
   the visual markup generated by the redesign. */
function decorateProgressaoFicha(){
  if(tab!=='ficha') return;
  ['A','B','C'].forEach(function(day){
    state.ficha[day].ex.forEach(function(exo){
      var nodes=document.querySelectorAll('.exrow2 .name');
      for(var i=0;i<nodes.length;i++){
        if(nodes[i].textContent!==exo.n) continue;
        var bottom=nodes[i].closest('.exrow2').querySelector('.exrow-bottom');
        if(!bottom || bottom.querySelector('.rirbtn')) break;
        var btn=document.createElement('button'); btn.className='rpill rirbtn';
        var p=exo.progressao||{}; var value=p.targetRir==null?state.settings.progressao.targetRir:valueOrDefault(p.targetRir,2);
        btn.textContent='RIR alvo '+value;
        btn.onclick=function(){
          dlg({title:'RIR alvo do exercicio', sub:'Repeticoes que voce deve conseguir manter ao terminar cada serie. Use 0 para falha tecnica.', input:true, num:true, value:value, onOk:function(v){
            var n=parseInt(v,10); if(isFinite(n)&&n>=0&&n<=6){ exo.progressao=exo.progressao||{}; exo.progressao.targetRir=n; save(); render(); }
          }});
        };
        bottom.appendChild(btn); break;
      }
    });
  });
  if(document.getElementById('progressaoAdvanced')) return;
  var cfg=state.settings.progressao, box=document.createElement('div'); box.id='progressaoAdvanced';
  box.innerHTML='<h2>Autoregulacao</h2><div class="card">'+
    '<div class="setrow"><div class="lbl">RIR alvo padrao<small>Usado quando o exercicio nao tem um alvo proprio.</small></div><button class="rpill" id="defaultRirBtn">'+cfg.targetRir+' RIR</button></div>'+
    '<div class="setrow"><div class="lbl">Expandir faixa de reps<small>Permite algumas reps extras para evitar saltos grandes de carga.</small></div><div class="toggle'+(cfg.expandRepRange?' on':'')+'" id="expandRir"><div class="knob"></div></div></div>'+
    '<div class="setrow"><div class="lbl">Preferir mesma carga<small>Quando duas opcoes sao equivalentes, mantém o peso anterior.</small></div><div class="toggle'+(cfg.weightMatch?' on':'')+'" id="weightMatch"><div class="knob"></div></div></div></div>';
  document.getElementById('app').appendChild(box);
  document.getElementById('defaultRirBtn').onclick=function(){
    dlg({title:'RIR alvo padrao', sub:'Valor entre 0 e 6. Exercicios com alvo proprio nao mudam.', input:true, num:true, value:cfg.targetRir, onOk:function(v){ var n=parseInt(v,10); if(isFinite(n)&&n>=0&&n<=6){ cfg.targetRir=n; save(); render(); } }});
  };
  document.getElementById('expandRir').onclick=function(){ cfg.expandRepRange=!cfg.expandRepRange; save(); render(); };
  document.getElementById('weightMatch').onclick=function(){ cfg.weightMatch=!cfg.weightMatch; save(); render(); };
}
function valueOrDefault(value, fallback){ return value==null?fallback:value; }
