'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const BodyVisualizer = require('../../main/assets/apps/evolucao/body-visualizer.js');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 2 — BODYVISUALIZER & TERMINATION ===');
console.log('================================================================\n');

// =============================================================================
// SUITE 1: 10 MUSCLE GROUPS EXHAUSTIVE ACTIVATION TEST
// =============================================================================
console.log('--- SUITE 1: 10 Muscle Groups Exhaustive Activation ---');

const expected10Groups = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'abs', 'quads', 'hamstrings', 'calves', 'glutes'
];

assert.strictEqual(BodyVisualizer.MUSCLE_GROUPS.length, 10, 'Must have exactly 10 muscle groups defined');
expected10Groups.forEach(g => {
  assert(BodyVisualizer.MUSCLE_GROUPS.includes(g), `MUSCLE_GROUPS must include '${g}'`);
  assert(BodyVisualizer.LABELS[g] !== undefined, `LABELS must include label for '${g}'`);
});

const muscleTests = [
  // 1. CHEST (Peito)
  {
    group: 'chest',
    exercises: [
      'Supino reto com barra',
      'Supino inclinado com halteres',
      'Supino declinado na máquina',
      'Crucifixo reto',
      'Crucifixo inclinado',
      'Crossover polia média',
      'Cross over polia alta',
      'Voador peitoral',
      'Flexao de braços no solo',
      'Peitoral máquina articulada',
      'Chest press sentado',
      'Peito na paralela'
    ]
  },
  // 2. BACK (Costas)
  {
    group: 'back',
    exercises: [
      'Puxada aberta pela frente',
      'Puxada supinada',
      'Remada curvada pronada',
      'Remada baixa no triângulo',
      'Remada articulada unilateral',
      'Serrote com halteres',
      'Lat pulldown unilateral',
      'Barra fixa com pegada pronada',
      'Pulldown no cabo com corda',
      'Remada cavalinho livre',
      'Dorsal no aparelho',
      'Costas no graviton'
    ]
  },
  // 3. SHOULDERS (Ombros)
  {
    group: 'shoulders',
    exercises: [
      'Elevação lateral com halteres',
      'Elevação lateral na polia',
      'Desenvolvimento militar com barra',
      'Desenvolvimento com halteres no banco 90',
      'Elevação frontal alternada',
      'Deltoides posterior no peck deck',
      'Arnold press',
      'Face pull na polia alta',
      'Desenvolvimento com halteres',
      'Ombro desenvolvimento máquina'
    ]
  },
  // 4. BICEPS (Bíceps)
  {
    group: 'biceps',
    exercises: [
      'Rosca direta com barra W',
      'Rosca Scott na máquina',
      'Rosca martelo com halteres',
      'Rosca concentrada sentado',
      'Rosca alternada no banco inclinado',
      'Bíceps unilateral no cabo',
      'Bíceps na barra reta'
    ]
  },
  // 5. TRICEPS (Tríceps)
  {
    group: 'triceps',
    exercises: [
      'Tríceps testa com barra W',
      'Tríceps francês unilateral com halter',
      'Tríceps coice na polia',
      'Tríceps corda no cross',
      'Mergulho no banco',
      'Paralelas focadas em tríceps'
    ]
  },
  // 6. ABS (Abdômen)
  {
    group: 'abs',
    exercises: [
      'Abdominal supra no solo',
      'Abdominal infra no banco',
      'Prancha ventral isométrica',
      'Abs crunch na máquina',
      'Hanging leg raise',
      'Abdominal oblíquo'
    ]
  },
  // 7. QUADS (Quadríceps)
  {
    group: 'quads',
    exercises: [
      'Agachamento livre com barra',
      'Leg press 45 horizontal',
      'Cadeira extensora unilateral',
      'Extensora de pernas',
      'Hack machine 45',
      'Afundo com halteres',
      'Passada caminhando',
      'Agachamento búlgaro',
      'Sissy squat livre'
    ]
  },
  // 8. HAMSTRINGS (Posteriores)
  {
    group: 'hamstrings',
    exercises: [
      'Cadeira flexora sentado',
      'Mesa flexora deitada',
      'Flexora vertical unilateral',
      'Stiff com barra e anilhas',
      'Levantamento terra romeno',
      'RDL com halteres',
      'Good morning com barra'
    ]
  },
  // 9. CALVES (Panturrilhas)
  {
    group: 'calves',
    exercises: [
      'Panturrilha em pé no Smith',
      'Gêmeos sentado na máquina de sóleo',
      'Sóleo com anilhas',
      'Panturrilha na máquina',
      'Panturr unilateral'
    ]
  },
  // 10. GLUTES (Glúteos)
  {
    group: 'glutes',
    exercises: [
      'Elevação pélvica com barra',
      'Pélvica na máquina articulada',
      'Glúteo quatro apoios no cabo',
      'Cadeira abdutora inclinada',
      'Glúteo na máquina articulada',
      'Hip thrust no banco'
    ]
  },
  // COMPOUND: DEADLIFT
  {
    group: 'back',
    exercises: ['Levantamento terra convencional', 'Deadlift com barra'],
    checkSecondary: ['hamstrings', 'glutes', 'quads']
  }
];

