/* Coach deterministic readiness engine. Pure JS; no I/O, clock, randomness or mutation. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoachEngine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '0.2.0';
  var REGIONS = [
    ['CHEST', 'Peito'], ['BACK', 'Costas'], ['SHOULDERS', 'Ombros'],
    ['ARMS', 'Braços'], ['GLUTES', 'Glúteos'], ['QUADS', 'Quadríceps'],
    ['HAMSTRINGS', 'Posteriores'], ['CALVES', 'Panturrilhas'], ['CORE', 'Core']
  ];

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function rounded(value) { return Math.round(clamp(value, 0, 100)); }
  function assert(condition, message) { if (!condition) throw new Error(message); }
  function metric(snapshot, key) {
    var row = snapshot.metrics && snapshot.metrics[key];
    return row && row.status !== 'ABSENT' && typeof row.value === 'number' ? row : null;
  }
  function evidenceFor(row, fallback) {
    return row && row.sourceRecordId ? row.sourceRecordId : fallback;
  }
  function confidenceLabel(value) {
    return value >= 0.75 ? 'alta' : value >= 0.45 ? 'moderada' : 'baixa';
  }
  function scoreLabel(value) {
    if (value === null) return 'dados insuficientes';
    if (value >= 80) return 'pronto';
    if (value >= 62) return 'atenção leve';
    if (value >= 45) return 'conservador';
    return 'recuperação prioritária';
  }
  function formatNumber(value, digits) {
    var fixed = Number(value).toFixed(digits || 0);
    var parts = fixed.split('.');
    var integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts.length > 1 ? integer + ',' + parts[1] : integer;
  }
  function sourceLabel(row, fallback) {
    if (!row) return fallback;
    if (row.source === 'EVOLUCAO') return 'Evolução';
    if (row.source === 'STRAVA') return 'Strava';
    if (row.source === 'NUTRITRACK') return 'NutriTrack';
    return fallback;
  }

  function analyze(input) {
    assert(input && typeof input === 'object' && !Array.isArray(input), 'snapshot inválido');
    assert(input.contractVersion === 1, 'versão de snapshot incompatível');
    assert(typeof input.logicalDate === 'string' && input.logicalDate.length === 10, 'data lógica inválida');
    assert(input.metrics && typeof input.metrics === 'object', 'métricas ausentes');

    var sleep = metric(input, 'recovery.sleepMinutes');
    var steps = metric(input, 'activity.steps');
    var rhr = metric(input, 'recovery.restingHeartRate');
    var weight = metric(input, 'body.weightKg');
    var runCount = metric(input, 'running.sessionCount');
    var runDistance = metric(input, 'running.distanceKm');
    var runDuration = metric(input, 'running.durationMinutes');
    var mealCount = metric(input, 'nutrition.mealCount');
    var energyKcal = metric(input, 'nutrition.energyKcal');
    var proteinG = metric(input, 'nutrition.proteinG');
    var waterMl = metric(input, 'nutrition.waterMl');
    var targetEnergy = metric(input, 'nutrition.target.energyKcal');
    var targetProtein = metric(input, 'nutrition.target.proteinG');
    var targetWater = metric(input, 'nutrition.target.waterMl');
    var check = input.checkIn || null;
    var inputs = [];
    var recoveryEvidence = [];

    if (sleep) {
      inputs.push(clamp((sleep.value - 240) / 270 * 100, 0, 100));
      recoveryEvidence.push(evidenceFor(sleep, 'recovery.sleepMinutes'));
    }
    if (check) {
      inputs.push((check.energy - 1) * 25);
      inputs.push((check.perceivedSleepQuality - 1) * 25);
      inputs.push((check.motivation - 1) * 25);
      recoveryEvidence.push('checkin:' + input.logicalDate);
    }
    var recoveryScore = inputs.length ? rounded(inputs.reduce(function (a, b) { return a + b; }, 0) / inputs.length) : null;
    // No personal baseline exists in v0.1, so physiological readiness never claims high confidence.
    var recoveryConfidence = Math.min(0.7, inputs.length * 0.22 + (sleep ? 0.12 : 0));

    var soreness = check && check.soreness ? check.soreness : {};
    var severeRegions = [];
    var muscle = REGIONS.map(function (entry) {
      var level = soreness[entry[0]] || null;
      if (level === 'SEVERE') severeRegions.push(entry[1]);
      return {
        region: entry[0], label: entry[1],
        // Soreness is a categorical self-report, not a precise recovery score.
        score: null,
        status: level ? level.toLowerCase() : 'unknown',
        confidence: level ? 0.7 : 0.15
      };
    });

    var observed = [sleep, steps, rhr, weight].filter(Boolean).length;
    var checkSignals = check ? 1 : 0;
    var coverage = rounded((observed + checkSignals) / 5 * 100);
    var missing = [];
    if (!sleep) missing.push('sono');
    if (!steps) missing.push('passos');
    if (!rhr) missing.push('FC de repouso');
    if (!weight) missing.push('peso');
    if (!check) missing.push('check-in');

    var jointPain = !!(check && check.jointPainFlag);
    var blocked = jointPain || severeRegions.length > 0;
    var flags = [];
    if (jointPain) flags.push('Dor articular informada');
    if (severeRegions.length) flags.push('Dor muscular forte: ' + severeRegions.join(', '));

    var proposals = [];
    if (blocked) {
      proposals.push({
        id: 'safety-hold', target: 'today.training', operation: 'safety_hold',
        payload: { intensity: 'avoid_aggressive_progression' },
        title: 'Segurar progressões agressivas hoje',
        reason: flags.join('. ') + '.',
        benefit: 'Reduz exposição a uma sessão incompatível com os sinais informados.',
        cost: 'O estímulo planejado pode ser menor.',
        confidence: check ? 0.9 : 0.55,
        alternative: 'Reavaliar após aquecimento leve e procurar avaliação profissional se houver dor aguda, piora ou sintoma incomum.',
        evidence: ['checkin:' + input.logicalDate]
      });
    } else if (recoveryScore !== null && recoveryScore < 45) {
      proposals.push({
        id: 'reduce-one-set', target: 'strength.session', operation: 'reduce_set',
        payload: { setsDelta: -1, scope: 'highest_fatigue_exercise' },
        title: 'Se houver musculação, retirar uma série',
        reason: 'A prontidão global ficou baixa; a sessão de musculação ainda não foi importada.',
        benefit: 'Preserva a prática e reduz o custo de fadiga do dia.',
        cost: 'Pequena redução de volume.',
        confidence: Math.max(0.35, recoveryConfidence),
        alternative: 'Manter o volume e elevar o RIR em 1.',
        evidence: recoveryEvidence
      });
    } else if (recoveryScore !== null && recoveryScore < 65) {
      proposals.push({
        id: 'increase-rir', target: 'strength.session', operation: 'increase_rir',
        payload: { rirDelta: 1 },
        title: 'Se houver musculação, usar 1 RIR a mais',
        reason: 'Os sinais sugerem prontidão intermediária, ainda sem baseline pessoal completo.',
        benefit: 'Mantém o padrão do treino com margem adicional.',
        cost: 'Menos proximidade da falha nesta sessão.',
        confidence: Math.max(0.35, recoveryConfidence),
        alternative: 'Manter o plano e interromper se a técnica cair.',
        evidence: recoveryEvidence
      });
    } else {
      proposals.push({
        id: 'maintain-plan', target: 'today.training', operation: 'maintain_plan',
        payload: { change: 'none' },
        title: 'Manter o treino previsto',
        reason: recoveryScore === null ? 'Não há evidência suficiente para sugerir uma mudança.' : 'Os sinais disponíveis não justificam reduzir o plano previsto.',
        benefit: 'Evita ajustes baseados em lacunas ou ruído.',
        cost: 'Exige autorregulação durante o aquecimento.',
        confidence: recoveryScore === null ? 0.3 : Math.max(0.45, recoveryConfidence),
        alternative: 'Elevar o RIR em 1 se o aquecimento estiver abaixo do esperado.',
        evidence: recoveryEvidence
      });
    }

    var runningDimension;
    if (runCount || runDistance || runDuration) {
      var runningParts = [];
      if (runCount) runningParts.push(Math.round(runCount.value) + (Math.round(runCount.value) === 1 ? ' corrida' : ' corridas'));
      if (runDistance) runningParts.push(formatNumber(runDistance.value, 1) + ' km');
      if (runDuration) runningParts.push(formatNumber(Math.round(runDuration.value), 0) + ' min');
      runningDimension = {
        status: 'observed', score: null,
        message: sourceLabel(runCount || runDistance || runDuration, 'Fonte local') + ' hoje: ' + runningParts.join(' · ') + '.'
      };
    } else {
      runningDimension = {
        status: 'insufficient_data', score: null,
        message: steps ? 'Passos observados não são tratados como corrida.' : 'Nenhum treino de corrida foi importado.'
      };
    }

    var fuelingDimension;
    if (mealCount || energyKcal || proteinG || waterMl) {
      var fuelParts = [];
      if (energyKcal) fuelParts.push(formatNumber(energyKcal.value, 0) + (targetEnergy ? '/' + formatNumber(targetEnergy.value, 0) : '') + ' kcal');
      if (proteinG) fuelParts.push(formatNumber(proteinG.value, 0) + (targetProtein ? '/' + formatNumber(targetProtein.value, 0) : '') + ' g proteína');
      if (waterMl) fuelParts.push(formatNumber(waterMl.value / 1000, 1) + (targetWater ? '/' + formatNumber(targetWater.value / 1000, 1) : '') + ' L água');
      if (!fuelParts.length && mealCount) fuelParts.push(Math.round(mealCount.value) + (Math.round(mealCount.value) === 1 ? ' refeição' : ' refeições'));
      
      var primaryMetric = mealCount || energyKcal || proteinG || waterMl;
      var isDMinusOne = !!(
        (primaryMetric && primaryMetric.isDMinusOne === true) ||
        (energyKcal && energyKcal.isDMinusOne === true) ||
        (mealCount && mealCount.isDMinusOne === true) ||
        (primaryMetric && primaryMetric.sourceRecordId && primaryMetric.sourceRecordId.indexOf('nutritrack:') === 0 && primaryMetric.sourceRecordId.indexOf(input.logicalDate) === -1)
      );
      var timePrefix = isDMinusOne ? ' ontem (D-1): ' : ' hoje: ';
      
      fuelingDimension = {
        status: 'observed', score: null,
        isDMinusOne: isDMinusOne,
        message: sourceLabel(primaryMetric, 'NutriTrack') + timePrefix + fuelParts.join(' · ') + '.'
      };
    } else {
      fuelingDimension = {
        status: 'insufficient_data', score: null,
        isDMinusOne: false,
        message: 'Nenhum registro de alimentação ou hidratação foi importado hoje.'
      };
    }

    return {
      schemaVersion: 1,
      engineVersion: VERSION,
      generatedFor: input.logicalDate,
      snapshotHash: input.hash || null,
      dataQuality: {
        score: coverage,
        observedMetrics: observed,
        totalMetricSlots: 4,
        checkInPresent: !!check,
        missing: missing,
        label: coverage >= 80 ? 'boa cobertura' : coverage >= 40 ? 'cobertura parcial' : 'poucos dados'
      },
      readiness: {
        score: recoveryScore,
        label: scoreLabel(recoveryScore),
        confidence: recoveryConfidence,
        confidenceLabel: confidenceLabel(recoveryConfidence),
        evidence: recoveryEvidence
      },
      dimensions: {
        muscleReadiness: muscle,
        runningLoad: runningDimension,
        fueling: fuelingDimension
      },
      safety: {
        aggressiveChangesBlocked: blocked,
        flags: flags,
        guidance: blocked ? 'Sem diagnóstico: ajuste com cautela e procure avaliação se o sinal for agudo, persistente ou incomum.' : null
      },
      proposals: proposals
    };
  }

  return { VERSION: VERSION, analyze: analyze };
}));
