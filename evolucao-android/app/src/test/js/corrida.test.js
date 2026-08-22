'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dummyEl = {
  onclick: null,
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {} },
  style: {},
  value: '',
  textContent: '',
  innerHTML: '',
  querySelectorAll: () => [],
  querySelector: () => null,
  getAttribute: () => null,
  setAttribute: () => {}
};

const windowObj = {
  addEventListener: () => {},
  removeEventListener: () => {},
  scrollTo: () => {},
  isSecureContext: false
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
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  document: {
    getElementById: () => dummyEl,
    querySelector: () => dummyEl,
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: {
      classList: { add: () => {}, remove: () => {}, toggle: () => {} }
    }
  },
  window: windowObj,
  self: windowObj,
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  navigator: {},
  tab: 'treino',
  state: null,
  initRest: () => {},
  initLiveTimer: () => {},
  renderTreino: () => '',
  bindTreino: () => {},
  decorateTreino: () => {},
  renderProgresso: () => '',
  bindProgresso: () => {},
  renderHistorico: () => '',
  bindHistorico: () => {},
  decorateHistoricoRir: () => {},
  renderFicha: () => '',
  bindFicha: () => {},
  decorateFicha: () => {},
  decorateProgressaoFicha: () => {}
};

vm.createContext(context);

const baseDir = path.resolve(__dirname, '../../main/assets');
const loadScript = (relPath) => {
  const code = fs.readFileSync(path.join(baseDir, relPath), 'utf8');
  vm.runInContext(code, context);
};

// Carrega os módulos do kernel e views
loadScript('kernel/fmt.js');
loadScript('kernel/icons.js');
loadScript('kernel/charts.js');
loadScript('apps/evolucao/exercicios/nomes.js');
loadScript('apps/evolucao/dados.js');
loadScript('kernel/db.js');
loadScript('apps/evolucao/logic.js');
loadScript('apps/evolucao/views/corrida.js');
loadScript('kernel/app.js');

console.log('=== [EVOLUÇÃO] Executando Suíte de Testes: Corrida & Cardio (R3) ===\n');

// -----------------------------------------------------------------------------
// 1. Cálculos de Corrida Contínua
// -----------------------------------------------------------------------------
console.log('--- 1. Cálculos de Corrida Contínua ---');
{
  const { calcPaceSec, fmtPace, calcSpeedKmh, calcCaloriesBurned } = context;

  // Teste 1.1: 5.0 km em 25 minutos (1500 segundos) -> 5:00 min/km e 12.0 km/h
  const p1 = calcPaceSec(5.0, 1500);
  assert.strictEqual(p1, 300, '5km em 25min deve resultar em 300 s/km');
  assert.strictEqual(fmtPace(p1), '5:00 min/km', 'Formatação de 300 s/km deve ser 5:00 min/km');

  const v1 = calcSpeedKmh(5.0, 1500);
  assert.strictEqual(Math.round(v1 * 10) / 10, 12.0, 'Velocidade deve ser 12.0 km/h');

  const kcal1 = calcCaloriesBurned(5.0, 1500, 75);
  assert.strictEqual(kcal1, Math.round(75 * 5.0 * 1.036), 'Calorias estimadas devem ser ~389 kcal');

  // Teste 1.2: 5.2 km em 28 min 15 seg (1695 segundos) -> 5:26 min/km e 11.04 km/h
  const p2 = calcPaceSec(5.2, 1695);
  assert.strictEqual(fmtPace(p2), '5:26 min/km', '5.2km em 1695s deve formatar para 5:26 min/km');
  const v2 = calcSpeedKmh(5.2, 1695);
  assert.strictEqual(Math.round(v2 * 100) / 100, 11.04, 'Velocidade deve ser 11.04 km/h');

  // Teste 1.3: Tratamento defensivo de limites (zeros, negativos, NaN)
  assert.strictEqual(calcPaceSec(0, 1200), 0, 'Distância zero deve retornar pace 0');
  assert.strictEqual(calcPaceSec(5, 0), 0, 'Tempo zero deve retornar pace 0');
  assert.strictEqual(calcPaceSec(-5, 1200), 0, 'Distância negativa deve retornar pace 0');
  assert.strictEqual(fmtPace(0), '--:-- min/km', 'Pace 0 deve formatar como --:-- min/km');
  assert.strictEqual(calcSpeedKmh(0, 1200), 0, 'Velocidade com distância 0 deve ser 0');
  assert.strictEqual(calcSpeedKmh(5, 0), 0, 'Velocidade com tempo 0 deve ser 0');

  console.log('✅ Teste 1: Cálculos de Corrida Contínua validados com sucesso.');
}

