# Coach — sistema pessoal de performance híbrida

Status: design aprovado para a primeira fatia vertical  
Última revisão: 2026-08-22

## Understanding

O Coach será o terceiro aplicativo deste workspace e funcionará como o centro de decisão entre o **Evolução** (musculação), o **NutriTrack** (nutrição), o Health Connect e um check-in subjetivo rápido. O produto é pessoal e local-first. Seu objetivo é ajudar uma única pessoa a evoluir o máximo possível na academia enquanto conclui uma maratona em 2027 com saúde, sem perseguir inicialmente um tempo-alvo.

O Coach não substitui os dois aplicativos existentes. Eles continuam sendo as fontes de verdade e as ferramentas de execução em seus domínios. O Coach observa dados, normaliza evidências, calcula um plano local determinístico, pede uma segunda opinião ao Gemini e apresenta propostas explicáveis. Nenhuma alteração de treino ou nutrição é aplicada sem aprovação explícita do usuário.

A experiência principal é um briefing às 05:40, antes da saída para a academia às 06:00 de segunda a sexta. A musculação ocorre de segunda a sábado; o horário de sábado varia, mas permanece pela manhã. A corrida seguirá o cronograma da maratona. O TicWatch e o Sleep Cycle são fontes oportunistas: enriquecem a análise quando estiverem disponíveis, mas sua ausência nunca impede o funcionamento.

## Assumptions

- O aplicativo será inicialmente usado por uma única pessoa, em um único telefone Android.
- A interface será em português do Brasil.
- A primeira versão não diagnostica doenças, prescreve tratamento nem substitui médico, nutricionista ou treinador.
- Dados ausentes têm estado próprio e nunca são convertidos implicitamente em zero.
- O Health Connect pode não estar instalado, configurado ou autorizado; o fluxo manual precisa continuar completo.
- O Gemini pode estar offline, sem chave, sem cota ou responder fora do contrato; o plano local continua sendo a autoridade.
- A primeira noite cria somente `coach-android/`. Integração viva e escrita nos aplicativos existentes ficam para uma fase posterior.
- Alterações já presentes no worktree pertencem ao usuário e não devem ser modificadas, restauradas ou incluídas por conveniência.

## Final Design

### 1. Arquitetura do produto

O novo projeto será `coach-android/`, um aplicativo Android independente. A camada nativa será Kotlin e cuidará de permissões, Health Connect, banco local, armazenamento seguro, notificações e acesso de rede ao Gemini. A interface será um WebView com HTML, CSS e JavaScript locais, seguindo o estilo leve dos aplicativos existentes e permitindo que a lógica determinística seja testada também com Node.js.

Os limites de responsabilidade são:

- **Nativo Kotlin:** APIs Android, Health Connect, SQLite, Android Keystore, notificações, rede e validação de fronteira.
- **Bridge tipada:** um conjunto pequeno e versionado de mensagens JSON, com allowlist de operações, limites de tamanho e respostas estruturadas.
- **Frontend local:** briefing, check-in, propostas, explicações e configurações.
- **Motor local:** transforma um snapshot imutável em prontidão, alertas e intervenções candidatas. Para a mesma entrada e versão, produz a mesma saída.
- **Gemini:** revisor consultivo. Pode concordar, ajustar ou declarar dados insuficientes, mas não executa ferramentas nem altera estado.

Na fase 2, Evolução e NutriTrack exporão contratos Android explícitos e versionados. O Coach enviará comandos granulares somente após aprovação. Cada aplicativo de origem validará e aplicará seu próprio patch e devolverá um recibo. O Coach nunca escreverá diretamente no `localStorage` de outro aplicativo.

### 2. Memória local e modelo canônico

A unidade de raciocínio é um `DailySnapshot` imutável. Todo valor observado deve carregar:

- valor e unidade;
- origem e identificador do registro de origem;
- instante observado;
- estado: `observed`, `informed`, `estimated` ou `absent`;
- confiança;
- versão do contrato.

Os domínios do snapshot são força, corrida, nutrição, corpo, recuperação e subjetivo. As tabelas iniciais são:

- `source_record`: registros normalizados e deduplicados;
- `sync_cursor`: cursores/checkpoints por fonte;
- `daily_snapshot`: fotografia imutável e seu hash;
- `check_in`: respostas manuais;
- `plan_run`: versão e resultado do motor local;
- `proposal`: patches propostos e seus estados;
- `gemini_opinion`: pedido, resposta validada e hash de cache;
- `decision`: aceite, edição ou rejeição do usuário.

O mesmo snapshot deve alimentar o motor local e a solicitação sanitizada ao Gemini. O banco é privado ao aplicativo e versionado por migrações. A data lógica do dia usa o fuso local e deve tratar corretamente sessões que atravessam meia-noite.

### 3. Health Connect

