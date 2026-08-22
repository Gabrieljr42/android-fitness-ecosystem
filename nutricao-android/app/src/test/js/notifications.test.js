'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock DOM
function createMockElement(tagName = 'div') {
  return {
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
    setAttribute: function(name, val) { this.attributes[name] = String(val); },
    getAttribute: function(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; },
    appendChild: function(child) { this.children.push(child); return child; },
    contains: function(child) { return this.children.includes(child); },
    click: function() { if (typeof this.onclick === 'function') this.onclick(); }
  };
}

const mockStorage = {};
const mockLocalStorage = {
  getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
};

const bridgeDispatches = [];
const bridgeSyncLogs = [];
let bridgeCancelAllCalls = 0;

const mockAndroidBridge = {
  sendNotification: (title, message) => {
    bridgeDispatches.push({ title: String(title), message: String(message), timestamp: Date.now() });
  },
  syncAlarms: (json) => {
    bridgeSyncLogs.push({ payload: String(json), parsed: JSON.parse(json), timestamp: Date.now() });
  },
  cancelAllAlarms: () => {
    bridgeCancelAllCalls++;
  },
  vibrate: (ms) => {}
};

const mockBody = createMockElement('body');
const documentMock = {
  body: mockBody,
  getElementById: (id) => {
    if (id === 'cameraFileInput') {
      return mockBody.children.find(c => c.id === 'cameraFileInput') || null;
    }
    return createMockElement('div');
  },
  querySelector: () => createMockElement('div'),
  querySelectorAll: () => [],
  createElement: (tag) => createMockElement(tag),
  addEventListener: () => {}
};

const windowMock = {
  addEventListener: () => {},
  removeEventListener: () => {},
  AndroidBridge: mockAndroidBridge
};

