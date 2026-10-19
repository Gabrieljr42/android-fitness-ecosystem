/* apps/nutricao/views/hoje.js — Dashboard Hoje (Balanço Energético, Macros, Hábitos & Ações) */

/* ============ RENDER ============ */
function render() {
  if ($('#dataHoje')) {
    const activeDate = typeof getActiveDate === 'function' ? getActiveDate() : today();
    const d = new Date(activeDate + 'T12:00:00');
    const dName = DIAS[d.getDay()].slice(0, 3);
    const mName = MESES[d.getMonth()];
    $('#dataHoje').innerHTML = `<b>${dName.toUpperCase()}</b> · ${d.getDate()} ${mName}`;
  }
  if (typeof syncNutriNavigation === 'function') syncNutriNavigation();
  const main = $('#main');
  if (!main) return;
  if (state.tab === 'hoje') renderHoje(main);
  else if (state.tab === 'diario') renderDiario(main);
  else if (state.tab === 'alimentos') renderAlimentos(main);
  else if (state.tab === 'metas') renderMetas(main);
  else renderAjustes(main);
}

function activeDateLabel(date = (typeof getActiveDate === 'function' ? getActiveDate() : today())) {
  const d = new Date(date + 'T12:00:00');
  const day = DIAS[d.getDay()];
  const month = MESES[d.getMonth()];
  return `${day.charAt(0).toUpperCase() + day.slice(1)}, ${d.getDate()} de ${month}`;
}

function renderActiveDatePicker() {
  const activeDate = getActiveDate();
  const isToday = activeDate === today();
  return `<section class="day-selector-card">
    <div class="day-selector-head"><h1>${isToday ? 'Hoje' : 'Diário'}</h1>${isToday ? '' : '<button class="datebtn day-today-btn" onclick="resetActiveDate()">Voltar a hoje</button>'}</div>
    <div class="day-selector-controls">
      <button class="datebtn day-arrow" onclick="shiftActiveDate(-1)" aria-label="Ver dia anterior">‹</button>
      <input id="activeDateInput" class="day-date-input" type="date" value="${activeDate}" max="${today()}" onchange="setActiveDate(this.value)" aria-label="Data do diário"/>
      <button class="datebtn day-arrow" onclick="shiftActiveDate(1)" aria-label="Ver próximo dia" ${isToday ? 'disabled' : ''}>›</button>
    </div>
    ${isToday ? '' : '<p class="day-selector-hint">Você está em um dia anterior. Novos registros serão salvos nesta data.</p>'}
  </section>`;
}

