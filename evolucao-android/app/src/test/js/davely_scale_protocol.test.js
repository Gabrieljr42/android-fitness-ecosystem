'use strict';

/**
 * ==============================================================================
 * DAVELY BLE SCALE INTEGRATION — PROTOCOL & PARSER TEST SUITE
 * Tiers 1 & 2: Feature Coverage, Boundary & Corner Cases, Negative Verification
 * ==============================================================================
 */

const assert = require('assert');

console.log('=== [EVOLUÇÃO] Executando Suíte de Testes: Protocolo & Parser BLE Davely ===\n');

// -----------------------------------------------------------------------------
// Pure Opaque-Box Reference Parser Implementation
// Derived strictly from ORIGINAL_REQUEST.md (§ R2) & explorer_protocol/handoff.md
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
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
    return bytes;
  },

  bytesToMac(bytes, startIdx) {
    if (!bytes || bytes.length < startIdx + 6) return null;
    const macParts = [];
    for (let i = 0; i < 6; i++) {
      macParts.push(bytes[startIdx + i].toString(16).padStart(2, '0').toUpperCase());
    }
    return macParts.join(':');
  },

  looksLikeDavelyPacket(bytes) {
    if (!bytes || bytes.length < this.PACKET_LENGTH) return false;
    for (let i = 0; i <= bytes.length - this.PACKET_LENGTH; i++) {
      if (bytes[i] === this.AD_HEADER_LEN &&
          bytes[i + 1] === this.AD_HEADER_TYPE &&
          bytes[i + 2] === this.PROTOCOL_FAMILY) {
        return true;
      }
    }
    return false;
  },

  parse(data, deviceAddress) {
    let bytes = null;
    let rawHex = '';

    if (typeof data === 'string') {
      const clean = this.cleanHex(data);
      if (!clean) return { valid: false, reason: 'malformed_or_odd_hex' };
      bytes = this.hexToBytes(clean);
      rawHex = clean;
    } else if (data instanceof Uint8Array || Array.isArray(data) || (typeof Buffer !== 'undefined' && Buffer.isBuffer(data))) {
      bytes = new Uint8Array(data);
      rawHex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
    } else {
      return { valid: false, reason: 'empty_or_invalid_input' };
    }

    if (!bytes || bytes.length < this.PACKET_LENGTH) {
      return { valid: false, reason: 'truncated_payload', length: bytes ? bytes.length : 0 };
    }

    let offset = -1;
    for (let i = 0; i <= bytes.length - this.PACKET_LENGTH; i++) {
      if (bytes[i] === this.AD_HEADER_LEN &&
          bytes[i + 1] === this.AD_HEADER_TYPE &&
          bytes[i + 2] === this.PROTOCOL_FAMILY) {
        offset = i;
        break;
      }
    }

    if (offset === -1) {
      return { valid: false, reason: 'invalid_header_or_family' };
    }

    const p = bytes.subarray(offset, offset + this.PACKET_LENGTH);
    const seq = p[3];
    const weightRaw = (p[4] << 8) | p[5];
    const weightKg = Math.round((weightRaw / 100.0) * 100) / 100;
    const impedanceRaw = (p[6] << 8) | p[7];
    const unitCode = p[8];
    const stepSeq = p[9];
    const attributeByte = p[10];
    const isStable = (attributeByte & 0x01) !== 0;
    const embeddedMac = this.bytesToMac(p, 11);

    return {
      valid: true,
      rawHex: rawHex,
      offset: offset,
      seq: seq,
      weightRaw: weightRaw,
      weightKg: weightKg,
      impedanceRaw: impedanceRaw,
      unitCode: unitCode,
      stepSeq: stepSeq,
      attributeByte: attributeByte,
      stable: isStable,
      embeddedMac: embeddedMac,
      deviceAddress: deviceAddress || null
    };
  }
};

// =============================================================================
// TIER 1: FEATURE COVERAGE (Isolated Happy-Path Verification)
// =============================================================================
let tier1Count = 0;
console.log('--- TIER 1: Feature Coverage (Protocol & Parser) ---');

