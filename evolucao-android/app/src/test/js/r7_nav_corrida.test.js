'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('=== R7: NAVEGAÇÃO — CORRIDA UNIFICADA (contrato de fonte)    ===');
console.log('================================================================\n');

const ASSETS = path.resolve(__dirname, '../../main/assets');
const read = rel => fs.readFileSync(path.join(ASSETS, rel), 'utf8');

const appJs = read('kernel/app.js');
const corridaJs = read('apps/evolucao/views/corrida.js');
const maratonaJs = read('apps/evolucao/views/maratona.js');
const dbJs = read('kernel/db.js');
const indexHtml = read('index.html');

let passed = 0;

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 1: topo sem Maratona, com ícones completos ---');
{
  const m = appJs.match(/var TABS\s*=\s*\[([\s\S]*?)\];/);
  assert(m, 'TABS definido em kernel/app.js');
  const ids = [...m[1].matchAll(/id:\s*'([a-z]+)'/g)].map(x => x[1]);
  assert.strictEqual(ids.length, 5, '5 abas de topo (obtido: ' + ids.join(',') + ')');
  assert(!ids.includes('maratona'), 'maratona não é destino de topo');
  assert(ids.includes('corrida'), 'corrida permanece no topo');

  // cada aba resolve ícone no fallback do app.js e em icons.js
  const iconsJs = read('kernel/icons.js');
  for (const id of ids) {
    const re = new RegExp('(var NAV_ICONS[\\s\\S]*?' + id + ':)|(' + id + ":\\s*'<)");
    assert(re.test(appJs) || re.test(iconsJs), 'ícone definido para ' + id);
  }
  assert(!appJs.includes("ico: 'maratona'"), 'sem referência a ico maratona');
  console.log('✅ Topo: ' + ids.join(', '));
  passed += 4;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: dispatch não roteia mais tab="maratona" no topo ---');
{
  assert(!/currentTab === 'maratona'/.test(appJs), 'branch de topo removido');
  // helpers continuam carregados para uso dentro de Corrida
  assert(indexHtml.includes('apps/evolucao/maratonaplano.js'), 'plano continua carregado');
  assert(indexHtml.includes('apps/evolucao/views/maratona.js'), 'view maratona continua carregada');
  console.log('✅ Roteador limpo; módulos do plano seguem vivos.');
  passed += 3;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Corrida unificada com subnav Correr|Plano|Progresso ---');
{
  assert(/var corridaSection\s*=\s*'correr'/.test(corridaJs), 'estado de seção com default correr');
  for (const s of ['correr', 'plano', 'progresso']) {
    assert(corridaJs.includes(`['${s}',`), `subnav lista ${s}`);
  }
  assert(corridaJs.includes(`data-csection="' + s[0] + '"'`), 'subnav emite data-csection dinamicamente');
  assert(/corridaSection === 'plano'/.test(corridaJs), 'roteamento para o plano');
  assert(/renderMaratona\(\)/.test(corridaJs), 'plano renderiza dentro de corrida');
  assert(/corridaProgressoHTML\(\)/.test(corridaJs), 'progresso delega para helper');
  // histórico do plano mora no Progresso, não na visão Semana
  assert(!/data-marview/.test(maratonaJs), 'seg antigo Semana|Histórico removido');
  assert(/function renderMaratonaHistorico/.test(maratonaJs), 'histórico do plano preservado');
  assert(corridaJs.includes('renderMaratonaHistorico()'), 'Progresso inclui aderência/volume do plano');
  console.log('✅ IA unificada: Correr | Plano 42K | Progresso.');
  passed += 8;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: banner planejado conecta à semana do plano (mesma aba) ---');
{
  assert(corridaJs.includes('goMaratonaBtn'), 'banner mantém botão');
  assert(!/tab\s*=\s*'maratona'/.test(corridaJs), 'não navega mais para aba removida');
  assert(/corridaSection\s*=\s*'plano'/.test(corridaJs), 'banner troca seção interna');
  assert(corridaJs.includes('Treino planejado hoje'), 'texto do banner presente');
  console.log('✅ planejado → plano sem sair de Corrida.');
  passed += 3;
}

// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: registro de corrida e estado da maratona intactos ---');
{
  // tracker contínuo/intervalado preservado
  assert(/id="btnIniciarTreinoIntervalado"/.test(corridaJs), 'timer intervalado preservado');
  assert(/function finishLiveInterval/.test(corridaJs), 'finalização de sessão preservada');
  assert(/Histórico de Corridas/.test(corridaJs), 'histórico de corridas preservado');
  // estado do plano: migração aditiva e merge que preserva marathonState
  assert(dbJs.includes('marathonState'), 'marathonState no schema');
  assert(/assoc['"]?\s*:\s*\{\}/.test(dbJs.replace(/\s/g, '').replace(/'/g, '"')) || dbJs.includes("'assoc'") || dbJs.includes('"assoc"') || /assoc\s*:\s*\{\}/.test(dbJs), 'subestados presentes');
  assert(/marathonState/.test(dbJs) && /mergeState/.test(dbJs));
  // view do plano ainda grava via maratonaState()
  assert(/function maratonaState\(/.test(maratonaJs), 'acesso canônico ao estado do plano');
  assert(maratonaJs.includes('save('), 'gravações persistem');
  console.log('✅ Tracker + estado do plano intocados pela fusão.');
  passed += 5;
}

console.log('\n================================================================');
if (passed >= 23) {
  console.log(`ALL ${passed} NAV-MERGE CONTRACT TESTS PASSED!`);
  process.exit(0);
} else {
  console.error(`Expected >= 23 markers, got ${passed}`);
  process.exit(1);
}
