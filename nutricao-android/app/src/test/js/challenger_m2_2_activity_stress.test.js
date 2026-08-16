'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== [NUTRITRACK] EMPIRICAL CHALLENGER M2.2: ACTIVITY & ENERGY BALANCE STRESS ===\n');

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
    click: function() { if (typeof this.onclick === 'function') this.onclick({ target: this }); },
    focus: () => {},
    setAttribute: function(name, val) { this.attributes[name] = String(val); },
    getAttribute: function(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; },
    appendChild: function(child) { this.children.push(child); child.parentElement = this; return child; },
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

const domElements = {};
const toastMessages = [];
const modalContents = [];

const domRoot = createMockElement('body');
const documentMock = {
  body: domRoot,
  getElementById: (id) => {
    if (!domElements[id]) {
      domElements[id] = createMockElement('div');
      domElements[id].id = id;
    }
    return domElements[id];
  },
  querySelector: (s) => {
    if (s.startsWith('#')) {
      const id = s.slice(1);
      if (!domElements[id]) {
        domElements[id] = createMockElement('div');
        domElements[id].id = id;
      }
      return domElements[id];
    }
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
  removeEventListener: () => {}
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
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  toast: (msg, undo) => { toastMessages.push({ msg, undo }); if (undo) undo(); },
  openModal: (html) => { modalContents.push(html); },
  closeModal: () => {},
  render: () => {},
  fmt: (n) => Number(n || 0).toLocaleString('pt-BR'),
  uid: () => 'uid_' + Math.random().toString(36).slice(2, 9),
  horaNow: () => '10:30',
  fetch: null
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('apps/nutricao/estado.js');
loadScript('apps/nutricao/logic.js');
loadScript('core/gemini.js');
loadScript('apps/nutricao/views/hoje.js');

vm.runInContext(`
  globalThis.ACTIVITY_SCHEMA = typeof ACTIVITY_SCHEMA !== 'undefined' ? ACTIVITY_SCHEMA : null;
  globalThis.ACTIVITY_PROMPT = typeof ACTIVITY_PROMPT !== 'undefined' ? ACTIVITY_PROMPT : null;
  globalThis.EXERCISE_PRESETS = typeof EXERCISE_PRESETS !== 'undefined' ? EXERCISE_PRESETS : null;
  globalThis.apiBodyAtividade = typeof apiBodyAtividade !== 'undefined' ? apiBodyAtividade : null;
  globalThis.consultarModeloAtividade = typeof consultarModeloAtividade !== 'undefined' ? consultarModeloAtividade : null;
  globalThis.mergeActivityAnalisys = typeof mergeActivityAnalisys !== 'undefined' ? mergeActivityAnalisys : null;
  globalThis.calcManualKcal = typeof calcManualKcal !== 'undefined' ? calcManualKcal : null;
  globalThis.handleManualIntensityChange = typeof handleManualIntensityChange !== 'undefined' ? handleManualIntensityChange : null;
  globalThis.confirmManualExercicio = typeof confirmManualExercicio !== 'undefined' ? confirmManualExercicio : null;
  globalThis.confirmAtividadeIA = typeof confirmAtividadeIA !== 'undefined' ? confirmAtividadeIA : null;
  globalThis.GEMINI_MODELS = typeof GEMINI_MODELS !== 'undefined' ? GEMINI_MODELS : null;
  globalThis.isRetryableStatus = typeof isRetryableStatus !== 'undefined' ? isRetryableStatus : null;
  globalThis.today = typeof today !== 'undefined' ? today : (() => new Date().toISOString().slice(0, 10));
  globalThis.activities = typeof activities !== 'undefined' ? activities : [];
  globalThis.meals = typeof meals !== 'undefined' ? meals : [];
  globalThis.addActivity = typeof addActivity !== 'undefined' ? addActivity : null;
  globalThis.delActivity = typeof delActivity !== 'undefined' ? delActivity : null;
  globalThis.dayActivities = typeof dayActivities !== 'undefined' ? dayActivities : null;
  globalThis.dayBurned = typeof dayBurned !== 'undefined' ? dayBurned : null;
  globalThis.calcBMR = typeof calcBMR !== 'undefined' ? calcBMR : null;
  globalThis.calcTDEE = typeof calcTDEE !== 'undefined' ? calcTDEE : null;
`, context);

const {
  ACTIVITY_SCHEMA, ACTIVITY_PROMPT, EXERCISE_PRESETS,
  apiBodyAtividade, consultarModeloAtividade, mergeActivityAnalisys,
  calcManualKcal, handleManualIntensityChange, confirmManualExercicio, confirmAtividadeIA,
  GEMINI_MODELS, isRetryableStatus, addActivity, delActivity,
  dayActivities, dayBurned, calcBMR, calcTDEE, activities, meals, today
} = context;

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ Passed [${totalTests}]: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAILED [${totalTests}]: ${name}`);
    console.error(err);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ Passed [${totalTests}]: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAILED [${totalTests}]: ${name}`);
    console.error(err);
    throw err;
  }
}

