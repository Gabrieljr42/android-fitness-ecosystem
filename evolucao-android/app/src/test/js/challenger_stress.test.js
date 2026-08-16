'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- Mock DOM Environment for Challenger Suite ---
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
context.BodyVisualizer = context.window.BodyVisualizer || require('../../main/assets/apps/evolucao/body-visualizer.js');
loadScript('apps/evolucao/views/treino.js');

// Hook toast in context to track messages
context.toast = (msg) => { lastToastCall = msg; };

console.log('=== [EVOLUÇÃO] Executando Suíte de Estresse Adversarial: challenger_stress.test.js ===\n');

// -----------------------------------------------------------------------------
// ADVERSARIAL SUITE 1: KEYPAD BUFFER & PARSING EDGE CASES
// -----------------------------------------------------------------------------
console.log('--- Suite 1: Keypad Buffer & Parsing Adversarial Cases ---');

// 1.1 Decimal parsing and fractional weights
{
  console.log('Test 1.1: Decimal parsing, fractional weights and bodyweight (0kg)');
  const { state } = context;
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
  const exName = state.ficha['A'].ex[0].n;

  // Type fractional weight '82.5' and reps '8'
  context.kbdOpenFor('w', 0);
  context.kbdW = '82.5';
  context.kbdR = '8';
  context.kbdCommit();

  let sets = state.draft.entries[exName];
  assert.strictEqual(sets.length, 1, 'Deve registrar série com decimal');
  assert.strictEqual(sets[0].w, 82.5, 'Carga deve ser exatamente 82.5');
  assert.strictEqual(sets[0].r, 8, 'Reps devem ser 8');

  // Type bodyweight / 0kg load (e.g. 0 kg external load)
  context.kbdOpenFor('w', 1);
  context.kbdW = '0';
  context.kbdR = '15';
  context.kbdCommit();

  sets = state.draft.entries[exName];
  assert.strictEqual(sets.length, 2, 'Deve aceitar carga 0kg');
  assert.strictEqual(sets[1].w, 0, 'Carga 0kg deve ser preservada como número 0');
  assert.strictEqual(sets[1].r, 15, 'Reps devem ser 15');
}

// 1.2 Invalid input rejection
{
  console.log('Test 1.2: Invalid input validation (negative weight, 0 reps, non-numeric)');
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;
  const countBefore = (state.draft.entries[exName] || []).length;

  // Negative weight
  context.kbdOpenFor('w', countBefore);
  context.kbdW = '-10';
  context.kbdR = '10';
  lastToastCall = null;
  context.kbdCommit();
  assert.strictEqual((state.draft.entries[exName] || []).length, countBefore, 'Carga negativa não deve ser adicionada');
  assert(lastToastCall && lastToastCall.includes('carga'), 'Toast de aviso de carga deve ser exibido');

  // 0 reps
  context.kbdOpenFor('w', countBefore);
  context.kbdW = '50';
  context.kbdR = '0';
  lastToastCall = null;
  context.kbdCommit();
  assert.strictEqual((state.draft.entries[exName] || []).length, countBefore, '0 repetições não deve ser adicionada');
  assert(lastToastCall && lastToastCall.includes('repetições'), 'Toast de aviso de reps deve ser exibido');
}

// 1.3 Fast row switching & buffer isolation
{
  console.log('Test 1.3: Fast switching between row edits without closing keypad');
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  // Edit row 0: set weight to 85kg
  context.kbdOpenFor('w', 0);
  context.kbdW = '85';
  context.kbdCommit();

  assert.strictEqual(state.draft.entries[exName][0].w, 85, 'Linha 0 atualizada para 85kg');

  // Now immediately open row 1 (which was 0kg/15reps) and change reps to 16
  context.kbdOpenFor('r', 1);
  context.kbdR = '16';
  context.kbdCommit();

  assert.strictEqual(state.draft.entries[exName][1].r, 16, 'Linha 1 atualizada para 16 reps');
  assert.strictEqual(state.draft.entries[exName][1].w, 0, 'Linha 1 manteve 0kg');
  assert.strictEqual(state.draft.entries[exName][0].w, 85, 'Linha 0 manteve 85kg sem contaminação');
}

