/* apps/nutricao/views/alimentos.js — inclui plano semanal de refeições e meus alimentos */

/* ============ DADOS DO PLANO SEMANAL ============ */
const PLANO_SEMANAL = [
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
       {nome:'Pão francês',porcao_g:120,kcal:360},
       {nome:'Geleia (col. sopa)',porcao_g:30,kcal:75},
       {nome:'Banana',porcao_g:120,kcal:107},
       {nome:'Leite integral',porcao_g:300,kcal:192}]},
     {nome:'Jantar',itens:[
       {nome:'Macarrão com molho',porcao_g:300,kcal:480},
       {nome:'Ovo frito',porcao_g:50,kcal:98}]}
   ]}
];

/* ============ REGISTRO DE ALIMENTOS & MEUS ALIMENTOS (HELPERS) ============ */
/* MODELO CANÔNICO: todo item em nt_alims tem kcal/macros POR PORÇÃO SALVA
   (totais para porcao_g gramas) e custom:true é invariante garantido aqui.
   A base de referência (refMap) continua por 100 g e nunca entra em nt_alims.
   Assim "valor da lista" == "valor ao tocar" — sem escala dupla. */
function normalizeAlimEntry(a) {
  if (!a || typeof a !== 'object') return a;
  const rawP = Number(a.porcao_g);
  const porcao = Number.isFinite(rawP) && rawP > 0 ? rawP : 100;
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  return {
    ...a,
    custom: true,
    porcao_g: porcao,
    kcal: num(a.kcal),
    proteina_g: num(a.proteina_g),
    carbo_g: num(a.carbo_g),
    gordura_g: num(a.gordura_g)
  };
}

function userAlims() {
  const list = typeof load === 'function' ? load('nt_alims', []) : [];
  // Cura na leitura: entradas legadas/de IA sem custom/porcao_g ficam
  // consistentes com a base "porção salva" sem precisar migrar storage.
  return Array.isArray(list) ? list.map(normalizeAlimEntry) : [];
}

function saveUserAlims(list) {
  if (typeof save === 'function') {
    save('nt_alims', list.slice(0, 200));
  }
}

function saveAlim(a) {
  const l = userAlims();
  l.unshift(normalizeAlimEntry(a));
  saveUserAlims(l);
}

/** Base de cálculo de um alimento: gramas de referência + valores nessa base. */
function alimBasis(ref) {
  if (!ref) return { baseG: 100, kcal: 0, p: 0, c: 0, g: 0 };
  if (ref.custom) {
    return {
      baseG: Math.max(1, Number(ref.porcao_g) || 100),
      kcal: Number(ref.kcal) || 0,
      p: Number(ref.proteina_g ?? ref.p) || 0,
      c: Number(ref.carbo_g ?? ref.c) || 0,
      g: Number(ref.gordura_g ?? ref.g) || 0
    };
  }
  // Base de referência: sempre por 100 g
  return {
    baseG: 100,
    kcal: Number(ref.kcal) || 0,
    p: Number(ref.p ?? ref.proteina_g) || 0,
    c: Number(ref.c ?? ref.carbo_g) || 0,
    g: Number(ref.g ?? ref.gordura_g) || 0
  };
}

function updateCustomFood(index, updatedObj) {
  const list = userAlims();
  if (index < 0 || index >= list.length) return false;
  list[index] = { ...list[index], ...updatedObj, custom: true };
  saveUserAlims(list);
  return true;
}

function deleteCustomFood(index) {
  const list = userAlims();
  if (index < 0 || index >= list.length) return null;
  const removido = list.splice(index, 1)[0];
  saveUserAlims(list);
  return removido;
}

