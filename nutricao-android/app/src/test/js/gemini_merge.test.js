'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dummyEl = {
  onclick: null,
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {} },
  style: {}
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
    addEventListener: () => {}
  },
  window: windowObj,
  self: windowObj,
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  }
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('core/gemini.js');

// Exporta variáveis declaradas com const/let no script
vm.runInContext(`
  globalThis.mergeAnalisys = typeof mergeAnalisys !== 'undefined' ? mergeAnalisys : null;
  globalThis.desvioPct = typeof desvioPct !== 'undefined' ? desvioPct : null;
  globalThis.isRetryableStatus = typeof isRetryableStatus !== 'undefined' ? isRetryableStatus : null;
  globalThis.promptComLegenda = typeof promptComLegenda !== 'undefined' ? promptComLegenda : null;
  globalThis.FOOD_SCHEMA = typeof FOOD_SCHEMA !== 'undefined' ? FOOD_SCHEMA : null;
  globalThis.GEMINI_MODELS = typeof GEMINI_MODELS !== 'undefined' ? GEMINI_MODELS : null;
`, context);

const {
  mergeAnalisys, desvioPct, isRetryableStatus, promptComLegenda,
  FOOD_SCHEMA, GEMINI_MODELS
} = context;

console.log('Executando testes de gemini_merge.test.js...');

// 1. Modelos Suportados e Schema Estruturado
{
  assert(Array.isArray(GEMINI_MODELS) && GEMINI_MODELS.length >= 3, 'Deve conter os 3 modelos de fallback');
  assert.strictEqual(GEMINI_MODELS[0].id, 'gemini-3.7-flash');
  assert.strictEqual(FOOD_SCHEMA.type, 'object');
  assert(FOOD_SCHEMA.required.includes('kcal_total'));
  assert(FOOD_SCHEMA.required.includes('proteina_total'));
}

// 2. Teste de Merge com 3 Análises e Descarte de Outlier
{
  const responsesWithOutlier = [
    {
      nome_refeicao: 'Frango com arroz',
      itens: [{ nome: 'Frango', porcao_g: 150, kcal: 240, proteina_g: 35, carbo_g: 0, gordura_g: 4 }],
      kcal_total: 400,
      proteina_total: 40,
      carbo_total: 45,
      gordura_total: 8,
      confianca: 'alta'
    },
    {
      nome_refeicao: 'Frango com arroz e salada',
      itens: [{ nome: 'Frango', porcao_g: 150, kcal: 250, proteina_g: 36, carbo_g: 0, gordura_g: 5 }],
      kcal_total: 420,
      proteina_total: 42,
      carbo_total: 48,
      gordura_total: 9,
      confianca: 'alta'
    },
    {
      // Resposta aberrante / alucinação
      nome_refeicao: 'Banquete',
      itens: [{ nome: 'Frango', porcao_g: 500, kcal: 1200, proteina_g: 100, carbo_g: 50, gordura_g: 40 }],
      kcal_total: 1200,
      proteina_total: 100,
      carbo_total: 120,
      gordura_total: 40,
      confianca: 'baixa'
    }
  ];

  const merged = mergeAnalisys(responsesWithOutlier);

  // A mediana é 420. 1200 tem distância 780 (> 50% de 420), logo 1200 é descartado.
  // A média resultante para calorias deve ser (400 + 420) / 2 = 410
  assert.strictEqual(merged.kcal_total, 410, 'Outlier de 1200 kcal deve ser descartado da média');
  assert.strictEqual(merged.proteina_total, 41, 'Proteína deve ser média de 40 e 42');
  assert.strictEqual(merged.carbo_total, 47, 'Carboidrato deve ser média de 45 e 48');
  assert.strictEqual(merged.gordura_total, 9, 'Gordura deve ser média de 8 e 9');
  assert.strictEqual(merged.nome_refeicao, 'Frango com arroz');
}

// 3. Teste de Merge com 3 Análises Consistentes (sem outliers)
{
  const normalResponses = [
    { kcal_total: 500, proteina_total: 30, carbo_total: 60, gordura_total: 10, nome_refeicao: 'Prato 1' },
    { kcal_total: 520, proteina_total: 32, carbo_total: 62, gordura_total: 11, nome_refeicao: 'Prato 2' },
    { kcal_total: 540, proteina_total: 34, carbo_total: 64, gordura_total: 12, nome_refeicao: 'Prato 3' }
  ];

  const merged = mergeAnalisys(normalResponses);
  assert.strictEqual(merged.kcal_total, 520, 'Média de 500, 520 e 540 deve ser 520');
  assert.strictEqual(merged.proteina_total, 32);
}

// 4. Teste de Cálculo de Desvio Percentual (desvioPct)
{
  assert.strictEqual(desvioPct([500, 500, 500]), 0, 'Respostas idênticas devem ter 0% de desvio');
  const d = desvioPct([400, 500, 600]);
  assert(d > 0 && d < 30, 'Desvio deve ser proporcional');
}

// 5. Teste de Status HTTP com Retry Automático
{
  assert.strictEqual(isRetryableStatus(429), true, 'Rate limit (429) deve permitir retry');
  assert.strictEqual(isRetryableStatus(500), true, 'Erro de servidor (500) deve permitir retry');
  assert.strictEqual(isRetryableStatus(503), true, 'Serviço indisponível (503) deve permitir retry');
  assert.strictEqual(isRetryableStatus(null), true, 'Timeout sem status deve permitir retry');

  assert.strictEqual(isRetryableStatus(400), false, 'Bad request (400) não deve tentar retry');
  assert.strictEqual(isRetryableStatus(401), false, 'Chave inválida (401) não deve tentar retry');
  assert.strictEqual(isRetryableStatus(403), false, 'Chave sem permissão (403) não deve tentar retry');
  assert.strictEqual(isRetryableStatus(404), false, 'Endpoint não encontrado (404) não deve tentar retry');
}

// 6. Teste de Formatação de Prompt com Legenda
{
  const p1 = promptComLegenda('');
  assert(!p1.includes('Descrição adicional'), 'Sem legenda não deve incluir bloco extra');

  const p2 = promptComLegenda('Shake de banana com leite e aveia');
  assert(p2.includes('Shake de banana com leite e aveia'), 'Deve incluir a legenda do usuário');
}

console.log('gemini_merge.test.js: OK');
