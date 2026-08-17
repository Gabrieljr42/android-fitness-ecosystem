'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 2: EVOLUÇÃO (R1 & R2) STRESS TEST  ===');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// DOM & ENVIRONMENT MOCK INFRASTRUCTURE
// -----------------------------------------------------------------------------
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
    configurable: true,
    get: function() { return this._innerHTML; },
    set: function(val) {
      this._innerHTML = val;
      this.children = [];
    }
  });

  return el;
}

function parseHTMLToDOM(htmlString) {
  const domNodes = [];
  // Match any opening HTML tag with attributes: <tag attr="val" ...>
  const openTagRegex = /<([a-zA-Z0-9_-]+)(\s+[^>]*)?>/g;
  let match;
  while ((match = openTagRegex.exec(htmlString)) !== null) {
    const tag = match[1];
    const rawAttrs = match[2] || '';
    
    const node = createMockElement(tag);
    
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
      const attrName = attrMatch[1];
      const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : '';
      node.setAttribute(attrName, attrVal);
      if (attrName === 'class') {
        attrVal.split(/\s+/).filter(Boolean).forEach(c => node.classList.add(c));
      }
      if (attrName === 'id') {
        node.id = attrVal;
      }
    }
    domNodes.push(node);
  }
  return domNodes;
}

// -----------------------------------------------------------------------------
// SETUP VM CONTEXT WITH EVOLUÇÃO FILES
// -----------------------------------------------------------------------------
const rootDir = path.resolve(__dirname, '../../../../../');
const evolucaoDir = path.join(rootDir, 'evolucao-android/app/src/main/assets');

const logicCode = fs.readFileSync(path.join(evolucaoDir, 'apps/evolucao/logic.js'), 'utf8');
const dadosCode = fs.readFileSync(path.join(evolucaoDir, 'apps/evolucao/dados.js'), 'utf8');
const fmtCode = fs.readFileSync(path.join(evolucaoDir, 'kernel/fmt.js'), 'utf8');
const iconsCode = fs.readFileSync(path.join(evolucaoDir, 'kernel/icons.js'), 'utf8');
const notifCode = fs.readFileSync(path.join(evolucaoDir, 'kernel/notif.js'), 'utf8');
const chartsCode = fs.readFileSync(path.join(evolucaoDir, 'kernel/charts.js'), 'utf8');
const dbCode = fs.readFileSync(path.join(evolucaoDir, 'kernel/db.js'), 'utf8');
const uiCode = fs.readFileSync(path.join(evolucaoDir, 'kernel/ui.js'), 'utf8');
const treinoCode = fs.readFileSync(path.join(evolucaoDir, 'apps/evolucao/views/treino.js'), 'utf8');
const progressaoCode = fs.readFileSync(path.join(evolucaoDir, 'core/progressao.js'), 'utf8');
const bodyVisCode = fs.readFileSync(path.join(evolucaoDir, 'apps/evolucao/body-visualizer.js'), 'utf8');

