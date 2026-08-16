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

loadScript('apps/nutricao/estado.js');
loadScript('apps/nutricao/referencia.js');
loadScript('apps/nutricao/logic.js');
loadScript('apps/nutricao/views/alimentos.js');

vm.runInContext(`
  globalThis.PLANO_SEMANAL = typeof PLANO_SEMANAL !== 'undefined' ? PLANO_SEMANAL : null;
  globalThis.carregarRefeicao = typeof carregarRefeicao !== 'undefined' ? carregarRefeicao : null;
  globalThis.enrichPlanItem = typeof enrichPlanItem !== 'undefined' ? enrichPlanItem : null;
  globalThis.getRefeicaoMacros = typeof getRefeicaoMacros !== 'undefined' ? getRefeicaoMacros : null;
  globalThis.getDiaMacros = typeof getDiaMacros !== 'undefined' ? getDiaMacros : null;
  globalThis.meals = typeof meals !== 'undefined' ? meals : null;
  globalThis.userAlims = typeof userAlims !== 'undefined' ? userAlims : null;
  globalThis.saveAlim = typeof saveAlim !== 'undefined' ? saveAlim : null;
  globalThis.updateCustomFood = typeof updateCustomFood !== 'undefined' ? updateCustomFood : null;
  globalThis.deleteCustomFood = typeof deleteCustomFood !== 'undefined' ? deleteCustomFood : null;
  globalThis.today = typeof today !== 'undefined' ? today : null;
`, context);

const {
  PLANO_SEMANAL, carregarRefeicao, enrichPlanItem, getRefeicaoMacros,
  getDiaMacros, meals, userAlims, saveAlim, updateCustomFood,
  deleteCustomFood, today
} = context;

console.log('Executando testes de meal_plan_custom_food.test.js...');

// 1. Integridade do Plano Semanal e Enriquecimento de Macros
{
  assert(Array.isArray(PLANO_SEMANAL) && PLANO_SEMANAL.length === 7, 'Deve conter 7 dias da semana');
  const seg = PLANO_SEMANAL.find(p => p.dia === 'segunda');
  assert(seg, 'Segunda-feira deve existir no plano');
  assert(Array.isArray(seg.refeicoes) && seg.refeicoes.length >= 4, 'Segunda-feira deve conter refeições');
  const almoco = seg.refeicoes.find(r => r.nome === 'Almoço');
  assert(almoco, 'Almoço deve estar presente');
  assert(almoco.itens.length > 0, 'Almoço deve conter itens de alimentos');

  // Verifica que todos os itens são enriquecidos com macros não-nulos
  const almocoMacros = getRefeicaoMacros(almoco);
  assert(almocoMacros.kcal > 500, 'Almoço deve ter calorias');
  assert(almocoMacros.proteina_g > 30, 'Almoço deve ter proteína');
  assert(almocoMacros.carbo_g > 30, 'Almoço deve ter carboidrato');
  assert(almocoMacros.gordura_g > 5, 'Almoço deve ter gordura');
}

// 2. Importação Granular de Refeição Única (carregarRefeicao)
{
  const hojeKey = today();
  meals.length = 0; // limpa meals

  // Adiciona uma refeicao prévia manual
  meals.push({
    id: 'previa',
    date: hojeKey,
    hour: '07:00',
    nome: 'Café',
    itens: [{ nome: 'Café', kcal: 50, proteina_g: 0, carbo_g: 0, gordura_g: 0 }],
    origem: 'manual'
  });
  assert.strictEqual(meals.length, 1);

  // Importa apenas o Almoço (índice 2) da Segunda
  assert(typeof carregarRefeicao === 'function', 'carregarRefeicao deve ser uma função');
  carregarRefeicao('segunda', 2);

  assert.strictEqual(meals.length, 2, 'Deve conter 2 refeições agora (a prévia + almoço importado)');
  const importado = meals[1];
  assert.strictEqual(importado.nome, 'Almoço');
  assert.strictEqual(importado.date, hojeKey);
  assert.strictEqual(importado.origem, 'plano');
  assert.strictEqual(importado.plano, 'segunda');
  assert(importado.itens.length >= 4, 'Almoço importado deve conter todos os itens do plano');
  assert(importado.itens[0].proteina_g > 0 || importado.itens[1].proteina_g > 0, 'Itens importados devem possuir macros resolvidos');
}

// 3. Criação de Alimento Personalizado (saveAlim)
{
  storageMap.clear();
  const novoAlim = {
    nome: 'Shake Hipercalórico Caseiro',
    porcao_g: 500,
    kcal: 650,
    proteina_g: 45,
    carbo_g: 80,
    gordura_g: 15,
    p: 9,
    c: 16,
    g: 3,
    custom: true
  };

  saveAlim(novoAlim);
  const alims = userAlims();
  assert.strictEqual(alims.length, 1);
  assert.strictEqual(alims[0].nome, 'Shake Hipercalórico Caseiro');
  assert.strictEqual(alims[0].kcal, 650);
  assert.strictEqual(alims[0].proteina_g, 45);
}

// 4. Edição In-Place de Alimento Personalizado (updateCustomFood)
{
  assert(typeof updateCustomFood === 'function', 'updateCustomFood deve ser uma função');
  updateCustomFood(0, {
    nome: 'Shake Hipercalórico Caseiro v2',
    porcao_g: 600,
    kcal: 750,
    proteina_g: 50,
    carbo_g: 90,
    gordura_g: 18
  });

  const alims = userAlims();
  assert.strictEqual(alims[0].nome, 'Shake Hipercalórico Caseiro v2');
  assert.strictEqual(alims[0].kcal, 750);
  assert.strictEqual(alims[0].proteina_g, 50);
}

// 5. Exclusão de Alimento Personalizado (deleteCustomFood)
{
  assert(typeof deleteCustomFood === 'function', 'deleteCustomFood deve ser uma função');
  const removido = deleteCustomFood(0);
  assert.strictEqual(removido.nome, 'Shake Hipercalórico Caseiro v2');
  const alims = userAlims();
  assert.strictEqual(alims.length, 0, 'Alimento deve ser removido');
}

console.log('meal_plan_custom_food.test.js: OK');
