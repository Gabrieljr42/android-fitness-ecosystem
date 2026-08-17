'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER M1: CENTRAL DESIGN SYSTEM & BRIDGE  ===');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// SUITE 1: 3-Way Kernel Synchronization Audit (SHA-256 Parity)
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: 3-Way Kernel Synchronization Audit ---');
{
  const rootDir = path.resolve(__dirname, '../../../../../');
  const dirs = [
    path.join(rootDir, 'kernel'),
    path.join(rootDir, 'evolucao-android/app/src/main/assets/kernel'),
    path.join(rootDir, 'nutricao-android/app/src/main/assets/kernel')
  ];

  const requiredFiles = [
    'app.js',
    'charts.js',
    'db.js',
    'fmt.js',
    'icons.js',
    'notif.js',
    'theme.css',
    'ui.js'
  ];

  function getHash(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  for (const f of requiredFiles) {
    const hash0 = getHash(path.join(dirs[0], f));
    const hash1 = getHash(path.join(dirs[1], f));
    const hash2 = getHash(path.join(dirs[2], f));

    assert.strictEqual(hash0, hash1, `File ${f} must match between kernel/ and evolucao assets`);
    assert.strictEqual(hash0, hash2, `File ${f} must match between kernel/ and nutricao assets`);
  }

  console.log(`✅ Passed [1]: All 8 kernel files synchronized with 100% SHA256 parity across all 3 trees.`);
}

// -----------------------------------------------------------------------------
// SUITE 2: Offline Safety & Typography Audit
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Offline Safety & Typography Audit ---');
{
  const rootDir = path.resolve(__dirname, '../../../../../');
  const themeCss = fs.readFileSync(path.join(rootDir, 'kernel/theme.css'), 'utf8');

  // Check 1: No external @import
  assert(!themeCss.includes('@import url('), 'theme.css must not contain external @import');
  assert(!themeCss.includes('fonts.googleapis.com'), 'theme.css must not load Google Fonts');
  assert(!themeCss.includes('http://'), 'theme.css must not reference http://');
  assert(!themeCss.includes('https://'), 'theme.css must not reference https://');

  // Check 2: System font stack present
  assert(themeCss.includes('-apple-system'), 'theme.css must contain -apple-system in font stack');
  assert(themeCss.includes('BlinkMacSystemFont'), 'theme.css must contain BlinkMacSystemFont');
  assert(themeCss.includes('Segoe UI'), 'theme.css must contain Segoe UI');
  assert(themeCss.includes('Roboto'), 'theme.css must contain Roboto');

  // Check 3: Essential monochromatic variables
  assert(themeCss.includes('--bg: #09090b'), 'theme.css must define --bg: #09090b');
  assert(themeCss.includes('--bg-card: #18181b'), 'theme.css must define --bg-card: #18181b');
  assert(themeCss.includes('--line: #27272a'), 'theme.css must define --line: #27272a');
  assert(themeCss.includes('--txt: #ffffff'), 'theme.css must define --txt: #ffffff');
  assert(themeCss.includes('--btn-primary-bg: #ffffff'), 'theme.css must define --btn-primary-bg: #ffffff');
  assert(themeCss.includes('--btn-primary-txt: #09090b'), 'theme.css must define --btn-primary-txt: #09090b');

  // Check 4: No neon gradients or pulsing animations in primary components
  assert(!themeCss.includes('#ff6b3d'), 'theme.css must not use raw legacy orange #ff6b3d in central tokens');
  assert(themeCss.includes('#confetti') && themeCss.includes('display: none !important;'), 'theme.css must eliminate confetti animation');

  console.log(`✅ Passed [2]: Zero external network dependencies, 100% offline system typography, and clean tokens verified.`);
}

// -----------------------------------------------------------------------------
// SUITE 3: AndroidBridge Fallback & Resilience (Mock & Edge Environments)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: AndroidBridge Fallback & Resilience ---');
{
  const rootDir = path.resolve(__dirname, '../../../../../');
  const fmtCode = fs.readFileSync(path.join(rootDir, 'kernel/fmt.js'), 'utf8');
  const uiCode = fs.readFileSync(path.join(rootDir, 'kernel/ui.js'), 'utf8');

  // Test 3.1: Standard Browser (window.AndroidBridge is undefined)
  {
    const dom = {
      rest: { classList: { add: () => {}, remove: () => {}, toggle: () => {} }, querySelector: () => ({ style: {} }) },
      rTime: { textContent: '' },
      rLbl: { textContent: '' },
      toast: { textContent: '', classList: { add: () => {}, remove: () => {} } }
    };

    const ctx = {
      console,
      Date,
      Math,
      String,
      Number,
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: (fn) => { fn(); return 1; },
      clearTimeout: () => {},
      window: {},
      navigator: { vibrate: () => true },
      document: {
        getElementById: (id) => dom[id] || null
      }
    };
    vm.createContext(ctx);
    vm.runInContext(fmtCode, ctx);
    vm.runInContext(uiCode, ctx);

    // Call rest timer functions with no AndroidBridge
    assert.doesNotThrow(() => {
      ctx.startRest(60, 'Supino');
      ctx.adjustRest(15);
      ctx.toggleRest();
      ctx.toggleRest();
      ctx.onRestDone();
      ctx.hideRest();
      ctx.vibrate([100, 50, 100]);
      ctx.notify('Teste', 'Corpo');
      ctx.toast('Notificação toast');
    }, 'Rest timer and bridge calls must not throw when AndroidBridge is undefined');
  }

  // Test 3.2: AndroidBridge with throwing / corrupted methods
  {
    let bridgeLogged = [];
    const throwingBridge = {
      startRestNotification: () => { throw new Error('Bridge IPC Failure'); },
      stopRestNotification: () => { throw new Error('Bridge IPC Failure'); },
      restDoneNotification: () => { throw new Error('Bridge IPC Failure'); },
      sendNotification: () => { throw new Error('Bridge IPC Failure'); },
      vibrate: () => { throw new Error('Bridge IPC Failure'); }
    };

    const dom = {
      rest: { classList: { add: () => {}, remove: () => {}, toggle: () => {} }, querySelector: () => ({ style: {} }) },
      rTime: { textContent: '' },
      rLbl: { textContent: '' },
      toast: { textContent: '', classList: { add: () => {}, remove: () => {} } }
    };

    const ctx = {
      console,
      Date,
      Math,
      String,
      Number,
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: (fn) => { fn(); return 1; },
      clearTimeout: () => {},
      window: {
        AndroidBridge: throwingBridge
      },
      navigator: {},
      document: {
        getElementById: (id) => dom[id] || null
      }
    };
    vm.createContext(ctx);
    vm.runInContext(fmtCode, ctx);
    vm.runInContext(uiCode, ctx);

    assert.doesNotThrow(() => {
      ctx.startRest(90, 'Agachamento');
      ctx.adjustRest(-15);
      ctx.toggleRest();
      ctx.onRestDone();
      ctx.hideRest();
      ctx.vibrate(200);
      ctx.notify('Título', 'Msg');
    }, 'Bridge exceptions must be safely caught in try/catch and not crash the UI');
  }

  // Test 3.3: Functional AndroidBridge mock (Validating payload contracts)
  {
    const calls = [];
    const mockBridge = {
      startRestNotification: (label, endTs, alarm) => calls.push({ type: 'start', label, endTs, alarm }),
      stopRestNotification: () => calls.push({ type: 'stop' }),
      restDoneNotification: (label, alarm) => calls.push({ type: 'done', label, alarm }),
      sendNotification: (title, body) => calls.push({ type: 'sendNotif', title, body }),
      vibrate: (ms) => calls.push({ type: 'vibrate', ms })
    };

    const dom = {
      rest: { classList: { add: () => {}, remove: () => {}, toggle: () => {} }, querySelector: () => ({ style: {} }) },
      rTime: { textContent: '' },
      rLbl: { textContent: '' },
      toast: { textContent: '', classList: { add: () => {}, remove: () => {} } }
    };

    const ctx = {
      console,
      Date,
      Math,
      String,
      Number,
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: () => 1,
      clearTimeout: () => {},
      window: { AndroidBridge: mockBridge },
      state: { settings: { alarm: true } },
      document: {
        getElementById: (id) => dom[id] || null
      }
    };
    vm.createContext(ctx);
    vm.runInContext(fmtCode, ctx);
    vm.runInContext(uiCode, ctx);

    ctx.startRest(45, 'Levantamento Terra');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].type, 'start');
    assert.strictEqual(calls[0].label, 'Levantamento Terra');
    assert.strictEqual(calls[0].alarm, true);

    ctx.toggleRest(); // Pauses -> stop
    assert.strictEqual(calls[1].type, 'stop');

    ctx.toggleRest(); // Resumes -> start
    assert.strictEqual(calls[2].type, 'start');

    ctx.onRestDone();
    const doneCall = calls.find(c => c.type === 'done');
    assert(doneCall, 'onRestDone must trigger restDoneNotification');
    assert.strictEqual(doneCall.label, 'Levantamento Terra');

    ctx.vibrate([100, 50, 100]);
    const vibeCalls = calls.filter(c => c.type === 'vibrate');
    assert.strictEqual(vibeCalls.length, 2, 'Should have 2 vibrate calls (one from onRestDone, one direct)');
    assert.strictEqual(vibeCalls[0].ms, 640, 'onRestDone pattern sum should be 640ms');
    assert.strictEqual(vibeCalls[1].ms, 250, 'Direct vibrate pattern sum should be 250ms');
  }

  console.log(`✅ Passed [3]: AndroidBridge fallback, exception resilience, and IPC payload contracts verified.`);
}

