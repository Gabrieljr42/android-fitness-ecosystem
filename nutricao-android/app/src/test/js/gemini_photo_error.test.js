'use strict';

const assert = require('assert');
const path = require('path');
const vm = require('vm');
const fs = require('fs');

console.log('================================================================');
console.log('=== [NUTRITRACK] SUÍTE DE TESTES: DIAGNÓSTICO E LOGS DE FOTOS ===');
console.log('=== R4: Tratamento de Erros, Timeout e Modal de Diagnóstico   ===');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
  }
}

// Setup simulated environment for gemini.js
function createNutriContext(customState = {}) {
  let modalContent = '';
  let toastMsg = '';
  let renderCalled = 0;

  const aiStepsElement = {
    innerHTML: '',
    children: [],
    style: {}
  };

  const fotoLegendaElement = {
    value: '',
    style: {}
  };

  const aiCancelElement = {
    disabled: false,
    textContent: 'Cancelar',
    style: {}
  };

  const elementsMap = {
    '#fotoLegenda': fotoLegendaElement,
    '#aiSteps': aiStepsElement,
    '#aiCancel': aiCancelElement,
    '#cP': { value: 0 },
    '#cC': { value: 0 },
    '#cG': { value: 0 },
    '#itensBox': { innerHTML: '' }
  };

  const ctx = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    parseFloat,
    parseInt,
    isFinite,
    isNaN,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    TypeError,
    apikey: 'test_api_key_123',
    pref: { precisao: 'rapida', paralelo: false },
    profile: { peso: 75 },
    state: Object.assign({ tab: 'hoje', dia: '2026-08-27', refeicoes: [] }, customState),
    openModal: html => { modalContent = html; },
    closeModal: () => { modalContent = ''; },
    toast: msg => { toastMsg = msg; },
    render: () => { renderCalled++; },
    getModalContent: () => modalContent + '\n' + aiStepsElement.innerHTML,
    getLastToast: () => toastMsg,
    $: sel => elementsMap[sel] || null,
    document: {
      body: { contains: () => true, appendChild: () => {} },
      createElement: tag => ({
        id: '',
        type: '',
        accept: '',
        capture: '',
        style: {},
        value: '',
        click() {},
        getContext: () => ({ drawImage: () => {} }),
        toDataURL: () => 'data:image/jpeg;base64,mockResizedB64'
      }),
      getElementById: id => elementsMap['#' + id] || null,
      addEventListener: () => {}
    },
    FileReader: class {
      readAsDataURL(file) {
        if (file && file._shouldError) {
          if (typeof this.onerror === 'function') this.onerror(new Error('Mock FileReader I/O Error'));
        } else if (file && file._b64) {
          this.result = 'data:image/jpeg;base64,' + file._b64;
          if (typeof this.onload === 'function') this.onload();
        } else {
          this.result = 'data:image/jpeg;base64,validBase64MockString';
          if (typeof this.onload === 'function') this.onload();
        }
      }
    },
    Image: class {
      set src(val) {
        if (val.includes('invalid_image_corrupt')) {
          if (typeof this.onerror === 'function') this.onerror(new Error('Corrupt Image Error'));
        } else {
          this.naturalWidth = 800;
          this.naturalHeight = 600;
          if (typeof this.onload === 'function') this.onload();
        }
      }
    },
    window: {}
  };

  ctx.window = ctx;

  const code = fs.readFileSync(path.resolve(__dirname, '../../main/assets/core/gemini.js'), 'utf8');
  vm.createContext(ctx);
  vm.runInContext(code, ctx);

  return ctx;
}

