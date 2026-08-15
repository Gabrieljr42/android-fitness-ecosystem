/* core/gemini.js — fluxo de análise de fotos com Gemini */
const GEMINI_API_BASE='https://generativelanguage.googleapis.com/v1beta/models/';
const GEMINI_MODELS=[
  {id:'gemini-3.7-flash',label:'Gemini 3.7 Flash',thinkingLevel:'low'},
  {id:'gemini-3.6-flash',label:'Gemini 3.6 Flash',thinkingLevel:'low'},
  {id:'gemini-3.5-flash',label:'Gemini 3.5 Flash',thinkingLevel:'low'}
];
const RETRY_DELAY_MS=3000;
const FOOD_SCHEMA={
  type:'object',
  properties:{
    nome_refeicao:{type:'string'},
    itens:{type:'array',items:{type:'object',properties:{
      nome:{type:'string'},porcao_g:{type:'number'},kcal:{type:'number'},
      proteina_g:{type:'number'},carbo_g:{type:'number'},gordura_g:{type:'number'}},
      required:['nome','porcao_g','kcal','proteina_g','carbo_g','gordura_g']}},
    kcal_total:{type:'number'},proteina_total:{type:'number'},
    carbo_total:{type:'number'},gordura_total:{type:'number'},
    confianca:{type:'string',enum:['baixa','media','alta']}
  },
  required:['nome_refeicao','itens','kcal_total','proteina_total','carbo_total','gordura_total','confianca']
};
const FOOD_PROMPT=`Analise a foto deste prato de comida e estime o conteúdo nutricional.
Identifique todos os alimentos visíveis e estime as porções em gramas com base no tamanho do prato.
Retorne também nome_refeicao com um nome curto e descritivo para o prato ou bebida, por exemplo "Shake de banana com whey".
Preencha proteínas, carboidratos e gorduras em gramas para cada item e também nos totais.
Responda APENAS com JSON no schema fornecido. Valores numéricos. Somente o que é visível na foto. Porções realistas para comida caseira brasileira.`;

