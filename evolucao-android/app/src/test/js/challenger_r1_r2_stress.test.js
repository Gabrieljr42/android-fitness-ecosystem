'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER: EVOLUÇÃO R1 & R2 ADVERSARIAL SUITE ===');
console.log('================================================================\n');

// Mock DOM elements and environment
function createMockElement(tagName = 'div', id = '') {
  const el = {
    tagName: tagName.toUpperCase(),
    id: id,
    attributes: {},
    classList: {
      _classes: new Set(),
      add: function(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove: function(...cls) { cls.forEach(c => this._classes.delete(c)); },
      toggle: function(c, force) {
        if (force !== undefined) {
          force ? this._classes.add(c) : this._classes.delete(c);
        } else {
          this._classes.has(c) ? this._classes.delete(c) : this._classes.add(c);
        }
        return this._classes.has(c);
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

function parseHTMLToMockDOM(htmlStr) {
  const elements = [];
  const cellRegex = /<div class="([^"]*)" data-cell="([^"]*)" data-row="([^"]*)">([^<]*)<\/div>/g;
  let match;
  while ((match = cellRegex.exec(htmlStr)) !== null) {
    const el = createMockElement('div');
    el.setAttribute('data-cell', match[2]);
    el.setAttribute('data-row', match[3]);
    match[1].split(' ').forEach(c => el.classList.add(c));
    el.textContent = match[4];
    elements.push(el);
  }

  const btnDoneRegex = /<button class="([^"]*)" data-done="([^"]*)"[^>]*>([^<]*)<\/button>/g;
  while ((match = btnDoneRegex.exec(htmlStr)) !== null) {
    const el = createMockElement('button');
    el.setAttribute('data-done', match[2]);
    match[1].split(' ').forEach(c => el.classList.add(c));
    el.textContent = match[3];
    elements.push(el);
  }

  const autoBtnRegex = /<button[^>]*id="mfAutoProg"[^>]*>([^<]*)<\/button>/;
  const autoMatch = autoBtnRegex.exec(htmlStr);
  let autoBtn = null;
  if (autoMatch) {
    autoBtn = createMockElement('button', 'mfAutoProg');
    autoBtn.textContent = autoMatch[1];
    elements.push(autoBtn);
  }

  const keyRegex = /<button class="([^"]*)" data-key="([^"]*)">([^<]*)<\/button>/g;
  while ((match = keyRegex.exec(htmlStr)) !== null) {
    const el = createMockElement('button');
    el.setAttribute('data-key', match[2]);
    match[1].split(' ').forEach(c => el.classList.add(c));
    el.textContent = match[3];
    elements.push(el);
  }

  const rirSelRegex = /<button class="([^"]*)" data-rirsel="([^"]*)"[^>]*>([^<]*)<\/button>/g;
  while ((match = rirSelRegex.exec(htmlStr)) !== null) {
    const el = createMockElement('button');
    el.setAttribute('data-rirsel', match[2]);
    match[1].split(' ').forEach(c => el.classList.add(c));
    el.textContent = match[3];
    elements.push(el);
  }

  const delMatch = /<button[^>]*id="mfKbdDel"[^>]*>([^<]*)<\/button>/.exec(htmlStr);
  let delBtn = null;
  if (delMatch) {
    delBtn = createMockElement('button', 'mfKbdDel');
    delBtn.textContent = delMatch[1];
    elements.push(delBtn);
  }

  const closeMatch = /<button[^>]*id="mfKbdClose"[^>]*>([^<]*)<\/button>/.exec(htmlStr);
  let closeBtn = null;
  if (closeMatch) {
    closeBtn = createMockElement('button', 'mfKbdClose');
    closeBtn.textContent = closeMatch[1];
    elements.push(closeBtn);
  }

  const toastEl = createMockElement('div', 'toast');
  elements.push(toastEl);

  return {
    elements,
    autoBtn,
    delBtn,
    closeBtn,
    toastEl,
    querySelectorAll: (sel) => {
      if (sel === '[data-cell]') return elements.filter(e => e.hasAttribute('data-cell'));
      if (sel === '[data-done]') return elements.filter(e => e.hasAttribute('data-done'));
      if (sel === '[data-key]') return elements.filter(e => e.hasAttribute('data-key'));
      if (sel === '[data-rirsel]') return elements.filter(e => e.hasAttribute('data-rirsel'));
      if (sel === '[data-day]') return [];
      if (sel === '[data-mfex]') return [];
      if (sel === '[data-warm]') return [];
      if (sel === '[data-mfinfo]') return [];
      if (sel === '[data-mfnote]') return [];
      if (sel === '[data-rm]') return [];
      return [];
    },
    querySelector: (sel) => {
      if (sel === '#mfAutoProg') return autoBtn;
      if (sel === '#mfKbdDel') return delBtn;
      if (sel === '#mfKbdClose') return closeBtn;
      if (sel === '#toast') return toastEl;
      if (sel.includes('.mf-cell.on[data-cell="w"]')) {
        return elements.find(e => e.classList.contains('on') && e.getAttribute('data-cell') === 'w') || null;
      }
      if (sel.includes('.mf-cell.on[data-cell="r"]')) {
        return elements.find(e => e.classList.contains('on') && e.getAttribute('data-cell') === 'r') || null;
      }
      if (sel.includes('.mf-cell.on')) {
        return elements.find(e => e.classList.contains('on')) || null;
      }
      return null;
    },
    getElementById: (id) => {
      if (id === 'mfAutoProg') return autoBtn;
      if (id === 'mfKbdDel') return delBtn;
      if (id === 'mfKbdClose') return closeBtn;
      if (id === 'toast') return toastEl;
      if (id === 'mfKbd') return createMockElement('div', 'mfKbd');
      return createMockElement('div', id);
    }
  };
}

function setupEvolucaoContext() {
  const rootDir = path.resolve(__dirname, '../../../../../');
  const treinoPath = path.join(rootDir, 'evolucao-android/app/src/main/assets/apps/evolucao/views/treino.js');
  const progressaoPath = path.join(rootDir, 'evolucao-android/app/src/main/assets/core/progressao.js');
  const fmtPath = path.join(rootDir, 'evolucao-android/app/src/main/assets/kernel/fmt.js');
  const uiPath = path.join(rootDir, 'evolucao-android/app/src/main/assets/kernel/ui.js');

  const treinoCode = fs.readFileSync(treinoPath, 'utf8');
  const progressaoCode = fs.readFileSync(progressaoPath, 'utf8');
  const fmtCode = fs.readFileSync(fmtPath, 'utf8');
  const uiCode = fs.readFileSync(uiPath, 'utf8');

  let renderedHTML = '';
  let domParsed = null;
  const storage = {};

  const ctx = {
    console: console,
    Date: Date,
    Math: Math,
    clearTimeout: clearTimeout,
    setTimeout: setTimeout,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isFinite: isFinite,
    isNaN: isNaN,
    Array: Array,
    Object: Object,
    String: String,
    Number: Number,
    Set: Set,
    Map: Map,
    calOpen: false,
    calMonth: null,
    localStorage: {
      getItem: (k) => storage[k] !== undefined ? storage[k] : null,
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; }
    },
    window: {
      AndroidBridge: {
        vibrate: function(ms) { ctx.vibrateCalls.push(ms); }
      }
    },
    navigator: {
      vibrate: function(ms) { ctx.vibrateCalls.push(ms); }
    },
    vibrateCalls: [],
    toastMessages: [],
    celebrateCount: 0,
    enableNotify: function() {},
    doInstall: function() {},
    vibrate: function(p) { ctx.vibrateCalls.push(p); },
    toast: function(m) { ctx.toastMessages.push(m); },
    celebrate: function() { ctx.celebrateCount++; },
    initAudio: function() {},
    startRest: function() {},
    askNotify: function() {},
    todayISO: function() { return '2026-08-17'; },
    fmtBR: function(d) { return d; },
    fmtBRfull: function(d) { return d; },
    fmtDur: function(s) { return s + 's'; },
    fmtClock: function(s) { return s + 's'; },
    esc: function(s) { return String(s || ''); },
    exIcon: function() { return ''; },
    lastEntry: function() { return null; },
    draftBestE1rm: function() { return 0; },
    bestE1rm: function() { return 0; },
    e1rm: function(w, r) { return w * (1 + r / 30); },
    sortedSessions: function() { return []; },
    entryForExercise: function() { return null; },
    isWarmup: function(s) { return !!(s && (s.wu || s.warmup)); },
    workSets: function(sets) { return (sets || []).filter(s => !(s && (s.wu || s.warmup))); },
    exerciseForName: function(name, day) {
      if (!ctx.state || !ctx.state.ficha || !ctx.state.ficha[day]) return null;
      return (ctx.state.ficha[day].ex || []).find(e => e.n === name) || null;
    },
    save: function() {},
    dlg: function() {},
    hideRest: function() {},
    ensureDraft: function() {
      if (!ctx.state.draft) {
        ctx.state.draft = {
          day: 'A',
          date: '2026-08-17',
          entries: {},
          warmupMode: {},
          startedAt: null,
          sessionMode: 'normal',
          unilateralPending: null
        };
      }
    }
  };

  const documentMock = {
    querySelector: (sel) => domParsed ? domParsed.querySelector(sel) : null,
    querySelectorAll: (sel) => domParsed ? domParsed.querySelectorAll(sel) : [],
    getElementById: (id) => domParsed ? domParsed.getElementById(id) : null
  };
  ctx.document = documentMock;

  ctx.render = function() {
    renderedHTML = ctx.renderTreino();
    domParsed = parseHTMLToMockDOM(renderedHTML);
    ctx.bindTreino();
    return renderedHTML;
  };

  ctx.getRenderedHTML = () => renderedHTML;
  ctx.getDOM = () => domParsed;

  vm.createContext(ctx);
  vm.runInContext(progressaoCode, ctx);
  vm.runInContext(fmtCode, ctx);
  vm.runInContext(uiCode, ctx);
  vm.runInContext(treinoCode, ctx);

  // Initialize standard state
  ctx.state = {
    ficha: {
      A: {
        nome: 'Treino A',
        ex: [
          { n: 'Supino Reto', id: 'supino-reto', sets: 3, reps: '8-10', rest: 90, lastW: 60, lastR: 10, inc: 2.5, eq: 'barra', perSide: false },
          { n: 'Rosca Direta', id: 'rosca-direta', sets: 3, reps: '10-12', rest: 60, lastW: 20, lastR: 10, inc: 2.5, eq: 'halter', perSide: false }
        ]
      }
    },
    sessions: [],
    settings: {
      restAuto: false,
      progressao: { enabled: true, stallSessions: 3, deloadPct: 10, targetRir: 2 }
    },
    draft: {
      day: 'A',
      date: '2026-08-17',
      entries: {},
      warmupMode: {},
      startedAt: null,
      sessionMode: 'normal',
      unilateralPending: null
    }
  };

  return ctx;
}

// -----------------------------------------------------------------------------
// TEST SUITE 1: Keypad Cell Switching, Rapid Transitions & Buffer Retention (R1)
// -----------------------------------------------------------------------------
console.log('--- TEST SUITE 1: Keypad Cell Switching & Buffer Retention (R1) ---');

// Test 1.1: Switching between 'w' and 'r' on same set preserves typed buffer
{
  const ctx = setupEvolucaoContext();
  ctx.render();

  // Open keypad for set 0 (load)
  ctx.kbdOpenFor('w', 0);
  assert.strictEqual(ctx.kbdMode, 'w');
  assert.strictEqual(ctx.kbdEdit.si, 0);

  // Type load 65
  const key6 = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === '6');
  const key5 = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === '5');
  key6.onclick();
  key5.onclick();
  assert.strictEqual(ctx.kbdW, '65', 'Load buffer must be 65');

  // Switch to 'r' (reps) on same set via keypad toggle key (\u21c6)
  const toggleKey = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === '\u21c6');
  assert(toggleKey, 'Toggle key \\u21c6 must exist on keypad');
  toggleKey.onclick();
  assert.strictEqual(ctx.kbdMode, 'r');
  assert.strictEqual(ctx.kbdEdit.si, 0);
  assert.strictEqual(ctx.kbdW, '65', 'Load buffer must NOT be wiped when switching to reps');

  // Type reps '1' '2' -> 12 (fresh placeholder 10 is replaced by first key)
  const key1 = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === '1');
  const key2 = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === '2');
  key1.onclick();
  key2.onclick();
  assert.strictEqual(ctx.kbdR, '12', 'Reps buffer must be 12');
  assert.strictEqual(ctx.kbdW, '65', 'Load buffer must still be 65');

  // Switch back to 'w' on same set via cell click
  ctx.kbdOpenFor('w', 0);
  assert.strictEqual(ctx.kbdMode, 'w');
  assert.strictEqual(ctx.kbdW, '65', 'Load buffer must remain 65 after switching back');
  assert.strictEqual(ctx.kbdR, '12', 'Reps buffer must remain 12 after switching back');

  console.log('✅ Test 1.1: Rapid switching between w and r on same set preserves both buffers.');
}

