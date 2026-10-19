/* Android 12+ usa a abertura nativa; WebView antigo e navegador usam a mesma marca. */
(function () {
  try { if (window.AndroidBridge && AndroidBridge.hasNativeLaunchAnimation()) return; } catch (_) {}
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const started = Date.now();
  const screen = document.createElement('div');
  screen.className = 'launch-screen';
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-label', 'Abrindo NutriTrack');
  screen.setAttribute('tabindex', '-1');
  screen.innerHTML = `<svg class="launch-mark" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path pathLength="1" d="M18 9a9 9 0 1 1-9 9"/><path pathLength="1" d="M18 12.5a5.5 5.5 0 1 1-4.76 2.75"/><path pathLength="1" d="M18 16a2 2 0 1 1-2 2"/></svg><p class="launch-name">NutriTrack</p><p class="launch-caption">Um dia de cada vez.</p><button class="launch-skip" type="button">Entrar no app</button>`;
  document.body.appendChild(screen);
  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(fallback);
    const app = document.getElementById('app');
    if (app) app.inert = false;
    const hadFocus = screen.contains(document.activeElement);
    screen.classList.add('leaving');
    setTimeout(() => {
      screen.remove();
      if (hadFocus && app) { app.setAttribute('tabindex', '-1'); app.focus({preventScroll:true}); }
    }, reduced ? 0 : 180);
  }
  screen.querySelector('button').onclick = dismiss;
  screen.addEventListener('keydown', event => { if (event.key === 'Escape') dismiss(); });
  const fallback = setTimeout(dismiss, 3000);
  document.addEventListener('DOMContentLoaded', () => {
    if (dismissed) return;
    const app = document.getElementById('app');
    if (app) app.inert = true;
    screen.focus({preventScroll:true});
    setTimeout(dismiss, reduced ? 0 : Math.max(0, 950 - (Date.now() - started)));
  }, {once:true});
})();
