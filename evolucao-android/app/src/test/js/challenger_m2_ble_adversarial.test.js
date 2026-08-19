'use strict';

/**
 * ==============================================================================
 * EMPIRICAL CHALLENGER 1 — MILESTONE 2: NATIVE BLE ARCHITECTURE & PARSER
 * Adversarial Stress Test Suite, Fuzzing Engine, Boundary & Oracle Validation
 * ==============================================================================
 */

const assert = require('assert');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 1: BLE PROTOCOL & PARSER ADVERSARIAL ===');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Reference DavelyScaleParser Implementation (Oracle Specification)
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
      return { valid: false, reason: 'truncated_payload', rawHex: rawHex, length: bytes ? bytes.length : 0 };
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

    if (offset === -1) {
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
      timestamp: Date.now()
    };
  }
};

let totalAssertions = 0;

// =============================================================================
// SUITE 1: GOLDEN PACKET VECTORS & PROTOCOL COMPLIANCE
// =============================================================================
console.log('--- SUITE 1: Golden Packet Vectors & Protocol Compliance ---');
{
  // Test Vector 1: Unstable Measuring Packet
  const v1 = '10FFC00D19B900000A01247866A55EC459';
  const r1 = DavelyScaleParser.parse(v1, '78:66:A5:5E:C4:59');
  assert.strictEqual(r1.valid, true);
  assert.strictEqual(r1.weightKg, 65.85);
  assert.strictEqual(r1.weightRaw, 6585);
  assert.strictEqual(r1.stable, false);
  assert.strictEqual(r1.impedanceRaw, 0);
  assert.strictEqual(r1.unitCode, 0x0A);
  assert.strictEqual(r1.seq, 0x0D);
  assert.strictEqual(r1.stepSeq, 0x01);
  assert.strictEqual(r1.attributeByte, 0x24);
  assert.strictEqual(r1.embeddedMac, '78:66:A5:5E:C4:59');
  totalAssertions += 10;

  // Test Vector 2: Unstable Fluctuating Packet
  const v2 = '10FFC010195F00000A01247866A55EC459';
  const r2 = DavelyScaleParser.parse(v2, '78:66:A5:5E:C4:59');
  assert.strictEqual(r2.valid, true);
  assert.strictEqual(r2.weightKg, 64.95);
  assert.strictEqual(r2.weightRaw, 6495);
  assert.strictEqual(r2.stable, false);
  assert.strictEqual(r2.impedanceRaw, 0);
  assert.strictEqual(r2.seq, 0x10);
  totalAssertions += 6;

  // Test Vector 3: Stable Locked Packet with Bioimpedance
  const v3 = '10FFC007191917700A01257866A55EC459';
  const r3 = DavelyScaleParser.parse(v3, '78:66:A5:5E:C4:59');
  assert.strictEqual(r3.valid, true);
  assert.strictEqual(r3.weightKg, 64.25);
  assert.strictEqual(r3.weightRaw, 6425);
  assert.strictEqual(r3.stable, true);
  assert.strictEqual(r3.impedanceRaw, 6000);
  assert.strictEqual(r3.attributeByte, 0x25);
  assert.strictEqual(r3.embeddedMac, '78:66:A5:5E:C4:59');
  totalAssertions += 7;

  console.log(`  -> Passed ${totalAssertions} assertions for golden vectors.`);
}

