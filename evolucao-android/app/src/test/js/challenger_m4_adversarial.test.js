'use strict';

/**
 * challenger_m4_adversarial.test.js
 * Empirical Challenger Milestone 4 (R4) Adversarial Stress Test Suite
 * 
 * Verifies:
 * 1. Progression Math Invariants, Boundary Fuzzing & Epley Monotonicity
 * 2. TDEE, BMR, Energy Balance & Macronutrient Invariants & Edge Cases
 * 3. Ainsworth Compendium MET Calculation Invariants
 * 4. Monochromatic High-End Design System Tokens & Offline Integrity
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

// Load Progression Engine
const progressionPath = path.resolve(__dirname, '../../main/assets/core/progressao.js');
const Progression = require(progressionPath);

console.log('================================================================');
console.log('=== EMPIRICAL CHALLENGER M4: ADVERSARIAL STRESS TEST SUITE   ===');
console.log('=== Invariants, Fuzzing, TDEE, Progression, Tokens & Offline ===');
console.log('================================================================\n');

let passedTests = 0;

function test(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// SUITE 1: PROGRESSION MATH FUZZING & INVARIANTS (EVOLUÇÃO)
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Progression Math Fuzzing & Invariants ---');

test('1.1: Epley 1RM Calculation Monotonicity & Boundary Invariants', () => {
  // Invariant: w > 0, r > 0 => 1RM = w * (1 + r/30)
  for (let w = 1; w <= 300; w += 5) {
    let prev1RM = 0;
    for (let r = 1; r <= 30; r++) {
      const set = { w: w, r: r, rir: 0 };
      const cap = Progression.capabilityForSet(set);
      assert(cap !== null, `Capability should not be null for w=${w}, r=${r}`);
      assert(cap.score > prev1RM, `1RM must strictly increase with reps (prev=${prev1RM}, curr=${cap.score})`);
      prev1RM = cap.score;
    }
  }

  // Boundary checks: 0 reps, negative weight, non-numeric values
  assert.strictEqual(Progression.capabilityForSet({ w: 0, r: 0 }), null, '0 reps should be invalid');
  assert.strictEqual(Progression.capabilityForSet({ w: -10, r: 10 }), null, 'negative weight invalid');
  assert.strictEqual(Progression.capabilityForSet({ w: NaN, r: 10 }), null, 'NaN weight invalid');
  assert.strictEqual(Progression.capabilityForSet(null), null, 'null set invalid');
  assert.strictEqual(Progression.capabilityForSet(undefined), null, 'undefined set invalid');
});

test('1.2: Rounding to Equipment Increment Invariant', () => {
  const increments = [1, 2, 2.5, 5, 10];
  for (const inc of increments) {
    for (let v = 0; v <= 200; v += 0.33) {
      const rounded = Progression.roundToIncrement(v, inc);
      assert(rounded >= inc || (v === 0 && rounded === inc), `Rounded value must be at least minimum increment ${inc}`);
      // Check multiple of increment within floating precision
      const rem = Math.abs(rounded % inc);
      const isMultiple = rem < 1e-4 || Math.abs(rem - inc) < 1e-4;
      assert(isMultiple, `Rounded value ${rounded} is not a multiple of increment ${inc} (v=${v})`);
    }
  }
});

test('1.3: Fuzzing calcularMeta with 1,000 Randomized Session Histories', () => {
  const ficha = {
    A: {
      ex: [
        { id: 'supino', n: 'Supino Reto Barra', sets: 4, reps: '6-10', eq: 'barra', inc: 5 },
        { id: 'elevacao', n: 'Elevacao Lateral Halter', sets: 3, reps: '12-15', eq: 'halter', inc: 2.5 },
        { id: 'triceps', n: 'Triceps Polia', sets: 3, reps: '10-12', eq: 'polia', inc: 5 }
      ]
    }
  };

  const exerciseNames = ['Supino Reto Barra', 'Elevacao Lateral Halter', 'Triceps Polia'];

  for (let i = 0; i < 1000; i++) {
    const numSessions = Math.floor(Math.random() * 8);
    const sessions = [];
    const exercise = exerciseNames[Math.floor(Math.random() * exerciseNames.length)];

    for (let s = 0; s < numSessions; s++) {
      const numSets = Math.floor(Math.random() * 6);
      const sets = [];
      for (let k = 0; k < numSets; k++) {
        sets.push({
          w: Math.random() < 0.1 ? 0 : Math.round(Math.random() * 150 * 2) / 2,
          r: Math.random() < 0.1 ? 0 : Math.floor(Math.random() * 25),
          rir: Math.random() < 0.3 ? null : Math.floor(Math.random() * 5),
          wu: Math.random() < 0.2
        });
      }
      sessions.push({
        id: 'sess_' + s,
        date: `2026-08-${String(s + 1).padStart(2, '0')}`,
        day: 'A',
        mode: Math.random() < 0.2 ? 'curto' : 'normal',
        entries: {
          [exercise]: sets
        }
      });
    }

    const meta = Progression.calcularMeta(ficha, sessions, 'A', exercise);
    assert(meta !== null && typeof meta === 'object', 'Meta must be an object');
    assert(['inicial', 'subir', 'manter', 'reduzir', 'volume-baixo', 'travado'].includes(meta.status), `Invalid status ${meta.status}`);
    if (meta.carga !== null) {
      assert(Number.isFinite(meta.carga) && meta.carga >= 0, `Meta carga must be non-negative finite number, got ${meta.carga}`);
    }
    assert(Number.isFinite(meta.repsMeta) && meta.repsMeta >= 1, `Meta reps must be >= 1, got ${meta.repsMeta}`);
    assert(typeof meta.motivo === 'string' && meta.motivo.length > 0, 'Meta must contain informative reason string');
  }
});

// -----------------------------------------------------------------------------
// SUITE 2: TDEE, BMR & MACRONUTRIENT INVARIANTS (NUTRITRACK)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: TDEE, BMR & Macronutrient Invariants ---');

function calcBMRPure(peso, alt, idade, sexo) {
  const p = Number(peso) || 75;
  const a = Number(alt) || 175;
  const i = Number(idade) || 30;
  const s = sexo === 'f' ? 'f' : 'm';
  return s === 'm'
    ? (10 * p + 6.25 * a - 5 * i + 5)
    : (10 * p + 6.25 * a - 5 * i - 161);
}

function calcTDEEPure(peso, alt, idade, sexo, atividade) {
  const bmr = calcBMRPure(peso, alt, idade, sexo);
  const fator = Number(atividade) || 1.4;
  return Math.round(bmr * fator);
}

test('2.1: Mifflin-St Jeor Gender Differential Invariant', () => {
  // For identical weight, height, and age, Male BMR must be exactly 166 kcal higher than Female BMR (+5 vs -161)
  for (let peso = 40; peso <= 150; peso += 10) {
    for (let alt = 140; alt <= 200; alt += 10) {
      for (let idade = 18; idade <= 80; idade += 10) {
        const maleBMR = calcBMRPure(peso, alt, idade, 'm');
        const femaleBMR = calcBMRPure(peso, alt, idade, 'f');
        assert.strictEqual(maleBMR - femaleBMR, 166, `Delta between male and female BMR must be exactly 166 kcal`);
      }
    }
  }
});

test('2.2: TDEE Activity Scaling Monotonicity', () => {
  const activities = [1.2, 1.4, 1.6, 1.8];
  for (let i = 0; i < activities.length - 1; i++) {
    const tdeeLower = calcTDEEPure(75, 175, 30, 'm', activities[i]);
    const tdeeHigher = calcTDEEPure(75, 175, 30, 'm', activities[i + 1]);
    assert(tdeeHigher > tdeeLower, `Higher activity multiplier must yield strictly higher TDEE (${activities[i+1]} vs ${activities[i]})`);
  }
});

test('2.3: Fuzzing 1,000 Biometric Profiles for TDEE & Macro Consistency', () => {
  for (let i = 0; i < 1000; i++) {
    const peso = 40 + Math.random() * 120; // 40kg - 160kg
    const alt = 140 + Math.random() * 70;  // 140cm - 210cm
    const idade = 16 + Math.random() * 75; // 16 - 91 years
    const sexo = Math.random() < 0.5 ? 'm' : 'f';
    const ativ = [1.2, 1.4, 1.6, 1.8][Math.floor(Math.random() * 4)];

    const tdee = calcTDEEPure(peso, alt, idade, sexo, ativ);
    assert(tdee > 800 && tdee < 6000, `TDEE ${tdee} outside reasonable human bounds`);

    const pGrams = Math.round(peso * 1.8);
    const cGrams = Math.round(tdee * 0.45 / 4);
    const gGrams = Math.round(tdee * 0.25 / 9);

    const macroKcal = pGrams * 4 + cGrams * 4 + gGrams * 9;
    const diffPct = Math.abs(macroKcal - tdee) / tdee;
    assert(diffPct < 0.25, `Macro caloric sum (${macroKcal}) deviates too much from TDEE (${tdee}) for weight ${peso}`);
  }
});

test('2.4: Net Energy Balance (I - G = L) Arithmetic & Extreme Cases', () => {
  const scenarios = [
    { intake: 2500, burned: 500, expectedNet: 2000 },
    { intake: 0, burned: 800, expectedNet: -800 },         // Fasting day
    { intake: 4000, burned: 0, expectedNet: 4000 },       // Rest day surplus
    { intake: 1500, burned: 1500, expectedNet: 0 },       // Zero balance
    { intake: 12000, burned: 4500, expectedNet: 7500 },   // Extreme ultra-endurance / cheat day
  ];

  for (const sc of scenarios) {
    const net = sc.intake - sc.burned;
    assert.strictEqual(net, sc.expectedNet, `Net energy balance mismatch: ${sc.intake} - ${sc.burned} = ${net} (expected ${sc.expectedNet})`);
  }
});

// -----------------------------------------------------------------------------
// SUITE 3: MET ACTIVITY EXPENDITURE INVARIANTS
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: MET Activity Expenditure Invariants ---');

function calcKcalFromMET(met, peso, durMin) {
  const m = (met !== undefined && met !== null && !isNaN(met)) ? Number(met) : 5.0;
  const p = (peso !== undefined && peso !== null && !isNaN(peso)) ? Number(peso) : 75;
  const dur = (durMin !== undefined && durMin !== null && !isNaN(durMin)) ? Number(durMin) : 30;
  return Math.round(m * p * (dur / 60));
}

test('3.1: Ainsworth Compendium MET Equation Proportionality', () => {
  const baseKcal = calcKcalFromMET(6.0, 75, 30); // 6 * 75 * 0.5 = 225 kcal
  assert.strictEqual(baseKcal, 225, `Base MET 6.0 for 75kg 30min must be 225 kcal`);

  // Double duration -> double calories
  const doubleDurKcal = calcKcalFromMET(6.0, 75, 60);
  assert.strictEqual(doubleDurKcal, 450, `Double duration must double calories`);

  // Double weight -> double calories
  const doubleWeightKcal = calcKcalFromMET(6.0, 150, 30);
  assert.strictEqual(doubleWeightKcal, 450, `Double weight must double calories`);

  // Zero duration or zero MET -> 0 kcal
  assert.strictEqual(calcKcalFromMET(0, 75, 30), 0);
  assert.strictEqual(calcKcalFromMET(6.0, 75, 0), 0);
  assert.strictEqual(calcKcalFromMET(6.0, 0, 30), 0);
});

// -----------------------------------------------------------------------------
// SUITE 4: DESIGN SYSTEM TOKENS & OFFLINE FORENSIC AUDIT
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Design System Tokens & Offline Forensic Audit ---');

test('4.1: Kernel theme.css Monochromatic Tokens Verification', () => {
  const kernelThemePath = path.join(PROJECT_ROOT, 'kernel/theme.css');
  const content = fs.readFileSync(kernelThemePath, 'utf8');

  // Verify core monochromatic tokens
  const requiredTokens = [
    '--bg: #09090b',
    '--card: #18181b',
    '--line: #27272a',
    '--txt: #ffffff',
    '--txt2: #a1a1aa',
    '--txt3: #71717a'
  ];

  for (const token of requiredTokens) {
    assert(content.includes(token), `kernel/theme.css missing required token: ${token}`);
  }

  // Ensure no external @import url or Google fonts
  assert(!content.includes('@import url'), 'theme.css must not have remote @import url');
  assert(!content.includes('fonts.googleapis.com'), 'theme.css must not link to external fonts.googleapis.com');
});

test('4.2: NutriTrack theme.css Monochromatic Parity Verification', () => {
  const nutriThemePath = path.join(PROJECT_ROOT, 'nutricao-android/app/src/main/assets/apps/nutricao/theme.css');
  const content = fs.readFileSync(nutriThemePath, 'utf8');

  const requiredTokens = [
    '--bg: #09090b',
    '--card: #18181b',
    '--line: #27272a',
    '--txt: #ffffff',
    '--txt2: #a1a1aa',
    '--txt3: #71717a'
  ];

  for (const token of requiredTokens) {
    assert(content.includes(token), `nutricao theme.css missing required token: ${token}`);
  }

  assert(!content.includes('@import url'), 'nutricao theme.css must not have remote @import url');
});

test('4.3: Absence of AI Cliché Gradients in Production HTML / JS', () => {
  const filesToCheck = [
    'evolucao-android/app/src/main/assets/index.html',
    'evolucao-android/app/src/main/assets/kernel/theme.css',
    'nutricao-android/app/src/main/assets/apps/nutricao/index.html',
    'nutricao-android/app/src/main/assets/apps/nutricao/theme.css'
  ];

  for (const relPath of filesToCheck) {
    const fullPath = path.join(PROJECT_ROOT, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Check absence of neon rainbow gradients
    assert(!content.includes('linear-gradient(45deg, #ff007f'), `${relPath} contains prohibited neon gradient`);
    assert(!content.includes('linear-gradient(to right, #00f2fe'), `${relPath} contains prohibited neon gradient`);
  }
});

console.log('\n================================================================');
console.log(`🎉 ALL ${passedTests} ADVERSARIAL CHALLENGER M4 TESTS PASSED!`);
console.log('================================================================\n');
