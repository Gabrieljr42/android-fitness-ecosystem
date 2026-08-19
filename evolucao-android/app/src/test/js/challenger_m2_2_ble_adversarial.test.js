'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('=== EMPIRICAL CHALLENGER 2: BLE PARSER & SCANNER STRESS HARNESS       ===');
console.log('========================================================================\n');

// 1. Opaque-Box Reference Parser mirroring DavelyScaleParser.java exactly
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
      const high = parseInt(cleanHex[i], 16);
      const low = parseInt(cleanHex[i + 1], 16);
      if (isNaN(high) || isNaN(low)) return null;
      bytes[i / 2] = (high << 4) | low;
    }
    return bytes;
  },

  bytesToHex(bytes) {
    if (!bytes || bytes.length === 0) return '';
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  },

  bytesToMac(bytes, startIdx) {
    if (!bytes || bytes.length < startIdx + 6) return null;
    const parts = [];
    for (let i = 0; i < 6; i++) {
      parts.push(bytes[startIdx + i].toString(16).padStart(2, '0').toUpperCase());
    }
    return parts.join(':');
  },

  looksLikeDavelyPacket(data) {
    let bytes = data;
    if (typeof data === 'string') {
      const clean = this.cleanHex(data);
      if (!clean) return false;
      bytes = this.hexToBytes(clean);
    }
    if (!bytes || bytes.length < this.PACKET_LENGTH) return false;
    for (let i = 0; i <= bytes.length - this.PACKET_LENGTH; i++) {
      if ((bytes[i] & 0xFF) === this.AD_HEADER_LEN &&
          (bytes[i + 1] & 0xFF) === this.AD_HEADER_TYPE &&
          (bytes[i + 2] & 0xFF) === this.PROTOCOL_FAMILY) {
        return true;
      }
    }
    return false;
  },

  parse(data, fallbackAddress) {
    let bytes = null;
    let rawHex = '';

    if (typeof data === 'string') {
      const clean = this.cleanHex(data);
      if (!clean) return { isValid: false, errorReason: 'malformed_or_odd_hex', rawHex: data };
      bytes = this.hexToBytes(clean);
      rawHex = clean;
    } else if (data instanceof Uint8Array || Array.isArray(data) || (typeof Buffer !== 'undefined' && Buffer.isBuffer(data))) {
      bytes = new Uint8Array(data);
      rawHex = this.bytesToHex(bytes);
    } else {
      return { isValid: false, errorReason: 'empty_or_invalid_input', rawHex: '' };
    }

    if (!bytes || bytes.length < this.PACKET_LENGTH) {
      return { isValid: false, errorReason: 'truncated_payload', rawHex: rawHex };
    }

    let offset = -1;
    for (let i = 0; i <= bytes.length - this.PACKET_LENGTH; i++) {
      if ((bytes[i] & 0xFF) === this.AD_HEADER_LEN &&
          (bytes[i + 1] & 0xFF) === this.AD_HEADER_TYPE &&
          (bytes[i + 2] & 0xFF) === this.PROTOCOL_FAMILY) {
        offset = i;
        break;
      }
    }

    if (offset === -1) {
      return { isValid: false, errorReason: 'invalid_header_or_family', rawHex: rawHex };
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
    const deviceAddress = (fallbackAddress && fallbackAddress.trim()) ? fallbackAddress : embeddedMac;

    return {
      isValid: true,
      errorReason: null,
      weightKg,
      weightRaw,
      impedanceRaw,
      unitCode,
      stepSeq,
      seq,
      attributeByte,
      isStable,
      embeddedMac,
      deviceAddress,
      rawHex,
      offset
    };
  }
};

// =============================================================================
// TEST SUITE 1: CANONICAL TEST VECTORS (ORIGINAL_REQUEST R2 & ACCEPTANCE)
// =============================================================================
console.log('--- TEST SUITE 1: Canonical Davely Test Vectors ---');

// Vector 1: Unstable Measuring Packet
const v1 = DavelyScaleParser.parse('10FFC00D19B900000A01247866A55EC459');
assert.strictEqual(v1.isValid, true);
assert.strictEqual(v1.weightKg, 65.85);
assert.strictEqual(v1.isStable, false);
assert.strictEqual(v1.impedanceRaw, 0);
assert.strictEqual(v1.embeddedMac, '78:66:A5:5E:C4:59');
assert.strictEqual(v1.seq, 0x0D);
assert.strictEqual(v1.attributeByte, 0x24);
console.log('✅ Vector 1 verified: 65.85 kg, unstable (0x24), 0 impedance, MAC 78:66:A5:5E:C4:59');