// =============================================================================
// SUITE 2: WEIGHT RANGE BOUNDARIES & STRESS VALUES (5.00 kg - 220.00 kg)
// =============================================================================
console.log('\n--- SUITE 2: Weight Range Boundaries & Extreme Load Stress ---');
{
  let suite2Count = 0;
  const weightTestVectors = [
    // Sub-minimum / zero loads
    { raw: 0x0000, expKg: 0.00, desc: 'Zero weight load (0.00 kg)' },
    { raw: 0x0001, expKg: 0.01, desc: '1 count resolution step (0.01 kg)' },
    { raw: 0x0064, expKg: 1.00, desc: '1.00 kg load' },
    { raw: 0x01F3, expKg: 4.99, desc: '4.99 kg (just below 5.00 kg minimum)' },
    // Minimum valid adult weigh-in boundary
    { raw: 0x01F4, expKg: 5.00, desc: '5.00 kg (exact minimum boundary)' },
    { raw: 0x01F5, expKg: 5.01, desc: '5.01 kg (just above minimum boundary)' },
    // Normal human weight range
    { raw: 0x0BB8, expKg: 30.00, desc: '30.00 kg' },
    { raw: 0x1388, expKg: 50.00, desc: '50.00 kg' },
    { raw: 0x1919, expKg: 64.25, desc: '64.25 kg' },
    { raw: 0x1F40, expKg: 80.00, desc: '80.00 kg' },
    { raw: 0x2710, expKg: 100.00, desc: '100.00 kg' },
    { raw: 0x2EE0, expKg: 120.00, desc: '120.00 kg' },
    { raw: 0x3E80, expKg: 160.00, desc: '160.00 kg' },
    { raw: 0x4E20, expKg: 200.00, desc: '200.00 kg' },
    // Maximum valid scale specification boundary
    { raw: 0x55EE, expKg: 219.98, desc: '219.98 kg (just below maximum)' },
    { raw: 0x55F0, expKg: 220.00, desc: '220.00 kg (exact maximum boundary)' },
    { raw: 0x55F2, expKg: 220.02, desc: '220.02 kg (just above maximum)' },
    // Extreme / Overload capacity
    { raw: 0x61A8, expKg: 250.00, desc: '250.00 kg overload' },
    { raw: 0x7530, expKg: 300.00, desc: '300.00 kg overload' },
    { raw: 0xFFFF, expKg: 655.35, desc: '655.35 kg (16-bit maximum load)' }
  ];

  for (const tc of weightTestVectors) {
    const msb = (tc.raw >> 8) & 0xFF;
    const lsb = tc.raw & 0xFF;
    const hex = `10FFC001${msb.toString(16).padStart(2, '0')}${lsb.toString(16).padStart(2, '0')}00000A01257866A55EC459`;
    const res = DavelyScaleParser.parse(hex);
    assert.strictEqual(res.valid, true, `Decodificação falhou para ${tc.desc}`);
    assert.strictEqual(res.weightRaw, tc.raw, `weightRaw inconsistente para ${tc.desc}`);
    assert.strictEqual(res.weightKg, tc.expKg, `weightKg esperado ${tc.expKg}, obtido ${res.weightKg} para ${tc.desc}`);
    suite2Count += 3;
  }
  totalAssertions += suite2Count;
  console.log(`  -> Passed ${suite2Count} weight boundary & stress assertions.`);
}

