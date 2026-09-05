/* Evolução ↔ Wear OS — adaptador de domínio versionado, estrito e idempotente. */
(function(root){
  'use strict';

  var VERSION=1, MAX_EVENTS=64, MAX_EVENT_BYTES=16*1024, MAX_PLAN_BYTES=64*1024;
  var MAX_LOAD_GRAMS=500000, MAX_REPS=200, MAX_PARTIALS=100, MAX_RIR=6;
  var publishTimer=null, publishSuppressed=false;

  function now(){ return Date.now(); }
  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function isObject(value){ return !!value && typeof value==='object' && !Array.isArray(value); }
  function own(obj,key){ return Object.prototype.hasOwnProperty.call(obj,key); }
  function finiteInt(value,min,max){ return typeof value==='number' && isFinite(value) && Math.floor(value)===value && value>=min && value<=max; }
  function validUuid(value){ return typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value); }
  function validExerciseId(value){ return typeof value==='string' && /^ex_[a-z0-9][a-z0-9._-]{0,95}$/.test(value); }
  function validDate(value){
    if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var p=value.split('-').map(Number), d=new Date(p[0],p[1]-1,p[2]);
    return d.getFullYear()===p[0] && d.getMonth()===p[1]-1 && d.getDate()===p[2];
  }
  function validText(value,max){ return typeof value==='string' && value.length>0 && value.length<=max && value.indexOf('\0')<0; }
  function utf8Bytes(value){
    if(typeof TextEncoder!=='undefined') return new TextEncoder().encode(value).length;
    try{ return unescape(encodeURIComponent(value)).length; }catch(_){ return value.length*4; }
  }
  function keysExactly(obj,allowed){
    if(!isObject(obj)) return false;
    var present=Object.keys(obj), map={}; allowed.forEach(function(k){map[k]=1;});
    if(present.some(function(k){return !map[k];})) return false;
    return allowed.every(function(k){return own(obj,k);});
  }
  function uuid(){
    try{ if(root.crypto && typeof root.crypto.randomUUID==='function') return root.crypto.randomUUID().toLowerCase(); }catch(_){}
    var bytes=[];
    try{
      var buf=new Uint8Array(16); root.crypto.getRandomValues(buf); bytes=Array.prototype.slice.call(buf);
    }catch(_e){ for(var i=0;i<16;i++) bytes.push(Math.floor(Math.random()*256)); }
    bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
    var h=bytes.map(function(b){return (b+256).toString(16).slice(-2);}).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function stableStringify(value){
    if(value===null || typeof value!=='object') return JSON.stringify(value);
    if(Array.isArray(value)) return '['+value.map(stableStringify).join(',')+']';
    return '{'+Object.keys(value).sort().map(function(k){return JSON.stringify(k)+':'+stableStringify(value[k]);}).join(',')+'}';
  }
  function fingerprint(value){
    var text=stableStringify(value), h1=0x811c9dc5, h2=0x9e3779b9;
    for(var i=0;i<text.length;i++){
      var c=text.charCodeAt(i); h1=Math.imul(h1^c,16777619); h2=Math.imul(h2^(c+i),2246822519);
    }
    return ('00000000'+(h1>>>0).toString(16)).slice(-8)+('00000000'+(h2>>>0).toString(16)).slice(-8);
  }
  function todayLocal(){
    if(typeof todayISO==='function') return todayISO();
    var d=new Date(), pad=function(n){return String(n).padStart(2,'0');};
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  }

  /* Descanso do telefone em formato de transporte. Lê o objeto global `rest`
     do kernel UI: em andamento (running) ou pausado com saldo. Retorna null
     quando não há descanso ativo — o relógio então mantém o próprio timer.
     endElapsedRealtime/bootCount são locais ao telefone e vão zerados: o
     relógio sempre recalcula pelo wall-clock (endWallClockMillis). */
  function phoneRestState(){
    try{
      if(typeof rest==='undefined' || !rest || rest.done===true) return null;
      var total=Math.round(Number(rest.remain));
      if(!isFinite(total) || total<1) return null;
      total=Math.max(1,Math.min(3600,total));
      if(rest.on===true){
        var endMs=Math.round(Number(rest.end));
        if(!isFinite(endMs) || endMs<=now()) return null;
        return {running:true,paused:false,durationSeconds:total,remainingWhenPausedSeconds:total,endElapsedRealtime:0,endWallClockMillis:endMs,bootCount:0};
      }
      /* Pausado explícito (toggleRest). Dismiss (hideRest) zera remain e cai no null acima. */
      if(rest.paused!==true) return null;
      var left=0;
      try{ left=Math.round(Number(typeof restLeft==='function'?restLeft():rest.remain)); }catch(_){ left=total; }
      if(!isFinite(left) || left<1) return null;
      left=Math.max(1,Math.min(3600,left));
      return {running:false,paused:true,durationSeconds:total,remainingWhenPausedSeconds:left,endElapsedRealtime:0,endWallClockMillis:0,bootCount:0};
    }catch(_restError){ return null; }
  }

  function ensureSync(target){
    if(!isObject(target.wearSync)) target.wearSync={};
    var sync=target.wearSync; sync.schemaVersion=1;
    ['setMeta','appliedEvents','eventHeads','pendingEvents','finishedSessions'].forEach(function(k){
      if(!isObject(sync[k])) sync[k]={};
    });
    if(!Array.isArray(sync.conflicts)) sync.conflicts=[];
    if(sync.activePlan===undefined) sync.activePlan=null;
    if(sync.lastPublishedHash===undefined) sync.lastPublishedHash=null;
    return sync;
  }

  function strictPersist(candidate){
    var raw;
    try{
      raw=JSON.stringify(candidate);
      localStorage.setItem(KEY,raw);
    }catch(error){ return {ok:false,error:'PERSIST_FAILED',detail:String(error&&error.message||error)}; }
    publishSuppressed=true;
    state=candidate;
    try{ if(typeof syncNative==='function') syncNative(); }catch(_){}
    publishSuppressed=false;
    return {ok:true};
  }

  function uniqueText(values){
    var seen={}; return (values||[]).filter(function(v){
      v=String(v||'').trim(); if(!v || v.length>120 || seen[v]) return false; seen[v]=1; return true;
    }).slice(0,16);
  }
  function parseRange(value){
    var m=String(value||'8-12').match(/(\d+)\s*(?:[-–]\s*(\d+))?/), a=m?Number(m[1]):8, b=m&&m[2]?Number(m[2]):a;
    a=Math.max(1,Math.min(MAX_REPS,a)); b=Math.max(a,Math.min(MAX_REPS,b)); return {min:a,max:b};
  }
  function targetRirFor(ex,target){
    var cfg=target.settings&&target.settings.progressao;
    var value=ex&&ex.progressao&&ex.progressao.targetRir;
    if(value==null && cfg) value=cfg.targetRir;
    value=Number(value==null?2:value); return finiteInt(value,0,MAX_RIR)?value:2;
  }
  function isUnilateralPlan(ex){
    if(ex&&ex.unilateral===true) return true;
    return /unilateral|serrote|por lado/i.test(String(ex&&ex.n||''));
  }
  function kgToGrams(value){
    value=Number(value); if(!isFinite(value) || value<0) return null;
    return Math.max(0,Math.min(MAX_LOAD_GRAMS,Math.round(value*1000)));
  }
  function cleanSet(set){
    var out={w:Number(set&&set.w)||0,r:Number(set&&set.r)||0,done:set&&set.done===true};
    if(set&&Number(set.p)>0) out.p=Math.floor(Number(set.p));
    if(set&&set.rir!=null && isFinite(Number(set.rir))) out.rir=Math.max(0,Math.min(MAX_RIR,Math.round(Number(set.rir))));
    if(set&&set.targetRir!=null && isFinite(Number(set.targetRir))) out.targetRir=Math.max(0,Math.min(MAX_RIR,Math.round(Number(set.targetRir))));
    out.wu=!!(set&&(set.wu!==undefined?set.wu:set.warmup)); out.warmup=out.wu;
    return out;
  }

  function newActivePlan(target,day,date){
    return {draftKey:day+'|'+date,planId:uuid(),sessionId:uuid(),revision:1,generatedAt:now(),fingerprint:null,setIds:{}};
  }
  function ensureSetId(active,exerciseId,kind,index){
    if(!isObject(active.setIds[exerciseId])) active.setIds[exerciseId]={warmup:[],work:[]};
    var bucket=kind==='WARMUP'?active.setIds[exerciseId].warmup:active.setIds[exerciseId].work;
    while(bucket.length<=index) bucket.push(uuid());
    return bucket[index];
  }
  function previousWorkSets(target,day,ex){
    var sessions=(target.sessions||[]).slice().sort(function(a,b){return (a.id||0)-(b.id||0);});
    for(var i=sessions.length-1;i>=0;i--){
      var s=sessions[i], entries=s&&s.entries||{}, sets=entries[ex.n];
      if(!sets && ex.aliases) for(var a=0;a<ex.aliases.length&&!sets;a++) sets=entries[ex.aliases[a]];
      if(!sets) continue;
      var work=(sets||[]).filter(function(x){return !(x&&(x.wu!==undefined?x.wu:x.warmup));});
      if(work.length) return work;
    }
    return [];
  }
  function genericPainWarning(target){
    var pain=target.marathonState&&target.marathonState.pain;
    if(isObject(pain) && Object.keys(pain).some(function(k){return !!pain[k];})) return 'Se houver dor, pare o exercício e procure orientação profissional.';
    return null;
  }

  function buildPlanCandidate(target,requestedDay){
    var sync=ensureSync(target), draft=target.draft||{}, day=requestedDay||draft.day;
    if(!day || !target.ficha || !target.ficha[day]) return {plan:null,changed:false};
    var logicalDate=draft.date||todayLocal(); if(!validDate(logicalDate)) logicalDate=todayLocal();
    var active=sync.activePlan, draftKey=day+'|'+logicalDate;
    if(!active || active.draftKey!==draftKey || sync.finishedSessions[active.sessionId]){
      active=newActivePlan(target,day,logicalDate); sync.activePlan=active;
    }
    if(!isObject(active.setIds)) active.setIds={};
    var exercises=[], entries=draft.entries||{}, changedMeta=false;
    (target.ficha[day].ex||[]).slice(0,100).forEach(function(ex,order){
      var exerciseId=String(ex.id||'');
      if(!validExerciseId(exerciseId) && typeof exerciseIdFor==='function') exerciseId=exerciseIdFor(ex.n);
      if(!validExerciseId(exerciseId)) return;
      var aliases=uniqueText((ex.aliases||[]).concat([ex.n])), current=entries[ex.n]||[];
      if(!current.length){ for(var ai=0;ai<aliases.length&&!current.length;ai++) current=entries[aliases[ai]]||[]; }
      var warm=current.filter(function(s){return !!(s&&(s.wu!==undefined?s.wu:s.warmup));});
      var work=current.filter(function(s){return !(s&&(s.wu!==undefined?s.wu:s.warmup));});
      var warmCount=warm.length+(draft.warmupMode&&draft.warmupMode[ex.n]?1:0);
      var workCount=Math.max(1,Math.min(64-warmCount,Math.max(Number(ex.sets)||1,work.length)));
      var range=parseRange(ex.reps), targetRir=targetRirFor(ex,target), previous=previousWorkSets(target,day,ex);
      var prescriptions=[];
      for(var wi=0;wi<warmCount;wi++){
        var warmId=ensureSetId(active,exerciseId,'WARMUP',wi), warmSet=warm[wi]||warm[warm.length-1]||null;
        sync.setMeta[warmId]={sessionId:active.sessionId,planId:active.planId,exerciseId:exerciseId,exerciseName:ex.n,kind:'WARMUP',kindIndex:wi,order:order};
        prescriptions.push({setId:warmId,index:prescriptions.length,setKind:'WARMUP',repsMin:range.min,repsMax:range.max,suggestedLoadGrams:warmSet?kgToGrams(warmSet.w):null,previousLoadGrams:warmSet?kgToGrams(warmSet.w):null,previousReps:warmSet&&finiteInt(Number(warmSet.r),1,MAX_REPS)?Number(warmSet.r):null,targetRir:null});
      }
      var meta=null;
      try{ if(typeof Progression!=='undefined'&&Progression.calcularMeta) meta=Progression.calcularMeta(target.ficha,target.sessions||[],day,ex.n,target.settings&&target.settings.progressao); }catch(_){}
      for(var si=0;si<workCount;si++){
        var setId=ensureSetId(active,exerciseId,'WORK',si), cur=work[si]||null, prev=previous[si]||previous[previous.length-1]||null;
        sync.setMeta[setId]={sessionId:active.sessionId,planId:active.planId,exerciseId:exerciseId,exerciseName:ex.n,kind:'WORK',kindIndex:si,order:order};
        prescriptions.push({setId:setId,index:prescriptions.length,setKind:'WORK',repsMin:range.min,repsMax:range.max,suggestedLoadGrams:kgToGrams(cur?cur.w:(meta&&meta.carga!=null?meta.carga:(prev&&prev.w))),previousLoadGrams:prev?kgToGrams(prev.w):null,previousReps:prev&&finiteInt(Number(prev.r),1,MAX_REPS)?Number(prev.r):null,targetRir:targetRir});
      }
      var inc=kgToGrams(ex.inc==null?2.5:ex.inc); if(!inc) inc=2500;
      exercises.push({exerciseId:exerciseId,name:String(ex.n||'Exercício').slice(0,120),aliases:aliases.filter(function(a){return a!==ex.n;}),order:exercises.length,restSeconds:Math.max(0,Math.min(3600,Math.round(Number(ex.rest)||90))),loadIncrementGrams:inc,perSide:!!ex.perSide,unilateral:isUnilateralPlan(ex),targetRir:targetRir,prescriptions:prescriptions});
    });
    if(!exercises.length) return {plan:null,changed:false};
    /* Progresso feito no telefone: mapeia entradas concluídas do draft para
       os setIds estáveis (mesmos buckets usados nas prescrições acima). */
    var phoneCompleted=[];
    try{
      var seenPhone={};
      (target.ficha[day].ex||[]).forEach(function(ex){
        var exerciseId=String(ex.id||'');
        if(!validExerciseId(exerciseId) && typeof exerciseIdFor==='function') exerciseId=exerciseIdFor(ex.n);
        if(!validExerciseId(exerciseId)) return;
        var list=entries[ex.n]||[];
        if(!list.length && ex.aliases) for(var ai=0;ai<ex.aliases.length&&!list.length;ai++) list=entries[ex.aliases[ai]]||[];
        var buckets=isObject(active.setIds[exerciseId])?active.setIds[exerciseId]:null;
        if(!buckets) return;
        var kindCount={WARMUP:0,WORK:0};
        (list||[]).forEach(function(s){
          var warm=!!(s&&(s.wu!==undefined?s.wu:s.warmup));
          var kind=warm?'WARMUP':'WORK';
          var idx=kindCount[kind]++;
          if(!s || s.done!==true) return;
          var bucket=kind==='WARMUP'?buckets.warmup:buckets.work;
          var setId=bucket&&idx<bucket.length?bucket[idx]:null;
          if(setId && validUuid(setId) && !seenPhone[setId] && phoneCompleted.length<512){
            seenPhone[setId]=1; phoneCompleted.push(setId);
          }
        });
      });
      phoneCompleted.sort();
    }catch(_phoneProgressError){ phoneCompleted=[]; }
    var phoneRest=phoneRestState();
    var base={protocolVersion:VERSION,planId:active.planId,sessionId:active.sessionId,planRevision:active.revision,logicalDate:logicalDate,day:String(day).slice(0,8),name:String(target.ficha[day].nome||('Treino '+day)).slice(0,120),generatedAt:active.generatedAt,mode:draft.sessionMode==='curto'?'SHORT':'NORMAL',conservativeWarning:genericPainWarning(target),exercises:exercises,phoneCompletedSetIds:phoneCompleted,phoneRest:phoneRest};
    var fpValue=clone(base); delete fpValue.planRevision; delete fpValue.generatedAt;
    var fp=fingerprint(fpValue);
    if(active.fingerprint && active.fingerprint!==fp){ active.revision++; active.generatedAt=now(); changedMeta=true; }
    if(active.fingerprint!==fp){ active.fingerprint=fp; changedMeta=true; }
    base.planRevision=active.revision; base.generatedAt=active.generatedAt;
    if(utf8Bytes(JSON.stringify(base))>MAX_PLAN_BYTES) throw new Error('PLAN_TOO_LARGE');
    return {plan:base,changed:changedMeta};
  }

  function exportPlanJson(requestJson){
    var request={};
    if(requestJson){ try{ request=typeof requestJson==='string'?JSON.parse(requestJson):requestJson; }catch(_){ throw new Error('INVALID_REQUEST'); } }
    if(!isObject(request)) throw new Error('INVALID_REQUEST');
    var candidate=clone(state), built=buildPlanCandidate(candidate,request.day);
    if(!built.plan) return JSON.stringify({protocolVersion:VERSION,status:'EMPTY'});
    var currentSync=ensureSync(state), nextSync=ensureSync(candidate);
    var metadataChanged=stableStringify(currentSync)!==stableStringify(nextSync);
    if(metadataChanged){ var saved=strictPersist(candidate); if(!saved.ok) throw new Error(saved.error); }
    return JSON.stringify(built.plan);
  }

  function validateCommon(event){
    var common=['protocolVersion','eventType','eventId','sessionId','planId','planRevision','logicalDate','occurredAt','createdAt','origin','originInstanceId','originSequence'];
    if(event.protocolVersion!==VERSION) throw new Error('UNKNOWN_VERSION');
    ['eventId','sessionId','planId','originInstanceId'].forEach(function(k){if(!validUuid(event[k])) throw new Error('INVALID_'+k.toUpperCase());});
    if(!finiteInt(event.planRevision,1,2147483647)||!validDate(event.logicalDate)||!finiteInt(event.occurredAt,1,Number.MAX_SAFE_INTEGER)||!finiteInt(event.createdAt,1,Number.MAX_SAFE_INTEGER)||!finiteInt(event.originSequence,1,Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_COMMON_FIELDS');
    if(event.origin!=='WEAR') throw new Error('INVALID_ORIGIN');
    return common;
  }
  function validateSetValues(event){
    if(!validExerciseId(event.exerciseId)||!validUuid(event.setId)) throw new Error('INVALID_SET_IDENTITY');
    if(event.setKind!=='WARMUP'&&event.setKind!=='WORK') throw new Error('INVALID_SET_KIND');
    if(['EXTERNAL','BODYWEIGHT','ASSISTED'].indexOf(event.loadMode)<0) throw new Error('INVALID_LOAD_MODE');
    if(!finiteInt(event.loadGrams,0,MAX_LOAD_GRAMS)||!finiteInt(event.reps,1,MAX_REPS)||!finiteInt(event.partialReps,0,MAX_PARTIALS)||!finiteInt(event.completedSides,1,2)) throw new Error('INVALID_SET_VALUES');
    if(event.loadMode==='BODYWEIGHT'&&event.loadGrams!==0) throw new Error('INVALID_BODYWEIGHT_LOAD');
    ['rir','targetRir'].forEach(function(k){if(event[k]!==null&&!finiteInt(event[k],0,MAX_RIR)) throw new Error('INVALID_'+k.toUpperCase());});
  }
  function validateEvent(event){
    if(!isObject(event)||utf8Bytes(JSON.stringify(event))>MAX_EVENT_BYTES) throw new Error('INVALID_EVENT');
    var keys=validateCommon(event), type=event.eventType, extra;
    if(type==='COMPLETED_SET') extra=['exerciseId','setId','setKind','loadMode','loadGrams','reps','partialReps','rir','targetRir','completedSides'];
    else if(type==='SET_EDITED') extra=['exerciseId','setId','baseEventId','setKind','loadMode','loadGrams','reps','partialReps','rir','targetRir','completedSides'];
    else if(type==='SET_UNDONE') extra=['exerciseId','setId','baseEventId','reason'];
    else if(type==='SESSION_FINISHED') extra=['mode','durationSeconds','finalSetHeads'];
    else throw new Error('UNKNOWN_EVENT_TYPE');
    if(!keysExactly(event,keys.concat(extra))) throw new Error('UNKNOWN_OR_MISSING_FIELD');
    if(type==='COMPLETED_SET'||type==='SET_EDITED') validateSetValues(event);
    if(type==='SET_EDITED'||type==='SET_UNDONE') if(!validUuid(event.baseEventId)||event.baseEventId===event.eventId) throw new Error('INVALID_BASE_EVENT');
    if(type==='SET_UNDONE'){
      if(!validExerciseId(event.exerciseId)||!validUuid(event.setId)||(event.reason!==null&&!validText(event.reason,240))) throw new Error('INVALID_UNDO');
    }
    if(type==='SESSION_FINISHED'){
      if((event.mode!=='NORMAL'&&event.mode!=='SHORT')||!finiteInt(event.durationSeconds,0,259200)||!isObject(event.finalSetHeads)||Object.keys(event.finalSetHeads).length>512) throw new Error('INVALID_FINISH');
      Object.keys(event.finalSetHeads).forEach(function(setId){if(!validUuid(setId)||!validUuid(event.finalSetHeads[setId])) throw new Error('INVALID_FINAL_HEAD');});
    }
    return event;
  }

  function findExercise(target,day,exerciseId){
    var list=target.ficha&&target.ficha[day]&&target.ficha[day].ex||[];
    for(var i=0;i<list.length;i++){
      var ex=list[i], id=String(ex.id||'');
      if(id===exerciseId) return ex;
      if(typeof exerciseIdFor==='function'&&exerciseIdFor(ex.n)===exerciseId) return ex;
    }
    return null;
  }
  function addConflict(sync,kind,event,detail,phoneValue){
    sync.conflicts.push({kind:kind,eventId:event.eventId,sessionId:event.sessionId,setId:event.setId||null,detail:String(detail||'').slice(0,240),phoneValue:phoneValue?cleanSet(phoneValue):null,at:now()});
    if(sync.conflicts.length>200) sync.conflicts=sync.conflicts.slice(-200);
  }
  function headKey(event){ return event.sessionId+'|'+event.setId; }
  function applied(sync,eventId){ return sync.appliedEvents[eventId]||null; }
  function eventWins(candidate,currentRecord){
    if(!currentRecord) return true;
    var candidateWear=candidate.origin==='WEAR'?2:1, currentWear=currentRecord.origin==='WEAR'?2:1;
    if(candidateWear!==currentWear) return candidateWear>currentWear;
    if(candidate.originSequence!==currentRecord.originSequence) return candidate.originSequence>currentRecord.originSequence;
    if(candidate.occurredAt!==currentRecord.occurredAt) return candidate.occurredAt>currentRecord.occurredAt;
    return candidate.eventId>currentRecord.eventId;
  }
  function locateEntry(entries,kind,kindIndex,setId){
    for(var i=0;i<entries.length;i++) if(entries[i]&&entries[i].syncSetId===setId) return i;
    var seen=0;
    for(var j=0;j<entries.length;j++){
      var warm=!!(entries[j]&&(entries[j].wu!==undefined?entries[j].wu:entries[j].warmup));
      if((kind==='WARMUP')===warm){ if(seen===kindIndex) return j; seen++; }
    }
    return -1;
  }
  function materializeSet(event){
    var out={w:event.loadGrams/1000,r:event.reps,done:true,wu:event.setKind==='WARMUP',warmup:event.setKind==='WARMUP',syncSetId:event.setId,syncHeadEventId:event.eventId,loadMode:event.loadMode};
    if(event.partialReps>0) out.p=event.partialReps;
    if(event.rir!==null){ out.rir=event.rir; out.rirManual=true; }
    if(event.targetRir!==null) out.targetRir=event.targetRir;
    return out;
  }
  function matchingDraft(target,event){
    var sync=ensureSync(target), active=sync.activePlan, draft=target.draft||{};
    return !!(active&&active.sessionId===event.sessionId&&active.planId===event.planId&&draft.day);
  }
  function applySetEvent(target,event,isEdit){
    var sync=ensureSync(target), active=sync.activePlan;
    if(!matchingDraft(target,event)){ addConflict(sync,'STALE_PLAN',event,'Evento pertence a outro plano ativo'); return 'CONFLICT_STORED'; }
    var ex=findExercise(target,target.draft.day,event.exerciseId);
    if(!ex){ addConflict(sync,'UNKNOWN_EXERCISE',event,'Exercício não encontrado por ID/alias'); return 'CONFLICT_STORED'; }
    var unilateral=isUnilateralPlan(ex);
    var key=headKey(event), currentId=sync.eventHeads[key], current=currentId&&sync.appliedEvents[currentId], hadConflict=false;
    if(isEdit){
      if(!applied(sync,event.baseEventId)) return 'BLOCKED';
      if(currentId!==event.baseEventId){
        addConflict(sync,'CONCURRENT_EDIT',event,'A base não é o head atual');
        hadConflict=true;
        if(!eventWins(event,current)) return 'CONFLICT_STORED';
      }
    }else if(currentId&&currentId!==event.eventId){
      addConflict(sync,'DOUBLE_COMPLETION',event,'Duas conclusões para a mesma série');
      hadConflict=true;
      if(!eventWins(event,current)) return 'CONFLICT_STORED';
    }
    // O primeiro lado é um fato causal persistido, mas ainda não é uma série
    // concluída no draft. O segundo lado chega como edição baseada neste head.
    if(unilateral&&event.completedSides===1){
      sync.eventHeads[key]=event.eventId;
      return hadConflict?'CONFLICT_STORED':'APPLIED';
    }
    var list=target.draft.entries[ex.n]||(target.draft.entries[ex.n]=[]), meta=sync.setMeta[event.setId];
    var kindIndex=meta&&finiteInt(meta.kindIndex,0,63)?meta.kindIndex:(event.setKind==='WARMUP'?list.filter(function(s){return !!(s&&(s.wu!==undefined?s.wu:s.warmup));}).length:list.filter(function(s){return !(s&&(s.wu!==undefined?s.wu:s.warmup));}).length);
    var index=locateEntry(list,event.setKind,kindIndex,event.setId), next=materializeSet(event);
    if(index>=0){
      var old=list[index];
      if(old&&old.done===true&&!old.syncSetId){
        addConflict(sync,'PHONE_AND_WEAR_COMPLETED',event,'Conclusão local preservada para revisão',old);
        hadConflict=true;
      }
      list[index]=next;
    }else if(event.setKind==='WARMUP'){
      var firstWork=list.findIndex(function(s){return !(s&&(s.wu!==undefined?s.wu:s.warmup));});
      if(firstWork<0) list.push(next); else list.splice(firstWork,0,next);
    }else list.push(next);
    if(event.setKind==='WARMUP'&&target.draft.warmupMode){
      target.draft.warmupMode[ex.n]=false;
    }
    sync.eventHeads[key]=event.eventId;
    return hadConflict?'CONFLICT_STORED':'APPLIED';
  }
  function applyUndo(target,event){
    var sync=ensureSync(target);
    if(!applied(sync,event.baseEventId)) return 'BLOCKED';
    if(!matchingDraft(target,event)){ addConflict(sync,'STALE_UNDO',event,'Undo pertence a outro plano'); return 'CONFLICT_STORED'; }
    var key=headKey(event), currentId=sync.eventHeads[key], current=currentId&&sync.appliedEvents[currentId], hadConflict=false;
    if(currentId!==event.baseEventId){ addConflict(sync,'CONCURRENT_UNDO',event,'A base não é o head atual'); hadConflict=true; if(!eventWins(event,current)) return 'CONFLICT_STORED'; }
    var ex=findExercise(target,target.draft.day,event.exerciseId), list=ex&&(target.draft.entries[ex.n]||[]);
    if(!ex||!list){ addConflict(sync,'UNKNOWN_UNDO_TARGET',event,'Série não encontrada'); return 'CONFLICT_STORED'; }
    for(var i=list.length-1;i>=0;i--) if(list[i]&&list[i].syncSetId===event.setId) list.splice(i,1);
    sync.eventHeads[key]=event.eventId;
    return hadConflict?'CONFLICT_STORED':'APPLIED';
  }
  function cleanEntriesForHistory(entries){
    var out={}; Object.keys(entries||{}).forEach(function(name){
      out[name]=(entries[name]||[]).filter(function(s){return s&&s.done===true;}).map(function(s){
        var c={w:Number(s.w)||0,r:Number(s.r)||0,done:true,wu:!!(s.wu!==undefined?s.wu:s.warmup),warmup:!!(s.wu!==undefined?s.wu:s.warmup)};
        if(Number(s.p)>0) c.p=Math.floor(Number(s.p));
        if(s.rir!=null) c.rir=Math.max(0,Math.min(MAX_RIR,Math.round(Number(s.rir))));
        if(s.rirManual!==undefined) c.rirManual=!!s.rirManual;
        if(s.targetRir!=null) c.targetRir=Math.max(0,Math.min(MAX_RIR,Math.round(Number(s.targetRir))));
        if(validUuid(s.syncSetId)) c.syncSetId=s.syncSetId;
        if(validUuid(s.syncHeadEventId)) c.syncHeadEventId=s.syncHeadEventId;
        return c;
      });
    }); return out;
  }
  function applyFinish(target,event){
    var sync=ensureSync(target), already=sync.finishedSessions[event.sessionId];
    if(already){ if(already.eventId!==event.eventId) addConflict(sync,'DOUBLE_FINISH',event,'Sessão já finalizada'); return already.eventId===event.eventId?'ALREADY_APPLIED':'CONFLICT_STORED'; }
    var dependencies=Object.keys(event.finalSetHeads).map(function(k){return event.finalSetHeads[k];});
    if(dependencies.some(function(id){return !applied(sync,id);})) return 'BLOCKED';
    if(!matchingDraft(target,event)){ addConflict(sync,'STALE_FINISH',event,'Finalização pertence a outro plano'); return 'CONFLICT_STORED'; }
    var active=sync.activePlan, draft=target.draft, existing=(target.sessions||[]).find(function(s){return s.syncSessionId===event.sessionId;});
    var id=Math.max(1,event.occurredAt); while((target.sessions||[]).some(function(s){return s.id===id&&s!==existing;})) id++;
    var session={id:id,syncSessionId:event.sessionId,syncFinishEventId:event.eventId,date:event.logicalDate,finishedDate:todayLocal(),day:draft.day,mode:event.mode==='SHORT'?'curto':'normal',entries:cleanEntriesForHistory(draft.entries),duration:event.durationSeconds,notes:''};
    if(existing){ Object.keys(session).forEach(function(k){existing[k]=session[k];}); }
    else { if(!Array.isArray(target.sessions)) target.sessions=[]; target.sessions.push(session); }
    sync.finishedSessions[event.sessionId]={eventId:event.eventId,sessionNumericId:id,appliedAt:now()};
    target.draft={day:null,date:null,dateExplicit:false,entries:{},warmupMode:{},startedAt:null,lastActiveAt:null,sessionMode:'normal',unilateralPending:null};
    active.finishedAt=event.occurredAt;
    return 'APPLIED';
  }
  function applyOne(target,event){
    if(event.eventType==='COMPLETED_SET') return applySetEvent(target,event,false);
    if(event.eventType==='SET_EDITED') return applySetEvent(target,event,true);
    if(event.eventType==='SET_UNDONE') return applyUndo(target,event);
    return applyFinish(target,event);
  }
  function recordApplied(sync,event,hash,status){
    sync.appliedEvents[event.eventId]={fingerprint:hash,eventType:event.eventType,sessionId:event.sessionId,setId:event.setId||null,origin:event.origin,originSequence:event.originSequence,occurredAt:event.occurredAt,status:status,appliedAt:now()};
  }
  function drainPending(target,results){
    var sync=ensureSync(target), progressed=true, guard=0;
    while(progressed&&guard++<MAX_EVENTS+1){
      progressed=false;
      Object.keys(sync.pendingEvents).sort(function(a,b){
        var x=sync.pendingEvents[a].event,y=sync.pendingEvents[b].event;
        return x.occurredAt-y.occurredAt||x.originSequence-y.originSequence||(a<b?-1:1);
      }).forEach(function(id){
        var queued=sync.pendingEvents[id], status=applyOne(target,queued.event);
        results[id]={eventId:id,status:status};
        if(status!=='BLOCKED'){
          recordApplied(sync,queued.event,queued.fingerprint,status);
          delete sync.pendingEvents[id]; progressed=true;
        }
      });
    }
  }

  function applyEventsJson(envelopeJson){
    var envelope;
    try{ envelope=typeof envelopeJson==='string'?JSON.parse(envelopeJson):envelopeJson; }catch(_){return {ok:false,error:'MALFORMED_JSON',results:[]};}
    if(!isObject(envelope)||envelope.protocolVersion!==VERSION||!validUuid(envelope.envelopeId)||envelope.origin!=='WEAR'||!validUuid(envelope.originInstanceId)||!finiteInt(envelope.createdAt,1,Number.MAX_SAFE_INTEGER)||!Array.isArray(envelope.events)||envelope.events.length<1||envelope.events.length>MAX_EVENTS) return {ok:false,error:'INVALID_ENVELOPE',results:[]};
    var candidate=clone(state), sync=ensureSync(candidate), results={}, rejected=false;
    for(var i=0;i<envelope.events.length;i++){
      var event=envelope.events[i], hash;
      try{ validateEvent(event); hash=fingerprint(event); }catch(error){
        var rejectedId=event&&validUuid(event.eventId)?event.eventId:null;
        if(rejectedId) results[rejectedId]={eventId:rejectedId,status:'REJECTED',detail:String(error.message||error).slice(0,240)};
        rejected=true; continue;
      }
      var old=sync.appliedEvents[event.eventId], pending=sync.pendingEvents[event.eventId];
      if(old){
        if(old.fingerprint===hash) results[event.eventId]={eventId:event.eventId,status:'ALREADY_APPLIED'};
        else { addConflict(sync,'EVENT_ID_REUSE',event,'Mesmo eventId com payload diferente'); results[event.eventId]={eventId:event.eventId,status:'CONFLICT_STORED'}; }
        continue;
      }
      if(pending&&pending.fingerprint!==hash){ addConflict(sync,'PENDING_ID_REUSE',event,'Mesmo eventId pendente com payload diferente'); results[event.eventId]={eventId:event.eventId,status:'CONFLICT_STORED'}; recordApplied(sync,event,hash,'CONFLICT_STORED'); delete sync.pendingEvents[event.eventId]; continue; }
      if(!pending) sync.pendingEvents[event.eventId]={event:clone(event),fingerprint:hash,envelopeId:envelope.envelopeId,receivedAt:now()};
    }
    drainPending(candidate,results);
    var persisted=strictPersist(candidate);
    if(!persisted.ok) return {ok:false,error:persisted.error,detail:persisted.detail,results:[]};
    return {ok:true,protocolVersion:VERSION,envelopeId:envelope.envelopeId,results:Object.keys(results).map(function(id){return results[id];}),hadRejected:rejected};
  }

  function buildAckJson(requestJson){
    var request;
    try{ request=typeof requestJson==='string'?JSON.parse(requestJson):requestJson; }catch(_){return JSON.stringify({ok:false,error:'MALFORMED_JSON'});}
    if(!isObject(request)||!Array.isArray(request.eventIds)) return JSON.stringify({ok:false,error:'INVALID_REQUEST'});
    var sync=ensureSync(state), results=request.eventIds.slice(0,MAX_EVENTS).filter(validUuid).map(function(id){
      var appliedEvent=sync.appliedEvents[id], pending=sync.pendingEvents[id];
      return {eventId:id,status:appliedEvent?(appliedEvent.status==='CONFLICT_STORED'?'CONFLICT_STORED':'ALREADY_APPLIED'):(pending?'BLOCKED':'REJECTED')};
    });
    return JSON.stringify({ok:true,protocolVersion:VERSION,envelopeId:request.envelopeId||null,results:results});
  }

  function consumeNativeInbox(envelopeJson){
    var result=applyEventsJson(envelopeJson);
    if(result.ok){
      try{ if(root.AndroidBridge&&typeof root.AndroidBridge.confirmWearEventsApplied==='function') root.AndroidBridge.confirmWearEventsApplied(JSON.stringify(result)); }catch(_ackError){}
      try{ if(typeof render==='function') render(); }catch(_renderError){}
    }else{
      try{ if(root.AndroidBridge&&typeof root.AndroidBridge.reportWearApplyFailure==='function') root.AndroidBridge.reportWearApplyFailure(String(result.error||'UNKNOWN')); }catch(_reportError){}
    }
    return JSON.stringify(result);
  }
  function publishCurrentPlan(){
    if(publishSuppressed) return false;
    var json;
    try{ json=exportPlanJson('{}'); }catch(_){return false;}
    if(json.indexOf('"status":"EMPTY"')>=0) return false;
    try{
      if(root.AndroidBridge&&typeof root.AndroidBridge.publishWearPlan==='function'){
        root.AndroidBridge.publishWearPlan(json); return true;
      }
    }catch(_bridgeError){}
    return false;
  }
  function schedulePublish(){
    if(publishSuppressed||typeof setTimeout==='undefined') return;
    if(publishTimer) clearTimeout(publishTimer);
    publishTimer=setTimeout(function(){publishTimer=null; publishCurrentPlan();},250);
  }
  function onAppReady(){
    publishCurrentPlan();
    try{ if(root.AndroidBridge&&typeof root.AndroidBridge.requestWearInboxDrain==='function') root.AndroidBridge.requestWearInboxDrain(); }catch(_){}
  }

  var api={
    protocolVersion:VERSION,
    exportPlanJson:exportPlanJson,
    applyEventsJson:applyEventsJson,
    buildAckJson:buildAckJson,
    consumeNativeInbox:consumeNativeInbox,
    publishCurrentPlan:publishCurrentPlan,
    schedulePublish:schedulePublish,
    onAppReady:onAppReady,
    _test:{ensureSync:ensureSync,validateEvent:validateEvent,stableStringify:stableStringify,fingerprint:fingerprint,uuid:uuid}
  };
  root.EvolucaoWear=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:this));
