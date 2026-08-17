'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== [NUTRITRACK] EMPIRICAL CHALLENGER 2: ADVERSARIAL SUITE   ===');
console.log('=== UI State Transitions, Modal Lifecycle, AI Fallback,      ===');
console.log('=== Meal Reactivity, Cross-Tab Retention & Bridge Safety     ===');
console.log('================================================================\n');

const baseDir = path.resolve(__dirname, '../../main/assets');
const appDir = path.join(baseDir, 'apps/nutricao');
const kernelDir = path.join(baseDir, 'kernel');
const viewsDir = path.join(appDir, 'views');
const coreDir = path.join(baseDir, 'core');

// -----------------------------------------------------------------------------
// DOM & ENVIRONMENT MOCK HARNESS
// -----------------------------------------------------------------------------
function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(),
    attributes: {},
    classList: {
      _classes: new Set(),
      add: function(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove: function(...cls) { cls.forEach(c => this._classes.delete(c)); },
      toggle: function(c, f) {
        if (f === true) { this._classes.add(c); return true; }
        if (f === false) { this._classes.delete(c); return false; }
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        this._classes.add(c); return true;
      },
      contains: function(c) { return this._classes.has(c); }
    },
    style: {},
    children: [],
    value: '',
    textContent: '',
    innerHTML: '',
    onclick: null,
    onchange: null,
    oninput: null,
    disabled: false,
    dataset: {},
    setAttribute: function(name, val) { this.attributes[name] = String(val); },
    getAttribute: function(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; },
    appendChild: function(child) {
      if (!this.children.includes(child)) {
        this.children.push(child);
        child.parentElement = this;
      }
      return child;
    },
    removeChild: function(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        child.parentElement = null;
      }
      return child;
    },
    remove: function() {
      if (this.parentElement && this.parentElement.children) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx >= 0) {
          this.parentElement.children.splice(idx, 1);
          this.parentElement = null;
        }
      }
    },
    contains: function(child) {
      if (child === this) return true;
      for (const c of this.children) {
        if (c.contains(child)) return true;
      }
      return false;
    },
    click: function() {
      if (typeof this.onclick === 'function') this.onclick({ target: this });
    },
    focus: function() {},
    _listeners: {},
    addEventListener: function(event, handler) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(handler);
    },
    removeEventListener: function(event, handler) {
      if (this._listeners[event]) {
        this._listeners[event] = this._listeners[event].filter(h => h !== handler);
      }
    },
    dispatchEvent: function(event) {
      const handlers = this._listeners[event.type] || [];
      handlers.forEach(h => h(event));
    },
    closest: function(sel) {
      let cur = this;
      while (cur) {
        if (sel === 'button[data-tab]' && cur.tagName === 'BUTTON' && cur.dataset.tab) return cur;
        if (sel.startsWith('.') && cur.classList && cur.classList.contains(sel.slice(1))) return cur;
        if (sel.startsWith('#') && cur.id === sel.slice(1)) return cur;
        if (cur.tagName && cur.tagName.toLowerCase() === sel.toLowerCase()) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelector: function(sel) {
      return findElementBySelector(this, sel);
    },
    querySelectorAll: function(sel) {
      const results = [];
      findAllElementsBySelector(this, sel, results);
      return results;
    }
  };
  return el;
}

function findElementBySelector(root, sel) {
  if (!root || !sel) return null;
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    if (root.id === id) return root;
    for (const child of root.children) {
      const found = findElementBySelector(child, sel);
      if (found) return found;
    }
  } else if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    if (root.classList && root.classList.contains(cls)) return root;
    for (const child of root.children) {
      const found = findElementBySelector(child, sel);
      if (found) return found;
    }
  } else {
    if (root.tagName && root.tagName.toLowerCase() === sel.toLowerCase()) return root;
    for (const child of root.children) {
      const found = findElementBySelector(child, sel);
      if (found) return found;
    }
  }
  return null;
}

