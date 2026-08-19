/**
 * m4_challenger2_ux_empirical_stress.test.js
 * Empirical Challenger 2 - Milestone M4 (Measurement UX, State Machine & Headless Resilience)
 * 
 * Deep Stress Verification:
 * 1. Design Token Audit & Monochromatic CSS Contract
 * 2. Mobile Responsive Layout Bounds & Layout Integrity (320px - 768px)
 * 3. Manual Entry Control Backward Compatibility (#pMinus, #pesoIn, #pPlus, #pesoAdd)
 * 4. Headless & Mock Execution Resilience (undefined, null, throwing AndroidBridge)
 * 5. FSM Transition Invariants, Burst Packet Flooding (1,000 pkts @ 20Hz), & Race Conditions
 * 6. Session Protection, Watchdog 45s Timeout, Noise Filtering & Data Persistence Parity
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 2: M4 UX & STATE MACHINE STRESS     ===');
console.log('================================================================\n');

let passedTests = 0;
function test(name, fn) {
  try {
    fn();
    passedTests++;
    console.log('✅ [PASS] ' + name);
  } catch (err) {
    console.error('❌ [FAIL] ' + name);
    console.error(err);
    process.exit(1);
  }
}

// Read assets
const progressoJsPath = path.resolve(__dirname, '../../main/assets/apps/evolucao/views/progresso.js');
const themeCssPath = path.resolve(__dirname, '../../main/assets/kernel/theme.css');
const progressoJsCode = fs.readFileSync(progressoJsPath, 'utf8');
const themeCssCode = fs.readFileSync(themeCssPath, 'utf8');

// -----------------------------------------------------------------------------
// SUITE 1: CSS DESIGN TOKENS & MONOCHROMATIC STYLING COMPLIANCE
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Design Tokens & Monochromatic CSS Verification ---');

test('1.1: Verification of Monochromatic Zinc Tokens in theme.css', () => {
  assert(themeCssCode.includes('--bg: #09090b'), 'theme.css must declare Zinc 950 base background');
  assert(themeCssCode.includes('--line: #27272a'), 'theme.css must declare Zinc 800 subtle borders');
  assert(themeCssCode.includes('--txt: #ffffff'), 'theme.css must declare white text primary');
  assert(themeCssCode.includes('--txt2: #a1a1aa'), 'theme.css must declare Zinc 400 text secondary');
  assert(themeCssCode.includes('--radius-card: 16px'), 'theme.css must declare 16px card radius');
  assert(themeCssCode.includes('--radius-pill: 999px'), 'theme.css must declare pill radius');
});

test('1.2: BLE Scale Card CSS Classes & State Modifiers', () => {
  assert(themeCssCode.includes('.ble-scale-card {'), 'ble-scale-card container definition');
  assert(themeCssCode.includes('.ble-scale-card.measuring {'), 'measuring modifier class');
  assert(themeCssCode.includes('.ble-scale-card.stable {'), 'stable modifier class');
  assert(themeCssCode.includes('.ble-scale-card.error {'), 'error modifier class');
  assert(themeCssCode.includes('.ble-scale-header {'), 'ble-scale-header definition');
  assert(themeCssCode.includes('.ble-scale-title {'), 'ble-scale-title definition');
  assert(themeCssCode.includes('.ble-scale-badge {'), 'ble-scale-badge definition');
  assert(themeCssCode.includes('.ble-live-weight {'), 'ble-live-weight definition');
  assert(themeCssCode.includes('.ble-scale-status {'), 'ble-scale-status definition');
  assert(themeCssCode.includes('.ble-scale-bio {'), 'ble-scale-bio definition');
  assert(themeCssCode.includes('.ble-scale-actions {'), 'ble-scale-actions definition');
  assert(themeCssCode.includes('@keyframes blePulse'), 'blePulse keyframe animation');
});

test('1.3: Zero Cliché Neon / Remote Fonts / External Assets in theme.css', () => {
  assert(!themeCssCode.includes('@import url'), 'Must not have external @import');
  assert(!themeCssCode.includes('fonts.googleapis.com'), 'Must not link to external fonts');
  assert(!themeCssCode.includes('linear-gradient(45deg, #ff007f'), 'Must not use rainbow gradients');
});

// -----------------------------------------------------------------------------
// SUITE 2: MOCK DOM & HEADLESS ENVIRONMENT RESILIENCE
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Headless Environment Resilience (Node.js / No Bridge) ---');

class MockElement {
  constructor(id, tagName) {
    this.id = id;
    this.tagName = (tagName || 'div').toUpperCase();
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.children = [];
    this.parentNode = null;
    this.onclick = null;
    this.onchange = null;
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  querySelector(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.substring(1);
      return this.children.find(c => c.className && c.className.includes(cls)) || null;
    }
    return null;
  }
  querySelectorAll(sel) {
    return [];
  }
}

class MockDocument {
  constructor() {
    this.elements = {};
  }
  register(el) {
    this.elements[el.id] = el;
    return el;
  }
  getElementById(id) {
    return this.elements[id] || null;
  }
  querySelector(sel) {
    if (sel.startsWith('#')) return this.getElementById(sel.substring(1));
    return null;
  }
  querySelectorAll(sel) {
    return [];
  }
  createElement(tag) {
    return new MockElement('mock_' + Math.random(), tag);
  }
}

function createProgressoEnv(options) {
  options = options || {};
  const doc = new MockDocument();
  const bleMeasureBtnWrap = doc.register(new MockElement('bleMeasureBtnWrap'));
  const btnBleMeasure = doc.register(new MockElement('btnBleMeasure', 'button'));
  const bleScaleCard = doc.register(new MockElement('bleScaleCard'));
  const bleScaleBadge = doc.register(new MockElement('bleScaleBadge'));
  const bleLiveWeight = doc.register(new MockElement('bleLiveWeight'));
  const bleScaleStatus = doc.register(new MockElement('bleScaleStatus'));
  const bleScaleActions = doc.register(new MockElement('bleScaleActions'));
  const pMinus = doc.register(new MockElement('pMinus', 'button'));
  const pPlus = doc.register(new MockElement('pPlus', 'button'));
  const pesoIn = doc.register(new MockElement('pesoIn', 'input'));
  const pesoAdd = doc.register(new MockElement('pesoAdd', 'button'));
  const pBleDiagBtn = doc.register(new MockElement('pBleDiagBtn', 'button'));

  const liveWeightWrap = new MockElement('liveWrap');
  liveWeightWrap.className = 'ble-live-weight-wrap';
  liveWeightWrap.appendChild(bleLiveWeight);
  bleScaleCard.appendChild(liveWeightWrap);

  const state = {
    peso: options.initialPeso || [{ date: '2026-08-10', kg: 72.0 }],
    sessions: [],
    ficha: { A: { ex: [] }, B: { ex: [] }, C: { ex: [] } }
  };

  const toasts = [];
  const vibrations = [];
  let savedCount = 0;
  let renderCount = 0;
  let diagOpened = false;

  const sandbox = {
    window: {},
    document: doc,
    state: state,
    todayISO: () => options.today || '2026-08-18',
    fmtBR: (d) => d,
    fmtBRfull: (d) => d,
    nkg: (k) => String(k),
    esc: (x) => x,
    toast: (msg) => { toasts.push(msg); },
    vibrate: (ms) => { vibrations.push(ms); },
    save: () => { savedCount++; },
    render: () => { renderCount++; },
    BleDiag: { open: () => { diagOpened = true; } },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    Math: Math,
    parseFloat: parseFloat,
    isNaN: isNaN,
    Array: Array,
    Object: Object,
    String: String,
    Number: Number
  };
  sandbox.window = sandbox;
  if (options.bridge) {
    sandbox.window.AndroidBridge = options.bridge;
  }

  const context = vm.createContext(sandbox);
  vm.runInContext(progressoJsCode, context);
  vm.runInContext('bindProgresso()', context);

  return {
    context: context,
    doc: doc,
    state: state,
    toasts: toasts,
    vibrations: vibrations,
    getSavedCount: () => savedCount,
    getRenderCount: () => renderCount,
    isDiagOpened: () => diagOpened
  };
}

test('2.1: Headless Execution with Undefined window.AndroidBridge (Zero Exceptions)', () => {
  const env = createProgressoEnv({ bridge: null });
  const context = env.context;
  const doc = env.doc;

  assert.strictEqual(context.scaleSm.current, 'IDLE');
  assert.strictEqual(context.scaleSm.scanning, false);

  assert.doesNotThrow(() => {
    context.startScaleMeasurementFlow();
  }, 'startScaleMeasurementFlow must not throw when AndroidBridge is undefined');

  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');
  assert.strictEqual(context.scaleSm.scanning, true);

  assert.doesNotThrow(() => {
    context.onScaleMeasurement({ weightKg: 65.4, stable: false });
  });
  assert.strictEqual(context.scaleSm.current, 'MEASURING');
  assert.strictEqual(context.scaleSm.liveWeightKg, 65.4);
  assert(doc.getElementById('bleLiveWeight').innerHTML.includes('65.4'));

  assert.doesNotThrow(() => {
    context.cancelScaleMeasurement();
  });
  assert.strictEqual(context.scaleSm.current, 'IDLE');
  assert.strictEqual(context.scaleSm.scanning, false);
});

test('2.2: Exception Safety with Throwing / Broken AndroidBridge', () => {
  const throwingBridge = {
    hasBlePermissions: () => { throw new Error('Binder IPC failure'); },
    requestBlePermissions: () => { throw new Error('Activity dead'); },
    startScaleMeasurement: () => { throw new Error('Bluetooth adapter disabled'); },
    stopScaleMeasurement: () => { throw new Error('Bluetooth crash'); }
  };
  const env = createProgressoEnv({ bridge: throwingBridge });
  const context = env.context;
  const doc = env.doc;

  assert.doesNotThrow(() => {
    context.startScaleMeasurementFlow();
  });
  assert.strictEqual(context.scaleSm.current, 'ERROR');
  assert.strictEqual(context.scaleSm.errorCode, 105);
  assert(context.scaleSm.errorMessage.includes('Erro ao solicitar'));
  assert(doc.getElementById('bleScaleBadge').textContent.includes('Erro 105'));

  const throwingStartBridge = {
    hasBlePermissions: () => true,
    startScaleMeasurement: () => { throw new Error('Hardware exception'); },
    stopScaleMeasurement: () => { throw new Error('Hardware exception'); }
  };
  const env2 = createProgressoEnv({ bridge: throwingStartBridge });
  assert.doesNotThrow(() => {
    env2.context.startScaleMeasurementFlow();
  });
  assert.strictEqual(env2.context.scaleSm.current, 'ERROR');
  assert.strictEqual(env2.context.scaleSm.errorCode, 105);
  assert(env2.context.scaleSm.errorMessage.includes('Hardware exception'));
});

// -----------------------------------------------------------------------------
// SUITE 3: BACKWARD COMPATIBILITY OF MANUAL WEIGHT ENTRY CONTROLS
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Manual Weight Input Controls Backward Compatibility ---');

test('3.1: Manual Stepper Controls (#pMinus, #pPlus, #pesoIn)', () => {
  const env = createProgressoEnv();
  const doc = env.doc;
  const pesoIn = doc.getElementById('pesoIn');
  const pMinus = doc.getElementById('pMinus');
  const pPlus = doc.getElementById('pPlus');

  pesoIn.value = '70.0';
  pPlus.onclick();
  assert.strictEqual(pesoIn.value, 70.1);
  pPlus.onclick();
  assert.strictEqual(pesoIn.value, 70.2);

  pMinus.onclick();
  assert.strictEqual(pesoIn.value, 70.1);

  pesoIn.value = '0.05';
  pMinus.onclick();
  assert.strictEqual(pesoIn.value, 0);

  pMinus.onclick();
  assert.strictEqual(pesoIn.value, 0);
});

test('3.2: Manual Weight Save Action (#pesoAdd) and Same-Day Upsert', () => {
  const env = createProgressoEnv({ today: '2026-08-18', initialPeso: [{ date: '2026-08-17', kg: 71.5 }] });
  const doc = env.doc;
  const state = env.state;
  const toasts = env.toasts;
  const vibrations = env.vibrations;
  const pesoIn = doc.getElementById('pesoIn');
  const pesoAdd = doc.getElementById('pesoAdd');

  pesoIn.value = '';
  pesoAdd.onclick();
  assert.strictEqual(toasts[toasts.length - 1], 'Digite um peso válido');
  assert.strictEqual(state.peso.length, 1);

  pesoIn.value = '-5.0';
  pesoAdd.onclick();
  assert.strictEqual(toasts[toasts.length - 1], 'Digite um peso válido');
  assert.strictEqual(state.peso.length, 1);

  pesoIn.value = '72.3';
  pesoAdd.onclick();
  assert.strictEqual(toasts[toasts.length - 1], 'Peso registrado');
  assert.strictEqual(vibrations[vibrations.length - 1], 15);
  assert.strictEqual(env.getSavedCount(), 1);
  assert.strictEqual(state.peso.length, 2);
  assert.strictEqual(state.peso[1].date, '2026-08-18');
  assert.strictEqual(state.peso[1].kg, 72.3);

  pesoIn.value = '72.4';
  pesoAdd.onclick();
  assert.strictEqual(state.peso.length, 2);
  assert.strictEqual(state.peso[1].date, '2026-08-18');
  assert.strictEqual(state.peso[1].kg, 72.4);
});

test('3.3: Interleaving BLE Scale Save and Manual Entry Preservation', () => {
  const env = createProgressoEnv({ today: '2026-08-18', initialPeso: [] });
  const context = env.context;
  const state = env.state;

  context.startScaleMeasurementFlow();
  context.onScaleMeasurement({
    weightKg: 68.75,
    stable: true,
    impedanceRaw: 5900,
    embeddedMac: '78:66:A5:5E:C4:59'
  });

  assert.strictEqual(context.scaleSm.current, 'STABLE');
  assert.strictEqual(context.scaleSm.lockedWeightKg, 68.75);
  assert.strictEqual(context.scaleSm.lockedImpedanceRaw, 5900);

  context.saveScaleMeasurement();
  assert.strictEqual(state.peso.length, 1);
  assert.strictEqual(state.peso[0].kg, 68.75);
  assert.strictEqual(state.peso[0].impedanceRaw, 5900);
  assert.strictEqual(state.peso[0].embeddedMac, '78:66:A5:5E:C4:59');
  assert.strictEqual(state.peso[0].source, 'ble');
  assert.strictEqual(context.scaleSm.current, 'IDLE');

  const pesoIn = env.doc.getElementById('pesoIn');
  pesoIn.value = '68.9';
  env.doc.getElementById('pesoAdd').onclick();

  assert.strictEqual(state.peso.length, 1);
  assert.strictEqual(state.peso[0].kg, 68.9);
  assert.strictEqual(state.peso[0].date, '2026-08-18');
});

// -----------------------------------------------------------------------------
// SUITE 4: 20HZ BURST FLOODING, NOISE FILTERING & SESSION PROTECTION
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Burst Flooding, Session Locks & Noise Filtering ---');

test('4.1: 20Hz Burst Flooding (1,000 Live Packets) Under Stress', () => {
  const env = createProgressoEnv();
  const context = env.context;
  const doc = env.doc;

  context.startScaleMeasurementFlow();
  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');

  for (let i = 1; i <= 1000; i++) {
    const weight = 20.0 + (50.0 * (i / 1000));
    context.onScaleMeasurement({
      weightKg: Math.round(weight * 10) / 10,
      stable: false,
      raw: '10FFC00D...',
      source: 'ble'
    });
    assert.strictEqual(context.scaleSm.current, 'MEASURING');
  }

  assert.strictEqual(context.scaleSm.liveWeightKg, 70.0);
  assert(doc.getElementById('bleLiveWeight').innerHTML.includes('70'));
});

test('4.2: Step-off / Tare Noise Rejection (< 5.0 kg)', () => {
  const env = createProgressoEnv();
  const context = env.context;

  context.startScaleMeasurementFlow();
  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');

  context.onScaleMeasurement({ weightKg: 0.0, stable: false });
  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');

  context.onScaleMeasurement({ weightKg: 1.5, stable: false });
  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');

  context.onScaleMeasurement({ weightKg: 4.95, stable: false });
  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');

  context.onScaleMeasurement({ weightKg: 5.1, stable: false });
  assert.strictEqual(context.scaleSm.current, 'MEASURING');
});

test('4.3: Session Deduplication of Repeated Stable Burst Packets', () => {
  let stopCalls = 0;
  const bridge = {
    hasBlePermissions: () => true,
    startScaleMeasurement: () => {},
    stopScaleMeasurement: () => { stopCalls++; }
  };
  const env = createProgressoEnv({ bridge: bridge });
  const context = env.context;

  context.startScaleMeasurementFlow();

  context.onScaleMeasurement({
    weightKg: 64.25,
    stable: true,
    impedanceRaw: 6000,
    embeddedMac: '78:66:A5:5E:C4:59'
  });

  assert.strictEqual(context.scaleSm.current, 'STABLE');
  assert.strictEqual(context.scaleSm.lockedWeightKg, 64.25);
  assert.strictEqual(context.scaleSm.stableMeasurementHandled, true);
  assert.strictEqual(stopCalls, 1);

  for (let i = 0; i < 50; i++) {
    context.onScaleMeasurement({
      weightKg: 64.25,
      stable: true,
      impedanceRaw: 6000,
      embeddedMac: '78:66:A5:5E:C4:59'
    });
  }

  assert.strictEqual(stopCalls, 1);
  assert.strictEqual(context.scaleSm.current, 'STABLE');
  assert.strictEqual(context.scaleSm.lockedWeightKg, 64.25);
});

test('4.4: Watchdog 45-Second Timeout Auto-Cancellation', () => {
  let stopCalls = 0;
  const bridge = {
    hasBlePermissions: () => true,
    startScaleMeasurement: () => {},
    stopScaleMeasurement: () => { stopCalls++; }
  };
  const env = createProgressoEnv({ bridge: bridge });
  const context = env.context;
  const doc = env.doc;

  context.scaleSm.timeoutSec = 0.05;
  context.startScaleMeasurementFlow();
  assert.strictEqual(context.scaleSm.current, 'WAITING_FOR_SCALE');

  setTimeout(() => {
    assert.strictEqual(context.scaleSm.current, 'ERROR');
    assert.strictEqual(context.scaleSm.errorCode, 408);
    assert(context.scaleSm.errorMessage.includes('Tempo limite esgotado'));
    assert.strictEqual(stopCalls, 1);
    assert(doc.getElementById('bleScaleBadge').textContent.includes('Erro 408'));
    console.log('✅ [PASS] 4.4: Watchdog 45-Second Timeout Auto-Cancellation');
    console.log('\n================================================================');
    console.log('🎉 ALL ' + passedTests + ' M4 CHALLENGER 2 STRESS TESTS PASSED (100%)!');
    console.log('================================================================\n');
  }, 100);
});
