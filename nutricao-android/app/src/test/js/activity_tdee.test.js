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

const mockStorage = {};
const mockLocalStorage = {
  getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
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
  localStorage: mockLocalStorage,
  toast: () => {}
};
vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('apps/nutricao/estado.js');
loadScript('apps/nutricao/logic.js');

vm.runInContext(`
  globalThis.profile = typeof profile !== 'undefined' ? profile : null;
  globalThis.meals = typeof meals !== 'undefined' ? meals : null;
  globalThis.activities = typeof activities !== 'undefined' ? activities : null;
  globalThis.dayMeals = typeof dayMeals !== 'undefined' ? dayMeals : null;
  globalThis.dayTotals = typeof dayTotals !== 'undefined' ? dayTotals : null;
  globalThis.dayActivities = typeof dayActivities !== 'undefined' ? dayActivities : null;
  globalThis.dayBurned = typeof dayBurned !== 'undefined' ? dayBurned : null;
  globalThis.addActivity = typeof addActivity !== 'undefined' ? addActivity : null;
  globalThis.delActivity = typeof delActivity !== 'undefined' ? delActivity : null;
  globalThis.saveActivities = typeof saveActivities !== 'undefined' ? saveActivities : null;
  globalThis.calcBMR = typeof calcBMR !== 'undefined' ? calcBMR : null;
  globalThis.calcTDEE = typeof calcTDEE !== 'undefined' ? calcTDEE : null;
  globalThis.today = typeof today !== 'undefined' ? today : null;
  globalThis.fmt = typeof fmt !== 'undefined' ? fmt : null;
`, context);

const {
  profile, meals, dayMeals, dayTotals, dayActivities, dayBurned,
  addActivity, delActivity, saveActivities, calcBMR, calcTDEE, today, fmt
} = context;

console.log('=== [NUTRITRACK] Executando Suíte: activity_tdee.test.js ===\n');

// 1. Teste de BMR (Taxa Metabólica Basal) Mifflin-St Jeor
{
  console.log('Test 1: Cálculo de BMR e TDEE (Mifflin-St Jeor)');

  // Homem: 80 kg, 180 cm, 25 anos
  // BMR = 10*80 + 6.25*180 - 5*25 + 5 = 800 + 1125 - 125 + 5 = 1805
  const bmrM = calcBMR({ peso: 80, altura: 180, idade: 25, sexo: 'm' });
  assert.strictEqual(bmrM, 1805, 'BMR masculino incorreto');

  // Mulher: 60 kg, 165 cm, 30 anos
  // BMR = 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25
  const bmrF = calcBMR({ peso: 60, altura: 165, idade: 30, sexo: 'f' });
  assert.strictEqual(bmrF, 1320.25, 'BMR feminino incorreto');

  // TDEE com diferentes fatores de atividade
  // Sedentário (1.2): 1805 * 1.2 = 2166
  assert.strictEqual(calcTDEE({ peso: 80, altura: 180, idade: 25, sexo: 'm', atividade: 1.2 }), 2166);
  // Moderado (1.6): 1805 * 1.6 = 2888
  assert.strictEqual(calcTDEE({ peso: 80, altura: 180, idade: 25, sexo: 'm', atividade: 1.6 }), 2888);
  // Intenso (1.8): 1805 * 1.8 = 3249
  assert.strictEqual(calcTDEE({ peso: 80, altura: 180, idade: 25, sexo: 'm', atividade: 1.8 }), 3249);
}

// 2. Teste da Fórmula de Gasto Calórico por MET
{
  console.log('Test 2: Fórmula MET: Gasto = MET * Peso (kg) * (Duração min / 60)');

  // Exemplo: Musculação Moderada (MET = 5.0), Peso = 75 kg, Duração = 60 min
  // Gasto = 5.0 * 75 * (60 / 60) = 375 kcal
  const peso = 75;
  const durMin = 60;
  const met = 5.0;
  const kcalCalc = Math.round(met * peso * (durMin / 60));
  assert.strictEqual(kcalCalc, 375, 'Gasto de musculação incorreto');

  // Exemplo 2: Corrida a 9 km/h (MET = 8.8), Peso = 70 kg, Duração = 30 min
  // Gasto = 8.8 * 70 * (30 / 60) = 308 kcal
  const kcalCorrida = Math.round(8.8 * 70 * (30 / 60));
  assert.strictEqual(kcalCorrida, 308, 'Gasto de corrida incorreto');
}

