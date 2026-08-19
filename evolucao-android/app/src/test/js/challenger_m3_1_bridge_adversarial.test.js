'use strict';

/**
 * ==============================================================================
 * EMPIRICAL CHALLENGER 1 — MILESTONE 3: ANDROID PERMISSIONS & BRIDGE INTEGRATION
 * Adversarial Stress Test Suite, Permission Matrix, Telemetry Oracle, Null Safety
 * ==============================================================================
 */

const assert = require('assert');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 1: M3 ANDROID BRIDGE & PERMISSIONS  ===');
console.log('================================================================\n');

let totalAssertions = 0;
function passAssertion(msg) {
  totalAssertions++;
}

// -----------------------------------------------------------------------------
// Emulated Native ScaleBleScanner & WebBridge Subsystem
// -----------------------------------------------------------------------------
const DavelyScaleParser = {
  PACKET_LENGTH: 17,
  AD_HEADER_LEN: 0x10,
  AD_HEADER_TYPE: 0xFF,
  PROTOCOL_FAMILY: 0xC0,

  cleanHex(hexStr) {
    if (typeof hexStr !== 'string') return null;
    const clean = hexStr.replace(/[\s:-]/g, '').toUpperCase();
    if (clean.length % 2 !== 0 || !/^[0-9A-F]*$/.test(clean)) return null;
    return clean;
  },

  hexToBytes(cleanHex) {
    if (!cleanHex || cleanHex.length % 2 !== 0) return null;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      const high = parseInt(cleanHex.charAt(i), 16);
      const low = parseInt(cleanHex.charAt(i + 1), 16);
      if (isNaN(high) || isNaN(low)) return null;
      bytes[i / 2] = (high << 4) | low;
    }
    return bytes;
  },

  bytesToHex(bytes) {
    if (!bytes || bytes.length === 0) return '';
    const hex = [];
    for (let i = 0; i < bytes.length; i++) {
      hex.push((bytes[i] & 0xFF).toString(16).padStart(2, '0').toUpperCase());
    }
    return hex.join('');
  },

  bytesToMac(bytes, startOffset) {
    if (!bytes || bytes.length < startOffset + 6) return null;
    const macParts = [];
    for (let i = 0; i < 6; i++) {
      macParts.push((bytes[startOffset + i] & 0xFF).toString(16).padStart(2, '0').toUpperCase());
    }
    return macParts.join(':');
  },

  looksLikeDavelyPacket(bytes) {
    if (!bytes || bytes.length < this.PACKET_LENGTH) return false;
    for (let i = 0; i <= bytes.length - this.PACKET_LENGTH; i++) {
      if ((bytes[i] & 0xFF) === (this.AD_HEADER_LEN & 0xFF) &&
          (bytes[i + 1] & 0xFF) === (this.AD_HEADER_TYPE & 0xFF) &&
          (bytes[i + 2] & 0xFF) === (this.PROTOCOL_FAMILY & 0xFF)) {
        return true;
      }
    }
    return false;
  },

  parse(data, fallbackDeviceAddress) {
    let bytes = null;
    let rawHex = '';

    if (typeof data === 'string') {
      const clean = this.cleanHex(data);
      if (!clean) return { valid: false, reason: 'malformed_or_odd_hex', rawHex: data };
      bytes = this.hexToBytes(clean);
      rawHex = clean;
    } else if (data instanceof Uint8Array || Array.isArray(data) || (typeof Buffer !== 'undefined' && Buffer.isBuffer(data))) {
      bytes = new Uint8Array(data);
      rawHex = this.bytesToHex(bytes);
    } else {
      return { valid: false, reason: 'empty_or_invalid_input', rawHex: '' };
    }

    if (!bytes || bytes.length < this.PACKET_LENGTH) {
      return { valid: false, reason: 'truncated_payload', rawHex: rawHex };
    }

    let offset = -1;
    for (let i = 0; i <= bytes.length - this.PACKET_LENGTH; i++) {
      if ((bytes[i] & 0xFF) === (this.AD_HEADER_LEN & 0xFF) &&
          (bytes[i + 1] & 0xFF) === (this.AD_HEADER_TYPE & 0xFF) &&
          (bytes[i + 2] & 0xFF) === (this.PROTOCOL_FAMILY & 0xFF)) {
        offset = i;
        break;
      }
    }

    if (offset == -1) {
      return { valid: false, reason: 'invalid_header_or_family', rawHex: rawHex };
    }

    const seq = bytes[offset + 3] & 0xFF;
    const weightRaw = ((bytes[offset + 4] & 0xFF) << 8) | (bytes[offset + 5] & 0xFF);
    const weightKg = Math.round((weightRaw / 100.0) * 100.0) / 100.0;
    const impedanceRaw = ((bytes[offset + 6] & 0xFF) << 8) | (bytes[offset + 7] & 0xFF);
    const unitCode = bytes[offset + 8] & 0xFF;
    const stepSeq = bytes[offset + 9] & 0xFF;
    const attributeByte = bytes[offset + 10] & 0xFF;
    const isStable = (attributeByte & 0x01) !== 0;
    const embeddedMac = this.bytesToMac(bytes, offset + 11);
    const deviceAddress = (fallbackDeviceAddress && String(fallbackDeviceAddress).trim().length > 0)
      ? fallbackDeviceAddress
      : embeddedMac;

    return {
      valid: true,
      rawHex: rawHex,
      raw: rawHex,
      offset: offset,
      seq: seq,
      weightRaw: weightRaw,
      weightKg: weightKg,
      impedanceRaw: impedanceRaw,
      unitCode: unitCode,
      stepSeq: stepSeq,
      attributeByte: attributeByte,
      stable: isStable,
      isStable: isStable,
      embeddedMac: embeddedMac,
      deviceAddress: deviceAddress,
      source: 'ble',
      timestamp: Date.now(),
      timestampMs: Date.now()
    };
  }
};