// 1. Test Vector 1: Unstable Measuring Packet
{
  const v1 = '10FFC00D19B900000A01247866A55EC459';
  const res = DavelyScaleParser.parse(v1, '78:66:A5:5E:C4:59');
  assert.strictEqual(res.valid, true, 'Test Vector 1 deve ser válido');
  assert.strictEqual(res.weightKg, 65.85, 'Vector 1: weightKg deve ser 65.85 kg');
  assert.strictEqual(res.weightRaw, 6585, 'Vector 1: weightRaw deve ser 6585');
  assert.strictEqual(res.stable, false, 'Vector 1: stable deve ser false (0x24)');
  assert.strictEqual(res.impedanceRaw, 0, 'Vector 1: impedanceRaw deve ser 0');
  assert.strictEqual(res.embeddedMac, '78:66:A5:5E:C4:59', 'Vector 1: embeddedMac deve ser 78:66:A5:5E:C4:59');
  assert.strictEqual(res.unitCode, 0x0A, 'Vector 1: unitCode deve ser 0x0A');
  assert.strictEqual(res.seq, 0x0D, 'Vector 1: seq deve ser 0x0D');
  tier1Count += 8;
}

// 2. Test Vector 2: Unstable Fluctuating Packet
{
  const v2 = '10FFC010195F00000A01247866A55EC459';
  const res = DavelyScaleParser.parse(v2, '78:66:A5:5E:C4:59');
  assert.strictEqual(res.valid, true, 'Test Vector 2 deve ser válido');
  assert.strictEqual(res.weightKg, 64.95, 'Vector 2: weightKg deve ser 64.95 kg');
  assert.strictEqual(res.weightRaw, 6495, 'Vector 2: weightRaw deve ser 6495');
  assert.strictEqual(res.stable, false, 'Vector 2: stable deve ser false');
  assert.strictEqual(res.impedanceRaw, 0, 'Vector 2: impedanceRaw deve ser 0');
  assert.strictEqual(res.seq, 0x10, 'Vector 2: seq deve ser 0x10');
  tier1Count += 6;
}

// 3. Test Vector 3: Stable Locked Measurement with Bioimpedance
{
  const v3 = '10FFC007191917700A01257866A55EC459';
  const res = DavelyScaleParser.parse(v3, '78:66:A5:5E:C4:59');
  assert.strictEqual(res.valid, true, 'Test Vector 3 deve ser válido');
  assert.strictEqual(res.weightKg, 64.25, 'Vector 3: weightKg deve ser 64.25 kg');
  assert.strictEqual(res.weightRaw, 6425, 'Vector 3: weightRaw deve ser 6425');
  assert.strictEqual(res.stable, true, 'Vector 3: stable deve ser true (0x25)');
  assert.strictEqual(res.impedanceRaw, 6000, 'Vector 3: impedanceRaw deve ser 6000 (0x1770)');
  assert.strictEqual(res.embeddedMac, '78:66:A5:5E:C4:59', 'Vector 3: embeddedMac deve ser 78:66:A5:5E:C4:59');
  assert.strictEqual(res.seq, 0x07, 'Vector 3: seq deve ser 0x07');
  tier1Count += 7;
}

// 4. Big-Endian Weight Decoding Feature Tests (Diverse Weights)
{
  const testCases = [
    { msb: 0x01, lsb: 0xF4, expKg: 5.00, desc: '5.00 kg' },
    { msb: 0x0B, lsb: 0xB8, expKg: 30.00, desc: '30.00 kg' },
    { msb: 0x13, lsb: 0x88, expKg: 50.00, desc: '50.00 kg' },
    { msb: 0x20, lsb: 0x3A, expKg: 82.50, desc: '82.50 kg' },
    { msb: 0x27, lsb: 0x10, expKg: 100.00, desc: '100.00 kg' },
    { msb: 0x2E, lsb: 0xE0, expKg: 120.00, desc: '120.00 kg' },
    { msb: 0x3E, lsb: 0x80, expKg: 160.00, desc: '160.00 kg' },
    { msb: 0x4E, lsb: 0x20, expKg: 200.00, desc: '200.00 kg' }
  ];

  for (const tc of testCases) {
    const hex = `10FFC001${tc.msb.toString(16).padStart(2, '0')}${tc.lsb.toString(16).padStart(2, '0')}00000A01247866A55EC459`;
    const res = DavelyScaleParser.parse(hex);
    assert.strictEqual(res.valid, true, `Decodificação válida para ${tc.desc}`);
    assert.strictEqual(res.weightKg, tc.expKg, `Peso esperado ${tc.expKg} para ${tc.desc}`);
    tier1Count += 2;
  }
}

