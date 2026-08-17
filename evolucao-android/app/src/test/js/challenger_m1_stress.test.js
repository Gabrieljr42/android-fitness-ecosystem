'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// Load kernel modules in a sandbox
function setupMockDOM() {
  const elements = new Map();
  function makeElement(tag, id = '', className = '') {
    const listeners = {};
    const attrs = {};
    const classes = new Set(className ? className.split(' ') : []);
    const el = {
      tagName: tag.toUpperCase(),
      id: id,
      className: className,
      value: '',
      textContent: '',
      innerHTML: '',
      style: {},
      onclick: null,
      oninput: null,
      onchange: null,
      _tm: null,
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        toggle: (c, force) => {
          if (force !== undefined) {
            force ? classes.add(c) : classes.delete(c);
          } else {
            classes.has(c) ? classes.delete(c) : classes.add(c);
          }
          return classes.has(c);
        },
        contains: (c) => classes.has(c)
      },
      getAttribute: (k) => attrs[k] !== undefined ? attrs[k] : null,
      setAttribute: (k, v) => { attrs[k] = String(v); },
      removeAttribute: (k) => { delete attrs[k]; },
      querySelector: (sel) => null,
      querySelectorAll: (sel) => [],
      focus: () => {}
    };
    return el;
  }

  const doc = {
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, makeElement('div', id));
      }
      return elements.get(id);
    },
    querySelector: (sel) => null,
    querySelectorAll: (sel) => [],
    body: makeElement('body', 'body')
  };

  return { doc, elements };
}

const { doc } = setupMockDOM();

const sandbox = {
  document: doc,
  window: {
    AndroidBridge: {
      sendNotification: (t, b) => {},
      vibrate: (ms) => {},
      startRestNotification: (l, e, a) => {},
      stopRestNotification: () => {},
      restDoneNotification: (l, a) => {}
    }
  },
  navigator: {},
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  Date: Date,
  Math: Math,
  Number: Number,
  String: String,
  Array: Array,
  isFinite: isFinite,
  isNaN: isNaN
};
vm.createContext(sandbox);

const rootDir = path.resolve(__dirname, '../../../../..');
const fmtCode = fs.readFileSync(path.join(rootDir, 'kernel/fmt.js'), 'utf8');
const chartsCode = fs.readFileSync(path.join(rootDir, 'kernel/charts.js'), 'utf8');
const uiCode = fs.readFileSync(path.join(rootDir, 'kernel/ui.js'), 'utf8');
const iconsCode = fs.readFileSync(path.join(rootDir, 'kernel/icons.js'), 'utf8');

vm.runInContext(fmtCode, sandbox);
vm.runInContext(chartsCode, sandbox);
vm.runInContext(uiCode, sandbox);
vm.runInContext(iconsCode, sandbox);

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('✅ ' + name);
    passed++;
  } catch (e) {
    console.error('❌ ' + name + ' -> ' + e.message);
    failed++;
  }
}

console.log('=== SUITE 1: KERNEL CHARTS STRESS TESTING ===');

test('chartSVG: handles empty array, null, undefined without crashing', () => {
  const r1 = sandbox.chartSVG([]);
  assert(r1.includes('empty') && r1.includes('2 treinos'), 'Must return empty state HTML');
  const r2 = sandbox.chartSVG(null);
  assert(r2.includes('empty'), 'Null must return empty state');
  const r3 = sandbox.chartSVG(undefined);
  assert(r3.includes('empty'), 'Undefined must return empty state');
});

test('chartSVG: handles single point without crashing', () => {
  const r = sandbox.chartSVG([{ x: '2026-08-16', y: 100 }]);
  assert(r.includes('empty'), 'Single point must return empty state');
});

