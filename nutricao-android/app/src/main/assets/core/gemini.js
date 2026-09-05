/* core/gemini.js — fluxo de análise de fotos, texto e atividade com Gemini */
/* Ordered fallback config lives in core/gemini-models.js (load it first via
   <script src="../../core/gemini-models.js">). The inline values below are an
   identical fallback so WebView + Node vm harness keep working when the
   config script is absent. Behavior/order must not change here — edit the
   config file (and mirror Coach SupportedModels.kt + docs) instead.
   Config entries are shape-checked: a stale/foreign GEMINI_MODELS_CONFIG
   global with malformed entries can never silently replace the fallback
   order — invalid entries are dropped, and a fully-invalid list falls back
   to the inline constants below. */
const GEMINI_API_BASE = (typeof GEMINI_MODELS_CONFIG !== 'undefined' && GEMINI_MODELS_CONFIG && GEMINI_MODELS_CONFIG.apiBase) || 'https://generativelanguage.googleapis.com/v1beta/models/';
function geminiModelsFromConfig() {
  try {
    const cfg = (typeof GEMINI_MODELS_CONFIG !== 'undefined') ? GEMINI_MODELS_CONFIG : null;
    const list = cfg && Array.isArray(cfg.models) ? cfg.models : null;
    // New array (no aliasing of the config object) with the same ID regex
    // Coach CredentialPolicy.validateModel enforces, so both apps agree.
    const valid = (list || []).filter(m => m && typeof m === 'object'
      && typeof m.id === 'string' && /^gemini-[A-Za-z0-9.-]{1,72}$/.test(m.id)
      && typeof m.label === 'string' && m.label.trim()
      && typeof m.thinkingLevel === 'string' && m.thinkingLevel.trim());
    if (valid.length) return valid;
  } catch (_) {}
  return [
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', thinkingLevel: 'low' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', thinkingLevel: 'low' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', thinkingLevel: 'low' }
  ];
}
const GEMINI_MODELS = geminiModelsFromConfig();
const RETRY_DELAY_MS = (typeof GEMINI_MODELS_CONFIG !== 'undefined' && GEMINI_MODELS_CONFIG && Number.isFinite(GEMINI_MODELS_CONFIG.retryDelayMs) ? GEMINI_MODELS_CONFIG.retryDelayMs : 3000);
const GEMINI_MODELS_CONFIG_VERSION = (typeof GEMINI_MODELS_CONFIG !== 'undefined' && GEMINI_MODELS_CONFIG && GEMINI_MODELS_CONFIG.version) || 0;

function currentEntryDate() {
  if (typeof getActiveDate === 'function') return getActiveDate();
  if (typeof today === 'function') return today();
  if (typeof localDateStr === 'function') return localDateStr();
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    nome_refeicao: { type: 'string' },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          porcao_g: { type: 'number' },
          kcal: { type: 'number' },
          proteina_g: { type: 'number' },
          carbo_g: { type: 'number' },
          gordura_g: { type: 'number' }
        },
        required: ['nome', 'porcao_g', 'kcal', 'proteina_g', 'carbo_g', 'gordura_g']
      }
    },
    kcal_total: { type: 'number' },
    proteina_total: { type: 'number' },
    carbo_total: { type: 'number' },
    gordura_total: { type: 'number' },
    confianca: { type: 'string', enum: ['baixa', 'media', 'alta'] },
    transcricao: { type: 'string' }
  },
  required: ['nome_refeicao', 'itens', 'kcal_total', 'proteina_total', 'carbo_total', 'gordura_total', 'confianca']
};

/* Resposta usada pelo fechamento do dia. Cada refeição continua usando o
   mesmo formato de item do fluxo de foto/texto, mas agora a IA pode devolver
   várias refeições em uma única chamada multimodal. */
const DAILY_FOOD_SCHEMA = {
  type: 'object',
  properties: {
    refeicoes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome_refeicao: { type: 'string' },
          horario: { type: 'string' },
          itens: FOOD_SCHEMA.properties.itens,
          kcal_total: { type: 'number' },
          proteina_total: { type: 'number' },
          carbo_total: { type: 'number' },
          gordura_total: { type: 'number' },
          confianca: { type: 'string', enum: ['baixa', 'media', 'alta'] }
        },
        required: ['nome_refeicao', 'horario', 'itens', 'kcal_total', 'proteina_total', 'carbo_total', 'gordura_total', 'confianca']
      }
    },
    kcal_total: { type: 'number' },
    proteina_total: { type: 'number' },
    carbo_total: { type: 'number' },
    gordura_total: { type: 'number' },
    observacoes: { type: 'array', items: { type: 'string' } },
    transcricao_audio: { type: 'string' },
    confianca: { type: 'string', enum: ['baixa', 'media', 'alta'] }
  },
  required: ['refeicoes', 'kcal_total', 'proteina_total', 'carbo_total', 'gordura_total', 'confianca']
};

const FOOD_PROMPT = `Analise a foto deste prato de comida e estime o conteúdo nutricional.
Identifique todos os alimentos visíveis e estime as porções em gramas com base no tamanho do prato.
Retorne também nome_refeicao com um nome curto e descritivo para o prato ou bebida, por exemplo "Shake de banana com whey".
Preencha proteínas, carboidratos e gorduras em gramas para cada item e também nos totais.
Responda APENAS com JSON no schema fornecido. Valores numéricos. Somente o que é visível na foto. Porções realistas para comida caseira brasileira.`;

const TEXT_FOOD_PROMPT = `Analise a descrição textual desta refeição/alimento e estime o conteúdo nutricional.
Identifique todos os alimentos mencionados ou implícitos e estime as porções em gramas com base na descrição (ou porção padrão brasileira caso não especificada).
Retorne também nome_refeicao com um nome curto e descritivo para a refeição, por exemplo "Café da manhã com ovos" ou "Almoço caseiro".
Preencha proteínas, carboidratos e gorduras em gramas para cada item e também nos totais (kcal_total, proteina_total, carbo_total, gordura_total).
Responda APENAS com JSON no schema fornecido. Valores numéricos realistas para a culinária brasileira.`;

const DAILY_FOOD_PROMPT = `Você vai analisar um diário alimentar de um dia inteiro.
O usuário pode fornecer um texto grande copiado do WhatsApp, com várias mensagens e horários, além de várias fotos de refeições.
Identifique e separe todas as refeições distintas no array "refeicoes". Use os horários e os rótulos presentes no texto quando existirem; quando não existirem, use um rótulo curto como "café da manhã", "almoço", "lanche" ou "jantar".
Relacione texto e foto quando eles falarem da mesma refeição. Não conte duas vezes uma refeição só porque ela aparece em uma mensagem e também em uma foto.
Uma foto pode representar uma refeição inteira ou parte dela. Use a descrição textual como contexto, sem inventar alimentos que não foram mencionados nem aparecem nas imagens.
Para cada refeição, liste todos os itens, estime porções em gramas e informe calorias, proteínas, carboidratos e gorduras por item e no total da refeição.
Some os totais das refeições para produzir os totais do dia. Se uma quantidade não estiver clara, faça uma estimativa realista de porção brasileira e marque a confiança como "baixa" ou "media". Inclua em "observacoes" dúvidas importantes para a revisão do usuário.
  Se houver um áudio anexado, transcreva mentalmente o relato em português e use-o como fonte adicional. Não repita alimentos que aparecem tanto no áudio quanto no texto ou nas fotos. Não inclua água, suplementos ou exercícios como comida, a menos que sejam explicitamente ingeridos e tenham valor calórico. Responda APENAS com JSON válido no schema fornecido.`;

const AUDIO_FOOD_PROMPT = `O áudio contém o relato falado pelo usuário sobre uma refeição ou alimentos que ele acabou de consumir.
Entenda e transcreva mentalmente o áudio em português brasileiro. Identifique tudo o que foi ingerido, incluindo quantidades, ingredientes e bebidas quando informados, e estime porções e conteúdo nutricional.
Retorne nome_refeicao com um nome curto e descritivo. Preencha proteínas, carboidratos e gorduras em gramas para cada item e também nos totais. Inclua no campo opcional "transcricao" uma transcrição curta e fiel do que foi compreendido, sem inventar informações.
Se o áudio mencionar mais de uma refeição, mantenha o conjunto como uma única resposta de refeição apenas quando não houver separação clara; nesse caso, o usuário poderá usar o modo "resumir meu dia". Responda APENAS com JSON no schema fornecido.`;

const ACTIVITY_SCHEMA = {
  type: 'object',
  properties: {
    nome_atividade: { type: 'string' },
    duracao_minutos_total: { type: 'number' },
    intensidade: {
      type: 'string',
      enum: ['leve', 'moderada', 'intensa', 'muito_intensa']
    },
    met_medio: { type: 'number' },
    kcal_gasto_total: { type: 'number' },
    segmentos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string' },
          descricao: { type: 'string' },
          duracao_minutos: { type: 'number' },
          velocidade_kmh: { type: 'number' },
          met: { type: 'number' },
          kcal: { type: 'number' },
          kcal_gasto: { type: 'number' }
        },
        required: ['duracao_minutos', 'met']
      }
    },
    explicacao_calculo: { type: 'string' },
    confianca: { type: 'string', enum: ['baixa', 'media', 'alta'] }
  },
  required: ['nome_atividade', 'duracao_minutos_total', 'intensidade', 'met_medio', 'kcal_gasto_total', 'confianca']
};

const ACTIVITY_PROMPT = `Você é um especialista em fisiologia do exercício físico e cálculo de gasto calórico.
Analise a descrição textual da atividade física realizada pelo usuário e calcule o gasto calórico com base em METs (Metabolic Equivalent of Task do Compêndio de Ainsworth) e nos dados biométricos fornecidos.

Fórmula obrigatória de cálculo:
Gasto (kcal) = MET × Peso (kg) × (Duração em minutos / 60)

Instruções específicas:
1. Caso a descrição contenha múltiplos blocos ou treinos intervalados/alternados (ex: "corri alternando corrida a 9 km/h e caminhada a 3 km/h de 1 em 1 minuto por 20 minutos"), decomponha nos blocos correspondentes no array "segmentos", calculando a duração, velocidade (se informada), MET e kcal de cada segmento e somando em kcal_gasto_total e duracao_minutos_total.
2. Atribua o met_medio como a média ponderada dos METs pelo tempo de cada segmento: soma(duracao_i * MET_i) / duracao_total.
3. Classifique a intensidade em: 'leve' (MET < 3.0), 'moderada' (3.0 <= MET < 6.0), 'intensa' (6.0 <= MET < 9.0) ou 'muito_intensa' (MET >= 9.0).
4. Forneça em "explicacao_calculo" um resumo sucinto dos METs e da fórmula aplicada.
5. Responda APENAS com JSON válido em conformidade estrita com o schema fornecido.`;

function promptComLegenda(legenda) {
  const descricao = String(legenda || '').trim().slice(0, 500);
  return descricao
    ? `${FOOD_PROMPT}\n\nDescrição adicional fornecida pelo usuário (use como pista, sem inventar itens que não aparecem na foto): ${descricao}`
    : FOOD_PROMPT;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function limitApiText(value, max = 8000) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max) + '\n… (resposta cortada na tela)' : text;
}

function prettyApiBody(raw) {
  if (!raw) return '(corpo vazio)';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch(e) { return String(raw); }
}

function apiHint(status) {
  if (status === 400) return 'A requisição foi rejeitada. Confira o formato da mensagem e os parâmetros enviados.';
  if (status === 401) return 'A chave está ausente ou inválida. Gere uma chave nova no Google AI Studio.';
  if (status === 403) return 'A chave não tem permissão para este projeto/modelo ou está bloqueada/restrita.';
  if (status === 404) return 'O modelo ou o endereço da API não foi encontrado.';
  if (status === 429) return 'A cota ou o limite de requisições foi atingido. Tente novamente mais tarde ou use o modo rápido.';
  if (status >= 500) return 'O serviço do Google apresentou uma falha temporária. O app tenta novamente e alterna entre 3.7, 3.6 e 3.5 Flash automaticamente.';
  return status ? 'Veja o detalhe retornado pelo Google abaixo.' : 'Não foi possível conectar ao serviço do Google.';
}

function apiTraceHtml(trace, index) {
  const ok = trace.ok;
  const number = (trace.analysisIndex ?? index) + 1;
  const model = trace.modelLabel || trace.modelId || 'Gemini';
  const attempt = trace.attempt ? ` · tentativa ${trace.attempt}` : '';
  const status = trace.status ? `HTTP ${trace.status}` : 'sem resposta HTTP';
  const title = ok ? `✓ Análise ${number} · ${model}${attempt} · ${status}` : `✕ Análise ${number} · ${model}${attempt} · ${status}`;
  const content = ok
    ? `JSON produzido pelo modelo:\n${trace.modelText || '(resposta sem texto)'}\n\nResposta HTTP completa:\n${prettyApiBody(trace.body)}`
    : `${trace.error || 'Falha desconhecida'}\n\nRetorno bruto:\n${prettyApiBody(trace.body)}`;
  return `<details class="api-return ${ok ? 'ok' : 'bad'}"${ok ? '' : ' open'}><summary>${title}</summary><pre>${escapeHtml(limitApiText(content))}</pre></details>`;
}

function isRetryableStatus(status) {
  return status == null || [408, 429, 500, 502, 503, 504].includes(status);
}

function waitMs(ms, run) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    if (run) run.waiters.push(() => { clearTimeout(timer); resolve(); });
  });
}