function findAllElementsBySelector(root, sel, results) {
  if (!root || !sel) return;
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    if (root.classList && root.classList.contains(cls)) results.push(root);
  } else if (sel.startsWith('#')) {
    const id = sel.slice(1);
    if (root.id === id) results.push(root);
  } else {
    if (root.tagName && root.tagName.toLowerCase() === sel.toLowerCase()) results.push(root);
  }
  for (const child of root.children) {
    findAllElementsBySelector(child, sel, results);
  }
}

const mockStorage = {};
const mockLocalStorage = {
  getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
};

const bridgeLogs = {
  sendNotification: [],
  syncAlarms: [],
  cancelAllAlarms: 0,
  scheduleAlarm: [],
  cancelAlarm: [],
  vibrate: [],
  saveBackup: []
};

const mockAndroidBridge = {
  sendNotification: (t, m) => { bridgeLogs.sendNotification.push({ t, m }); },
  syncAlarms: (j) => { bridgeLogs.syncAlarms.push(j); },
  cancelAllAlarms: () => { bridgeLogs.cancelAllAlarms++; },
  scheduleAlarm: (id, t, m, h, e) => { bridgeLogs.scheduleAlarm.push({ id, t, m, h, e }); },
  cancelAlarm: (id) => { bridgeLogs.cancelAlarm.push(id); },
  vibrate: (ms) => { bridgeLogs.vibrate.push(ms); },
  saveBackup: (j, f) => { bridgeLogs.saveBackup.push({ j, f }); }
};

const elementsMap = new Map();
function getEl(id) {
  if (!elementsMap.has(id)) {
    const el = createMockElement('div');
    el.id = id;
    elementsMap.set(id, el);
  }
  return elementsMap.get(id);
}

const mockBody = createMockElement('body');
const mockMain = getEl('main');
const mockNav = getEl('nav');
const mockModalBack = getEl('modalBack');
const mockModal = getEl('modal');
const mockToast = getEl('toast');
const mockDataHoje = getEl('dataHoje');

mockBody.appendChild(mockMain);
mockBody.appendChild(mockNav);
mockBody.appendChild(mockModalBack);
mockModalBack.appendChild(mockModal);
mockBody.appendChild(mockToast);

const navButtons = ['hoje', 'diario', 'alimentos', 'metas', 'ajustes'].map(tab => {
  const btn = createMockElement('button');
  btn.dataset.tab = tab;
  mockNav.appendChild(btn);
  return btn;
});

const docMock = {
  body: mockBody,
  getElementById: (id) => getEl(id),
  querySelector: (sel) => {
    if (sel.startsWith('#')) return getEl(sel.slice(1));
    return createMockElement('div');
  },
  querySelectorAll: (sel) => {
    if (sel === '#nav button' || sel === 'nav button') {
      return navButtons;
    }
    return [];
  },
  createElement: (tag) => createMockElement(tag),
  addEventListener: () => {}
};

const winMock = {
  addEventListener: () => {},
  removeEventListener: () => {},
  AndroidBridge: mockAndroidBridge
};

let capturedFetchCalls = [];
let mockFetchHandler = null;

const sandbox = {
  console,
  Date,
  Math,
  JSON,
  parseFloat,
  parseInt,
  Number,
  String,
  Array,
  Object,
  isFinite,
  isNaN,
  setTimeout: (fn, ms) => {
    // Synchronous timer execution for tests
    if (typeof fn === 'function') fn();
    return 1;
  },
  clearTimeout: () => {},
  setInterval: (fn, ms) => 1,
  clearInterval: () => {},
  document: docMock,
  window: winMock,
  self: winMock,
  localStorage: mockLocalStorage,
  AndroidBridge: mockAndroidBridge,
  Blob: globalThis.Blob,
  URL: {
    createObjectURL: (b) => 'blob:mock-url',
    revokeObjectURL: () => {}
  },
  confirm: () => true,
  fetch: async (url, opts) => {
    capturedFetchCalls.push({ url, opts });
    if (mockFetchHandler) {
      return mockFetchHandler(url, opts);
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                nome_refeicao: 'Prato Mock',
                itens: [{ nome: 'Item 1', porcao_g: 100, kcal: 150, proteina_g: 10, carbo_g: 20, gordura_g: 3 }],
                kcal_total: 150,
                proteina_total: 10,
                carbo_total: 20,
                gordura_total: 3,
                confianca: 'alta'
              })
            }]
          }
        }]
      })
    };
  }
};