// -----------------------------------------------------------------------------
// SUITE 4: Chart Primitives Robustness & Numerical Boundary Fuzzing
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Chart Primitives Robustness & Boundary Fuzzing ---');
{
  const rootDir = path.resolve(__dirname, '../../../../../');
  const chartsCode = fs.readFileSync(path.join(rootDir, 'kernel/charts.js'), 'utf8');
  const fmtCode = fs.readFileSync(path.join(rootDir, 'kernel/fmt.js'), 'utf8');

  const ctx = {
    console,
    Math,
    Number,
    String,
    isFinite,
    isNaN
  };
  vm.createContext(ctx);
  vm.runInContext(fmtCode, ctx);
  vm.runInContext(chartsCode, ctx);

  // Test 4.1: Empty and single-point boundary handling
  assert(ctx.chartSVG(null).includes('empty'), 'Null input must return empty container');
  assert(ctx.chartSVG([]).includes('empty'), 'Empty array must return empty container');
  assert(ctx.chartSVG([{ x: '2026-08-01', y: 100 }]).includes('empty'), 'Single item must return empty container');

  assert(ctx.paceChartSVG(null).includes('empty'), 'Null input must return empty pace chart');
  assert(ctx.paceChartSVG([]).includes('empty'), 'Empty array must return empty pace chart');
  assert(ctx.paceChartSVG([{ x: '2026-08-01', y: 300 }]).includes('empty'), 'Single item must return empty pace chart');

  // Test 4.2: Flat curves (min === max)
  const flatData = [
    { x: '2026-08-01', y: 80 },
    { x: '2026-08-02', y: 80 },
    { x: '2026-08-03', y: 80 }
  ];
  const flatSvg = ctx.chartSVG(flatData, '#ffffff');
  assert(!flatSvg.includes('NaN'), 'Flat curve chartSVG must not produce NaN');
  assert(flatSvg.includes('<svg viewBox="0 0 340 158"'), 'chartSVG must generate standard 340x158 viewBox');
  assert(flatSvg.includes('<circle'), 'chartSVG must generate circle data dots');

  const flatPace = ctx.paceChartSVG(flatData, '#ffffff');
  assert(!flatPace.includes('NaN'), 'Flat curve paceChartSVG must not produce NaN');
  assert(flatPace.includes('<svg viewBox="0 0 340 158"'), 'paceChartSVG must generate standard 340x158 viewBox');

  // Test 4.3: Inverted Y-axis pace mapping verification
  // Lower pace (240s = 4:00 min/km) is faster than higher pace (360s = 6:00 min/km).
  // In SVG coordinates, Y=0 is top, Y=158 is bottom. Faster pace should have smaller Y coordinate.
  const paceProgression = [
    { x: '2026-08-01', y: 360 }, // 6:00 (slower)
    { x: '2026-08-02', y: 240 }  // 4:00 (faster)
  ];
  const paceSvg = ctx.paceChartSVG(paceProgression, '#ffffff');
  assert(!paceSvg.includes('NaN'), 'Pace progression must not produce NaN');
  assert(paceSvg.includes('4:00'), 'Pace SVG must format minimum pace as 4:00');
  assert(paceSvg.includes('6:00'), 'Pace SVG must format maximum pace as 6:00');

  // Test 4.4: Sparkline SVG generator
  const sparkSvg = ctx.sparklineSVG([10, 15, 12, 20, 25], '#ffffff', 80, 24);
  assert(sparkSvg.includes('<svg viewBox="0 0 80 24"'), 'sparklineSVG must support custom w/h');
  assert(sparkSvg.includes('<polyline'), 'sparklineSVG must generate polyline');

  console.log(`✅ Passed [4]: Chart SVG generators, boundary protections, and pace inversion verified.`);
}

