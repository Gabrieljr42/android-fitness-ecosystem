import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== [NUTRITRACK] Executando Suíte de Testes Adversariais e Stress (M2) ===\n');

// Mock DOM elements
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
    oninput: null,
    click: function() {},
    focus: () => {},
    setAttribute: function(name, val) { this.attributes[name] = String(val); },
    getAttribute: function(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; },
    appendChild: function(child) { this.children.push(child); return child; },
    remove: function() {
      if (this.parentElement && this.parentElement.children) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx >= 0) this.parentElement.children.splice(idx, 1);
      }
    }
  };
}

const mockStorage = {};
const mockLocalStorage = {
  getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
};

const bridgeCalls = [];
const mockAndroidBridge = {
  sendNotification: (title, message) => {
    bridgeCalls.push({ method: 'sendNotification', title, message });
  },
  vibrate: (ms) => {
    bridgeCalls.push({ method: 'vibrate', ms });
  },
  saveBackup: (json, filename) => {
    bridgeCalls.push({ method: 'saveBackup', json, filename });
  }
};

const toastMessages = [];
const modalContents = [];

const domRoot = createMockElement('body');
const documentMock = {
  body: domRoot,
  getElementById: (id) => {
    const el = createMockElement('div');
    el.id = id;
    return el;
  },
  querySelector: (s) => {
    const el = createMockElement('div');
    el.selector = s;
    return el;
  },
  querySelectorAll: (s) => [],
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
  AndroidBridge: mockAndroidBridge,
  Blob: globalThis.Blob,
  URL: {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {}
  },
  localStorage: mockLocalStorage,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  toast: (msg) => { toastMessages.push(msg); },
  openModal: (html) => { modalContents.push(html); },
  closeModal: () => {},
  render: () => {},
  confirm: () => true,
  fetch: null
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('apps/nutricao/estado.js');
loadScript('core/gemini.js');
loadScript('apps/nutricao/views/ajustes.js');

vm.runInContext(`
  globalThis.apiBodyTexto = typeof apiBodyTexto !== 'undefined' ? apiBodyTexto : null;
  globalThis.FOOD_SCHEMA = typeof FOOD_SCHEMA !== 'undefined' ? FOOD_SCHEMA : null;
  globalThis.TEXT_FOOD_PROMPT = typeof TEXT_FOOD_PROMPT !== 'undefined' ? TEXT_FOOD_PROMPT : null;
  globalThis.GEMINI_MODELS = typeof GEMINI_MODELS !== 'undefined' ? GEMINI_MODELS : null;
  globalThis.isRetryableStatus = typeof isRetryableStatus !== 'undefined' ? isRetryableStatus : null;
  globalThis.mergeAnalisys = typeof mergeAnalisys !== 'undefined' ? mergeAnalisys : null;
  globalThis.desvioPct = typeof desvioPct !== 'undefined' ? desvioPct : null;
  globalThis.loadLembretes = typeof loadLembretes !== 'undefined' ? loadLembretes : null;
  globalThis.saveLembretes = typeof saveLembretes !== 'undefined' ? saveLembretes : null;
  globalThis.renderLembretesHtml = typeof renderLembretesHtml !== 'undefined' ? renderLembretesHtml : null;
  globalThis.renderAjustes = typeof renderAjustes !== 'undefined' ? renderAjustes : null;
  globalThis.consultarModeloTexto = typeof consultarModeloTexto !== 'undefined' ? consultarModeloTexto : null;
  globalThis.getMeals = () => meals;
  globalThis.setMeals = (m) => { meals = m; };
`, context);

// =============================================================================
// SECTION 1: GEMINI.JS TEXT PROMPT GENERATION & SANITIZATION STRESS TESTS
// =============================================================================
console.log('--- Seção 1: Geração de Prompt e Sanitização (gemini.js) ---');

// 1.1 apiBodyTexto with extreme inputs (empty, whitespace, huge text > 1000 chars)
{
  console.log('Teste 1.1: apiBodyTexto lida com inputs extremos (vazio, whitespace, >1000 chars)');
  const model = context.GEMINI_MODELS[0];

  // Empty string
  const bodyEmpty = context.apiBodyTexto('', model);
  assert(bodyEmpty.contents[0].parts[0].text.includes(context.TEXT_FOOD_PROMPT));

  // Null and undefined safety
  const bodyNull = context.apiBodyTexto(null, model);
  assert(bodyNull.contents[0].parts[0].text.includes(context.TEXT_FOOD_PROMPT));

  const bodyUndef = context.apiBodyTexto(undefined, model);
  assert(bodyUndef.contents[0].parts[0].text.includes(context.TEXT_FOOD_PROMPT));

  // Massive text > 1000 characters (e.g. 5000 chars)
  const hugeText = 'Ovo mexido '.repeat(500); // 5500 chars
  const bodyHuge = context.apiBodyTexto(hugeText, model);
  const sentPartText = bodyHuge.contents[0].parts[0].text;
  
  // The description portion must be bounded (sliced to 1000 max)
  assert(sentPartText.length < 2000, 'Texto do payload deve limitar a descrição a 1000 caracteres');

  // Unicode, special symbols, quotes, script tags, backticks
  const adversarialInput = '<script>alert("xss")</script> 🥗 Frango c/ "aspas" & `crases` \n\t { "fake": "json" } 🏋️';
  const bodyAdv = context.apiBodyTexto(adversarialInput, model);
  assert(bodyAdv.contents[0].parts[0].text.includes(adversarialInput.trim()), 'Input com caracteres especiais preservado corretamente');
  assert.strictEqual(bodyAdv.generationConfig.responseMimeType, 'application/json');
  assert.strictEqual(bodyAdv.generationConfig.responseSchema, context.FOOD_SCHEMA);
  assert.strictEqual(bodyAdv.generationConfig.thinkingConfig.thinkingLevel, 'low');
}

// =============================================================================
// SECTION 2: JSON PARSING RESILIENCE & SANITIZATION STRESS TESTS
// =============================================================================
console.log('\n--- Seção 2: Resiliência de Parsing JSON e Sanitização de Model Output ---');

// 2.1 Codeblock stripping and JSON cleanup regex
{
  console.log('Teste 2.1: Limpeza de markdown code-blocks (```json ... ``` e ``` ... ```)');
  
  const cleanJsonText = (txt) => String(txt).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  const case1 = "```json\n{\"nome_refeicao\": \"Teste 1\"}\n```";
  assert.strictEqual(JSON.parse(cleanJsonText(case1)).nome_refeicao, 'Teste 1');

  const case2 = "```JSON\n{\"nome_refeicao\": \"Teste 2\"}\n```";
  assert.strictEqual(JSON.parse(cleanJsonText(case2)).nome_refeicao, 'Teste 2');

  const case3 = "```\n{\"nome_refeicao\": \"Teste 3\"}\n```";
  assert.strictEqual(JSON.parse(cleanJsonText(case3)).nome_refeicao, 'Teste 3');

  const case4 = "  \n  {\"nome_refeicao\": \"Teste 4\"}  \n  ";
  assert.strictEqual(JSON.parse(cleanJsonText(case4)).nome_refeicao, 'Teste 4');
}

// 2.2 mergeAnalisys resilience with edge cases, missing fields and outliers
{
  console.log('Teste 2.2: mergeAnalisys com outliers extremos, dados parciais e campos ausentes');
  
  // Normal 3 responses with 1 huge hallucinated outlier
  const inputWithOutlier = [
    { kcal_total: 450, proteina_total: 35, carbo_total: 40, gordura_total: 10, nome_refeicao: 'Omelete com aveia', itens: [{ nome: 'Ovo', kcal: 150 }] },
    { kcal_total: 480, proteina_total: 38, carbo_total: 42, gordura_total: 12, nome_refeicao: 'Omelete', itens: [{ nome: 'Ovo', kcal: 150 }] },
    { kcal_total: 3500, proteina_total: 300, carbo_total: 400, gordura_total: 150, nome_refeicao: 'Banquete Gigante', itens: [] }
  ];

  const merged = context.mergeAnalisys(inputWithOutlier);
  // Median is 480. 3500 distance is 3020 (> 0.5 * 480 = 240). 3500 should be rejected!
  assert.strictEqual(merged.kcal_total, 465, 'Outlier de 3500 kcal deve ser descartado (média de 450 e 480 = 465)');
  assert.strictEqual(merged.proteina_total, 37); // (35 + 38) / 2 = 36.5 -> round to 37
  assert.strictEqual(merged.carbo_total, 41);
  assert.strictEqual(merged.gordura_total, 11);
  assert.strictEqual(merged.nome_refeicao, 'Omelete com aveia');

  // Missing / corrupt fields
  const inputCorrupted = [
    { kcal_total: 'invalid', proteina_total: null, carbo_total: undefined, gordura_total: NaN, nome_refeicao: '' },
    { kcal_total: 300, proteina_total: 20, carbo_total: 30, gordura_total: 5, nome_refeicao: 'Lanche' }
  ];
  const mergedCorrupted = context.mergeAnalisys(inputCorrupted);
  assert(Number.isFinite(mergedCorrupted.kcal_total), 'kcal_total deve ser numérico e finito');
  assert(Number.isFinite(mergedCorrupted.proteina_total), 'proteina_total deve ser numérico e finito');
  assert.strictEqual(mergedCorrupted.nome_refeicao, 'Lanche');

  // desvioPct edge cases (zeros, empty array, division by zero)
  assert.strictEqual(context.desvioPct([]), 0);
  assert.strictEqual(context.desvioPct([0, 0, 0]), 0);
  assert.strictEqual(context.desvioPct([100]), 0);
  assert.strictEqual(context.desvioPct([100, 100, 100]), 0);
}

// =============================================================================
// SECTION 3: HTTP STATUS CODES & RETRYABLE ERROR MATRIX STRESS TESTS
// =============================================================================
console.log('\n--- Seção 3: Matriz de Códigos de Status HTTP e Retentativas ---');

{
  console.log('Teste 3.1: Validação exaustiva de códigos retentáveis vs não-retentáveis');

  // Retryable
  assert.strictEqual(context.isRetryableStatus(429), true, '429 Rate limit deve ser retentável');
  assert.strictEqual(context.isRetryableStatus(500), true, '500 Server error deve ser retentável');
  assert.strictEqual(context.isRetryableStatus(502), true, '502 Bad Gateway deve ser retentável');
  assert.strictEqual(context.isRetryableStatus(503), true, '503 Service Unavailable deve ser retentável');
  assert.strictEqual(context.isRetryableStatus(504), true, '504 Gateway Timeout deve ser retentável');
  assert.strictEqual(context.isRetryableStatus(408), true, '408 Request Timeout deve ser retentável');
  assert.strictEqual(context.isRetryableStatus(null), true, 'Network Timeout (null status) deve ser retentável');
  assert.strictEqual(context.isRetryableStatus(undefined), true, 'Status undefined deve ser retentável');

  // Non-retryable
  assert.strictEqual(context.isRetryableStatus(200), false, '200 OK não é retryable');
  assert.strictEqual(context.isRetryableStatus(400), false, '400 Bad Request não deve re-tentar');
  assert.strictEqual(context.isRetryableStatus(401), false, '401 Unauthorized não deve re-tentar');
  assert.strictEqual(context.isRetryableStatus(403), false, '403 Forbidden não deve re-tentar');
  assert.strictEqual(context.isRetryableStatus(404), false, '404 Not Found não deve re-tentar');
}

// 3.2 Mock fetch execution with retry and fallback
{
  console.log('Teste 3.2: consultarModeloTexto com simulação de erro 429 e sucesso na 2ª tentativa');
  
  let fetchAttempts = 0;
  context.fetch = async (url, options) => {
    fetchAttempts++;
    if (fetchAttempts === 1) {
      // Return 429 Rate Limit
      return {
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: 'Quota exceeded', code: 429 } })
      };
    } else {
      // Return 200 OK with valid JSON
      const mockResult = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                nome_refeicao: 'Almoço Saudável',
                itens: [{ nome: 'Frango', porcao_g: 150, kcal: 240, proteina_g: 35, carbo_g: 0, gordura_g: 4 }],
                kcal_total: 240,
                proteina_total: 35,
                carbo_total: 0,
                gordura_total: 4,
                confianca: 'alta'
              })
            }]
          }
        }]
      };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResult)
      };
    }
  };

  const model = context.GEMINI_MODELS[0];
  
  // First call (attempt 1) -> should return trace with ok=false and retryable=true
  const trace1 = await context.consultarModeloTexto(model, 'Frango grelhado', 0, 1, 'AIzaMockKey');
  assert.strictEqual(trace1.ok, false);
  assert.strictEqual(trace1.status, 429);
  assert.strictEqual(trace1.retryable, true);

  // Second call (attempt 2) -> should return trace with ok=true and valid result
  const trace2 = await context.consultarModeloTexto(model, 'Frango grelhado', 0, 2, 'AIzaMockKey');
  assert.strictEqual(trace2.ok, true);
  assert.strictEqual(trace2.status, 200);
  assert.strictEqual(trace2.result.nome_refeicao, 'Almoço Saudável');
  assert.strictEqual(trace2.result.kcal_total, 240);
}