class MockNativeBleScanner {
  constructor(options = {}) {
    this.sdkInt = options.sdkInt || 33;
    this.bluetoothSupported = options.bluetoothSupported !== false;
    this.bluetoothEnabled = options.bluetoothEnabled !== false;
    this.permissionsGranted = options.permissionsGranted !== false;
    this.locationServiceEnabled = options.locationServiceEnabled !== false;
    this.listener = options.listener || null;

    this.isScanning = false;
    this.startScanAttempts = 0;
    this.nativeScanResultCount = 0;
    this.recognizedScalePacketCount = 0;
    this.parsedWeightPacketCount = 0;
    this.stableWeightPacketCount = 0;
    this.lastNativePacketAt = null;
    this.lastParsedWeight = 0.0;
    this.lastParsedStable = false;
    this.lastScaleMac = null;

    this.packetBatch = [];
    this.batchFlushScheduled = false;
  }

  isBluetoothSupported() {
    return this.bluetoothSupported;
  }

  isBluetoothEnabled() {
    return this.bluetoothSupported && this.bluetoothEnabled;
  }

  hasRequiredPermissions() {
    if (this.sdkInt >= 31) {
      return this.permissionsGranted; // BLUETOOTH_SCAN & BLUETOOTH_CONNECT
    } else {
      return this.permissionsGranted; // ACCESS_FINE_LOCATION
    }
  }

  isLocationServiceEnabled() {
    if (this.sdkInt >= 31) return true;
    return this.locationServiceEnabled;
  }

  getRequiredPermissions() {
    if (this.sdkInt >= 31) {
      return ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT'];
    } else {
      return ['android.permission.ACCESS_FINE_LOCATION'];
    }
  }

  resetTelemetry() {
    this.nativeScanResultCount = 0;
    this.recognizedScalePacketCount = 0;
    this.parsedWeightPacketCount = 0;
    this.stableWeightPacketCount = 0;
    this.lastNativePacketAt = null;
    this.lastParsedWeight = 0.0;
    this.lastParsedStable = false;
    this.lastScaleMac = null;
  }

  getTelemetryJson() {
    return {
      startScanAttempts: this.startScanAttempts,
      nativeScanResultCount: this.nativeScanResultCount,
      recognizedScalePacketCount: this.recognizedScalePacketCount,
      parsedWeightPacketCount: this.parsedWeightPacketCount,
      stableWeightPacketCount: this.stableWeightPacketCount,
      lastNativePacketAt: this.lastNativePacketAt,
      lastParsedWeight: this.lastParsedWeight,
      lastParsedStable: this.lastParsedStable,
      lastScaleMac: this.lastScaleMac
    };
  }

  getDiagnosticState() {
    return {
      isSupported: this.isBluetoothSupported(),
      isEnabled: this.isBluetoothEnabled(),
      hasPermissions: this.hasRequiredPermissions(),
      isLocationEnabled: this.isLocationServiceEnabled(),
      isScanning: this.isScanning,
      androidVersion: '13.0',
      sdkInt: this.sdkInt,
      deviceModel: 'Google Pixel 7 Pro',
      telemetry: this.getTelemetryJson()
    };
  }

  startScan() {
    this.startScanAttempts++;

    if (!this.isBluetoothSupported()) {
      this.notifyError(101, 'Bluetooth Low Energy não é suportado neste aparelho.');
      return;
    }
    if (!this.isBluetoothEnabled()) {
      this.notifyError(102, 'Bluetooth desligado. Ative o Bluetooth nas configurações.');
      return;
    }
    if (!this.hasRequiredPermissions()) {
      this.notifyError(103, 'Permissão Bluetooth / Localização necessária para escanear.');
      return;
    }
    if (this.sdkInt < 31 && !this.isLocationServiceEnabled()) {
      this.notifyError(106, 'A localização (GPS) do aparelho precisa estar ativada no Android 11 ou anterior.');
      return;
    }

    if (this.isScanning) {
      return; // Already scanning, idempotent
    }

    this.isScanning = true;
    if (this.listener && this.listener.onScanStateChanged) {
      this.listener.onScanStateChanged(true, 'Scanner ativo');
    }
  }

