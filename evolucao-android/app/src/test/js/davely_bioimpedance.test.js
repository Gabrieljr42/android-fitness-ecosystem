'use strict';

/**
 * ==============================================================================
 * DAVELY BLE SCALE INTEGRATION — BIOIMPEDANCE & 4-TIER GOVERNANCE TEST SUITE
 * Tiers 1, 2 & 3: 4-Tier Taxonomy, Validated Formulas, Boundary Checks & Zero-Fake
 * ==============================================================================
 */

const assert = require('assert');

console.log('=== [EVOLUÇÃO] Executando Suíte de Testes: Bioimpedância & Governança de Dados ===\n');

// -----------------------------------------------------------------------------
// Pure Opaque-Box Reference Bioimpedance & Body Composition Engine
// Derived strictly from ORIGINAL_REQUEST.md (§ R6) & explorer_protocol/handoff.md
// -----------------------------------------------------------------------------
const BioimpedanceEngine = {
  TIERS: {
    MEASURED: 'MEDIDO PELA BALANÇA',
    DERIVED: 'DERIVADO DE DADO MEDIDO',
    ESTIMATED: 'ESTIMADO POR EQUAÇÃO',
    UNDISCOVERED: 'NÃO DESCOBERTO'
  },

  normalizeSex(sex) {
    if (!sex || typeof sex !== 'string') return null;
    const s = sex.trim().toLowerCase();
    if (s === 'm' || s === 'male' || s === 'masculino' || s === 'homem') return 'male';
    if (s === 'f' || s === 'female' || s === 'feminino' || s === 'mulher') return 'female';
    return null;
  },

  calculateBmi(weightKg, heightCm) {
    if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null;
    const hM = heightCm / 100.0;
    const bmi = weightKg / (hM * hM);
    return Math.round(bmi * 100) / 100;
  },

  calculateDeurenbergBf(bmi, age, sex) {
    if (!bmi || !age || age < 16 || age > 95) return null;
    const normalizedSex = this.normalizeSex(sex);
    if (!normalizedSex) return null;
    const sexNum = normalizedSex === 'male' ? 1 : 0;
    const bf = 1.20 * bmi + 0.23 * age - 10.8 * sexNum - 5.4;
    return Math.round(Math.max(3.0, Math.min(65.0, bf)) * 100) / 100;
  },

  calculateBoerLbm(weightKg, heightCm, sex) {
    if (!weightKg || !heightCm || weightKg < 20 || heightCm < 100 || heightCm > 250) return null;
    const normalizedSex = this.normalizeSex(sex);
    if (!normalizedSex) return null;

    let lbm;
    if (normalizedSex === 'male') {
      lbm = 0.407 * weightKg + 0.267 * heightCm - 19.2;
    } else {
      lbm = 0.252 * weightKg + 0.473 * heightCm - 48.3;
    }
    return Math.round(Math.max(10.0, lbm) * 100) / 100;
  },

  calculateHumeLbm(weightKg, heightCm, sex) {
    if (!weightKg || !heightCm || weightKg < 20 || heightCm < 100 || heightCm > 250) return null;
    const normalizedSex = this.normalizeSex(sex);
    if (!normalizedSex) return null;

    let lbm;
    if (normalizedSex === 'male') {
      lbm = 0.32810 * weightKg + 0.33929 * heightCm - 29.5336;
    } else {
      lbm = 0.29569 * weightKg + 0.41813 * heightCm - 43.2933;
    }
    return Math.round(Math.max(10.0, lbm) * 100) / 100;
  },

  calculateImpedanceIndex(heightCm, impedanceRaw) {
    if (!heightCm || !impedanceRaw || heightCm <= 0 || impedanceRaw <= 0) return null;
    // 6000 raw counts = 600.0 ohms (scale factor 10.0)
    const resistanceOhms = impedanceRaw / 10.0;
    const index = (heightCm * heightCm) / resistanceOhms;
    return Math.round(index * 100) / 100;
  },

  calculateSunTbw(heightCm, weightKg, age, sex, impedanceRaw) {
    if (!impedanceRaw || impedanceRaw <= 0) return null;
    const impIndex = this.calculateImpedanceIndex(heightCm, impedanceRaw);
    if (!impIndex || !weightKg || !age) return null;
    const normalizedSex = this.normalizeSex(sex);
    if (!normalizedSex) return null;

    const sexFactor = normalizedSex === 'male' ? 1.0 : 0.0;
    const tbw = 0.377 * impIndex + 0.14 * weightKg - 0.08 * age + 2.9 * sexFactor + 4.65;
    return Math.round(tbw * 100) / 100;
  },

  calculateMifflinBmr(weightKg, heightCm, age, sex) {
    if (!weightKg || !heightCm || !age || weightKg <= 0 || heightCm <= 0 || age <= 0) return null;
    const normalizedSex = this.normalizeSex(sex);
    if (!normalizedSex) return null;

    let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
    if (normalizedSex === 'male') {
      bmr += 5;
    } else {
      bmr -= 161;
    }
    return Math.round(bmr);
  },

  evaluateBodyComposition(measurement, profile) {
    const p = profile || {};
    const m = measurement || {};

    const out = {
      // Tier 1: MEDIDO PELA BALANÇA
      weightKg: {
        value: m.weightKg || null,
        tier: this.TIERS.MEASURED,
        unit: 'kg',
        source: 'scale_load_cells'
      },
      impedanceRaw: {
        value: m.impedanceRaw != null ? m.impedanceRaw : 0,
        tier: this.TIERS.MEASURED,
        unit: 'counts',
        source: 'scale_bioimpedance_electrodes'
      },

      // Tier 2: DERIVADO DE DADO MEDIDO
      bmi: null,

      // Tier 3: ESTIMADO POR EQUAÇÃO
      bodyFatPctDeurenberg: null,
      fatMassKg: null,
      fatFreeMassKg: null,
      leanBodyMassBoerKg: null,
      leanBodyMassHumeKg: null,
      impedanceIndex: null,
      totalBodyWaterKg: null,
      bmrKcalMifflin: null,

      // Status metadata
      profileComplete: false,
      missingProfileFields: [],
      hasValidImpedance: (m.impedanceRaw || 0) > 0
    };

    // Profile check
    if (!p.heightCm) out.missingProfileFields.push('heightCm');
    if (!p.age) out.missingProfileFields.push('age');
    if (!this.normalizeSex(p.sex)) out.missingProfileFields.push('sex');

    out.profileComplete = out.missingProfileFields.length === 0;

    if (m.weightKg && p.heightCm) {
      const bmiVal = this.calculateBmi(m.weightKg, p.heightCm);
      out.bmi = {
        value: bmiVal,
        tier: this.TIERS.DERIVED,
        unit: 'kg/m²',
        formula: 'weight / (height/100)^2'
      };
    }

    if (out.profileComplete && m.weightKg) {
      const bmiVal = out.bmi ? out.bmi.value : this.calculateBmi(m.weightKg, p.heightCm);
      const bfVal = this.calculateDeurenbergBf(bmiVal, p.age, p.sex);
      if (bfVal != null) {
        out.bodyFatPctDeurenberg = {
          value: bfVal,
          tier: this.TIERS.ESTIMATED,
          unit: '%',
          formula: 'Deurenberg et al. (1991)'
        };
        const fatMass = Math.round((m.weightKg * (bfVal / 100.0)) * 100) / 100;
        out.fatMassKg = {
          value: fatMass,
          tier: this.TIERS.ESTIMATED,
          unit: 'kg'
        };
        out.fatFreeMassKg = {
          value: Math.round((m.weightKg - fatMass) * 100) / 100,
          tier: this.TIERS.ESTIMATED,
          unit: 'kg'
        };
      }

      const boerLbm = this.calculateBoerLbm(m.weightKg, p.heightCm, p.sex);
      if (boerLbm != null) {
        out.leanBodyMassBoerKg = {
          value: boerLbm,
          tier: this.TIERS.ESTIMATED,
          unit: 'kg',
          formula: 'Boer (1984)'
        };
      }

      const humeLbm = this.calculateHumeLbm(m.weightKg, p.heightCm, p.sex);
      if (humeLbm != null) {
        out.leanBodyMassHumeKg = {
          value: humeLbm,
          tier: this.TIERS.ESTIMATED,
          unit: 'kg',
          formula: 'Hume (1966)'
        };
      }

      const bmrVal = this.calculateMifflinBmr(m.weightKg, p.heightCm, p.age, p.sex);
      if (bmrVal != null) {
        out.bmrKcalMifflin = {
          value: bmrVal,
          tier: this.TIERS.ESTIMATED,
          unit: 'kcal/day',
          formula: 'Mifflin-St Jeor (1990)'
        };
      }

      if (out.hasValidImpedance) {
        const impIdx = this.calculateImpedanceIndex(p.heightCm, m.impedanceRaw);
        if (impIdx != null) {
          out.impedanceIndex = {
            value: impIdx,
            tier: this.TIERS.ESTIMATED,
            unit: 'cm²/Ω',
            formula: 'H² / R (Lukaski / Sun)'
          };
        }

        const tbwVal = this.calculateSunTbw(p.heightCm, m.weightKg, p.age, p.sex, m.impedanceRaw);
        if (tbwVal != null) {
          out.totalBodyWaterKg = {
            value: tbwVal,
            tier: this.TIERS.ESTIMATED,
            unit: 'kg',
            formula: 'Sun et al. (2003)'
          };
        }
      }
    }

    return out;
  }
};