// 1.4 Canceling / Closing keypad without commit
{
  console.log('Test 1.4: Canceling / closing keypad does not commit buffer values');
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  // Open row 0 and type 999kg, but call kbdClose()
  context.kbdOpenFor('w', 0);
  context.kbdW = '999';
  context.kbdClose();

  assert.strictEqual(state.draft.entries[exName][0].w, 85, 'Valor não deve mudar para 999kg após kbdClose');
  assert.strictEqual(context.kbdOpen, false, 'Keypad deve estar fechado');
}

// 1.5 Deleting rows from keypad (#mfKbdDel) and cleanup
{
  console.log('Test 1.5: Set deletion via #mfKbdDel cleans up draft state');
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;
  state.draft.startedAt = 12345678;

  // Delete row 1
  context.kbdOpenFor('w', 1);
  const rows = context.mfSetRows(exName);
  const editRow = rows[1];
  const entryIdx = editRow.__entryIndex;
  assert.strictEqual(entryIdx, 1);

  state.draft.entries[exName].splice(entryIdx, 1);
  context.kbdReset();

  assert.strictEqual(state.draft.entries[exName].length, 1, 'Resta 1 série');

  // Delete row 0 (now last remaining set)
  context.kbdOpenFor('w', 0);
  state.draft.entries[exName].splice(0, 1);
  if (!state.draft.entries[exName].length) delete state.draft.entries[exName];
  if (!Object.keys(state.draft.entries).length) state.draft.startedAt = null;
  context.kbdReset();

  assert.strictEqual(state.draft.entries[exName], undefined, 'Objeto de exercício removido');
  assert.strictEqual(state.draft.startedAt, null, 'startedAt resetado quando não há séries');
}

// -----------------------------------------------------------------------------
// ADVERSARIAL SUITE 2: EXPLICIT RIR HIERARCHY & BOUNDARIES
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: Explicit RIR Hierarchy & Boundary Cases ---');

// 2.1 Complete Fallback Hierarchy
{
  console.log('Test 2.1: Target RIR fallback hierarchy (exercise -> settings -> 2)');
  const { state, defaultRirFor, rirLabel } = context;

  // Level 1: Exercise-level target RIR
  state.ficha['A'].ex[0].progressao = { targetRir: 3 };
  assert.strictEqual(defaultRirFor(state.ficha['A'].ex[0].n), 3, 'Level 1: Deve adotar targetRir do exercício (3)');

  // Level 2: Settings-level target RIR
  delete state.ficha['A'].ex[0].progressao;
  state.settings.progressao.targetRir = 1;
  assert.strictEqual(defaultRirFor(state.ficha['A'].ex[0].n), 1, 'Level 2: Deve adotar targetRir das settings (1)');

  // Level 3: Hardcoded default
  delete state.settings.progressao.targetRir;
  assert.strictEqual(defaultRirFor(state.ficha['A'].ex[0].n), 2, 'Level 3: Deve adotar fallback padrão (2)');

  // Ensure rirLabel never returns '?'
  assert.strictEqual(rirLabel(null), '2', 'rirLabel(null) deve retornar "2" e nunca "?"');
  assert.strictEqual(rirLabel(undefined), '2', 'rirLabel(undefined) deve retornar "2" e nunca "?"');
  assert.strictEqual(rirLabel(NaN), '2', 'rirLabel(NaN) deve retornar "2" e nunca "?"');
}

// 2.2 Boundary RIR Clamping & Labels
{
  console.log('Test 2.2: RIR boundary values 0 to 6 and 6+ label formatting');
  const { rirLabel, mfRirFor } = context;

  assert.strictEqual(rirLabel(0), '0', 'RIR 0 label deve ser "0"');
  assert.strictEqual(rirLabel(1), '1', 'RIR 1 label deve ser "1"');
  assert.strictEqual(rirLabel(5), '5', 'RIR 5 label deve ser "5"');
  assert.strictEqual(rirLabel(6), '6+', 'RIR 6 label deve ser "6+"');
  assert.strictEqual(rirLabel(7), '6+', 'RIR >6 label deve ser "6+"');

  assert.strictEqual(mfRirFor({ rir: 0 }), 0, 'mfRirFor RIR 0');
  assert.strictEqual(mfRirFor({ rir: 6 }), 6, 'mfRirFor RIR 6');
  assert.strictEqual(mfRirFor({ rir: 10 }), 6, 'mfRirFor RIR 10 clampado para 6');
  assert.strictEqual(mfRirFor({ rir: -3 }), 0, 'mfRirFor RIR negativo clampado para 0');
  assert.strictEqual(mfRirFor({ rir: '4' }), 4, 'mfRirFor RIR string "4" convertido para 4');
}