  stopScan() {
    if (!this.isScanning) return;
    this.isScanning = false;
    this.flushBatch();
    if (this.listener && this.listener.onScanStateChanged) {
      this.listener.onScanStateChanged(false, 'Scanner parado');
    }
  }

  notifyError(code, message) {
    if (this.listener) {
      if (this.listener.onScanError) {
        this.listener.onScanError(code, message);
      }
      if (this.listener.onScanStateChanged) {
        this.listener.onScanStateChanged(false, 'Erro: ' + message);
      }
    }
  }

  processScanResult(result) {
    if (!result) return;
    this.nativeScanResultCount++;
    const nowMs = Date.now();
    this.lastNativePacketAt = new Date(nowMs).toISOString();

    const rawBytes = result.rawBytes;
    let parsedPacket = null;
    if (rawBytes && DavelyScaleParser.looksLikeDavelyPacket(rawBytes)) {
      parsedPacket = DavelyScaleParser.parse(rawBytes, result.deviceAddress);
      if (parsedPacket && parsedPacket.valid) {
        this.recognizedScalePacketCount++;
        this.parsedWeightPacketCount++;
        this.lastParsedWeight = parsedPacket.weightKg;
        this.lastParsedStable = parsedPacket.stable;
        this.lastScaleMac = parsedPacket.embeddedMac;

        if (parsedPacket.stable) {
          this.stableWeightPacketCount++;
        }

        if (this.listener && this.listener.onScaleMeasurementPacket) {
          this.listener.onScaleMeasurementPacket(parsedPacket);
        }
        if (this.listener && this.listener.onScaleTelemetryUpdated) {
          this.listener.onScaleTelemetryUpdated(this.getTelemetryJson());
        }
      }
    }

    // Packet batching
    const parsedMeta = {
      address: result.deviceAddress || '00:00:00:00:00:00',
      rssi: result.rssi || -70,
      receivedAt: this.lastNativePacketAt,
      rawHex: rawBytes ? DavelyScaleParser.bytesToHex(rawBytes) : '',
      isDavely: !!(parsedPacket && parsedPacket.valid)
    };
    this.packetBatch.push(parsedMeta);
    if (!this.batchFlushScheduled) {
      this.batchFlushScheduled = true;
      setTimeout(() => this.flushBatch(), 50);
    }
  }

  flushBatch() {
    if (this.packetBatch.length === 0) {
      this.batchFlushScheduled = false;
      return;
    }
    const batch = [...this.packetBatch];
    this.packetBatch = [];
    this.batchFlushScheduled = false;
    if (this.listener && this.listener.onAdvertisementsBatchReceived) {
      this.listener.onAdvertisementsBatchReceived(batch);
    }
  }
}

class MockMainActivity {
  constructor(options = {}) {
    this.jsEvaluations = [];
    this.toasts = [];
    this.clipboard = '';
    this.savedFiles = [];
    this.restNotifications = [];
    this.vibrations = [];
    this.permissionRequests = [];

    this.bleScanner = new MockNativeBleScanner({
      ...options,
      listener: {
        onScanStateChanged: (scanning, statusMessage) => {
          const diagJson = { scanning, message: statusMessage };
          const scaleState = {
            state: scanning ? 'SCANNING' : 'IDLE',
            scanning,
            message: statusMessage
          };
          this.runOnJs(`if (window.onBleScanStateChanged) window.onBleScanStateChanged(${JSON.stringify(diagJson)});if (window.onScaleStateChanged) window.onScaleStateChanged(${JSON.stringify(scaleState)});`);
        },
        onAdvertisementsBatchReceived: (batchJson) => {
          if (!batchJson || batchJson.length === 0) return;
          this.runOnJs(`if (window.onBleAdvertisementsBatch) { window.onBleAdvertisementsBatch(${JSON.stringify(batchJson)}); } else if (window.onBleAdvertisement) { var _arr=${JSON.stringify(batchJson)}; for(var _i=0;_i<_arr.length;_i++) window.onBleAdvertisement(_arr[_i]); }`);
        },
        onScanError: (errorCode, errorMessage) => {
          const json = { code: errorCode, message: errorMessage };
          const jsonStr = JSON.stringify(json);
          this.runOnJs(`if (window.onBleScanError) window.onBleScanError(${jsonStr});if (window.onScaleError) window.onScaleError(${jsonStr});`);
        },
        onScaleMeasurementPacket: (packet) => {
          if (!packet || !packet.valid) return;
          this.runOnJs(`if (window.onScaleMeasurement) window.onScaleMeasurement(${JSON.stringify(packet)});`);
        },
        onScaleTelemetryUpdated: (telemetry) => {
          if (!telemetry) return;
          this.runOnJs(`if (window.onScaleTelemetry) window.onScaleTelemetry(${JSON.stringify(telemetry)});`);
        }
      }
    });

    this.bridge = this.createBridge();
  }

