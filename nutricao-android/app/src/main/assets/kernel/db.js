/* kernel/db.js — carga, migração e persistência local */
var KEY = 'evolucao_treino_state';
function EX(n,rest,sets,reps){
  var t=typeof targetFor === 'function' ? targetFor(n) : {sets:4, reps:'8-12'};
  var eq=typeof Progression !== 'undefined' && Progression.inferEq ? Progression.inferEq(n) : 'maquina';
  var id=typeof exerciseIdFor === 'function' ? exerciseIdFor(n) : String(n).toLowerCase().replace(/\s+/g,'_');
  var aliases=typeof aliasesForExercise === 'function' ? aliasesForExercise(n) : [];
  var inc=typeof Progression !== 'undefined' && Progression.defaultInc ? Progression.defaultInc(eq) : 2.5;
  var perSide=eq==='halter'||(typeof Progression !== 'undefined' && Progression.isUnilateral ? Progression.isUnilateral(n) : false);
  return {n:n, id:id, aliases:aliases, rest:(rest||(typeof restFor === 'function' ? restFor(n) : 90)), sets:(sets||t.sets), reps:(reps||t.reps), eq:eq, inc:inc, perSide:perSide};
}
var DEFAULT_STATE={
  ficha:{
    A:{nome:'Peito · Ombro · Tríceps', ex:[EX('Supino reto'),EX('Supino inclinado c/ halteres'),EX('Voador'),EX('Elevação lateral'),EX('Tríceps na polia'),EX('Tríceps francês na polia'),EX('Abdominal na polia')]},
    B:{nome:'Costas · Bíceps', ex:[EX('Puxada aberta'),EX('Remada baixa'),EX('Serrote (remada unilateral)'),EX('Crucifixo inverso'),EX('Rosca na polia'),EX('Rosca banco 45° c/ halteres')]},
    C:{nome:'Perna', ex:[EX('Agachamento no Smith'),EX('Leg press 45'),EX('Stiff / Terra romeno'),EX('Cadeira extensora'),EX('Cadeira flexora'),EX('Panturrilha em pé'),EX('Panturrilha sentado'),EX('Adutora'),EX('Abdutora')]}
  },
  sessions:[], corridas:[], peso:[],
  cardioGoalKm:15,
  draft:{day:null, date:null, entries:{}, warmupMode:{}, startedAt:null, sessionMode:'normal', unilateralPending:null},
  draftCorrida:null,
  settings:{restAuto:true, alarm:true, autoAdvance:true, progressao:{enabled:true, stallSessions:3, deloadPct:10, targetRir:2, expandRepRange:true, weightMatch:true}}
};

DEFAULT_STATE.ficha={
  A:{nome:'Peito \u00b7 Ombro \u00b7 Tr\u00edceps', ex:[
    EX('Supino reto c/ halteres',180,4,'6-10'), EX('Supino inclinado c/ halteres',120,4,'6-10'),
    EX('Voador',90,3,'10-12'), EX('Eleva\u00e7\u00e3o lateral',60,4,'10-12'),
    EX('Tr\u00edceps na polia',60,3,'10-12'), EX('Tr\u00edceps franc\u00eas na polia',60,3,'10-12')
  ]},
  B:{nome:'Costas \u00b7 B\u00edceps', ex:[
    EX('Puxada aberta',120,4,'8-12'), EX('Abdominal na polia',45,3,'15-20'),
    EX('Remada baixa',120,4,'8-12'), EX('Serrote (remada unilateral)',90,4,'6-10'),
    EX('Crucifixo inverso',60,3,'10-12'), EX('Rosca na polia',60,3,'10-12'),
    EX('Rosca banco 45\u00b0 c/ halteres',60,3,'10-12')
  ]},
  C:{nome:'Perna', ex:[
    EX('Agachamento na hack',150,4,'8-12'), EX('Leg press 45',150,4,'8-12'),
    EX('Eleva\u00e7\u00e3o p\u00e9lvica',120,4,'8-12'), EX('Cadeira flexora',75,3,'10-12'),
    EX('Cadeira extensora',75,3,'10-12'), EX('Panturrilha em p\u00e9',60,4,'12-15'),
    EX('Panturrilha sentado',60,3,'12-15'), EX('Abdutora',60,3,'12-15')
  ]}
};

if (typeof localStorage !== 'undefined') {
  var state = typeof migrate === 'function' ? migrate(load()) : load();
}
var tab = 'treino';
var metric = 'max';
var progressEx = '';
if (typeof gid === 'undefined') var gid = 0;
var deferredPrompt = null;
var calOpen = false, calMonth = null;
var lastSummary = null;

