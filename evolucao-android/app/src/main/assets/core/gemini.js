/* core/gemini.js — análise de foto com Gemini API */
/* ============ ANALISE DE FOTO (IA) ============ */
'use strict';
const GEMINI_URL='https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
const FOOD_SCHEMA={
  type:'object',
  properties:{
    itens:{type:'array',items:{type:'object',properties:{
      nome:{type:'string'},porcao_g:{type:'number'},kcal:{type:'number'},
      proteina_g:{type:'number'},carbo_g:{type:'number'},gordura_g:{type:'number'}},
      required:['nome','porcao_g','kcal','proteina_g','carbo_g','gordura_g'],additionalProperties:false}},
    kcal_total:{type:'number'},proteina_total:{type:'number'},
    carbo_total:{type:'number'},gordura_total:{type:'number'},
    confianca:{type:'string',enum:['baixa','media','alta']}},
  required:['itens','kcal_total','proteina_total','carbo_total','gordura_total','confianca'],
  additionalProperties:false};
const FOOD_PROMPT=`Analise a foto deste prato de comida e estime o conteúdo nutricional.
Identifique todos os alimentos visíveis e estime as porções em gramas com base no tamanho do prato.
Responda APENAS com JSON no schema fornecido. Valores numéricos. Somente o que é visível na foto. Porções realistas para comida caseira brasileira.`;