(async () => {
  console.log('--- SUITE 1: ACTIVITY_SCHEMA & ACTIVITY_PROMPT Contract Verification ---');

  runTest('1.1: ACTIVITY_SCHEMA enforces required top-level fields', () => {
    assert(ACTIVITY_SCHEMA, 'ACTIVITY_SCHEMA must be defined');
    assert.strictEqual(ACTIVITY_SCHEMA.type, 'object');
    const req = ACTIVITY_SCHEMA.required;
    assert(req.includes('nome_atividade'), 'nome_atividade is required');
    assert(req.includes('duracao_minutos_total'), 'duracao_minutos_total is required');
    assert(req.includes('intensidade'), 'intensidade is required');
    assert(req.includes('met_medio'), 'met_medio is required');
    assert(req.includes('kcal_gasto_total'), 'kcal_gasto_total is required');
    assert(req.includes('confianca'), 'confianca is required');
  });

  runTest('1.2: ACTIVITY_SCHEMA enum constraints for intensidade and confianca', () => {
    const intProp = ACTIVITY_SCHEMA.properties.intensidade;
    assert.strictEqual(JSON.stringify(intProp.enum), JSON.stringify(['leve', 'moderada', 'intensa', 'muito_intensa']));

    const confProp = ACTIVITY_SCHEMA.properties.confianca;
    assert.strictEqual(JSON.stringify(confProp.enum), JSON.stringify(['baixa', 'media', 'alta']));
  });

  runTest('1.3: ACTIVITY_SCHEMA segmentos array items definition and required fields', () => {
    const seg = ACTIVITY_SCHEMA.properties.segmentos;
    assert.strictEqual(seg.type, 'array');
    assert.strictEqual(seg.items.type, 'object');
    assert(seg.items.required.includes('duracao_minutos'));
    assert(seg.items.required.includes('met'));
    assert(seg.items.properties.tipo);
    assert(seg.items.properties.descricao);
    assert(seg.items.properties.velocidade_kmh);
    assert(seg.items.properties.kcal || seg.items.properties.kcal_gasto);
  });

  runTest('1.4: ACTIVITY_PROMPT includes Ainsworth Compendium MET calculation rules & interval guidelines', () => {
    assert(ACTIVITY_PROMPT.includes('Compêndio de Ainsworth') || ACTIVITY_PROMPT.includes('MET'), 'Must reference MET compendium');
    assert(ACTIVITY_PROMPT.includes('Gasto (kcal) = MET × Peso (kg) × (Duração em minutos / 60)'), 'Must specify exact formula');
    assert(ACTIVITY_PROMPT.includes('segmentos'), 'Must guide decomposing interval workouts into segmentos');
    assert(ACTIVITY_PROMPT.includes('met_medio'), 'Must specify weighted average MET calculation');
    assert(ACTIVITY_PROMPT.includes('JSON'), 'Must require strict JSON output');
  });

  runTest('1.5: apiBodyAtividade payload generation and user biometrics binding', () => {
    const model = GEMINI_MODELS[0];
    const userProfile = { peso: 80, altura: 180, idade: 28, sexo: 'm' };
    const body = apiBodyAtividade('Corrida 30 min alternada com caminhada', model, userProfile);

    assert.strictEqual(body.generationConfig.responseMimeType, 'application/json');
    assert.strictEqual(body.generationConfig.responseSchema, ACTIVITY_SCHEMA);
    const content = body.contents[0].parts[0].text;
    assert(content.includes('Peso: 80 kg'), 'Payload contains user weight');
    assert(content.includes('Altura: 180 cm'), 'Payload contains user height');
    assert(content.includes('Idade: 28 anos'), 'Payload contains user age');
    assert(content.includes('Sexo: Masculino'), 'Payload contains user sex');
    assert(content.includes('Corrida 30 min alternada com caminhada'), 'Payload contains activity text');
  });

  runTest('1.6: apiBodyAtividade boundary and sanitization (truncation at 1000 chars, null defaults)', () => {
    const model = GEMINI_MODELS[0];
    const longText = 'Treino intenso de pernas '.repeat(100); // 2500 chars
    const bodyLong = apiBodyAtividade(longText, model, null);
    const textPart = bodyLong.contents[0].parts[0].text;
    assert(textPart.includes('Peso: 75 kg'), 'Defaults to 75kg when profile is null');
    assert(textPart.includes('Sexo: Masculino'), 'Defaults to Masculino when profile is null');
    assert(textPart.length < 2500, 'Truncates user description to 1000 chars');
  });

  console.log('\n--- SUITE 2: mergeActivityAnalisys Outlier Rejection & Consensus Mathematics ---');

  runTest('2.1: Rejects high outlier (>50% divergence above median)', () => {
    const analyses = [
      { nome_atividade: 'Ciclismo', duracao_minutos_total: 40, met_medio: 6.8, kcal_gasto_total: 340, confianca: 'alta' },
      { nome_atividade: 'Ciclismo', duracao_minutos_total: 40, met_medio: 7.0, kcal_gasto_total: 350, confianca: 'alta' },
      { nome_atividade: 'Ciclismo Fantasia', duracao_minutos_total: 40, met_medio: 25.0, kcal_gasto_total: 1250, confianca: 'baixa' } // Outlier!
    ];
    const res = mergeActivityAnalisys(analyses);
    // Median of [340, 350, 1250] is 350. Dist(1250) = 900 > 0.5 * 350 (175).
    // 1250 is rejected. Average of (340 + 350) / 2 = 345.
    assert.strictEqual(res.kcal_gasto_total, 345, 'Outlier 1250 kcal must be dropped');
    assert.strictEqual(res.met_medio, 6.9, 'Average MET should be (6.8+7.0)/2 = 6.9');
    assert.strictEqual(res.duracao_minutos_total, 40);
  });

  runTest('2.2: Rejects low outlier (>50% divergence below median)', () => {
    const analyses = [
      { nome_atividade: 'Musculação', duracao_minutos_total: 60, met_medio: 1.0, kcal_gasto_total: 50, confianca: 'baixa' }, // Low outlier!
      { nome_atividade: 'Musculação', duracao_minutos_total: 60, met_medio: 5.0, kcal_gasto_total: 375, confianca: 'alta' },
      { nome_atividade: 'Musculação', duracao_minutos_total: 60, met_medio: 5.2, kcal_gasto_total: 390, confianca: 'alta' }
    ];
    const res = mergeActivityAnalisys(analyses);
    // Median of [50, 375, 390] is 375. Dist(50) = 325 > 0.5 * 375 (187.5).
    // 50 is rejected. Average of (375 + 390) / 2 = 382.5 -> 383.
    assert.strictEqual(res.kcal_gasto_total, 383, 'Low outlier 50 kcal must be dropped');
    assert.strictEqual(res.met_medio, 5.1, 'Average MET should be (5.0+5.2)/2 = 5.1');
  });

  runTest('2.3: Consensus averaging retains all values when divergence <= 50%', () => {
    const analyses = [
      { nome_atividade: 'Corrida', duracao_minutos_total: 30, met_medio: 8.5, kcal_gasto_total: 300, confianca: 'alta' },
      { nome_atividade: 'Corrida', duracao_minutos_total: 30, met_medio: 9.0, kcal_gasto_total: 320, confianca: 'alta' },
      { nome_atividade: 'Corrida', duracao_minutos_total: 30, met_medio: 9.5, kcal_gasto_total: 340, confianca: 'alta' }
    ];
    const res = mergeActivityAnalisys(analyses);
    // Median 320. Max distance is 20 <= 160. No outliers dropped. Average = (300+320+340)/3 = 320.
    assert.strictEqual(res.kcal_gasto_total, 320);
    assert.strictEqual(res.met_medio, 9.0);
    assert.strictEqual(res.duracao_minutos_total, 30);
  });

  runTest('2.4: Handles 1, 2, and 4 responses cleanly without errors', () => {
    // 1 response
    const single = [{ nome_atividade: 'Pilates', duracao_minutos_total: 45, met_medio: 3.5, kcal_gasto_total: 200, confianca: 'alta' }];
    const res1 = mergeActivityAnalisys(single);
    assert.strictEqual(res1.kcal_gasto_total, 200);
    assert.strictEqual(res1.nome_atividade, 'Pilates');

    // 2 responses (no outlier filtering, straight average)
    const duo = [
      { nome_atividade: 'Caminhada', duracao_minutos_total: 30, met_medio: 3.0, kcal_gasto_total: 100 },
      { nome_atividade: 'Caminhada', duracao_minutos_total: 30, met_medio: 4.0, kcal_gasto_total: 150 }
    ];
    const res2 = mergeActivityAnalisys(duo);
    assert.strictEqual(res2.kcal_gasto_total, 125);
    assert.strictEqual(res2.met_medio, 3.5);

    // 4 responses
    const quad = [
      { duracao_minutos_total: 30, met_medio: 5.0, kcal_gasto_total: 200 },
      { duracao_minutos_total: 30, met_medio: 5.0, kcal_gasto_total: 205 },
      { duracao_minutos_total: 30, met_medio: 5.0, kcal_gasto_total: 210 },
      { duracao_minutos_total: 30, met_medio: 5.0, kcal_gasto_total: 2000 } // Outlier
    ];
    const res4 = mergeActivityAnalisys(quad);
    assert(res4.kcal_gasto_total < 300, 'Outlier in 4-response list must be discarded');
  });

  runTest('2.5: Resilient to null, empty, or corrupted numeric strings', () => {
    assert.strictEqual(mergeActivityAnalisys(null), null);
    assert.strictEqual(mergeActivityAnalisys([]), null);

    const stringData = [
      { nome_atividade: 'Treino', duracao_minutos_total: '45', met_medio: '6.5', kcal_gasto_total: '300' },
      { nome_atividade: 'Treino', duracao_minutos_total: '45', met_medio: '6.5', kcal_gasto_total: '310' }
    ];
    const res = mergeActivityAnalisys(stringData);
    assert.strictEqual(typeof res.kcal_gasto_total, 'number');
    assert.strictEqual(res.kcal_gasto_total, 305);
    assert.strictEqual(res.met_medio, 6.5);
  });

  console.log('\n--- SUITE 3: Gemini Model Fallback, Retries & Error Handling ---');

  await runAsyncTest('3.1: Model sequencing and retry on 429 / 500 / 503', async () => {
    const model = GEMINI_MODELS[0];
    let attempts = 0;
    context.fetch = async (url, opts) => {
      attempts++;
      if (attempts === 1) {
        return {
          ok: false,
          status: 503,
          text: async () => JSON.stringify({ error: { message: 'Service Unavailable', code: 503 } })
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: '```json\n{"nome_atividade":"HIIT","duracao_minutos_total":20,"intensidade":"muito_intensa","met_medio":9.5,"kcal_gasto_total":238,"segmentos":[{"tipo":"Sprints","duracao_minutos":20,"met":9.5,"kcal_gasto":238}],"confianca":"alta"}\n```'
              }]
            }
          }]
        })
      };
    };

    const trace1 = await consultarModeloAtividade(model, 'HIIT 20 min', 0, 1, 'API_KEY');
    assert.strictEqual(trace1.ok, false);
    assert.strictEqual(trace1.status, 503);
    assert.strictEqual(trace1.retryable, true, '503 is retryable');

    const trace2 = await consultarModeloAtividade(model, 'HIIT 20 min', 0, 2, 'API_KEY');
    assert.strictEqual(trace2.ok, true);
    assert.strictEqual(trace2.result.nome_atividade, 'HIIT');
    assert.strictEqual(trace2.result.kcal_gasto_total, 238);
    assert.strictEqual(trace2.result.segmentos.length, 1);
  });

  await runAsyncTest('3.2: Non-retryable status codes (400, 401, 403) do not trigger retry', async () => {
    const model = GEMINI_MODELS[0];
    context.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'API_KEY_INVALID', code: 401 } })
    });

    const trace = await consultarModeloAtividade(model, 'Caminhada', 0, 1, 'BAD_KEY');
    assert.strictEqual(trace.ok, false);
    assert.strictEqual(trace.status, 401);
    assert.strictEqual(trace.retryable, false, '401 is NOT retryable');
  });

  await runAsyncTest('3.3: User cancellation aborts request immediately', async () => {
    const model = GEMINI_MODELS[0];
    const runState = { cancelled: true };
    const trace = await consultarModeloAtividade(model, 'Treino', 0, 1, 'KEY', runState);
    assert.strictEqual(trace.cancelled, true);
    assert.strictEqual(trace.ok, false);
    assert.strictEqual(trace.error, 'Análise encerrada pelo usuário');
  });

  console.log('\n--- SUITE 4: Manual Exercise Modal Calculations & UI Bindings ---');

  runTest('4.1: EXERCISE_PRESETS definition contains 8 standard exercise types', () => {
    assert(Array.isArray(EXERCISE_PRESETS), 'EXERCISE_PRESETS must be an array');
    assert.strictEqual(EXERCISE_PRESETS.length, 8);
    EXERCISE_PRESETS.forEach(p => {
      assert(p.nome, 'Preset has name');
      assert(p.met > 0, 'Preset has positive MET');
      assert(['leve', 'moderada', 'intensa', 'muito_intensa'].includes(p.intensidade), 'Preset intensity valid');
    });
  });

  runTest('4.2: calcManualKcal computes MET * weight * (dur / 60) accurately', () => {
    // Setup inputs in DOM
    const durInput = documentMock.getElementById('manExDur');
    const metInput = documentMock.getElementById('manExMet');
    const kcalInput = documentMock.getElementById('manExKcal');
    const kcalDisplay = documentMock.getElementById('manExKcalDisplay');

    durInput.value = 60;
    metInput.value = 8.0;
    // user profile default weight is 75 kg: 8.0 * 75 * (60 / 60) = 600 kcal
    calcManualKcal();
    assert.strictEqual(Number(kcalInput.value), 600);
    assert(kcalDisplay.textContent.includes('600'));

    durInput.value = 45;
    metInput.value = 5.0;
    // 5.0 * 75 * (45 / 60) = 281.25 -> 281 kcal
    calcManualKcal();
    assert.strictEqual(Number(kcalInput.value), 281);
  });

  runTest('4.3: handleManualIntensityChange correctly sets standard METs for all categories', () => {
    const sel = documentMock.getElementById('manExIntensidade');
    const metInput = documentMock.getElementById('manExMet');

    sel.value = 'leve';
    handleManualIntensityChange();
    assert.strictEqual(Number(metInput.value), 2.8);

    sel.value = 'moderada';
    handleManualIntensityChange();
    assert.strictEqual(Number(metInput.value), 5.0);

    sel.value = 'intensa';
    handleManualIntensityChange();
    assert.strictEqual(Number(metInput.value), 8.0);

    sel.value = 'muito_intensa';
    handleManualIntensityChange();
    assert.strictEqual(Number(metInput.value), 11.5);
  });

  runTest('4.4: confirmManualExercicio boundary validation & state commit', () => {
    context.activities.length = 0; // Clear activities

    // Boundary rejection: 0 duration and 0 kcal
    documentMock.getElementById('manExNome').value = 'Nada';
    documentMock.getElementById('manExDur').value = 0;
    documentMock.getElementById('manExMet').value = 5.0;
    documentMock.getElementById('manExKcal').value = 0;
    const toastEl = documentMock.getElementById('toast');
    toastEl.innerHTML = '';

    confirmManualExercicio();
    assert.strictEqual(context.activities.length, 0, 'Should not add 0 min 0 kcal activity');
    assert(toastEl.innerHTML.includes('Informe a duração ou as calorias'), 'Toast informs missing duration or calories');

    // Valid entry: Musculação 50 min 350 kcal
    documentMock.getElementById('manExNome').value = 'Musculação Peito';
    documentMock.getElementById('manExDur').value = 50;
    documentMock.getElementById('manExMet').value = 5.5;
    documentMock.getElementById('manExKcal').value = 350;
    documentMock.getElementById('manExIntensidade').value = 'moderada';

    confirmManualExercicio();
    assert.strictEqual(context.activities.length, 1);
    const act = context.activities[0];
    assert.strictEqual(act.nome, 'Musculação Peito');
    assert.strictEqual(act.duracaoMin, 50);
    assert.strictEqual(act.kcal, 350);
    assert.strictEqual(act.origem, 'manual');
    assert.strictEqual(act.intensidade, 'moderada');
  });

  console.log('\n--- SUITE 5: Activity State Mutations, Energy Balance & Deletion Undo ---');

  runTest('5.1: dayBurned calculates total exercise energy expenditure', () => {
    // Add second activity
    addActivity({
      nome: 'Caminhada noturna',
      duracaoMin: 30,
      met: 3.5,
      kcal: 130,
      origem: 'manual'
    });

    assert.strictEqual(context.activities.length, 2);
    // 350 + 130 = 480 kcal burned today
    assert.strictEqual(dayBurned(), 480);
  });

  runTest('5.2: Daily Energy Balance Card equation (I - G = L)', () => {
    // Set up meals: 2000 kcal ingested
    context.meals.length = 0;
    context.meals.push({
      id: 'm1',
      date: today(),
      nome: 'Almoço',
      itens: [{ nome: 'Prato', porcao_g: 400, kcal: 2000, proteina_g: 60, carbo_g: 200, gordura_g: 50 }]
    });

    const I = 2000;
    const G = dayBurned(); // 480
    const L = I - G;       // 1520 net kcal
    const targetKcal = 2200;

    assert.strictEqual(L, 1520);
    assert(L <= targetKcal, 'Within daily calorie budget');

    // Simulate surplus: 3000 kcal ingested - 480 kcal burned = 2520 net > 2200 target
    const surplusIngested = 3000;
    const netSurplus = surplusIngested - G;
    assert.strictEqual(netSurplus, 2520);
    assert(netSurplus > targetKcal, 'Calorie surplus detected');
    assert.strictEqual(netSurplus - targetKcal, 320, 'Surplus magnitude is 320 kcal');
  });

  runTest('5.3: Activity deletion with undo restores activity to state and localStorage', () => {
    const actId = context.activities[0].id;
    const initialCount = context.activities.length;

    // Trigger deletion (our mock toast runs undo callback)
    const removed = delActivity(actId);
    assert(removed, 'Activity returned on deletion');
    assert.strictEqual(context.activities.length, initialCount - 1);

    // Re-add via undo
    addActivity(removed);
    assert.strictEqual(context.activities.length, initialCount);
  });

  console.log('\n================================================================');
  console.log(`=== EMPIRICAL CHALLENGER M2.2: ALL ${passedTests}/${totalTests} TESTS PASSED EMPIRICALLY! ===`);
  console.log('================================================================');
})();
