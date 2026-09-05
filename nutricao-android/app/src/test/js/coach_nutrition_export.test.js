'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const stored = new Map();
const published = [];
const bridge = { syncNutritionSummary: raw => published.push(JSON.parse(raw)) };
const context = {
  console, Date, Math, JSON, String, Number, Array, Object, Set,
  parseFloat, parseInt, isFinite, isNaN, setTimeout, clearTimeout,
  localStorage: {
    getItem: key => stored.has(key) ? stored.get(key) : null,
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: key => stored.delete(key), clear: () => stored.clear()
  },
  AndroidBridge: bridge,
  window: {},
  document: { querySelector: () => null, querySelectorAll: () => [] }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,
  '../../main/assets/apps/nutricao/estado.js'), 'utf8'), context);

const result = vm.runInContext(`
  meals = [{ id:'secret-id', date:'2026-08-23', nome:'Refeição secreta', foto:'data:image/jpeg;base64,SECRET',
    itens:[{ nome:'Alimento privado', kcal:600, proteina_g:40, carbo_g:70, gordura_g:18 }] }];
  water = { '2026-08-23': 1750 };
  profile = Object.assign({}, profile, { kcal:2200, p:150, c:260, g:70, metaAgua:3000 });
  window.buildCoachNutritionExport();
`, context);

assert.equal(result.schemaVersion, 1);
assert.equal(result.days.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(result.days[0])), {
  date: '2026-08-23', mealCount: 1, hasWaterLog: true,
  energyKcal: 600, proteinG: 40, carbsG: 70, fatG: 18, waterMl: 1750,
  targets: { energyKcal: 2200, proteinG: 150, carbsG: 260, fatG: 70, waterMl: 3000 }
});
const serialized = JSON.stringify(result);
for (const secret of ['secret-id', 'Refeição secreta', 'Alimento privado', 'SECRET', 'foto']) {
  assert.equal(serialized.includes(secret), false, 'export leaked: ' + secret);
}

vm.runInContext('syncNutritionNative()', context);
assert.deepEqual(published[published.length - 1], JSON.parse(serialized));
console.log('coach_nutrition_export.test.js: OK');