// =============================================================================
// TIER 1: FEATURE COVERAGE (4-Tier Taxonomy & Validated Equations)
// =============================================================================
let tier1Count = 0;
console.log('--- TIER 1: Feature Coverage (4-Tier Taxonomy & Equations) ---');

// 1. BMI Calculation (DERIVADO DE DADO MEDIDO)
{
  const bmi1 = BioimpedanceEngine.calculateBmi(64.25, 175);
  assert.strictEqual(bmi1, 20.98, 'BMI para 64.25kg e 175cm deve ser 20.98');

  const bmi2 = BioimpedanceEngine.calculateBmi(80.0, 180);
  assert.strictEqual(bmi2, 24.69, 'BMI para 80.0kg e 180cm deve ser 24.69');

  const bmi3 = BioimpedanceEngine.calculateBmi(55.0, 160);
  assert.strictEqual(bmi3, 21.48, 'BMI para 55.0kg e 160cm deve ser 21.48');
  tier1Count += 3;
}

// 2. Deurenberg % Body Fat Equation (ESTIMADO POR EQUAÇÃO)
{
  // Male, BMI = 20.98, Age = 25
  // BF = 1.20*20.98 + 0.23*25 - 10.8*1 - 5.4 = 25.176 + 5.75 - 10.8 - 5.4 = 14.726 -> 14.73%
  const bfMale = BioimpedanceEngine.calculateDeurenbergBf(20.98, 25, 'male');
  assert.strictEqual(bfMale, 14.73);

  // Female, BMI = 21.48, Age = 30
  // BF = 1.20*21.48 + 0.23*30 - 10.8*0 - 5.4 = 25.776 + 6.9 - 0 - 5.4 = 27.276 -> 27.28%
  const bfFemale = BioimpedanceEngine.calculateDeurenbergBf(21.48, 30, 'female');
  assert.strictEqual(bfFemale, 27.28);
  tier1Count += 2;
}

