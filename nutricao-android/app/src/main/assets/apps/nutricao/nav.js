/* Navegação, registro de refeições e ciclo de vida dos formulários. */
function navigateNutriTab(tab) {
  if (!['hoje', 'diario', 'alimentos', 'metas', 'ajustes'].includes(tab)) return;
  state.tab = tab;
  render();
  if ($('#main')) $('#main').scrollTop = 0;
}

function syncNutriNavigation() {
  $$('#nav button').forEach(button => {
    const selected = button.dataset.tab === state.tab;
    button.classList.toggle('on', selected);
    button.setAttribute('aria-current', selected ? 'page' : 'false');
  });
  const settings = $('#btnAjustes');
  if (settings) settings.setAttribute('aria-pressed', String(state.tab === 'ajustes'));
  const register = $('#btnRegistrar');
  if (register) register.textContent = getActiveDate() === today() ? '+ Registrar refeição' : '+ Registrar neste dia';
}

$$('#nav button').forEach(button => {
  button.onclick = () => navigateNutriTab(button.dataset.tab);
});
if ($('#btnAjustes')) $('#btnAjustes').onclick = () => navigateNutriTab('ajustes');
if ($('#btnRegistrar')) $('#btnRegistrar').onclick = abrirRegistro;

function openModal(html) {
  const backdrop = $('#modalBack');
  const modal = $('#modal');
  modal.innerHTML = html;
  backdrop.classList.add('show');
  // O dialog nativo cuida de foco, teclado, leitor de tela e conteúdo inerte.
  if (typeof backdrop.showModal === 'function' && !backdrop.open) backdrop.showModal();
  modal.scrollTop = 0;
}

function closeModal() {
  const backdrop = $('#modalBack');
  backdrop.classList.remove('show');
  if (typeof backdrop.close === 'function' && backdrop.open) backdrop.close();
}
$('#modalBack').onclick = event => { if (event.target.id === 'modalBack') closeModal(); };
$('#modalBack').oncancel = event => { event.preventDefault(); closeModal(); };
$('#modalBack').onclose = () => { if (!$('#modalBack').open) $('#modalBack').classList.remove('show'); };

function handleAppBack() {
  if ($('#modalBack').classList.contains('show')) { closeModal(); return true; }
  if (state.tab !== 'hoje') { navigateNutriTab('hoje'); return true; }
  return false;
}

function nutriIcon(name) {
  const paths = {
    camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
    text: '<path d="M4 5h16M4 12h16M4 19h10"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    day: '<path d="M5 4h14v17H5zM8 2v4M16 2v4M8 11h8M8 15h6"/>',
    water: '<path d="M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',
    activity: '<path d="m13 2-9 12h8l-1 8 9-12h-8z"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.plus}</svg>`;
}

function abrirRegistro() {
  const date = getActiveDate();
  const title = date === today() ? 'Hoje' : activeDateLabel(date);
  openModal(`<h2>Registrar refeição</h2><p class="sub">${escapeHtml(title)}</p>
    <div class="register-options">
      <button class="register-choice" id="btnFoto">${nutriIcon('camera')}<span><b>Fotografar o prato</b><small>Identifique e revise os alimentos</small></span></button>
      <button class="register-choice" id="btnTextoIA">${nutriIcon('text')}<span><b>Descrever a refeição</b><small>Conte o que comeu por texto ou voz</small></span></button>
      <button class="register-choice" id="btnBuscarAlimento">${nutriIcon('search')}<span><b>Buscar alimento ou refeição salva</b><small>Use seu catálogo e plano semanal</small></span></button>
      <button class="register-choice" id="btnMan">${nutriIcon('plus')}<span><b>Adicionar manualmente</b><small>Informe os alimentos e suas porções</small></span></button>
      <button class="register-choice" id="btnResumoDiaIA">${nutriIcon('day')}<span><b>Importar resumo do dia</b><small>Reúna texto e fotos das refeições</small></span></button>
    </div>`);
  $('#btnFoto').onclick = () => { closeModal(); abrirFoto(); };
  $('#btnTextoIA').onclick = abrirTextoIA;
  $('#btnMan').onclick = abrirManual;
  $('#btnResumoDiaIA').onclick = abrirResumoDiaIA;
  $('#btnBuscarAlimento').onclick = () => { closeModal(); navigateNutriTab('alimentos'); $('#busca')?.focus(); };
}

window.handleAppBack = handleAppBack;