function openFoto(){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/*';inp.capture='environment';
  inp.onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)processarFoto(f);else toast('Nenhuma foto recebida — tente de novo, ou use a galeria')};
  inp.onclick=()=>{toast('Abra a camera/galeria…')};
  inp.click();
}
function abrirFoto(){openFoto()}
window.__testProcessarFoto=f=>processarFoto(f); // acesso p/ teste automático (ignorado pelo app)
function abrirManual(){modalManual()}

function modalManual(){
  openModal(`
    <h2>Adicionar refeição</h2>
    <label>Nome da refeição</label>
    <input id="fNome" placeholder="Ex: Almoço" value="Refeição"/>
    <div id="fItens" class="mt8"></div>
    <button class="bigbtn secondary mt8" onclick="addLinha()">+ Adicionar alimento</button>
    <div class="det-total mt8">Total: <span class="v" id="fTotal">0 kcal</span></div>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmManual()">Salvar</button>
    </div>`);
  addLinha();
}
function addLinha(){
  const box=$('#fItens');
  const d=document.createElement('div');
  d.className='det-item';
  d.innerHTML=`<input placeholder="Alimento" style="flex:1.4" oninput="updFTotal()"/>
    <input type="number" placeholder="g" class="d-qty" value="100" oninput="updFTotal()"/>
    <input type="number" placeholder="kcal" class="d-kcal" style="color:var(--accent);width:60px" oninput="updFTotal()"/>
    <button class="det-del" onclick="this.parentElement.remove();updFTotal()"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" stroke="#9a9aa4" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
  box.appendChild(d);
}
window.addLinha=addLinha;
function updFTotal(){
  let t=0;Array.from(document.querySelectorAll('#fItens .d-kcal')).forEach(x=>t+=parseFloat(x.value)||0);
  $('#fTotal').textContent=fmt(t)+' kcal';
}
window.updFTotal=updFTotal;
function confirmManual(){
  const nome=$('#fNome').value.trim()||'Refeição';
  const itens=[];
  Array.from(document.querySelectorAll('#fItens .det-item')).forEach(d=>{
    const ins=Array.from(d.querySelectorAll('input'));
    const n=ins[0].value.trim();const g=parseFloat(ins[1].value)||0;const k=parseFloat(ins[2].value)||0;
    if(k>0)itens.push({nome:n||'Alimento',porcao_g:g,kcal:Math.round(k),proteina_g:0,carbo_g:0,gordura_g:0});
  });
  if(!itens.length){toast('Adicione ao menos um alimento com calorias');return}
  meals.push({id:uid(),date:today(),hour:horaNow(),nome,itens,origem:'manual'});
  save(LS.m,meals);closeModal();toast('Refeição salva!');render();
}
window.confirmManual=confirmManual;

async function processarFoto(file){
  if(!apikey){
    toast('Configure a chave da API em Ajustes primeiro',null);
    setTimeout(()=>{state.tab='ajustes';render()},300);
    return;
  }
  let b64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.onerror=no;r.readAsDataURL(file)});
  // redimensiona para max 1024px (canvas) p/ velocidade
  const img=new Image();
  let finalB64=b64;
  try{
    await new Promise((ok,no)=>{img.onload=()=>ok();img.onerror=no;img.src='data:image/jpeg;base64,'+b64});
    const MAX=1024;
    if(img.naturalWidth>MAX||img.naturalHeight>MAX){
      const c=document.createElement('canvas');
      const sc=Math.min(MAX/img.naturalWidth,MAX/img.naturalHeight);
      c.width=Math.round(img.naturalWidth*sc);c.height=Math.round(img.naturalHeight*sc);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      finalB64=c.toDataURL('image/jpeg',0.8).split(',')[1];
    }
  }catch(e){
    // imagem inválida (ex.: bytes corrompidos) — usa o original mesmo assim
    finalB64=b64;
  }

  openModal(`<h2>Analisando prato…</h2>
    <img id="foto-preview" src="data:image/jpeg;base64,${finalB64}" style="display:block"/>
    <div id="aiSteps"></div>`);
  $('#foto-preview').style.display='block';
  const steps=$('#aiSteps');
  const n=pref.precisao==='precisa'?3:1;
  steps.innerHTML=Array.from({length:n},(_, i)=>`<div class="ai-step"><div class="spin"></div><span>Análise ${i+1} de ${n}…</span></div>`).join('');

  const body=(data)=>({contents:[{parts:[{text:FOOD_PROMPT},{inline_data:{mime_type:'image/jpeg',data}}]}],
    generationConfig:{responseMimeType:'application/json',responseSchema:FOOD_SCHEMA,maxOutputTokens:1024}});

  let results=[];
  const fetchComRetry=async (tent,tentativas,delayMs)=>{
    // retry com exponential backoff + jitter apenas para erros transitórios (429/5xx), conforme recomendado pela Google
    for(let t=0;t<tentativas;t++){
      const resp=await fetch(GEMINI_URL+'?key='+encodeURIComponent(apikey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body(finalB64))});
      if(resp.ok)return resp;
      const status=resp.status;
      const ehTransitorio=(status>=429&&status<520);
      const ultimo=(t===tentativas-1)||(t===tentativas-2&&tent===tentativas-1);
      if(!ehTransitorio||ultimo){
        const err=await resp.text();
        throw new Error('API '+status+'|'+err.slice(0,100));
      }
      const jitter=Math.random()*500;
      await new Promise(r=>setTimeout(r,delayMs+jitter));
    }
  };
  for(let i=0;i<n;i++){
    try{
      const resp=await fetchComRetry(i+1,3,2000*(i+1));
      const j=await resp.json();
      const txt=j.candidates?.[0]?.content?.parts?.[0]?.text;
      if(!txt)throw new Error('resposta vazia');
      results.push(JSON.parse(txt));
    }catch(e){
      // registra erro, continua com as respostas obtidas
      window.__lastAiErrors=(window.__lastAiErrors||'')+' '+(e&&e.message||e);
      console.log('AI erro analise '+(i+1)+':',e&&e.message);
      results.push(null);
      if(i===n-1&&results.filter(Boolean).length===0&&i>0){
        // mostra o primeiro erro na tela se ja vai falhar de vez
        steps.innerHTML=`<div class="ai-step" style="color:var(--bad)"><span>Erro na analise: ${String(e&&e.message||e).slice(0,140)}</span></div>`;
      }
    }
    const s=steps.querySelectorAll('.ai-step')[i];
    if(s)s.innerHTML=results[i]
      ?`<div class="ai-step" style="color:var(--ok)"><span>✓ Análise ${i+1}: ${Math.round(results[i].kcal_total||0)} kcal</span></div>`
      :`<div class="ai-step" style="color:var(--bad)"><span>✗ Análise ${i+1} falhou</span></div>`;
  }
  
  const validos=results.filter(Boolean);
  if(!validos.length){
    const ehServidor=/API (50[034]|429)\|/.test(window.__lastAiErrors||'');
    const msg=ehServidor
      ?'O serviço de IA do Google está temporariamente sobrecarregado (erro do servidor). Aguarde alguns minutos e tente novamente. Sua chave continua válida.'
      :'Não foi possível analisar a foto. Verifique a chave da API em Ajustes e a conexão com a internet.';
    steps.innerHTML=`<div class="ai-step" style="color:var(--bad)"><span>${msg}</span></div>
      <div class="row mt12"><button class="bigbtn secondary" onclick="closeModal()">Fechar</button>
      <button class="bigbtn primary" onclick="closeModal();modalManual()">Adicionar manual</button></div>`;
    return;
  }
  // média + outlier
  let final=mergeAnalisys(validos);
  mostrarConfirmacaoFoto(final,n,validos);
}
function mergeAnalisys(res){
  const fields=['kcal_total','proteina_total','carbo_total','gordura_total'];
  const out={};
  fields.forEach(f=>{
    const vals=res.map(r=>r[f]||0);
    const sorted=[...vals].sort((a,b)=>a-b);
    let usados=sorted;
    if(sorted.length>=3){
      const mediana=sorted[1];
      const dist=sorted.map(v=>Math.abs(v-mediana));
      const imax=dist.indexOf(Math.max(...dist));
      if(dist[imax]>0.5*mediana&&mediana>0){
        usados=sorted.filter((_,i)=>i!==imax);
      }
    }
    out[f]=Math.round(usados.reduce((a,b)=>a+b,0)/usados.length);
  });
  // itens: base na primeira resposta válida
  out.itens=res[0].itens.map(i=>({...i}));
  out.confianca=res[0].confianca;
  return out;
}
function desvioPct(vals){
  const m=vals.reduce((a,b)=>a+b,0)/vals.length;
  if(!m)return 0;
  return Math.round(Math.sqrt(vals.reduce((a,v)=>a+(v-m)**2,0)/vals.length)/m*100);
}
function mostrarConfirmacaoFoto(final,n,responses){
  const varPct=desvioPct(responses.map(r=>r.kcal_total||0));
  const accHtml=responses.length>1?`<div class="det-acc"><button class="on" disabled>Precisa (3×)</button></div>
    <p class="small mb8">Média de ${responses.length} análises · variação entre respostas: <b style="color:${varPct>25?'var(--bad)':varPct>15?'var(--accent)':'var(--ok)'}">${varPct}%</b></p>`:`
    <p class="small mb8">Análise rápida · valores estimados, edite se precisar</p>`;
  openModal(`<h2>Prato identificado</h2>
    <img id="foto-preview" src="data:image/jpeg;base64,${window.__fotoB64||''}" style="display:block"/>
    ${accHtml}
    <div id="itensBox"></div>
    <div class="det-total">Total: <span class="v" id="cTotal">${final.kcal_total} kcal</span></div>
    <div class="small" style="margin-top:6px">P <b style="color:#7ec8ff">${final.proteina_total}g</b> · C <b style="color:#3ddc84">${final.carbo_total}g</b> · G <b style="color:#f2a2ff">${final.gordura_total}g</b></div>
    <label style="margin-top:12px">Nome da refeição</label>
    <input id="cNome" value="Refeição com foto" style="margin-bottom:4px"/>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmFoto()">Confirmar</button>
    </div>`);
  const box=$('#itensBox');
  box.innerHTML=final.itens.map((it,i)=>`
    <div class="det-item" data-i="${i}">
      <input value="${it.nome}" style="flex:1.5" oninput="updItem(${i},'nome',this.value)"/>
      <input type="number" class="d-qty" value="${it.porcao_g}" oninput="updItem(${i},'porcao_g',this.value)"/>
      <span class="small" style="color:var(--txt3)">g</span>
      <input type="number" class="d-kcal" value="${Math.round(it.kcal||0)}" oninput="updItem(${i},'kcal',this.value)"/>
      <button class="det-del" onclick="rmItem(${i})"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" stroke="#9a9aa4" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    </div>`).join('')+
    `<button class="bigbtn secondary mt8" style="font-size:13px;min-height:44px;padding:10px" onclick="addItemFoto()">+ Adicionar item</button>
     <div class="formrow three mt8">
       <div><label>P (g)</label><input id="cP" type="number" value="${final.proteina_total}" oninput="updTotais()"/></div>
       <div><label>C (g)</label><input id="cC" type="number" value="${final.carbo_total}" oninput="updTotais()"/></div>
       <div><label>G (g)</label><input id="cG" type="number" value="${final.gordura_total}" oninput="updTotais()"/></div>
     </div>`;
  window.__fotoItens=final.itens;
}
window.__fotoB64='';
window.updItem=(i,k,v)=>{const it=window.__fotoItens[i];if(!it)return;it[k]=k==='nome'?v:parseFloat(v)||0;updTotais()};
window.rmItem=i=>{window.__fotoItens.splice(i,1);mostrarConfirmacaoFoto.__skip=true;
  // re-renderiza o box de itens mantendo o modal aberto
  const box=$('#itensBox');
  box.innerHTML=window.__fotoItens.map((it,j)=>`
    <div class="det-item" data-i="${j}">
      <input value="${it.nome}" style="flex:1.5" oninput="updItem(${j},'nome',this.value)"/>
      <input type="number" class="d-qty" value="${it.porcao_g}" oninput="updItem(${j},'porcao_g',this.value)"/>
      <span class="small" style="color:var(--txt3)">g</span>
      <input type="number" class="d-kcal" value="${Math.round(it.kcal||0)}" oninput="updItem(${j},'kcal',this.value)"/>
      <button class="det-del" onclick="rmItem(${j})"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" stroke="#9a9aa4" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    </div>`).join('')+
    `<button class="bigbtn secondary mt8" style="font-size:13px;min-height:44px;padding:10px" onclick="addItemFoto()">+ Adicionar item</button>
     <div class="formrow three mt8">
       <div><label>P (g)</label><input id="cP" type="number" value="${$('#cP')?.value||0}" oninput="updTotais()"/></div>
       <div><label>C (g)</label><input id="cC" type="number" value="${$('#cC')?.value||0}" oninput="updTotais()"/></div>
       <div><label>G (g)</label><input id="cG" type="number" value="${$('#cG')?.value||0}" oninput="updTotais()"/></div>
     </div>`;
  updTotais();
};
window.addItemFoto=()=>{window.__fotoItens.push({nome:'Item',porcao_g:100,kcal:0,proteina_g:0,carbo_g:0,gordura_g:0});window.rmItem(window.__fotoItens.length-1)};
function updTotais(){
  const its=window.__fotoItens||[];
  const k=its.reduce((a,i)=>a+(i.kcal||0),0);
  const el=$('#cTotal');if(el)el.textContent=fmt(k)+' kcal';
}
window.updTotais=updTotais;
window.confirmFoto=()=>{
  const nome=$('#cNome').value.trim()||'Refeição com foto';
  const itens=window.__fotoItens.filter(i=>(i.kcal||0)>0);
  if(!itens.length){toast('Nenhum item com calorias');return}
  meals.push({id:uid(),date:today(),hour:horaNow(),nome,itens,origem:'foto'});
  save(LS.m,meals);closeModal();toast('Refeição salva!');render();
};
window.confirmFoto=confirmFoto;
window.rmItem=rmItem;
window.updItem=updItem;
window.addItemFoto=addItemFoto;
