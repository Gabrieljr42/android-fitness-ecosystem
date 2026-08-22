/* apps/nutricao/views/ajustes.js — Configurações, Lembretes, Backup e API */

const DEFAULT_LEMBRETES = [
  { id: 'cafe', nome: 'Café da manhã', hora: '07:30', ativo: true },
  { id: 'almoco', nome: 'Almoço', hora: '12:30', ativo: true },
  { id: 'lanche', nome: 'Lanche', hora: '16:00', ativo: true },
  { id: 'jantar', nome: 'Jantar', hora: '19:30', ativo: true },
  { id: 'ceia', nome: 'Ceia', hora: '22:00', ativo: false }
];

const MENSAGENS_POSITIVAS = [
  'Hora de nutrir o seu corpo e manter a sua melhor versão em alta! ✨',
  'Foco na meta! Cada refeição equilibrada é mais um passo rumo à sua evolução. 🚀',
  'Você está no comando! Que tal uma refeição deliciosa para recarregar as energias? 💪',
  'Consistência é a chave da vitória. Bora registrar com foco total! 🎯',
  'Seu corpo agradece todo o cuidado e dedicação de hoje. Bom apetite! 🥗',
  'Mais um momento para fazer escolhas incríveis e bater suas metas diárias! ⚡',
  'A disciplina de hoje constrói o resultado de amanhã. Vamos com tudo! 🏆',
  'Pausa para a sua saúde: nutra o seu corpo com o que ele precisa para brilhar! 🌟',
  'Energia lá em cima! Registre sua refeição e continue firme na sua jornada. 🔥',
  'Excelente momento para alimentar seu potencial. Mantenha o ritmo! 💥',
  'Lembrete positivo: você está indo muito bem. Bora registrar e seguir focado! 👏',
  'Cuidar de você é a sua melhor prioridade. Aproveite sua refeição! 💚',
  'Alimente seus sonhos com escolhas saudáveis e consistência! 🥑',
  'Hora de abastecer a máquina com comida de verdade! Vamos pra cima! 🔋',
  'Pequenos hábitos diários geram grandes transformações. Foco no objetivo! 📈'
];

function obterMensagemPositiva(nomeRefeicao) {
  const n = (nomeRefeicao || '').toLowerCase().trim();
  if (n.includes('água') || n.includes('agua') || n.includes('hidrata')) {
    const msgsAgua = [
      'Hidratação é poder! Beba um bom copo d’água e sinta sua energia renovada. 💧',
      'Lembrete de hidratação: seu corpo funcionando em 100%! Beba água agora. 🌊',
      'Pausa rápida para hidratar o corpo e manter a mente focada! 💦'
    ];
    return msgsAgua[Math.floor(Math.random() * msgsAgua.length)];
  }
  if (n.includes('creatina')) {
    return 'Hora da creatina! Força e foco consistentes para os seus treinos diários. ⚡';
  }
  if (n.includes('pré-treino') || n.includes('pre-treino') || n.includes('pre treino')) {
    return 'Hora de abastecer o tanque pro treino! Energia máxima e foco total. 🔥';
  }
  if (n.includes('pós-treino') || n.includes('pos-treino') || n.includes('pos treino')) {
    return 'Recuperação muscular em ação! Nutrientes certos pro seu crescimento. 🥩';
  }
  return MENSAGENS_POSITIVAS[Math.floor(Math.random() * MENSAGENS_POSITIVAS.length)];
}

function loadLembretes() {
  const saved = load(LS.reminders, null);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return DEFAULT_LEMBRETES;
}

function saveLembretes(list) {
  save(LS.reminders, list);
  if (typeof AndroidBridge !== 'undefined' && typeof AndroidBridge.syncAlarms === 'function') {
    const listWithMsgs = list.map(item => ({
      ...item,
      mensagem: obterMensagemPositiva(item.nome)
    }));
    AndroidBridge.syncAlarms(JSON.stringify(listWithMsgs));
  }
}

