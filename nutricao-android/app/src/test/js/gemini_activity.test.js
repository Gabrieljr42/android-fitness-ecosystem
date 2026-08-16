'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dummyEl = {
  onclick: null,
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {} },
  style: {},
  value: '',
  textContent: '',
  innerHTML: ''
};

const windowObj = {
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
  isFinite: isFinite,
  isNaN: isNaN,
  String: String,
  Array: Array,
  Object: Object,
  Number: Number,
  document: {
    getElementById: () => dummyEl,
    querySelector: () => dummyEl,
    querySelectorAll: () => [],
    createElement: () => dummyEl,
    addEventListener: () => {}
  },
  window: windowObj,
  self: windowObj,
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  fetch: null
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('core/gemini.js');

vm.runInContext(`
  globalThis.ACTIVITY_SCHEMA = typeof ACTIVITY_SCHEMA !== 'undefined' ? ACTIVITY_SCHEMA : null;
  globalThis.ACTIVITY_PROMPT = typeof ACTIVITY_PROMPT !== 'undefined' ? ACTIVITY_PROMPT : null;
  globalThis.apiBodyAtividade = typeof apiBodyAtividade !== 'undefined' ? apiBodyAtividade : null;
  globalThis.consultarModeloAtividade = typeof consultarModeloAtividade !== 'undefined' ? consultarModeloAtividade : null;
  globalThis.mergeActivityAnalisys = typeof mergeActivityAnalisys !== 'undefined' ? mergeActivityAnalisys : null;
  globalThis.GEMINI_MODELS = typeof GEMINI_MODELS !== 'undefined' ? GEMINI_MODELS : null;
  globalThis.isRetryableStatus = typeof isRetryableStatus !== 'undefined' ? isRetryableStatus : null;
`, context);

const {
  ACTIVITY_SCHEMA, ACTIVITY_PROMPT, apiBodyAtividade,
  consultarModeloAtividade, mergeActivityAnalisys, GEMINI_MODELS, isRetryableStatus
} = context;

console.log('=== [NUTRITRACK] Executando Suíte: gemini_activity.test.js ===\n');

// 1. Schema Estruturado ACTIVITY_SCHEMA e Prompt
{
  console.log('Test 1: Validação do Schema ACTIVITY_SCHEMA e Prompt ACTIVITY_PROMPT');
  assert(ACTIVITY_SCHEMA, 'ACTIVITY_SCHEMA deve estar definido');
  assert.strictEqual(ACTIVITY_SCHEMA.type, 'object');
  assert(ACTIVITY_SCHEMA.required.includes('nome_atividade'));
  assert(ACTIVITY_SCHEMA.required.includes('duracao_minutos_total'));
  assert(ACTIVITY_SCHEMA.required.includes('intensidade'));
  assert(ACTIVITY_SCHEMA.required.includes('met_medio'));
  assert(ACTIVITY_SCHEMA.required.includes('kcal_gasto_total'));
  assert(ACTIVITY_SCHEMA.required.includes('confianca'));

  assert(ACTIVITY_PROMPT.includes('MET'), 'Prompt deve instruir cálculo por METs');
  assert(ACTIVITY_PROMPT.includes('Gasto (kcal) = MET'), 'Prompt deve especificar a fórmula obrigatória');
}

// 2. Injeção de Dados Biométricos em apiBodyAtividade
{
  console.log('Test 2: Geração do Payload apiBodyAtividade com injeção biométrica');
  const model = GEMINI_MODELS[0];

  const customProfile = { peso: 82.5, altura: 182, idade: 27, sexo: 'm' };
  const text = 'Corri 30 minutos a 10 km/h';
  const body = apiBodyAtividade(text, model, customProfile);

  const payloadText = body.contents[0].parts[0].text;
  assert(payloadText.includes('Peso: 82.5 kg'), 'Peso do usuário deve ser injetado');
  assert(payloadText.includes('Altura: 182 cm'), 'Altura deve ser injetada');
  assert(payloadText.includes('Idade: 27 anos'), 'Idade deve ser injetada');
  assert(payloadText.includes('Sexo: Masculino'), 'Sexo deve ser injetado');
  assert(payloadText.includes('Corri 30 minutos a 10 km/h'), 'Descrição deve estar presente');

  assert.strictEqual(body.generationConfig.responseMimeType, 'application/json');
  assert.strictEqual(body.generationConfig.responseSchema, ACTIVITY_SCHEMA);
}

// 3. Sanitização e Limites de Texto em apiBodyAtividade
{
  console.log('Test 3: Sanitização de inputs extremos em apiBodyAtividade');
  const model = GEMINI_MODELS[0];

  // Entrada nula/indefinida
  const bodyNull = apiBodyAtividade(null, model, null);
  assert(bodyNull.contents[0].parts[0].text.includes('Peso: 75 kg'), 'Fallback para defaults quando profile ausente');

  // Entrada com mais de 1000 caracteres
  const longText = 'Caminhei no parque '.repeat(200); // ~3800 caracteres
  const bodyLong = apiBodyAtividade(longText, model, { peso: 70 });
  const contentText = bodyLong.contents[0].parts[0].text;
  assert(contentText.length < 2500, 'Texto da descrição deve ser truncado a 1000 chars');
}

// 4. Merge e Consenso com Descarte de Outliers em mergeActivityAnalisys
{
  console.log('Test 4: mergeActivityAnalisys com filtragem de outliers');

  const responsesWithOutlier = [
    {
      nome_atividade: 'Corrida na esteira',
      duracao_minutos_total: 30,
      intensidade: 'intensa',
      met_medio: 9.0,
      kcal_gasto_total: 315,
      segmentos: [{ descricao: 'Corrida 10 km/h', duracao_minutos: 30, met: 9.0, kcal_gasto: 315 }],
      confianca: 'alta'
    },
    {
      nome_atividade: 'Corrida esteira',
      duracao_minutos_total: 30,
      intensidade: 'intensa',
      met_medio: 9.2,
      kcal_gasto_total: 322,
      segmentos: [{ descricao: 'Corrida 10 km/h', duracao_minutos: 30, met: 9.2, kcal_gasto: 322 }],
      confianca: 'alta'
    },
    {
      // Outlier alucinado (2500 kcal para 30 min de corrida!)
      nome_atividade: 'Super Corrida',
      duracao_minutos_total: 30,
      intensidade: 'muito_intensa',
      met_medio: 70.0,
      kcal_gasto_total: 2500,
      segmentos: [],
      confianca: 'baixa'
    }
  ];

  const merged = mergeActivityAnalisys(responsesWithOutlier);

  // A mediana de [315, 322, 2500] é 322. A distância de 2500 é 2178 (> 50% de 322).
  // 2500 é descartado e a média deve ser (315 + 322) / 2 = 318.5 -> 319
  assert.strictEqual(merged.kcal_gasto_total, 319, 'Outlier de 2500 kcal deve ser descartado');
  assert.strictEqual(merged.duracao_minutos_total, 30);
  assert.strictEqual(merged.met_medio, 9.1, 'Média de MET 9.0 e 9.2 deve ser 9.1');
  assert.strictEqual(merged.nome_atividade, 'Corrida na esteira');
  assert.strictEqual(merged.segmentos.length, 1);
}

// 5. Execução de consultarModeloAtividade com simulação de rede
(async () => {
  console.log('Test 5: consultarModeloAtividade com simulação de retentativa 429 e fallback');
  const model = GEMINI_MODELS[0];

  // Simula 429 na 1ª tentativa
  let callCount = 0;
  context.fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: 'Quota exceeded', code: 429 } })
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                nome_atividade: 'Natação Crawl',
                duracao_minutos_total: 45,
                intensidade: 'intensa',
                met_medio: 8.0,
                kcal_gasto_total: 450,
                segmentos: [{ descricao: 'Nado moderado/intenso', duracao_minutos: 45, met: 8.0, kcal_gasto: 450 }],
                explicacao_calculo: '8.0 MET * 75kg * 0.75h = 450 kcal',
                confianca: 'alta'
              })
            }]
          }
        }]
      })
    };
  };

  const trace1 = await consultarModeloAtividade(model, 'Natação 45 min', 0, 1, 'KEY');
  assert.strictEqual(trace1.ok, false);
  assert.strictEqual(trace1.status, 429);
  assert.strictEqual(trace1.retryable, true);

  const trace2 = await consultarModeloAtividade(model, 'Natação 45 min', 0, 2, 'KEY');
  assert.strictEqual(trace2.ok, true);
  assert.strictEqual(trace2.result.nome_atividade, 'Natação Crawl');
  assert.strictEqual(trace2.result.kcal_gasto_total, 450);

  // Cancelamento do usuário
  const runCancel = { cancelled: true };
  const traceCancel = await consultarModeloAtividade(model, 'Corrida', 0, 1, 'KEY', runCancel);
  assert.strictEqual(traceCancel.cancelled, true);
  assert.strictEqual(traceCancel.ok, false);

  console.log('\n======================================================');
  console.log('gemini_activity.test.js: OK (Todos os testes passaram com sucesso!)');
})();