// 3. Boer Lean Body Mass Equation (ESTIMADO POR EQUAÇÃO)
{
  // Male: 0.407 * 64.25 + 0.267 * 175 - 19.2 = 26.14975 + 46.725 - 19.2 = 53.67475 -> 53.67 kg
  const boerMale = BioimpedanceEngine.calculateBoerLbm(64.25, 175, 'male');
  assert.strictEqual(boerMale, 53.67);

  // Female: 0.252 * 55.0 + 0.473 * 160 - 48.3 = 13.86 + 75.68 - 48.3 = 41.24 kg
  const boerFemale = BioimpedanceEngine.calculateBoerLbm(55.0, 160, 'female');
  assert.strictEqual(boerFemale, 41.24);
  tier1Count += 2;
}

// 4. Hume Lean Body Mass Equation (ESTIMADO POR EQUAÇÃO)
{
  // Male: 0.32810 * 64.25 + 0.33929 * 175 - 29.5336 = 21.080425 + 59.37575 - 29.5336 = 50.922575 -> 50.92 kg
  const humeMale = BioimpedanceEngine.calculateHumeLbm(64.25, 175, 'male');
  assert.strictEqual(humeMale, 50.92);

  // Female: 0.29569 * 55.0 + 0.41813 * 160 - 43.2933 = 16.26295 + 66.9008 - 43.2933 = 39.87045 -> 39.87 kg
  const humeFemale = BioimpedanceEngine.calculateHumeLbm(55.0, 160, 'female');
  assert.strictEqual(humeFemale, 39.87);
  tier1Count += 2;
}

