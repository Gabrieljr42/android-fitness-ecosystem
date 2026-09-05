'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const baseDir = path.resolve(__dirname, '../../main/assets');
const windowObj = { addEventListener() {}, removeEventListener() {} };
const context = {
  console,
  Date,
  Math,
  JSON,
  parseFloat,
  parseInt,
  isFinite,
  isNaN,
  String,
  Array,
  Object,
  Number,
  Boolean,
  document: {
    body: { contains: () => true, appendChild() {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, click() {} }),
    addEventListener() {}
  },
  window: windowObj,
  self: windowObj,
  localStorage: { getItem: () => null, setItem() {} },
  setTimeout,
  clearTimeout,
  fetch: null
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(baseDir, 'core/gemini.js'), 'utf8'), context);
vm.runInContext(`
  globalThis.DAILY_FOOD_SCHEMA = DAILY_FOOD_SCHEMA;
  globalThis.DAILY_FOOD_PROMPT = DAILY_FOOD_PROMPT;
  globalThis.apiBodyResumoDia = apiBodyResumoDia;
  globalThis.mergeResumoDiaAnalisys = mergeResumoDiaAnalisys;
  globalThis.consultarModeloResumoDia = consultarModeloResumoDia;
  globalThis.GEMINI_MODELS = GEMINI_MODELS;
`, context);

const {
  DAILY_FOOD_SCHEMA,
  DAILY_FOOD_PROMPT,
  apiBodyResumoDia,
  mergeResumoDiaAnalisys,
  consultarModeloResumoDia,
  GEMINI_MODELS
} = context;

console.log('Executando testes de gemini_daily_summary.test.js...');

assert(DAILY_FOOD_SCHEMA, 'schema diário deve existir');
assert(DAILY_FOOD_SCHEMA.required.includes('refeicoes'), 'schema deve exigir refeições');
assert(DAILY_FOOD_SCHEMA.properties.refeicoes.items.required.includes('itens'), 'cada refeição deve exigir itens');
assert(DAILY_FOOD_PROMPT.includes('WhatsApp'), 'prompt deve orientar o texto copiado do WhatsApp');
assert(DAILY_FOOD_PROMPT.includes('várias fotos'), 'prompt deve orientar múltiplas fotos');

const body = apiBodyResumoDia(
  '08:00 café e ovos\n12:30 arroz, feijão e frango',
  [
    { data: 'base64-foto-1', mimeType: 'image/jpeg' },
    { data: 'base64-foto-2', mimeType: 'image/png' }
  ],
  GEMINI_MODELS[0],
  '2026-08-31'
);
assert.strictEqual(body.generationConfig.responseSchema, DAILY_FOOD_SCHEMA);
assert.strictEqual(body.generationConfig.responseMimeType, 'application/json');
assert.strictEqual(body.contents[0].parts.filter(part => part.inline_data).length, 2, 'as duas fotos devem ir na mesma requisição');
assert(body.contents[0].parts[0].text.includes('08:00 café e ovos'));
assert(body.contents[0].parts[0].text.includes('2026-08-31'));

const meal = (name, hour, kcal, protein, carbs, fat, itemName) => ({
  nome_refeicao: name,
  horario: hour,
  itens: [{ nome: itemName, porcao_g: 100, kcal, proteina_g: protein, carbo_g: carbs, gordura_g: fat }],
  kcal_total: kcal,
  proteina_total: protein,
  carbo_total: carbs,
  gordura_total: fat,
  confianca: 'alta'
});

const merged = mergeResumoDiaAnalisys([
  {
    refeicoes: [meal('Café da manhã', '08:00', 300, 20, 30, 10, 'Ovos'), meal('Almoço', '12:30', 700, 45, 75, 18, 'Frango')],
    kcal_total: 1000, proteina_total: 65, carbo_total: 105, gordura_total: 28, confianca: 'alta'
  },
  {
    refeicoes: [meal('Café da manhã', '08:00', 320, 21, 31, 11, 'Ovos'), meal('Almoço', '12:30', 680, 44, 73, 17, 'Frango')],
    kcal_total: 1000, proteina_total: 65, carbo_total: 104, gordura_total: 28, confianca: 'alta'
  }
]);
assert.strictEqual(merged.refeicoes.length, 2, 'múltiplas refeições devem ser preservadas');
assert.strictEqual(merged.refeicoes[0].nome_refeicao, 'Café da manhã');
assert.strictEqual(merged.kcal_total, 1000, 'total consolidado deve ser a soma dos itens médios');
assert.strictEqual(merged.proteina_total, 65);
assert.strictEqual(merged.refeicoes[1].itens[0].kcal, 690);

const totalsOnly = mergeResumoDiaAnalisys([
  { refeicoes: [], kcal_total: 420, proteina_total: 20, carbo_total: 50, gordura_total: 12, confianca: 'baixa' }
]);
assert.strictEqual(totalsOnly.refeicoes.length, 1, 'totais sem detalhamento devem continuar revisáveis');
assert.strictEqual(totalsOnly.refeicoes[0].itens[0].nome, 'Itens não detalhados');

let capturedBody = null;
context.fetch = (_url, options) => {
  capturedBody = JSON.parse(options.body);
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        refeicoes: [meal('Jantar', '20:00', 500, 30, 40, 15, 'Arroz')],
        kcal_total: 500, proteina_total: 30, carbo_total: 40, gordura_total: 15, confianca: 'media'
      }) }] } }]
    }))
  });
};

(async () => {
  const trace = await consultarModeloResumoDia(
    GEMINI_MODELS[0],
    '20:00 jantar',
    [{ data: 'foto-a', mimeType: 'image/jpeg' }, { data: 'foto-b', mimeType: 'image/jpeg' }],
    '2026-08-31',
    0,
    1,
    'test-key'
  );
  assert.strictEqual(trace.ok, true);
  assert.strictEqual(trace.result.refeicoes.length, 1);
  assert.strictEqual(capturedBody.contents[0].parts.filter(part => part.inline_data).length, 2);
  console.log('gemini_daily_summary.test.js: OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
