/* Histórico: ausência de registro é distinta de consumo zero. */
function renderDiario(main) {
  const activeDate = typeof getActiveDate === 'function' ? getActiveDate() : today();
  const ds = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    ds.push(dateKey(date));
  }
  const targetKcal = Number(profile?.kcal) || 2200;
  const days = ds.map(date => ({ date, totals: dayTotals(date), count: dayMeals(date).length }));
  const recorded = days.filter(day => day.count > 0);
  const average = recorded.length ? Math.round(recorded.reduce((sum, day) => sum + day.totals.kcal, 0) / recorded.length) : null;
  const scale = Math.max(targetKcal, ...days.map(day => day.totals.kcal), 1) * 1.3;
  const activeTotals = dayTotals(activeDate);
  const activeName = activeDate === today() ? 'hoje' : 'dia selecionado';
  main.innerHTML = `
    <h1 class="page-title">Histórico</h1>
    <section class="card">
      <h2>Calorias consumidas <span class="small">Últimos 7 dias</span></h2>
      <div class="history-summary">${average === null ? '—' : fmt(average)} <small>kcal por dia com registro</small></div>
      <p class="small">${recorded.length} de 7 dias com refeições. A média inclui os registros de hoje.</p>
      <div class="history-chart"><div class="history-columns">
        <div class="history-target" style="bottom:${targetKcal / scale * 100}%" aria-hidden="true"></div>
        ${days.map(day => {
          const d = new Date(day.date + 'T12:00:00');
          const label = day.date === today() ? 'Hoje' : `${d.getDate()} ${MESES[d.getMonth()].slice(0,3)}`;
          return `<button class="history-day ${day.date === today() ? 'today' : ''}" onclick="abrirDiaHistorico('${day.date}')" aria-label="Abrir ${label}: ${day.count ? fmt(day.totals.kcal) + ' kcal consumidas' : 'sem registro'}">
            <span class="val">${day.count ? fmt(day.totals.kcal) : '—'}</span>
            <span class="bar" style="height:${day.count ? day.totals.kcal / scale * 100 : 0}%"></span>
            <span class="lbl">${label}</span>
          </button>`;
        }).join('')}
      </div></div>
      <p class="small">Linha tracejada: meta de ${fmt(targetKcal)} kcal.<br>— Sem registro não representa consumo zero.</p>
    </section>
    <section class="card"><h2>Macros de ${activeName}</h2>
      <div class="daily-macros">
        ${[['Proteínas',activeTotals.p],['Carboidratos',activeTotals.c],['Gorduras',activeTotals.g]].map(([label,value]) => `<div><span>${label}</span><div class="daily-macro-value">${fmt(value)} <small>g</small></div></div>`).join('')}
      </div>
    </section>
    <section class="card"><h2>Refeições por dia</h2>
      ${recorded.slice().reverse().map(day => {
        const date = new Date(day.date + 'T12:00:00');
        const label = `${DIAS[date.getDay()]} · ${date.getDate()} ${MESES[date.getMonth()]}`;
        return `<button class="meal history-entry" onclick="abrirDiaHistorico('${day.date}')"><span class="info"><span class="nome">${label}</span><span class="det">${day.count} refeição(ões) · P ${fmt(day.totals.p)} g · C ${fmt(day.totals.c)} g · G ${fmt(day.totals.g)} g</span></span><span class="k">${fmt(day.totals.kcal)} kcal</span></button>`;
      }).join('') || '<div class="empty"><p>Registre sua primeira refeição para começar o histórico.</p></div>'}
    </section>`;
}

function abrirDiaHistorico(date) {
  if (typeof setActiveDate === 'function' && !setActiveDate(date, false)) return;
  if (typeof navigateNutriTab === 'function') navigateNutriTab('hoje');
  else { state.tab = 'hoje'; render(); }
}
window.renderDiario = renderDiario;
window.abrirDiaHistorico = abrirDiaHistorico;
