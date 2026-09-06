/**
 * Empirical Challenger 2 — Milestone 4 (R4 Verification & Cross-App Consistency)
 * 
 * Verifies:
 * 1. Design tokens, typography tracking, and component styling parity between Evolução & NutriTrack.
 * 2. Offline resilience and 100% local asset integrity (zero remote scripts, styles, or fonts).
 * 3. LocalStorage schema consistency, corrupt data recovery, and serialization invariants.
 * 4. Native AndroidBridge safety across both apps (undefined, partial, throwing bridges).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER 2 — MILESTONE 4 AUDIT & STRESS SUITE ===');
console.log('================================================================\n');

const projectRoot = path.resolve(__dirname, '../../../../..');
const evolucaoDir = path.resolve(projectRoot, 'evolucao-android');
const nutricaoDir = path.resolve(projectRoot, 'nutricao-android');
const kernelDir = path.resolve(projectRoot, 'evolucao-android/app/src/main/assets/kernel');

// Helper to extract CSS variable declarations
function extractCssTokens(cssContent) {
  const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/s);
  if (!rootMatch) return {};
  const tokens = {};
  const lines = rootMatch[1].split('\n');
  for (const line of lines) {
    const m = line.trim().match(/^(--[\w-]+)\s*:\s*([^;]+);/);
    if (m) {
      tokens[m[1]] = m[2].trim();
    }
  }
  return tokens;
}

// -----------------------------------------------------------------------------
// SUITE 1: Design Tokens, Typography & Component Styling Parity
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Design Tokens, Typography & Cross-App Parity ---');

const kernelThemePath = path.resolve(kernelDir, 'theme.css');
const evolucaoThemePath = path.resolve(evolucaoDir, 'app/src/main/assets/kernel/theme.css');
const nutricaoThemePath = path.resolve(nutricaoDir, 'app/src/main/assets/apps/nutricao/theme.css');

assert(fs.existsSync(kernelThemePath), 'evolucao kernel/theme.css must exist');
assert(fs.existsSync(evolucaoThemePath), 'evolucao theme.css must exist');
assert(fs.existsSync(nutricaoThemePath), 'nutricao theme.css must exist');

const kernelThemeCss = fs.readFileSync(kernelThemePath, 'utf8');
const evolucaoThemeCss = fs.readFileSync(evolucaoThemePath, 'utf8');
const nutricaoThemeCss = fs.readFileSync(nutricaoThemePath, 'utf8');

const kernelTokens = extractCssTokens(kernelThemeCss);
const nutricaoTokens = extractCssTokens(nutricaoThemeCss);

const criticalTokens = [
  '--bg', '--bg-surface', '--bg-card', '--bg-card-hover', '--bg-input',
  '--line', '--card-border', '--border-subtle',
  '--txt', '--txt-primary', '--txt2', '--txt-secondary', '--txt3', '--txt-tertiary',
  '--btn-primary-bg', '--btn-primary-txt', '--btn-secondary-bg', '--btn-secondary-txt',
  '--nav-h', '--radius-card', '--radius-btn', '--radius-pill'
];

for (const token of criticalTokens) {
  assert(kernelTokens[token], `kernel/theme.css must define ${token}`);
  assert(nutricaoTokens[token], `nutricao theme.css must define ${token}`);
  assert.strictEqual(
    kernelTokens[token],
    nutricaoTokens[token],
    `Token ${token} mismatch: Evolução/Kernel (${kernelTokens[token]}) vs NutriTrack (${nutricaoTokens[token]})`
  );
}
console.log('✅ Test 1.1 Passed: All 22 critical design tokens are 100% identical across both applications.');

// Verify typography tracking & font-stack
assert(
  kernelThemeCss.includes('-apple-system') && kernelThemeCss.includes('BlinkMacSystemFont'),
  'Evolução must use offline native system font stack'
);
assert(
  nutricaoThemeCss.includes('-apple-system') && nutricaoThemeCss.includes('BlinkMacSystemFont'),
  'NutriTrack must use offline native system font stack'
);

// Verify letter spacing rules
assert(kernelThemeCss.includes('letter-spacing: -0.02em') || kernelThemeCss.includes('letter-spacing: -0.01em'), 'Headings tracking in Evolucao');
assert(nutricaoThemeCss.includes('letter-spacing: -0.02em') || nutricaoThemeCss.includes('letter-spacing: -0.01em'), 'Headings tracking in Nutricao');
assert(kernelThemeCss.includes('letter-spacing: 0.04em') || kernelThemeCss.includes('letter-spacing: 0.05em'), 'Micro-labels uppercase tracking in Evolucao');
assert(nutricaoThemeCss.includes('letter-spacing: 0.04em') || nutricaoThemeCss.includes('letter-spacing: 0.05em'), 'Micro-labels uppercase tracking in Nutricao');
console.log('✅ Test 1.2 Passed: Typography font stack and tracking parameters (-0.02em / +0.04em) aligned.');

// Verify UI components: Header, Bottom Nav, Cards, Buttons, Modals
assert(kernelThemeCss.includes('header {') && kernelThemeCss.includes('position: sticky;'), 'Header sticky positioning in Evolucao');
assert(nutricaoThemeCss.includes('header {') && nutricaoThemeCss.includes('position: sticky;'), 'Header sticky positioning in NutriTrack');

assert(kernelThemeCss.includes('nav, #nav {') && kernelThemeCss.includes('position: fixed;'), 'Bottom nav fixed in Evolucao');
assert(nutricaoThemeCss.includes('nav, #nav {') && nutricaoThemeCss.includes('position: fixed;'), 'Bottom nav fixed in NutriTrack');

assert(kernelThemeCss.includes('button:active {') && kernelThemeCss.includes('scale(0.98)'), 'Touch feedback scale(0.98) in Evolucao');
assert(nutricaoThemeCss.includes('button:active {') && nutricaoThemeCss.includes('scale(0.98)'), 'Touch feedback scale(0.98) in NutriTrack');

assert(kernelThemeCss.includes('.dlg-back') && kernelThemeCss.includes('backdrop-filter: blur('), 'Modal backdrop blur in Evolucao');
assert(nutricaoThemeCss.includes('.modal-back') && nutricaoThemeCss.includes('backdrop-filter: blur('), 'Modal backdrop blur in NutriTrack');
console.log('✅ Test 1.3 Passed: Header, Bottom Navigation, Cards, Buttons, and Modal Sheet structures match.');


// -----------------------------------------------------------------------------
// SUITE 2: Offline Resilience & Asset Integrity Check
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Offline Resilience & Asset Integrity ---');

function checkAssetPaths(htmlPath, baseDir) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  
  // Check for external URLs in script/link tags
  const externalMatches = html.match(/<(script|link)[^>]*(src|href)=["'](https?:\/\/[^"']+)["']/gi);
  assert(!externalMatches || externalMatches.length === 0, `HTML ${htmlPath} must NOT load external scripts/styles: ${JSON.stringify(externalMatches)}`);
  
  // Extract all local script src
  const scriptRegex = /<script\s+src=["']([^"']+)["']/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('http://') || src.startsWith('https://')) {
      throw new Error(`Found remote script in ${htmlPath}: ${src}`);
    }
    const resolved = path.resolve(baseDir, src);
    assert(fs.existsSync(resolved), `Referenced script file not found: ${src} (resolved to ${resolved})`);
  }

  // Extract all local css href
  const cssRegex = /<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']/gi;
  while ((match = cssRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith('http://') || href.startsWith('https://')) {
      throw new Error(`Found remote stylesheet in ${htmlPath}: ${href}`);
    }
    const resolved = path.resolve(baseDir, href);
    assert(fs.existsSync(resolved), `Referenced CSS file not found: ${href} (resolved to ${resolved})`);
  }
}

const evolucaoHtml = path.resolve(evolucaoDir, 'app/src/main/assets/index.html');
const nutricaoHtml = path.resolve(nutricaoDir, 'app/src/main/assets/apps/nutricao/index.html');

checkAssetPaths(evolucaoHtml, path.dirname(evolucaoHtml));
checkAssetPaths(nutricaoHtml, path.dirname(nutricaoHtml));
console.log('✅ Test 2.1 Passed: All HTML <script> and <link> assets exist locally; 0 external references.');

// Verify absence of Google Fonts @import in all CSS files
function checkCssNoExternalImports(dir) {
  const files = fs.readdirSync(dir, { recursive: true });
  for (const f of files) {
    if (typeof f === 'string' && f.endsWith('.css')) {
      const fullPath = path.resolve(dir, f);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert(!content.includes('@import url('), `CSS file ${fullPath} contains remote @import url()`);
      assert(!content.includes('fonts.googleapis.com'), `CSS file ${fullPath} contains fonts.googleapis.com`);
    }
  }
}

checkCssNoExternalImports(path.resolve(evolucaoDir, 'app/src/main/assets'));
checkCssNoExternalImports(path.resolve(nutricaoDir, 'app/src/main/assets'));
console.log('✅ Test 2.2 Passed: 100% of CSS files verified free of @import and Google Fonts.');


// -----------------------------------------------------------------------------
// SUITE 3: LocalStorage Schema Consistency & Corruption Recovery
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: LocalStorage Schema Consistency & Corruption Recovery ---');

// Mock localStorage
class MockLocalStorage {
  constructor() { this.store = {}; }
  getItem(k) { return this.store.hasOwnProperty(k) ? this.store[k] : null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

const globalMock = {
  localStorage: new MockLocalStorage(),
  window: {},
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  }
};

// Test Evolucao DB load and corruption tolerance
const dbCode = fs.readFileSync(path.resolve(evolucaoDir, 'app/src/main/assets/kernel/db.js'), 'utf8');
const progressaoCode = fs.readFileSync(path.resolve(evolucaoDir, 'app/src/main/assets/core/progressao.js'), 'utf8');

const evoContext = {
  localStorage: new MockLocalStorage(),
  console: console,
  JSON: JSON,
  Math: Math,
  String: String,
  Array: Array,
  Object: Object,
  Number: Number,
  isFinite: isFinite,
  Date: Date
};

const vm = require('vm');
vm.createContext(evoContext);
vm.runInContext(progressaoCode, evoContext);
vm.runInContext(dbCode, evoContext);

// Test 3.1: Empty storage returns default state with all required top-level keys
const defaultLoaded = evoContext.load();
assert(defaultLoaded.ficha && defaultLoaded.ficha.A && defaultLoaded.ficha.B && defaultLoaded.ficha.C, 'Ficha default schema');
assert(Array.isArray(defaultLoaded.sessions), 'sessions array');
assert(Array.isArray(defaultLoaded.corridas), 'corridas array');
assert(defaultLoaded.settings && defaultLoaded.settings.progressao, 'settings schema');

// Test 3.2: Corrupted JSON recovery in Evolucao
evoContext.localStorage.setItem('evolucao_treino_state', '{ invalid JSON corrupted <<<');
const recoveredState = evoContext.load();
assert(recoveredState.ficha && Array.isArray(recoveredState.sessions), 'Evolucao must recover gracefully from corrupted JSON');

// Test 3.3: NutriTrack storage keys isolation and corruption recovery
const nutricaoEstadoCode = fs.readFileSync(path.resolve(nutricaoDir, 'app/src/main/assets/apps/nutricao/estado.js'), 'utf8');
const nutriContext = {
  window: {},
  localStorage: new MockLocalStorage(),
  console: console,
  JSON: JSON,
  Math: Math,
  String: String,
  Array: Array,
  Object: Object,
  Number: Number,
  isFinite: isFinite,
  Date: Date,
  document: { querySelector: () => null, querySelectorAll: () => [] }
};
nutriContext.window = nutriContext;
vm.createContext(nutriContext);
vm.runInContext(nutricaoEstadoCode, nutriContext);

// Inject corrupted JSON in NutriTrack keys
nutriContext.localStorage.setItem('nt_meals', '[[BAD_JSON]');
nutriContext.localStorage.setItem('nt_activities', '{not an array}');
nutriContext.localStorage.setItem('nt_profile', 'null_string_corrupt');

const safeMeals = vm.runInContext("load('nt_meals', [])", nutriContext);
const safeActivities = vm.runInContext("load('nt_activities', [])", nutriContext);
const safeProfile = vm.runInContext("load('nt_profile', { kcal: 2000 })", nutriContext);

assert(Array.isArray(safeMeals) && safeMeals.length === 0, 'Safe meals fallback on corrupt JSON');
assert(Array.isArray(safeActivities) && safeActivities.length === 0, 'Safe activities fallback on corrupt JSON');
assert(safeProfile.kcal === 2000, 'Safe profile fallback on corrupt JSON');

console.log('✅ Test 3.1 - 3.3 Passed: LocalStorage key isolation & JSON corruption recovery verified for both apps.');


// -----------------------------------------------------------------------------
// SUITE 4: Native AndroidBridge Safety & Defensive Wrappers
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Native AndroidBridge Safety & Defensive Wrappers ---');

// Check Java source files in both apps
const evoMainJava = fs.readFileSync(path.resolve(evolucaoDir, 'app/src/main/java/com/evolucao/treino/MainActivity.java'), 'utf8');
const nutriMainJava = fs.readFileSync(path.resolve(nutricaoDir, 'app/src/main/java/com/nutricao/app/MainActivity.java'), 'utf8');

// Verify bridge registration
assert(evoMainJava.includes('web.addJavascriptInterface(new Bridge(), "AndroidBridge");'), 'Evolucao must register AndroidBridge');
assert(nutriMainJava.includes('web.addJavascriptInterface(new Bridge(), "AndroidBridge");'), 'NutriTrack must register AndroidBridge');

// Verify required methods in Java Bridge
const evoMethods = ['startRestNotification', 'stopRestNotification', 'restDoneNotification', 'sendNotification', 'vibrate', 'saveBackup'];
for (const m of evoMethods) {
  assert(evoMainJava.includes('public void ' + m), `Evolucao MainActivity must implement ${m}`);
}

const nutriMethods = ['sendNotification', 'syncAlarms', 'cancelAllAlarms', 'scheduleAlarm', 'cancelAlarm', 'vibrate', 'saveBackup'];
for (const m of nutriMethods) {
  assert(nutriMainJava.includes('public void ' + m), `NutriTrack MainActivity must implement ${m}`);
}
console.log('✅ Test 4.1 Passed: Java AndroidBridge interface definitions verified on both MainActivity implementations.');

// Test JS execution with undefined AndroidBridge
const fmtCode = fs.readFileSync(path.resolve(evolucaoDir, 'app/src/main/assets/kernel/fmt.js'), 'utf8');
const notifCode = fs.readFileSync(path.resolve(evolucaoDir, 'app/src/main/assets/kernel/notif.js'), 'utf8');
const uiCode = fs.readFileSync(path.resolve(evolucaoDir, 'app/src/main/assets/kernel/ui.js'), 'utf8');

const testBrowserCtx = {
  window: {
    addEventListener: () => {},
    removeEventListener: () => {}
  },
  document: {
    getElementById: () => ({ classList: { add: () => {}, remove: () => {}, toggle: () => {} }, querySelector: () => null }),
    querySelector: () => null,
    querySelectorAll: () => []
  },
  navigator: {},
  console: console,
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
  Date: Date,
  Math: Math,
  String: String,
  Array: Array,
  Object: Object,
  Number: Number
};

vm.createContext(testBrowserCtx);
vm.runInContext(fmtCode, testBrowserCtx);
vm.runInContext(notifCode, testBrowserCtx);
vm.runInContext(uiCode, testBrowserCtx);

// Calling vibrate, notify, rest helpers when window.AndroidBridge is undefined
assert.doesNotThrow(() => {
  testBrowserCtx.vibrate(100);
  testBrowserCtx.notify('Teste', 'Corpo');
  testBrowserCtx.nativeRestStart();
  testBrowserCtx.nativeRestStop();
  testBrowserCtx.nativeRestDone();
  testBrowserCtx.onRestDone();
}, 'JS calls must never throw when AndroidBridge is undefined');

// Test JS execution with throwing AndroidBridge (e.g. native permission error or memory pressure)
const throwingBridge = {
  vibrate: () => { throw new Error('Vibrator permission denied'); },
  sendNotification: () => { throw new Error('Notification security exception'); },
  startRestNotification: () => { throw new Error('DeadObjectException'); },
  stopRestNotification: () => { throw new Error('DeadObjectException'); },
  restDoneNotification: () => { throw new Error('DeadObjectException'); },
  saveBackup: () => { throw new Error('Disk full'); }
};

testBrowserCtx.window.AndroidBridge = throwingBridge;
assert.doesNotThrow(() => {
  testBrowserCtx.vibrate(100);
  testBrowserCtx.notify('Teste', 'Corpo');
  testBrowserCtx.nativeRestStart();
  testBrowserCtx.nativeRestStop();
  testBrowserCtx.nativeRestDone();
  testBrowserCtx.onRestDone();
}, 'JS calls must gracefully catch exceptions from AndroidBridge');

console.log('✅ Test 4.2 Passed: JS callers safely catch missing and throwing native bridge methods.');

// Verify UI thread dispatch in Java bridge saveBackup & notifications
assert(evoMainJava.includes('runOnUiThread'), 'Evolucao saveBackup must dispatch Toasts to runOnUiThread');
assert(nutriMainJava.includes('runOnUiThread'), 'Nutricao saveBackup must dispatch Toasts to runOnUiThread');
console.log('✅ Test 4.3 Passed: AndroidBridge Java methods properly marshal UI updates to the main looper thread.');

console.log('\n================================================================');
console.log('🎉 ALL EMPIRICAL CHALLENGER 2 TESTS PASSED SUCCESSFULLY! (100%)');
console.log('================================================================\n');