// Vector 2: Unstable Fluctuating Packet
const v2 = DavelyScaleParser.parse('10FFC010195F00000A01247866A55EC459');
assert.strictEqual(v2.isValid, true);
assert.strictEqual(v2.weightKg, 64.95);
assert.strictEqual(v2.isStable, false);
assert.strictEqual(v2.impedanceRaw, 0);
assert.strictEqual(v2.embeddedMac, '78:66:A5:5E:C4:59');
assert.strictEqual(v2.seq, 0x10);
console.log('✅ Vector 2 verified: 64.95 kg, unstable (0x24), 0 impedance, MAC 78:66:A5:5E:C4:59');

// Vector 3: Stable Locked Packet with Bioimpedance
const v3 = DavelyScaleParser.parse('10FFC007191917700A01257866A55EC459');
assert.strictEqual(v3.isValid, true);
assert.strictEqual(v3.weightKg, 64.25);
assert.strictEqual(v3.isStable, true);
assert.strictEqual(v3.impedanceRaw, 6000); // 0x1770 = 6000
assert.strictEqual(v3.embeddedMac, '78:66:A5:5E:C4:59');
assert.strictEqual(v3.seq, 0x07);
assert.strictEqual(v3.attributeByte, 0x25);
console.log('✅ Vector 3 verified: 64.25 kg, stable (0x25), impedanceRaw = 6000 (0x1770)');

// =============================================================================
// TEST SUITE 2: NAMELESS PERIPHERAL DISCOVERY & FILTERING SIMULATION
// =============================================================================
console.log('\n--- TEST SUITE 2: Nameless Peripheral Discovery Simulation ---');

class MockBleScanner {
  constructor() {
    this.startScanAttempts = 0;
    this.nativeScanResultCount = 0;
    this.recognizedScalePacketCount = 0;
    this.parsedWeightPacketCount = 0;
    this.stableWeightPacketCount = 0;
    this.lastNativePacketAt = null;
    this.lastParsedWeight = 0.0;
    this.lastParsedStable = false;
    this.lastScaleMac = null;
    this.discoveredDevices = [];
  }

  onScanResult(mockScanResult) {
    this.nativeScanResultCount++;
    this.lastNativePacketAt = new Date().toISOString();

    // Nameless device handling: do NOT drop when device.getName() == null
    const deviceName = mockScanResult.device ? mockScanResult.device.name : null;
    const address = mockScanResult.device ? mockScanResult.device.address : '00:00:00:00:00:00';
    const recordBytes = mockScanResult.scanRecordBytes;

    let parsedPacket = null;
    if (recordBytes && DavelyScaleParser.looksLikeDavelyPacket(recordBytes)) {
      parsedPacket = DavelyScaleParser.parse(recordBytes, address);
      if (parsedPacket.isValid) {
        this.recognizedScalePacketCount++;
        this.parsedWeightPacketCount++;
        this.lastParsedWeight = parsedPacket.weightKg;
        this.lastParsedStable = parsedPacket.isStable;
        this.lastScaleMac = parsedPacket.embeddedMac;
        if (parsedPacket.isStable) {
          this.stableWeightPacketCount++;
        }
      }
    }

    this.discoveredDevices.push({
      deviceName: deviceName,
      address: address,
      rssi: mockScanResult.rssi,
      isDavely: parsedPacket ? parsedPacket.isValid : false,
      weight: parsedPacket ? parsedPacket.weightKg : null
    });
  }
}

const scanner = new MockBleScanner();

// 1. Nameless Davely scale broadcast (device.getName() == null)
scanner.onScanResult({
  device: { name: null, address: '78:66:A5:5E:C4:59' },
  scanRecordBytes: '10FFC007191917700A01257866A55EC459',
  rssi: -62
});

assert.strictEqual(scanner.nativeScanResultCount, 1);
assert.strictEqual(scanner.recognizedScalePacketCount, 1);
assert.strictEqual(scanner.parsedWeightPacketCount, 1);
assert.strictEqual(scanner.stableWeightPacketCount, 1);
assert.strictEqual(scanner.lastParsedWeight, 64.25);
assert.strictEqual(scanner.discoveredDevices[0].deviceName, null);
assert.strictEqual(scanner.discoveredDevices[0].isDavely, true);
console.log('✅ Nameless device discovery verified: device with null name correctly parsed and retained.');

