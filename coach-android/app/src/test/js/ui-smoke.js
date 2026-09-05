'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const chromeCandidates = [
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
if (!chromePath) throw new Error('Chrome/Edge headless não encontrado');

const root = path.resolve(__dirname, '../../../..');
const artifacts = path.join(root, 'artifacts', 'ui');
const profile = path.join(root, 'build', 'ui-chrome-profile-' + process.pid);
fs.mkdirSync(artifacts, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
const port = 9300 + (process.pid % 400);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-dev-shm-usage',
  '--hide-scrollbars', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  'about:blank'
], { windowsHide: true, stdio: 'ignore' });

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(700) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}
async function waitForDebugger() {
  let last;
  for (let i = 0; i < 50; i++) {
    if (chrome.exitCode !== null) throw new Error('Chrome headless encerrou antes de abrir o DevTools (código ' + chrome.exitCode + ')');
    try { return await json('http://127.0.0.1:' + port + '/json/list'); }
    catch (error) { last = error; await delay(200); }
  }
  throw last || new Error('Chrome DevTools não iniciou');
}

class Cdp {
  constructor(url) {
    this.next = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.socket = new WebSocket(url);
  }
  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
  }
  on(method, handler) {
    const rows = this.handlers.get(method) || [];
    rows.push(handler);
    this.handlers.set(method, rows);
  }
  send(method, params = {}) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  start() {
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const call = this.pending.get(message.id);
        if (!call) return;
        this.pending.delete(message.id);
        if (message.error) call.reject(new Error(message.error.message));
        else call.resolve(message.result || {});
      } else if (message.method) {
        (this.handlers.get(message.method) || []).forEach(fn => fn(message.params || {}));
      }
    });
  }
}

const mockBridge = String.raw`
(function () {
  var proposalStatuses = {};
  var snapshot = {
    contractVersion: 1, logicalDate: '2026-08-23', zoneId: 'America/Sao_Paulo',
    createdAtEpochMs: 100, isDemo: false, hash: '${'a'.repeat(64)}', checkIn: null,
    metrics: {
      'recovery.sleepMinutes': {key:'recovery.sleepMinutes',value:438,unit:'min',source:'HEALTH_CONNECT',sourceRecordId:'sleep-e1',observedAtEpochMs:1,status:'OBSERVED',confidence:1,contractVersion:1},
      'activity.steps': {key:'activity.steps',value:6240,unit:'count',source:'HEALTH_CONNECT',sourceRecordId:'steps-e1',observedAtEpochMs:1,status:'OBSERVED',confidence:1,contractVersion:1},
      'recovery.restingHeartRate': {key:'recovery.restingHeartRate',value:51,unit:'bpm',source:'HEALTH_CONNECT',sourceRecordId:'rhr-e1',observedAtEpochMs:1,status:'OBSERVED',confidence:1,contractVersion:1},
      'body.weightKg': {key:'body.weightKg',value:null,unit:'kg',source:'HEALTH_CONNECT',sourceRecordId:null,observedAtEpochMs:null,status:'ABSENT',confidence:0,contractVersion:1}
    }
  };
  function respond(request, data, error) {
    setTimeout(function () {
      window.CoachNative.receive(JSON.stringify({version:1,requestId:request.requestId,ok:!error,data:data||{},error:error||undefined}));
    }, 5);
  }
  window.CoachBridge = {
    request: function (operation, raw) {
      var request = JSON.parse(raw);
      if (operation === 'app.bootstrap') return respond(request, {
        snapshot: snapshot,
        health: {availability:'AVAILABLE',state:'SYNCED',observedKeys:['activity.steps','recovery.sleepMinutes','recovery.restingHeartRate'],requiredPermissionCount:4,missingPermissionCount:0,usedBoundedResync:false,lastSuccessEpochMs:100,message:null},
        gemini: {keyConfigured:false,model:'gemini-3.7-flash'}, notification:{enabled:false}
      });
      if (operation === 'plan.persist') {
        (request.data.output.proposals || []).forEach(function (proposal) {
          if (!proposalStatuses[proposal.id]) proposalStatuses[proposal.id] = 'pending';
        });
        return respond(request, {planRunId:'plan-ui-smoke',inserted:true,proposalStatuses:proposalStatuses});
      }
      if (operation === 'decision.save') {
        proposalStatuses[request.data.proposalId] = request.data.choice === 'accept' ? 'accepted' : request.data.choice === 'edit' ? 'edited' : 'rejected';
        return respond(request, {proposalId:request.data.proposalId,status:proposalStatuses[request.data.proposalId]});
      }
      if (operation === 'checkin.save') {
        snapshot = JSON.parse(JSON.stringify(snapshot));
        snapshot.hash = '${'b'.repeat(64)}';
        snapshot.checkIn = Object.assign({logicalDate:'2026-08-23',recordedAtEpochMs:2,source:'CHECK_IN',contractVersion:1}, request.data);
        return respond(request, {snapshot:snapshot});
      }
      if (operation === 'health.sync') return respond(request, {snapshot:snapshot,health:{availability:'AVAILABLE',state:'PERMISSION_REQUIRED',observedKeys:['activity.steps'],requiredPermissionCount:4,missingPermissionCount:3,message:'Dados autorizados sincronizados; faltam permissões para outros sinais.'}});
      if (operation === 'health.requestPermissions') return respond(request, {allGranted:false,missingPermissionCount:3});
      if (operation === 'gemini.preview') return respond(request, {payload:{schemaVersion:1,snapshotHash:snapshot.hash,redacted:true},previewToken:'p'.repeat(32),expiresAtEpochMs:Date.now()+120000});
      if (operation === 'gemini.review') return respond(request, {
        sentPayload:{schemaVersion:1,snapshotHash:snapshot.hash,redacted:true},
        opinion:{verdict:'adjust',summary:'O bloqueio conservador é coerente com os sinais informados.',observations:[{text:'O check-in contém um sinal de segurança.',evidenceIds:['checkin:2026-08-23']}],concerns:['Sem baseline pessoal.'],suggestedAdjustments:[{target:'today.training',operation:'safety_hold',payload:{intensity:'avoid_aggressive_progression'},reason:'Manter o bloqueio de progressão agressiva.',evidenceIds:['checkin:2026-08-23']}],questions:['Como foi o aquecimento?'],confidence:0.72}
      });
      if (operation === 'notification.schedule') return respond(request, {enabled:request.data.enabled,message:'Agendamento simulado.'});
      if (operation === 'gemini.saveKey') return respond(request, {keyConfigured:true,model:request.data.model});
      return respond(request, null, {code:'E_TEST',message:'Operação não simulada: '+operation});
    }
  };
}());`;

