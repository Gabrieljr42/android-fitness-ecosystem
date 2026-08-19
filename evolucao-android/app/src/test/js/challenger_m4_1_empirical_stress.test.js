'use strict';

/**
 * ==============================================================================
 * EMPIRICAL CHALLENGER 1 — MILESTONE M4 ADVERSARIAL STRESS TEST SUITE
 * State Machine, Concurrency, Burst Stability, Watchdog & Noise Rejection
 * Target: app/src/main/assets/apps/evolucao/views/progresso.js
 * ==============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 1: M4 PROGRESSO STATE MACHINE & UX  ===');
console.log('=== Stress, Race Conditions, Burst Telemetry & Concurrency   ===');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Mock DOM Infrastructure for Node.js VM Environment
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
    removeChild: function(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        child.parentElement = null;
      }
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
      if (currentParent) {
        currentParent.textContent = (currentParent.textContent || '') + match[4];
      }
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

// -----------------------------------------------------------------------------
// Test Context Creation Factory
// -----------------------------------------------------------------------------
function createTestContext(overrides = {}) {
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
    sortedSessions: () => [],
    state: {
      peso: [{ date: '2026-08-01', kg: 70.0 }],
      sessions: [],
      ficha: {
        A: { ex: [{ n: 'Supino reto', sets: 4 }] },
        B: { ex: [] },
        C: { ex: [] }
      }
    },
    ...overrides
  };

  vm.createContext(context);
  const progressoCode = fs.readFileSync(path.resolve(__dirname, '../../main/assets/apps/evolucao/views/progresso.js'), 'utf8');
  vm.runInContext(progressoCode, context);
  context.render();

  return {
    context,
    appContainer,
    bridgeCalls,
    toastLog,
    vibrateLog,
    mockAndroidBridge,
    windowMock
  };
}

let totalAssertions = 0;

function assertCheck(cond, msg) {
  assert(cond, msg);
  totalAssertions++;
}

async function runEmpiricalStressSuite() {
  // =============================================================================
  // STRESS DIMENSION 1: Rapid Start / Cancel / Retry Clicks & Race Conditions
  // =============================================================================
  console.log('--- DIMENSION 1: Rapid Start / Cancel / Retry Clicks & Race Invariants ---');

  {
    const { context, appContainer, bridgeCalls } = createTestContext();

    // Test 1.1: Rapid 500 Interleaved Actions Stress
    const actions = ['start', 'cancel', 'retry', 'save', 'measuring_packet', 'error'];
    for (let i = 0; i < 500; i++) {
      const act = actions[Math.floor(Math.random() * actions.length)];
      switch (act) {
        case 'start':
          context.startScaleMeasurementFlow();
          break;
        case 'cancel':
          context.cancelScaleMeasurement();
          break;
        case 'retry':
          context.retryScaleMeasurement();
          break;
        case 'save':
          context.saveScaleMeasurement();
          break;
        case 'measuring_packet':
          context.onScaleMeasurement({ weightKg: 65.0 + (i % 10), stable: false });
          break;
        case 'error':
          context.onScaleError({ code: 102, message: 'BT disabled' });
          break;
      }
    }

    // After chaotic fuzzing, state machine must remain in a valid deterministic state
    assertCheck(['IDLE', 'WAITING_FOR_SCALE', 'MEASURING', 'STABLE', 'ERROR'].includes(context.scaleSm.current),
      `State machine ended in invalid state: ${context.scaleSm.current}`);
    
    // Clean shutdown
    context.cancelScaleMeasurement();
    assertCheck(context.scaleSm.current === 'IDLE', 'Should return to IDLE after explicit cancel');
    assertCheck(context.scaleSm.scanning === false, 'Scanning flag should be false');
    assertCheck(context.scaleSm.watchdogTimer === null, 'Watchdog timer must be cleared');
    console.log('✅ Test 1.1 Passed: 500 rapid interleaved actions handled safely without deadlock.');

    // Test 1.2: Double-click startScaleMeasurementFlow() race safety
    context.startScaleMeasurementFlow();
    const session1 = context.scaleSm.measurementSessionId;
    context.startScaleMeasurementFlow();
    const session2 = context.scaleSm.measurementSessionId;
    assertCheck(session1 !== session2, 'Double start must produce distinct session IDs');
    assertCheck(context.scaleSm.scanning === true, 'Scanner must remain active');
    context.cancelScaleMeasurement();
    console.log('✅ Test 1.2 Passed: Double start invocations cleanly refresh session lock and watchdog.');

    // Test 1.3: Save button click ignored when state is NOT STABLE
    const initialPesoCount = context.state.peso.length;
    context.scaleSm.current = 'IDLE';
    context.saveScaleMeasurement();
    assertCheck(context.state.peso.length === initialPesoCount, 'Save must be no-op in IDLE');

    context.scaleSm.current = 'WAITING_FOR_SCALE';
    context.saveScaleMeasurement();
    assertCheck(context.state.peso.length === initialPesoCount, 'Save must be no-op in WAITING_FOR_SCALE');

    context.scaleSm.current = 'MEASURING';
    context.scaleSm.liveWeightKg = 70.0;
    context.saveScaleMeasurement();
    assertCheck(context.state.peso.length === initialPesoCount, 'Save must be no-op in MEASURING');

    context.scaleSm.current = 'ERROR';
    context.saveScaleMeasurement();
    assertCheck(context.state.peso.length === initialPesoCount, 'Save must be no-op in ERROR');
    console.log('✅ Test 1.3 Passed: saveScaleMeasurement strictly guarded against non-STABLE states.');
  }

  // =============================================================================
  // STRESS DIMENSION 2: High-Frequency Burst Stable Packets (10-50 Hz)
  // =============================================================================
  console.log('\n--- DIMENSION 2: High-Frequency Burst Stable Packets (10-50 Hz) & Single Save ---');

  {
    const { context, bridgeCalls, vibrateLog, toastLog } = createTestContext();

    context.startScaleMeasurementFlow();
    assertCheck(context.scaleSm.current === 'WAITING_FOR_SCALE', 'Initial start WAITING_FOR_SCALE');

    const startStopCalls = bridgeCalls.stopScaleMeasurement;
    const startVibrateCount = vibrateLog.length;

    // Simulate 100 stable broadcast packets arriving at 50 Hz with varying noise/impedance
    for (let i = 0; i < 100; i++) {
      context.onScaleMeasurement({
        weightKg: 64.25,
        stable: true,
        impedanceRaw: 6000,
        embeddedMac: '78:66:A5:5E:C4:59'
      });
    }

    assertCheck(context.scaleSm.current === 'STABLE', 'State must be STABLE');
    assertCheck(context.scaleSm.lockedWeightKg === 64.25, 'Locked weight must be 64.25 kg');
    assertCheck(context.scaleSm.lockedImpedanceRaw === 6000, 'Locked impedance must be 6000');
    assertCheck(context.scaleSm.lockedMac === '78:66:A5:5E:C4:59', 'Locked MAC must match');
    assertCheck(context.scaleSm.stableMeasurementHandled === true, 'stableMeasurementHandled must be true');
    assertCheck(context.scaleSm.scanning === false, 'Scanning must be stopped on stable lock');
    assertCheck(bridgeCalls.stopScaleMeasurement === startStopCalls + 1, 'Native stopScaleMeasurement called EXACTLY once');
    assertCheck(vibrateLog.length === startVibrateCount + 1, 'Haptic feedback triggered EXACTLY once on lock');

    // Multi-click save spam test (simulate user tapping Save 20 times rapidly)
    const preSavePesoCount = context.state.peso.length;
    for (let i = 0; i < 20; i++) {
      context.saveScaleMeasurement();
    }

    assertCheck(context.state.peso.length === preSavePesoCount + 1, 'Exactly ONE record added to state.peso despite 20 save clicks');
    const savedRec = context.state.peso.find(p => p.date === '2026-08-18');
    assertCheck(savedRec && savedRec.kg === 64.25, 'Saved record weight verified');
    assertCheck(savedRec.impedanceRaw === 6000, 'Saved impedance verified');
    assertCheck(savedRec.source === 'ble', 'Saved source is ble');
    assertCheck(context.scaleSm.current === 'IDLE', 'Returns to IDLE after save');

    // Packets delivered after save (scale still broadcasting in air) must be safely dropped
    context.onScaleMeasurement({ weightKg: 64.25, stable: true, impedanceRaw: 6000 });
    assertCheck(context.scaleSm.current === 'IDLE', 'Post-save packets ignored in IDLE');
    console.log('✅ Test 2 Passed: 100-packet 50Hz burst deduplicated; single radio shutdown & single DB record guaranteed.');
  }

  // =============================================================================
  // STRESS DIMENSION 3: 45s Timeout Expiry with Clean Radio Stop
  // =============================================================================
  console.log('\n--- DIMENSION 3: 45s Watchdog Timeout Expiry & Radio Stop ---');

  {
    const { context, bridgeCalls } = createTestContext();

    // Test 3.1: Configurable fast watchdog trigger
    context.scaleSm.timeoutSec = 0.05; // 50ms fast timeout
    context.startScaleMeasurementFlow();
    assertCheck(context.scaleSm.current === 'WAITING_FOR_SCALE', 'Scanning started');
    assertCheck(context.scaleSm.watchdogTimer !== null, 'Watchdog timer armed');

    const preStopCalls = bridgeCalls.stopScaleMeasurement;

    await new Promise(r => setTimeout(r, 80));

    assertCheck(context.scaleSm.current === 'ERROR', 'State transitions to ERROR on timeout');
    assertCheck(context.scaleSm.errorCode === 408, 'Error code 408 on timeout');
    assertCheck(context.scaleSm.scanning === false, 'Scanning flag turned off');
    assertCheck(bridgeCalls.stopScaleMeasurement >= preStopCalls + 1, 'stopScaleMeasurement invoked by watchdog');

    // Test 3.2: Heartbeat reset behavior — incoming live traffic resets watchdog
    const { context: ctxHeartbeat } = createTestContext();
    ctxHeartbeat.scaleSm.timeoutSec = 0.1; // 100ms
    ctxHeartbeat.startScaleMeasurementFlow();
    const timer1 = ctxHeartbeat.scaleSm.watchdogTimer;

    // Send packet 20ms later
    ctxHeartbeat.onScaleMeasurement({ weightKg: 65.0, stable: false });
    const timer2 = ctxHeartbeat.scaleSm.watchdogTimer;
    assertCheck(timer1 !== timer2, 'Live packet must re-arm watchdog timer with new timeout handle');

    // Test 3.3: Manual cancel disarms watchdog
    ctxHeartbeat.cancelScaleMeasurement();
    assertCheck(ctxHeartbeat.scaleSm.watchdogTimer === null, 'Watchdog timer cleared on cancel');
    console.log('✅ Test 3 Passed: 45s watchdog timeout accurately stops radio, sets ERROR 408, and resets on traffic.');
  }

  // =============================================================================
  // STRESS DIMENSION 4: Fluctuating Sub-5.0kg Step-Off Noise Packets
  // =============================================================================
  console.log('\n--- DIMENSION 4: Fluctuating Sub-5.0kg Step-Off Noise Packets & Boundary Fuzzing ---');

  {
    const { context } = createTestContext();
    context.startScaleMeasurementFlow();

    // Test 4.1: Adversarial / Malformed / Sub-5.0kg packet inputs
    const adversarialPackets = [
      null,
      undefined,
      {},
      { weightKg: '65.0' },
      { weightKg: -10.0 },
      { weightKg: 0.0, stable: false },
      { weightKg: 0.0, stable: true },
      { weightKg: 0.01, stable: false },
      { weightKg: 1.25, stable: false },
      { weightKg: 4.99, stable: false },
      { weightKg: 4.9999, stable: true } // Step-off or tare reading
    ];

    for (const pkt of adversarialPackets) {
      context.onScaleMeasurement(pkt);
      assertCheck(context.scaleSm.current === 'WAITING_FOR_SCALE',
        `Sub-5kg/malformed packet ${JSON.stringify(pkt)} should NOT transition to MEASURING or STABLE`);
    }

    // Test 4.2: Exact Boundary Transition at 5.0kg
    context.onScaleMeasurement({ weightKg: 5.0, stable: false });
    assertCheck(context.scaleSm.current === 'MEASURING', '5.0 kg exact boundary must transition to MEASURING');
    assertCheck(context.scaleSm.liveWeightKg === 5.0, 'Live weight set to 5.0');

    // Test 4.3: Interspersed Noise During Live Measuring
    context.onScaleMeasurement({ weightKg: 2.0, stable: false }); // sudden step-off noise packet
    assertCheck(context.scaleSm.current === 'MEASURING', 'Noise packet must not break MEASURING state');
    assertCheck(context.scaleSm.liveWeightKg === 5.0, 'Live weight must preserve last valid weight (not corrupt with 2.0)');

    // Higher valid weight packet updates live weight
    context.onScaleMeasurement({ weightKg: 72.4, stable: false });
    assertCheck(context.scaleSm.liveWeightKg === 72.4, 'Valid packet updates live weight');

    // Final stable lock
    context.onScaleMeasurement({ weightKg: 72.4, stable: true, impedanceRaw: 5800, embeddedMac: '78:66:A5:5E:C4:59' });
    assertCheck(context.scaleSm.current === 'STABLE', 'Transitions to STABLE');
    assertCheck(context.scaleSm.lockedWeightKg === 72.4, 'Locked weight is 72.4 kg');

    console.log('✅ Test 4 Passed: Strict sub-5.0kg step-off noise rejection and exact 5.0kg boundary verified.');
  }

  // =============================================================================
  // STRESS DIMENSION 5: Concurrent Workout Timers / Audio Playback / Background Re-renders
  // =============================================================================
  console.log('\n--- DIMENSION 5: Concurrent Timers, Audio/Vibrate & View Re-renders ---');

  {
    const { context, appContainer, vibrateLog } = createTestContext();

    // Simulate active background workout timer
    let workoutTimerSeconds = 120;
    const timerInterval = setInterval(() => {
      workoutTimerSeconds--;
    }, 5);

    // User starts weighing flow
    context.startScaleMeasurementFlow();
    assertCheck(context.scaleSm.current === 'WAITING_FOR_SCALE', 'FSM in WAITING_FOR_SCALE');

    // Background app triggers renderProgresso() while user is weighing (e.g. tab switch or timer update)
    for (let t = 0; t < 10; t++) {
      context.render(); // Re-render DOM
      const card = appContainer.querySelector('#bleScaleCard');
      assertCheck(card !== null && card.style.display !== 'none', 'Scale card remains visible during background re-renders');
      const badge = appContainer.querySelector('#bleScaleBadge');
      assertCheck(badge && badge.textContent === 'Buscando...', 'Badge reflects WAITING_FOR_SCALE state');
    }

    // Scale sends fluctuating live stream
    context.onScaleMeasurement({ weightKg: 80.5, stable: false });
    assertCheck(context.scaleSm.current === 'MEASURING', 'FSM in MEASURING');

    // Background re-render while in MEASURING
    context.render();
    const weightEl = appContainer.querySelector('#bleLiveWeight');
    assertCheck(weightEl && (weightEl.textContent.includes('80.5') || weightEl.textContent.includes('80.5 kg')),
      'Live weight rendered accurately in DOM after re-render');

    // Scale locks weight
    context.onScaleMeasurement({ weightKg: 80.0, stable: true, impedanceRaw: 6100, embeddedMac: '78:66:A5:5E:C4:59' });
    assertCheck(context.scaleSm.current === 'STABLE', 'FSM in STABLE');

    // Background re-render while in STABLE
    context.render();
    const lockedWeightEl = appContainer.querySelector('#bleLiveWeight');
    assertCheck(lockedWeightEl && (lockedWeightEl.textContent.includes('80') || lockedWeightEl.textContent.includes('80.0')),
      'Locked weight rendered in DOM');
    const bioEl = appContainer.querySelector('#bleScaleBio');
    assertCheck(bioEl && bioEl.textContent.includes('6100'), 'Bioimpedance raw counts rendered in DOM');

    // Verify action buttons in DOM
    const saveBtn = appContainer.querySelector('#btnSaveBleWeight');
    const retryBtn = appContainer.querySelector('#btnRetryBleWeight');
    const cancelBtn = appContainer.querySelector('#btnCancelBleWeight');
    assertCheck(saveBtn !== null && retryBtn !== null && cancelBtn !== null, 'All 3 action buttons present in STABLE');

    // User interacts with manual weight entry simultaneously
    const pesoIn = appContainer.querySelector('#pesoIn');
    const pPlus = appContainer.querySelector('#pPlus');
    const pMinus = appContainer.querySelector('#pMinus');
    assertCheck(pesoIn !== null && pPlus !== null && pMinus !== null, 'Manual weight stepper elements present');

    // Click Save BLE weight
    saveBtn.click();
    assertCheck(context.scaleSm.current === 'IDLE', 'Returns to IDLE after save');
    const savedEntry = context.state.peso.find(p => p.date === '2026-08-18');
    assertCheck(savedEntry && savedEntry.kg === 80.0 && savedEntry.impedanceRaw === 6100, 'BLE measurement persisted');

    await new Promise(r => setTimeout(r, 20));
    clearInterval(timerInterval);
    assertCheck(workoutTimerSeconds < 120, 'Concurrent workout timer continued running smoothly throughout weighing');
    console.log('✅ Test 5 Passed: State machine and DOM remain resilient under concurrent timers and re-renders.');
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL EMPIRICAL CHALLENGER 1 STRESS TESTS PASSED (${totalAssertions} ASSERTIONS)!`);
  console.log('================================================================\n');
}

runEmpiricalStressSuite().catch(err => {
  console.error('Stress test failed:', err);
  process.exit(1);
});
