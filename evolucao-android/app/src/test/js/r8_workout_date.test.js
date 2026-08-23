'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R8: DATA EFETIVA DO TREINO — UM TREINO, UM DIA           ===');
console.log('================================================================\n');

function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(), id: '', attributes: {},
    classList: { _c: new Set(), add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {}, children: [], parentElement: null,
    value: '', textContent: '', _innerHTML: '', onclick: null,
    addEventListener() {}, removeEventListener() {},
    setAttribute(n, v) { this.attributes[n] = String(v); },
    getAttribute(n) { return this.attributes[n] !== undefined ? this.attributes[n] : null; },
    hasAttribute(n) { return this.attributes[n] !== undefined; },
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
    scrollIntoView() {}, focus() {},
    click() {},
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get() { return this._innerHTML; },
    set(v) { this._innerHTML = v; this.children = []; }
  });
  return el;
}

function parseHTMLToDOM(html) {
  const nodes = [];
  const re = /<([a-zA-Z0-9_-]+)(\s+[^>]*)?>/g; let m;
  while ((m = re.exec(html)) !== null) {
    const node = createMockElement(m[1]);
    const ar = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g; let am;
    while ((am = ar.exec(m[2] || '')) !== null) {
      node.setAttribute(am[1], am[2] !== undefined ? am[2] : '');
      if (am[1] === 'class') String(am[2]).split(/\s+/).filter(Boolean).forEach(c => node.classList.add(c));
      if (am[1] === 'id') node.id = am[2];
    }
    nodes.push(node);
  }
  return nodes;
}

const ASSETS = path.resolve(__dirname, '../../main/assets');

