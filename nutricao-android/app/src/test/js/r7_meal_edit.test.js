'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R7: EDITAR REFEIÇÃO SALVA — MESMO ID, CANCEL SEGURO       ===');
console.log('================================================================\n');

function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(), id: '', attributes: {},
    classList: { _c: new Set(), add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {}, children: [], parentElement: null,
    value: '', textContent: '', _innerHTML: '', onclick: null, listeners: {},
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

function makeCtx(seedMeals) {
  const storage = new Map();
  if (seedMeals) storage.set('nt_meals', JSON.stringify(seedMeals));
  const byId = {};
  ['main', 'modal', 'toast', 'mItensBox', 'mNome', 'mHour', 'mTotal', 'dataHoje']
    .forEach(id => {
      byId[id] = createMockElement(id === 'mNome' || id === 'mHour' ? 'input' : 'div');
      byId[id].value = '';
    });
  // logic.js toast() faz t.querySelector('button') p/ undo
  byId.toast.querySelector = () => ({ onclick: null, classList: { remove() {} } });

  const win = {};
  const ctx = {
    console, Date, Math, JSON, parseFloat, parseInt, isFinite, isNaN,
    String, Array, Object, Number, Boolean,
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
    closeModal() { byId.modal.innerHTML = ''; },
    fmt: n => Math.round(Number(n) || 0).toLocaleString('pt-BR'),
    uid: () => 'new' + Math.floor(Math.random() * 1e6),
    horaNow: () => '13:00',
    render() {},
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    setInterval: () => 1, clearInterval() {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ASSETS, 'apps/nutricao/views/hoje.js'), 'utf8'), ctx); // renderListaMeals
  for (const rel of ['apps/nutricao/estado.js', 'apps/nutricao/logic.js'])
    vm.runInContext(fs.readFileSync(path.join(ASSETS, rel), 'utf8'), ctx);
  vm.runInContext("meals = load(LS.m, []);", ctx);
  vm.runInContext(fs.readFileSync(path.join(ASSETS, 'core/gemini.js'), 'utf8'), ctx);
  for (const k of Object.keys(win)) if (!(k in ctx)) ctx[k] = win[k];
  return {
    ctx, storage, byId,
    draft: () => vm.runInContext('__editMealDraft', ctx)
  };
}

const BASE_MEAL = {
  id: '123',
  date: '2026-08-22',
  hour: '09:30',
  nome: 'Café da manhã',
  origem: 'ia_texto',
  itens: [
    { nome: 'Pão francês', porcao_g: 100, kcal: 300, proteina_g: 9, carbo_g: 59, gordura_g: 3.2 },
    { nome: 'Ovo frito', porcao_g: 50, kcal: 98, proteina_g: 6.8, carbo_g: 0.4, gordura_g: 7.5 }
  ]
};