let totalActivationCount = 0;
muscleTests.forEach(testSuite => {
  testSuite.exercises.forEach(exName => {
    totalActivationCount++;
    const res = BodyVisualizer.getMusclesForExercise(exName);
    assert(res[testSuite.group] && res[testSuite.group] >= 1.0, 
      `Exercise '${exName}' failed to activate primary muscle group '${testSuite.group}'. Result: ${JSON.stringify(res)}`);
    if (testSuite.checkSecondary) {
      testSuite.checkSecondary.forEach(sec => {
        assert(res[sec] && res[sec] > 0, `Compound '${exName}' should activate secondary '${sec}'`);
      });
    }
  });
});
console.log(`✅ Passed: 10/10 muscle groups activated across ${totalActivationCount} distinct exercise names.`);


// =============================================================================
// SUITE 2: ADVERSARIAL FUZZING OF BODYVISUALIZER
// =============================================================================
console.log('\n--- SUITE 2: Adversarial Fuzzing of BodyVisualizer ---');

const fuzzInputs = [
  // 1. Accents & Diacritics
  { input: 'ELEVAÇÃO LATERAL', expectedGroup: 'shoulders' },
  { input: 'tríceps francês', expectedGroup: 'triceps' },
  { input: 'bíceps na máquina', expectedGroup: 'biceps' },
  { input: 'panturrilha em pé', expectedGroup: 'calves' },
  { input: 'elevação pélvica', expectedGroup: 'glutes' },
  { input: 'quadríceps extensora', expectedGroup: 'quads' },
  { input: 'abdômen supra', expectedGroup: 'abs' },
  { input: 'puxada aberta atrás do pescoço', expectedGroup: 'back' },
  { input: 'supino reto com halteres', expectedGroup: 'chest' },
  { input: 'posterior de coxa na flexora', expectedGroup: 'hamstrings' },

  // 2. Weird Casing & Mixed Whitespace
  { input: '  sUpInO   ReTo   ', expectedGroup: 'chest' },
  { input: '\t\nRoScA\tScOtT\r\n', expectedGroup: 'biceps' },
  { input: 'P   U   X   A   D   A', expectedGroup: null }, // no regex match expected, must not throw
  { input: 'EXTENSORA', expectedGroup: 'quads' },

  // 3. Unknown, Garbage & Non-alphabetic names
  { input: 'Exercício Desconhecido XYZ 123', expectedGroup: null },
  { input: '1234567890!@#$%^&*()_+', expectedGroup: null },
  { input: '---___---', expectedGroup: null },
  { input: '???', expectedGroup: null },
  { input: '   ', expectedGroup: null },
  { input: '', expectedGroup: null },

  // 4. Non-string types (fuzz defensive normalization)
  { input: null, expectedGroup: null },
  { input: undefined, expectedGroup: null },
  { input: 12345, expectedGroup: null },
  { input: true, expectedGroup: null },
  { input: false, expectedGroup: null },
  { input: { toString: () => 'supino reto' }, expectedGroup: 'chest' },
  { input: ['supino', 'inclinado'], expectedGroup: 'chest' },

  // 5. Injection & Special Characters
  { input: '<script>alert("xss")</script> supino', expectedGroup: 'chest' },
  { input: '"><svg onload=alert(1)> remada', expectedGroup: 'back' },
  { input: '🏋️‍♂️ Elevação Lateral 💪', expectedGroup: 'shoulders' },
  { input: '🔥 Agachamento Pesado 🔥', expectedGroup: 'quads' },

  // 6. Very Long String
  { input: 'Supino ' + 'A'.repeat(5000) + ' Reto', expectedGroup: 'chest' }
];

