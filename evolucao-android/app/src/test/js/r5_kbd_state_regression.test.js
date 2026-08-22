'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R5: REGRESSÃO — VAZAMENTO DE RIR E LIMPEZA DE PARCIAIS   ===');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// MOCK DOM (mesmo padrão dos demais testes do projeto)
// -----------------------------------------------------------------------------
function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(),
    id: '',
    attributes: {},
    classList: {
      _classes: new Set(),
      add(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
      toggle(c, force) {
        if (force === true) { this._classes.add(c); return true; }
        if (force === false) { this._classes.delete(c); return false; }
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        this._classes.add(c); return true;
      },
      contains(c) { return this._classes.has(c); }
    },
    style: {}, children: [], parentElement: null,
    value: '', textContent: '', _innerHTML: '', onclick: null, listeners: {},
    addEventListener() {}, removeEventListener() {},
    setAttribute(name, val) { this.attributes[name] = String(val); },
    getAttribute(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; },
    removeAttribute(name) { delete this.attributes[name]; },
    hasAttribute(name) { return this.attributes[name] !== undefined; },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    scrollIntoView() {}, focus() {},
    click() { if (typeof this.onclick === 'function') this.onclick({ currentTarget: this, target: this }); },
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get() { return this._innerHTML; },
    set(val) { this._innerHTML = val; this.children = []; }
  });
  return el;
}

function parseHTMLToDOM(htmlString) {
  const nodes = [];
  const openTagRegex = /<([a-zA-Z0-9_-]+)(\s+[^>]*)?>/g;
  let m;
  while ((m = openTagRegex.exec(htmlString)) !== null) {
    const node = createMockElement(m[1]);
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
    let am;
    while ((am = attrRegex.exec(m[2] || '')) !== null) {
      node.setAttribute(am[1], am[2] !== undefined ? am[2] : '');
      if (am[1] === 'class') String(am[2]).split(/\s+/).filter(Boolean).forEach(c => node.classList.add(c));
      if (am[1] === 'id') node.id = am[2];
    }
    nodes.push(node);
  }
  return nodes;
}

const ASSETS = path.resolve(__dirname, '../../main/assets');

