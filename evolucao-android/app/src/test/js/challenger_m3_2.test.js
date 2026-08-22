'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const Progression = require('../../main/assets/core/progressao.js');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 2 — ADVERSARIAL STRESS TEST SUITE ===');
console.log('=== MILESTONE 3: CORRIDA, TIMERS, AUDIO/VIBE, CHARTS & TABS ===');
console.log('================================================================\n');

// Mock DOM & Environment Helpers
function createMockDOM() {
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
      addEventListener: (evt, handler) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(handler);
      },
      removeEventListener: (evt, handler) => {
        if (!listeners[evt]) return;
        listeners[evt] = listeners[evt].filter(h => h !== handler);
      },
      dispatchEvent: (evt) => {
        if (listeners[evt.type]) {
          listeners[evt.type].forEach(h => h(evt));
        }
      },
      querySelector: (sel) => {
        return mockDoc.querySelector(sel);
      },
      querySelectorAll: (sel) => {
        return mockDoc.querySelectorAll(sel);
      },
      appendChild: (child) => child,
      remove: () => {}
    };

    return el;
  }

  const mockDoc = {
    _elements: elements,
    body: makeElement('body'),
    createElement: (tag) => makeElement(tag),
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, makeElement('div', id));
      }
      return elements.get(id);
    },
    querySelector: (sel) => {
      if (sel === 'meta[name="theme-color"]') return { content: '#f9fafb' };
      if (sel.startsWith('#')) return mockDoc.getElementById(sel.slice(1));
      return makeElement('div');
    },
    querySelectorAll: (sel) => {
      return [];
    },
    addEventListener: () => {}
  };

  return mockDoc;
}

function setupContext(options = {}) {
  const doc = createMockDOM();
  const windowObj = {
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
    isSecureContext: false,
    AudioContext: options.AudioContext,
    webkitAudioContext: options.webkitAudioContext,
    AndroidBridge: options.AndroidBridge
  };

  const navObj = {
    vibrate: options.vibrate
  };

  const ctx = {
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
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    document: doc,
    window: windowObj,
    self: windowObj,
    navigator: navObj,
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    tab: 'treino',
    state: null,
    gid: 0,
    calOpen: false,
    weekCount: () => 3,
    initRest: () => {},
    initLiveTimer: () => {},
    renderTreino: () => '<div id="viewTreino">TREINO</div>',
    bindTreino: () => {},
    decorateTreino: () => {},
    renderProgresso: () => '<div id="viewProgresso">DASHBOARD</div>',
    bindProgresso: () => {},
    renderHistorico: () => '<div id="viewHistorico">HISTORICO</div>',
    bindHistorico: () => {},
    decorateHistoricoRir: () => {},
    renderFicha: () => '<div id="viewFicha">FICHA</div>',
    bindFicha: () => {},
    decorateFicha: () => {},
    decorateProgressaoFicha: () => {},
    dlg: (cfg) => { if (options.autoConfirmDlg && cfg.onOk) cfg.onOk(cfg.value); },
    celebrate: () => { ctx._celebrated = true; },
    _celebrated: false
  };

  vm.createContext(ctx);

  const baseDir = path.resolve(__dirname, '../../main/assets');
  const loadScript = (relPath) => {
    const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
    vm.runInContext(code, ctx);
  };

  loadScript('kernel/fmt.js');
  loadScript('kernel/icons.js');
  loadScript('kernel/charts.js');
  loadScript('apps/evolucao/exercicios/nomes.js');
  loadScript('apps/evolucao/dados.js');
  loadScript('kernel/db.js');
  loadScript('apps/evolucao/logic.js');
  loadScript('apps/evolucao/views/corrida.js');
  loadScript('kernel/app.js');

  const origCelebrate = ctx.celebrate;
  ctx.celebrate = () => {
    ctx._celebrated = true;
    if (typeof origCelebrate === 'function') origCelebrate();
  };

  ctx.state = JSON.parse(JSON.stringify(ctx.DEFAULT_STATE));

  return ctx;
}

