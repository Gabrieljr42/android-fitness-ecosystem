/* apps/nutricao/views/hoje.js */
/* ============ RENDER ============ */
function render(){
  $('#dataHoje').textContent=DIAS[new Date().getDay()].charAt(0).toUpperCase()+DIAS[new Date().getDay()].slice(1)+', '+new Date().getDate()+' de '+MESES[new Date().getMonth()]+' de '+new Date().getFullYear();
  const main=$('#main');
  if(state.tab==='hoje')renderHoje(main);
  else if(state.tab==='diario')renderDiario(main);
  else if(state.tab==='alimentos')renderAlimentos(main);
  else if(state.tab==='metas')renderMetas(main);
  else renderAjustes(main);
}

function renderHoje(main){
  const t=dayTotals();
  const pct=(v,m)=>Math.min(100,Math.round(v/m*100));
  main.innerHTML=`
  <div class="macro-grid">
    <div class="macro kcal"><div class="v">${fmt(t.kcal)}</div><div class="l">kcal</div><div class="prog"><div style="width:${pct(t.kcal,profile.kcal)}%"></div></div></div>
    <div class="macro p"><div class="v">${fmt(t.p)}g</div><div class="l">Proteína</div><div class="prog"><div style="width:${pct(t.p,profile.p)}%"></div></div></div>
    <div class="macro c"><div class="v">${fmt(t.c)}g</div><div class="l">Carbo</div><div class="prog"><div style="width:${pct(t.c,profile.c)}%"></div></div></div>
    <div class="macro g"><div class="v">${fmt(t.g)}g</div><div class="l">Gordura</div><div class="prog"><div style="width:${pct(t.g,profile.g)}%"></div></div></div>
  </div>
  <button class="bigbtn primary" id="btnFoto">
    <svg viewBox="0 0 24 24" fill="none"><path d="M3 8.5V7a2 2 0 012-2h2.5l1.6-2h5.8l1.6 2H19a2 2 0 012 2v1.5M21 9.5v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2h14a2 2 0 012 2z" stroke="#0d0d0f" stroke-width="2"/><circle cx="12" cy="13" r="3.6" stroke="#0d0d0f" stroke-width="2"/></svg>
    Fotografar prato
  </button>
  <button class="bigbtn secondary" id="btnMan">
    <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#f5a623" stroke-width="2.4" stroke-linecap="round"/></svg>
    Adicionar manualmente
  </button>
  <div class="card" style="margin-top:4px">
    <h2>Refeições de hoje <span class="small">${dayMeals().length} registro(s)</span></h2>
    ${renderListaMeals(dayMeals())}
  </div>
  ${meals.length===0?`<div class="card"><div class="empty">
    <svg viewBox="0 0 24 24" fill="none"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 4a6 6 0 016 6c0 3-2 5-4 6.5-.9.7-1.4 1.2-1.7 1.8h-.6c-.3-.6-.8-1.1-1.7-1.8C8.2 17 6.2 15 6.2 12a6 6 0 016-6z" fill="#9a9aa4"/><circle cx="9.5" cy="10.5" r="1.2" fill="#1c1c21"/><circle cx="14.5" cy="10.5" r="1.2" fill="#1c1c21"/><path d="M9 14.5c1 .8 2 1 3 1s2-.2 3-1" stroke="#1c1c21" stroke-width="1.2" stroke-linecap="round"/></svg>
    <p>Nenhum registro ainda.<br/>Tire uma foto do seu prato ou adicione manualmente.</p>
    <button onclick="$('#btnFoto').click()">Começar agora</button>
  </div></div>`:''}`;
  $('#btnFoto').onclick=abrirFoto;
  $('#btnMan').onclick=abrirManual;
}

function renderListaMeals(lista){
  if(!lista.length)return'<div class="empty"><p>Nenhuma refeição registrada hoje.</p></div>';
  return lista.map(m=>`
    <div class="meal">
      <div class="dot"></div>
      <div class="info"><div class="nome">${m.nome}</div>
      <div class="det">${m.itens.map(i=>i.nome).join(' · ')} · ${m.hour}</div></div>
      <div class="k">${fmt(m.itens.reduce((a,i)=>a+(i.kcal||0),0))} kcal</div>
      <button class="del" onclick="delMeal('${m.id}')"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" stroke="#9a9aa4" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    </div>`).join('');
}

function delMeal(id){
  const idx=meals.findIndex(m=>m.id===id);
  if(idx<0)return;
  const removido=meals.splice(idx,1)[0];
  save(LS.m,meals);render();
  toast('Refeição removida',()=>{meals.splice(idx,0,removido);save(LS.m,meals);render()});
}
