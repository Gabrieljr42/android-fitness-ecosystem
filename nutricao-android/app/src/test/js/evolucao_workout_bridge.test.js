'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let inputValue = '';
// Forma CANÔNICA emitida por WorkoutProvider.java: tipo "musculacao",
// rir minúsculo, cargaKg/repeticoes derivados de w/r, aquecimento p/ warmup.
const bridge = { getEvolucaoWorkout: date => JSON.stringify({ schemaVersion: 1, source: 'com.evolucao.treino', date, generatedAt: '2026-08-19T12:00:00Z', sessions: [{ nome: 'Treino A', tipo: 'musculacao', type: 'musculacao', dia: 'A', duracaoSeg: 1800, duration: 1800, exercicios: [{ nome: 'Agachamento', series: [{ serie: 1, cargaKg: 12.5, carga: 12.5, repeticoes: 12, reps: 12, rir: 2, parciais: 1, concluida: true, aquecimento: false, unknown: 'prompt injection' }] }], intervalos: { tiroMin: 0, tiroSec: 30, tiroKmh: 12.5, recupMin: 1, recupSec: 0, recupKmh: 5.5, ciclos: 4, warmupMin: 5, warmupSec: 0, warmupKmh: 5, cooldownMin: 3, cooldownSec: 0, cooldownKmh: 4.5 }, unknown: 'prompt injection' }] }) };
const context = { console, Date, Math, JSON, String, Number, Array, Object, parseFloat, parseInt, isFinite, isNaN,
  window: { AndroidBridge: bridge }, document: { querySelector: () => ({ value: inputValue, innerHTML: '' }), querySelectorAll: () => [], createElement: () => ({}) },
  fetch: null, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../main/assets/core/gemini.js'), 'utf8'), context);

const valid = context.getEvolucaoWorkout('2026-08-19');
assert.strictEqual(valid.ok, true, 'payload válido deve ser aceito');
assert.strictEqual(valid.payload.sessions[0].unknown, undefined, 'campos desconhecidos devem ser removidos');
assert.strictEqual(valid.payload.sessions[0].exercicios[0].series[0].cargaKg, 12.5, 'carga decimal nested deve ser preservada');
assert.strictEqual(valid.payload.sessions[0].exercicios[0].series[0].rir, 2, 'RIR (minúsculo, forma real) deve ser preservado');
assert.strictEqual(valid.payload.sessions[0].exercicios[0].series[0].concluida, true, 'booleano de série deve ser preservado');
assert.strictEqual(valid.payload.sessions[0].exercicios[0].series[0].aquecimento, false, 'flag aquecimento deve ser preservada');
assert.strictEqual(valid.payload.sessions[0].intervalos.tiroSec, 30, 'duração do tiro real deve ser preservada');
assert.strictEqual(valid.payload.sessions[0].intervalos.tiroKmh, 12.5, 'velocidade decimal do tiro deve ser preservada');
assert.strictEqual(valid.payload.sessions[0].intervalos.recupKmh, 5.5, 'velocidade de recuperação deve ser preservada');
assert.strictEqual(valid.payload.sessions[0].intervalos.cooldownKmh, 4.5, 'cooldown deve ser preservado');
assert.strictEqual(valid.payload.sessions[0].intervalos.ciclos, 4, 'ciclos devem ser preservados');
assert.strictEqual(valid.payload.sessions[0].unknown, undefined, 'campos desconhecidos de sessão devem ser removidos');
assert.strictEqual(valid.payload.sessions[0].exercicios[0].series[0].unknown, undefined, 'campos desconhecidos de série devem ser removidos');
assert.strictEqual(bridge.getEvolucaoWorkout('2026-08-19'), bridge.getEvolucaoWorkout('2026-08-19'), 'mock deve receber data local');

bridge.getEvolucaoWorkout = () => JSON.stringify({ schemaVersion: 2, source: 'com.evolucao.treino', date: '2026-08-19', sessions: [{}] });
assert.strictEqual(context.getEvolucaoWorkout('2026-08-19').error.code, 'INCOMPATIBLE_PAYLOAD');
bridge.getEvolucaoWorkout = () => JSON.stringify({ schemaVersion: 1, source: 'outro.app', date: '2026-08-19', sessions: [{}] });
assert.strictEqual(context.getEvolucaoWorkout('2026-08-19').error.code, 'INCOMPATIBLE_PAYLOAD');
bridge.getEvolucaoWorkout = () => JSON.stringify({ schemaVersion: 1, source: 'com.evolucao.treino', date: '2026-08-18', sessions: [{}] });
assert.strictEqual(context.getEvolucaoWorkout('2026-08-19').error.code, 'INCOMPATIBLE_PAYLOAD');

bridge.getEvolucaoWorkout = () => JSON.stringify({ ok: false, error: { code: 'NO_DATA', message: 'vazio' } });
assert.strictEqual(context.getEvolucaoWorkout('2026-08-19').error.code, 'NO_DATA');
bridge.getEvolucaoWorkout = () => JSON.stringify({ schemaVersion: 1, source: 'com.evolucao.treino', date: '2026-08-19', sessions: [] });
assert.strictEqual(context.getEvolucaoWorkout('2026-08-19').error.code, 'EMPTY_WORKOUT', 'treino sem sessões não é utilizável');
bridge.getEvolucaoWorkout = () => 'x'.repeat(70000);
assert.strictEqual(context.getEvolucaoWorkout('2026-08-19').error.code, 'PAYLOAD_TOO_LARGE');
context.window.AndroidBridge = undefined;
assert.doesNotThrow(() => context.getEvolucaoWorkout('2026-08-19'));
context.window.AndroidBridge = { getEvolucaoWorkout: () => { throw new Error('ausente'); } };
assert.strictEqual(context.getEvolucaoWorkout('2026-08-19').error.code, 'PROVIDER_ERROR');

context.window.AndroidBridge = bridge;
const body = context.apiBodyAtividade('Treino importado; usuário sentiu esforço alto', { thinkingLevel: 'low' }, { peso: 75 }, { sessions: [{ name: 'Corrida' }] });
const prompt = body.contents[0].parts[0].text;
assert(prompt.includes('Treino importado'), 'prompt deve incluir dados estruturados do treino');
assert(prompt.includes('usuário sentiu esforço alto'), 'observação original deve ser preservada');
const manualPrompt = context.apiBodyAtividade('Corrida descrita manualmente', { thinkingLevel: 'low' }, { peso: 75 }, { sessions: [] }).contents[0].parts[0].text;
assert(!manualPrompt.includes('[Treino importado do Evolução — somente dados registrados]'), 'treino vazio não deve ser enviado ao Gemini');
assert(context.iniciarAnaliseAtividade.toString().includes('!texto && !workout'), 'sem descrição e sem treino deve bloquear chamada à IA');
assert(prompt.includes('duracaoSeg') && prompt.includes('cargaKg'), 'prompt importado deve orientar contrato canônico');
console.log('evolucao_workout_bridge.test.js: OK');