// =============================================================================
// TEST SUITE 1: AUDIO BEEP & VIBRATION FALLBACK HARNESS
// =============================================================================
console.log('--- TEST SUITE 1: Audio Beep & Vibration Fallback Robustness ---');
{
  // Test 1.1: AudioContext completely unavailable (no window.AudioContext or webkitAudioContext)
  const ctxNoAudio = setupContext({ AudioContext: undefined, webkitAudioContext: undefined });
  assert.doesNotThrow(() => {
    ctxNoAudio.initAudio();
    ctxNoAudio.beep();
  }, 'initAudio and beep must not throw when AudioContext is undefined');

  // Test 1.2: AudioContext constructor throws (e.g. SecurityError / autoplay policy restriction)
  function ThrowingAudioContext() {
    throw new Error('NotAllowedError: user interaction required');
  }
  const ctxThrowAudio = setupContext({ AudioContext: ThrowingAudioContext });
  assert.doesNotThrow(() => {
    ctxThrowAudio.initAudio();
    ctxThrowAudio.beep();
  }, 'initAudio must safely catch exceptions if AudioContext constructor throws');

  // Test 1.3: AudioContext suspended state resume throwing
  let resumeCalled = false;
  function SuspendedAudioContext() {
    this.state = 'suspended';
    this.resume = () => {
      resumeCalled = true;
      throw new Error('Resume failed');
    };
  }
  const ctxSuspended = setupContext({ AudioContext: SuspendedAudioContext });
  assert.doesNotThrow(() => {
    ctxSuspended.initAudio();
  }, 'initAudio must safely handle failing audioCtx.resume()');
  assert.strictEqual(resumeCalled, true, 'resume should have been attempted');

  // Test 1.4: Web Audio API fully functional (oscillators and gain ramps created)
  const createdOscillators = [];
  const createdGainNodes = [];
  function WorkingAudioContext() {
    this.state = 'running';
    this.currentTime = 10.0;
    this.destination = { type: 'dest' };
    this.createOscillator = () => {
      const osc = {
        type: '',
        frequency: { value: 0 },
        connect: (target) => { osc._target = target; },
        start: (t) => { osc._startTime = t; },
        stop: (t) => { osc._stopTime = t; }
      };
      createdOscillators.push(osc);
      return osc;
    };
    this.createGain = () => {
      const g = {
        gain: {
          setValueAtTime: (v, t) => {},
          exponentialRampToValueAtTime: (v, t) => {}
        },
        connect: (target) => { g._target = target; }
      };
      createdGainNodes.push(g);
      return g;
    };
  }
  const ctxWorkingAudio = setupContext({ AudioContext: WorkingAudioContext });
  ctxWorkingAudio.initAudio();
  ctxWorkingAudio.beep();

  assert.strictEqual(createdOscillators.length, 3, 'beep should create 3 harmonic pulses');
  assert.strictEqual(createdGainNodes.length, 3, 'beep should create 3 gain controllers');
  const freqs = createdOscillators.map(o => o.frequency.value);
  assert.deepStrictEqual(freqs, [880, 880, 1175], 'Beep frequencies must be [880, 880, 1175]');

  // Test 1.5: Vibration fallbacks (No vibration support, navigator.vibrate throws, AndroidBridge)
  const ctxNoVibe = setupContext({ vibrate: undefined, AndroidBridge: undefined });
  assert.doesNotThrow(() => {
    ctxNoVibe.vibrate(100);
    ctxNoVibe.vibrate([150, 75, 150]);
    ctxNoVibe.vibrate(null);
    ctxNoVibe.vibrate(undefined);
    ctxNoVibe.vibrate([]);
  }, 'vibrate() must be robust against missing vibration APIs and edge inputs');

  // Test 1.6: navigator.vibrate throwing
  const ctxThrowVibe = setupContext({
    vibrate: () => { throw new Error('Vibrate permission denied'); }
  });
  assert.doesNotThrow(() => {
    ctxThrowVibe.vibrate([200, 100, 200]);
  }, 'vibrate() must catch errors thrown by navigator.vibrate');

  // Test 1.7: AndroidBridge vibration integration
  let bridgeVibrateCalls = [];
  const ctxAndroidVibe = setupContext({
    AndroidBridge: {
      vibrate: (ms) => { bridgeVibrateCalls.push(ms); }
    }
  });
  ctxAndroidVibe.vibrate([150, 75, 150]);
  assert.strictEqual(bridgeVibrateCalls.length, 1);
  assert.strictEqual(bridgeVibrateCalls[0], 375, 'AndroidBridge should receive the sum of pulses (150+75+150=375ms)');

  ctxAndroidVibe.vibrate(250);
  assert.strictEqual(bridgeVibrateCalls[1], 250, 'AndroidBridge should receive scalar 250ms');

  console.log('✅ SUITE 1 Passed: Audio beep and vibration fallbacks are 100% resilient.');
}