// 3.3 Non-retryable error (401 Invalid API Key) terminates immediately
{
  console.log('Teste 3.3: consultarModeloTexto com erro 401 (chave inválida) não marca retryable');
  
  context.fetch = async () => {
    return {
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'API_KEY_INVALID', code: 401 } })
    };
  };

  const model = context.GEMINI_MODELS[0];
  const trace = await context.consultarModeloTexto(model, 'Frango', 0, 1, 'INVALID_KEY');
  assert.strictEqual(trace.ok, false);
  assert.strictEqual(trace.status, 401);
  assert.strictEqual(trace.retryable, false, 'Erro 401 não deve ter retryable=true');
}

// 3.4 User Cancellation flow
{
  console.log('Teste 3.4: Cancelamento de requisição pelo usuário');
  const run = { cancelled: true, controller: null, waiters: [] };
  const trace = await context.consultarModeloTexto(context.GEMINI_MODELS[0], 'Frango', 0, 1, 'KEY', run);
  assert.strictEqual(trace.cancelled, true);
  assert.strictEqual(trace.ok, false);
  assert.strictEqual(trace.error, 'Análise encerrada pelo usuário');
}

// =============================================================================
// SECTION 4: MEAL REMINDER STORAGE, BACKUP & SYNC STRESS TESTS
// =============================================================================
console.log('\n--- Seção 4: Persistência de Lembretes, Backup e Sincronização ---');