/* ============ ENRIQUECIMENTO DE MACROS DO PLANO ============ */
function enrichPlanItem(item) {
  if (item.proteina_g !== undefined && item.carbo_g !== undefined && item.gordura_g !== undefined) {
    return {
      nome: item.nome,
      porcao_g: item.porcao_g || 100,
      kcal: item.kcal || 0,
      proteina_g: +(item.proteina_g || 0),
      carbo_g: +(item.carbo_g || 0),
      gordura_g: +(item.gordura_g || 0)
    };
  }

  const uAlims = userAlims();
  const ref = uAlims.find(x => x.nome === item.nome) ||
              (typeof refMap !== 'undefined' ? refMap.find(x => x.nome === item.nome) : null);

  const porcao = item.porcao_g || 100;

  if (ref) {
    // Base correta por tipo: custom = porção salva; referência = 100 g
    const b = alimBasis(ref);
    const factor = b.baseG > 0 ? (porcao / b.baseG) : 1;

    return {
      nome: item.nome,
      porcao_g: porcao,
      kcal: item.kcal !== undefined ? item.kcal : Math.round(b.kcal * factor),
      proteina_g: +((b.p * factor).toFixed(1)),
      carbo_g: +((b.c * factor).toFixed(1)),
      gordura_g: +((b.g * factor).toFixed(1))
    };
  }

  return {
    nome: item.nome,
    porcao_g: porcao,
    kcal: item.kcal || 0,
    proteina_g: item.proteina_g || 0,
    carbo_g: item.carbo_g || 0,
    gordura_g: item.gordura_g || 0
  };
}

function getRefeicaoMacros(r) {
  const itens = r.itens.map(enrichPlanItem);
  const kcal = itens.reduce((s, i) => s + (i.kcal || 0), 0);
  const p = +itens.reduce((s, i) => s + (i.proteina_g || 0), 0).toFixed(1);
  const c = +itens.reduce((s, i) => s + (i.carbo_g || 0), 0).toFixed(1);
  const g = +itens.reduce((s, i) => s + (i.gordura_g || 0), 0).toFixed(1);
  return { nome: r.nome, itens, kcal, proteina_g: p, carbo_g: c, gordura_g: g };
}

function getDiaMacros(diaObj) {
  const refeicoes = diaObj.refeicoes.map(getRefeicaoMacros);
  const totalKcal = refeicoes.reduce((s, r) => s + r.kcal, 0);
  const totalP = +refeicoes.reduce((s, r) => s + r.proteina_g, 0).toFixed(1);
  const totalC = +refeicoes.reduce((s, r) => s + r.carbo_g, 0).toFixed(1);
  const totalG = +refeicoes.reduce((s, r) => s + r.gordura_g, 0).toFixed(1);
  return { dia: diaObj.dia, refeicoes, totalKcal, totalP, totalC, totalG };
}

// Atualiza total aproximado por dia
PLANO_SEMANAL.forEach(p => {
  const dm = getDiaMacros(p);
  p.total = dm.totalKcal;
  p.totalP = dm.totalP;
  p.totalC = dm.totalC;
  p.totalG = dm.totalG;
});

/* ============ PLANO SEMANAL ============ */
const HORARIO_REFEICAO = {
  'Pré-treino': '07:30',
  'Pós-treino': '09:15',
  'Almoço': '12:30',
  'Lanche da tarde': '15:30',
  'Jantar': '19:00'
};
let planoAberto = window.planoAberto || 'segunda';
window.planoAberto = planoAberto;

function refKcal(r) {
  return r.itens.reduce((a, i) => a + (i.kcal || 0), 0);
}