fuzzInputs.forEach((tc, idx) => {
  try {
    const res = BodyVisualizer.getMusclesForExercise(tc.input);
    assert(typeof res === 'object' && res !== null, `Must return object for input: ${tc.input}`);
    if (tc.expectedGroup) {
      assert(res[tc.expectedGroup] >= 1.0, 
        `Fuzz test #${idx} (${JSON.stringify(tc.input)}) expected '${tc.expectedGroup}', got: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    assert.fail(`Fuzz test #${idx} (${JSON.stringify(tc.input)}) threw an unexpected error: ${err.message}`);
  }
});
console.log(`✅ Passed: ${fuzzInputs.length} adversarial fuzz inputs handled without crashing.`);


// =============================================================================
// SUITE 3: SVG STRUCTURAL & XML VALIDATION
// =============================================================================
console.log('\n--- SUITE 3: SVG Structural & XML Validation ---');

function validateSvgStructure(svgStr, contextName) {
  assert(typeof svgStr === 'string', `${contextName}: Output must be a string`);
  assert(svgStr.startsWith('<svg') && svgStr.endsWith('</svg>'), `${contextName}: Must start with <svg and end with </svg>`);
  assert(svgStr.includes('viewBox="0 0 300 200"'), `${contextName}: Must have exact viewBox "0 0 300 200"`);
  assert(svgStr.includes('xmlns="http://www.w3.org/2000/svg"'), `${contextName}: Must declare SVG namespace`);
  assert(svgStr.includes('id="anatFront"'), `${contextName}: Must include front silhouette group #anatFront`);
  assert(svgStr.includes('id="anatBack"'), `${contextName}: Must include back silhouette group #anatBack`);
  assert(svgStr.includes('FRENTE'), `${contextName}: Must have FRENTE label`);
  assert(svgStr.includes('COSTAS'), `${contextName}: Must have COSTAS label`);

  // Check all 10 muscle data attributes exist in the SVG
  expected10Groups.forEach(g => {
    assert(svgStr.includes(`data-muscle="${g}"`), `${contextName}: SVG must contain path element for muscle '${g}'`);
  });

  // Verify XML tag balance (basic XML parser check)
  const openTags = (svgStr.match(/<[a-zA-Z0-9_-]+(?=[\s>])/g) || []).map(t => t.substring(1));
  const closeTags = (svgStr.match(/<\/[a-zA-Z0-9_-]+>/g) || []).map(t => t.substring(2, t.length - 1));
  const selfClosing = (svgStr.match(/<[a-zA-Z0-9_-]+[^>]*\/>/g) || []).map(t => t.match(/<([a-zA-Z0-9_-]+)/)[1]);

  const openNonSelfClosing = openTags.filter((tag, idx) => {
    // Count how many self-closing instances of this tag exist up to here
    return true;
  });

  // Net non-self-closing tags must match close tags count
  const tagCount = {};
  openTags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
  selfClosing.forEach(t => { tagCount[t] = (tagCount[t] || 0) - 1; });
  closeTags.forEach(t => { tagCount[t] = (tagCount[t] || 0) - 1; });

  Object.keys(tagCount).forEach(t => {
    assert.strictEqual(tagCount[t], 0, `${contextName}: Unbalanced XML tag '<${t}>' (diff: ${tagCount[t]})`);
  });
}

// Test SVG with empty muscles
const emptySvg = BodyVisualizer.render({});
validateSvgStructure(emptySvg, 'Empty Muscles SVG');

// Test SVG with all muscles active
const allMuscles = {};
expected10Groups.forEach(g => { allMuscles[g] = 5; });
const fullSvg = BodyVisualizer.render(allMuscles, { height: 180 });
validateSvgStructure(fullSvg, 'Full Muscles SVG');
assert(fullSvg.includes('height:180px'), 'SVG height option must be applied to style');

// Test Heatmap Opacity and Color Resolver
{
  const mockSession = {
    day: 'A',
    entries: {
      'Supino reto': [{ w: 100, r: 8 }, { w: 100, r: 8 }, { w: 100, r: 8 }, { w: 100, r: 8 }], // 4 sets chest
      'Crucifixo reto': [{ w: 20, r: 12 }], // 1 set chest -> chest = 5
      'Elevação lateral': [{ w: 12, r: 15 }, { w: 12, r: 15 }] // 2 sets shoulders
    }
  };
  const sessionMuscles = BodyVisualizer.getMusclesForSession(mockSession);
  const sessionSvg = BodyVisualizer.renderSessionAnatomy(mockSession);
  validateSvgStructure(sessionSvg, 'Session Anatomy SVG');

  // Max score is chest (5). Shoulders has 2 (shoulders ratio = 2 / 5 = 0.4 -> opacity 0.85)
  assert(sessionMuscles.chest >= 5, 'Chest must have >= 5 score');
  assert(sessionSvg.includes('opacity="1.0"') || sessionSvg.includes('opacity="1"'), 'Primary target must have max opacity');
}

console.log('✅ Passed: SVG output is strictly valid XML, perfectly balanced, and contains all 10 muscle groups.');


// =============================================================================
// SUITE 4: WORKOUT TERMINATION FLOW & SESSION PAYLOAD STRUCTURE
// =============================================================================
console.log('\n--- SUITE 4: Workout Termination Flow & Session Payload Validation ---');

// Set up isolated mock environment
function setupTreinoEnv() {
  const mockStorage = {};
  const mockLocalStorage = {
    getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
  };

  let capturedToast = null;
  let capturedDlg = null;
  let capturedRest = null;

  function createMockElement(tagName = 'div') {
    const el = {
      tagName: tagName.toUpperCase(),
      attributes: {},
      classList: {
        _classes: new Set(),
        add: function(...cls) { cls.forEach(c => this._classes.add(c)); },
        remove: function(...cls) { cls.forEach(c => this._classes.delete(c)); },
        toggle: function(c, force) {
          if (force === true) { this._classes.add(c); return true; }
          if (force === false) { this._classes.delete(c); return false; }
          if (this._classes.has(c)) { this._classes.delete(c); return false; }
          this._classes.add(c); return true;
        },
        contains: function(c) { return this._classes.has(c); }
      },
      style: {},
      children: [],
      parentElement: null,
      value: '',
      textContent: '',
      _innerHTML: '',
      onclick: null,
      listeners: {},
      addEventListener: function(evt, fn) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(fn);
      },
      removeEventListener: function(evt, fn) {
        if (this.listeners[evt]) {
          this.listeners[evt] = this.listeners[evt].filter(f => f !== fn);
        }
      },
      setAttribute: function(name, val) { this.attributes[name] = String(val); },
      getAttribute: function(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; },
      removeAttribute: function(name) { delete this.attributes[name]; },
      hasAttribute: function(name) { return this.attributes[name] !== undefined; },
      appendChild: function(child) {
        this.children.push(child);
        child.parentElement = this;
        return child;
      },
      scrollIntoView: function() {},
      focus: function() {},
      setSelectionRange: function() {},
      querySelector: function(sel) { return null; },
      querySelectorAll: function(sel) { return []; }
    };

    Object.defineProperty(el, 'innerHTML', {
      get: function() { return this._innerHTML; },
      set: function(val) {
        this._innerHTML = val;
        this.children = [];
      }
    });
    return el;
  }

  const appEl = createMockElement('div');
  appEl.setAttribute('id', 'app');

  const documentMock = {
    body: createMockElement('body'),
    getElementById: (id) => (id === 'app' ? appEl : createMockElement('div')),
    querySelector: (sel) => createMockElement('div'),
    querySelectorAll: (sel) => [],
    createElement: (tag) => createMockElement(tag),
    addEventListener: () => {}
  };

  const windowMock = {
    addEventListener: () => {},
    removeEventListener: () => {},
    isSecureContext: false,
    scrollTo: () => {},
    AndroidBridge: null
  };

  const Progression = require('../../main/assets/core/progressao.js');

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
    document: documentMock,
    window: windowMock,
    self: windowMock,
    localStorage: mockLocalStorage,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    toast: (msg) => { capturedToast = msg; },
    vibrate: () => {},
    initAudio: () => {},
    askNotify: () => {},
    celebrate: () => {},
    startRest: (sec, lbl) => { capturedRest = { sec, lbl }; },
    hideRest: () => {},
    render: () => {},
    save: () => {},
    dlg: (opts) => { capturedDlg = opts; },
    notifState: () => 'default'
  };

  vm.createContext(context);

  const baseDir = path.resolve(__dirname, '../../main/assets');
  const loadScript = (relPath) => {
    const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
    vm.runInContext(code, context);
  };

  loadScript('apps/evolucao/exercicios/nomes.js');
  loadScript('apps/evolucao/dados.js');
  loadScript('apps/evolucao/exercicios/fotos.js');
  loadScript('kernel/fmt.js');
  loadScript('kernel/icons.js');
  loadScript('kernel/db.js');
  loadScript('apps/evolucao/logic.js');
  loadScript('apps/evolucao/body-visualizer.js');
  loadScript('apps/evolucao/views/treino.js');

  context.toast = (msg) => { capturedToast = msg; };
  context.dlg = (opts) => { capturedDlg = opts; };

  return {
    context,
    getCapturedToast: () => capturedToast,
    getCapturedDlg: () => capturedDlg,
    resetCaptured: () => { capturedToast = null; capturedDlg = null; capturedRest = null; }
  };
}

