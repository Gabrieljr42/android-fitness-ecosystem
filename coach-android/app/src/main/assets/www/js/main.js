/* Coach local UI controller. Remote calls are only available through the typed native bridge. */
(function () {
  'use strict';

  var state = {
    snapshot: null,
    plan: null,
    planRunId: null,
    health: null,
    sources: null,
    geminiKeyConfigured: false,
    geminiModel: 'gemini-3.7-flash',
    lastPayload: null,
    pendingPreviewToken: null,
    refreshing: false,
    toastTimer: null
  };
  var pending = Object.create(null);
  var sequence = 0;

  function byId(id) { return document.getElementById(id); }
  function safeText(value) { return value === null || value === undefined ? '' : String(value); }
  function requestId() {
    sequence += 1;
    return 'web-' + Date.now().toString(36) + '-' + sequence.toString(36);
  }

  function bridgeRequest(operation, data, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!window.CoachBridge || typeof window.CoachBridge.request !== 'function') {
        reject({ code: 'E_BRIDGE_UNAVAILABLE', message: 'Ponte nativa indisponível.' });
        return;
      }
      var id = requestId();
      var timer = setTimeout(function () {
        delete pending[id];
        reject({ code: 'E_TIMEOUT', message: 'A operação demorou mais que o limite seguro.' });
      }, timeoutMs || 20000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      try {
        window.CoachBridge.request(operation, JSON.stringify({ version: 1, requestId: id, data: data || {} }));
      } catch (error) {
        clearTimeout(timer);
        delete pending[id];
        reject({ code: 'E_BRIDGE_CALL', message: error.message || 'Falha ao chamar a ponte nativa.' });
      }
    });
  }

  window.CoachNative = {
    receive: function (raw) {
      var response;
      try { response = typeof raw === 'string' ? JSON.parse(raw) : raw; }
      catch (_) { return; }
      if (!response || response.version !== 1 || !response.requestId || !pending[response.requestId]) return;
      var call = pending[response.requestId];
      clearTimeout(call.timer);
      delete pending[response.requestId];
      if (response.ok) call.resolve(response.data || {});
      else call.reject(response.error || { code: 'E_UNKNOWN', message: 'Falha sem detalhes.' });
    }
  };

  function toast(message) {
    var node = byId('toast');
    node.textContent = safeText(message);
    node.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { node.classList.remove('show'); }, 3200);
  }

  function reportError(error) {
    var message = error && error.message ? error.message : 'Não foi possível concluir a operação.';
    toast(message);
  }

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.dataset.busyLabel = busyLabel || 'Aguarde…';
      button.textContent = button.dataset.busyLabel;
      button.disabled = true;
    } else {
      // A successful response may deliberately replace the action label (for example,
      // “Sincronizar” -> “Completar acesso”). Only restore the old label if the button is
      // still showing the temporary busy copy.
      if (button.textContent === button.dataset.busyLabel) {
        button.textContent = button.dataset.label || button.textContent;
      }
      delete button.dataset.label;
      delete button.dataset.busyLabel;
      button.disabled = false;
    }
  }

  function showTab(name) {
    document.querySelectorAll('[data-view]').forEach(function (view) {
      var active = view.dataset.view === name;
      view.hidden = !active;
      view.classList.toggle('is-active', active);
    });
    document.querySelectorAll('[data-tab]').forEach(function (tab) {
      var active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    byId('view-' + name).focus();
  }

  function formatDate(dateText) {
    var parts = dateText.split('-');
    var value = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(value);
  }

  function formatMetric(row, kind) {
    if (!row || row.status === 'ABSENT' || row.value === null) return { value: '—', detail: 'sem dado' };
    var value = row.value;
    if (kind === 'sleep') {
      var hours = Math.floor(value / 60);
      return { value: hours + 'h ' + Math.round(value % 60) + 'min', detail: 'Health Connect' };
    }
    if (kind === 'steps') return { value: Math.round(value).toLocaleString('pt-BR'), detail: 'passos observados' };
    if (kind === 'rhr') return { value: Math.round(value) + ' bpm', detail: 'Health Connect · em descanso' };
    var weightSource = row.source === 'EVOLUCAO' ? 'Evolução' : 'Health Connect';
    var weightDate = row.observedAtEpochMs ? new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short'
    }).format(new Date(row.observedAtEpochMs)) : null;
    return {
      value: Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kg',
      detail: weightSource + (weightDate ? ' · ' + weightDate : '')
    };
  }

  function renderMetric(cardId, row, kind) {
    var card = byId(cardId);
    var formatted = formatMetric(row, kind);
    card.querySelector('strong').textContent = formatted.value;
    card.querySelector('small').textContent = formatted.detail;
    card.classList.toggle('has-data', formatted.value !== '—');
  }

  function renderHealth(health) {
    state.health = health || {};
    var dot = byId('health-dot');
    var short = byId('health-short');
    var message = byId('health-message');
    var button = byId('sync-health');
    dot.className = 'status-dot';
    var code = state.health.state || state.health.availability || 'UNKNOWN';
    var requiredPermissionCount = Number(state.health.requiredPermissionCount || 0);
    var missingPermissionCount = Number(state.health.missingPermissionCount || 0);
    var hasPartialAccess = code === 'PERMISSION_REQUIRED' && requiredPermissionCount > 0 &&
      missingPermissionCount > 0 && missingPermissionCount < requiredPermissionCount;
    var labels = {
      SYNCED: ['Sincronizado', 'Dados sincronizados com o Health Connect.'],
      NO_CHANGES: ['Atualizado', 'Nenhuma mudança desde a última sincronização.'],
      AVAILABLE: ['Disponível', 'Health Connect disponível.'],
      PERMISSION_REQUIRED: ['Permissão necessária', 'Conecte sono, passos, FC de repouso e peso.'],
      PROVIDER_UPDATE_REQUIRED: ['Atualização necessária', 'Atualize o Health Connect para sincronizar.'],
      PAUSED: ['Desconectado', 'Dados locais excluídos. Toque em reconectar para importar novamente.'],
      UNAVAILABLE: ['Indisponível', 'Health Connect não está disponível; o check-in continua funcionando.'],
      ERROR: ['Falha de sincronização', state.health.message || 'Tente sincronizar novamente.'],
      UNKNOWN: ['Modo local', 'Health Connect ainda não foi verificado.']
    };
    var label = hasPartialAccess
      ? ['Acesso parcial', state.health.message ||
        ((requiredPermissionCount - missingPermissionCount) + ' de ' + requiredPermissionCount + ' sinais autorizados.')]
      : (labels[code] || labels.UNKNOWN);
    short.textContent = label[0];
    message.textContent = label[1];
    if (code === 'SYNCED' || code === 'NO_CHANGES') dot.classList.add('ok');
    if (code === 'ERROR' || code === 'UNAVAILABLE') dot.classList.add('error');
    button.textContent = hasPartialAccess ? 'Completar acesso' :
      (code === 'PERMISSION_REQUIRED' ? 'Conectar' : 'Sincronizar tudo');
  }

  function renderSources(sources) {
    state.sources = sources || {};
    function describe(name, row) {
      var code = row && row.state || 'UNAVAILABLE';
      if (code === 'SYNCED') return name + ' conectado';
      if (code === 'NO_DATA') return name + ' conectado (sem registro hoje)';
      if (code === 'PAUSED') return name + ' pausado';
      if (code === 'ERROR') return name + ' incompatível';
      return name + ' indisponível — atualize e abra o app';
    }
    byId('local-sources-message').textContent = [
      describe('Evolução', state.sources.evolucao),
      describe('NutriTrack', state.sources.nutritrack)
    ].join(' · ');
  }

  function renderMuscles(rows) {
    var grid = byId('muscle-grid');
    grid.replaceChildren();
    rows.forEach(function (row) {
      var node = document.createElement('div');
      node.className = 'muscle-chip';
      var title = document.createElement('strong');
      var value = document.createElement('span');
      title.textContent = row.label;
      value.textContent = ({
        unknown: 'não informado', none: 'sem dor relatada', mild: 'dor leve',
        moderate: 'dor moderada', severe: 'dor forte'
      })[row.status] || 'não informado';
      node.append(title, value);
      grid.appendChild(node);
    });
  }

  function friendlyEvidence(evidenceId) {
    if (String(evidenceId).indexOf('checkin:') === 0) return 'check-in de hoje';
    var labels = {
      'recovery.sleepMinutes': 'sono do Health Connect',
      'activity.steps': 'passos (somente contexto)',
      'recovery.restingHeartRate': 'FC de repouso (somente contexto)',
      'body.weightKg': 'peso (somente contexto)'
    };
    if (state.snapshot && state.snapshot.metrics) {
      var match = Object.keys(state.snapshot.metrics).find(function (key) {
        return state.snapshot.metrics[key].sourceRecordId === evidenceId;
      });
      if (match) return labels[match] || 'dado do Health Connect';
    }
    return 'sinal local validado';
  }

  function decisionButton(label, className, handler) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'button ' + className;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  function renderProposals(proposals) {
    var list = byId('proposal-list');
    list.replaceChildren();
    proposals.forEach(function (proposal) {
      var card = document.createElement('article');
      card.className = 'proposal-card';
      card.dataset.proposalId = proposal.id;
      card.dataset.status = proposal.status || 'pending';
      var title = document.createElement('h3');
      title.textContent = proposal.title;
      var meta = document.createElement('div');
      meta.className = 'proposal-meta';
      var confidence = document.createElement('span');
      confidence.className = 'pill neutral';
      confidence.textContent = 'Confiança ' + Math.round(proposal.confidence * 100) + '%';
      var target = document.createElement('span');
      target.className = 'pill neutral';
      target.textContent = proposal.target;
      meta.append(confidence, target);
      if (proposal.status && proposal.status !== 'pending') {
        var status = document.createElement('span');
        status.className = 'pill neutral';
        status.textContent = ({ accepted: 'Aceita', edited: 'Editada', rejected: 'Rejeitada' })[proposal.status] || proposal.status;
        meta.appendChild(status);
      }
      var facts = document.createElement('div');
      facts.className = 'proposal-facts';
      [['Motivo', proposal.reason], ['Benefício', proposal.benefit], ['Custo', proposal.cost], ['Alternativa', proposal.alternative]].forEach(function (row) {
        var p = document.createElement('p');
        var strong = document.createElement('strong');
        strong.textContent = row[0] + ': ';
        p.append(strong, document.createTextNode(row[1]));
        facts.appendChild(p);
      });
      var evidence = document.createElement('p');
      var evidenceTitle = document.createElement('strong');
      evidenceTitle.textContent = 'Baseado em: ';
      var evidenceLabels = (proposal.evidence || []).map(friendlyEvidence).filter(function (value, index, all) {
        return all.indexOf(value) === index;
      });
      evidence.append(evidenceTitle, document.createTextNode(evidenceLabels.length ? evidenceLabels.join('; ') : 'dados insuficientes'));
      facts.appendChild(evidence);
      var actions = document.createElement('div');
      actions.className = 'proposal-actions';
      actions.append(
        decisionButton('Aceitar', 'secondary', function () { saveDecision(proposal, 'accept', null, card); }),
        decisionButton('Rejeitar', 'ghost', function () { saveDecision(proposal, 'reject', null, card); })
      );
      if (proposal.status && proposal.status !== 'pending') {
        actions.querySelectorAll('button').forEach(function (button) { button.disabled = true; });
      }
      card.append(title, meta, facts, actions);
      list.appendChild(card);
    });
  }

  function populateCheckin(checkIn) {
    var form = byId('checkin-form');
    form.reset();
    if (checkIn) {
      [
        ['energy', checkIn.energy],
        ['sleepQuality', checkIn.perceivedSleepQuality],
        ['motivation', checkIn.motivation]
      ].forEach(function (row) {
        var input = form.querySelector('[name="' + row[0] + '"][value="' + row[1] + '"]');
        if (input) input.checked = true;
      });
      form.querySelectorAll('[name^="soreness."]').forEach(function (select) {
        var region = select.name.slice('soreness.'.length);
        var value = checkIn.soreness && checkIn.soreness[region];
        select.value = value && select.querySelector('option[value="' + value + '"]') ? value : 'NONE';
      });
      form.elements.jointPain.checked = !!checkIn.jointPainFlag;
      form.elements.note.value = checkIn.note || '';
    }
    byId('note-counter').textContent = form.elements.note.value.length + '/280';
  }

  function renderPlan(plan) {
    var readiness = plan.readiness;
    byId('readiness-score').textContent = readiness.score === null ? '—' : readiness.score;
    byId('score-ring').setAttribute('aria-label', readiness.score === null ? 'Prontidão sem pontuação' : 'Prontidão ' + readiness.score + ' de 100');
    byId('readiness-title').textContent = readiness.label.charAt(0).toUpperCase() + readiness.label.slice(1);
    byId('readiness-explanation').textContent = readiness.score === null
      ? 'Dados insuficientes: manteremos uma orientação conservadora até seu check-in.'
      : 'Confiança ' + readiness.confidenceLabel + '. Use o aquecimento para confirmar a leitura.';
    byId('coverage-value').textContent = plan.dataQuality.score + '%';
    byId('coverage-bar').style.width = plan.dataQuality.score + '%';
    byId('coverage-detail').textContent = plan.dataQuality.missing.length
      ? 'Faltando: ' + plan.dataQuality.missing.join(', ') + '.'
      : 'Todos os sinais desta fase estão presentes.';
    renderDimension('running', plan.dimensions.runningLoad);
    renderDimension('fueling', plan.dimensions.fueling);
    renderMuscles(plan.dimensions.muscleReadiness);
    var safety = byId('safety-card');
    safety.classList.toggle('is-hidden', !plan.safety.aggressiveChangesBlocked);
    byId('safety-copy').textContent = plan.safety.flags.concat(plan.safety.guidance || []).filter(Boolean).join('. ');
    renderProposals(plan.proposals);
  }

  function renderDimension(prefix, dimension) {
    byId(prefix + '-detail').textContent = dimension.message;
    var status = byId(prefix + '-status');
    var observed = dimension.status === 'observed';
    status.textContent = observed ? 'registrado' : 'dados insuficientes';
    status.className = 'pill ' + (observed ? 'ok' : 'neutral');
  }

  function renderSnapshot(snapshot) {
    state.snapshot = snapshot;
    populateCheckin(snapshot.checkIn);
    byId('today-label').textContent = formatDate(snapshot.logicalDate);
    renderMetric('metric-sleep', snapshot.metrics['recovery.sleepMinutes'], 'sleep');
    renderMetric('metric-steps', snapshot.metrics['activity.steps'], 'steps');
    renderMetric('metric-rhr', snapshot.metrics['recovery.restingHeartRate'], 'rhr');
    renderMetric('metric-weight', snapshot.metrics['body.weightKg'], 'weight');
    var plan = window.CoachEngine.analyze(snapshot);
    var prefix = (snapshot.hash || snapshot.logicalDate).slice(0, 16);
    plan.proposals = plan.proposals.map(function (proposal) {
      return Object.assign({}, proposal, { id: prefix + ':' + proposal.id, status: 'pending' });
    });
    state.plan = plan;
    state.planRunId = null;
    renderPlan(plan);
    persistPlan();
  }

  function persistPlan() {
    if (!state.snapshot || !state.plan) return;
    var snapshotHash = state.snapshot.hash;
    var plan = state.plan;
    bridgeRequest('plan.persist', {
      snapshotHash: snapshotHash,
      engineVersion: plan.engineVersion,
      output: plan
    }).then(function (data) {
      if (!state.snapshot || state.snapshot.hash !== snapshotHash || state.plan !== plan) return;
      state.planRunId = data.planRunId;
      var statuses = data.proposalStatuses || {};
      state.plan.proposals.forEach(function (proposal) {
        if (statuses[proposal.id]) proposal.status = statuses[proposal.id];
      });
      renderProposals(state.plan.proposals);
    })
      .catch(reportError);
  }

  function saveDecision(proposal, choice, editedPayload, card) {
    if (!state.planRunId) { toast('Aguarde o plano terminar de ser salvo.'); return; }
    bridgeRequest('decision.save', {
      planRunId: state.planRunId,
      proposalId: proposal.id,
      choice: choice,
      editedPayload: editedPayload
    }).then(function () {
      proposal.status = choice === 'accept' ? 'accepted' : choice === 'edit' ? 'edited' : 'rejected';
      card.dataset.status = proposal.status;
      card.querySelectorAll('button').forEach(function (button) { button.disabled = true; });
      toast(choice === 'accept' ? 'Proposta aceita localmente.' : choice === 'edit' ? 'Edição registrada localmente.' : 'Proposta rejeitada.');
    }).catch(reportError);
  }

  function updateSettings(data) {
    state.geminiKeyConfigured = !!(data.gemini && data.gemini.keyConfigured);
    state.geminiModel = (data.gemini && data.gemini.model) || state.geminiModel;
    byId('key-state').textContent = state.geminiKeyConfigured ? 'Chave protegida e pronta.' : 'Nenhuma chave salva.';
    byId('gemini-model').value = state.geminiModel;
    byId('notification-toggle').checked = !!(data.notification && data.notification.enabled);
  }

  function bootstrap() {
    if (state.refreshing) return;
    state.refreshing = true;
    bridgeRequest('app.bootstrap', {}, 30000).then(function (data) {
      renderHealth(data.health);
      renderSources(data.sources);
      updateSettings(data);
      renderSnapshot(data.snapshot);
    }).catch(function (error) {
      reportError(error);
      byId('health-short').textContent = 'Modo local indisponível';
      byId('health-message').textContent = 'Falha ao abrir os dados locais: ' + (error.message || error.code || 'erro desconhecido');
      byId('proposal-list').innerHTML = '<div class="skeleton-card">Não foi possível carregar o snapshot local.</div>';
    }).finally(function () { state.refreshing = false; });
  }

  function syncHealth() {
    var button = byId('sync-health');
    setBusy(button, true, 'Sincronizando…');
    if (state.health && state.health.state === 'PROVIDER_UPDATE_REQUIRED') {
      setBusy(button, false);
      openHealthSettings();
      return;
    }
    var needsPermission = state.health && state.health.state === 'PERMISSION_REQUIRED';
    var action = needsPermission ? bridgeRequest('health.requestPermissions', {}, 120000) : Promise.resolve();
    action.then(function () { return bridgeRequest('health.sync', {}, 60000); })
      .then(function (data) {
        renderHealth(data.health);
        renderSources(data.sources);
        renderSnapshot(data.snapshot);
        if (data.health.state === 'SYNCED' || data.health.state === 'NO_CHANGES') {
          toast('Health Connect, Evolução e NutriTrack atualizados.');
        }
      })
      .catch(reportError)
      .finally(function () { setBusy(button, false); });
  }

  function checkinPayload(form) {
    var soreness = {};
    form.querySelectorAll('[name^="soreness."]').forEach(function (select) {
      var region = select.name.slice('soreness.'.length);
      soreness[region] = select.value;
    });
    return {
      energy: Number(form.elements.energy.value),
      perceivedSleepQuality: Number(form.elements.sleepQuality.value),
      motivation: Number(form.elements.motivation.value),
      soreness: soreness,
      jointPainFlag: !!form.elements.jointPain.checked,
      note: form.elements.note.value.trim() || null
    };
  }

  function saveCheckin(event) {
    event.preventDefault();
    var button = byId('save-checkin');
    setBusy(button, true, 'Recalculando…');
    bridgeRequest('checkin.save', checkinPayload(event.currentTarget))
      .then(function (data) {
        renderSnapshot(data.snapshot);
        showTab('briefing');
        toast('Check-in salvo. Briefing recalculado.');
      }).catch(reportError)
      .finally(function () { setBusy(button, false); });
  }

  function saveGeminiKey() {
    var button = byId('save-key');
    var key = byId('gemini-key').value.trim();
    var model = byId('gemini-model').value.trim();
    setBusy(button, true, 'Protegendo…');
    bridgeRequest('gemini.saveKey', { apiKey: key, model: model })
      .then(function () {
        byId('gemini-key').value = '';
        state.geminiKeyConfigured = true;
        state.geminiModel = model;
        byId('key-state').textContent = 'Chave protegida e pronta.';
        toast('Chave salva com Android Keystore.');
      }).catch(reportError)
      .finally(function () { setBusy(button, false); });
  }

  function openHealthSettings() {
    bridgeRequest('health.openSettings', {}).catch(reportError);
  }

  function clearGeminiKey() {
    if (!window.confirm('Remover a chave Gemini protegida deste aparelho?')) return;
    bridgeRequest('gemini.clearKey', {}).then(function () {
      state.geminiKeyConfigured = false;
      byId('gemini-key').value = '';
      byId('key-state').textContent = 'Nenhuma chave salva.';
      toast('Chave Gemini removida.');
    }).catch(reportError);
  }

  function deleteLocalData() {
    bridgeRequest('privacy.deleteLocalData', { confirmation: 'DELETE' }, 90000).then(function () {
      window.location.reload();
    }).catch(reportError);
  }

  function geminiContext() {
    if (!state.snapshot || !state.plan || !state.planRunId) throw new Error('O plano local ainda não está pronto.');
    return {
      snapshotHash: state.snapshot.hash,
      planRunId: state.planRunId,
      model: state.geminiModel,
      snapshot: state.snapshot,
      localPlan: state.plan
    };
  }

  function openPayloadDialog(payload, allowSend) {
    byId('payload-preview').textContent = JSON.stringify(payload, null, 2);
    byId('confirm-gemini').classList.toggle('is-hidden', !allowSend);
    var dialog = byId('payload-dialog');
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function closePayloadDialog() {
    var dialog = byId('payload-dialog');
    if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
    state.pendingPreviewToken = null;
  }

  function previewPayload(allowSend) {
    var context;
    try { context = geminiContext(); }
    catch (error) { reportError(error); return; }
    bridgeRequest('gemini.preview', context).then(function (data) {
      state.pendingPreviewToken = allowSend ? data.previewToken : null;
      openPayloadDialog(data.payload, !!allowSend);
    }).catch(reportError);
  }

  function showPayload() {
    if (state.lastPayload) { state.pendingPreviewToken = null; openPayloadDialog(state.lastPayload, false); }
    else previewPayload(false);
  }

  function askGemini() {
    if (!state.geminiKeyConfigured) { showTab('settings'); toast('Salve uma chave Gemini primeiro.'); return; }
    previewPayload(true);
  }

  function submitGeminiReview() {
    var button = byId('ask-gemini');
    var context;
    try { context = geminiContext(); }
    catch (error) { reportError(error); return; }
    var previewToken = state.pendingPreviewToken;
    if (!previewToken) { reportError({ message: 'A confirmação expirou. Abra o preview novamente.' }); return; }
    closePayloadDialog();
    context.previewToken = previewToken;
    setBusy(button, true, 'Revisando…');
    byId('gemini-summary').textContent = 'O Gemini está revisando o plano; o briefing local continua válido.';
    bridgeRequest('gemini.review', context, 70000).then(function (data) {
      state.lastPayload = data.sentPayload;
      byId('show-payload').textContent = 'O que foi enviado';
      var opinion = data.opinion;
      var verdict = opinion.verdict === 'agree' ? 'Concorda' : opinion.verdict === 'adjust' ? 'Sugere ajuste' : 'Dados insuficientes';
      byId('gemini-summary').textContent = verdict + ' (' + Math.round(opinion.confidence * 100) + '%): ' + opinion.summary;
      renderGeminiDetails(opinion);
      toast('Segunda opinião validada e armazenada.');
    }).catch(function (error) {
      byId('gemini-summary').textContent = 'Revisão indisponível. O plano local permanece como referência.';
      reportError(error);
    }).finally(function () { setBusy(button, false); });
  }

  function renderGeminiDetails(opinion) {
    var root = byId('gemini-details');
    root.replaceChildren();
    var groups = [
      ['Observações', (opinion.observations || []).map(function (row) { return row.text; })],
      ['Pontos de atenção', opinion.concerns || []],
      ['Ajustes sugeridos (não aplicados)', (opinion.suggestedAdjustments || []).map(describeGeminiAdjustment)],
      ['Perguntas', opinion.questions || []]
    ];
    groups.forEach(function (group) {
      if (!group[1].length) return;
      var section = document.createElement('section');
      var title = document.createElement('h3');
      var list = document.createElement('ul');
      title.textContent = group[0];
      group[1].forEach(function (text) { var item = document.createElement('li'); item.textContent = text; list.appendChild(item); });
      section.append(title, list);
      root.appendChild(section);
    });
    root.hidden = !root.childElementCount;
  }

  function describeGeminiAdjustment(row) {
    var payload = row.payload || {};
    var change = ({
      maintain_plan: 'Manter o plano',
      increase_rir: '+' + Number(payload.rirDelta || 1) + ' RIR',
      reduce_set: Number(payload.setsDelta || -1) + ' série no exercício de maior fadiga',
      safety_hold: 'Evitar progressão agressiva'
    })[row.operation] || 'Ajuste consultivo';
    return change + ' — ' + row.reason;
  }

  function toggleNotification(event) {
    var enabled = event.currentTarget.checked;
    bridgeRequest('notification.schedule', { enabled: enabled })
      .then(function (data) { event.currentTarget.checked = !!data.enabled; toast(data.message); })
      .catch(function (error) { event.currentTarget.checked = !enabled; reportError(error); });
  }

  document.querySelectorAll('[data-tab]').forEach(function (tab) {
    tab.addEventListener('click', function () { showTab(tab.dataset.tab); });
  });
  byId('sync-health').addEventListener('click', syncHealth);
  byId('checkin-form').addEventListener('submit', saveCheckin);
  byId('save-key').addEventListener('click', saveGeminiKey);
  byId('clear-key').addEventListener('click', clearGeminiKey);
  byId('open-health-settings').addEventListener('click', openHealthSettings);
  byId('delete-local-data').addEventListener('click', deleteLocalData);
  byId('ask-gemini').addEventListener('click', askGemini);
  byId('confirm-gemini').addEventListener('click', submitGeminiReview);
  byId('show-payload').addEventListener('click', showPayload);
  byId('close-payload').addEventListener('click', closePayloadDialog);
  byId('notification-toggle').addEventListener('change', toggleNotification);
  byId('checkin-form').elements.note.addEventListener('input', function (event) {
    byId('note-counter').textContent = event.target.value.length + '/280';
  });

  window.CoachApp = Object.freeze({ refreshFromNative: bootstrap });
  bootstrap();
}());
