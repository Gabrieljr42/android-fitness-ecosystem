'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== [EVOLUÇÃO] SUÍTE DE TESTES: AUTO-RESET TIMER & INATIVIDADE ===');
console.log('=== R2: Timeout de Inatividade > 3h e Sanidade de Duração    ===');
console.log('================================================================\n');

function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(), id: '', attributes: {},
    classList: {
      _c: new Set(),
      add(c) { this._c.add(c); },
      remove(c) { this._c.delete(c); },
      toggle(c, force) {
        if (force === undefined) { if (this._c.has(c)) this._c.delete(c); else this._c.add(c); }
        else if (force) this._c.add(c);
        else this._c.delete(c);
      },
      contains(c) { return this._c.has(c); }
    },
    style: {}, children: [], parentElement: null,
    value: '', textContent: '', _innerHTML: '', onclick: null,
    addEventListener() {}, removeEventListener() {},
    setAttribute(n, v) { this.attributes[n] = String(v); },
    getAttribute(n) { return this.attributes[n] !== undefined ? this.attributes[n] : null; },
    hasAttribute(n) { return this.attributes[n] !== undefined; },
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
    scrollIntoView() {}, focus() {},
    click() { if (typeof this.onclick === 'function') this.onclick({ currentTarget: this }); },
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
    vibrate() {},
    dlg(cfg) { if (cfg && typeof cfg.onOk === 'function') cfg.onOk(cfg.segVal || true); },
    render() {
      if (typeof sandbox.checkDraftInactivity === 'function') sandbox.checkDraftInactivity();
      domNodes = parseHTMLToDOM(sandbox.renderTreino());
      sandbox.bindTreino();
    },
    mockStorage: storage
  };
  vm.createContext(sandbox);
  for (const rel of [
    'kernel/fmt.js', 'kernel/icons.js', 'kernel/charts.js', 'kernel/ui.js', 'kernel/notif.js',
    'core/progressao.js', 'apps/evolucao/dados.js', 'kernel/db.js', 'apps/evolucao/logic.js',
    'apps/evolucao/body-visualizer.js', 'apps/evolucao/views/treino.js'
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ASSETS, rel), 'utf8'), sandbox);
  }
  sandbox.dlg = function(cfg) { if (cfg && typeof cfg.onOk === 'function') cfg.onOk(cfg.segVal || true); };
  return sandbox;
}

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

console.log('--- TIER 1: Core Functional Inactivity & Schema Tests ---');

test('1.1: DEFAULT_STATE.draft & migrate() initialize lastActiveAt as null', () => {
  const sb = makeSandbox();
  assert.strictEqual(sb.DEFAULT_STATE.draft.lastActiveAt, null, 'DEFAULT_STATE.draft.lastActiveAt deve ser null');
  
  const migrated = sb.migrate({ draft: { day: 'A', date: '2026-08-27', entries: {} } });
  assert.strictEqual(migrated.draft.lastActiveAt, null, 'migrate() deve migrar lastActiveAt para null');
  assert.strictEqual(migrated.draft.startedAt, null, 'migrate() deve garantir startedAt');
});

test('1.2: Active workout draft within 3h is preserved (returns false)', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    dateExplicit: false,
    entries: { 'Supino reto c/ halteres': [{ w: 20, r: 10, done: true }] },
    warmupMode: {},
    startedAt: t0,
    lastActiveAt: t0 + 30 * 60 * 1000, // 30 min depois
    sessionMode: 'normal',
    unilateralPending: null
  };

  const checkTime = t0 + 60 * 60 * 1000; // 1 hora total (30 min desde última atividade)
  const reset = sb.checkDraftInactivity(checkTime);
  assert.strictEqual(reset, false, 'Treino com atividade há 30 min não deve expirar');
  assert.strictEqual(Object.keys(sb.state.draft.entries).length, 1, 'Entradas devem permanecer');
  assert.strictEqual(sb.state.draft.startedAt, t0, 'startedAt deve ser mantido');
});

test('1.3: Draft with inactivity > 3h is auto-reset to clean state', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    dateExplicit: false,
    entries: { 'Supino reto c/ halteres': [{ w: 20, r: 10, done: true }] },
    warmupMode: {},
    startedAt: t0,
    lastActiveAt: t0,
    sessionMode: 'normal',
    unilateralPending: null
  };

  const checkTime = t0 + (3 * 3600 * 1000) + 5000; // 3 horas e 5 segundos depois
  const reset = sb.checkDraftInactivity(checkTime);
  assert.strictEqual(reset, true, 'checkDraftInactivity deve retornar true após 3h');
  assert.strictEqual(sb.state.draft.startedAt, null, 'startedAt deve ser resetado para null');
  assert.strictEqual(sb.state.draft.lastActiveAt, null, 'lastActiveAt deve ser resetado para null');
  assert.strictEqual(Object.keys(sb.state.draft.entries).length, 0, 'entries devem ser limpas');
});