// =============================================================================
// TEST SUITE 2: LIVE INTERVAL TIMER EXECUTION & ADVERSARIAL CONFIGS
// =============================================================================
console.log('\n--- TEST SUITE 2: Live Interval Timer Execution & Phase Transitions ---');
{
  const ctx = setupContext();

  // Test 2.1: Adversarial configs for buildIntervalPhases
  const emptyPhases = ctx.buildIntervalPhases({
    tiroMin: 0, tiroSec: 0, tiroKmh: 0,
    recupMin: 0, recupSec: 0, recupKmh: 0,
    ciclos: 0
  });
  assert.strictEqual(emptyPhases.length, 2, 'Defaulting minimum 1 cycle of tiro/recup');

  // Test 2.2: Full simulated live interval session
  const runnerCfg = {
    tiroMin: 0,
    tiroSec: 3, // 3 seconds tiro
    tiroKmh: 10.0,
    recupMin: 0,
    recupSec: 2, // 2 seconds recup
    recupKmh: 4.0,
    ciclos: 2, // 2 cycles total = 10s
    warmupMin: 0,
    warmupSec: 0,
    warmupKmh: 0,
    cooldownMin: 0,
    cooldownSec: 0,
    cooldownKmh: 0
  };

  ctx.state = { sessions: [], corridas: [], peso: [{ date: '2026-08-16', kg: 80 }] };
  ctx.draftCorridaForm.intervalada = runnerCfg;

  ctx.startLiveIntervalSession(runnerCfg);
  const runner = ctx.liveIntervalRunner;
  assert.strictEqual(runner.active, true, 'Runner must be active');
  assert.strictEqual(runner.paused, false, 'Runner must not be paused initially');
  assert.strictEqual(runner.phases.length, 4, '2 cycles should produce 4 phases (tiro, recup, tiro, recup)');
  assert.strictEqual(runner.currentPhaseIdx, 0, 'Should start at phase index 0');
  assert.strictEqual(runner.secondsLeft, 3, 'Phase 0 (tiro) should start with 3 seconds');

  // Tick 1: 3s -> 2s
  ctx.tickLiveInterval();
  assert.strictEqual(runner.secondsLeft, 2, 'After tick 1, secondsLeft should be 2');
  assert.strictEqual(runner.totalElapsed, 1, 'Total elapsed should be 1');

  // Test Pause
  ctx.togglePauseLiveInterval();
  assert.strictEqual(runner.paused, true, 'Runner should be paused');
  ctx.tickLiveInterval(); // Should not advance when paused
  assert.strictEqual(runner.secondsLeft, 2, 'Paused tick should not decrement secondsLeft');
  assert.strictEqual(runner.totalElapsed, 1, 'Paused tick should not increment totalElapsed');

  // Resume
  ctx.togglePauseLiveInterval();
  assert.strictEqual(runner.paused, false, 'Runner should be unpaused');

  // Tick 2: 2s -> 1s
  ctx.tickLiveInterval();
  assert.strictEqual(runner.secondsLeft, 1);

  // Tick 3: 1s -> 0s -> Transition to Phase 1 (recup 2s)
  ctx.tickLiveInterval();
  assert.strictEqual(runner.currentPhaseIdx, 1, 'Should have transitioned to Phase 1 (recup)');
  assert.strictEqual(runner.secondsLeft, 2, 'Phase 1 should be initialized with 2 seconds');
  assert.strictEqual(runner.phases[1].type, 'recup');

  // Skip Phase Test
  ctx.skipLiveIntervalPhase();
  assert.strictEqual(runner.currentPhaseIdx, 2, 'skipLiveIntervalPhase should advance to Phase 2 (tiro 2)');
  assert.strictEqual(runner.secondsLeft, 3, 'Phase 2 should have 3 seconds');

  // Advance through Phase 2 & 3 to completion
  ctx.tickLiveInterval(); // 2s
  ctx.tickLiveInterval(); // 1s
  ctx.tickLiveInterval(); // 0s -> transition to Phase 3 (recup 2s)
  assert.strictEqual(runner.currentPhaseIdx, 3, 'Should be at Phase 3 (last phase)');

  ctx.tickLiveInterval(); // 1s
  ctx.tickLiveInterval(); // 0s -> completion!

  assert.strictEqual(runner.active, false, 'Runner should be inactive upon completion');
  assert.strictEqual(ctx.state.corridas.length, 1, 'Completed session should be persisted in state.corridas');
  assert.strictEqual(ctx.state.corridas[0].mode, 'intervalada');
  assert.strictEqual(ctx._celebrated, true, 'Celebratory trigger should have been fired');

  console.log('✅ SUITE 2 Passed: Live Interval Runner handles state, transitions, pauses, skips, and completion.');
}