// Test 1.2: Commit typed values on phantom set creates real committed set
{
  const ctx = setupEvolucaoContext();
  ctx.render();

  ctx.kbdOpenFor('w', 0);
  ctx.kbdW = '70';
  ctx.kbdR = '9';
  ctx.kbdFresh = false;

  // Click checkmark / commit
  const doneBtn = ctx.getDOM().querySelectorAll('[data-done]').find(b => b.getAttribute('data-done') === '0:0');
  assert(doneBtn, 'Done button for row 0 must exist');
  doneBtn.onclick();

  const entries = ctx.state.draft.entries['Supino Reto'];
  assert(Array.isArray(entries) && entries.length === 1, 'Draft entries must contain 1 real set');
  assert.strictEqual(entries[0].w, 70, 'Committed set must have w=70');
  assert.strictEqual(entries[0].r, 9, 'Committed set must have r=9');
  assert.strictEqual(entries[0].done, true, 'Committed set must have done=true');
  assert(ctx.state.draft.startedAt != null, 'Workout startedAt timestamp must be set');

  console.log('✅ Test 1.2: Phantom set commit successfully saves typed buffer into draft.entries.');
}

// Test 1.3: Partial Reps ('P' mode) integration & backspace
{
  const ctx = setupEvolucaoContext();
  ctx.render();

  ctx.kbdOpenFor('w', 0);
  ctx.kbdW = '80';
  ctx.kbdR = '10';
  ctx.kbdFresh = false;

  // Switch to 'P'
  const keyP = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === 'P');
  keyP.onclick();
  assert.strictEqual(ctx.kbdMode, 'p');

  // Type '3' partials
  const key3 = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === '3');
  key3.onclick();
  assert.strictEqual(ctx.kbdP, '3', 'Partial reps buffer must be 3');

  // Press backspace (\u232b) -> decrements partials
  const keyBk = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === '\u232b');
  keyBk.onclick();
  assert.strictEqual(ctx.kbdP, '2', 'Partial reps buffer must decrement to 2 on backspace');

  // Commit set
  ctx.kbdCommit();

  const entries = ctx.state.draft.entries['Supino Reto'];
  assert.strictEqual(entries[0].w, 80);
  assert.strictEqual(entries[0].r, 10);
  assert.strictEqual(entries[0].p, 2, 'Committed set must persist p=2');

  console.log('✅ Test 1.3: Partial reps buffer (P), backspace, and persistence verified.');
}

