/* apps/nutricao/views/diario.js — Histórico de 7 dias e Médias de Consumo */

function renderDiario(main) {
  const ds = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    ds.push(dateKey(d));
  }

  const targetKcal = Number(profile?.kcal) || 2200;

  const bars = ds.map(d => {
    const t = dayTotals(d);
    const isToday = d === today();
    const over = t.kcal > targetKcal && t.kcal > 0;
    const h = targetKcal > 0 ? Math.min(100, Math.round(t.kcal / targetKcal * 100)) : 0;
    const lbl = MESES[new Date(d + 'T12:00:00').getMonth()];
    const dn = new Date(d + 'T12:00:00').getDate();
    return `
      <div class="col">
        <div class="val">${t.kcal ? fmt(t.kcal) : ''}</div>
        <div class="bar ${over ? 'over' : ''} ${isToday ? 'today' : ''}" style="height:${Math.max(h, 2)}%"></div>
        <div class="lbl">${isToday ? 'hoje' : dn + ' ' + lbl.slice(0, 3)}</div>
      </div>`;
  }).join('');

  const totHoje = dayTotals();
  const media7 = Math.round(ds.reduce((a, d) => a + dayTotals(d).kcal, 0) / 7);

  main.innerHTML = `
  <!-- Gráfico de 7 Dias (Monocromático High-End) -->
  <div class="card">
    <h2>Últimos 7 dias</h2>
    <div class="gbar">${bars}</div>
    <div class="gmeta">
      <div class="lg"></div>
      <span>Meta diária: <b>${fmt(targetKcal)} kcal</b></span>
    </div>
  </div>

  <!-- Métricas e Médias -->
  <div class="macro-grid">
    <div class="macro kcal">
      <div class="v">${fmt(media7)}</div>
      <div class="l">Média 7d</div>
    </div>
    <div class="macro p">
      <div class="v">${fmt(totHoje.p)}g</div>
      <div class="l">Proteína hoje</div>
    </div>
    <div class="macro c">
      <div class="v">${fmt(totHoje.c)}g</div>
      <div class="l">Carbo hoje</div>
    </div>
    <div class="macro g">
      <div class="v">${fmt(totHoje.g)}g</div>
      <div class="l">Gordura hoje</div>
    </div>
  </div>

  <!-- Lista Histórica -->
  <div class="card">
    <h2>Histórico detalhado</h2>
    ${ds.filter(d => dayMeals(d).length > 0).map(d => {
      const t = dayTotals(d);
      const over = t.kcal > targetKcal;
      const dayDate = new Date(d + 'T12:00:00');
      const dName = DIAS[dayDate.getDay()].slice(0, 3).toUpperCase();
      const formattedDate = `${dayDate.getDate()} de ${MESES[dayDate.getMonth()]}`;
      const count = dayMeals(d).length;

      return `
        <div class="meal">
          <div class="dot" style="background:${over ? 'var(--status-danger)' : '#ffffff'}"></div>
          <div class="info">
            <div class="nome" style="display:flex;align-items:center;gap:6px">
              <b>${dName}</b> · ${formattedDate}
              ${over ? '<span style="font-size:9.5px;background:var(--status-danger-dim);color:var(--status-danger);border:1px solid rgba(248,113,113,0.25);padding:1px 5px;border-radius:4px;font-weight:700">SUPERÁVIT</span>' : ''}
            </div>
            <div class="det">${count} refeição(ões) · P ${fmt(t.p)}g · C ${fmt(t.c)}g · G ${fmt(t.g)}g</div>
          </div>
          <div class="k" style="color:${over ? 'var(--status-danger)' : '#ffffff'}">${fmt(t.kcal)} kcal</div>
        </div>`;
    }).join('') || '<div class="empty"><p>Registre refeições para ver seu histórico.</p></div>'}
  </div>`;
}

window.renderDiario = renderDiario;