function createEvolucaoSandbox() {
  const mockStorage = {};
  const mockLocalStorage = {
    getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
  };

  let renderedHTML = '';
  let domNodes = [];
  const vibrationCalls = [];
  const toastCalls = [];
  const dialogCalls = [];

  const appDiv = createMockElement('div');
  appDiv.setAttribute('id', 'app');
  const toastDiv = createMockElement('div');
  toastDiv.setAttribute('id', 'toast');
  const dlgBackDiv = createMockElement('div');
  dlgBackDiv.setAttribute('id', 'dlgBack');
  const dlgBoxDiv = createMockElement('div');
  dlgBoxDiv.setAttribute('id', 'dlg');

  let cachedDlgNodes = [];
  Object.defineProperty(dlgBoxDiv, 'innerHTML', {
    configurable: true,
    get: function() { return this._innerHTML || ''; },
    set: function(val) {
      this._innerHTML = val;
      this.children = [];
      cachedDlgNodes = parseHTMLToDOM(val);
    }
  });
  dlgBoxDiv.querySelectorAll = (sel) => {
    if (!sel) return [];
    if (sel.startsWith('[')) {
      const match = sel.match(/\[([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?\]/);
      if (match) {
        const attr = match[1], val = match[2];
        return cachedDlgNodes.filter(n => val !== undefined ? n.getAttribute(attr) === val : n.hasAttribute(attr));
      }
    }
    return cachedDlgNodes;
  };
  dlgBoxDiv.querySelector = (sel) => {
    const list = dlgBoxDiv.querySelectorAll(sel);
    return list[0] || null;
  };

  const docMock = {
    body: createMockElement('body'),
    getElementById: (id) => {
      if (id === 'app') return appDiv;
      if (id === 'toast') return toastDiv;
      if (id === 'dlgBack') return dlgBackDiv;
      if (id === 'dlg') return dlgBoxDiv;
      const dlgMatch = cachedDlgNodes.find(n => n.id === id);
      if (dlgMatch) return dlgMatch;
      const found = domNodes.find(n => n.id === id || n.getAttribute('id') === id);
      return found || createMockElement('div');
    },
    querySelector: (sel) => {
      if (!sel) return null;
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        return domNodes.find(n => n.id === id || n.getAttribute('id') === id) || null;
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1).split('.')[0];
        return domNodes.find(n => n.classList.contains(cls)) || null;
      }
      if (sel.startsWith('[') && sel.endsWith(']')) {
        const match = sel.slice(1, -1).match(/([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?/);
        if (match) {
          const attr = match[1], val = match[2];
          return domNodes.find(n => val !== undefined ? n.getAttribute(attr) === val : n.hasAttribute(attr)) || null;
        }
      }
      return domNodes[0] || null;
    },
    querySelectorAll: (sel) => {
      if (!sel) return [];
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return domNodes.filter(n => n.classList.contains(cls));
      }
      if (sel.startsWith('[')) {
        const match = sel.match(/\[([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?\]/);
        if (match) {
          const attr = match[1], val = match[2];
          return domNodes.filter(n => val !== undefined ? n.getAttribute(attr) === val : n.hasAttribute(attr));
        }
      }
      return [];
    },
    createElement: (tag) => createMockElement(tag),
    addEventListener: () => {}
  };

  const navMock = {
    vibrate: (pattern) => {
      vibrationCalls.push(pattern);
      return true;
    }
  };

  const winMock = {
    addEventListener: () => {},
    removeEventListener: () => {},
    isSecureContext: false,
    scrollTo: () => {},
    navigator: navMock,
    AndroidBridge: {
      vibrate: (ms) => vibrationCalls.push(`bridge:${ms}`),
      startRestNotification: () => {},
      stopRestNotification: () => {},
      restDoneNotification: () => {}
    }
  };

  const sandbox = {
    console: console,
    KEY: 'evolucao_treino_state',
    localStorage: mockLocalStorage,
    document: docMock,
    window: winMock,
    navigator: navMock,
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
    Set: Set,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    setInterval: (fn) => { return 1; },
    clearInterval: () => {},
    // UI Helpers
    toast: (msg, undo) => { toastCalls.push({ msg, undo }); },
    dlg: (cfg) => { dialogCalls.push(cfg); if (cfg.onOk) cfg.onOk(cfg.segVal || true); },
    render: () => {
      if (typeof sandbox.renderTreino === 'function') {
        renderedHTML = sandbox.renderTreino();
        domNodes = parseHTMLToDOM(renderedHTML);
        if (typeof sandbox.bindTreino === 'function') {
          sandbox.bindTreino();
        }
      }
    },
    // Metrics
    getRenderedHTML: () => renderedHTML,
    getDOMNodes: () => domNodes,
    getVibrations: () => vibrationCalls,
    getToasts: () => toastCalls,
    getDialogs: () => dialogCalls,
    mockStorage: mockStorage
  };

  vm.createContext(sandbox);

  // Load modules into VM
  vm.runInContext(progressaoCode, sandbox);
  vm.runInContext(bodyVisCode, sandbox);
  vm.runInContext(fmtCode, sandbox);
  vm.runInContext(iconsCode, sandbox);
  vm.runInContext(notifCode, sandbox);
  vm.runInContext(chartsCode, sandbox);
  vm.runInContext(dbCode, sandbox);
  vm.runInContext(dadosCode, sandbox);
  vm.runInContext(logicCode, sandbox);
  vm.runInContext(uiCode, sandbox);
  vm.runInContext(treinoCode, sandbox);

  return sandbox;
}

// =============================================================================
// SUITE 1: Carousel Switching & Table Synchronization
// =============================================================================
console.log('--- SUITE 1: Carousel Switching & Table Synchronization ---');
{
  const sb = createEvolucaoSandbox();
  
  // Initialize state
  sb.state = sb.loadState ? sb.loadState() : sb.DEFAULT_STATE;
  sb.ensureDraft();
  sb.render();

  const day = sb.state.draft.day;
  const exercises = sb.state.ficha[day].ex;
  assert(exercises.length >= 3, 'Must have at least 3 exercises in workout day');

  console.log(`Testing carousel for Workout ${day} with ${exercises.length} exercises...`);

  // Verify initial exercise (index 0)
  assert.strictEqual(sb.mfEx, 0, 'Initial exercise index should be 0');
  let html = sb.getRenderedHTML();
  assert(html.includes(exercises[0].n), `Rendered HTML must contain exercise 0: ${exercises[0].n}`);
  assert(html.includes('class="mf-item on" data-mfex="0"'), 'Carousel must highlight item 0 as active');

  // Switch to exercise 1
  sb.mfEx = 1;
  sb.kbdReset();
  sb.render();
  html = sb.getRenderedHTML();
  assert.strictEqual(sb.mfEx, 1, 'Exercise index should be 1');
  assert(html.includes(exercises[1].n), `Rendered HTML must contain exercise 1: ${exercises[1].n}`);
  assert(html.includes('class="mf-item on" data-mfex="1"'), 'Carousel must highlight item 1 as active');
  assert(!html.includes('class="mf-item on" data-mfex="0"'), 'Carousel item 0 must NOT be active');

  // Verify 5-column table structure: Set | Carga | Reps | RIR | ✓
  assert(html.includes('<div class="mf-th"><span>Set</span><span>Carga</span><span>Reps</span><span>RIR</span><span>✓</span></div>'), '5-column table header must be present');

  // Switch to exercise 2
  sb.mfEx = 2;
  sb.kbdReset();
  sb.render();
  html = sb.getRenderedHTML();
  assert.strictEqual(sb.mfEx, 2, 'Exercise index should be 2');
  assert(html.includes(exercises[2].n), `Rendered HTML must contain exercise 2: ${exercises[2].n}`);
  assert(html.includes('class="mf-item on" data-mfex="2"'), 'Carousel must highlight item 2 as active');

  console.log('✅ SUITE 1 Passed: Carousel exercise selection and table rendering sync seamlessly.');
}

// =============================================================================
// SUITE 2: Keypad Buffer Modification, Cell Switching & Value Retention (R1)
// =============================================================================
console.log('\n--- SUITE 2: Keypad Buffer Retention Across Cell Switches (R1) ---');
{
  const sb = createEvolucaoSandbox();
  sb.state = sb.loadState ? sb.loadState() : sb.DEFAULT_STATE;
  sb.ensureDraft();
  sb.mfEx = 0;
  const exName = sb.state.ficha[sb.state.draft.day].ex[0].n;

  // Step 1: Open keypad for Set 0 in load ('w') mode
  sb.kbdOpenFor('w', 0);
  assert.strictEqual(sb.kbdOpen, true, 'Keypad should be open');
  assert.strictEqual(sb.kbdMode, 'w', 'Keypad mode should be w (weight/load)');
  assert.strictEqual(sb.kbdEdit.si, 0, 'Keypad should edit set index 0');

  // Step 2: Simulate typing a new load: "62.5"
  sb.kbdW = '62.5';
  sb.kbdR = '12';
  sb.kbdP = '0';
  sb.kbdRir = 3;

  // Step 3: Switch to 'r' (reps) cell on the SAME SET (si = 0)
  sb.kbdOpenFor('r', 0);
  assert.strictEqual(sb.kbdMode, 'r', 'Keypad mode should be updated to r');
  assert.strictEqual(sb.kbdEdit.si, 0, 'Keypad should still edit set index 0');
  // R1 Verification: Buffer must NOT be wiped or reverted
  assert.strictEqual(sb.kbdW, '62.5', 'kbdW MUST retain 62.5 when switching cells on the same set');
  assert.strictEqual(sb.kbdR, '12', 'kbdR MUST retain 12 when switching cells on the same set');
  assert.strictEqual(sb.kbdRir, 3, 'kbdRir MUST retain 3');

  // Step 4: Switch back to 'w' (load) cell on the SAME SET (si = 0)
  sb.kbdOpenFor('w', 0);
  assert.strictEqual(sb.kbdMode, 'w', 'Keypad mode should be updated back to w');
  assert.strictEqual(sb.kbdW, '62.5', 'kbdW MUST remain 62.5');
  assert.strictEqual(sb.kbdR, '12', 'kbdR MUST remain 12');

  // Step 5: Commit buffer via kbdCommit()
  sb.kbdCommit();

  // Verify state committed to draft.entries
  const entries = sb.state.draft.entries[exName];
  assert(entries && entries.length >= 1, 'Draft entries must contain committed set');
  const committedSet = entries[0];
  assert.strictEqual(committedSet.w, 62.5, 'Committed load must be 62.5');
  assert.strictEqual(committedSet.r, 12, 'Committed reps must be 12');
  assert.strictEqual(committedSet.rir, 3, 'Committed RIR must be 3');
  assert.strictEqual(committedSet.done, true, 'Set must be marked as done');

  // Step 6: Render table and verify HTML reflects committed values
  sb.render();
  const html = sb.getRenderedHTML();
  assert(html.includes('62,5') || html.includes('62.5'), 'Rendered table must display 62,5 kg');
  assert(html.includes('12'), 'Rendered table must display 12 reps');

  console.log('✅ SUITE 2 Passed: Keypad buffer retains modified values across cell switches without wipe.');
}

// =============================================================================
// SUITE 3: Interactive Auto Progression Button & Haptic Feedback (R2)
// =============================================================================
console.log('\n--- SUITE 3: Interactive Auto Progression Button & Haptic Feedback (R2) ---');
{
  const sb = createEvolucaoSandbox();
  sb.state = sb.loadState ? sb.loadState() : sb.DEFAULT_STATE;
  sb.ensureDraft();
  sb.mfEx = 0;
  const day = sb.state.draft.day;
  const ex = sb.state.ficha[day].ex[0];

  // Seed a previous session so Progression.calcularMeta produces a suggested load
  sb.state.sessions = [
    {
      id: Date.now() - 86400000 * 3,
      date: '2026-08-14',
      day: day,
      mode: 'normal',
      entries: {
        [ex.n]: [
          { w: 50, r: 12, done: true, rir: 2 },
          { w: 50, r: 12, done: true, rir: 2 },
          { w: 50, r: 12, done: true, rir: 2 }
        ]
      }
    }
  ];

  sb.render();
  let html = sb.getRenderedHTML();

  // Verify Auto button is rendered in HTML
  assert(html.includes('id="mfAutoProg"'), 'Auto progression button #mfAutoProg must be rendered');
  assert(html.includes('class="mf-metaauto"'), 'Auto button must have class mf-metaauto');

  // Calculate expected meta
  const meta = sb.Progression.calcularMeta(sb.state.ficha, sb.state.sessions, day, ex.n, sb.state.settings.progressao);
  assert(meta && meta.carga != null, 'Meta calculation must return a valid carga');
  console.log(`Calculated Meta for ${ex.n}: ${meta.carga} kg × ${meta.repsMeta} reps (${meta.status})`);

  // Clear vibration tracking
  const initialVibCount = sb.getVibrations().length;

  // Find the button in mocked DOM and trigger onclick
  const nodes = sb.getDOMNodes();
  const autoBtn = nodes.find(n => n.id === 'mfAutoProg' || n.getAttribute('id') === 'mfAutoProg');
  assert(autoBtn, 'Auto button node must exist in parsed DOM');
  assert(typeof autoBtn.onclick === 'function', 'Auto button must have onclick handler attached');

  // Simulate click on Auto button
  autoBtn.onclick();

  // Validate:
  // 1. kbdW and kbdR populated with meta values
  assert.strictEqual(parseFloat(sb.kbdW), meta.carga, 'kbdW must match suggested meta carga');
  assert.strictEqual(parseInt(sb.kbdR, 10), meta.repsMeta, 'kbdR must match suggested meta repsMeta');

  // 2. Haptic feedback triggered (vibrate(15))
  const newVibrations = sb.getVibrations().slice(initialVibCount);
  assert(newVibrations.length >= 1, 'Haptic feedback (vibrate) must be triggered on auto button click');
  const has15ms = newVibrations.some(v => v === 15 || v === 'bridge:15' || (Array.isArray(v) && v.includes(15)));
  assert(has15ms, 'Vibration pattern of 15ms must be invoked');

  // 3. Toast confirmation
  const toastEl = sb.document.getElementById('toast');
  const toastText = toastEl ? toastEl.textContent : '';
  const toasts = sb.getToasts();
  assert(toastText.includes('Meta aplicada') || toasts.some(t => t.msg.includes('Meta aplicada')), 'Toast notification must confirm meta applied');

  console.log('✅ SUITE 3 Passed: Auto progression button populates buffer, triggers haptic feedback and toast.');
}

// =============================================================================
// SUITE 4: Draft Serialization, Unilateral State & Session Finalization
// =============================================================================
console.log('\n--- SUITE 4: Draft Serialization & Session Finalization Invariants ---');
{
  const sb = createEvolucaoSandbox();
  sb.state = sb.loadState ? sb.loadState() : sb.DEFAULT_STATE;
  sb.ensureDraft();
  const day = sb.state.draft.day;
  const ex = sb.state.ficha[day].ex[0].n;

  // Add 3 completed sets to draft
  sb.state.draft.entries[ex] = [
    { w: 80, r: 10, done: true, rir: 2, rirManual: false },
    { w: 80, r: 9, done: true, rir: 1, rirManual: true },
    { w: 75, r: 8, p: 2, done: true, rir: 0, rirManual: true }
  ];
  sb.state.draft.startedAt = Date.now() - 3600000; // 1 hour ago
  sb.state.draft.notes = { [ex]: 'Heavy top set, good form.' };

  // Save to localStorage
  sb.save();
  const rawStored = sb.mockStorage['evolucao_treino_state'];
  assert(rawStored, 'State must be serialized to localStorage');

  // Verify deserialization integrity
  const parsed = JSON.parse(rawStored);
  assert.strictEqual(parsed.draft.entries[ex].length, 3, 'Serialized draft must have 3 entries');
  assert.strictEqual(parsed.draft.entries[ex][2].p, 2, 'Partial reps (p=2) preserved in JSON');
  assert.strictEqual(parsed.draft.entries[ex][1].rirManual, true, 'rirManual flag preserved');

  // Finalize session via promptFinishSession
  const initialSessionCount = sb.state.sessions.length;
  sb.promptFinishSession();
  const dlgOk = sb.document.getElementById('dlgOk');
  if (dlgOk && typeof dlgOk.onclick === 'function') {
    dlgOk.onclick();
  }

  // Verify session added and draft cleaned
  assert.strictEqual(sb.state.sessions.length, initialSessionCount + 1, 'Session must be pushed to sessions array');
  const saved = sb.state.sessions[sb.state.sessions.length - 1];
  assert.strictEqual(saved.day, day, 'Saved session day must match');
  assert.strictEqual(saved.entries[ex].length, 3, 'Saved session entries must match');
  assert.strictEqual(sb.state.draft.day, null, 'Draft must be cleared after finalization');
  assert.strictEqual(Object.keys(sb.state.draft.entries).length, 0, 'Draft entries must be empty');

  console.log('✅ SUITE 4 Passed: Draft serialization and session completion maintain 100% data integrity.');
}

// =============================================================================
// SUITE 5: Unilateral 2-Phase Execution & Vibration Pattern Verification
// =============================================================================
console.log('\n--- SUITE 5: Unilateral 2-Phase Execution & Vibration Patterns ---');
{
  const sb = createEvolucaoSandbox();
  sb.state = sb.loadState ? sb.loadState() : sb.DEFAULT_STATE;
  sb.ensureDraft();
  
  // Find or insert a unilateral exercise
  const day = sb.state.draft.day;
  let uniExIdx = sb.state.ficha[day].ex.findIndex(e => sb.isUnilateralEx(e));
  if (uniExIdx < 0) {
    sb.state.ficha[day].ex.push({
      n: 'Rosca concentrada unilateral',
      id: 'rosca-concentrada-unilateral',
      sets: 3,
      reps: '10-12',
      rest: 60,
      perSide: true,
      unilateral: true
    });
    uniExIdx = sb.state.ficha[day].ex.length - 1;
  }
  sb.mfEx = uniExIdx;
  const uniEx = sb.state.ficha[day].ex[uniExIdx];

  sb.render();
  let html = sb.getRenderedHTML();

  // Step 1: Open keypad for Set 0 (phantom row)
  sb.kbdOpenFor('w', 0);
  sb.kbdW = '14';
  sb.kbdR = '10';

  const vibCountBeforeSide1 = sb.getVibrations().length;

  // Step 2: Complete Side 1 via kbdCommit
  sb.kbdCommit();

  // Validate Side 1 pending state
  assert(sb.state.draft.unilateralPending, 'draft.unilateralPending must be set after Side 1');
  assert.strictEqual(sb.state.draft.unilateralPending.ex, uniEx.n, 'Pending exercise must match');
  assert.strictEqual(sb.state.draft.unilateralPending.side, 1, 'Pending side must be 1');

  // Verify Side 1 vibration: [25, 40, 25]
  const side1Vibs = sb.getVibrations().slice(vibCountBeforeSide1);
  assert(side1Vibs.some(v => Array.isArray(v) && v.length === 3 && v[0] === 25), 'Side 1 must trigger [25, 40, 25] vibration pattern');

  // Re-render and verify '½' indicator in HTML
  sb.render();
  html = sb.getRenderedHTML();
  assert(html.includes('½'), 'Rendered table must display 1/2 indicator for pending side 1');
  assert(html.includes('side-pending') || html.includes('mf-side-pending'), 'Pending row must have side-pending class');

  // Step 3: Complete Side 2 via checkmark click
  const vibCountBeforeSide2 = sb.getVibrations().length;
  const nodes = sb.getDOMNodes();
  const chkBtn = nodes.find(n => n.getAttribute('data-done') === `${uniExIdx}:0`);
  assert(chkBtn, 'Checkmark button for set 0 must exist');
  assert(typeof chkBtn.onclick === 'function', 'Checkmark must have onclick');

  chkBtn.onclick();

  // Validate Side 2 clears pending state and completes the set
  assert.strictEqual(sb.state.draft.unilateralPending, null, 'draft.unilateralPending must be null after Side 2');
  const entries = sb.state.draft.entries[uniEx.n];
  assert(entries && entries.length === 1, 'Draft entries must contain 1 completed set');
  assert.strictEqual(entries[0].done, true, 'Set must be completed with done=true');
  assert.strictEqual(entries[0].w, 14, 'Weight must be 14');
  assert.strictEqual(entries[0].r, 10, 'Reps must be 10');

  // Verify Side 2 vibration: 20ms
  const side2Vibs = sb.getVibrations().slice(vibCountBeforeSide2);
  assert(side2Vibs.some(v => v === 20 || v === 'bridge:20'), 'Side 2 must trigger 20ms vibration');

  console.log('✅ SUITE 5 Passed: Unilateral 2-phase execution, UI badges (½), and distinct haptic patterns verified.');
}

// =============================================================================
// SUITE 6: Multi-Exercise Carousel Switching with Dirty Buffers & Phantom Rows
// =============================================================================
console.log('\n--- SUITE 6: Carousel Dirty Buffer Isolation & Phantom Row Indexing ---');
{
  const sb = createEvolucaoSandbox();
  sb.state = sb.loadState ? sb.loadState() : sb.DEFAULT_STATE;
  sb.ensureDraft();
  const day = sb.state.draft.day;
  const ex0 = sb.state.ficha[day].ex[0].n;
  const ex1 = sb.state.ficha[day].ex[1].n;

  // Step 1: Open keypad on Exercise 0, type dirty uncommitted value: "97.5"
  sb.mfEx = 0;
  sb.kbdOpenFor('w', 0);
  sb.kbdW = '97.5';
  sb.kbdR = '6';

  // Step 2: User switches to Exercise 1 via carousel WITHOUT committing
  sb.mfEx = 1;
  sb.kbdReset(); // Carousel click handler calls kbdReset()
  sb.render();

  // Validate Exercise 1 is clean and does not have "97.5"
  assert.strictEqual(sb.kbdOpen, false, 'Keypad should be closed after carousel switch');
  assert.strictEqual(sb.kbdW, '', 'kbdW should be reset');
  assert.strictEqual(sb.state.draft.entries[ex0], undefined, 'Exercise 0 should have no phantom committed');

  // Step 3: Open keypad on Exercise 1, set 1 (second phantom row)
  sb.kbdOpenFor('w', 1);
  assert.strictEqual(sb.kbdEdit.si, 1, 'Editing set index 1');
  sb.kbdW = '42.5';
  sb.kbdR = '15';
  sb.kbdCommit();

  // Validate Exercise 1 committed set has workIndex = 1
  const ex1Entries = sb.state.draft.entries[ex1];
  assert(ex1Entries && ex1Entries.length === 1, 'Exercise 1 should have 1 committed set');
  assert.strictEqual(ex1Entries[0].w, 42.5, 'Load must be 42.5');
  assert.strictEqual(ex1Entries[0].r, 15, 'Reps must be 15');

  // Step 4: Return to Exercise 0
  sb.mfEx = 0;
  sb.kbdReset();
  sb.render();
  const html = sb.getRenderedHTML();
  assert(html.includes(ex0), 'Rendered HTML contains Exercise 0');
  assert(!html.includes('97,5') && !html.includes('97.5'), 'Uncommitted dirty buffer from earlier was safely discarded');

  console.log('✅ SUITE 6 Passed: Multi-exercise switching cleanly isolates buffers without cross-contamination.');
}

console.log('\n================================================================');
console.log('🎉 ALL EVOLUÇÃO (R1 & R2) EMPIRICAL TESTS PASSED (100%)');
console.log('================================================================');
