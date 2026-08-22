'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R6 NT: UI DO RESULTADO DA IA — ITENS ROTULADOS            ===');
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

function makeCtx() {
  const byId = {};
  ['itensBox', 'itensBoxTexto', 'cP', 'cC', 'cG', 'cPT', 'cCT', 'cGT', 'cTotal', 'cTotalTexto']
    .forEach(id => { byId[id] = createMockElement(id === 'cTotal' || id === 'cTotalTexto' ? 'span' : 'div'); byId[id].value = ''; });
  const ctx = {
    console, Date, Math, JSON, parseFloat, parseInt, isFinite, isNaN,
    String, Array, Object, Number, Boolean,
    document: {
      getElementById: id => byId[id] || null,
      querySelector: sel => (typeof sel === 'string' && sel.startsWith('#')) ? (byId[sel.slice(1)] || null) : null,
      querySelectorAll: () => [],
      createElement: t => createMockElement(t),
      addEventListener() {}, body: createMockElement('body')
    },
    window: { addEventListener() {} },
    // helpers normalmente vindos de estado.js/logic.js
    $: sel => (typeof sel === 'string' && sel.startsWith('#')) ? (byId[sel.slice(1)] || null) : null,
    $$: () => [],
    fmt: n => Math.round(Number(n) || 0).toLocaleString('pt-BR'),
    toast() {},
    uid: () => 'test',
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ASSETS, 'core/gemini.js'), 'utf8'), ctx);
  for (const k of Object.keys(ctx.window)) if (!(k in ctx)) ctx[k] = ctx.window[k];
  return { ctx, byId };
}

let passed = 0;

// -----------------------------------------------------------------------------
console.log('--- SUITE 1: item com nome/quantidade/kcal rotulados ---');
{
  const h = makeCtx();
  h.ctx.window.__fotoItens = [{
    nome: 'Laranja pera rio',
    porcao_g: 260,
    kcal: 122,
    proteina_g: 2,
    carbo_g: 28,
    gordura_g: 0
  }];
  h.byId.cP.value = '2'; h.byId.cC.value = '28'; h.byId.cG.value = '0';
  h.ctx.renderFotoItens();
  const html = h.byId.itensBox.innerHTML;

  // Nome em linha própria e legível
  assert(html.includes('value="Laranja pera rio"'), 'nome do alimento presente');
  assert(html.includes('font-weight:700'), 'nome destacado visualmente');
  // Rótulos explícitos
  assert(/<label[^>]*>\s*Qtd\s*<\/label>/.test(html), 'rótulo "Qtd" para a quantidade');
  assert(html.includes('>g<'), 'unidade "g" junto à quantidade');
  assert(/<label[^>]*>\s*kcal\s*<\/label>/.test(html), 'rótulo "kcal" explícito');
  assert(html.includes('value="260"'), 'porcao_g preservado (260)');
  assert(html.includes('value="122"'), 'kcal preservado (122)');
  // Cabeçalho orientativo
  assert(html.includes('Itens identificados'), 'cabeçalho contextual dos itens');
  console.log('OK foto: "260 g 122" agora é Qtd [260] g · kcal [122].');
  passed += 7;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: fluxo de texto usa o mesmo builder ---');
{
  const h = makeCtx();
  h.ctx.window.__textoItens = [{ nome: 'Duas laranjas pera rio', porcao_g: 260, kcal: 122 }];
  h.ctx.renderTextoItens();
  const html = h.byId.itensBoxTexto.innerHTML;
  assert(html.includes('Duas laranjas pera rio'), 'nome presente');
  assert(/<label[^>]*>\s*Qtd\s*<\/label>/.test(html), 'Qtd rotulado no texto-IA também');
  assert(/<label[^>]*>\s*kcal\s*<\/label>/.test(html), 'kcal rotulado no texto-IA também');
  assert(!html.includes('flex:1.5'), 'layout antigo (nome espremido) removido');
  console.log('OK texto: mesmo layout rotulado.');
  passed += 4;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: escape do nome mantido na nova marcação ---');
{
  const h = makeCtx();
  h.ctx.window.__fotoItens = [{ nome: '<img src=x onerror="p">', porcao_g: 100, kcal: 50 }];
  h.ctx.renderFotoItens();
  const html = h.byId.itensBox.innerHTML;
  assert(!html.includes('<img src=x'), 'payload não vira tag real');
  assert(html.includes('&lt;img src=x'), 'nome escapado como texto');
  console.log('OK escaping preservado.');
  passed += 2;
}

console.log('\n================================================================');
if (passed >= 13) {
  console.log(`ALL ${passed} AI-ITEM-UI TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`Expected >= 13 markers, got ${passed}`);
  process.exit(1);
}
