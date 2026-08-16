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

loadScript('apps/nutricao/estado.js');
loadScript('apps/nutricao/referencia.js');
loadScript('apps/nutricao/logic.js');
loadScript('apps/nutricao/views/metas.js');

// Exporta variáveis declaradas com const/let
vm.runInContext(`
  globalThis.profile = typeof profile !== 'undefined' ? profile : null;
  globalThis.meals = typeof meals !== 'undefined' ? meals : null;
  globalThis.dayTotals = typeof dayTotals !== 'undefined' ? dayTotals : null;
  globalThis.calcTDEE = typeof calcTDEE !== 'undefined' ? calcTDEE : null;
  globalThis.refMap = typeof refMap !== 'undefined' ? refMap : null;
  globalThis.fmt = typeof fmt !== 'undefined' ? fmt : null;
`, context);

const {
  profile, meals, dayTotals, calcTDEE, refMap, fmt
} = context;

console.log('Executando testes de tdee_macros.test.js...');

// 1. Teste de Cálculo do TDEE / Taxa Metabólica Basal (Mifflin-St Jeor)
{
  // Homem: 75kg, 175cm, 30 anos, atividade leve (1.4)
  // BMR = 10*75 + 6.25*175 - 5*30 + 5 = 750 + 1093.75 - 150 + 5 = 1698.75
  // TDEE = 1698.75 * 1.4 = 2378.25 -> 2378
  profile.sexo = 'm';
  profile.peso = 75;
  profile.altura = 175;
  profile.idade = 30;
  profile.atividade = 1.4;

  const tdeeHomem = calcTDEE();
  assert.strictEqual(tdeeHomem, 2378, 'TDEE Masculino calculado incorretamente');

  // Mulher: 60kg, 165cm, 28 anos, atividade leve (1.4)
  // BMR = 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25
  // TDEE = 1330.25 * 1.4 = 1862.35 -> 1862
  profile.sexo = 'f';
  profile.peso = 60;
  profile.altura = 165;
  profile.idade = 28;
  profile.atividade = 1.4;

  const tdeeMulher = calcTDEE();
  assert.strictEqual(tdeeMulher, 1862, 'TDEE Feminino calculado incorretamente');
}

// 2. Teste de Distribuição Sugerida de Macros
{
  const peso = 75;
  const kcalTotal = 2400;

  const proteinaSugerida = Math.round(peso * 1.8);       // 135g
  const carboSugerido = Math.round(kcalTotal * 0.45 / 4); // 270g (45% das kcal / 4 kcal/g)
  const gorduraSugerida = Math.round(kcalTotal * 0.25 / 9);// 67g  (25% das kcal / 9 kcal/g)

  assert.strictEqual(proteinaSugerida, 135);
  assert.strictEqual(carboSugerido, 270);
  assert.strictEqual(gorduraSugerida, 67);
}

// 3. Teste de Totalizadores Diários (dayTotals)
{
  const testDate = '2026-08-15';
  meals.length = 0; // limpa meals
  meals.push({
    id: 'm1',
    date: testDate,
    nome: 'Café da manhã',
    itens: [
      { nome: 'Ovo cozido', porcao_g: 100, kcal: 155, proteina_g: 13, carbo_g: 1.1, gordura_g: 11 },
      { nome: 'Pão francês', porcao_g: 50, kcal: 150, proteina_g: 4, carbo_g: 29.5, gordura_g: 1.75 }
    ]
  });
  meals.push({
    id: 'm2',
    date: testDate,
    nome: 'Almoço',
    itens: [
      { nome: 'Frango grelhado', porcao_g: 150, kcal: 247.5, proteina_g: 46.5, carbo_g: 0, gordura_g: 5.4 },
      { nome: 'Arroz branco', porcao_g: 200, kcal: 260, proteina_g: 5.2, carbo_g: 56, gordura_g: 0.6 }
    ]
  });

  const totals = dayTotals(testDate);
  assert.strictEqual(totals.kcal, 812.5, 'Soma de calorias do dia incorreta');
  assert.strictEqual(totals.p, 68.7, 'Soma de proteínas do dia incorreta');
  assert.strictEqual(totals.c, 86.6, 'Soma de carboidratos do dia incorreta');
  assert.strictEqual(totals.g, 18.75, 'Soma de gorduras do dia incorreta');
}

// 4. Teste de Catálogo de Alimentos de Referência
{
  assert(Array.isArray(refMap) && refMap.length >= 40, 'Catálogo de referência deve ter mais de 40 alimentos');
  const frango = refMap.find(x => x.nome.includes('Frango grelhado (peito)'));
  assert(frango, 'Frango grelhado deve estar presente');
  assert.strictEqual(frango.kcal, 165);
  assert.strictEqual(frango.p, 31);
}

console.log('tdee_macros.test.js: OK');
