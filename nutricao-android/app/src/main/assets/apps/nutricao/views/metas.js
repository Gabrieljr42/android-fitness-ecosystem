/* apps/nutricao/views/metas.js — Calculadora Biometria TDEE e Definição de Metas */

let metasEditorOpen = false;
function renderMetas(main) {
  const tdee = typeof calcTDEE === 'function' ? calcTDEE() : 2380;
  main.innerHTML = `
  <h1 class="page-title">Metas</h1>
  <p class="screen-subtitle">Seus valores de referência, reunidos em um só lugar.</p>
  <section class="card goals-summary">
    <h2>Meta diária</h2>
    <div class="goal-stat">${fmt(profile.kcal)} <small>kcal</small></div>
    <p class="goal-caption">${profile.metaMetodo === 'manual' ? 'Definida manualmente' : 'Calculada pelo gasto diário estimado'}</p>
    <div class="reference-row"><span>Proteínas</span><b>${fmt(profile.p)} g</b></div>
    <div class="reference-row"><span>Carboidratos</span><b>${fmt(profile.c)} g</b></div>
    <div class="reference-row"><span>Gorduras</span><b>${fmt(profile.g)} g</b></div>
    <button class="reference-row reference-action" onclick="modalMetaAgua()" aria-label="Alterar meta de água"><span>Água</span><b>${((Number(profile.metaAgua) || 3000) / 1000).toLocaleString('pt-BR', {maximumFractionDigits: 2})} L</b></button>
  </section>
  <section class="card goals-summary">
    <h2>Detalhes do balanço</h2>
    <p class="goal-caption">O saldo líquido desconta o exercício registrado das calorias consumidas.</p>
    <div class="reference-row"><span>Metabolismo basal estimado</span><b>${fmt(typeof calcBMR === 'function' ? calcBMR() : 0)} kcal</b></div>
    <div class="reference-row"><span>Gasto diário estimado</span><b>${fmt(tdee)} kcal</b></div>
  </section>
  <details class="goal-editor" id="goalEditor" ${metasEditorOpen ? 'open' : ''} ontoggle="metasEditorOpen=this.open">
  <summary>Editar metas</summary>
  <div class="card">
    <h2>Metas diárias de calorias e macros</h2>
    <div class="seg" id="metSeg">
      <button class="${profile.metaMetodo === 'manual' ? 'on' : ''}" onclick="setMetodo('manual')">Personalizada</button>
      <button class="${profile.metaMetodo === 'tdee' ? 'on' : ''}" onclick="setMetodo('tdee')">Sugerida (TDEE)</button>
    </div>

    ${profile.metaMetodo === 'manual' ? `
    <div class="formrow">
      <div>
        <label>Calorias (kcal)</label>
        <input id="mKcal" type="number" value="${profile.kcal}"/>
      </div>
      <div>
        <label>Proteína (g)</label>
        <input id="mP" type="number" value="${profile.p}"/>
      </div>
    </div>
    <div class="formrow">
      <div>
        <label>Carboidrato (g)</label>
        <input id="mC" type="number" value="${profile.c}"/>
      </div>
      <div>
        <label>Gordura (g)</label>
        <input id="mG" type="number" value="${profile.g}"/>
      </div>
    </div>` : `
    <div class="formcard">
      <div class="formrow">
        <div>
          <label>Peso (kg)</label>
          <input id="dPeso" type="number" value="${profile.peso}"/>
        </div>
        <div>
          <label>Altura (cm)</label>
          <input id="dAlt" type="number" value="${profile.altura}"/>
        </div>
      </div>
      <div class="formrow">
        <div>
          <label>Idade</label>
          <input id="dIdade" type="number" value="${profile.idade}"/>
        </div>
        <div>
          <label>Sexo</label>
          <select id="dSexo">
            <option value="m" ${profile.sexo === 'm' ? 'selected' : ''}>Masculino</option>
            <option value="f" ${profile.sexo === 'f' ? 'selected' : ''}>Feminino</option>
          </select>
        </div>
      </div>
      <label>Nível de Atividade física</label>
      <select id="dAtiv" style="margin-bottom:10px">
        <option value="1.2" ${profile.atividade == 1.2 ? 'selected' : ''}>Sedentário (pouco ou nenhum exercício)</option>
        <option value="1.4" ${profile.atividade == 1.4 ? 'selected' : ''}>Leve (exercício 1–2x/sem)</option>
        <option value="1.6" ${profile.atividade == 1.6 ? 'selected' : ''}>Moderado (exercício 3–4x/sem)</option>
        <option value="1.8" ${profile.atividade == 1.8 ? 'selected' : ''}>Intenso (exercício 5–6x/sem)</option>
      </select>
      <div class="det-total" style="border-top:1px solid var(--border-subtle);padding-top:10px;margin-top:8px">
        <span>Manutenção estimada (TDEE):</span>
        <span class="v">${fmt(tdee)} kcal</span>
      </div>
      <p class="small mt8">A recomendação para perda de gordura é ~80% do TDEE; para ganho de massa, ~115% do TDEE. A proteína sugerida é ~1.8 g por kg de peso.</p>
    </div>`}

    <button class="bigbtn primary mt12" onclick="salvarMetas()">Salvar metas</button>
  </div></details>`;

  window.setMetodo = m => { metasEditorOpen = true; profile.metaMetodo = m; save(LS.p, profile); render(); };
  window.salvarMetas = () => {
    if (profile.metaMetodo === 'manual') {
      profile.kcal = parseFloat($('#mKcal').value) || 2000;
      profile.p = parseFloat($('#mP').value) || 100;
      profile.c = parseFloat($('#mC').value) || 250;
      profile.g = parseFloat($('#mG').value) || 70;
    } else {
      profile.peso = parseFloat($('#dPeso').value) || 75;
      profile.altura = parseFloat($('#dAlt').value) || 175;
      profile.idade = parseFloat($('#dIdade').value) || 30;
      profile.sexo = $('#dSexo').value;
      profile.atividade = parseFloat($('#dAtiv').value);
      const t = calcTDEE();
      profile.kcal = Math.round(t);
      profile.p = Math.round(profile.peso * 1.8);
      profile.c = Math.round(profile.kcal * 0.45 / 4);
      profile.g = Math.round(profile.kcal * 0.25 / 9);
    }
    save(LS.p, profile);
    toast('Metas salvas!');
    metasEditorOpen = false;
    render();
  };
}

/* calcTDEE/calcBMR canônicos vivem em estado.js. A duplicata que existia aqui
   (sem parâmetro) sombreava a global ao final do load e fazia calcTDEE(p)
   ignorar o perfil passado — detectado por challenger_m3_1. */

window.renderMetas = renderMetas;