function renderPlano(box) {
  if (!box) return;
  const hojeKey = today();
  const temDia = {};
  PLANO_SEMANAL.forEach(p => {
    temDia[p.dia] = meals.some(m => m.date === hojeKey && m.plano && m.plano === p.dia);
  });
  const dias = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  const aberto = PLANO_SEMANAL.find(p => p.dia === planoAberto) || PLANO_SEMANAL[0];
  const diaMacros = getDiaMacros(aberto);

  box.innerHTML = `
  <div class="card">
    <div class="plano-head">
      <h2>Meu plano semanal</h2>
      <span class="small">meta ≈3.330 kcal/dia</span>
    </div>
    <div class="plano-dias">
      ${dias.map(d => {
        const p = PLANO_SEMANAL.find(x => x.dia === d);
        return `<div class="plano-dia ${d === aberto.dia ? 'sel' : ''}" onclick="planoTrocar('${d}')">
          <span class="d">${d.slice(0, 3)}</span>
          <span class="c"><small>${fmt(p.total)}</small> kcal</span>
        </div>`;
      }).join('')}
    </div>
    <div class="mt12">
      ${diaMacros.refeicoes.map((r, idx) => `
        <div class="plano-ref" style="cursor:pointer" onclick="abrirModalRefPlano('${aberto.dia}', ${idx})">
          <div class="ico">${r.nome[0]}</div>
          <div class="info">
            <div class="nome">${r.nome}</div>
            <div class="det">${r.itens.map(i => i.nome).join(' · ')}</div>
            <div class="small" style="margin-top:3px;font-size:11.5px;color:var(--txt-secondary)">
              <span>P ${r.proteina_g}g</span> · 
              <span>C ${r.carbo_g}g</span> · 
              <span>G ${r.gordura_g}g</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <div class="k">${fmt(r.kcal)} kcal</div>
            <button class="plus" style="width:32px;height:32px;font-size:16px" title="Adicionar ao Hoje" onclick="event.stopPropagation();carregarRefeicao('${aberto.dia}', ${idx})">+</button>
          </div>
        </div>`).join('')}

      <div class="plano-total">
        <div>
          <span>Total do dia</span>
          <div class="small" style="font-weight:600;margin-top:2px;color:var(--txt-secondary)">
            <span>P ${diaMacros.totalP}g</span> · 
            <span>C ${diaMacros.totalC}g</span> · 
            <span>G ${diaMacros.totalG}g</span>
          </div>
        </div>
        <span class="v">≈${fmt(diaMacros.totalKcal)} kcal</span>
      </div>

      <button class="plano-load" onclick="carregarDia('${aberto.dia}')">
        ${temDia[aberto.dia] ? 'Carregar dia novamente · ' + aberto.dia.charAt(0).toUpperCase() + aberto.dia.slice(1) : 'Carregar dia completo · ' + aberto.dia.charAt(0).toUpperCase() + aberto.dia.slice(1)}
      </button>
    </div>
  </div>`;
}
window.planoTrocar = d => { planoAberto = d; renderPlano($('#planoBox')); };