function apiBody(data, model, legenda = '') {
  return {
    contents: [{
      parts: [
        { text: promptComLegenda(legenda) },
        { inline_data: { mime_type: 'image/jpeg', data } }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: FOOD_SCHEMA,
      thinkingConfig: { thinkingLevel: model.thinkingLevel },
      maxOutputTokens: 4096
    }
  };
}

function apiBodyTexto(texto, model) {
  const descricao = String(texto || '').trim().slice(0, 1000);
  return {
    contents: [
      {
        parts: [
          { text: `${TEXT_FOOD_PROMPT}\n\nDescrição da refeição:\n${descricao}` }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: FOOD_SCHEMA,
      thinkingConfig: { thinkingLevel: model.thinkingLevel },
      maxOutputTokens: 4096
    }
  };
}

function audioPayload(audio) {
  if (!audio || typeof audio !== 'object' || !audio.data) return null;
  const mime = String(audio.mimeType || audio.mime_type || 'audio/mp4');
  return {
    data: String(audio.data),
    mimeType: mime.startsWith('audio/') ? mime : 'audio/mp4',
    durationMs: Number(audio.durationMs) || 0
  };
}

function apiBodyAudio(audio, model, contexto = '') {
  const payload = audioPayload(audio);
  const contextoSeguro = String(contexto || '').trim().slice(0, 1000);
  return {
    contents: [{
      parts: [
        { text: `${AUDIO_FOOD_PROMPT}${contextoSeguro ? `\n\nContexto adicional digitado pelo usuário:\n${contextoSeguro}` : ''}` },
        ...(payload ? [{ inline_data: { mime_type: payload.mimeType, data: payload.data } }] : [])
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: FOOD_SCHEMA,
      thinkingConfig: { thinkingLevel: model.thinkingLevel },
      maxOutputTokens: 4096
    }
  };
}

function apiBodyResumoDia(texto, fotos = [], model, date = '', audio = null) {
  const descricao = String(texto || '').trim().slice(0, 12000);
  const dataReferencia = String(date || '').trim().slice(0, 10);
  const parts = [{
    text: `${DAILY_FOOD_PROMPT}\n\nData de referência: ${dataReferencia || 'não informada'}\n\nRelato copiado do WhatsApp:\n${descricao || '(nenhum texto; use as fotos anexadas)'}`
  }];

  const audioPart = audioPayload(audio);
  if (audioPart) {
    parts.push({ text: '[Áudio gravado pelo usuário; use-o como relato adicional do dia]' });
    parts.push({ inline_data: { mime_type: audioPart.mimeType, data: audioPart.data } });
  }

  (Array.isArray(fotos) ? fotos : []).slice(0, 8).forEach((foto, index) => {
    const data = typeof foto === 'string' ? foto : foto?.data;
    if (!data) return;
    const mime = typeof foto === 'object' && String(foto.mimeType || foto.mime_type || '').startsWith('image/')
      ? String(foto.mimeType || foto.mime_type)
      : 'image/jpeg';
    parts.push({ text: `[Foto ${index + 1} anexada pelo usuário]` });
    parts.push({ inline_data: { mime_type: mime, data: String(data) } });
  });

  return {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: DAILY_FOOD_SCHEMA,
      thinkingConfig: { thinkingLevel: model.thinkingLevel },
      maxOutputTokens: 8192
    }
  };
}

async function consultarModelo(model, data, analysisIndex, attempt, key, legenda = '', run = null) {
  const trace = {
    ok: false, analysisIndex, attempt, modelId: model.id, modelLabel: model.label,
    status: null, body: '', modelText: '', error: '', retryable: false, result: null, cancelled: false
  };
  let timeoutId = null;
  const localController = typeof AbortController === 'function' ? new AbortController() : null;

  try {
    if (run?.cancelled) { trace.cancelled = true; trace.error = 'Análise encerrada pelo usuário'; return trace; }

    // Configura timeout de rede (25 segundos por tentativa)
    if (localController) {
      timeoutId = setTimeout(() => {
        try { localController.abort(); } catch(_) {}
      }, 25000);
      if (run?.controller?.signal) {
        run.controller.signal.addEventListener('abort', () => {
          try { localController.abort(); } catch(_) {}
        });
      }
    }

    const url = GEMINI_API_BASE + model.id + ':generateContent';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(apiBody(data, model, legenda)),
      signal: localController?.signal || run?.controller?.signal
    });

    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    trace.status = resp.status;
    trace.body = await resp.text();
    let json = null;
    try { json = trace.body ? JSON.parse(trace.body) : null; } catch(e) {}
    if (!resp.ok) {
      const msg = json?.error?.message || json?.message || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    const block = json?.promptFeedback?.blockReason;
    if (!txt) throw new Error(block ? `resposta bloqueada (${block})` : 'resposta vazia');
    trace.modelText = txt;
    const jsonTxt = String(txt).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    trace.result = JSON.parse(jsonTxt);
    trace.ok = true;
  } catch(e) {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    const isAbort = e?.name === 'AbortError' || localController?.signal?.aborted;
    if (run?.cancelled) {
      trace.cancelled = true;
      trace.error = 'Análise encerrada pelo usuário';
    } else if (isAbort) {
      trace.status = 408;
      trace.error = 'Tempo limite de conexão esgotado (timeout de rede de 25s)';
    } else {
      trace.error = (e && e.message) || String(e);
      if (e instanceof TypeError || trace.error.includes('fetch') || trace.error.includes('network') || trace.error.includes('Failed to fetch')) {
        trace.error = 'Falha de conexão com o servidor do Gemini (rede offline ou instável)';
      }
    }
  }
  trace.retryable = !trace.ok && !trace.cancelled && isRetryableStatus(trace.status);
  console.log(`AI análise ${analysisIndex + 1} ${model.id} tentativa ${attempt}:`, trace.ok ? 'OK' : trace.error, trace.body);
  return trace;
}

async function consultarModeloTexto(model, texto, analysisIndex, attempt, key, run = null) {
  const trace = {
    ok: false, analysisIndex, attempt, modelId: model.id, modelLabel: model.label,
    status: null, body: '', modelText: '', error: '', retryable: false, result: null, cancelled: false
  };
  try {
    if (run?.cancelled) { trace.cancelled = true; trace.error = 'Análise encerrada pelo usuário'; return trace; }
    const url = GEMINI_API_BASE + model.id + ':generateContent';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(apiBodyTexto(texto, model)),
      signal: run?.controller?.signal
    });
    trace.status = resp.status;
    trace.body = await resp.text();
    let json = null;
    try { json = trace.body ? JSON.parse(trace.body) : null; } catch(e) {}
    if (!resp.ok) {
      const msg = json?.error?.message || json?.message || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    const block = json?.promptFeedback?.blockReason;
    if (!txt) throw new Error(block ? `resposta bloqueada (${block})` : 'resposta vazia');
    trace.modelText = txt;
    const jsonTxt = String(txt).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    trace.result = JSON.parse(jsonTxt);
    trace.ok = true;
  } catch(e) {
    trace.cancelled = !!run?.cancelled || e?.name === 'AbortError';
    trace.error = trace.cancelled ? 'Análise encerrada pelo usuário' : (e && e.message || String(e));
  }
  trace.retryable = !trace.ok && !trace.cancelled && isRetryableStatus(trace.status);
  console.log(`AI texto análise ${analysisIndex + 1} ${model.id} tentativa ${attempt}:`, trace.ok ? 'OK' : trace.error, trace.body);
  return trace;
}

async function consultarModeloAudio(model, audio, contexto, analysisIndex, attempt, key, run = null) {
  const trace = {
    ok: false, analysisIndex, attempt, modelId: model.id, modelLabel: model.label,
    status: null, body: '', modelText: '', error: '', retryable: false, result: null, cancelled: false
  };
  let timeoutId = null;
  const localController = typeof AbortController === 'function' ? new AbortController() : null;

  try {
    if (run?.cancelled) { trace.cancelled = true; trace.error = 'Análise encerrada pelo usuário'; return trace; }
    if (localController) {
      timeoutId = setTimeout(() => {
        try { localController.abort(); } catch(_) {}
      }, 60000);
      if (run?.controller?.signal) {
        run.controller.signal.addEventListener('abort', () => {
          try { localController.abort(); } catch(_) {}
        });
      }
    }
    const url = GEMINI_API_BASE + model.id + ':generateContent';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(apiBodyAudio(audio, model, contexto)),
      signal: localController?.signal || run?.controller?.signal
    });
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    trace.status = resp.status;
    trace.body = await resp.text();
    let json = null;
    try { json = trace.body ? JSON.parse(trace.body) : null; } catch(e) {}
    if (!resp.ok) {
      const msg = json?.error?.message || json?.message || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    const block = json?.promptFeedback?.blockReason;
    if (!txt) throw new Error(block ? `resposta bloqueada (${block})` : 'resposta vazia');
    trace.modelText = txt;
    const jsonTxt = String(txt).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    trace.result = JSON.parse(jsonTxt);
    trace.ok = true;
  } catch(e) {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    const isAbort = e?.name === 'AbortError' || localController?.signal?.aborted;
    if (run?.cancelled) {
      trace.cancelled = true;
      trace.error = 'Análise encerrada pelo usuário';
    } else if (isAbort) {
      trace.status = 408;
      trace.error = 'Tempo limite de conexão esgotado (timeout de rede de 60s)';
    } else {
      trace.error = (e && e.message) || String(e);
      if (e instanceof TypeError || trace.error.includes('fetch') || trace.error.includes('network') || trace.error.includes('Failed to fetch')) {
        trace.error = 'Falha de conexão com o servidor do Gemini (rede offline ou instável)';
      }
    }
  }
  trace.retryable = !trace.ok && !trace.cancelled && isRetryableStatus(trace.status);
  console.log(`AI áudio análise ${analysisIndex + 1} ${model.id} tentativa ${attempt}:`, trace.ok ? 'OK' : trace.error, trace.body);
  return trace;
}

async function consultarModeloResumoDia(model, texto, fotos, date, analysisIndex, attempt, key, run = null, audio = null) {
  const trace = {
    ok: false, analysisIndex, attempt, modelId: model.id, modelLabel: model.label,
    status: null, body: '', modelText: '', error: '', retryable: false, result: null, cancelled: false
  };
  let timeoutId = null;
  const localController = typeof AbortController === 'function' ? new AbortController() : null;

  try {
    if (run?.cancelled) { trace.cancelled = true; trace.error = 'Análise encerrada pelo usuário'; return trace; }

    // O fechamento do dia envia várias imagens; permite mais tempo por tentativa.
    if (localController) {
      timeoutId = setTimeout(() => {
        try { localController.abort(); } catch(_) {}
      }, 45000);
      if (run?.controller?.signal) {
        run.controller.signal.addEventListener('abort', () => {
          try { localController.abort(); } catch(_) {}
        });
      }
    }

    const url = GEMINI_API_BASE + model.id + ':generateContent';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(apiBodyResumoDia(texto, fotos, model, date, audio)),
      signal: localController?.signal || run?.controller?.signal
    });

    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    trace.status = resp.status;
    trace.body = await resp.text();
    let json = null;
    try { json = trace.body ? JSON.parse(trace.body) : null; } catch(e) {}
    if (!resp.ok) {
      const msg = json?.error?.message || json?.message || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    const block = json?.promptFeedback?.blockReason;
    if (!txt) throw new Error(block ? `resposta bloqueada (${block})` : 'resposta vazia');
    trace.modelText = txt;
    const jsonTxt = String(txt).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    trace.result = JSON.parse(jsonTxt);
    trace.ok = true;
  } catch(e) {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    const isAbort = e?.name === 'AbortError' || localController?.signal?.aborted;
    if (run?.cancelled) {
      trace.cancelled = true;
      trace.error = 'Análise encerrada pelo usuário';
    } else if (isAbort) {
      trace.status = 408;
      trace.error = 'Tempo limite de conexão esgotado (timeout de rede de 45s)';
    } else {
      trace.error = (e && e.message) || String(e);
      if (e instanceof TypeError || trace.error.includes('fetch') || trace.error.includes('network') || trace.error.includes('Failed to fetch')) {
        trace.error = 'Falha de conexão com o servidor do Gemini (rede offline ou instável)';
      }
    }
  }
  trace.retryable = !trace.ok && !trace.cancelled && isRetryableStatus(trace.status);
  console.log(`AI resumo do dia análise ${analysisIndex + 1} ${model.id} tentativa ${attempt}:`, trace.ok ? 'OK' : trace.error, trace.body);
  return trace;
}

function setAnalysisStep(steps, index, html) {
  const step = steps.children[index];
  if (step) step.innerHTML = html;
}

function progressHtml(index, total, model, attempt, message) {
  return `<div class="ai-step"><div class="spin"></div><span>${message || `Análise ${index + 1} de ${total}…`} · ${model.label} · tentativa ${attempt}</span></div>`;
}

function mergeAnalisys(res) {
  const fields = ['kcal_total', 'proteina_total', 'carbo_total', 'gordura_total'];
  const out = {};
  fields.forEach(f => {
    const vals = res.map(r => Number(r[f]) || 0);
    const sorted = [...vals].sort((a, b) => a - b);
    let usados = sorted;
    if (sorted.length >= 3) {
      const mediana = sorted[1];
      const dist = sorted.map(v => Math.abs(v - mediana));
      const imax = dist.indexOf(Math.max(...dist));
      if (dist[imax] > 0.5 * mediana && mediana > 0) {
        usados = sorted.filter((_, i) => i !== imax);
      }
    }
    out[f] = Math.round(usados.reduce((a, b) => a + b, 0) / Math.max(1, usados.length));
  });
  const nomes = res.map(r => String(r.nome_refeicao || '').trim()).filter(Boolean);
  out.nome_refeicao = nomes[0] || 'Refeição';
  out.itens = Array.isArray(res[0].itens) ? res[0].itens.map(i => ({ ...i })) : [];
  out.confianca = res[0].confianca || 'media';
  out.transcricao = res.map(r => String(r.transcricao || '').trim()).find(Boolean) || '';
  return out;
}

function desvioPct(vals) {
  const m = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  if (!m) return 0;
  return Math.round(Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, vals.length)) / m * 100);
}

/* ============ MERGE DO RESUMO DIÁRIO ============ */
function dailyFinite(value, fallback = 0, max = 100000) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(max, number)) : fallback;
}

function dailyText(value, fallback = '', max = 120) {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, max);
}

function dailyKey(value) {
  const raw = dailyText(value).toLowerCase();
  try {
    return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  } catch (_) {
    return raw.replace(/[^a-z0-9]+/g, ' ').trim();
  }
}

function dailyAverage(values, fallback = 0, max = 100000) {
  const nums = (Array.isArray(values) ? values : [])
    .map(value => dailyFinite(value, NaN, max))
    .filter(Number.isFinite);
  if (!nums.length) return fallback;
  const sorted = [...nums].sort((a, b) => a - b);
  let used = sorted;
  if (sorted.length >= 3) {
    const median = sorted[Math.floor(sorted.length / 2)];
    const distances = sorted.map(value => Math.abs(value - median));
    const farthest = Math.max(...distances);
    if (median > 0 && farthest > 0.5 * median) {
      const index = distances.indexOf(farthest);
      used = sorted.filter((_, i) => i !== index);
    }
  }
  return used.reduce((sum, value) => sum + value, 0) / used.length;
}

function normalizeDailyItem(item) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    nome: dailyText(source.nome, 'Item', 160),
    porcao_g: Math.round(dailyFinite(source.porcao_g, 0, 10000)),
    kcal: Math.round(dailyFinite(source.kcal, 0, 10000)),
    proteina_g: +dailyFinite(source.proteina_g, 0, 1000).toFixed(1),
    carbo_g: +dailyFinite(source.carbo_g, 0, 2000).toFixed(1),
    gordura_g: +dailyFinite(source.gordura_g, 0, 1000).toFixed(1)
  };
}

function normalizeDailyMeal(meal) {
  const source = meal && typeof meal === 'object' ? meal : {};
  return {
    nome_refeicao: dailyText(source.nome_refeicao || source.nome, 'Refeição', 100),
    horario: dailyText(source.horario || source.hour || source.hora, '', 40),
    itens: (Array.isArray(source.itens) ? source.itens : []).slice(0, 40).map(normalizeDailyItem),
    kcal_total: dailyFinite(source.kcal_total, 0, 100000),
    proteina_total: dailyFinite(source.proteina_total, 0, 10000),
    carbo_total: dailyFinite(source.carbo_total, 0, 20000),
    gordura_total: dailyFinite(source.gordura_total, 0, 10000),
    confianca: ['baixa', 'media', 'alta'].includes(source.confianca) ? source.confianca : 'media'
  };
}

function normalizeDailyResult(result) {
  const source = result && typeof result === 'object' ? result : {};
  let meals = Array.isArray(source.refeicoes) ? source.refeicoes : [];
  // Aceita uma resposta de refeição única caso um modelo antigo ignore o
  // schema diário; isso mantém o fechamento útil e não descarta a resposta.
  if (!meals.length && (source.nome_refeicao || source.nome || source.itens)) meals = [source];
  const normalizedMeals = meals.slice(0, 20).map(normalizeDailyMeal);
  return {
    refeicoes: normalizedMeals,
    kcal_total: dailyFinite(source.kcal_total, 0, 100000),
    proteina_total: dailyFinite(source.proteina_total, 0, 10000),
    carbo_total: dailyFinite(source.carbo_total, 0, 20000),
    gordura_total: dailyFinite(source.gordura_total, 0, 10000),
    observacoes: (Array.isArray(source.observacoes) ? source.observacoes : [])
      .map(value => dailyText(value, '', 240)).filter(Boolean).slice(0, 8),
    transcricao_audio: dailyText(source.transcricao_audio, '', 4000),
    confianca: ['baixa', 'media', 'alta'].includes(source.confianca) ? source.confianca : 'media'
  };
}

function findDailyMeal(meals, baseMeal, index) {
  const key = dailyKey(baseMeal?.nome_refeicao);
  if (key) {
    const byName = meals.find(meal => dailyKey(meal.nome_refeicao) === key);
    if (byName) return byName;
  }
  return meals[index] || null;
}

function findDailyItem(items, baseItem, index) {
  const key = dailyKey(baseItem?.nome);
  if (key) {
    const byName = items.find(item => dailyKey(item.nome) === key);
    if (byName) return byName;
  }
  return items[index] || null;
}

function mergeResumoDiaAnalisys(res) {
  const respostas = (Array.isArray(res) ? res : [])
    .map(normalizeDailyResult)
    .filter(result => result.refeicoes.length || result.kcal_total > 0);
  if (!respostas.length) {
    return { refeicoes: [], kcal_total: 0, proteina_total: 0, carbo_total: 0, gordura_total: 0, observacoes: [], transcricao_audio: '', confianca: 'baixa' };
  }

  const transcricaoAudio = respostas.map(result => result.transcricao_audio).find(Boolean) || '';

  // Usa a resposta com mais refeições como esqueleto. Os valores dos itens
  // são consolidados entre as demais respostas para que o total continue
  // coerente com o que será salvo no diário.
  const base = respostas.reduce((best, current) => current.refeicoes.length > best.refeicoes.length ? current : best, respostas[0]);
  if (!base.refeicoes.length) {
    const kcal = Math.round(dailyAverage(respostas.map(result => result.kcal_total), 0, 100000));
    const protein = +dailyAverage(respostas.map(result => result.proteina_total), 0, 10000).toFixed(1);
    const carbs = +dailyAverage(respostas.map(result => result.carbo_total), 0, 20000).toFixed(1);
    const fat = +dailyAverage(respostas.map(result => result.gordura_total), 0, 10000).toFixed(1);
    return {
      refeicoes: kcal > 0 ? [{
        nome_refeicao: 'Resumo do dia', horario: '',
        itens: [{ nome: 'Itens não detalhados', porcao_g: 0, kcal, proteina_g: protein, carbo_g: carbs, gordura_g: fat }],
        kcal_total: kcal, proteina_total: protein, carbo_total: carbs, gordura_total: fat, confianca: base.confianca
      }] : [],
      kcal_total: kcal,
      proteina_total: protein,
      carbo_total: carbs,
      gordura_total: fat,
      observacoes: ['A IA retornou apenas os totais; revise os itens antes de salvar.'],
      transcricao_audio: transcricaoAudio,
      confianca: base.confianca
    };
  }
  const refeicoes = base.refeicoes.map((baseMeal, mealIndex) => {
    const matchingMeals = respostas
      .map(result => findDailyMeal(result.refeicoes, baseMeal, mealIndex))
      .filter(Boolean);
    const itens = baseMeal.itens.map((baseItem, itemIndex) => {
      const matchingItems = matchingMeals
        .map(meal => findDailyItem(meal.itens, baseItem, itemIndex))
        .filter(Boolean);
      return {
        ...baseItem,
        porcao_g: Math.round(dailyAverage(matchingItems.map(item => item.porcao_g), baseItem.porcao_g, 10000)),
        kcal: Math.round(dailyAverage(matchingItems.map(item => item.kcal), baseItem.kcal, 10000)),
        proteina_g: +dailyAverage(matchingItems.map(item => item.proteina_g), baseItem.proteina_g, 1000).toFixed(1),
        carbo_g: +dailyAverage(matchingItems.map(item => item.carbo_g), baseItem.carbo_g, 2000).toFixed(1),
        gordura_g: +dailyAverage(matchingItems.map(item => item.gordura_g), baseItem.gordura_g, 1000).toFixed(1)
      };
    });
    const fallbackTotals = {
      kcal_total: dailyAverage(matchingMeals.map(meal => meal.kcal_total), baseMeal.kcal_total, 100000),
      proteina_total: dailyAverage(matchingMeals.map(meal => meal.proteina_total), baseMeal.proteina_total, 10000),
      carbo_total: dailyAverage(matchingMeals.map(meal => meal.carbo_total), baseMeal.carbo_total, 20000),
      gordura_total: dailyAverage(matchingMeals.map(meal => meal.gordura_total), baseMeal.gordura_total, 10000)
    };
    const hasItems = itens.length > 0;
    return {
      ...baseMeal,
      itens,
      kcal_total: hasItems ? itens.reduce((sum, item) => sum + item.kcal, 0) : Math.round(fallbackTotals.kcal_total),
      proteina_total: hasItems ? +itens.reduce((sum, item) => sum + item.proteina_g, 0).toFixed(1) : +fallbackTotals.proteina_total.toFixed(1),
      carbo_total: hasItems ? +itens.reduce((sum, item) => sum + item.carbo_g, 0).toFixed(1) : +fallbackTotals.carbo_total.toFixed(1),
      gordura_total: hasItems ? +itens.reduce((sum, item) => sum + item.gordura_g, 0).toFixed(1) : +fallbackTotals.gordura_total.toFixed(1)
    };
  });

  const observacoes = [];
  respostas.forEach(result => result.observacoes.forEach(note => {
    if (!observacoes.includes(note)) observacoes.push(note);
  }));
  const confidenceRank = value => ({ baixa: 0, media: 1, alta: 2 }[value] ?? 1);
  const confianca = respostas.reduce((worst, result) =>
    confidenceRank(result.confianca) < confidenceRank(worst) ? result.confianca : worst, 'alta');
  return {
    refeicoes,
    kcal_total: Math.round(refeicoes.reduce((sum, meal) => sum + meal.kcal_total, 0)),
    proteina_total: +refeicoes.reduce((sum, meal) => sum + meal.proteina_total, 0).toFixed(1),
    carbo_total: +refeicoes.reduce((sum, meal) => sum + meal.carbo_total, 0).toFixed(1),
    gordura_total: +refeicoes.reduce((sum, meal) => sum + meal.gordura_total, 0).toFixed(1),
    observacoes: observacoes.slice(0, 8),
    transcricao_audio: transcricaoAudio,
    confianca
  };
}

