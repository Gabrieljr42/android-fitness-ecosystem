'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('=== R5 NT: XSS, BACKUP SEM CHAVE, RESTAURE VALIDADO, WIPE    ===');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Harness
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
    removeAttribute(n) { delete this.attributes[n]; },
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

function makeNTContext() {
  const storage = new Map();
  const localStorageMock = {
    getItem: k => storage.has(k) ? storage.get(k) : null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
    clear: () => storage.clear()
  };

  const byId = {};
  ['main', 'modal', 'toast', 'dataHoje'].forEach(id => {
    const el = createMockElement(id === 'main' ? 'main' : 'div');
    el.setAttribute('id', id);
    byId[id] = el;
  });
  byId.myAlimsList = createMockElement('div');
  byId.refList = createMockElement('div');
  byId.busca = createMockElement('input');
  byId.pPorc = createMockElement('input'); // input do modal addRef (calcPrev)
  byId.pPorc.value = '100';
  byId.prevBox = createMockElement('div');  // preview de macros do modal

  const navEl = createMockElement('nav'); navEl.setAttribute('id', 'nav');
  navEl.querySelectorAll = () => [];

  const backups = [];
  const win = {
    addEventListener() {}, removeEventListener() {},
    AndroidBridge: {
      saveBackup(json) { backups.push(json); },
      cancelAllAlarms() { win.__alarmsCancelled = true; },
      vibrate() {}
    }
  };

  const documentMock = {
    querySelector(sel) {
      if (sel === '#main') return byId.main;
      if (sel === '#modal') return byId.modal;
      if (sel === '#toast') return byId.toast;
      if (sel === '#dataHoje') return byId.dataHoje;
      if (sel === '#nav') return navEl;
      if (sel === '#myAlimsList') return byId.myAlimsList;
      if (sel === '#refList') return byId.refList;
      if (sel === '#busca') return byId.busca;
      if (sel === '#modalBack') { const b = createMockElement('div'); b.classList.add = () => {}; b.classList.remove = () => {}; return b; }
      if (typeof sel === 'string' && sel.startsWith('#')) return byId[sel.slice(1)] || null;
      return null;
    },
    querySelectorAll() { return []; },
    getElementById(id) { return byId[id] || null; },
    createElement: t => createMockElement(t),
    addEventListener() {}, body: createMockElement('body')
  };

  const ctx = {
    console, Date, Math, JSON, parseFloat, parseInt, isFinite, isNaN,
    String, Array, Object, Number, Boolean, RegExp, Promise,
    localStorage: localStorageMock,
    document: documentMock,
    window: win,
    $: sel => documentMock.querySelector(sel),
    $$: () => [],
    toast(msg) { byId.toast.innerHTML = String(msg); },
    openModal(html) { byId.modal.innerHTML = html; win.__modalOpen = true; },
    closeModal() { win.__modalOpen = false; },
    FileReader: function () { this.readAsText = function () { setTimeout(() => this.onload(), 0); }; },
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    setInterval: () => 1, clearInterval() {}
  };
  vm.createContext(ctx);

  const base = path.resolve(__dirname, '../../main/assets/apps/nutricao');
  const load = rel => vm.runInContext(fs.readFileSync(path.join(base, rel), 'utf8'), ctx);
  load('estado.js');       // escapeHtml compartilhado + datas locais
  load('referencia.js');
  load('logic.js');
  load('nav.js');
  load('views/hoje.js');
  load('views/diario.js');
  load('views/alimentos.js');
  load('views/metas.js');
  load('views/ajustes.js');

  // No navegador, propriedades de window SÃO globais. Ponte equivalente:
  // exporta para o contexto tudo que as views penduraram em window.
  for (const k of Object.keys(win)) {
    if (!(k in ctx)) { try { ctx[k] = win[k]; } catch (e) { /* getters hostis */ } }
  }

  const G = expr => vm.runInContext(expr, ctx);
  return {
    ctx, G, win, backups, storage, byId,
    mealsArr: G('meals')
  };
}

let passed = 0;

