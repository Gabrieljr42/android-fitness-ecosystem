/* apps/nutricao/views/alimentos.js — inclui plano semanal de refeições */
/* ============ DADOS DO PLANO SEMANAL ============ */
/* apps/nutricao/plano.js — Plano semanal de refeições (dados + kcal estimadas)
   Fonte: tabela do usuário (14/08/2026). kcal estimadas por porção típica
   usando o catálogo de referência do app. Meta diária ≈3.330 kcal. */
const PLANO_SEMANAL=[
  {dia:'segunda',
   refeicoes:[
     {nome:'Pré-treino',itens:[
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Ovo frito',porcao_g:50,kcal:98}]},
     {nome:'Pós-treino',itens:[
       {nome:'Leite integral',porcao_g:400,kcal:256},
       {nome:'Aveia em flocos',porcao_g:60,kcal:227},
       {nome:'Banana',porcao_g:120,kcal:107},
       {nome:'Café c/ açúcar',porcao_g:200,kcal:60}]},
     {nome:'Almoço',itens:[
       {nome:'Arroz branco cozido',porcao_g:250,kcal:325},
       {nome:'Feijão carioca cozido',porcao_g:150,kcal:114},
       {nome:'Frango grelhado (peito)',porcao_g:150,kcal:248},
       {nome:'Salada verde mista',porcao_g:100,kcal:18},
       {nome:'Laranja',porcao_g:150,kcal:71},
       {nome:'Óleo (1 col. sopa)',porcao_g:13,kcal:117}]},
     {nome:'Lanche da tarde',itens:[
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Amendoim torrado',porcao_g:30,kcal:176},
       {nome:'Geleia (col. sopa)',porcao_g:30,kcal:75},
       {nome:'Banana',porcao_g:120,kcal:107}]},
     {nome:'Jantar',itens:[
       {nome:'Macarrão com molho',porcao_g:300,kcal:480},
       {nome:'Legumes refogados',porcao_g:100,kcal:60},
       {nome:'Óleo (1 col. sopa)',porcao_g:13,kcal:117}]}
   ]},
  {dia:'terça',
   refeicoes:[
     {nome:'Pré-treino',itens:[
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Ovo frito',porcao_g:50,kcal:98}]},
     {nome:'Pós-treino',itens:[
       {nome:'Leite integral',porcao_g:400,kcal:256},
       {nome:'Aveia em flocos',porcao_g:60,kcal:227},
       {nome:'Banana',porcao_g:120,kcal:107},
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Geleia (col. sopa)',porcao_g:30,kcal:75}]},
     {nome:'Almoço',itens:[
       {nome:'Macarrão cozido',porcao_g:300,kcal:393},
       {nome:'Frango grelhado (peito)',porcao_g:120,kcal:198},
       {nome:'Macarrão com molho',porcao_g:100,kcal:160},
       {nome:'Legumes refogados',porcao_g:100,kcal:60}]},
     {nome:'Lanche da tarde',itens:[
       {nome:'Leite integral',porcao_g:400,kcal:256},
       {nome:'Banana',porcao_g:120,kcal:107},
       {nome:'Aveia em flocos',porcao_g:40,kcal:152},
       {nome:'Amendoim torrado',porcao_g:25,kcal:147}]},
     {nome:'Jantar',itens:[
       {nome:'Arroz branco cozido',porcao_g:200,kcal:260},
       {nome:'Feijão carioca cozido',porcao_g:120,kcal:91},
       {nome:'Ovo frito',porcao_g:100,kcal:196}]}
   ]},
  {dia:'quarta',
   refeicoes:[
     {nome:'Pré-treino',itens:[
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Ovo frito',porcao_g:50,kcal:98}]},
     {nome:'Pós-treino',itens:[
       {nome:'Leite integral',porcao_g:500,kcal:320},
       {nome:'Aveia em flocos',porcao_g:60,kcal:227},
       {nome:'Banana',porcao_g:150,kcal:134}]},
     {nome:'Almoço',itens:[
       {nome:'Arroz branco cozido',porcao_g:250,kcal:325},
       {nome:'Feijão carioca cozido',porcao_g:150,kcal:114},
       {nome:'Frango grelhado (peito)',porcao_g:150,kcal:248},
       {nome:'Salada verde mista',porcao_g:100,kcal:18},
       {nome:'Laranja',porcao_g:150,kcal:71}]},
     {nome:'Lanche da tarde',itens:[
       {nome:'Pão francês',porcao_g:120,kcal:360},
       {nome:'Amendoim torrado',porcao_g:30,kcal:176},
       {nome:'Geleia (col. sopa)',porcao_g:30,kcal:75},
       {nome:'Leite integral',porcao_g:300,kcal:192}]},
     {nome:'Jantar',itens:[
       {nome:'Arroz branco cozido',porcao_g:200,kcal:260},
       {nome:'Feijão carioca cozido',porcao_g:120,kcal:91},
       {nome:'Ovo frito',porcao_g:100,kcal:196}]}
   ]},
  {dia:'quinta',
   refeicoes:[
     {nome:'Pré-treino',itens:[
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Ovo frito',porcao_g:50,kcal:98}]},
     {nome:'Pós-treino',itens:[
       {nome:'Mingau de aveia',porcao_g:300,kcal:270},
       {nome:'Leite integral',porcao_g:300,kcal:192},
       {nome:'Banana',porcao_g:150,kcal:134}]},
     {nome:'Almoço',itens:[
       {nome:'Arroz branco cozido',porcao_g:250,kcal:325},
       {nome:'Feijão carioca cozido',porcao_g:150,kcal:114},
       {nome:'Ovo frito',porcao_g:100,kcal:196},
       {nome:'Salada verde mista',porcao_g:100,kcal:18}]},
     {nome:'Lanche da tarde',itens:[
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Leite integral',porcao_g:300,kcal:192},
       {nome:'Banana',porcao_g:120,kcal:107}]},
     {nome:'Jantar',itens:[
       {nome:'Macarrão cozido',porcao_g:300,kcal:393},
       {nome:'Frango grelhado (peito)',porcao_g:150,kcal:248},
       {nome:'Macarrão com molho',porcao_g:100,kcal:160}]}
   ]},
  {dia:'sexta',
   refeicoes:[
     {nome:'Pré-treino',itens:[
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Ovo frito',porcao_g:50,kcal:98}]},
     {nome:'Pós-treino',itens:[
       {nome:'Leite integral',porcao_g:400,kcal:256},
       {nome:'Aveia em flocos',porcao_g:60,kcal:227},
       {nome:'Banana',porcao_g:120,kcal:107},
       {nome:'Geleia (col. sopa)',porcao_g:40,kcal:100}]},
     {nome:'Almoço',itens:[
       {nome:'Arroz branco cozido',porcao_g:250,kcal:325},
       {nome:'Feijão carioca cozido',porcao_g:150,kcal:114},
       {nome:'Frango grelhado (peito)',porcao_g:150,kcal:248},
       {nome:'Salada verde mista',porcao_g:100,kcal:18}]},
     {nome:'Lanche da tarde',itens:[
       {nome:'Leite integral',porcao_g:400,kcal:256},
       {nome:'Aveia em flocos',porcao_g:40,kcal:152},
       {nome:'Banana',porcao_g:120,kcal:107}]},
     {nome:'Jantar',itens:[
       {nome:'Macarrão com molho',porcao_g:300,kcal:480},
       {nome:'Ovo frito',porcao_g:50,kcal:98}]}
   ]},
  {dia:'sábado',
   refeicoes:[
     {nome:'Pré-treino',itens:[
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Ovo frito',porcao_g:50,kcal:98}]},
     {nome:'Pós-treino',itens:[
       {nome:'Leite integral',porcao_g:400,kcal:256},
       {nome:'Aveia em flocos',porcao_g:60,kcal:227},
       {nome:'Banana',porcao_g:120,kcal:107},
       {nome:'Amendoim torrado',porcao_g:20,kcal:117}]},
     {nome:'Almoço',itens:[
       {nome:'Arroz branco cozido',porcao_g:250,kcal:325},
       {nome:'Feijão carioca cozido',porcao_g:150,kcal:114},
       {nome:'Sardinha assada',porcao_g:120,kcal:250},
       {nome:'Salada verde mista',porcao_g:100,kcal:18}]},
     {nome:'Lanche da tarde',itens:[
       {nome:'Pão francês',porcao_g:120,kcal:360},
       {nome:'Geleia (col. sopa)',porcao_g:30,kcal:75},
       {nome:'Banana',porcao_g:120,kcal:107}]},
     {nome:'Jantar',itens:[
       {nome:'Macarrão com molho',porcao_g:300,kcal:480},
       {nome:'Geleia (col. sopa)',porcao_g:30,kcal:75}]}
   ]},
  {dia:'domingo',
   refeicoes:[
     {nome:'Pré-treino',itens:[
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Ovo frito',porcao_g:50,kcal:98}]},
     {nome:'Pós-treino',itens:[
       {nome:'Leite integral',porcao_g:400,kcal:256},
       {nome:'Aveia em flocos',porcao_g:60,kcal:227},
       {nome:'Banana',porcao_g:120,kcal:107},
       {nome:'Amendoim torrado',porcao_g:20,kcal:117}]},
     {nome:'Almoço',itens:[
       {nome:'Arroz branco cozido',porcao_g:250,kcal:325},
       {nome:'Feijão carioca cozido',porcao_g:150,kcal:114},
       {nome:'Frango grelhado (peito)',porcao_g:120,kcal:198},
       {nome:'Salada verde mista',porcao_g:100,kcal:18}]},
     {nome:'Lanche da tarde',itens:[
       {nome:'Pão francês',porcao_g:60,kcal:180},
       {nome:'Geleia (col. sopa)',porcao_g:30,kcal:75},
       {nome:'Banana',porcao_g:120,kcal:107},
       {nome:'Leite integral',porcao_g:300,kcal:192}]},
     {nome:'Jantar',itens:[
       {nome:'Macarrão com molho',porcao_g:300,kcal:480},
       {nome:'Ovo frito',porcao_g:50,kcal:98}]}
   ]}
];
// Total aproximado por dia (kcal), conferido nas porções:
PLANO_SEMANAL.forEach(p=>{
  p.total=p.refeicoes.reduce((a,r)=>a+r.itens.reduce((s,i)=>s+i.kcal,0),0);
});
/* ============ PLANO SEMANAL ============ */
const HORARIO_REFEICAO={'Pré-treino':'07:30','Pós-treino':'09:15','Almoço':'12:30','Lanche da tarde':'15:30','Jantar':'19:00'};
let planoAberto=window.planoAberto||'segunda';
window.planoAberto=planoAberto;
function refKcal(r){return r.itens.reduce((a,i)=>a+(i.kcal||0),0)}
function renderPlano(box){
  const hojeKey=today();
  const temDia={};
  PLANO_SEMANAL.forEach(p=>{temDia[p.dia]=meals.some(m=>m.date===hojeKey&&m.plano&&m.plano===p.dia)});
  const dias=['segunda','terça','quarta','quinta','sexta','sábado','domingo'];
  const aberto=PLANO_SEMANAL.find(p=>p.dia===planoAberto)||PLANO_SEMANAL[0];
  box.innerHTML=`
  <div class="card">
    <div class="plano-head">
      <h2>Meu plano semanal</h2>
      <span class="small">meta ≈3.330 kcal/dia</span>
    </div>
    <div class="plano-dias">
      ${dias.map(d=>{
        const p=PLANO_SEMANAL.find(x=>x.dia===d);
        return `<div class="plano-dia ${d===aberto.dia?'sel':''}" onclick="planoTrocar('${d}')">
          <span class="d">${d.slice(0,3)}</span>
          <span class="c"><small>${fmt(p.total)}</small> kcal</span>
        </div>`;
      }).join('')}
    </div>
    <div class="mt12">
      ${aberto.refeicoes.map(r=>`
        <div class="plano-ref">
          <div class="ico">${r.nome[0]}</div>
          <div class="info"><div class="nome">${r.nome}</div>
          <div class="det">${r.itens.map(i=>i.nome).join(' · ')}</div></div>
          <div class="k">${fmt(refKcal(r))}</div>
        </div>`).join('')}
      <div class="plano-total"><span>Total do dia</span><span class="v">≈${fmt(aberto.total)} kcal</span></div>
      <button class="plano-load" onclick="carregarDia('${aberto.dia}')">${temDia[aberto.dia]?'Carregar de novo este dia':'Carregar dia · '+aberto.dia.charAt(0).toUpperCase()+aberto.dia.slice(1)}</button>
    </div>
  </div>`;
}
window.planoTrocar=d=>{planoAberto=d;renderPlano($('#planoBox'))};
function carregarDia(dia){
  const p=PLANO_SEMANAL.find(x=>x.dia===dia);
  if(!p)return;
  const hojeKey=today();
  const q=meals.filter(m=>m.date===hojeKey&&m.plano);
  if(q.length){
    toast('Já existem refeições de plano para hoje. Remova-as em Hoje primeiro.');return;
  }
  p.refeicoes.forEach(r=>{
    meals.push({id:uid(),date:hojeKey,hour:HORARIO_REFEICAO[r.nome]||horaNow(),nome:r.nome,itens:r.itens.map(i=>({nome:i.nome,porcao_g:i.porcao_g,kcal:i.kcal,proteina_g:0,carbo_g:0,gordura_g:0})),origem:'manual',plano:dia});
  });
  save(LS.m,meals);
  toast('Dia carregado em Hoje! · ≈'+fmt(p.total)+' kcal');
  renderPlano($('#planoBox'));
}
window.carregarDia=carregarDia;
/* ============ REGISTRO DE ALIMENTOS ============ */
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
  </div>
  <div id="planoBox" class="mt12"></div>`;
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
  renderPlano($('#planoBox'));
}
const userAlims=()=>load('nt_alims',[]);
function saveAlim(a){const l=userAlims();l.unshift(a);save('nt_alims',l.slice(0,200))}
function filtrarRef(){
  if(!$('#refList'))return;
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