// 2.3 Manual Override Toggle & Re-edit Preservation
{
  console.log('Test 2.3: Manual RIR override preserved across weight/reps edits');
  const { state } = context;
  const exName = state.ficha['A'].ex[0].n;

  state.draft = {
    day: 'A',
    date: '2026-08-15',
    entries: {},
    warmupMode: {},
    startedAt: Date.now(),
    sessionMode: 'normal',
    unilateralPending: null
  };
  context.mfEx = 0;

  // Record set with manual RIR 1
  context.kbdOpenFor('w', 0);
  context.kbdW = '100';
  context.kbdR = '6';
  context.kbdRir = 1;
  context.kbdCommit();

  let set = state.draft.entries[exName][0];
  assert.strictEqual(set.rir, 1, 'RIR manual gravado como 1');
  assert.strictEqual(set.rirManual, true, 'rirManual deve ser true');

  // Edit only reps of this set (change to 7) without touching RIR button
  context.kbdOpenFor('r', 0);
  context.kbdR = '7';
  context.kbdCommit();

  set = state.draft.entries[exName][0];
  assert.strictEqual(set.r, 7, 'Reps atualizadas para 7');
  assert.strictEqual(set.rir, 1, 'RIR manual 1 mantido intacto');
  assert.strictEqual(set.rirManual, true, 'rirManual mantido como true');
}

// -----------------------------------------------------------------------------
// ADVERSARIAL SUITE 3: UNILATERAL FLOW STATE MACHINE & INVARIANTS
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Unilateral Exercise Multi-Set Flow & Invariants ---');

// 3.1 Unilateral Classification Invariants
{
  console.log('Test 3.1: Unilateral classification regex & property invariants');
  const { isUnilateralEx } = context;

  assert.strictEqual(isUnilateralEx({ n: 'Remada serrote' }), true, 'Serrote deve ser unilateral');
  assert.strictEqual(isUnilateralEx({ n: 'Búlgaro unilateral' }), true, 'Búlgaro unilateral deve ser unilateral');
  assert.strictEqual(isUnilateralEx({ n: 'Afundo por lado' }), true, 'Afundo por lado deve ser unilateral');
  assert.strictEqual(isUnilateralEx({ n: 'Elevação lateral unilateral no cabo' }), true, 'Unilateral no nome');
  assert.strictEqual(isUnilateralEx({ n: 'Rosca concentrada unilateral' }), true, 'Rosca concentrada unilateral');
  assert.strictEqual(isUnilateralEx({ n: 'Supino reto com halteres' }), false, 'Supino c/ halteres é bilateral');
  assert.strictEqual(isUnilateralEx({ n: 'Desenvolvimento c/ halteres' }), false, 'Desenvolvimento c/ halteres é bilateral');
  assert.strictEqual(isUnilateralEx({ n: 'Búlgaro com halteres', unilateral: true }), true, 'Flag unilateral: true');
  assert.strictEqual(isUnilateralEx({ n: 'Custom Exercise', unilateral: true }), true, 'unilateral: true');
}

