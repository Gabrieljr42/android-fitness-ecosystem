'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R5: IDs CANÔNICOS DE EXERCÍCIO + MIGRAÇÃO DE ESTADO LEGADO ===');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// MOCK DOM (mesmo padrão dos demais testes do projeto)
// -----------------------------------------------------------------------------
function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(),
    id: '',
    attributes: {},
    classList: {
      _classes: new Set(),
      add(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
      toggle(c, force) {
        if (force === true) { this._classes.add(c); return true; }
        if (force === false) { this._classes.delete(c); return false; }
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        this._classes.add(c); return true;
      },
      contains(c) { return this._classes.has(c); }
    },
    style: {}, children: [], parentElement: null,
    value: '', textContent: '', _innerHTML: '', onclick: null, listeners: {},
    addEventListener() {}, removeEventListener() {},
    setAttribute(name, val) { this.attributes[name] = String(val); },
    getAttribute(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; },
    removeAttribute(name) { delete this.attributes[name]; },
    hasAttribute(name) { return this.attributes[name] !== undefined; },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    scrollIntoView() {}, focus() {}, click() {},
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get() { return this._innerHTML; },
    set(val) { this._innerHTML = val; this.children = []; }
  });
  return el;
}

const ASSETS = path.resolve(__dirname, '../../main/assets');

function makeSandbox(preloadedStateJson) {
  const storage = {};
  if (preloadedStateJson != null) storage['evolucao_treino_state'] = preloadedStateJson;
  const localStorageMock = {
    getItem: k => (storage[k] !== undefined ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  };
  const appDiv = createMockElement('div'); appDiv.setAttribute('id', 'app');
  const toastDiv = createMockElement('div'); toastDiv.setAttribute('id', 'toast');

  const sandbox = {
    console, Date, Math, JSON, parseFloat, parseInt, isFinite, isNaN,
    String, Array, Object, Number, Set,
    setTimeout: fn => { fn(); return 1; }, clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
    localStorage: localStorageMock,
    document: {
      body: createMockElement('body'),
      getElementById: id => (id === 'app' ? appDiv : id === 'toast' ? toastDiv : null),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: t => createMockElement(t),
      addEventListener() {}
    },
    window: { addEventListener() {}, removeEventListener() {}, scrollTo() {} },
    toast() {}
  };
  vm.createContext(sandbox);

  const load = rel => vm.runInContext(fs.readFileSync(path.join(ASSETS, rel), 'utf8'), sandbox);
  // Ordem real do index.html: fmt → progressao → nomes → dados → db
  load('kernel/fmt.js');
  load('core/progressao.js');
  load('apps/evolucao/exercicios/nomes.js');
  load('apps/evolucao/dados.js');
  load('kernel/db.js');
  load('apps/evolucao/logic.js');
  return sandbox;
}

let passed = 0;

// =============================================================================
console.log('--- SUITE 1: gerador canônico (nomes.js) e fallback do db.js ---');
{
  const sb = makeSandbox();
  assert.strictEqual(typeof sb.exerciseIdFor, 'function',
    'exerciseIdFor deve existir quando db.js carrega (nomes.js no app real)');
  // Contrato alias-aware de nomes.js
  assert.strictEqual(sb.exerciseIdFor('Supino reto c/ halteres'), 'ex_supino-reto-c-halteres');
  assert.strictEqual(sb.exerciseIdFor('supino reto'), 'ex_supino-reto-c-halteres',
    'variação canônica deve gerar o MESMO id');
  assert.strictEqual(sb.exerciseIdFor('Leg press 45'), 'ex_leg-press-45');
  const exA = sb.state.ficha.A.ex[0];
  assert.strictEqual(exA.id, sb.exerciseIdFor(exA.n),
    'ficha default usa o gerador canônico (db.js não sombreia nomes.js)');
  console.log(`✅ Canônico ativo; "supino reto" ≡ "Supino reto c/ halteres" → ${exA.id}`);
  passed += 5;

  // Fallback: sandbox só com fmt+db (sem nomes.js) continua funcional
  const bare = {};
  bare.console = console; bare.String = String;
  vm.createContext(bare);
  vm.runInContext(fs.readFileSync(path.join(ASSETS, 'kernel/db.js'), 'utf8').split('var KEY')[0], bare);
  console.log('✅ Fallback de db.js isolado não quebra parse (guard por typeof).');
  passed += 1;
}

// =============================================================================
console.log('\n--- SUITE 2: migração normaliza IDs legados sem quebrar leitura ---');
{
  // 1) Estado atual (DEFAULT_STATE pós-migrate) vira base do "estado antigo"
  const fresh = makeSandbox();
  const legacy = JSON.parse(JSON.stringify(fresh.state));

  // 2) Corrompe os IDs para o formato underscore legado
  ['A', 'B', 'C'].forEach(d => {
    legacy.ficha[d].ex.forEach(e => { e.id = String(e.n).toLowerCase().replace(/\s+/g, '_'); });
  });

  // 3) Histórico realista indexado por NOME (como o app grava)
  const day = 'A';
  const exName = legacy.ficha.A.ex[0].n;
  legacy.sessions = [{
    id: 111, date: '2026-08-01', day, mode: 'normal', duration: 3600,
    entries: { [exName]: [{ w: 50, r: 10, rir: 2, done: true }] }
  }];

  // 4) Carrega o estado legado: migrate() roda durante o load()
  const sb = makeSandbox(JSON.stringify(legacy));
  const migratedEx = sb.state.ficha.A.ex.find(e => e.n === exName);
  assert(migratedEx, 'exercício legado preservado após migração');
  assert.strictEqual(migratedEx.id, sb.exerciseIdFor(exName),
    'ID legado em formato "_" normalizado para o canônico "-"');

  // 5) Idempotência
  const idsBefore = JSON.stringify(sb.state.ficha.A.ex.map(e => e.id));
  const twice = sb.migrate(JSON.parse(JSON.stringify(sb.state)));
  const idsAfter = JSON.stringify(twice.ficha.A.ex.map(e => e.id));
  assert.strictEqual(idsBefore, idsAfter, 'normalização de IDs é idempotente');

  // 6) Leitura antiga intacta: histórico por nome resolve e o motor calcula meta
  const histEntry = sb.entryForExercise(sb.state.sessions[0], exName, day);
  assert(Array.isArray(histEntry) && histEntry.length === 1 && histEntry[0].w === 50,
    'entries legados por nome continuam legíveis');
  const meta = sb.Progression.calcularMeta(sb.state.ficha, sb.state.sessions, day, exName, sb.state.settings.progressao);
  assert(meta && typeof meta.repsMeta === 'number' && meta.carga !== undefined,
    'calcularMeta funciona com estado migrado (matching por nome)');
  console.log(`✅ "${migratedEx.n}": id legado → "${migratedEx.id}"; meta: ${meta.carga}kg × ${meta.repsMeta}`);
  passed += 4;
}

console.log('\n================================================================');
if (passed >= 9) {
  console.log(`🎉 ALL ${passed} CANONICAL-ID TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`❌ Expected at least 9 assertions, got ${passed}`);
  process.exit(1);
}