/* ============ FLUXO DE FOTO ============ */
let _cameraFileInput = null;
function getCameraFileInput() {
  if (!_cameraFileInput || (typeof document !== 'undefined' && document.body && !document.body.contains(_cameraFileInput))) {
    let existing = typeof document !== 'undefined' ? document.getElementById('cameraFileInput') : null;
    if (existing) {
      _cameraFileInput = existing;
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      _cameraFileInput = document.createElement('input');
      _cameraFileInput.type = 'file';
      _cameraFileInput.id = 'cameraFileInput';
      _cameraFileInput.accept = 'image/*';
      _cameraFileInput.capture = 'environment';
      _cameraFileInput.style.position = 'fixed';
      _cameraFileInput.style.top = '-9999px';
      _cameraFileInput.style.left = '-9999px';
      _cameraFileInput.style.opacity = '0';
      _cameraFileInput.style.pointerEvents = 'none';
      if (document.body) {
        document.body.appendChild(_cameraFileInput);
      } else if (typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', () => {
          if (_cameraFileInput && document.body && !document.body.contains(_cameraFileInput)) {
            document.body.appendChild(_cameraFileInput);
          }
        });
      }
    }
  }
  return _cameraFileInput;
}

function openFoto() {
  const inp = getCameraFileInput();
  if (!inp) return;
  inp.value = '';
  inp.onchange = e => {
    const f = e.target.files && e.target.files[0];
    if (f) {
      processarFoto(f);
    } else {
      toast('Nenhuma foto recebida — tente de novo, ou use a galeria');
    }
    inp.value = '';
  };
  inp.onclick = () => {};
  inp.click();
}
function abrirFoto() { openFoto(); }
window.__testProcessarFoto = f => processarFoto(f);
window.abrirFoto = abrirFoto;
window.openFoto = openFoto;
window.getCameraFileInput = getCameraFileInput;

function tentarNovamenteFoto() {
  if (typeof window.__fotoContinue === 'function') {
    return window.__fotoContinue();
  } else if (window.__fotoFile) {
    return processarFoto(window.__fotoFile);
  } else {
    return openFoto();
  }
}
window.tentarNovamenteFoto = tentarNovamenteFoto;

function encerrarAnaliseFoto() {
  const run = window.__fotoRun;
  if (!run || run.cancelled) return;
  run.cancelled = true;
  run.controller?.abort();
  run.waiters.splice(0).forEach(resolve => resolve());
  const button = $('#aiCancel');
  if (button) { button.disabled = true; button.textContent = 'Encerrando…'; }
}
window.encerrarAnaliseFoto = encerrarAnaliseFoto;

async function processarFoto(file) {
  if (!apikey) {
    toast('Configure a chave da API em Ajustes primeiro');
    setTimeout(() => { state.tab = 'ajustes'; render(); }, 300);
    return;
  }
  if (!file) {
    openModal(`
      <h2>Foto não selecionada</h2>
      <p class="api-hint" style="margin-top:8px">Nenhum arquivo de imagem foi recebido ou a captura foi cancelada.</p>
      <div class="row mt12" style="display:flex;gap:8px">
        <button class="bigbtn secondary" style="flex:1" onclick="closeModal()">Fechar</button>
        <button class="bigbtn primary" style="flex:1" onclick="closeModal();openFoto()">Tentar novamente</button>
      </div>
    `);
    return;
  }

  window.__fotoDate = currentEntryDate();
  window.__fotoFile = file;
  let b64 = null;
  try {
    b64 = await new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => {
        const res = String(r.result || '');
        const parts = res.split(',');
        if (parts.length > 1 && parts[1]) ok(parts[1]);
        else no(new Error('Formato base64 inválido no arquivo'));
      };
      r.onerror = err => no(err || new Error('Falha ao ler o arquivo de imagem'));
      r.readAsDataURL(file);
    });
  } catch (readErr) {
    console.error('Erro na leitura da foto:', readErr);
    openModal(`
      <h2>Erro ao processar imagem</h2>
      <p class="api-hint" style="margin-top:8px">Não foi possível carregar a imagem selecionada.</p>
      <details class="api-return bad open" style="margin-top:10px">
        <summary>Diagnóstico do erro</summary>
        <pre>${escapeHtml(readErr?.message || String(readErr))}</pre>
      </details>
      <div class="row mt12" style="display:flex;gap:8px">
        <button class="bigbtn secondary" style="flex:1" onclick="closeModal()">Fechar</button>
        <button class="bigbtn primary" style="flex:1" onclick="closeModal();openFoto()">Tentar novamente</button>
      </div>
    `);
    return;
  }

  const img = new Image();
  let finalB64 = b64;
  try {
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/jpeg;base64,' + b64; });
    const MAX = 1024;
    if (img.naturalWidth > MAX || img.naturalHeight > MAX) {
      const c = document.createElement('canvas');
      const sc = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight);
      c.width = Math.round(img.naturalWidth * sc);
      c.height = Math.round(img.naturalHeight * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      finalB64 = c.toDataURL('image/jpeg', 0.8).split(',')[1];
    }
  } catch(e) { finalB64 = b64; }
  window.__fotoB64 = finalB64;
  window.__fotoLegenda = '';
  window.__fotoContinue = async () => {
    const run = { cancelled: false, controller: typeof AbortController === 'function' ? new AbortController() : null, waiters: [] };
    window.__fotoRun = run;
    const fotoDate = typeof getEntryDate === 'function'
      ? getEntryDate($('#fotoData')?.value, window.__fotoDate)
      : ($('#fotoData')?.value || window.__fotoDate || currentEntryDate());
    if (!fotoDate) {
      toast('Escolha hoje ou uma data anterior válida.');
      return;
    }
    window.__fotoDate = fotoDate;
    const legenda = ($('#fotoLegenda')?.value || '').trim().slice(0, 500);
    window.__fotoLegenda = legenda;
    openModal(`
      <h2>Analisando prato…</h2>
      <img id="foto-preview" src="data:image/jpeg;base64,${finalB64}" style="display:block"/>
      <div id="aiSteps"></div>
      <button id="aiCancel" class="bigbtn secondary mt12" onclick="encerrarAnaliseFoto()">Encerrar agora e usar respostas recebidas</button>
    `);
    const steps = $('#aiSteps');
    const n = pref.precisao === 'precisa' ? 3 : 1;
    steps.innerHTML = Array.from({ length: n }, (_, i) => `<div class="ai-step"><div class="spin"></div><span>Análise ${i + 1} de ${n}…</span></div>`).join('');
    const apiReturns = [];
    const analisarUma = async i => {
      let result = null;
      let selectedTrace = null;
      for (let modelIndex = 0; modelIndex < GEMINI_MODELS.length && !result; modelIndex++) {
        const model = GEMINI_MODELS[modelIndex];
        setAnalysisStep(steps, i, progressHtml(i, n, model, 1));
        let trace = await consultarModelo(model, finalB64, i, 1, apikey, legenda, run);
        apiReturns.push(trace);
        selectedTrace = trace;
        if (trace.ok) { result = trace.result; break; }
        if (run.cancelled) break;
        if (trace.retryable) {
          setAnalysisStep(steps, i, progressHtml(i, n, model, 2, 'Falha temporária; aguardando 3 segundos…'));
          await waitMs(RETRY_DELAY_MS, run);
          if (run.cancelled) break;
          setAnalysisStep(steps, i, progressHtml(i, n, model, 2));
          trace = await consultarModelo(model, finalB64, i, 2, apikey, legenda, run);
          apiReturns.push(trace);
          selectedTrace = trace;
          if (trace.ok) { result = trace.result; break; }
        }
        if (!trace.retryable && !([200, 404].includes(trace.status))) break;
        if (modelIndex < GEMINI_MODELS.length - 1) {
          const next = GEMINI_MODELS[modelIndex + 1];
          setAnalysisStep(steps, i, progressHtml(i, n, next, 1, `Alternando para ${next.label}…`));
        }
      }
      if (result) {
        setAnalysisStep(steps, i, `<div class="ai-step" style="color:var(--status-ok)"><span>✓ Análise ${i + 1}: ${Math.round(result.kcal_total || 0)} kcal · ${selectedTrace?.modelLabel || 'Gemini'}</span></div>`);
      } else {
        const status = selectedTrace?.status ? ` (HTTP ${selectedTrace.status})` : '';
        setAnalysisStep(steps, i, `<div class="ai-step" style="color:var(--status-danger)"><span>✕ Análise ${i + 1} falhou${status} após fallback</span></div>`);
      }
      return result;
    };
    let results = [];
    if (pref.paralelo) results = await Promise.all(Array.from({ length: n }, (_, i) => analisarUma(i)));
    else for (let i = 0; i < n && !run.cancelled; i++) results.push(await analisarUma(i));
    const validos = results.filter(Boolean);
    window.__fotoRun = null;
    if (!validos.length) {
      const status = apiReturns.slice().reverse().find(x => x.status)?.status;
      steps.innerHTML = `
        <div class="ai-step" style="color:var(--status-danger);display:block">
          <b>${run.cancelled ? 'Análise encerrada sem respostas concluídas.' : 'Não foi possível analisar a foto.'}</b>
          <div class="api-hint">${apiHint(status)}</div>
          ${apiReturns.slice().sort((a, b) => (a.analysisIndex - b.analysisIndex) || (a.attempt - b.attempt)).map(apiTraceHtml).join('')}
        </div>
        <div class="row mt12" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="bigbtn primary" style="flex:1" onclick="tentarNovamenteFoto()">Tentar novamente</button>
          <button class="bigbtn secondary" style="flex:1" onclick="closeModal();modalManual()">Adicionar manual</button>
          <button class="bigbtn secondary" style="width:100%" onclick="closeModal()">Fechar</button>
        </div>`;
      return;
    }
    mostrarConfirmacaoFoto(mergeAnalisys(validos), n, validos, apiReturns, run.cancelled);
  };
  openModal(`
    <h2>Descrever foto</h2>
    <img id="foto-preview" src="data:image/jpeg;base64,${finalB64}" style="display:block"/>
    <label for="fotoData">Data do lançamento</label>
    <input id="fotoData" type="date" value="${window.__fotoDate || currentEntryDate()}" max="${currentEntryDate()}"/>
    <label for="fotoLegenda">Descrição ou legenda (opcional)</label>
    <textarea id="fotoLegenda" rows="3" maxlength="500" placeholder="Ex.: shake de banana com whey, leite e aveia"></textarea>
    <p class="small mt8">Ingredientes, quantidades e modo de preparo podem ajudar. A foto continua sendo a principal referência.</p>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="iniciarAnaliseFoto()">Analisar foto</button>
    </div>
  `);
}
window.iniciarAnaliseFoto = () => { if (typeof window.__fotoContinue === 'function') window.__fotoContinue(); };

/* Linha de item da IA: nome sempre visível em linha própria; quantidade e
   kcal com rótulos explícitos (antes virava "260 g 122" sem contexto). */
function aiItemRowHtml(i, it, updFn, rmFn, addFn, boxId, totaisFn, prefixId) {
  return `
    <div class="det-item" style="display:block;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
      <div style="display:flex;align-items:center;gap:6px">
        <input value="${escapeHtml(it.nome || 'Item')}" style="flex:1;font-weight:700;font-size:14px" placeholder="Alimento" oninput="${updFn}(${i},'nome',this.value)"/>
        <button class="det-del" onclick="${rmFn}(${i})"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
        <span style="display:inline-flex;align-items:center;gap:4px">
          <label class="small" style="color:var(--txt-secondary)">Qtd</label>
          <input type="number" class="d-qty" value="${Number(it.porcao_g) || 0}" style="width:74px" oninput="${updFn}(${i},'porcao_g',this.value)"/>
          <span class="small" style="color:var(--txt3)">g</span>
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px">
          <label class="small" style="color:var(--txt-secondary)">kcal</label>
          <input type="number" class="d-kcal" value="${Math.round(it.kcal || 0)}" style="width:80px;color:#ffffff;font-weight:700" oninput="${updFn}(${i},'kcal',this.value)"/>
        </span>
        ${Number(it.proteina_g) ? `<span class="small" style="color:var(--txt3)">P ${it.proteina_g}g</span>` : ''}
        ${Number(it.carbo_g) ? `<span class="small" style="color:var(--txt3)">C ${it.carbo_g}g</span>` : ''}
        ${Number(it.gordura_g) ? `<span class="small" style="color:var(--txt3)">G ${it.gordura_g}g</span>` : ''}
      </div>
    </div>`;
}

function renderFotoItens() {
  const box = $('#itensBox');
  if (!box) return;
  const its = window.__fotoItens || [];
  const p = $('#cP')?.value ?? 0, c = $('#cC')?.value ?? 0, g = $('#cG')?.value ?? 0;
  box.innerHTML =
    `<div class="small" style="color:var(--txt-secondary);margin-bottom:4px">Itens identificados — ajuste quantidade e kcal se precisar</div>` +
    its.map((it, i) => aiItemRowHtml(i, it, 'updItem', 'rmItem', 'addItemFoto', 'itensBox', 'updTotais', 'cP')).join('') +
    `<button class="bigbtn secondary mt8" style="font-size:13px;min-height:42px;padding:8px" onclick="addItemFoto()">+ Adicionar item</button>
     <div class="formrow three mt8">
       <div><label>P (g)</label><input id="cP" type="number" value="${p}" oninput="updTotais()"/></div>
       <div><label>C (g)</label><input id="cC" type="number" value="${c}" oninput="updTotais()"/></div>
       <div><label>G (g)</label><input id="cG" type="number" value="${g}" oninput="updTotais()"/></div>
     </div>`;
  updTotais();
}

function mostrarConfirmacaoFoto(final, n, responses, apiReturns = [], cancelled = false) {
  const varPct = desvioPct(responses.map(r => r.kcal_total || 0));
  const accHtml = cancelled
    ? `<div class="det-acc"><button class="on" disabled>Parcial (${responses.length}/${n})</button></div><p class="small mb8">Usando ${responses.length} resposta(s) recebida(s) antes do encerramento · valores estimados, edite se precisar</p>`
    : responses.length > 1
    ? `<div class="det-acc"><button class="on" disabled>Precisa (${responses.length}/${n})</button></div><p class="small mb8">Média de ${responses.length} análises · variação entre respostas: <b style="color:${varPct > 25 ? 'var(--status-danger)' : varPct > 15 ? 'var(--status-warn)' : 'var(--status-ok)'}">${varPct}%</b></p>`
    : `<p class="small mb8">Análise rápida · valores estimados, edite se precisar</p>`;
  const legendaHtml = window.__fotoLegenda ? `<div class="small mb8"><b>Descrição enviada:</b> ${escapeHtml(window.__fotoLegenda)}</div>` : '';
  const nomeSugerido = escapeHtml(String(final.nome_refeicao || '').trim() || 'Refeição com foto');
  const okCalls = apiReturns.filter(x => x.ok).length;
  const failedCalls = apiReturns.length - okCalls;
  const apiHtml = apiReturns.length ? `<details class="api-return ok mt8"><summary>Ver retorno da API (${responses.length} análises concluídas · ${okCalls} respostas OK · ${failedCalls} falhas)</summary>${apiReturns.slice().sort((a, b) => (a.analysisIndex - b.analysisIndex) || (a.attempt - b.attempt)).map(apiTraceHtml).join('')}</details>` : '';

  openModal(`
    <h2>Prato identificado</h2>
    <img id="foto-preview" src="data:image/jpeg;base64,${window.__fotoB64 || ''}" style="display:block"/>
    ${legendaHtml}${accHtml}${apiHtml}
    <div id="itensBox"></div>
    <div class="det-total">Total: <span class="v" id="cTotal">${Math.round(final.kcal_total || 0)} kcal</span></div>
    <div class="small" style="margin-top:6px">P <b>${final.proteina_total || 0}g</b> · C <b>${final.carbo_total || 0}g</b> · G <b>${final.gordura_total || 0}g</b></div>
    <label style="margin-top:12px">Nome da refeição</label>
    <input id="cNome" value="${nomeSugerido}" maxlength="80" style="margin-bottom:4px"/>
    <label style="margin-top:10px">Data do lançamento</label>
    <input id="cDataFoto" type="date" value="${window.__fotoDate || currentEntryDate()}" max="${currentEntryDate()}"/>
    <button id="saveFotoAlimento" class="bigbtn secondary mt8" onclick="salvarFotoAlimento()">Salvar refeição em Meus alimentos</button>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmFoto()">Confirmar</button>
    </div>
  `);

  window.__fotoItens = Array.isArray(final.itens) ? final.itens.map(i => ({ ...i })) : [];
  window.__fotoMacroDefaults = { p: final.proteina_total || 0, c: final.carbo_total || 0, g: final.gordura_total || 0 };
  renderFotoItens();
}

function updItem(i, k, v) {
  const it = window.__fotoItens?.[i];
  if (!it) return;
  it[k] = k === 'nome' ? v : parseFloat(v) || 0;
  updTotais();
}

function rmItem(i) {
  if (!window.__fotoItens) return;
  window.__fotoItens.splice(i, 1);
  renderFotoItens();
}

function addItemFoto() {
  window.__fotoItens = window.__fotoItens || [];
  window.__fotoItens.push({ nome: 'Item', porcao_g: 100, kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 });
  renderFotoItens();
}

function updTotais() {
  const k = (window.__fotoItens || []).reduce((a, i) => a + (parseFloat(i.kcal) || 0), 0);
  if ($('#cTotal')) $('#cTotal').textContent = fmt(k) + ' kcal';
}

function salvarFotoAlimento() {
  const itens = (window.__fotoItens || []).filter(i => (i.kcal || 0) > 0);
  if (!itens.length) { toast('Nenhum item com calorias para salvar'); return; }
  const nome = ($('#cNome')?.value || 'Refeição com foto').trim() || 'Refeição com foto';
  const soma = (campo, sel) => {
    const informado = parseFloat($(sel)?.value);
    return Number.isFinite(informado) ? informado : itens.reduce((s, i) => s + (parseFloat(i[campo]) || 0), 0);
  };
  saveAlim({
    nome,
    porcao_g: Math.max(1, Math.round(itens.reduce((s, i) => s + (parseFloat(i.porcao_g) || 0), 0)) || 100),
    kcal: Math.round(itens.reduce((s, i) => s + (parseFloat(i.kcal) || 0), 0)),
    proteina_g: +soma('proteina_g', '#cP').toFixed(1),
    carbo_g: +soma('carbo_g', '#cC').toFixed(1),
    gordura_g: +soma('gordura_g', '#cG').toFixed(1),
    tipo: 'refeicao_foto'
  });
  const button = $('#saveFotoAlimento');
  if (button) { button.disabled = true; button.textContent = 'Salvo em Meus alimentos ✓'; }
  toast('Refeição salva em Meus alimentos!');
}

