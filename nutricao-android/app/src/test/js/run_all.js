'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const tests = [
  'gemini_merge.test.js',
  'tdee_macros.test.js',
  'gemini_text.test.js',
  'habits_water.test.js',
  'meal_plan_custom_food.test.js',
  'notifications.test.js',
  'activity_tdee.test.js',
  'gemini_activity.test.js',
  'evolucao_workout_bridge.test.js',
  'challenger_m1_1_stress.test.js',
  'adversarial_m2_stress.test.js',
  'challenger_m2_empirical.test.js',
  'challenger_m2_2_activity_stress.test.js',
  'challenger_m3_2_adversarial.test.js',
  'r4_nutricao_regression.test.js',
  'challenger_preview_m1_m2_2_nutricao.test.js',
  'custom_reminders_positive_messages.test.js',
  'r5_nt_security.test.js',
  'r6_ai_item_ui.test.js',
  'r7_alim_kcal.test.js',
  'r7_strength_import.test.js',
  'challenger_m3_1.test.js',
  'challenger_m3_stress_matrix.test.js',
  'challenger_r3_timezone_stress.test.js',
  'empirical_m3_adversarial.test.js',
  'meal_plan_habits.test.js'
];

console.log('=== [NUTRITRACK] Executando Suíte de Testes Unitários ===\n');

let failed = 0;
for (const test of tests) {
  const filePath = path.join(__dirname, test);
  const res = spawnSync(process.execPath, [filePath], { stdio: 'inherit' });
  if (res.status !== 0) {
    failed++;
    console.error(`\n❌ Falha no teste: ${test}`);
  }
}

console.log('\n========================================================');
if (failed === 0) {
  console.log(`✅ Todos os ${tests.length} arquivos de teste passaram com sucesso!`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} de ${tests.length} arquivos de teste falharam!`);
  process.exit(1);
}