// 5. Stability Flag Extraction Tests (Bit 0 of Byte 10)
{
  const stabilityCases = [
    { attr: 0x24, stable: false, desc: '0x24 -> Unstable/Measuring' },
    { attr: 0x25, stable: true, desc: '0x25 -> Stable/Locked' },
    { attr: 0x20, stable: false, desc: '0x20 -> Unstable' },
    { attr: 0x21, stable: true, desc: '0x21 -> Stable' },
    { attr: 0x00, stable: false, desc: '0x00 -> Unstable' },
    { attr: 0x01, stable: true, desc: '0x01 -> Stable' },
    { attr: 0xFE, stable: false, desc: '0xFE -> Unstable' },
    { attr: 0xFF, stable: true, desc: '0xFF -> Stable' }
  ];

  for (const sc of stabilityCases) {
    const hex = `10FFC001191917700A01${sc.attr.toString(16).padStart(2, '0')}7866A55EC459`;
    const res = DavelyScaleParser.parse(hex);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.stable, sc.stable, `Status de estabilidade incorreto para ${sc.desc}`);
    assert.strictEqual(res.attributeByte, sc.attr);
    tier1Count += 3;
  }
}

// 6. Raw Bioimpedance Extraction Tests
{
  const impCases = [
    { msb: 0x00, lsb: 0x00, exp: 0, desc: '0 raw impedance (socks/shoes/measuring)' },
    { msb: 0x13, lsb: 0x88, exp: 5000, desc: '5000 raw counts (500.0 ohm)' },
    { msb: 0x17, lsb: 0x70, exp: 6000, desc: '6000 raw counts (600.0 ohm)' },
    { msb: 0x1D, lsb: 0x4C, exp: 7500, desc: '7500 raw counts (750.0 ohm)' },
    { msb: 0x27, lsb: 0x10, exp: 10000, desc: '10000 raw counts (1000.0 ohm)' }
  ];

  for (const ic of impCases) {
    const hex = `10FFC0011919${ic.msb.toString(16).padStart(2, '0')}${ic.lsb.toString(16).padStart(2, '0')}0A01257866A55EC459`;
    const res = DavelyScaleParser.parse(hex);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.impedanceRaw, ic.exp, `Impedância raw incorreta para ${ic.desc}`);
    tier1Count += 2;
  }
}

// 7. Embedded Hardware MAC Extraction Tests
{
  const macCases = [
    { hexMac: '7866A55EC459', expMac: '78:66:A5:5E:C4:59' },
    { hexMac: 'AABBCCDDEEFF', expMac: 'AA:BB:CC:DD:EE:FF' },
    { hexMac: '001122334455', expMac: '00:11:22:33:44:55' },
    { hexMac: '1234567890AB', expMac: '12:34:56:78:90:AB' }
  ];

  for (const mc of macCases) {
    const hex = `10FFC001191917700A0125${mc.hexMac}`;
    const res = DavelyScaleParser.parse(hex);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.embeddedMac, mc.expMac, `MAC extraído incorreto: esperado ${mc.expMac}`);
    tier1Count += 2;
  }
}

// 8. Heuristic Recognition: looksLikeDavelyPacket
{
  const validPacketBytes = DavelyScaleParser.hexToBytes('10FFC007191917700A01257866A55EC459');
  assert.strictEqual(DavelyScaleParser.looksLikeDavelyPacket(validPacketBytes), true, 'Pacote válido deve ser reconhecido');

  const paddedBytes = new Uint8Array([0x02, 0x01, 0x06, ...validPacketBytes, 0x00, 0x00]);
  assert.strictEqual(DavelyScaleParser.looksLikeDavelyPacket(paddedBytes), true, 'Pacote dentro de ScanRecord com padding deve ser reconhecido');

  const alienBeacon = DavelyScaleParser.hexToBytes('0201061AFF4C000215FDA50693A4E24FB1AFCFC6EB07647825279A1234C5');
  assert.strictEqual(DavelyScaleParser.looksLikeDavelyPacket(alienBeacon), false, 'iBeacon alienígena não deve ser reconhecido');

  const invalidFamily = DavelyScaleParser.hexToBytes('10FFB007191917700A01257866A55EC459');
  assert.strictEqual(DavelyScaleParser.looksLikeDavelyPacket(invalidFamily), false, 'Família não-C0 não deve ser reconhecida');
  tier1Count += 4;
}