function abrirModalRefPlano(dia, refIndex) {
  const p = PLANO_SEMANAL.find(x => x.dia === dia);
  if (!p || !p.refeicoes || !p.refeicoes[refIndex]) return;
  const r = p.refeicoes[refIndex];
  const m = getRefeicaoMacros(r);
  const diaCap = dia.charAt(0).toUpperCase() + dia.slice(1);

  openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h2 style="margin:0">${r.nome}</h2>
      <span class="small" style="font-weight:700;color:var(--txt-primary)">${diaCap}</span>
    </div>

    <div class="macro-grid" style="margin-bottom:12px">
      <div class="macro kcal"><div class="v">${fmt(m.kcal)}</div><div class="l">kcal</div></div>
      <div class="macro p"><div class="v">${fmt(m.proteina_g)}g</div><div class="l">Proteína</div></div>
      <div class="macro c"><div class="v">${fmt(m.carbo_g)}g</div><div class="l">Carbo</div></div>
      <div class="macro g"><div class="v">${fmt(m.gordura_g)}g</div><div class="l">Gordura</div></div>
    </div>

    <label style="margin-bottom:6px">Itens da Refeição (${m.itens.length})</label>
    <div class="formcard" style="padding:4px 12px;margin-bottom:12px">
      ${m.itens.map(item => `
        <div class="det-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-subtle);background:transparent;border-radius:0">
          <div style="flex:1;min-width:0;padding-right:8px">
            <div style="font-weight:700;font-size:14px;color:var(--txt-primary)">${escapeHtml(item.nome)}</div>
            <div class="small" style="color:var(--txt-secondary);margin-top:2px">
              ${item.porcao_g}g · <span>P ${item.proteina_g}g</span> · <span>C ${item.carbo_g}g</span> · <span>G ${item.gordura_g}g</span>
            </div>
          </div>
          <div class="d-kcal" style="font-weight:800;color:#ffffff;font-size:14px;white-space:nowrap">${fmt(item.kcal)} kcal</div>
        </div>
      `).join('')}
    </div>

    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Fechar</button>
      <button class="bigbtn primary" onclick="carregarRefeicao('${dia}', ${refIndex}); closeModal();">
        + Adicionar ao Hoje
      </button>
    </div>
  `);
}
window.abrirModalRefPlano = abrirModalRefPlano;

function carregarRefeicao(dia, refIndex) {
  const p = PLANO_SEMANAL.find(x => x.dia === dia);
  if (!p || !p.refeicoes || !p.refeicoes[refIndex]) {
    toast('Refeição não encontrada no plano.');
    return;
  }
  const r = p.refeicoes[refIndex];
  const macros = getRefeicaoMacros(r);
  const hojeKey = today();

  const novaRef = {
    id: uid(),
    date: hojeKey,
    hour: HORARIO_REFEICAO[r.nome] || horaNow(),
    nome: r.nome,
    itens: macros.itens,
    origem: 'plano',
    plano: dia
  };

  meals.push(novaRef);
  save(LS.m, meals);
  toast(`"${r.nome}" adicionada ao Hoje! (${fmt(macros.kcal)} kcal)`);
  if ($('#planoBox')) renderPlano($('#planoBox'));
}
window.carregarRefeicao = carregarRefeicao;

function carregarDia(dia) {
  const p = PLANO_SEMANAL.find(x => x.dia === dia);
  if (!p) return;
  const hojeKey = today();
  const q = meals.filter(m => m.date === hojeKey && m.plano);
  if (q.length) {
    toast('Já existem refeições de plano para hoje. Remova-as em Hoje primeiro.');
    return;
  }
  const dm = getDiaMacros(p);
  dm.refeicoes.forEach(r => {
    meals.push({
      id: uid(),
      date: hojeKey,
      hour: HORARIO_REFEICAO[r.nome] || horaNow(),
      nome: r.nome,
      itens: r.itens,
      origem: 'manual',
      plano: dia
    });
  });
  save(LS.m, meals);
  toast('Dia carregado em Hoje! · ≈' + fmt(dm.totalKcal) + ' kcal');
  renderPlano($('#planoBox'));
}
window.carregarDia = carregarDia;

/* ============ REGISTRO DE ALIMENTOS & MEUS ALIMENTOS (UI) ============ */
function renderAlimentos(main) {
  main.innerHTML = `
  <div class="card">
    <h2>Registrar alimento</h2>
    <input id="busca" placeholder="Buscar alimento..." oninput="filtrarRef()"/>
    <div id="refList" class="mt8"></div>
  </div>

  <div class="card">
    <h2>Cadastro rápido (meu alimento)</h2>
    <div class="formrow">
      <div style="grid-column:1/-1"><label>Nome</label><input id="nNome" placeholder="Ex: miojo c/ ovo"/></div>
    </div>
    <div class="formrow">
      <div><label>Porção (g)</label><input id="nPorc" type="number" value="100"/></div>
      <div><label>Calorias (kcal)</label><input id="nKcal" type="number" placeholder="kcal"/></div>
    </div>
    <div class="formrow three">
      <div><label>Proteína (g)</label><input id="nP" type="number" step="0.1" placeholder="g"/></div>
      <div><label>Carbo (g)</label><input id="nC" type="number" step="0.1" placeholder="g"/></div>
      <div><label>Gordura (g)</label><input id="nG" type="number" step="0.1" placeholder="g"/></div>
    </div>
    <button class="bigbtn secondary mt8" id="btnAddRef">Adicionar à minha lista</button>
  </div>

  <div class="card" id="myAlimsCard">
    <h2>Meus Alimentos cadastrados</h2>
    <div id="myAlimsList"></div>
  </div>

  <div id="planoBox" class="mt12"></div>`;

  $('#btnAddRef').onclick = () => {
    const nome = ($('#nNome').value || '').trim();
    if (!nome) { toast('Digite o nome do alimento'); return; }
    const porcao = parseFloat($('#nPorc').value) || 100;
    const kcal = Math.round(parseFloat($('#nKcal').value) || 0);
    const proteina_g = +((parseFloat($('#nP').value) || 0).toFixed(1));
    const carbo_g = +((parseFloat($('#nC').value) || 0).toFixed(1));
    const gordura_g = +((parseFloat($('#nG').value) || 0).toFixed(1));

    if (kcal === 0 && proteina_g === 0 && carbo_g === 0 && gordura_g === 0) {
      toast('Informe ao menos as calorias ou macros');
      return;
    }

    const normFactor = porcao > 0 ? (100 / porcao) : 1;
    const al = {
      nome,
      porcao_g: porcao,
      kcal,
      proteina_g,
      carbo_g,
      gordura_g,
      p: +((proteina_g * normFactor).toFixed(1)),
      c: +((carbo_g * normFactor).toFixed(1)),
      g: +((gordura_g * normFactor).toFixed(1)),
      custom: true
    };

    saveAlim(al);
    ['nNome', 'nP', 'nC', 'nG', 'nKcal'].forEach(x => { if ($('#' + x)) $('#' + x).value = ''; });
    if ($('#nPorc')) $('#nPorc').value = '100';
    toast('Alimento adicionado!');
    filtrarRef();
    renderCustomAlimsList();
  };

  filtrarRef();
  renderCustomAlimsList();
  renderPlano($('#planoBox'));
}

function renderCustomAlimsList() {
  const container = $('#myAlimsList');
  if (!container) return;
  const list = userAlims();
  if (!list.length) {
    container.innerHTML = '<div class="small" style="color:var(--txt-tertiary);padding:8px 0">Nenhum alimento personalizado cadastrado ainda.</div>';
    return;
  }

  container.innerHTML = list.map((a, idx) => {
    const p = a.proteina_g !== undefined ? a.proteina_g : (a.p || 0);
    const c = a.carbo_g !== undefined ? a.carbo_g : (a.c || 0);
    const g = a.gordura_g !== undefined ? a.gordura_g : (a.g || 0);
    const porc = a.porcao_g || 100;
    return `
      <div class="alim" style="justify-content:space-between">
        <div class="nm" style="cursor:pointer" data-edit-alim="${idx}">
          <b style="display:flex;align-items:center;gap:6px">
            ${escapeHtml(a.nome)}
            <span style="font-size:10px;background:rgba(255,255,255,0.08);color:#ffffff;border:1px solid var(--border-subtle);padding:1px 6px;border-radius:6px;font-weight:700">MEU</span>
          </b>
          <small>${fmt(a.kcal)} kcal · P ${p}g · C ${c}g · G ${g}g (${porc}g)</small>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <button class="plus" style="width:34px;height:34px;font-size:13px;background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--txt-secondary)" title="Editar" data-edit-alim="${idx}">✏️</button>
          <button class="plus" style="width:34px;height:34px" title="Adicionar ao diário" data-add-alim="${idx}">+</button>
        </div>
      </div>
    `;
  }).join('');

  // Delegação index-based (nomes de alimentos podem conter aspas/tags —
  // nunca são interpolados em handlers inline)
  container.querySelectorAll('[data-edit-alim]').forEach(el => {
    el.onclick = () => modalEditarAlimento(+el.getAttribute('data-edit-alim'));
  });
  container.querySelectorAll('[data-add-alim]').forEach(el => {
    el.onclick = () => { const item = userAlims()[+el.getAttribute('data-add-alim')]; if (item) addRef(item.nome); };
  });
}

function modalEditarAlimento(index) {
  const list = userAlims();
  const alim = list[index];
  if (!alim) {
    toast('Alimento não encontrado.');
    return;
  }

  const pVal = alim.proteina_g !== undefined ? alim.proteina_g : (alim.p !== undefined ? alim.p : 0);
  const cVal = alim.carbo_g !== undefined ? alim.carbo_g : (alim.c !== undefined ? alim.c : 0);
  const gVal = alim.gordura_g !== undefined ? alim.gordura_g : (alim.g !== undefined ? alim.g : 0);

  openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <h2 style="margin:0">Editar Alimento</h2>
      <span class="small" style="color:var(--txt-secondary)">Meus Alimentos</span>
    </div>

    <div class="formrow">
      <div style="grid-column:1/-1">
        <label>Nome do alimento</label>
        <input id="editNome" value="${alim.nome.replace(/"/g, '&quot;')}" placeholder="Ex: Tapioca c/ ovo"/>
      </div>
    </div>

    <div class="formrow">
      <div>
        <label>Porção de referência (g)</label>
        <input id="editPorc" type="number" value="${alim.porcao_g || 100}"/>
      </div>
      <div>
        <label>Calorias (kcal)</label>
        <input id="editKcal" type="number" value="${alim.kcal || 0}"/>
      </div>
    </div>

    <div class="formrow three">
      <div>
        <label>Proteína (g)</label>
        <input id="editP" type="number" step="0.1" value="${pVal}"/>
      </div>
      <div>
        <label>Carbo (g)</label>
        <input id="editC" type="number" step="0.1" value="${cVal}"/>
      </div>
      <div>
        <label>Gordura (g)</label>
        <input id="editG" type="number" step="0.1" value="${gVal}"/>
      </div>
    </div>

    <div class="row mt12">
      <button class="bigbtn secondary" style="color:var(--status-danger);border-color:rgba(248,113,113,0.3);flex:0.8" onclick="excluirAlimento(${index})">
        <svg viewBox="0 0 24 24" fill="none" style="width:18px;height:18px">
          <path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M6 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        Excluir
      </button>
      <button class="bigbtn primary" style="flex:1.2" onclick="salvarEdicaoAlimento(${index})">
        Salvar alterações
      </button>
    </div>
  `);
}
window.modalEditarAlimento = modalEditarAlimento;
window.abrirModalEditarAlimento = modalEditarAlimento;

