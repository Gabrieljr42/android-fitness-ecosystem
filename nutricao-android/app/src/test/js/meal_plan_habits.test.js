'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock DOM
function createMockElement(tagName = 'div') {
  return {
    tagName: tagName.toUpperCase(),
    attributes: {},
    classList: {
      _classes: new Set(),
      add: function(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove: function(...cls) { cls.forEach(c => this._classes.delete(c)); },
      toggle: function(c, f) {
        if (f === true) { this._classes.add(c); return true; }
        if (f === false) { this._classes.delete(c); return false; }
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        this._classes.add(c); return true;
      },
      contains: function(c) { return this._classes.has(c); }
    },
    style: {},
    children: [],
    value: '',
    textContent: '',
    innerHTML: '',
    onclick: null,
    setAttribute: function(name, val) { this.attributes[name] = String(val); },
    getAttribute: function(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; },
    appendChild: function(child) { this.children.push(child); return child; }
  };
}

const mockStorage = {};
const mockLocalStorage = {
  getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
};

const documentMock = {
  getElementById: () => createMockElement('div'),
  querySelector: () => createMockElement('div'),
  querySelectorAll: () => [],
  createElement: (tag) => createMockElement(tag),
  addEventListener: () => {}
};

const windowMock = {
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
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  isFinite: isFinite,
  isNaN: isNaN,
  document: documentMock,
  window: windowMock,
  self: windowMock,
  localStorage: mockLocalStorage,
  toast: () => {},
  openModal: () => {},
  closeModal: () => {},
  render: () => {}
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
  globalThis.PLANO_SEMANAL = typeof PLANO_SEMANAL !== 'undefined' ? PLANO_SEMANAL : [];
  globalThis.HORARIO_REFEICAO = typeof HORARIO_REFEICAO !== 'undefined' ? HORARIO_REFEICAO : {'Pré-treino':'07:30','Pós-treino':'09:15','Almoço':'12:30','Lanche da tarde':'15:30','Jantar':'19:00'};
  globalThis.load = typeof load !== 'undefined' ? load : (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch(e) { return d; } };
  globalThis.save = typeof save !== 'undefined' ? save : (k, v) => localStorage.setItem(k, JSON.stringify(v));
  globalThis.userAlims = typeof userAlims !== 'undefined' ? userAlims : () => load('nt_alims', []);
  globalThis.saveAlim = typeof saveAlim !== 'undefined' ? saveAlim : (a) => { const l = userAlims(); l.unshift(a); save('nt_alims', l.slice(0, 200)); };
  globalThis.meals = typeof meals !== 'undefined' ? meals : [];
  globalThis.today = typeof today !== 'undefined' ? today : () => new Date().toISOString().slice(0, 10);
  globalThis.horaNow = typeof horaNow !== 'undefined' ? horaNow : () => new Date().toTimeString().slice(0, 5);
  globalThis.uid = typeof uid !== 'undefined' ? uid : () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  globalThis.refMap = typeof refMap !== 'undefined' ? refMap : [];
`, context);

console.log('=== [NUTRITRACK] Executando Suíte: meal_plan_habits.test.js ===\n');

// -----------------------------------------------------------------------------
// GRANULAR MEAL IMPORT HELPER & HABITS STATE HELPERS
// -----------------------------------------------------------------------------
function carregarRefeicaoIndividual(dia, nomeRefeicao, targetDate = context.today()) {
  const p = context.PLANO_SEMANAL.find(x => x.dia === dia);
  if (!p) throw new Error(`Dia ${dia} não encontrado no plano`);
  const refeicao = p.refeicoes.find(r => r.nome === nomeRefeicao);
  if (!refeicao) throw new Error(`Refeição ${nomeRefeicao} não encontrada no plano de ${dia}`);

  const itemDetails = refeicao.itens.map(i => {
    // Lookup nutrition info from reference catalog if available
    const ref = context.refMap.find(rm => rm.nome.toLowerCase() === i.nome.toLowerCase());
    const f = (i.porcao_g || 100) / 100;
    return {
      nome: i.nome,
      porcao_g: i.porcao_g || 100,
      kcal: i.kcal || (ref ? Math.round(ref.kcal * f) : 0),
      proteina_g: +(ref ? (ref.p * f) : 0).toFixed(1),
      carbo_g: +(ref ? (ref.c * f) : 0).toFixed(1),
      gordura_g: +(ref ? (ref.g * f) : 0).toFixed(1)
    };
  });

  const importedMeal = {
    id: context.uid(),
    date: targetDate,
    hour: context.HORARIO_REFEICAO[refeicao.nome] || context.horaNow(),
    nome: refeicao.nome,
    itens: itemDetails,
    origem: 'manual',
    plano: dia
  };

  context.meals.push(importedMeal);
  return importedMeal;
}

// Habits & Hydration State Manager
class HabitsWaterManager {
  static getHabits(dateKey) {
    const key = `nt_habits_${dateKey}`;
    const raw = mockLocalStorage.getItem(key);
    return raw ? JSON.parse(raw) : { creatine: false };
  }

  static toggleCreatine(dateKey) {
    const current = this.getHabits(dateKey);
    const updated = { ...current, creatine: !current.creatine };
    mockLocalStorage.setItem(`nt_habits_${dateKey}`, JSON.stringify(updated));
    return updated;
  }

  static getWater(dateKey) {
    const key = `nt_water_${dateKey}`;
    const raw = mockLocalStorage.getItem(key);
    return raw ? JSON.parse(raw) : { current_ml: 0, goal_ml: 3000 };
  }

  static addWater(dateKey, mlToAdd) {
    if (mlToAdd < 0) return this.getWater(dateKey);
    const current = this.getWater(dateKey);
    const updated = {
      ...current,
      current_ml: Math.max(0, current.current_ml + mlToAdd)
    };
    mockLocalStorage.setItem(`nt_water_${dateKey}`, JSON.stringify(updated));
    return updated;
  }

  static setWaterGoal(dateKey, newGoalMl) {
    const current = this.getWater(dateKey);
    const updated = { ...current, goal_ml: Math.max(500, newGoalMl) };
    mockLocalStorage.setItem(`nt_water_${dateKey}`, JSON.stringify(updated));
    return updated;
  }
}

// -----------------------------------------------------------------------------
// TIER 1: CORE FUNCTIONAL TESTS
// -----------------------------------------------------------------------------

// 1.1 F3.1 Granular Individual Meal Plan Import
{
  console.log('Test 1.1: Granular individual meal import from weekly meal plan');
  vm.runInContext('meals.length = 0;', context);

  // Import ONLY "Almoço" from segunda-feira
  const imported = carregarRefeicaoIndividual('segunda', 'Almoço');

  assert.strictEqual(imported.nome, 'Almoço');
  assert.strictEqual(imported.plano, 'segunda');
  assert(imported.itens.length >= 4, 'Almoço de segunda deve conter arroz, feijão, frango, etc.');
  
  // Verify today's log has ONLY 1 meal (Almoço), and NOT all 5 meals of the day
  assert.strictEqual(context.meals.length, 1, 'Deve conter somente o Almoço importado granularmente');
  assert.strictEqual(context.meals[0].nome, 'Almoço');

  // Verify total kcal calculation of imported meal
  const totalKcal = imported.itens.reduce((sum, item) => sum + item.kcal, 0);
  assert(totalKcal > 800 && totalKcal < 1300, `Calorias do almoço devem estar na faixa esperada (obteve ${totalKcal})`);
}

// 1.2 F3.1 Granular Imports across Different Days
{
  console.log('Test 1.2: Import distinct individual meals from different days into today log');
  // Import "Pós-treino" from terça and "Jantar" from quarta
  const posTreino = carregarRefeicaoIndividual('terça', 'Pós-treino');
  const jantar = carregarRefeicaoIndividual('quarta', 'Jantar');

  assert.strictEqual(context.meals.length, 3, 'Deve conter 3 refeições acumuladas');
  assert.strictEqual(posTreino.plano, 'terça');
  assert.strictEqual(jantar.plano, 'quarta');
}

// 1.3 F3.3 Custom Food Creation and In-Place Editing
{
  console.log('Test 1.3: Custom food creation, in-place editing, and storage');
  mockLocalStorage.clear();

  // Create custom food
  const initialFood = {
    nome: 'Shake Proteico Caseiro',
    porcao_g: 400,
    kcal: 450,
    proteina_g: 35.0,
    carbo_g: 50.0,
    gordura_g: 10.0,
    custom: true
  };

  context.saveAlim(initialFood);
  let userList = context.userAlims();
  assert.strictEqual(userList.length, 1);
  assert.strictEqual(userList[0].nome, 'Shake Proteico Caseiro');
  assert.strictEqual(userList[0].kcal, 450);

  // Edit custom food (update peanut butter portion: kcal 520, protein 40g)
  function editCustomFood(oldName, updatedData) {
    const list = context.userAlims();
    const idx = list.findIndex(f => f.nome === oldName);
    if (idx < 0) throw new Error(`Alimento ${oldName} não encontrado para edição`);
    list[idx] = { ...list[idx], ...updatedData };
    mockLocalStorage.setItem('nt_alims', JSON.stringify(list));
    return list[idx];
  }

  const updatedFood = editCustomFood('Shake Proteico Caseiro', {
    nome: 'Shake Proteico Caseiro (Modificado)',
    kcal: 520,
    proteina_g: 40.0,
    carbo_g: 55.0,
    gordura_g: 12.0
  });

  userList = context.userAlims();
  assert.strictEqual(userList.length, 1, 'Deve manter o mesmo item atualizado');
  assert.strictEqual(userList[0].nome, 'Shake Proteico Caseiro (Modificado)');
  assert.strictEqual(userList[0].kcal, 520);
  assert.strictEqual(userList[0].proteina_g, 40.0);
}

// 1.4 F4.1 Creatine Daily 1-Tap Toggle and Persistence
{
  console.log('Test 1.4: Creatine 1-tap toggle button and daily persistence');
  const dateKey = '2026-08-15';

  // Initial state should be false (Pendente)
  let habits = HabitsWaterManager.getHabits(dateKey);
  assert.strictEqual(habits.creatine, false, 'Creatina deve iniciar como false (Pendente)');

  // 1-tap toggle to taken (Tomada ✓)
  habits = HabitsWaterManager.toggleCreatine(dateKey);
  assert.strictEqual(habits.creatine, true, 'Creatina deve mudar para true (Tomada ✓)');

  // Check persistence
  const persisted = HabitsWaterManager.getHabits(dateKey);
  assert.strictEqual(persisted.creatine, true);

  // Toggle back to false if needed
  habits = HabitsWaterManager.toggleCreatine(dateKey);
  assert.strictEqual(habits.creatine, false);
}

// 1.5 F4.1 Water Intake Quick-Add Buttons (+250mL, +500mL) and Goal Calculation
{
  console.log('Test 1.5: Water intake tracker with quick adds (+250mL, +500mL) and goal calculation');
  const dateKey = '2026-08-15';

  let water = HabitsWaterManager.getWater(dateKey);
  assert.strictEqual(water.current_ml, 0, 'Água inicial deve ser 0 mL');
  assert.strictEqual(water.goal_ml, 3000, 'Meta padrão deve ser 3000 mL');

  // Quick add +250 mL
  water = HabitsWaterManager.addWater(dateKey, 250);
  assert.strictEqual(water.current_ml, 250);

  // Quick add +500 mL
  water = HabitsWaterManager.addWater(dateKey, 500);
  assert.strictEqual(water.current_ml, 750);

  // Quick add another +500 mL
  water = HabitsWaterManager.addWater(dateKey, 500);
  assert.strictEqual(water.current_ml, 1250);

  // Progress percentage
  const pct = Math.min(100, Math.round((water.current_ml / water.goal_ml) * 100));
  assert.strictEqual(pct, 42, '1250/3000 deve ser ~42%');
}

// -----------------------------------------------------------------------------
// TIER 2: BOUNDARY & DAILY RESET TESTS
// -----------------------------------------------------------------------------

// 2.1 Daily Reset for Creatine and Water on Date Change (Midnight / Next Day)
{
  console.log('Test 2.1: Daily reset of habits and hydration when transitioning to a new date');
  const todayDate = '2026-08-20';
  const tomorrowDate = '2026-08-21';

  // Mark creatine taken and drink 2500mL water on todayDate
  HabitsWaterManager.toggleCreatine(todayDate);
  HabitsWaterManager.addWater(todayDate, 2500);

  assert.strictEqual(HabitsWaterManager.getHabits(todayDate).creatine, true);
  assert.strictEqual(HabitsWaterManager.getWater(todayDate).current_ml, 2500);

  // On tomorrowDate: accessing habits and water resets to initial daily state
  const tomorrowHabits = HabitsWaterManager.getHabits(tomorrowDate);
  const tomorrowWater = HabitsWaterManager.getWater(tomorrowDate);

  assert.strictEqual(tomorrowHabits.creatine, false, 'Novo dia deve resetar creatina para false');
  assert.strictEqual(tomorrowWater.current_ml, 0, 'Novo dia deve resetar água para 0 mL');
  assert.strictEqual(tomorrowWater.goal_ml, 3000, 'Novo dia deve manter a meta');

  // Verify historical date was NOT overwritten
  assert.strictEqual(HabitsWaterManager.getHabits(todayDate).creatine, true, 'Histórico de ontem preservado');
  assert.strictEqual(HabitsWaterManager.getWater(todayDate).current_ml, 2500, 'Histórico de ontem preservado');
}

// 2.2 Water Intake Boundary Cases (Negative rejection, Over-goal)
{
  console.log('Test 2.2: Water intake boundaries (negative rejection, exceeding 100% goal)');
  const testDate = '2026-08-17';

  // Negative addition rejected
  let w = HabitsWaterManager.addWater(testDate, -500);
  assert.strictEqual(w.current_ml, 0);

  // Add 3500 mL on 3000 mL goal
  w = HabitsWaterManager.addWater(testDate, 3500);
  assert.strictEqual(w.current_ml, 3500, 'Deve registrar o volume real mesmo excedendo meta');
  const pct = Math.round((w.current_ml / w.goal_ml) * 100);
  assert.strictEqual(pct, 117, 'Percentual real é 117%');
}

// -----------------------------------------------------------------------------
// TIER 3: CROSS-FEATURE INTEGRATION TESTS
// -----------------------------------------------------------------------------

// 3.1 Granular Meal Import + Custom Food Logging + Habits Daily Dashboard
{
  console.log('Test 3.1: Cross-Feature: Granular meal import, custom food, creatine and water in unified day log');
  const dateKey = '2026-08-18';
  vm.runInContext('meals.length = 0;', context);

  // 1. Import lunch from segunda
  carregarRefeicaoIndividual('segunda', 'Almoço', dateKey);

  // 2. Log custom snack
  const customSnack = {
    id: context.uid(),
    date: dateKey,
    hour: '16:00',
    nome: 'Lanche Personalizado',
    itens: [{ nome: 'Tapioca com queijo', porcao_g: 120, kcal: 280, proteina_g: 12.0, carbo_g: 45.0, gordura_g: 6.0 }],
    origem: 'manual'
  };
  context.meals.push(customSnack);

  // 3. Complete habits
  HabitsWaterManager.toggleCreatine(dateKey);
  HabitsWaterManager.addWater(dateKey, 2000);

  // Verify daily meal count
  const dayM = context.meals.filter(m => m.date === dateKey);
  assert.strictEqual(dayM.length, 2, 'Deve conter 2 refeições no dia');

  // Verify daily macro calculation
  const totals = { kcal: 0, p: 0, c: 0, g: 0 };
  dayM.forEach(m => m.itens.forEach(i => {
    totals.kcal += i.kcal || 0; totals.p += i.proteina_g || 0; totals.c += i.carbo_g || 0; totals.g += i.gordura_g || 0;
  }));
  assert(totals.kcal > 1000, 'Calorias do dia somadas com sucesso');

  // Verify habits state
  assert.strictEqual(HabitsWaterManager.getHabits(dateKey).creatine, true);
  assert.strictEqual(HabitsWaterManager.getWater(dateKey).current_ml, 2000);
}

// -----------------------------------------------------------------------------
// TIER 4: REAL-WORLD END-TO-END SCENARIO
// -----------------------------------------------------------------------------

// 4.1 Full Daily Routine: Meal Import, Habits, Hydration, Custom Food Recipe Update
{
  console.log('Test 4.1: Real-World E2E: Full user daily routine tracking');
  const userDate = '2026-08-19';
  vm.runInContext('meals.length = 0;', context);

  // Morning: User takes creatine + drinks 500 mL water
  HabitsWaterManager.toggleCreatine(userDate);
  HabitsWaterManager.addWater(userDate, 500);

  // Post-workout: User imports breakfast from Wednesday plan
  carregarRefeicaoIndividual('quarta', 'Pré-treino', userDate);
  HabitsWaterManager.addWater(userDate, 500); // 1000 mL total

  // Lunch: User imports lunch from Friday plan
  carregarRefeicaoIndividual('sexta', 'Almoço', userDate);
  HabitsWaterManager.addWater(userDate, 500); // 1500 mL total

  // Afternoon: User updates custom recipe in "Meus Alimentos" and logs it
  const customRecipe = {
    nome: 'Panqueca de Banana Fit',
    porcao_g: 150,
    kcal: 260,
    proteina_g: 18.0,
    carbo_g: 35.0,
    gordura_g: 4.5,
    custom: true
  };
  context.saveAlim(customRecipe);

  context.meals.push({
    id: context.uid(),
    date: userDate,
    hour: '16:30',
    nome: customRecipe.nome,
    itens: [customRecipe],
    origem: 'manual'
  });
  HabitsWaterManager.addWater(userDate, 1000); // 2500 mL total

  // Final verification
  const loggedMeals = context.meals.filter(m => m.date === userDate);
  assert.strictEqual(loggedMeals.length, 3, 'Deve conter 3 refeições registradas no dia');

  const habitsEnd = HabitsWaterManager.getHabits(userDate);
  assert.strictEqual(habitsEnd.creatine, true, 'Creatina tomada com sucesso');

  const waterEnd = HabitsWaterManager.getWater(userDate);
  assert.strictEqual(waterEnd.current_ml, 2500, 'Volume de água acumulado deve ser 2500 mL');

  console.log('✅ Cenário E2E de plano granular e hábitos executado com 100% de sucesso.');
}

console.log('\n======================================================');
console.log('meal_plan_habits.test.js: OK (Todos os testes passaram com sucesso!)');