const context = {
  console: console,
  Date: Date,
  Math: Math,
  JSON: JSON,
  parseFloat: parseFloat,
  parseInt: parseInt,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  isFinite: isFinite,
  isNaN: isNaN,
  document: documentMock,
  window: windowMock,
  self: windowMock,
  localStorage: mockLocalStorage,
  AndroidBridge: mockAndroidBridge,
  toast: () => {},
  openModal: () => {},
  closeModal: () => {},
  render: () => {},
  confirm: () => true
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('apps/nutricao/estado.js');
loadScript('apps/nutricao/views/ajustes.js');
loadScript('core/gemini.js');

console.log('=== [NUTRITRACK] Executando Suíte: notifications.test.js ===\n');

// -----------------------------------------------------------------------------
// MEAL REMINDER SCHEDULE DATA MODEL & BRIDGE CONTROLLER
// -----------------------------------------------------------------------------
const DEFAULT_REMINDERS = [
  { id: 'cafe', nome: 'Café da manhã', hora: '07:30', ativo: true },
  { id: 'almoco', nome: 'Almoço', hora: '12:30', ativo: true },
  { id: 'lanche', nome: 'Lanche', hora: '16:00', ativo: true },
  { id: 'jantar', nome: 'Jantar', hora: '19:30', ativo: true },
  { id: 'ceia', nome: 'Ceia', hora: '22:00', ativo: false }
];

class NotificationReminderManager {
  static STORAGE_KEY = 'nt_reminders';
  static TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

  static loadSchedule() {
    const raw = mockLocalStorage.getItem(this.STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_REMINDERS));
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : JSON.parse(JSON.stringify(DEFAULT_REMINDERS));
    } catch(e) {
      return JSON.parse(JSON.stringify(DEFAULT_REMINDERS));
    }
  }

  static saveSchedule(schedule, bridge = mockAndroidBridge) {
    mockLocalStorage.setItem(this.STORAGE_KEY, JSON.stringify(schedule));
    if (bridge && typeof bridge.syncAlarms === 'function') {
      bridge.syncAlarms(JSON.stringify(schedule));
    }
  }

  static isValidTime(timeStr) {
    if (typeof timeStr !== 'string') return false;
    return this.TIME_REGEX.test(timeStr.trim());
  }

  static toggleSlot(slotId, bridge = mockAndroidBridge) {
    const schedule = this.loadSchedule();
    const slot = schedule.find(s => s.id === slotId);
    if (!slot) throw new Error(`Slot ${slotId} não encontrado`);
    slot.ativo = !slot.ativo;
    this.saveSchedule(schedule, bridge);
    return slot;
  }

  static updateSlotTime(slotId, newTime, bridge = mockAndroidBridge) {
    if (!this.isValidTime(newTime)) {
      throw new Error(`Horário inválido: "${newTime}". Use o formato HH:mm (00:00 a 23:59).`);
    }
    const schedule = this.loadSchedule();
    const slot = schedule.find(s => s.id === slotId);
    if (!slot) throw new Error(`Slot ${slotId} não encontrado`);
    slot.hora = newTime.trim();
    this.saveSchedule(schedule, bridge);
    return slot;
  }

  static calculateNextTriggerTimestamp(timeStr, referenceDate = new Date()) {
    if (!this.isValidTime(timeStr)) throw new Error('Invalid time');
    const [h, m] = timeStr.split(':').map(Number);
    const target = new Date(referenceDate.getTime());
    target.setHours(h, m, 0, 0);

    if (target.getTime() <= referenceDate.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  static dispatchTestNotification(slotId, bridge = windowMock.AndroidBridge) {
    const schedule = this.loadSchedule();
    const slot = schedule.find(s => s.id === slotId);
    if (!slot) throw new Error(`Slot ${slotId} não encontrado`);

    const title = `NutriTrack ⏰ Lembrete: ${slot.nome}`;
    const message = `Hora da sua refeição (${slot.hora})! Registre seus macros no NutriTrack.`;

    if (bridge && typeof bridge.sendNotification === 'function') {
      bridge.sendNotification(title, message);
      return { sent: true, bridge: 'native', title, message };
    }
    return { sent: false, bridge: 'fallback_web', title, message };
  }
}

// -----------------------------------------------------------------------------
// TIER 1: CORE FUNCTIONAL TESTS
// -----------------------------------------------------------------------------

// 1.1 Default Meal Reminder Schedule Data Model
{
  console.log('Test 1.1: Meal reminder default schedule contains all 5 standard slots');
  mockLocalStorage.clear();

  const schedule = NotificationReminderManager.loadSchedule();
  assert(Array.isArray(schedule), 'Schedule deve ser um array');
  assert.strictEqual(schedule.length, 5, 'Deve conter exatamente 5 slots de refeição');

  const slotIds = schedule.map(s => s.id);
  assert(slotIds.includes('cafe'), 'Deve conter slot cafe');
  assert(slotIds.includes('almoco'), 'Deve conter slot almoco');
  assert(slotIds.includes('lanche'), 'Deve conter slot lanche');
  assert(slotIds.includes('jantar'), 'Deve conter slot jantar');
  assert(slotIds.includes('ceia'), 'Deve conter slot ceia');

  // Verify slot structure
  const cafe = schedule.find(s => s.id === 'cafe');
  assert.strictEqual(cafe.nome, 'Café da manhã');
  assert.strictEqual(cafe.hora, '07:30');
  assert.strictEqual(cafe.ativo, true);
}

// 1.2 Toggle Slot Enabled State and Persistence
{
  console.log('Test 1.2: Toggle reminder slot enabled/disabled status and sync bridge');
  bridgeSyncLogs.length = 0;

  const ceiaBefore = NotificationReminderManager.loadSchedule().find(s => s.id === 'ceia');
  assert.strictEqual(ceiaBefore.ativo, false, 'Ceia inicialmente desabilitada');

  // Toggle Ceia on
  const updatedCeia = NotificationReminderManager.toggleSlot('ceia');
  assert.strictEqual(updatedCeia.ativo, true, 'Ceia deve ficar habilitada');

  // Verify persistence
  const reloaded = NotificationReminderManager.loadSchedule().find(s => s.id === 'ceia');
  assert.strictEqual(reloaded.ativo, true, 'Status persistido no storage');

  // Verify syncAlarms was called on bridge
  assert(bridgeSyncLogs.length >= 1, 'Bridge syncAlarms deve ser chamado ao alternar slot');
  const lastSync = bridgeSyncLogs[bridgeSyncLogs.length - 1];
  const syncedCeia = lastSync.parsed.find(s => s.id === 'ceia');
  assert.strictEqual(syncedCeia.ativo, true);
}

// 1.3 Update Slot Notification Time
{
  console.log('Test 1.3: Update notification time for meal slot and sync bridge');
  bridgeSyncLogs.length = 0;

  // Update Almoço from 12:30 to 13:00
  const updatedAlmoco = NotificationReminderManager.updateSlotTime('almoco', '13:00');
  assert.strictEqual(updatedAlmoco.hora, '13:00');

  // Verify persistence
  const reloaded = NotificationReminderManager.loadSchedule().find(s => s.id === 'almoco');
  assert.strictEqual(reloaded.hora, '13:00');

  // Verify bridge sync
  assert(bridgeSyncLogs.length >= 1);
  const lastSync = bridgeSyncLogs[bridgeSyncLogs.length - 1];
  const syncedAlmoco = lastSync.parsed.find(s => s.id === 'almoco');
  assert.strictEqual(syncedAlmoco.hora, '13:00');
}

// 1.4 AndroidBridge Dispatch Contract
{
  console.log('Test 1.4: AndroidBridge native notification call dispatch');
  bridgeDispatches.length = 0;

  const result = NotificationReminderManager.dispatchTestNotification('almoco', mockAndroidBridge);
  assert.strictEqual(result.sent, true);
  assert.strictEqual(result.bridge, 'native');
  assert(result.title.includes('Almoço'));
  assert(result.message.includes('13:00'), 'Mensagem deve incluir o horário configurado');

  assert.strictEqual(bridgeDispatches.length, 1);
  assert(bridgeDispatches[0].title.includes('Almoço'));
  assert(bridgeDispatches[0].message.includes('NutriTrack'));
}

// -----------------------------------------------------------------------------
// TIER 2: BOUNDARY & VALIDATION TESTS
// -----------------------------------------------------------------------------

// 2.1 Time Format Regex Validation (HH:mm)
{
  console.log('Test 2.1: Time validation accepts valid 24h formats and rejects invalid strings');
  
  // Valid times
  assert.strictEqual(NotificationReminderManager.isValidTime('00:00'), true);
  assert.strictEqual(NotificationReminderManager.isValidTime('07:30'), true);
  assert.strictEqual(NotificationReminderManager.isValidTime('12:45'), true);
  assert.strictEqual(NotificationReminderManager.isValidTime('23:59'), true);

  // Invalid times
  assert.strictEqual(NotificationReminderManager.isValidTime('24:00'), false, '24:00 é inválido');
  assert.strictEqual(NotificationReminderManager.isValidTime('12:60'), false, '12:60 é inválido');
  assert.strictEqual(NotificationReminderManager.isValidTime('7:30'), false, 'Deve ter 2 dígitos na hora (07:30)');
  assert.strictEqual(NotificationReminderManager.isValidTime('abc'), false);
  assert.strictEqual(NotificationReminderManager.isValidTime(''), false);
  assert.strictEqual(NotificationReminderManager.isValidTime(null), false);

  // Update with invalid time should throw
  assert.throws(() => NotificationReminderManager.updateSlotTime('cafe', '25:00'), /Horário inválido/);
  assert.throws(() => NotificationReminderManager.updateSlotTime('cafe', '12:99'), /Horário inválido/);
}

// 2.2 Next Day 24h Rollover Calculation
{
  console.log('Test 2.2: Next day alarm trigger calculation matches native AlarmManager behavior');
  
  // Case A: Reminder is later today (e.g. now = 10:00, reminder = 12:30)
  const nowA = new Date('2026-08-16T10:00:00Z');
  const triggerA = new Date(NotificationReminderManager.calculateNextTriggerTimestamp('12:30', nowA));
  assert.strictEqual(triggerA.getHours(), 12);
  assert.strictEqual(triggerA.getMinutes(), 30);
  assert.strictEqual(triggerA.getDate(), nowA.getDate(), 'Trigger deve ser hoje');

  // Case B: Reminder was earlier today (e.g. now = 14:00, reminder = 07:30)
  const nowB = new Date('2026-08-16T14:00:00Z');
  const triggerB = new Date(NotificationReminderManager.calculateNextTriggerTimestamp('07:30', nowB));
  assert.strictEqual(triggerB.getHours(), 7);
  assert.strictEqual(triggerB.getMinutes(), 30);
  assert.strictEqual(triggerB.getDate(), nowB.getDate() + 1, 'Trigger deve rolar para amanha');
}

// 2.3 Graceful Fallback When AndroidBridge is Unavailable (Browser Mode)
{
  console.log('Test 2.3: Graceful fallback when AndroidBridge is null (browser mode)');
  const res = NotificationReminderManager.dispatchTestNotification('cafe', null);
  assert.strictEqual(res.sent, false);
  assert.strictEqual(res.bridge, 'fallback_web');
  assert(res.title.includes('Café da manhã'));
}

// -----------------------------------------------------------------------------
// TIER 3: AJUSTES.JS AND STATE INTEGRATION
// -----------------------------------------------------------------------------

// 3.1 ajustes.js toggleLembrete, atualizarHoraLembrete, wipeAll and doRestore
{
  console.log('Test 3.1: ajustes.js functions trigger syncAlarms and cancelAllAlarms correctly');
  bridgeSyncLogs.length = 0;
  bridgeCancelAllCalls = 0;

  // Test window.atualizarHoraLembrete
  context.atualizarHoraLembrete(0, '08:00');
  assert(bridgeSyncLogs.length >= 1, 'atualizarHoraLembrete deve chamar syncAlarms');
  const latestList = bridgeSyncLogs[bridgeSyncLogs.length - 1].parsed;
  assert.strictEqual(latestList[0].hora, '08:00');

  // Test window.toggleLembrete
  context.toggleLembrete(0, false);
  const toggledList = bridgeSyncLogs[bridgeSyncLogs.length - 1].parsed;
  assert.strictEqual(toggledList[0].ativo, false);

// Test window.wipeAll triggers cancelAllAlarms
// (contrato novo: wipeAll abre modal; confirmWipeAll executa a limpeza)
context.wipeAll();
context.confirmWipeAll();
  assert.strictEqual(bridgeCancelAllCalls, 1, 'wipeAll deve chamar cancelAllAlarms');
}

// -----------------------------------------------------------------------------
// TIER 4: CAMERA DOM PERSISTENCE TEST
// -----------------------------------------------------------------------------

// 4.1 Camera persistent DOM input lifecycle
{
  console.log('Test 4.1: Camera file input element is persistently attached to DOM body and managed cleanly');
  assert(typeof context.getCameraFileInput === 'function', 'getCameraFileInput deve existir');
  const inputEl1 = context.getCameraFileInput();
  assert(inputEl1, 'Input deve ser instanciado');
  assert.strictEqual(inputEl1.id, 'cameraFileInput');
  assert.strictEqual(inputEl1.type, 'file');
  assert(mockBody.children.includes(inputEl1), 'Input deve estar anexado ao document.body');

  const inputEl2 = context.getCameraFileInput();
  assert.strictEqual(inputEl1, inputEl2, 'Deve reutilizar a mesma instancia de input');

  // Test openFoto initializes value and doesn\'t crash
  context.openFoto();
  assert.strictEqual(inputEl1.value, '', 'openFoto deve limpar input value');
}

console.log('\n======================================================');
console.log('notifications.test.js: OK (Todos os testes passaram com sucesso!)');