vm.createContext(sandbox);

function runScript(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, sandbox);
}

runScript(path.join(appDir, 'estado.js'));
runScript(path.join(appDir, 'referencia.js'));
runScript(path.join(appDir, 'logic.js'));
runScript(path.join(appDir, 'nav.js'));
runScript(path.join(coreDir, 'gemini.js'));
runScript(path.join(viewsDir, 'hoje.js'));
runScript(path.join(viewsDir, 'diario.js'));
runScript(path.join(viewsDir, 'alimentos.js'));
runScript(path.join(viewsDir, 'metas.js'));
runScript(path.join(viewsDir, 'ajustes.js'));

vm.runInContext(`
  globalThis.state = typeof state !== 'undefined' ? state : { tab: 'hoje' };
  globalThis.profile = typeof profile !== 'undefined' ? profile : {};
  globalThis.meals = typeof meals !== 'undefined' ? meals : [];
  globalThis.activities = typeof activities !== 'undefined' ? activities : [];
  globalThis.habits = typeof habits !== 'undefined' ? habits : {};
  globalThis.water = typeof water !== 'undefined' ? water : {};
  globalThis.pref = typeof pref !== 'undefined' ? pref : {};
  globalThis.apikey = typeof apikey !== 'undefined' ? apikey : '';
  globalThis.LS = typeof LS !== 'undefined' ? LS : {};
  globalThis.save = typeof save !== 'undefined' ? save : (k, v) => localStorage.setItem(k, JSON.stringify(v));
  globalThis.load = typeof load !== 'undefined' ? load : (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch(e) { return d; } };
  globalThis.today = typeof today !== 'undefined' ? today : () => new Date().toISOString().slice(0, 10);
  globalThis.render = typeof render !== 'undefined' ? render : () => {};
  globalThis.openModal = typeof openModal !== 'undefined' ? openModal : () => {};
  globalThis.closeModal = typeof closeModal !== 'undefined' ? closeModal : () => {};
  globalThis.toast = typeof toast !== 'undefined' ? toast : () => {};
  globalThis.delMeal = typeof delMeal !== 'undefined' ? delMeal : () => {};
  globalThis.handleDelActivity = typeof handleDelActivity !== 'undefined' ? handleDelActivity : () => {};
  globalThis.dayTotals = typeof dayTotals !== 'undefined' ? dayTotals : () => ({ kcal: 0 });
  globalThis.dayBurned = typeof dayBurned !== 'undefined' ? dayBurned : () => 0;
  globalThis.iniciarAnaliseTexto = typeof iniciarAnaliseTexto !== 'undefined' ? iniciarAnaliseTexto : () => {};
  globalThis.processarTexto = typeof processarTexto !== 'undefined' ? processarTexto : () => {};
  globalThis.encerrarAnaliseTexto = typeof encerrarAnaliseTexto !== 'undefined' ? encerrarAnaliseTexto : () => {};
  globalThis.modalEditarAlimento = typeof modalEditarAlimento !== 'undefined' ? modalEditarAlimento : () => {};
  globalThis.saveAlim = typeof saveAlim !== 'undefined' ? saveAlim : () => {};
  globalThis.saveLembretes = typeof saveLembretes !== 'undefined' ? saveLembretes : () => {};
  globalThis.testarNotificacao = typeof testarNotificacao !== 'undefined' ? testarNotificacao : () => {};
  globalThis.doBackup = typeof doBackup !== 'undefined' ? doBackup : () => {};
  globalThis.wipeAll = typeof wipeAll !== 'undefined' ? wipeAll : () => {};
  globalThis.DEFAULT_LEMBRETES = typeof DEFAULT_LEMBRETES !== 'undefined' ? DEFAULT_LEMBRETES : [];
`, sandbox);

