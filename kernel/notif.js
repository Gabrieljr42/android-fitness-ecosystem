/* ==========================================================================
   KERNEL NOTIF — Notifications & PWA Installation
   ========================================================================== */

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', function(e) { 
    e.preventDefault(); 
    if (typeof deferredPrompt !== 'undefined') deferredPrompt = e; 
    if (typeof render === 'function' && (typeof tab === 'undefined' || tab === 'treino' || tab === 'ficha')) render(); 
  });
  window.addEventListener('appinstalled', function() { 
    if (typeof deferredPrompt !== 'undefined') deferredPrompt = null; 
    if (typeof toast === 'function') toast('App instalado!'); 
    if (typeof render === 'function') render(); 
  });
}

function notifState() {
  if (typeof window !== 'undefined' && window.AndroidBridge && window.AndroidBridge.sendNotification) return 'granted';
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

function enableNotify() {
  if (typeof initAudio === 'function') initAudio();
  if (typeof Notification === 'undefined') { 
    if (typeof toast === 'function') toast('Notificações indisponíveis aqui'); 
    return; 
  }
  try {
    Notification.requestPermission().then(function(p) {
      if (p === 'granted') { 
        if (typeof notify === 'function') notify('Avisos ativados ✓', 'Você será avisado no fim de cada descanso.'); 
        if (typeof toast === 'function') toast('Notificações ativadas ✓'); 
      } else if (p === 'denied') { 
        if (typeof toast === 'function') toast('Bloqueado — libere nas config. do navegador'); 
      }
      if (typeof render === 'function') render();
    });
  } catch (e) { 
    if (typeof toast === 'function') toast('Não foi possível ativar aqui'); 
  }
}

function doInstall() {
  if (typeof deferredPrompt !== 'undefined' && deferredPrompt) { 
    deferredPrompt.prompt(); 
    if (deferredPrompt.userChoice) { 
      deferredPrompt.userChoice.then(function() { 
        deferredPrompt = null; 
        if (typeof render === 'function') render(); 
      }); 
    } 
  } else { 
    if (typeof toast === 'function') toast('Menu ⋮ do navegador → “Instalar app”'); 
  }
}
