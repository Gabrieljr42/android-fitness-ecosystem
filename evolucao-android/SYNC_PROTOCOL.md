# Protocolo de sincronização Wear — v1 (plano com progresso do telefone)

Todo payload tem `protocolVersion: 1`. JSON é decodificado com allowlist: campo desconhecido ou obrigatório ausente falha fechado. Os campos `phoneCompletedSetIds` e `phoneRest` do plano são opcionais na leitura (planos antigos continuam válidos); planos novos em relógio antigo falham fechado com erro visível — os dois APKs são distribuídos juntos, então atualize ambos.

## Transporte

| Dado | Path Data Layer | Origem |
|---|---|---|
| Plano | `/evolucao/v1/plans/{sessionId}` | telefone |
| Evento(s) | `/evolucao/v1/envelopes/{envelopeId}` | relógio |
| ACK | `/evolucao/v1/acks/{ackId}` | telefone |
| Poke não durável | `/evolucao/v1/poke` | ambos |

Cada DataMap contém `payload`, `payloadHash` SHA-256 e `updatedAt`. O payload é validado novamente e o ID do path deve coincidir com o JSON.

## Identidade

- `planId`, `sessionId`, `setId`, `eventId`, `envelopeId`, `ackId` e `originInstanceId`: UUID.
- `exerciseId`: ID canônico `ex_...`; aliases servem apenas para migração/rename.
- `originSequence`: contador crescente por instância Wear.
- `logicalDate`: `YYYY-MM-DD`, inclusive backdating explícito.
- `occurredAt`: quando a ação aconteceu; `createdAt`: quando o evento foi materializado.

## Modelos

`WorkoutPlan` contém revisão, data/dia A-B-C, modo normal/curto, aviso conservador e `ExercisePlan[]`. Cada exercício contém descanso, incremento em gramas, flags `perSide`/`unilateral`, RIR e `SetPrescription[]` com `setId` estável, kind, reps e histórico/sugestão.

## Progresso do telefone → relógio

O plano também carrega o que foi feito no telefone desde a última publicação:

- `phoneCompletedSetIds`: `setId`s das prescrições já concluídas no draft do telefone (aquecimento e trabalho). Mudança aqui altera o fingerprint e avança `planRevision`, então o relógio ativa a revisão e reposiciona o cursor (`effectiveCompleted = eventos próprios ∪ phoneCompleted ∩ prescrições`; IDs desconhecidos são ignorados).
- `phoneRest`: descanso em andamento no telefone (`RestTimerState` com deadline em wall-clock; `endElapsedRealtime`/`bootCount` são locais ao telefone e vão zerados). O relógio adota convertendo para timer local (`newTimer`) **somente quando não tem timer próprio rodando**; pausa/cancelamento do telefone só tocam adoção intacta, e cancelamento às vésperas do disparo é ignorado para o alarme local disparar sozinho. Timer mexido no relógio nunca é sobrescrito.

Publicação acontece em todo `save()` (debounce 250 ms) e também em `startRest`/`toggleRest`/`hideRest`/`adjustRest`, então marcar série ou iniciar descanso no telefone chega ao relógio na próxima DataItem (durable + poke). O ledger causal continua só com eventos do relógio: concluir a mesma série nos dois aparelhos converge (o evento Wear substitui a entrada do telefone pelo `syncSetId`).

`WorkoutSession` persiste estado, início/fim, cursor atual, IDs concluídos, unilateral pendente e `RestTimerState`.

Eventos:

- `COMPLETED_SET`: cria o primeiro head da série;
- `SET_EDITED`: substitui um `baseEventId` causal;
- `SET_UNDONE`: remove o head causal sem apagar o evento antigo;
- `SESSION_FINISHED`: referencia o mapa final `setId → headEventId`.

Para unilateral, o lado 1 é `COMPLETED_SET(completedSides=1)`: ele recebe ACK e entra no ledger causal, mas ainda não materializa uma série concluída no draft. O lado 2 é `SET_EDITED(baseEventId=lado1, completedSides=2)` e só então cria a série concluída. Isso preserva a troca offline e permite chegada fora de ordem.

## ACK

Um ACK contém o hash de cada evento e um status:

| Status | Significado para o Wear |
|---|---|
| `RECEIVED` | inbox mobile comitada; manter evento |
| `APPLIED` | estado JS persistido; pode sair da fila |
| `ALREADY_APPLIED` | replay idempotente; pode sair da fila |
| `BLOCKED` | falta dependência causal; manter e repetir |
| `CONFLICT_STORED` | conflito preservado; terminal, nunca apagado silenciosamente |
| `REJECTED` | payload inválido; terminal com erro visível |

ACK com envelope/hash divergente não altera a fila Wear.

## Reconciliação

1. Mesmo `eventId` + mesmo hash: sucesso idempotente.
2. Mesmo `eventId` + hash diferente: conflito persistido.
3. Edit/undo sem base: `BLOCKED` até a base chegar.
4. Heads concorrentes: ordem por autoridade (Wear para série feita nele), sequência, horário e ID.
5. Finish sem todos os heads referenciados: bloqueado.
6. Segundo finish da mesma sessão: conflito; não cria outro histórico.
7. Revisão de plano não remove heads já concluídos.
8. Uma revisão inferior da mesma sessão nunca substitui uma revisão superior; sessões diferentes são ordenadas por `generatedAt` e desempate estável.

## Limites

| Item | Limite |
|---|---:|
| Plano/envelope | 64 KiB |
| Evento | 16 KiB |
| Eventos por envelope/ACK | 64 |
| Exercícios | 100 |
| Séries por exercício | 64 |
| Fila local | 4.096 itens ou 8 MiB |
| Carga | 0–500.000 g |
| Reps | 1–200 |
| Parciais | 0–100 |
| RIR | 0–6 |
| Descanso | 0–3.600 s |
| Duração | até 72 h |
| Timestamps e `originSequence` | 1–9.007.199.254.740.991 (inteiro seguro JS) |

`BODYWEIGHT` exige carga zero. NaN, infinito, número fracionário em campo inteiro, string/ID excessivo e versão futura são rejeitados.

## Compatibilidade JS

O adaptador materializa os campos legados `w`, `r`, `p`, `rir`, `done`, `warmup`/`wu`, preserva treino curto, aliases e a data lógica. `wearSync` entra no backup/restore; campos de sincronização são ignorados na assinatura semântica de sessão. O commit final usa uma única gravação estrita de `evolucao_treino_state` antes do callback nativo.
