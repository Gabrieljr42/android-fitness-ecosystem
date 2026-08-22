/* apps/nutricao/views/hoje.js — Dashboard Hoje (Balanço Energético, Macros, Hábitos & Ações) */

/* ============ RENDER ============ */
function render() {
  if ($('#dataHoje')) {
    const d = new Date();
    const dName = DIAS[d.getDay()].slice(0, 3);
    const mName = MESES[d.getMonth()];
    $('#dataHoje').innerHTML = `<b>${dName.toUpperCase()}</b> · ${d.getDate()} ${mName}`;
  }
  const main = $('#main');
  if (!main) return;
  if (state.tab === 'hoje') renderHoje(main);
  else if (state.tab === 'diario') renderDiario(main);
  else if (state.tab === 'alimentos') renderAlimentos(main);
  else if (state.tab === 'metas') renderMetas(main);
  else renderAjustes(main);
}

function renderHoje(main) {
  const t = dayTotals();
  const I = t.kcal || 0;
  const G = typeof dayBurned === 'function' ? dayBurned() : 0;
  const L = I - G;
  const targetKcal = Number(profile?.kcal) || 2200;
  const bmr = typeof calcBMR === 'function' ? calcBMR() : 1700;
  const tdee = typeof calcTDEE === 'function' ? calcTDEE() : 2380;
  const pct = (v, m) => Math.min(100, Math.max(0, Math.round(v / (m || 1) * 100)));
  const netPct = Math.min(100, Math.max(0, Math.round(Math.max(0, L) / (targetKcal || 1) * 100)));

  // Habitos e Agua
  const creatinaOk = getCreatinaStatus();
  const waterVol = getWaterIntake();
  const waterGoal = getWaterGoal();
  const waterPct = Math.min(100, Math.round((waterVol / (waterGoal || 1)) * 100));

  const hojeMeals = dayMeals();
  const hojeActivities = typeof dayActivities === 'function' ? dayActivities() : [];

  main.innerHTML = `
  <!-- Card de Balanço Energético Diário (R3) -->
  <div class="card energy-balance-card">
    <div class="energy-head">
      <h2>Balanço Energético</h2>
      <span class="energy-badge ${L > targetKcal ? 'bad' : 'ok'}">
        ${L > targetKcal ? 'Superávit' : 'Dentro da Meta'}
      </span>
    </div>

    <div class="energy-grid">
      <div class="energy-col">
        <span class="energy-lbl">Ingeridas</span>
        <span class="energy-val in">+${fmt(I)}</span>
        <span class="energy-unit">kcal</span>
      </div>
      <div class="energy-op">−</div>
      <div class="energy-col">
        <span class="energy-lbl">Exercício</span>
        <span class="energy-val out">−${fmt(G)}</span>
        <span class="energy-unit">kcal</span>
      </div>
      <div class="energy-op">=</div>
      <div class="energy-col highlight">
        <span class="energy-lbl">Saldo Líquido</span>
        <span class="energy-val net">${fmt(L)}</span>
        <span class="energy-unit">kcal</span>
      </div>
    </div>

    <!-- Barra de Meta vs Líquido -->
    <div class="energy-bar-wrap mt8">
      <div class="energy-bar-labels">
        <small>Meta: <b>${fmt(targetKcal)} kcal</b></small>
        <small>TDEE: <b>${fmt(tdee)} kcal</b> (TMB: ${fmt(bmr)})</small>
      </div>
      <div class="prog energy-prog mt8">
        <div style="width:${netPct}%; background:${L > targetKcal ? 'var(--status-danger)' : 'var(--bar-fill)'}"></div>
      </div>
      <div class="energy-sub-text mt8">
        ${L <= targetKcal 
          ? `<span>Restam <b>${fmt(targetKcal - L)} kcal</b> líquidas para atingir a meta diária</span>` 
          : `<span style="color:var(--status-danger)">Superávit de <b>+${fmt(L - targetKcal)} kcal</b> acima da meta</span>`}
      </div>
    </div>
  </div>

  <!-- Macros Ingeridos (Grayscale / Silver High-End) -->
  <div class="macro-grid">
    <div class="macro kcal">
      <div class="v">${fmt(t.kcal)}</div>
      <div class="l">kcal Ingeridas</div>
      <div class="prog"><div style="width:${pct(t.kcal, profile.kcal)}%"></div></div>
    </div>
    <div class="macro p">
      <div class="v">${fmt(t.p)}g</div>
      <div class="l">Proteína</div>
      <div class="prog"><div style="width:${pct(t.p, profile.p)}%"></div></div>
    </div>
    <div class="macro c">
      <div class="v">${fmt(t.c)}g</div>
      <div class="l">Carbo</div>
      <div class="prog"><div style="width:${pct(t.c, profile.c)}%"></div></div>
    </div>
    <div class="macro g">
      <div class="v">${fmt(t.g)}g</div>
      <div class="l">Gordura</div>
      <div class="prog"><div style="width:${pct(t.g, profile.g)}%"></div></div>
    </div>
  </div>

  <!-- Widget de Hábitos e Hidratação -->
  <div class="card habits-card">
    <div class="habits-head">
      <h2>Hábitos &amp; Hidratação</h2>
      <span class="small" id="waterStatusSummary">${fmt(waterVol)} / ${fmt(waterGoal)} mL (${waterPct}%)</span>
    </div>
    
    <!-- Creatina 1-tap toggle -->
    <div class="habit-row">
      <div class="habit-label">
        <div class="habit-icon creatina-icon">💊</div>
        <div class="habit-info">
          <b>Creatina diária</b>
          <small>${creatinaOk ? 'Tomada hoje' : 'Pendente para hoje'}</small>
        </div>
      </div>
      <button class="habit-btn ${creatinaOk ? 'done' : ''}" id="btnCreatina" onclick="handleToggleCreatina()">
        ${creatinaOk ? '✓ Tomada' : 'Pendente'}
      </button>
    </div>

    <!-- Hidratação -->
    <div class="water-section">
      <div class="water-head">
        <div class="habit-label">
          <div class="habit-icon water-icon">💧</div>
          <div class="habit-info">
            <b>Água</b>
            <small>Meta: ${fmt(waterGoal)} mL</small>
          </div>
        </div>
        <button class="water-goal-btn" onclick="modalMetaAgua()" title="Alterar meta de água">⚙ Meta</button>
      </div>
      <div class="prog water-prog mt8">
        <div style="width: ${waterPct}%"></div>
      </div>
      <div class="water-actions mt8">
        <button class="water-btn" onclick="handleQuickWater(250)">+250 mL</button>
        <button class="water-btn" onclick="handleQuickWater(500)">+500 mL</button>
        <button class="water-btn" onclick="modalCustomWater()">+ Outro</button>
        ${waterVol > 0 ? `<button class="water-btn reset-water" onclick="handleResetWater()" title="Zerar registro de água de hoje">✕</button>` : ''}
      </div>
    </div>
  </div>

  <!-- Botões de Ação Principais -->
  <button class="bigbtn primary" id="btnFoto">
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M3 8.5V7a2 2 0 012-2h2.5l1.6-2h5.8l1.6 2H19a2 2 0 012 2v1.5M21 9.5v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2h14a2 2 0 012 2z" stroke="#09090b" stroke-width="2"/>
      <circle cx="12" cy="13" r="3.6" stroke="#09090b" stroke-width="2"/>
    </svg>
    Fotografar prato
  </button>
  <button class="bigbtn secondary" id="btnTextoIA">
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    ✍️ Descrever refeição c/ IA
  </button>
  <button class="bigbtn secondary" id="btnAtivIA">
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    ⚡ Estimar gasto c/ IA
  </button>
  <div class="row" style="margin-bottom:10px">
    <button class="bigbtn secondary" id="btnMan" style="margin-bottom:0;font-size:14px;min-height:48px">
      <svg viewBox="0 0 24 24" fill="none" style="width:18px;height:18px">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
      + Refeição
    </button>
    <button class="bigbtn secondary" id="btnManExercicio" style="margin-bottom:0;font-size:14px;min-height:48px">
      <svg viewBox="0 0 24 24" fill="none" style="width:18px;height:18px">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      + Exercício
    </button>
  </div>

  <!-- Lista de Refeições -->
  <div class="card" style="margin-top:4px">
    <h2>Refeições de hoje <span class="small">${hojeMeals.length} registro(s) · ${fmt(I)} kcal</span></h2>
    ${renderListaMeals(hojeMeals)}
  </div>

  <!-- Lista de Exercícios e Atividades -->
  <div class="card" style="margin-top:4px">
    <h2>Exercícios &amp; Gasto de hoje <span class="small">${hojeActivities.length} registro(s) · -${fmt(G)} kcal</span></h2>
    ${renderListaActivities(hojeActivities)}
  </div>

  ${(meals.length === 0 && (!activities || activities.length === 0)) ? `<div class="card"><div class="empty">
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 4a6 6 0 016 6c0 3-2 5-4 6.5-.9.7-1.4 1.2-1.7 1.8h-.6c-.3-.6-.8-1.1-1.7-1.8C8.2 17 6.2 15 6.2 12a6 6 0 016-6z" stroke="#71717a" stroke-width="1.6"/>
      <circle cx="9.5" cy="10.5" r="1.2" fill="#71717a"/>
      <circle cx="14.5" cy="10.5" r="1.2" fill="#71717a"/>
      <path d="M9 14.5c1 .8 2 1 3 1s2-.2 3-1" stroke="#71717a" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
    <p>Nenhum registro ainda.<br/>Tire uma foto, descreva com IA ou adicione manualmente.</p>
    <button onclick="$('#btnFoto').click()">Começar agora</button>
  </div></div>` : ''}`;

  if ($('#btnFoto')) $('#btnFoto').onclick = abrirFoto;
  if ($('#btnTextoIA')) $('#btnTextoIA').onclick = abrirTextoIA;
  if ($('#btnAtivIA')) $('#btnAtivIA').onclick = (typeof abrirAtividadeIA === 'function' ? abrirAtividadeIA : null);
  if ($('#btnMan')) $('#btnMan').onclick = abrirManual;
  if ($('#btnManExercicio')) $('#btnManExercicio').onclick = (typeof abrirManualExercicio === 'function' ? abrirManualExercicio : null);

  // Delegação para botões de exclusão (sem inline handlers — ids podem vir
  // de backup importado e nunca devem virar código)
  main.querySelectorAll('[data-del-meal]').forEach(btn => {
    btn.onclick = () => delMeal(btn.getAttribute('data-del-meal'));
  });
  main.querySelectorAll('[data-del-activity]').forEach(btn => {
    btn.onclick = () => handleDelActivity(btn.getAttribute('data-del-activity'));
  });
}