// -----------------------------------------------------------------------------
// 2. Cálculos de Corrida Intervalada / Alternada
// -----------------------------------------------------------------------------
console.log('--- 2. Cálculos de Corrida Intervalada / Alternada ---');
{
  const { calcIntervalRunTotal, buildIntervalPhases } = context;

  // Teste 2.1: Protocolo 8 ciclos de (1 min @ 9 km/h + 1 min @ 3 km/h)
  const cfg1 = {
    tiroMin: 1,
    tiroSec: 0,
    tiroKmh: 9.0,
    recupMin: 1,
    recupSec: 0,
    recupKmh: 3.0,
    ciclos: 8,
    warmupMin: 0,
    warmupSec: 0,
    warmupKmh: 0,
    cooldownMin: 0,
    cooldownSec: 0,
    cooldownKmh: 0
  };

  const res1 = calcIntervalRunTotal(cfg1);
  assert.strictEqual(res1.totalDurationSec, 960, 'Duração total deve ser 960s (16 min)');
  assert.strictEqual(res1.totalDistKm, 1.6, 'Distância total deve ser 1.60 km');
  assert.strictEqual(res1.avgSpeedKmh, 6.0, 'Velocidade média deve ser 6.0 km/h');
  assert.strictEqual(res1.paceFormatted, '10:00 min/km', 'Pace médio deve ser 10:00 min/km');

  // Teste 2.2: Fases do Live Runner geradas para 8 ciclos
  const phases1 = buildIntervalPhases(cfg1);
  assert.strictEqual(phases1.length, 16, '8 ciclos sem warmup/cooldown geram 16 fases (8 tiros + 8 recups)');
  assert.strictEqual(phases1[0].type, 'tiro', '1ª fase deve ser tiro');
  assert.strictEqual(phases1[0].speedKmh, 9.0, 'Velocidade da 1ª fase deve ser 9 km/h');
  assert.strictEqual(phases1[1].type, 'recup', '2ª fase deve ser recuperação');
  assert.strictEqual(phases1[1].speedKmh, 3.0, 'Velocidade da 2ª fase deve ser 3 km/h');

  // Teste 2.3: Intervalos com Aquecimento (3 min @ 5 km/h) e Desaquecimento (2 min @ 4 km/h)
  const cfg2 = {
    tiroMin: 1,
    tiroSec: 0,
    tiroKmh: 9.0,
    recupMin: 1,
    recupSec: 0,
    recupKmh: 3.0,
    ciclos: 8,
    warmupMin: 3,
    warmupSec: 0,
    warmupKmh: 5.0,
    cooldownMin: 2,
    cooldownSec: 0,
    cooldownKmh: 4.0
  };

  const res2 = calcIntervalRunTotal(cfg2);
  assert.strictEqual(res2.totalDurationSec, 1260, 'Duração total com warmup e cooldown deve ser 1260s (21 min)');
  // Warmup: 3min * 5kmh / 60 = 0.25 km
  // Ciclos: 1.60 km
  // Cooldown: 2min * 4kmh / 60 = 0.1333 km
  // Total: 0.25 + 1.60 + 0.1333 = 1.98 km
  assert.strictEqual(res2.totalDistKm, 1.98, 'Distância total deve ser 1.98 km');
  assert.strictEqual(res2.avgSpeedKmh, 5.7, 'Velocidade média deve ser 5.7 km/h');

  const phases2 = buildIntervalPhases(cfg2);
  assert.strictEqual(phases2.length, 18, '1 warmup + 16 ciclos + 1 cooldown = 18 fases');
  assert.strictEqual(phases2[0].type, 'warmup', '1ª fase deve ser warmup');
  assert.strictEqual(phases2[phases2.length - 1].type, 'cooldown', 'Última fase deve ser cooldown');

  console.log('✅ Teste 2: Cálculos de Corrida Intervalada validados com sucesso.');
}