// =============================================================================
// SUITE 3: STABILITY BIT MASK EXHAUSTIVE VERIFICATION (All 256 byte values)
// =============================================================================
console.log('\n--- SUITE 3: Exhaustive Stability Bit Mask Verification (0x00 - 0xFF) ---');
{
  let suite3Count = 0;
  // Test all 256 possible attribute byte values
  for (let attr = 0; attr <= 255; attr++) {
    const expectedStable = (attr & 0x01) !== 0;
    const attrHex = attr.toString(16).padStart(2, '0');
    const packetHex = `10FFC001191917700A01${attrHex}7866A55EC459`;
    const res = DavelyScaleParser.parse(packetHex);

    assert.strictEqual(res.valid, true, `Pacote com attr 0x${attrHex} deve ser válido`);
    assert.strictEqual(res.attributeByte, attr, `attributeByte deve ser 0x${attrHex}`);
    assert.strictEqual(res.stable, expectedStable, `Estabilidade incorreta para 0x${attrHex}: esperado ${expectedStable}, obtido ${res.stable}`);
    assert.strictEqual(res.isStable, expectedStable, `isStable alias deve coincidir com stable para 0x${attrHex}`);
    suite3Count += 4;
  }

  // Explicit targeted checks on specified protocol variations
  const targetedChecks = [
    { attr: 0x25, stable: true, desc: '0x25 (Davely Stable / Locked)' },
    { attr: 0x24, stable: false, desc: '0x24 (Davely Unstable / Measuring)' },
    { attr: 0x21, stable: true, desc: '0x21 (Chipsea Stable Variation)' },
    { attr: 0x20, stable: false, desc: '0x20 (Chipsea Unstable Variation)' },
    { attr: 0x01, stable: true, desc: '0x01 (Minimal Bit 0 Set)' },
    { attr: 0x00, stable: false, desc: '0x00 (Minimal Bit 0 Clear)' },
    { attr: 0xFE, stable: false, desc: '0xFE (High Bits Set, Bit 0 Clear)' },
    { attr: 0xFF, stable: true, desc: '0xFF (All Bits Set, Bit 0 Set)' }
  ];

  for (const tc of targetedChecks) {
    const hex = `10FFC001191917700A01${tc.attr.toString(16).padStart(2, '0')}7866A55EC459`;
    const res = DavelyScaleParser.parse(hex);
    assert.strictEqual(res.stable, tc.stable, `Falha no check específico para ${tc.desc}`);
    suite3Count++;
  }

  totalAssertions += suite3Count;
  console.log(`  -> Passed ${suite3Count} exhaustive stability mask assertions across all 256 byte values.`);
}

// =============================================================================
// SUITE 4: RAW BIOIMPEDANCE PRESERVATION & HARDWARE COUNTS
// =============================================================================
console.log('\n--- SUITE 4: Bioimpedance Raw Hardware Count Preservation ---');
{
  let suite4Count = 0;
  const impedanceVectors = [
    { raw: 0x0000, expCounts: 0, desc: '0 raw counts (Socks/Shoes/Measuring)' },
    { raw: 0x0001, expCounts: 1, desc: '1 raw count (Minimum non-zero count)' },
    { raw: 0x01F4, expCounts: 500, desc: '500 raw counts (50.0 ohm)' },
    { raw: 0x0BB8, expCounts: 3000, desc: '3000 raw counts (300.0 ohm)' },
    { raw: 0x1388, expCounts: 5000, desc: '5000 raw counts (500.0 ohm)' },
    { raw: 0x1770, expCounts: 6000, desc: '6000 raw counts (600.0 ohm standard test vector)' },
    { raw: 0x1D4C, expCounts: 7500, desc: '7500 raw counts (750.0 ohm)' },
    { raw: 0x2710, expCounts: 10000, desc: '10000 raw counts (1000.0 ohm)' },
    { raw: 0x3A98, expCounts: 15000, desc: '15000 raw counts (1500.0 ohm)' },
    { raw: 0xFFFF, expCounts: 65535, desc: '65535 raw counts (16-bit max unsigned counts)' }
  ];

  for (const iv of impedanceVectors) {
    const msb = (iv.raw >> 8) & 0xFF;
    const lsb = iv.raw & 0xFF;
    const hex = `10FFC0011919${msb.toString(16).padStart(2, '0')}${lsb.toString(16).padStart(2, '0')}0A01257866A55EC459`;
    const res = DavelyScaleParser.parse(hex);

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.impedanceRaw, iv.expCounts, `Impedância raw incorreta para ${iv.desc}: esperado ${iv.expCounts}, obtido ${res.impedanceRaw}`);
    assert.strictEqual(typeof res.impedanceRaw, 'number');
    assert(Number.isInteger(res.impedanceRaw), 'Impedância deve ser inteiro exato sem arredondamentos artificiais');
    suite4Count += 4;
  }

  totalAssertions += suite4Count;
  console.log(`  -> Passed ${suite4Count} raw bioimpedance preservation assertions.`);
}

