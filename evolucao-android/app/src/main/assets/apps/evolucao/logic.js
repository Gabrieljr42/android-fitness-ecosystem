/* apps/evolucao/logic.js — sessões, dia seguinte, rascunho */
function sortedSessions(){ return state.sessions.slice().sort(function(a,b){ return a.date===b.date ? a.id-b.id : (a.date<b.date?-1:1); }); }
function nextDay(){ var ss=sortedSessions(); if(!ss.length) return 'A'; var o=['A','B','C']; return o[(o.indexOf(ss[ss.length-1].day)+1)%3]; }
function exerciseForName(name, day){
  var days=day?[day]:['A','B','C'];
  for(var d=0;d<days.length;d++){
    var list=state.ficha[days[d]]&&state.ficha[days[d]].ex||[];
    for(var i=0;i<list.length;i++){
      var exo=list[i];
      if(exo.n===name || exo.id===name || (exo.aliases||[]).indexOf(name)>=0) return exo;
    }
  }
  return null;
}
function entryForExercise(session, name, day){
  var exo=exerciseForName(name,day);
  if(exo) return Progression.entryFor(session,exo.n,exo.id,exo.aliases);
  return session&&session.entries&&Array.isArray(session.entries[name])?session.entries[name]:null;
}
function lastEntry(ex,day){
  var ss=sortedSessions();
  for(var i=ss.length-1;i>=0;i--){ var s=entryForExercise(ss[i],ex,day); if(s&&s.length) return {date:ss[i].date, sets:s}; }
  return null;
}
function isWarmup(set){ return set && set.wu !== undefined ? !!set.wu : !!(set && set.warmup); }
function workSets(sets){ return Progression.seriesDeTrabalho(sets||[]); }
function bestE1rm(ex,day){ var b=0; state.sessions.forEach(function(s){ var v=Progression.melhorE1rm(entryForExercise(s,ex,day)||[]); if(v>b)b=v; }); return b; }
function draftBestE1rm(ex){ var exo=exerciseForName(ex,state.draft.day); return Progression.melhorE1rm(exo?Progression.entryFor({entries:state.draft.entries},exo.n,exo.id,exo.aliases):(state.draft.entries||{})[ex]||[]); }
function allExercises(){
  var set={};
  ['A','B','C'].forEach(function(d){ state.ficha[d].ex.forEach(function(e){ set[e.id||exerciseIdFor(e.n)]={name:e.n}; }); });
  state.sessions.forEach(function(s){ Object.keys(s.entries||{}).forEach(function(e){
    var known=exerciseForName(e,s.day);
    var id=known?(known.id||exerciseIdFor(known.n)):exerciseIdFor(e);
    if(!set[id]) set[id]={name:known?known.n:e};
  }); });
  return Object.keys(set).map(function(id){ return set[id].name; }).sort();
}
function weekCount(){
  var now=new Date(), dow=(now.getDay()+6)%7, mon=new Date(now);
  mon.setDate(now.getDate()-dow); mon.setHours(0,0,0,0);
  return state.sessions.filter(function(s){ return new Date(s.date+'T00:00:00')>=mon; }).length;
}
function ensureDraft(){
  if(!state.draft || !state.draft.day) state.draft={day:nextDay(), date:todayISO(), entries:{}, warmupMode:{}, startedAt:null, sessionMode:'normal'};
  if(!state.draft.date) state.draft.date=todayISO();
  if(!state.draft.warmupMode) state.draft.warmupMode={};
  if(state.draft.sessionMode!=='curto') state.draft.sessionMode='normal';
  if(state.draft.date < todayISO() && !Object.keys(state.draft.entries||{}).length){
    state.draft.date = todayISO(); // não deixa a data travada num dia velho quando não há nada lançado ainda
  }
}
