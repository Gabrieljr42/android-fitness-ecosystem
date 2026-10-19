'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assets = path.resolve(__dirname, '../../main/assets');
const storage = {};
const calls = [];

function boot() {
  const context = vm.createContext({
    console, Date, Math, JSON, setTimeout, clearTimeout,
    Progression: require('../../main/assets/core/progressao.js'),
    window: { addEventListener() {} },
    document: { getElementById() { return null; }, addEventListener() {} },
    localStorage: {
      getItem: key => storage[key] || null,
      setItem: (key, value) => { storage[key] = value; }
    },
    AndroidBridge: {
      syncActiveWorkout: (started, last, day) => calls.push({ started, last, day })
    }
  });
  for (const file of ['apps/evolucao/exercicios/nomes.js', 'apps/evolucao/dados.js',
    'kernel/fmt.js', 'kernel/db.js', 'apps/evolucao/logic.js']) {
    vm.runInContext(fs.readFileSync(path.join(assets, file), 'utf8'), context);
  }
  return context;
}

let app = boot();
assert.strictEqual(calls.at(-1).started, 0, 'Abrir o app sem treino não ativa o serviço');
const started = Date.now() - 4 * 60 * 1000;
app.state.draft.day = 'A';
app.state.draft.startedAt = started;
app.state.draft.lastActiveAt = started;
app.state.draft.entries = { 'Supino reto c/ halteres': [{ w: 20, r: 10 }] };
assert.strictEqual(app.save(), true);
assert.deepStrictEqual(calls.at(-1), { started, last: started, day: 'A' });

app = boot();
assert.deepStrictEqual(calls.at(-1), { started, last: started, day: 'A' },
  'Reabrir restaura o serviço com o início original');
assert.strictEqual(app.checkDraftInactivity(), false, 'Quatro minutos não encerram o treino');
assert.strictEqual(app.state.draft.entries['Supino reto c/ halteres'][0].r, 10);

app.state.draft.startedAt = null;
app.state.draft.lastActiveAt = null;
app.state.draft.entries = {};
app.save();
assert.strictEqual(calls.at(-1).started, 0, 'Concluir ou descartar desativa o serviço');

app.state.draft.startedAt = Date.now() - 4 * 3600 * 1000;
app.state.draft.lastActiveAt = app.state.draft.startedAt;
assert.strictEqual(app.checkDraftInactivity(), true);
assert.strictEqual(calls.at(-1).started, 0, 'Abandono de três horas também desativa o serviço');

delete app.AndroidBridge;
assert.strictEqual(app.save(), true, 'Versões antigas e navegador continuam salvando');
console.log('✅ Sessão ativa: início, quatro minutos em background, restauração e encerramento.');