// 5. Lukaski / Sun Impedance Index & TBW (ESTIMADO POR EQUAÇÃO)
{
  // Height = 175 cm, raw impedance = 6000 (600.0 ohms)
  // II = 175^2 / 600.0 = 30625 / 600.0 = 51.04166 -> 51.04 cm²/Ω
  const impIndex = BioimpedanceEngine.calculateImpedanceIndex(175, 6000);
  assert.strictEqual(impIndex, 51.04);

  // Sun TBW Male: 0.377 * 51.04 + 0.14 * 64.25 - 0.08 * 25 + 2.9 * 1 + 4.65
  // = 19.24208 + 8.995 - 2.0 + 2.9 + 4.65 = 33.78708 -> 33.79 kg
  const tbwMale = BioimpedanceEngine.calculateSunTbw(175, 64.25, 25, 'male', 6000);
  assert.strictEqual(tbwMale, 33.79);
  tier1Count += 2;
}

// 6. Mifflin-St Jeor Basal Metabolic Rate (BMR) (ESTIMADO POR EQUAÇÃO)
{
  // Male: 10 * 64.25 + 6.25 * 175 - 5 * 25 + 5 = 642.5 + 1093.75 - 125 + 5 = 1616.25 -> 1616 kcal
  const bmrMale = BioimpedanceEngine.calculateMifflinBmr(64.25, 175, 25, 'male');
  assert.strictEqual(bmrMale, 1616);

  // Female: 10 * 55.0 + 6.25 * 160 - 5 * 30 - 161 = 550 + 1000 - 150 - 161 = 1239 kcal
  const bmrFemale = BioimpedanceEngine.calculateMifflinBmr(55.0, 160, 30, 'female');
  assert.strictEqual(bmrFemale, 1239);
  tier1Count += 2;
}

// 7. Full Evaluation & 4-Tier Tag Verification
{
  const measurement = { weightKg: 64.25, impedanceRaw: 6000 };
  const profile = { heightCm: 175, age: 25, sex: 'masculino' };

  const res = BioimpedanceEngine.evaluateBodyComposition(measurement, profile);

  assert.strictEqual(res.profileComplete, true);
  assert.strictEqual(res.weightKg.tier, 'MEDIDO PELA BALANÇA');
  assert.strictEqual(res.weightKg.value, 64.25);

  assert.strictEqual(res.impedanceRaw.tier, 'MEDIDO PELA BALANÇA');
  assert.strictEqual(res.impedanceRaw.value, 6000);

  assert.strictEqual(res.bmi.tier, 'DERIVADO DE DADO MEDIDO');
  assert.strictEqual(res.bmi.value, 20.98);

  assert.strictEqual(res.bodyFatPctDeurenberg.tier, 'ESTIMADO POR EQUAÇÃO');
  assert.strictEqual(res.bodyFatPctDeurenberg.value, 14.73);

  assert.strictEqual(res.leanBodyMassBoerKg.tier, 'ESTIMADO POR EQUAÇÃO');
  assert.strictEqual(res.leanBodyMassBoerKg.value, 53.67);

  assert.strictEqual(res.leanBodyMassHumeKg.tier, 'ESTIMADO POR EQUAÇÃO');
  assert.strictEqual(res.leanBodyMassHumeKg.value, 50.92);

  assert.strictEqual(res.impedanceIndex.tier, 'ESTIMADO POR EQUAÇÃO');
  assert.strictEqual(res.impedanceIndex.value, 51.04);

  assert.strictEqual(res.bmrKcalMifflin.tier, 'ESTIMADO POR EQUAÇÃO');
  assert.strictEqual(res.bmrKcalMifflin.value, 1616);
  tier1Count += 10;
}

console.log(`✅ TIER 1 Concluído com sucesso! (${tier1Count} asserções verificadas)`);

// =============================================================================
// TIER 2: BOUNDARY & CORNER CASES (Zero Impedance, Incomplete Profile & Anti-Fake)
// =============================================================================
let tier2Count = 0;
console.log('\n--- TIER 2: Boundary & Corner Cases (Bioimpedance & Zero Fake Data) ---');

// 1. Shoe/Socks Weigh-In (Zero Raw Impedance)
{
  const measurement = { weightKg: 64.25, impedanceRaw: 0 };
  const profile = { heightCm: 175, age: 25, sex: 'male' };

  const res = BioimpedanceEngine.evaluateBodyComposition(measurement, profile);

  assert.strictEqual(res.weightKg.value, 64.25);
  assert.strictEqual(res.impedanceRaw.value, 0);
  assert.strictEqual(res.hasValidImpedance, false);
  assert.strictEqual(res.bmi.value, 20.98);
  assert.strictEqual(res.impedanceIndex, null, 'Impedance Index deve ser null para zero impedance');
  assert.strictEqual(res.totalBodyWaterKg, null, 'TBW deve ser null para zero impedance');
  // Anthropometric formulas based on height/weight/age still work
  assert.strictEqual(res.bodyFatPctDeurenberg.value, 14.73);
  assert.strictEqual(res.leanBodyMassBoerKg.value, 53.67);
  tier2Count += 8;
}