// -----------------------------------------------------------------------------
// 3. Persistência, Migração e Mesclagem de Estado (kernel/db.js)
// -----------------------------------------------------------------------------
console.log('--- 3. Migração, Persistência e Merge de Corridas ---');
{
  const { DEFAULT_STATE, migrate, mergeState } = context;

  // Teste 3.1: DEFAULT_STATE possui campos de cardio e corrida
  assert(Array.isArray(DEFAULT_STATE.corridas), 'DEFAULT_STATE.corridas deve ser um array');
  assert.strictEqual(DEFAULT_STATE.cardioGoalKm, 15, 'DEFAULT_STATE.cardioGoalKm padrão deve ser 15');

  // Teste 3.2: migrate() adiciona corridas e cardioGoalKm em estados legados
  const legacyState = {
    sessions: [{ id: 1, date: '2026-08-01', day: 'A', entries: {} }],
    peso: [{ date: '2026-08-01', kg: 75 }]
  };
  const migrated = migrate(legacyState);
  assert(Array.isArray(migrated.corridas), 'migrate() deve garantir array corridas');
  assert.strictEqual(migrated.cardioGoalKm, 15, 'migrate() deve garantir cardioGoalKm default');

  // Teste 3.3: mergeState() mescla corridas sem duplicatas
  const curState = {
    sessions: [],
    corridas: [
      { id: 101, date: '2026-08-10', mode: 'continua', distanciaKm: 5.0, duracaoSeg: 1500 },
      { id: 102, date: '2026-08-12', mode: 'continua', distanciaKm: 6.0, duracaoSeg: 1800 }
    ],
    peso: [],
    cardioGoalKm: 20,
    ficha: DEFAULT_STATE.ficha,
    draft: { day: null, date: null, entries: {} },
    settings: DEFAULT_STATE.settings
  };

  const incomingState = {
    sessions: [],
    corridas: [
      // Corrida duplicada (deve ser ignorada)
      { id: 101, date: '2026-08-10', mode: 'continua', distanciaKm: 5.0, duracaoSeg: 1500 },
      // Corrida nova (deve ser adicionada)
      { id: 103, date: '2026-08-14', mode: 'intervalada', distanciaKm: 2.0, duracaoSeg: 1200 }
    ],
    peso: [],
    cardioGoalKm: 15,
    ficha: DEFAULT_STATE.ficha
  };

  const mergedResult = mergeState(curState, incomingState);
  assert.strictEqual(mergedResult.addedCorridas, 1, 'Deveria ter adicionado exatamente 1 corrida nova');
  assert.strictEqual(mergedResult.state.corridas.length, 3, 'Total de corridas mescladas deve ser 3');
  assert.strictEqual(mergedResult.state.cardioGoalKm, 20, 'Meta atual de cardio deve ser preservada');

  console.log('✅ Teste 3: Migração e Merge de Corridas validados com sucesso.');
}

// -----------------------------------------------------------------------------
// 4. Volume Semanal Cumulativo de Cardio
// -----------------------------------------------------------------------------
console.log('--- 4. Volume Semanal Cumulativo de Cardio ---');
{
  const { weekCardioDistance } = context;

  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  const monStr = monday.toISOString().slice(0, 10);

  const pastDate = new Date(now);
  pastDate.setDate(now.getDate() - 30);
  const pastStr = pastDate.toISOString().slice(0, 10);

  context.state = {
    corridas: [
      { id: 1, date: monStr, distanciaKm: 5.5, duracaoSeg: 1650 },
      { id: 2, date: monStr, distanciaKm: 3.5, duracaoSeg: 1100 },
      { id: 3, date: pastStr, distanciaKm: 10.0, duracaoSeg: 3000 } // Não deve contar na semana
    ]
  };

  const weekKm = weekCardioDistance();
  assert.strictEqual(weekKm, 9.0, 'Distância da semana deve somar apenas sessões da semana atual (5.5 + 3.5 = 9.0)');

  console.log('✅ Teste 4: Volume semanal cumulativo validado com sucesso.');
}