// 9. Array, Uint8Array, and Buffer Input Support
{
  const hexStr = '10FFC007191917700A01257866A55EC459';
  const u8 = DavelyScaleParser.hexToBytes(hexStr);
  const arr = Array.from(u8);
  const buf = Buffer.from(u8);

  const resU8 = DavelyScaleParser.parse(u8);
  const resArr = DavelyScaleParser.parse(arr);
  const resBuf = DavelyScaleParser.parse(buf);

  assert.strictEqual(resU8.valid, true, 'Uint8Array deve ser suportado');
  assert.strictEqual(resU8.weightKg, 64.25);
  assert.strictEqual(resArr.valid, true, 'Array regular deve ser suportado');
  assert.strictEqual(resArr.weightKg, 64.25);
  assert.strictEqual(resBuf.valid, true, 'Buffer deve ser suportado');
  assert.strictEqual(resBuf.weightKg, 64.25);
  tier1Count += 6;
}

console.log(`✅ TIER 1 Concluído com sucesso! (${tier1Count} asserções verificadas)`);

// =============================================================================
// TIER 2: BOUNDARY & CORNER CASES (Robustness & Error Handling)
// =============================================================================
let tier2Count = 0;
console.log('\n--- TIER 2: Boundary & Corner Cases (Protocol & Parser) ---');

// 1. Truncated Hex and Length Boundaries
{
  const truncatedCases = [
    '',
    '1',
    '10',
    '10FF',
    '10FFC0',
    '10FFC00D',
    '10FFC00D19B9',
    '10FFC00D19B90000',
    '10FFC00D19B900000A',
    '10FFC00D19B900000A01',
    '10FFC00D19B900000A0124',
    '10FFC00D19B900000A01247866',
    '10FFC00D19B900000A01247866A55E',
    '10FFC00D19B900000A01247866A55EC4' // 32 chars = 16 bytes (1 short)
  ];

  for (const tc of truncatedCases) {
    const res = DavelyScaleParser.parse(tc);
    assert.strictEqual(res.valid, false, `Hex truncado "${tc}" deve ser rejeitado`);
    tier2Count += 1;
  }
}

// 2. Null, Undefined, Non-String & Primitive Corrupted Types
{
  const invalidInputs = [
    null,
    undefined,
    0,
    12345,
    true,
    false,
    {},
    { length: 17 },
    () => {},
    NaN,
    Infinity
  ];

  for (const inp of invalidInputs) {
    const res = DavelyScaleParser.parse(inp);
    assert.strictEqual(res.valid, false, `Input primitivo inválido deve ser rejeitado com segurança`);
    assert.strictEqual(typeof res.reason, 'string');
    tier2Count += 2;
  }
}

// 3. Odd-Length Hex & Malformed Non-Hex Characters
{
  const malformedCases = [
    '10FFC00D19B900000A01247866A55EC45', // 33 chars (odd)
    '10FFC00D19B900000A01247866A55EC459F', // 35 chars (odd)
    '10FFC00D19B900000A01247866A55EZZZZ', // Non-hex chars 'Z'
    '10FFC00D19B900000A01247866A55E!@#$', // Non-hex symbols
    '10FFC00D19B900000A01247866A55E_459', // Underscore in hex
    'GGFFC00D19B900000A01247866A55EC459'  // Invalid char 'G'
  ];

  for (const mc of malformedCases) {
    const res = DavelyScaleParser.parse(mc);
    assert.strictEqual(res.valid, false, `Hex malformado "${mc}" deve ser rejeitado`);
    tier2Count += 1;
  }
}

