/* kernel/notif.js — notificações e instalação PWA */
/* ---- instalação (PWA) ---- */
if(typeof window!=='undefined'){
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferredPrompt=e; if(tab==='treino'||tab==='ficha') render(); });
  window.addEventListener('appinstalled', function(){ deferredPrompt=null; toast('App instalado! 💪'); render(); });
}
function notifState(){
  if(typeof window!=='undefined' && window.AndroidBridge && window.AndroidBridge.sendNotification) return 'granted';
  if(typeof Notification==='undefined') return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}
function enableNotify(){
  initAudio();
  if(typeof Notification==='undefined'){ toast('Notificações indisponíveis aqui'); return; }
  try{
    Notification.requestPermission().then(function(p){
      if(p==='granted'){ notify('Avisos ativados ✓','Você será avisado no fim de cada descanso.'); toast('Notificações ativadas ✓'); }
      else if(p==='denied'){ toast('Bloqueado — libere nas config. do navegador'); }
      render();
    });
  }catch(e){ toast('Não foi possível ativar aqui'); }
}
function doInstall(){
  if(deferredPrompt){ deferredPrompt.prompt(); if(deferredPrompt.userChoice){ deferredPrompt.userChoice.then(function(){ deferredPrompt=null; render(); }); } }
  else { toast('Menu ⋮ do navegador → “Instalar app”'); }
}
