# Arquitetura do companion Wear

## Decisão

O projeto agora é Gradle multi-módulo. O comando histórico `build.ps1` foi mantido como fachada compatível e delega ao Gradle quando a nova estrutura está presente; seu corpo manual permanece documentado no arquivo para rastreabilidade. Essa escolha permite Compose for Wear OS, Room, WorkManager e Play Services Wearable sem tentar resolver essas dependências com `javac`/`d8` puros.

```text
Evolução JS
  → função exportPlanJson() validada
  → AndroidBridge.publishWearPlan()
  → plano + outbox mobile (transação Room)
  → DataClient / DataItem durável
  → inbox/plano Room no Wear

UI Wear
  → evento salvo com sessão (transação Room)
  → outbox Wear
  → DataClient / DataItem durável
  → inbox mobile + ACK RECEIVED (transação Room)
  → EvolucaoWear.consumeNativeInbox(JSON escapado)
  → estado JS persistido em localStorage
  → ACK APPLIED/ALREADY_APPLIED
  → evento deixa a fila pendente Wear
```

`MessageClient` só envia um “poke” para reduzir latência. Perder uma Message nunca perde dados. `CapabilityClient` detecta `evolucao_phone_sync_v1` e `evolucao_workout_sync_v1`; estar offline é um estado normal.

## Fonte de verdade e autoridades

- O estado JS do Evolução permanece a fonte de verdade funcional no telefone.
- O telefone é autoridade para a parte ainda não executada do plano.
- Eventos concluídos no relógio não são apagados por uma revisão de plano.
- Para heads concorrentes da mesma série, o reducer dá precedência determinística a evento Wear; o outro payload permanece registrado como conflito.
- O `WorkoutProvider` continua somente leitura e não participa da escrita Wear.

## Persistência mobile

`MobileWearDatabase` contém:

- `wear_mobile_plan`: snapshot validado ativo;
- `wear_mobile_envelope`: envelope recebido e estado de dispatch;
- `wear_mobile_inbox`: payload canônico por `eventId`;
- `wear_mobile_envelope_event`: status específico de cada evento em cada envelope;
- `wear_mobile_outbox`: plano/ACK ainda não publicado;
- `wear_mobile_conflict`: reutilização de ID, hash divergente ou conflito reportado pelo JS.

Ao receber um envelope, envelope, eventos, vínculos e ACK `RECEIVED` são gravados na mesma transação. O WebView só recebe o envelope depois disso.

## Persistência Wear

`WearDatabase` contém:

- planos versionados, com um ativo e planos novos aguardando;
- sessão serializada e `originSequence` monotônica;
- ledger de eventos e envelope de transporte por evento;
- ACKs vistos;
- conflitos preservados.

Um evento `SENT` ou `RECEIVED` continua pendente. Só `ACKED`, `CONFLICT_STORED` ou `REJECTED` saem da contagem da fila; o ledger continua disponível para undo, resumo e auditoria.

## Janelas de crash

| Momento da falha | Recuperação |
|---|---|
| Wear morre antes do commit | série não aparece concluída; usuário pode repetir |
| Wear morre após commit, antes do envio | WorkManager encontra `PENDING` |
| conexão cai durante DataItem/ACK | DataItem durável e retry periódico |
| telefone morre após inbox | `DISPATCHING` volta a `READY` no próximo WebView |
| envelope chega com WebView fria (JS ainda não pronto) | `reportApplyFailure` reagenda o drain com backoff (5s/15s/30s); attach, poke e `onPeerConnected` drenam de novo |
| JS morre antes de persistir | nenhum ACK final; envelope é repetido |
| JS persiste e morre antes do ACK | replay retorna `ALREADY_APPLIED` |
| finalizar é acionado duas vezes | `finishedEventId` impede segundo evento e ledger JS impede segunda sessão |

## Plano novo e revisões

Planos usam `(sessionId, planRevision)` e hash canônico. Uma revisão maior da mesma sessão substitui apenas prescrições ainda não executadas; uma revisão inferior nunca volta a ser ativada, mesmo que chegue depois. Um plano de outra sessão fica aguardando enquanto há treino ativo ou resumo final aberto. Na fila de espera, primeiro vence a maior revisão de cada sessão e, entre sessões distintas, `generatedAt` escolhe a mais nova com desempate estável por `sessionId`. Sessões finalizadas permanecem registradas e nunca são reativadas por retransmissão ou revisão tardia.

## Timer e bateria

O timer persiste `endElapsedRealtime`, `endWallClockMillis`, `bootCount` e restante pausado. No mesmo boot usa relógio monotônico; após reboot usa wall-clock e cria novo deadline monotônico. AlarmManager agenda apenas 30 s, 10 s e 0; a UI atualiza por segundo somente quando visível e por minuto em ambient. Não há polling de rede.

Série concluída ou descanso iniciado no telefone republica o plano com `phoneCompletedSetIds`/`phoneRest`; o relógio avança o cursor e adota o descanso como timer local (só sem timer próprio). Série concluída no relógio com o app do telefone em segundo plano fica durável no inbox nativo (ACK `RECEIVED`) e é aplicada com retry automático ao drenar — pode levar segundos se a WebView estava fria, mas nunca perde dado.

## UI e acessibilidade

- Compose for Wear OS e `ScalingLazyColumn` com indicador de rolagem.
- Alvos principais de 52 dp.
- Rótulos semânticos/content descriptions nos steppers e botões.
- Carga/reps/RIR ajustáveis por toque e rotary; teclado numérico é alternativa, não fluxo comum.
- Ambient usa fundo preto, conteúdo mínimo e atualização reduzida.
- Ações de undo, saída e finalização usam confirmação; dados nunca são apagados silenciosamente.

## Segurança

- Decoders rejeitam versão/campos desconhecidos, tipos errados, UUIDs inválidos, excesso de bytes/listas e números fora de faixa.
- Paths e hashes do DataItem são conferidos contra o payload canônico.
- `evaluateJavascript` chama somente `window.EvolucaoWear.consumeNativeInbox` e o argumento passa por `JSONObject.quote`.
- Logs registram códigos/tipos, nunca o plano/evento completo.
- Componentes não necessários não são exportados; receivers de timer/boot são internos.

## Assinatura

Os dois APKs usam o mesmo package e o mesmo signing config. Isso é necessário para o namespace do Data Layer. Trocar uma das chaves isoladamente quebra atualização e descoberta; reinstale ambos com uma chave única se migrar para release.
