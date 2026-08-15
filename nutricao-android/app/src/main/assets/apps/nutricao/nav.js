/* apps/nutricao/nav.js — navegação por abas e modal */
/* ============ NAVEGACAO ============ */
$$('#nav button').forEach(b=>b.onclick=()=>{
  state.tab=b.dataset.tab;
  $$('#nav button').forEach(x=>x.classList.toggle('on',x===b));
  render();
});
$('#nav').addEventListener('click',e=>{
  const b=e.target.closest('button[data-tab]');
  if(b){state.tab=b.dataset.tab;$$('#nav button').forEach(x=>x.classList.toggle('on',x.dataset.tab===state.tab));render()}
});

/* ============ MODAL ============ */
function openModal(html){$('#modal').innerHTML=html;$('#modalBack').classList.add('show')}
function closeModal(){$('#modalBack').classList.remove('show')}
$('#modalBack').onclick=e=>{if(e.target.id==='modalBack')closeModal()};
