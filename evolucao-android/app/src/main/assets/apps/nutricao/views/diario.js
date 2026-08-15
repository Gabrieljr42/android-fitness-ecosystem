/* apps/nutricao/views/diario.js */
function renderDiario(main){
  const ds=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);ds.push(dateKey(d))}
  const bars=ds.map(d=>{
    const t=dayTotals(d);const isToday=d===today();const over=t.kcal>profile.kcal&&t.kcal>0;
    const h=profile.kcal>0?Math.min(100,Math.round(t.kcal/profile.kcal*100)):0;
    const lbl=MESES[new Date(d+'T12:00:00').getMonth()];
    const dn=new Date(d+'T12:00:00').getDate();
    return `<div class="col">
      <div class="val">${t.kcal?fmt(t.kcal):''}</div>
      <div class="bar ${over?'over':''} ${isToday?'today':''}" style="height:${Math.max(h,1.5)}%"></div>
      <div class="lbl">${isToday?'hoje':dn+' '+lbl.slice(0,3)}</div>
    </div>`;
  }).join('');
  const tot=dayTotals();
  const media7=ds.reduce((a,d)=>a+dayTotals(d).kcal,0)/7;
  main.innerHTML=`
  <div class="card"><h2>Últimos 7 dias</h2>
    <div class="gbar">${bars}</div>
    <div class="gmeta"><div class="lg"></div><span>Meta diária: ${fmt(profile.kcal)} kcal</span></div>
  </div>
  <div class="macro-grid">
    <div class="macro kcal"><div class="v">${fmt(media7)}</div><div class="l">Média 7d</div></div>
    <div class="macro p"><div class="v">${fmt(dayTotals().p)}g</div><div class="l">Proteína hoje</div></div>
    <div class="macro c"><div class="v">${fmt(dayTotals().c)}g</div><div class="l">Carbo hoje</div></div>
    <div class="macro g"><div class="v">${fmt(dayTotals().g)}g</div><div class="l">Gordura hoje</div></div>
  </div>
  <div class="card"><h2>Histórico</h2>
    ${ds.filter(d=>dayMeals(d).length).map(d=>{
      const t=dayTotals(d);const over=t.kcal>profile.kcal;
      return `<div class="meal"><div class="dot" style="background:${over?'var(--bad)':'var(--ok)'}"></div>
        <div class="info"><div class="nome">${DIAS[new Date(d+'T12:00:00').getDay()].slice(0,3)} ${new Date(d+'T12:00:00').getDate()}/${new Date(d+'T12:00:00').getMonth()+1}</div>
        <div class="det">${dayMeals(d).length} refeição(ões) · P ${fmt(t.p)}g · C ${fmt(t.c)}g · G ${fmt(t.g)}g</div></div>
        <div class="k" style="color:${over?'var(--bad)':'var(--accent)'}">${fmt(t.kcal)} kcal</div></div>`;
    }).join('')||'<div class="empty"><p>Registre refeições para ver seu histórico.</p></div>'}
  </div>`;
}