function salvarEdicaoAlimento(index) {
  const list = userAlims();
  if (index < 0 || index >= list.length) return;

  const nome = ($('#editNome').value || '').trim();
  if (!nome) {
    toast('Digite o nome do alimento');
    return;
  }

  const porcao = parseFloat($('#editPorc').value) || 100;
  const kcal = Math.round(parseFloat($('#editKcal').value) || 0);
  const proteina_g = +((parseFloat($('#editP').value) || 0).toFixed(1));
  const carbo_g = +((parseFloat($('#editC').value) || 0).toFixed(1));
  const gordura_g = +((parseFloat($('#editG').value) || 0).toFixed(1));

  if (kcal === 0 && proteina_g === 0 && carbo_g === 0 && gordura_g === 0) {
    toast('Informe os valores nutricionais');
    return;
  }

  const normFactor = porcao > 0 ? (100 / porcao) : 1;
  const updatedAlim = {
    nome,
    porcao_g: porcao,
    kcal,
    proteina_g,
    carbo_g,
    gordura_g,
    p: +((proteina_g * normFactor).toFixed(1)),
    c: +((carbo_g * normFactor).toFixed(1)),
    g: +((gordura_g * normFactor).toFixed(1)),
    custom: true
  };

  list[index] = updatedAlim;
  saveUserAlims(list);
  closeModal();
  toast('Alimento atualizado!');
  filtrarRef();
  renderCustomAlimsList();
}
window.salvarEdicaoAlimento = salvarEdicaoAlimento;