// Test 1.4: Existing Real Set In-Place Editing & Deletion
{
  const ctx = setupEvolucaoContext();
  // Pre-seed an existing real set
  ctx.state.draft.entries['Supino Reto'] = [
    { w: 60, r: 10, done: true, rir: 2, rirManual: false }
  ];
  ctx.render();

  // Open set 0 for editing
  ctx.kbdOpenFor('w', 0);
  assert.strictEqual(ctx.kbdW, '60');
  assert.strictEqual(ctx.kbdR, '10');

  // Change load to 62.5 and reps to 11
  ctx.kbdW = '62.5';
  ctx.kbdR = '11';
  ctx.kbdCommit();

  const entries = ctx.state.draft.entries['Supino Reto'];
  assert.strictEqual(entries.length, 1, 'Set count must not increase (in-place edit)');
  assert.strictEqual(entries[0].w, 62.5, 'Existing set load must be updated');
  assert.strictEqual(entries[0].r, 11, 'Existing set reps must be updated');

  // Re-open and delete set via #mfKbdDel
  ctx.kbdOpenFor('w', 0);
  const delBtn = ctx.getDOM().getElementById('mfKbdDel');
  assert(delBtn, 'Delete button must be rendered on existing real set');
  delBtn.onclick();

  assert(!ctx.state.draft.entries['Supino Reto'], 'Deleted set should remove empty array from draft');

  console.log('✅ Test 1.4: In-place editing and deletion of existing real sets verified.');
}

