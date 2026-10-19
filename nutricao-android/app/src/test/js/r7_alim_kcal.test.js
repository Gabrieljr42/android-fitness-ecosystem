'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R7: BASE CANÔNICA DE KCAL — LISTA == TOQUE, SEM ESCALA 2x ===');
console.log('================================================================\n');

function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(), id: '', attributes: {},
    classList: { _c: new Set(), add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {}, children: [], parentElement: null,
    value: '', textContent: '', _innerHTML: '', onclick: null,
    addEventListener() {}, removeEventListener() {},
    setAttribute(n, v) { this.attributes[n] = String(v); },
    getAttribute(n) { return this.attributes[n] !== undefined ? this.attributes[n] : null; },
    hasAttribute(n) { return this.attributes[n] !== undefined; },
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
    scrollIntoView() {}, focus() {},
    click() { if (typeof this.onclick === 'function') this.onclick({ target: this }); },
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get() { return this._innerHTML; },
    set(v) { this._innerHTML = v; this.children = []; }
  });
  return el;
}

const ASSETS = path.resolve(__dirname, '../../main/assets');
const NUTRI = path.join(ASSETS, 'apps/nutricao');

function makeCtx(seedAlims) {
  const storage = new Map();
  if (seedAlims) storage.set('nt_alims', JSON.stringify(seedAlims));
  const byId = {};
  ['modal','toast','prevBox', 'pPorc', 'refList', 'busca', 'myAlimsList', 'fItens', 'fNome', 'fTotal']
    .forEach(id => { byId[id] = createMockElement('div'); byId[id].value = ''; });
  byId.pPorc.value = '100';
  const win = {};
  const ctx = {
    console, Date, Math, JSON, parseFloat, parseInt, isFinite, isNaN,
    String, Array, Object, Number, Boolean, RegExp,
    localStorage: {
      getItem: k => storage.has(k) ? storage.get(k) : null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
      clear: () => storage.clear()
    },
    document: {
      querySelector: sel => (typeof sel === 'string' && sel.startsWith('#')) ? (byId[sel.slice(1)] || null) : null,
      querySelectorAll: () => [],
      getElementById: id => byId[id] || null,
      createElement: t => createMockElement(t),
      addEventListener() {}, body: createMockElement('body')
    },
    window: win,
    $: sel => (typeof sel === 'string' && sel.startsWith('#')) ? (byId[sel.slice(1)] || null) : null,
    $$: () => [],
    openModal(html) { byId.modal.innerHTML = html; },
    closeModal() {},
    fmt: n => Math.round(Number(n) || 0).toLocaleString('pt-BR'),
    toast() {}, // sobrescrita abaixo apos logic.js (usa #toast)
    __noop: 0, uid: () => 'uid', horaNow: () => '12:00', today: () => '2026-08-22',
    render() {},
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {}
  };
  vm.createContext(ctx);
  const load = rel => vm.runInContext(fs.readFileSync(path.join(ASSETS, rel), 'utf8'), ctx);
  load('apps/nutricao/estado.js');
  load('apps/nutricao/logic.js');
  load('apps/nutricao/referencia.js');
  load('apps/nutricao/views/alimentos.js');
  for (const k of Object.keys(win)) if (!(k in ctx)) ctx[k] = win[k];
  return { ctx, storage, byId };
}

let passed = 0;

