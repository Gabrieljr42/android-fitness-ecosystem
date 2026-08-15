/* apps/evolucao/exercicios/nomes.js — IDs canônicos, aliases e mapeadores */
/* IDs permanecem mesmo quando o nome exibido do exercício muda. */
var EXERCISE_CANONICAL={
  'supino reto':'Supino reto c/ halteres',
  'agachamento no smith':'Agachamento na hack'
};
var EXERCISE_ALIAS_LABELS={
  'supino reto':'Supino reto',
  'agachamento no smith':'Agachamento no Smith'
};
function exerciseNameKey(name){
  var s=String(name||'').toLowerCase();
  if(s.normalize) s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return s.replace(/\s+/g,' ').trim();
}
function canonicalExerciseName(name){ return EXERCISE_CANONICAL[exerciseNameKey(name)]||String(name||''); }
function exerciseIdFor(name){
  var s=exerciseNameKey(canonicalExerciseName(name)).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return 'ex_'+(s||'exercicio');
}
function aliasesForExercise(name){
  var key=exerciseNameKey(name), out=[];
  Object.keys(EXERCISE_CANONICAL).forEach(function(alias){
    if(exerciseNameKey(EXERCISE_CANONICAL[alias])===key) out.push(EXERCISE_ALIAS_LABELS[alias]||alias);
  });
  return out;
}
function uniqueStrings(values){
  var out=[], seen={};
  (Array.isArray(values)?values:[]).forEach(function(value){
    value=String(value||'').trim();
    if(value && !seen[value]){ seen[value]=1; out.push(value); }
  });
  return out;
}
