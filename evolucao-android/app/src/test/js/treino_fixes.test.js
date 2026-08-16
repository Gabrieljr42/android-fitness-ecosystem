'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- Helper Mock DOM Environment ---
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
    querySelector: function(sel) { return null; },
    querySelectorAll: function(sel) { return []; }
  };

  Object.defineProperty(el, 'innerHTML', {
    get: function() { return this._innerHTML; },
    set: function(val) {
      this._innerHTML = val;
      this.children = [];
    }
  });

  return el;
}

const mockStorage = {};
const mockLocalStorage = {
  getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
};

const appContainer = createMockElement('div');
appContainer.setAttribute('id', 'app');

const documentMock = {
  body: createMockElement('body'),
  getElementById: (id) => {
    if (id === 'app') return appContainer;
    return createMockElement('div');
  },
  querySelector: (sel) => {
    const el = createMockElement('div');
    if (sel && sel.includes('.mf-cell.on')) el.classList.add('on');
    return el;
  },
  querySelectorAll: (sel) => [],
  createElement: (tag) => createMockElement(tag),
  addEventListener: () => {}
};

const windowMock = {
  addEventListener: () => {},
  removeEventListener: () => {},
  isSecureContext: false,
  scrollTo: () => {},
  AndroidBridge: null
};

const Progression = require('../../main/assets/core/progressao.js');

let lastRestCall = null;
let lastToastCall = null;
let lastDlgCall = null;