function makeSandbox() {
  const storage = {};
  const localStorageMock = {
    getItem: k => (storage[k] !== undefined ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  };

  const appDiv = createMockElement('div'); appDiv.setAttribute('id', 'app');
  const toastDiv = createMockElement('div'); toastDiv.setAttribute('id', 'toast');
  const dlgBoxDiv = createMockElement('div'); dlgBoxDiv.setAttribute('id', 'dlg');
  let domNodes = [];
  const toasts = [];

  const docMock = {
    body: createMockElement('body'),
    getElementById(id) {
      if (id === 'app') return appDiv;
      if (id === 'toast') return toastDiv;
      if (id === 'dlg') return dlgBoxDiv;
      return domNodes.find(n => n.id === id) || createMockElement('div');
    },
    querySelector(sel) { return docMock.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      if (!sel) return [];
      if (sel.startsWith('#')) return domNodes.filter(n => n.id === sel.slice(1));
      if (sel.startsWith('.')) {
        const cls = sel.slice(1).split('.')[0];
        return domNodes.filter(n => n.classList.contains(cls));
      }
      if (sel.startsWith('[')) {
        const m = sel.slice(1, -1).match(/([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?/);
        if (!m) return [];
        const [, attr, val] = m;
        return domNodes.filter(n => (val !== undefined && val !== '') ? n.getAttribute(attr) === val : n.hasAttribute(attr));
      }
      return [];
    },
    createElement: t => createMockElement(t),
    addEventListener() {}
  };

  const sandbox = {
    console, Date, Math, JSON, parseFloat, parseInt, isFinite, isNaN,
    String, Array, Object, Number, Set,
    setTimeout: fn => { fn(); return 1; }, clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
    localStorage: localStorageMock,
    document: docMock,
    window: {
      addEventListener() {}, removeEventListener() {}, scrollTo() {},
      AndroidBridge: {
        vibrate() {}, startRestNotification() {}, stopRestNotification() {}, restDoneNotification() {}
      }
    },
    toast: msg => toasts.push(msg),
    dlg(cfg) { if (cfg && typeof cfg.onOk === 'function') cfg.onOk(cfg.segVal || true); },
    render() {
      domNodes = parseHTMLToDOM(sandbox.renderTreino());
      sandbox.bindTreino();
    },
    getToasts: () => toasts,
    mockStorage: storage
  };
  vm.createContext(sandbox);

  const load = rel => vm.runInContext(fs.readFileSync(path.join(ASSETS, rel), 'utf8'), sandbox);
  // Mesma ordem do index.html
  load('kernel/fmt.js');
  load('kernel/icons.js');
  load('kernel/charts.js');
  load('kernel/ui.js');
  load('kernel/notif.js');
  load('core/progressao.js');
  load('apps/evolucao/dados.js');
  load('kernel/db.js');
  load('apps/evolucao/logic.js');
  load('apps/evolucao/body-visualizer.js');
  load('apps/evolucao/views/treino.js');
  return sandbox;
}

function clickNode(sb, selector, label) {
  const nodes = sb.document.querySelectorAll(selector);
  const node = nodes[0];
  assert(node, `não encontrou nó para ${label}: ${selector}`);
  node.click();
  return node;
}

function freshDraft(sb) {
  sb.state.draft = {
    day: 'A', date: sb.todayISO(), entries: {}, warmupMode: {},
    startedAt: null, sessionMode: 'normal', unilateralPending: null
  };
  sb.mfEx = 0;
  sb.kbdReset();
  sb.render();
}

let passed = 0;

// =============================================================================
console.log('--- SUITE 1: RIR selecionado não vaza após fechar o teclado ---');
{
  const sb = makeSandbox();
  freshDraft(sb);
  const exName = sb.state.ficha.A.ex[0].n;

  // 1) Abre o teclado na série nova (linha phantom row 0)
  clickNode(sb, '[data-cell="w"][data-row="0"]', 'célula de carga da série 0');
  assert(sb.kbdOpen === true, 'teclado aberto');

  // 2) Seleciona RIR manual 5 no teclado aberto
  clickNode(sb, '[data-rirsel="5"]', 'círculo de RIR 5');
  assert.strictEqual(sb.kbdRir, 5, 'RIR 5 registrado no buffer enquanto edita');

  // 3) Fecha com ✕ SEM confirmar a série
  clickNode(sb, '#mfKbdClose', 'botão fechar teclado');
  assert.strictEqual(sb.kbdRir, null,
    'BUG ANTIGO: fechar com ✕ deixava kbdRir=5 e ele vazava para outra série');

  // 4) Conclui OUTRA série (row 0 continua phantom): deve usar o RIR alvo default
  clickNode(sb, '[data-done="0:0"]', 'checkmark da série 0');
  const entries = sb.state.draft.entries[exName];
  assert(Array.isArray(entries) && entries.length === 1, 'série confirmada foi registrada');
  const target = sb.defaultRirFor(exName);
  assert.strictEqual(entries[0].rir, target,
    `série B deve usar o RIR alvo (${target}), não o valor stale`);
  assert.strictEqual(entries[0].rirManual, false, 'RIR aplicado por alvo, não manual');
  console.log(`✅ Série recebeu rir=${entries[0].rir} (alvo), rirManual=${entries[0].rirManual}`);
  passed += 5;

  // -----------------------------------------------------------------------------
  console.log('\n--- SUITE 1b: RIR escolhido DENTRO da edição ainda grava na série ---');
  {
    const sb2 = makeSandbox();
    freshDraft(sb2);
    const ex2 = sb2.state.ficha.A.ex[0].n;
    clickNode(sb2, '[data-cell="w"][data-row="0"]', 'abre teclado série nova');
    // fluxo real: carga → reps → RIR por último (⇄ para reps zera o RIR escolhido antes)
    ['5', '0'].forEach(k => clickNode(sb2, `[data-key="${k}"]`, `dígito ${k}`));
    clickNode(sb2, '[data-key="⇆"]', 'alterna para reps');
    ['8'].forEach(k => clickNode(sb2, `[data-key="${k}"]`, 'dígito reps'));
    clickNode(sb2, '[data-rirsel="4"]', 'seleciona RIR 4 durante edição');
    assert.strictEqual(sb2.kbdRir, 4, 'buffer mantém RIR 4 com teclado aberto');
    clickNode(sb2, '[data-key="✓"]', 'confirma série pelo ✓ do teclado');
    const saved = sb2.state.draft.entries[ex2][0];
    assert.strictEqual(saved.rir, 4, 'comportamento original preservado: RIR 4 gravado');
    assert.strictEqual(saved.rirManual, true, 'marcado como manual');
    console.log('✅ RIR manual dentro da edição continua sendo aplicado à própria série.');
    passed += 2;
  }
}

// =============================================================================
console.log('\n--- SUITE 2: zerar parciais ao editar remove p do registro ---');
{
  const sb = makeSandbox();
  freshDraft(sb);
  const exName = sb.state.ficha.A.ex[0].n;

  // Entrada real existente com parciais p=3
  sb.state.draft.entries[exName] = [{ w: 50, r: 10, p: 3, done: true, rir: 2 }];
  sb.render();

  // Abre editor da linha real 0
  clickNode(sb, '[data-cell="w"][data-row="0"]', 'célula carga da série real');
  const row = sb.mfSetRows(exName)[0];
  assert(row && !row.phantom && row.__entryIndex === 0, 'editando a entrada real');

  // Entra no modo P (carrega '3' da série) e apaga com ⌫ até 0
  clickNode(sb, '[data-key="P"]', 'tecla P');
  assert.strictEqual(sb.kbdP, '3', 'P carrega parciais existentes');
  for (let i = 0; i < 3; i++) clickNode(sb, '[data-key="⌫"]', 'backspace parcial');
  assert.strictEqual(sb.kbdP, '0', 'parciais zeradas no buffer');

  // Volta ao modo carga (o app bloqueia ✓ em modo P com "0" — comportamento
  // intencional para séries novas) e confirma com ✓
  clickNode(sb, '[data-key="⇆"]', 'volta ao modo carga');
  clickNode(sb, '[data-key="✓"]', 'confirmar edição');
  const entry = sb.state.draft.entries[exName][0];
  assert.strictEqual(entry.p, undefined,
    'BUG ANTIGO: mfGetBufferValues restaurava p=3 antigo quando buffer era "0"');
  assert.strictEqual(entry.w, 50, 'carga preservada');
  assert.strictEqual(entry.r, 10, 'reps preservadas');
  console.log(`✅ Parciais removidas (p=${entry.p}); w/r intactos (${entry.w}×${entry.r}).`);
  passed += 6;

  // -----------------------------------------------------------------------------
  console.log('\n--- SUITE 2b: editar sem tocar em P preserva as parciais antigas ---');
  {
    const sb2 = makeSandbox();
    freshDraft(sb2);
    const ex2 = sb2.state.ficha.A.ex[0].n;
    sb2.state.draft.entries[ex2] = [{ w: 50, r: 10, p: 3, done: true, rir: 2 }];
    sb2.render();
    clickNode(sb2, '[data-cell="w"][data-row="0"]', 'abre editor');
    clickNode(sb2, '[data-key="7"]', 'digita novo dígito na carga'); // força buffer
    clickNode(sb2, '[data-key="✓"]', 'confirma');
    const entry2 = sb2.state.draft.entries[ex2][0];
    assert.strictEqual(entry2.p, 3, 'parciais preservadas quando P não foi tocado');
    console.log('✅ Edição sem tocar P mantém p=3 (compatibilidade).');
    passed += 1;
  }
}

  // -----------------------------------------------------------------------------
  console.log('\n--- SUITE 3: atribuição programática do buffer (contrato r4 T3.3) ---');
  {
    const sb3 = makeSandbox();
    freshDraft(sb3);
    const ex3 = sb3.state.ficha.A.ex[0].n;
    sb3.kbdOpenFor('w', 0);
    sb3.kbdW = '80';
    sb3.kbdR = '10';
    sb3.kbdP = '3'; // sem tocar na tecla P: sentinela null é sobrescrita
    sb3.kbdCommit();
    const setObj = sb3.state.draft.entries[ex3][0];
    assert.strictEqual(setObj.p, 3, 'kbdP atribuído diretamente deve ser respeitado (r4 Test 3.3)');
    assert.strictEqual(setObj.w, 80);
    console.log('✅ Contrato programático do buffer preservado.');
    passed += 2;
  }

  console.log('\n================================================================');
if (passed >= 14) {
  console.log(`🎉 ALL ${passed} KEYPAD STATE TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`❌ Expected >= 14 assertions-passed markers, got ${passed}`);
  process.exit(1);
}
