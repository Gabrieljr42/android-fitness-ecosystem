/* apps/nutricao/views/ajustes.js */
function renderAjustes(main){
  main.innerHTML=`
  <div class="card">
    <h2>API do Gemini (análise de foto)</h2>
    <p class="small mb8">Crie uma chave gratuita em <a class="accent" href="https://aistudio.google.com/app/apikey" target="_blank">aistudio.google.com/app/apikey</a> (Google account, sem cartão) e cole aqui. A chave fica só no seu aparelho.</p>
    <input id="apiKeyIn" type="password" value="${apikey}" placeholder="AIza..."/>
    <button class="bigbtn secondary mt12" onclick="salvarKey()">Salvar chave</button>
    <div class="small mt8" id="keyStatus">${apikey?'<span style="color:var(--ok)">● Chave configurada</span>':'<span style="color:var(--bad)">● Sem chave — a análise de foto não funcionará</span>'}</div>
  </div>
  <div class="card">
    <h2>Modo de análise</h2>
    <div class="seg">
      <button class="${pref.precisao==='precisa'?'on':''}" onclick="setPrec('precisa')">Precisa (3× + média)</button>
      <button class="${pref.precisao==='rapida'?'on':''}" onclick="setPrec('rapida')">Rápida (1×)</button>
    </div>
    <p class="small">No modo preciso, a foto é enviada 3 vezes e o app calcula a média dos resultados, descartando respostas muito divergentes.</p>
  </div>
  <div class="card">
    <h2>Execução das análises</h2>
    <div class="seg">
      <button class="${pref.paralelo?'':'on'}" onclick="setParalelo(false)">Sequencial</button>
      <button class="${pref.paralelo?'on':''}" onclick="setParalelo(true)">Paralela</button>
    </div>
    <p class="small">Paralela inicia as 3 análises ao mesmo tempo. Sequencial aguarda cada resposta antes da próxima e pode ser mais estável em cotas menores. Em ambos os modos há nova tentativa e fallback de modelo.</p>
  </div>
  <div class="card">
    <h2>Backup</h2>
    <p class="small mb8">Seus dados ficam no aparelho. Faça backup periodicamente.</p>
    <div class="row">
      <button class="bigbtn secondary" onclick="doBackup()">Exportar backup</button>
    </div>
    <input type="file" accept="application/json" id="restoreIn" class="mt12" style="display:none"/>
    <button class="bigbtn secondary mt8" onclick="$('#restoreIn').click()">Restaurar backup</button>
  </div>
  <div class="card">
    <h2>Dados</h2>
    <p class="small mb8">${meals.length} refeição(ões) registradas no total.</p>
    <button class="bigbtn secondary" style="color:var(--bad);border-color:#ff6b6b33" onclick="wipeAll()">Apagar todos os dados</button>
  </div>
  <div class="small center mt8">NutriTrack v1.0 · dados 100% locais</div>`;
  $('#restoreIn').onchange=e=>doRestore(e.target.files[0]);
  window.setPrec=p=>{pref.precisao=p;save(LS.pref,pref);render()};
  window.setParalelo=p=>{pref.paralelo=!!p;save(LS.pref,pref);render()};
  window.salvarKey=()=>{const v=$('#apiKeyIn').value.trim();apikey=v;localStorage.setItem(LS.k,v);$('#keyStatus').innerHTML=v?'<span style="color:var(--ok)">● Chave configurada</span>':'<span style="color:var(--bad)">● Sem chave</span>';toast('Chave salva!')};
  window.doBackup=()=>{
    const json=JSON.stringify({meals,profile,alims:userAlims(),apikey,pref,exportadoEm:new Date().toISOString()},null,1);
    if(typeof AndroidBridge!=='undefined'){AndroidBridge.saveBackup(json,'nutritrack-backup.json')}
    else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download='nutritrack-backup.json';a.click()}
    toast('Backup gerado!');
  };
  window.doRestore=f=>{
    if(!f)return;
    const r=new FileReader();
    r.onload=()=>{try{
      const d=JSON.parse(r.result);
      if(d.meals)save(LS.m,d.meals);meals=load(LS.m,[]);
      if(d.profile)save(LS.p,d.profile);profile=load(LS.p,profile);
      if(d.alims)save('nt_alims',d.alims);
      if(d.apikey!==undefined){apikey=d.apikey;localStorage.setItem(LS.k,apikey)}
      if(d.pref){pref={...pref,...d.pref,paralelo:!!d.pref.paralelo};save(LS.pref,pref)}
      toast('Backup restaurado!');render();
    }catch(e){toast('Arquivo inválido')}};
    r.readAsText(f);
  };
  window.wipeAll=()=>{
    if(!confirm('Apagar TODOS os registros, metas e alimentos? Esta ação não pode ser desfeita.'))return;
    localStorage.removeItem(LS.m);localStorage.removeItem(LS.p);localStorage.removeItem('nt_alims');
    meals=[];profile=load(LS.p,{kcal:2200,p:120,c:250,g:70,peso:75,altura:175,idade:30,sexo:'m',atividade:1.4,metaMetodo:'manual'});
    toast('Dados apagados');render();
  };
}