function promptComLegenda(legenda){
  const descricao=String(legenda||'').trim().slice(0,500);
  return descricao
    ?`${FOOD_PROMPT}\n\nDescrição adicional fornecida pelo usuário (use como pista, sem inventar itens que não aparecem na foto): ${descricao}`
    :FOOD_PROMPT;
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function limitApiText(value,max=8000){
  const text=String(value??'');
  return text.length>max?text.slice(0,max)+'\n… (resposta cortada na tela)':text;
}
function prettyApiBody(raw){
  if(!raw)return '(corpo vazio)';
  try{return JSON.stringify(JSON.parse(raw),null,2)}catch(e){return String(raw)}
}
function apiHint(status){
  if(status===400)return 'A requisição foi rejeitada. Confira o formato da imagem e os parâmetros enviados.';
  if(status===401)return 'A chave está ausente ou inválida. Gere uma chave nova no Google AI Studio.';
  if(status===403)return 'A chave não tem permissão para este projeto/modelo ou está bloqueada/restrita.';
  if(status===404)return 'O modelo ou o endereço da API não foi encontrado.';
  if(status===429)return 'A cota ou o limite de requisições foi atingido. Tente novamente mais tarde ou use o modo rápido.';
  if(status>=500)return 'O serviço do Google apresentou uma falha temporária. O app tenta novamente e alterna entre 3.7, 3.6 e 3.5 Flash automaticamente.';
  return status?'Veja o detalhe retornado pelo Google abaixo.':'Não foi possível conectar ao serviço do Google.';
}
function apiTraceHtml(trace,index){
  const ok=trace.ok;
  const number=(trace.analysisIndex??index)+1;
  const model=trace.modelLabel||trace.modelId||'Gemini';
  const attempt=trace.attempt?` · tentativa ${trace.attempt}`:'';
  const status=trace.status?`HTTP ${trace.status}`:'sem resposta HTTP';
  const title=ok?`✓ Análise ${number} · ${model}${attempt} · ${status}`:`✕ Análise ${number} · ${model}${attempt} · ${status}`;
  const content=ok
    ?`JSON produzido pelo modelo:\n${trace.modelText||'(resposta sem texto)'}\n\nResposta HTTP completa:\n${prettyApiBody(trace.body)}`
    :`${trace.error||'Falha desconhecida'}\n\nRetorno bruto:\n${prettyApiBody(trace.body)}`;
  return `<details class="api-return ${ok?'ok':'bad'}"${ok?'':' open'}><summary>${title}</summary><pre>${escapeHtml(limitApiText(content))}</pre></details>`;
}
function isRetryableStatus(status){return status==null||[408,429,500,502,503,504].includes(status)}
function waitMs(ms,run){
  return new Promise(resolve=>{
    const timer=setTimeout(resolve,ms);
    if(run)run.waiters.push(()=>{clearTimeout(timer);resolve()});
  });
}
function apiBody(data,model,legenda=''){
  return {contents:[{parts:[{text:promptComLegenda(legenda)},{inline_data:{mime_type:'image/jpeg',data}}]}],
    generationConfig:{responseMimeType:'application/json',responseSchema:FOOD_SCHEMA,
      thinkingConfig:{thinkingLevel:model.thinkingLevel},maxOutputTokens:4096}};
}
async function consultarModelo(model,data,analysisIndex,attempt,key,legenda='',run=null){
  const trace={ok:false,analysisIndex,attempt,modelId:model.id,modelLabel:model.label,
    status:null,body:'',modelText:'',error:'',retryable:false,result:null,cancelled:false};
  try{
    if(run?.cancelled){trace.cancelled=true;trace.error='Análise encerrada pelo usuário';return trace}
    const url=GEMINI_API_BASE+model.id+':generateContent?key='+encodeURIComponent(key);
    const resp=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(apiBody(data,model,legenda)),signal:run?.controller?.signal});
    trace.status=resp.status;
    trace.body=await resp.text();
    let json=null;
    try{json=trace.body?JSON.parse(trace.body):null}catch(e){}
    if(!resp.ok){
      const msg=json?.error?.message||json?.message||`HTTP ${resp.status}`;
      throw new Error(msg);
    }
    const txt=json?.candidates?.[0]?.content?.parts?.[0]?.text;
    const block=json?.promptFeedback?.blockReason;
    if(!txt)throw new Error(block?`resposta bloqueada (${block})`:'resposta vazia');
    trace.modelText=txt;
    const jsonTxt=String(txt).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
    trace.result=JSON.parse(jsonTxt);
    trace.ok=true;
  }catch(e){
    trace.cancelled=!!run?.cancelled||e?.name==='AbortError';
    trace.error=trace.cancelled?'Análise encerrada pelo usuário':(e&&e.message||String(e));
  }
  trace.retryable=!trace.ok&&!trace.cancelled&&isRetryableStatus(trace.status);
  console.log(`AI análise ${analysisIndex+1} ${model.id} tentativa ${attempt}:`,trace.ok?'OK':trace.error,trace.body);
  return trace;
}
function setAnalysisStep(steps,index,html){const step=steps.children[index];if(step)step.innerHTML=html}
function progressHtml(index,total,model,attempt,message){
  return `<div class="ai-step"><div class="spin"></div><span>${message||`Análise ${index+1} de ${total}…`} · ${model.label} · tentativa ${attempt}</span></div>`;
}