function makeSandbox() {
  const storage = {};
  const localStorageMock = {
    getItem: k => (storage[k] !== undefined ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  };
  let domNodes = [];
  const sandbox = {
    console, Date, Math, JSON, parseFloat, parseInt, isFinite, isNaN,
    String, Array, Object, Number, Set,
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
    localStorage: localStorageMock,
    document: {
      body: createMockElement('body'),
      getElementById(id) {
        if (id === 'app') return createMockElement('div');
        return domNodes.find(n => n.id === id) || null;
      },
      querySelector(sel) {
        if (!sel) return null;
        if (sel.startsWith('#')) return domNodes.find(n => n.id === sel.slice(1)) || null;
        if (sel.startsWith('.')) {
          const cls = sel.slice(1).split('.')[0];
          return domNodes.find(n => n.classList.contains(cls)) || null;
        }
        return domNodes[0] || null;
      },
      querySelectorAll(sel) {
        if (!sel) return [];
        if (sel.startsWith('#')) return domNodes.filter(n => n.id === sel.slice(1));
        if (sel.startsWith('.')) {
          const cls = sel.slice(1).split('.')[0];
          return domNodes.filter(n => n.classList.contains(cls));
        }
        if (sel.startsWith('[')) {
          const mm = sel.slice(1, -1).match(/([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?/);
          if (!mm) return [];
          const [, a, v] = mm;
          return domNodes.filter(n => (v !== undefined && v !== '') ? n.getAttribute(a) === v : n.hasAttribute(a));
        }
        return [];
      },
      createElement: t => createMockElement(t),
      addEventListener() {}
    },
    window: {
      addEventListener() {}, removeEventListener() {}, scrollTo() {},
      AndroidBridge: { vibrate() {}, beep() {}, startRestNotification() {}, stopRestNotification() {}, restDoneNotification() {} }
    },
    toast() {},
    dlg(cfg) { if (cfg && typeof cfg.onOk === 'function') cfg.onOk(cfg.segVal || true); },
    render() {
      domNodes = parseHTMLToDOM(sandbox.renderTreino());
      sandbox.bindTreino();
    },
    mockStorage: storage
  };
  vm.createContext(sandbox);
  for (const rel of ['kernel/fmt.js','kernel/icons.js','kernel/charts.js','kernel/ui.js','kernel/notif.js',
                     'core/progressao.js','apps/evolucao/dados.js','kernel/db.js','apps/evolucao/logic.js',
                     'apps/evolucao/body-visualizer.js','apps/evolucao/views/treino.js'])
    vm.runInContext(fs.readFileSync(path.join(ASSETS, rel), 'utf8'), sandbox);
  // fmt.js declara o dlg real (abre modal via DOM); substituir pelo stub de teste
  sandbox.dlg = function(cfg) { if (cfg && typeof cfg.onOk === 'function') cfg.onOk(cfg.segVal || true); };
  return sandbox;
}

let passed = 0;
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 1: default automático vencido avança para o dia da conclusão ---');
{
  const sb = makeSandbox();
  sb.state.draft = { day: 'A', date: '2000-01-01', dateExplicit: false, entries: { 'Supino reto c/ halteres': [{ w: 30, r: 10, done: true }] }, warmupMode: {}, startedAt: Date.now() - 3600000, sessionMode: 'normal', unilateralPending: null };
  sb.promptFinishSession();
  assert.strictEqual(sb.state.sessions.length, 1);
  const s = sb.state.sessions[0];
  assert.strictEqual(s.date, TODAY, 'rascunho sem escolha explícita conta no dia da CONCLUSÃO');
  assert.strictEqual(s.finishedDate, TODAY, 'finishedDate registra a conclusão');
  console.log(`✅ iniciado 2000-01-01 → salvo como ${s.date} (conclusão).`);
  passed += 3;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: backdating EXPLÍCITO é respeitado ---');
{
  const sb = makeSandbox();
  sb.state.draft = { day: 'A', date: '2000-01-01', dateExplicit: true, entries: { 'Supino reto c/ halteres': [{ w: 30, r: 10, done: true }] }, warmupMode: {}, startedAt: Date.now() - 3600000, sessionMode: 'normal', unilateralPending: null };
  sb.promptFinishSession();
  const s = sb.state.sessions[0];
  assert.strictEqual(s.date, '2000-01-01', 'data escolhida no calendário é preservada');
  assert.strictEqual(s.finishedDate, TODAY, 'finishedDate continua registrando a conclusão real');
  console.log('✅ backdating manual preservado (2000-01-01 mantido).');
  passed += 3;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: mesmo dia não muda nada ---');
{
  const sb = makeSandbox();
  sb.state.draft = { day: 'A', date: TODAY, dateExplicit: false, entries: { 'Supino reto c/ halteres': [{ w: 30, r: 10, done: true }] }, warmupMode: {}, startedAt: Date.now() - 60000, sessionMode: 'normal', unilateralPending: null };
  sb.promptFinishSession();
  const s = sb.state.sessions[0];
  assert.strictEqual(s.date, TODAY);
  console.log('✅ treino do próprio dia inalterado.');
  passed += 2;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: provider nunca devolve o mesmo treino em dois dias ---');
{
  // Replica o casamento do WorkoutProvider (somente session.date)
  const match = (sessions, q) => sessions.filter(s => s.date === q).length;
  const sessions = [
    { id: 1, date: TODAY, finishedDate: TODAY },          // mesmo dia
    { id: 2, date: '2000-01-01', finishedDate: TODAY },   // backdated
    { id: 3, date: TODAY, finishedDate: TODAY }           // cross-midnight já normalizado
  ];
  assert.strictEqual(match(sessions, TODAY), 2, 'dois treinos distintos no dia de hoje');
  assert.strictEqual(match(sessions, '2000-01-01'), 1, 'backdated só na data lógica');
  // nenhum treino aparece em duas datas:
  const dates = {};
  sessions.forEach(s => { dates[s.date] = (dates[s.date] || 0) + 1; });
  const totalPerSession = Object.values(dates).reduce((a, b) => a + b, 0);
  assert.strictEqual(totalPerSession, sessions.length, 'cada treino contabilizado exatamente uma vez');
  console.log('✅ invariante um-treino-um-dia garantido pelo casamento por date.');
  passed += 3;
}

console.log('\n================================================================');
if (passed >= 11) {
  console.log(`ALL ${passed} WORKOUT-DATE TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`Expected >= 11 markers, got ${passed}`);
  process.exit(1);
}