function confirmFoto() {
  const nome = $('#cNome')?.value.trim() || 'Refeição com foto';
  const itens = (window.__fotoItens || []).filter(i => (i.kcal || 0) > 0);
  if (!itens.length) { toast('Nenhum item com calorias'); return; }
  const date = typeof getEntryDate === 'function'
    ? getEntryDate($('#cDataFoto')?.value, window.__fotoDate)
    : ($('#cDataFoto')?.value || window.__fotoDate || currentEntryDate());
  if (!date) {
    toast('Escolha hoje ou uma data anterior válida.');
    return;
  }
  meals.push({ id: uid(), date, hour: horaNow(), nome, itens, origem: 'foto' });
  save(LS.m, meals);
  if (typeof setActiveDate === 'function') setActiveDate(date, false);
  closeModal();
  toast(`Refeição salva em ${typeof formatRegistroDate === 'function' ? formatRegistroDate(date) : date}!`);
  render();
}

window.salvarFotoAlimento = salvarFotoAlimento;
window.updItem = updItem;
window.rmItem = rmItem;
window.addItemFoto = addItemFoto;
window.updTotais = updTotais;
window.confirmFoto = confirmFoto;

/* ============ GRAVAÇÃO DE ÁUDIO ============ */
const AUDIO_MAX_DURATION_MS = 3 * 60 * 1000;

function getAudioBridge() {
  try {
    const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null;
    return bridge && typeof bridge.startAudioRecording === 'function' ? bridge : null;
  } catch (_) {
    return null;
  }
}

function audioDurationLabel(ms) {
  const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function parseAudioBridgeResult(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw || '{}')); } catch (_) { return { ok: false, code: 'invalid_response' }; }
}

function clearAudioTicker() {
  if (window.__audioTicker) {
    clearInterval(window.__audioTicker);
    window.__audioTicker = null;
  }
}

function resetAudioRecorderState(cancelNative = true) {
  clearAudioTicker();
  if (cancelNative) {
    const bridge = getAudioBridge();
    try { if (bridge && typeof bridge.cancelAudioRecording === 'function') bridge.cancelAudioRecording(); } catch (_) {}
  }
  window.__audioRecorderState = 'idle';
  window.__audioRecorderStartedAt = 0;
  window.__audioRecording = null;
  window.__audioRecorderMode = null;
}

function renderAudioRecorder() {
  const box = $('#audioRecorderPanel');
  if (!box) return;
  const state = window.__audioRecorderState || 'idle';
  const recording = state === 'recording';
  const ready = state === 'ready' && window.__audioRecording;
  const elapsed = recording
    ? Date.now() - (window.__audioRecorderStartedAt || Date.now())
    : (ready ? window.__audioRecording.durationMs : 0);
  const status = state === 'recording'
    ? 'Gravando… fale naturalmente sobre o que você comeu.'
    : state === 'requesting'
      ? 'Aguardando autorização do microfone…'
      : state === 'processing'
        ? 'Preparando o áudio…'
        : ready
          ? 'Áudio pronto para a análise.'
          : 'Toque em gravar e descreva os alimentos, quantidades e horários.';
  const action = recording
    ? `<button id="audioRecordButton" type="button" class="bigbtn primary audio-record-button" onclick="pararGravacaoAudio()">⏹️ Parar gravação</button>`
    : `<button id="audioRecordButton" type="button" class="bigbtn ${ready ? 'secondary' : 'primary'} audio-record-button" ${state === 'requesting' || state === 'processing' ? 'disabled' : ''} onclick="iniciarGravacaoAudio()">${ready ? '🔁 Gravar novamente' : '🎙️ Começar gravação'}</button>`;
  box.innerHTML = `
    <div class="audio-recorder-status ${recording ? 'is-recording' : ''}">
      <span class="audio-record-dot"></span>
      <span>${escapeHtml(status)}</span>
      <b id="audioElapsed">${audioDurationLabel(elapsed)}</b>
    </div>
    ${ready ? `<div class="small mt8">O áudio será enviado para a IA junto com o contexto deste formulário.</div>` : ''}
    ${action}`;
  const mealButton = $('#analisarAudioRefeicaoBtn');
  if (mealButton) mealButton.disabled = !ready;
}

function startAudioTicker() {
  clearAudioTicker();
  window.__audioTicker = setInterval(() => {
    if (window.__audioRecorderState !== 'recording') { clearAudioTicker(); return; }
    const elapsed = Date.now() - (window.__audioRecorderStartedAt || Date.now());
    const clock = $('#audioElapsed');
    if (clock) clock.textContent = audioDurationLabel(elapsed);
    if (elapsed >= AUDIO_MAX_DURATION_MS) pararGravacaoAudio();
  }, 1000);
}

function iniciarGravacaoAudio() {
  const bridge = getAudioBridge();
  if (!bridge) {
    toast('A gravação de áudio está disponível no APK Android atualizado.');
    return;
  }
  if (window.__audioRecorderState === 'recording' || window.__audioRecorderState === 'requesting') return;
  if (window.__audioRecorderState === 'ready') {
    try { if (typeof bridge.cancelAudioRecording === 'function') bridge.cancelAudioRecording(); } catch (_) {}
    window.__audioRecording = null;
  }
  window.__audioRecorderState = 'requesting';
  renderAudioRecorder();
  let result;
  try { result = parseAudioBridgeResult(bridge.startAudioRecording()); } catch (_) {
    result = { ok: false, code: 'recording_failed' };
  }
  if (result.code === 'permission_required') {
    renderAudioRecorder();
    return;
  }
  if (!result.ok || result.code !== 'recording') {
    window.__audioRecorderState = 'idle';
    renderAudioRecorder();
    toast(result.message || 'Não foi possível iniciar a gravação.');
    return;
  }
  window.__audioRecorderState = 'recording';
  window.__audioRecorderStartedAt = Date.now();
  renderAudioRecorder();
  startAudioTicker();
}

function pararGravacaoAudio() {
  if (window.__audioRecorderState !== 'recording') return;
  clearAudioTicker();
  window.__audioRecorderState = 'processing';
  renderAudioRecorder();
  const bridge = getAudioBridge();
  let result;
  try { result = parseAudioBridgeResult(bridge ? bridge.stopAudioRecording() : null); } catch (_) {
    result = { ok: false, code: 'read_failed' };
  }
  if (!result.ok || !result.data) {
    window.__audioRecorderState = 'idle';
    window.__audioRecorderStartedAt = 0;
    renderAudioRecorder();
    toast(result.message || 'Não foi possível preparar o áudio.');
    return;
  }
  window.__audioRecording = {
    data: String(result.data),
    mimeType: String(result.mimeType || 'audio/mp4'),
    durationMs: Number(result.durationMs) || (Date.now() - (window.__audioRecorderStartedAt || Date.now()))
  };
  window.__audioRecorderState = 'ready';
  window.__audioRecorderStartedAt = 0;
  renderAudioRecorder();
}

function fecharModalComAudio() {
  resetAudioRecorderState(true);
  closeModal();
}

window.__nutriAudioPermissionResult = function(granted) {
  if (window.__audioRecorderState !== 'requesting') return;
  if (!granted) {
    window.__audioRecorderState = 'idle';
    renderAudioRecorder();
    toast('Permissão do microfone negada. Você pode autorizar nas configurações do Android.');
    return;
  }
  if (!$('#audioRecorderPanel')) return;
  iniciarGravacaoAudio();
};

function abrirAudioRefeicaoIA() {
  resetAudioRecorderState(true);
  window.__audioRecorderMode = 'meal';
  window.__textoOrigem = 'ia_audio';
  window.__textoDate = currentEntryDate();
  openModal(`
    <h2>🎙️ Gravar refeição com IA</h2>
    <p class="small mb8">Fale o que você comeu, as quantidades aproximadas e, se quiser, a forma de preparo. A IA transcreve o relato e estima os nutrientes.</p>
    <div class="audio-recorder-card"><div id="audioRecorderPanel"></div></div>
    <label for="audioRefeicaoContexto" style="margin-top:12px">Contexto adicional (opcional)</label>
    <textarea id="audioRefeicaoContexto" rows="3" maxlength="1000" placeholder="Ex.: foi no almoço e o frango foi grelhado"></textarea>
    <label for="audioRefeicaoData" style="margin-top:10px">Data do lançamento</label>
    <input id="audioRefeicaoData" type="date" value="${currentEntryDate()}" max="${currentEntryDate()}"/>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="fecharModalComAudio()">Cancelar</button>
      <button id="analisarAudioRefeicaoBtn" class="bigbtn primary" disabled onclick="analisarAudioRefeicao()">Analisar áudio</button>
    </div>
  `);
  renderAudioRecorder();
}

function analisarAudioRefeicao() {
  const audio = window.__audioRecording;
  if (!audio || window.__audioRecorderState !== 'ready') {
    toast('Grave e pare o áudio antes de analisar.');
    return;
  }
  if (!apikey) {
    toast('Configure a chave da API em Ajustes primeiro');
    setTimeout(() => { state.tab = 'ajustes'; render(); }, 300);
    return;
  }
  const date = typeof getEntryDate === 'function'
    ? getEntryDate($('#audioRefeicaoData')?.value)
    : ($('#audioRefeicaoData')?.value || currentEntryDate());
  if (!date) { toast('Escolha hoje ou uma data anterior válida.'); return; }
  const contexto = ($('#audioRefeicaoContexto')?.value || '').trim().slice(0, 1000);
  window.__textoDate = date;
  window.__textoAudio = audio;
  window.__textoAudioContexto = contexto;
  clearAudioTicker();
  processarAudioRefeicao(audio, contexto);
}

/* ============ RESUMO DO DIA (TEXTO + MÚLTIPLAS FOTOS) ============ */
const RESUMO_DIA_MAX_TEXTO = 12000;
const RESUMO_DIA_MAX_FOTOS = 8;
let _resumoDiaFileInput = null;

function getResumoDiaFileInput() {
  if (!_resumoDiaFileInput || (typeof document !== 'undefined' && document.body && !document.body.contains(_resumoDiaFileInput))) {
    let existing = typeof document !== 'undefined' ? document.getElementById('resumoDiaFileInput') : null;
    if (existing) {
      _resumoDiaFileInput = existing;
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      _resumoDiaFileInput = document.createElement('input');
      _resumoDiaFileInput.type = 'file';
      _resumoDiaFileInput.id = 'resumoDiaFileInput';
      _resumoDiaFileInput.accept = 'image/*';
      _resumoDiaFileInput.multiple = true;
      _resumoDiaFileInput.style.position = 'fixed';
      _resumoDiaFileInput.style.top = '-9999px';
      _resumoDiaFileInput.style.left = '-9999px';
      _resumoDiaFileInput.style.opacity = '0';
      _resumoDiaFileInput.style.pointerEvents = 'none';
      if (document.body) document.body.appendChild(_resumoDiaFileInput);
    }
  }
  return _resumoDiaFileInput;
}

function readResumoDiaImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('Arquivo de imagem ausente')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const source = String(reader.result || '');
      if (!source.includes(',')) { reject(new Error('Formato de imagem inválido')); return; }
      const originalMime = source.slice(5, source.indexOf(';')) || 'image/jpeg';
      const finish = (dataUrl, mimeType) => resolve({
        data: String(dataUrl).split(',')[1],
        mimeType: mimeType || 'image/jpeg',
        name: dailyText(file.name, 'foto', 100)
      });
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const max = 1024;
            if (img.naturalWidth > max || img.naturalHeight > max) {
              const canvas = document.createElement('canvas');
              const scale = Math.min(max / img.naturalWidth, max / img.naturalHeight);
              canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
              canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
              canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
              finish(canvas.toDataURL('image/jpeg', 0.82), 'image/jpeg');
            } else {
              finish(source, originalMime.startsWith('image/') ? originalMime : 'image/jpeg');
            }
          } catch (_) {
            // A falha de canvas não deve impedir a análise: usa o arquivo original.
            finish(source, originalMime.startsWith('image/') ? originalMime : 'image/jpeg');
          }
        };
        img.onerror = () => finish(source, originalMime.startsWith('image/') ? originalMime : 'image/jpeg');
        img.src = source;
      } catch (_) {
        finish(source, originalMime.startsWith('image/') ? originalMime : 'image/jpeg');
      }
    };
    reader.onerror = () => reject(new Error('Não foi possível ler uma das imagens'));
    reader.readAsDataURL(file);
  });
}

function renderResumoDiaFotos() {
  const box = $('#resumoDiaFotos');
  if (!box) return;
  const fotos = Array.isArray(window.__resumoDiaFotos) ? window.__resumoDiaFotos : [];
  const busy = window.__resumoDiaPhotosBusy;
  const count = $('#resumoDiaFotoCount');
  if (count) count.textContent = `${fotos.length}/${RESUMO_DIA_MAX_FOTOS} fotos anexadas`;
  if (!fotos.length) {
    box.innerHTML = `<div class="daily-photo-empty">Nenhuma foto anexada. Você pode usar só o texto ou combinar texto e imagens.</div>`;
    return;
  }
  box.innerHTML = `<div class="daily-photo-grid">${fotos.map((foto, index) => `
    <div class="daily-photo-tile">
      <img src="data:${escapeHtml(foto.mimeType || 'image/jpeg')};base64,${foto.data}" alt="Foto ${index + 1}"/>
      <button type="button" class="daily-photo-remove" onclick="removerResumoDiaFoto(${index})" aria-label="Remover foto ${index + 1}">×</button>
      <span>Foto ${index + 1}</span>
    </div>`).join('')}</div>
    ${busy ? '<div class="small mt8">Carregando fotos…</div>' : ''}`;
}

async function adicionarResumoDiaFotos(files) {
  const incoming = Array.from(files || []).filter(Boolean);
  if (!incoming.length) return;
  const fotosAtuais = Array.isArray(window.__resumoDiaFotos) ? window.__resumoDiaFotos : [];
  const remaining = RESUMO_DIA_MAX_FOTOS - fotosAtuais.length;
  if (remaining <= 0) {
    toast(`O resumo aceita até ${RESUMO_DIA_MAX_FOTOS} fotos.`);
    return;
  }
  if (incoming.length > remaining) toast(`Só as primeiras ${remaining} fotos serão adicionadas.`);
  window.__resumoDiaPhotosBusy = true;
  renderResumoDiaFotos();
  let added = 0;
  for (const file of incoming.slice(0, remaining)) {
    try {
      const photo = await readResumoDiaImage(file);
      fotosAtuais.push(photo);
      added++;
      renderResumoDiaFotos();
    } catch (error) {
      console.warn('[nutritrack] foto do resumo ignorada', error);
    }
  }
  window.__resumoDiaFotos = fotosAtuais;
  window.__resumoDiaPhotosBusy = false;
  renderResumoDiaFotos();
  if (!added) toast('Não foi possível carregar as fotos selecionadas.');
}

function abrirResumoDiaFotos() {
  const input = getResumoDiaFileInput();
  if (!input) { toast('Seletor de fotos indisponível neste aparelho.'); return; }
  input.value = '';
  input.onchange = event => {
    // Copia o FileList antes de limpar o input; em alguns WebViews ele é um
    // objeto vivo e ficaria vazio depois de input.value = ''.
    const files = Array.from(event.target.files || []);
    input.value = '';
    adicionarResumoDiaFotos(files);
  };
  input.click();
}

function removerResumoDiaFoto(index) {
  if (!Array.isArray(window.__resumoDiaFotos)) return;
  window.__resumoDiaFotos.splice(Number(index), 1);
  renderResumoDiaFotos();
}

function abrirResumoDiaIA() {
  resetAudioRecorderState(true);
  window.__audioRecorderMode = 'daily';
  window.__resumoDiaDate = currentEntryDate();
  window.__resumoDiaFotos = [];
  window.__resumoDiaAudio = null;
  window.__resumoDiaPhotosBusy = false;
  openModal(`
    <h2>🧾 Resumo do dia com IA</h2>
    <p class="small mb8">Cole aqui as mensagens do WhatsApp e, se quiser, anexe as fotos que você tirou ao longo do dia. A IA separa as refeições e calcula tudo em uma única análise.</p>
    <label for="resumoDiaTexto">O que você comeu ao longo do dia</label>
    <textarea id="resumoDiaTexto" rows="9" maxlength="${RESUMO_DIA_MAX_TEXTO}" placeholder="Ex.:\n08:00 — café com leite e 2 ovos\n12:30 — arroz, feijão, frango e salada\n16:00 — banana com whey\n20:00 — pizza e refrigerante"></textarea>
    <div class="small mt8">Pode colar várias mensagens, com ou sem horários. A IA tentará agrupar o que pertence à mesma refeição.</div>
    <div class="audio-recorder-card mt12"><div class="daily-photo-picker-head"><div><b>Relato em áudio</b><div class="small">Opcional · até 3 minutos</div></div></div><div id="audioRecorderPanel"></div></div>
    <label for="resumoDiaData" style="margin-top:12px">Data do resumo</label>
    <input id="resumoDiaData" type="date" value="${window.__resumoDiaDate}" max="${currentEntryDate()}"/>
    <div class="daily-photo-picker mt12">
      <div class="daily-photo-picker-head">
        <div><b>Fotos do dia</b><div class="small">Até ${RESUMO_DIA_MAX_FOTOS} imagens</div></div>
        <span id="resumoDiaFotoCount" class="small">0/${RESUMO_DIA_MAX_FOTOS} fotos anexadas</span>
      </div>
      <div id="resumoDiaFotos"></div>
      <button type="button" class="bigbtn secondary mt8" onclick="abrirResumoDiaFotos()">＋ Adicionar fotos</button>
    </div>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="fecharModalComAudio()">Cancelar</button>
      <button class="bigbtn primary" onclick="iniciarAnaliseResumoDia()">Calcular resumo</button>
    </div>
  `);
  renderResumoDiaFotos();
  setTimeout(() => { const el = $('#resumoDiaTexto'); if (el) el.focus(); }, 100);
}

function encerrarAnaliseResumoDia() {
  const run = window.__resumoDiaRun;
  if (!run || run.cancelled) return;
  run.cancelled = true;
  run.controller?.abort();
  run.waiters.splice(0).forEach(resolve => resolve());
  const button = $('#aiCancelResumoDia');
  if (button) { button.disabled = true; button.textContent = 'Encerrando…'; }
}

function tentarNovamenteResumoDia() {
  if (typeof window.__resumoDiaContinue === 'function') return window.__resumoDiaContinue();
  return abrirResumoDiaIA();
}

async function iniciarAnaliseResumoDia() {
  const texto = ($('#resumoDiaTexto')?.value || '').trim().slice(0, RESUMO_DIA_MAX_TEXTO);
  const date = typeof getEntryDate === 'function'
    ? getEntryDate($('#resumoDiaData')?.value)
    : ($('#resumoDiaData')?.value || currentEntryDate());
  const fotos = Array.isArray(window.__resumoDiaFotos) ? window.__resumoDiaFotos.slice(0, RESUMO_DIA_MAX_FOTOS) : [];
  if (window.__audioRecorderState === 'recording' || window.__audioRecorderState === 'processing') {
    toast('Pare a gravação antes de calcular o resumo.');
    return;
  }
  const audio = window.__audioRecorderState === 'ready' ? audioPayload(window.__audioRecording) : null;
  if (!texto && !fotos.length && !audio) {
    toast('Cole o relato, grave um áudio ou adicione pelo menos uma foto.');
    return;
  }
  if (!apikey) {
    toast('Configure a chave da API em Ajustes primeiro');
    setTimeout(() => { state.tab = 'ajustes'; render(); }, 300);
    return;
  }
  if (!date) {
    toast('Escolha hoje ou uma data anterior válida.');
    return;
  }
  window.__resumoDiaDate = date;
  window.__resumoDiaTexto = texto;
  window.__resumoDiaFotos = fotos;
  window.__resumoDiaAudio = audio;
  await processarResumoDia(texto, fotos, date, audio);
}