function renderListaMeals(lista) {
  if (!lista.length) return '<div class="empty"><p>Nenhuma refeição registrada hoje.</p></div>';
  return lista.map(m => {
    const kTotal = (m.itens || []).reduce((a, i) => a + (i.kcal || 0), 0);
    const pTotal = +((m.itens || []).reduce((a, i) => a + (i.proteina_g || 0), 0)).toFixed(1);
    const cTotal = +((m.itens || []).reduce((a, i) => a + (i.carbo_g || 0), 0)).toFixed(1);
    const gTotal = +((m.itens || []).reduce((a, i) => a + (i.gordura_g || 0), 0)).toFixed(1);

    let badge = '';
    if (m.origem === 'ia_texto') badge = '<span style="font-size:10px;background:rgba(255,255,255,0.08);color:#ffffff;border:1px solid var(--border-subtle);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700">IA TEXTO</span>';
    else if (m.origem === 'foto') badge = '<span style="font-size:10px;background:var(--status-ok-dim);color:var(--status-ok);border:1px solid rgba(74,222,128,0.25);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700">FOTO</span>';
    else if (m.origem === 'plano') badge = '<span style="font-size:10px;background:rgba(255,255,255,0.06);color:var(--txt-secondary);border:1px solid var(--border-subtle);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700">PLANO</span>';

    return `
    <div class="meal">
      <div class="dot"></div>
      <div class="info">
        <div class="nome" style="display:flex;align-items:center">${escapeHtml(m.nome)}${badge}</div>
        <div class="det">${(m.itens || []).map(i => escapeHtml(i && i.nome)).join(' · ')} · ${escapeHtml(m.hour || '')}</div>
        <div class="small" style="margin-top:2px;font-size:11px;color:var(--txt-secondary)">
          <span>P ${pTotal}g</span> ·
          <span>C ${cTotal}g</span> ·
          <span>G ${gTotal}g</span>
        </div>
      </div>
      <div class="k">${fmt(kTotal)} kcal</div>
      <button class="del" data-del-meal="${escapeHtml(m.id)}" title="Excluir refeição">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>`;
  }).join('');
}