function load(){
  try{ var raw=localStorage.getItem(KEY); if(raw){ var s=JSON.parse(raw); if(s&&s.ficha&&s.sessions) return s; } }catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function isLegacyDefaultRoutine(ficha){
  var expected={
    A:['Supino reto','Supino inclinado c/ halteres','Voador','Elevação lateral','Tríceps na polia','Tríceps francês na polia','Abdominal na polia'],
    B:['Puxada aberta','Remada baixa','Serrote (remada unilateral)','Crucifixo inverso','Rosca na polia','Rosca banco 45° c/ halteres'],
    C:['Agachamento no Smith','Leg press 45','Stiff / Terra romeno','Cadeira extensora','Cadeira flexora','Panturrilha em pé','Panturrilha sentado','Adutora','Abdutora']
  };
  return ['A','B','C'].every(function(k){ var a=ficha&&ficha[k]&&ficha[k].ex||[]; return a.length===expected[k].length && a.every(function(e,i){ return e.n===expected[k][i]; }); });
}
function migrateEntryFlags(entries){
  if(!entries || typeof entries!=='object') return;
  Object.keys(entries).forEach(function(name){
    var sets=Array.isArray(entries[name])?entries[name]:[];
    var hasLegacyWarmupFlag=sets.some(function(set){ return set && set.warmup !== undefined; });
    sets.forEach(function(set){
      if(!set || typeof set!=='object') return;
      if(hasLegacyWarmupFlag && set.wu===undefined) set.wu=!!set.warmup;
      if(set.rir!==undefined && set.rir!==null && set.rir!==''){
        var rir=Number(set.rir);
        if(isFinite(rir)) set.rir=Math.max(0,Math.min(6,rir)); else delete set.rir;
      }
    });
  });
}
function migrate(s){
  var d=DEFAULT_STATE;
  if(!s.settings) s.settings={};
  if(s.settings.restAuto==null) s.settings.restAuto=d.settings.restAuto;
  if(s.settings.alarm==null) s.settings.alarm=d.settings.alarm;
  if(s.settings.autoAdvance==null) s.settings.autoAdvance=d.settings.autoAdvance;
  if(!s.settings.progressao) s.settings.progressao={};
  if(s.settings.progressao.enabled==null) s.settings.progressao.enabled=d.settings.progressao.enabled;
  if(s.settings.progressao.stallSessions==null) s.settings.progressao.stallSessions=d.settings.progressao.stallSessions;
  if(s.settings.progressao.deloadPct==null) s.settings.progressao.deloadPct=d.settings.progressao.deloadPct;
  if(s.settings.progressao.targetRir==null) s.settings.progressao.targetRir=d.settings.progressao.targetRir;
  if(s.settings.progressao.expandRepRange==null) s.settings.progressao.expandRepRange=d.settings.progressao.expandRepRange;
  if(s.settings.progressao.weightMatch==null) s.settings.progressao.weightMatch=d.settings.progressao.weightMatch;
  if(!s.peso) s.peso=[];
  if(!s.corridas) s.corridas=[];
  if(s.cardioGoalKm==null) s.cardioGoalKm=d.cardioGoalKm||15;
  if(!s.draft) s.draft={day:null,date:null,entries:{}};
  if(!s.draft.warmupMode) s.draft.warmupMode={};
  if(s.draft.startedAt===undefined) s.draft.startedAt=null;
  if(s.draft.sessionMode!=='curto') s.draft.sessionMode='normal';
  if(s.draft.unilateralPending===undefined) s.draft.unilateralPending=null;
  if(s.draftCorrida===undefined) s.draftCorrida=null;
  if(!s.ficha) s.ficha=JSON.parse(JSON.stringify(d.ficha));
  if(isLegacyDefaultRoutine(s.ficha)) s.ficha=JSON.parse(JSON.stringify(d.ficha));
  migrateEntryFlags(s.draft.entries);
  ['A','B','C'].forEach(function(k){
    if(!s.ficha[k]) s.ficha[k]=JSON.parse(JSON.stringify(d.ficha[k]));
    s.ficha[k].ex=(s.ficha[k].ex||[]).map(function(e){
      if(typeof e==='string') e={n:e};
      if(!e || typeof e!=='object') e={n:String(e)};
      var t=typeof targetFor === 'function' ? targetFor(e.n||'') : {sets:4, reps:'8-12'};
      var out={}; Object.keys(e).forEach(function(key){ out[key]=e[key]; });
      var eq=(typeof Progression !== 'undefined' && Progression.INC_BY_EQ && Progression.INC_BY_EQ[e.eq]!==undefined) ? e.eq : (typeof Progression !== 'undefined' && Progression.inferEq ? Progression.inferEq(e.n||'') : 'maquina');
      out.n=e.n; out.id=String(e.id||(typeof exerciseIdFor === 'function' ? exerciseIdFor(e.n||'') : String(e.n||'').toLowerCase().replace(/\s+/g,'_')));
      out.aliases=typeof uniqueStrings === 'function' ? uniqueStrings((e.aliases||[]).concat(typeof aliasesForExercise === 'function' ? aliasesForExercise(e.n||'') : [])) : (e.aliases||[]);
      out.rest=(e.rest==null?(typeof restFor === 'function' ? restFor(e.n||'') : 90):e.rest); 
      out.sets=(e.sets==null?t.sets:e.sets); 
      out.reps=(e.reps==null?t.reps:e.reps);
      out.eq=eq; 
      out.inc=(e.inc==null?(typeof Progression !== 'undefined' && Progression.defaultInc ? Progression.defaultInc(eq) : 2.5):e.inc); 
      out.perSide=(e.perSide==null?(eq==='halter'||(typeof Progression !== 'undefined' && Progression.isUnilateral ? Progression.isUnilateral(e.n) : false)):!!e.perSide);
      var progressionOverride=e.progressao||e.progression;
      if(progressionOverride && typeof progressionOverride==='object') out.progressao=Object.assign({}, progressionOverride);
      else delete out.progressao;
      return out;
    });
  });
  if(!s.sessions) s.sessions=[];
  s.sessions.forEach(function(session){
    migrateEntryFlags(session.entries);
    if(session.mode!=='curto') session.mode='normal';
  });
  return s;
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }

/* ---------- Merge de backup (nunca sobrescreve, só combina) ---------- */
function sessionSig(s){ return s.date+'|'+s.day+'|'+(s.mode||'normal')+'|'+JSON.stringify(s.entries); }
function corridaSig(c){ return (c.id||'')+'|'+c.date+'|'+(c.mode||c.tipo||'continua')+'|'+c.distanciaKm+'|'+(c.duracaoSeg||c.tempoSegundos); }
function mergeState(cur, inc){
  var bySig={}, order=[];
  (cur.sessions||[]).forEach(function(s){ var k=sessionSig(s); if(!bySig[k]){ bySig[k]=s; order.push(k); } });
  var addedSessions=0;
  (inc.sessions||[]).forEach(function(s){ var k=sessionSig(s); if(!bySig[k]){ bySig[k]=s; order.push(k); addedSessions++; } });
  var mergedSessions=order.map(function(k){ return bySig[k]; });

  var byCorrida={}, corridaOrder=[];
  (cur.corridas||[]).forEach(function(c){ var k=corridaSig(c); if(!byCorrida[k]){ byCorrida[k]=c; corridaOrder.push(k); } });
  var addedCorridas=0;
  (inc.corridas||[]).forEach(function(c){ var k=corridaSig(c); if(!byCorrida[k]){ byCorrida[k]=c; corridaOrder.push(k); addedCorridas++; } });
  var mergedCorridas=corridaOrder.map(function(k){ return byCorrida[k]; });

  var curDates={}; (cur.peso||[]).forEach(function(p){ curDates[p.date]=1; });
  var addedPeso=0;
  var pesoByDate={};
  (inc.peso||[]).forEach(function(p){ pesoByDate[p.date]=p; if(!curDates[p.date]) addedPeso++; });
  (cur.peso||[]).forEach(function(p){ pesoByDate[p.date]=p; });
  var mergedPeso=Object.keys(pesoByDate).map(function(k){ return pesoByDate[k]; });

  var mergedFicha={};
  ['A','B','C'].forEach(function(d){
    var curDay=(cur.ficha&&cur.ficha[d])||{nome:'',ex:[]};
    var incDay=(inc.ficha&&inc.ficha[d])||{nome:curDay.nome,ex:[]};
    var ids={}; var names={}; 
    (curDay.ex||[]).forEach(function(e){ 
      ids[e.id||(typeof exerciseIdFor === 'function' ? exerciseIdFor(e.n) : e.n)]=1; 
      names[e.n]=1; 
    });
    var extra=(incDay.ex||[]).filter(function(e){ 
      return !ids[e.id||(typeof exerciseIdFor === 'function' ? exerciseIdFor(e.n) : e.n)] && !names[e.n]; 
    });
    mergedFicha[d]={ nome: curDay.nome||incDay.nome, ex: (curDay.ex||[]).concat(extra) };
  });

  return {
    state:{
      ficha:mergedFicha,
      sessions:mergedSessions,
      corridas:mergedCorridas,
      peso:mergedPeso,
      cardioGoalKm:cur.cardioGoalKm || inc.cardioGoalKm || 15,
      draft:cur.draft,
      draftCorrida:cur.draftCorrida || null,
      settings:cur.settings
    },
    addedSessions:addedSessions,
    addedPeso:addedPeso,
    addedCorridas:addedCorridas
  };
}