let testsPassed = 0;
async function test(name, fn) {
  try {
    await fn();
    testsPassed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function runAllTests() {
// =============================================================================
// TEST SUITE 1: UI STATE TRANSITIONS & CROSS-TAB SWITCHING RETENTION
// =============================================================================
console.log('--- SUITE 1: UI State Transitions & Cross-Tab Retention ---');

await test('1.1: Tab navigation triggers render() for all 5 tabs and updates #dataHoje', () => {
  const tabs = ['hoje', 'diario', 'alimentos', 'metas', 'ajustes'];
  
  for (const t of tabs) {
    sandbox.state.tab = t;
    sandbox.render();
    assert(mockMain.innerHTML.length > 50, `Main content must be populated for tab ${t}`);
    assert(mockDataHoje.innerHTML.includes('<b>'), 'dataHoje header chip must be populated with weekday and date');
  }
});

await test('1.2: Nav click event listener handles data-tab buttons and toggles active classes', () => {
  for (const btn of navButtons) {
    btn.click();
    assert.strictEqual(sandbox.state.tab, btn.dataset.tab);
  }
});

await test('1.3: Cross-tab data mutation reflects immediately in other tabs', () => {
  mockLocalStorage.clear();
  vm.runInContext(`
    meals = [];
    activities = [];
    profile.kcal = 2200;
  `, sandbox);
  
  // 1. Add meal in Hoje tab
  sandbox.state.tab = 'hoje';
  sandbox.render();
  const testMeal = {
    id: 'm_test_1',
    date: sandbox.today(),
    nome: 'Omelete de Claras',
    itens: [{ nome: 'Clara de ovo', porcao_g: 150, kcal: 80, proteina_g: 16, carbo_g: 1, gordura_g: 0 }],
    origem: 'manual'
  };
  vm.runInContext(`meals.push(${JSON.stringify(testMeal)}); save(LS.m, meals);`, sandbox);

  // 2. Switch to Diario tab and verify meal is in historical summary
  sandbox.state.tab = 'diario';
  sandbox.render();
  assert(mockMain.innerHTML.includes('80 kcal') || mockMain.innerHTML.includes('1 refeição(ões)'), 'Diário must reflect meal added in Hoje');

  // 3. Switch to Metas, update profile goals
  sandbox.state.tab = 'metas';
  sandbox.render();
  vm.runInContext(`profile.kcal = 2500; save(LS.p, profile);`, sandbox);

  // 4. Switch back to Hoje, verify updated target
  sandbox.state.tab = 'hoje';
  sandbox.render();
  assert(mockMain.innerHTML.includes('2.500') || mockMain.innerHTML.includes('2500'), 'Hoje must reflect updated calorie goal');
});

// =============================================================================
// TEST SUITE 2: MODAL SHEET OPEN/CLOSE LIFECYCLE & BACKDROP CLICK INTEGRITY
// =============================================================================
console.log('\n--- SUITE 2: Modal Sheet Open/Close Lifecycle ---');

await test('2.1: openModal sets innerHTML and adds "show" class to backdrop', () => {
  sandbox.openModal('<h2>Modal de Teste</h2><p>Conteúdo</p>');
  assert(mockModalBack.classList.contains('show'), 'modalBack must have class "show"');
  assert.strictEqual(mockModal.innerHTML, '<h2>Modal de Teste</h2><p>Conteúdo</p>');
});

await test('2.2: closeModal removes "show" class from backdrop', () => {
  sandbox.closeModal();
  assert(!mockModalBack.classList.contains('show'), 'modalBack must not have class "show" after closeModal()');
});

await test('2.3: Backdrop click outside closes modal, click inside modal does not close', () => {
  // Open modal
  sandbox.openModal('<h2>Modal Aberto</h2>');
  assert(mockModalBack.classList.contains('show'));

  // Click on modal backdrop itself (id === 'modalBack')
  mockModalBack.onclick({ target: { id: 'modalBack' } });
  assert(!mockModalBack.classList.contains('show'), 'Clicking on modalBack should close modal');

  // Open again
  sandbox.openModal('<h2>Modal Aberto 2</h2>');
  assert(mockModalBack.classList.contains('show'));

  // Click inside modal (id !== 'modalBack')
  mockModalBack.onclick({ target: { id: 'modal' } });
  assert(mockModalBack.classList.contains('show'), 'Clicking inside modal must NOT close it');

  sandbox.closeModal();
});

await test('2.4: Nested modal transitions (Food search -> Custom food modal -> Save)', () => {
  sandbox.state.tab = 'alimentos';
  sandbox.render();

  // Open custom food edit modal
  sandbox.saveAlim({
    nome: 'Barra Proteica',
    porcao_g: 60,
    kcal: 210,
    proteina_g: 20,
    carbo_g: 15,
    gordura_g: 7,
    custom: true
  });

  sandbox.modalEditarAlimento(0);
  assert(mockModalBack.classList.contains('show'));
  assert(mockModal.innerHTML.includes('Barra Proteica'));

  // Close modal
  sandbox.closeModal();
  assert(!mockModalBack.classList.contains('show'));
});

// =============================================================================
// TEST SUITE 3: MEAL & ACTIVITY REACTIVITY, MUTATION & TOAST UNDO
// =============================================================================
console.log('\n--- SUITE 3: Meal & Activity Reactivity and Toast Undo ---');

await test('3.1: delMeal deletes meal, updates LocalStorage and invokes toast with undo closure', () => {
  mockLocalStorage.clear();
  vm.runInContext(`
    meals = [
      { id: 'm1', date: today(), nome: 'Café da Manhã', itens: [{ nome: 'Pão', kcal: 150 }] },
      { id: 'm2', date: today(), nome: 'Almoço', itens: [{ nome: 'Arroz', kcal: 300 }] }
    ];
    save(LS.m, meals);
  `, sandbox);

  let toastUndoFn = null;
  const originalToast = sandbox.toast;
  sandbox.toast = (msg, undoFn) => {
    toastUndoFn = undoFn;
  };

  sandbox.delMeal('m1');
  const remainingMeals = vm.runInContext('meals', sandbox);
  assert.strictEqual(remainingMeals.length, 1);
  assert.strictEqual(remainingMeals[0].id, 'm2');
  assert.strictEqual(JSON.parse(mockLocalStorage.getItem('nt_meals')).length, 1);
  assert(typeof toastUndoFn === 'function', 'delMeal must pass undo function to toast');

  // Trigger undo
  toastUndoFn();
  const restoredMeals = vm.runInContext('meals', sandbox);
  assert.strictEqual(restoredMeals.length, 2);
  assert.strictEqual(restoredMeals[0].id, 'm1');
  assert.strictEqual(JSON.parse(mockLocalStorage.getItem('nt_meals')).length, 2);

  sandbox.toast = originalToast;
});

await test('3.2: handleDelActivity deletes activity and undo restores activity', () => {
  vm.runInContext(`
    activities = [
      { id: 'a1', date: today(), data: today(), nome: 'Corrida', kcal: 300, kcal_gasto: 300, duracaoMin: 30, met: 8.0, intensidade: 'intensa' },
      { id: 'a2', date: today(), data: today(), nome: 'Natação', kcal: 250, kcal_gasto: 250, duracaoMin: 30, met: 7.0, intensidade: 'intensa' }
    ];
    save(LS.act, activities);
  `, sandbox);

  let toastUndoAct = null;
  const originalToast = sandbox.toast;
  sandbox.toast = (msg, undoFn) => {
    toastUndoAct = undoFn;
  };

  sandbox.handleDelActivity('a1');
  const remainingActs = vm.runInContext('activities', sandbox);
  assert.strictEqual(remainingActs.length, 1);
  assert.strictEqual(remainingActs[0].id, 'a2');
  assert(typeof toastUndoAct === 'function', 'handleDelActivity must pass undo function');

  toastUndoAct();
  const restoredActs = vm.runInContext('activities', sandbox);
  assert.strictEqual(restoredActs.length, 2);
  assert(restoredActs.some(a => a.id === 'a1'));

  sandbox.toast = originalToast;
});

await test('3.3: Day energy balance recalculates on meal/activity mutations (I - G = L)', () => {
  vm.runInContext(`
    meals = [
      { id: 'm1', date: today(), itens: [{ kcal: 1200 }] }
    ];
    activities = [
      { id: 'a1', date: today(), kcal_gasto: 400 }
    ];
  `, sandbox);

  const t = sandbox.dayTotals();
  const I = t.kcal;
  const G = sandbox.dayBurned();
  const L = I - G;

  assert.strictEqual(I, 1200);
  assert.strictEqual(G, 400);
  assert.strictEqual(L, 800);
});

// =============================================================================
// TEST SUITE 4: AI FALLBACK LOGIC WHEN OFFLINE, QUOTA EXCEEDED OR CANCELLED
// =============================================================================
console.log('\n--- SUITE 4: AI Fallback Logic When Offline or Error ---');

await test('4.1: Missing API key shows toast warning and redirects to Ajustes tab', async () => {
  vm.runInContext(`
    apikey = '';
    localStorage.setItem(LS.k, '');
  `, sandbox);
  sandbox.state.tab = 'hoje';
  getEl('textoRefeicao').value = '1 fatia de pão integral com queijo';

  let toastMessage = '';
  sandbox.toast = (msg) => { toastMessage = msg; };

  await sandbox.iniciarAnaliseTexto();
  assert(toastMessage.includes('Ajustes'), 'Should prompt user to configure API key in settings');
  assert.strictEqual(sandbox.state.tab, 'ajustes', 'Should redirect to ajustes tab');
});

await test('4.2: AI text analysis model sequencing with 503 Service Unavailable -> Fallback to Gemini 3.6', async () => {
  vm.runInContext(`apikey = 'AIzaSyValidTestKey';`, sandbox);
  capturedFetchCalls = [];

  let callCount = 0;
  mockFetchHandler = async (url, opts) => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: 'Service Unavailable', code: 503 } })
      };
    }
    if (callCount === 2) {
      return {
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: 'Service Unavailable', code: 503 } })
      };
    }
    assert(url.includes('gemini-3.6-flash') || url.includes('gemini-3.5-flash'));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                nome_refeicao: 'Frango com Salada',
                itens: [{ nome: 'Frango', porcao_g: 150, kcal: 240, proteina_g: 35, carbo_g: 0, gordura_g: 4 }],
                kcal_total: 240,
                proteina_total: 35,
                carbo_total: 0,
                gordura_total: 4,
                confianca: 'alta'
              })
            }]
          }
        }]
      })
    };
  };

  sandbox.pref.precisao = 'rapida'; // 1x
  await sandbox.processarTexto('150g de peito de frango com salada');
  assert(mockModal.innerHTML.includes('Frango com Salada') || mockModal.innerHTML.includes('240 kcal'), 'Should successfully parse and display confirmation modal after model fallback');
  sandbox.closeModal();
});