async function processarResumoDia(texto, fotos, date, audio = null) {
  const relato = String(texto || '').trim().slice(0, RESUMO_DIA_MAX_TEXTO);
  const imagens = (Array.isArray(fotos) ? fotos : []).slice(0, RESUMO_DIA_MAX_FOTOS);
  const gravacao = audioPayload(audio || window.__resumoDiaAudio);
  window.__resumoDiaTexto = relato;
  window.__resumoDiaFotos = imagens;
  window.__resumoDiaAudio = gravacao;
  window.__resumoDiaDate = date || currentEntryDate();
  window.__resumoDiaContinue = () => processarResumoDia(window.__resumoDiaTexto, window.__resumoDiaFotos, window.__resumoDiaDate, window.__resumoDiaAudio);

  const run = {
    cancelled: false,
    controller: typeof AbortController === 'function' ? new AbortController() : null,
    waiters: []
  };
  window.__resumoDiaRun = run;
  openModal(`
    <h2>Calculando resumo do dia…</h2>
    <div class="small mb8">${relato ? 'Relato textual recebido' : 'Sem texto'} · ${imagens.length} foto(s) · ${gravacao ? `áudio ${audioDurationLabel(gravacao.durationMs)}` : 'sem áudio'}</div>
    <div id="aiStepsResumoDia"></div>
    <button id="aiCancelResumoDia" class="bigbtn secondary mt12" onclick="encerrarAnaliseResumoDia()">Encerrar agora e usar respostas recebidas</button>
  `);
  const steps = $('#aiStepsResumoDia');
  const n = pref.precisao === 'precisa' ? 3 : 1;
  steps.innerHTML = Array.from({ length: n }, (_, i) => `<div class="ai-step"><div class="spin"></div><span>Análise ${i + 1} de ${n}…</span></div>`).join('');
  const apiReturns = [];
  const analisarUma = async index => {
    let result = null;
    let selectedTrace = null;
    for (let modelIndex = 0; modelIndex < GEMINI_MODELS.length && !result; modelIndex++) {
      const model = GEMINI_MODELS[modelIndex];
      setAnalysisStep(steps, index, progressHtml(index, n, model, 1, `Resumo ${index + 1} de ${n}…`));
      let trace = await consultarModeloResumoDia(model, relato, imagens, window.__resumoDiaDate, index, 1, apikey, run, gravacao);
      apiReturns.push(trace);
      selectedTrace = trace;
      if (trace.ok) { result = trace.result; break; }
      if (run.cancelled) break;
      if (trace.retryable) {
        setAnalysisStep(steps, index, progressHtml(index, n, model, 2, 'Falha temporária; aguardando 3 segundos…'));
        await waitMs(RETRY_DELAY_MS, run);
        if (run.cancelled) break;
        setAnalysisStep(steps, index, progressHtml(index, n, model, 2));
        trace = await consultarModeloResumoDia(model, relato, imagens, window.__resumoDiaDate, index, 2, apikey, run, gravacao);
        apiReturns.push(trace);
        selectedTrace = trace;
        if (trace.ok) { result = trace.result; break; }
      }
      if (!trace.retryable && !([200, 404].includes(trace.status))) break;
      if (modelIndex < GEMINI_MODELS.length - 1) {
        const next = GEMINI_MODELS[modelIndex + 1];
        setAnalysisStep(steps, index, progressHtml(index, n, next, 1, `Alternando para ${next.label}…`));
      }
    }
    if (result) {
      const count = Array.isArray(result.refeicoes) ? result.refeicoes.length : 1;
      setAnalysisStep(steps, index, `<div class="ai-step" style="color:var(--status-ok)"><span>✓ Análise ${index + 1}: ${count} refeição(ões) · ${Math.round(result.kcal_total || 0)} kcal · ${selectedTrace?.modelLabel || 'Gemini'}</span></div>`);
    } else {
      const status = selectedTrace?.status ? ` (HTTP ${selectedTrace.status})` : '';
      setAnalysisStep(steps, index, `<div class="ai-step" style="color:var(--status-danger)"><span>✕ Análise ${index + 1} falhou${status} após fallback</span></div>`);
    }
    return result;
  };

  let results = [];
  if (pref.paralelo) results = await Promise.all(Array.from({ length: n }, (_, i) => analisarUma(i)));
  else for (let i = 0; i < n && !run.cancelled; i++) results.push(await analisarUma(i));
  const validos = results.filter(Boolean);
  window.__resumoDiaRun = null;

  if (!validos.length) {
    const status = apiReturns.slice().reverse().find(item => item.status)?.status;
    steps.innerHTML = `
      <div class="ai-step" style="color:var(--status-danger);display:block">
        <b>${run.cancelled ? 'Análise encerrada sem respostas concluídas.' : 'Não foi possível calcular o resumo.'}</b>
        <div class="api-hint">${apiHint(status)}</div>
        ${apiReturns.slice().sort((a, b) => (a.analysisIndex - b.analysisIndex) || (a.attempt - b.attempt)).map(apiTraceHtml).join('')}
      </div>
      <div class="row mt12" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="bigbtn primary" style="flex:1" onclick="tentarNovamenteResumoDia()">Tentar novamente</button>
        <button class="bigbtn secondary" style="flex:1" onclick="abrirResumoDiaIA()">Editar entrada</button>
        <button class="bigbtn secondary" style="width:100%" onclick="closeModal()">Fechar</button>
      </div>`;
    return;
  }
  mostrarConfirmacaoResumoDia(mergeResumoDiaAnalisys(validos), n, validos, apiReturns, run.cancelled, relato, imagens, gravacao);
}

function resumoDiaMealTotals(meal) {
  const itens = Array.isArray(meal?.itens) ? meal.itens : [];
  return {
    kcal: itens.reduce((sum, item) => sum + (parseFloat(item.kcal) || 0), 0),
    p: itens.reduce((sum, item) => sum + (parseFloat(item.proteina_g) || 0), 0),
    c: itens.reduce((sum, item) => sum + (parseFloat(item.carbo_g) || 0), 0),
    g: itens.reduce((sum, item) => sum + (parseFloat(item.gordura_g) || 0), 0)
  };
}

function resumoDiaDraftTotals() {
  return (Array.isArray(window.__resumoDiaRefeicoes) ? window.__resumoDiaRefeicoes : []).reduce((total, meal) => {
    const mealTotal = resumoDiaMealTotals(meal);
    total.kcal += mealTotal.kcal;
    total.p += mealTotal.p;
    total.c += mealTotal.c;
    total.g += mealTotal.g;
    return total;
  }, { kcal: 0, p: 0, c: 0, g: 0 });
}

function renderResumoDiaMealItems(mealIndex) {
  const box = $(`#resumoDiaItens${mealIndex}`);
  const meal = window.__resumoDiaRefeicoes?.[mealIndex];
  if (!box || !meal) return;
  box.innerHTML = (meal.itens || []).map((item, itemIndex) => `
    <div class="det-item daily-summary-item" style="display:block;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
      <div style="display:flex;align-items:center;gap:6px">
        <input value="${escapeHtml(item.nome || 'Item')}" style="flex:1;font-weight:700;font-size:14px" placeholder="Alimento" oninput="updResumoDiaItem(${mealIndex},${itemIndex},'nome',this.value)"/>
        <button class="det-del" onclick="rmResumoDiaItem(${mealIndex},${itemIndex})" aria-label="Remover item"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap">
        <span style="display:inline-flex;align-items:center;gap:4px"><label class="small" style="color:var(--txt-secondary)">Qtd</label><input type="number" value="${Number(item.porcao_g) || 0}" style="width:74px" oninput="updResumoDiaItem(${mealIndex},${itemIndex},'porcao_g',this.value)"/><span class="small" style="color:var(--txt3)">g</span></span>
        <span style="display:inline-flex;align-items:center;gap:4px"><label class="small" style="color:var(--txt-secondary)">kcal</label><input type="number" value="${Math.round(item.kcal || 0)}" style="width:80px;color:#ffffff;font-weight:700" oninput="updResumoDiaItem(${mealIndex},${itemIndex},'kcal',this.value)"/></span>
        <span class="small" style="color:var(--txt3)">P ${item.proteina_g || 0}g · C ${item.carbo_g || 0}g · G ${item.gordura_g || 0}g</span>
      </div>
    </div>`).join('');
}

function renderResumoDiaRefeicoes() {
  const box = $('#resumoDiaRefeicoes');
  if (!box) return;
  const refeicoes = Array.isArray(window.__resumoDiaRefeicoes) ? window.__resumoDiaRefeicoes : [];
  box.innerHTML = refeicoes.map((meal, index) => `
    <section class="daily-meal-card">
      <div class="daily-meal-head">
        <div class="grow"><label>Refeição ${index + 1}</label><input value="${escapeHtml(meal.nome_refeicao || 'Refeição')}" maxlength="100" oninput="updResumoDiaMeal(${index},'nome_refeicao',this.value)"/></div>
        <div class="daily-meal-hour"><label>Horário</label><input value="${escapeHtml(meal.horario || '')}" maxlength="40" placeholder="Ex.: 12:30" oninput="updResumoDiaMeal(${index},'horario',this.value)"/></div>
      </div>
      <div id="resumoDiaItens${index}"></div>
      <button class="bigbtn secondary mt8 daily-add-item" onclick="addResumoDiaItem(${index})">＋ Adicionar item</button>
      <div class="daily-meal-total">Total da refeição: <b id="resumoDiaMealTotal${index}">0 kcal</b></div>
    </section>`).join('');
  refeicoes.forEach((_, index) => renderResumoDiaMealItems(index));
  updResumoDiaTotals();
}

function updResumoDiaMeal(index, field, value) {
  const meal = window.__resumoDiaRefeicoes?.[index];
  if (!meal) return;
  meal[field] = String(value || '').slice(0, field === 'horario' ? 40 : 100);
}

function updResumoDiaItem(mealIndex, itemIndex, field, value) {
  const item = window.__resumoDiaRefeicoes?.[mealIndex]?.itens?.[itemIndex];
  if (!item) return;
  item[field] = field === 'nome' ? String(value || '').slice(0, 160) : dailyFinite(value, 0, field === 'porcao_g' ? 10000 : 10000);
  updResumoDiaTotals();
}

function rmResumoDiaItem(mealIndex, itemIndex) {
  const meal = window.__resumoDiaRefeicoes?.[mealIndex];
  if (!meal) return;
  meal.itens.splice(itemIndex, 1);
  renderResumoDiaMealItems(mealIndex);
  updResumoDiaTotals();
}

function addResumoDiaItem(mealIndex) {
  const meal = window.__resumoDiaRefeicoes?.[mealIndex];
  if (!meal) return;
  meal.itens = Array.isArray(meal.itens) ? meal.itens : [];
  meal.itens.push({ nome: 'Item', porcao_g: 100, kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 });
  renderResumoDiaMealItems(mealIndex);
}

function updResumoDiaTotals() {
  const total = resumoDiaDraftTotals();
  const set = (id, value, decimals = 0) => {
    const el = $(`#${id}`);
    if (el) el.textContent = `${decimals ? Number(value).toFixed(decimals) : Math.round(value)}${id === 'resumoDiaKcal' ? ' kcal' : 'g'}`;
  };
  set('resumoDiaKcal', total.kcal);
  set('resumoDiaP', total.p, 1);
  set('resumoDiaC', total.c, 1);
  set('resumoDiaG', total.g, 1);
  (window.__resumoDiaRefeicoes || []).forEach((meal, index) => {
    const el = $(`#resumoDiaMealTotal${index}`);
    if (el) el.textContent = `${fmt(resumoDiaMealTotals(meal).kcal)} kcal`;
  });
}

function formatResumoDiaHour(value) {
  const match = String(value || '').match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?:\D|$)/);
  return match ? `${String(match[1]).padStart(2, '0')}:${match[2]}` : horaNow();
}

function mostrarConfirmacaoResumoDia(final, n, responses, apiReturns = [], cancelled = false, textoOriginal = '', fotos = [], audio = null) {
  const variacoes = responses.map(item => item.kcal_total || 0);
  const varPct = desvioPct(variacoes);
  const accHtml = cancelled
    ? `<div class="det-acc"><button class="on" disabled>Parcial (${responses.length}/${n})</button></div><p class="small mb8">Usando ${responses.length} resposta(s) recebida(s) antes do encerramento.</p>`
    : responses.length > 1
      ? `<div class="det-acc"><button class="on" disabled>Precisa (${responses.length}/${n})</button></div><p class="small mb8">Média consolidada de ${responses.length} análises · variação entre respostas: <b style="color:${varPct > 25 ? 'var(--status-danger)' : varPct > 15 ? 'var(--status-warn)' : 'var(--status-ok)'}">${varPct}%</b></p>`
      : `<p class="small mb8">Análise rápida · valores estimados; revise os itens antes de salvar.</p>`;
  const descHtml = textoOriginal ? `<div class="small mb8"><b>Texto enviado:</b> ${escapeHtml(textoOriginal.slice(0, 1600))}${textoOriginal.length > 1600 ? '…' : ''}</div>` : '';
  const photoHtml = fotos.length ? `<div class="small mb8"><b>${fotos.length} foto(s)</b> considerada(s) na análise.</div>` : '';
  const audioHtml = audio ? `<div class="small mb8"><b>Áudio de ${audioDurationLabel(audio.durationMs)}</b> considerado na análise.</div>` : '';
  const transcriptHtml = final.transcricao_audio ? `<details class="audio-transcript mb8"><summary>Ver transcrição entendida pela IA</summary><div>${escapeHtml(final.transcricao_audio)}</div></details>` : '';
  const notesHtml = Array.isArray(final.observacoes) && final.observacoes.length
    ? `<div class="daily-notes"><b>Confira estas observações:</b><ul>${final.observacoes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>`
    : '';
  const okCalls = apiReturns.filter(item => item.ok).length;
  const failedCalls = apiReturns.length - okCalls;
  const apiHtml = apiReturns.length ? `<details class="api-return ok mt8"><summary>Ver retorno da API (${responses.length} análises concluídas · ${okCalls} respostas OK · ${failedCalls} falhas)</summary>${apiReturns.slice().sort((a, b) => (a.analysisIndex - b.analysisIndex) || (a.attempt - b.attempt)).map(apiTraceHtml).join('')}</details>` : '';
  openModal(`
    <h2>Resumo do dia pronto</h2>
    ${descHtml}${audioHtml}${photoHtml}${transcriptHtml}${accHtml}${notesHtml}${apiHtml}
    <div class="daily-summary-total">
      <div class="daily-summary-label">Total estimado do dia</div>
      <div class="daily-summary-kcal" id="resumoDiaKcal">0 kcal</div>
      <div class="daily-summary-macros">P <b id="resumoDiaP">0g</b> · C <b id="resumoDiaC">0g</b> · G <b id="resumoDiaG">0g</b></div>
    </div>
    <p class="small mt8">Ajuste qualquer item abaixo. Ao confirmar, cada refeição será salva separadamente no diário.</p>
    <div id="resumoDiaRefeicoes"></div>
    <label style="margin-top:12px">Data dos lançamentos</label>
    <input id="resumoDiaConfirmData" type="date" value="${escapeHtml(window.__resumoDiaDate || currentEntryDate())}" max="${currentEntryDate()}"/>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="fecharModalComAudio()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmResumoDia()">Salvar refeições</button>
    </div>
  `);
  window.__resumoDiaRefeicoes = Array.isArray(final.refeicoes) ? final.refeicoes.map(meal => ({
    ...meal,
    nome_refeicao: String(meal.nome_refeicao || 'Refeição'),
    horario: String(meal.horario || ''),
    itens: Array.isArray(meal.itens) ? meal.itens.map(item => ({ ...item })) : []
  })) : [];
  renderResumoDiaRefeicoes();
}

function confirmResumoDia() {
  const date = typeof getEntryDate === 'function'
    ? getEntryDate($('#resumoDiaConfirmData')?.value, window.__resumoDiaDate)
    : ($('#resumoDiaConfirmData')?.value || window.__resumoDiaDate || currentEntryDate());
  if (!date) { toast('Escolha hoje ou uma data anterior válida.'); return; }
  const refeicoes = (Array.isArray(window.__resumoDiaRefeicoes) ? window.__resumoDiaRefeicoes : [])
    .map(meal => {
      const itens = (Array.isArray(meal.itens) ? meal.itens : [])
        .map(item => normalizeDailyItem(item))
        .filter(item => item.kcal > 0);
      if (!itens.length && Number(meal.kcal_total) > 0) {
        itens.push({
          nome: 'Itens não detalhados',
          porcao_g: 0,
          kcal: Math.round(dailyFinite(meal.kcal_total, 0, 100000)),
          proteina_g: +dailyFinite(meal.proteina_total, 0, 10000).toFixed(1),
          carbo_g: +dailyFinite(meal.carbo_total, 0, 20000).toFixed(1),
          gordura_g: +dailyFinite(meal.gordura_total, 0, 10000).toFixed(1)
        });
      }
      return { meal, itens };
    })
    .filter(item => item.itens.length);
  if (!refeicoes.length) { toast('Nenhuma refeição com calorias para salvar.'); return; }
  refeicoes.forEach(({ meal, itens }) => {
    const horario = String(meal.horario || '').trim();
    const hour = formatResumoDiaHour(horario);
    meals.push({
      id: uid(),
      date,
      hour,
      horario: horario || hour,
      nome: String(meal.nome_refeicao || 'Refeição').trim() || 'Refeição',
      itens,
      origem: 'ia_resumo_dia'
    });
  });
  resetAudioRecorderState(false);
  save(LS.m, meals);
  if (typeof setActiveDate === 'function') setActiveDate(date, false);
  closeModal();
  toast(`${refeicoes.length} refeição(ões) salvas em ${typeof formatRegistroDate === 'function' ? formatRegistroDate(date) : date}!`);
  render();
}