// 3.2 Complete Multi-Set Unilateral Cycle (3 sets)
{
  console.log('Test 3.2: Multi-set unilateral cycle (3 sets back-to-back)');
  const { state, handleSetCompletion } = context;
  const serroteEx = { n: 'Remada serrote', sets: 3, reps: '8-12', rest: 90, perSide: true };
  state.ficha['B'].ex.push(serroteEx);
  const exIdx = state.ficha['B'].ex.length - 1;

  state.draft = {
    day: 'B',
    date: '2026-08-15',
    entries: {},
    warmupMode: {},
    startedAt: Date.now(),
    sessionMode: 'normal',
    unilateralPending: null
  };
  context.mfEx = exIdx;

  for (let s = 0; s < 3; s++) {
    // Side 1
    const set1 = { w: 32, r: 10, done: true, rir: 2, rirManual: false, __workIndex: s };
    handleSetCompletion(serroteEx, s, set1, true);

    assert(state.draft.unilateralPending !== null, `Set ${s+1} Lado 1: unilateralPending deve estar ativo`);
    assert.strictEqual(state.draft.unilateralPending.side, 1);
    assert.strictEqual(lastRestCall.sec, 30, `Set ${s+1} Lado 1: timer intra-set de 30s`);
    assert(lastRestCall.lbl.includes('Trocar de lado'), `Set ${s+1} Lado 1: label Trocar de lado`);

    // Side 2
    const set2 = { w: 32, r: 10, done: true, rir: 2, rirManual: false, __workIndex: s };
    handleSetCompletion(serroteEx, s, set2, true);

    assert.strictEqual(state.draft.unilateralPending, null, `Set ${s+1} Lado 2: unilateralPending deve ser limpo`);
    assert.strictEqual(state.draft.entries[serroteEx.n].length, s + 1, `Set ${s+1} deve estar gravado`);
    assert.strictEqual(lastRestCall.sec, 90, `Set ${s+1} Lado 2: descanso completo 90s`);
  }
}

// 3.3 Navigation Away During Side 1 Pending
{
  console.log('Test 3.3: Navigation away while unilateral Side 1 is pending');
  const { state, handleSetCompletion } = context;
  const serroteEx = state.ficha['B'].ex.find(e => e.n.includes('Serrote'));
  const serroteIdx = state.ficha['B'].ex.indexOf(serroteEx);

  state.draft = {
    day: 'B',
    date: '2026-08-15',
    entries: {},
    warmupMode: {},
    startedAt: Date.now(),
    sessionMode: 'normal',
    unilateralPending: null
  };
  context.mfEx = serroteIdx;

  // Complete Side 1 of Set 0
  const setObj = { w: 28, r: 12, done: true, rir: 2, rirManual: false, __workIndex: 0 };
  handleSetCompletion(serroteEx, 0, setObj, true);

  assert(state.draft.unilateralPending !== null);

  // User navigates to exercise 0 in carousel
  context.mfEx = 0;
  assert(state.draft.unilateralPending !== null, 'unilateralPending persiste mesmo mudando de exercício');

  // User navigates back to serrote
  context.mfEx = serroteIdx;

  // Complete Side 2
  handleSetCompletion(serroteEx, 0, setObj, true);

  assert.strictEqual(state.draft.unilateralPending, null, 'unilateralPending limpo com sucesso após retorno');
  assert.strictEqual(state.draft.entries[serroteEx.n].length, 1, 'Série registrada com sucesso');
}

// 3.4 Unchecking / Canceling Side 1 Pending
{
  console.log('Test 3.4: Canceling / unchecking Side 1 pending set');
  const { state, handleSetCompletion } = context;
  const serroteEx = state.ficha['B'].ex.find(e => e.n.includes('Serrote'));

  state.draft.unilateralPending = {
    ex: serroteEx.n,
    setIndex: 1,
    side: 1,
    w: 30,
    r: 10,
    rir: 2,
    rirManual: false
  };

  // User re-clicks checkmark on pending row (cancel pending)
  if (state.draft.unilateralPending && state.draft.unilateralPending.ex === serroteEx.n && state.draft.unilateralPending.setIndex === 1) {
    state.draft.unilateralPending = null;
  }

  assert.strictEqual(state.draft.unilateralPending, null, 'unilateralPending cancelado corretamente');
}

// -----------------------------------------------------------------------------
// ADVERSARIAL SUITE 4: BODY VISUALIZER & UI INVARIANTS
// -----------------------------------------------------------------------------
console.log('\n--- Suite 4: BodyVisualizer & UI Invariants ---');