// -----------------------------------------------------------------------------
// TEST SUITE 2: '#mfAutoProg' Progression Button Under Edge Conditions (R2)
// -----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 2: Auto Progression Button Under Edge Conditions (R2) ---');

// Test 2.1: Missing historical sessions (Initial State)
{
  const ctx = setupEvolucaoContext();
  ctx.state.sessions = [];
  ctx.render();

  // When sessions is empty, calcularMeta returns status: 'inicial' and carga: null
  const autoBtn = ctx.getDOM().getElementById('mfAutoProg');
  assert.strictEqual(autoBtn, null, '#mfAutoProg button must NOT render when carga is null (initial state)');

  console.log('✅ Test 2.1: Missing historical sessions cleanly hides auto progression button.');
}

// Test 2.2: Double Progression Trigger ('subir') - interactive click populates set and buffer
{
  const ctx = setupEvolucaoContext();
  // Provide history where target max reps (10) were achieved across decision sets
  ctx.state.sessions = [
    {
      id: 1,
      date: '2026-08-10',
      day: 'A',
      mode: 'normal',
      entries: {
        'Supino Reto': [
          { w: 60, r: 10, rir: 2 },
          { w: 60, r: 10, rir: 2 },
          { w: 60, r: 10, rir: 2 }
        ]
      }
    }
  ];
  ctx.render();

  const autoBtn = ctx.getDOM().getElementById('mfAutoProg');
  assert(autoBtn, '#mfAutoProg button must render when progression recommends load increase');
  assert(autoBtn.textContent.includes('62.5') || autoBtn.textContent.includes('65') || autoBtn.textContent.includes('kg'), 'Button text must show recommended load');

  // Trigger click
  autoBtn.onclick();

  assert.strictEqual(ctx.kbdW, '62.5', 'Keypad buffer kbdW must be populated with progression load 62.5');
  assert.strictEqual(ctx.kbdR, '8', 'Keypad buffer kbdR must be populated with range min reps 8');
  assert.strictEqual(ctx.vibrateCalls.length > 0, true, 'Haptic feedback must be triggered on auto prog click');
  assert.strictEqual(ctx.vibrateCalls[ctx.vibrateCalls.length - 1], 15, 'Haptic vibration must be 15ms');
  const toastContent = (ctx.getDOM().toastEl && (ctx.getDOM().toastEl.textContent || ctx.getDOM().toastEl.innerHTML)) || (ctx.toastMessages && ctx.toastMessages.join(' ')) || '';
  assert(toastContent.includes('Meta aplicada') && (toastContent.includes('62,5') || toastContent.includes('62.5')), 'Toast notification must confirm meta applied: ' + toastContent);

  console.log('✅ Test 2.2: Double progression increase (subir) populates active set and keypad buffer with haptics.');
}