function renderListaActivities(lista) {
  if (!lista || !lista.length) return '<div class="empty" style="padding:20px 12px"><p>Nenhum exercício registrado hoje.<br/>Estime com IA ou adicione manualmente.</p></div>';
  return lista.map(a => {
    const kGasto = Math.round(Number(a.kcal_gasto ?? a.kcal) || 0);
    const durMin = Number(a.duracaoMin ?? a.duracao_min) || 0;
    const met = Number(a.met ?? a.met_medio) || 0;
    const hora = a.hour || a.hora || '';
    const intensidade = a.intensidade || 'moderada';
    
    let badgeOrigem = '';
    if (a.origem === 'ia_texto') badgeOrigem = '<span style="font-size:10px;background:rgba(255,255,255,0.08);color:#ffffff;border:1px solid var(--border-subtle);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700">IA</span>';
    else if (a.origem === 'manual') badgeOrigem = '<span style="font-size:10px;background:rgba(255,255,255,0.06);color:var(--txt-secondary);border:1px solid var(--border-subtle);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700">MANUAL</span>';

    let intBadge = `<span style="font-size:10px;background:rgba(255,255,255,0.06);color:var(--txt-secondary);border:1px solid var(--border-subtle);padding:1px 5px;border-radius:4px;margin-left:4px;font-weight:700;text-transform:uppercase">${intensidade.replace('_', ' ')}</span>`;

    const segs = Array.isArray(a.segmentos) && a.segmentos.length > 0
      ? `<div class="small" style="margin-top:2px;font-size:11px;color:var(--txt3)">${a.segmentos.map(s => s.descricao || s.tipo || `${s.duracao_minutos}min`).join(' · ')}</div>`
      : '';

    return `
    <div class="meal activity-row">
      <div class="dot" style="background:#a1a1aa"></div>
      <div class="info">
        <div class="nome" style="display:flex;align-items:center">${escapeHtml(a.nome || 'Exercício')}${badgeOrigem}${intBadge}</div>
        <div class="det">${durMin} min · MET ${met}${hora ? ` · ${hora}` : ''}</div>
        ${segs}
      </div>
      <div class="k" style="color:#ffffff">-${fmt(kGasto)} kcal</div>
      <button class="del" data-del-activity="${escapeHtml(a.id)}" title="Remover atividade">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>`;
  }).join('');
}