// 4. Header & Protocol Family Mismatches
{
  const badHeaderCases = [
    { hex: '0EFFC007191917700A01257866A55EC459', reason: 'Length byte != 0x10' },
    { hex: '12FFC007191917700A01257866A55EC459', reason: 'Length byte != 0x10' },
    { hex: '1000C007191917700A01257866A55EC459', reason: 'AD type != 0xFF' },
    { hex: '1009C007191917700A01257866A55EC459', reason: 'AD type != 0xFF (0x09 Name)' },
    { hex: '10FFB007191917700A01257866A55EC459', reason: 'Family != 0xC0' },
    { hex: '10FF0007191917700A01257866A55EC459', reason: 'Family != 0xC0' },
    { hex: '10FFFF07191917700A01257866A55EC459', reason: 'Family != 0xC0' }
  ];

  for (const bh of badHeaderCases) {
    const res = DavelyScaleParser.parse(bh.hex);
    assert.strictEqual(res.valid, false, `Pacote com cabeçalho inválido deve ser rejeitado: ${bh.reason}`);
    assert.strictEqual(res.reason, 'invalid_header_or_family');
    tier2Count += 2;
  }
}

// 5. Non-Davely Foreign Peripherals
{
  const alienPackets = [
    // Apple iBeacon
    '0201061AFF4C000215FDA50693A4E24FB1AFCFC6EB07647825279A1234C5',
    // Xiaomi Scale (Service Data 0x181D)
    '02010603031D1807161D1802B01925',
    // Exposure Notification Service (0xFD6F)
    '02011A03036FFD17166FFD00112233445566778899AABBCCDDEEFF00',
    // Random Heart Rate Monitor (0x180D)
    '02010605030D180F1804160D180055'
  ];

  for (const ap of alienPackets) {
    const res = DavelyScaleParser.parse(ap);
    assert.strictEqual(res.valid, false, `Pacote BLE de outro dispositivo deve ser rejeitado`);
    tier2Count += 1;
  }
}

// 6. Extreme Physiological & Boundary Weight Values
{
  const boundaryWeights = [
    { msb: 0x00, lsb: 0x00, expKg: 0.00, desc: '0.00 kg (Zero load)' },
    { msb: 0x00, lsb: 0x01, expKg: 0.01, desc: '0.01 kg (Minimum resolution step)' },
    { msb: 0x00, lsb: 0x64, expKg: 1.00, desc: '1.00 kg' },
    { msb: 0x01, lsb: 0xF3, expKg: 4.99, desc: '4.99 kg (Just below 5.0kg threshold)' },
    { msb: 0x01, lsb: 0xF4, expKg: 5.00, desc: '5.00 kg (Exact threshold)' },
    { msb: 0x3E, lsb: 0x80, expKg: 160.00, desc: '160.00 kg (Adult upper range)' },
    { msb: 0x55, lsb: 0xF0, expKg: 220.00, desc: '220.00 kg (Heavy adult)' },
    { msb: 0x61, lsb: 0xA8, expKg: 250.00, desc: '250.00 kg (Scale max design)' },
    { msb: 0xFF, lsb: 0xFF, expKg: 655.35, desc: '655.35 kg (16-bit unsigned max)' }
  ];

  for (const bw of boundaryWeights) {
    const hex = `10FFC001${bw.msb.toString(16).padStart(2, '0')}${bw.lsb.toString(16).padStart(2, '0')}00000A01247866A55EC459`;
    const res = DavelyScaleParser.parse(hex);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.weightKg, bw.expKg, `Erro no peso de limite para ${bw.desc}`);
    tier2Count += 2;
  }
}

// 7. Embedded Offset Parsing in Larger ScanRecords (Multi-AD Structure)
{
  const validDavelyHex = '10FFC007191917700A01257866A55EC459';
  const prefixAdvFlags = '020106'; // Flags: LE General Discoverable
  const prefixTxPower = '020A04';  // Tx Power: 4 dBm
  const suffixPadding = '00000000';

  // Packet at offset 3
  const packetAtOffset3 = prefixAdvFlags + validDavelyHex + suffixPadding;
  const res3 = DavelyScaleParser.parse(packetAtOffset3);
  assert.strictEqual(res3.valid, true, 'Davely packet at offset 3 bytes deve ser parsed');
  assert.strictEqual(res3.offset, 3);
  assert.strictEqual(res3.weightKg, 64.25);
  assert.strictEqual(res3.stable, true);

  // Packet at offset 6
  const packetAtOffset6 = prefixAdvFlags + prefixTxPower + validDavelyHex;
  const res6 = DavelyScaleParser.parse(packetAtOffset6);
  assert.strictEqual(res6.valid, true, 'Davely packet at offset 6 bytes deve ser parsed');
  assert.strictEqual(res6.offset, 6);
  assert.strictEqual(res6.weightKg, 64.25);
  tier2Count += 7;
}