// 4.1 loadLembretes fallback resilience
{
  console.log('Teste 4.1: loadLembretes com storage vazio, corrompido ou formato não-array');
  mockLocalStorage.clear();

  // 1. Empty storage
  let lembretes = context.loadLembretes();
  assert.strictEqual(lembretes.length, 5, 'Deve retornar os 5 lembretes padrão');
  assert.strictEqual(lembretes[0].id, 'cafe');
  assert.strictEqual(lembretes[0].hora, '07:30');

  // 2. Corrupted JSON in localStorage
  mockLocalStorage.setItem('nt_reminders', '{ malformed json !!!');
  lembretes = context.loadLembretes();
  assert.strictEqual(lembretes.length, 5, 'Storage corrompido deve retornar defaults graciosamente');

  // 3. Empty array in localStorage
  mockLocalStorage.setItem('nt_reminders', '[]');
  lembretes = context.loadLembretes();
  assert.strictEqual(lembretes.length, 5, 'Array vazio deve retornar defaults');
}

// 4.2 Updating and toggling reminder slots
{
  console.log('Teste 4.2: Atualização de horários e toggles de lembretes');
  mockLocalStorage.clear();

  const mainMock = createMockElement('div');
  context.renderAjustes(mainMock);

  // Update Almoço (index 1) to 13:15
  context.window.atualizarHoraLembrete(1, '13:15');
  let currentList = context.loadLembretes();
  assert.strictEqual(currentList[1].hora, '13:15');

  // Toggle Ceia (index 4) to true
  context.window.toggleLembrete(4, true);
  currentList = context.loadLembretes();
  assert.strictEqual(currentList[4].ativo, true);

  // Out of bounds index safety
  context.window.atualizarHoraLembrete(99, '12:00'); // Should not throw
  context.window.toggleLembrete(99, true); // Should not throw
}

