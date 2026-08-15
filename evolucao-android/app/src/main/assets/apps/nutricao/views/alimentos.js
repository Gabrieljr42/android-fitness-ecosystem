/* apps/nutricao/views/alimentos.js */
function renderAlimentos(main){
  main.innerHTML=`
  <div class="card">
    <h2>Registrar alimento</h2>
    <input id="busca" placeholder="Buscar alimento..." oninput="filtrarRef()"/>
    <div id="refList" class="mt8"></div>
  </div>
  <div class="card">
    <h2>Cadastro rápido (meu alimento)</h2>
    <div class="formrow">
      <div><label>Nome</label><input id="nNome" placeholder="Ex: miojo c/ ovo"/></div>
      <div><label>Porção (g)</label><input id="nPorc" type="number" value="100"/></div>
    </div>
    <div class="formrow">
      <div><label>Calorias</label><input id="nKcal" type="number" placeholder="kcal"/></div>
      <div><label>Proteína (g)</label><input id="nP" type="number" placeholder="g"/></div>
    </div>
    <div class="formrow">
      <div><label>Carbo (g)</label><input id="nC" type="number" placeholder="g"/></div>
      <div><label>Gordura (g)</label><input id="nG" type="number" placeholder="g"/></div>
    </div>
    <button class="bigbtn secondary mt8" id="btnAddRef">Adicionar à minha lista</button>
  </div>`;
  $('#btnAddRef').onclick=()=>{
    const nome=$('#nNome').value.trim();
    if(!nome){toast('Digite o nome do alimento');return}
    const porcao=parseFloat($('#nPorc').value)||100;
    const f=porcao/100;
    const al={nome,kcal:Math.round((parseFloat($('#nKcal').value)||0)*f),
      proteina_g:+((parseFloat($('#nP').value)||0)*f).toFixed(1),
      carbo_g:+((parseFloat($('#nC').value)||0)*f).toFixed(1),
      gordura_g:+((parseFloat($('#nG').value)||0)*f).toFixed(1),porcao_g:porcao};
    if(al.kcal===0){toast('Informe ao menos as calorias');return}
    saveAlim(al);
    ['nNome','nP','nC','nG'].forEach(x=>$('#'+x).value='');$('#nPorc').value='100';
    toast('Alimento adicionado!');filtrarRef();
  };
  filtrarRef();
}
const userAlims=()=>load('nt_alims',[]);
function saveAlim(a){const l=userAlims();l.unshift(a);save('nt_alims',l.slice(0,200))}
function filtrarRef(){
  const q=($('#busca').value||'').toLowerCase().trim();
  const all=[...userAlims().map(a=>({nome:a.nome,...a,custom:true})),...refMap];
  const list=q?all.filter(a=>a.nome.toLowerCase().includes(q)).slice(0,40):all.slice(0,25);
  $('#refList').innerHTML=list.map(a=>{
    const base=a.custom?a:{kcal:a.kcal,p:a.p,c:a.c,g:a.g};
    return `<div class="alim" onclick="addRef('${a.nome.replace(/'/g,"\\'")}')">
      <div class="nm"><b>${a.nome}</b><small>${fmt(base.kcal)} kcal · P${base.p} · C${base.c} · G${base.g} (100g)</small></div>
      <button class="plus" onclick="event.stopPropagation();addRef('${a.nome.replace(/'/g,"\\'")}')">+</button>
    </div>`;
  }).join('')||'<div class="empty"><p>Nenhum alimento encontrado.</p></div>';
}
window.filtrarRef=filtrarRef;
function addRef(nome){
  const a=userAlims().find(x=>x.nome===nome)||refMap.find(x=>x.nome===nome);
  if(!a)return;
  openModal(`
    <h2>${a.nome}</h2>
    <label>Porção (g)</label>
    <input id="pPorc" type="number" value="${a.porcao_g||100}" oninput="calcPrev()"/>
    <div class="formcard mt12" id="prevBox"></div>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmRef()">Adicionar</button>
    </div>`);
  window.__ref=a;
  calcPrev();
}
window.calcPrev=()=>{
  const a=window.__ref;if(!a)return;
  const porcao=parseFloat($('#pPorc').value)||0;const f=porcao/100;
  $('#prevBox').innerHTML=`
    <div class="det-item"><span class="d-qty">${porcanoLabel(porcao)}</span><span style="flex:1">Calorias</span><span class="d-kcal">${fmt((a.kcal||0)*f)} kcal</span></div>
    <div class="det-item"><span></span><span style="flex:1">Proteína</span><span class="d-kcal" style="color:#7ec8ff">${(((a.proteina_g ?? a.p) || 0) * f).toFixed(1)} g</span></div>
    <div class="det-item"><span></span><span style="flex:1">Carboidrato</span><span class="d-kcal" style="color:#3ddc84">${(((a.carbo_g ?? a.c) || 0) * f).toFixed(1)} g</span></div>
    <div class="det-item"><span></span><span style="flex:1">Gordura</span><span class="d-kcal" style="color:#f2a2ff">${(((a.gordura_g ?? a.g) || 0) * f).toFixed(1)} g</span></div>`;
};
function porcanoLabel(g){return g>=1000?(g/1000).toFixed(1).replace('.',',')+' kg':g+' g'}
window.confirmRef=()=>{
  const a=window.__ref;const porcao=parseFloat($('#pPorc').value)||0;const f=porcao/100;
  const item={nome:a.nome,porcao_g:porcao,kcal:Math.round((a.kcal||0)*f),
    proteina_g:+(((a.proteina_g ?? a.p) || 0) * f).toFixed(1),
    carbo_g:+(((a.carbo_g ?? a.c) || 0) * f).toFixed(1),
    gordura_g:+(((a.gordura_g ?? a.g) || 0) * f).toFixed(1)};
  meals.push({id:uid(),date:today(),hour:horaNow(),nome:a.nome,itens:[item],origem:'manual'});
  save(LS.m,meals);closeModal();toast('Adicionado!');render();
};
window.addRef=addRef;