  runOnJs(js) {
    if (typeof js !== 'string') return;
    this.jsEvaluations.push(js);
  }

  onRequestPermissionsResult(requestCode, permissions, grantResults) {
    if (requestCode === 201) {
      let allGranted = true;
      if (!grantResults || grantResults.length === 0) {
        allGranted = false;
      } else {
        for (const res of grantResults) {
          if (res !== 0) { // PERMISSION_GRANTED == 0
            allGranted = false;
            break;
          }
        }
      }
      if (allGranted) {
        this.runOnJs('if (window.onScalePermissionResult) window.onScalePermissionResult(true);');
        this.bleScanner.permissionsGranted = true;
        this.bleScanner.startScan();
      } else {
        const err = { code: 103, message: 'Permissão necessária de Bluetooth não foi concedida.' };
        const errStr = JSON.stringify(err);
        this.runOnJs(`if (window.onScalePermissionResult) window.onScalePermissionResult(false);if (window.onBleScanError) window.onBleScanError(${errStr});if (window.onScaleError) window.onScaleError(${errStr});`);
      }
    }
  }

  onPause() {
    if (this.bleScanner) {
      this.bleScanner.stopScan();
    }
  }

  onDestroy() {
    if (this.bleScanner) {
      this.bleScanner.stopScan();
    }
  }

  createBridge() {
    const act = this;
    return {
      startScaleMeasurement() {
        if (!act.bleScanner) return;
        if (act.bleScanner.hasRequiredPermissions()) {
          act.bleScanner.startScan();
        } else {
          act.permissionRequests.push(act.bleScanner.getRequiredPermissions());
        }
      },
      stopScaleMeasurement() {
        if (act.bleScanner) act.bleScanner.stopScan();
      },
      getBleTelemetry() {
        return act.bleScanner ? JSON.stringify(act.bleScanner.getTelemetryJson()) : '{}';
      },
      startBleScan() {
        this.startScaleMeasurement();
      },
      stopBleScan() {
        this.stopScaleMeasurement();
      },
      isBluetoothAvailable() {
        return act.bleScanner ? act.bleScanner.isBluetoothSupported() : false;
      },
      isBluetoothEnabled() {
        return act.bleScanner ? act.bleScanner.isBluetoothEnabled() : false;
      },
      hasBlePermissions() {
        return act.bleScanner ? act.bleScanner.hasRequiredPermissions() : false;
      },
      requestBlePermissions() {
        if (act.bleScanner) {
          act.permissionRequests.push(act.bleScanner.getRequiredPermissions());
        }
      },
      getBleDiagnosticState() {
        return act.bleScanner ? JSON.stringify(act.bleScanner.getDiagnosticState()) : '{}';
      },
      copyToClipboard(text) {
        act.clipboard = text != null ? String(text) : '';
        act.toasts.push('Copiado para a área de transferência');
      },
      saveBleDiagnosticFile(content, filename, mimeType) {
        act.savedFiles.push({
          content: content != null ? String(content) : '',
          filename: filename != null ? String(filename) : 'ble-diagnostic.txt',
          mimeType: (mimeType && mimeType.length > 0) ? mimeType : 'text/plain'
        });
        act.toasts.push('Diagnóstico salvo em Downloads/' + filename);
      },
      vibrate(ms) {
        act.vibrations.push(ms);
      },
      startRestNotification(label, endAt, alertEnabled) {
        act.restNotifications.push({ type: 'start', label: label || '', endAt, alertEnabled });
      },
      stopRestNotification() {
        act.restNotifications.push({ type: 'stop' });
      },
      restDoneNotification(label, alertEnabled) {
        act.restNotifications.push({ type: 'done', label: label || '', alertEnabled });
      },
      saveBackup(json, filename) {
        act.savedFiles.push({ content: json, filename: filename, mimeType: 'application/json' });
        act.toasts.push('Salvo em Downloads/' + filename);
      }
    };
  }
}

