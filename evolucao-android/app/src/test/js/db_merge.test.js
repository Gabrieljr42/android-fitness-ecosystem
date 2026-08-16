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

// Cria um sandbox para carregar os scripts do kernel
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

// Carrega os módulos necessários
const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

loadScript('apps/evolucao/exercicios/nomes.js');
loadScript('apps/evolucao/dados.js');
loadScript('kernel/fmt.js');
loadScript('kernel/db.js');

const { mergeState, migrate, migrateEntryFlags, DEFAULT_STATE } = context;

console.log('Executando testes de db_merge.test.js...');

// 1. Teste de Deduplicação e Merge de Sessões
{
  const curState = {
    sessions: [
      { id: 1, date: '2026-08-01', day: 'A', mode: 'normal', entries: { 'Supino reto': [{ w: 80, r: 10 }] } },
      { id: 2, date: '2026-08-03', day: 'B', mode: 'normal', entries: { 'Puxada aberta': [{ w: 60, r: 12 }] } }
    ],
    peso: [{ date: '2026-08-01', kg: 75.0 }],
    ficha: JSON.parse(JSON.stringify(DEFAULT_STATE.ficha)),
    draft: { day: null, date: null, entries: {} },
    settings: DEFAULT_STATE.settings
  };

  const incomingState = {
    sessions: [
      // Sessão idêntica (deve ser deduplicada)
      { id: 10, date: '2026-08-01', day: 'A', mode: 'normal', entries: { 'Supino reto': [{ w: 80, r: 10 }] } },
      // Sessão nova (deve ser adicionada)
      { id: 3, date: '2026-08-05', day: 'C', mode: 'normal', entries: { 'Leg press 45': [{ w: 200, r: 10 }] } }
    ],
    peso: [
      { date: '2026-08-01', kg: 74.5 }, // Data conflitante: curState deve vencer
      { date: '2026-08-05', kg: 75.5 }  // Pesagem nova
    ],
    ficha: {
      A: { nome: 'Peito custom', ex: [{ n: 'Crucifixo 30° c/ halteres', sets: 3, reps: '10-12' }] }
    }
  };

  const result = mergeState(curState, incomingState);

  assert.strictEqual(result.addedSessions, 1, 'Deveria ter adicionado exatamente 1 sessão nova');
  assert.strictEqual(result.state.sessions.length, 3, 'Total de sessões deve ser 3');
  assert.strictEqual(result.addedPeso, 1, 'Deveria ter adicionado 1 pesagem nova');
  assert.strictEqual(result.state.peso.length, 2, 'Total de pesagens deve ser 2');

  // Confere se o dado atual venceu no conflito de data de pesagem
  const p1 = result.state.peso.find(p => p.date === '2026-08-01');
  assert.strictEqual(p1.kg, 75.0, 'Pesagem existente não deve ser sobrescrita em conflito');

  // Confere se o exercício extra da ficha foi incluído sem apagar os existentes
  const exA = result.state.ficha.A.ex;
  assert(exA.some(e => e.n === 'Crucifixo 30° c/ halteres'), 'Exercício novo da ficha deve ser mesclado');
}

// 2. Teste de Migração de Schema e Flags (warmup e RIR)
{
  const oldEntries = {
    'Supino reto': [
      { w: 40, r: 15, warmup: true },
      { w: 80, r: 8, warmup: false, rir: 2 },
      { w: 85, r: 6, rir: 99 }, // RIR inválido > 6 (deve ser clamped para 6)
      { w: 90, r: 4, rir: 'inválido' } // RIR string inválida (deve ser deletado)
    ]
  };

  migrateEntryFlags(oldEntries);

  assert.strictEqual(oldEntries['Supino reto'][0].wu, true, 'Flag warmup antiga deve migrar para wu');
  assert.strictEqual(oldEntries['Supino reto'][1].wu, false, 'Flag warmup:false deve migrar para wu:false');
  assert.strictEqual(oldEntries['Supino reto'][1].rir, 2, 'RIR 2 deve permanecer 2');
  assert.strictEqual(oldEntries['Supino reto'][2].rir, 6, 'RIR > 6 deve ser limitado a 6');
  assert.strictEqual(oldEntries['Supino reto'][3].rir, undefined, 'RIR não numérico deve ser removido');
}

// 3. Teste de Migração de Estado Vazio / Incompleto
{
  const partialState = {
    sessions: [{ id: 1, date: '2026-08-01', day: 'A', entries: {} }]
  };

  const migrated = migrate(partialState);

  assert(migrated.settings && migrated.settings.progressao, 'Settings e progressao devem ser inicializados');
  assert.strictEqual(migrated.settings.progressao.targetRir, 2, 'targetRir default deve ser 2');
  assert.strictEqual(migrated.sessions[0].mode, 'normal', 'Session mode default deve ser normal');
  assert(Array.isArray(migrated.peso), 'Array de peso deve ser garantido');
  assert(migrated.ficha && migrated.ficha.A && migrated.ficha.B && migrated.ficha.C, 'Ficha A, B e C devem existir');
}

console.log('db_merge.test.js: OK');