// O primeiro resultado filtrado deve abrir o alimento exibido, mesmo com salvos antes do catálogo.
{
  const h = makeCtx([{nome:'Meu café',porcao_g:100,kcal:80,custom:true}]);
  const row = createMockElement();
  row.setAttribute('data-pick-alim','0');
  const add = createMockElement('button');
  add.setAttribute('data-add-alim','0');
  h.byId.refList.querySelectorAll = selector => selector === '[data-pick-alim]' ? [row] : selector === '[data-add-alim]' ? [add] : [];
  h.byId.busca.value = 'Frango grelhado';
  h.ctx.filtrarRef();
  row.click();
  assert(h.byId.modal.innerHTML.includes('<h2>Frango grelhado (peito)</h2>'));
  h.byId.modal.innerHTML = '';
  add.onclick({stopPropagation(){}});
  assert(h.byId.modal.innerHTML.includes('<h2>Frango grelhado (peito)</h2>'));
  passed += 2;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 1: alimento salvo por IA (sem custom) — sem inflação ---');
{
  // Forma EXATA gravada por salvarFotoAlimento/salvarTextoAlimento:
  // kcal/macros = totais da porção salva; sem custom, sem p/c/g.
  const h = makeCtx([{
    nome: 'Duas laranjas pera rio',
    porcao_g: 260,
    kcal: 122,
    proteina_g: 2,
    carbo_g: 28,
    gordura_g: 0,
    tipo: 'refeicao_texto'
  }]);

  const list = h.ctx.userAlims();
  assert.strictEqual(list[0].custom, true, 'normalização estampa custom:true');
  assert.strictEqual(list[0].porcao_g, 260);

  // Valor da LISTA (renderCustomAlimsList usa a.kcal cru) deve == valor do MODAL
  h.ctx.renderCustomAlimsList();
  const listHtml = h.byId.myAlimsList.innerHTML;
  assert(listHtml.includes('>122<') || listHtml.includes('122 kcal'), 'lista mostra 122 kcal');

  h.ctx.addRef('Duas laranjas pera rio');
  assert(h.byId.modal.innerHTML.includes('value="260"'), 'modal abre com a porção salva (value=260)');
  h.byId.pPorc.value = '260'; // navegador popula o input ao renderizar
  h.ctx.calcPrev();
  const prev = h.byId.prevBox.innerHTML;
  assert(prev.includes('122 kcal'), 'preview com quantidade default = 122 kcal (obtido: ' + (prev.match(/[\d.]+ kcal/) || ['?'])[0] + ')');

  // Mudar 260 → 130 g: exatamente 61 kcal (uma única escala)
  h.byId.pPorc.value = '130';
  h.ctx.calcPrev();
  assert(h.byId.prevBox.innerHTML.includes('61 kcal'), '130 g → 61 kcal');

  // confirmRef grava a refeição escalada UMA vez
  h.byId.pPorc.value = '130';
  h.ctx.confirmRef();
  const meal = h.ctx.dayMeals()[0];
  assert.strictEqual(meal.kcal, undefined); // kcal vive em itens
  assert.strictEqual(meal.itens[0].kcal, 61, 'item confirmado com 61 kcal');
  assert.strictEqual(meal.itens[0].porcao_g, 130);
  assert.strictEqual(meal.itens[0].carbo_g, 14, 'macros escalados na mesma base (28→14)');
  console.log('✅ IA food 260g/122kcal: lista==modal==122; 130g→61 exatamente uma vez.');
  passed += 7;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: edições repetidas NÃO compõem escala ---');
{
  const h = makeCtx([{ nome: 'Whey', porcao_g: 30, kcal: 120, proteina_g: 24, custom: true }]);
  h.ctx.addRef('Whey');
  // usuário digita 30 → 60 → 30 → 60 (só o valor atual importa)
  const seq = ['30', '60', '30', '60'];
  const outs = seq.map(g => {
    h.byId.pPorc.value = g;
    h.ctx.calcPrev();
    const m = h.byId.prevBox.innerHTML.match(/([\d.]+) kcal/);
    return Number(m[1]);
  });
  assert.deepStrictEqual(outs, [120, 240, 120, 240], 'sem deriva cumulativa: ' + outs.join(','));
  console.log('✅ Reabrir/editar repetidamente não reescala.');
  passed += 2;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: matriz de formas (<100g, >100g, decimal, manual, legado) ---');
{
  // <100 g
  let h = makeCtx([{ nome: 'Doce', porcao_g: 40, kcal: 150, custom: true }]);
  h.ctx.addRef('Doce'); h.byId.pPorc.value = '80'; h.ctx.calcPrev();
  assert(h.byId.prevBox.innerHTML.includes('300 kcal'), '40g→150 ⇒ 80g→300');

  // decimal grams
  h = makeCtx([{ nome: 'Manteiga', porcao_g: 12.5, kcal: 90, custom: true }]);
  h.ctx.addRef('Manteiga'); h.byId.pPorc.value = '25'; h.ctx.calcPrev();
  assert(h.byId.prevBox.innerHTML.includes('180 kcal'), '12.5g→90 ⇒ 25g→180');

  // manual (grava p/c/g per-100g + proteina_g per-portion): base = portion
  h = makeCtx([{
    nome: 'Mix', porcao_g: 50, kcal: 200,
    proteina_g: 10, carbo_g: 20, gordura_g: 8,
    p: 20, c: 40, g: 16, custom: true
  }]);
  h.ctx.addRef('Mix'); h.byId.pPorc.value = '100'; h.ctx.calcPrev();
  assert(h.byId.prevBox.innerHTML.includes('400 kcal'), 'manual 50g→200 ⇒ 100g→400');
  assert(h.byId.prevBox.innerHTML.includes('20.0 g'), 'P per-portion 10 ⇒ 20');

  // legado sem porcao_g (backup antigo): assume base 100 g
  h = makeCtx([{ nome: 'Whey Isolado', kcal: 120, custom: true }]);
  const norm = h.ctx.userAlims()[0];
  assert.strictEqual(norm.porcao_g, 100, 'porcao_g default 100 no legado');
  h.ctx.addRef('Whey Isolado');
  assert.strictEqual(h.byId.pPorc.value, '100');
  h.ctx.calcPrev();
  assert(h.byId.prevBox.innerHTML.includes('120 kcal'), 'legado 100g→120 ⇒ 100g→120');
  console.log('✅ <100g, >100g, decimal, manual dual-field e legado consistentes.');
  passed += 6;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: referência (refMap) permanece por 100 g ---');
{
  const h = makeCtx([]);
  h.ctx.addRef('Frango grelhado (peito)'); // 165 kcal / 100g na referência
  assert.strictEqual(h.byId.pPorc.value, '100');
  h.ctx.calcPrev();
  assert(h.byId.prevBox.innerHTML.includes('165 kcal'), '100 g → 165');
  h.byId.pPorc.value = '150'; h.ctx.calcPrev();
  assert(h.byId.prevBox.innerHTML.includes('248 kcal'), '150 g → 247.5 ⇒ 248');
  console.log('✅ Base de referência intocada.');
  passed += 3;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: enrichPlanItem usa a base correta p/ custom ---');
{
  const h = makeCtx([{
    nome: 'Frango caseiro', porcao_g: 200, kcal: 440,
    proteina_g: 62, carbo_g: 0, gordura_g: 14, custom: true
  }]);
  const out = h.ctx.enrichPlanItem({ nome: 'Frango caseiro', porcao_g: 100 });
  assert.strictEqual(out.kcal, 220, '100 g da porção de 200 g ⇒ metade de 440 (não 2×)');
  assert.strictEqual(out.proteina_g, 31);
  // item já completo não é reescalonado
  const full = h.ctx.enrichPlanItem({ nome: 'X', porcao_g: 100, kcal: 10, proteina_g: 1, carbo_g: 2, gordura_g: 3 });
  assert.strictEqual(full.kcal, 10);
  console.log('✅ Plano semanal herda a mesma base.');
  passed += 3;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 6: consistência lista → default (invariante do bug) ---');
{
  const shapes = [
    { nome: 'A', porcao_g: 260, kcal: 122, tipo: 'refeicao_texto' },           // IA
    { nome: 'B', porcao_g: 90, kcal: 300, custom: true },                       // manual
    { nome: 'C', kcal: 80 }                                                     // legado
  ];
  for (const shape of shapes) {
    const h = makeCtx([shape]);
    h.ctx.renderCustomAlimsList();
    const listKcal = (h.byId.myAlimsList.innerHTML.match(/(\d+) kcal/) || [])[1];
    h.ctx.addRef(shape.nome);
    const vM = h.byId.modal.innerHTML.match(/id="pPorc"[^>]*value="([\d.]+)"/);
    const defaultG = vM ? Number(vM[1]) : 100;
    h.byId.pPorc.value = String(defaultG); // navegador popula o input
    h.ctx.calcPrev();
    const prevKcal = Number((h.byId.prevBox.innerHTML.match(/(\d+) kcal/) || [])[1]);
    assert.strictEqual(prevKcal, Number(listKcal),
      `${shape.nome}: lista ${listKcal} kcal ≠ modal ${prevKcal} kcal @ ${defaultG} g`);
  }
  console.log('✅ Invariante global: displayed list value == default selected value.');
  passed += 3;
}

console.log('\n================================================================');
if (passed >= 24) {
  console.log(`ALL ${passed} ALIM-KCAL TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`Expected >= 24 markers, got ${passed}`);
  process.exit(1);
}