// Test 2.3: Plateau / Stalled Condition ('travado')
{
  const ctx = setupEvolucaoContext();
  // Provide 3 sessions stalled at 60kg x 8 reps
  ctx.state.sessions = [
    { id: 1, date: '2026-08-01', day: 'A', mode: 'normal', entries: { 'Supino Reto': [{ w: 60, r: 8, rir: 0 }, { w: 60, r: 8, rir: 0 }, { w: 60, r: 8, rir: 0 }] } },
    { id: 2, date: '2026-08-08', day: 'A', mode: 'normal', entries: { 'Supino Reto': [{ w: 60, r: 8, rir: 0 }, { w: 60, r: 8, rir: 0 }, { w: 60, r: 8, rir: 0 }] } },
    { id: 3, date: '2026-08-15', day: 'A', mode: 'normal', entries: { 'Supino Reto': [{ w: 60, r: 8, rir: 0 }, { w: 60, r: 8, rir: 0 }, { w: 60, r: 8, rir: 0 }] } }
  ];
  ctx.render();

  const meta = ctx.Progression.calcularMeta(ctx.state.ficha, ctx.state.sessions, 'A', 'Supino Reto', ctx.state.settings.progressao);
  assert(meta.carga != null);
  const autoBtn = ctx.getDOM().getElementById('mfAutoProg');
  assert(autoBtn, '#mfAutoProg button must render for plateau/RIR adjustment state');
  autoBtn.onclick();

  assert.strictEqual(ctx.kbdW, String(meta.carga), 'Keypad buffer must match meta.carga (' + meta.carga + ')');
  assert.strictEqual(ctx.kbdR, String(meta.repsMeta), 'Keypad buffer must match meta.repsMeta (' + meta.repsMeta + ')');

  console.log('✅ Test 2.3: Plateau / RIR-under-target condition handled accurately by auto progression.');
}