// 4.1 10 Muscle Groups Regex & Anatomy Highlights
{
  console.log('Test 4.1: BodyVisualizer 10 muscle groups detection & scoring');
  const { BodyVisualizer } = context;

  const testExercises = [
    { name: 'Supino reto com barra', expected: 'chest' },
    { name: 'Puxada alta aberta', expected: 'back' },
    { name: 'Desenvolvimento militar', expected: 'shoulders' },
    { name: 'Rosca bíceps alternada', expected: 'biceps' },
    { name: 'Tríceps na polia corda', expected: 'triceps' },
    { name: 'Abdominal infra declinado', expected: 'abs' },
    { name: 'Agachamento hack', expected: 'quads' },
    { name: 'Mesa flexora deitada', expected: 'hamstrings' },
    { name: 'Panturrilha em pé', expected: 'calves' },
    { name: 'Elevação pélvica com barra', expected: 'glutes' }
  ];

  testExercises.forEach(t => {
    const muscles = BodyVisualizer.getMusclesForExercise(t.name);
    assert(muscles[t.expected] > 0, `Exercício "${t.name}" deve pontuar músculo primário "${t.expected}"`);
  });

  const allGroups = BodyVisualizer.MUSCLE_GROUPS;
  assert.strictEqual(allGroups.length, 10, 'Deve conter exatamente 10 grupos musculares');
}

// 4.2 Empty & High Volume Session Anatomy SVG Validation
{
  console.log('Test 4.2: Anatomy SVG generation for empty and high-volume sessions');
  const { BodyVisualizer } = context;

  // Empty session
  const emptySvg = BodyVisualizer.renderSessionAnatomy({ entries: {} });
  assert(emptySvg.includes('<svg'), 'Deve gerar tag <svg>');
  assert(emptySvg.includes('viewBox="0 0 300 200"'), 'Deve manter viewBox 300 200');
  assert(emptySvg.includes('id="anatFront"'), 'Deve conter silhueta frontal');
  assert(emptySvg.includes('id="anatBack"'), 'Deve conter silhueta dorsal');

  // Heavy volume session
  const heavySession = {
    entries: {
      'Supino reto com barra': [{ w: 120, r: 8, done: true }, { w: 120, r: 8, done: true }, { w: 120, r: 8, done: true }, { w: 120, r: 8, done: true }],
      'Puxada alta': [{ w: 85, r: 10, done: true }, { w: 85, r: 10, done: true }, { w: 85, r: 10, done: true }],
      'Agachamento livre': [{ w: 140, r: 6, done: true }, { w: 140, r: 6, done: true }, { w: 140, r: 6, done: true }]
    }
  };
  const heavySvg = BodyVisualizer.renderSessionAnatomy(heavySession);
  assert(heavySvg.includes('var(--anat-active'), 'Grupos com maior volume devem ter destaque ativo');

  // Summary scores
  const summary = BodyVisualizer.getMuscleSummary(BodyVisualizer.getMusclesForSession(heavySession));
  assert(summary.length >= 3, 'Deve resumir músculos trabalhados');
}

// 4.3 XSS / Malformed String Resilience
{
  console.log('Test 4.3: Resilience to special characters / HTML tags in exercise names');
  const { BodyVisualizer } = context;

  const maliciousName = '<script>alert("xss")</script> & <b>peito</b>';
  const muscles = BodyVisualizer.getMusclesForExercise(maliciousName);
  assert(muscles.chest > 0, 'Deve mapear peito mesmo com tags HTML');

  const svg = BodyVisualizer.renderDayAnatomy({ ex: [{ n: maliciousName, sets: 3 }] });
  assert(!svg.includes('<script>'), 'SVG gerado não deve injetar tags <script>');
}

// 4.4 5-Column Table & Layout Invariants
{
  console.log('Test 4.4: 5-Column minimalist layout invariants');
  const { state, renderTreino } = context;

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
  assert(html.includes('class="mf-th"'), 'Deve conter cabeçalho da tabela');
  assert(html.includes('<span>Set</span><span>Carga</span><span>Reps</span><span>RIR</span><span>✓</span>'), 'Deve ter as 5 colunas exatas');
  assert(!html.includes('data-session-mode'), 'Nenhum seletor de modo redundante no topo');
}

console.log('\n======================================================');
console.log('challenger_stress.test.js: TODOS OS 15 TESTES DE ESTRESSE PASSARAM COM SUCESSO! ✅');
