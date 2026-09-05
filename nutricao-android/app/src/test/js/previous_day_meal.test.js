'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ASSETS = path.resolve(__dirname, '../../main/assets');

function createContext() {
  const storage = new Map();
  const byId = {
    fNome: { value: 'Almoço atrasado' },
    fDate: { value: '' },
    modal: { innerHTML: '' },
    toast: { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => ({}) }
  };
  const itemInputs = [
    { value: 'Arroz' },
    { value: '100' },
    { value: '130' }
  ];
  const mealRow = { querySelectorAll: () => itemInputs };
  const ctx = {
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
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
      clear: () => storage.clear()
    },
    document: {
      querySelector: selector => selector.startsWith('#') ? (byId[selector.slice(1)] || null) : null,
      querySelectorAll: selector => selector === '#fItens .det-item' ? [mealRow] : [],
      getElementById: id => byId[id] || null,
      createElement: () => ({ className: '', innerHTML: '', appendChild() {} }),
      addEventListener() {},
      body: { contains: () => true, appendChild() {} }
    },
    window: {},
    openModal: html => { byId.modal.innerHTML = html; },
    closeModal: () => { byId.modal.innerHTML = ''; },
    toast: () => {},
    render: () => {},
    uid: () => 'meal-test',
    horaNow: () => '12:30',
    setTimeout: fn => { fn(); return 1; },
    clearTimeout: () => {}
  };
  vm.createContext(ctx);
  for (const rel of ['apps/nutricao/estado.js', 'apps/nutricao/logic.js', 'core/gemini.js']) {
    vm.runInContext(fs.readFileSync(path.join(ASSETS, rel), 'utf8'), ctx);
  }
  return { ctx, storage, byId };
}

const h = createContext();
const today = h.ctx.today();
const previous = new Date(today + 'T12:00:00');
previous.setDate(previous.getDate() - 1);
const previousKey = h.ctx.localDateStr(previous);
const future = new Date(today + 'T12:00:00');
future.setDate(future.getDate() + 1);
const futureKey = h.ctx.localDateStr(future);

assert.strictEqual(h.ctx.setActiveDate(previousKey, false), true, 'dia anterior deve ser selecionável');
assert.strictEqual(h.ctx.getActiveDate(), previousKey, 'data ativa deve ser o dia anterior');
assert.strictEqual(h.ctx.setActiveDate(futureKey, false), false, 'data futura deve ser rejeitada');
assert.strictEqual(h.ctx.getActiveDate(), previousKey, 'data ativa não pode avançar para o futuro');

h.byId.fDate.value = previousKey;
h.ctx.confirmManual();
const meals = JSON.parse(h.storage.get('nt_meals'));
assert.strictEqual(meals.length, 1, 'um lançamento manual deve ser criado');
assert.strictEqual(meals[0].date, previousKey, 'lançamento manual deve usar a data escolhida');
assert.strictEqual(h.ctx.dayMeals().length, 1, 'o resumo padrão deve seguir a data ativa');
assert.strictEqual(h.ctx.dayMeals(today).length, 0, 'o lançamento não deve cair em hoje');

console.log('previous_day_meal.test.js: OK');