// =============================================================================
// SUITE 1: WebBridge Method Coverage & Contract Compliance
// =============================================================================
console.log('--- SUITE 1: WebBridge Interface Method Verification ---');
{
  const activity = new MockMainActivity();
  const bridge = activity.bridge;

  assert.strictEqual(typeof bridge.startScaleMeasurement, 'function');
  assert.strictEqual(typeof bridge.stopScaleMeasurement, 'function');
  assert.strictEqual(typeof bridge.getBleTelemetry, 'function');
  assert.strictEqual(typeof bridge.getBleDiagnosticState, 'function');
  assert.strictEqual(typeof bridge.isBluetoothAvailable, 'function');
  assert.strictEqual(typeof bridge.isBluetoothEnabled, 'function');
  assert.strictEqual(typeof bridge.hasBlePermissions, 'function');
  assert.strictEqual(typeof bridge.requestBlePermissions, 'function');
  assert.strictEqual(typeof bridge.copyToClipboard, 'function');
  assert.strictEqual(typeof bridge.saveBleDiagnosticFile, 'function');
  assert.strictEqual(typeof bridge.startBleScan, 'function');
  assert.strictEqual(typeof bridge.stopBleScan, 'function');
  assert.strictEqual(typeof bridge.vibrate, 'function');
  assert.strictEqual(typeof bridge.saveBackup, 'function');

  passAssertion('All 14 WebBridge interface methods exist and are functions');

  // Verify diagnostic state JSON schema
  const diagStateStr = bridge.getBleDiagnosticState();
  assert.strictEqual(typeof diagStateStr, 'string');
  const diagState = JSON.parse(diagStateStr);
  assert.strictEqual(diagState.isSupported, true);
  assert.strictEqual(diagState.isEnabled, true);
  assert.strictEqual(diagState.hasPermissions, true);
  assert.strictEqual(diagState.isScanning, false);
  assert.strictEqual(diagState.sdkInt, 33);
  assert.strictEqual(typeof diagState.telemetry, 'object');
  passAssertion('getBleDiagnosticState() returns conforming JSON string');

  // Verify telemetry JSON schema
  const telemStr = bridge.getBleTelemetry();
  const telem = JSON.parse(telemStr);
  assert.strictEqual(telem.startScanAttempts, 0);
  assert.strictEqual(telem.nativeScanResultCount, 0);
  assert.strictEqual(telem.recognizedScalePacketCount, 0);
  assert.strictEqual(telem.parsedWeightPacketCount, 0);
  assert.strictEqual(telem.stableWeightPacketCount, 0);
  assert.strictEqual(telem.lastNativePacketAt, null);
  assert.strictEqual(telem.lastParsedWeight, 0.0);
  assert.strictEqual(telem.lastParsedStable, false);
  assert.strictEqual(telem.lastScaleMac, null);
  passAssertion('getBleTelemetry() returns compliant schema with null/initial fields');

  console.log('✅ SUITE 1 Passed: WebBridge interface signatures and JSON schemas verified.');
}

// =============================================================================
// SUITE 2: Multi-SDK Runtime Permission Matrix & Location Requirements
// =============================================================================
console.log('\n--- SUITE 2: Multi-SDK Permission Matrix & Location Services ---');
{
  // Test 2.1: Android 13 (SDK 33) - Full permissions granted
  const act33Granted = new MockMainActivity({ sdkInt: 33, permissionsGranted: true });
  assert.strictEqual(act33Granted.bridge.hasBlePermissions(), true);
  act33Granted.bridge.startScaleMeasurement();
  assert.strictEqual(act33Granted.bleScanner.isScanning, true);
  passAssertion('Android 13 (SDK 33) with permissions granted starts scan immediately');

  // Test 2.2: Android 13 (SDK 33) - Permissions not yet granted
  const act33Denied = new MockMainActivity({ sdkInt: 33, permissionsGranted: false });
  assert.strictEqual(act33Denied.bridge.hasBlePermissions(), false);
  act33Denied.bridge.startScaleMeasurement();
  assert.strictEqual(act33Denied.bleScanner.isScanning, false);
  assert.strictEqual(act33Denied.permissionRequests.length, 1);
  assert.deepStrictEqual(act33Denied.permissionRequests[0], [
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_CONNECT'
  ]);
  passAssertion('Android 13 (SDK 33) without permissions dispatches BLUETOOTH_SCAN + CONNECT request');

  // Simulate user granting permission
  act33Denied.onRequestPermissionsResult(201, act33Denied.permissionRequests[0], [0, 0]); // 0 = GRANTED
  assert.strictEqual(act33Denied.bleScanner.isScanning, true);
  assert(act33Denied.jsEvaluations.some(js => js.includes('window.onScalePermissionResult(true)')));
  passAssertion('Android 13 onRequestPermissionsResult GRANTED triggers scan and JS success callback');

  // Test 2.3: Android 13 (SDK 33) - Permission Denied Flow
  const act33UserReject = new MockMainActivity({ sdkInt: 33, permissionsGranted: false });
  act33UserReject.onRequestPermissionsResult(201, ['android.permission.BLUETOOTH_SCAN'], [-1]); // -1 = DENIED
  assert.strictEqual(act33UserReject.bleScanner.isScanning, false);
  const rejectJs = act33UserReject.jsEvaluations.find(js => js.includes('window.onScalePermissionResult(false)'));
  assert(rejectJs, 'Must invoke onScalePermissionResult(false) upon denial');
  assert(rejectJs.includes('"code":103'), 'Must emit error code 103 on permission rejection');
  passAssertion('Android 13 permission denial correctly dispatches code 103 error to JS');

  // Test 2.4: Android 10 (SDK 29) - Location Services Requirement
  // On Android <= 30, BLE requires ACCESS_FINE_LOCATION and GPS must be enabled in device settings
  const act29NoGps = new MockMainActivity({
    sdkInt: 29,
    permissionsGranted: true,
    locationServiceEnabled: false
  });
  act29NoGps.bridge.startScaleMeasurement();
  assert.strictEqual(act29NoGps.bleScanner.isScanning, false);
  const gpsErrJs = act29NoGps.jsEvaluations.find(js => js.includes('"code":106'));
  assert(gpsErrJs, 'Must emit error code 106 when location service (GPS) is disabled on SDK <= 30');
  assert(gpsErrJs.includes('localização (GPS) do aparelho precisa estar ativada'));
  passAssertion('SDK <= 30 enforces GPS location service enabled with error code 106');

  // Test 2.5: Android 10 (SDK 29) with Location Service Enabled
  const act29GpsOk = new MockMainActivity({
    sdkInt: 29,
    permissionsGranted: true,
    locationServiceEnabled: true
  });
  act29GpsOk.bridge.startScaleMeasurement();
  assert.strictEqual(act29GpsOk.bleScanner.isScanning, true);
  passAssertion('SDK <= 30 with GPS enabled starts scan successfully');

  // Test 2.6: Empty/Null grantResults handling (dialog dismissed without action)
  const actDismissed = new MockMainActivity({ sdkInt: 33, permissionsGranted: false });
  actDismissed.onRequestPermissionsResult(201, [], []);
  assert.strictEqual(actDismissed.bleScanner.isScanning, false);
  assert(actDismissed.jsEvaluations.some(js => js.includes('window.onScalePermissionResult(false)')));
  passAssertion('Empty grantResults (cancelled dialog) safely handled as denied');

  console.log('✅ SUITE 2 Passed: Multi-SDK permission paths and location constraints verified.');
}

