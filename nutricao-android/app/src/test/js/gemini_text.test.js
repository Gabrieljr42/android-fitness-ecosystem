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

const storageMap = new Map();
const localStorageMock = {
  getItem: (k) => storageMap.has(k) ? storageMap.get(k) : null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
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
  localStorage: localStorageMock,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('core/gemini.js');

vm.runInContext(`
  globalThis.FOOD_SCHEMA = typeof FOOD_SCHEMA !== 'undefined' ? FOOD_SCHEMA : null;
  globalThis.TEXT_FOOD_PROMPT = typeof TEXT_FOOD_PROMPT !== 'undefined' ? TEXT_FOOD_PROMPT : null;
  globalThis.GEMINI_MODELS = typeof GEMINI_MODELS !== 'undefined' ? GEMINI_MODELS : null;
  globalThis.apiBodyTexto = typeof apiBodyTexto !== 'undefined' ? apiBodyTexto : null;
  globalThis.isRetryableStatus = typeof isRetryableStatus !== 'undefined' ? isRetryableStatus : null;
`, context);

const { FOOD_SCHEMA, TEXT_FOOD_PROMPT, GEMINI_MODELS, apiBodyTexto, isRetryableStatus } = context;

console.log('Executando testes de gemini_text.test.js...');

// 1. Validação do Schema Estruturado
{
  assert(FOOD_SCHEMA, 'FOOD_SCHEMA deve estar definido');
  assert.strictEqual(FOOD_SCHEMA.type, 'object');
  assert(Array.isArray(FOOD_SCHEMA.required), 'Deve conter lista de required');
  const req = FOOD_SCHEMA.required;
  assert(req.includes('nome_refeicao'), 'Schema deve exigir nome_refeicao');
  assert(req.includes('itens'), 'Schema deve exigir itens');
  assert(req.includes('kcal_total'), 'Schema deve exigir kcal_total');
  assert(req.includes('proteina_total'), 'Schema deve exigir proteina_total');
  assert(req.includes('carbo_total'), 'Schema deve exigir carbo_total');
  assert(req.includes('gordura_total'), 'Schema deve exigir gordura_total');
  assert(req.includes('confianca'), 'Schema deve exigir confianca');
}

// 2. Validação do Prompt de Texto
{
  assert(TEXT_FOOD_PROMPT, 'TEXT_FOOD_PROMPT deve estar definido em core/gemini.js');
  assert(typeof TEXT_FOOD_PROMPT === 'string', 'TEXT_FOOD_PROMPT deve ser string');
  assert(TEXT_FOOD_PROMPT.includes('JSON'), 'Prompt de texto deve exigir JSON');
  assert(TEXT_FOOD_PROMPT.includes('refeição') || TEXT_FOOD_PROMPT.includes('alimento') || TEXT_FOOD_PROMPT.includes('nutricional'), 'Prompt deve orientar sobre conteudo nutricional');
  assert(TEXT_FOOD_PROMPT.includes('gramas') || TEXT_FOOD_PROMPT.includes('porções'), 'Prompt deve orientar sobre estimativa de porções');
}

// 3. Validação do Payload Builder de Texto (apiBodyTexto)
{
  assert(typeof apiBodyTexto === 'function', 'apiBodyTexto deve ser uma função');
  const model = GEMINI_MODELS[0];
  const userText = '2 ovos mexidos com 1 fatia de pão integral e 1 xícara de café com leite';
  const body = apiBodyTexto(userText, model);

  assert(body.contents && body.contents.length > 0, 'Deve conter contents');
  assert(body.contents[0].parts && body.contents[0].parts.length > 0, 'Deve conter parts');
  const partText = body.contents[0].parts[0].text;
  assert(typeof partText === 'string' && partText.includes(userText), 'Texto do usuário deve estar presente na mensagem enviada');
  assert(partText.includes(TEXT_FOOD_PROMPT), 'Prompt base deve estar anexado ao corpo');
  assert.strictEqual(body.generationConfig.responseMimeType, 'application/json');
  assert.strictEqual(body.generationConfig.responseSchema, FOOD_SCHEMA);
  assert.strictEqual(body.contents[0].parts[0].inline_data, undefined, 'Requisição de texto não deve incluir dados de imagem binários');
}

// 4. Teste de Sanitização e Parsing de JSON com Code-Blocks Markdown
{
  const rawModelResponse = "```json\n{\n  \"nome_refeicao\": \"Café da manhã\",\n  \"itens\": [\n    {\"nome\": \"Ovo mexido\", \"porcao_g\": 100, \"kcal\": 150, \"proteina_g\": 13, \"carbo_g\": 1, \"gordura_g\": 10},\n    {\"nome\": \"Pão integral\", \"porcao_g\": 50, \"kcal\": 120, \"proteina_g\": 4, \"carbo_g\": 22, \"gordura_g\": 1.5}\n  ],\n  \"kcal_total\": 270,\n  \"proteina_total\": 17,\n  \"carbo_total\": 23,\n  \"gordura_total\": 11.5,\n  \"confianca\": \"alta\"\n}\n```";

  const cleaned = rawModelResponse.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(cleaned);

  assert.strictEqual(parsed.nome_refeicao, 'Café da manhã');
  assert.strictEqual(parsed.itens.length, 2);
  assert.strictEqual(parsed.kcal_total, 270);
  assert.strictEqual(parsed.proteina_total, 17);
  assert.strictEqual(parsed.carbo_total, 23);
  assert.strictEqual(parsed.gordura_total, 11.5);
  assert.strictEqual(parsed.confianca, 'alta');
}

// 5. Validação da Hierarquia de Modelos e Fallbacks
{
  assert(Array.isArray(GEMINI_MODELS) && GEMINI_MODELS.length >= 3, 'Deve haver ao menos 3 modelos para fallback');
assert.strictEqual(GEMINI_MODELS[0].id, 'gemini-3.7-flash');
assert.strictEqual(GEMINI_MODELS[1].id, 'gemini-3.6-flash');
assert.strictEqual(GEMINI_MODELS[2].id, 'gemini-3.5-flash');
}

// 6. Teste de Tratamento de Erros e Retentativas
{
  assert.strictEqual(isRetryableStatus(429), true, '429 Rate Limit deve ser retentável');
  assert.strictEqual(isRetryableStatus(500), true, '500 Server Error deve ser retentável');
  assert.strictEqual(isRetryableStatus(503), true, '503 Service Unavailable deve ser retentável');
  assert.strictEqual(isRetryableStatus(400), false, '400 Bad Request não deve ser retentável');
  assert.strictEqual(isRetryableStatus(401), false, '401 Unauthorized não deve ser retentável');
}

console.log('gemini_text.test.js: OK');