// =============================================================================
// TEST SUITE 3: SVG CHARTS ADVERSARIAL EDGE CASES & INVERTED PACE MAPPING
// =============================================================================
console.log('\n--- TEST SUITE 3: SVG Chart Edge Cases, Flat Curves, & Inverted Pace Mapping ---');
{
  const { chartSVG, paceChartSVG, fmtPaceValue } = setupContext();

  // Test 3.1: Empty and single-item datasets
  assert(chartSVG([], '#3b82f6').includes('empty'), 'chartSVG with [] must return empty container');
  assert(chartSVG(null, '#3b82f6').includes('empty'), 'chartSVG with null must return empty container');
  assert(chartSVG([{ x: '2026-08-01', y: 10 }], '#3b82f6').includes('empty'), 'chartSVG with 1 point must return empty container');
  assert(paceChartSVG([], '#f97a53').includes('empty'), 'paceChartSVG with [] must return empty container');
  assert(paceChartSVG([{ x: '2026-08-01', y: 300 }], '#f97a53').includes('empty'), 'paceChartSVG with 1 point must return empty container');

  // Test 3.2: Flat curves (identical Y values across all points)
  const flatDistPts = [
    { x: '2026-08-01', y: 5.0 },
    { x: '2026-08-02', y: 5.0 },
    { x: '2026-08-03', y: 5.0 }
  ];
  const flatDistSvg = chartSVG(flatDistPts, '#3b82f6');
  assert(!flatDistSvg.includes('NaN'), 'Flat distance SVG must not contain NaN coordinates');
  assert(!flatDistSvg.includes('Infinity'), 'Flat distance SVG must not contain Infinity');
  assert(flatDistSvg.includes('<polyline'), 'Flat distance SVG must contain polyline element');

  const flatPacePts = [
    { x: '2026-08-01', y: 300 },
    { x: '2026-08-02', y: 300 },
    { x: '2026-08-03', y: 300 }
  ];
  const flatPaceSvg = paceChartSVG(flatPacePts, '#f97a53');
  assert(!flatPaceSvg.includes('NaN'), 'Flat pace SVG must not contain NaN coordinates');
  assert(!flatPaceSvg.includes('Infinity'), 'Flat pace SVG must not contain Infinity');

  // Test 3.3: Inverted Coordinate Mapping Verification for Pace Chart
  // In running, lower pace seconds = faster speed = should be rendered HIGHER in SVG (lower Y coordinate pixel value).
  // Pace 1: 240s (4:00 min/km - FAST)
  // Pace 2: 300s (5:00 min/km - MEDIUM)
  // Pace 3: 420s (7:00 min/km - SLOW)
  const invertedPacePts = [
    { x: '2026-08-01', y: 240 },
    { x: '2026-08-02', y: 300 },
    { x: '2026-08-03', y: 420 }
  ];
  const paceSvg = paceChartSVG(invertedPacePts, '#f97a53');

  // Extract coordinates from polyline points="X1,Y1 X2,Y2 X3,Y3"
  const match = paceSvg.match(/points="([^"]+)"/);
  assert(match, 'paceChartSVG must contain polyline points');
  const points = match[1].split(' ').map(p => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });

  assert.strictEqual(points.length, 3, 'Must have 3 plotted coordinates');
  assert(points[0].y < points[1].y, `Fast pace (240s) Y (${points[0].y}) must be smaller (higher on screen) than medium pace (300s) Y (${points[1].y})`);
  assert(points[1].y < points[2].y, `Medium pace (300s) Y (${points[1].y}) must be smaller (higher on screen) than slow pace (420s) Y (${points[2].y})`);

  // Verify Axis labels: Fastest pace (4:00) is placed near top (PT+8=18), slowest pace (7:00) near bottom (H-PB=138)
  assert(paceSvg.includes('4:00'), 'Pace SVG must include fastest pace label 4:00');
  assert(paceSvg.includes('7:00'), 'Pace SVG must include slowest pace label 7:00');

  // Test 3.4: fmtPaceValue edge cases
  assert.strictEqual(fmtPaceValue(0), '0:00');
  assert.strictEqual(fmtPaceValue(-100), '0:00');
  assert.strictEqual(fmtPaceValue(NaN), '0:00');
  assert.strictEqual(fmtPaceValue(Infinity), '0:00');
  assert.strictEqual(fmtPaceValue(65), '1:05');
  assert.strictEqual(fmtPaceValue(3599), '59:59');

  console.log('✅ SUITE 3 Passed: SVG charts, flat curve protections, and inverted pace mappings verified.');
}