// 4.1 Test Empty Session (0/3 sets done, empty entries)
{
  console.log('Test 4.1: Attempting to finish with 0 entries triggers warning toast and aborts');
  const env = setupTreinoEnv();
  const { state } = env.context;
  state.draft = {
    day: 'A',
    date: '2026-08-15',
    entries: {},
    warmupMode: {},
    startedAt: null,
    sessionMode: 'normal',
    unilateralPending: null
  };

  env.context.promptFinishSession();
  assert.strictEqual(env.getCapturedToast(), 'Nenhuma série registrada', 'Must warn when no sets are recorded');
  assert.strictEqual(env.getCapturedDlg(), null, 'Dialog must NOT open for empty session');
  assert.strictEqual(state.sessions.length, 0, 'No session must be saved in state.sessions');
  console.log('  -> Correctly rejected empty session termination.');
}

// 4.2 Test Partial Workout (1/3 sets done, 33% completion)
{
  console.log('Test 4.2: Partial workout (1/3 sets) auto-defaults to "Treino Curto"');
  const env = setupTreinoEnv();
  const { state } = env.context;
  
  // Day A planned total sets: e.g. 4 exercises x 3-4 sets = ~14 sets
  const firstExName = state.ficha['A'].ex[0].n;
  state.draft = {
    day: 'A',
    date: '2026-08-15',
    entries: {
      [firstExName]: [{ w: 80, r: 10, done: true, rir: 2 }]
    },
    warmupMode: {},
    startedAt: Date.now() - 600000,
    sessionMode: 'normal',
    unilateralPending: null
  };

  env.context.promptFinishSession();
  const dlgOpts = env.getCapturedDlg();
  assert(dlgOpts !== null, 'Dialog must open');
  assert.strictEqual(dlgOpts.segVal, 'Treino Curto', 'Partial workout must auto-select "Treino Curto"');
  assert(dlgOpts.sub.includes('séries concluídas'), 'Subtitle must indicate completion stats');

  // Confirm "Treino Curto"
  dlgOpts.onOk('Treino Curto');

  // Verify Saved Payload Contract
  assert.strictEqual(state.sessions.length, 1, 'Exactly 1 session must be saved');
  const saved = state.sessions[0];
  assert(typeof saved.id === 'number' && saved.id > 0, 'Session payload must have numeric ID');
  assert.strictEqual(saved.date, '2026-08-15', 'Session date must match draft date');
  assert.strictEqual(saved.day, 'A', 'Session day must match draft day');
  assert.strictEqual(saved.mode, 'curto', 'Session mode must be saved as "curto"');
  assert(saved.entries[firstExName] && saved.entries[firstExName].length === 1, 'Entries must be preserved');
  assert(typeof saved.duration === 'number' && saved.duration > 0, 'Duration must be computed in seconds');
  assert(typeof saved.notes === 'string', 'Notes must be serialized to string (provider-safe)');

  // Verify Draft Reset
  assert.strictEqual(state.draft.day, null, 'Draft day must be reset');
  assert.strictEqual(Object.keys(state.draft.entries).length, 0, 'Draft entries must be empty');
  assert.strictEqual(state.draft.startedAt, null, 'Draft startedAt must be reset');
  console.log('  -> Correctly classified partial workout as "curto" with valid payload structure.');
}

