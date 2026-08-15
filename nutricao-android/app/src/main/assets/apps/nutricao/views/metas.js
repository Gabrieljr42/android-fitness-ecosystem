/* apps/nutricao/views/metas.js */
function renderMetas(main){
  const tdee=calcTDEE();
  main.innerHTML=`
  <div class="card">
    <h2>Metas diárias</h2>
    <div class="seg" id="metSeg">
      <button class="${profile.metaMetodo==='manual'?'on':''}" onclick="setMetodo('manual')">Personalizada</button>
      <button class="${profile.metaMetodo==='tdee'?'on':''}" onclick="setMetodo('tdee')">Sugerida (TDEE)</button>
    </div>
    ${profile.metaMetodo==='manual'?`
    <div class="formrow">
      <div><label>Calorias (kcal)</label><input id="mKcal" type="number" value="${profile.kcal}"/></div>
      <div><label>Proteína (g)</label><input id="mP" type="number" value="${profile.p}"/></div>
    </div>
    <div class="formrow">
      <div><label>Carboidrato (g)</label><input id="mC" type="number" value="${profile.c}"/></div>
      <div><label>Gordura (g)</label><input id="mG" type="number" value="${profile.g}"/></div>
    </div>`:`
    <div class="formcard">
      <div class="formrow">
        <div><label>Peso (kg)</label><input id="dPeso" type="number" value="${profile.peso}"/></div>
        <div><label>Altura (cm)</label><input id="dAlt" type="number" value="${profile.altura}"/></div>
      </div>
      <div class="formrow">
        <div><label>Idade</label><input id="dIdade" type="number" value="${profile.idade}"/></div>
        <div><label>Sexo</label><select id="dSexo"><option value="m" ${profile.sexo==='m'?'selected':''}>Masculino</option><option value="f" ${profile.sexo==='f'?'selected':''}>Feminino</option></select></div>
      </div>
      <label>Atividade física</label>
      <select id="dAtiv" style="margin-bottom:10px">
        <option value="1.2" ${profile.atividade==1.2?'selected':''}>Sedentário</option>
        <option value="1.4" ${profile.atividade==1.4?'selected':''}>Leve (1–2x/sem)</option>
        <option value="1.6" ${profile.atividade==1.6?'selected':''}>Moderado (3–4x/sem)</option>
        <option value="1.8" ${profile.atividade==1.8?'selected':''}>Intenso (5–6x/sem)</option>
      </select>
      <div class="det-total">Manutenção estimada: <span class="v">${fmt(tdee)} kcal</span></div>
      <p class="small mt8">Sugestão: manutenção × 0.8 para emagrecer, × 1.0 para manter, × 1.15 para ganhar massa. A proteína sugerida é 1.6–2 g/kg do peso.</p>
    </div>`}
    <button class="bigbtn primary mt12" onclick="salvarMetas()">Salvar metas</button>
  </div>`;
  window.setMetodo=m=>{profile.metaMetodo=m;save(LS.p,profile);render()};
  window.salvarMetas=()=>{
    if(profile.metaMetodo==='manual'){
      profile.kcal=parseFloat($('#mKcal').value)||2000;
      profile.p=parseFloat($('#mP').value)||100;
      profile.c=parseFloat($('#mC').value)||250;
      profile.g=parseFloat($('#mG').value)||70;
    }else{
      profile.peso=parseFloat($('#dPeso').value)||75;
      profile.altura=parseFloat($('#dAlt').value)||175;
      profile.idade=parseFloat($('#dIdade').value)||30;
      profile.sexo=$('#dSexo').value;
      profile.atividade=parseFloat($('#dAtiv').value);
      const t=calcTDEE();
      profile.kcal=Math.round(t);
      profile.p=Math.round(profile.peso*1.8);
      profile.c=Math.round(profile.kcal*0.45/4);
      profile.g=Math.round(profile.kcal*0.25/9);
    }
    save(LS.p,profile);toast('Metas salvas!');render();
  };
}
function calcTDEE(){
  const bmr=profile.sexo==='m'
    ?10*profile.peso+6.25*profile.altura-5*profile.idade+5
    :10*profile.peso+6.25*profile.altura-5*profile.idade-161;
  return Math.round(bmr*profile.atividade);
}