test('1.4: ensureDraft() checks inactivity and refreshes expired draft', () => {
  const sb = makeSandbox();
  const t0 = Date.now() - (4 * 3600 * 1000); // 4 horas atrás
  sb.state.draft = {
    day: 'B',
    date: '2026-08-27',
    dateExplicit: false,
    entries: { 'Puxada aberta': [{ w: 50, r: 10, done: true }] },
    warmupMode: {},
    startedAt: t0,
    lastActiveAt: t0,
    sessionMode: 'normal',
    unilateralPending: null
  };

  sb.ensureDraft();
  assert.strictEqual(sb.state.draft.startedAt, null, 'ensureDraft deve evadir draft inativo');
  assert.strictEqual(Object.keys(sb.state.draft.entries).length, 0, 'entries devem estar vazias');
  assert.strictEqual(sb.state.draft.lastActiveAt, null, 'lastActiveAt deve ser null');
});

test('1.5: UI Live Timer contains id="liveDur" and updates properly', () => {
  const sb = makeSandbox();
  const html = sb.renderTreino();
  assert(html.includes('id="liveDur"'), 'HTML do treino deve conter id="liveDur"');
  assert(html.includes('Pronto para registrar'), 'Antes de iniciar deve exibir Pronto para registrar');
  
  sb.render();
  const liveEl = sb.document.getElementById('liveDur');
  assert(liveEl != null, 'Elemento #liveDur deve existir no DOM da aba Treino');
});

console.log('\n--- TIER 2: Boundary Value Analysis (3h Boundary & Duration Sanity) ---');

test('2.1: Exactly 2h 59m 59s inactivity (10,799,000 ms) is NOT expired', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'A', date: '2026-08-27', entries: { 'Supino reto c/ halteres': [{ w: 20, r: 10 }] },
    startedAt: t0, lastActiveAt: t0
  };
  const reset = sb.checkDraftInactivity(t0 + 10799000);
  assert.strictEqual(reset, false, '10,799,000 ms (<3h) não deve resetar o draft');
  assert.strictEqual(sb.state.draft.startedAt, t0);
});

test('2.2: Exactly 3h inactivity (10,800,000 ms) is NOT expired (strict inequality)', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'A', date: '2026-08-27', entries: { 'Supino reto c/ halteres': [{ w: 20, r: 10 }] },
    startedAt: t0, lastActiveAt: t0
  };
  const reset = sb.checkDraftInactivity(t0 + 10800000);
  assert.strictEqual(reset, false, 'Exatamente 10,800,000 ms não deve resetar o draft');
});

test('2.3: Exactly 3h + 1ms (10,800,001 ms) triggers auto-reset', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'A', date: '2026-08-27', entries: { 'Supino reto c/ halteres': [{ w: 20, r: 10 }] },
    startedAt: t0, lastActiveAt: t0
  };
  const reset = sb.checkDraftInactivity(t0 + 10800001);
  assert.strictEqual(reset, true, '10,800,001 ms (>3h) deve resetar o draft');
  assert.strictEqual(sb.state.draft.startedAt, null);
});

test('2.4: Extreme staleness jump (38h 59min = 140,340,000 ms) cleanly resets draft', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'A', date: '2026-08-25', entries: { 'Supino reto c/ halteres': [{ w: 30, r: 8 }] },
    startedAt: t0, lastActiveAt: t0
  };
  const reset = sb.checkDraftInactivity(t0 + 140340000);
  assert.strictEqual(reset, true, '38h 59m deve ser categoricamente resetado');
  assert.strictEqual(sb.state.draft.startedAt, null);
  assert.strictEqual(Object.keys(sb.state.draft.entries).length, 0);
});

test('2.5: Saved workout duration in state.sessions is capped at 3 hours (10,800s)', () => {
  const sb = makeSandbox();
  const t0 = Date.now() - (2 * 3600 * 1000); // 2h atrás
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    dateExplicit: false,
    entries: { 'Supino reto c/ halteres': [{ w: 40, r: 10, done: true }] },
    warmupMode: {},
    startedAt: t0,
    lastActiveAt: Date.now(), // ativo agora
    sessionMode: 'normal',
    unilateralPending: null
  };
  sb.promptFinishSession();
  assert.strictEqual(sb.state.sessions.length, 1);
  const session = sb.state.sessions[0];
  assert(session.duration <= 10800, 'Duração nunca deve exceder 10800 segundos (3h)');
  assert(session.duration >= 7190, 'Duração de 2h deve ser preservada com exatidão');
});