// 2. Incomplete User Profile Handling (Missing Height, Age, or Sex)
{
  const measurement = { weightKg: 64.25, impedanceRaw: 6000 };

  // Case A: Missing all profile fields
  const resA = BioimpedanceEngine.evaluateBodyComposition(measurement, {});
  assert.strictEqual(resA.profileComplete, false);
  assert.strictEqual(resA.missingProfileFields.length, 3);
  assert.strictEqual(resA.weightKg.value, 64.25, 'Peso medido DEVE continuar disponível');
  assert.strictEqual(resA.impedanceRaw.value, 6000, 'Impedância medida DEVE continuar disponível');
  assert.strictEqual(resA.bmi, null);
  assert.strictEqual(resA.bodyFatPctDeurenberg, null);
  assert.strictEqual(resA.leanBodyMassBoerKg, null);
  assert.strictEqual(resA.bmrKcalMifflin, null);

  // Case B: Height only (BMI can be calculated, but Deurenberg cannot)
  const resB = BioimpedanceEngine.evaluateBodyComposition(measurement, { heightCm: 175 });
  assert.strictEqual(resB.profileComplete, false);
  assert.strictEqual(resB.bmi.value, 20.98);
  assert.strictEqual(resB.bodyFatPctDeurenberg, null);

  // Case C: Missing Sex
  const resC = BioimpedanceEngine.evaluateBodyComposition(measurement, { heightCm: 175, age: 25 });
  assert.strictEqual(resC.profileComplete, false);
  assert.strictEqual(resC.bodyFatPctDeurenberg, null);
  assert.strictEqual(resC.leanBodyMassBoerKg, null);
  tier2Count += 14;
}

// 3. Biological Sex Normalization Matrix
{
  const maleAliases = ['m', 'M', 'male', 'MALE', 'Male', 'masculino', 'MASCULINO', 'homem'];
  for (const ma of maleAliases) {
    assert.strictEqual(BioimpedanceEngine.normalizeSex(ma), 'male', `Alias masculino "${ma}" deve ser normalizado para 'male'`);
    tier2Count += 1;
  }

  const femaleAliases = ['f', 'F', 'female', 'FEMALE', 'Female', 'feminino', 'FEMININO', 'mulher'];
  for (const fa of femaleAliases) {
    assert.strictEqual(BioimpedanceEngine.normalizeSex(fa), 'female', `Alias feminino "${fa}" deve ser normalizado para 'female'`);
    tier2Count += 1;
  }

  const invalidSex = ['', 'unknown', 'other', 'alien', null, undefined, 123];
  for (const inv of invalidSex) {
    assert.strictEqual(BioimpedanceEngine.normalizeSex(inv), null);
    tier2Count += 1;
  }
}

// 4. Extreme Physiological Parameter Boundaries
{
  // Age boundaries
  assert.strictEqual(BioimpedanceEngine.calculateDeurenbergBf(22.0, 15, 'male'), null, 'Idade < 16 deve ser rejeitada');
  assert.strictEqual(BioimpedanceEngine.calculateDeurenbergBf(22.0, 16, 'male') != null, true, 'Idade = 16 deve ser aceita');
  assert.strictEqual(BioimpedanceEngine.calculateDeurenbergBf(22.0, 85, 'male') != null, true, 'Idade = 85 deve ser aceita');
  assert.strictEqual(BioimpedanceEngine.calculateDeurenbergBf(22.0, 100, 'male'), null, 'Idade > 95 deve ser rejeitada');

  // Height boundaries
  assert.strictEqual(BioimpedanceEngine.calculateBmi(70, 50), 280); // Math works but extreme
  assert.strictEqual(BioimpedanceEngine.calculateBoerLbm(70, 80, 'male'), null, 'Altura < 100cm rejeitada no Boer');
  assert.strictEqual(BioimpedanceEngine.calculateHumeLbm(70, 80, 'male'), null, 'Altura < 100cm rejeitada no Hume');
  tier2Count += 7;
}

