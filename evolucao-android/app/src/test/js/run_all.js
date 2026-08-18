'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const tests = [
  'progressao.test.js',
  'db_merge.test.js',
  'logic.test.js',
  'body_visualizer.test.js',
  'treino_fixes.test.js',
  'challenger_stress.test.js',
  'challenger_m1_2.test.js',
  'challenger_m2_1.test.js',
  'challenger_m2_2.test.js',
  'corrida.test.js',
  'challenger_m3_2.test.js',
  'm4_challenger2_verification.test.js',
  'r4_evolucao_regression.test.js',
  'challenger_preview_m1_m2_2_treino.test.js',
  'ble_diag.test.js'
];

console.log('=== [EVOLUÇÃO] Executando Suíte de Testes Unitários ===\n');

let failed = 0;
for (const test of tests) {
  const filePath = path.join(__dirname, test);
  const res = spawnSync(process.execPath, [filePath], { stdio: 'inherit' });
  if (res.status !== 0) {
    failed++;
    console.error(`\n❌ Falha no teste: ${test}`);
  }
}

console.log('\n======================================================');
if (failed === 0) {
  console.log(`✅ Todos os ${tests.length} arquivos de teste passaram com sucesso!`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} de ${tests.length} arquivos de teste falharam!`);
  process.exit(1);
}
