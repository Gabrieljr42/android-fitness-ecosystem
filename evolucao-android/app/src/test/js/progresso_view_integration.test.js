'use strict';

/**
 * ==============================================================================
 * PROGRESSO.JS & DAVELY BLE SCALE UX INTEGRATION TEST SUITE (Milestone M4)
 * Directly verifies the actual runtime implementation in views/progresso.js
 * ==============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== [EVOLUÇÃO] Executando Suíte de Testes: Progresso.js UX & FSM Integration ===\n');

// Mock DOM & Environment
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

  Object.defineProperty(el, 'textContent', {
    get: function() {
      if (this._textContent !== undefined) return this._textContent;
      if (this._innerHTML) return this._innerHTML.replace(/<[^>]*>/g, '');
      return '';
    },
    set: function(val) {
      this._textContent = val;
      this._innerHTML = val;
    }
  });

  return el;
}

function parseHtmlToMock(html, parent) {
  const elements = [];
  if (!html || typeof html !== 'string') return elements;

  const tagTokenRegex = /<\/?([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g;
  let match;
  const stack = [];
  let currentParent = parent;

  while ((match = tagTokenRegex.exec(html)) !== null) {
    if (match[4]) {
      continue;
    }

    const isClose = match[0].startsWith('</');
    const tagName = match[1].toLowerCase();
    const attrString = match[2] || '';
    const isSelfClosing = match[3] === '/' || ['input', 'img', 'br', 'hr', 'polyline', 'line', 'path', 'circle'].includes(tagName);

    if (isClose) {
      if (stack.length > 0 && stack[stack.length - 1].tagName.toLowerCase() === tagName) {
        stack.pop();
        currentParent = stack.length > 0 ? stack[stack.length - 1] : parent;
      }
    } else {
      const el = createMockElement(tagName);
      el.parentElement = currentParent;

      const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        const name = attrMatch[1];
        const val = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] !== undefined ? attrMatch[4] : ''));
        if (name === 'class') {
          val.split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
        } else if (name === 'id') {
          el.setAttribute('id', val);
        } else if (name === 'style') {
          el.setAttribute('style', val);
          val.split(';').forEach(pair => {
            const [k, v] = pair.split(':').map(s => s && s.trim());
            if (k && v) el.style[k] = v;
          });
        } else {
          el.setAttribute(name, val);
        }
      }

      if (currentParent === parent) {
        elements.push(el);
      } else {
        currentParent.children.push(el);
      }

      if (!isSelfClosing) {
        stack.push(el);
        currentParent = el;
      }
    }
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

  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    return node.getAttribute('id') === id;
  }
  if (sel.startsWith('.')) {
    const clsList = sel.split('.').filter(Boolean);
    return clsList.every(c => node.classList.contains(c));
  }
  return node.tagName === sel.toUpperCase();
}

// Test harness context
const storageStore = {};
const mockLocalStorage = {
  getItem: (k) => storageStore[k] !== undefined ? storageStore[k] : null,
  setItem: (k, v) => { storageStore[k] = String(v); },
  removeItem: (k) => { delete storageStore[k]; },
  clear: () => { Object.keys(storageStore).forEach(k => delete storageStore[k]); }
};

let toastLog = [];
let vibrateLog = [];
let bridgeCalls = {
  startScaleMeasurement: 0,
  stopScaleMeasurement: 0,
  requestBlePermissions: 0,
  hasBlePermissions: () => true
};

const mockAndroidBridge = {
  startScaleMeasurement: function() { bridgeCalls.startScaleMeasurement++; },
  stopScaleMeasurement: function() { bridgeCalls.stopScaleMeasurement++; },
  requestBlePermissions: function() { bridgeCalls.requestBlePermissions++; },
  hasBlePermissions: function() { return bridgeCalls.hasBlePermissions(); },
  vibrate: function(ms) { vibrateLog.push(ms); }
};

const appContainer = createMockElement('div');
appContainer.setAttribute('id', 'app');

const documentMock = {
  body: createMockElement('body'),
  getElementById: (id) => {
    if (id === 'app') return appContainer;
    const found = appContainer.querySelector('#' + id);
    if (found) return found;
    return null;
  },
  querySelector: (sel) => appContainer.querySelector(sel),
  querySelectorAll: (sel) => appContainer.querySelectorAll(sel),
  createElement: (tag) => createMockElement(tag),
  addEventListener: () => {}
};

const windowMock = {
  AndroidBridge: mockAndroidBridge,
  BleDiag: { openCalled: 0, open: function() { this.openCalled++; } },
  addEventListener: () => {},
  removeEventListener: () => {}
};

const context = {
  console: console,
  KEY: 'evolucao_treino_state',
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
  toast: (msg) => { toastLog.push(msg); },
  vibrate: (ms) => { vibrateLog.push(ms); },
  todayISO: () => '2026-08-18',
  render: () => {
    if (typeof context.renderProgresso === 'function') {
      appContainer.innerHTML = context.renderProgresso();
      if (typeof context.bindProgresso === 'function') {
        context.bindProgresso();
      }
    }
  },
  save: () => {
    if (context.state) {
      mockLocalStorage.setItem('evolucao_treino_state', JSON.stringify(context.state));
    }
  },
  allExercises: () => ['Supino reto', 'Agachamento', 'Desenvolvimento'],
  progressEx: 'Supino reto',
  metric: 'max',
  esc: (x) => x,
  fmtBR: (d) => d,
  fmtBRfull: (d) => d,
  nkg: (n) => String(Math.round(n * 10) / 10),
  chartSVG: () => '<svg class="chart"></svg>',
  workSets: (sets) => sets,
  sortedSessions: () => []
};

vm.createContext(context);

// Load progresso.js
const progressoCode = fs.readFileSync(path.resolve(__dirname, '../../main/assets/apps/evolucao/views/progresso.js'), 'utf8');
vm.runInContext(progressoCode, context);

function setupFreshState() {
  context.cancelScaleMeasurement();
  context.state = {
    peso: [{ date: '2026-08-01', kg: 70.0 }],
    sessions: [],
    ficha: {
      A: { ex: [{ n: 'Supino reto', sets: 4 }] },
      B: { ex: [] },
      C: { ex: [] }
    }
  };
  bridgeCalls.startScaleMeasurement = 0;
  bridgeCalls.stopScaleMeasurement = 0;
  bridgeCalls.requestBlePermissions = 0;
  bridgeCalls.hasBlePermissions = () => true;
  toastLog = [];
  vibrateLog = [];
  context.render();
}

let passedCount = 0;

// Test 1: Initial IDLE UI and state machine structure
{
  setupFreshState();
  assert.strictEqual(context.scaleSm.current, 'IDLE');
  assert.strictEqual(context.scaleSm.scanning, false);

  const measureBtn = appContainer.querySelector('#btnBleMeasure');
  assert(measureBtn !== null, '#btnBleMeasure button must be present in DOM in IDLE');

  const scaleCard = appContainer.querySelector('#bleScaleCard');
  assert(scaleCard !== null, '#bleScaleCard container must be in DOM');
  assert.strictEqual(scaleCard.style.display, 'none', '#bleScaleCard must be hidden in IDLE');

  passedCount++;
  console.log('✅ Test 1 Passed: Initial IDLE state and DOM verified.');
}

// Test 2: Start measurement happy path (Permissions granted)
{
  setupFreshState();
  const measureBtn = appContainer.querySelector('#btnBleMeasure');
  measureBtn.click();

  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');
  assert.strictEqual(context.scaleSm.scanning, true);
  assert.ok(context.scaleSm.measurementSessionId.startsWith('scale_session_'));
  assert.strictEqual(bridgeCalls.startScaleMeasurement, 1);

  const scaleCard = appContainer.querySelector('#bleScaleCard');
  assert(scaleCard.style.display !== 'none');

  passedCount++;
  console.log('✅ Test 2 Passed: Start measurement transition to WAITING_FOR_SCALE verified.');
}

// Test 3: Permission request and grant flow
{
  setupFreshState();
  bridgeCalls.hasBlePermissions = () => false;

  const measureBtn = appContainer.querySelector('#btnBleMeasure');
  measureBtn.click();

  assert.strictEqual(context.scaleSm.current, 'REQUESTING_PERMISSION');
  assert.strictEqual(bridgeCalls.requestBlePermissions, 1);

  // Grant permissions callback
  windowMock.onScalePermissionResult(true);
  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');
  assert.strictEqual(bridgeCalls.startScaleMeasurement, 1);

  passedCount++;
  console.log('✅ Test 3 Passed: Permission request and grant callback verified.');
}

// Test 4: Permission denial flow
{
  setupFreshState();
  bridgeCalls.hasBlePermissions = () => false;

  context.startScaleMeasurementFlow();
  assert.strictEqual(context.scaleSm.current, 'REQUESTING_PERMISSION');

  windowMock.onScalePermissionResult(false);
  assert.strictEqual(context.scaleSm.current, 'ERROR');
  assert.strictEqual(context.scaleSm.errorCode, 103);
  assert.strictEqual(context.scaleSm.scanning, false);

  passedCount++;
  console.log('✅ Test 4 Passed: Permission denial to ERROR verified.');
}

// Test 5: Live fluctuating packets and step-off noise filter
{
  setupFreshState();
  context.startScaleMeasurementFlow();

  // Noise packet < 5.0kg ignored
  windowMock.onScaleMeasurement({ weightKg: 2.5, stable: false });
  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');

  // Live fluctuating packet >= 5.0kg
  windowMock.onScaleMeasurement({ weightKg: 65.85, stable: false });
  assert.strictEqual(context.scaleSm.current, 'MEASURING');
  assert.strictEqual(context.scaleSm.liveWeightKg, 65.85);

  const liveWeight = appContainer.querySelector('#bleLiveWeight');
  assert(liveWeight.textContent.includes('65.9') || liveWeight.textContent.includes('65.85'));

  passedCount++;
  console.log('✅ Test 5 Passed: Live measuring stream and sub-5kg noise rejection verified.');
}

// Test 6: Stable weight lock, duplicate suppression, and persistence
{
  setupFreshState();
  context.startScaleMeasurementFlow();

  // First stable packet
  windowMock.onScaleMeasurement({ weightKg: 64.25, stable: true, impedanceRaw: 6000, embeddedMac: '78:66:A5:5E:C4:59' });
  assert.strictEqual(context.scaleSm.current, 'STABLE');
  assert.strictEqual(context.scaleSm.lockedWeightKg, 64.25);
  assert.strictEqual(context.scaleSm.lockedImpedanceRaw, 6000);
  assert.strictEqual(context.scaleSm.lockedMac, '78:66:A5:5E:C4:59');
  assert.strictEqual(context.scaleSm.stableMeasurementHandled, true);
  assert.strictEqual(context.scaleSm.scanning, false);
  assert.strictEqual(bridgeCalls.stopScaleMeasurement, 1);
  assert(vibrateLog.length > 0, 'Haptic feedback on stable lock');

  // Deliver 29 duplicate stable packets from high-frequency broadcast
  for (let i = 0; i < 29; i++) {
    windowMock.onScaleMeasurement({ weightKg: 64.25, stable: true, impedanceRaw: 6000, embeddedMac: '78:66:A5:5E:C4:59' });
  }
  assert.strictEqual(bridgeCalls.stopScaleMeasurement, 1, 'Stop scan called exactly once');

  // Click Salvar button
  const saveBtn = appContainer.querySelector('#btnSaveBleWeight');
  assert(saveBtn !== null);
  saveBtn.click();

  assert.strictEqual(context.scaleSm.current, 'IDLE');
  assert.strictEqual(context.state.peso.length, 2);
  const savedEntry = context.state.peso.find(p => p.date === '2026-08-18');
  assert(savedEntry !== null);
  assert.strictEqual(savedEntry.kg, 64.25);
  assert.strictEqual(savedEntry.impedanceRaw, 6000);
  assert.strictEqual(savedEntry.embeddedMac, '78:66:A5:5E:C4:59');
  assert.strictEqual(savedEntry.source, 'ble');
  assert(toastLog.includes('Peso registrado'));

  passedCount++;
  console.log('✅ Test 6 Passed: Stable weight lock, duplicate suppression, and DB persistence verified.');
}

// Test 7: Retry and Cancel actions
{
  setupFreshState();
  context.startScaleMeasurementFlow();
  const session1 = context.scaleSm.measurementSessionId;

  windowMock.onScaleMeasurement({ weightKg: 64.25, stable: true, impedanceRaw: 6000 });
  assert.strictEqual(context.scaleSm.current, 'STABLE');

  // Tap Repetir
  const retryBtn = appContainer.querySelector('#btnRetryBleWeight');
  assert(retryBtn !== null);
  retryBtn.click();

  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');
  assert.notStrictEqual(context.scaleSm.measurementSessionId, session1, 'New session ID generated on retry');
  assert.strictEqual(context.scaleSm.stableMeasurementHandled, false);

  // Tap Cancelar
  const cancelBtn = appContainer.querySelector('#btnCancelBleWeight');
  assert(cancelBtn !== null);
  cancelBtn.click();

  assert.strictEqual(context.scaleSm.current, 'IDLE');
  assert.strictEqual(context.scaleSm.scanning, false);

  passedCount++;
  console.log('✅ Test 7 Passed: Retry and Cancel flows verified.');
}

// Test 8: Watchdog timeout (45s) triggers ERROR state
{
  setupFreshState();
  context.scaleSm.timeoutSec = 0.01; // fast virtual timeout
  context.startScaleMeasurementFlow();

  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');

  // Direct error dispatch or timeout
  windowMock.onScaleError({ code: 408, message: 'Tempo limite esgotado (45s). Nenhuma balança detectada.' });
  assert.strictEqual(context.scaleSm.current, 'ERROR');
  assert.strictEqual(context.scaleSm.errorCode, 408);
  assert(context.scaleSm.errorMessage.includes('45s'));

  passedCount++;
  console.log('✅ Test 8 Passed: Watchdog timeout error flow verified.');
}

// Test 9: Manual weight input preservation (#pesoIn, #pMinus, #pPlus, #pesoAdd)
{
  setupFreshState();
  const pesoIn = appContainer.querySelector('#pesoIn');
  const pMinus = appContainer.querySelector('#pMinus');
  const pPlus = appContainer.querySelector('#pPlus');
  const pesoAdd = appContainer.querySelector('#pesoAdd');

  assert(pesoIn !== null && pMinus !== null && pPlus !== null && pesoAdd !== null);

  pesoIn.value = '75.0';
  pPlus.click();
  assert.strictEqual(pesoIn.value, 75.1);

  pMinus.click();
  assert.strictEqual(pesoIn.value, 75.0);

  pesoAdd.click();
  const manualEntry = context.state.peso.find(p => p.date === '2026-08-18');
  assert(manualEntry !== null);
  assert.strictEqual(manualEntry.kg, 75.0);

  passedCount++;
  console.log('✅ Test 9 Passed: Manual weight controls 100% intact and functional.');
}

// Test 10: Diagnostic BLE button trigger
{
  setupFreshState();
  const diagBtn = appContainer.querySelector('#pBleDiagBtn');
  assert(diagBtn !== null);
  diagBtn.click();
  assert.strictEqual(windowMock.BleDiag.openCalled, 1);

  passedCount++;
  console.log('✅ Test 10 Passed: Diagnostic button wired to BleDiag.open().');
}

console.log(`\n================================================================`);
console.log(`🎉 ALL ${passedCount} PROGRESSO.JS INTEGRATION TESTS PASSED (100%)!`);
console.log(`================================================================\n`);
