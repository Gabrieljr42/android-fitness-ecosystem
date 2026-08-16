/* apps/nutricao/estado.js — chaves de storage, datas e helpers de persistência */
/* ============ ESTADO ============ */
const LS = {
  m: 'nt_meals',
  t: 'nt_todos',
  p: 'nt_profile',
  k: 'nt_apikey',
  pref: 'nt_pref',
  habits: 'nt_habits',
  water: 'nt_water',
  reminders: 'nt_reminders',
  act: 'nt_activities'
};
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const today = () => new Date().toISOString().slice(0, 10);
const dateKey = (d = new Date()) => d.toISOString().slice(0, 10);
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch(e) { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let state = { tab: 'hoje' };
let profile = load(LS.p, {
  kcal: 2200, p: 120, c: 250, g: 70, peso: 75, altura: 175, idade: 30, sexo: 'm', atividade: 1.4, metaMetodo: 'manual',
  metaAgua: 3000
});
if (profile.metaAgua == null) profile.metaAgua = 3000;

let meals = load(LS.m, []); // {id,date,hour,nome,itens:[{nome,porcao_g,kcal,proteina_g,carbo_g,gordura_g}],origem:'foto|manual|ia_texto|plano',plano?:string}
let activities = load(LS.act, []); // {id,date,data,hour,hora,nome,duracaoMin,duracao_min,intensidade,met,kcal,kcal_gasto,origem:'ia_texto'|'manual',segmentos?:[...]}
let apikey = localStorage.getItem(LS.k) || '';
let pref = load(LS.pref, { precisao: 'precisa', paralelo: false }); // precisa (3x) ou rapida (1x)
pref = pref && typeof pref === 'object' ? pref : {};
pref.precisao = pref.precisao === 'rapida' ? 'rapida' : 'precisa';
pref.paralelo = !!pref.paralelo;

let habits = load(LS.habits, {}); // { "YYYY-MM-DD": { creatina: boolean } }
let water = load(LS.water, {});   // { "YYYY-MM-DD": number }

// --- Helpers de Atividades / Gasto Calórico (M2) ---
function saveActivities(list) {
  activities = Array.isArray(list) ? list : [];
  save(LS.act, activities);
  return activities;
}

function dayActivities(d = today()) {
  return (activities || []).filter(a => (a.date === d || a.data === d));
}

function dayBurned(d = today()) {
  return dayActivities(d).reduce((sum, a) => sum + (Number(a.kcal_gasto ?? a.kcal) || 0), 0);
}

function addActivity(act) {
  if (!act || typeof act !== 'object') act = {};
  const d = act.date || act.data || today();
  const h = act.hour || act.hora || (typeof horaNow === 'function' ? horaNow() : new Date().toTimeString().slice(0, 5));
  const dur = Number(act.duracaoMin ?? act.duracao_min) || 0;
  const k = Number(act.kcal_gasto ?? act.kcal) || 0;
  const m = Number(act.met ?? act.met_medio) || 0;

  const item = {
    id: act.id || (typeof uid === 'function' ? uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
    date: d,
    data: d,
    hour: h,
    hora: h,
    nome: String(act.nome || act.nome_atividade || 'Exercício').trim() || 'Exercício',
    duracaoMin: dur,
    duracao_min: dur,
    intensidade: act.intensidade || 'moderada',
    met: m,
    kcal: k,
    kcal_gasto: k,
    origem: act.origem || 'manual',
    segmentos: Array.isArray(act.segmentos) ? act.segmentos.map(s => ({ ...s })) : []
  };

  activities.push(item);
  save(LS.act, activities);
  return item;
}

function delActivity(id) {
  const idx = activities.findIndex(a => a.id === id);
  if (idx < 0) return null;
  const removido = activities.splice(idx, 1)[0];
  save(LS.act, activities);
  return removido;
}

// BMR (TMB) e TDEE — Equação Mifflin-St Jeor
function calcBMR(p = profile) {
  const peso = Number(p?.peso) || 75;
  const alt = Number(p?.altura) || 175;
  const idade = Number(p?.idade) || 30;
  const sexo = p?.sexo === 'f' ? 'f' : 'm';
  return sexo === 'm'
    ? (10 * peso + 6.25 * alt - 5 * idade + 5)
    : (10 * peso + 6.25 * alt - 5 * idade - 161);
}

function calcTDEE(p = profile) {
  const bmr = calcBMR(p);
  const fator = Number(p?.atividade) || 1.4;
  return Math.round(bmr * fator);
}

// --- Helpers de Creatina / Habitos ---
function getCreatinaStatus(date = today()) {
  if (habits && habits[date] && typeof habits[date].creatina === 'boolean') {
    return habits[date].creatina;
  }
  const legacy = load(`nt_habits_${date}`, null);
  if (legacy && typeof legacy.creatina === 'boolean') return legacy.creatina;
  if (legacy && typeof legacy.creatine === 'boolean') return legacy.creatine;
  return false;
}

function toggleCreatina(date = today()) {
  const current = getCreatinaStatus(date);
  const next = !current;
  if (!habits || typeof habits !== 'object') habits = {};
  if (!habits[date]) habits[date] = {};
  habits[date].creatina = next;
  save(LS.habits, habits);
  save(`nt_habits_${date}`, { creatina: next, creatine: next });
  return next;
}

// --- Helpers de Hidratacao / Agua ---
function getWaterGoal() {
  return (profile && Number(profile.metaAgua) > 0) ? Number(profile.metaAgua) : 3000;
}

function setWaterGoal(ml) {
  const goal = Math.max(500, Math.min(10000, Number(ml) || 3000));
  profile.metaAgua = goal;
  save(LS.p, profile);
  return goal;
}

function getWaterIntake(date = today()) {
  if (water && typeof water[date] === 'number') {
    return Math.max(0, water[date]);
  }
  if (water && water[date] && typeof water[date].current_ml === 'number') {
    return Math.max(0, water[date].current_ml);
  }
  const legacy = load(`nt_water_${date}`, null);
  if (typeof legacy === 'number') return Math.max(0, legacy);
  if (legacy && typeof legacy.current_ml === 'number') return Math.max(0, legacy.current_ml);
  return 0;
}

function addWaterIntake(ml, date = today()) {
  const current = getWaterIntake(date);
  const next = Math.max(0, current + (Number(ml) || 0));
  if (!water || typeof water !== 'object') water = {};
  water[date] = next;
  save(LS.water, water);
  save(`nt_water_${date}`, { current_ml: next, goal_ml: getWaterGoal() });
  return next;
}

function setWaterIntake(ml, date = today()) {
  const next = Math.max(0, Number(ml) || 0);
  if (!water || typeof water !== 'object') water = {};
  water[date] = next;
  save(LS.water, water);
  save(`nt_water_${date}`, { current_ml: next, goal_ml: getWaterGoal() });
  return next;
}

// Global exports
window.LS = LS;
window.today = today;
window.activities = activities;
window.saveActivities = saveActivities;
window.dayActivities = dayActivities;
window.dayBurned = dayBurned;
window.addActivity = addActivity;
window.delActivity = delActivity;
window.calcBMR = calcBMR;
window.calcTDEE = calcTDEE;
window.getCreatinaStatus = getCreatinaStatus;
window.toggleCreatina = toggleCreatina;
window.getWaterGoal = getWaterGoal;
window.setWaterGoal = setWaterGoal;
window.getWaterIntake = getWaterIntake;
window.addWaterIntake = addWaterIntake;
window.setWaterIntake = setWaterIntake;