A primeira fatia implementa onboarding real e leitura, quando disponível, de sono, passos, frequência cardíaca de repouso e peso. As permissões são mínimas e somente de leitura. A interface precisa mostrar disponibilidade, permissões concedidas, última sincronização e origem de cada dado.

O adaptador deve distinguir:

- Health Connect indisponível;
- permissão ainda não solicitada;
- permissão negada ou revogada;
- fonte sem registros;
- sincronização com sucesso e valor realmente observado.

Sincronizações incrementais usam cursores/tokens quando a API permitir. Expiração de cursor provoca uma ressincronização limitada e segura, não uma duplicação silenciosa. Registros são deduplicados pelo identificador de origem e janela temporal. O check-in manual sempre funciona como fallback.

### 4. Check-in e briefing

O check-in deve caber em aproximadamente 30 segundos e coletar apenas sinais que sensores não capturam com confiabilidade: energia, dor muscular por região, dor articular/alerta, motivação, percepção do sono e observação curta opcional.

O briefing das 05:40 apresenta, nesta ordem:

1. qualidade e cobertura dos dados;
2. prontidão global e por grupamento muscular;
3. carga de corrida e risco de interferência prática;
4. estado de combustível/hidratação;
5. plano local do dia;
6. opinião separada do Gemini, se disponível;
7. propostas granulares para aceitar, editar ou rejeitar.

Cada proposta explica fatos usados, motivo, benefício esperado, custo/trade-off, confiança e alternativa conservadora. A aplicação local do briefing não espera o Gemini; a opinião remota chega de forma assíncrona e é armazenada pelo hash de snapshot e plano.

### 5. Motor determinístico de prontidão

O motor calcula dimensões independentes:

- recuperação global;
- prontidão muscular por região;
- carga de corrida aguda e tendência;
- adequação de energia, carboidrato, proteína e hidratação;
- qualidade/cobertura dos dados.

Nas primeiras semanas, sem baseline individual suficiente, a confiança é baixa e as recomendações são conservadoras. Um baseline móvel de aproximadamente 21–28 dias passa a personalizar tendências. O motor não presume que corrida destrói hipertrofia: considera proximidade, intensidade, volume, grupamentos exigidos, sono, combustível e resposta individual.

As intervenções sobem gradualmente de custo: manter plano; ajustar aquecimento/descanso; ajustar RIR ou carga; reduzir séries; trocar exercício; reorganizar corrida/musculação; sugerir deload. Alertas de dor aguda, sintomas incomuns ou outros sinais de risco bloqueiam recomendações agressivas e orientam avaliação profissional, sem diagnóstico.

### 6. Contrato do Gemini

O Gemini recebe um `CoachReviewRequest` sanitizado, sem banco bruto, contendo:

- snapshot do dia e indicadores de cobertura;
- agregados de 7 e 28 dias;
- candidato produzido pelo motor local;
- identificadores de evidência;
- limites invioláveis e versão do schema.

A saída usa JSON Schema/Structured Outputs e contém:

- `verdict`: `agree`, `adjust` ou `insufficient_data`;
- `summary`;
- `observations` com referências a evidências;
- `concerns`;
- `suggestedAdjustments`;
- `questions`;
- `confidence`.

Function calling não será usado na v1. Um validador local rejeita referências inexistentes, mudanças fora dos limites, conteúdo médico prescritivo, incompatibilidade de schema, resposta excessiva e resultado obsoleto. O app mostra separadamente **plano local**, **opinião do Gemini** e **decisão final**. A chave nunca entra nos assets nem em logs e deve ser protegida pelo Android Keystore.

### 7. Aprovação e escrita futura

Uma proposta é um patch pequeno e atômico, por exemplo: reduzir uma série de quadríceps, elevar o RIR alvo, deslocar uma corrida intensa ou ajustar carboidratos antes do treino. O usuário pode aceitar, editar ou rejeitar cada patch.

Na fase 2, cada envio inclui versão do contrato, revisão esperada da fonte, idempotency key, payload e justificativa. A fonte valida revisão e domínio. Em conflito, devolve erro e o Coach atualiza os dados antes de oferecer uma nova proposta. Se a fonte estiver indisponível, o patch fica pendente; não é marcado falsamente como aplicado.

### 8. Segurança, privacidade e falhas

- Banco privado ao app; chave protegida pelo Keystore.
- Sem analytics e sem dados de saúde em logs.
- Backup exclui a chave, cache do Gemini e dados brutos recuperáveis do Health Connect.
- Tela “O que foi enviado” antes/depois de cada consulta remota.
- Exclusão local completa e revogação simples de permissões.
- Notas do usuário são dados não confiáveis, nunca instruções para o modelo.
- Limites de schema, tamanho, versão, tempo e caracteres em todas as fronteiras.
- Operação integral sem internet, chave Gemini, relógio ou Health Connect.
- Conflitos e falhas são visíveis; nenhum dado é inventado para preencher lacunas.

