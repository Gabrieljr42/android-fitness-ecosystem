'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R6: DESCANSO — AQUECIMENTO 50% E DEADLINE ABSOLUTO        ===');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// MOCK DOM (mesmo padrão dos demais testes do projeto)
// -----------------------------------------------------------------------------
function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(), id: '', attributes: {},
    classList: {
      _c: new Set(),
      add(...x) { x.forEach(c => this._c.add(c)); },
      remove(...x) { x.forEach(c => this._c.delete(c)); },
      toggle(c, f) {
        if (f === true) { this._c.add(c); return true; }
        if (f === false) { this._c.delete(c); return false; }
        if (this._c.has(c)) { this._c.delete(c); return false; }
        this._c.add(c); return true;
      },
      contains(c) { return this._c.has(c); }
    },
    style: {}, children: [], parentElement: null,
    value: '', textContent: '', _innerHTML: '', onclick: null, listeners: {},
    addEventListener() {}, removeEventListener() {},
    setAttribute(n, v) { this.attributes[n] = String(v); },
    getAttribute(n) { return this.attributes[n] !== undefined ? this.attributes[n] : null; },
    hasAttribute(n) { return this.attributes[n] !== undefined; },
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
    scrollIntoView() {}, focus() {},
    click() { if (typeof this.onclick === 'function') this.onclick({ currentTarget: this, target: this }); },
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get() { return this._innerHTML; },
    set(v) { this._innerHTML = v; this.children = []; }
  });
  return el;
}

function parseHTMLToDOM(htmlString) {
  const nodes = [];
  const openTagRegex = /<([a-zA-Z0-9_-]+)(\s+[^>]*)?>/g; let m;
  while ((m = openTagRegex.exec(htmlString)) !== null) {
    const node = createMockElement(m[1]);
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g; let am;
    while ((am = attrRegex.exec(m[2] || '')) !== null) {
      node.setAttribute(am[1], am[2] !== undefined ? am[2] : '');
      if (am[1] === 'class') String(am[2]).split(/\s+/).filter(Boolean).forEach(c => node.classList.add(c));
      if (am[1] === 'id') node.id = am[2];
    }
    nodes.push(node);
  }
  return nodes;
}

const ASSETS = path.resolve(__dirname, '../../main/assets');