function excluirAlimento(index) {
  const list = userAlims();
  if (index < 0 || index >= list.length) return;

  const removido = list.splice(index, 1)[0];
  saveUserAlims(list);
  closeModal();

  toast(`"${removido.nome}" excluído`, () => {
    const cur = userAlims();
    cur.splice(index, 0, removido);
    saveUserAlims(cur);
    filtrarRef();
    renderCustomAlimsList();
  });

  filtrarRef();
  renderCustomAlimsList();
}
window.excluirAlimento = excluirAlimento;

function filtrarRef() {
  if (!$('#refList')) return;
  const q = ($('#busca').value || '').toLowerCase().trim();
  const customList = userAlims().map((a, idx) => ({ ...a, custom: true, customIndex: idx }));
  const all = [...customList, ...refMap];
  const list = q ? all.filter(a => a.nome.toLowerCase().includes(q)).slice(0, 40) : all.slice(0, 25);

  // Cada linha guarda o índice no array `all`; cliques resolvem o objeto
  // real (nunca o nome) — imune a aspas/tags em nomes.
  $('#refList').innerHTML = list.map((a, i) => {
    const isCust = !!a.custom;
    const p = a.proteina_g !== undefined ? a.proteina_g : (a.p || 0);
    const c = a.carbo_g !== undefined ? a.carbo_g : (a.c || 0);
    const g = a.gordura_g !== undefined ? a.gordura_g : (a.g || 0);
    const porcDesc = isCust && a.porcao_g ? ` (porção de ${a.porcao_g} g)` : ' (por 100 g)';

    return `
      <div class="alim" data-pick-alim="${i}">
        <div class="nm">
          <b style="display:flex;align-items:center;gap:6px">
            ${escapeHtml(a.nome)}
            ${isCust ? '<span style="font-size:10px;background:rgba(255,255,255,0.08);color:#ffffff;border:1px solid var(--border-subtle);padding:1px 6px;border-radius:6px;font-weight:700">MEU</span>' : ''}
          </b>
          <small>${fmt(a.kcal)} kcal · P ${p} · C ${c} · G ${g}${porcDesc}</small>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${isCust ? `<button class="plus" style="width:34px;height:34px;font-size:13px;background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--txt-secondary)" title="Editar" data-edit-alim="${a.customIndex}">✏️</button>` : ''}
          <button class="plus" title="Adicionar ao diário" data-add-alim="${i}">+</button>
        </div>
      </div>`;
  }).join('') || '<div class="empty"><p>Nenhum alimento encontrado.</p></div>';

  window.__alimPickList = all;
  $('#refList').querySelectorAll('[data-pick-alim]').forEach(el => {
    el.onclick = () => { const item = all[+el.getAttribute('data-pick-alim')]; if (item) addRef(item.nome); };
  });
  $('#refList').querySelectorAll('[data-edit-alim]').forEach(el => {
    el.onclick = (ev) => { ev.stopPropagation(); modalEditarAlimento(+el.getAttribute('data-edit-alim')); };
  });
  $('#refList').querySelectorAll('[data-add-alim]').forEach(el => {
    el.onclick = (ev) => {
      ev.stopPropagation();
      const item = all[+el.getAttribute('data-add-alim')];
      if (!item) return;
      if (item.custom) addRef(item.nome);
      else addRef(item.nome);
    };
  });
}
window.filtrarRef = filtrarRef;