// =============================================================================
console.log('--- SUITE 1: escapeHtml compartilhado existe e escapa ---');
{
  const h = makeNTContext();
  assert.strictEqual(typeof h.ctx.escapeHtml, 'function', 'escapeHtml global via estado.js');
  assert.strictEqual(h.ctx.escapeHtml('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  assert.strictEqual(h.ctx.escapeHtml("O'Brien & Co"), "O&#39;Brien &amp; Co");
  console.log('OK escapeHtml disponivel para todas as views.');
  passed += 3;
}

// =============================================================================
console.log('\n--- SUITE 2: nome de refeicao malicioso nao injeta HTML em Hoje ---');
{
  const h = makeNTContext();
  const evil = '<img src=x onerror="window.__pwned=1">';
  h.mealsArr.push({
    id: 'm1', date: h.G('today()'), hour: '12:00',
    nome: evil,
    itens: [{ nome: '<svg onload="x">Arroz', porcao_g: 100, kcal: 130 }],
    origem: 'manual'
  });
  const html = h.win.renderListaMeals(h.G('dayMeals()'));
  assert(!html.includes('<img src=x'), 'payload img nao pode virar tag real');
  assert(html.includes('&lt;img src=x'), 'nome aparece escapado como texto');
  assert(html.includes('&lt;svg onload='), 'nome de item tambem escapado');

  h.mealsArr.length = 0;
  h.mealsArr.push({ id: '" onmouseover="x', date: h.G('today()'), hour: '12:00', nome: 'ok', itens: [{ nome: 'a', kcal: 1 }], origem: 'manual' });
  const html2 = h.win.renderListaMeals(h.G('dayMeals()'));
  assert(!html2.includes('" onmouseover="x"'), 'id hostil nao quebra atributo');
  console.log('OK sinks de Hoje escapam nome/hora/itens/id.');
  passed += 4;

  console.log('\n--- SUITE 2b: renderHoje ponta-a-ponta com payload ---');
  h.mealsArr.length = 0;
  h.mealsArr.push({ id: 'm9', date: h.G('today()'), hour: '12:00', nome: evil, itens: [{ nome: 'a', kcal: 10 }], origem: 'manual' });
  h.win.renderHoje(h.byId.main);
  const rendered = h.byId.main.innerHTML;
  assert(!rendered.includes('<img src=x'), 'renderHoje nao injeta payload bruto');
  assert(rendered.includes('&lt;img src=x'), 'payload presente apenas como texto');
  console.log('OK renderHoje (fluxo completo) seguro.');
  passed += 2;
}

// =============================================================================
console.log('\n--- SUITE 3: alimentos - aspas/tags em nomes nao viram handlers ---');
{
  const h = makeNTContext();
  const evilName = 'X" onclick="alert(1)';
  const taggy = '<b>Whey</b>';
  h.win.saveAlim({ nome: evilName, porcao_g: 100, kcal: 100, proteina_g: 1, carbo_g: 2, gordura_g: 3, custom: true });
  h.win.saveAlim({ nome: taggy, porcao_g: 100, kcal: 120, proteina_g: 24, carbo_g: 3, gordura_g: 1.5, custom: true });
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  h.ctx.renderCustomAlimsList();
  const out = h.byId.myAlimsList.innerHTML;
  if (process.env.R5_DEBUG) console.log('[custom list]\n' + out.slice(0, 1500));
  // A forma crua `" onclick="` (aspas + handler) só existe se houver quebra
  // de atributo; na forma escapada vira `&quot; onclick=&quot;`.
  assert(!out.includes('" onclick="'), 'nenhum elemento carrega handler inline injetado');
  assert(!/<[a-z]+ [^>]*onclick=/i.test(out), 'nenhuma tag do template emite onclick');
  assert(out.includes('data-add-alim='), 'usa delegacao por indice');
  assert(out.includes('X&quot; onclick=&quot;alert(1)'), 'nome hostil aparece escapado');

  h.ctx.filtrarRef();
  const refOut = h.byId.refList.innerHTML;
  if (process.env.R5_DEBUG) console.log('[ref list]\n' + refOut.slice(0, 1500));
  assert(!refOut.includes(`addRef('${evilName}`), 'sem interpolacao de nome em handler inline');
  assert(refOut.includes(esc(taggy)), 'tag-like escapado como texto');
  assert(refOut.includes('data-pick-alim='), 'linhas de busca tambem delegam');
  console.log('OK Alimentos usa delegacao index-based; nomes hostis inertes.');
  passed += 5;

  console.log('\n--- SUITE 3b: addRef(nome) publico segue funcionando (compat) ---');
  let modalCaptured = '';
  h.win.openModal = html => { modalCaptured = html; };
  h.ctx.openModal = h.win.openModal;
  h.win.addRef(evilName);
  assert(modalCaptured.includes(esc(evilName)), 'modal do alimento escapa o nome');
  console.log('OK API publica addRef intacta.');
  passed += 1;
}

// =============================================================================
console.log('\n--- SUITE 4: backup NAO contem a chave da API ---');
{
  const h = makeNTContext();
  h.storage.set('nt_apikey', 'AIzaSYNTHETIC_KEY_FOR_TEST_123456');
  h.G("apikey = 'AIzaSYNTHETIC_KEY_FOR_TEST_123456';");
  h.win.doBackup();
  assert.strictEqual(h.backups.length, 1, 'backup capturado via bridge');
  const parsed = JSON.parse(h.backups[0]);
  assert(!('apikey' in parsed), 'campo apikey ausente do backup');
  assert(!h.backups[0].includes('AIzaSYNTHETIC'), 'valor da chave nao aparece no JSON exportado');
  assert(Array.isArray(parsed.meals), 'dados normais continuam no backup');
  assert(parsed.profile && typeof parsed.profile === 'object', 'profile preservado');
  console.log('OK export sem chave; dados do usuario preservados.');
  passed += 5;
}

// =============================================================================
console.log('\n--- SUITE 5: restauracao ignora apikey e valida forma (compat antiga) ---');
{
  const h = makeNTContext();
  const legacyBackup = {
    meals: [{ id: 'x', date: '2026-08-20', hour: '09:00', nome: 'Cafe', itens: [{ nome: 'Pao', kcal: 150 }] }],
    activities: [{ id: 'a1', date: '2026-08-20', kcal: 300 }],
    profile: { kcal: 2000 },
    alims: [{ nome: 'Mineiro', kcal: 500 }],
    reminders: [{ id: 'r1', nome: 'Almoco', hora: '12:30', ativo: true }],
    habits: { '2026-08-20': { creatina: true } },
    water: { '2026-08-20': 1500 },
    apikey: 'AIzaOLD_LEAKED_IN_FILE',
    pref: { precisao: 'rapida', paralelo: true }
  };
  const imported = h.win.applyBackupData(legacyBackup);
  assert(imported.length >= 7, 'maioria dos blocos importados (' + imported.join(',') + ')');
  assert(!h.G('apikey').includes('AIzaOLD'), 'apikey do arquivo NAO e importada');
  assert.strictEqual(JSON.parse(h.storage.get('nt_meals')).length, 1, 'refeicoes legadas importadas');
  assert.strictEqual(JSON.parse(h.storage.get('nt_reminders'))[0].hora, '12:30', 'lembretes validos preservados');

  const waterBefore = h.storage.get('nt_water');
  const mealsBefore = h.storage.get('nt_meals');
  const junk = { meals: 'not-an-array', profile: 42, water: [], habits: [1, 2], pref: 'x', reminders: [{ nome: 7 }] };
  const importedJunk = h.win.applyBackupData(junk);
  // Blocos de forma errada são rejeitados; lembretes em forma de array são
  // SANITIZADOS (nome string, hora padrão) — contrato deliberado.
  // (deepStrictEqual falha entre realms de vm; compara via JSON)
  assert.strictEqual(JSON.stringify(importedJunk), JSON.stringify(['lembretes']),
    'apenas lembretes (sanitizados) passam');
  const rem = JSON.parse(h.storage.get('nt_reminders'));
  assert.strictEqual(rem[0].nome, '7');
  assert.strictEqual(rem[0].hora, '08:00');
  assert.strictEqual(h.storage.get('nt_meals'), mealsBefore, 'boas refeicoes preservadas apos lixo');
  assert.strictEqual(h.storage.get('nt_water'), waterBefore, 'water com forma errada nao toca storage');
  console.log('OK import compativel com legado, imune a lixo, sem chave.');
  passed += 6;
}

// =============================================================================
console.log('\n--- SUITE 6: wipeAll usa modal do app (confirm() morto na WebView) ---');
{
  const h = makeNTContext();
  h.storage.set('nt_meals', JSON.stringify([{ id: 'keep', date: '2026-08-20', hour: '1', nome: 'x', itens: [] }]));
  h.G("meals = JSON.parse(localStorage.getItem('nt_meals'));");
  h.win.wipeAll();
  assert(h.byId.modal.innerHTML.includes('Apagar todos os dados'), 'modal de confirmacao aberto (conteudo)');
  assert(JSON.parse(h.storage.get('nt_meals')).length === 1, 'dados INTACTOS antes da confirmacao');
  h.win.confirmWipeAll();
  assert.strictEqual(h.storage.get('nt_meals'), undefined, 'storage limpo apos confirmar');
  assert(h.win.__alarmsCancelled === true, 'alarmes nativos cancelados');
  assert(h.G('meals').length === 0, 'estado em memoria zerado');
  console.log('OK wipe funcional: modal -> confirmacao -> limpeza.');
  passed += 4;
}

console.log('\n================================================================');
if (passed >= 30) {
  console.log(`ALL ${passed} NUTRITRACK SECURITY TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`Expected >= 30 assertion markers, got ${passed}`);
  process.exit(1);
}