(async () => {
  // -----------------------------------------------------------------------------
  // TIER 1: Functional Error Handling Coverage
  // -----------------------------------------------------------------------------
  console.log('--- TIER 1: Functional Error Handling Coverage Tests ---');

  await testAsync('1.1: Missing API key handling in processarFoto redirects to Ajustes', async () => {
    const ctx = createNutriContext();
    ctx.apikey = '';

    await ctx.processarFoto({ name: 'photo.jpg' });
    assert.strictEqual(ctx.getLastToast(), 'Configure a chave da API em Ajustes primeiro');
  });

  await testAsync('1.2: Null / undefined file input in processarFoto displays modal with retry button', async () => {
    const ctx = createNutriContext();
    await ctx.processarFoto(null);

    const modal = ctx.getModalContent();
    assert.ok(modal.includes('Foto não selecionada'), 'Modal must report unselected photo');
    assert.ok(modal.includes('Tentar novamente'), 'Modal must offer retry action');
  });

  await testAsync('1.3: FileReader failure displays diagnostic modal with trace details and retry action', async () => {
    const ctx = createNutriContext();
    const badFile = { name: 'corrupt.jpg', _shouldError: true };

    await ctx.processarFoto(badFile);
    const modal = ctx.getModalContent();
    assert.ok(modal.includes('Erro ao processar imagem'), 'Modal must report image processing error');
    assert.ok(modal.includes('Diagnóstico do erro'), 'Modal must include diagnostic trace details');
    assert.ok(modal.includes('Tentar novamente'), 'Modal must include retry button');
  });

  await testAsync('1.4: Base64 decode and canvas resizing error resilience', async () => {
    const ctx = createNutriContext();
    const corruptImgFile = { name: 'broken.jpg', _b64: 'invalid_image_corrupt' };

    await ctx.processarFoto(corruptImgFile);
    const modal = ctx.getModalContent();
    assert.ok(modal.includes('Descrever foto'), 'Must fallback safely to original base64 without crashing');
  });

  await testAsync('1.5: tentarNovamenteFoto() re-invokes photo workflow', async () => {
    const ctx = createNutriContext();
    let retryCalled = false;
    ctx.window.__fotoContinue = () => { retryCalled = true; };

    ctx.tentarNovamenteFoto();
    assert.strictEqual(retryCalled, true);
  });

  // -----------------------------------------------------------------------------
  // TIER 2: Boundary Value Analysis & Timeout Tests
  // -----------------------------------------------------------------------------
  console.log('\n--- TIER 2: Boundary Value Analysis & Timeout Tests ---');

  await testAsync('2.1: Network timeout in consultarModelo produces status 408 and retryable flag', async () => {
    const ctx = createNutriContext();
    ctx.fetch = () => new Promise((_, reject) => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      reject(err);
    });

    const model = { id: 'gemini-3.7-flash', label: 'Gemini 3.7', thinkingLevel: 'low' };
    const trace = await ctx.consultarModelo(model, 'b64data', 0, 1, 'mock_key');
    assert.strictEqual(trace.ok, false);
    assert.strictEqual(trace.status, 408);
    assert.strictEqual(trace.retryable, true);
    assert.ok(trace.error.includes('timeout de rede'), 'Error message must specify timeout');
  });

  await testAsync('2.2: Offline / connection failure in consultarModelo handled safely', async () => {
    const ctx = createNutriContext();
    ctx.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    const model = { id: 'gemini-3.7-flash', label: 'Gemini 3.7', thinkingLevel: 'low' };
    const trace = await ctx.consultarModelo(model, 'b64data', 0, 1, 'mock_key');
    assert.strictEqual(trace.ok, false);
    assert.strictEqual(trace.retryable, true);
    assert.ok(trace.error.includes('Falha de conexão'), 'Error message must identify connection failure');
  });

  await testAsync('2.3: HTTP 429 Rate Limit error produces retryable trace with hint', async () => {
    const ctx = createNutriContext();
    ctx.fetch = () => Promise.resolve({
      ok: false,
      status: 429,
      text: () => Promise.resolve(JSON.stringify({ error: { message: 'Resource has been exhausted (e.g. check quota)' } }))
    });

    const model = { id: 'gemini-3.7-flash', label: 'Gemini 3.7', thinkingLevel: 'low' };
    const trace = await ctx.consultarModelo(model, 'b64data', 0, 1, 'mock_key');
    assert.strictEqual(trace.ok, false);
    assert.strictEqual(trace.status, 429);
    assert.strictEqual(trace.retryable, true);
  });

  await testAsync('2.4: HTTP 401 / 403 API Key error produces non-retryable trace', async () => {
    const ctx = createNutriContext();
    ctx.fetch = () => Promise.resolve({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: { message: 'API key not valid' } }))
    });

    const model = { id: 'gemini-3.7-flash', label: 'Gemini 3.7', thinkingLevel: 'low' };
    const trace = await ctx.consultarModelo(model, 'b64data', 0, 1, 'bad_key');
    assert.strictEqual(trace.ok, false);
    assert.strictEqual(trace.status, 401);
    assert.strictEqual(trace.retryable, false);
  });

  await testAsync('2.5: Blocked safety response produces clean diagnostic trace', async () => {
    const ctx = createNutriContext();
    ctx.fetch = () => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        promptFeedback: { blockReason: 'SAFETY' }
      }))
    });

    const model = { id: 'gemini-3.7-flash', label: 'Gemini 3.7', thinkingLevel: 'low' };
    const trace = await ctx.consultarModelo(model, 'b64data', 0, 1, 'mock_key');
    assert.strictEqual(trace.ok, false);
    assert.ok(trace.error.includes('resposta bloqueada (SAFETY)'));
  });

  // -----------------------------------------------------------------------------
  // TIER 3: Cross-Feature Diagnostic UI & State Tests
  // -----------------------------------------------------------------------------
  console.log('\n--- TIER 3: Cross-Feature Diagnostic UI & State Tests ---');

  await testAsync('3.1: Diagnostic error modal contains apiTraceHtml and Tentar novamente action', async () => {
    const ctx = createNutriContext();
    ctx.fetch = () => Promise.resolve({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable')
    });

    await ctx.processarFoto({ name: 'plate.jpg' });
    await ctx.window.__fotoContinue();

    const modal = ctx.getModalContent();
    assert.ok(modal.includes('Não foi possível analisar a foto'), 'Must state inability to analyze photo');
    assert.ok(modal.includes('tentarNovamenteFoto()'), 'Must include tentarNovamenteFoto action');
    assert.ok(modal.includes('Adicionar manual'), 'Must include manual fallback action');
  });

  await testAsync('3.2: User cancellation aborts active run cleanly', async () => {
    const ctx = createNutriContext();
    let abortCalled = false;
    ctx.window.__fotoRun = {
      cancelled: false,
      controller: { abort: () => { abortCalled = true; } },
      waiters: []
    };

    ctx.encerrarAnaliseFoto();
    assert.strictEqual(ctx.window.__fotoRun.cancelled, true);
    assert.strictEqual(abortCalled, true);
  });

  await testAsync('3.3: Photo description prompt preserves custom user caption across retry', async () => {
    const ctx = createNutriContext();
    await ctx.processarFoto({ name: 'breakfast.jpg' });
    assert.strictEqual(ctx.window.__fotoLegenda, '');

    // User types caption
    const legendaEl = ctx.$('#fotoLegenda');
    legendaEl.value = 'Omelete de 3 ovos com queijo';
    ctx.fetch = () => Promise.reject(new Error('Network drop'));

    await ctx.window.__fotoContinue();
    assert.strictEqual(ctx.window.__fotoLegenda, 'Omelete de 3 ovos com queijo');
  });

  await testAsync('3.4: Diagnostic HTML sanitization prevents XSS in error traces', async () => {
    const ctx = createNutriContext();
    const maliciousTrace = {
      ok: false,
      analysisIndex: 0,
      attempt: 1,
      modelLabel: 'Gemini',
      status: 500,
      error: '<script>alert("xss")</script>',
      body: '{"error": "<img src=x onerror=alert(1)>"}'
    };

    const html = ctx.apiTraceHtml(maliciousTrace, 0);
    assert.ok(!html.includes('<script>alert'), 'XSS tags must be escaped');
    assert.ok(html.includes('&lt;script&gt;alert'), 'Characters must be entity-encoded');
  });

  await testAsync('3.5: Multi-attempt waitMs delay responds cleanly to cancellation', async () => {
    const ctx = createNutriContext();
    const run = { cancelled: false, waiters: [] };
    const waitPromise = ctx.waitMs(5000, run);

    assert.strictEqual(run.waiters.length, 1);
    // Cancel immediately
    run.waiters[0]();
    await waitPromise;
  });

  // -----------------------------------------------------------------------------
  // TIER 4: Real-World Workload Scenarios
  // -----------------------------------------------------------------------------
  console.log('\n--- TIER 4: Real-World Application Scenarios (Scenario 5) ---');

  await testAsync('4.1: Scenario 5: User in low-connectivity photo analysis fails -> diagnostic modal with retry -> retry succeeds', async () => {
    const ctx = createNutriContext();
    let networkFailures = 6; // Fail all initial attempts across fallbacks

    ctx.fetch = () => {
      if (networkFailures > 0) {
        networkFailures--;
        const err = new Error('Connection timed out');
        err.name = 'AbortError';
        return Promise.reject(err);
      }
      // Retry succeeds
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  nome_refeicao: 'Prato Feito Brasileiro',
                  itens: [
                    { nome: 'Arroz e feijão', porcao_g: 200, kcal: 280, proteina_g: 8, carbo_g: 50, gordura_g: 4 },
                    { nome: 'Peito de frango grelhado', porcao_g: 150, kcal: 240, proteina_g: 45, carbo_g: 0, gordura_g: 5 }
                  ],
                  kcal_total: 520,
                  proteina_total: 53,
                  carbo_total: 50,
                  gordura_total: 9,
                  confianca: 'alta'
                })
              }]
            }
          }]
        }))
      });
    };

    // Step 1: User takes photo
    await ctx.processarFoto({ name: 'almoco.jpg' });

    // Step 2: First analysis attempt fails completely
    await ctx.window.__fotoContinue();
    let modal = ctx.getModalContent();
    assert.ok(modal.includes('Não foi possível analisar a foto'), 'Diagnostic modal must appear');
    assert.ok(modal.includes('tentarNovamenteFoto()'), 'Retry action must be present in modal');

    // Step 3: User taps "Tentar novamente" (now network is good)
    await ctx.tentarNovamenteFoto();
    modal = ctx.getModalContent();
    assert.ok(modal.includes('Prato identificado'), 'Success confirmation modal must appear upon successful retry');
    assert.ok(modal.includes('Prato Feito Brasileiro'), 'Identified meal name must be rendered');
    assert.ok(modal.includes('520'), 'Identified calories must be displayed');
  });

  await testAsync('4.2: Recovery from corrupted image file to valid photo re-selection', async () => {
    const ctx = createNutriContext();
    let openFotoCount = 0;
    ctx.openFoto = () => { openFotoCount++; };

    // File 1 is corrupted
    await ctx.processarFoto({ name: 'corrupted.bin', _shouldError: true });
    let modal = ctx.getModalContent();
    assert.ok(modal.includes('Erro ao processar imagem'));
    assert.ok(modal.includes('openFoto()'));

    // User taps retry which calls openFoto to re-select
    ctx.openFoto();
    assert.strictEqual(openFotoCount, 1);
  });

  console.log('\n================================================================');
  if (failCount === 0) {
    console.log(`🎉 TODOS OS ${passCount} DE ${passCount} TESTES DE DIAGNÓSTICO DE FOTO PASSARAM!`);
    process.exit(0);
  } else {
    console.error(`❌ ${failCount} TESTES FALHARAM!`);
    process.exit(1);
  }
})();