test('chartSVG: handles flat curve (identical y values) without NaN/Inf', () => {
  const r = sandbox.chartSVG([
    { x: '2026-08-10', y: 80 },
    { x: '2026-08-12', y: 80 },
    { x: '2026-08-14', y: 80 }
  ]);
  assert(r.includes('<svg') && r.includes('<polyline'), 'Must render SVG');
  assert(!r.includes('NaN'), 'Must not contain NaN');
  assert(!r.includes('Infinity'), 'Must not contain Infinity');
});

test('chartSVG: handles all 0 values without NaN/Inf', () => {
  const r = sandbox.chartSVG([
    { x: '2026-08-10', y: 0 },
    { x: '2026-08-12', y: 0 }
  ]);
  assert(!r.includes('NaN') && !r.includes('Infinity'), 'Zero values must not produce NaN/Inf');
});

test('chartSVG: handles negative values correctly', () => {
  const r = sandbox.chartSVG([
    { x: '2026-08-10', y: -20 },
    { x: '2026-08-12', y: -5 },
    { x: '2026-08-14', y: -15 }
  ]);
  assert(!r.includes('NaN') && !r.includes('Infinity'), 'Negative values must not produce NaN/Inf');
});

test('chartSVG: handles non-numeric / malformed data gracefully', () => {
  const r = sandbox.chartSVG([
    { x: '2026-08-10', y: 'invalid' },
    { x: '2026-08-12', y: null },
    { x: '2026-08-14', y: NaN }
  ]);
  assert(!r.includes('NaN') && !r.includes('Infinity'), 'Malformed values mapped to 0, no NaN in output');
});

test('chartSVG: handles high-volume dataset (10,000 points) under 200ms', () => {
  const bigData = [];
  for (let i = 0; i < 10000; i++) {
    bigData.push({ x: '2026-01-01', y: Math.sin(i / 10) * 50 + 100 });
  }
  const t0 = Date.now();
  const r = sandbox.chartSVG(bigData);
  const dur = Date.now() - t0;
  assert(dur < 200, 'Rendering 10,000 points took ' + dur + 'ms (expected < 200ms)');
  assert(!r.includes('NaN') && !r.includes('Infinity'), 'High volume has no NaN/Inf');
});

test('paceChartSVG: handles empty, single point, flat pace, zeros', () => {
  const empty = sandbox.paceChartSVG([]);
  assert(empty.includes('empty') && empty.includes('2 corridas'), 'Empty pace chart');
  const flat = sandbox.paceChartSVG([
    { x: '2026-08-10', y: 300 },
    { x: '2026-08-12', y: 300 }
  ]);
  assert(!flat.includes('NaN') && !flat.includes('Infinity'), 'Flat pace has no NaN');
  const zeros = sandbox.paceChartSVG([
    { x: '2026-08-10', y: 0 },
    { x: '2026-08-12', y: 0 }
  ]);
  assert(!zeros.includes('NaN') && !zeros.includes('Infinity'), 'Zero pace has no NaN');
});

test('fmtPaceValue: converts seconds to m:ss and handles extremes', () => {
  assert.strictEqual(sandbox.fmtPaceValue(300), '5:00');
  assert.strictEqual(sandbox.fmtPaceValue(335), '5:35');
  assert.strictEqual(sandbox.fmtPaceValue(0), '0:00');
  assert.strictEqual(sandbox.fmtPaceValue(-50), '0:00');
  assert.strictEqual(sandbox.fmtPaceValue(NaN), '0:00');
  assert.strictEqual(sandbox.fmtPaceValue(Infinity), '0:00');
});

test('sparklineSVG: compact inline sparklines with edge cases', () => {
  assert.strictEqual(sandbox.sparklineSVG([]), '');
  assert.strictEqual(sandbox.sparklineSVG(null), '');
  const s = sandbox.sparklineSVG([10, 20, 15, 25]);
  assert(s.includes('<svg') && s.includes('<polyline'), 'Sparkline SVG output');
  assert(!s.includes('NaN') && !s.includes('Infinity'), 'No NaN in sparkline');
});