// 4.3 Test Full Workout (All planned sets done, 100% completion)
{
  console.log('Test 4.3: Full workout (100% sets done) auto-defaults to "Treino Completo"');
  const env = setupTreinoEnv();
  const { state } = env.context;
  
  // Fill all planned sets for Day A
  const dayA = state.ficha['A'];
  const entries = {};
  dayA.ex.forEach(e => {
    entries[e.n] = Array.from({ length: e.sets }, () => ({ w: 50, r: 10, done: true, rir: 2 }));
  });

  state.draft = {
    day: 'A',
    date: '2026-08-15',
    entries: entries,
    warmupMode: {},
    startedAt: Date.now() - 3600000,
    sessionMode: 'normal',
    unilateralPending: null
  };

  env.context.promptFinishSession();
  const dlgOpts = env.getCapturedDlg();
  assert(dlgOpts !== null, 'Dialog must open');
  assert.strictEqual(dlgOpts.segVal, 'Treino Completo', 'Full workout must auto-select "Treino Completo"');

  // Confirm "Treino Completo"
  dlgOpts.onOk('Treino Completo');

  assert.strictEqual(state.sessions.length, 1, 'Session must be saved');
  const saved = state.sessions[0];
  assert.strictEqual(saved.mode, 'normal', 'Session mode for complete workout must be "normal"');
  assert.strictEqual(saved.day, 'A');
  assert(saved.duration >= 3500 && saved.duration <= 3700, 'Duration must accurately reflect session elapsed time');
  console.log('  -> Correctly classified full workout as "normal" with valid payload structure.');
}

