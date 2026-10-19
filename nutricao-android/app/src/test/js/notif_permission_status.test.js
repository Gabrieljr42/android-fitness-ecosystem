'use strict';

// notif_permission_status.test.js — Card de permissão de lembretes (Ajustes).
// Cobre a regressão do update que elevou o targetSdk para 34:
//  - POST_NOTIFICATIONS negada 2x => sistema para de exibir o diálogo;
//  - SCHEDULE_EXACT_ALARM negado no Android 14+ => setExact lança
//    SecurityException e o lembrete nunca dispara.
// O app deve detectar via ponte nativa e exibir card com ação.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

function buildContext(bridge) {
  const toastCalls = [];
  const documentMock = {
    getElementById: () => createMockElement('div'),
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => [],
    createElement: (tag) => createMockElement(tag),
    addEventListener: () => {}
  };
  const windowMock = { addEventListener: () => {}, removeEventListener: () => {} };
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
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    document: documentMock,
    window: windowMock,
    localStorage: mockLocalStorage,
    toast: (msg) => { toastCalls.push(String(msg)); },
    openModal: () => {},
    closeModal: () => {},
    render: () => {},
    confirm: () => true,
    _toastCalls: toastCalls
  };
  if (bridge !== undefined) {
    context.AndroidBridge = bridge;
    windowMock.AndroidBridge = bridge;
  }
  vm.createContext(context);
  const baseDir = path.resolve(__dirname, '../../main/assets');
  const loadScript = (relPath) => {
    const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
    vm.runInContext(code, context);
  };
  loadScript('apps/nutricao/estado.js');
  loadScript('apps/nutricao/views/ajustes.js');
  return context;
}

console.log('=== [NUTRITRACK] Executando Suíte: notif_permission_status.test.js ===\n');

// 1. Ponte legada (sem novos métodos): nada muda, sem card, sem exceção.
{
  console.log('Test 1: ponte legada sem métodos de status não quebra e não exibe card');
  mockLocalStorage.clear();
  const legacyBridge = {
    sendNotification: () => {},
    syncAlarms: () => {},
    cancelAllAlarms: () => {},
    vibrate: () => {}
  };
  const ctx = buildContext(legacyBridge);
  const st = ctx.getNotifPermStatus();
  assert.strictEqual(st.hasBridge, true);
  assert.strictEqual(st.notifOk, true, 'sem método de status, assume OK (compat)');
  assert.strictEqual(st.exactOk, true, 'sem método de status, assume OK (compat)');
  assert.strictEqual(ctx.renderNotifPermCard(), '', 'sem bloqueio, sem card');

  // testarNotificacao continua disparando normalmente na ponte legada
  let sent = 0;
  legacyBridge.sendNotification = () => { sent++; };
  ctx.testarNotificacao();
  assert.strictEqual(sent, 1, 'ponte legada deve continuar enviando o teste');
}

// 2. Notificações bloqueadas no sistema: card com botão de configurações.
{
  console.log('Test 2: notificações bloqueadas exibem card com ação de configurações');
  mockLocalStorage.clear();
  let settingsOpened = 0;
  let permRequested = 0;
  const ctx = buildContext({
    sendNotification: () => { throw new Error('não deveria ser chamado com permissão bloqueada'); },
    syncAlarms: () => {},
    vibrate: () => {},
    areNotificationsEnabled: () => false,
    canScheduleExactAlarms: () => true,
    requestNotificationPermission: () => { permRequested++; },
    openNotificationSettings: () => { settingsOpened++; }
  });
  const st = ctx.getNotifPermStatus();
  assert.strictEqual(st.notifOk, false);
  const card = ctx.renderNotifPermCard();
  assert(card.includes('notifPermCard'), 'card deve ter id estável');
  assert(card.includes('bloqueadas'), 'card deve mencionar o bloqueio');
  assert(card.includes('abrirConfigNotificacoes'), 'card deve oferecer abrir configurações');

  ctx.abrirConfigNotificacoes();
  assert.strictEqual(settingsOpened, 1, 'botão deve abrir configurações do app');
  ctx.pedirPermissaoNotificacao();
  assert.strictEqual(permRequested, 1, 'botão deve re-disparar o diálogo do sistema');

  // testarNotificacao NÃO finge sucesso: orienta e não chama o nativo
  ctx._toastCalls.length = 0;
  ctx.testarNotificacao();
  assert(ctx._toastCalls.some(t => t.includes('configura')), 'deve orientar para as configurações');
}

