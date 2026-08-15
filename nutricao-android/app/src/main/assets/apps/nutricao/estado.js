/* apps/nutricao/estado.js — chaves de storage, datas e helpers de persistência */
/* ============ ESTADO ============ */
const LS={m:'nt_meals',t:'nt_todos',p:'nt_profile',k:'nt_apikey',pref:'nt_pref'};
const DIAS=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const today=()=>new Date().toISOString().slice(0,10);
const dateKey=(d=new Date())=>d.toISOString().slice(0,10);
const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

let state={tab:'hoje'};
let profile=load(LS.p,{kcal:2200,p:120,c:250,g:70,peso:75,altura:175,idade:30,sexo:'m',atividade:1.4,metaMetodo:'manual'});
let meals=load(LS.m,[]); // {id,date,hour,nome,itens:[{nome,porcao_g,kcal,proteina_g,carbo_g,gordura_g}],origem:'foto|manual|fixo'}
let apikey=localStorage.getItem(LS.k)||'';
let pref=load(LS.pref,{precisao:'precisa',paralelo:false}); // precisa (3x) ou rapida (1x)
pref=pref&&typeof pref==='object'?pref:{};
pref.precisao=pref.precisao==='rapida'?'rapida':'precisa';
pref.paralelo=!!pref.paralelo;