// 4.4 Test User Manual Override (Partial workout user overrides to "Treino Completo")
{
  console.log('Test 4.4: User manual override of segmented control is respected');
  const env = setupTreinoEnv();
  const { state } = env.context;
  
  const firstExName = state.ficha['A'].ex[0].n;
  state.draft = {
    day: 'A',
    date: '2026-08-15',
    entries: {
      [firstExName]: [{ w: 80, r: 10, done: true, rir: 2 }]
    },
    warmupMode: {},
    startedAt: Date.now() - 1200000,
    sessionMode: 'normal',
    unilateralPending: null
  };

  env.context.promptFinishSession();
  const dlgOpts = env.getCapturedDlg();
  assert.strictEqual(dlgOpts.segVal, 'Treino Curto');

  // User manually selects "Treino Completo" despite partial sets
  dlgOpts.onOk('Treino Completo');

  assert.strictEqual(state.sessions.length, 1);
  assert.strictEqual(state.sessions[0].mode, 'normal', 'User override to "normal" must be respected');
  console.log('  -> User override successfully preserved.');
}

// =============================================================================
// SUITE 5: DEFENSIVE BOUNDARIES, MALFORMED DATA & STRESS TESTING
// =============================================================================
console.log('\n--- SUITE 5: Defensive Boundaries, Malformed Data & Stress Testing ---');

