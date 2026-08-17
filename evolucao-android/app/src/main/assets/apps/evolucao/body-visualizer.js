/* apps/evolucao/body-visualizer.js — Visualizador Anatômico Vetorial Proporcional */
(function(root, factory) {
  'use strict';
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.BodyVisualizer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var MUSCLES = {
    CHEST: 'chest',
    BACK: 'back',
    SHOULDERS: 'shoulders',
    BICEPS: 'biceps',
    TRICEPS: 'triceps',
    ABS: 'abs',
    QUADS: 'quads',
    HAMSTRINGS: 'hamstrings',
    CALVES: 'calves',
    GLUTES: 'glutes'
  };

  var LABELS = {
    chest: 'Peito',
    back: 'Costas',
    shoulders: 'Ombros',
    biceps: 'Bíceps',
    triceps: 'Tríceps',
    abs: 'Abdômen',
    quads: 'Quadríceps',
    hamstrings: 'Posteriores',
    calves: 'Panturrilhas',
    glutes: 'Glúteos'
  };

  function normalize(s) {
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  var RULES = [
    // 1. CHEST
    {
      pattern: /supino|voador|crucifixo\s*reto|crucifixo\s*inclinado|crossover|cross\s*over|flexao|peitoral|chest\s*press|peito/,
      primary: 'chest',
      secondary: { shoulders: 0.4, triceps: 0.3 }
    },
    // 2. BACK
    {
      pattern: /puxada|remada|serrote|lat\s*pull|barra\s*fixa|pulldown|cavalinho|dorsal|costas/,
      primary: 'back',
      secondary: { biceps: 0.5, shoulders: 0.3 }
    },
    // 3. SHOULDERS
    {
      pattern: /elevacao\s*lateral|desenvolvimento|elevacao\s*frontal|ombro|deltoid|arnold|face\s*pull|remada\s*alta/,
      primary: 'shoulders',
      secondary: { triceps: 0.3 }
    },
    // 4. BICEPS
    {
      pattern: /rosca|biceps|scott|martelo|concentrada/,
      primary: 'biceps',
      secondary: {}
    },
    // 5. TRICEPS
    {
      pattern: /triceps|testa|frances|coice|mergulho|paralela/,
      primary: 'triceps',
      secondary: {}
    },
    // 6. ABS
    {
      pattern: /abdominal|abs|prancha|infra|supra|crunch|hanging\s*leg/,
      primary: 'abs',
      secondary: {}
    },
    // 7. QUADS
    {
      pattern: /agachamento|leg\s*press|cadeira\s*extensora|extensora|hack|afundo|passada|bulgaro|sissy/,
      primary: 'quads',
      secondary: { glutes: 0.4 }
    },
    // 8. HAMSTRINGS
    {
      pattern: /cadeira\s*flexora|mesa\s*flexora|flexora|stiff|terra\s*romeno|rdl|good\s*morning/,
      primary: 'hamstrings',
      secondary: { glutes: 0.4 }
    },
    // 9. CALVES
    {
      pattern: /panturrilha|gemeos|soleo|panturr/,
      primary: 'calves',
      secondary: {}
    },
    // 10. GLUTES
    {
      pattern: /elevacao\s*pelvica|pelvica|gluteo|abdutora|coice\s*gluteo|hip\s*thrust/,
      primary: 'glutes',
      secondary: { hamstrings: 0.3 }
    },
    // GENERAL / COMPOUND
    {
      pattern: /levantamento\s*terra|deadlift/,
      primary: 'back',
      secondary: { hamstrings: 0.6, glutes: 0.5, quads: 0.3 }
    }
  ];

  function getMusclesForExercise(name) {
    var s = normalize(name);
    var res = {};
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (r.pattern.test(s)) {
        res[r.primary] = (res[r.primary] || 0) + 1.0;
        if (r.secondary) {
          Object.keys(r.secondary).forEach(function(sec) {
            res[sec] = (res[sec] || 0) + r.secondary[sec];
          });
        }
        return res;
      }
    }
    return res;
  }

  function getMusclesForSession(session) {
    var totals = {};
    if (!session || !session.entries) return totals;
    Object.keys(session.entries).forEach(function(exName) {
      var sets = session.entries[exName];
      if (!Array.isArray(sets)) return;
      var workSetsCount = 0;
      sets.forEach(function(set) {
        var isWu = set && (set.wu !== undefined ? set.wu : set.warmup);
        if (!isWu && set && set.done !== false) workSetsCount++;
      });
      if (workSetsCount <= 0) workSetsCount = sets.length; // fallback
      var factor = workSetsCount;
      var m = getMusclesForExercise(exName);
      Object.keys(m).forEach(function(group) {
        totals[group] = (totals[group] || 0) + (m[group] * factor);
      });
    });
    return totals;
  }

  function getMusclesForDay(dayObj) {
    var totals = {};
    if (!dayObj || !Array.isArray(dayObj.ex)) return totals;
    dayObj.ex.forEach(function(exo) {
      var setsCount = typeof exo.sets === 'number' ? exo.sets : 3;
      var m = getMusclesForExercise(exo.n);
      Object.keys(m).forEach(function(group) {
        totals[group] = (totals[group] || 0) + (m[group] * setsCount);
      });
    });
    return totals;
  }

  function getMuscleSummary(muscleScores) {
    var list = [];
    Object.keys(muscleScores || {}).forEach(function(id) {
      var score = muscleScores[id];
      if (score > 0) {
        list.push({
          id: id,
          label: LABELS[id] || id,
          score: Math.round(score * 10) / 10
        });
      }
    });
    list.sort(function(a, b) { return b.score - a.score; });
    return list;
  }

  function resolveColor(score, maxScore) {
    if (!score || score <= 0) {
      return { fill: 'var(--anat-base, #27272a)', opacity: '0.45' };
    }
    var ratio = maxScore > 0 ? (score / maxScore) : 1;
    if (ratio >= 0.75) {
      return { fill: 'var(--anat-active, #ffffff)', opacity: '1.0' };
    } else if (ratio >= 0.4) {
      return { fill: 'var(--anat-sec, #71717a)', opacity: '0.85' };
    } else {
      return { fill: 'var(--anat-sec, #71717a)', opacity: '0.55' };
    }
  }

  function render(muscles, options) {
    options = options || {};
    var height = options.height || 165;
    var scores = muscles || {};
    var maxScore = 0;
    Object.keys(scores).forEach(function(k) {
      if (scores[k] > maxScore) maxScore = scores[k];
    });

    var mChest = resolveColor(scores.chest, maxScore);
    var mBack = resolveColor(scores.back, maxScore);
    var mShoulders = resolveColor(scores.shoulders, maxScore);
    var mBiceps = resolveColor(scores.biceps, maxScore);
    var mTriceps = resolveColor(scores.triceps, maxScore);
    var mAbs = resolveColor(scores.abs, maxScore);
    var mQuads = resolveColor(scores.quads, maxScore);
    var mHamstrings = resolveColor(scores.hamstrings, maxScore);
    var mCalves = resolveColor(scores.calves, maxScore);
    var mGlutes = resolveColor(scores.glutes, maxScore);

    return '<svg class="body-anat-svg" viewBox="0 0 300 200" style="height:' + height + 'px;width:100%;max-width:320px;margin:0 auto;display:block" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<filter id="anatGlow" x="-20%" y="-20%" width="140%" height="140%">' +
          '<feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.25"/>' +
        '</filter>' +
      '</defs>' +

      // === SILHUETA FRONTAL (X: 10 a 140, centro 75) ===
      '<g id="anatFront" transform="translate(10, 0)">' +
        '<text x="65" y="16" fill="#a1a1aa" font-size="9" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-weight="700" text-anchor="middle" letter-spacing="1">FRENTE</text>' +

        // Base Body Outline Front (Head, Neck, Traps, Hands, Feet)
        '<g class="anat-base-silhouette" fill="var(--anat-base, #27272a)" opacity="0.35">' +
          '<circle cx="65" cy="30" r="11"/>' + // Head
          '<path d="M60 41 L70 41 L73 48 L57 48 Z"/>' + // Neck
          '<path d="M38 100 C34 104 33 112 36 116 C39 116 43 110 44 102 Z"/>' + // Forearm L
          '<path d="M92 100 C96 104 97 112 94 116 C91 116 87 110 86 102 Z"/>' + // Forearm R
          '<path d="M52 185 C48 189 44 195 56 195 C62 195 62 188 60 185 Z"/>' + // Foot L
          '<path d="M78 185 C82 189 86 195 74 195 C68 195 68 188 70 185 Z"/>' + // Foot R
        '</g>' +

        // Ombros Frente (Deltoides Anteriores / Laterais)
        '<g class="anat-m" data-muscle="shoulders" fill="' + mShoulders.fill + '" opacity="' + mShoulders.opacity + '">' +
          '<path d="M47 48 C42 50 38 56 40 64 C42 66 48 64 50 56 C51 52 50 49 47 48 Z"/>' +
          '<path d="M83 48 C88 50 92 56 90 64 C88 66 82 64 80 56 C79 52 80 49 83 48 Z"/>' +
        '</g>' +

        // Peitoral (Chest)
        '<g class="anat-m" data-muscle="chest" fill="' + mChest.fill + '" opacity="' + mChest.opacity + '">' +
          '<path d="M51 50 C56 50 63 52 64 61 C64 68 56 71 50 69 C48 62 48 54 51 50 Z"/>' +
          '<path d="M79 50 C74 50 67 52 66 61 C66 68 74 71 80 69 C82 62 82 54 79 50 Z"/>' +
        '</g>' +

        // Bíceps (Biceps)
        '<g class="anat-m" data-muscle="biceps" fill="' + mBiceps.fill + '" opacity="' + mBiceps.opacity + '">' +
          '<path d="M39 66 C36 74 36 85 40 93 C43 93 46 87 46 77 C46 72 43 68 39 66 Z"/>' +
          '<path d="M91 66 C94 74 94 85 90 93 C87 93 84 87 84 77 C84 72 87 68 91 66 Z"/>' +
        '</g>' +

        // Abdômen (Abs)
        '<g class="anat-m" data-muscle="abs" fill="' + mAbs.fill + '" opacity="' + mAbs.opacity + '">' +
          '<path d="M56 73 C61 72 69 72 74 73 C73 88 71 96 65 98 C59 96 57 88 56 73 Z"/>' +
        '</g>' +

        // Quadríceps (Quads)
        '<g class="anat-m" data-muscle="quads" fill="' + mQuads.fill + '" opacity="' + mQuads.opacity + '">' +
          '<path d="M51 102 C46 112 46 128 50 144 C55 147 60 145 62 136 C64 125 64 110 59 102 Z"/>' +
          '<path d="M79 102 C84 112 84 128 80 144 C75 147 70 145 68 136 C66 125 66 110 71 102 Z"/>' +
        '</g>' +

        // Panturrilhas Frente (Calves Front)
        '<g class="anat-m" data-muscle="calves" fill="' + mCalves.fill + '" opacity="' + mCalves.opacity + '">' +
          '<path d="M51 152 C48 160 49 170 53 178 C57 178 59 171 59 160 C59 154 55 151 51 152 Z"/>' +
          '<path d="M79 152 C82 160 81 170 77 178 C73 178 71 171 71 160 C71 154 75 151 79 152 Z"/>' +
        '</g>' +
      '</g>' +

      // === SILHUETA DORSAL (X: 160 a 290, centro 225) ===
      '<g id="anatBack" transform="translate(150, 0)">' +
        '<text x="75" y="16" fill="#a1a1aa" font-size="9" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-weight="700" text-anchor="middle" letter-spacing="1">COSTAS</text>' +

        // Base Body Outline Back (Head, Neck, Hands, Feet)
        '<g class="anat-base-silhouette" fill="var(--anat-base, #27272a)" opacity="0.35">' +
          '<circle cx="75" cy="30" r="11"/>' + // Head
          '<path d="M70 41 L80 41 L83 48 L67 48 Z"/>' + // Neck
          '<path d="M48 90 C44 94 43 102 46 106 C49 106 53 100 54 92 Z"/>' + // Forearm L
          '<path d="M102 90 C106 94 107 102 104 106 C101 106 97 100 96 92 Z"/>' + // Forearm R
          '<path d="M62 185 C58 189 54 195 66 195 C72 195 72 188 70 185 Z"/>' + // Foot L
          '<path d="M88 185 C92 189 96 195 84 195 C78 195 78 188 80 185 Z"/>' + // Foot R
        '</g>' +

        // Ombros Costas (Deltoides Posteriores)
        '<g class="anat-m" data-muscle="shoulders" fill="' + mShoulders.fill + '" opacity="' + mShoulders.opacity + '">' +
          '<path d="M57 48 C52 50 48 56 50 64 C52 66 58 64 60 56 C61 52 60 49 57 48 Z"/>' +
          '<path d="M93 48 C98 50 102 56 100 64 C98 66 92 64 90 56 C89 52 90 49 93 48 Z"/>' +
        '</g>' +

        // Costas / Dorsais / Trapézio (Back)
        '<g class="anat-m" data-muscle="back" fill="' + mBack.fill + '" opacity="' + mBack.opacity + '">' +
          '<path d="M66 48 C72 46 78 46 84 48 C91 56 93 72 87 88 C80 91 70 91 63 88 C57 72 59 56 66 48 Z"/>' +
        '</g>' +

        // Tríceps (Triceps)
        '<g class="anat-m" data-muscle="triceps" fill="' + mTriceps.fill + '" opacity="' + mTriceps.opacity + '">' +
          '<path d="M50 56 C46 64 46 76 50 84 C53 84 56 78 56 68 C56 62 53 58 50 56 Z"/>' +
          '<path d="M100 56 C104 64 104 76 100 84 C97 84 94 78 94 68 C94 62 97 58 100 56 Z"/>' +
        '</g>' +

        // Glúteos (Glutes)
        '<g class="anat-m" data-muscle="glutes" fill="' + mGlutes.fill + '" opacity="' + mGlutes.opacity + '">' +
          '<path d="M64 91 C58 97 57 108 61 118 C66 122 72 121 74 114 C75 106 74 93 64 91 Z"/>' +
          '<path d="M86 91 C92 97 93 108 89 118 C84 122 78 121 76 114 C75 106 76 93 86 91 Z"/>' +
        '</g>' +

        // Posteriores de Coxa (Hamstrings)
        '<g class="anat-m" data-muscle="hamstrings" fill="' + mHamstrings.fill + '" opacity="' + mHamstrings.opacity + '">' +
          '<path d="M61 121 C57 130 57 142 61 154 C65 156 69 154 71 146 C73 137 73 125 71 121 Z"/>' +
          '<path d="M89 121 C93 130 93 142 89 154 C85 156 81 154 79 146 C77 137 77 125 79 121 Z"/>' +
        '</g>' +

        // Panturrilhas Costas (Calves Rear)
        '<g class="anat-m" data-muscle="calves" fill="' + mCalves.fill + '" opacity="' + mCalves.opacity + '">' +
          '<path d="M61 163 C58 171 59 179 63 184 C67 184 69 178 69 168 C69 163 65 161 61 163 Z"/>' +
          '<path d="M89 163 C92 171 91 179 87 184 C83 184 81 178 81 168 C81 163 85 161 89 163 Z"/>' +
        '</g>' +
      '</g>' +
    '</svg>';
  }

  function renderSessionAnatomy(session, options) {
    var muscles = getMusclesForSession(session);
    return render(muscles, options);
  }

  function renderDayAnatomy(dayObj, options) {
    var muscles = getMusclesForDay(dayObj);
    return render(muscles, options);
  }

  return {
    MUSCLES: MUSCLES,
    MUSCLE_GROUPS: Object.values ? Object.values(MUSCLES) : ['chest','back','shoulders','biceps','triceps','abs','quads','hamstrings','calves','glutes'],
    LABELS: LABELS,
    getMusclesForExercise: getMusclesForExercise,
    getMusclesForSession: getMusclesForSession,
    getMusclesForDay: getMusclesForDay,
    getMuscleSummary: getMuscleSummary,
    render: render,
    renderSVG: render,
    renderSessionAnatomy: renderSessionAnatomy,
    renderDayAnatomy: renderDayAnatomy
  };
}));