function renderLembretesHtml(list) {
  if (!list || list.length === 0) {
    return '<p class="small text-muted" style="padding:12px 0;text-align:center">Nenhum lembrete configurado. Adicione um horário abaixo!</p>';
  }
  return list.map((lembrete, index) => `
    <div class="remind-row" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-subtle);gap:8px">
      <div style="flex:1;min-width:0">
        <input type="text" value="${escapeHtml(lembrete.nome || '')}" style="font-weight:700;font-size:14px;color:var(--txt-primary);background:transparent;border:0;padding:2px 0;width:100%;font-family:inherit" onchange="atualizarNomeLembrete(${index}, this.value)" placeholder="Nome do lembrete"/>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        <input type="time" value="${escapeHtml(lembrete.hora)}" style="padding:6px 8px;border-radius:10px;background:var(--bg-input);color:var(--txt-primary);border:1px solid var(--border-subtle);font-family:inherit;width:auto;font-size:13px" onchange="atualizarHoraLembrete(${index}, this.value)"/>
        <label class="switch">
          <input type="checkbox" ${lembrete.ativo ? 'checked' : ''} onchange="toggleLembrete(${index}, this.checked)"/>
          <span class="slider"></span>
        </label>
        <button type="button" class="del-btn" style="background:transparent;border:0;color:var(--txt-tertiary);cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;border-radius:8px" onclick="removerLembrete(${index})" title="Excluir lembrete">
          <svg viewBox="0 0 24 24" fill="none" style="width:16px;height:16px;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

function renderAjustes(main) {
  const lembretes = loadLembretes();

  main.innerHTML = `
  <!-- API Gemini -->
  <div class="card">
    <h2>API do Gemini (análise de foto &amp; texto)</h2>
    <p class="small mb8">Chave gratuita em <a class="accent" href="https://aistudio.google.com/app/apikey" target="_blank">aistudio.google.com/app/apikey</a>. A chave fica salva apenas localmente no aparelho.</p>
    <input id="apiKeyIn" type="password" value="${apikey}" placeholder="AIza..."/>
    <button class="bigbtn secondary mt12" onclick="salvarKey()">Salvar chave</button>
    <div class="small mt8" id="keyStatus">
      ${apikey 
        ? '<span style="color:var(--status-ok)">● Chave configurada e ativa</span>' 
        : '<span style="color:var(--status-danger)">● Sem chave — a análise com IA não funcionará</span>'}
    </div>
  </div>

  <!-- Lembretes de Refeições & Horários -->
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <h2 style="margin:0">Lembretes &amp; Horários</h2>
      <span class="badge" style="font-size:11px;padding:2px 8px">${lembretes.filter(l => l.ativo).length} ativos</span>
    </div>
    <p class="small mb8">Configure alertas positivos personalizados para seus horários de refeição e hidratação.</p>
    
    <div id="lembretesList" class="lembretes-box">
      ${renderLembretesHtml(lembretes)}
    </div>

    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="bigbtn secondary" style="flex:1;min-width:140px" onclick="abrirModalNovoLembrete()">
        <svg viewBox="0 0 24 24" fill="none" style="width:16px;height:16px;vertical-align:middle;margin-right:6px">
          <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Adicionar horário
      </button>

      <button class="bigbtn secondary" style="flex:1;min-width:140px" onclick="testarNotificacao()">
        <svg viewBox="0 0 24 24" fill="none" style="width:16px;height:16px;vertical-align:middle;margin-right:6px">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Testar notificação
      </button>
    </div>
  </div>

  <!-- Modo de Análise IA -->
  <div class="card">
    <h2>Modo de análise IA</h2>
    <div class="seg">
      <button class="${pref.precisao === 'precisa' ? 'on' : ''}" onclick="setPrec('precisa')">Precisa (3× + média)</button>
      <button class="${pref.precisao === 'rapida' ? 'on' : ''}" onclick="setPrec('rapida')">Rápida (1×)</button>
    </div>
    <p class="small">No modo preciso, a requisição é enviada 3 vezes para calcular a média e descartar outliers.</p>
  </div>

  <!-- Execução das Análises -->
  <div class="card">
    <h2>Execução das análises</h2>
    <div class="seg">
      <button class="${pref.paralelo ? '' : 'on'}" onclick="setParalelo(false)">Sequencial</button>
      <button class="${pref.paralelo ? 'on' : ''}" onclick="setParalelo(true)">Paralela</button>
    </div>
    <p class="small">Paralela inicia as análises simultaneamente. Sequencial aguarda cada resposta para maior estabilidade.</p>
  </div>

  <!-- Backup & Restauração -->
  <div class="card">
    <h2>Backup e Restauração</h2>
    <p class="small mb8">Seus dados ficam 100% no aparelho. Faça backup para transferir de dispositivo.</p>
    <div class="row">
      <button class="bigbtn secondary" onclick="doBackup()">Exportar backup (JSON)</button>
    </div>
    <input type="file" accept="application/json" id="restoreIn" class="mt12" style="display:none"/>
    <button class="bigbtn secondary mt8" onclick="$('#restoreIn').click()">Restaurar backup</button>
  </div>

  <!-- Limpeza de Dados -->
  <div class="card">
    <h2>Gerenciamento de Dados</h2>
    <p class="small mb8">${meals.length} refeição(ões) e ${activities.length} atividade(s) registradas no total.</p>
    <button class="bigbtn secondary" style="color:var(--status-danger);border-color:rgba(248,113,113,0.3)" onclick="wipeAll()">Apagar todos os dados</button>
  </div>
  <div class="small center mt8" style="color:var(--txt-tertiary)">NutriTrack v1.0 · dados 100% locais e offline-first</div>`;

  if ($('#restoreIn')) $('#restoreIn').onchange = e => doRestore(e.target.files[0]);

  window.setPrec = p => { pref.precisao = p; save(LS.pref, pref); render(); };
  window.setParalelo = p => { pref.paralelo = !!p; save(LS.pref, pref); render(); };
  window.salvarKey = () => {
    const v = ($('#apiKeyIn')?.value || '').trim();
    apikey = v;
    localStorage.setItem(LS.k, v);
    if ($('#keyStatus')) {
      $('#keyStatus').innerHTML = v 
        ? '<span style="color:var(--status-ok)">● Chave configurada e ativa</span>' 
        : '<span style="color:var(--status-danger)">● Sem chave</span>';
    }
    toast('Chave salva!');
  };
}

function abrirModalNovoLembrete() {
  const agora = new Date();
  const hPad = String(agora.getHours()).padStart(2, '0');
  const mPad = String(agora.getMinutes()).padStart(2, '0');
  const horaPadrao = `${hPad}:${mPad}`;

  const tags = [
    'Café da manhã',
    'Colação',
    'Almoço',
    'Lanche 1',
    'Lanche 2',
    'Pré-Treino',
    'Pós-Treino',
    'Jantar',
    'Ceia',
    'Água / Hidratação',
    'Creatina',
    'Shake Proteico'
  ];

  if (typeof openModal === 'function') {
    openModal(`
      <div style="padding:4px 0">
        <h2 style="font-size:18px;margin-bottom:8px;color:var(--txt-primary)">Adicionar Lembrete</h2>
        <p class="small mb12">Escolha uma sugestão rápida ou digite um nome e horário personalizado.</p>
        
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
          ${tags.map(t => `<button type="button" class="btn-preset" style="background:var(--bg-card);border:1px solid var(--border-subtle);color:var(--txt-secondary);padding:5px 10px;border-radius:16px;font-size:12px;cursor:pointer;transition:all 0.15s ease" onclick="$('#novoLembreteNome').value='${t}';this.style.borderColor='var(--txt-primary)';this.style.color='var(--txt-primary)'">${t}</button>`).join('')}
        </div>

        <label class="small" style="display:block;margin-bottom:4px;font-weight:700">Nome da refeição / alerta:</label>
        <input id="novoLembreteNome" type="text" placeholder="Ex: Lanche da tarde, Shake..." value="Lanche" style="margin-bottom:12px"/>

        <label class="small" style="display:block;margin-bottom:4px;font-weight:700">Horário diário:</label>
        <input id="novoLembreteHora" type="time" value="${horaPadrao}" style="margin-bottom:16px"/>

        <div style="display:flex;gap:10px">
          <button class="bigbtn secondary" style="flex:1" onclick="if(typeof closeModal==='function') closeModal()">Cancelar</button>
          <button class="bigbtn primary" style="flex:1" onclick="salvarNovoLembrete()">Salvar</button>
        </div>
      </div>
    `);
  }
}

function salvarNovoLembrete() {
  const nomeIn = $('#novoLembreteNome');
  const horaIn = $('#novoLembreteHora');
  const nome = (nomeIn ? nomeIn.value : '').trim() || 'Lembrete';
  const hora = (horaIn ? horaIn.value : '').trim();

  if (!hora || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    toast('Defina um horário válido (HH:MM)');
    return;
  }

  const list = loadLembretes();
  const novoId = 'lembrete_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  list.push({
    id: novoId,
    nome: nome,
    hora: hora,
    ativo: true
  });

  saveLembretes(list);
  if (typeof closeModal === 'function') closeModal();
  toast(`Lembrete de ${escapeHtml(nome)} adicionado! ✨`);
  render();
}

function removerLembrete(index) {
  const list = loadLembretes();
  if (list[index]) {
    const nome = list[index].nome;
    list.splice(index, 1);
    saveLembretes(list);
    toast(`Lembrete "${escapeHtml(nome)}" removido`);
    render();
  }
}

function atualizarNomeLembrete(index, novoNome) {
  const list = loadLembretes();
  if (list[index]) {
    list[index].nome = (novoNome || '').trim() || list[index].nome;
    saveLembretes(list);
  }
}

function atualizarHoraLembrete(index, novaHora) {
  const list = loadLembretes();
  if (list[index]) {
    list[index].hora = novaHora;
    saveLembretes(list);
    toast('Horário atualizado!');
  }
}

function toggleLembrete(index, ativo) {
  const list = loadLembretes();
  if (list[index]) {
    list[index].ativo = ativo;
    saveLembretes(list);
    toast(ativo ? `Lembrete de ${escapeHtml(list[index].nome)} ativado` : `Lembrete desativado`);
  }
}

function testarNotificacao() {
  const list = loadLembretes();
  const ativos = list.filter(l => l.ativo);
  const lembreteExemplo = ativos.length > 0 ? ativos[Math.floor(Math.random() * ativos.length)] : { nome: 'Refeição' };
  const titulo = `NutriTrack ⏰ ${lembreteExemplo.nome}`;
  const msg = obterMensagemPositiva(lembreteExemplo.nome);

  if (typeof AndroidBridge !== 'undefined' && typeof AndroidBridge.sendNotification === 'function') {
    AndroidBridge.sendNotification(titulo, msg);
    if (typeof AndroidBridge.vibrate === 'function') AndroidBridge.vibrate(150);
    toast(`Notificação: "${escapeHtml(msg)}"`);
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(titulo, { body: msg });
    toast(`Notificação: "${escapeHtml(msg)}"`);
  } else {
    toast(`Preview: ${escapeHtml(titulo)} — "${escapeHtml(msg)}"`);
  }
}

/* Monta o objeto de backup. A chave da API NUNCA é exportada: o arquivo vai
   para Downloads/ e pode ser compartilhado por engano. */
function collectBackupData() {
  return {
    meals,
    activities: load(LS.act, []),
    profile,
    alims: typeof userAlims === 'function' ? userAlims() : load('nt_alims', []),
    reminders: loadLembretes(),
    habits: load(LS.habits, {}),
    water: load(LS.water, {}),
    pref,
    exportadoEm: new Date().toISOString()
  };
}

/* Aplica um backup importado com validação leve de forma (compatível com
   backups antigos; campos desconhecidos são ignorados, não rejeitados).
   A chave da API é deliberadamente IGNORADA na importação. */
function isPlainObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function applyBackupData(d) {
  const imported = [];
  if (!isPlainObj(d)) return imported;

  if (Array.isArray(d.meals)) {
    save(LS.m, d.meals.filter(m => isPlainObj(m)));
    meals = load(LS.m, []);
    imported.push('refeições');
  }
  if (Array.isArray(d.activities)) {
    save(LS.act, d.activities.filter(a => isPlainObj(a)));
    activities = load(LS.act, []);
    imported.push('atividades');
  }
  if (isPlainObj(d.profile)) {
    save(LS.p, d.profile);
    profile = load(LS.p, profile);
    imported.push('metas');
  }
  if (Array.isArray(d.alims)) {
    save('nt_alims', d.alims.filter(a => isPlainObj(a)));
    imported.push('alimentos');
  }
  if (Array.isArray(d.reminders)) {
    const limpos = d.reminders
      .filter(r => isPlainObj(r))
      .map(r => ({
        id: String(r.id ?? ('lembrete_' + Math.random().toString(36).slice(2))),
        nome: String(r.nome ?? 'Refeição'),
        hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.hora || '')) ? String(r.hora) : '08:00',
        ativo: !!r.ativo
      }));
    saveLembretes(limpos);
    imported.push('lembretes');
  }
  if (isPlainObj(d.habits)) {
    save(LS.habits, d.habits);
    habits = load(LS.habits, {});
    imported.push('hábitos');
  }
  if (isPlainObj(d.water)) {
    save(LS.water, d.water);
    water = load(LS.water, {});
    imported.push('água');
  }
  // d.apikey: intencionalmente ignorado (segurança)
  if (isPlainObj(d.pref)) {
    pref = { ...pref, ...d.pref, paralelo: !!d.pref.paralelo };
    save(LS.pref, pref);
    imported.push('preferências');
  }
  return imported;
}

function doBackup() {
  const json = JSON.stringify(collectBackupData(), null, 1);

  if (typeof AndroidBridge !== 'undefined' && AndroidBridge.saveBackup) {
    AndroidBridge.saveBackup(json, 'nutritrack-backup.json');
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'nutritrack-backup.json';
    a.click();
  }
  toast('Backup gerado!');
}

function doRestore(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      const imported = applyBackupData(d);
      if (!imported.length) { toast('Arquivo sem dados reconhecidos'); return; }
      toast(`Backup restaurado (${imported.join(', ')})!`);
      render();
    } catch(e) { toast('Arquivo inválido'); }
  };
  r.readAsText(f);
}

/* Confirmação via modal do app: window.confirm() NÃO funciona dentro da
   WebView (WebChromeClient padrão cancela o diálogo silenciosamente), o que
   deixava este botão morto no APK instalado. */
function wipeAll() {
  if (typeof openModal !== 'function') return;
  openModal(`
    <h2>Apagar todos os dados?</h2>
    <p class="small mb8">Registros, metas, hábitos, lembretes e alimentos serão removidos. Esta ação não pode ser desfeita.</p>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" style="background:var(--status-danger)" onclick="confirmWipeAll()">Apagar tudo</button>
    </div>
  `);
}

function confirmWipeAll() {
  if (typeof AndroidBridge !== 'undefined' && typeof AndroidBridge.cancelAllAlarms === 'function') {
    AndroidBridge.cancelAllAlarms();
  }
  localStorage.removeItem(LS.m);
  localStorage.removeItem(LS.act);
  localStorage.removeItem(LS.p);
  localStorage.removeItem('nt_alims');
  localStorage.removeItem(LS.reminders);
  localStorage.removeItem(LS.habits);
  localStorage.removeItem(LS.water);
  meals = [];
  activities = [];
  habits = {};
  water = {};
  profile = load(LS.p, { kcal: 2200, p: 120, c: 250, g: 70, peso: 75, altura: 175, idade: 30, sexo: 'm', atividade: 1.4, metaMetodo: 'manual', metaAgua: 3000 });
  if (typeof closeModal === 'function') closeModal();
  toast('Dados apagados');
  render();
}

window.MENSAGENS_POSITIVAS = MENSAGENS_POSITIVAS;
window.obterMensagemPositiva = obterMensagemPositiva;
window.loadLembretes = loadLembretes;
window.saveLembretes = saveLembretes;
window.renderLembretesHtml = renderLembretesHtml;
window.atualizarHoraLembrete = atualizarHoraLembrete;
window.atualizarNomeLembrete = atualizarNomeLembrete;
window.toggleLembrete = toggleLembrete;
window.abrirModalNovoLembrete = abrirModalNovoLembrete;
window.salvarNovoLembrete = salvarNovoLembrete;
window.removerLembrete = removerLembrete;
window.testarNotificacao = testarNotificacao;
window.doBackup = doBackup;
window.collectBackupData = collectBackupData;
window.applyBackupData = applyBackupData;
window.doRestore = doRestore;
window.wipeAll = wipeAll;
window.confirmWipeAll = confirmWipeAll;
window.renderAjustes = renderAjustes;

// Inicialização e sincronização de lembretes nativos
try {
  const _initReminders = loadLembretes();
  if (typeof AndroidBridge !== 'undefined' && typeof AndroidBridge.syncAlarms === 'function') {
    saveLembretes(_initReminders);
  }
} catch(e) {}
