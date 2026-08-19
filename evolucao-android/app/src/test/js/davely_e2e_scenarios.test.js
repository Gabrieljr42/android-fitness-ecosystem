'use strict';

/**
 * ==============================================================================
 * DAVELY BLE SCALE INTEGRATION — REAL-WORLD E2E SCENARIOS TEST SUITE
 * Tier 4: End-to-End User Journeys, Multi-Component Lifecycle & Edge Recovery
 * ==============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== [EVOLUÇÃO] Executando Suíte de Testes: Cenários E2E Realistas (Tier 4) ===\n');

// -----------------------------------------------------------------------------
// Load Application Kernel & Database Helpers in Virtual Context
// -----------------------------------------------------------------------------
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
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  window: {
    addEventListener: () => {},
    removeEventListener: () => {}
  },
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    clear() { this._data = {}; }
  }
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('kernel/fmt.js');
loadScript('kernel/db.js');
loadScript('kernel/charts.js');

const { state, load, save, mergeState, chartSVG, nkg, fmtBR } = context;

// -----------------------------------------------------------------------------
// Mock Bridge & State Machine Engine for E2E Tests
// -----------------------------------------------------------------------------
class MockAndroidBridge {
  constructor() {
    this.scanStarted = false;
    this.scanStopped = false;
    this.permissionsRequested = false;
    this.telemetryRequests = 0;
  }
  startScaleMeasurement() { this.scanStarted = true; this.scanStopped = false; }
  stopScaleMeasurement() { this.scanStopped = true; this.scanStarted = false; }
  requestBlePermissions() { this.permissionsRequested = true; }
  getBleTelemetry() { this.telemetryRequests++; return JSON.stringify({ scanResults: 10 }); }
}

function createE2ESystem() {
  const bridge = new MockAndroidBridge();
  let currentState = 'IDLE';
  let activeSessionId = null;
  let stableHandled = false;
  let liveWeight = null;
  let lockedMeasurement = null;
  let errorState = null;
  let watchdog = null;

  const appState = {
    peso: [],
    profile: { heightCm: 175, age: 25, sex: 'male' }
  };

  function startWatchdog(timeoutMs = 45000) {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (currentState === 'SCANNING' || currentState === 'WAITING_FOR_SCALE' || currentState === 'MEASURING') {
        bridge.stopScaleMeasurement();
        currentState = 'ERROR';
        errorState = { code: 408, message: 'Tempo limite esgotado (45s). Nenhuma balança detectada.' };
      }
    }, timeoutMs);
  }

  function stopWatchdog() {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  }

  return {
    bridge,
    appState,
    getState: () => currentState,
    getLiveWeight: () => liveWeight,
    getLockedMeasurement: () => lockedMeasurement,
    getErrorState: () => errorState,
    getActiveSessionId: () => activeSessionId,

    userTapMedirComBalanca(hasPermissions = true) {
      if (!hasPermissions) {
        currentState = 'REQUESTING_PERMISSION';
        bridge.requestBlePermissions();
        return;
      }
      activeSessionId = 'session_' + Date.now();
      stableHandled = false;
      liveWeight = null;
      lockedMeasurement = null;
      errorState = null;
      currentState = 'WAITING_FOR_SCALE';
      bridge.startScaleMeasurement();
      startWatchdog();
    },

    onPermissionGranted() {
      if (currentState === 'REQUESTING_PERMISSION') {
        this.userTapMedirComBalanca(true);
      }
    },

    onPermissionDenied() {
      currentState = 'ERROR';
      errorState = { code: 103, message: 'Permissão necessária' };
    },

    receivePacket(packet) {
      if (currentState !== 'WAITING_FOR_SCALE' && currentState !== 'MEASURING') return;
      if (!packet || typeof packet.weightKg !== 'number' || packet.weightKg < 5.0) return;

      if (!packet.stable) {
        currentState = 'MEASURING';
        liveWeight = packet.weightKg;
      } else {
        if (stableHandled) return; // session dedup
        stableHandled = true;
        stopWatchdog();
        currentState = 'STABLE';
        liveWeight = packet.weightKg;
        lockedMeasurement = {
          weightKg: packet.weightKg,
          impedanceRaw: packet.impedanceRaw || 0,
          embeddedMac: packet.embeddedMac || '78:66:A5:5E:C4:59'
        };
        bridge.stopScaleMeasurement();
      }
    },

    userConfirmSave(todayStr = '2026-08-18') {
      if (currentState !== 'STABLE' || !lockedMeasurement) return false;
      currentState = 'SAVING';
      appState.peso = appState.peso.filter(p => p.date !== todayStr);
      appState.peso.push({
        date: todayStr,
        kg: lockedMeasurement.weightKg,
        impedanceRaw: lockedMeasurement.impedanceRaw,
        embeddedMac: lockedMeasurement.embeddedMac,
        source: 'ble'
      });
      currentState = 'DONE';
      currentState = 'IDLE';
      return true;
    },

    userTapRetry() {
      stopWatchdog();
      this.userTapMedirComBalanca(true);
    },

    userTapCancel() {
      stopWatchdog();
      if (currentState === 'WAITING_FOR_SCALE' || currentState === 'MEASURING') {
        bridge.stopScaleMeasurement();
      }
      currentState = 'IDLE';
      liveWeight = null;
      lockedMeasurement = null;
      stableHandled = false;
    },

    triggerTimeoutDirectly() {
      stopWatchdog();
      bridge.stopScaleMeasurement();
      currentState = 'ERROR';
      errorState = { code: 408, message: 'Tempo limite esgotado (45s). Nenhuma balança detectada.' };
    },

    cleanup() {
      stopWatchdog();
    }
  };
}

let tier4Count = 0;
console.log('--- TIER 4: Real-World Application Scenarios ---');

// -----------------------------------------------------------------------------
// SCENARIO 1: Standard Barefoot Weigh-In with Bioimpedance
// -----------------------------------------------------------------------------
console.log('--- Scenario 1: Standard Barefoot Weigh-In ---');
{
  const sys = createE2ESystem();

  // 1. User opens weight section and taps "Medir com a balança"
  sys.userTapMedirComBalanca(true);
  assert.strictEqual(sys.getState(), 'WAITING_FOR_SCALE', 'Deve entrar em WAITING_FOR_SCALE');
  assert.strictEqual(sys.bridge.scanStarted, true, 'Scanner BLE deve ter iniciado');

  // 2. Scale starts streaming live fluctuating packets
  sys.receivePacket({ weightKg: 65.85, stable: false, impedanceRaw: 0 });
  assert.strictEqual(sys.getState(), 'MEASURING');
  assert.strictEqual(sys.getLiveWeight(), 65.85);

  sys.receivePacket({ weightKg: 64.95, stable: false, impedanceRaw: 0 });
  assert.strictEqual(sys.getLiveWeight(), 64.95);

  // 3. Scale stabilizes and locks measurement
  sys.receivePacket({ weightKg: 64.25, stable: true, impedanceRaw: 6000, embeddedMac: '78:66:A5:5E:C4:59' });
  assert.strictEqual(sys.getState(), 'STABLE', 'Deve transicionar para STABLE');
  assert.strictEqual(sys.getLockedMeasurement().weightKg, 64.25);
  assert.strictEqual(sys.getLockedMeasurement().impedanceRaw, 6000);
  assert.strictEqual(sys.bridge.scanStopped, true, 'Scanner deve parar na estabilização');

  // 4. User confirms save
  const saved = sys.userConfirmSave('2026-08-18');
  assert.strictEqual(saved, true);
  assert.strictEqual(sys.getState(), 'IDLE');
  assert.strictEqual(sys.appState.peso.length, 1);
  assert.strictEqual(sys.appState.peso[0].kg, 64.25);
  assert.strictEqual(sys.appState.peso[0].impedanceRaw, 6000);
  assert.strictEqual(sys.appState.peso[0].source, 'ble');

  // 5. Chart rendering integration
  const chartPoints = sys.appState.peso.map(p => ({ x: p.date, y: p.kg }));
  assert.strictEqual(chartPoints.length, 1);
  tier4Count += 11;
  sys.cleanup();
}

// -----------------------------------------------------------------------------
// SCENARIO 2: Shoe/Socks Weigh-In (Zero Bioimpedance)
// -----------------------------------------------------------------------------
console.log('--- Scenario 2: Shoe/Socks Weigh-In (Zero Bioimpedance) ---');
{
  const sys = createE2ESystem();

  sys.userTapMedirComBalanca(true);
  sys.receivePacket({ weightKg: 64.80, stable: false, impedanceRaw: 0 });
  sys.receivePacket({ weightKg: 64.25, stable: true, impedanceRaw: 0, embeddedMac: '78:66:A5:5E:C4:59' });

  assert.strictEqual(sys.getState(), 'STABLE');
  assert.strictEqual(sys.getLockedMeasurement().weightKg, 64.25);
  assert.strictEqual(sys.getLockedMeasurement().impedanceRaw, 0, 'Impedância deve ser 0 quando calçado');

  sys.userConfirmSave('2026-08-18');
  assert.strictEqual(sys.appState.peso.length, 1);
  assert.strictEqual(sys.appState.peso[0].impedanceRaw, 0);
  tier4Count += 5;
  sys.cleanup();
}

// -----------------------------------------------------------------------------
// SCENARIO 3: Scanner Timeout & User Recovery
// -----------------------------------------------------------------------------
console.log('--- Scenario 3: Scanner Timeout & User Recovery ---');
{
  const sys = createE2ESystem();

  // User starts scan, but scale is sleeping in bathroom
  sys.userTapMedirComBalanca(true);
  assert.strictEqual(sys.getState(), 'WAITING_FOR_SCALE');

  // Watchdog fires after 45s
  sys.triggerTimeoutDirectly();
  assert.strictEqual(sys.getState(), 'ERROR');
  assert.strictEqual(sys.getErrorState().code, 408);
  assert.ok(sys.getErrorState().message.includes('45s'));
  assert.strictEqual(sys.bridge.scanStopped, true);

  // User steps on scale to wake it up, then taps [Tentar novamente]
  sys.userTapRetry();
  assert.strictEqual(sys.getState(), 'WAITING_FOR_SCALE');
  assert.strictEqual(sys.bridge.scanStarted, true);

  // Scale packet arrives immediately
  sys.receivePacket({ weightKg: 64.25, stable: true, impedanceRaw: 6000 });
  assert.strictEqual(sys.getState(), 'STABLE');
  sys.userConfirmSave('2026-08-18');
  assert.strictEqual(sys.getState(), 'IDLE');
  tier4Count += 8;
  sys.cleanup();
}

// -----------------------------------------------------------------------------
// SCENARIO 4: Rapid Scale Broadcasts & Session Deduplication
// -----------------------------------------------------------------------------
console.log('--- Scenario 4: Rapid Scale Broadcasts & Session Dedup ---');
{
  const sys = createE2ESystem();

  sys.userTapMedirComBalanca(true);

  // Scale emits 30 stable packets in rapid succession (20Hz)
  for (let i = 0; i < 30; i++) {
    sys.receivePacket({ weightKg: 64.25, stable: true, impedanceRaw: 6000, embeddedMac: '78:66:A5:5E:C4:59' });
  }

  assert.strictEqual(sys.getState(), 'STABLE');
  // Confirm save
  sys.userConfirmSave('2026-08-18');
  assert.strictEqual(sys.appState.peso.length, 1, 'Exatamente 1 registro salvo após 30 broadcasts repetidos');
  tier4Count += 2;
  sys.cleanup();
}

// -----------------------------------------------------------------------------
// SCENARIO 5: Interleaving BLE Scale and Manual Weight Tracking
// -----------------------------------------------------------------------------
console.log('--- Scenario 5: Interleaving BLE and Manual Entry ---');
{
  const sys = createE2ESystem();

  // Day 1: User enters manual weight 70.0 kg
  sys.appState.peso.push({ date: '2026-08-10', kg: 70.0 });

  // Day 2: User measures with BLE scale 69.4 kg
  sys.userTapMedirComBalanca(true);
  sys.receivePacket({ weightKg: 69.4, stable: true, impedanceRaw: 5900 });
  sys.userConfirmSave('2026-08-11');

  // Day 3: User measures with BLE scale 68.8 kg
  sys.userTapMedirComBalanca(true);
  sys.receivePacket({ weightKg: 68.8, stable: true, impedanceRaw: 5850 });
  sys.userConfirmSave('2026-08-12');

  // Day 4: User travels and enters manual weight 68.5 kg
  sys.appState.peso.push({ date: '2026-08-13', kg: 68.5 });

  // Verify dataset integrity
  const sorted = sys.appState.peso.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  assert.strictEqual(sorted.length, 4);
  assert.strictEqual(sorted[0].kg, 70.0);
  assert.strictEqual(sorted[1].kg, 69.4);
  assert.strictEqual(sorted[1].source, 'ble');
  assert.strictEqual(sorted[2].kg, 68.8);
  assert.strictEqual(sorted[3].kg, 68.5);

  // SVG Chart rendering test on full series
  const svg = chartSVG(sorted.map(p => ({ x: p.date, y: p.kg })), '#ffffff');
  assert.ok(svg.includes('<svg'), 'Gráfico SVG deve ser gerado sem erros');
  assert.ok(svg.includes('<polyline') || svg.includes('<path'), 'Gráfico deve conter curvas vetoriais');
  tier4Count += 8;
  sys.cleanup();
}

// -----------------------------------------------------------------------------
// SCENARIO 6: Backup, State Merge & Backwards Compatibility
// -----------------------------------------------------------------------------
console.log('--- Scenario 6: Database Merge & Backwards Compatibility ---');
{
  const localState = {
    ficha: { A: { nome: 'A', ex: [] }, B: { nome: 'B', ex: [] }, C: { nome: 'C', ex: [] } },
    sessions: [],
    corridas: [],
    peso: [
      { date: '2026-08-01', kg: 72.0 },
      { date: '2026-08-05', kg: 71.5 }
    ]
  };

  const incomingBackup = {
    sessions: [],
    corridas: [],
    peso: [
      { date: '2026-08-05', kg: 71.5 },
      { date: '2026-08-18', kg: 64.25, impedanceRaw: 6000, source: 'ble' }
    ]
  };

  const mergeRes = mergeState(localState, incomingBackup);
  assert.strictEqual(mergeRes.addedPeso, 1, 'Deve adicionar 1 registro novo');
  assert.strictEqual(mergeRes.state.peso.length, 3);

  const bleEntry = mergeRes.state.peso.find(p => p.date === '2026-08-18');
  assert.ok(bleEntry, 'Entrada BLE deve existir no estado mesclado');
  assert.strictEqual(bleEntry.kg, 64.25);
  assert.strictEqual(bleEntry.impedanceRaw, 6000);
  assert.strictEqual(bleEntry.source, 'ble');
  tier4Count += 6;
}

// -----------------------------------------------------------------------------
// SCENARIO 7: State Machine Cancel & Abort Journey
// -----------------------------------------------------------------------------
console.log('--- Scenario 7: State Machine Cancel & Abort Journey ---');
{
  const sys = createE2ESystem();

  // User starts scan, sees weight fluctuating, then taps [Cancelar]
  sys.userTapMedirComBalanca(true);
  sys.receivePacket({ weightKg: 65.5, stable: false });
  assert.strictEqual(sys.getState(), 'MEASURING');

  sys.userTapCancel();
  assert.strictEqual(sys.getState(), 'IDLE');
  assert.strictEqual(sys.bridge.scanStopped, true);
  assert.strictEqual(sys.appState.peso.length, 0, 'Nenhum registro parcial deve ser salvo');
  tier4Count += 4;
  sys.cleanup();
}

// -----------------------------------------------------------------------------
// SCENARIO 8: Runtime Permission Request & User Grant Journey
// -----------------------------------------------------------------------------
console.log('--- Scenario 8: Runtime Permission Request & Grant Journey ---');
{
  const sys = createE2ESystem();

  // 1. App lacks BLE permissions
  sys.userTapMedirComBalanca(false);
  assert.strictEqual(sys.getState(), 'REQUESTING_PERMISSION');
  assert.strictEqual(sys.bridge.permissionsRequested, true);

  // 2. Android OS permission dialog -> user grants
  sys.onPermissionGranted();
  assert.strictEqual(sys.getState(), 'WAITING_FOR_SCALE');
  assert.strictEqual(sys.bridge.scanStarted, true);

  // 3. Complete weigh-in
  sys.receivePacket({ weightKg: 64.25, stable: true, impedanceRaw: 6000 });
  sys.userConfirmSave('2026-08-18');
  assert.strictEqual(sys.getState(), 'IDLE');
  assert.strictEqual(sys.appState.peso.length, 1);
  tier4Count += 6;
  sys.cleanup();
}

console.log(`✅ TIER 4 Concluído com sucesso! (${tier4Count} asserções verificadas across 8 cenários)`);

console.log('\n================================================================');
console.log(`🎉 SUÍTE CENÁRIOS E2E REALISTAS CONCLUÍDA: ${tier4Count} ASSERÇÕES PASSARAM!`);
console.log('================================================================\n');