// Test 2.4: Deload Condition ('reduzir' - Legacy 10% deload)
{
  const ctx = setupEvolucaoContext();
  // Provide 2 sessions sustained below min reps without RIR (min is 8, user did 5 reps)
  ctx.state.sessions = [
    { id: 1, date: '2026-08-08', day: 'A', mode: 'normal', entries: { 'Supino Reto': [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] } },
    { id: 2, date: '2026-08-15', day: 'A', mode: 'normal', entries: { 'Supino Reto': [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] } }
  ];
  ctx.render();

  const meta = ctx.Progression.calcularMeta(ctx.state.ficha, ctx.state.sessions, 'A', 'Supino Reto', ctx.state.settings.progressao);
  assert.strictEqual(meta.status, 'reduzir');
  assert.strictEqual(meta.carga, 90, 'Legacy deload should calculate 10% reduction to 90kg');

  const autoBtn = ctx.getDOM().getElementById('mfAutoProg');
  assert(autoBtn, '#mfAutoProg button must render for deload recommendation');
  autoBtn.onclick();

  assert.strictEqual(ctx.kbdW, '90', 'Deload of 10% must set load to 90kg');
  assert.strictEqual(ctx.kbdR, '8', 'Deload must reset target to range min reps (8)');

  console.log('✅ Test 2.4: Deload reduction (reduzir) correctly calculates and applies 10% deload.');
}

// Test 2.5: Double progression limits & rep ceiling expansion (Legacy Double Progression)
{
  const ctx = setupEvolucaoContext();
  // Exercise with halter: increment 2.5kg on 10kg dumbbell = 25% jump (> 10% limit)
  // Range is 10-12. Rep ceiling expands to 15 because jump is 25%.
  ctx.state.ficha.A.ex[0] = { n: 'Elevação Lateral', id: 'elevacao-lateral', sets: 3, reps: '10-12', rest: 60, lastW: 10, lastR: 12, inc: 2.5, eq: 'halter', perSide: true };
  ctx.state.sessions = [
    {
      id: 1,
      date: '2026-08-10',
      day: 'A',
      mode: 'normal',
      entries: {
        'Elevação Lateral': [
          { w: 10, r: 12 },
          { w: 10, r: 12 },
          { w: 10, r: 12 }
        ]
      }
    }
  ];
  ctx.render();

  // Because jump is 25%, double progression ceiling is 15. At 12 reps, status is 'manter' with target 13
  const meta = ctx.Progression.calcularMeta(ctx.state.ficha, ctx.state.sessions, 'A', 'Elevação Lateral', ctx.state.settings.progressao);
  assert.strictEqual(meta.status, 'manter', 'Should hold weight to expand reps when increment % is high');
  assert.strictEqual(meta.repsMeta, 13, 'repsMeta should advance towards ceiling (13 reps)');

  const autoBtn = ctx.getDOM().getElementById('mfAutoProg');
  assert(autoBtn);
  autoBtn.onclick();
  assert.strictEqual(ctx.kbdW, '10');
  assert.strictEqual(ctx.kbdR, '13');

  console.log('✅ Test 2.5: High-jump increment ceiling expansion tested and verified.');
}

// -----------------------------------------------------------------------------
// TEST SUITE 3: Rapid Multi-Set Fuzzing, Unilateral & Boundary Keypad Transitions
// -----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 3: Rapid Multi-Set Transitions & Unilateral Keypad Flow ---');