// 4.3 Backup & Restore round-trip with all features
{
  console.log('Teste 4.3: Exportação e Restauração de Backup completo');
  
  // Populate state
  const testMeals = [
    { id: 'm1', date: '2026-08-15', hour: '12:30', nome: 'Almoço', itens: [{ nome: 'Arroz', kcal: 200 }], origem: 'plano' }
  ];
  context.setMeals(testMeals);
  mockLocalStorage.setItem('nt_meals', JSON.stringify(testMeals));
  mockLocalStorage.setItem('nt_habits', JSON.stringify({ '2026-08-15': { creatina: true } }));
  mockLocalStorage.setItem('nt_water', JSON.stringify({ '2026-08-15': 2500 }));
  mockLocalStorage.setItem('nt_alims', JSON.stringify([{ nome: 'Whey Isolado', kcal: 120, custom: true }]));

  let backupGeneratedJson = null;
  bridgeCalls.length = 0;
  
  // Call doBackup
  context.window.doBackup();
  
  const saveCall = bridgeCalls.find(c => c.method === 'saveBackup');
  assert(saveCall, 'AndroidBridge.saveBackup deve ter sido invocado');
  backupGeneratedJson = saveCall.json;
  
  const parsedBackup = JSON.parse(backupGeneratedJson);
  assert.strictEqual(parsedBackup.meals.length, 1);
  assert.strictEqual(parsedBackup.habits['2026-08-15'].creatina, true);
  assert.strictEqual(parsedBackup.water['2026-08-15'], 2500);
  assert.strictEqual(parsedBackup.alims[0].nome, 'Whey Isolado');
  assert(Array.isArray(parsedBackup.reminders), 'Backup deve conter array de reminders');

  // Modify local state
  mockLocalStorage.clear();
  context.setMeals([]);

  // Restore backup
  const fakeFile = { name: 'backup.json' };
  // Mock FileReader
  class MockFileReader {
    readAsText(f) {
      this.result = backupGeneratedJson;
      if (typeof this.onload === 'function') this.onload();
    }
  }
  context.FileReader = MockFileReader;

  context.window.doRestore(fakeFile);

  const restoredMeals = context.getMeals();
  assert.strictEqual(restoredMeals.length, 1, 'Meals devem ser restaurados');
  assert.strictEqual(restoredMeals[0].nome, 'Almoço');
  assert.strictEqual(context.loadLembretes()[1].hora, '13:15', 'Lembretes personalizados devem ser restaurados');
  
  const restoredHabits = JSON.parse(mockLocalStorage.getItem('nt_habits'));
  assert.strictEqual(restoredHabits['2026-08-15'].creatina, true, 'Hábitos restaurados');
}

