'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER M1 REMEDIATION: ADVERSARIAL HARNESS ===');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Helper: DOM and Environment Mock for VM Context
// -----------------------------------------------------------------------------
function createMockEnvironment() {
  const elements = new Map();

  function createElement(tag, id = '', className = '') {
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
      getAttribute: (k) => (attrs[k] !== undefined ? attrs[k] : null),
      setAttribute: (k, v) => { attrs[k] = String(v); },
      removeAttribute: (k) => { delete attrs[k]; },
      addEventListener: (evt, h) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(h);
      },
      removeEventListener: (evt, h) => {
        if (!listeners[evt]) return;
        listeners[evt] = listeners[evt].filter(fn => fn !== h);
      },
      dispatchEvent: (evt) => {
        if (listeners[evt.type]) {
          listeners[evt.type].forEach(fn => fn(evt));
        }
      },
      querySelectorAll: (sel) => {
        if (sel === 'button') {
          return Array.from(elements.values()).filter(e => e.tagName === 'BUTTON');
        }
        return [];
      },
      querySelector: (sel) => null
    };
    return el;
  }

  const metaTheme = { name: 'theme-color', content: '' };

  const doc = {
    _elements: elements,
    body: createElement('body'),
    createElement: (tag) => createElement(tag),
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, createElement('div', id));
      }
      return elements.get(id);
    },
    querySelector: (sel) => {
      if (sel === 'meta[name="theme-color"]') return metaTheme;
      if (sel.startsWith('#')) return doc.getElementById(sel.slice(1));
      return createElement('div');
    },
    querySelectorAll: (sel) => []
  };

  const win = {
    scrollTo: (x, y) => { win._lastScroll = { x, y }; },
    _lastScroll: { x: 0, y: 0 }
  };

  const ctx = {
    console: console,
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
    document: doc,
    window: win,
    metaTheme: metaTheme,
    tab: 'treino',
    weekCount: () => 2,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
  };

  vm.createContext(ctx);

  const baseDir = path.resolve(__dirname, '../../main/assets');
  const loadScript = (relPath) => {
    const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
    vm.runInContext(code, ctx);
  };

  return { ctx, loadScript, doc, win, metaTheme };
}

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✅ Passed [${totalTests}]: ${name}`);
  } catch (err) {
    console.error(`❌ FAILED [${totalTests}]: ${name}`);
    console.error(err);
    throw err;
  }
}

// =============================================================================
// SUITE 1: kernel/charts.js ADVERSARIAL STRESS TESTING
// =============================================================================
console.log('--- SUITE 1: kernel/charts.js Adversarial Stress Testing ---');

const { ctx: chartCtx, loadScript: loadChartScript } = createMockEnvironment();
loadChartScript('kernel/fmt.js');
loadChartScript('kernel/charts.js');

// 1.1 fmtPaceValue Boundary & Fuzzing
runTest('fmtPaceValue handles 0, negatives, decimals, string-numbers, NaNs and Infinity', () => {
  const { fmtPaceValue } = chartCtx;
  assert.strictEqual(fmtPaceValue(0), '0:00');
  assert.strictEqual(fmtPaceValue(-1), '0:00');
  assert.strictEqual(fmtPaceValue(-9999), '0:00');
  assert.strictEqual(fmtPaceValue(NaN), '0:00');
  assert.strictEqual(fmtPaceValue(Infinity), '0:00');
  assert.strictEqual(fmtPaceValue(-Infinity), '0:00');
  assert.strictEqual(fmtPaceValue(null), '0:00');
  assert.strictEqual(fmtPaceValue(undefined), '0:00');
  assert.strictEqual(fmtPaceValue('invalid'), '0:00');

  // Exact math checks
  assert.strictEqual(fmtPaceValue(60), '1:00');
  assert.strictEqual(fmtPaceValue(61), '1:01');
  assert.strictEqual(fmtPaceValue(300), '5:00');
  assert.strictEqual(fmtPaceValue(325.4), '5:25'); // rounding
  assert.strictEqual(fmtPaceValue(325.6), '5:26');
  assert.strictEqual(fmtPaceValue(3600), '60:00');
});

// 1.2 chartSVG Empty / Boundary States
runTest('chartSVG returns empty placeholder for empty, null, undefined, and single points', () => {
  const { chartSVG } = chartCtx;
  assert(chartSVG(null).includes('class="empty"'));
  assert(chartSVG(undefined).includes('class="empty"'));
  assert(chartSVG([]).includes('class="empty"'));
  assert(chartSVG([{ x: '2026-08-01', y: 100 }]).includes('class="empty"'));
});

// 1.3 chartSVG Tag & ViewBox Exact Match
runTest('chartSVG outputs exact <svg viewBox="0 0 340 158"> without inline style pollution', () => {
  const { chartSVG } = chartCtx;
  const pts = [
    { x: '2026-08-01', y: 50 },
    { x: '2026-08-02', y: 60 }
  ];
  const svg = chartSVG(pts, '#ffffff');
  assert(svg.startsWith('<svg viewBox="0 0 340 158">'), 'Root SVG tag must strictly start with <svg viewBox="0 0 340 158">');
  assert(!svg.startsWith('<svg viewBox="0 0 340 158" style='), 'Must not contain inline style attribute on root SVG');
  assert(svg.endsWith('</svg>'), 'Must properly close with </svg>');
});

// 1.4 chartSVG Zero and Identical Values (Flat Curve)
runTest('chartSVG handles flat curves (all same y), all zero y, and negative numbers without NaN or Infinity', () => {
  const { chartSVG } = chartCtx;

  // All 0
  const zeroPts = [{ x: '2026-08-01', y: 0 }, { x: '2026-08-02', y: 0 }, { x: '2026-08-03', y: 0 }];
  const zeroSvg = chartSVG(zeroPts);
  assert(!zeroSvg.includes('NaN'), 'Zero SVG must not contain NaN');
  assert(!zeroSvg.includes('Infinity'), 'Zero SVG must not contain Infinity');
  assert(zeroSvg.includes('<polyline'), 'Zero SVG must contain polyline');

  // All identical positive (min === max)
  const flatPts = [{ x: '2026-08-01', y: 100 }, { x: '2026-08-02', y: 100 }];
  const flatSvg = chartSVG(flatPts);
  assert(!flatSvg.includes('NaN'), 'Flat SVG must not contain NaN');
  assert(!flatSvg.includes('Infinity'), 'Flat SVG must not contain Infinity');

  // Negative numbers
  const negPts = [{ x: '2026-08-01', y: -20 }, { x: '2026-08-02', y: -10 }, { x: '2026-08-03', y: -30 }];
  const negSvg = chartSVG(negPts);
  assert(!negSvg.includes('NaN'), 'Negative SVG must not contain NaN');
  assert(!negSvg.includes('Infinity'), 'Negative SVG must not contain Infinity');
});

// 1.5 chartSVG Gradient ID Uniqueness
runTest('chartSVG increments gid for linearGradient defs to avoid SVG ID collision', () => {
  const { chartSVG } = chartCtx;
  const pts = [{ x: '2026-08-01', y: 10 }, { x: '2026-08-02', y: 20 }];
  const svg1 = chartSVG(pts);
  const svg2 = chartSVG(pts);
  const match1 = svg1.match(/id="g(\d+)"/);
  const match2 = svg2.match(/id="g(\d+)"/);
  assert(match1 && match2, 'Both SVGs must have gradient IDs');
  assert.notStrictEqual(match1[1], match2[1], 'Subsequent chart calls must generate unique gradient IDs');
});

// 1.6 paceChartSVG Exact Root SVG Tag & Inverted Coordinate Mapping
runTest('paceChartSVG generates <svg viewBox="0 0 340 158"> and maps lower pace (faster) to higher vertical Y coordinate', () => {
  const { paceChartSVG } = chartCtx;
  const pacePts = [
    { x: '2026-08-01', y: 180 }, // 3:00 min/km (fastest)
    { x: '2026-08-02', y: 300 }, // 5:00 min/km (medium)
    { x: '2026-08-03', y: 480 }  // 8:00 min/km (slowest)
  ];
  const svg = paceChartSVG(pacePts);
  assert(svg.startsWith('<svg viewBox="0 0 340 158">'), 'paceChartSVG must start with <svg viewBox="0 0 340 158">');
  assert(!svg.startsWith('<svg viewBox="0 0 340 158" style='), 'paceChartSVG must not have inline style on root SVG');
  assert(!svg.includes('NaN'), 'paceChartSVG must not contain NaN');

  const match = svg.match(/points="([^"]+)"/);
  assert(match, 'paceChartSVG must have polyline points');
  const points = match[1].split(' ').map(pair => pair.split(',').map(Number));
  assert.strictEqual(points.length, 3);
  // Lower Y pixel in SVG coordinate system = higher on screen
  assert(points[0][1] < points[1][1], `Fastest pace (180s) Y (${points[0][1]}) must be lower pixel (higher on screen) than medium pace (300s) Y (${points[1][1]})`);
  assert(points[1][1] < points[2][1], `Medium pace (300s) Y (${points[1][1]}) must be lower pixel than slowest pace (480s) Y (${points[2][1]})`);
});

// 1.7 sparklineSVG Fuzz & Extremes
runTest('sparklineSVG handles primitive arrays, object arrays, single/empty points, and custom dimensions', () => {
  const { sparklineSVG } = chartCtx;
  assert.strictEqual(sparklineSVG(null), '');
  assert.strictEqual(sparklineSVG([]), '');
  assert.strictEqual(sparklineSVG([10]), '');

  const spark1 = sparklineSVG([10, 20, 15, 30], '#ffffff', 120, 40);
  assert(spark1.includes('<svg viewBox="0 0 120 40" width="120" height="40"'));
  assert(spark1.includes('<polyline'));
  assert(!spark1.includes('NaN'));

  const spark2 = sparklineSVG([{ y: 5 }, { y: 15 }, { y: 10 }]);
  assert(spark2.includes('<svg viewBox="0 0 100 32" width="100" height="32"'));
  assert(!spark2.includes('NaN'));
});

// =============================================================================
// SUITE 2: kernel/app.js ADVERSARIAL STRESS TESTING
// =============================================================================
console.log('\n--- SUITE 2: kernel/app.js Adversarial Stress Testing ---');

const { ctx: appCtx, loadScript: loadAppScript, doc: appDoc, metaTheme } = createMockEnvironment();
loadAppScript('kernel/fmt.js');
loadAppScript('kernel/icons.js');
loadAppScript('kernel/charts.js');
loadAppScript('kernel/ui.js');
loadAppScript('kernel/app.js');

// 2.1 workout-active body class toggle contract across all 5 tabs and unknown tabs
runTest('render() toggles workout-active on document.body strictly when currentTab === "treino"', () => {
  const tabs = ['treino', 'corrida', 'progresso', 'historico', 'ficha', 'settings', 'unknown'];

  for (const t of tabs) {
    appCtx.tab = t;
    appCtx.render();
    if (t === 'treino') {
      assert(appDoc.body.classList.contains('workout-active'), `body should contain workout-active when tab is "${t}"`);
    } else {
      assert(!appDoc.body.classList.contains('workout-active'), `body should NOT contain workout-active when tab is "${t}"`);
    }
  }
});

// 2.2 render() updates theme-color meta tag and weekCount
runTest('render() updates theme-color meta tag to #09090b and formats #wk text correctly', () => {
  appCtx.weekCount = () => 1;
  appCtx.render();
  assert.strictEqual(metaTheme.content, '#09090b', 'theme-color meta content must be #09090b');
  const wkEl = appDoc.getElementById('wk');
  assert.strictEqual(wkEl.innerHTML, '<b>1</b> treino esta semana', 'Singular 1 treino text');

  appCtx.weekCount = () => 4;
  appCtx.render();
  assert.strictEqual(wkEl.innerHTML, '<b>4</b> treinos esta semana', 'Plural 4 treinos text');
});

// 2.3 Safe execution when app container or document is missing
runTest('render() safely exits without throwing if document or #app element is missing', () => {
  const headlessCtx = { console: console, tab: 'treino' };
  vm.createContext(headlessCtx);
  const code = fs.readFileSync(path.resolve(__dirname, '../../main/assets/kernel/app.js'), 'utf8');
  assert.doesNotThrow(() => {
    vm.runInContext(code, headlessCtx);
    if (typeof headlessCtx.render === 'function') {
      headlessCtx.render();
    }
  }, 'app.js should execute and render() cleanly in headless context');
});

// 2.4 Nav buttons click binding & event propagation
runTest('Navigation buttons properly update tab, reset calOpen, scroll window, and trigger render()', () => {
  appCtx.calOpen = true;
  appCtx.render();

  const navEl = appDoc.getElementById('nav');
  assert(navEl.innerHTML.includes('data-tab="treino"'));
  assert(navEl.innerHTML.includes('data-tab="corrida"'));

  // Find button for corrida
  const buttons = [];
  navEl.querySelectorAll = (sel) => {
    if (sel === 'button') {
      const tabIds = ['treino', 'corrida', 'progresso', 'historico', 'ficha'];
      return tabIds.map(id => {
        const btn = {
          getAttribute: (k) => (k === 'data-tab' ? id : null),
          onclick: null
        };
        buttons.push(btn);
        return btn;
      });
    }
    return [];
  };

  appCtx.render();
  const corridaBtn = buttons.find(b => b.getAttribute('data-tab') === 'corrida');
  assert(corridaBtn && typeof corridaBtn.onclick === 'function', 'corrida nav button must have onclick handler');

  appCtx.calOpen = true;
  corridaBtn.onclick();
  assert.strictEqual(appCtx.tab, 'corrida', 'Clicking nav button must update global tab');
  assert.strictEqual(appCtx.calOpen, false, 'Clicking nav button must reset calOpen to false');
  assert(!appDoc.body.classList.contains('workout-active'), 'workout-active must be removed for corrida');
});

// =============================================================================
// SUITE 3: kernel/ui.js & GLOBAL SCOPE SANITY
// =============================================================================
console.log('\n--- SUITE 3: kernel/ui.js Scope and Global Safety ---');

runTest('kernel/ui.js declarations for calMonth and calOpen do not throw ReferenceError', () => {
  const strictCtx = {
    console: console,
    Date: Date,
    Math: Math,
    document: appDoc,
    window: appCtx.win
  };
  vm.createContext(strictCtx);
  const code = fs.readFileSync(path.resolve(__dirname, '../../main/assets/kernel/ui.js'), 'utf8');
  assert.doesNotThrow(() => {
    vm.runInContext('"use strict";\n' + code, strictCtx);
  }, 'ui.js must load in strict mode without undeclared variable errors');
  assert.strictEqual(strictCtx.calMonth, null);
  assert.strictEqual(strictCtx.calOpen, false);
});

// =============================================================================
// SUITE 4: CRYPTOGRAPHIC HASH UNIFORMITY ACROSS ALL REPOSITORIES
// =============================================================================
console.log('\n--- SUITE 4: Cryptographic SHA-256 Hash Uniformity Across All Copies ---');

runTest('All 8 kernel files have 100% matching SHA-256 hashes across kernel/, evolucao, nutricao, and _temp', () => {
  const root = path.resolve(__dirname, '../../../../..');
  const dirs = [
    path.join(root, 'kernel'),
    path.join(root, 'evolucao-android/app/src/main/assets/kernel'),
    path.join(root, 'nutricao-android/app/src/main/assets/kernel'),
    path.join(root, '_temp_kernel')
  ];

  const files = ['app.js', 'charts.js', 'db.js', 'fmt.js', 'icons.js', 'notif.js', 'theme.css', 'ui.js'];

  for (const f of files) {
    const rootPath = path.join(dirs[0], f);
    assert(fs.existsSync(rootPath), `Root kernel file ${rootPath} must exist`);
    const rootHash = crypto.createHash('sha256').update(fs.readFileSync(rootPath)).digest('hex');

    for (let i = 1; i < dirs.length; i++) {
      const targetPath = path.join(dirs[i], f);
      assert(fs.existsSync(targetPath), `Target kernel file ${targetPath} must exist`);
      const targetHash = crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex');
      assert.strictEqual(targetHash, rootHash, `File ${f} in ${dirs[i]} hash mismatch with root kernel/${f}`);
    }
  }
});

console.log('\n================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} EMPIRICAL CHALLENGER STRESS TESTS PASSED WITH 0 FAILURES!`);
console.log('================================================================\n');

process.exit(0);
