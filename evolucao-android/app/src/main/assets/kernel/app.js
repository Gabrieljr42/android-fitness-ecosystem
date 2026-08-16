/* kernel/app.js — shell, navegação e boot */
/* ---------- shell ---------- */
var NAV_ICONS={
  treino:'<path d="M12 3v6m0 6v6"/><line x1="5" y1="9" x2="19" y2="9"/><circle cx="5" cy="9" r="2"/><circle cx="19" cy="9" r="2"/><line x1="7" y1="20" x2="17" y2="20"/>',
  corrida:'<path d="M13 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="m15.5 10 3.5 1.5M10.5 8.5 7 10l-3 4.5"/><path d="m8.5 13 2.5 3 4-1.5 2.5 5.5M11 16l-3.5 5.5"/><path d="M14.5 7 12 12.5"/>',
  progresso:'<polyline points="4 18 9 13 13 15.5 20 7"/><polyline points="16 7 20 7 20 11"/>',
  historico:'<rect x="4" y="5" width="16" height="16" rx="3"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="8" y1="3.5" x2="8" y2="7"/><line x1="16" y1="3.5" x2="16" y2="7"/>',
  ficha:'<path d="M6 4h9l4 4v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M15 4v4h4"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/>'
};
var TABS=[
  {id:'treino', ico:'treino', label:'Treino'},
  {id:'corrida', ico:'corrida', label:'Corrida'},
  {id:'progresso', ico:'progresso', label:'Dashboard'},
  {id:'historico', ico:'historico', label:'Histórico'},
  {id:'ficha', ico:'ficha', label:'Ficha'}
];
function render(){
  var wk=weekCount();
  /* Todas as abas compartilham o mesmo sistema de cores claro para manter
     sinergia visual entre Treino, Corrida, Dashboard, Histórico e Ficha. */
  document.body.classList.add('light-theme');
  document.body.classList.toggle('workout-active',tab==='treino');
  var tc=document.querySelector('meta[name="theme-color"]');
  if(tc) tc.content=tab==='treino'?'#f9fafb':'#f9fafb';
  document.getElementById('wk').innerHTML='<b>'+wk+'</b> treino'+(wk===1?'':'s')+' esta semana';
  var app=document.getElementById('app');
  if(tab==='treino'){ app.innerHTML=renderTreino(); bindTreino(); decorateTreino(); }
  else if(tab==='corrida'){ app.innerHTML=renderCorrida(); bindCorrida(); decorateCorrida(); }
  else if(tab==='progresso'){ app.innerHTML=renderProgresso(); bindProgresso(); }
  else if(tab==='historico'){ app.innerHTML=renderHistorico(); bindHistorico(); decorateHistoricoRir(); }
  else { app.innerHTML=renderFicha(); bindFicha(); decorateFicha(); decorateProgressaoFicha(); }
  var nav=document.getElementById('nav');
  nav.innerHTML=TABS.map(function(t){ return '<button data-tab="'+t.id+'" class="'+(tab===t.id?'on':'')+'"><span class="ico"><svg viewBox="0 0 24 24">'+NAV_ICONS[t.ico]+'</svg></span>'+t.label+'</button>'; }).join('');
  nav.querySelectorAll('button').forEach(function(b){ b.onclick=function(){ tab=b.getAttribute('data-tab'); calOpen=false; window.scrollTo(0,0); render(); }; });
}
initRest();
initLiveTimer();
render();

/* service worker — habilita instalação + uso offline (só em http/https) */
if('serviceWorker' in navigator && location.protocol.indexOf('http')===0){
  navigator.serviceWorker.register('sw.js').catch(function(){});
}
