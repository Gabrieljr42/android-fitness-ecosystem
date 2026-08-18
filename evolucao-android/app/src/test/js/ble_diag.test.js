'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== [EVOLUÇÃO] Executando Suíte de Testes: Diagnóstico BLE Davely ===\n');

// Mock DOM e ambiente browser
global.window = global;
global.document = {
  body: {
    insertAdjacentHTML: function(pos, html) {},
    appendChild: function(el) {},
    removeChild: function(el) {}
  },
  getElementById: function(id) {
    return null;
  },
  querySelectorAll: function(sel) {
    return [];
  },
  createElement: function(tag) {
    return {
      value: '',
      style: {},
      focus: function() {},
      select: function() {},
      click: function() {},
      remove: function() {}
    };
  }
};
global.toast = function(msg) {};

// Carrega o script ble-diag.js
const bleDiagPath = path.join(__dirname, '../../main/assets/apps/evolucao/views/ble-diag.js');
const bleDiagCode = fs.readFileSync(bleDiagPath, 'utf8');
eval(bleDiagCode);

// --- TESTE 1: Inicialização e Registro dos Callbacks Globais ---
console.log('--- 1. Callbacks Globais e Namespace BleDiag ---');
assert.strictEqual(typeof window.onBleScanStateChanged, 'function', 'window.onBleScanStateChanged deve estar definido');
assert.strictEqual(typeof window.onBleScanError, 'function', 'window.onBleScanError deve estar definido');
assert.strictEqual(typeof window.onBleAdvertisementsBatch, 'function', 'window.onBleAdvertisementsBatch deve estar definido');
assert.strictEqual(typeof window.onBleAdvertisement, 'function', 'window.onBleAdvertisement deve estar definido');
assert.strictEqual(typeof window.BleDiag, 'object', 'window.BleDiag deve existir');
assert.strictEqual(typeof window.BleDiag.open, 'function', 'BleDiag.open deve existir');
assert.strictEqual(typeof window.BleDiag.getTextReport, 'function', 'BleDiag.getTextReport deve existir');
assert.strictEqual(typeof window.BleDiag.getJsonReport, 'function', 'BleDiag.getJsonReport deve existir');
console.log('✅ Teste 1: Callbacks nativos e namespace registrados com sucesso.');

// --- TESTE 2: Recepção de Pacotes em Batch e Agrupamento por MAC ---
console.log('--- 2. Recepção em Lote e Agrupamento por MAC ---');
const sampleBatch = [
  {
    deviceName: 'Davely Scale',
    advertisedName: 'Davely Scale',
    address: 'AA:BB:CC:11:22:33',
    rssi: -52,
    receivedAt: '2026-08-18T17:00:01.100Z',
    receivedAtEpochMs: 1771234801100,
    timestampNanos: 1000000000,
    isConnectable: true,
    txPower: null,
    dataStatus: 'COMPLETE',
    serviceUuids: ['0000181b-0000-1000-8000-00805f9b34fb'],
    manufacturerData: [{ id: 4660, idHex: '0x1234', dataHex: 'CA 20 01 00', dataHexNoSpaces: 'CA200100', length: 4 }],
    serviceData: [],
    rawHex: '02 01 06 12 16 1B 18 CA 20 01 00',
    rawHexNoSpaces: '02010612161B18CA200100',
    rawBytesLength: 11
  },
  {
    deviceName: null,
    advertisedName: 'Beacon-XYZ',
    address: 'FF:EE:DD:44:55:66',
    rssi: -78,
    receivedAt: '2026-08-18T17:00:01.150Z',
    receivedAtEpochMs: 1771234801150,
    timestampNanos: 1000050000,
    isConnectable: false,
    txPower: -4,
    dataStatus: 'COMPLETE',
    serviceUuids: [],
    manufacturerData: [{ id: 76, idHex: '0x004C', dataHex: '02 15 00', dataHexNoSpaces: '021500', length: 3 }],
    serviceData: [],
    rawHex: '02 01 04 05 FF 4C 00 02 15 00',
    rawHexNoSpaces: '02010405FF4C00021500',
    rawBytesLength: 10
  }
];

window.onBleAdvertisementsBatch(sampleBatch);
let stateSnapshot = window.BleDiag.getState();

assert.strictEqual(stateSnapshot.totalPacketsCount, 2, 'Deve ter registrado 2 pacotes');
assert.strictEqual(stateSnapshot.deviceOrder.length, 2, 'Deve ter agrupado em 2 dispositivos distintos');
assert.ok(stateSnapshot.devices['AA:BB:CC:11:22:33'], 'Dispositivo Davely deve existir');
assert.strictEqual(stateSnapshot.devices['AA:BB:CC:11:22:33'].packets.length, 1);
assert.strictEqual(stateSnapshot.devices['AA:BB:CC:11:22:33'].latestRssi, -52);
assert.ok(stateSnapshot.devices['AA:BB:CC:11:22:33'].serviceUuids['0000181b-0000-1000-8000-00805f9b34fb']);
console.log('✅ Teste 2: Recepção em lote e separação por endereço MAC validados.');

