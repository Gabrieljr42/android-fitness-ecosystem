/* apps/evolucao/strava.js — Integração Strava e Sincronização com Corridas e Maratona */
(function(root) {
  'use strict';

  var STRAVA_CONFIG = {
    authUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/api/v3/oauth/token',
    apiUrl: 'https://www.strava.com/api/v3'
  };

  /**
   * Helper de formatação de pace em "M:SS min/km"
   */
  function formatPace(paceSec) {
    if (!isFinite(paceSec) || paceSec <= 0) return '--:-- min/km';
    var s = Math.round(paceSec);
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m + ':' + String(sec).padStart(2, '0') + ' min/km';
  }

  /**
   * Estima calorias gastas se não fornecidas pelo Strava
   */
  function estimateCalories(distKm, durSec) {
    var weight = 75;
    try {
      if (typeof getLatestWeight === 'function') weight = getLatestWeight();
      else if (root.state && Array.isArray(root.state.peso) && root.state.peso.length) {
        var last = root.state.peso[root.state.peso.length - 1];
        if (last && Number(last.kg) > 0) weight = Number(last.kg);
      }
    } catch (_) {}
    return Math.round(distKm * weight * 1.036);
  }

  /**
   * Verifica se o tipo de atividade Strava corresponde a uma corrida
   */
  function isRunActivity(act) {
    if (!act) return false;
    var type = String(act.type || act.sport_type || '').toLowerCase();
    if (!type) return true; // se não especificado, aceita
    return type === 'run' || type === 'virtualrun' || type === 'trailrun' || type === 'treadmill';
  }

  /**
   * Normaliza um objeto de atividade do Strava para o schema canônico de corrida do Evolução
   */
  function normalizeStravaActivity(act) {
    if (!act || typeof act !== 'object') return null;

    var rawId = act.id || act.stravaId;
    if (!rawId) return null;
    var stravaId = String(rawId);

    // Distância: Strava API envia metros. Aceita também se já vier em km
    var distMeters = Number(act.distance);
    var distKm = 0;
    if (isFinite(distMeters) && distMeters > 0) {
      distKm = act.distanceInKm ? distMeters : distMeters / 1000;
    } else if (isFinite(Number(act.distanciaKm)) && Number(act.distanciaKm) > 0) {
      distKm = Number(act.distanciaKm);
    }
    distKm = Math.round(distKm * 100) / 100;

    // Duração em segundos
    var durSec = Number(act.moving_time || act.elapsed_time || act.duracaoSeg || 0);
    durSec = Math.max(0, Math.round(durSec));

    // Data e Hora
    var dateStr = '';
    var timeStr = '00:00';
    var rawDate = act.start_date_local || act.start_date || act.date || act.data;
    if (rawDate) {
      var s = String(rawDate);
      dateStr = s.slice(0, 10);
      if (s.length >= 16 && s.indexOf('T') >= 0) {
        timeStr = s.slice(11, 16);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      if (typeof todayISO === 'function') dateStr = todayISO();
      else {
        var d = new Date();
        dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }
    }

    // Pace e Velocidade
    var paceSec = 0;
    if (distKm > 0 && durSec > 0) {
      paceSec = durSec / distKm;
    } else if (act.average_speed && Number(act.average_speed) > 0) {
      paceSec = 1000 / Number(act.average_speed);
    }
    var paceFmt = formatPace(paceSec);
    var speedKmh = distKm > 0 && durSec > 0 ? (distKm * 3600) / durSec : 0;

    // Elevação
    var elev = Number(act.total_elevation_gain || act.elevacaoGanhoM || 0);
    if (!isFinite(elev) || elev < 0) elev = 0;

    // Calorias
    var cal = Number(act.calories || act.calorias || 0);
    if (!isFinite(cal) || cal <= 0) {
      cal = estimateCalories(distKm, durSec);
    }

    var name = String(act.name || act.nome || 'Corrida Strava').slice(0, 120);
    var notes = act.description || act.notas || '';
    if (elev > 0 && notes.indexOf('Elevação') < 0) {
      notes = (notes ? notes + ' • ' : '') + 'Elevação: +' + Math.round(elev) + 'm';
    }

    return {
      id: 'strava_' + stravaId,
      stravaId: stravaId,
      source: 'strava',
      date: dateStr,
      hora: timeStr,
      mode: 'continua',
      tipo: 'continua',
      distanciaKm: distKm,
      duracaoSeg: durSec,
      paceMinKm: paceFmt,
      ritmoMedioSegKm: Math.round(paceSec),
      velocidadeMediaKmh: Math.round(speedKmh * 10) / 10,
      elevacaoGanhoM: Math.round(elev * 10) / 10,
      calorias: Math.round(cal),
      nome: name,
      notas: notes
    };
  }

  /**
   * Identifica se uma corrida já existe no array de corridas
   */
  function isDuplicateCorrida(existingList, normalized) {
    if (!Array.isArray(existingList) || !normalized) return false;
    for (var i = 0; i < existingList.length; i++) {
      var item = existingList[i];
      if (!item) continue;

      // Correspondência por ID Strava direto ou ID composto
      if (item.stravaId && String(item.stravaId) === String(normalized.stravaId)) return true;
      if (String(item.id) === String(normalized.id) || String(item.id) === String(normalized.stravaId)) return true;

      // Correspondência heurística para atividades Strava sem stravaId explícito
      if (item.source === 'strava' && item.date === normalized.date && Math.abs((Number(item.distanciaKm) || 0) - normalized.distanciaKm) < 0.05 && Math.abs((Number(item.duracaoSeg) || 0) - normalized.duracaoSeg) < 15) {
        return true;
      }
    }
    return false;
  }

  /**
   * Ingestão e sincronização de array de atividades do Strava
   * Atualiza state.corridas, persiste via save() e atualiza views
   */
  function syncStravaActivities(activities, options) {
    var opts = options || {};
    var targetState = opts.state || (typeof root.state !== 'undefined' ? root.state : null);
    if (!targetState) {
      return { ok: false, error: 'STATE_NOT_FOUND', importedCount: 0, duplicatesCount: 0, total: 0 };
    }

    if (!Array.isArray(targetState.corridas)) {
      targetState.corridas = [];
    }

    if (!Array.isArray(activities)) {
      return { ok: true, importedCount: 0, duplicatesCount: 0, total: 0, items: [] };
    }

    var imported = 0;
    var duplicates = 0;
    var importedItems = [];

    for (var i = 0; i < activities.length; i++) {
      var raw = activities[i];
      if (!isRunActivity(raw)) continue;

      var norm = normalizeStravaActivity(raw);
      if (!norm || norm.distanciaKm <= 0) continue;

      if (isDuplicateCorrida(targetState.corridas, norm)) {
        duplicates++;
      } else {
        targetState.corridas.push(norm);
        importedItems.push(norm);
        imported++;
      }
    }

    // Ordenar corridas cronologicamente
    targetState.corridas.sort(function(a, b) {
      var da = String(a.date || a.data || '') + ' ' + String(a.hora || '');
      var db = String(b.date || b.data || '') + ' ' + String(b.hora || '');
      return da < db ? -1 : (da > db ? 1 : 0);
    });

    // Persistência automática
    if (opts.autoSave !== false) {
      try {
        if (typeof root.save === 'function') root.save();
        else if (typeof localStorage !== 'undefined') {
          var key = (typeof root.KEY !== 'undefined' ? root.KEY : 'evolucao_v1');
          localStorage.setItem(key, JSON.stringify(targetState));
        }
      } catch (_) {}
    }

    // Atualização de UI se disponível
    if (opts.render !== false && typeof root.render === 'function') {
      try { root.render(); } catch (_) {}
    }

    return {
      ok: true,
      importedCount: imported,
      duplicatesCount: duplicates,
      total: targetState.corridas.length,
      items: importedItems
    };
  }

  /**
   * Busca atividades na API Strava (com suporte a token Bearer)
   */
  function fetchStravaActivities(accessToken, params) {
    if (!accessToken) {
      return Promise.reject(new Error('STRAVA_ACCESS_TOKEN_REQUIRED'));
    }

    var p = params || {};
    var after = p.after ? '&after=' + p.after : '';
    var page = p.page ? '&page=' + p.page : '&page=1';
    var perPage = p.perPage ? '&per_page=' + p.perPage : '&per_page=30';
    var url = STRAVA_CONFIG.apiUrl + '/athlete/activities?' + page + perPage + after;

    if (typeof fetch === 'undefined') {
      return Promise.reject(new Error('FETCH_NOT_AVAILABLE'));
    }

    return fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Accept': 'application/json'
      }
    })
    .then(function(res) {
      if (!res.ok) {
        throw new Error('STRAVA_API_ERROR_' + res.status);
      }
      return res.json();
    })
    .then(function(data) {
      return syncStravaActivities(data);
    });
  }

  /**
   * Desconecta a conta Strava
   */
  function disconnectStrava(targetState) {
    var s = targetState || (typeof root.state !== 'undefined' ? root.state : null);
    if (s) {
      delete s.strava;
      if (typeof root.save === 'function') root.save();
    }
    return { ok: true };
  }

  var api = {
    normalizeStravaActivity: normalizeStravaActivity,
    isDuplicateCorrida: isDuplicateCorrida,
    syncStravaActivities: syncStravaActivities,
    fetchStravaActivities: fetchStravaActivities,
    disconnectStrava: disconnectStrava,
    isRunActivity: isRunActivity,
    STRAVA_CONFIG: STRAVA_CONFIG
  };

  root.EvolucaoStrava = api;
  root.syncStravaActivities = syncStravaActivities;
  root.normalizeStravaActivity = normalizeStravaActivity;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