function addRef(nome) {
  const a = userAlims().find(x => x.nome === nome) || refMap.find(x => x.nome === nome);
  if (!a) return;
  openModal(`
    <h2>${escapeHtml(a.nome)}</h2>
    <label>Porção (g)</label>
    <input id="pPorc" type="number" value="${a.porcao_g || 100}" oninput="calcPrev()"/>
    <div class="formcard mt12" id="prevBox"></div>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmRef()">Adicionar</button>
    </div>`);
  window.__ref = a;
  calcPrev();
}

window.calcPrev = () => {
  const a = window.__ref;
  if (!a) return;
  const porcao = parseFloat($('#pPorc').value) || 0;
  const b = alimBasis(a);
  const f = b.baseG > 0 ? (porcao / b.baseG) : 0;

  $('#prevBox').innerHTML = `
    <div class="det-item"><span class="d-qty">${porcanoLabel(porcao)}</span><span style="flex:1;color:var(--txt-primary)">Calorias</span><span class="d-kcal">${fmt(b.kcal * f)} kcal</span></div>
    <div class="det-item"><span></span><span style="flex:1;color:var(--txt-secondary)">Proteína</span><span class="d-kcal">${(b.p * f).toFixed(1)} g</span></div>
    <div class="det-item"><span></span><span style="flex:1;color:var(--txt-secondary)">Carboidrato</span><span class="d-kcal">${(b.c * f).toFixed(1)} g</span></div>
    <div class="det-item"><span></span><span style="flex:1;color:var(--txt-secondary)">Gordura</span><span class="d-kcal">${(b.g * f).toFixed(1)} g</span></div>`;
};

function porcanoLabel(g) {
  return g >= 1000 ? (g / 1000).toFixed(1).replace('.', ',') + ' kg' : g + ' g';
}

window.confirmRef = () => {
  const a = window.__ref;
  if (!a) return;
  const porcao = parseFloat($('#pPorc').value) || 0;
  const b = alimBasis(a);
  const f = b.baseG > 0 ? (porcao / b.baseG) : 0;

  const item = {
    nome: a.nome,
    porcao_g: porcao,
    kcal: Math.round(b.kcal * f),
    proteina_g: +(b.p * f).toFixed(1),
    carbo_g: +(b.c * f).toFixed(1),
    gordura_g: +(b.g * f).toFixed(1)
  };

  meals.push({
    id: uid(),
    date: today(),
    hour: horaNow(),
    nome: a.nome,
    itens: [item],
    origem: 'manual'
  });

  save(LS.m, meals);
  closeModal();
  toast('Adicionado!');
  render();
};

window.addRef = addRef;
window.userAlims = userAlims;
window.saveAlim = saveAlim;
window.normalizeAlimEntry = normalizeAlimEntry;
window.alimBasis = alimBasis;
window.updateCustomFood = updateCustomFood;
window.deleteCustomFood = deleteCustomFood;
window.enrichPlanItem = enrichPlanItem;
window.getRefeicaoMacros = getRefeicaoMacros;
window.getDiaMacros = getDiaMacros;