// =============================================================================
// SUITE 5: TRUNCATED, CORRUPTED, MALFORMED & HOSTILE INPUTS
// =============================================================================
console.log('\n--- SUITE 5: Truncated, Corrupted, Malformed & Adversarial Inputs ---');
{
  let suite5Count = 0;

  // 1. Truncated Hex strings (0 to 33 characters)
  const fullHex = '10FFC007191917700A01257866A55EC459';
  for (let len = 0; len < fullHex.length; len++) {
    const truncated = fullHex.substring(0, len);
    const res = DavelyScaleParser.parse(truncated);
    assert.strictEqual(res.valid, false, `Truncated string len ${len} ("${truncated}") deve ser rejeitado`);
    assert(typeof res.reason === 'string' && res.reason.length > 0);
    suite5Count += 2;
  }

  // 2. Truncated Byte arrays (0 to 16 bytes)
  const fullBytes = DavelyScaleParser.hexToBytes(fullHex);
  for (let len = 0; len < 17; len++) {
    const truncatedBytes = fullBytes.slice(0, len);
    const res = DavelyScaleParser.parse(truncatedBytes);
    assert.strictEqual(res.valid, false, `Truncated byte array len ${len} deve ser rejeitado`);
    assert.strictEqual(res.reason, 'truncated_payload');
    suite5Count += 2;
  }

  // 3. Corrupted non-hex and malformed characters
  const malformedInputs = [
    '10FFC007191917700A01257866A55EC45G', // Non-hex char G
    '10FFC007191917700A01257866A55EC45Z', // Non-hex char Z
    '10FFC007191917700A01257866A55EC45!', // Punctuation !
    '10FFC007191917700A01257866A55EC45?', // Punctuation ?
    '10FFC007191917700A01257866A55EC45\0', // Null byte
    '<script>alert(1)</script>',          // XSS payload
    "10FFC007191917700A0125' OR '1'='1", // SQL injection
    '10FFC007191917700A01257866A55EC45 ', // Trailing space causing odd length
    '10FFC007191917700A01257866A55EC45'   // 33 chars (odd length)
  ];

  for (const inp of malformedInputs) {
    const res = DavelyScaleParser.parse(inp);
    assert.strictEqual(res.valid, false, `Malformed input "${inp}" deve ser rejeitado`);
    suite5Count++;
  }

  // 4. Primitive and hostile object types
  const hostileTypes = [
    null,
    undefined,
    0,
    12345,
    -1,
    NaN,
    Infinity,
    -Infinity,
    true,
    false,
    Symbol('hostile'),
    {},
    { length: 17 },
    { 0: 0x10, 1: 0xFF, 2: 0xC0, length: 17 },
    () => {},
    new Date(),
    /regex/
  ];

  for (const ht of hostileTypes) {
    const res = DavelyScaleParser.parse(ht);
    assert.strictEqual(res.valid, false, `Hostile type ${typeof ht} deve ser rejeitado com segurança`);
    assert(typeof res.reason === 'string');
    suite5Count += 2;
  }

  // 5. Header Mismatches and False Family Bytes
  const badHeaders = [
    { hex: '0EFFC007191917700A01257866A55EC459', desc: 'Length 0x0E != 0x10' },
    { hex: '11FFC007191917700A01257866A55EC459', desc: 'Length 0x11 != 0x10' },
    { hex: '1000C007191917700A01257866A55EC459', desc: 'AD type 0x00 != 0xFF' },
    { hex: '1009C007191917700A01257866A55EC459', desc: 'AD type 0x09 (Name) != 0xFF' },
    { hex: '10FFB007191917700A01257866A55EC459', desc: 'Protocol family 0xB0 != 0xC0' },
    { hex: '10FFC107191917700A01257866A55EC459', desc: 'Protocol family 0xC1 != 0xC0' },
    { hex: '10FFFF07191917700A01257866A55EC459', desc: 'Protocol family 0xFF != 0xC0' }
  ];

  for (const bh of badHeaders) {
    const res = DavelyScaleParser.parse(bh.hex);
    assert.strictEqual(res.valid, false, `Bad header (${bh.desc}) deve ser rejeitado`);
    assert.strictEqual(res.reason, 'invalid_header_or_family');
    suite5Count += 2;
  }

  totalAssertions += suite5Count;
  console.log(`  -> Passed ${suite5Count} adversarial & malformed input assertions.`);
}