// -----------------------------------------------------------------------------
// 5. Gráficos Vetoriais SVG (Pace & Distância)
// -----------------------------------------------------------------------------
console.log('--- 5. Gráficos Vetoriais SVG ---');
{
  const { chartSVG, paceChartSVG } = context;

  // Teste 5.1: chartSVG com menos de 2 pontos retorna estado vazio
  const emptySvg1 = chartSVG([{ x: '2026-08-10', y: 5.0 }], '#3b82f6');
  assert(emptySvg1.includes('empty'), 'Menos de 2 pontos deve retornar container empty');

  // Teste 5.2: chartSVG com múltiplos pontos gera SVG válido
  const distPts = [
    { x: '2026-08-10', y: 5.0 },
    { x: '2026-08-12', y: 6.2 },
    { x: '2026-08-15', y: 7.5 }
  ];
  const distSvg = chartSVG(distPts, '#3b82f6');
  assert(distSvg.includes('<svg viewBox="0 0 340 158">'), 'Deve gerar tag SVG com viewBox');
  assert(distSvg.includes('<polyline'), 'Deve conter polyline com os pontos');
  assert(!distSvg.includes('NaN'), 'SVG não deve conter valores NaN');

  // Teste 5.3: paceChartSVG gera eixos com formatação de tempo (MM:SS)
  const pacePts = [
    { x: '2026-08-10', y: 360 }, // 6:00 min/km
    { x: '2026-08-12', y: 330 }, // 5:30 min/km
    { x: '2026-08-15', y: 300 }  // 5:00 min/km
  ];
  const paceSvg = paceChartSVG(pacePts, '#f97a53');
  assert(paceSvg.includes('<svg viewBox="0 0 340 158">'), 'Deve gerar tag SVG de pace');
  assert(paceSvg.includes('5:00'), 'Deve exibir menor pace formatado no eixo');
  assert(paceSvg.includes('6:00'), 'Deve exibir maior pace formatado no eixo');
  assert(!paceSvg.includes('NaN'), 'Pace SVG não deve conter NaN');

  console.log('✅ Teste 5: Gráficos SVG de Distância e Pace validados com sucesso.');
}

// -----------------------------------------------------------------------------
// 6. Navegação e Roteamento de Abas (kernel/app.js)
// -----------------------------------------------------------------------------
console.log('--- 6. Navegação e Roteamento de Abas ---');
{
  const { TABS, NAV_ICONS } = context;

// Teste 6.1: Array TABS possui 6 abas na ordem exata especificada
assert.strictEqual(TABS.length, 6, 'Deve conter exatamente 6 abas');
const expectedTabs = ['treino', 'corrida', 'maratona', 'progresso', 'historico', 'ficha'];
  expectedTabs.forEach((tabId, idx) => {
    assert.strictEqual(TABS[idx].id, tabId, `Aba na posição ${idx} deve ser ${tabId}`);
  });

  // Teste 6.2: NAV_ICONS possui ícone de corredor para corrida
  assert(NAV_ICONS.corrida, 'NAV_ICONS.corrida deve estar definido');
  assert(NAV_ICONS.corrida.includes('<path'), 'Ícone de corrida deve conter elementos path SVG');

  console.log('✅ Teste 6: Navegação de 5 abas e ícone de corrida validados com sucesso.');
}

// -----------------------------------------------------------------------------
// 7. Modal de Ajuste de Meta Semanal & Steppers (Validação de UI e Handlers)
// -----------------------------------------------------------------------------
console.log('--- 7. Modal de Ajuste de Meta Semanal & Steppers ---');
{
  let lastDlgConfig = null;
  context.dlg = function(cfg){
    lastDlgConfig = cfg;
  };
  context.state = {
    sessions: [],
    corridas: [],
    peso: [],
    cardioGoalKm: 15,
    ficha: context.DEFAULT_STATE.ficha,
    settings: context.DEFAULT_STATE.settings
  };

  const btnGoalMock = { onclick: null };
  context.document.getElementById = function(id){
    if(id === 'btnEditCardioGoal') return btnGoalMock;
    return dummyEl;
  };

  context.bindCorrida();
  assert(btnGoalMock.onclick, 'btnEditCardioGoal deve ter evento onclick');

  btnGoalMock.onclick();
  assert(lastDlgConfig, 'dlg deve ter sido chamado ao clicar em Ajustar Meta');
  assert.strictEqual(lastDlgConfig.input, true, 'dlg deve conter input: true para renderizar campo de entrada');
  assert.strictEqual(lastDlgConfig.num, true, 'dlg deve definir num: true para teclado numérico');
  assert.strictEqual(lastDlgConfig.value, 15, 'dlg deve vir preenchido com a meta atual');

  // Testa salvamento com valor numérico e valor com vírgula decimal
  lastDlgConfig.onOk('22.5');
  assert.strictEqual(context.state.cardioGoalKm, 22.5, 'Meta deve ser atualizada para 22.5 km');

  lastDlgConfig.onOk('18,7');
  assert.strictEqual(context.state.cardioGoalKm, 18.7, 'Meta deve aceitar vírgula e atualizar para 18.7 km');

  console.log('✅ Teste 7: Modal de Ajuste de Meta Semanal validado com sucesso.');
}

console.log('\n======================================================');
console.log('🎉 TODOS OS TESTES DA ABA CORRIDA (M3) PASSARAM!');
console.log('======================================================\n');