// 2. Nameless non-Davely device broadcast
scanner.onScanResult({
  device: { name: null, address: '11:22:33:44:55:66' },
  scanRecordBytes: '02010603031D1807161D1802B01925',
  rssi: -80
});

assert.strictEqual(scanner.nativeScanResultCount, 2);
assert.strictEqual(scanner.recognizedScalePacketCount, 1);
assert.strictEqual(scanner.discoveredDevices[1].isDavely, false);
console.log('✅ Nameless non-scale device safely ingested without crashing telemetry.');

// =============================================================================
// TEST SUITE 3: TELEMETRY COUNTERS ATOMIC & HIGH-THROUGHPUT STRESS TEST
// =============================================================================
console.log('\n--- TEST SUITE 3: Telemetry Counters & High-Throughput Burst Test ---');

const burstScanner = new MockBleScanner();

const totalBurstPackets = 1000;
let expectedScalePackets = 0;
let expectedStablePackets = 0;

for (let i = 0; i < totalBurstPackets; i++) {
  const type = i % 5;
  if (type === 0) {
    // Unstable Davely packet
    burstScanner.onScanResult({
      device: { name: null, address: '78:66:A5:5E:C4:59' },
      scanRecordBytes: '10FFC00D19B900000A01247866A55EC459',
      rssi: -65
    });
    expectedScalePackets++;
  } else if (type === 1) {
    // Stable Davely packet
    burstScanner.onScanResult({
      device: { name: 'Davely Scale', address: '78:66:A5:5E:C4:59' },
      scanRecordBytes: '10FFC007191917700A01257866A55EC459',
      rssi: -60
    });
    expectedScalePackets++;
    expectedStablePackets++;
  } else {
    // Non-Davely noise
    burstScanner.onScanResult({
      device: { name: 'Noise Beacon', address: 'AA:BB:CC:DD:EE:FF' },
      scanRecordBytes: '0201061AFF4C000215FDA50693A4E24FB1AFCFC6EB07647825279A1234C5',
      rssi: -75
    });
  }
}

assert.strictEqual(burstScanner.nativeScanResultCount, 1000);
assert.strictEqual(burstScanner.recognizedScalePacketCount, expectedScalePackets);
assert.strictEqual(burstScanner.parsedWeightPacketCount, expectedScalePackets);
assert.strictEqual(burstScanner.stableWeightPacketCount, expectedStablePackets);
assert.strictEqual(expectedScalePackets, 400);
assert.strictEqual(expectedStablePackets, 200);
assert.ok(burstScanner.lastNativePacketAt !== null);

console.log(`✅ Telemetry burst verified: 1000 total packets, ${expectedScalePackets} scale packets, ${expectedStablePackets} stable packets.`);

// =============================================================================
// TEST SUITE 4: ADVERSARIAL EDGE CASES & SLIDING WINDOW SEARCH
// =============================================================================
console.log('\n--- TEST SUITE 4: Adversarial Edge Cases & Sliding Window Search ---');

// 1. Sliding window with large prefix and suffix
const noisePrefix = '0201060302E0FF050944415645'; // Flags + 16-bit UUID + Name 'DAVE'
const validPacket = '10FFC007191917700A01257866A55EC459';
const noiseSuffix = '0000000000000000';
const compositeAd = noisePrefix + validPacket + noiseSuffix;

const compositeResult = DavelyScaleParser.parse(compositeAd);
assert.strictEqual(compositeResult.isValid, true);
assert.strictEqual(compositeResult.offset, noisePrefix.length / 2);
assert.strictEqual(compositeResult.weightKg, 64.25);
assert.strictEqual(compositeResult.isStable, true);
assert.strictEqual(compositeResult.impedanceRaw, 6000);
console.log('✅ Sliding window detection in composite advertisement buffer verified.');

// 2. Truncation and byte fuzzing
const truncated16Bytes = '10FFC007191917700A01257866A55EC4';
assert.strictEqual(DavelyScaleParser.parse(truncated16Bytes).isValid, false);

const invalidFamily = '10FFA007191917700A01257866A55EC459';
assert.strictEqual(DavelyScaleParser.parse(invalidFamily).isValid, false);

const emptyHex = '';
assert.strictEqual(DavelyScaleParser.parse(emptyHex).isValid, false);

console.log('✅ Negative edge cases (truncated 16-byte, invalid family 0xA0, empty hex) safely rejected.');

console.log('\n========================================================================');
console.log('🎉 ALL EMPIRICAL CHALLENGER 2 STRESS TESTS PASSED (100%)');
console.log('========================================================================\n');
