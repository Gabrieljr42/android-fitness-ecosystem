'use strict';

const assert = require('assert');
const path = require('path');
const BodyVisualizer = require('../../main/assets/apps/evolucao/body-visualizer.js');

console.log('=== [EVOLUÇÃO] Executando Suíte: body_visualizer.test.js ===\n');

// 1. Module Export / Availability
{
  console.log('Test 1: BodyVisualizer exports and API structure');
  assert(BodyVisualizer !== undefined && BodyVisualizer !== null, 'BodyVisualizer deve ser exportado');
  assert.strictEqual(typeof BodyVisualizer.getMusclesForExercise, 'function');
  assert.strictEqual(typeof BodyVisualizer.getMusclesForSession, 'function');
  assert.strictEqual(typeof BodyVisualizer.getMusclesForDay, 'function');
  assert.strictEqual(typeof BodyVisualizer.getMuscleSummary, 'function');
  assert.strictEqual(typeof BodyVisualizer.renderSVG, 'function');
  assert.strictEqual(typeof BodyVisualizer.renderSessionAnatomy, 'function');
  assert.strictEqual(typeof BodyVisualizer.renderDayAnatomy, 'function');
  assert(Array.isArray(BodyVisualizer.MUSCLE_GROUPS), 'MUSCLE_GROUPS deve ser um array');
  assert.strictEqual(BodyVisualizer.MUSCLE_GROUPS.length, 10, 'Deve conter exatamente 10 grupos musculares');
}

// 2. Exercise to Muscle Group Mapping
{
  console.log('Test 2: Muscle group mapping for Portuguese exercise names');
  
  // Chest exercises
  const chest1 = BodyVisualizer.getMusclesForExercise('Supino reto c/ halteres');
  assert(chest1.chest >= 1.0, 'Supino reto deve ativar peito primário');
  const chest2 = BodyVisualizer.getMusclesForExercise('Crucifixo inclinado');
  assert(chest2.chest >= 1.0, 'Crucifixo deve ativar peito');

  // Back exercises
  const back1 = BodyVisualizer.getMusclesForExercise('Puxada aberta no pulley');
  assert(back1.back >= 1.0, 'Puxada deve ativar costas');
  assert(back1.biceps > 0, 'Puxada deve ativar bíceps secundário');
  const back2 = BodyVisualizer.getMusclesForExercise('Remada curvada');
  assert(back2.back >= 1.0, 'Remada deve ativar costas');

  // Shoulders & Arms
  const shoulder = BodyVisualizer.getMusclesForExercise('Elevação lateral');
  assert(shoulder.shoulders >= 1.0, 'Elevação lateral deve ativar ombros');
  const triceps = BodyVisualizer.getMusclesForExercise('Tríceps testa');
  assert(triceps.triceps >= 1.0, 'Tríceps testa deve ativar tríceps');
  const biceps = BodyVisualizer.getMusclesForExercise('Rosca direta barra W');
  assert(biceps.biceps >= 1.0, 'Rosca direta deve ativar bíceps');

  // Legs & Glutes
  const quads = BodyVisualizer.getMusclesForExercise('Cadeira extensora');
  assert(quads.quads >= 1.0, 'Extensora deve ativar quadríceps');
  const hamstrings = BodyVisualizer.getMusclesForExercise('Mesa flexora');
  assert(hamstrings.hamstrings >= 1.0, 'Flexora deve ativar posteriores');
  const calves = BodyVisualizer.getMusclesForExercise('Panturrilha em pé');
  assert(calves.calves >= 1.0, 'Panturrilha em pé deve ativar panturrilhas');
  const glutes = BodyVisualizer.getMusclesForExercise('Elevação pélvica');
  assert(glutes.glutes >= 1.0, 'Elevação pélvica deve ativar glúteos');
  const abs = BodyVisualizer.getMusclesForExercise('Abdominal supra');
  assert(abs.abs >= 1.0, 'Abdominal deve ativar abdômen');
}

// 3. Session Aggregation & Summary
{
  console.log('Test 3: Session muscle aggregation and summary');
  const mockSession = {
    day: 'A',
    entries: {
      'Supino reto c/ halteres': [{ w: 80, r: 10 }, { w: 80, r: 10 }, { w: 80, r: 10 }],
      'Crucifixo inclinado': [{ w: 20, r: 12 }, { w: 20, r: 12 }],
      'Tríceps na polia': [{ w: 30, r: 12 }, { w: 30, r: 12 }, { w: 30, r: 12 }]
    }
  };

  const sessionMuscles = BodyVisualizer.getMusclesForSession(mockSession);
  assert(sessionMuscles.chest >= 5.0, 'Peitoral deve ter no mínimo 5 sets de volume');
  assert(sessionMuscles.triceps >= 3.0, 'Tríceps deve ter pelo menos 3 sets de volume');

  const summary = BodyVisualizer.getMuscleSummary(sessionMuscles);
  assert(summary.length >= 2, 'Resumo deve listar múltiplos grupos');
  assert.strictEqual(summary[0].id, 'chest', 'Peitoral deve ser o grupo principal');
  assert.strictEqual(summary[0].label, 'Peito', 'Label em PT-BR deve ser Peito');
}

// 4. SVG Generation Contract
{
  console.log('Test 4: SVG generation and viewport validation');
  const mockSession = {
    day: 'B',
    entries: {
      'Puxada aberta': [{ w: 60, r: 10 }, { w: 60, r: 10 }],
      'Rosca direta': [{ w: 15, r: 10 }, { w: 15, r: 10 }]
    }
  };

  const svg = BodyVisualizer.renderSessionAnatomy(mockSession, { height: 160 });
  assert(typeof svg === 'string', 'SVG gerado deve ser string');
  assert(svg.includes('viewBox="0 0 300 200"'), 'SVG deve conter viewBox proporcional 0 0 300 200');
  assert(svg.includes('class="body-anat-svg"'), 'SVG deve conter classe body-anat-svg');
  assert(svg.includes('data-muscle="back"'), 'SVG deve conter caminhos para costas');
  assert(svg.includes('data-muscle="biceps"'), 'SVG deve conter caminhos para bíceps');
  assert(svg.includes('data-muscle="chest"'), 'SVG deve conter caminhos para peito');
  assert(svg.includes('FRENTE'), 'SVG deve conter label da silhueta Frontal');
  assert(svg.includes('COSTAS'), 'SVG deve conter label da silhueta Dorsal');
}

// 5. Day Workout Anatomy Preview
{
  console.log('Test 5: Day workout anatomy preview');
  const mockDay = {
    nome: 'Superiores',
    ex: [
      { n: 'Supino reto', sets: 4 },
      { n: 'Puxada aberta', sets: 4 },
      { n: 'Elevação lateral', sets: 3 }
    ]
  };

  const dayMuscles = BodyVisualizer.getMusclesForDay(mockDay);
  assert(dayMuscles.chest >= 4, 'Peito deve ter 4 sets no dia');
  assert(dayMuscles.back >= 4, 'Costas deve ter 4 sets no dia');
  assert(dayMuscles.shoulders >= 3, 'Ombros deve ter 3 sets no dia');

  const daySvg = BodyVisualizer.renderDayAnatomy(mockDay, { height: 150 });
  assert(daySvg.includes('body-anat-svg'), 'Day preview SVG deve renderizar');
}

console.log('\n======================================================');
console.log('body_visualizer.test.js: OK (Todos os testes passaram com sucesso!)');
