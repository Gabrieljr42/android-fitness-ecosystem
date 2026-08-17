'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== [NUTRITRACK] Executando Suíte: custom_reminders_positive_messages.test.js ===\n');

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

const bridgeSyncCalls = [];
const bridgeDispatches = [];

const mockAndroidBridge = {
  sendNotification: (title, message) => {
    bridgeDispatches.push({ title, message });
  },
  syncAlarms: (json) => {
    bridgeSyncCalls.push(JSON.parse(json));
  },
  cancelAllAlarms: () => {},
  vibrate: (ms) => {}
};

let lastModalHtml = null;
let modalClosed = false;
let toasts = [];

const elementsMap = {};
const documentMock = {
  body: createMockElement('body'),
  getElementById: (id) => {
    if (!elementsMap[id]) elementsMap[id] = createMockElement('div');
    return elementsMap[id];
  },
  querySelector: (sel) => {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      if (!elementsMap[id]) elementsMap[id] = createMockElement('div');
      return elementsMap[id];
    }
    return createMockElement('div');
  },
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
  $: (sel) => documentMock.querySelector(sel),
  toast: (msg) => { toasts.push(msg); },
  openModal: (html) => { lastModalHtml = html; modalClosed = false; },
  closeModal: () => { modalClosed = true; },
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

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`, err);
    throw err;
  }
}

console.log('--- SUITE 1: Gerador de Mensagens Positivas & Animadoras ---');

test('1.1: MENSAGENS_POSITIVAS contém no mínimo 10 mensagens motivacionais ricas', () => {
  const msgs = context.window.MENSAGENS_POSITIVAS || context.MENSAGENS_POSITIVAS;
  assert(Array.isArray(msgs), 'MENSAGENS_POSITIVAS deve ser um array');
  assert(msgs.length >= 10, 'Deve ter pelo menos 10 mensagens variadas');
  msgs.forEach(msg => {
    assert(typeof msg === 'string' && msg.trim().length > 10, 'Mensagem deve ser uma string descritiva');
  });
});

test('1.2: obterMensagemPositiva retorna mensagens variadas e positivas para refeições padrão', () => {
  const getMsg = context.window.obterMensagemPositiva || context.obterMensagemPositiva;
  const samples = new Set();
  for (let i = 0; i < 50; i++) {
    const msg = getMsg('Almoço');
    assert(typeof msg === 'string' && msg.length > 5, 'Mensagem gerada não pode ser vazia');
    samples.add(msg);
  }
  assert(samples.size > 1, 'Deve gerar mensagens variadas ao longo do tempo');
});

test('1.3: obterMensagemPositiva fornece mensagens contextuais para Água e Creatina', () => {
  const getMsg = context.window.obterMensagemPositiva || context.obterMensagemPositiva;
  const msgAgua = getMsg('Água / Hidratação');
  assert(msgAgua.toLowerCase().includes('hidrata') || msgAgua.toLowerCase().includes('água') || msgAgua.includes('💧') || msgAgua.includes('🌊'), 'Mensagem de água deve incentivar hidratação');

  const msgCreatina = getMsg('Creatina');
  assert(msgCreatina.toLowerCase().includes('creatina') || msgCreatina.includes('⚡'), 'Mensagem de creatina deve incentivar consistência');
});

test('1.4: obterMensagemPositiva fornece mensagens contextuais para Pré e Pós-Treino', () => {
  const getMsg = context.window.obterMensagemPositiva || context.obterMensagemPositiva;
  const msgPre = getMsg('Pré-Treino');
  assert(msgPre.toLowerCase().includes('treino') || msgPre.toLowerCase().includes('tanque') || msgPre.toLowerCase().includes('energia'), 'Mensagem de pré-treino deve incentivar energia');

  const msgPos = getMsg('Pós-Treino');
  assert(msgPos.toLowerCase().includes('recuperação') || msgPos.toLowerCase().includes('nutrientes') || msgPos.toLowerCase().includes('muscular'), 'Mensagem de pós-treino deve incentivar recuperação');
});

console.log('\n--- SUITE 2: Adição, Edição e Exclusão Flexível de Horários ---');

test('2.1: loadLembretes retorna DEFAULT_LEMBRETES quando vazio', () => {
  mockLocalStorage.clear();
  const list = context.loadLembretes();
  assert(Array.isArray(list) && list.length === 5, 'Deve carregar os 5 lembretes padrão');
  assert.strictEqual(list[0].id, 'cafe');
});

test('2.2: Adição de novo lembrete personalizado (ex: Pré-treino às 15:30)', () => {
  mockLocalStorage.clear();
  const list = context.loadLembretes();
  const initialLength = list.length;

  context.document.getElementById('novoLembreteNome').value = 'Pré-Treino';
  context.document.getElementById('novoLembreteHora').value = '15:30';

  context.salvarNovoLembrete();

  const updatedList = context.loadLembretes();
  assert.strictEqual(updatedList.length, initialLength + 1, 'Lista deve ter 1 lembrete a mais');
  const added = updatedList[updatedList.length - 1];
  assert.strictEqual(added.nome, 'Pré-Treino');
  assert.strictEqual(added.hora, '15:30');
  assert.strictEqual(added.ativo, true);
  assert(added.id.startsWith('lembrete_'), 'ID deve ser único');
});

test('2.3: Remoção de lembrete por índice', () => {
  const list = context.loadLembretes();
  const len = list.length;
  const targetName = list[0].nome;

  context.removerLembrete(0);

  const updatedList = context.loadLembretes();
  assert.strictEqual(updatedList.length, len - 1, 'Lista deve diminuir 1 item');
  assert(updatedList.every(item => item.id !== 'cafe'), 'Item cafe deve ter sido removido');
});

test('2.4: Edição in-place de nome e hora', () => {
  const list = context.loadLembretes();
  assert(list.length > 0);

  context.atualizarNomeLembrete(0, 'Almoço dos Campeões');
  context.atualizarHoraLembrete(0, '13:15');

  const reloaded = context.loadLembretes();
  assert.strictEqual(reloaded[0].nome, 'Almoço dos Campeões');
  assert.strictEqual(reloaded[0].hora, '13:15');
});

test('2.5: Sincronização via AndroidBridge.syncAlarms inclui mensagens positivas em cada lembrete', () => {
  bridgeSyncCalls.length = 0;
  const list = context.loadLembretes();
  context.saveLembretes(list);

  assert(bridgeSyncCalls.length > 0, 'Deve ter chamado AndroidBridge.syncAlarms');
  const lastSync = bridgeSyncCalls[bridgeSyncCalls.length - 1];
  assert(Array.isArray(lastSync), 'Payload sincronizado deve ser um array');
  lastSync.forEach(item => {
    assert(item.mensagem && item.mensagem.length > 5, 'Cada alarme deve ter sua mensagem positiva');
  });
});

console.log('\n--- SUITE 3: Modal de Novo Lembrete & Teste de Notificação ---');

test('3.1: abrirModalNovoLembrete abre modal com presets de horários e tags rápidas', () => {
  lastModalHtml = null;
  context.abrirModalNovoLembrete();
  assert(lastModalHtml !== null, 'Deve abrir modal com HTML');
  assert(lastModalHtml.includes('Adicionar Lembrete'), 'Modal deve ter título');
  assert(lastModalHtml.includes('Pré-Treino'), 'Modal deve conter tag Pré-Treino');
  assert(lastModalHtml.includes('Água / Hidratação'), 'Modal deve conter tag Água');
  assert(lastModalHtml.includes('Creatina'), 'Modal deve conter tag Creatina');
});

test('3.2: testarNotificacao dispara notificação nativa com vibração e frase positiva', () => {
  bridgeDispatches.length = 0;
  context.testarNotificacao();
  assert(bridgeDispatches.length > 0, 'Deve despachar notificação');
  const dispatched = bridgeDispatches[bridgeDispatches.length - 1];
  assert(dispatched.title.startsWith('NutriTrack ⏰'), 'Título deve conter NutriTrack');
  assert(dispatched.message.length > 5, 'Mensagem positiva deve ser despachada');
});

console.log(`\n========================================================`);
console.log(`🎉 ALL ${passCount} CUSTOM REMINDER & POSITIVE NOTIF TESTS PASSED!`);
console.log(`========================================================\n`);