console.log('\n=== SUITE 2: KERNEL FMT STRESS TESTING ===');

test('esc: XSS sanitization and edge cases', () => {
  assert.strictEqual(sandbox.esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(sandbox.esc('"Hello & Goodbye"'), '&quot;Hello &amp; Goodbye&quot;');
  assert.strictEqual(sandbox.esc(123), '123');
  assert.strictEqual(sandbox.esc(null), 'null');
  assert.strictEqual(sandbox.esc(undefined), 'undefined');
});

test('fmtBR and fmtBRfull: ISO date formatting', () => {
  assert.strictEqual(sandbox.fmtBR('2026-08-16'), '16/08');
  assert.strictEqual(sandbox.fmtBRfull('2026-08-16'), '16/08/2026');
  assert.strictEqual(sandbox.fmtBR(''), '');
  assert.strictEqual(sandbox.fmtBR(null), '');
  assert.strictEqual(sandbox.fmtBR('invalid'), 'invalid');
});

test('nkg: decimal separator and rounding', () => {
  assert.strictEqual(sandbox.nkg(10.5), '10,5');
  assert.strictEqual(sandbox.nkg(10), '10');
  assert.strictEqual(sandbox.nkg(10.56), '10,6');
  assert.strictEqual(sandbox.nkg(0), '0');
  assert.strictEqual(sandbox.nkg(null), '0');
  assert.strictEqual(sandbox.nkg('25.4'), '25,4');
});

test('fmtClock & fmtDur: time formatting boundaries', () => {
  assert.strictEqual(sandbox.fmtClock(0), '0:00');
  assert.strictEqual(sandbox.fmtClock(65), '1:05');
  assert.strictEqual(sandbox.fmtClock(-10), '0:00');
  assert.strictEqual(sandbox.fmtDur(0), '<1 min');
  assert.strictEqual(sandbox.fmtDur(45), '<1 min');
  assert.strictEqual(sandbox.fmtDur(120), '2 min');
  assert.strictEqual(sandbox.fmtDur(3600), '1h');
  assert.strictEqual(sandbox.fmtDur(3900), '1h 5min');
});

test('e1rm: 1RM calculation formula', () => {
  assert.strictEqual(sandbox.e1rm(100, 1), 100);
  assert.strictEqual(sandbox.e1rm(100, 0), 100);
  assert.strictEqual(sandbox.e1rm(100, 10), 100 * (1 + 10/30));
  assert.strictEqual(sandbox.e1rm(0, 10), 0);
  assert.strictEqual(sandbox.e1rm(null, null), 0);
});

test('todayISO: returns valid YYYY-MM-DD', () => {
  const iso = sandbox.todayISO();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(iso), 'ISO date format matching');
});

console.log('\n=== SUITE 3: KERNEL UI & CALENDAR STRESS TESTING ===');

test('daysInMonth: handles leap years and month lengths', () => {
  assert.strictEqual(sandbox.daysInMonth(2024, 1), 29); // Feb 2024 (leap)
  assert.strictEqual(sandbox.daysInMonth(2025, 1), 28); // Feb 2025 (non-leap)
  assert.strictEqual(sandbox.daysInMonth(2026, 6), 31); // July 2026
  assert.strictEqual(sandbox.daysInMonth(2026, 3), 30); // April 2026
});

test('dowShort: correctly identifies day of week', () => {
  assert.strictEqual(sandbox.dowShort('2026-08-16'), 'dom'); // Sunday
  assert.strictEqual(sandbox.dowShort('2026-08-17'), 'seg'); // Monday
  assert.strictEqual(sandbox.dowShort('2026-08-22'), 'sáb'); // Saturday
});