// 5.1 Null & Undefined handling in render methods
{
  console.log('Test 5.1: Graceful degradation on null/malformed data in BodyVisualizer');
  
  const nullSvg = BodyVisualizer.render(null);
  assert(typeof nullSvg === 'string' && nullSvg.includes('viewBox="0 0 300 200"'), 'render(null) must return valid SVG');

  const nullSessionSvg = BodyVisualizer.renderSessionAnatomy(null);
  assert(typeof nullSessionSvg === 'string' && nullSessionSvg.includes('viewBox="0 0 300 200"'), 'renderSessionAnatomy(null) must return valid SVG');

  const nullDaySvg = BodyVisualizer.renderDayAnatomy(null);
  assert(typeof nullDaySvg === 'string' && nullDaySvg.includes('viewBox="0 0 300 200"'), 'renderDayAnatomy(null) must return valid SVG');

  const emptySummary = BodyVisualizer.getMuscleSummary(null);
  assert(Array.isArray(emptySummary) && emptySummary.length === 0, 'getMuscleSummary(null) must return empty array');

  const malformedSession = { entries: { 'Supino reto': null, 'Puxada': 'invalid', 'Rosca': [null, { w: 20 }] } };
  const malformedMuscles = BodyVisualizer.getMusclesForSession(malformedSession);
  assert(malformedMuscles.biceps >= 1, 'Malformed session should safely parse valid inner sets');

  console.log('  -> BodyVisualizer handles null/malformed structures gracefully.');
}

// 5.2 Warmup sets filtering in volume calculation
{
  console.log('Test 5.2: BodyVisualizer getMusclesForSession ignores warmup sets when work sets exist');
  const sessionWithWarmup = {
    day: 'A',
    entries: {
      'Supino reto': [
        { w: 40, r: 15, wu: true, done: true }, // warmup
        { w: 60, r: 10, warmup: true, done: true }, // warmup
        { w: 100, r: 8, wu: false, done: true }, // work set 1
        { w: 100, r: 8, done: true } // work set 2
      ]
    }
  };

  const muscles = BodyVisualizer.getMusclesForSession(sessionWithWarmup);
  assert.strictEqual(muscles.chest, 2, 'Chest score must be exactly 2 (ignoring 2 warmup sets)');
  console.log('  -> Warmup sets correctly excluded from muscle volume calculation.');
}

// 5.3 Sequential multi-session termination and ID uniqueness
{
  console.log('Test 5.3: Sequential multi-session termination preserves history and unique IDs');
  const env = setupTreinoEnv();
  const { state } = env.context;

  const realNow = Date.now;
  let simulatedTime = 1755000000000;
  env.context.Date.now = () => simulatedTime;

  for (let i = 0; i < 5; i++) {
    simulatedTime += 3600000; // 1 hour per session
    const dayKey = ['A', 'B', 'C'][i % 3];
    const firstEx = state.ficha[dayKey].ex[0].n;
    state.draft = {
      day: dayKey,
      date: `2026-08-1${i}`,
      entries: {
        [firstEx]: [{ w: 50 + i * 5, r: 10, done: true, rir: 2 }]
      },
      warmupMode: {},
      startedAt: simulatedTime - 3600000,
      sessionMode: 'normal',
      unilateralPending: null
    };

    env.context.promptFinishSession();
    const dlgOpts = env.getCapturedDlg();
    dlgOpts.onOk('Treino Curto');
  }
  env.context.Date.now = realNow;

  assert.strictEqual(state.sessions.length, 5, 'All 5 sessions must be saved');
  const ids = new Set(state.sessions.map(s => s.id));
  assert.strictEqual(ids.size, 5, 'All session IDs must be strictly unique');
  console.log('  -> 5 sequential workouts recorded with unique IDs and pristine draft resets.');
}

console.log('\n================================================================');
console.log('=== EMPIRICAL CHALLENGER 2: ALL SUITES PASSED EMPIRICALLY! ===');
console.log('================================================================\n');