console.log('\n--- TIER 3: Cross-Feature Integration Tests ---');

test('3.1: Resetting due to inactivity clears unilateralPending state', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'B',
    date: '2026-08-27',
    entries: { 'Serrote (remada unilateral)': [{ w: 22, r: 10 }] },
    startedAt: t0,
    lastActiveAt: t0,
    unilateralPending: { ex: 'Serrote (remada unilateral)', setIndex: 0, side: 1 }
  };
  sb.checkDraftInactivity(t0 + 12000000);
  assert.strictEqual(sb.state.draft.unilateralPending, null, 'unilateralPending deve ser anulado no reset');
});

test('3.2: Resetting due to inactivity resets rest timer if running', () => {
  const sb = makeSandbox();
  sb.startRest(90, 'Supino');
  assert.strictEqual(sb.rest.on, true, 'Rest timer deve estar ligado');
  
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    entries: { 'Supino reto c/ halteres': [{ w: 20, r: 10 }] },
    startedAt: t0,
    lastActiveAt: t0
  };
  sb.checkDraftInactivity(t0 + 12000000);
  assert.strictEqual(sb.rest.on, false, 'Rest timer deve ser desligado após reset por inatividade');
});

test('3.3: Resetting due to inactivity resets numeric keypad state', () => {
  const sb = makeSandbox();
  sb.kbdW = '45';
  sb.kbdR = '10';
  sb.kbdOpen = true;
  sb.kbdEdit = { si: 0 };
  
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    entries: { 'Supino reto c/ halteres': [{ w: 20, r: 10 }] },
    startedAt: t0,
    lastActiveAt: t0
  };
  sb.checkDraftInactivity(t0 + 12000000);
  assert.strictEqual(sb.kbdOpen, false, 'Teclado deve ser fechado');
  assert.strictEqual(sb.kbdW, '', 'Buffer do teclado deve ser limpo');
});

test('3.4: LocalStorage receives cleared draft on inactivity reset', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    entries: { 'Supino reto c/ halteres': [{ w: 20, r: 10 }] },
    startedAt: t0,
    lastActiveAt: t0
  };
  sb.save();
  assert(sb.mockStorage.evolucao_treino_state.includes('Supino reto c/ halteres'));

  sb.checkDraftInactivity(t0 + 12000000);
  const reloaded = JSON.parse(sb.mockStorage.evolucao_treino_state);
  assert.strictEqual(reloaded.draft.startedAt, null, 'LocalStorage deve persistir startedAt=null');
  assert.deepStrictEqual(reloaded.draft.entries, {}, 'LocalStorage deve persistir entries={}');
});

test('3.5: Legacy drafts without lastActiveAt use startedAt as anchor', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    entries: { 'Supino reto c/ halteres': [{ w: 20, r: 10 }] },
    startedAt: t0,
    lastActiveAt: null // ou undefined em estado legado
  };
  
  // Dentro de 1h: preserva
  const res1 = sb.checkDraftInactivity(t0 + 3600000);
  assert.strictEqual(res1, false, 'Legacy draft dentro de 1h não deve expirar');
  
  // Acima de 3h: expira usando startedAt
  const res2 = sb.checkDraftInactivity(t0 + 12000000);
  assert.strictEqual(res2, true, 'Legacy draft > 3h deve expirar via fallback startedAt');
});

console.log('\n--- TIER 4: Real-World Scenarios (Scenario 3 & Workloads) ---');

test('4.1: Scenario 3: Abandoned workout draft (1 set logged, idle 4h) is evicted upon reopen', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  
  // Usuário começa treino, loga 1 série
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    dateExplicit: false,
    entries: { 'Supino reto c/ halteres': [{ w: 45, r: 8, done: true }] },
    warmupMode: {},
    startedAt: t0,
    lastActiveAt: t0,
    sessionMode: 'normal',
    unilateralPending: null
  };
  sb.save();
  
  // Usuário fecha o app e volta 4 horas depois
  const tReturn = t0 + (4 * 3600 * 1000);
  sb.checkDraftInactivity(tReturn);
  sb.ensureDraft();
  sb.render();
  
  const html = sb.renderTreino();
  assert(html.includes('Pronto para registrar'), 'Timer mostra Pronto para registrar');
  assert(html.includes('id="liveDur"'), 'HTML contém id="liveDur"');
  const liveEl = sb.document.getElementById('liveDur');
  assert(liveEl != null, 'Elemento #liveDur existe no DOM');
  assert.strictEqual(sb.state.sessions.length, 0, 'Nenhuma sessão corrompida foi gravada');
});