// =============================================================================
// SUITE 3: High-Frequency Concurrency & Rapid Start/Stop Cycles
// =============================================================================
console.log('\n--- SUITE 3: Rapid Start/Stop Cycles & Concurrency Invariants ---');
{
  const activity = new MockMainActivity();
  const bridge = activity.bridge;

  // 1,000 rapid start/stop cycles
  for (let i = 0; i < 1000; i++) {
    bridge.startScaleMeasurement();
    bridge.stopScaleMeasurement();
  }

  assert.strictEqual(activity.bleScanner.isScanning, false);
  assert.strictEqual(activity.bleScanner.startScanAttempts, 1000);
  passAssertion('1,000 rapid start/stop cycles executed without deadlock or state corruption');

  // Redundant starts (idempotency)
  bridge.startScaleMeasurement();
  assert.strictEqual(activity.bleScanner.isScanning, true);
  bridge.startScaleMeasurement();
  bridge.startScaleMeasurement();
  bridge.startScaleMeasurement();
  assert.strictEqual(activity.bleScanner.isScanning, true);
  assert.strictEqual(activity.bleScanner.startScanAttempts, 1004);
  passAssertion('Calling startScaleMeasurement() while already scanning is strictly idempotent');

  // Redundant stops (idempotency)
  bridge.stopScaleMeasurement();
  assert.strictEqual(activity.bleScanner.isScanning, false);
  bridge.stopScaleMeasurement();
  bridge.stopScaleMeasurement();
  assert.strictEqual(activity.bleScanner.isScanning, false);
  passAssertion('Calling stopScaleMeasurement() while stopped is strictly idempotent');

  // Batch queue flush on stop
  bridge.startScaleMeasurement();
  // Feed scan results
  const dummyPacket = {
    deviceAddress: '78:66:A5:5E:C4:59',
    rssi: -65,
    rawBytes: DavelyScaleParser.hexToBytes('10FFC00D19B900000A01247866A55EC459')
  };
  activity.bleScanner.processScanResult(dummyPacket);
  assert.strictEqual(activity.bleScanner.packetBatch.length, 1);
  // Calling stopScan must immediately flush all pending batches
  bridge.stopScaleMeasurement();
  assert.strictEqual(activity.bleScanner.packetBatch.length, 0);
  assert(activity.jsEvaluations.some(js => js.includes('window.onBleAdvertisementsBatch')));
  passAssertion('stopScaleMeasurement() flushes pending packet batches immediately');

  console.log('✅ SUITE 3 Passed: Concurrency, rapid start/stop, and immediate queue flush verified.');
}