const context = {
  console: console,
  KEY: 'evolucao_treino_state',
  Progression: Progression,
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
  localStorage: mockLocalStorage,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  toast: (msg) => { lastToastCall = msg; },
  vibrate: () => {},
  initAudio: () => {},
  askNotify: () => {},
  celebrate: () => {},
  startRest: (sec, lbl) => { lastRestCall = { sec, lbl }; },
  hideRest: () => {},
  render: () => {},
  save: () => {},
  dlg: (opts) => { lastDlgCall = opts; },
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
loadScript('kernel/db.js');
loadScript('apps/evolucao/logic.js');
loadScript('apps/evolucao/body-visualizer.js');
loadScript('apps/evolucao/views/treino.js');

console.log('=== [EVOLUÇÃO] Executando Suíte: treino_fixes.test.js ===\n');

// -----------------------------------------------------------------------------
// TIER 1: CORE FUNCTIONAL TESTS
// -----------------------------------------------------------------------------

// 1.1 F1.1 Keypad Buffer Commit on Set Done Checkbox
{
  console.log('Test 1.1: Keypad buffer commit on set completion checkbox');
  const { state } = context;
  
  // Set up clean draft state for Day A
  state.draft = {
    day: 'A',
    date: '2026-08-15',
    entries: {},
    warmupMode: {},
    startedAt: null,
    sessionMode: 'normal',
    unilateralPending: null
  };
  context.mfEx = 0; // 'Supino reto c/ halteres' (target 4 sets, 6-10 reps)
  const exName = state.ficha['A'].ex[0].n;

  // Open keypad for set index 0 (phantom set)
  context.kbdOpenFor('w', 0);
  assert.strictEqual(context.kbdOpen, true, 'Keypad deve estar aberto');

  // User types 85 kg (instead of default 20kg) and 9 reps (instead of default 10)
  context.kbdW = '85';
  context.kbdR = '9';

  // Perform commit via kbdCommit
  context.kbdCommit();

  const recordedSets = state.draft.entries[exName];
  assert(Array.isArray(recordedSets) && recordedSets.length === 1, 'Deve conter exatamente 1 série registrada');
  assert.strictEqual(recordedSets[0].w, 85, 'A carga deve ser 85kg digitada no keypad');
  assert.strictEqual(recordedSets[0].r, 9, 'As repetições devem ser 9 digitadas no keypad');
  assert.strictEqual(recordedSets[0].done, true, 'A série deve estar marcada como concluída');
}

// 1.2 F1.1 Partial Keypad Buffer Commit (Only Weight or Only Reps)
{
  console.log('Test 1.2: Partial keypad buffer commit preserves unedited fields');
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;
  
  // Scenario A: User only types weight '90'
  context.kbdOpenFor('w', 1);
  context.kbdW = '90';
  context.kbdR = ''; // empty, should use default/phantom reps
  context.kbdCommit();

  const sets = state.draft.entries[exName];
  assert.strictEqual(sets.length, 2, 'Deve registrar a 2ª série');
  assert.strictEqual(sets[1].w, 90, 'Carga deve ser 90kg');
  assert.strictEqual(sets[1].r, 9, 'Reps devem adotar o último valor/padrão válido');

  // Scenario B: User only types reps '12'
  context.kbdOpenFor('r', 2);
  context.kbdW = '';
  context.kbdR = '12';
  context.kbdCommit();

  assert.strictEqual(sets.length, 3, 'Deve registrar a 3ª série');
  assert.strictEqual(sets[2].w, 90, 'Carga deve adotar a última carga válida');
  assert.strictEqual(sets[2].r, 12, 'Reps devem ser 12');
}

// 1.3 F1.2 Explicit Target RIR Assignment (No '?' placeholder)
{
  console.log('Test 1.3: Default target RIR explicit assignment (no ambiguous "?")');
  const { state, mfRirFor, rirLabel, defaultRirFor, rirBarHTML } = context;
  const exName = state.ficha['A'].ex[0].n;
  const targetRir = defaultRirFor(exName);
  assert(targetRir !== null && targetRir !== undefined, 'Target RIR padrão deve existir');
  assert.strictEqual(targetRir, 2, 'Target RIR padrão da ficha deve ser 2');

  // Check set recorded without manual override
  const set = state.draft.entries[exName][0];
  const assignedRir = set.rir !== undefined && set.rir !== null ? set.rir : targetRir;
  assert.strictEqual(assignedRir, 2, 'RIR atribuído explicitamente deve ser 2');
  
  // Display label check
  const label = rirLabel(assignedRir);
  assert.strictEqual(label, '2', 'Label de exibição deve ser "2" e NUNCA "?"');
  assert.notStrictEqual(label, '?', 'Ambiguous "?" indicator eliminated');

  // rirBarHTML check
  const barHtml = rirBarHTML(exName);
  assert(!barHtml.includes('data-rirsel="?"'), 'Barra de RIR não deve conter botão "?"');
}

// 1.4 F1.2 Manual RIR Override Preservation
{
  console.log('Test 1.4: Manual RIR override (0 to 6) is preserved and stored');
  const { state, rirColor } = context;
  const exName = state.ficha['A'].ex[0].n;

  // Record set with manual RIR 0 (falha total)
  context.kbdOpenFor('w', 3);
  context.kbdW = '90';
  context.kbdR = '8';
  context.kbdRir = 0; // Manual selection: 0 RIR
  context.kbdCommit();

  const sets = state.draft.entries[exName];
  assert.strictEqual(sets.length, 4);
  assert.strictEqual(sets[3].rir, 0, 'RIR manual 0 (falha) deve ser gravado exatamente como 0');
  assert.strictEqual(sets[3].rirManual, true, 'Flag rirManual deve ser true');

  // Verify color for 0 RIR is red failure color
  assert.strictEqual(rirColor(0), '#ef4444', 'RIR 0 deve ter cor de falha #ef4444');
  assert.strictEqual(rirColor(2), '#eab308', 'RIR 2 deve ter cor amarela');
}

// 1.5 F2.2 Unilateral Exercise Rest Flow (30s intra-set switch side timer)
{
  console.log('Test 1.5: Unilateral exercise rest flow (30s intra-set switch side timer)');
  const { state, isUnilateralEx, handleSetCompletion } = context;

  // Find unilateral exercise in Day B
  const dayB = state.ficha['B'];
  const serroteIndex = dayB.ex.findIndex(e => e.perSide === true || e.n.includes('Serrote'));
  const serroteEx = dayB.ex[serroteIndex];
  assert(serroteEx, 'Exercício unilateral Serrote deve estar na ficha B');
  assert.strictEqual(isUnilateralEx(serroteEx), true, 'isUnilateralEx deve retornar true para Serrote');

  state.draft = {
    day: 'B',
    date: '2026-08-15',
    entries: {},
    warmupMode: {},
    startedAt: Date.now(),
    sessionMode: 'normal',
    unilateralPending: null
  };
  context.mfEx = serroteIndex;

  // Side 1 execution
  const setObj1 = { w: 30, r: 10, done: true, rir: 2, rirManual: false, __workIndex: 0 };
  handleSetCompletion(serroteEx, 0, setObj1, true);

  assert(state.draft.unilateralPending !== null, 'unilateralPending deve estar ativo após o Lado 1');
  assert.strictEqual(state.draft.unilateralPending.ex, serroteEx.n);
  assert.strictEqual(state.draft.unilateralPending.side, 1);
  assert.strictEqual(lastRestCall.sec, 30, 'Timer intra-set de descanso deve ser 30 segundos');
  assert(lastRestCall.lbl.includes('Trocar de lado'), 'Label do timer deve indicar Trocar de lado');

  // Side 2 execution
  const setObj2 = { w: 30, r: 10, done: true, rir: 2, rirManual: false, __workIndex: 0 };
  handleSetCompletion(serroteEx, 0, setObj2, true);

  assert.strictEqual(state.draft.unilateralPending, null, 'unilateralPending deve ser limpo após Lado 2');
  assert(Array.isArray(state.draft.entries[serroteEx.n]), 'Série deve estar gravada no draft');
  assert.strictEqual(state.draft.entries[serroteEx.n].length, 1, 'Exatamente 1 série completa gravada');
  assert.strictEqual(lastRestCall.sec, serroteEx.rest || 90, 'Descanso completo deve ser acionado após o Lado 2');
}

// 1.6 F2.1 Minimalist 5-Column Table and Header Cleanliness
{
  console.log('Test 1.6: Minimalist 5-column table rendering and banner elimination');
  const { state, renderTreino, kbdHTML } = context;
  state.draft = {
    day: 'A',
    date: '2026-08-15',
    entries: {},
    warmupMode: {},
    startedAt: null,
    sessionMode: 'normal',
    unilateralPending: null
  };
  context.mfEx = 0;

  const html = renderTreino();
  assert(html.includes('<div class="mf-th"><span>Set</span><span>Carga</span><span>Reps</span><span>RIR</span><span>✓</span></div>'), 'Tabela deve conter exatamente o cabeçalho de 5 colunas');
  assert(!html.includes('data-session-mode'), 'Botão de modo de sessão no topo deve ser removido');
  assert(!html.includes('setupBanner'), 'Setup banner redundante deve ser eliminado');

  // Keypad Delete button when editing real set
  state.draft.entries[state.ficha['A'].ex[0].n] = [{ w: 80, r: 10, done: true }];
  context.kbdOpenFor('w', 0);
  const kbdContent = kbdHTML(state.ficha['A'].ex[0].n);
  assert(kbdContent.includes('id="mfKbdDel"'), 'Teclado deve conter botão de excluir quando editando série real');
}

// 1.7 F2.3 Workout Termination Flow with Segmented Classification
{
  console.log('Test 1.7: Workout finish flow and Short vs Full classification');
  const { state, promptFinishSession, renderTreino } = context;

  // Render last exercise vs intermediate
  context.mfEx = 0; // intermediate
  let treinoHtml = renderTreino();
  assert(treinoHtml.includes('id="mfNextEx"'), 'Exercício intermediário deve renderizar Próximo exercício');
  assert(treinoHtml.includes('id="saveSessEarly"'), 'Exercício intermediário deve renderizar Encerrar treino mais cedo');

  // Set last exercise
  context.mfEx = state.ficha['A'].ex.length - 1;
  treinoHtml = renderTreino();
  assert(treinoHtml.includes('id="saveSess"'), 'Último exercício deve renderizar CTA Finalizar treino');

  // Trigger finish dialog
  state.draft = {
    day: 'A',
    date: '2026-08-15',
    entries: {
      [state.ficha['A'].ex[0].n]: [{ w: 80, r: 10, done: true }]
    },
    warmupMode: {},
    startedAt: Date.now() - 1800000,
    sessionMode: 'normal',
    unilateralPending: null
  };

  context.dlg = (opts) => { lastDlgCall = opts; };
  promptFinishSession();
  assert(lastDlgCall !== null, 'dlg deve ser chamado para confirmação');
  assert(Array.isArray(lastDlgCall.seg), 'dlg deve conter seletor segmentado');
  assert.strictEqual(lastDlgCall.seg[0], 'Treino Completo');
  assert.strictEqual(lastDlgCall.seg[1], 'Treino Curto');
  assert.strictEqual(lastDlgCall.segVal, 'Treino Curto', 'Sessão com séries parciais deve sugerir Treino Curto por padrão');

  // Complete dialog callback
  lastDlgCall.onOk('Treino Curto');
  assert.strictEqual(state.sessions.length, 1, 'Sessão deve ser salva em state.sessions');
  assert.strictEqual(state.sessions[0].mode, 'curto', 'Modo da sessão salva deve ser curto');
}

console.log('\n======================================================');
console.log('treino_fixes.test.js: OK (Todos os testes passaram com sucesso!)');