// =============================================================================
// SUITE 6: SLIDING WINDOW OFFSET SHIFTING & MULTI-AD SEARCH RESILIENCE
// =============================================================================
console.log('\n--- SUITE 6: Sliding Window Offset Shifting & Multi-AD Search ---');
{
  let suite6Count = 0;
  const targetDavelyHex = '10FFC007191917700A01257866A55EC459';
  const targetDavelyBytes = DavelyScaleParser.hexToBytes(targetDavelyHex);

  const testOffsets = [0, 1, 2, 3, 5, 8, 12, 19, 27, 35, 50, 64];

  for (const off of testOffsets) {
    // Construct buffer with prefix noise, false headers, and suffix noise
    const prefix = new Uint8Array(off);
    for (let p = 0; p < off; p++) {
      // Put deceptive patterns in prefix noise (e.g. 0x10, 0xFF, but not followed by 0xC0)
      if (p % 4 === 0) prefix[p] = 0x10;
      else if (p % 4 === 1) prefix[p] = 0xFF;
      else if (p % 4 === 2) prefix[p] = 0xC1; // False family
      else prefix[p] = 0x00;
    }

    const suffix = new Uint8Array([0x02, 0x01, 0x06, 0x00, 0x00, 0x00]);

    const combined = new Uint8Array(prefix.length + targetDavelyBytes.length + suffix.length);
    combined.set(prefix, 0);
    combined.set(targetDavelyBytes, prefix.length);
    combined.set(suffix, prefix.length + targetDavelyBytes.length);

    // Verify looksLikeDavelyPacket
    assert.strictEqual(DavelyScaleParser.looksLikeDavelyPacket(combined), true, `looksLikeDavelyPacket deve retornar true para offset ${off}`);

    // Verify parse
    const res = DavelyScaleParser.parse(combined, 'FALLBACK:MAC:11');
    assert.strictEqual(res.valid, true, `Parse deve ser bem-sucedido para pacote no offset ${off}`);
    assert.strictEqual(res.offset, off, `Offset detectado incorreto: esperado ${off}, obtido ${res.offset}`);
    assert.strictEqual(res.weightKg, 64.25);
    assert.strictEqual(res.stable, true);
    assert.strictEqual(res.impedanceRaw, 6000);
    assert.strictEqual(res.embeddedMac, '78:66:A5:5E:C4:59');
    suite6Count += 7;
  }

  // Realistic Multi-AD ScanRecord with Flags, Tx Power, Service UUIDs and Davely AD
  const multiAdScanRecord = new Uint8Array([
    // AD 1: Flags (3 bytes: len=0x02, type=0x01, flags=0x06)
    0x02, 0x01, 0x06,
    // AD 2: Tx Power (3 bytes: len=0x02, type=0x0A, tx=0x04)
    0x02, 0x0A, 0x04,
    // AD 3: 16-bit Service UUIDs (3 bytes: len=0x02, type=0x03, uuid=0x181D)
    0x02, 0x03, 0x1D, 0x18,
    // AD 4: Davely Scale Broadcast (17 bytes: 10 FF C0 ...)
    ...targetDavelyBytes,
    // Trailing padding zeros
    0x00, 0x00, 0x00, 0x00
  ]);

  const multiRes = DavelyScaleParser.parse(multiAdScanRecord);
  assert.strictEqual(multiRes.valid, true);
  assert.strictEqual(multiRes.offset, 10, 'Offset em ScanRecord com 10 bytes de prefixo deve ser 10');
  assert.strictEqual(multiRes.weightKg, 64.25);
  assert.strictEqual(multiRes.stable, true);
  suite6Count += 4;

  totalAssertions += suite6Count;
  console.log(`  -> Passed ${suite6Count} sliding window offset shifting assertions.`);
}