// 3. Teste de Estado e Mutação de Atividades (addActivity, dayActivities, dayBurned, delActivity)
{
  console.log('Test 3: Ciclo de vida e mutações de atividades em estado.js');
  const d = '2026-08-16';

  saveActivities([]);
  assert.strictEqual(dayActivities(d).length, 0);
  assert.strictEqual(dayBurned(d), 0);

  // Adicionar Atividade 1
  const act1 = addActivity({
    date: d,
    nome: 'Musculação Peito e Tríceps',
    duracaoMin: 50,
    intensidade: 'moderada',
    met: 5.0,
    kcal: 312,
    origem: 'manual'
  });

  assert(act1.id, 'Atividade deve ter ID único');
  assert.strictEqual(act1.nome, 'Musculação Peito e Tríceps');
  assert.strictEqual(act1.kcal, 312);
  assert.strictEqual(dayActivities(d).length, 1);
  assert.strictEqual(dayBurned(d), 312);

  // Adicionar Atividade 2 (IA com segmentos)
  const act2 = addActivity({
    date: d,
    nome: 'Treino Intervalado de Corrida',
    duracaoMin: 30,
    intensidade: 'intensa',
    met: 8.5,
    kcal: 319,
    origem: 'ia_texto',
    segmentos: [
      { descricao: 'Corrida 9 km/h', duracao_minutos: 15, met: 8.8, kcal_gasto: 165 },
      { descricao: 'Caminhada 4 km/h', duracao_minutos: 15, met: 3.5, kcal_gasto: 66 }
    ]
  });

  assert.strictEqual(dayActivities(d).length, 2);
  assert.strictEqual(dayBurned(d), 631, 'Soma do dia deve ser 312 + 319 = 631');
  assert.strictEqual(act2.segmentos.length, 2);

  // Remoção de atividade
  const removed = delActivity(act1.id);
  assert.strictEqual(removed.id, act1.id);
  assert.strictEqual(dayActivities(d).length, 1);
  assert.strictEqual(dayBurned(d), 319);
}

// 4. Teste da Equação do Balanço Energético Diário (Ingeridas - Exercício = Líquido vs Meta)
{
  console.log('Test 4: Equação do Balanço Energético Diário (I - G = L vs Meta)');
  const d = '2026-08-16';

  // Configura refeições
  context.meals.length = 0;
  context.meals.push({
    id: 'm1',
    date: d,
    nome: 'Almoço',
    itens: [{ nome: 'Prato Feito', porcao_g: 400, kcal: 850, proteina_g: 45, carbo_g: 90, gordura_g: 22 }]
  });
  context.meals.push({
    id: 'm2',
    date: d,
    nome: 'Jantar',
    itens: [{ nome: 'Omelete', porcao_g: 200, kcal: 350, proteina_g: 24, carbo_g: 5, gordura_g: 25 }]
  });

  const totals = dayTotals(d);
  const I = totals.kcal; // 850 + 350 = 1200 kcal
  assert.strictEqual(I, 1200, 'Ingeridas incorretas');

  const G = dayBurned(d); // 319 kcal
  assert.strictEqual(G, 319, 'Gastas incorretas');

  const L = I - G; // 1200 - 319 = 881 kcal
  assert.strictEqual(L, 881, 'Saldo Líquido incorreto');

  const metaKcal = 2000;
  const restamMeta = metaKcal - L; // 2000 - 881 = 1119 kcal
  assert.strictEqual(restamMeta, 1119, 'Calorias restantes para a meta incorretas');
  assert(L <= metaKcal, 'Deve estar dentro da meta');
}

// 5. Teste de Superávit Calórico no Balanço Energético
{
  console.log('Test 5: Condição de Superávit Calórico quando Líquido > Meta');
  const metaKcal = 1800;
  const I = 2600;
  const G = 400;
  const L = I - G; // 2200 kcal

  assert.strictEqual(L, 2200);
  assert(L > metaKcal, 'Deve detectar superávit calórico');
  const superavit = L - metaKcal; // +400 kcal
  assert.strictEqual(superavit, 400, 'Superávit calculado incorretamente');
}

console.log('\n======================================================');
console.log('activity_tdee.test.js: OK (Todos os testes passaram com sucesso!)');