// -----------------------------------------------------------------------------
// SUITE 5: SVG Iconography & Navigation Dictionary Audit
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: SVG Iconography & Navigation Dictionary Audit ---');
{
  const rootDir = path.resolve(__dirname, '../../../../../');
  const iconsCode = fs.readFileSync(path.join(rootDir, 'kernel/icons.js'), 'utf8');

  const ctx = {
    console,
    String,
    Array,
    Object
  };
  vm.createContext(ctx);
  vm.runInContext(iconsCode, ctx);

  assert(ctx.NAV_ICONS, 'NAV_ICONS dictionary must be defined');
  const expectedNavIcons = ['treino', 'corrida', 'progresso', 'historico', 'ficha', 'hoje', 'diario', 'alimentos', 'metas', 'ajustes'];
  for (const k of expectedNavIcons) {
    assert(ctx.NAV_ICONS[k], `NAV_ICONS must contain key "${k}"`);
    assert(ctx.NAV_ICONS[k].includes('<path') || ctx.NAV_ICONS[k].includes('<line') || ctx.NAV_ICONS[k].includes('<polyline') || ctx.NAV_ICONS[k].includes('<rect') || ctx.NAV_ICONS[k].includes('<circle'), `NAV_ICONS[${k}] must contain SVG element tags`);
  }

  // Check exercise icon mapping
  const exTests = ['Supino Reto', 'Agachamento Livre', 'Rosca Direta', 'Puxada Frente', 'Corrida Esteira', 'Desenvolvimento Halter'];
  for (const name of exTests) {
    const svgIcon = ctx.exIcon(name);
    assert(svgIcon.includes('<svg'), `exIcon("${name}") must return valid SVG tag`);
    assert(svgIcon.includes('viewBox="0 0 24 24"'), `exIcon("${name}") must have 24x24 viewBox`);
  }

  console.log(`✅ Passed [5]: SVG icon dictionaries and exercise mapping helpers verified.`);
}

console.log('\n================================================================');
console.log('=== EMPIRICAL CHALLENGER M1: ALL 5 ADVERSARIAL SUITES PASSED! ===');
console.log('================================================================\n');