// =============================================================================
// SUITE 7: PSEUDO-RANDOM MUTATION & ADVERSARIAL FUZZING (2,000 Iterations)
// =============================================================================
console.log('\n--- SUITE 7: Pseudo-Random Mutation & Adversarial Fuzzing (2,000 Iterations) ---');
{
  let suite7Count = 0;
  const baseValidHex = '10FFC007191917700A01257866A55EC459';
  const baseBytes = DavelyScaleParser.hexToBytes(baseValidHex);

  // Deterministic LCG pseudo-random generator
  let seed = 0x12345678;
  function lcg() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  // 1. 1,000 mutated Davely packets (bit flips, byte corruptions, truncation)
  for (let i = 0; i < 1000; i++) {
    const mutated = new Uint8Array(baseBytes);
    const mutationType = Math.floor(lcg() * 4);

    if (mutationType === 0) {
      // Bit flip in random byte
      const byteIdx = Math.floor(lcg() * mutated.length);
      const bitIdx = Math.floor(lcg() * 8);
      mutated[byteIdx] ^= (1 << bitIdx);
    } else if (mutationType === 1) {
      // Random byte substitution
      const byteIdx = Math.floor(lcg() * mutated.length);
      mutated[byteIdx] = Math.floor(lcg() * 256);
    } else if (mutationType === 2) {
      // Random slice / truncation
      const sliceLen = Math.floor(lcg() * mutated.length);
      const sliced = mutated.slice(0, sliceLen);
      const res = DavelyScaleParser.parse(sliced);
      assert.strictEqual(typeof res.valid, 'boolean');
      suite7Count++;
      continue;
    } else {
      // Random prefix insertion
      const prefixLen = Math.floor(lcg() * 10);
      const prefixed = new Uint8Array(prefixLen + mutated.length);
      for (let p = 0; p < prefixLen; p++) prefixed[p] = Math.floor(lcg() * 256);
      prefixed.set(mutated, prefixLen);
      const res = DavelyScaleParser.parse(prefixed);
      assert.strictEqual(typeof res.valid, 'boolean');
      suite7Count++;
      continue;
    }

    assert.doesNotThrow(() => {
      const res = DavelyScaleParser.parse(mutated);
      assert.strictEqual(typeof res.valid, 'boolean');
      if (res.valid) {
        assert(typeof res.weightKg === 'number' && !isNaN(res.weightKg));
        assert(typeof res.stable === 'boolean');
        assert(typeof res.impedanceRaw === 'number' && !isNaN(res.impedanceRaw));
      }
    }, `Fuzz mutation #${i} causou exceção não tratada!`);
    suite7Count++;
  }

  // 2. 1,000 completely random byte streams
  for (let i = 0; i < 1000; i++) {
    const len = Math.floor(lcg() * 64);
    const randBytes = new Uint8Array(len);
    for (let b = 0; b < len; b++) {
      randBytes[b] = Math.floor(lcg() * 256);
    }

    assert.doesNotThrow(() => {
      const res = DavelyScaleParser.parse(randBytes);
      assert.strictEqual(typeof res.valid, 'boolean');
      if (res.valid) {
        assert(typeof res.weightKg === 'number' && !isNaN(res.weightKg));
      }
    }, `Random byte stream #${i} causou exceção não tratada!`);
    suite7Count++;
  }

  totalAssertions += suite7Count;
  console.log(`  -> Passed ${suite7Count} fuzzing iterations with zero crashes and 100% memory safety.`);
}