// 8. Hex Formatting Variations (Spacing, Colons, Dashes, Casing)
{
  const variations = [
    '10FFC007191917700A01257866A55EC459',
    '10ffc007191917700a01257866a55ec459',
    '10 Ff C0 07 19 19 17 70 0A 01 25 78 66 A5 5E C4 59',
    '10-ff-c0-07-19-19-17-70-0a-01-25-78-66-a5-5e-c4-59',
    '10:FF:C0:07:19:19:17:70:0A:01:25:78:66:A5:5E:C4:59'
  ];

  for (const v of variations) {
    const res = DavelyScaleParser.parse(v);
    assert.strictEqual(res.valid, true, `Variação de formatação "${v}" deve ser parsed com sucesso`);
    assert.strictEqual(res.weightKg, 64.25);
    assert.strictEqual(res.stable, true);
    assert.strictEqual(res.impedanceRaw, 6000);
    assert.strictEqual(res.embeddedMac, '78:66:A5:5E:C4:59');
    tier2Count += 5;
  }
}

// 9. Telemetry Accumulator & Rate Counter Simulation
{
  const telemetry = {
    startScanAttempts: 0,
    nativeScanResultCount: 0,
    recognizedScalePacketCount: 0,
    parsedWeightPacketCount: 0,
    stableWeightPacketCount: 0,
    lastNativePacketAt: null,

    onNativeScanResult(scanRecordHex) {
      this.nativeScanResultCount++;
      this.lastNativePacketAt = new Date().toISOString();
      const res = DavelyScaleParser.parse(scanRecordHex);
      if (res.valid) {
        this.recognizedScalePacketCount++;
        this.parsedWeightPacketCount++;
        if (res.stable) {
          this.stableWeightPacketCount++;
        }
      }
      return res;
    },

    reset() {
      this.startScanAttempts++;
      this.nativeScanResultCount = 0;
      this.recognizedScalePacketCount = 0;
      this.parsedWeightPacketCount = 0;
      this.stableWeightPacketCount = 0;
      this.lastNativePacketAt = null;
    }
  };

  telemetry.reset();
  assert.strictEqual(telemetry.startScanAttempts, 1);

  // Feed 10 unstable Davely packets
  for (let i = 0; i < 10; i++) {
    telemetry.onNativeScanResult('10FFC00D19B900000A01247866A55EC459');
  }
  // Feed 5 stable Davely packets
  for (let i = 0; i < 5; i++) {
    telemetry.onNativeScanResult('10FFC007191917700A01257866A55EC459');
  }
  // Feed 8 non-Davely packets
  for (let i = 0; i < 8; i++) {
    telemetry.onNativeScanResult('0201061AFF4C000215FDA50693A4E24FB1AFCFC6EB07647825279A1234C5');
  }

  assert.strictEqual(telemetry.nativeScanResultCount, 23, 'Total de scan results deve ser 23');
  assert.strictEqual(telemetry.recognizedScalePacketCount, 15, 'Pacotes reconhecidos deve ser 15');
  assert.strictEqual(telemetry.parsedWeightPacketCount, 15, 'Pesos decodificados deve ser 15');
  assert.strictEqual(telemetry.stableWeightPacketCount, 5, 'Pacotes estáveis deve ser 5');
  assert.ok(telemetry.lastNativePacketAt !== null, 'lastNativePacketAt deve ser preenchido');
  tier2Count += 6;
}

console.log(`✅ TIER 2 Concluído com sucesso! (${tier2Count} asserções verificadas)`);

console.log('\n================================================================');
console.log(`🎉 SUÍTE PROTOCOLO & PARSER CONCLUÍDA: ${tier1Count + tier2Count} ASSERÇÕES PASSARAM!`);
console.log('================================================================\n');