window.abrirResumoDiaIA = abrirResumoDiaIA;
window.abrirResumoDiaFotos = abrirResumoDiaFotos;
window.adicionarResumoDiaFotos = adicionarResumoDiaFotos;
window.removerResumoDiaFoto = removerResumoDiaFoto;
window.renderResumoDiaFotos = renderResumoDiaFotos;
window.iniciarAnaliseResumoDia = iniciarAnaliseResumoDia;
window.processarResumoDia = processarResumoDia;
window.encerrarAnaliseResumoDia = encerrarAnaliseResumoDia;
window.tentarNovamenteResumoDia = tentarNovamenteResumoDia;
window.renderResumoDiaRefeicoes = renderResumoDiaRefeicoes;
window.renderResumoDiaMealItems = renderResumoDiaMealItems;
window.updResumoDiaMeal = updResumoDiaMeal;
window.updResumoDiaItem = updResumoDiaItem;
window.rmResumoDiaItem = rmResumoDiaItem;
window.addResumoDiaItem = addResumoDiaItem;
window.updResumoDiaTotals = updResumoDiaTotals;
window.confirmResumoDia = confirmResumoDia;

/* ============ FLUXO DE TEXTO (IA) ============ */
function abrirTextoIA() {
  openModal(`
    <h2>✍️ Descrever com IA</h2>
    <p class="small mb8">Digite o que você comeu ou bebeu. A IA identificará os alimentos, porções e macros automaticamente.</p>
    <label for="textoRefeicao">Descrição da refeição</label>
    <textarea id="textoRefeicao" rows="4" maxlength="1000" placeholder="Ex.: 2 ovos mexidos com 1 fatia de pão integral e 1 xícara de café com leite"></textarea>
    <label for="textoData" style="margin-top:10px">Data do lançamento</label>
    <input id="textoData" type="date" value="${currentEntryDate()}" max="${currentEntryDate()}"/>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="iniciarAnaliseTexto()">Analisar texto</button>
    </div>
  `);
  setTimeout(() => { const el = $('#textoRefeicao'); if (el) el.focus(); }, 100);
}

function encerrarAnaliseTexto() {
  const run = window.__textoRun;
  if (!run || run.cancelled) return;
  run.cancelled = true;
  run.controller?.abort();
  run.waiters.splice(0).forEach(resolve => resolve());
  const button = $('#aiCancelTexto');
  if (button) { button.disabled = true; button.textContent = 'Encerrando…'; }
}

async function iniciarAnaliseTexto() {
  const texto = ($('#textoRefeicao')?.value || '').trim();
  if (!texto) {
    toast('Digite o que você comeu para analisar');
    return;
  }
  if (!apikey) {
    toast('Configure a chave da API em Ajustes primeiro');
    setTimeout(() => { state.tab = 'ajustes'; render(); }, 300);
    return;
  }
  const textoDate = typeof getEntryDate === 'function'
    ? getEntryDate($('#textoData')?.value)
    : ($('#textoData')?.value || currentEntryDate());
  if (!textoDate) {
    toast('Escolha hoje ou uma data anterior válida.');
    return;
  }
  window.__textoDate = textoDate;
  await processarTexto(texto);
}

async function processarTexto(texto) {
  window.__textoDate = window.__textoDate || currentEntryDate();
  const run = {
    cancelled: false,
    controller: typeof AbortController === 'function' ? new AbortController() : null,
    waiters: []
  };
  window.__textoRun = run;
  window.__textoDescricao = texto;

  openModal(`
    <h2>Analisando refeição…</h2>
    <div class="small mb8"><b>Descrição:</b> ${escapeHtml(texto)}</div>
    <div id="aiStepsTexto"></div>
    <button id="aiCancelTexto" class="bigbtn secondary mt12" onclick="encerrarAnaliseTexto()">Encerrar agora e usar respostas recebidas</button>
  `);

  const steps = $('#aiStepsTexto');
  const n = pref.precisao === 'precisa' ? 3 : 1;
  steps.innerHTML = Array.from({ length: n }, (_, i) => `<div class="ai-step"><div class="spin"></div><span>Análise ${i + 1} de ${n}…</span></div>`).join('');

  const apiReturns = [];
  const analisarUma = async (i) => {
    let result = null;
    let selectedTrace = null;
    for (let modelIndex = 0; modelIndex < GEMINI_MODELS.length && !result; modelIndex++) {
      const model = GEMINI_MODELS[modelIndex];
      setAnalysisStep(steps, i, progressHtml(i, n, model, 1));
      let trace = await consultarModeloTexto(model, texto, i, 1, apikey, run);
      apiReturns.push(trace);
      selectedTrace = trace;
      if (trace.ok) { result = trace.result; break; }
      if (run.cancelled) break;
      if (trace.retryable) {
        setAnalysisStep(steps, i, progressHtml(i, n, model, 2, 'Falha temporária; aguardando 3 segundos…'));
        await waitMs(RETRY_DELAY_MS, run);
        if (run.cancelled) break;
        setAnalysisStep(steps, i, progressHtml(i, n, model, 2));
        trace = await consultarModeloTexto(model, texto, i, 2, apikey, run);
        apiReturns.push(trace);
        selectedTrace = trace;
        if (trace.ok) { result = trace.result; break; }
      }
      if (!trace.retryable && !([200, 404].includes(trace.status))) break;
      if (modelIndex < GEMINI_MODELS.length - 1) {
        const next = GEMINI_MODELS[modelIndex + 1];
        setAnalysisStep(steps, i, progressHtml(i, n, next, 1, `Alternando para ${next.label}…`));
      }
    }
    if (result) {
      setAnalysisStep(steps, i, `<div class="ai-step" style="color:var(--status-ok)"><span>✓ Análise ${i + 1}: ${Math.round(result.kcal_total || 0)} kcal · ${selectedTrace?.modelLabel || 'Gemini'}</span></div>`);
    } else {
      const status = selectedTrace?.status ? ` (HTTP ${selectedTrace.status})` : '';
      setAnalysisStep(steps, i, `<div class="ai-step" style="color:var(--status-danger)"><span>✕ Análise ${i + 1} falhou${status} após fallback</span></div>`);
    }
    return result;
  };

  let results = [];
  if (pref.paralelo) results = await Promise.all(Array.from({ length: n }, (_, i) => analisarUma(i)));
  else for (let i = 0; i < n && !run.cancelled; i++) results.push(await analisarUma(i));

  const validos = results.filter(Boolean);
  window.__textoRun = null;

  if (!validos.length) {
    const status = apiReturns.slice().reverse().find(x => x.status)?.status;
    steps.innerHTML = `
      <div class="ai-step" style="color:var(--status-danger);display:block">
        <b>${run.cancelled ? 'Análise encerrada sem respostas concluídas.' : 'Não foi possível analisar a descrição.'}</b>
        <div class="api-hint">${apiHint(status)}</div>
        ${apiReturns.slice().sort((a, b) => (a.analysisIndex - b.analysisIndex) || (a.attempt - b.attempt)).map(apiTraceHtml).join('')}
      </div>
      <div class="row mt12">
        <button class="bigbtn secondary" onclick="closeModal()">Fechar</button>
        <button class="bigbtn primary" onclick="closeModal();modalManual()">Adicionar manual</button>
      </div>`;
    return;
  }

  mostrarConfirmacaoTexto(mergeAnalisys(validos), n, validos, apiReturns, run.cancelled, texto);
}

function mostrarConfirmacaoTexto(final, n, responses, apiReturns = [], cancelled = false, textoOriginal = '') {
  const varPct = desvioPct(responses.map(r => r.kcal_total || 0));
  const accHtml = cancelled
    ? `<div class="det-acc"><button class="on" disabled>Parcial (${responses.length}/${n})</button></div><p class="small mb8">Usando ${responses.length} resposta(s) recebida(s) antes do encerramento · valores estimados, edite se precisar</p>`
    : responses.length > 1
    ? `<div class="det-acc"><button class="on" disabled>Precisa (${responses.length}/${n})</button></div><p class="small mb8">Média de ${responses.length} análises · variação entre respostas: <b style="color:${varPct > 25 ? 'var(--status-danger)' : varPct > 15 ? 'var(--status-warn)' : 'var(--status-ok)'}">${varPct}%</b></p>`
    : `<p class="small mb8">Análise rápida · valores estimados, edite se precisar</p>`;
  
  const descHtml = textoOriginal ? `<div class="small mb8"><b>Texto enviado:</b> ${escapeHtml(textoOriginal)}</div>` : '';
  const nomeSugerido = escapeHtml(String(final.nome_refeicao || '').trim() || 'Refeição descrita');
  const okCalls = apiReturns.filter(x => x.ok).length;
  const failedCalls = apiReturns.length - okCalls;
  const apiHtml = apiReturns.length ? `<details class="api-return ok mt8"><summary>Ver retorno da API (${responses.length} análises concluídas · ${okCalls} respostas OK · ${failedCalls} falhas)</summary>${apiReturns.slice().sort((a, b) => (a.analysisIndex - b.analysisIndex) || (a.attempt - b.attempt)).map(apiTraceHtml).join('')}</details>` : '';

  openModal(`
    <h2>Refeição identificada</h2>
    ${descHtml}${accHtml}${apiHtml}
    <div id="itensBoxTexto"></div>
    <div class="det-total">Total: <span class="v" id="cTotalTexto">${Math.round(final.kcal_total || 0)} kcal</span></div>
    <div class="small" style="margin-top:6px">P <b>${final.proteina_total || 0}g</b> · C <b>${final.carbo_total || 0}g</b> · G <b>${final.gordura_total || 0}g</b></div>
    <label style="margin-top:12px">Nome da refeição</label>
    <input id="cNomeTexto" value="${nomeSugerido}" maxlength="80" style="margin-bottom:4px"/>
    <label style="margin-top:10px">Data do lançamento</label>
    <input id="cDataTexto" type="date" value="${window.__textoDate || currentEntryDate()}" max="${currentEntryDate()}"/>
    <button id="saveTextoAlimento" class="bigbtn secondary mt8" onclick="salvarTextoAlimento()">Salvar refeição em Meus alimentos</button>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmTexto()">Confirmar</button>
    </div>
  `);

  window.__textoItens = Array.isArray(final.itens) ? final.itens.map(i => ({ ...i })) : [];
  window.__textoMacroDefaults = { p: final.proteina_total || 0, c: final.carbo_total || 0, g: final.gordura_total || 0 };
  renderTextoItens();
}

function renderTextoItens() {
  const box = $('#itensBoxTexto');
  if (!box) return;
  const its = window.__textoItens || [];
  const p = $('#cPT')?.value ?? (window.__textoMacroDefaults?.p ?? 0);
  const c = $('#cCT')?.value ?? (window.__textoMacroDefaults?.c ?? 0);
  const g = $('#cGT')?.value ?? (window.__textoMacroDefaults?.g ?? 0);

  box.innerHTML =
    `<div class="small" style="color:var(--txt-secondary);margin-bottom:4px">Itens identificados — ajuste quantidade e kcal se precisar</div>` +
    its.map((it, i) => aiItemRowHtml(i, it, 'updItemTexto', 'rmItemTexto', 'addItemTexto', 'itensBoxTexto', 'updTotaisTexto', 'cPT')).join('') +
    `<button class="bigbtn secondary mt8" style="font-size:13px;min-height:42px;padding:8px" onclick="addItemTexto()">+ Adicionar item</button>
     <div class="formrow three mt8">
       <div><label>P (g)</label><input id="cPT" type="number" value="${p}" oninput="updTotaisTexto()"/></div>
       <div><label>C (g)</label><input id="cCT" type="number" value="${c}" oninput="updTotaisTexto()"/></div>
       <div><label>G (g)</label><input id="cGT" type="number" value="${g}" oninput="updTotaisTexto()"/></div>
     </div>`;
  updTotaisTexto();
}

function updItemTexto(i, k, v) {
  const it = window.__textoItens?.[i];
  if (!it) return;
  it[k] = k === 'nome' ? v : parseFloat(v) || 0;
  updTotaisTexto();
}

function rmItemTexto(i) {
  if (!window.__textoItens) return;
  window.__textoItens.splice(i, 1);
  renderTextoItens();
}

function addItemTexto() {
  window.__textoItens = window.__textoItens || [];
  window.__textoItens.push({ nome: 'Item', porcao_g: 100, kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 });
  renderTextoItens();
}

function updTotaisTexto() {
  const k = (window.__textoItens || []).reduce((a, i) => a + (parseFloat(i.kcal) || 0), 0);
  if ($('#cTotalTexto')) $('#cTotalTexto').textContent = fmt(k) + ' kcal';
}

function salvarTextoAlimento() {
  const itens = (window.__textoItens || []).filter(i => (i.kcal || 0) > 0);
  if (!itens.length) { toast('Nenhum item com calorias para salvar'); return; }
  const nome = ($('#cNomeTexto')?.value || 'Refeição descrita').trim() || 'Refeição descrita';
  const soma = (campo, sel) => {
    const informado = parseFloat($(sel)?.value);
    return Number.isFinite(informado) ? informado : itens.reduce((s, i) => s + (parseFloat(i[campo]) || 0), 0);
  };
  saveAlim({
    nome,
    porcao_g: Math.max(1, Math.round(itens.reduce((s, i) => s + (parseFloat(i.porcao_g) || 0), 0)) || 100),
    kcal: Math.round(itens.reduce((s, i) => s + (parseFloat(i.kcal) || 0), 0)),
    proteina_g: +soma('proteina_g', '#cPT').toFixed(1),
    carbo_g: +soma('carbo_g', '#cCT').toFixed(1),
    gordura_g: +soma('gordura_g', '#cGT').toFixed(1),
    tipo: 'refeicao_texto'
  });
  const button = $('#saveTextoAlimento');
  if (button) { button.disabled = true; button.textContent = 'Salvo em Meus alimentos ✓'; }
  toast('Refeição salva em Meus alimentos!');
}

function confirmTexto() {
  const nome = $('#cNomeTexto')?.value.trim() || 'Refeição descrita';
  const itens = (window.__textoItens || []).filter(i => (i.kcal || 0) > 0);
  if (!itens.length) { toast('Nenhum item com calorias'); return; }

  const date = typeof getEntryDate === 'function'
    ? getEntryDate($('#cDataTexto')?.value, window.__textoDate)
    : ($('#cDataTexto')?.value || window.__textoDate || currentEntryDate());
  if (!date) {
    toast('Escolha hoje ou uma data anterior válida.');
    return;
  }
  
  const pTotal = parseFloat($('#cPT')?.value) || 0;
  const cTotal = parseFloat($('#cCT')?.value) || 0;
  const gTotal = parseFloat($('#cGT')?.value) || 0;
  
  if (itens.length === 1 && (itens[0].proteina_g === 0 && itens[0].carbo_g === 0 && itens[0].gordura_g === 0)) {
    itens[0].proteina_g = pTotal;
    itens[0].carbo_g = cTotal;
    itens[0].gordura_g = gTotal;
  }

  meals.push({
    id: uid(),
    date,
    hour: horaNow(),
    nome,
    itens,
    origem: 'ia_texto'
  });
  save(LS.m, meals);
  if (typeof setActiveDate === 'function') setActiveDate(date, false);
  closeModal();
  toast(`Refeição salva em ${typeof formatRegistroDate === 'function' ? formatRegistroDate(date) : date}!`);
  render();
}

window.abrirTextoIA = abrirTextoIA;
window.iniciarAnaliseTexto = iniciarAnaliseTexto;
window.encerrarAnaliseTexto = encerrarAnaliseTexto;
window.processarTexto = processarTexto;
window.renderTextoItens = renderTextoItens;
window.updItemTexto = updItemTexto;
window.rmItemTexto = rmItemTexto;
window.addItemTexto = addItemTexto;
window.updTotaisTexto = updTotaisTexto;
window.salvarTextoAlimento = salvarTextoAlimento;
window.confirmTexto = confirmTexto;
window.apiBodyTexto = apiBodyTexto;
window.consultarModeloTexto = consultarModeloTexto;

/* ============ EDITOR ÚNICO DE REFEIÇÃO (IA + salvas) ============ */
/* Um só editor para confirmar resultados de IA e editar refeições já salvas.
   Edita uma CÓPIA profunda e só grava em Salvar — Cancelar não altera nada.
   O id da refeição é preservado (nunca duplica). */
let __editMealDraft = null;

function openMealEditor(meal) {
  if (!meal || typeof meal !== 'object') return;
  __editMealDraft = {
    id: meal.id,
    date: meal.date,
    origem: meal.origem || 'manual',
    plano: meal.plano ?? null,
    nome: String(meal.nome || 'Refeição'),
    hour: String(meal.hour || horaNow()),
    itens: (Array.isArray(meal.itens) ? meal.itens : []).map(i => ({
      nome: String(i?.nome || ''),
      porcao_g: Number(i?.porcao_g) || 0,
      kcal: Number(i?.kcal) || 0,
      proteina_g: Number(i?.proteina_g) || 0,
      carbo_g: Number(i?.carbo_g) || 0,
      gordura_g: Number(i?.gordura_g) || 0
    }))
  };
  openModal(`
    <h2>Editar refeição</h2>
    <div style="display:flex;gap:8px">
      <div style="flex:1.6"><label>Nome</label><input id="mNome" value="${escapeHtml(__editMealDraft.nome)}" maxlength="80"/></div>
      <div style="flex:1"><label>Hora</label><input id="mHour" type="time" value="${escapeHtml(__editMealDraft.hour)}"/></div>
    </div>
    <label style="margin-top:10px">Itens</label>
    <div id="mItensBox"></div>
    <button class="bigbtn secondary mt8" style="font-size:13px;min-height:42px;padding:8px" onclick="addEditMealItem()">+ Adicionar item</button>
    <div class="det-total mt8">Total: <span class="v" id="mTotal">0 kcal</span></div>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="cancelEditMeal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmEditMeal()">Salvar alterações</button>
    </div>
  `);
  renderEditMealItems();
}
window.openMealEditor = openMealEditor;

function renderEditMealItems() {
  const box = $('#mItensBox');
  const d = __editMealDraft;
  if (!box || !d) return;
  box.innerHTML = d.itens.map((it, i) => aiItemRowHtml(
    i, it,
    'updEditMealItem', 'rmEditMealItem', 'addEditMealItem', 'mItensBox', 'updEditMealTotais', 'm'
  )).join('');
  updEditMealTotais();
}

function updEditMealTotais() {
  const d = __editMealDraft;
  if (!d) return;
  const k = d.itens.reduce((a, i) => a + (parseFloat(i.kcal) || 0), 0);
  const el = $('#mTotal');
  if (el) el.textContent = fmt(k) + ' kcal';
}
window.updEditMealTotais = updEditMealTotais;

function updEditMealItem(idx, field, value) {
  const it = __editMealDraft?.itens?.[idx];
  if (!it) return;
  it[field] = field === 'nome' ? String(value) : parseFloat(value) || 0;
  updEditMealTotais();
}
window.updEditMealItem = updEditMealItem;

function rmEditMealItem(idx) {
  if (!__editMealDraft) return;
  __editMealDraft.itens.splice(idx, 1);
  renderEditMealItems();
}
window.rmEditMealItem = rmEditMealItem;

