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
/* Escapamento compartilhado. Nomes de refeições/alimentos/lembr vêm de IA,
   digitação manual ou backup importado — SEMPRE passem por esta função antes
   de entrar em template strings que viram innerHTML. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}
function localDateStr(d = new Date()) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return d;
  }
  const isDate = d && (d instanceof Date || (typeof d === 'object' && typeof d.getTime === 'function')) && !isNaN(d.getTime());
  const date = isDate
    ? d
    : (typeof d === 'number' || (typeof d === 'string' && d.length >= 10)) ? new Date(d) : new Date();
  if (isNaN(date.getTime())) {
    const fallback = new Date();
    return fallback.getFullYear() + '-' + String(fallback.getMonth() + 1).padStart(2, '0') + '-' + String(fallback.getDate()).padStart(2, '0');
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function today() { return localDateStr(); }
function dateKey(d = new Date()) { return localDateStr(d); }
function todayISO() { return localDateStr(); }
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch(e) { return d; } };
let __saveFailedShown = false;
let __nutritionSyncTimer = null;
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    queueNutritionSync();
  } catch (e) {
    /* Única fronteira durável do app: falha (cota/storage cheio) precisa ser
       visível. Aviso uma vez por sessão para não irritar em operação normal. */
    try { console.warn('[nutritrack] falha ao salvar', k, e); } catch(_) {}
    if (!__saveFailedShown && typeof toast === 'function') {
      __saveFailedShown = true;
      toast('⚠ Falha ao salvar dados localmente — exporte um backup!');
    }
  }
};

let state = { tab: 'hoje', activeDate: today() };

function isValidDateKey(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3]);
}

function getActiveDate() {
  const current = today();
  if (!isValidDateKey(state.activeDate) || state.activeDate > current) {
    state.activeDate = current;
  }
  return state.activeDate;
}

function setActiveDate(value, shouldRender = true) {
  const candidate = String(value ?? '');
  if (!isValidDateKey(candidate)) {
    if (typeof toast === 'function') toast('Escolha uma data válida.');
    return false;
  }
  if (candidate > today()) {
    if (typeof toast === 'function') toast('Só é possível registrar hoje ou em dias anteriores.');
    return false;
  }
  state.activeDate = candidate;
  if (shouldRender && typeof render === 'function') render();
  return true;
}

function shiftActiveDate(days) {
  const date = new Date(getActiveDate() + 'T12:00:00');
  date.setDate(date.getDate() + Number(days || 0));
  return setActiveDate(localDateStr(date));
}

function resetActiveDate() {
  return setActiveDate(today());
}

function getEntryDate(value, fallback = getActiveDate()) {
  const candidate = String(value || fallback || '');
  return isValidDateKey(candidate) && candidate <= today() ? candidate : null;
}
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

/* Exportação mínima para o Coach. Nunca inclui nomes/itens de refeições,
   fotos, atividades, hábitos, preferências ou chave Gemini. */