let passed = 0;

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 1: abrir populado; salvar preserva id e atualiza ---');
{
  const h = makeCtx([JSON.parse(JSON.stringify(BASE_MEAL))]);
  h.ctx.openMealEditor(JSON.parse(JSON.stringify(BASE_MEAL)));

  const modalHtml = h.byId.modal.innerHTML;
  assert(modalHtml.includes('value="Café da manhã"'), 'nome populado');
  assert(modalHtml.includes('value="09:30"'), 'hora populada');
  assert(h.byId.mItensBox.innerHTML.includes('value="Pão francês"'), 'item 1 populado');
  assert(h.byId.mItensBox.innerHTML.includes('value="300"'), 'kcal item populado');

  h.byId.mNome.value = 'Café reforçado';
  h.ctx.updEditMealItem(0, 'kcal', '350');
  h.ctx.confirmEditMeal();

  const stored = JSON.parse(h.storage.get('nt_meals'));
  assert.strictEqual(stored.length, 1, 'nenhuma duplicata criada');
  assert.strictEqual(stored[0].id, '123', 'MESMO id preservado');
  assert.strictEqual(stored[0].nome, 'Café reforçado');
  assert.strictEqual(stored[0].itens[0].kcal, 350);
  assert.strictEqual(stored[0].origem, 'ia_texto', 'origem preservada');
  console.log('✅ id=123 continua id=123 após Salvar.');
  passed += 8;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: cancelar não altera nada ---');
{
  const h = makeCtx([JSON.parse(JSON.stringify(BASE_MEAL))]);
  h.ctx.openMealEditor(JSON.parse(JSON.stringify(BASE_MEAL)));
  h.ctx.updEditMealItem(0, 'kcal', '9999');
  h.byId.mNome.value = 'NUNCA SALVAR';
  h.ctx.cancelEditMeal();
  assert.strictEqual(h.draft(), null, 'draft descartado');
  const stored = JSON.parse(h.storage.get('nt_meals'));
  assert.strictEqual(stored[0].nome, 'Café da manhã', 'nome original intacto');
  assert.strictEqual(stored[0].itens[0].kcal, 300, 'kcal original intacta');
  console.log('✅ Cancel = zero mudança persistente.');
  passed += 4;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: remover/adicionar item; itens sem kcal bloqueiam save ---');
{
  const h = makeCtx([JSON.parse(JSON.stringify(BASE_MEAL))]);
  h.ctx.openMealEditor(JSON.parse(JSON.stringify(BASE_MEAL)));
  h.ctx.rmEditMealItem(1);
  assert.strictEqual(h.draft().itens.length, 1);

  h.ctx.addEditMealItem();
  vm.runInContext("__editMealDraft.itens[1].nome='Banana';__editMealDraft.itens[1].porcao_g=120;__editMealDraft.itens[1].kcal=107;", h.ctx);
  h.ctx.confirmEditMeal();
  let stored = JSON.parse(h.storage.get('nt_meals'));
  assert.strictEqual(stored[0].itens.length, 2);
  assert.strictEqual(stored[0].itens[1].nome, 'Banana');
  assert.strictEqual(stored[0].itens[1].kcal, 107);

  h.ctx.openMealEditor(JSON.parse(JSON.stringify(stored[0])));
  vm.runInContext("__editMealDraft.itens=[{nome:'Ar',porcao_g:1,kcal:0}];", h.ctx);
  h.ctx.confirmEditMeal();
  stored = JSON.parse(h.storage.get('nt_meals'));
  assert.strictEqual(stored[0].itens.length, 2, 'save com itens vazios é bloqueado');
  console.log('✅ add/remove itens + guarda de itens sem kcal.');
  passed += 6;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: card tem affordance de editar e delete segue ok ---');
{
  const h = makeCtx([JSON.parse(JSON.stringify(BASE_MEAL))]);
  const rendered = h.ctx.renderListaMeals(JSON.parse(JSON.stringify([BASE_MEAL])));
  assert(rendered.includes('data-edit-meal='), 'affordance data-edit-meal presente');
  assert(rendered.includes('meal-edit'), 'botão ✎ presente');
  assert(rendered.includes('data-del-meal='), 'delete preservado');
  console.log('✅ Card editável visualmente; delete intacto.');
  passed += 3;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: hostil text permanece escapado no editor ---');
{
  const evil = JSON.parse(JSON.stringify(BASE_MEAL));
  evil.nome = '<img src=x onerror=p>';
  evil.itens[0].nome = '<svg onload=x>';
  const h = makeCtx([evil]);
  h.ctx.openMealEditor(evil);
  const modal = h.byId.modal.innerHTML + h.byId.mItensBox.innerHTML;
  assert(!modal.includes('<img src=x'), 'payload não vira tag real');
  assert(modal.includes('&lt;img src=x'), 'nome escapado no value do input');
  assert(modal.includes('&lt;svg onload=x'), 'item hostil também escapado');
  console.log('✅ escaping mantido no editor.');
  passed += 3;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 6: refeição legada sem macros abre e salva normalizada ---');
{
  const legacy = { id: 'leg', date: '2026-08-22', hour: '20:00', nome: 'Antiga', origem: 'manual', itens: [{ nome: 'Pao', kcal: 150 }] };
  const h = makeCtx([legacy]);
  h.ctx.openMealEditor(legacy);
  h.ctx.updEditMealItem(0, 'porcao_g', '100');
  h.ctx.confirmEditMeal();
  const stored = JSON.parse(h.storage.get('nt_meals'))[0];
  assert.strictEqual(stored.id, 'leg');
  assert.strictEqual(stored.itens[0].kcal, 150);
  assert.strictEqual(stored.itens[0].porcao_g, 100);
  assert.strictEqual(stored.itens[0].proteina_g, 0, 'macros ausentes viram 0, não NaN');
  console.log('✅ legado sem campos abre/salva sem NaN.');
  passed += 4;
}

console.log('\n================================================================');
if (passed >= 28) {
  console.log(`ALL ${passed} MEAL-EDIT TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`Expected >= 28 markers, got ${passed}`);
  process.exit(1);
}