function addEditMealItem() {
  if (!__editMealDraft) return;
  __editMealDraft.itens.push({ nome: '', porcao_g: 100, kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0 });
  renderEditMealItems();
}
window.addEditMealItem = addEditMealItem;

function cancelEditMeal() {
  __editMealDraft = null; // descarta a cópia — nada foi gravado
  closeModal();
}
window.cancelEditMeal = cancelEditMeal;

function confirmEditMeal() {
  const d = __editMealDraft;
  if (!d) { closeModal(); return; }
  const idx = meals.findIndex(m => m.id === d.id);
  if (idx < 0) { toast('Refeição não encontrada'); cancelEditMeal(); return; }

  const itens = d.itens.filter(i => (i.kcal || 0) > 0);
  if (!itens.length) { toast('Nenhum item com calorias'); return; }

  const nomeEl = $('#mNome'), horaEl = $('#mHour');
  const anterior = JSON.parse(JSON.stringify(meals[idx]));
  meals[idx] = {
    ...meals[idx],
    nome: (nomeEl?.value || d.nome).trim() || d.nome,
    hour: horaEl?.value || d.hour,
    itens
  };
  save(LS.m, meals);
  __editMealDraft = null;
  closeModal();
  toast('Refeição atualizada', () => {
    const i2 = meals.findIndex(m => m.id === anterior.id);
    if (i2 >= 0) { meals[i2] = anterior; save(LS.m, meals); render(); }
  });
  render();
}
window.confirmEditMeal = confirmEditMeal;

/* ============ REFEIÇÃO MANUAL ============ */
function modalManual() {
  openModal(`
    <h2>Adicionar refeição</h2>
    <label>Data do lançamento</label>
    <input id="fDate" type="date" value="${currentEntryDate()}" max="${currentEntryDate()}"/>
    <label>Nome da refeição</label>
    <input id="fNome" placeholder="Ex: Almoço" value="Refeição"/>
    <div id="fItens" class="mt8"></div>
    <button class="bigbtn secondary mt8" onclick="addLinha()">+ Adicionar alimento</button>
    <div class="det-total mt8">Total: <span class="v" id="fTotal">0 kcal</span></div>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmManual()">Salvar</button>
    </div>
  `);
  addLinha();
}
function abrirManual() { modalManual(); }
window.abrirManual = abrirManual;
window.modalManual = modalManual;

function addLinha() {
  const box = $('#fItens');
  if (!box) return;
  const d = document.createElement('div');
  d.className = 'det-item';
  d.innerHTML = `
    <input placeholder="Alimento" style="flex:1.4" oninput="updFTotal()"/>
    <input type="number" placeholder="g" class="d-qty" value="100" oninput="updFTotal()"/>
    <input type="number" placeholder="kcal" class="d-kcal" style="color:#ffffff;width:60px" oninput="updFTotal()"/>
    <button class="det-del" onclick="this.parentElement.remove();updFTotal()"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
  `;
  box.appendChild(d);
}

function updFTotal() {
  let t = 0;
  Array.from(document.querySelectorAll('#fItens .d-kcal')).forEach(x => t += parseFloat(x.value) || 0);
  if ($('#fTotal')) $('#fTotal').textContent = fmt(t) + ' kcal';
}

function confirmManual() {
  const nome = $('#fNome')?.value.trim() || 'Refeição';
  const date = typeof getEntryDate === 'function'
    ? getEntryDate($('#fDate')?.value)
    : ($('#fDate')?.value || currentEntryDate());
  if (!date) {
    toast('Escolha hoje ou uma data anterior válida.');
    return;
  }
  const itens = [];
  Array.from(document.querySelectorAll('#fItens .det-item')).forEach(d => {
    const ins = Array.from(d.querySelectorAll('input'));
    const n = ins[0].value.trim();
    const g = parseFloat(ins[1].value) || 0;
    const k = parseFloat(ins[2].value) || 0;
    if (k > 0) itens.push({ nome: n || 'Alimento', porcao_g: g, kcal: Math.round(k), proteina_g: 0, carbo_g: 0, gordura_g: 0 });
  });
  if (!itens.length) { toast('Adicione ao menos um alimento com calorias'); return; }
  meals.push({ id: uid(), date, hour: horaNow(), nome, itens, origem: 'manual' });
  save(LS.m, meals);
  if (typeof setActiveDate === 'function') setActiveDate(date, false);
  closeModal();
  toast(`Refeição salva em ${typeof formatRegistroDate === 'function' ? formatRegistroDate(date) : date}!`);
  render();
}

window.addLinha = addLinha;
window.updFTotal = updFTotal;
window.confirmManual = confirmManual;