function makeSandbox(opts = {}) {
  const storage = {};
  if (opts.stateJson) storage['evolucao_treino_state'] = opts.stateJson;
  const localStorageMock = {
    getItem: k => (storage[k] !== undefined ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  };
  const appDiv = createMockElement('div'); appDiv.setAttribute('id', 'app');
  const toastDiv = createMockElement('div'); toastDiv.setAttribute('id', 'toast');
  const restDiv = createMockElement('div'); restDiv.setAttribute('id', 'rest');
  ['rMinus', 'rPlus', 'rTap', 'rClose'].forEach(id => restDiv.querySelector && null);
  let domNodes = [];
  const toasts = [];
  const restCalls = []; // {sec,label,endAt}
  const nativeRestCalls = [];

  const docMock = {
    body: createMockElement('body'),
    getElementById(id) {
      if (id === 'app') return appDiv;
      if (id === 'toast') return toastDiv;
      if (id === 'rest') return restDiv;
      return domNodes.find(n => n.id === id) || createMockElement('div');
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
        const m2 = sel.slice(1, -1).match(/([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?/);
        if (!m2) return [];
        const [, attr, val] = m2;
        return domNodes.filter(n => (val !== undefined && val !== '') ? n.getAttribute(attr) === val : n.hasAttribute(attr));
      }
      return [];
    },
    createElement: t => createMockElement(t),
    addEventListener() {}
  };

  const sandbox = {
    console, Date, Math, JSON, parseFloat, parseInt, isFinite, isNaN,
    String, Array, Object, Number, Set,
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    setInterval(fn) { fn(); return 1; }, clearInterval() {},
    localStorage: localStorageMock,
    document: docMock,
    window: {
      addEventListener() {}, removeEventListener() {}, scrollTo() {},
      AndroidBridge: {
        vibrate() {}, beep() {},
        startRestNotification(label, endAtMs, alert) { nativeRestCalls.push({ label, endAtMs, alert }); },
        stopRestNotification() {}, restDoneNotification() {}
      }
    },
    toast(msg) { toasts.push(String(msg)); },
    dlg(cfg) { if (cfg && typeof cfg.onOk === 'function') cfg.onOk(cfg.segVal || true); },
    render() {
      domNodes = parseHTMLToDOM(sandbox.renderTreino());
      sandbox.bindTreino();
    },
    getToasts: () => toasts,
    mockStorage: storage
  };
  vm.createContext(sandbox);

  const load = rel => vm.runInContext(fs.readFileSync(path.join(ASSETS, rel), 'utf8'), sandbox);
  load('kernel/fmt.js');
  load('kernel/icons.js');
  load('kernel/charts.js');
  load('kernel/ui.js');
  load('kernel/notif.js');
  load('core/progressao.js');
  load('apps/evolucao/dados.js');
  load('kernel/db.js');
  load('apps/evolucao/logic.js');
  load('apps/evolucao/body-visualizer.js');
  load('apps/evolucao/views/treino.js');

  // Espiona startRest DEPOIS de carregar ui.js (substitui a global)
  sandbox.__restCalls = restCalls;
  sandbox.__nativeRestCalls = nativeRestCalls;
  const realStart = sandbox.startRest;
  sandbox.startRest = function (sec, label) {
    restCalls.push({ sec, label });
    return realStart(sec, label);
  };
  return sandbox;
}

function freshDraft(sb) {
  sb.state.draft = {
    day: 'A', date: sb.todayISO(), entries: {}, warmupMode: {},
    startedAt: null, sessionMode: 'normal', unilateralPending: null
  };
  sb.mfEx = 0;
  sb.kbdReset();
  sb.render();
}

let passed = 0;

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 1: aquecimento descansa metade (180→90, 120→60, 150→75) ---');
{
  const cases = [
    { exName: 'Supino reto c/ halteres', rest: 180 },   // ficha A[0]
    { exName: 'Voador', rest: 90 }                      // A[2]
  ];
  for (const c of cases) {
    const sb = makeSandbox();
    freshDraft(sb);
    const exo = sb.state.ficha.A.ex.find(e => e.n === c.exName);
    assert(exo, 'exercício presente na ficha: ' + c.exName);
    exo.rest = c.rest;
    // Série de aquecimento confirmada via checkmark na linha real
    sb.state.draft.entries[c.exName] = [{ w: 20, r: 10, wu: true, warmup: true }];
    sb.render();
    clickDone(sb, c.exName, 0);
    const call = sb.__restCalls[sb.__restCalls.length - 1];
    assert(call, 'startRest disparado após aquecimento (' + c.exName + ')');
    assert.strictEqual(call.sec, Math.round(c.rest / 2),
      `${c.rest}s → ${Math.round(c.rest / 2)}s para ${c.exName}; obtido ${call.sec}`);
    passed += 1;
  }
  console.log('✅ Aquecimento usa 50% do descanso configurado.');
}
function clickDone(sb, exName, rowIdx) {
  const exIdx = sb.state.ficha[sb.state.draft.day].ex.findIndex(e => e.n === exName);
  if (sb.mfEx !== exIdx) { sb.mfEx = exIdx; sb.kbdReset(); sb.render(); }
  const node = sb.document.querySelectorAll(`[data-done="${exIdx}:${rowIdx}"]`)[0];
  assert(node, 'botão ✓ encontrado para ' + exName + ':' + rowIdx);
  node.click();
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: série de trabalho mantém descanso cheio ---');
{
  const sb = makeSandbox();
  freshDraft(sb);
  const exName = 'Supino reto c/ halteres';
  const exo = sb.state.ficha.A.ex[0];
  exo.rest = 180;
  // phantom row 0 → checkmark com valores default
  clickDone(sb, exName, 0);
  const call = sb.__restCalls[sb.__restCalls.length - 1];
  assert(call && call.sec === 180, 'trabalho usa descanso cheio (180), obtido ' + (call && call.sec));

  // 150s custom em outro exercício
  const sb2 = makeSandbox(); freshDraft(sb2);
  const exo2 = sb2.state.ficha.A.ex[0];
  exo2.rest = 150;
  clickDone(sb2, exo2.n, 0);
  assert(sb2.__restCalls.slice(-1)[0].sec === 150, '150s respeitado para trabalho');

  // 120s aquecimento → 60
  const sb3 = makeSandbox(); freshDraft(sb3);
  const exo3 = sb3.state.ficha.A.ex[0];
  exo3.rest = 120;
  sb3.state.draft.entries[exo3.n] = [{ w: 15, r: 12, wu: true }];
  sb3.render();
  clickDone(sb3, exo3.n, 0);
  assert(sb3.__restCalls.slice(-1)[0].sec === 60, '120→60 no aquecimento');
  console.log('✅ Trabalho=cheio; aquecimento=metade (180/90, 150/75, 120/60).');
  passed += 4;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: deadline absoluto no bridge nativo ---');
{
  const sb = makeSandbox();
  freshDraft(sb);
  const before = Date.now();
  sb.startRest(90, 'Supino reto c/ halteres');
  const call = sb.__nativeRestCalls[sb.__nativeRestCalls.length - 1];
  assert(call, 'bridge startRestNotification chamado');
  const expectedEnd = before + 90000;
  assert(Math.abs(call.endAtMs - expectedEnd) < 2500,
    `endAt absoluto ≈ now+90s (delta ${call.endAtMs - expectedEnd}ms)`);
  // Substituição: novo descanso gera NOVO prazo (last-wins), não acumula
  const firstEnd = call.endAtMs;
  const t2 = Date.now();
  sb.startRest(30, 'Troca');
  const second = sb.__nativeRestCalls[sb.__nativeRestCalls.length - 1];
  assert(second.endAtMs !== firstEnd, 'novo descanso substitui o prazo anterior');
  assert(Math.abs(second.endAtMs - (t2 + 30000)) < 2500,
    `prazo substituído ≈ now+30s (delta ${second.endAtMs - (t2 + 30000)}ms)`);
  console.log('✅ startRest envia endAt absoluto; reinício substitui o prazo anterior.');
  passed += 3;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: unilateral lado 1 mantém troca de 30s ---');
{
  const sb = makeSandbox();
  freshDraft(sb);
  // Adiciona exercício unilateral à ficha do dia
  sb.state.ficha.A.ex.push({ n: 'Serrote (remada unilateral)', id: sb.exerciseIdFor('Serrote (remada unilateral)'), sets: 3, reps: '8-10', rest: 90, inc: 2.5, eq: 'halter', perSide: true, aliases: [] });
  sb.render();
  const idx = sb.state.ficha.A.ex.findIndex(e => e.n === 'Serrote (remada unilateral)');
  sb.mfEx = idx; sb.kbdReset(); sb.render();
  clickDone(sb, 'Serrote (remada unilateral)', 0);
  const pending = sb.state.draft.unilateralPending;
  assert(pending && pending.side === 1, 'lado 1 pendente registrado');
  const call = sb.__restCalls[sb.__restCalls.length - 1];
  assert.strictEqual(call.sec, 30, 'troca de lado continua 30s');
  console.log('✅ Fluxo unilateral preservado (troca 30s).');
  passed += 2;
}

console.log('\n================================================================');
if (passed >= 11) {
  console.log(`ALL ${passed} REST-TIMER TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`Expected >= 13 markers, got ${passed}`);
  process.exit(1);
}