// 5. Anti-Fake Rule: Rejection of Unverified Vendor Scores
{
  const measurement = { weightKg: 64.25, impedanceRaw: 6000 };
  const profile = { heightCm: 175, age: 25, sex: 'male' };
  const evalResult = BioimpedanceEngine.evaluateBodyComposition(measurement, profile);

  // Explicit assertion: No unverified vanity scores allowed
  assert.strictEqual(evalResult.metabolicAge, undefined, 'metabolicAge NUNCA deve ser inventado');
  assert.strictEqual(evalResult.visceralFatLevel, undefined, 'visceralFatLevel NUNCA deve ser inventado');
  assert.strictEqual(evalResult.bodyScore100, undefined, 'bodyScore100 NUNCA deve ser inventado');
  assert.strictEqual(evalResult.proteinPct, undefined, 'proteinPct NUNCA deve ser inventado sem sensor clínico');
  tier2Count += 4;
}

console.log(`✅ TIER 2 Concluído com sucesso! (${tier2Count} asserções verificadas)`);

// =============================================================================
// TIER 3: CROSS-FEATURE & PERSONA COVERAGE (Multi-Metric Consistency)
// =============================================================================
let tier3Count = 0;
console.log('\n--- TIER 3: Cross-Feature & Realistic Personas Coverage ---');

// 1. Persona 1: Athletic Young Male (24 yo, 178 cm, 74.0 kg, 5500 imp)
{
  const res = BioimpedanceEngine.evaluateBodyComposition(
    { weightKg: 74.0, impedanceRaw: 5500 },
    { heightCm: 178, age: 24, sex: 'male' }
  );

  assert.strictEqual(res.bmi.value, 23.36);
  assert.strictEqual(res.bodyFatPctDeurenberg.value, 17.35);
  assert.strictEqual(res.leanBodyMassBoerKg.value, 58.44);
  assert.strictEqual(res.bmrKcalMifflin.value, 1738);
  assert.strictEqual(res.impedanceIndex.value, 57.61);
  tier3Count += 5;
}

// 2. Persona 2: Active Adult Female (32 yo, 165 cm, 58.5 kg, 6200 imp)
{
  const res = BioimpedanceEngine.evaluateBodyComposition(
    { weightKg: 58.5, impedanceRaw: 6200 },
    { heightCm: 165, age: 32, sex: 'female' }
  );

  assert.strictEqual(res.bmi.value, 21.49);
  assert.strictEqual(res.bodyFatPctDeurenberg.value, 27.75);
  assert.strictEqual(res.leanBodyMassBoerKg.value, 44.49);
  assert.strictEqual(res.bmrKcalMifflin.value, 1295);
  assert.strictEqual(res.impedanceIndex.value, 43.91);
  tier3Count += 5;
}

// 3. Persona 3: Senior Male (68 yo, 172 cm, 82.0 kg, 5800 imp)
{
  const res = BioimpedanceEngine.evaluateBodyComposition(
    { weightKg: 82.0, impedanceRaw: 5800 },
    { heightCm: 172, age: 68, sex: 'male' }
  );

  assert.strictEqual(res.bmi.value, 27.72);
  assert.strictEqual(res.bodyFatPctDeurenberg.value, 32.7);
  assert.strictEqual(res.leanBodyMassBoerKg.value, 60.1);
  assert.strictEqual(res.bmrKcalMifflin.value, 1560);
  tier3Count += 4;
}

// 4. Persona 4: Tall Heavy Lifter Male (28 yo, 192 cm, 105.0 kg, 4800 imp)
{
  const res = BioimpedanceEngine.evaluateBodyComposition(
    { weightKg: 105.0, impedanceRaw: 4800 },
    { heightCm: 192, age: 28, sex: 'male' }
  );

  assert.strictEqual(res.bmi.value, 28.48);
  assert.strictEqual(res.bodyFatPctDeurenberg.value, 24.42);
  assert.strictEqual(res.leanBodyMassBoerKg.value, 74.8);
  assert.strictEqual(res.bmrKcalMifflin.value, 2115);
  tier3Count += 4;
}

console.log(`✅ TIER 3 Concluído com sucesso! (${tier3Count} asserções verificadas)`);

console.log('\n================================================================');
console.log(`🎉 SUÍTE BIOIMPEDÂNCIA & GOVERNANÇA CONCLUÍDA: ${tier1Count + tier2Count + tier3Count} ASSERÇÕES PASSARAM!`);
console.log('================================================================\n');