// 3. Alarme exato desativado (Android 14+): card com ação específica.
{
  console.log('Test 3: alarme exato desativado exibe card com ação dedicada');
  mockLocalStorage.clear();
  let exactOpened = 0;
  const ctx = buildContext({
    sendNotification: () => {},
    syncAlarms: () => {},
    vibrate: () => {},
    areNotificationsEnabled: () => true,
    canScheduleExactAlarms: () => false,
    openExactAlarmSettings: () => { exactOpened++; }
  });
  const st = ctx.getNotifPermStatus();
  assert.strictEqual(st.notifOk, true);
  assert.strictEqual(st.exactOk, false);
  const card = ctx.renderNotifPermCard();
  assert(card.includes('exatos'), 'card deve mencionar alarmes exatos');
  assert(card.includes('solicitarAlarmeExato'), 'card deve oferecer a ação de permissão');
  ctx.solicitarAlarmeExato();
  assert.strictEqual(exactOpened, 1);
}

// 4. Tudo permitido: nenhum card.
{
  console.log('Test 4: permissões OK não exibem card');
  mockLocalStorage.clear();
  const ctx = buildContext({
    sendNotification: () => {},
    syncAlarms: () => {},
    vibrate: () => {},
    areNotificationsEnabled: () => true,
    canScheduleExactAlarms: () => true
  });
  assert.strictEqual(ctx.renderNotifPermCard(), '');
}

// 5. Sem ponte (navegador): sem card, sem exceção, preview via toast.
{
  console.log('Test 5: modo navegador sem ponte continua em preview');
  mockLocalStorage.clear();
  const ctx = buildContext(undefined);
  const st = ctx.getNotifPermStatus();
  assert.strictEqual(st.hasBridge, false);
  assert.strictEqual(ctx.renderNotifPermCard(), '');
  ctx._toastCalls.length = 0;
  ctx.testarNotificacao();
  assert(ctx._toastCalls.some(t => t.includes('Preview')), 'sem ponte deve cair no preview');
}

// 6. Callback do resultado do diálogo do sistema.
{
  console.log('Test 6: __nutriNotifPermissionResult orienta e re-renderiza');
  mockLocalStorage.clear();
  const ctx = buildContext({
    sendNotification: () => {},
    syncAlarms: () => {},
    vibrate: () => {},
    areNotificationsEnabled: () => false,
    canScheduleExactAlarms: () => true
  });
  let renders = 0;
  ctx.render = () => { renders++; };
  ctx._toastCalls.length = 0;
  ctx.__nutriNotifPermissionResult(false, true);
  assert(ctx._toastCalls.some(t => t.includes('configura')), 'negativa permanente deve citar configurações');
  assert.strictEqual(renders, 1, 'deve re-renderizar para exibir o card');

  ctx._toastCalls.length = 0;
  ctx.__nutriNotifPermissionResult(true, false);
  assert(ctx._toastCalls.some(t => t.includes('ativadas')), 'concessão deve confirmar');
}

// 7. renderAjustes inclui o card quando há bloqueio.
{
  console.log('Test 7: renderAjustes injeta o card de permissão no topo');
  mockLocalStorage.clear();
  const ctx = buildContext({
    sendNotification: () => {},
    syncAlarms: () => {},
    vibrate: () => {},
    areNotificationsEnabled: () => false,
    canScheduleExactAlarms: () => false,
    openNotificationSettings: () => {},
    openExactAlarmSettings: () => {}
  });
  const main = createMockElement('main');
  ctx.renderAjustes(main);
  assert(main.innerHTML.includes('notifPermCard'), 'HTML deve conter o card de permissão');
  assert(main.innerHTML.includes('Lembretes'), 'conteúdo original preservado');
}

console.log('\n======================================================');
console.log('notif_permission_status.test.js: OK (Todos os testes passaram com sucesso!)');
