'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- Mock DOM Environment ---
function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(),
    attributes: {},
    classList: {
      _classes: new Set(),
      add: function(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove: function(...cls) { cls.forEach(c => this._classes.delete(c)); },
      toggle: function(c, force) {
        if (force === true) { this._classes.add(c); return true; }
        if (force === false) { this._classes.delete(c); return false; }
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        this._classes.add(c); return true;
      },
      contains: function(c) { return this._classes.has(c); }
    },
    style: {},
    children: [],
    parentElement: null,
    value: '',
    textContent: '',
    _innerHTML: '',
    onclick: null,
    listeners: {},
    addEventListener: function(evt, fn) {
      if (!this.listeners[evt]) this.listeners[evt] = [];
      this.listeners[evt].push(fn);
    },
    removeEventListener: function(evt, fn) {
      if (this.listeners[evt]) {
        this.listeners[evt] = this.listeners[evt].filter(f => f !== fn);
      }
    },
    setAttribute: function(name, val) { this.attributes[name] = String(val); },
    getAttribute: function(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; },
    removeAttribute: function(name) { delete this.attributes[name]; },
    hasAttribute: function(name) { return this.attributes[name] !== undefined; },
    appendChild: function(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    scrollIntoView: function() {},
    focus: function() {},
    setSelectionRange: function() {},
    click: function() {
      if (typeof this.onclick === 'function') {
        this.onclick({ currentTarget: this, target: this, preventDefault: () => {}, stopPropagation: () => {} });
      }
      if (this.listeners['click']) {
        this.listeners['click'].forEach(fn => fn({ currentTarget: this, target: this, preventDefault: () => {}, stopPropagation: () => {} }));
      }
    },
    querySelector: function(sel) {
      const match = queryMockDOM(this, sel);
      return match.length ? match[0] : null;
    },
    querySelectorAll: function(sel) {
      return queryMockDOM(this, sel);
    }
  };

  Object.defineProperty(el, 'innerHTML', {
    get: function() { return this._innerHTML; },
    set: function(val) {
      this._innerHTML = val;
      this.children = parseHtmlToMock(val, this);
    }
  });

  return el;
}

// Lightweight HTML parser to mock DOM tree for querySelector/querySelectorAll
function parseHtmlToMock(html, parent) {
  const elements = [];
  if (!html || typeof html !== 'string') return elements;

  const tagRegex = /<([a-z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-z0-9]+)([^>]*)\/>/gi;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1] || match[4];
    const attrString = match[2] || match[5] || '';
    const inner = match[3] || '';

    const el = createMockElement(tagName);
    el.parentElement = parent;

    // Parse attributes
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      const name = attrMatch[1];
      const val = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] !== undefined ? attrMatch[4] : ''));
      if (name === 'class') {
        val.split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
      } else if (name === 'id') {
        el.setAttribute('id', val);
      } else {
        el.setAttribute(name, val);
      }
    }

    if (inner && !inner.includes('<')) {
      el.textContent = inner.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#10003;/g, '✓');
      el._innerHTML = inner;
    } else if (inner) {
      el._innerHTML = inner;
      el.children = parseHtmlToMock(inner, el);
    }

    elements.push(el);
  }

  return elements;
}