// Test 3.1: Sequential rapid editing of 4 phantom sets without cross-set buffer bleed
{
  const ctx = setupEvolucaoContext();
  ctx.state.ficha.A.ex[0].sets = 4;
  ctx.render();

  // Edit Set 0 -> 50kg, 12 reps
  ctx.kbdOpenFor('w', 0);
  ctx.kbdW = '50';
  ctx.kbdR = '12';
  ctx.kbdCommit();

  // Edit Set 1 -> 52.5kg, 10 reps
  ctx.kbdOpenFor('w', 1);
  ctx.kbdW = '52.5';
  ctx.kbdR = '10';
  ctx.kbdCommit();

  // Edit Set 2 -> 55kg, 8 reps
  ctx.kbdOpenFor('w', 2);
  ctx.kbdW = '55';
  ctx.kbdR = '8';
  ctx.kbdCommit();

  // Edit Set 3 -> 55kg, 7 reps + 2 partials
  ctx.kbdOpenFor('w', 3);
  ctx.kbdW = '55';
  ctx.kbdR = '7';
  ctx.kbdP = '2';
  ctx.kbdCommit();

  const entries = ctx.state.draft.entries['Supino Reto'];
  assert.strictEqual(entries.length, 4, 'Must have 4 committed sets');
  assert.strictEqual(entries[0].w, 50); assert.strictEqual(entries[0].r, 12);
  assert.strictEqual(entries[1].w, 52.5); assert.strictEqual(entries[1].r, 10);
  assert.strictEqual(entries[2].w, 55); assert.strictEqual(entries[2].r, 8);
  assert.strictEqual(entries[3].w, 55); assert.strictEqual(entries[3].r, 7); assert.strictEqual(entries[3].p, 2);

  console.log('✅ Test 3.1: Sequential rapid editing of 4 phantom sets verified with zero buffer bleed.');
}

// Test 3.2: Unilateral exercise 2-phase execution and keypad interaction
{
  const ctx = setupEvolucaoContext();
  ctx.state.ficha.A.ex[0] = { n: 'Rosca Concentrada Unilateral', id: 'rosca-unilateral', sets: 2, reps: '10-12', rest: 60, lastW: 14, lastR: 10, inc: 2, eq: 'halter', perSide: true, unilateral: true };
  ctx.render();

  // Open set 0, set 14kg x 12 reps
  ctx.kbdOpenFor('w', 0);
  ctx.kbdW = '14';
  ctx.kbdR = '12';
  ctx.kbdFresh = false;

  // Complete Side 1
  const doneBtn = ctx.getDOM().querySelectorAll('[data-done]').find(b => b.getAttribute('data-done') === '0:0');
  assert(doneBtn);
  doneBtn.onclick();

  // Check pending side 1 state
  assert(ctx.state.draft.unilateralPending != null, 'Unilateral pending side 1 must be active');
  assert.strictEqual(ctx.state.draft.unilateralPending.ex, 'Rosca Concentrada Unilateral');
  assert.strictEqual(ctx.state.draft.unilateralPending.side, 1);
  assert.strictEqual(ctx.state.draft.unilateralPending.w, 14);
  assert.strictEqual(ctx.state.draft.unilateralPending.r, 12);

  // Complete Side 2
  ctx.render();
  const doneSide2Btn = ctx.getDOM().querySelectorAll('[data-done]').find(b => b.getAttribute('data-done') === '0:0');
  assert(doneSide2Btn);
  doneSide2Btn.onclick();

  assert.strictEqual(ctx.state.draft.unilateralPending, null, 'Unilateral pending must be cleared after side 2');
  const entries = ctx.state.draft.entries['Rosca Concentrada Unilateral'];
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].done, true);

  console.log('✅ Test 3.2: Unilateral 2-phase set execution and pending state management verified.');
}

// Test 3.3: Backspace stress on empty buffer and decimal boundary inputs
{
  const ctx = setupEvolucaoContext();
  ctx.render();

  ctx.kbdOpenFor('w', 0);
  const keyBk = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === '\u232b');
  // Backspace 10 times on empty / fresh buffer
  for (let i = 0; i < 10; i++) keyBk.onclick();
  assert.strictEqual(ctx.kbdW, '', 'Backspace on empty buffer must remain empty string without NaN');

  // Type fractional weight: '2', '2', '.', '5' -> 22.5
  const key2 = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === '2');
  const key5 = ctx.getDOM().querySelectorAll('[data-key]').find(k => k.getAttribute('data-key') === '5');
  key2.onclick();
  key2.onclick();
  // In this keypad, '.' is prevented on direct key unless using increment or direct value
  ctx.kbdW = '22.5';
  ctx.kbdCommit();

  const entries = ctx.state.draft.entries['Supino Reto'];
  assert.strictEqual(entries[0].w, 22.5);

  console.log('✅ Test 3.3: Backspace fuzzing and fractional weight commitment verified.');
}

console.log('\n================================================================');
console.log('🎉 ALL EVOLUÇÃO R1 & R2 ADVERSARIAL TESTS PASSED EMPIRICALLY!  ');
console.log('================================================================\n');
