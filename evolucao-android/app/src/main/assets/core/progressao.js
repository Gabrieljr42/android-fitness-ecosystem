(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Progression = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /*
   * Progression is deliberately deterministic.  The RIR path models the
   * useful performance of a set as reps completed plus reps in reserve, then
   * chooses a realistic load/reps pair for the next session.  Records without
   * RIR use the legacy double-progression path so old backups remain stable.
   */
  var INC_BY_EQ = { halter: 2.5, polia: 5, maquina: 5, barra: 5, corporal: 0 };

  function number(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function normalized(value) {
    var s = String(value || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s;
  }

  function inferEq(name) {
    var s = normalized(name);
    if (s.indexOf('halter') >= 0) return 'halter';
    if (s.indexOf('polia') >= 0 || s.indexOf('cabo') >= 0) return 'polia';
    if (s.indexOf('barra') >= 0 || s.indexOf('smith') >= 0) return 'barra';
    if (s.indexOf('corporal') >= 0 || s.indexOf('peso do corpo') >= 0) return 'corporal';
    return 'maquina';
  }

  function isUnilateral(name) {
    var s = normalized(name);
    return s.indexOf('unilateral') >= 0 || s.indexOf('serrote') >= 0 || s.indexOf('por lado') >= 0;
  }

  function defaultInc(eq) {
    return Object.prototype.hasOwnProperty.call(INC_BY_EQ, eq) ? INC_BY_EQ[eq] : INC_BY_EQ.maquina;
  }

  function parseRange(reps) {
    var s = String(reps == null ? '' : reps).replace(/[\u2013\u2014]/g, '-');
    var m = s.match(/(\d+)\s*(?:-|a|ate|to)\s*(\d+)/i);
    var first = m ? parseInt(m[1], 10) : parseInt(s, 10);
    var last = m ? parseInt(m[2], 10) : first;
    first = isFinite(first) && first > 0 ? first : 1;
    last = isFinite(last) && last >= first ? last : first;
    return { min: first, max: last };
  }

  function planFor(ficha, day, nomeExercicio) {
    var dayPlan = ficha && ficha[day];
    var list = dayPlan && Array.isArray(dayPlan.ex) ? dayPlan.ex : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].n === nomeExercicio) return list[i];
    }
    return { n: nomeExercicio, sets: 1, reps: '1-1' };
  }

  function equipmentFor(plan) {
    var eq = plan && plan.eq;
    return INC_BY_EQ[eq] !== undefined ? eq : inferEq(plan && plan.n);
  }

  function incrementFor(plan) {
    var eq = equipmentFor(plan);
    var inc = number(plan && plan.inc, defaultInc(eq));
    return inc >= 0 ? inc : defaultInc(eq);
  }

  function isValidSet(set) {
    return !!set && number(set.w, NaN) >= 0 && number(set.r, NaN) > 0;
  }

  function isShortSession(session) {
    return !!session && (session.mode === 'curto' || session.sessionType === 'curto' || session.short === true);
  }

  function entryFor(session, nomeExercicio, exerciseId, aliases) {
    var entries = session && session.entries;
    if (!entries || typeof entries !== 'object') return null;
    var keys = [];
    if (exerciseId) keys.push(exerciseId);
    if (nomeExercicio) keys.push(nomeExercicio);
    (Array.isArray(aliases) ? aliases : []).forEach(function (alias) { keys.push(alias); });
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(entries[keys[i]])) return entries[keys[i]];
    }
    return null;
  }

  function seriesDeTrabalho(sets) {
    if (!Array.isArray(sets) || !sets.length) return [];
    if (sets.some(function (s) { return s && s.wu !== undefined; })) {
      return sets.filter(function (s) { return isValidSet(s) && !s.wu; });
    }
    var valid = sets.filter(isValidSet);
    if (!valid.length) return [];
    var max = Math.max.apply(null, valid.map(function (s) { return number(s.w, 0); }));
    return valid.filter(function (s) { return number(s.w, 0) >= 0.85 * max; });
  }

  function sessionDateValue(session) {
    var t = Date.parse(String(session && session.date || '') + 'T00:00:00');
    return isFinite(t) ? t : 0;
  }

  function historyFor(sessions, day, exercise, exerciseId, aliases) {
    return (Array.isArray(sessions) ? sessions : [])
      .filter(function (session) {
        return session && session.day === day && entryFor(session, exercise, exerciseId, aliases);
      })
      .map(function (session) {
        return {
          session: session,
          short: isShortSession(session),
          sets: seriesDeTrabalho(entryFor(session, exercise, exerciseId, aliases))
        };
      })
      .filter(function (item) { return item.sets.length > 0; })
      .sort(function (a, b) {
        var dateDiff = sessionDateValue(a.session) - sessionDateValue(b.session);
        return dateDiff || number(a.session.id, 0) - number(b.session.id, 0);
      });
  }

  function topOf(sets) {
    return sets.length ? Math.max.apply(null, sets.map(function (s) { return number(s.w, 0); })) : 0;
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function rirFor(set) {
    var value = set && (set.rir !== undefined ? set.rir : (set.RIR !== undefined ? set.RIR : set.rpeRir));
    if (value === undefined || value === null || value === '') return null;
    value = number(value, null);
    return value === null ? null : Math.max(0, Math.min(6, value));
  }

  function hasRir(sets) {
    return (Array.isArray(sets) ? sets : []).some(function (set) { return rirFor(set) !== null; });
  }

  function roundToIncrement(value, inc) {
    if (!inc) return Math.max(0, Math.round(value * 10) / 10);
    var rounded = Math.round(value / inc) * inc;
    rounded = Math.max(inc, rounded);
    return Math.round(rounded * 100) / 100;
  }

  function sameNumber(a, b) { return Math.abs(number(a, 0) - number(b, 0)) < 0.0001; }

  function profileFor(plan, range, settings) {
    var explicit = plan && (plan.progressao || plan.progression || {});
    var cfg = settings || {};
    var name = normalized(plan && plan.n);
    var plannedSets = Math.max(1, parseInt(plan && plan.sets, 10) || 1);
    var highRep = range.min >= 12 || range.max >= 15;
    var compound = range.min <= 8 || /supino|puxada|remada|agach|leg press|elevacao pelvica|stiff|terra/.test(name);
    var strategy = explicit.strategy === 'reps' || explicit.strategy === 'dupla' ? explicit.strategy : (highRep ? 'reps' : 'dupla');
    var defaultDecision = highRep ? Math.min(2, plannedSets) : (compound ? Math.min(3, plannedSets) : Math.min(2, plannedSets));
    var decisionSets = Math.max(1, Math.min(plannedSets, parseInt(explicit.decisionSets, 10) || defaultDecision));
    var targetRir = explicit.targetRir !== undefined ? explicit.targetRir : number(cfg.targetRir, 2);
    return {
      strategy: strategy,
      plannedSets: plannedSets,
      decisionSets: decisionSets,
      e1rm: explicit.e1rm === undefined ? (range.min >= 4 && range.max <= 12 && !highRep) : !!explicit.e1rm,
      targetRir: Math.max(0, Math.min(6, number(targetRir, 2))),
      incrementLimitPct: Math.max(0.05, number(explicit.incrementLimitPct, 0.10)),
      expandRepRange: explicit.expandRepRange !== undefined ? !!explicit.expandRepRange : cfg.expandRepRange !== false,
      weightMatch: explicit.weightMatch !== undefined ? !!explicit.weightMatch : cfg.weightMatch !== false,
      name: name
    };
  }

  function repsCeiling(range, top, inc, profile) {
    var pct = top > 0 ? inc / top : 0;
    if (profile.strategy !== 'reps' && pct <= profile.incrementLimitPct) return range.max;
    if (inc <= 0) return range.max;
    var extra = Math.max(1, Math.ceil(Math.max(0, pct - profile.incrementLimitPct) * 20));
    return Math.min(range.max + 4, range.max + extra);
  }

  function topSetsFor(item) {
    var top = topOf(item.sets);
    return item.sets.filter(function (set) { return number(set.w, 0) >= top * 0.98; });
  }

  function evidenceFor(item, profile, range, inc) {
    var topSets = topSetsFor(item);
    var required = profile.decisionSets;
    var sample = topSets.slice(0, required);
    var enough = sample.length >= required;
    var ceiling = repsCeiling(range, topOf(item.sets), inc, profile);
    var minReps = sample.length ? Math.min.apply(null, sample.map(function (set) { return number(set.r, 0); })) : 0;
    var avgReps = average(sample.map(function (set) { return number(set.r, 0); }));
    var allAtCeiling = enough && sample.every(function (set) { return number(set.r, 0) >= ceiling; });
    var allAtRangeMax = enough && sample.every(function (set) { return number(set.r, 0) >= range.max; });
    var underMin = sample.length > 0 && sample.filter(function (set) { return number(set.r, 0) < range.min; }).length >= Math.ceil(sample.length / 2);
    var rirSamples = sample.filter(function (set) { return rirFor(set) !== null; });
    var failureReps = rirSamples.map(function (set) { return number(set.r, 0) + rirFor(set); });
    return {
      top: topOf(item.sets), topSets: topSets, sample: sample, required: required,
      enough: enough, ceiling: ceiling, minReps: minReps, avgReps: avgReps,
      allAtCeiling: allAtCeiling, allAtRangeMax: allAtRangeMax, underMin: underMin,
      rirSamples: rirSamples, hasRir: rirSamples.length > 0,
      avgFailureReps: average(failureReps)
    };
  }

  function capabilityForSet(set) {
    if (!isValidSet(set)) return null;
    var rir = rirFor(set);
    var failureReps = number(set.r, 0) + (rir === null ? 0 : rir);
    return {
      weight: number(set.w, 0), reps: number(set.r, 0), rir: rir,
      failureReps: failureReps,
      score: number(set.w, 0) * (1 + failureReps / 30)
    };
  }

  function bestE1rm(sets, profile) {
    if (profile && profile.e1rm === false) return 0;
    return seriesDeTrabalho(sets).reduce(function (best, set) {
      var c = capabilityForSet(set);
      return Math.max(best, c ? c.score : 0);
    }, 0);
  }

  function e1rmTrend(history, profile) {
    if (!profile || profile.e1rm === false || history.length < 2) return 0;
    var usable = history.filter(function (item) { return !item.short; });
    if (usable.length < 2) return 0;
    var latest = bestE1rm(usable[usable.length - 1].sets, profile);
    var previous = bestE1rm(usable[usable.length - 2].sets, profile);
    if (!previous) return 0;
    return (latest - previous) / previous;
  }

  function volumeLow(history, plannedSets) {
    var recent = history.filter(function (item) { return !item.short; }).slice(-3);
    var low = recent.filter(function (item) { return item.sets.length < plannedSets; });
    return recent.length >= 3 && low.length >= 2;
  }

  function fullNormal(item, profile) {
    return !!item && !item.short && item.sets.length >= profile.plannedSets;
  }

  function sustainedUnderMin(history, profile, range, inc) {
    var normal = history.filter(function (item) { return fullNormal(item, profile); }).slice(-2);
    if (normal.length < 2) return false;
    return normal.every(function (item) { return evidenceFor(item, profile, range, inc).underMin; });
  }

  function performanceKey(item, profile, range, inc) {
    var evidence = evidenceFor(item, profile, range, inc);
    var effort = average(evidence.sample.map(function (set) {
      var rir = rirFor(set);
      return rir === null ? 0 : Math.max(0, 2 - rir) * 0.15;
    }));
    return evidence.avgReps + effort;
  }

  function stalled(history, stallSessions, profile, range, inc) {
    var normal = history.filter(function (item) {
      return fullNormal(item, profile) && evidenceFor(item, profile, range, inc).enough;
    });
    if (normal.length < stallSessions || stallSessions < 2) return false;
    var recent = normal.slice(-stallSessions);
    var first = evidenceFor(recent[0], profile, range, inc);
    var firstTop = first.top;
    var previousPerformance = performanceKey(recent[0], profile, range, inc);
    for (var i = 1; i < recent.length; i++) {
      var evidence = evidenceFor(recent[i], profile, range, inc);
      var currentPerformance = performanceKey(recent[i], profile, range, inc);
      if (!sameNumber(evidence.top, firstTop) || currentPerformance > previousPerformance + 0.01) return false;
      previousPerformance = currentPerformance;
    }
    return true;
  }

  function result(carga, repsMeta, status, motivo, extra) {
    var out = { carga: carga, repsMeta: repsMeta, status: status, motivo: motivo };
    if (extra) Object.keys(extra).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function confidenceFor(item, profile, latestIsShort, model) {
    if (model && model.sampleCount >= profile.decisionSets * 3) return 'alta';
    if (latestIsShort) return 'media';
    if (item && item.sets.length >= profile.plannedSets) return 'alta';
    return 'media';
  }

  function legacyMeta(plan, profile, range, inc, history, settings, perSide, context, extraBase) {
    var cfg = settings || {};
    var stallSessions = Math.max(2, parseInt(cfg.stallSessions, 10) || 3);
    var deloadPct = Math.max(0, number(cfg.deloadPct, 10));
    var latest = history[history.length - 1];
    var latestEvidence = evidenceFor(latest, profile, range, inc);
    var latestNormal = history.slice().reverse().find(function (item) { return !item.short; });
    var lowVolume = volumeLow(history, profile.plannedSets);
    var trend = e1rmTrend(history, profile);
    var suffix = perSide ? ' por lado' : '';
    var extra = Object.assign({ confianca: confidenceFor(latest, profile, latest.short), perfil: profile, e1rmTrend: trend, modelo: 'legado' }, extraBase || {});
    if (sustainedUnderMin(history, profile, range, inc) && latestNormal === latest) {
      var reduced = roundToIncrement(latestEvidence.top * (1 - deloadPct / 100), inc);
      return result(reduced, range.min, 'reduzir', 'Duas sessoes completas ficaram abaixo de ' + range.min + ' reps; reduza cerca de ' + deloadPct + '% e reconstrua a faixa.' + suffix + '.' + context, extra);
    }
    if (latestEvidence.enough && latestEvidence.allAtCeiling && inc > 0) {
      var nextLoad = roundToIncrement(latestEvidence.top + inc, inc);
      return result(nextLoad, range.min, 'subir', (latestEvidence.ceiling > range.max ? 'As series atingiram ' + latestEvidence.ceiling + ' reps para compensar o salto de carga.' : 'As series de decisao atingiram o topo da faixa.') + ' Suba ' + inc + ' kg' + suffix + '.' + context, extra);
    }
    if (latestEvidence.enough && latestEvidence.allAtRangeMax && profile.strategy === 'dupla' && inc > 0 && latestEvidence.ceiling === range.max) {
      return result(roundToIncrement(latestEvidence.top + inc, inc), range.min, 'subir', 'As series de decisao bateram ' + range.max + ' reps. Suba ' + inc + ' kg' + suffix + '.' + context, extra);
    }
    if (lowVolume && !latest.short && !latestEvidence.enough) {
      return result(latestEvidence.top, Math.min(latestEvidence.minReps + 1, latestEvidence.ceiling), 'volume-baixo', 'O historico normal mostra series faltantes; complete pelo menos ' + profile.decisionSets + ' series de decisao antes de avaliar a carga.' + context, extra);
    }
    if (stalled(history, stallSessions, profile, range, inc)) {
      return result(latestEvidence.top, Math.min(latestEvidence.minReps + 1, latestEvidence.ceiling), 'travado', 'Carga e desempenho sem evolucao ha ' + stallSessions + ' sessoes completas. Tente mais reps, ajuste o incremento ou faca um deload de ' + deloadPct + '%.' + suffix + context, extra);
    }
    var target = Math.min(latestEvidence.minReps + 1, latestEvidence.ceiling);
    if (!latestEvidence.enough && latest.short) target = Math.min(Math.max(range.min, latestEvidence.minReps + 1), latestEvidence.ceiling);
    var reason = latest.short ? 'Treino curto: ' + latest.sets.length + ' series contam para o historico; faltantes nao reduzem a meta. Busque ' + target + ' reps quando repetir a carga.' : 'Mantenha a carga e busque ' + target + ' reps antes de subir.';
    if (trend > 0.03) reason += ' O e1RM recente esta subindo.';
    return result(latestEvidence.top, target, 'manter', reason + context, extra);
  }

  function modelEstimate(history, profile) {
    var samples = [];
    history.forEach(function (item, index) {
      if (item.short) return;
      topSetsFor(item).slice(0, profile.decisionSets).forEach(function (set) {
        var c = capabilityForSet(set);
        if (c && c.rir !== null) samples.push({ score: c.score, failureReps: c.failureReps, weight: c.weight, age: history.length - index });
      });
    });
    if (!samples.length) return null;
    var weighted = samples.reduce(function (acc, sample) {
      var w = Math.max(0.35, 1 - Math.max(0, sample.age - 1) * 0.08);
      acc.score += sample.score * w; acc.failureReps += sample.failureReps * w; acc.weight += w; return acc;
    }, { score: 0, failureReps: 0, weight: 0 });
    return { score: weighted.score / weighted.weight, failureReps: weighted.failureReps / weighted.weight, sampleCount: samples.length };
  }

  function candidateFor(score, weight, range, targetRir, inc, profile, currentWeight) {
    if (weight <= 0) return null;
    var predicted = Math.round((score / weight - 1) * 30 - targetRir);
    var max = profile.expandRepRange ? range.max + 4 : range.max;
    var reps = Math.max(range.min, Math.min(max, predicted));
    var predictedScore = weight * (1 + (reps + targetRir) / 30);
    return {
      carga: roundToIncrement(weight, inc), reps: reps,
      error: Math.abs(predictedScore - score),
      distance: Math.abs(weight - currentWeight),
      inRange: reps >= range.min && reps <= range.max
    };
  }

  function rirMeta(plan, profile, range, inc, history, settings, perSide) {
    var cfg = settings || {};
    var latest = history[history.length - 1];
    var latestEvidence = evidenceFor(latest, profile, range, inc);
    var model = modelEstimate(history, profile);
    if (!model || !latestEvidence.hasRir || !latestEvidence.enough) return null;
    var observed = average(latestEvidence.rirSamples.map(function (set) { return capabilityForSet(set).score; }));
    var expectedScore = latestEvidence.top * (1 + (range.min + (range.max - range.min) / 2 + profile.targetRir) / 30);
    var delta = expectedScore ? (observed - expectedScore) / expectedScore : 0;
    var progressThreshold = Math.max(0.015, number(cfg.progressThreshold, 0.02));
    var underThreshold = Math.max(0.03, number(cfg.underThreshold, 0.05));
    var currentWeight = latestEvidence.top;
    var targetScore = Math.max(model.score, observed);
    var candidates = [];
    var steps = [0, 1, -1, 2, -2];
    steps.forEach(function (step) {
      if (inc <= 0 && step !== 0) return;
      var weight = currentWeight + step * inc;
      if (weight <= 0) return;
      var c = candidateFor(targetScore, weight, range, profile.targetRir, inc, profile, currentWeight);
      if (c) {
        c.step = step;
        if (!profile.expandRepRange && !c.inRange) c.error += 1000;
        if (profile.weightMatch && step === 0) c.error -= 0.25;
        candidates.push(c);
      }
    });
    candidates.sort(function (a, b) { return (a.error - b.error) || (a.distance - b.distance); });
    var chosen = candidates[0] || candidateFor(targetScore, currentWeight, range, profile.targetRir, inc, profile, currentWeight);
    if (delta > progressThreshold && inc > 0) {
      var upward = candidates.filter(function (candidate) {
        return candidate.step > 0 && candidate.reps >= range.min && candidate.reps <= (profile.expandRepRange ? range.max + 4 : range.max);
      }).sort(function (a, b) { return (a.error - b.error) || (a.distance - b.distance); });
      if (upward.length) chosen = upward[0];
    }
    if (!chosen) return null;
    var suffix = perSide ? ' por lado' : '';
    var extra = {
      confianca: confidenceFor(latest, profile, latest.short, model),
      perfil: profile,
      modelo: 'rir',
      targetRir: profile.targetRir,
      capacidade: Math.round(model.score * 10) / 10,
      capacidadeEsperada: Math.round(expectedScore * 10) / 10,
      capacidadeReps: Math.round(model.failureReps * 10) / 10,
      capacidadeAmostras: model.sampleCount,
      candidatos: candidates.slice(0, 5)
    };
    if (delta > progressThreshold && chosen.step > 0) {
      return result(chosen.carga, chosen.reps, 'subir', 'Sua capacidade estimada ficou ' + Math.round(delta * 100) + '% acima do esperado. Progrida para ' + chosen.carga + ' kg x ' + chosen.reps + ' reps @ ' + profile.targetRir + ' RIR' + suffix + '.', extra);
    }
    if (delta < -underThreshold && chosen.step < 0 && history.filter(function (item) { return !item.short && evidenceFor(item, profile, range, inc).hasRir; }).length >= 2) {
      return result(chosen.carga, chosen.reps, 'reduzir', 'A capacidade recente ficou abaixo do alvo; ajuste para ' + chosen.carga + ' kg x ' + chosen.reps + ' reps @ ' + profile.targetRir + ' RIR' + suffix + '.', extra);
    }
    return result(chosen.carga, chosen.reps, 'manter', 'Mantenha ' + chosen.carga + ' kg e busque ' + chosen.reps + ' reps @ ' + profile.targetRir + ' RIR. Capacidade estimada: ' + Math.round(model.failureReps * 10) / 10 + ' reps até a falha.', extra);
  }

  function calcularMeta(ficha, sessions, day, nomeExercicio, settings) {
    var plan = planFor(ficha, day, nomeExercicio);
    var range = parseRange(plan.reps);
    var eq = equipmentFor(plan);
    var inc = incrementFor(plan);
    var perSide = plan.perSide === undefined ? (eq === 'halter' || isUnilateral(plan.n)) : !!plan.perSide;
    var profile = profileFor(plan, range, settings);
    var cfg = settings || {};
    if (cfg.enabled === false) return result(null, range.min, 'inicial', 'Progressao automatica desativada.');
    var history = historyFor(sessions, day, nomeExercicio, plan.id, plan.aliases);
    if (!history.length) return result(null, range.min, 'inicial', 'Registre uma serie de referencia antes de usar a meta.', { confianca: 'baixa', perfil: profile, targetRir: profile.targetRir, modelo: 'inicial', faixa: range });
    var latest = history[history.length - 1];
    var context = history.some(function (item) { return item.short; }) ? ' Sessoes curtas contam como evidencia; series ausentes nao penalizam a meta.' : '';
    var latestEvidence = evidenceFor(latest, profile, range, inc);
    var modeled = rirMeta(plan, profile, range, inc, history, cfg, perSide);
    if (modeled) {
      modeled.faixa = range;
      modeled.contexto = context;
      return modeled;
    }
    var legacy = legacyMeta(plan, profile, range, inc, history, cfg, perSide, context, { targetRir: profile.targetRir, faixa: range });
    legacy.contexto = context;
    return legacy;
  }

  function melhorE1rm(sets) { return bestE1rm(sets, null); }

  return {
    INC_BY_EQ: INC_BY_EQ,
    inferEq: inferEq,
    isUnilateral: isUnilateral,
    defaultInc: defaultInc,
    parseRange: parseRange,
    entryFor: entryFor,
    isShortSession: isShortSession,
    seriesDeTrabalho: seriesDeTrabalho,
    rirFor: rirFor,
    hasRir: hasRir,
    capabilityForSet: capabilityForSet,
    calcularMeta: calcularMeta,
    melhorE1rm: melhorE1rm,
    e1rmTrend: e1rmTrend,
    roundToIncrement: roundToIncrement,
    profileFor: profileFor
  };
});