/* ============ ATIVIDADE / GASTO COM IA ============ */
function apiBodyAtividade(texto, model, userProfile = (typeof profile !== 'undefined' ? profile : {}), workout = null) {
  const descricao = String(texto || '').trim().slice(0, 1000);
  const peso = Number(userProfile?.peso) > 0 ? Number(userProfile.peso) : 75;
  const altura = Number(userProfile?.altura) > 0 ? Number(userProfile.altura) : 175;
  const idade = Number(userProfile?.idade) > 0 ? Number(userProfile.idade) : 30;
  const sexo = userProfile?.sexo === 'f' ? 'Feminino' : 'Masculino';

  const contextoBiometrico = `[Dados Biométricos do Usuário]\n- Peso: ${peso} kg\n- Altura: ${altura} cm\n- Idade: ${idade} anos\n- Sexo: ${sexo}`;

  const treinoImportado = workout && Array.isArray(workout.sessions) && workout.sessions.length > 0
    ? `\n\n[Treino importado do Evolução — somente dados registrados]\nUse só estas sessões; não crie exercícios. Observação é complemento.\n` +
      `Para sessões tipo "musculacao": estime o gasto pelo volume (séries × repetições × cargaKg), tempo aproximado somando séries e descansos típicos (60–180 s) quando duracaoSeg estiver ausente, e popule segmentos por exercício (descricao=nome, duracao_minutos estimado, met compatível com treino de força 3–6).\n` +
      `Quando duracaoSeg ESTIVER presente, use-o como duração real — nesse caso NÃO seja excessivamente conservador.\n` +
      `Para sessões tipo "corrida": use distanciaKm/duracaoSeg/velocidadeMediaKmh diretamente.\n${JSON.stringify(workout)}` : '';
  return {
    contents: [
      {
        parts: [
          { text: `${ACTIVITY_PROMPT}\n\n${contextoBiometrico}${treinoImportado}\n\n[Descrição/observação do usuário]\n${descricao}` }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: ACTIVITY_SCHEMA,
      thinkingConfig: { thinkingLevel: model.thinkingLevel },
      maxOutputTokens: 4096
    }
  };
}

async function consultarModeloAtividade(model, texto, analysisIndex, attempt, key, run = null, userProfile = null, workout = null) {
  const trace = {
    ok: false, analysisIndex, attempt, modelId: model.id, modelLabel: model.label,
    status: null, body: '', modelText: '', error: '', retryable: false, result: null, cancelled: false
  };
  try {
    if (run?.cancelled) { trace.cancelled = true; trace.error = 'Análise encerrada pelo usuário'; return trace; }
    const url = GEMINI_API_BASE + model.id + ':generateContent';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(apiBodyAtividade(texto, model, userProfile || (typeof profile !== 'undefined' ? profile : {}), workout)),
      signal: run?.controller?.signal
    });
    trace.status = resp.status;
    trace.body = await resp.text();
    let json = null;
    try { json = trace.body ? JSON.parse(trace.body) : null; } catch(e) {}
    if (!resp.ok) {
      const msg = json?.error?.message || json?.message || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    const block = json?.promptFeedback?.blockReason;
    if (!txt) throw new Error(block ? `resposta bloqueada (${block})` : 'resposta vazia');
    trace.modelText = txt;
    const jsonTxt = String(txt).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    trace.result = JSON.parse(jsonTxt);
    trace.ok = true;
  } catch(e) {
    trace.cancelled = !!run?.cancelled || e?.name === 'AbortError';
    trace.error = trace.cancelled ? 'Análise encerrada pelo usuário' : (e && e.message || String(e));
  }
  trace.retryable = !trace.ok && !trace.cancelled && isRetryableStatus(trace.status);
  console.log(`AI atividade análise ${analysisIndex + 1} ${model.id} tentativa ${attempt}:`, trace.ok ? 'OK' : trace.error, trace.body);
  return trace;
}

function mergeActivityAnalisys(res) {
  if (!res || !res.length) return null;
  const fields = ['kcal_gasto_total', 'duracao_minutos_total', 'met_medio'];
  const out = {};
  
  fields.forEach(f => {
    const vals = res.map(r => Number(r[f]) || 0);
    const sorted = [...vals].sort((a, b) => a - b);
    let usados = sorted;
    if (sorted.length >= 3) {
      const mediana = sorted[1];
      const dist = sorted.map(v => Math.abs(v - mediana));
      const imax = dist.indexOf(Math.max(...dist));
      if (dist[imax] > 0.5 * mediana && mediana > 0) {
        usados = sorted.filter((_, i) => i !== imax);
      }
    }
    out[f] = f === 'met_medio' 
      ? +(usados.reduce((a, b) => a + b, 0) / Math.max(1, usados.length)).toFixed(1)
      : Math.round(usados.reduce((a, b) => a + b, 0) / Math.max(1, usados.length));
  });

  const nomes = res.map(r => String(r.nome_atividade || '').trim()).filter(Boolean);
  const best = res[0];
  out.nome_atividade = nomes[0] || 'Exercício';
  out.intensidade = best.intensidade || 'moderada';
  out.segmentos = Array.isArray(best.segmentos) ? best.segmentos.map(s => ({ ...s })) : [];
  out.explicacao_calculo = best.explicacao_calculo || '';
  out.confianca = best.confianca || 'media';
  return out;
}

const EVOLUCAO_MAX_RAW = 65536;
const EVOLUCAO_MAX_NORMALIZED = 32768;
const EVOLUCAO_MAX_SESSIONS = 30;
const EVOLUCAO_MAX_ITEMS = 100;
function evolucaoSafeString(value, max = 300) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max).trim();
}
function evolucaoSafeNumber(value, min = -1000000, max = 1000000) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : undefined;
}
function evolucaoPick(obj, keys) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  keys.forEach(k => {
    if (obj[k] == null) return;
    if (typeof obj[k] === 'string') out[k] = evolucaoSafeString(obj[k]);
    else if (typeof obj[k] === 'boolean') out[k] = obj[k];
    else if (typeof obj[k] === 'number') { const n = evolucaoSafeNumber(obj[k]); if (n !== undefined) out[k] = n; }
  });
  return out;
}
function evolucaoPickIntervals(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  // Formato persistido atualmente pelo Evolução (campos planos).
  [
    'tiroMin', 'tiroSec', 'tiroKmh',
    'recupMin', 'recupSec', 'recupKmh',
    'ciclos',
    'warmupMin', 'warmupSec', 'warmupKmh',
    'cooldownMin', 'cooldownSec', 'cooldownKmh'
  ].forEach(key => {
    const n = evolucaoSafeNumber(value[key], 0, 1000000);
    if (n !== undefined) out[key] = n;
  });
  // Aceita também o formato aninhado para compatibilidade futura.
  ['tiro', 'recuperacao', 'warmup', 'cooldown'].forEach(key => {
    if (value[key] && typeof value[key] === 'object') {
      out[key] = evolucaoPick(value[key], ['duracaoSeg', 'distanciaM', 'ritmoMedioSegKm', 'paceMinKm', 'velocidadeMediaKmh', 'concluida']);
    } else if (value[key] != null) {
      if (typeof value[key] === 'boolean') out[key] = value[key];
      else { const n = evolucaoSafeNumber(value[key], 0, 1000000); if (n !== undefined) out[key] = n; }
    }
  });
  const ciclos = evolucaoSafeNumber(value.ciclos, 0, 10000);
  if (ciclos !== undefined) out.ciclos = ciclos;
  return out;
}
function evolucaoNormalizeWorkout(payload, requestedDate) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || payload.schemaVersion !== 1 || payload.source !== 'com.evolucao.treino'
      || payload.date !== requestedDate || !Array.isArray(payload.sessions)) {
    return { ok: false, error: { code: 'INCOMPATIBLE_PAYLOAD', message: 'Treino do Evolução incompatível com o contrato' } };
  }
  if (payload.sessions.length > EVOLUCAO_MAX_SESSIONS) return { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Treino possui sessões demais' } };
  const sessionKeys = ['id', 'nome', 'tipo', 'duracaoSeg', 'distanciaM', 'distanciaKm', 'velocidadeMediaKmh', 'ritmoMedioSegKm', 'paceMinKm', 'calorias', 'modo', 'notas', 'observacao', 'aquecimento', 'concluida'];
  const exerciseKeys = ['id', 'nome', 'tipo', 'duracaoSeg', 'notas', 'observacao', 'aquecimento', 'concluida'];
  const seriesKeys = ['id', 'nome', 'cargaKg', 'repeticoes', 'parciais', 'rir', 'RIR', 'aquecimento', 'concluida'];
  const sessions = payload.sessions.map(session => {
    const out = evolucaoPick(session, sessionKeys);
    if (Array.isArray(session?.exercicios)) {
      if (session.exercicios.length > EVOLUCAO_MAX_ITEMS) throw new Error('PAYLOAD_TOO_LARGE');
      out.exercicios = session.exercicios.map(exercise => {
        const normalizedExercise = evolucaoPick(exercise, exerciseKeys);
        if (Array.isArray(exercise?.series)) {
          if (exercise.series.length > EVOLUCAO_MAX_ITEMS) throw new Error('PAYLOAD_TOO_LARGE');
          normalizedExercise.series = exercise.series.map(series => evolucaoPick(series, seriesKeys));
        }
        return normalizedExercise;
      });
    }
    if (session?.intervalos && typeof session.intervalos === 'object' && !Array.isArray(session.intervalos)) {
      out.intervalos = evolucaoPickIntervals(session.intervalos);
    }
    return out;
  });
  const normalized = { schemaVersion: 1, source: 'com.evolucao.treino', date: requestedDate,
    generatedAt: evolucaoSafeString(payload.generatedAt, 80), sessions };
  if (JSON.stringify(normalized).length > EVOLUCAO_MAX_NORMALIZED) return { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Dados do treino excedem o limite seguro' } };
  return { ok: true, payload: normalized };
}

function getEvolucaoWorkout(date = (typeof today === 'function' ? today() : localDateStr())) {
  const d = String(date || '').match(/^\d{4}-\d{2}-\d{2}$/) ? String(date) : localDateStr();
  try {
    const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null;
    if (!bridge || typeof bridge.getEvolucaoWorkout !== 'function') return { ok: false, error: { code: 'APP_UNAVAILABLE', message: 'Evolução não está disponível neste aparelho' } };
    const raw = bridge.getEvolucaoWorkout(d);
    if (typeof raw === 'string' && raw.length > EVOLUCAO_MAX_RAW) return { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Resposta do Evolução excede o limite seguro' } };
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') throw new Error('Resposta inválida');
    if (parsed.error) return { ok: false, error: parsed.error };
    const normalized = evolucaoNormalizeWorkout(parsed, d);
    if (!normalized.ok) return normalized;
    if (normalized.payload.sessions.length === 0) {
      return { ok: false, error: { code: 'EMPTY_WORKOUT', message: 'Nenhuma sessão registrada no treino do Evolução' } };
    }
    return normalized;
  } catch (e) {
    if (e && e.message === 'PAYLOAD_TOO_LARGE') return { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Dados do treino excedem o limite seguro' } };
    return { ok: false, error: { code: 'PROVIDER_ERROR', message: 'Não foi possível consultar o treino do Evolução' } };
  }
}

function evolucaoWorkoutSummary(result) {
  if (!result?.ok || !result.payload) return `<div class="small" style="color:var(--txt-secondary)">${escapeHtml(result?.error?.message || 'Nenhum treino importado.')}</div>`;
  const sessions = Array.isArray(result.payload.sessions) ? result.payload.sessions : [];
  if (!sessions.length) return '<div class="small">Treino importado, mas sem sessões registradas.</div>';
  const labels = sessions.slice(0, 5).map(s => {
    let label = escapeHtml(String(s.nome || s.tipo || s.name || 'Sessão'));
    // Sessão de musculação: deixa a força visível em vez de uma letra ("A")
    if ((s.tipo === 'musculacao' || s.type === 'musculacao') && Array.isArray(s.exercicios) && s.exercicios.length) {
      const totalSets = s.exercicios.reduce((acc, ex) => acc + (Array.isArray(ex.series) ? ex.series.filter(x => x && x.concluida !== false).length : 0), 0);
      label += ` · ${s.exercicios.length} exercício(s)` + (totalSets ? ` · ${totalSets} séries` : '');
    }
    const dur = Number(s.duracaoSeg);
    if (dur > 0) label += ` · ${Math.round(dur / 60)} min`;
    return label;
  }).join(' · ');
  return `<div class="small" style="color:var(--status-ok)"><b>Treino importado do Evolução:</b> ${labels}${sessions.length > 5 ? ` · +${sessions.length - 5}` : ''}</div>`;
}

function carregarTreinoEvolucao() {
  const result = getEvolucaoWorkout(today());
  window.__evolucaoWorkoutResult = result;
  const box = $('#evolucaoWorkoutStatus');
  if (box) box.innerHTML = evolucaoWorkoutSummary(result);
  return result;
}

function abrirAtividadeIA() {
  window.__evolucaoWorkoutResult = null;
  openModal(`
    <h2>⚡ Estimar gasto com IA</h2>
    <p class="small mb8">Busque o treino registrado hoje no Evolução e, se quiser, complemente com sua observação. A IA estimará duração, METs e calorias sem inventar sessões.</p>
    <button class="bigbtn secondary" onclick="carregarTreinoEvolucao()">↻ Buscar treino do dia (${today()})</button>
    <div id="evolucaoWorkoutStatus" class="formcard mt8">Treino do Evolução ainda não consultado.</div>
    <label for="textoAtividade">Descrição do exercício / treino</label>
    <textarea id="textoAtividade" rows="4" maxlength="1000" placeholder="Opcional: complemente com ritmo, duração ou observações do treino"></textarea>
    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="iniciarAnaliseAtividade()">Estimar gasto</button>
    </div>
  `);
  setTimeout(() => { const el = $('#textoAtividade'); if (el) el.focus(); }, 100);
}

function encerrarAnaliseAtividade() {
  const run = window.__ativRun;
  if (!run || run.cancelled) return;
  run.cancelled = true;
  run.controller?.abort();
  run.waiters.splice(0).forEach(resolve => resolve());
  const button = $('#aiCancelAtiv');
  if (button) { button.disabled = true; button.textContent = 'Encerrando…'; }
}

async function iniciarAnaliseAtividade() {
  const texto = ($('#textoAtividade')?.value || '').trim();
  const workout = window.__evolucaoWorkoutResult?.ok ? window.__evolucaoWorkoutResult.payload : null;
  if (!texto && !workout) {
    toast('Busque um treino do Evolução ou descreva a atividade');
    return;
  }
  if (!apikey) {
    toast('Configure a chave da API em Ajustes primeiro');
    setTimeout(() => { state.tab = 'ajustes'; render(); }, 300);
    return;
  }
  await processarAtividade(texto, workout);
}

async function processarAtividade(texto, workout = null) {
  const run = {
    cancelled: false,
    controller: typeof AbortController === 'function' ? new AbortController() : null,
    waiters: []
  };
  window.__ativRun = run;
  window.__ativDescricao = texto;
  window.__ativWorkout = workout;

  openModal(`
    <h2>Estimando gasto calórico…</h2>
    ${workout ? evolucaoWorkoutSummary({ ok: true, payload: workout }) : ''}
    ${texto ? `<div class="small mb8"><b>Observação enviada:</b> ${escapeHtml(texto)}</div>` : ''}
    <div id="aiStepsAtiv"></div>
    <button id="aiCancelAtiv" class="bigbtn secondary mt12" onclick="encerrarAnaliseAtividade()">Encerrar agora e usar respostas recebidas</button>
  `);

  const steps = $('#aiStepsAtiv');
  const n = pref.precisao === 'precisa' ? 3 : 1;
  steps.innerHTML = Array.from({ length: n }, (_, i) => `<div class="ai-step"><div class="spin"></div><span>Estimativa ${i + 1} de ${n}…</span></div>`).join('');

  const apiReturns = [];
  const analisarUma = async (i) => {
    let result = null;
    let selectedTrace = null;
    for (let modelIndex = 0; modelIndex < GEMINI_MODELS.length && !result; modelIndex++) {
      const model = GEMINI_MODELS[modelIndex];
      setAnalysisStep(steps, i, progressHtml(i, n, model, 1, `Estimativa ${i + 1} de ${n}…`));
      let trace = await consultarModeloAtividade(model, texto, i, 1, apikey, run, null, workout);
      apiReturns.push(trace);
      selectedTrace = trace;
      if (trace.ok) { result = trace.result; break; }
      if (run.cancelled) break;
      if (trace.retryable) {
        setAnalysisStep(steps, i, progressHtml(i, n, model, 2, 'Falha temporária; aguardando 3 segundos…'));
        await waitMs(RETRY_DELAY_MS, run);
        if (run.cancelled) break;
        setAnalysisStep(steps, i, progressHtml(i, n, model, 2, `Estimativa ${i + 1} de ${n}…`));
        trace = await consultarModeloAtividade(model, texto, i, 2, apikey, run, null, workout);
        apiReturns.push(trace);
        selectedTrace = trace;
        if (trace.ok) { result = trace.result; break; }
      }
      if (!trace.retryable && !([200, 404].includes(trace.status))) break;
      if (modelIndex < GEMINI_MODELS.length - 1) {
        const next = GEMINI_MODELS[modelIndex + 1];
        setAnalysisStep(steps, i, progressHtml(i, n, next, 1, `Alternando para ${next.label}…`));
      }
    }
    if (result) {
      setAnalysisStep(steps, i, `<div class="ai-step" style="color:var(--status-ok)"><span>✓ Estimativa ${i + 1}: ${Math.round(result.kcal_gasto_total || 0)} kcal queimadas · ${selectedTrace?.modelLabel || 'Gemini'}</span></div>`);
    } else {
      const status = selectedTrace?.status ? ` (HTTP ${selectedTrace.status})` : '';
      setAnalysisStep(steps, i, `<div class="ai-step" style="color:var(--status-danger)"><span>✕ Estimativa ${i + 1} falhou${status} após fallback</span></div>`);
    }
    return result;
  };

  let results = [];
  if (pref.paralelo) results = await Promise.all(Array.from({ length: n }, (_, i) => analisarUma(i)));
  else for (let i = 0; i < n && !run.cancelled; i++) results.push(await analisarUma(i));

  const validos = results.filter(Boolean);
  window.__ativRun = null;

  if (!validos.length) {
    const status = apiReturns.slice().reverse().find(x => x.status)?.status;
    steps.innerHTML = `
      <div class="ai-step" style="color:var(--status-danger);display:block">
        <b>${run.cancelled ? 'Análise encerrada sem respostas concluídas.' : 'Não foi possível estimar o gasto.'}</b>
        <div class="api-hint">${apiHint(status)}</div>
        ${apiReturns.slice().sort((a, b) => (a.analysisIndex - b.analysisIndex) || (a.attempt - b.attempt)).map(apiTraceHtml).join('')}
      </div>
      <div class="row mt12">
        <button class="bigbtn secondary" onclick="closeModal()">Fechar</button>
        <button class="bigbtn primary" onclick="closeModal();modalManualExercicio()">Adicionar manual</button>
      </div>`;
    return;
  }

  mostrarConfirmacaoAtividade(mergeActivityAnalisys(validos), n, validos, apiReturns, run.cancelled, texto);
}

function mostrarConfirmacaoAtividade(final, n, responses, apiReturns = [], cancelled = false, textoOriginal = '') {
  const varPct = desvioPct(responses.map(r => r.kcal_gasto_total || 0));
  const accHtml = cancelled
    ? `<div class="det-acc"><button class="on" disabled>Parcial (${responses.length}/${n})</button></div><p class="small mb8">Usando ${responses.length} resposta(s) recebida(s) antes do encerramento · valores editáveis</p>`
    : responses.length > 1
    ? `<div class="det-acc"><button class="on" disabled>Precisa (${responses.length}/${n})</button></div><p class="small mb8">Média de ${responses.length} estimativas · variação entre respostas: <b style="color:${varPct > 25 ? 'var(--status-danger)' : varPct > 15 ? 'var(--status-warn)' : 'var(--status-ok)'}">${varPct}%</b></p>`
    : `<p class="small mb8">Estimativa rápida · confira e ajuste os dados se desejar</p>`;

  const descHtml = textoOriginal ? `<div class="small mb8"><b>Descrição enviada:</b> ${escapeHtml(textoOriginal)}</div>` : '';
  const nomeSugerido = escapeHtml(String(final.nome_atividade || '').trim() || 'Exercício físico');
  const kcalTotal = Math.round(Number(final.kcal_gasto_total) || 0);
  const durMin = Math.round(Number(final.duracao_minutos_total) || 30);
  const metMedio = Number(final.met_medio) || 5.0;
  const intensidade = final.intensidade || 'moderada';

  let segHtml = '';
  if (Array.isArray(final.segmentos) && final.segmentos.length > 0) {
    segHtml = `
      <div class="formcard mt8">
        <div style="font-size:11px;font-weight:700;color:var(--txt-secondary);text-transform:uppercase;margin-bottom:6px">Segmentos do Treino (${final.segmentos.length})</div>
        ${final.segmentos.map((s, idx) => {
          const desc = escapeHtml(s.descricao || s.tipo || `Bloco ${idx + 1}`);
          const vel = Number(s.velocidade_kmh) > 0 ? ` · ${s.velocidade_kmh} km/h` : '';
          const sDur = Number(s.duracao_minutos) || 0;
          const sMet = Number(s.met) || 0;
          const sKcal = Math.round(Number(s.kcal_gasto ?? s.kcal) || 0);
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:13px">
              <div>
                <b>${desc}</b>${vel}
                <div class="small">${sDur} min · MET ${sMet}</div>
              </div>
              <div style="font-weight:800;color:#ffffff">-${sKcal} kcal</div>
            </div>`;
        }).join('')}
      </div>`;
  }

  let expHtml = '';
  if (final.explicacao_calculo) {
    expHtml = `<div class="small mt8" style="background:var(--bg-input);padding:8px 10px;border-radius:10px;border:1px solid var(--border-subtle)"><b>Cálculo:</b> ${escapeHtml(final.explicacao_calculo)}</div>`;
  }

  const okCalls = apiReturns.filter(x => x.ok).length;
  const failedCalls = apiReturns.length - okCalls;
  const apiHtml = apiReturns.length ? `<details class="api-return ok mt8"><summary>Ver retorno da API (${responses.length} análises concluídas · ${okCalls} OK · ${failedCalls} falhas)</summary>${apiReturns.slice().sort((a, b) => (a.analysisIndex - b.analysisIndex) || (a.attempt - b.attempt)).map(apiTraceHtml).join('')}</details>` : '';

  window.__activeActivityDraft = {
    nome: nomeSugerido,
    duracaoMin: durMin,
    met: metMedio,
    kcal: kcalTotal,
    intensidade: intensidade,
    origem: 'ia_texto',
    segmentos: final.segmentos || []
  };

  openModal(`
    <h2>⚡ Atividade Estimada</h2>
    ${descHtml}${accHtml}${apiHtml}

    <div class="formrow mt8">
      <div>
        <label>Nome da atividade</label>
        <input id="actNome" value="${nomeSugerido}" maxlength="80"/>
      </div>
      <div>
        <label>Intensidade</label>
        <select id="actIntensidade">
          <option value="leve" ${intensidade === 'leve' ? 'selected' : ''}>Leve</option>
          <option value="moderada" ${intensidade === 'moderada' ? 'selected' : ''}>Moderada</option>
          <option value="intensa" ${intensidade === 'intensa' ? 'selected' : ''}>Intensa</option>
          <option value="muito_intensa" ${intensidade === 'muito_intensa' ? 'selected' : ''}>Muito Intensa</option>
        </select>
      </div>
    </div>

    <div class="formrow three mt8">
      <div>
        <label>Duração (min)</label>
        <input id="actDuracao" type="number" min="1" max="1440" value="${durMin}"/>
      </div>
      <div>
        <label>MET Médio</label>
        <input id="actMet" type="number" step="0.1" min="0.5" max="30" value="${metMedio}"/>
      </div>
      <div>
        <label>Gasto (kcal)</label>
        <input id="actKcal" type="number" min="1" max="10000" style="color:#ffffff;font-weight:800" value="${kcalTotal}"/>
      </div>
    </div>

    ${segHtml}
    ${expHtml}

    <div class="det-total mt8">
      <span>Gasto calórico estimado:</span>
      <span class="v" style="color:#ffffff">-${fmt(kcalTotal)} kcal</span>
    </div>

    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmAtividadeIA()">Adicionar ao Hoje</button>
    </div>
  `);
}

function confirmAtividadeIA() {
  const nome = ($('#actNome')?.value || 'Exercício').trim() || 'Exercício';
  const durMin = parseFloat($('#actDuracao')?.value) || 30;
  const met = parseFloat($('#actMet')?.value) || 5.0;
  const kcal = parseFloat($('#actKcal')?.value) || Math.round(met * (Number(profile?.peso) || 75) * (durMin / 60));
  const intensidade = $('#actIntensidade')?.value || 'moderada';
  const segmentos = window.__activeActivityDraft?.segmentos || [];

  addActivity({
    nome,
    duracaoMin: durMin,
    duracao_min: durMin,
    intensidade,
    met,
    kcal,
    kcal_gasto: kcal,
    origem: 'ia_texto',
    segmentos
  });

  closeModal();
  toast(`⚡ Exercício registrado: -${fmt(kcal)} kcal!`);
  render();
}

/* ============ ATIVIDADE MANUAL ============ */
const EXERCISE_PRESETS = [
  { nome: 'Musculação / Hipertrofia', met: 5.0, intensidade: 'moderada' },
  { nome: 'Caminhada (5 km/h)', met: 3.5, intensidade: 'moderada' },
  { nome: 'Corrida moderada (9 km/h)', met: 8.8, intensidade: 'intensa' },
  { nome: 'Ciclismo moderado', met: 6.8, intensidade: 'intensa' },
  { nome: 'Natação moderada', met: 7.0, intensidade: 'intensa' },
  { nome: 'Treino Funcional / HIIT', met: 9.0, intensidade: 'muito_intensa' },
  { nome: 'Futebol', met: 8.0, intensidade: 'intensa' },
  { nome: 'Alongamento / Yoga', met: 2.5, intensidade: 'leve' }
];

function modalManualExercicio() {
  const peso = Number(profile?.peso) || 75;
  const defaultDur = 45;
  const defaultMet = 5.0;
  const defaultKcal = Math.round(defaultMet * peso * (defaultDur / 60));

  openModal(`
    <h2>🏃 Adicionar Exercício Manual</h2>
    <label>Tipo de exercício</label>
    <input id="manExNome" placeholder="Ex: Musculação, Corrida, Ciclismo" value="Musculação" list="exercisePresetList"/>
    <datalist id="exercisePresetList">
      ${EXERCISE_PRESETS.map(p => `<option value="${p.nome}">${p.nome} (MET ${p.met})</option>`).join('')}
    </datalist>

    <div class="formrow mt8">
      <div>
        <label>Intensidade</label>
        <select id="manExIntensidade" onchange="handleManualIntensityChange()">
          <option value="leve">Leve (MET 2.8)</option>
          <option value="moderada" selected>Moderada (MET 5.0)</option>
          <option value="intensa">Intensa (MET 8.0)</option>
          <option value="muito_intensa">Muito Intensa (MET 11.5)</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>
      <div>
        <label>MET</label>
        <input id="manExMet" type="number" step="0.1" min="0.5" max="30" value="${defaultMet}" oninput="calcManualKcal()"/>
      </div>
    </div>

    <div class="formrow mt8">
      <div>
        <label>Duração (minutos)</label>
        <input id="manExDur" type="number" min="1" max="1440" value="${defaultDur}" oninput="calcManualKcal()"/>
      </div>
      <div>
        <label>Gasto estimado (kcal)</label>
        <input id="manExKcal" type="number" min="0" max="10000" value="${defaultKcal}" style="color:#ffffff;font-weight:800"/>
      </div>
    </div>

    <p class="small mt8">Fórmula: MET × Peso (${peso} kg) × (Duração / 60 min). Você também pode digitar o valor diretamente.</p>

    <div class="det-total mt8">
      <span>Gasto calórico:</span>
      <span class="v" id="manExKcalDisplay" style="color:#ffffff">-${fmt(defaultKcal)} kcal</span>
    </div>

    <div class="row mt12">
      <button class="bigbtn secondary" onclick="closeModal()">Cancelar</button>
      <button class="bigbtn primary" onclick="confirmManualExercicio()">Salvar Exercício</button>
    </div>
  `);
}
function abrirManualExercicio() { modalManualExercicio(); }

function handleManualIntensityChange() {
  const sel = $('#manExIntensidade')?.value;
  const metInput = $('#manExMet');
  if (!metInput) return;
  if (sel === 'leve') metInput.value = 2.8;
  else if (sel === 'moderada') metInput.value = 5.0;
  else if (sel === 'intensa') metInput.value = 8.0;
  else if (sel === 'muito_intensa') metInput.value = 11.5;
  calcManualKcal();
}

function calcManualKcal() {
  const dur = parseFloat($('#manExDur')?.value) || 0;
  const met = parseFloat($('#manExMet')?.value) || 5.0;
  const peso = Number(profile?.peso) || 75;
  const kcal = Math.round(met * peso * (dur / 60));
  if ($('#manExKcal')) $('#manExKcal').value = kcal;
  if ($('#manExKcalDisplay')) $('#manExKcalDisplay').textContent = '-' + fmt(kcal) + ' kcal';
}

function confirmManualExercicio() {
  const nome = ($('#manExNome')?.value || 'Exercício').trim() || 'Exercício';
  const durMin = parseFloat($('#manExDur')?.value) || 0;
  const met = parseFloat($('#manExMet')?.value) || 5.0;
  const kcal = parseFloat($('#manExKcal')?.value) || Math.round(met * (Number(profile?.peso) || 75) * (durMin / 60));
  const intensidade = $('#manExIntensidade')?.value || 'moderada';

  if (durMin <= 0 && kcal <= 0) {
    toast('Informe a duração ou as calorias do exercício');
    return;
  }

  addActivity({
    nome,
    duracaoMin: durMin,
    duracao_min: durMin,
    intensidade,
    met,
    kcal,
    kcal_gasto: kcal,
    origem: 'manual'
  });

  closeModal();
  toast(`Exercício salvo: -${fmt(kcal)} kcal!`);
  render();
}

// Activity and Photo exports
window.DAILY_FOOD_SCHEMA = DAILY_FOOD_SCHEMA;
window.DAILY_FOOD_PROMPT = DAILY_FOOD_PROMPT;
window.apiBodyResumoDia = apiBodyResumoDia;
window.consultarModeloResumoDia = consultarModeloResumoDia;
window.mergeResumoDiaAnalisys = mergeResumoDiaAnalisys;
window.ACTIVITY_SCHEMA = ACTIVITY_SCHEMA;
window.ACTIVITY_PROMPT = ACTIVITY_PROMPT;
window.getEvolucaoWorkout = getEvolucaoWorkout;
window.carregarTreinoEvolucao = carregarTreinoEvolucao;
window.apiBodyAtividade = apiBodyAtividade;
window.consultarModeloAtividade = consultarModeloAtividade;
window.mergeActivityAnalisys = mergeActivityAnalisys;
window.abrirAtividadeIA = abrirAtividadeIA;
window.iniciarAnaliseAtividade = iniciarAnaliseAtividade;
window.encerrarAnaliseAtividade = encerrarAnaliseAtividade;
window.processarAtividade = processarAtividade;
window.mostrarConfirmacaoAtividade = mostrarConfirmacaoAtividade;
window.confirmAtividadeIA = confirmAtividadeIA;
window.modalManualExercicio = modalManualExercicio;
window.abrirManualExercicio = abrirManualExercicio;
window.handleManualIntensityChange = handleManualIntensityChange;
window.calcManualKcal = calcManualKcal;
window.confirmManualExercicio = confirmManualExercicio;
window.processarFoto = processarFoto;
window.tentarNovamenteFoto = tentarNovamenteFoto;
window.consultarModelo = consultarModelo;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FOOD_SCHEMA,
    FOOD_PROMPT,
    TEXT_FOOD_PROMPT,
    DAILY_FOOD_SCHEMA,
    DAILY_FOOD_PROMPT,
    ACTIVITY_SCHEMA,
    ACTIVITY_PROMPT,
    GEMINI_MODELS,
    GEMINI_API_BASE,
    RETRY_DELAY_MS,
    GEMINI_MODELS_CONFIG_VERSION,
    consultarModelo,
    consultarModeloTexto,
    consultarModeloResumoDia,
    apiBodyResumoDia,
    consultarModeloAtividade,
    processarFoto,
    tentarNovamenteFoto,
    openFoto,
    abrirFoto,
    encerrarAnaliseFoto,
    mergeAnalisys,
    mergeResumoDiaAnalisys,
    mergeActivityAnalisys,
    apiHint,
    apiTraceHtml,
    isRetryableStatus
  };
}