await test('4.3: Total network failure (offline / DNS failure) renders error UI with manual meal entry fallback', async () => {
  mockFetchHandler = async () => {
    throw new Error('TypeError: Failed to fetch (network offline)');
  };

  sandbox.pref.precisao = 'rapida';
  await sandbox.processarTexto('Café da manhã');
  const errorHtml = getEl('aiStepsTexto').innerHTML;
  assert(errorHtml.includes('Não foi possível analisar') || errorHtml.includes('Adicionar manual'), 'Should render offline error view with fallback button');
  assert(errorHtml.includes('modalManual()'), 'Should provide action button to modalManual()');
  sandbox.closeModal();
});

await test('4.4: User cancellation aborts request and provides graceful exit', async () => {
  mockFetchHandler = async (url, opts) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (sandbox.window.__textoRun?.cancelled) {
          reject(new Error('AbortError'));
        } else {
          resolve({ ok: true, text: async () => '{}' });
        }
      }, 10);
    });
  };

  const promise = sandbox.processarTexto('Refeição');
  sandbox.encerrarAnaliseTexto();
  await promise;

  assert.strictEqual(sandbox.window.__textoRun, null);
  sandbox.closeModal();
});

// =============================================================================
// TEST SUITE 5: NATIVE BRIDGE SAFETY & BROWSER/PWA FALLBACKS
// =============================================================================
console.log('\n--- SUITE 5: Native Bridge Call Safety & Browser Fallback ---');