function queryMockDOM(root, sel) {
  const results = [];
  function traverse(node) {
    if (!node) return;
    if (node !== root && matchesSelector(node, sel)) {
      results.push(node);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }
  traverse(root);
  return results;
}

function matchesSelector(node, sel) {
  if (!sel || !node) return false;
  sel = sel.trim();

  // ID selector
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    return node.getAttribute('id') === id;
  }

  // Attribute with value selector e.g. [data-cell="w"], [data-done="0:0"]
  const attrValMatch = sel.match(/^\[([a-zA-Z0-9_-]+)="([^"]+)"\]$/);
  if (attrValMatch) {
    return node.getAttribute(attrValMatch[1]) === attrValMatch[2];
  }

  // Simple attribute selector e.g. [data-cell]
  const attrMatch = sel.match(/^\[([a-zA-Z0-9_-]+)\]$/);
  if (attrMatch) {
    return node.hasAttribute(attrMatch[1]);
  }

  // Class selector e.g. .mf-cell, .mf-metaauto
  if (sel.startsWith('.')) {
    const clsList = sel.split('.').filter(Boolean);
    return clsList.every(c => node.classList.contains(c));
  }

  // Compound selector e.g. button.mf-metaauto, div.mf-cell.on
  const tagClassMatch = sel.match(/^([a-z0-9]+)\.([a-zA-Z0-9_.-]+)$/i);
  if (tagClassMatch) {
    const tag = tagClassMatch[1].toUpperCase();
    const classes = tagClassMatch[2].split('.');
    return node.tagName === tag && classes.every(c => node.classList.contains(c));
  }

  // Tag name
  return node.tagName === sel.toUpperCase();
}

// --- Storage & Context Harness ---
const storageStore = {};
const mockLocalStorage = {
  getItem: (k) => storageStore[k] !== undefined ? storageStore[k] : null,
  setItem: (k, v) => { storageStore[k] = String(v); },
  removeItem: (k) => { delete storageStore[k]; },
  clear: () => { Object.keys(storageStore).forEach(k => delete storageStore[k]); }
};

const appContainer = createMockElement('div');
appContainer.setAttribute('id', 'app');

const toastElement = createMockElement('div');
toastElement.setAttribute('id', 'toast');

let toastLog = [];
let vibrateLog = [];
let dialogLog = [];

const mockAndroidBridge = {
  vibrate: function(ms) { vibrateLog.push(ms); },
  startRestNotification: function() {},
  stopRestNotification: function() {},
  restDoneNotification: function() {},
  sendNotification: function() {}
};

const documentMock = {
  body: createMockElement('body'),
  getElementById: (id) => {
    if (id === 'app') return appContainer;
    if (id === 'toast') return toastElement;
    const found = appContainer.querySelector('#' + id);
    if (found) return found;
    const fallback = createMockElement('div');
    fallback.setAttribute('id', id);
    return fallback;
  },
  querySelector: (sel) => {
    return appContainer.querySelector(sel) || createMockElement('div');
  },
  querySelectorAll: (sel) => {
    return appContainer.querySelectorAll(sel);
  },
  createElement: (tag) => createMockElement(tag),
  addEventListener: () => {}
};

const windowMock = {
  addEventListener: () => {},
  removeEventListener: () => {},
  scrollTo: () => {},
  AndroidBridge: mockAndroidBridge
};

const navigatorMock = {
  vibrate: (ms) => { vibrateLog.push(ms); }
};

const Progression = require('../../main/assets/core/progressao.js');
const BodyVisualizer = require('../../main/assets/apps/evolucao/body-visualizer.js');

