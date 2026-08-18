/* apps/evolucao/views/ble-diag.js */
/* ==========================================================================
   DIAGNÓSTICO BLE — Ferramenta de Captura e Inspeção de Advertisements BLE
   Captura de alta fidelidade dos pacotes brutos emitidos pela balança Davely.
   ========================================================================== */

(function() {
  'use strict';

  var MAX_SESSION_PACKETS = 5000;
  var DEFAULT_PAGE_SIZE = 30;

  var state = {
    isScanning: false,
    statusMsg: 'Scanner parado',
    errorMsg: null,
    isSupported: true,
    isEnabled: true,
    hasPermissions: true,
    sessionStartedAt: null,
    sessionEndedAt: null,
    totalPacketsCount: 0,
    maxPacketsReached: false,
    devices: {}, // mac -> device object
    deviceOrder: [], // array de macs
    expandedDevices: {}, // mac -> boolean
    pageSizes: {}, // mac -> number
    filterQuery: '',
    isOpen: false,
    lastRenderTime: 0,
    renderTimer: null
  };

  function updateDiagnosticInfoFromNative() {
    if (typeof window !== 'undefined' && window.AndroidBridge && window.AndroidBridge.getBleDiagnosticState) {
      try {
        var raw = window.AndroidBridge.getBleDiagnosticState();
        if (raw) {
          var info = JSON.parse(raw);
          if (info.isSupported !== undefined) state.isSupported = !!info.isSupported;
          if (info.isEnabled !== undefined) state.isEnabled = !!info.isEnabled;
          if (info.hasPermissions !== undefined) state.hasPermissions = !!info.hasPermissions;
          if (info.isScanning !== undefined) state.isScanning = !!info.isScanning;
        }
      } catch (e) {}
    }
  }

  // Registra os callbacks nativos no escopo global
  window.onBleScanStateChanged = function(data) {
    if (!data) return;
    state.isScanning = !!data.scanning;
    state.statusMsg = data.message || (state.isScanning ? 'Scanner ativo' : 'Scanner parado');
    if (state.isScanning) {
      state.errorMsg = null;
      if (!state.sessionStartedAt) {
        state.sessionStartedAt = new Date().toISOString();
        state.sessionEndedAt = null;
      }
    } else {
      if (state.sessionStartedAt && !state.sessionEndedAt) {
        state.sessionEndedAt = new Date().toISOString();
      }
    }
    scheduleRender();
  };

  window.onBleScanError = function(data) {
    if (!data) return;
    state.errorMsg = (data.message || 'Erro no scanner') + (data.code ? ' (' + data.code + ')' : '');
    state.statusMsg = 'Erro: ' + state.errorMsg;
    state.isScanning = false;
    if (typeof toast === 'function') {
      toast('BLE: ' + (data.message || 'Erro'));
    }
    scheduleRender();
  };

  window.onBleAdvertisementsBatch = function(batch) {
    if (!batch || !Array.isArray(batch)) return;
    for (var i = 0; i < batch.length; i++) {
      processSingleAdvertisement(batch[i]);
    }
    scheduleRender();
  };

  window.onBleAdvertisement = function(packet) {
    if (!packet) return;
    processSingleAdvertisement(packet);
    scheduleRender();
  };

  function processSingleAdvertisement(packet) {
    if (!packet) return;

    if (state.totalPacketsCount >= MAX_SESSION_PACKETS) {
      if (!state.maxPacketsReached) {
        state.maxPacketsReached = true;
        if (window.AndroidBridge && window.AndroidBridge.stopBleScan) {
          window.AndroidBridge.stopBleScan();
        }
        if (typeof toast === 'function') {
          toast('Limite de 5.000 pacotes atingido na sessão!');
        }
      }
      return;
    }

    state.totalPacketsCount++;
    packet._seq = state.totalPacketsCount;

    var addr = packet.address || '00:00:00:00:00:00';
    if (!state.devices[addr]) {
      state.devices[addr] = {
        address: addr,
        deviceName: packet.deviceName || null,
        advertisedName: packet.advertisedName || null,
        firstSeen: packet.receivedAt || new Date().toISOString(),
        lastSeen: packet.receivedAt || new Date().toISOString(),
        latestRssi: packet.rssi,
        packetCount: 0,
        packets: [],
        serviceUuids: {},
        manufacturerIds: {},
        latestRawHex: packet.rawHex || ''
      };
      state.deviceOrder.push(addr);
    }

    var dev = state.devices[addr];
    dev.lastSeen = packet.receivedAt || new Date().toISOString();
    dev.latestRssi = packet.rssi;
    dev.latestRawHex = packet.rawHex || '';

    if (!dev.deviceName && packet.deviceName) dev.deviceName = packet.deviceName;
    if (!dev.advertisedName && packet.advertisedName) dev.advertisedName = packet.advertisedName;

    dev.packets.push(packet);
    dev.packetCount++;

    if (Array.isArray(packet.serviceUuids)) {
      packet.serviceUuids.forEach(function(u) {
        if (u) dev.serviceUuids[u] = true;
      });
    }

    if (Array.isArray(packet.manufacturerData)) {
      packet.manufacturerData.forEach(function(m) {
        var key = m.idHex || ('0x' + Number(m.id || 0).toString(16).toUpperCase());
        dev.manufacturerIds[key] = (m.dataHex || '');
      });
    }
  }

  function scheduleRender() {
    if (!state.isOpen) return;
    var now = Date.now();
    if (now - state.lastRenderTime > 150) {
      state.lastRenderTime = now;
      renderBleDiagContent();
    } else if (!state.renderTimer) {
      state.renderTimer = setTimeout(function() {
        state.renderTimer = null;
        state.lastRenderTime = Date.now();
        renderBleDiagContent();
      }, 150);
    }
  }

  // =========================================================================
  // EXPORTAÇÃO (TEXTO FORMATADO E JSON)
  // =========================================================================

  function buildTextReport() {
    var lines = [];
    lines.push('================================================================================');
    lines.push('EVOLUÇÃO — RELATÓRIO DE DIAGNÓSTICO BLE');
    lines.push('================================================================================');
    lines.push('Data do relatório: ' + new Date().toISOString());
    lines.push('Início da sessão:  ' + (state.sessionStartedAt || 'Não iniciado'));
    lines.push('Fim da sessão:     ' + (state.sessionEndedAt || (state.isScanning ? 'Em andamento' : 'Encerrada')));
    lines.push('Total de disp.:    ' + state.deviceOrder.length);
    lines.push('Total de pacotes:  ' + state.totalPacketsCount);
    lines.push('================================================================================\n');

    state.deviceOrder.forEach(function(addr, dIdx) {
      var dev = state.devices[addr];
      if (!dev) return;

      var titleName = dev.deviceName || dev.advertisedName || '(Dispositivo sem nome)';
      lines.push('================================================================================');
      lines.push('DISPOSITIVO #' + (dIdx + 1) + ': ' + titleName);
      lines.push('Endereço (MAC):   ' + dev.address);
      lines.push('Nome Dispositivo: ' + (dev.deviceName || '(não informado)'));
      lines.push('Nome Anunciado:   ' + (dev.advertisedName || '(não informado)'));
      lines.push('Último RSSI:      ' + dev.latestRssi + ' dBm');
      lines.push('Total de Pacotes: ' + dev.packets.length);
      lines.push('Primeiro Visto:   ' + dev.firstSeen);
      lines.push('Último Visto:     ' + dev.lastSeen);

      var uuids = Object.keys(dev.serviceUuids);
      if (uuids.length) {
        lines.push('Service UUIDs identificados:');
        uuids.forEach(function(u) { lines.push('  - ' + u); });
      }

      var mfgs = Object.keys(dev.manufacturerIds);
      if (mfgs.length) {
        lines.push('Manufacturer Data identificados:');
        mfgs.forEach(function(m) { lines.push('  - ' + m + ' -> ' + dev.manufacturerIds[m]); });
      }
      lines.push('================================================================================\n');

      dev.packets.forEach(function(pkt, pIdx) {
        lines.push('--------------------------------------------------------------------------------');
        lines.push('PACOTE #' + (pIdx + 1) + ' (Seq Global #' + (pkt._seq || (pIdx + 1)) + ')');
        lines.push('--------------------------------------------------------------------------------');
        lines.push('Recebido em (ISO):     ' + (pkt.receivedAt || ''));
        lines.push('Recebido em (Epoch ms): ' + (pkt.receivedAtEpochMs || ''));
        lines.push('Timestamp Nanos:       ' + (pkt.timestampNanos !== undefined ? pkt.timestampNanos : ''));
        lines.push('RSSI:                  ' + (pkt.rssi !== undefined ? pkt.rssi + ' dBm' : ''));
        lines.push('Nome Anunciado:        ' + (pkt.advertisedName || dev.advertisedName || ''));
        lines.push('Conectável:            ' + (pkt.isConnectable !== null && pkt.isConnectable !== undefined ? pkt.isConnectable : 'n/d'));
        lines.push('TX Power:              ' + (pkt.txPower !== null && pkt.txPower !== undefined ? pkt.txPower : 'n/d'));
        lines.push('Status dos Dados:      ' + (pkt.dataStatus || 'n/d'));
        lines.push('PHY Primário/Sec:      ' + (pkt.primaryPhy !== null ? pkt.primaryPhy : 'n/d') + ' / ' + (pkt.secondaryPhy !== null ? pkt.secondaryPhy : 'n/d'));
        lines.push('Adv SID / Interval:    ' + (pkt.advertisingSid !== null ? pkt.advertisingSid : 'n/d') + ' / ' + (pkt.periodicAdvertisingInterval || 0));

        if (Array.isArray(pkt.serviceUuids) && pkt.serviceUuids.length) {
          lines.push('Service UUIDs:');
          pkt.serviceUuids.forEach(function(u) { lines.push('  * ' + u); });
        }

        if (Array.isArray(pkt.manufacturerData) && pkt.manufacturerData.length) {
          lines.push('Manufacturer Data:');
          pkt.manufacturerData.forEach(function(m) {
            lines.push('  * ID: ' + (m.idHex || m.id) + ' (Dec: ' + m.id + ') | Bytes: ' + (m.dataHex || ''));
          });
        }

        if (Array.isArray(pkt.serviceData) && pkt.serviceData.length) {
          lines.push('Service Data:');
          pkt.serviceData.forEach(function(s) {
            lines.push('  * UUID: ' + s.uuid + ' | Bytes: ' + (s.dataHex || ''));
          });
        }

        lines.push('RAW HEX:');
        lines.push(pkt.rawHex || '(vazio)');
        lines.push('RAW HEX (Sem espaços):');
        lines.push(pkt.rawHexNoSpaces || '(vazio)');
        lines.push('');
      });
      lines.push('\n');
    });

    return lines.join('\n');
  }

  function buildJsonReport() {
    var report = {
      metadata: {
        app: 'Evolução Treino',
        module: 'Diagnóstico BLE Davely',
        exportedAt: new Date().toISOString(),
        sessionStartedAt: state.sessionStartedAt,
        sessionEndedAt: state.sessionEndedAt,
        totalDevices: state.deviceOrder.length,
        totalPackets: state.totalPacketsCount
      },
      devices: state.deviceOrder.map(function(addr) {
        var dev = state.devices[addr];
        return {
          address: dev.address,
          deviceName: dev.deviceName,
          advertisedName: dev.advertisedName,
          firstSeen: dev.firstSeen,
          lastSeen: dev.lastSeen,
          latestRssi: dev.latestRssi,
          packetCount: dev.packets.length,
          serviceUuids: Object.keys(dev.serviceUuids),
          manufacturerSummary: dev.manufacturerIds,
          packets: dev.packets
        };
      })
    };
    return JSON.stringify(report, null, 2);
  }

  function copyTextToClipboard(text, label) {
    if (!text) {
      if (typeof toast === 'function') toast('Nenhum dado capturado ainda');
      return;
    }
    if (window.AndroidBridge && window.AndroidBridge.copyToClipboard) {
      window.AndroidBridge.copyToClipboard(text);
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        if (typeof toast === 'function') toast((label || 'Diagnóstico') + ' copiado ✓');
      }).catch(function() {
        fallbackCopy(text, label);
      });
    } else {
      fallbackCopy(text, label);
    }
  }

  function fallbackCopy(text, label) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0.01';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (typeof toast === 'function') toast((label || 'Diagnóstico') + ' copiado ✓');
    } catch (e) {
      if (typeof toast === 'function') toast('Selecione e copie o texto manualmente');
    }
  }

  function saveReportFile(content, extension, mimeType) {
    if (!content) {
      if (typeof toast === 'function') toast('Nenhum dado capturado para salvar');
      return;
    }
    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
    var filename = 'ble-davely-diag-' + stamp + '.' + extension;

    if (window.AndroidBridge && window.AndroidBridge.saveBleDiagnosticFile) {
      window.AndroidBridge.saveBleDiagnosticFile(content, filename, mimeType);
      return;
    }
    if (window.AndroidBridge && window.AndroidBridge.saveBackup) {
      window.AndroidBridge.saveBackup(content, filename);
      return;
    }

    try {
      var blob = new Blob([content], { type: mimeType });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (typeof toast === 'function') toast('Arquivo baixado: ' + filename);
    } catch (e) {
      copyTextToClipboard(content, 'Texto do arquivo');
    }
  }

  // =========================================================================
  // INTERFACE DE USUÁRIO (HTML & RENDER)
  // =========================================================================

  function renderBleDiagContent() {
    var modalBody = document.getElementById('bleDiagBody');
    if (!modalBody) return;

    var filter = state.filterQuery.trim().toLowerCase();
    var filteredAddrs = state.deviceOrder.filter(function(addr) {
      if (!filter) return true;
      var dev = state.devices[addr];
      if (!dev) return false;
      var name = (dev.deviceName || dev.advertisedName || '').toLowerCase();
      var mac = dev.address.toLowerCase();
      return name.indexOf(filter) >= 0 || mac.indexOf(filter) >= 0;
    });

    var h = '';

    // 1. Painel de Status
    var btStatusCls = state.isEnabled ? 'ble-badge-ok' : (state.isSupported ? 'ble-badge-warn' : 'ble-badge-err');
    var btStatusTxt = state.isEnabled ? 'Ativado' : (state.isSupported ? 'Desligado' : 'Não suportado');

    var permStatusCls = state.hasPermissions ? 'ble-badge-ok' : 'ble-badge-warn';
    var permStatusTxt = state.hasPermissions ? 'Concedida' : 'Pendente';

    var scanStatusCls = state.isScanning ? 'ble-badge-scanning' : 'ble-badge-idle';
    var scanStatusTxt = state.isScanning ? 'Escaneando...' : 'Parado';

    h += '<div class="card" style="margin-bottom:12px;padding:12px 14px">';
    h += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
    h += '    <div style="font-weight:700;font-size:14px;letter-spacing:-0.02em">Status do Sistema BLE</div>';
    h += '    <button class="rpill" id="bleBtnCheckState" style="padding:4px 8px;font-size:11px">Atualizar</button>';
    h += '  </div>';

    h += '  <div class="ble-status-grid">';
    h += '    <div class="ble-status-item"><small>Bluetooth</small><span class="ble-badge ' + btStatusCls + '">' + btStatusTxt + '</span></div>';
    h += '    <div class="ble-status-item"><small>Permissão</small><span class="ble-badge ' + permStatusCls + '">' + permStatusTxt + '</span></div>';
    h += '    <div class="ble-status-item"><small>Scanner</small><span class="ble-badge ' + scanStatusCls + '">' + scanStatusTxt + '</span></div>';
    h += '  </div>';

    if (state.errorMsg) {
      h += '  <div class="ble-error-banner">' + escapeHtml(state.errorMsg) + '</div>';
    }

    h += '</div>';

    // 2. Controles de Escaneamento
    h += '<div class="card" style="margin-bottom:12px;padding:12px 14px">';
    h += '  <div style="display:flex;gap:8px;margin-bottom:10px">';
    if (!state.isScanning) {
      h += '    <button class="cta" id="bleBtnStart" style="flex:1;background:var(--ok);color:#09090b">▶ Iniciar scanner</button>';
    } else {
      h += '    <button class="cta" id="bleBtnStop" style="flex:1;background:var(--danger);color:#ffffff">⏹ Parar scanner</button>';
    }
    h += '    <button class="ghost" id="bleBtnClear" style="flex:0 0 auto;padding:10px 14px">🧹 Limpar</button>';
    h += '  </div>';

    h += '  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px">';
    h += '    <button class="rpill" id="bleBtnCopyText" style="justify-content:center">📋 Copiar Texto</button>';
    h += '    <button class="rpill" id="bleBtnCopyJson" style="justify-content:center">📋 Copiar JSON</button>';
    h += '    <button class="rpill" id="bleBtnSaveTxt" style="justify-content:center">💾 Salvar .txt</button>';
    h += '    <button class="rpill" id="bleBtnSaveJson" style="justify-content:center">💾 Salvar .json</button>';
    h += '  </div>';

    h += '  <div class="ble-stat-bar">';
    h += '    <div>Dispositivos: <b>' + state.deviceOrder.length + '</b></div>';
    h += '    <div>Pacotes: <b>' + state.totalPacketsCount + '</b> / ' + MAX_SESSION_PACKETS + '</div>';
    h += '  </div>';
    h += '</div>';

    // 3. Campo de Filtro Rápido
    h += '<div style="margin-bottom:10px">';
    h += '  <input type="text" id="bleFilterInput" class="txt" placeholder="Filtrar por nome ou MAC..." value="' + escapeHtml(state.filterQuery) + '" style="width:100%">';
    h += '</div>';

    // 4. Lista de Dispositivos
    if (state.deviceOrder.length === 0) {
      h += '<div class="empty" style="padding:28px 16px">';
      h += '  <svg viewBox="0 0 24 24"><path d="M2 12h2M20 12h2M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="4"/></svg>';
      h += '  <div class="t">Nenhum broadcast recebido</div>';
      h += '  <div class="s">Toque em <b>Iniciar scanner</b> e suba na balança Davely para capturar os pacotes BLE transmitidos em tempo real.</div>';
      h += '</div>';
    } else if (filteredAddrs.length === 0) {
      h += '<div class="empty" style="padding:20px 16px">';
      h += '  <div class="t">Nenhum resultado para o filtro</div>';
      h += '  <div class="s">Nenhum dos ' + state.deviceOrder.length + ' dispositivos encontrados coincide com "' + escapeHtml(state.filterQuery) + '".</div>';
      h += '</div>';
    } else {
      filteredAddrs.forEach(function(addr) {
        var dev = state.devices[addr];
        if (!dev) return;

        var isExpanded = !!state.expandedDevices[addr];
        var devTitle = dev.deviceName || dev.advertisedName || '(Dispositivo sem nome)';
        var pageSize = state.pageSizes[addr] || DEFAULT_PAGE_SIZE;

        h += '<div class="card ble-device-card" style="margin-bottom:10px">';
        h += '  <div class="ble-dev-header">';
        h += '    <div style="flex:1;min-width:0">';
        h += '      <div class="ble-dev-title">' + escapeHtml(devTitle) + '</div>';
        h += '      <div class="ble-dev-mac">' + escapeHtml(dev.address) + '</div>';
        h += '    </div>';
        h += '    <div style="text-align:right">';
        h += '      <div class="ble-rssi-badge">' + (dev.latestRssi || 0) + ' dBm</div>';
        h += '      <small style="color:var(--txt3);font-size:11px">' + dev.packets.length + ' pct' + (dev.packets.length === 1 ? '' : 's') + '</small>';
        h += '    </div>';
        h += '  </div>';

        // Resumo de metadados
        var uuids = Object.keys(dev.serviceUuids);
        if (uuids.length) {
          h += '  <div class="ble-tags-row">';
          uuids.forEach(function(u) {
            h += '    <span class="ble-tag-pill">UUID: ' + escapeHtml(u) + '</span>';
          });
          h += '  </div>';
        }

        var mfgKeys = Object.keys(dev.manufacturerIds);
        if (mfgKeys.length) {
          h += '  <div class="ble-tags-row">';
          mfgKeys.forEach(function(m) {
            h += '    <span class="ble-tag-pill mfg">Mfg ' + escapeHtml(m) + '</span>';
          });
          h += '  </div>';
        }

        if (dev.latestRawHex) {
          h += '  <div class="ble-hex-preview">';
          h += '    <div class="ble-hex-lbl">Último pacote:</div>';
          h += '    <code>' + escapeHtml(dev.latestRawHex.slice(0, 70)) + (dev.latestRawHex.length > 70 ? '...' : '') + '</code>';
          h += '  </div>';
        }

        // Botão de expandir histórico
        h += '  <div style="margin-top:8px">';
        h += '    <button class="rpill ble-expand-btn" data-mac="' + escapeHtml(dev.address) + '" style="width:100%;justify-content:center">';
        h += isExpanded ? '▲ Ocultar pacotes (' + dev.packets.length + ')' : '▼ Ver pacotes recebidos (' + dev.packets.length + ')';
        h += '    </button>';
        h += '  </div>';

        // Histórico de pacotes (com paginação/janela para não sobrecarregar a DOM)
        if (isExpanded) {
          h += '  <div class="ble-packets-container">';
          var totalPackets = dev.packets.length;
          var visiblePackets = dev.packets.slice(-pageSize);

          h += '    <div class="ble-packets-window-info">';
          h += '      Exibindo os últimos ' + visiblePackets.length + ' de ' + totalPackets + ' pacotes recebidos.';
          h += '    </div>';

          visiblePackets.forEach(function(pkt, idx) {
            var actualIdx = totalPackets - visiblePackets.length + idx + 1;
            h += '    <div class="ble-packet-row">';
            h += '      <div class="ble-packet-header">';
            h += '        <span class="ble-seq-badge">#' + actualIdx + ' (Seq #' + (pkt._seq || actualIdx) + ')</span>';
            h += '        <span class="ble-pkt-time">' + (pkt.receivedAt ? pkt.receivedAt.split('T')[1].replace('Z', '') : '') + '</span>';
            h += '        <span class="ble-pkt-rssi">' + pkt.rssi + ' dBm</span>';
            h += '        <button class="rpill ble-copy-hex-btn" data-hex="' + escapeHtml(pkt.rawHex || '') + '" style="padding:2px 6px;font-size:10px;margin-left:auto">Copiar HEX</button>';
            h += '      </div>';

            if (pkt.dataStatus || pkt.isConnectable !== null) {
              h += '      <div class="ble-pkt-submeta">';
              if (pkt.dataStatus) h += '<span>Status: ' + escapeHtml(pkt.dataStatus) + '</span>';
              if (pkt.isConnectable !== null && pkt.isConnectable !== undefined) h += '<span>Conectável: ' + pkt.isConnectable + '</span>';
              if (pkt.txPower !== null && pkt.txPower !== undefined) h += '<span>TX: ' + pkt.txPower + '</span>';
              h += '      </div>';
            }

            if (Array.isArray(pkt.manufacturerData) && pkt.manufacturerData.length) {
              h += '      <div class="ble-pkt-detail">';
              pkt.manufacturerData.forEach(function(m) {
                h += '        <div><b>Mfg ID:</b> ' + escapeHtml(m.idHex || m.id) + ' (Dec ' + m.id + ') → <code>' + escapeHtml(m.dataHex || '') + '</code></div>';
              });
              h += '      </div>';
            }

            if (Array.isArray(pkt.serviceData) && pkt.serviceData.length) {
              h += '      <div class="ble-pkt-detail">';
              pkt.serviceData.forEach(function(s) {
                h += '        <div><b>Service Data:</b> ' + escapeHtml(s.uuid) + ' → <code>' + escapeHtml(s.dataHex || '') + '</code></div>';
              });
              h += '      </div>';
            }

            h += '      <div class="ble-pkt-rawhex"><code>' + escapeHtml(pkt.rawHex || '(sem bytes)') + '</code></div>';
            h += '    </div>';
          });

          if (pageSize < totalPackets) {
            h += '    <div style="display:flex;gap:8px;margin-top:8px">';
            h += '      <button class="rpill ble-load-more-btn" data-mac="' + escapeHtml(dev.address) + '" data-add="50" style="flex:1;justify-content:center">+50 anteriores</button>';
            h += '      <button class="rpill ble-load-more-btn" data-mac="' + escapeHtml(dev.address) + '" data-add="5000" style="flex:1;justify-content:center">Exibir todos</button>';
            h += '    </div>';
          }

          h += '  </div>';
        }

        h += '</div>';
      });
    }

    modalBody.innerHTML = h;
    bindBleDiagEvents();
  }

  function bindBleDiagEvents() {
    var btnStart = document.getElementById('bleBtnStart');
    if (btnStart) {
      btnStart.onclick = function() {
        updateDiagnosticInfoFromNative();
        if (window.AndroidBridge && window.AndroidBridge.startBleScan) {
          window.AndroidBridge.startBleScan();
        } else {
          if (typeof toast === 'function') toast('Bridge Android não disponível nesta plataforma');
        }
      };
    }

    var btnStop = document.getElementById('bleBtnStop');
    if (btnStop) {
      btnStop.onclick = function() {
        if (window.AndroidBridge && window.AndroidBridge.stopBleScan) {
          window.AndroidBridge.stopBleScan();
        }
      };
    }

    var btnClear = document.getElementById('bleBtnClear');
    if (btnClear) {
      btnClear.onclick = function() {
        state.devices = {};
        state.deviceOrder = [];
        state.totalPacketsCount = 0;
        state.maxPacketsReached = false;
        state.sessionStartedAt = state.isScanning ? new Date().toISOString() : null;
        state.sessionEndedAt = null;
        state.errorMsg = null;
        if (typeof toast === 'function') toast('Sessão limpa');
        renderBleDiagContent();
      };
    }

    var btnCheck = document.getElementById('bleBtnCheckState');
    if (btnCheck) {
      btnCheck.onclick = function() {
        updateDiagnosticInfoFromNative();
        renderBleDiagContent();
        if (typeof toast === 'function') toast('Estado verificado');
      };
    }

    var btnCopyTxt = document.getElementById('bleBtnCopyText');
    if (btnCopyTxt) {
      btnCopyTxt.onclick = function() {
        copyTextToClipboard(buildTextReport(), 'Relatório formatado');
      };
    }

    var btnCopyJson = document.getElementById('bleBtnCopyJson');
    if (btnCopyJson) {
      btnCopyJson.onclick = function() {
        copyTextToClipboard(buildJsonReport(), 'JSON completo');
      };
    }

    var btnSaveTxt = document.getElementById('bleBtnSaveTxt');
    if (btnSaveTxt) {
      btnSaveTxt.onclick = function() {
        saveReportFile(buildTextReport(), 'txt', 'text/plain');
      };
    }

    var btnSaveJson = document.getElementById('bleBtnSaveJson');
    if (btnSaveJson) {
      btnSaveJson.onclick = function() {
        saveReportFile(buildJsonReport(), 'json', 'application/json');
      };
    }

    var filterInput = document.getElementById('bleFilterInput');
    if (filterInput) {
      filterInput.oninput = function(e) {
        state.filterQuery = e.target.value;
        renderBleDiagContent();
      };
    }

    document.querySelectorAll('.ble-expand-btn').forEach(function(btn) {
      btn.onclick = function() {
        var mac = btn.getAttribute('data-mac');
        if (!mac) return;
        state.expandedDevices[mac] = !state.expandedDevices[mac];
        renderBleDiagContent();
      };
    });

    document.querySelectorAll('.ble-load-more-btn').forEach(function(btn) {
      btn.onclick = function() {
        var mac = btn.getAttribute('data-mac');
        var add = parseInt(btn.getAttribute('data-add'), 10) || 50;
        if (!mac) return;
        state.pageSizes[mac] = (state.pageSizes[mac] || DEFAULT_PAGE_SIZE) + add;
        renderBleDiagContent();
      };
    });

    document.querySelectorAll('.ble-copy-hex-btn').forEach(function(btn) {
      btn.onclick = function() {
        var hex = btn.getAttribute('data-hex');
        copyTextToClipboard(hex, 'RAW HEX');
      };
    });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // =========================================================================
  // ABERTURA E FECHAMENTO DO MODAL DE DIAGNÓSTICO
  // =========================================================================

  function openBleDiag() {
    state.isOpen = true;
    updateDiagnosticInfoFromNative();

    var existingModal = document.getElementById('bleDiagModal');
    if (!existingModal) {
      var modalHtml = '<div id="bleDiagModal" class="ble-diag-modal-wrapper">' +
        '  <div class="ble-diag-modal-content">' +
        '    <div class="ble-diag-modal-head">' +
        '      <div class="ble-diag-title">🔬 Diagnóstico BLE Davely</div>' +
        '      <button id="bleDiagCloseBtn" class="rx" type="button">✕</button>' +
        '    </div>' +
        '    <div id="bleDiagBody" class="ble-diag-modal-body"></div>' +
        '  </div>' +
        '</div>';
      document.body.insertAdjacentHTML('beforeend', modalHtml);

      var closeBtn = document.getElementById('bleDiagCloseBtn');
      if (closeBtn) {
        closeBtn.onclick = closeBleDiag;
      }
    } else {
      existingModal.style.display = 'flex';
    }

    renderBleDiagContent();
  }

  function closeBleDiag() {
    state.isOpen = false;
    var modal = document.getElementById('bleDiagModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // Exporta métodos públicos no namespace BleDiag
  window.BleDiag = {
    open: openBleDiag,
    close: closeBleDiag,
    getState: function() { return state; },
    getTextReport: buildTextReport,
    getJsonReport: buildJsonReport,
    startScan: function() {
      if (window.AndroidBridge && window.AndroidBridge.startBleScan) window.AndroidBridge.startBleScan();
    },
    stopScan: function() {
      if (window.AndroidBridge && window.AndroidBridge.stopBleScan) window.AndroidBridge.stopBleScan();
    }
  };

  // Inicializa verificação de estado nativo quando carregado
  if (typeof window !== 'undefined') {
    setTimeout(updateDiagnosticInfoFromNative, 500);
  }
})();