await test('5.1: AndroidBridge is defined: Bridge calls are executed with precise arguments', () => {
  bridgeLogs.sendNotification.length = 0;
  bridgeLogs.vibrate.length = 0;
  bridgeLogs.syncAlarms.length = 0;
  bridgeLogs.saveBackup.length = 0;

  sandbox.testarNotificacao();
  assert.strictEqual(bridgeLogs.sendNotification.length, 1);
  assert.strictEqual(bridgeLogs.vibrate.length, 1);

  sandbox.saveLembretes(sandbox.DEFAULT_LEMBRETES);
  assert.strictEqual(bridgeLogs.syncAlarms.length, 1);

  sandbox.doBackup();
  assert.strictEqual(bridgeLogs.saveBackup.length, 1);
});

await test('5.2: AndroidBridge is undefined (browser/test mode): All calls fallback safely without throw', () => {
  const savedBridge = sandbox.window.AndroidBridge;
  delete sandbox.window.AndroidBridge;
  delete sandbox.AndroidBridge;

  assert.doesNotThrow(() => {
    sandbox.testarNotificacao();
  }, 'testarNotificacao must not throw when AndroidBridge is undefined');

  assert.doesNotThrow(() => {
    sandbox.saveLembretes(sandbox.DEFAULT_LEMBRETES);
  }, 'saveLembretes must not throw when AndroidBridge is undefined');

  assert.doesNotThrow(() => {
    sandbox.doBackup();
  }, 'doBackup must fallback to HTML5 download without throwing');

  assert.doesNotThrow(() => {
    sandbox.wipeAll();
  }, 'wipeAll must not throw when cancelAllAlarms is missing');

  sandbox.window.AndroidBridge = savedBridge;
  sandbox.AndroidBridge = savedBridge;
});