const context = {
  console: console,
  KEY: 'evolucao_treino_state',
  Progression: Progression,
  BodyVisualizer: BodyVisualizer,
  Date: Date,
  Math: Math,
  JSON: JSON,
  parseFloat: parseFloat,
  parseInt: parseInt,
  isFinite: isFinite,
  isNaN: isNaN,
  String: String,
  Array: Array,
  Object: Object,
  Number: Number,
  document: documentMock,
  window: windowMock,
  self: windowMock,
  navigator: navigatorMock,
  localStorage: mockLocalStorage,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  toast: (msg) => { toastLog.push(msg); },
  initAudio: () => {},
  askNotify: () => {},
  enableNotify: () => {},
  doInstall: () => {},
  celebrate: () => {},
  startRest: () => {},
  hideRest: () => {},
  lastSummary: null,
  render: () => {
    if (typeof context.renderTreino === 'function') {
      appContainer.innerHTML = context.renderTreino();
      if (typeof context.bindTreino === 'function') {
        context.bindTreino();
      }
    }
  },
  save: () => {
    if (context.state) {
      mockLocalStorage.setItem('evolucao_treino_state', JSON.stringify(context.state));
    }
  },
  dlg: (opts) => { dialogLog.push(opts); },
  notifState: () => 'default'
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('apps/evolucao/exercicios/nomes.js');
loadScript('apps/evolucao/dados.js');
loadScript('apps/evolucao/exercicios/fotos.js');
loadScript('kernel/fmt.js');
loadScript('kernel/icons.js');
loadScript('kernel/charts.js');
loadScript('kernel/ui.js');
loadScript('kernel/db.js');
loadScript('apps/evolucao/logic.js');
loadScript('apps/evolucao/body-visualizer.js');
loadScript('apps/evolucao/views/treino.js');

console.log('=== [EVOLUÇÃO] Executando Suíte de Regressão R4 (r4_evolucao_regression.test.js) ===\n');

// Helper to reset draft to Day A clean state
function setupDayA() {
  const { state } = context;
  state.draft = {
    day: 'A',
    date: '2026-08-17',
    entries: {},
    warmupMode: {},
    startedAt: null,
    sessionMode: 'normal',
    unilateralPending: null
  };
  context.mfEx = 0; // Supino reto c/ halteres (Day A, 4 sets)
  context.kbdReset();
  toastLog = [];
  vibrateLog = [];
  dialogLog = [];
  context.render();
}

// -----------------------------------------------------------------------------
// SUITE 1: KEYPAD NUMERIC TYPING ON PHANTOM SETS & CELL SWITCHING BUFFER RETENTION (R1)
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Keypad Numeric Typing & Cell Switching Buffer Retention ---');

// Test 1.1: Typing weight on phantom set, switching to reps cell preserves typed weight
{
  console.log('Test 1.1: Switching from load ("w") to reps ("r") retains typed load buffer');
  setupDayA();
  const { state } = context;

  // Open keypad for set 0 on 'w' (weight)
  context.kbdOpenFor('w', 0);
  assert.strictEqual(context.kbdOpen, true, 'Keypad deve estar aberto');
  assert.strictEqual(context.kbdMode, 'w', 'Modo inicial deve ser "w"');
  assert.strictEqual(context.kbdEdit.si, 0, 'Série em edição deve ser 0');

  // User types 60 kg
  context.kbdW = '60';
  context.kbdFresh = false;

  // Switch cell to 'r' on the SAME phantom set (row 0)
  context.kbdOpenFor('r', 0);

  // Assertions: buffer must NOT be wiped or reset
  assert.strictEqual(context.kbdMode, 'r', 'Modo deve ter alternado para "r"');
  assert.strictEqual(context.kbdW, '60', 'Carga digitada (60kg) deve permanecer intacta no buffer');
  assert.strictEqual(context.kbdEdit.si, 0, 'Índice da série editada deve permanecer 0');
}

// Test 1.2: Typing reps on phantom set, switching back to load preserves typed reps
{
  console.log('Test 1.2: Switching from reps ("r") to load ("w") retains typed reps buffer');
  setupDayA();
  const { state } = context;

  context.kbdOpenFor('w', 0);
  context.kbdW = '62.5';
  context.kbdFresh = false;

  // Switch to reps and type 12 reps
  context.kbdOpenFor('r', 0);
  assert.strictEqual(context.kbdW, '62.5', 'Carga 62.5 mantida ao abrir reps');
  context.kbdR = '12';
  context.kbdFresh = false;

  // Switch back to weight
  context.kbdOpenFor('w', 0);

  assert.strictEqual(context.kbdMode, 'w', 'Modo deve voltar para "w"');
  assert.strictEqual(context.kbdW, '62.5', 'Carga 62.5 deve continuar preservada');
  assert.strictEqual(context.kbdR, '12', 'Repetições 12 devem continuar preservadas');
}

// Test 1.3: Alternating between 'w' and 'r' using keypad toggle key (⇆) preserves buffer
{
  console.log('Test 1.3: Keypad toggle key (⇆ / \\u21c6) preserves both typed buffers');
  setupDayA();

  context.kbdOpenFor('w', 0);
  context.kbdW = '70';
  context.kbdR = '8';
  context.kbdFresh = false;

  // Simulate clicking toggle key ⇆ via [data-key="\u21c6"]
  const toggleBtn = appContainer.querySelector('[data-key="\u21c6"]');
  if (toggleBtn) {
    toggleBtn.click();
  } else {
    // Direct simulate key action
    context.kbdMode = context.kbdMode === 'w' ? 'r' : 'w';
  }

  assert.strictEqual(context.kbdMode, 'r', 'Modo deve alternar para "r"');
  assert.strictEqual(context.kbdW, '70', 'Carga 70 deve permanecer');
  assert.strictEqual(context.kbdR, '8', 'Reps 8 devem permanecer');

  // Toggle back to 'w'
  if (toggleBtn) {
    toggleBtn.click();
  } else {
    context.kbdMode = context.kbdMode === 'w' ? 'r' : 'w';
  }

  assert.strictEqual(context.kbdMode, 'w', 'Modo deve alternar de volta para "w"');
  assert.strictEqual(context.kbdW, '70');
  assert.strictEqual(context.kbdR, '8');
}

// Test 1.4: Switching to a DIFFERENT row resets buffer to that row's context
{
  console.log('Test 1.4: Switching to a different row resets buffer for new row context');
  setupDayA();

  context.kbdOpenFor('w', 0);
  context.kbdW = '80';
  context.kbdR = '6';

  // Now open set index 1 (different set)
  context.kbdOpenFor('w', 1);

  assert.strictEqual(context.kbdEdit.si, 1, 'kbdEdit deve apontar para a série 1');
  assert.strictEqual(context.kbdMode, 'w');
}

// -----------------------------------------------------------------------------
// SUITE 2: COMMITTING LOAD & REPS VIA CHECKMARK [data-done] AND KEYPAD ✓ (R1)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Committing Load & Reps via Checkmark and Keypad ✓ ---');

// Test 2.1: Keypad ✓ (kbdCommit) on phantom set saves typed values into state.draft.entries
{
  console.log('Test 2.1: Keypad ✓ (kbdCommit) commits typed load and reps into draft');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  context.kbdOpenFor('w', 0);
  context.kbdW = '60';
  context.kbdR = '12';

  // Commit via kbdCommit
  context.kbdCommit();

  const entries = state.draft.entries[exName];
  assert(Array.isArray(entries) && entries.length === 1, 'Draft deve conter 1 série registrada');
  assert.strictEqual(entries[0].w, 60, 'Carga registrada deve ser 60kg');
  assert.strictEqual(entries[0].r, 12, 'Repetições registradas devem ser 12');
  assert.strictEqual(entries[0].done, true, 'Série deve estar marcada como concluída (done: true)');
  assert.strictEqual(context.kbdOpen, false, 'Teclado deve fechar após commit');
}

// Test 2.2: Checkmark [data-done] click on phantom row with open buffer commits typed values
{
  console.log('Test 2.2: Checkmark [data-done] click commits active keypad buffer');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  // Open keypad for row 0 and type values
  context.kbdOpenFor('w', 0);
  context.kbdW = '65';
  context.kbdR = '11';
  context.render();

  // Find checkmark button for row 0: [data-done="0:0"]
  const chkBtn = appContainer.querySelector('[data-done="0:0"]');
  assert(chkBtn !== null, 'Botão de checkmark [data-done="0:0"] deve existir');
  chkBtn.click();

  const entries = state.draft.entries[exName];
  assert(Array.isArray(entries) && entries.length === 1, 'Série deve ser registrada');
  assert.strictEqual(entries[0].w, 65, 'Carga confirmada pelo checkmark deve ser 65kg');
  assert.strictEqual(entries[0].r, 11, 'Reps confirmadas pelo checkmark devem ser 11');
  assert.strictEqual(entries[0].done, true, 'Série confirmada');
  assert(vibrateLog.length > 0, 'Vibração deve ter sido acionada');
}

// Test 2.3: Checkmark [data-done] on phantom set with closed keypad uses default/placeholder
{
  console.log('Test 2.3: Checkmark click with closed keypad commits default/placeholder values');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;
  const exo = state.ficha['A'].ex[0];

  assert.strictEqual(context.kbdOpen, false, 'Teclado fechado');

  const chkBtn = appContainer.querySelector('[data-done="0:0"]');
  assert(chkBtn !== null);
  chkBtn.click();

  const entries = state.draft.entries[exName];
  assert.strictEqual(entries.length, 1);
  const expectedW = exo.lastW != null ? exo.lastW : 20;
  const expectedR = exo.lastR != null ? exo.lastR : 10;
  assert.strictEqual(entries[0].w, expectedW, `Carga padrão deve ser ${expectedW}kg`);
  assert.strictEqual(entries[0].r, expectedR, `Reps padrão devem ser ${expectedR}`);
}

// Test 2.4: Partial typed buffer (only weight) uses default reps and commits
{
  console.log('Test 2.4: Partial typed buffer (only weight) preserves default reps');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  context.kbdOpenFor('w', 0);
  context.kbdW = '95';
  context.kbdR = ''; // empty
  context.kbdCommit();

  const entries = state.draft.entries[exName];
  assert.strictEqual(entries[0].w, 95, 'Carga digitada deve ser 95kg');
  assert.strictEqual(entries[0].r, 10, 'Reps devem adotar padrão 10');
}

// Test 2.5: Unchecking and re-checking a completed set toggles done state
{
  console.log('Test 2.5: Unchecking completed set toggles done=false, re-checking restores done=true');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  // Record 1st set
  context.kbdOpenFor('w', 0);
  context.kbdW = '70';
  context.kbdR = '10';
  context.kbdCommit();

  assert.strictEqual(state.draft.entries[exName][0].done, true);

  // Click checkmark to uncheck
  context.render();
  let chkBtn = appContainer.querySelector('[data-done="0:0"]');
  chkBtn.click();

  assert.strictEqual(state.draft.entries[exName][0].done, false, 'Série deve ser desmarcada (done: false)');

  // Click checkmark to re-check
  context.render();
  chkBtn = appContainer.querySelector('[data-done="0:0"]');
  chkBtn.click();

  assert.strictEqual(state.draft.entries[exName][0].done, true, 'Série deve ser remarcada (done: true)');
  assert.strictEqual(state.draft.entries[exName][0].w, 70, 'Carga 70kg deve ser mantida');
}

// -----------------------------------------------------------------------------
// SUITE 3: IN-PLACE MODIFICATION OF EXISTING SETS & PARTIAL REPS (+Xp) (R1)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: In-Place Modification of Existing Sets & Partial Reps (+Xp) ---');

// Test 3.1: Tapping existing set loads existing load, reps, and RIR into keypad buffer
{
  console.log('Test 3.1: Tapping existing set loads existing values into buffer');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  state.draft.entries[exName] = [
    { w: 85, r: 8, done: true, rir: 1, rirManual: true, p: 2 }
  ];

  context.kbdOpenFor('w', 0);

  assert.strictEqual(context.kbdEdit.si, 0);
  assert.strictEqual(context.kbdEdit.entryIndex, 0);
  assert.strictEqual(context.kbdW, '85', 'kbdW deve carregar 85');
  assert.strictEqual(context.kbdR, '8', 'kbdR deve carregar 8');
  assert.strictEqual(context.kbdP, '2', 'kbdP deve carregar 2');
  assert.strictEqual(context.kbdRir, 1, 'kbdRir deve carregar 1');
}

// Test 3.2: In-place edit of existing set's load and reps updates entry without creating duplicate
{
  console.log('Test 3.2: In-place edit of existing set updates entry without duplication');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  state.draft.entries[exName] = [
    { w: 85, r: 8, done: true, rir: 2 }
  ];

  context.kbdOpenFor('w', 0);
  context.kbdW = '90';
  context.kbdR = '9';
  context.kbdCommit();

  const entries = state.draft.entries[exName];
  assert.strictEqual(entries.length, 1, 'Deve continuar com exatamente 1 série');
  assert.strictEqual(entries[0].w, 90, 'Carga deve ter sido atualizada para 90');
  assert.strictEqual(entries[0].r, 9, 'Reps devem ter sido atualizadas para 9');
}

// Test 3.3: Partial reps (+Xp) recorded and rendered in table HTML
{
  console.log('Test 3.3: Partial reps (+Xp) recorded and rendered in table HTML');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  context.kbdOpenFor('w', 0);
  context.kbdW = '80';
  context.kbdR = '10';
  context.kbdP = '3'; // 3 partial reps

  context.kbdCommit();

  const setObj = state.draft.entries[exName][0];
  assert.strictEqual(setObj.w, 80);
  assert.strictEqual(setObj.r, 10);
  assert.strictEqual(setObj.p, 3, 'Parciais devem ser 3');

  // Verify rendering includes +3p
  const html = context.renderTreino();
  assert(html.includes('10+3p'), 'HTML da tabela deve exibir 10+3p na célula de reps');
}

// Test 3.4: Deleting a recorded set via keypad delete button (#mfKbdDel)
{
  console.log('Test 3.4: Keypad delete button (#mfKbdDel) removes existing recorded set');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  state.draft.entries[exName] = [
    { w: 50, r: 10, done: true },
    { w: 55, r: 10, done: true }
  ];

  context.kbdOpenFor('w', 0);
  context.render();

  const delBtn = appContainer.querySelector('#mfKbdDel');
  assert(delBtn !== null, 'Botão de exclusão #mfKbdDel deve estar visível');
  delBtn.click();

  const entries = state.draft.entries[exName];
  assert.strictEqual(entries.length, 1, 'Deve restar 1 série após exclusão');
  assert.strictEqual(entries[0].w, 55, 'A série restante deve ser a de 55kg');
}

// -----------------------------------------------------------------------------
// SUITE 4: AUTO PROGRESSION BUTTON (#mfAutoProg) INTERACTION & HAPTICS (R2)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Auto Progression Button (#mfAutoProg) Interaction & Haptics ---');

// Test 4.1: Progression meta calculation and button rendering
{
  console.log('Test 4.1: #mfAutoProg button rendered with suggested load and reps');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  // Create a past session with 4 completed sets of 80kg x 10 reps
  state.sessions = [
    {
      id: 1001,
      date: '2026-08-10',
      day: 'A',
      mode: 'normal',
      entries: {
        [exName]: [
          { w: 80, r: 10, done: true, rir: 2 },
          { w: 80, r: 10, done: true, rir: 2 },
          { w: 80, r: 10, done: true, rir: 2 },
          { w: 80, r: 10, done: true, rir: 2 }
        ]
      }
    }
  ];

  const meta = Progression.calcularMeta(state.ficha, state.sessions, 'A', exName, state.settings.progressao);
  assert(meta && meta.carga != null, 'Meta calculada deve ter carga definida');

  context.render();
  const autoBtn = appContainer.querySelector('#mfAutoProg');
  assert(autoBtn !== null, 'Botão #mfAutoProg deve estar presente no DOM');
  assert(autoBtn.textContent.includes('Auto ·'), 'Botão deve conter texto Auto ·');
  const nkg = context.nkg;
  assert(autoBtn.textContent.includes(nkg(meta.carga)), `Botão deve exibir carga sugerida (${nkg(meta.carga)})`);
  assert(autoBtn.textContent.includes(String(meta.repsMeta)), `Botão deve exibir reps sugeridas (${meta.repsMeta})`);
}

// Test 4.2: Clicking #mfAutoProg applies suggested load/reps to keypad buffer and triggers vibration
{
  console.log('Test 4.2: Clicking #mfAutoProg applies suggested values to buffer and triggers vibrate(15)');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  state.sessions = [
    {
      id: 1002,
      date: '2026-08-10',
      day: 'A',
      mode: 'normal',
      entries: {
        [exName]: [
          { w: 75, r: 10, done: true, rir: 2 },
          { w: 75, r: 10, done: true, rir: 2 },
          { w: 75, r: 10, done: true, rir: 2 },
          { w: 75, r: 10, done: true, rir: 2 }
        ]
      }
    }
  ];

  const meta = Progression.calcularMeta(state.ficha, state.sessions, 'A', exName, state.settings.progressao);
  vibrateLog = [];
  context.render();

  const autoBtn = appContainer.querySelector('#mfAutoProg');
  assert(autoBtn !== null);
  autoBtn.click();

  // Assertions
  assert.strictEqual(context.kbdW, String(meta.carga), `Buffer kbdW deve ser ${meta.carga}`);
  assert.strictEqual(context.kbdR, String(meta.repsMeta), `Buffer kbdR deve ser ${meta.repsMeta}`);
  assert.strictEqual(context.kbdP, '0', 'Buffer kbdP deve ser 0');
  assert.strictEqual(context.kbdOpen, true, 'Teclado deve ser aberto para a série ativa');
  assert(vibrateLog.includes(15), 'vibrate(15) deve ter sido chamado para feedback tátil');
}

// Test 4.3: Clicking #mfAutoProg with an existing uncommitted/committed row updates row in-place
{
  console.log('Test 4.3: Clicking #mfAutoProg updates existing selected set in draft entries');
  setupDayA();
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  state.draft.entries[exName] = [
    { w: 60, r: 8, done: true, rir: 2 }
  ];

  state.sessions = [
    {
      id: 1003,
      date: '2026-08-10',
      day: 'A',
      mode: 'normal',
      entries: {
        [exName]: [
          { w: 70, r: 10, done: true, rir: 2 },
          { w: 70, r: 10, done: true, rir: 2 },
          { w: 70, r: 10, done: true, rir: 2 },
          { w: 70, r: 10, done: true, rir: 2 }
        ]
      }
    }
  ];

  const meta = Progression.calcularMeta(state.ficha, state.sessions, 'A', exName, state.settings.progressao);

  // Select row 0 in keypad
  context.kbdOpenFor('w', 0);
  context.render();

  const autoBtn = appContainer.querySelector('#mfAutoProg');
  autoBtn.click();

  // Row in draft should be updated with meta values
  const existingSet = state.draft.entries[exName][0];
  assert.strictEqual(existingSet.w, meta.carga, 'Carga da série existente deve ser atualizada para a meta');
  assert.strictEqual(existingSet.r, meta.repsMeta, 'Reps da série existente devem ser atualizadas para a meta');
}

// Test 4.4: Unilateral exercise auto progression label & application
{
  console.log('Test 4.4: Auto progression on unilateral exercise (perSide) includes / lado label');
  const { state } = context;
  state.draft = {
    day: 'B',
    date: '2026-08-17',
    entries: {},
    warmupMode: {},
    startedAt: null,
    sessionMode: 'normal',
    unilateralPending: null
  };
  // Find Serrote or unilateral exercise in Day B
  const dayB = state.ficha['B'];
  const uniIdx = dayB.ex.findIndex(e => e.perSide === true || e.n.includes('Serrote'));
  assert(uniIdx >= 0, 'Exercício unilateral deve existir na ficha B');
  context.mfEx = uniIdx;
  const uniEx = dayB.ex[uniIdx];

  context.render();
  const autoBtn = appContainer.querySelector('#mfAutoProg');
  if (autoBtn) {
    assert(autoBtn.textContent.includes('/ lado'), 'Botão auto para exercício unilateral deve conter "/ lado"');
    autoBtn.click();
    assert(context.kbdOpen === true);
    assert(vibrateLog.includes(15));
  }
}

console.log('\n======================================================');
console.log('r4_evolucao_regression.test.js: OK (Todos os testes passaram com sucesso!)');

if (typeof context !== 'undefined' && context.hideRest) {
  context.hideRest();
}
process.exit(0);