function delMeal(id) {
  const idx = meals.findIndex(m => m.id === id);
  if (idx < 0) return;
  const removido = meals.splice(idx, 1)[0];
  save(LS.m, meals);
  render();
  toast('Refeição removida', () => {
    meals.splice(idx, 0, removido);
    save(LS.m, meals);
    render();
  });
}

function handleDelActivity(id) {
  if (typeof delActivity !== 'function') return;
  const removido = delActivity(id);
  if (!removido) return;
  render();
  toast('Exercício removido', () => {
    addActivity(removido);
    render();
  });
}

// Handlers do Widget de Hábitos
function handleToggleCreatina() {
  const status = toggleCreatina();
  toast(status ? 'Creatina tomada hoje! ✓' : 'Creatina desmarcada.');
  render();
}

function handleQuickWater(ml) {
  addWaterIntake(ml);
  toast(`+${ml} mL de água registrados! 💧`);
  render();
}

function handleResetWater() {
  setWaterIntake(0);
  toast('Registro de água zerado para hoje.');
  render();
}

function modalCustomWater() {
  openModal(`
    <h2>Adicionar água</h2>
    <label>Quantidade (mL)</label>
    <input id="inCustomWater" type="number" step="50" min="50" max="5000" placeholder="Ex: 350" value="300"/>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmCustomWater()">Adicionar</button>
    </div>
  `);
  setTimeout(() => { const el = $('#inCustomWater'); if (el) el.focus(); }, 100);
}

function confirmCustomWater() {
  const val = parseFloat($('#inCustomWater')?.value) || 0;
  if (val <= 0) { toast('Digite uma quantidade válida'); return; }
  addWaterIntake(val);
  closeModal();
  toast(`+${fmt(val)} mL de água registrados! 💧`);
  render();
}

function modalMetaAgua() {
  openModal(`
    <h2>Meta diária de água</h2>
    <label>Meta (mL)</label>
    <input id="inWaterGoal" type="number" step="100" min="500" max="10000" value="${getWaterGoal()}"/>
    <p class="small mt8">A recomendação geral é entre 35 mL e 40 mL por kg de peso corporal.</p>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmWaterGoal()">Salvar meta</button>
    </div>
  `);
  setTimeout(() => { const el = $('#inWaterGoal'); if (el) el.focus(); }, 100);
}

function confirmWaterGoal() {
  const val = parseFloat($('#inWaterGoal')?.value) || 3000;
  setWaterGoal(val);
  closeModal();
  toast(`Meta de água atualizada para ${fmt(val)} mL!`);
  render();
}

// Global exports
window.render = render;
window.renderHoje = renderHoje;
window.renderListaMeals = renderListaMeals;
window.renderListaActivities = renderListaActivities;
window.delMeal = delMeal;
window.handleDelActivity = handleDelActivity;
window.handleToggleCreatina = handleToggleCreatina;
window.handleQuickWater = handleQuickWater;
window.handleResetWater = handleResetWater;
window.modalCustomWater = modalCustomWater;
window.confirmCustomWater = confirmCustomWater;
window.modalMetaAgua = modalMetaAgua;
window.confirmWaterGoal = confirmWaterGoal;
