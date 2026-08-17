/* apps/nutricao/logic.js — cálculos do dia, toast e uid */
/* ============ CALCULOS ============ */
const dayMeals=(d=today())=>meals.filter(m=>m.date===d);
const dayTotals=(d=today())=>{
  const t={kcal:0,p:0,c:0,g:0};
  dayMeals(d).forEach(m=>m.itens.forEach(i=>{
    t.kcal+=i.kcal||0;t.p+=i.proteina_g||0;t.c+=i.carbo_g||0;t.g+=i.gordura_g||0;
  }));
  return t;
};
const fmt=n=>Math.round(n).toLocaleString('pt-BR');
const horaNow=(d=new Date())=>{
  const isDate = d && (d instanceof Date || (typeof d === 'object' && typeof d.getTime === 'function')) && !isNaN(d.getTime());
  const date = isDate ? d : new Date();
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
};
function toast(msg,undoFn){
  const t=$('#toast');
  t.innerHTML=msg+(undoFn?'<button>DESFAZER</button>':'');
  t.classList.add('show');
  clearTimeout(t._to);
  t._to=setTimeout(()=>{t.classList.remove('show')},undoFn?6000:2600);
  if(undoFn){const b=t.querySelector('button');b.onclick=()=>{undoFn();t.classList.remove('show')}}
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}

if (typeof window !== 'undefined') {
  window.dayMeals = dayMeals;
  window.dayTotals = dayTotals;
  window.fmt = fmt;
  window.horaNow = horaNow;
  window.toast = toast;
  window.uid = uid;
}
if (typeof globalThis !== 'undefined') {
  globalThis.dayMeals = dayMeals;
  globalThis.dayTotals = dayTotals;
  globalThis.horaNow = horaNow;
}