// =============================================================================
// SUITE 8: SCANNER STATE MACHINE & HIGH-FREQUENCY TELEMETRY SIMULATION
// =============================================================================
console.log('\n--- SUITE 8: Scanner State Machine & High-Frequency Telemetry ---');
{
  let suite8Count = 0;

  class MockScaleBleScanner {
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
      this.isScanning = false;
      this.batch = [];
    }

    startScan() {
      this.startScanAttempts++;
      this.isScanning = true;
    }

    stopScan() {
      this.isScanning = false;
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

    processScanResult(scanRecordBytes, deviceAddress) {
      if (!this.isScanning) return;
      this.nativeScanResultCount++;
      this.lastNativePacketAt = new Date().toISOString();

      if (DavelyScaleParser.looksLikeDavelyPacket(scanRecordBytes)) {
        const parsed = DavelyScaleParser.parse(scanRecordBytes, deviceAddress);
        if (parsed.valid) {
          this.recognizedScalePacketCount++;
          this.parsedWeightPacketCount++;
          this.lastParsedWeight = parsed.weightKg;
          this.lastParsedStable = parsed.stable;
          this.lastScaleMac = parsed.embeddedMac;
          if (parsed.stable) {
            this.stableWeightPacketCount++;
          }
          this.batch.push(parsed);
        }
      }
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
  }

  const scanner = new MockScaleBleScanner();
  scanner.startScan();
  assert.strictEqual(scanner.startScanAttempts, 1);
  assert.strictEqual(scanner.isScanning, true);
  suite8Count += 2;

  // Stream burst:
  // 50 unstable Davely packets
  const unstablePacket = DavelyScaleParser.hexToBytes('10FFC00D19B900000A01247866A55EC459');
  for (let i = 0; i < 50; i++) {
    scanner.processScanResult(unstablePacket, '78:66:A5:5E:C4:59');
  }

  // 20 stable Davely packets
  const stablePacket = DavelyScaleParser.hexToBytes('10FFC007191917700A01257866A55EC459');
  for (let i = 0; i < 20; i++) {
    scanner.processScanResult(stablePacket, '78:66:A5:5E:C4:59');
  }

  // 30 non-scale alien beacons (Apple iBeacon)
  const alienPacket = DavelyScaleParser.hexToBytes('0201061AFF4C000215FDA50693A4E24FB1AFCFC6EB07647825279A1234C5');
  for (let i = 0; i < 30; i++) {
    scanner.processScanResult(alienPacket, '11:22:33:44:55:66');
  }

  // 15 truncated / corrupted packets
  const corruptedPacket = new Uint8Array([0x10, 0xFF, 0xC0, 0x01, 0x02]);
  for (let i = 0; i < 15; i++) {
    scanner.processScanResult(corruptedPacket, 'AA:BB:CC:DD:EE:FF');
  }

  const telem = scanner.getTelemetryJson();
  assert.strictEqual(telem.nativeScanResultCount, 115, 'Total native scan results = 50 + 20 + 30 + 15 = 115');
  assert.strictEqual(telem.recognizedScalePacketCount, 70, 'Recognized Davely packets = 50 + 20 = 70');
  assert.strictEqual(telem.parsedWeightPacketCount, 70, 'Parsed weight packets = 70');
  assert.strictEqual(telem.stableWeightPacketCount, 20, 'Stable packets = 20');
  assert.strictEqual(telem.lastParsedWeight, 64.25, 'Last parsed weight = 64.25');
  assert.strictEqual(telem.lastParsedStable, true, 'Last parsed stable = true');
  assert.strictEqual(telem.lastScaleMac, '78:66:A5:5E:C4:59');
  assert(telem.lastNativePacketAt !== null);
  suite8Count += 8;

  // Scanner stop and reset verification
  scanner.stopScan();
  assert.strictEqual(scanner.isScanning, false);
  scanner.resetTelemetry();
  assert.strictEqual(scanner.nativeScanResultCount, 0);
  assert.strictEqual(scanner.recognizedScalePacketCount, 0);
  assert.strictEqual(scanner.stableWeightPacketCount, 0);
  suite8Count += 4;

  totalAssertions += suite8Count;
  console.log(`  -> Passed ${suite8Count} scanner & telemetry simulation assertions.`);
}

console.log('\n================================================================');
console.log(`🎉 EMPIRICAL CHALLENGER 1 COMPLETE: ALL ${totalAssertions} ASSERTIONS PASSED (100%)!`);
console.log('================================================================\n');