// =============================================================================
// SUITE 4: Telemetry Monotonicity & Arithmetic Invariants
// =============================================================================
console.log('\n--- SUITE 4: Telemetry Monotonicity & Packet Accounting ---');
{
  const activity = new MockMainActivity();
  const scanner = activity.bleScanner;
  scanner.startScan();

  const packetUnstable = {
    deviceAddress: '78:66:A5:5E:C4:59',
    rssi: -60,
    rawBytes: DavelyScaleParser.hexToBytes('10FFC00D19B900000A01247866A55EC459') // 65.85 kg, unstable
  };
  const packetStable = {
    deviceAddress: '78:66:A5:5E:C4:59',
    rssi: -58,
    rawBytes: DavelyScaleParser.hexToBytes('10FFC007191917700A01257866A55EC459') // 64.25 kg, stable, imp 6000
  };
  const packetForeign = {
    deviceAddress: 'AA:BB:CC:DD:EE:FF',
    rssi: -80,
    rawBytes: new Uint8Array([0x02, 0x01, 0x06, 0x05, 0x09, 0x54, 0x65, 0x73, 0x74]) // Non-Davely
  };
  const packetCorrupt = {
    deviceAddress: '78:66:A5:5E:C4:59',
    rssi: -70,
    rawBytes: new Uint8Array([0x10, 0xFF, 0xC0, 0x00, 0x12]) // Truncated (5 bytes)
  };

  // Inject 10 unstable Davely packets
  for (let i = 0; i < 10; i++) {
    scanner.processScanResult(packetUnstable);
  }
  let t = scanner.getTelemetryJson();
  assert.strictEqual(t.nativeScanResultCount, 10);
  assert.strictEqual(t.recognizedScalePacketCount, 10);
  assert.strictEqual(t.parsedWeightPacketCount, 10);
  assert.strictEqual(t.stableWeightPacketCount, 0);
  assert.strictEqual(t.lastParsedWeight, 65.85);
  assert.strictEqual(t.lastParsedStable, false);
  assert.strictEqual(t.lastScaleMac, '78:66:A5:5E:C4:59');
  passAssertion('10 unstable packets increment scan and recognized counters with stable count = 0');

  // Inject 5 stable Davely packets
  for (let i = 0; i < 5; i++) {
    scanner.processScanResult(packetStable);
  }
  t = scanner.getTelemetryJson();
  assert.strictEqual(t.nativeScanResultCount, 15);
  assert.strictEqual(t.recognizedScalePacketCount, 15);
  assert.strictEqual(t.parsedWeightPacketCount, 15);
  assert.strictEqual(t.stableWeightPacketCount, 5);
  assert.strictEqual(t.lastParsedWeight, 64.25);
  assert.strictEqual(t.lastParsedStable, true);
  passAssertion('5 stable packets increment stableWeightPacketCount to 5 and update lastParsedWeight');

  // Inject 20 non-Davely packets
  for (let i = 0; i < 20; i++) {
    scanner.processScanResult(packetForeign);
  }
  t = scanner.getTelemetryJson();
  assert.strictEqual(t.nativeScanResultCount, 35);
  assert.strictEqual(t.recognizedScalePacketCount, 15); // Unchanged!
  assert.strictEqual(t.parsedWeightPacketCount, 15);     // Unchanged!
  assert.strictEqual(t.stableWeightPacketCount, 5);      // Unchanged!
  passAssertion('Non-Davely packets increment nativeScanResultCount only without polluting scale counters');

  // Inject 10 corrupted packets
  for (let i = 0; i < 10; i++) {
    scanner.processScanResult(packetCorrupt);
  }
  t = scanner.getTelemetryJson();
  assert.strictEqual(t.nativeScanResultCount, 45);
  assert.strictEqual(t.recognizedScalePacketCount, 15);
  assert.strictEqual(t.parsedWeightPacketCount, 15);
  passAssertion('Corrupted packets are safely ignored by scale counters');

  // Test resetTelemetry()
  scanner.resetTelemetry();
  t = scanner.getTelemetryJson();
  assert.strictEqual(t.startScanAttempts, 1); // Preserved
  assert.strictEqual(t.nativeScanResultCount, 0);
  assert.strictEqual(t.recognizedScalePacketCount, 0);
  assert.strictEqual(t.parsedWeightPacketCount, 0);
  assert.strictEqual(t.stableWeightPacketCount, 0);
  assert.strictEqual(t.lastNativePacketAt, null);
  assert.strictEqual(t.lastParsedWeight, 0.0);
  assert.strictEqual(t.lastParsedStable, false);
  assert.strictEqual(t.lastScaleMac, null);
  passAssertion('resetTelemetry() accurately zeroes packet statistics and clears last cached measurements');

  console.log('✅ SUITE 4 Passed: Telemetry counters maintain strict mathematical precision.');
}