// =============================================================================
// TEST SUITE 4: TAB SWITCHING & ROUTING BEHAVIOR
// =============================================================================
console.log('\n--- TEST SUITE 4: Tab Switching & Routing Behavior ---');
{
  const ctx = setupContext();
  ctx.state = {
    corridas: [],
    sessions: [],
    peso: [],
    cardioGoalKm: 15,
    ficha: ctx.DEFAULT_STATE.ficha,
    draft: { day: null, date: null, entries: {} },
    settings: ctx.DEFAULT_STATE.settings
  };

  const appEl = ctx.document.getElementById('app');
  const navEl = ctx.document.getElementById('nav');

  // Tab 1: Treino (default)
  ctx.tab = 'treino';
  ctx.render();
  assert(appEl.innerHTML.includes('TREINO'), 'Treino tab should render Treino view');
  assert(ctx.document.body.classList.contains('workout-active'), 'Body should have workout-active class in Treino');

  // Tab 2: Corrida
  ctx.tab = 'corrida';
  ctx.render();
  assert(appEl.innerHTML.includes('Corrida'), 'Corrida tab should render Corrida view');
  assert(!ctx.document.body.classList.contains('workout-active'), 'Body should not have workout-active in Corrida');

  // Tab 3: Dashboard / Progresso
  ctx.tab = 'progresso';
  ctx.render();
  assert(appEl.innerHTML.includes('DASHBOARD'), 'Progresso tab should render Progresso view');

  // Tab 4: Histórico
  ctx.tab = 'historico';
  ctx.render();
  assert(appEl.innerHTML.includes('HISTORICO'), 'Historico tab should render Historico view');

  // Tab 5: Ficha
  ctx.tab = 'ficha';
  ctx.render();
  assert(appEl.innerHTML.includes('FICHA'), 'Ficha tab should render Ficha view');

  // Verify Navigation Bar rendering
  assert.strictEqual(ctx.TABS.length, 5, 'TABS array must contain exactly 5 tabs');
  const navHtml = navEl.innerHTML;
  assert(navHtml.includes('data-tab="treino"'));
  assert(navHtml.includes('data-tab="corrida"'));
  assert(navHtml.includes('data-tab="progresso"'));
  assert(navHtml.includes('data-tab="historico"'));
  assert(navHtml.includes('data-tab="ficha"'));

  console.log('✅ SUITE 4 Passed: 5-Tab switching and routing behavior executes seamlessly.');
}

// =============================================================================
// TEST SUITE 5: CORRIDA HISTORY DELETION & ATOMIC UNDO TOAST
// =============================================================================
console.log('\n--- TEST SUITE 5: Corrida History Deletion & Undo Restoration ---');
{
  const ctx = setupContext({ autoConfirmDlg: true });
  ctx.state = {
    sessions: [],
    corridas: [
      { id: 101, date: '2026-08-10', mode: 'continua', distanciaKm: 5.0, duracaoSeg: 1500 },
      { id: 102, date: '2026-08-12', mode: 'intervalada', distanciaKm: 3.0, duracaoSeg: 1200 },
      { id: 103, date: '2026-08-14', mode: 'continua', distanciaKm: 7.0, duracaoSeg: 2100 }
    ],
    peso: [],
    cardioGoalKm: 15
  };

  // Render corrida view and bind
  ctx.tab = 'corrida';
  ctx.document.getElementById('app').innerHTML = ctx.renderCorrida();

  // Simulate clicking delete on corrida id 102 (index 1)
  const delIdx = ctx.state.corridas.findIndex(c => c.id === 102);
  const toDelete = ctx.state.corridas[delIdx];
  ctx.lastDeletedCorrida = { corrida: toDelete, index: delIdx };
  ctx.state.corridas.splice(delIdx, 1);
  ctx.toastWithUndo('Corrida apagada');

  assert.strictEqual(ctx.state.corridas.length, 2, 'State should now have 2 corridas');
  assert.strictEqual(ctx.state.corridas.some(c => c.id === 102), false, 'Corrida 102 should be removed');

  // Trigger undo button
  const toastUndoBtn = ctx.document.getElementById('toastUndoBtn');
  assert(toastUndoBtn && toastUndoBtn.onclick, 'Undo button must be created with click handler');
  toastUndoBtn.onclick({ stopPropagation: () => {} });

  assert.strictEqual(ctx.state.corridas.length, 3, 'State should have 3 corridas restored');
  assert.strictEqual(ctx.state.corridas[1].id, 102, 'Corrida 102 should be restored to its exact original index 1');

  console.log('✅ SUITE 5 Passed: History deletion and atomic undo restoration verified.');
}

console.log('\n================================================================');
console.log('🎉 ALL ADVERSARIAL CHALLENGER SUITES (M3_2) PASSED SUCCESSFULLY!');
console.log('================================================================\n');
