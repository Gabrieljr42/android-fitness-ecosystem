/* Preferência visual independente dos dados nutricionais, aplicada antes do CSS. */
(function () {
  const key = 'nt_theme';
  const system = window.matchMedia('(prefers-color-scheme: light)');
  let preference = 'dark';
  try { preference = localStorage.getItem(key) || 'dark'; } catch (_) {}
  if (!['dark', 'light', 'system'].includes(preference)) preference = 'dark';
  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'light' : 'dark') : preference;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f7f9f3' : '#101510';
  }
  window.setNutriTheme = value => {
    if (!['dark', 'light', 'system'].includes(value)) return;
    preference = value;
    try { localStorage.setItem(key, value); } catch (_) { if (typeof toast === 'function') toast('Não foi possível salvar a aparência.'); }
    apply();
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      const selected = button.dataset.themeChoice === value;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  };
  window.renderAppearanceSettings = () => `<div class="card"><h2>Aparência</h2><p class="small mb8">Escolha o tema mais confortável para você.</p><div class="seg" role="group" aria-label="Tema do aplicativo">${[['dark','Escuro'],['light','Claro'],['system','Sistema']].map(([value,label]) => `<button data-theme-choice="${value}" class="${preference === value ? 'on' : ''}" aria-pressed="${preference === value}" onclick="setNutriTheme('${value}')">${label}</button>`).join('')}</div></div>`;
  if (system.addEventListener) system.addEventListener('change', apply);
  else if (system.addListener) system.addListener(apply);
  apply();
})();