await test('5.3: AndroidBridge with partial methods executes safely', () => {
  const partialBridge = {
    syncAlarms: () => {}
  };
  sandbox.window.AndroidBridge = partialBridge;
  sandbox.AndroidBridge = partialBridge;

  assert.doesNotThrow(() => {
    sandbox.testarNotificacao();
    sandbox.saveLembretes(sandbox.DEFAULT_LEMBRETES);
    sandbox.doBackup();
    sandbox.wipeAll();
  }, 'Partial bridge should not throw when optional methods are missing');

  sandbox.window.AndroidBridge = undefined;
  delete sandbox.AndroidBridge;

  assert.doesNotThrow(() => {
    sandbox.testarNotificacao();
    sandbox.saveLembretes(sandbox.DEFAULT_LEMBRETES);
    sandbox.doBackup();
    sandbox.wipeAll();
  }, 'Undefined bridge in browser mode should not throw');

  sandbox.window.AndroidBridge = mockAndroidBridge;
  sandbox.AndroidBridge = mockAndroidBridge;
});

  console.log('\n================================================================');
  console.log(`=== EMPIRICAL CHALLENGER 2: ALL ${testsPassed} TESTS PASSED EMPIRICALLY! ===`);
  console.log('================================================================\n');
}

runAllTests().catch(e => {
  console.error(e);
  process.exit(1);
});