function openFoto(){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/*';inp.capture='environment';
  inp.onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)processarFoto(f);else toast('Nenhuma foto recebida — tente de novo, ou use a galeria')};
  inp.onclick=()=>toast('Abra a câmera/galeria…');
  inp.click();
}
function abrirFoto(){openFoto()}
window.__testProcessarFoto=f=>processarFoto(f);
window.abrirFoto=abrirFoto;
function abrirManual(){modalManual()}
window.abrirManual=abrirManual;

function modalManual(){
  openModal(`<h2>Adicionar refeição</h2><label>Nome da refeição</label>
    <input id="fNome" placeholder="Ex: Almoço" value="Refeição"/><div id="fItens" class="mt8"></div>
    <button class="bigbtn secondary mt8" onclick="addLinha()">+ Adicionar alimento</button>
    <div class="det-total mt8">Total: <span class="v" id="fTotal">0 kcal</span></div>
    <div class="row mt12"><button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
    <button class="bigbtn primary" onclick="confirmManual()">Salvar</button></div>`);
  addLinha();
}
function addLinha(){
  const box=$('#fItens');
  const d=document.createElement('div');d.className='det-item';
  d.innerHTML=`<input placeholder="Alimento" style="flex:1.4" oninput="updFTotal()"/>
    <input type="number" placeholder="g" class="d-qty" value="100" oninput="updFTotal()"/>
    <input type="number" placeholder="kcal" class="d-kcal" style="color:var(--accent);width:60px" oninput="updFTotal()"/>
    <button class="det-del" onclick="this.parentElement.remove();updFTotal()"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" stroke="#9a9aa4" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
  box.appendChild(d);
}
function updFTotal(){
  let t=0;Array.from(document.querySelectorAll('#fItens .d-kcal')).forEach(x=>t+=parseFloat(x.value)||0);
  if($('#fTotal'))$('#fTotal').textContent=fmt(t)+' kcal';
}
function confirmManual(){
  const nome=$('#fNome').value.trim()||'Refeição';const itens=[];
  Array.from(document.querySelectorAll('#fItens .det-item')).forEach(d=>{
    const ins=Array.from(d.querySelectorAll('input'));const n=ins[0].value.trim();
    const g=parseFloat(ins[1].value)||0;const k=parseFloat(ins[2].value)||0;
    if(k>0)itens.push({nome:n||'Alimento',porcao_g:g,kcal:Math.round(k),proteina_g:0,carbo_g:0,gordura_g:0});
  });
  if(!itens.length){toast('Adicione ao menos um alimento com calorias');return}
  meals.push({id:uid(),date:today(),hour:horaNow(),nome,itens,origem:'manual'});
  save(LS.m,meals);closeModal();toast('Refeição salva!');render();
}
window.addLinha=addLinha;window.updFTotal=updFTotal;window.confirmManual=confirmManual;

function encerrarAnaliseFoto(){
  const run=window.__fotoRun;if(!run||run.cancelled)return;
  run.cancelled=true;run.controller?.abort();run.waiters.splice(0).forEach(resolve=>resolve());
  const button=$('#aiCancel');if(button){button.disabled=true;button.textContent='Encerrando…'}
}
window.encerrarAnaliseFoto=encerrarAnaliseFoto;

async function processarFoto(file){
  if(!apikey){toast('Configure a chave da API em Ajustes primeiro');setTimeout(()=>{state.tab='ajustes';render()},300);return}
  let b64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.onerror=no;r.readAsDataURL(file)});
  const img=new Image();let finalB64=b64;
  try{
    await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src='data:image/jpeg;base64,'+b64});
    const MAX=1024;
    if(img.naturalWidth>MAX||img.naturalHeight>MAX){
      const c=document.createElement('canvas');const sc=Math.min(MAX/img.naturalWidth,MAX/img.naturalHeight);
      c.width=Math.round(img.naturalWidth*sc);c.height=Math.round(img.naturalHeight*sc);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);finalB64=c.toDataURL('image/jpeg',0.8).split(',')[1];
    }
  }catch(e){finalB64=b64}
  window.__fotoB64=finalB64;window.__fotoLegenda='';
  window.__fotoContinue=async()=>{
    const run={cancelled:false,controller:typeof AbortController==='function'?new AbortController():null,waiters:[]};
    window.__fotoRun=run;
    const legenda=($('#fotoLegenda')?.value||'').trim().slice(0,500);window.__fotoLegenda=legenda;
    openModal(`<h2>Analisando prato…</h2><img id="foto-preview" src="data:image/jpeg;base64,${finalB64}" style="display:block"/>
      <div id="aiSteps"></div><button id="aiCancel" class="bigbtn secondary mt12" onclick="encerrarAnaliseFoto()">Encerrar agora e usar respostas recebidas</button>`);
    const steps=$('#aiSteps');const n=pref.precisao==='precisa'?3:1;
    steps.innerHTML=Array.from({length:n},(_,i)=>`<div class="ai-step"><div class="spin"></div><span>Análise ${i+1} de ${n}…</span></div>`).join('');
    const apiReturns=[];
    const analisarUma=async i=>{
      let result=null;let selectedTrace=null;
      for(let modelIndex=0;modelIndex<GEMINI_MODELS.length&&!result;modelIndex++){
        const model=GEMINI_MODELS[modelIndex];setAnalysisStep(steps,i,progressHtml(i,n,model,1));
        let trace=await consultarModelo(model,finalB64,i,1,apikey,legenda,run);apiReturns.push(trace);selectedTrace=trace;
        if(trace.ok){result=trace.result;break}
        if(run.cancelled)break;
        if(trace.retryable){
          setAnalysisStep(steps,i,progressHtml(i,n,model,2,'Falha temporária; aguardando 3 segundos…'));
          await waitMs(RETRY_DELAY_MS,run);if(run.cancelled)break;
          setAnalysisStep(steps,i,progressHtml(i,n,model,2));
          trace=await consultarModelo(model,finalB64,i,2,apikey,legenda,run);apiReturns.push(trace);selectedTrace=trace;
          if(trace.ok){result=trace.result;break}
        }
        if(!trace.retryable&&!([200,404].includes(trace.status)))break;
        if(modelIndex<GEMINI_MODELS.length-1){const next=GEMINI_MODELS[modelIndex+1];setAnalysisStep(steps,i,progressHtml(i,n,next,1,`Alternando para ${next.label}…`))}
      }
      if(result)setAnalysisStep(steps,i,`<div class="ai-step" style="color:var(--ok)"><span>✓ Análise ${i+1}: ${Math.round(result.kcal_total||0)} kcal · ${selectedTrace?.modelLabel||'Gemini'}</span></div>`);
      else{const status=selectedTrace?.status?` (HTTP ${selectedTrace.status})`:'';setAnalysisStep(steps,i,`<div class="ai-step" style="color:var(--bad)"><span>✕ Análise ${i+1} falhou${status} após fallback</span></div>`)}
      return result;
    };
    let results=[];
    if(pref.paralelo)results=await Promise.all(Array.from({length:n},(_,i)=>analisarUma(i)));
    else for(let i=0;i<n&&!run.cancelled;i++)results.push(await analisarUma(i));
    const validos=results.filter(Boolean);window.__fotoRun=null;
    if(!validos.length){
      const status=apiReturns.slice().reverse().find(x=>x.status)?.status;
      steps.innerHTML=`<div class="ai-step" style="color:var(--bad);display:block"><b>${run.cancelled?'Análise encerrada sem respostas concluídas.':'Não foi possível analisar a foto.'}</b>
        <div class="api-hint">${apiHint(status)}</div>${apiReturns.slice().sort((a,b)=>(a.analysisIndex-b.analysisIndex)||(a.attempt-b.attempt)).map(apiTraceHtml).join('')}</div>
        <div class="row mt12"><button class="bigbtn secondary" onclick="closeModal()">Fechar</button><button class="bigbtn primary" onclick="closeModal();modalManual()">Adicionar manual</button></div>`;
      return;
    }
    mostrarConfirmacaoFoto(mergeAnalisys(validos),n,validos,apiReturns,run.cancelled);
  };
  openModal(`<h2>Descrever foto</h2><img id="foto-preview" src="data:image/jpeg;base64,${finalB64}" style="display:block"/>
    <label for="fotoLegenda">Descrição ou legenda (opcional)</label><textarea id="fotoLegenda" rows="3" maxlength="500" placeholder="Ex.: shake de banana com whey, leite e aveia"></textarea>
    <p class="small mt8">Ingredientes, quantidades e modo de preparo podem ajudar. A foto continua sendo a principal referência.</p>
    <div class="row mt12"><button class="bigbtn secondary" onclick="closeModal()">Cancelar</button><button class="bigbtn primary" onclick="iniciarAnaliseFoto()">Analisar foto</button></div>`);
}
window.iniciarAnaliseFoto=()=>{if(typeof window.__fotoContinue==='function')window.__fotoContinue()};

function mergeAnalisys(res){
  const fields=['kcal_total','proteina_total','carbo_total','gordura_total'];const out={};
  fields.forEach(f=>{
    const vals=res.map(r=>Number(r[f])||0);const sorted=[...vals].sort((a,b)=>a-b);let usados=sorted;
    if(sorted.length>=3){const mediana=sorted[1];const dist=sorted.map(v=>Math.abs(v-mediana));const imax=dist.indexOf(Math.max(...dist));if(dist[imax]>0.5*mediana&&mediana>0)usados=sorted.filter((_,i)=>i!==imax)}
    out[f]=Math.round(usados.reduce((a,b)=>a+b,0)/Math.max(1,usados.length));
  });
  const nomes=res.map(r=>String(r.nome_refeicao||'').trim()).filter(Boolean);out.nome_refeicao=nomes[0]||'Refeição com foto';
  out.itens=Array.isArray(res[0].itens)?res[0].itens.map(i=>({...i})):[];out.confianca=res[0].confianca||'media';return out;
}
function desvioPct(vals){const m=vals.reduce((a,b)=>a+b,0)/Math.max(1,vals.length);if(!m)return 0;return Math.round(Math.sqrt(vals.reduce((a,v)=>a+(v-m)**2,0)/Math.max(1,vals.length))/m*100)}
function renderFotoItens(){
  const box=$('#itensBox');if(!box)return;const its=window.__fotoItens||[];
  const p=$('#cP')?.value??0,c=$('#cC')?.value??0,g=$('#cG')?.value??0;
  box.innerHTML=its.map((it,i)=>`<div class="det-item"><input value="${escapeHtml(it.nome||'Item')}" style="flex:1.5" oninput="updItem(${i},'nome',this.value)"/>
    <input type="number" class="d-qty" value="${Number(it.porcao_g)||0}" oninput="updItem(${i},'porcao_g',this.value)"/><span class="small" style="color:var(--txt3)">g</span>
    <input type="number" class="d-kcal" value="${Math.round(it.kcal||0)}" oninput="updItem(${i},'kcal',this.value)"/>
    <button class="det-del" onclick="rmItem(${i})"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" stroke="#9a9aa4" stroke-width="1.8" stroke-linecap="round"/></svg></button></div>`).join('')+
    `<button class="bigbtn secondary mt8" style="font-size:13px;min-height:44px;padding:10px" onclick="addItemFoto()">+ Adicionar item</button>
    <div class="formrow three mt8"><div><label>P (g)</label><input id="cP" type="number" value="${p}" oninput="updTotais()"/></div><div><label>C (g)</label><input id="cC" type="number" value="${c}" oninput="updTotais()"/></div><div><label>G (g)</label><input id="cG" type="number" value="${g}" oninput="updTotais()"/></div></div>`;
  updTotais();
}
function mostrarConfirmacaoFoto(final,n,responses,apiReturns=[],cancelled=false){
  const varPct=desvioPct(responses.map(r=>r.kcal_total||0));
  const accHtml=cancelled?`<div class="det-acc"><button class="on" disabled>Parcial (${responses.length}/${n})</button></div><p class="small mb8">Usando ${responses.length} resposta(s) recebida(s) antes do encerramento · valores estimados, edite se precisar</p>`
    :responses.length>1?`<div class="det-acc"><button class="on" disabled>Precisa (${responses.length}/${n})</button></div><p class="small mb8">Média de ${responses.length} análises · variação entre respostas: <b style="color:${varPct>25?'var(--bad)':varPct>15?'var(--accent)':'var(--ok)'}">${varPct}%</b></p>`
    :`<p class="small mb8">Análise rápida · valores estimados, edite se precisar</p>`;
  const legendaHtml=window.__fotoLegenda?`<div class="small mb8"><b>Descrição enviada:</b> ${escapeHtml(window.__fotoLegenda)}</div>`:'';
  const nomeSugerido=escapeHtml(String(final.nome_refeicao||'').trim()||'Refeição com foto');
  const okCalls=apiReturns.filter(x=>x.ok).length;const failedCalls=apiReturns.length-okCalls;
  const apiHtml=apiReturns.length?`<details class="api-return ok mt8"><summary>Ver retorno da API (${responses.length} análises concluídas · ${okCalls} respostas OK · ${failedCalls} falhas)</summary>${apiReturns.slice().sort((a,b)=>(a.analysisIndex-b.analysisIndex)||(a.attempt-b.attempt)).map(apiTraceHtml).join('')}</details>`:'';
  openModal(`<h2>Prato identificado</h2><img id="foto-preview" src="data:image/jpeg;base64,${window.__fotoB64||''}" style="display:block"/>
    ${legendaHtml}${accHtml}${apiHtml}<div id="itensBox"></div><div class="det-total">Total: <span class="v" id="cTotal">${Math.round(final.kcal_total||0)} kcal</span></div>
    <div class="small" style="margin-top:6px">P <b style="color:#7ec8ff">${final.proteina_total||0}g</b> · C <b style="color:#3ddc84">${final.carbo_total||0}g</b> · G <b style="color:#f2a2ff">${final.gordura_total||0}g</b></div>
    <label style="margin-top:12px">Nome da refeição</label><input id="cNome" value="${nomeSugerido}" maxlength="80" style="margin-bottom:4px"/>
    <button id="saveFotoAlimento" class="bigbtn secondary mt8" onclick="salvarFotoAlimento()">Salvar refeição em Meus alimentos</button>
    <div class="row mt12"><button class="bigbtn secondary" onclick="closeModal()">Cancelar</button><button class="bigbtn primary" onclick="confirmFoto()">Confirmar</button></div>`);
  window.__fotoItens=Array.isArray(final.itens)?final.itens.map(i=>({...i})):[];
  window.__fotoMacroDefaults={p:final.proteina_total||0,c:final.carbo_total||0,g:final.gordura_total||0};
  renderFotoItens();
}
function updItem(i,k,v){const it=window.__fotoItens?.[i];if(!it)return;it[k]=k==='nome'?v:parseFloat(v)||0;updTotais()}
function rmItem(i){if(!window.__fotoItens)return;window.__fotoItens.splice(i,1);renderFotoItens()}
function addItemFoto(){window.__fotoItens=window.__fotoItens||[];window.__fotoItens.push({nome:'Item',porcao_g:100,kcal:0,proteina_g:0,carbo_g:0,gordura_g:0});renderFotoItens()}
function updTotais(){const k=(window.__fotoItens||[]).reduce((a,i)=>a+(parseFloat(i.kcal)||0),0);if($('#cTotal'))$('#cTotal').textContent=fmt(k)+' kcal'}
function salvarFotoAlimento(){
  const itens=(window.__fotoItens||[]).filter(i=>(i.kcal||0)>0);if(!itens.length){toast('Nenhum item com calorias para salvar');return}
  const nome=($('#cNome')?.value||'Refeição com foto').trim()||'Refeição com foto';
  const soma=(campo,sel)=>{const informado=parseFloat($(sel)?.value);return Number.isFinite(informado)?informado:itens.reduce((s,i)=>s+(parseFloat(i[campo])||0),0)};
  saveAlim({nome,porcao_g:Math.max(1,Math.round(itens.reduce((s,i)=>s+(parseFloat(i.porcao_g)||0),0))||100),kcal:Math.round(itens.reduce((s,i)=>s+(parseFloat(i.kcal)||0),0)),
    proteina_g:+soma('proteina_g','#cP').toFixed(1),carbo_g:+soma('carbo_g','#cC').toFixed(1),gordura_g:+soma('gordura_g','#cG').toFixed(1),tipo:'refeicao_foto'});
  const button=$('#saveFotoAlimento');if(button){button.disabled=true;button.textContent='Salvo em Meus alimentos ✓'}toast('Refeição salva em Meus alimentos!');
}
function confirmFoto(){
  const nome=$('#cNome').value.trim()||'Refeição com foto';const itens=(window.__fotoItens||[]).filter(i=>(i.kcal||0)>0);
  if(!itens.length){toast('Nenhum item com calorias');return}
  meals.push({id:uid(),date:today(),hour:horaNow(),nome,itens,origem:'foto'});save(LS.m,meals);closeModal();toast('Refeição salva!');render();
}
window.salvarFotoAlimento=salvarFotoAlimento;window.updItem=updItem;window.rmItem=rmItem;window.addItemFoto=addItemFoto;window.updTotais=updTotais;window.confirmFoto=confirmFoto;
