# Arquitetura — Coach Android 0.2.0

## Visão geral

O Coach é um aplicativo Android independente com duas metades: Kotlin controla recursos confiáveis do sistema; HTML/CSS/JavaScript locais apresentam a experiência e executam o motor determinístico.

```text
Health Connect ─────────────leitura/agregação───────────┐
Evolução ──provider read-only──> peso + corridas ───────┤
NutriTrack ──provider read-only──> totais diários ──────┼──> SQLite ──> DailySnapshot imutável
Check-in ───────────────validação/persistência──────────┘                  │
                                                                          ▼
WebView local <── bridge versionada ── MainActivity ── motor JS determinístico
      │                                │                       │
      │                                ├── Android Keystore    └── propostas locais
      │                                ├── AlarmManager
      │                                └── gateway Gemini ──HTTPS──> segunda opinião
      └── decisão do usuário ───────────────> SQLite (sem escrita externa)
```

O `DailySnapshot` armazenado e identificado por SHA-256 é a unidade comum do motor e da revisão remota. O hash impede que resultados de um estado anterior sejam aceitos depois de um novo check-in ou sync. Operações mutáveis da bridge são serializadas no processo e canceladas com o ciclo de vida da Activity.

## Camadas

| Camada | Responsabilidade | Não pode fazer |
|---|---|---|
| UI WebView | Render, check-in e decisões | Rede direta, arquivo, banco ou segredo |
| Motor JS | Transformação pura snapshot → prontidão/propostas | Relógio, aleatoriedade, I/O ou mutação externa |
| Bridge | Envelope/allowlist, tamanho e resposta correlacionada | Confiar em JSON da página sem revalidar |
| Kotlin/domain | Contratos, canonicalização, data lógica | Inventar valor para slot ausente |
| SQLite | Persistência privada e idempotência | Misturar silenciosamente demo/real |
| Health | Disponibilidade, permissão, leitura, token e deduplicação | Escrever no Health Connect |
| Fontes locais | Consultar providers, validar contratos, normalizar e reconciliar | Ler banco/arquivo privado de outro app ou enviar detalhes de refeição |
| Gemini | Request sanitizado, HTTPS, schema e validação | Function calling ou alterar plano/decisão |
| Keystore | Cifrar a credencial AES-GCM | Exportar ou logar a chave |
| Notificação | Lembrete diário inexacto e reagendamento | Exigir permissão de alarme exato |

## Contrato canônico e SQLite

`MetricValue` carrega chave, valor/unidade, origem, referência da origem, instante, estado (`OBSERVED`, `INFORMED`, `ESTIMATED`, `ABSENT`), confiança e versão. Slots ausentes têm `value`, `sourceRecordId` e `observedAtEpochMs` nulos.

O schema v1 possui oito tabelas:

1. `source_record`: agregados normalizados da fonte, sem linhas ausentes.
2. `sync_cursor`: change tokens/checkpoints por fonte.
3. `daily_snapshot`: JSON canônico imutável por hash.
4. `check_in`: sinais subjetivos limitados e validados.
5. `plan_run`: saída do motor única por `(snapshot_hash, engine_version)`.
6. `proposal`: patches pequenos e estado da revisão.
7. `gemini_opinion`: request sanitizado e resposta validada em cache.
8. `decision`: aceite, edição ou rejeição; `applied_to_source` permanece nulo na v0.1.0.

Writes usam IDs estáveis/conflito explícito. `clearAllPersonalData()` apaga em ordem segura de dependências.

## Health Connect

`AndroidHealthConnectSource` usa as APIs reais de `connect-client 1.1.0` para quatro tipos de leitura. `HealthSyncCoordinator`:

- verifica SDK/provider e calcula as permissões concedidas antes de cada leitura;
- em acesso parcial, lê somente os tipos autorizados, preserva os demais agregados locais e não avança um cursor incompleto;
- usa change token nas sincronizações seguintes;
- faz resync diário limitado na primeira leitura, quando há mudança ou quando o token expira;
- reserva o próximo token antes do resync, evitando uma lacuna para mudanças que ocorram durante a leitura;
- usa a Aggregate API para sono e passos, respeitando a prioridade de origem do Health Connect e evitando somar telefone, relógio e Sleep Cycle duas vezes;
- agrega o sono em janelas lógicas não sobrepostas de 18:00 a 18:00, mantendo uma noite que cruza meia-noite em um único briefing;
- pagina FC de repouso e peso, deduplica por origem + ID e usa o registro mais recente nas janelas limitadas;
- remove agregado local antigo quando a fonte deixa de retornar registros;
- mantém `PERMISSION_REQUIRED`, `PROVIDER_UPDATE_REQUIRED`, `UNAVAILABLE`, `NO_CHANGES`, `SYNCED`, `PAUSED` e `ERROR` visíveis.

O botão de ajustes abre a ação oficial `ACTION_HEALTH_CONNECT_SETTINGS`, onde o usuário pode revogar acesso.

## Evolução e NutriTrack

Os aplicativos-fonte publicam contratos Android `ContentProvider` versionados e somente leitura:

- `content://com.evolucao.treino.workouts/workouts?date=YYYY-MM-DD` retorna sessões normalizadas da data e a pesagem mais recente até aquela data. A fronteira nativa elimina impedância e identificadores BLE; o Coach dá prioridade a esse peso e usa Health Connect como fallback.
- `content://com.nutricao.app.nutrition/daily?date=YYYY-MM-DD` retorna, quando houver registro, somente contagem de refeições, calorias, macros, água e metas. Nenhum nome/item/foto/hábito/atividade/chave entra no espelho.

Os providers verificam o pacote do UID chamador, têm payload limitado e rejeitam insert/update/delete. O Coach revalida versão, origem, data, tipos, limites e números finitos antes de persistir. Um payload vazio válido remove o espelho daquela data; provider indisponível ou payload inválido preserva o último registro válido e mostra estado de erro, em vez de fabricar zero.

## Bridge WebView

Envelope de entrada:

```json
{"version":1,"requestId":"web-...","data":{}}
```

Resposta:

```json
{"version":1,"requestId":"web-...","ok":true,"data":{}}
```

Erros têm `ok:false` e `{code,message}`. O limite é 32 KiB UTF-8. IDs e strings têm alfabetos/tamanhos limitados; campos extras são rejeitados nas fronteiras sensíveis.

Operações permitidas: bootstrap, sync/permissão/ajustes Health Connect, check-in, persistência do plano, decisão, salvar/remover chave, preview/review Gemini, notificação e exclusão local.

Respostas voltam por `window.CoachNative.receive()` usando `JSONObject.quote`, evitando injeção de script. IDs em voo são limitados e não podem ser repetidos. O WebView só serve `https://appassets.androidplatform.net/assets/www/`; asset ausente retorna 404 e qualquer outra origem retorna 403. CSP, client nativo e settings bloqueiam conteúdo remoto, HTTP, arquivos, providers, downloads, frames e múltiplas janelas.

## Motor determinístico

`engine.js` não lê relógio, rede, DOM ou armazenamento. Ele calcula:

- cobertura dos quatro slots + check-in;
- recuperação global a partir de sono/energia/sono percebido/motivação disponíveis;
- prontidão muscular por região informada;
- corrida como observada somente quando há sessão registrada no Evolução, com quantidade/distância/duração factuais;
- combustível como observado somente quando há refeição ou água registrada no NutriTrack, mostrando realizado/meta sem inferir uma pontuação fisiológica;
- bloqueio de segurança por dor articular ou dor muscular forte;
- exatamente uma intervenção inicial conservadora: manter, elevar RIR, reduzir uma série ou segurar progressão.

Os thresholds são iniciais, transparentes e de baixa/moderada confiança sem baseline. Personalização de 21–28 dias é roadmap, não comportamento fingido.

## Gemini

O payload é reconstruído pelo nativo a partir do snapshot/plano armazenados, nunca aceito como autoridade da página. A nota livre, timestamps brutos e metadados desnecessários são omitidos. Agregados ainda indisponíveis são declarados como tal. Antes de cada envio, o nativo emite um recibo aleatório de uso único, válido por dois minutos e vinculado a snapshot, plano, modelo e hash do payload; depois do preview, um `AlertDialog` nativo exige confirmação explícita.

O request usa `responseMimeType: application/json` e `responseJsonSchema`, sem `tools`. A resposta precisa ter exatamente:

- `verdict`: `agree`, `adjust` ou `insufficient_data`;
- `summary`, `observations`, `concerns`, `suggestedAdjustments`, `questions`, `confidence`;
- IDs de evidência pertencentes ao request;
- targets/operações da allowlist;
- limites de arrays/strings/tamanho e nenhuma linguagem médica prescritiva.

Timeout, HTTP, envelope, schema, evidência ou obsolescência causam fallback visível para o plano local. Só a opinião validada entra no cache; ela não atualiza propostas ou decisões.

## Falhas e segurança

| Falha | Comportamento |
|---|---|
| Sem Health Connect/permissão/registro | Slot ausente + check-in e motor continuam |
| Evolução/NutriTrack não instalado | Fonte local indisponível; demais sinais continuam |
| Provider local vazio | Registros anteriores daquele dia são removidos; ausência não vira zero |
| Provider local inválido/fora do ar | Último registro válido é preservado e a falha fica explícita |
| Token expirado | Resync diário limitado e novo token |
| Sem internet/chave/cota | Plano local permanece; revisão mostra falha |
| JSON remoto inválido ou hostil | Rejeitado antes do SQLite |
| Snapshot muda durante resposta | Opinião descartada como obsoleta |
| App/telefone reinicia | Banco persiste; receiver reagenda se habilitado |
| Notificação negada | Agendamento não é marcado falsamente como ativo |
| Exclusão local | Confirmação nativa; DB, credencial, settings e alarme removidos; autosync pausado até reconectar |

`allowBackup=false` impede que banco/credencial sejam copiados pelo backup Android. Não há analytics nem logs de saúde/segredo.

## Próximas fases

1. Backend OAuth mínimo para Strava, mantendo `client_secret` e refresh tokens fora do APK; ver `STRAVA_INTEGRATION.md`.
2. Baselines móveis de 21–28 dias para carga/recuperação, sem transformar ausência em penalidade.
3. Comandos externos atômicos, somente após aprovação, com revisão esperada/idempotency key/recibo.
4. Validar providers, insets e dados pessoais nos aparelhos físicos após instalar as três builds 0.2.
