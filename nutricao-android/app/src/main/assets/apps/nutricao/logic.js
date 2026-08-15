/* apps/nutricao/logic.js — cálculos do dia, toast e uid */
/* ============ CALCULOS ============ */
const dayMeals=(d=today())=>meals.filter(m=>m.date===d);
const dayTotals=(d)=>{
  const t={kcal:0,p:0,c:0,g:0};
  dayMeals(d).forEach(m=>m.itens.forEach(i=>{
    t.kcal+=i.kcal||0;t.p+=i.proteina_g||0;t.c+=i.carbo_g||0;t.g+=i.gordura_g||0;
  }));
  return t;
};
const fmt=n=>Math.round(n).toLocaleString('pt-BR');
const horaNow=()=>new Date().toTimeString().slice(0,5);
function toast(msg,undoFn){
  const t=$('#toast');
  t.innerHTML=msg+(undoFn?'<button>DESFAZER</button>':'');
  t.classList.add('show');
  clearTimeout(t._to);
  t._to=setTimeout(()=>{t.classList.remove('show')},undoFn?6000:2600);
  if(undoFn){const b=t.querySelector('button');b.onclick=()=>{undoFn();t.classList.remove('show')}}
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