test('4.2: Active multi-hour workout (2h 30m) with periodic sets is never reset', () => {
  const sb = makeSandbox();
  const t0 = 1700000000000;
  
  // Início
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    dateExplicit: false,
    entries: {},
    warmupMode: {},
    startedAt: t0,
    lastActiveAt: t0,
    sessionMode: 'normal',
    unilateralPending: null
  };
  
  // Série a cada 25 minutos durante 2h30m (6 séries)
  let currTime = t0;
  for (let i = 0; i < 6; i++) {
    currTime += 25 * 60 * 1000;
    const reset = sb.checkDraftInactivity(currTime);
    assert.strictEqual(reset, false, `Série ${i + 1} aos ${i * 25 + 25}min não deve causar reset`);
    sb.state.draft.entries['Supino reto c/ halteres'] = sb.state.draft.entries['Supino reto c/ halteres'] || [];
    sb.state.draft.entries['Supino reto c/ halteres'].push({ w: 40 + i, r: 8, done: true });
    sb.state.draft.lastActiveAt = currTime;
  }
  
  // Ao final (2h 30m = 150m), o treino continua perfeitamente ativo
  assert.strictEqual(sb.state.draft.startedAt, t0, 'startedAt inicial é mantido');
  assert.strictEqual(sb.state.draft.entries['Supino reto c/ halteres'].length, 6, 'Todas as 6 séries presentes');
});

test('4.3: User interaction via #mfWarmAdd updates lastActiveAt and starts timer', () => {
  const sb = makeSandbox();
  sb.render();
  
  assert.strictEqual(sb.state.draft.startedAt, null);
  assert.strictEqual(sb.state.draft.lastActiveAt, null);
  
  const warmAddBtn = sb.document.getElementById('mfWarmAdd');
  assert(warmAddBtn != null, '#mfWarmAdd deve existir');
  warmAddBtn.click();
  
  assert(sb.state.draft.startedAt != null, 'startedAt deve ser preenchido');
  assert(sb.state.draft.lastActiveAt != null, 'lastActiveAt deve ser preenchido');
});

test('4.4: promptFinishSession prevents saving inactive abandoned session (>3h)', () => {
  const sb = makeSandbox();
  const t0 = Date.now() - (5 * 3600 * 1000); // 5h atrás
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    dateExplicit: false,
    entries: { 'Supino reto c/ halteres': [{ w: 40, r: 8, done: true }] },
    warmupMode: {},
    startedAt: t0,
    lastActiveAt: t0,
    sessionMode: 'normal',
    unilateralPending: null
  };
  
  sb.promptFinishSession();
  assert.strictEqual(sb.state.sessions.length, 0, 'Nenhuma sessão deve ser salva quando expirada por inatividade');
  assert.strictEqual(sb.state.draft.startedAt, null, 'Draft deve ser resetado');
});

test('4.5: Multiple sequential workouts with rest intervals between them', () => {
  const sb = makeSandbox();
  // Treino 1 (Manhã)
  sb.state.draft = {
    day: 'A',
    date: '2026-08-27',
    entries: { 'Supino reto c/ halteres': [{ w: 30, r: 10, done: true }] },
    startedAt: Date.now() - 30 * 60 * 1000,
    lastActiveAt: Date.now(),
    warmupMode: {},
    sessionMode: 'normal'
  };
  sb.promptFinishSession();
  assert.strictEqual(sb.state.sessions.length, 1);
  assert.strictEqual(sb.state.draft.startedAt, null);
  assert.strictEqual(sb.state.draft.lastActiveAt, null);
  
  // Novo treino (Tarde)
  sb.ensureDraft();
  assert.strictEqual(sb.state.draft.startedAt, null);
  sb.state.draft.startedAt = Date.now();
  sb.state.draft.lastActiveAt = Date.now();
  sb.state.draft.entries['Puxada aberta'] = [{ w: 40, r: 10, done: true }];
  sb.promptFinishSession();
  assert.strictEqual(sb.state.sessions.length, 2);
});

console.log('\n================================================================');
console.log(`🎉 TODOS OS ${passed} DE ${total} TESTES DE TIMER & INATIVIDADE PASSARAM COM SUCESSO!`);
console.log('================================================================');