test('calendarHTML: renders complete month grid with header and day names', () => {
  sandbox.openCal('2026-08-16');
  const html = sandbox.calendarHTML('2026-08-16');
  assert(html.includes('Agosto 2026'), 'Month header must contain Agosto 2026');
  assert(html.includes('sel') && html.includes('calcell'), 'Selected date must have calcell and sel classes');
  assert(html.includes('data-iso="2026-08-16"'), 'Grid cell with data-iso attribute');
});

test('rest timer: start, adjust, pause, resume, done lifecycle', () => {
  sandbox.startRest(60, 'Supino');
  assert.strictEqual(sandbox.rest.on, true, 'Rest timer should be active');
  assert.strictEqual(sandbox.rest.label, 'Supino', 'Rest timer label preserved');
  assert(sandbox.restLeft() > 58 && sandbox.restLeft() <= 60, 'Remaining time computed accurately');

  // Adjust rest
  sandbox.adjustRest(30);
  assert(sandbox.restLeft() > 88, 'Adjusting rest increases duration');

  // Negative delta clamping
  sandbox.adjustRest(-500);
  assert(sandbox.restLeft() >= 0, 'Negative delta should not produce negative end time');

  // Pause rest
  sandbox.toggleRest();
  assert.strictEqual(sandbox.rest.on, false, 'Rest timer should pause');

  // Resume rest
  sandbox.toggleRest();
  assert.strictEqual(sandbox.rest.on, true, 'Rest timer should resume');

  // Hide rest
  sandbox.hideRest();
  assert.strictEqual(sandbox.rest.on, false, 'Hide rest stops timer');
});

console.log('\n=== SUITE 4: KERNEL ICONS STRESS TESTING ===');

test('iconFor: maps Portuguese & English exercise names across all 16 categories', () => {
  assert.strictEqual(sandbox.iconFor('Supino Reto com Barra'), 'press');
  assert.strictEqual(sandbox.iconFor('Crucifixo Inclinado'), 'fly');
  assert.strictEqual(sandbox.iconFor('Elevação Lateral'), 'lateral');
  assert.strictEqual(sandbox.iconFor('Tríceps Corda'), 'triceps');
  assert.strictEqual(sandbox.iconFor('Rosca Direta Biceps'), 'curl');
  assert.strictEqual(sandbox.iconFor('Puxada Alta Pulldown'), 'pulldown');
  assert.strictEqual(sandbox.iconFor('Remada Curvada Row'), 'row');
  assert.strictEqual(sandbox.iconFor('Abdominal Core Prancha'), 'core');
  assert.strictEqual(sandbox.iconFor('Agachamento Livre Squat'), 'squat');
  assert.strictEqual(sandbox.iconFor('Leg Press 45'), 'legpress');
  assert.strictEqual(sandbox.iconFor('Levantamento Terra'), 'hinge');
  assert.strictEqual(sandbox.iconFor('Cadeira Extensora'), 'legext');
  assert.strictEqual(sandbox.iconFor('Mesa Flexora'), 'legcurl');
  assert.strictEqual(sandbox.iconFor('Panturrilha Sentado'), 'calf');
  assert.strictEqual(sandbox.iconFor('Cadeira Adutora'), 'hip');
  assert.strictEqual(sandbox.iconFor('Exercício Desconhecido XYZ'), 'dumbbell');
  assert.strictEqual(sandbox.iconFor(''), 'dumbbell');
  assert.strictEqual(sandbox.iconFor(null), 'dumbbell');
});

test('navIcon: renders SVG for all 10 app navigation tabs', () => {
  const tabs = ['treino', 'corrida', 'progresso', 'historico', 'ficha', 'hoje', 'diario', 'alimentos', 'metas', 'ajustes'];
  tabs.forEach(t => {
    const svg = sandbox.navIcon(t);
    assert(svg.includes('<svg') && svg.includes('viewBox="0 0 24 24"'), 'Nav icon for ' + t);
  });
});

console.log('\n========================================');
console.log('FINAL RESULTS: ' + passed + ' passed, ' + failed + ' failed.');
if (failed > 0) process.exit(1);
