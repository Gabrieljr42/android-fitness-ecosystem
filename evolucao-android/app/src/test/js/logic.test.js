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
  removeEventListener: () => {},
  isSecureContext: false
};

const Progression = require('../../main/assets/core/progressao.js');

const context = {
  console: console,
  KEY: 'evolucao_treino_state',
  Progression: Progression,
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

loadScript('apps/evolucao/exercicios/nomes.js');
loadScript('apps/evolucao/dados.js');
loadScript('kernel/fmt.js');
loadScript('kernel/db.js');
loadScript('apps/evolucao/logic.js');

const {
  nextDay, sortedSessions, workSets, isWarmup,
  canonicalExerciseName, exerciseIdFor, aliasesForExercise,
  fmtClock, fmtDur, nkg, fmtBR, fmtBRfull,
  state
} = context;

console.log('Executando testes de logic.test.js...');

// 1. Rotação do Próximo Treino (nextDay: A -> B -> C -> A)
{
  state.sessions = [];
  assert.strictEqual(nextDay(), 'A', 'Sem sessões, o primeiro treino deve ser A');

  state.sessions = [{ id: 1, date: '2026-08-01', day: 'A', entries: {} }];
  assert.strictEqual(nextDay(), 'B', 'Após A, o próximo deve ser B');

  state.sessions = [
    { id: 1, date: '2026-08-01', day: 'A', entries: {} },
    { id: 2, date: '2026-08-03', day: 'B', entries: {} }
  ];
  assert.strictEqual(nextDay(), 'C', 'Após B, o próximo deve ser C');

  state.sessions.push({ id: 3, date: '2026-08-05', day: 'C', entries: {} });
  assert.strictEqual(nextDay(), 'A', 'Após C, deve rotacionar de volta para A');
}

// 2. Ordenação de Sessões (sortedSessions)
{
  state.sessions = [
    { id: 2, date: '2026-08-05', day: 'B' },
    { id: 1, date: '2026-08-01', day: 'A' },
    { id: 3, date: '2026-08-05', day: 'C' }
  ];

  const sorted = sortedSessions();
  assert.strictEqual(sorted[0].id, 1);
  assert.strictEqual(sorted[1].id, 2);
  assert.strictEqual(sorted[2].id, 3);
}

// 3. Filtragem de Séries de Aquecimento vs Séries de Trabalho
{
  const mixedSets = [
    { w: 20, r: 15, wu: true },
    { w: 40, r: 10, wu: true },
    { w: 80, r: 10, wu: false },
    { w: 80, r: 9, wu: false }
  ];

  assert.strictEqual(isWarmup(mixedSets[0]), true);
  assert.strictEqual(isWarmup(mixedSets[2]), false);

  const work = workSets(mixedSets);
  assert.strictEqual(work.length, 2, 'workSets deve ignorar as 2 séries de aquecimento');
  assert.strictEqual(work[0].w, 80);
  assert.strictEqual(work[1].w, 80);
}

// 4. Aliases Canônicos de Exercícios (nomes.js)
{
  assert.strictEqual(canonicalExerciseName('supino reto'), 'Supino reto c/ halteres');
  assert.strictEqual(canonicalExerciseName('agachamento no smith'), 'Agachamento na hack');
  assert.strictEqual(canonicalExerciseName('Puxada aberta'), 'Puxada aberta');

  const id1 = exerciseIdFor('Supino reto c/ halteres');
  const id2 = exerciseIdFor('supino reto');
  assert.strictEqual(id1, id2, 'Variações do mesmo exercício devem gerar o mesmo exerciseId');

  const aliases = aliasesForExercise('Supino reto c/ halteres');
  assert(aliases.indexOf('Supino reto') >= 0, 'Aliases devem conter a versão antiga');
}

// 5. Formatadores Utilitários (fmt.js)
{
  assert.strictEqual(fmtClock(90), '1:30');
  assert.strictEqual(fmtClock(45), '0:45');
  assert.strictEqual(fmtClock(180), '3:00');

  assert.strictEqual(fmtDur(45), '<1 min');
  assert.strictEqual(fmtDur(180), '3 min');
  assert.strictEqual(fmtDur(3700), '1h 1min');

  assert.strictEqual(nkg(82.5), '82,5');
  assert.strictEqual(nkg(100), '100');

  assert.strictEqual(fmtBR('2026-08-15'), '15/08');
  assert.strictEqual(fmtBRfull('2026-08-15'), '15/08/2026');
}

console.log('logic.test.js: OK');