// 4.4 WipeAll comprehensive cleanup
{
  console.log('Teste 4.4: wipeAll limpa todas as chaves do storage e estado em memória');
  context.window.wipeAll();

  assert.strictEqual(mockLocalStorage.getItem('nt_meals'), null);
  assert.strictEqual(mockLocalStorage.getItem('nt_profile'), null);
  assert.strictEqual(mockLocalStorage.getItem('nt_alims'), null);
  assert.strictEqual(mockLocalStorage.getItem('nt_reminders'), null);
  assert.strictEqual(mockLocalStorage.getItem('nt_habits'), null);
  assert.strictEqual(mockLocalStorage.getItem('nt_water'), null);
  assert.strictEqual(context.getMeals().length, 0);
}

// =============================================================================
// SECTION 5: JAVASCRIPT BRIDGE INVOCATION SAFETY STRESS TESTS
// =============================================================================
console.log('\n--- Seção 5: Segurança da Bridge JavaScript (AndroidBridge presente vs indefinido) ---');

// 5.1 testarNotificacao with AndroidBridge present
{
  console.log('Teste 5.1: testarNotificacao com AndroidBridge ativo (invoca sendNotification e vibrate)');
  bridgeCalls.length = 0;
  
  context.window.testarNotificacao();
  
  assert.strictEqual(bridgeCalls.length, 2, 'Deve chamar sendNotification e vibrate');
  assert.strictEqual(bridgeCalls[0].method, 'sendNotification');
  assert(bridgeCalls[0].title.includes('NutriTrack'));
  assert.strictEqual(bridgeCalls[1].method, 'vibrate');
  assert.strictEqual(bridgeCalls[1].ms, 150);
}

// 5.2 testarNotificacao with AndroidBridge undefined (Browser / fallback mode)
{
  console.log('Teste 5.2: testarNotificacao com AndroidBridge undefined não gera exceção');
  
  const originalBridge = context.window.AndroidBridge;
  context.window.AndroidBridge = undefined;
  delete context.AndroidBridge;
  
  // Should not throw ReferenceError or TypeError
  assert.doesNotThrow(() => {
    context.window.testarNotificacao();
  });

  // Restore bridge
  context.window.AndroidBridge = originalBridge;
  context.AndroidBridge = originalBridge;
}

// 5.3 testarNotificacao with AndroidBridge object missing sendNotification method
{
  console.log('Teste 5.3: testarNotificacao com AndroidBridge sem método sendNotification');
  
  const brokenBridge = { otherMethod: () => {} };
  context.window.AndroidBridge = brokenBridge;
  context.AndroidBridge = brokenBridge;

  assert.doesNotThrow(() => {
    context.window.testarNotificacao();
  });

  // Restore bridge
  context.window.AndroidBridge = mockAndroidBridge;
  context.AndroidBridge = mockAndroidBridge;
}

console.log('\n======================================================');
console.log('✅ TODOS OS TESTES ADVERSARIAIS E STRESS (M2) PASSARAM COM SUCESSO!');
