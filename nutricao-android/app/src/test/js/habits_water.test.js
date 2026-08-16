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
loadScript('apps/nutricao/logic.js');
loadScript('apps/nutricao/views/hoje.js');

vm.runInContext(`
  globalThis.getCreatinaStatus = typeof getCreatinaStatus !== 'undefined' ? getCreatinaStatus : null;
  globalThis.toggleCreatina = typeof toggleCreatina !== 'undefined' ? toggleCreatina : null;
  globalThis.getWaterIntake = typeof getWaterIntake !== 'undefined' ? getWaterIntake : null;
  globalThis.addWaterIntake = typeof addWaterIntake !== 'undefined' ? addWaterIntake : null;
  globalThis.setWaterIntake = typeof setWaterIntake !== 'undefined' ? setWaterIntake : null;
  globalThis.getWaterGoal = typeof getWaterGoal !== 'undefined' ? getWaterGoal : null;
  globalThis.setWaterGoal = typeof setWaterGoal !== 'undefined' ? setWaterGoal : null;
  globalThis.profile = typeof profile !== 'undefined' ? profile : null;
`, context);

const {
  getCreatinaStatus, toggleCreatina, getWaterIntake, addWaterIntake,
  setWaterIntake, getWaterGoal, setWaterGoal, profile
} = context;

console.log('Executando testes de habits_water.test.js...');

// 1. Teste de Creatina: Estado Inicial e Toggle
{
  const testDate = '2026-08-15';
  assert.strictEqual(getCreatinaStatus(testDate), false, 'Creatina deve iniciar como false (pendente)');

  const statusAtivado = toggleCreatina(testDate);
  assert.strictEqual(statusAtivado, true, 'Toggle deve mudar status para true');
  assert.strictEqual(getCreatinaStatus(testDate), true, 'Status persistido deve ser true');

  const statusDesativado = toggleCreatina(testDate);
  assert.strictEqual(statusDesativado, false, 'Segundo toggle deve mudar status para false');
  assert.strictEqual(getCreatinaStatus(testDate), false);
}

// 2. Teste de Creatina: Isolamento Diário (Reset no novo dia)
{
  const dia1 = '2026-08-15';
  const dia2 = '2026-08-16';

  toggleCreatina(dia1);
  assert.strictEqual(getCreatinaStatus(dia1), true, 'Dia 1 marcado como tomado');
  assert.strictEqual(getCreatinaStatus(dia2), false, 'Dia 2 deve permanecer false (reset diario)');
}

// 3. Teste de Hidratação: Volume Inicial e Quick-Add (+250mL, +500mL, Custom)
{
  const testDate = '2026-08-15';
  setWaterIntake(0, testDate);
  assert.strictEqual(getWaterIntake(testDate), 0, 'Volume inicial de água deve ser 0 mL');

  const v1 = addWaterIntake(250, testDate);
  assert.strictEqual(v1, 250, 'Adicionar 250mL deve resultar em 250mL');

  const v2 = addWaterIntake(500, testDate);
  assert.strictEqual(v2, 750, 'Adicionar 500mL deve resultar em 750mL');

  const v3 = addWaterIntake(350, testDate);
  assert.strictEqual(v3, 1100, 'Adicionar 350mL customizado deve resultar em 1100mL');
  assert.strictEqual(getWaterIntake(testDate), 1100, 'Volume persistido deve ser 1100mL');
}

// 4. Teste de Meta Diária de Água e Cálculo de Progresso
{
  const metaAgua = getWaterGoal();
  assert.strictEqual(metaAgua, 3000, 'Meta padrão de água deve ser 3000 mL');

  const calcPct = (consumido, meta) => Math.min(100, Math.round((consumido / meta) * 100));

  assert.strictEqual(calcPct(1500, 3000), 50, '1500mL de 3000mL deve ser 50%');
  assert.strictEqual(calcPct(3000, 3000), 100, '3000mL de 3000mL deve ser 100%');
  assert.strictEqual(calcPct(3500, 3000), 100, 'Consumo acima da meta deve ser limitado a 100% visualmente');

  // Alteração da meta
  const novaMeta = setWaterGoal(3500);
  assert.strictEqual(novaMeta, 3500);
  assert.strictEqual(getWaterGoal(), 3500);
  assert.strictEqual(profile.metaAgua, 3500);
}

// 5. Teste de Hidratação: Isolamento Diário
{
  const dia1 = '2026-08-15';
  const dia2 = '2026-08-16';

  setWaterIntake(2000, dia1);
  assert.strictEqual(getWaterIntake(dia1), 2000, 'Dia 1 com 2000mL');
  assert.strictEqual(getWaterIntake(dia2), 0, 'Dia 2 deve iniciar com 0 mL');
}

// 6. Teste de Reset de Água
{
  const testDate = '2026-08-17';
  addWaterIntake(1500, testDate);
  assert.strictEqual(getWaterIntake(testDate), 1500);
  setWaterIntake(0, testDate);
  assert.strictEqual(getWaterIntake(testDate), 0, 'Reset deve zerar o valor do dia');
}

console.log('habits_water.test.js: OK');