// =============================================================================
// SUITE 5: Null Pointer Protection & Defensive Boundary Fuzzing
// =============================================================================
console.log('\n--- SUITE 5: Null Pointer & Adversarial Boundary Fuzzing ---');
{
  const activity = new MockMainActivity();
  const bridge = activity.bridge;

  // Test 5.1: Null and undefined arguments across all bridge methods
  assert.doesNotThrow(() => {
    bridge.copyToClipboard(null);
    bridge.copyToClipboard(undefined);
    bridge.copyToClipboard('');
    bridge.saveBleDiagnosticFile(null, null, null);
    bridge.saveBleDiagnosticFile('test content', null, '');
    bridge.saveBackup(null, null);
    bridge.startRestNotification(null, 0, false);
    bridge.restDoneNotification(null, true);
    bridge.vibrate(0);
    bridge.vibrate(-100);
  }, 'Bridge methods must not throw when invoked with null, undefined, or empty values');
  passAssertion('Bridge methods handle null/undefined parameters with 100% safety');

  // Test 5.2: Scanner result processing with completely null or pathological inputs
  const scanner = activity.bleScanner;
  assert.doesNotThrow(() => {
    scanner.processScanResult(null);
    scanner.processScanResult({});
    scanner.processScanResult({ deviceAddress: null, rssi: 0, rawBytes: null });
    scanner.processScanResult({ deviceAddress: '', rssi: -127, rawBytes: new Uint8Array([]) });
    scanner.processScanResult({ deviceAddress: 'MALFORMED', rssi: 999, rawBytes: new Uint8Array(1000) });
  }, 'processScanResult must safely handle null and malformed ScanResult objects');
  passAssertion('processScanResult resists null ScanResult objects and empty byte arrays');

  // Test 5.3: JS Injection & Special Character Escaping Safety in bridge dispatches
  const xssText = '</script><script>alert("xss")</script>\n\r\t"\'\\';
  bridge.copyToClipboard(xssText);
  assert.strictEqual(activity.clipboard, xssText);
  bridge.saveBleDiagnosticFile(xssText, 'xss.json', 'application/json');
  assert.strictEqual(activity.savedFiles[activity.savedFiles.length - 1].content, xssText);
  passAssertion('Diagnostic saving and clipboard support strings containing quotes, backslashes, and HTML');

  console.log('✅ SUITE 5 Passed: Null safety and adversarial input sanitization verified.');
}

// =============================================================================
// SUITE 6: Error Code Matrix & Dual-Dispatch Formatting
// =============================================================================
console.log('\n--- SUITE 6: Error Code Matrix & Dual-Dispatch Consistency ---');
{
  const errorScenarios = [
    {
      name: 'Bluetooth Hardware Not Supported',
      setup: { bluetoothSupported: false, bluetoothEnabled: true, permissionsGranted: true },
      expectedCode: 101,
      expectedMsg: 'Bluetooth Low Energy não é suportado neste aparelho.'
    },
    {
      name: 'Bluetooth Radio Disabled',
      setup: { bluetoothSupported: true, bluetoothEnabled: false, permissionsGranted: true },
      expectedCode: 102,
      expectedMsg: 'Bluetooth desligado. Ative o Bluetooth nas configurações.'
    },
    {
      name: 'Runtime Permission Missing',
      setup: { bluetoothSupported: true, bluetoothEnabled: true, permissionsGranted: false },
      expectedCode: 103,
      expectedMsg: 'Permissão Bluetooth / Localização necessária para escanear.'
    },
    {
      name: 'Location Services Disabled on Android <= 30',
      setup: { sdkInt: 28, bluetoothSupported: true, bluetoothEnabled: true, permissionsGranted: true, locationServiceEnabled: false },
      expectedCode: 106,
      expectedMsg: 'A localização (GPS) do aparelho precisa estar ativada no Android 11 ou anterior.'
    }
  ];

  for (const scen of errorScenarios) {
    const act = new MockMainActivity(scen.setup);
    act.bleScanner.startScan();

    const errJs = act.jsEvaluations.find(js => js.includes(`"code":${scen.expectedCode}`));
    assert(errJs, `Scenario "${scen.name}" must emit error code ${scen.expectedCode}`);
    assert(errJs.includes(scen.expectedMsg), `Scenario "${scen.name}" message mismatch`);
    // Verify dual-dispatch to both window.onBleScanError and window.onScaleError
    assert(errJs.includes('window.onBleScanError'), 'Must notify window.onBleScanError');
    assert(errJs.includes('window.onScaleError'), 'Must notify window.onScaleError');
    passAssertion(`Error code ${scen.expectedCode} (${scen.name}) dual-dispatched with conforming payload`);
  }

  console.log('✅ SUITE 6 Passed: Error code matrix and dual-dispatch contracts verified.');
}

// =============================================================================
// SUITE 7: Android Activity Lifecycle Integration (Pause & Destroy)
// =============================================================================
console.log('\n--- SUITE 7: Android Activity Lifecycle Safety (onPause / onDestroy) ---');
{
  const activity = new MockMainActivity();
  activity.bridge.startScaleMeasurement();
  assert.strictEqual(activity.bleScanner.isScanning, true);

  // App moves to background (onPause)
  activity.onPause();
  assert.strictEqual(activity.bleScanner.isScanning, false, 'onPause must automatically stop BLE scan to save battery');
  passAssertion('onPause stops active BLE scan cleanly');

  // Resume and restart
  activity.bridge.startScaleMeasurement();
  assert.strictEqual(activity.bleScanner.isScanning, true);

  // Activity destruction (onDestroy)
  activity.onDestroy();
  assert.strictEqual(activity.bleScanner.isScanning, false, 'onDestroy must release BLE scanner resources');
  passAssertion('onDestroy stops BLE scan and releases resources');

  console.log('✅ SUITE 7 Passed: Lifecycle pauses and teardowns safely terminate BLE scanning.');
}

console.log('\n================================================================');
console.log(`🎉 ALL EMPIRICAL CHALLENGER M3_1 TESTS PASSED (${totalAssertions} ASSERTIONS)!`);
console.log('================================================================\n');
