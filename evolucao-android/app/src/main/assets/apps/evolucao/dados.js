/* apps/evolucao/dados.js — descanso e meta padrão por exercício */
/* descanso recomendado por exercício (segundos)
   base: compostos pesados 2,5-3min · compostos 1,5-2min · isoladores 60-90s · panturrilha/abdômen 45-60s */
var REST_MAP={
  'Supino reto':180,'Supino inclinado c/ halteres':120,'Voador':90,'Elevação lateral':60,
  'Tríceps na polia':60,'Tríceps francês na polia':60,'Abdominal na polia':45,
  'Puxada aberta':120,'Remada baixa':120,'Serrote (remada unilateral)':90,'Crucifixo inverso':60,
  'Rosca na polia':60,'Rosca banco 45° c/ halteres':60,
  'Agachamento no Smith':180,'Leg press 45':150,'Stiff / Terra romeno':150,
  'Cadeira extensora':75,'Cadeira flexora':75,'Panturrilha em pé':60,'Panturrilha sentado':60,
  'Adutora':60,'Abdutora':60
};
function restGuess(name){
  var s=(name||'').toLowerCase();
  if(/(supino|agachamento|\bterra\b|stiff|levantamento|leg\s*press|barra fixa)/.test(s)) return 150;
  if(/(remada|puxada|desenvolvimento|afundo|avan[çc]o|serrote|b[íi]ceps? na barra)/.test(s)) return 120;
  if(/(panturr|abdominal|abd[oô]men|prancha|antebra|core)/.test(s)) return 50;
  return 75;
}
function restFor(name){ return REST_MAP[name] || restGuess(name); }

/* meta de séries × reps por exercício */
var TARGET_MAP={
  'Supino reto':{sets:4,reps:'6-10'}, 'Agachamento no Smith':{sets:4,reps:'6-10'},
  'Leg press 45':{sets:4,reps:'8-12'}, 'Stiff / Terra romeno':{sets:4,reps:'8-10'},
  'Puxada aberta':{sets:4,reps:'8-12'}, 'Remada baixa':{sets:4,reps:'8-12'},
  'Panturrilha em pé':{sets:4,reps:'12-15'}, 'Panturrilha sentado':{sets:4,reps:'12-15'},
  'Abdominal na polia':{sets:3,reps:'15-20'}, 'Adutora':{sets:3,reps:'12-15'}, 'Abdutora':{sets:3,reps:'12-15'}
};
function targetGuess(name){
  var s=(name||'').toLowerCase();
  if(/(supino|agachamento|\bterra\b|stiff|leg\s*press|puxada|remada|desenvolvimento)/.test(s)) return {sets:4,reps:'6-10'};
  if(/(panturr|abdominal|abd[oô]men|adutor|abdutor|core)/.test(s)) return {sets:3,reps:'12-15'};
  return {sets:3,reps:'10-12'};
}
function targetFor(name){ return TARGET_MAP[name] || targetGuess(name); }