### 9. Primeira noite — fatia vertical

A primeira noite deve entregar apenas dentro de `coach-android/`:

1. projeto Kotlin/Gradle compilável e WebView local;
2. SQLite versionado com dados de demonstração claramente marcados;
3. onboarding e leitura reais do Health Connect;
4. check-in de 30 segundos;
5. `DailySnapshot` e motor local determinístico inicial;
6. briefing com explicações e estados de ausência;
7. gateway Gemini com Structured Output, validador e fallback offline;
8. testes, README, documentação arquitetural e APK debug.

Ordem de prioridade em caso de tempo limitado: build reproduzível; modelo/banco; Health Connect; briefing e motor local; testes; Gemini. Uma integração Gemini incompleta nunca deve comprometer o funcionamento local.

Os gates são:

- testes e `assembleDebug` passam;
- app abre sem internet, chave e Health Connect;
- ausente nunca equivale a zero;
- motor local é determinístico;
- Gemini não consegue mutar o plano nem o banco;
- nenhum arquivo de `evolucao-android/` ou `nutricao-android/` é alterado;
- limitações e comandos executados são registrados em `coach-android/NIGHTLY_STATUS.md`.

### 10. Estratégia de testes

- Testes JS de regras, invariantes, datas, missingness e entradas adversariais.
- Testes Kotlin de banco, bridge, serialização, validador e segurança de limites.
- Testes do adaptador Health Connect com o cliente fake oficial quando compatível.
- Fixtures Gemini válidas, inválidas, obsoletas, com evidência falsa e prompt injection em notas.
- Cenários sem sensores, fontes duplicadas, fuso/meia-noite, cursor expirado, conflito de revisão, offline e chave ausente.
- Compilador e testes são a autoridade; diagnósticos de editor/LSP são auxiliares.

## Decision Log

| Decisão | Escolha aprovada | Motivo |
|---|---|---|
| Escopo | Sistema pessoal | Maximiza utilidade e profundidade sem custo de produto multiusuário. |
| Produto central | Coach proativo diário | Converte dados em decisões no momento útil. |
| Entrada | Sensores oportunistas + check-in | Funciona mesmo sem uso constante do relógio. |
| Topologia | Terceiro app hub | Preserva Evolução e NutriTrack como especialistas. |
| Privacidade | Local-first | Minimiza exposição de dados de saúde. |
| Objetivo | Força/hipertrofia + maratona 2027 saudável | Evita otimização unilateral e não inventa meta de tempo. |
| Autoridade | Motor local determinístico | Mantém segurança, repetibilidade e operação offline. |
| Papel do Gemini | Segunda opinião estruturada | Agrega crítica sem entregar controle a um LLM. |
| Mudanças | Propor e pedir aprovação | Usuário permanece no controle. |
| Dados | Snapshot canônico com proveniência | Torna raciocínio auditável e trata ausência corretamente. |
| Primeira experiência | Briefing às 05:40 | Encaixa na rotina real antes do treino. |
| Primeira noite | Nova fatia vertical isolada | Produz algo demonstrável sem arriscar apps existentes. |

## Roadmap após a primeira noite

1. **Integração somente-leitura:** providers explícitos no Evolução e NutriTrack para snapshots versionados.
2. **Propostas aplicáveis:** comandos Android versionados, atômicos e com recibo.
3. **Baseline pessoal:** calibração de 21–28 dias, tendências e explicações comparativas.
4. **Planejamento concorrente:** organização semanal musculação/corrida/nutrição com restrições.
5. **Wear OS opcional:** captura e ações rápidas sem transformar o relógio em dependência.

## Referências técnicas

- [Health Connect — visão geral](https://developer.android.com/health-and-fitness/health-connect)
- [Health Connect — configuração](https://developer.android.com/health-and-fitness/health-connect/get-started)
- [Health Connect — tipos de dados](https://developer.android.com/health-and-fitness/health-connect/data-types)
- [Health Connect — sincronização incremental](https://developer.android.com/health-and-fitness/health-connect/sync-data)
- [Health Connect — escrita e semântica de dados](https://developer.android.com/health-and-fitness/health-connect/write-data)
- [Health Connect — testes unitários](https://developer.android.com/health-and-fitness/health-connect/test/unit-tests)
- [Gemini — Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output?lang=rest)
- [Gemini — ferramentas e function calling](https://ai.google.dev/gemini-api/docs/tools)
- [ACSM — progressão em treinamento de resistência](https://pubmed.ncbi.nlm.nih.gov/11828249/)
- [Consenso sobre sono em atletas](https://pubmed.ncbi.nlm.nih.gov/33144349/)
- [Meta-análise atualizada de treinamento concorrente](https://pubmed.ncbi.nlm.nih.gov/34757594/)