function renderHoje(main) {
  const activeDate = getActiveDate();
  const isToday = activeDate === today();
  const dayLabel = isToday ? 'hoje' : 'este dia';
  const t = dayTotals(activeDate);
  const I = t.kcal || 0;
  const G = typeof dayBurned === 'function' ? dayBurned(activeDate) : 0;
  const L = I - G;
  const targetKcal = Number(profile?.kcal) || 2200;
  const pct = (v, m) => Math.min(100, Math.max(0, Math.round(v / (m || 1) * 100)));
  const creatinaOk = getCreatinaStatus(activeDate);
  const waterVol = getWaterIntake(activeDate);
  const waterGoal = getWaterGoal();
  const hojeMeals = dayMeals(activeDate);
  const hojeActivities = typeof dayActivities === 'function' ? dayActivities(activeDate) : [];
  const hasEntries = hojeMeals.length > 0 || hojeActivities.length > 0;

  main.innerHTML = `
  ${renderActiveDatePicker()}
  <section class="card daily-balance" aria-label="Balanço energético do dia">
    <div class="balance-heading"><h2>Balanço do dia</h2><span class="energy-badge">${!hasEntries ? 'Sem registros' : L > targetKcal ? 'Acima da meta' : isToday ? 'Em andamento' : 'Registrado'}</span></div>
    <div class="balance-value">${fmt(L)} <span>kcal líquidas</span></div>
    <p class="balance-caption">Consumo menos exercício registrado</p>
    <div class="prog" role="progressbar" aria-label="Saldo líquido em relação à meta" aria-valuemin="0" aria-valuemax="${targetKcal}" aria-valuenow="${Math.min(targetKcal, Math.max(0, L))}" aria-valuetext="${fmt(L)} de ${fmt(targetKcal)} kcal líquidas"><div style="width:${pct(L, targetKcal)}%"></div></div>
    <div class="balance-remaining"><span>${L <= targetKcal ? `<b>${fmt(targetKcal - L)} kcal</b> até a meta` : `<b>${fmt(L - targetKcal)} kcal</b> acima da meta`}</span><span>Meta ${fmt(targetKcal)}</span></div>
    <div class="balance-breakdown"><div><span>Consumidas</span><b>${fmt(I)} <small>kcal</small></b></div><div><span>Exercício registrado</span><b>${fmt(G)} <small>kcal</small></b></div></div>
  </section>
  <section class="daily-macros" aria-label="Macronutrientes consumidos e metas">
    ${[['Proteínas',t.p,profile.p],['Carboidratos',t.c,profile.c],['Gorduras',t.g,profile.g]].map(([name,value,goal]) => `<div><span>${name}</span><div class="daily-macro-value">${fmt(value)} <small>/ ${fmt(goal)} g</small></div><div class="prog"><div style="width:${pct(value,goal)}%"></div></div></div>`).join('')}
  </section>
  <section class="card meals-card"><h2>Suas refeições <span class="small">${hojeMeals.length} registro(s)</span></h2>
    ${hojeMeals.length ? renderListaMeals(hojeMeals) : `<div class="empty"><p>Nenhuma refeição registrada ${isToday ? 'hoje' : 'neste dia'}.<br>Use “Registrar ${isToday ? 'refeição' : 'neste dia'}” para começar.</p></div>`}
  </section>
  <section class="card habits-card">
    <h2>Água e hábitos</h2>
    <div class="water-head"><div><b>Água</b><small id="waterStatusSummary">${fmt(waterVol)} / ${fmt(waterGoal)} mL</small></div><button class="water-goal-btn" onclick="modalMetaAgua()" aria-label="Alterar meta de água">Meta</button></div>
    <div class="prog water-prog mt8"><div style="width:${pct(waterVol, waterGoal)}%"></div></div>
    <div class="water-actions mt8"><button class="water-btn" onclick="handleQuickWater(250)">+250 mL</button><button class="water-btn" onclick="handleQuickWater(500)">+500 mL</button><button class="water-btn" onclick="modalCustomWater()">Outra quantidade</button></div>
    <div class="habit-row"><div class="habit-info"><b>Creatina</b><small>${creatinaOk ? 'Registrada neste dia' : 'Ainda não registrada'}</small></div><button class="habit-btn ${creatinaOk ? 'done' : ''}" id="btnCreatina" aria-pressed="${creatinaOk}" onclick="handleToggleCreatina()">${creatinaOk ? '✓ Registrada' : 'Registrar'}</button></div>
    ${waterVol > 0 ? `<details class="water-edit"><summary>Corrigir registro de água</summary><button class="ghost" onclick="handleResetWater()">Zerar água de ${dayLabel}</button></details>` : ''}
  </section>
  <details class="card activity-details" ${hojeActivities.length ? 'open' : ''}>
    <summary>Exercícios <span class="small">${fmt(G)} kcal registradas</span></summary>
    <div class="row mt12"><button class="bigbtn secondary" id="btnManExercicio">+ Registrar exercício</button><button class="bigbtn secondary" id="btnAtivIA">Estimar com IA</button></div>
    ${renderListaActivities(hojeActivities)}
  </details>`;
  if ($('#btnAtivIA')) $('#btnAtivIA').onclick = typeof abrirAtividadeIA === 'function' ? abrirAtividadeIA : null;
  if ($('#btnManExercicio')) $('#btnManExercicio').onclick = typeof abrirManualExercicio === 'function' ? abrirManualExercicio : null;
  main.querySelectorAll('[data-del-meal]').forEach(button => {
    button.onclick = () => delMeal(button.getAttribute('data-del-meal'));
  });
  if (typeof openMealEditor === 'function') {
    main.querySelectorAll('[data-edit-meal]').forEach(button => {
      button.onclick = () => {
        const meal = meals.find(item => item.id === button.getAttribute('data-edit-meal'));
        if (meal) openMealEditor(meal);
      };
    });
  }
  main.querySelectorAll('[data-del-activity]').forEach(button => {
    button.onclick = () => handleDelActivity(button.getAttribute('data-del-activity'));
  });
}