function buildCoachNutritionExport() {
  const finite = (value, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(max, number)) : 0;
  };
  const dates = new Set();
  (Array.isArray(meals) ? meals : []).forEach(meal => {
    const date = meal && String(meal.date || meal.data || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date);
  });
  if (water && typeof water === 'object') {
    Object.keys(water).forEach(date => { if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date); });
  }
  const currentDate = today();
  const currentLegacyWater = load(`nt_water_${currentDate}`, null);
  if (currentLegacyWater !== null) dates.add(currentDate);
  const days = Array.from(dates).sort().slice(-120).map(date => {
    const dailyMeals = (Array.isArray(meals) ? meals : []).filter(meal =>
      meal && String(meal.date || meal.data || '').slice(0, 10) === date
    );
    const totals = dailyMeals.reduce((sum, meal) => {
      (Array.isArray(meal.itens) ? meal.itens : []).forEach(item => {
        sum.energyKcal += finite(item && item.kcal, 10000);
        sum.proteinG += finite(item && (item.proteina_g ?? item.p), 1000);
        sum.carbsG += finite(item && (item.carbo_g ?? item.c), 2000);
        sum.fatG += finite(item && (item.gordura_g ?? item.g), 1000);
      });
      return sum;
    }, { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    const hasPrimaryWater = !!(water && typeof water === 'object' && Object.prototype.hasOwnProperty.call(water, date));
    const legacyWater = load(`nt_water_${date}`, null);
    const hasWaterLog = hasPrimaryWater || legacyWater !== null;
    const waterValue = hasPrimaryWater
      ? (water[date] && typeof water[date] === 'object' ? water[date].current_ml : water[date])
      : (legacyWater && typeof legacyWater === 'object' ? legacyWater.current_ml : legacyWater);
    return {
      date,
      mealCount: dailyMeals.length,
      hasWaterLog,
      energyKcal: Math.round(finite(totals.energyKcal, 100000)),
      proteinG: +finite(totals.proteinG, 10000).toFixed(1),
      carbsG: +finite(totals.carbsG, 20000).toFixed(1),
      fatG: +finite(totals.fatG, 10000).toFixed(1),
      waterMl: Math.round(finite(waterValue, 20000)),
      targets: {
        energyKcal: Math.round(finite(profile && profile.kcal, 10000)),
        proteinG: +finite(profile && profile.p, 1000).toFixed(1),
        carbsG: +finite(profile && profile.c, 2000).toFixed(1),
        fatG: +finite(profile && profile.g, 1000).toFixed(1),
        waterMl: Math.round(finite(profile && profile.metaAgua, 20000))
      }
    };
  }).filter(day => day.mealCount > 0 || day.hasWaterLog);
  return { schemaVersion: 1, days };
}

function syncNutritionNative() {
  try {
    if (typeof AndroidBridge !== 'undefined' && AndroidBridge.syncNutritionSummary) {
      AndroidBridge.syncNutritionSummary(JSON.stringify(buildCoachNutritionExport()));
    }
  } catch (_) {}
}

function queueNutritionSync() {
  if (typeof AndroidBridge === 'undefined' || !AndroidBridge.syncNutritionSummary) return;
  if (typeof clearTimeout === 'function') clearTimeout(__nutritionSyncTimer);
  __nutritionSyncTimer = typeof setTimeout === 'function' ? setTimeout(syncNutritionNative, 0) : null;
}

// Publica dados que já estavam salvos antes da atualização do aplicativo.
queueNutritionSync();

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
  const d = act.date || act.data || (typeof getActiveDate === 'function' ? getActiveDate() : today());
  const h = act.hour || act.hora || (typeof horaNow === 'function' ? horaNow() : (function() { const now = new Date(); return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'); })());
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
if (typeof window !== 'undefined') {
  window.LS = LS;
  window.escapeHtml = escapeHtml;
  window.localDateStr = localDateStr;
  window.today = today;
  window.dateKey = dateKey;
  window.todayISO = todayISO;
  window.isValidDateKey = isValidDateKey;
  window.getActiveDate = getActiveDate;
  window.setActiveDate = setActiveDate;
  window.shiftActiveDate = shiftActiveDate;
  window.resetActiveDate = resetActiveDate;
  window.getEntryDate = getEntryDate;
  window.activities = activities;
  window.saveActivities = saveActivities;
  window.buildCoachNutritionExport = buildCoachNutritionExport;
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
}
if (typeof globalThis !== 'undefined') {
  globalThis.localDateStr = localDateStr;
  globalThis.escapeHtml = typeof escapeHtml === 'function' ? escapeHtml : globalThis.escapeHtml;
  globalThis.today = today;
  globalThis.dateKey = dateKey;
  globalThis.todayISO = todayISO;
  globalThis.isValidDateKey = isValidDateKey;
  globalThis.getActiveDate = getActiveDate;
  globalThis.setActiveDate = setActiveDate;
  globalThis.shiftActiveDate = shiftActiveDate;
  globalThis.resetActiveDate = resetActiveDate;
  globalThis.getEntryDate = getEntryDate;
}