// --- TESTE 3: Preservação Cronológica e Não-Deduplicação de Pacotes Repetidos ---
console.log('--- 3. Não-Deduplicação e Preservação Cronológica ---');
const repeatedPacket = {
  deviceName: 'Davely Scale',
  advertisedName: 'Davely Scale',
  address: 'AA:BB:CC:11:22:33',
  rssi: -50,
  receivedAt: '2026-08-18T17:00:01.300Z',
  receivedAtEpochMs: 1771234801300,
  timestampNanos: 1000200000,
  isConnectable: true,
  txPower: null,
  dataStatus: 'COMPLETE',
  serviceUuids: ['0000181b-0000-1000-8000-00805f9b34fb'],
  manufacturerData: [{ id: 4660, idHex: '0x1234', dataHex: 'CA 20 01 00', dataHexNoSpaces: 'CA200100', length: 4 }],
  serviceData: [],
  rawHex: '02 01 06 12 16 1B 18 CA 20 01 00',
  rawHexNoSpaces: '02010612161B18CA200100',
  rawBytesLength: 11
};

// Envia pacote idêntico nos bytes, mas posterior no tempo
window.onBleAdvertisement(repeatedPacket);
stateSnapshot = window.BleDiag.getState();

assert.strictEqual(stateSnapshot.devices['AA:BB:CC:11:22:33'].packets.length, 2, 'Pacote idêntico DEVE ser mantido (2 pacotes no total para o dispositivo)');
assert.strictEqual(stateSnapshot.totalPacketsCount, 3, 'Total geral deve ser 3');
assert.strictEqual(stateSnapshot.devices['AA:BB:CC:11:22:33'].latestRssi, -50, 'Último RSSI deve ter sido atualizado para -50');
console.log('✅ Teste 3: Não-deduplicação rigorosa e histórico temporal confirmados.');

// --- TESTE 4: Geração de Relatório Textual Formatado ---
console.log('--- 4. Geração de Relatório Textual Formatado ---');
const textReport = window.BleDiag.getTextReport();
assert.ok(textReport.indexOf('EVOLUÇÃO — RELATÓRIO DE DIAGNÓSTICO BLE') >= 0, 'Cabeçalho do relatório deve estar presente');
assert.ok(textReport.indexOf('AA:BB:CC:11:22:33') >= 0, 'Endereço MAC deve constar no relatório');
assert.ok(textReport.indexOf('0000181b-0000-1000-8000-00805f9b34fb') >= 0, 'Service UUID deve constar no relatório');
assert.ok(textReport.indexOf('0x1234') >= 0, 'Manufacturer ID deve constar no relatório');
assert.ok(textReport.indexOf('02 01 06 12 16 1B 18 CA 20 01 00') >= 0, 'RAW HEX formatado deve constar no relatório');
console.log('✅ Teste 4: Relatório textual formatado gerado com todas as seções e dados brutos.');

// --- TESTE 5: Geração de Relatório JSON Estruturado ---
console.log('--- 5. Geração de Relatório JSON Estruturado ---');
const jsonReportStr = window.BleDiag.getJsonReport();
const parsedReport = JSON.parse(jsonReportStr);

assert.strictEqual(parsedReport.metadata.totalDevices, 2, 'JSON metadata totalDevices deve ser 2');
assert.strictEqual(parsedReport.metadata.totalPackets, 3, 'JSON metadata totalPackets deve ser 3');
assert.strictEqual(parsedReport.devices.length, 2, 'JSON deve conter 2 dispositivos');
assert.strictEqual(parsedReport.devices[0].packets.length, 2, 'Primeiro dispositivo deve conter 2 pacotes');
assert.strictEqual(parsedReport.devices[0].packets[0].rawHex, '02 01 06 12 16 1B 18 CA 20 01 00');
console.log('✅ Teste 5: Exportação JSON estruturada validada com 100% de integridade.');

// --- TESTE 6: Proteção do Limite de 5.000 Pacotes ---
console.log('--- 6. Proteção de Limite de Sessão (5.000 pacotes) ---');
let stopCalled = false;
global.AndroidBridge = {
  stopBleScan: function() { stopCalled = true; }
};

const massiveBatch = [];
for (let i = 0; i < 5005; i++) {
  massiveBatch.push({
    address: 'AA:BB:CC:11:22:33',
    rssi: -60,
    receivedAt: '2026-08-18T17:00:02.000Z',
    rawHex: '02 01 06'
  });
}

window.onBleAdvertisementsBatch(massiveBatch);
stateSnapshot = window.BleDiag.getState();
assert.strictEqual(stateSnapshot.totalPacketsCount, 5000, 'Total de pacotes não deve ultrapassar 5.000');
assert.ok(stateSnapshot.maxPacketsReached, 'Flag maxPacketsReached deve ser true');
assert.ok(stopCalled, 'stopBleScan deve ter sido invocado ao atingir o limite');
console.log('✅ Teste 6: Limite de segurança de 5.000 pacotes respeitado perfeitamente.');

console.log('\n======================================================');
console.log('🎉 TODOS OS TESTES DO DIAGNÓSTICO BLE PASSARAM (100%)!');
console.log('======================================================\n');
