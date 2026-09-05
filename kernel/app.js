/* ==========================================================================
   KERNEL APP — Shell, Router, Navigation & Boot
   ========================================================================== */

var NAV_ICONS = typeof NAV_ICONS !== 'undefined' ? NAV_ICONS : {
  treino: '<path d="M12 3v6m0 6v6"/><line x1="5" y1="9" x2="19" y2="9"/><circle cx="5" cy="9" r="2"/><circle cx="19" cy="9" r="2"/><line x1="7" y1="20" x2="17" y2="20"/>',
  corrida: '<path d="M13 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="m15.5 10 3.5 1.5M10.5 8.5 7 10l-3 4.5"/><path d="m8.5 13 2.5 3 4-1.5 2.5 5.5M11 16l-3.5 5.5"/><path d="M14.5 7 12 12.5"/>',
  progresso: '<polyline points="4 18 9 13 13 15.5 20 7"/><polyline points="16 7 20 7 20 11"/>',
  historico: '<rect x="4" y="5" width="16" height="16" rx="3"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="8" y1="3.5" x2="8" y2="7"/><line x1="16" y1="3.5" x2="16" y2="7"/>',
  ficha: '<path d="M6 4h9l4 4v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M15 4v4h4"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/>'
};

var TABS = [
  { id: 'treino', ico: 'treino', label: 'Treino' },
  { id: 'corrida', ico: 'corrida', label: 'Corrida' },
  { id: 'progresso', ico: 'progresso', label: 'Dashboard' },
  { id: 'historico', ico: 'historico', label: 'Histórico' },
  { id: 'ficha', ico: 'ficha', label: 'Ficha' }
];

function render() {
  if (typeof checkDraftInactivity === 'function') checkDraftInactivity();
  var wk = typeof weekCount === 'function' ? weekCount() : 0;
  
  var tc = typeof document !== 'undefined' ? document.querySelector('meta[name="theme-color"]') : null;
  if (tc) tc.content = '#09090b';
  
  var wkEl = typeof document !== 'undefined' ? document.getElementById('wk') : null;
  if (wkEl) wkEl.innerHTML = '<b>' + wk + '</b> treino' + (wk === 1 ? '' : 's') + ' esta semana';
  
  var app = typeof document !== 'undefined' ? document.getElementById('app') : null;
  if (!app) return;
  
  var currentTab = typeof tab !== 'undefined' ? tab : 'treino';
  
  if (typeof document !== 'undefined' && document.body && document.body.classList) {
    document.body.classList.toggle('workout-active', currentTab === 'treino');
  }
  
  if (currentTab === 'treino' && typeof renderTreino === 'function') { 
    app.innerHTML = renderTreino(); 
    if (typeof bindTreino === 'function') bindTreino(); 
    if (typeof decorateTreino === 'function') decorateTreino(); 
  } else if (currentTab === 'corrida' && typeof renderCorrida === 'function') { 
    app.innerHTML = renderCorrida(); 
    if (typeof bindCorrida === 'function') bindCorrida(); 
    if (typeof decorateCorrida === 'function') decorateCorrida(); 
  } else if (currentTab === 'progresso' && typeof renderProgresso === 'function') { 
    app.innerHTML = renderProgresso(); 
    if (typeof bindProgresso === 'function') bindProgresso(); 
  } else if (currentTab === 'historico' && typeof renderHistorico === 'function') { 
    app.innerHTML = renderHistorico(); 
    if (typeof bindHistorico === 'function') bindHistorico(); 
    if (typeof decorateHistoricoRir === 'function') decorateHistoricoRir(); 
  } else if (typeof renderFicha === 'function') { 
    app.innerHTML = renderFicha(); 
    if (typeof bindFicha === 'function') bindFicha(); 
    if (typeof decorateFicha === 'function') decorateFicha(); 
    if (typeof decorateProgressaoFicha === 'function') decorateProgressaoFicha(); 
  }
  
  var nav = document.getElementById('nav');
  if (nav) {
    nav.innerHTML = TABS.map(function(t) { 
      return '<button data-tab="' + t.id + '" class="' + (currentTab === t.id ? 'on' : '') + '">' +
        '<span class="ico"><svg viewBox="0 0 24 24">' + (NAV_ICONS[t.ico] || '') + '</svg></span>' +
        t.label + '</button>'; 
    }).join('');
    
    nav.querySelectorAll('button').forEach(function(b) { 
      b.onclick = function() { 
        tab = b.getAttribute('data-tab'); 
        if (typeof calOpen !== 'undefined') calOpen = false; 
        if (typeof window !== 'undefined') window.scrollTo(0, 0); 
        render(); 
      }; 
    });
  }
}

if (typeof initRest === 'function') initRest();
if (typeof initLiveTimer === 'function') initLiveTimer();
if (typeof render === 'function' && typeof document !== 'undefined' && document.getElementById('app')) render();

/* service worker — habilita instalação + uso offline (só em http/https) */
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof location !== 'undefined' && location.protocol.indexOf('http') === 0) {
  navigator.serviceWorker.register('sw.js').catch(function() {});
}