async function main() {
  const tabs = await waitForDebugger();
  const tab = tabs.find(item => item.type === 'page');
  if (!tab) throw new Error('Aba do Chrome não encontrada');
  const cdp = new Cdp(tab.webSocketDebuggerUrl);
  await cdp.open();
  cdp.start();
  const exceptions = [];
  cdp.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.text));
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Log.enable')]);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: mockBridge });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  const url = pathToFileURL(path.join(root, 'app', 'src', 'main', 'assets', 'www', 'index.html')).href;
  await cdp.send('Page.navigate', { url });
  await waitFor(cdp, "document.querySelectorAll('.proposal-card').length > 0 && document.getElementById('readiness-score').textContent !== '—'");

  const results = [];
  for (const width of [360, 412, 480]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 860, deviceScaleFactor: 1, mobile: true });
    await delay(80);
    const layout = await evaluate(cdp, `(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      visibleButtons: [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null).length,
      undersizedButtons: [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && (x.getBoundingClientRect().height < 48 || x.getBoundingClientRect().width < 48)).map(x => x.textContent.trim()),
      emptyButtonNames: [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && !(x.textContent.trim() || x.getAttribute('aria-label'))).length
    }))()`);
    results.push({ view: 'briefing', width, layout });
    await screenshot(cdp, path.join(artifacts, 'briefing-' + width + '.png'));
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await evaluate(cdp, "document.getElementById('tab-checkin').click()");
  await delay(80);
  const checkinLayout = await evaluate(cdp, `(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    selects: document.querySelectorAll('#soreness-list select').length,
    minSelectHeight: Math.min(...[...document.querySelectorAll('#soreness-list select')].map(x => x.getBoundingClientRect().height)),
    labels: document.querySelectorAll('#checkin-form label').length,
    undersizedButtons: [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && (x.getBoundingClientRect().height < 48 || x.getBoundingClientRect().width < 48)).map(x => x.textContent.trim()),
    emptyButtonNames: [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && !(x.textContent.trim() || x.getAttribute('aria-label'))).length
  }))()`);
  results.push({ view: 'checkin', width: 360, layout: checkinLayout });
  await screenshot(cdp, path.join(artifacts, 'checkin-360.png'));

  await evaluate(cdp, `(() => {
    document.querySelector('[name="jointPain"]').checked = true;
    document.querySelector('[name="energy"][value="2"]').checked = true;
    document.querySelector('[name="soreness.QUADS"]').value = 'SEVERE';
    document.querySelector('[name="note"]').value = 'Sinal preservado';
    document.getElementById('checkin-form').requestSubmit();
  })()`);
  await waitFor(cdp, "!document.getElementById('safety-card').classList.contains('is-hidden') && document.querySelector('.proposal-card')");
  const restoredCheckin = await evaluate(cdp, `(() => ({
    energy: document.querySelector('[name="energy"]:checked').value,
    jointPain: document.querySelector('[name="jointPain"]').checked,
    quads: document.querySelector('[name="soreness.QUADS"]').value,
    note: document.querySelector('[name="note"]').value
  }))()`);
  if (restoredCheckin.energy !== '2' || !restoredCheckin.jointPain || restoredCheckin.quads !== 'SEVERE' || restoredCheckin.note !== 'Sinal preservado') {
    throw new Error('check-in não foi reidratado integralmente');
  }
  await screenshot(cdp, path.join(artifacts, 'briefing-safety-360.png'));
  await delay(30);
  await evaluate(cdp, "document.querySelector('.proposal-card .button.secondary').click()");
  await waitFor(cdp, "document.querySelector('.proposal-card').dataset.status === 'accepted'");
  await evaluate(cdp, "window.CoachApp.refreshFromNative()");
  await waitFor(cdp, "document.querySelector('.proposal-card').dataset.status === 'accepted' && [...document.querySelectorAll('.proposal-card button')].every(x => x.disabled)");

  await evaluate(cdp, "document.getElementById('tab-settings').click()");
  await delay(80);
  const settingsFocus = await evaluate(cdp, "document.activeElement.id");
  if (settingsFocus !== 'view-settings') throw new Error('troca de aba não moveu o foco para o painel');
  await screenshot(cdp, path.join(artifacts, 'settings-360.png'));
  const settingsLayout = await evaluate(cdp, `(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    undersizedButtons: [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && (x.getBoundingClientRect().height < 48 || x.getBoundingClientRect().width < 48)).map(x => x.textContent.trim()),
    emptyButtonNames: [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && !(x.textContent.trim() || x.getAttribute('aria-label'))).length
  }))()`);
  results.push({ view: 'settings', width: 360, layout: settingsLayout });

  await evaluate(cdp, `(() => {
    document.getElementById('gemini-key').value = 'test-key-012345678901234567890123';
    document.getElementById('save-key').click();
  })()`);
  await waitFor(cdp, "document.getElementById('key-state').textContent.includes('protegida')");
  await evaluate(cdp, "document.getElementById('tab-briefing').click(); document.getElementById('ask-gemini').click()");
  await waitFor(cdp, "document.getElementById('payload-dialog').open && !document.getElementById('confirm-gemini').classList.contains('is-hidden')");
  const payloadCheck = await evaluate(cdp, `(() => ({
    hasKey: document.getElementById('payload-preview').textContent.includes('test-key'),
    canConfirm: !document.getElementById('confirm-gemini').classList.contains('is-hidden')
  }))()`);
  if (payloadCheck.hasKey || !payloadCheck.canConfirm) throw new Error('preview Gemini inseguro');
  await screenshot(cdp, path.join(artifacts, 'gemini-preview-360.png'));
  await evaluate(cdp, "document.getElementById('confirm-gemini').click()");
  await waitFor(cdp, "document.getElementById('show-payload').textContent === 'O que foi enviado' && !document.getElementById('gemini-details').hidden");
  const geminiAdjustment = await evaluate(cdp, "document.getElementById('gemini-details').textContent");
  if (!geminiAdjustment.includes('Evitar progressão agressiva')) throw new Error('ajuste Gemini não foi apresentado de forma acionável');
  await screenshot(cdp, path.join(artifacts, 'gemini-result-360.png'));

  await evaluate(cdp, "document.getElementById('sync-health').click()");
  await waitFor(cdp, "document.getElementById('health-short').textContent === 'Acesso parcial'");
  const partialHealth = await evaluate(cdp, `(() => ({
    action: document.getElementById('sync-health').textContent,
    message: document.getElementById('health-message').textContent
  }))()`);
  if (partialHealth.action !== 'Completar acesso' || !partialHealth.message.includes('faltam permissões')) {
    throw new Error('estado de acesso parcial do Health Connect não está claro');
  }

  for (const row of results) {
    if (row.layout.scrollWidth && row.layout.scrollWidth > row.layout.width) throw new Error('overflow horizontal em ' + row.width);
    if (row.layout.undersizedButtons && row.layout.undersizedButtons.length) throw new Error('botões pequenos: ' + row.layout.undersizedButtons.join(', '));
    if (row.layout.emptyButtonNames) throw new Error('botão sem nome acessível');
    if (row.layout.overflow) throw new Error('overflow horizontal no check-in');
    if (row.layout.selects && row.layout.selects !== 9) throw new Error('check-in sem 9 regiões');
    if (row.layout.minSelectHeight && row.layout.minSelectHeight < 48) throw new Error('select abaixo de 48px');
  }
  if (exceptions.length) throw new Error('exceções JS: ' + exceptions.join(' | '));
  console.log(JSON.stringify({ ok: true, screenshots: 8, checks: results }, null, 2));
  await cdp.send('Browser.close');
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(cdp, expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(cdp, 'Boolean(' + expression + ')')) return;
    await delay(50);
  }
  throw new Error('timeout aguardando: ' + expression);
}
async function screenshot(cdp, target) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true });
  fs.writeFileSync(target, Buffer.from(result.data, 'base64'));
}

const keepAlive = setInterval(function () {}, 1000);
main().catch(error => {
  console.error(error.stack || error);
  chrome.kill();
  process.exitCode = 1;
}).finally(() => {
  clearInterval(keepAlive);
  setTimeout(() => { if (!chrome.killed) chrome.kill(); }, 1200);
});