function renderListaMeals(lista) {
  if (!lista.length) return '<div class="empty"><p>Nenhuma refeição registrada neste dia.</p></div>';
  return lista.map(m => {
    const kTotal = (m.itens || []).reduce((a, i) => a + (i.kcal || 0), 0);
    const pTotal = +((m.itens || []).reduce((a, i) => a + (i.proteina_g || 0), 0)).toFixed(1);
    const cTotal = +((m.itens || []).reduce((a, i) => a + (i.carbo_g || 0), 0)).toFixed(1);
    const gTotal = +((m.itens || []).reduce((a, i) => a + (i.gordura_g || 0), 0)).toFixed(1);

    let badge = '';
    if (m.origem === 'ia_resumo_dia') badge = '<span style="font-size:10px;background:rgba(255,255,255,0.12);color:var(--txt);border:1px solid var(--border-focus);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700">RESUMO IA</span>';
    else if (m.origem === 'ia_texto') badge = '<span style="font-size:10px;background:rgba(255,255,255,0.08);color:var(--txt);border:1px solid var(--border-subtle);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700">IA TEXTO</span>';
    else if (m.origem === 'foto') badge = '<span style="font-size:10px;background:var(--status-ok-dim);color:var(--status-ok);border:1px solid rgba(74,222,128,0.25);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700">FOTO</span>';
    else if (m.origem === 'plano') badge = '<span style="font-size:10px;background:rgba(255,255,255,0.06);color:var(--txt-secondary);border:1px solid var(--border-subtle);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700">PLANO</span>';

    return `
    <div class="meal">
      <div class="dot"></div>
      <button type="button" class="info" data-edit-meal="${escapeHtml(m.id)}" aria-label="Editar ${escapeHtml(m.nome)}" style="cursor:pointer">
        <div class="nome" style="display:flex;align-items:center">${escapeHtml(m.nome)}${badge}</div>
    <div class="det">${(m.itens || []).map(i => escapeHtml(i && i.nome)).join(' · ')} · ${escapeHtml(m.horario || m.hour || '')}</div>
        <div class="small" style="margin-top:2px;font-size:11px;color:var(--txt-secondary)">
          <span>P ${pTotal}g</span> ·
          <span>C ${cTotal}g</span> ·
          <span>G ${gTotal}g</span>
        </div>
      </button>
      <div class="k">${fmt(kTotal)} kcal</div>
      <button class="meal-edit" data-edit-meal="${escapeHtml(m.id)}" title="Editar refeição" aria-label="Editar refeição">✎</button>
      <button class="del" data-del-meal="${escapeHtml(m.id)}" title="Excluir refeição" aria-label="Excluir refeição">
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
    if (a.origem === 'ia_texto') badgeOrigem = '<span style="font-size:10px;background:rgba(255,255,255,0.08);color:var(--txt);border:1px solid var(--border-subtle);padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700">IA</span>';
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
      <div class="k" style="color:var(--txt)">-${fmt(kGasto)} kcal</div>
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
  const activeDate = typeof getActiveDate === 'function' ? getActiveDate() : today();
  const status = toggleCreatina(activeDate);
  toast(status ? 'Creatina registrada neste dia! ✓' : 'Creatina desmarcada.');
  render();
}

function handleQuickWater(ml) {
  const activeDate = typeof getActiveDate === 'function' ? getActiveDate() : today();
  addWaterIntake(ml, activeDate);
  toast(`+${ml} mL de água registrados neste dia! 💧`);
  render();
}

function handleResetWater() {
  const activeDate = typeof getActiveDate === 'function' ? getActiveDate() : today();
  setWaterIntake(0, activeDate);
  toast('Registro de água zerado neste dia.');
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
  const activeDate = typeof getActiveDate === 'function' ? getActiveDate() : today();
  addWaterIntake(val, activeDate);
  closeModal();
  toast(`+${fmt(val)} mL de água registrados neste dia! 💧`);
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
