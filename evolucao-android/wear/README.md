# Evolução para Wear OS

Companion offline de musculação do App Evolução, otimizado para relógios redondos e para o TicWatch E3. Ele recebe a ficha A/B/C do telefone, executa o treino sem conexão e devolve eventos idempotentes quando o Data Layer reconectar.

## O que está implementado

- “Treino de hoje” com data lógica, exercícios, séries, status e sincronização manual.
- Execução com carga em gramas/quilogramas, reps, parciais, RIR, peso corporal, sugestão/anterior e incremento real da ficha.
- Aquecimento, treino curto e unilateral em duas fases; o lado 1 inicia uma troca de 30 segundos e só o lado 2 conclui a série.
- Controles de 52 dp, entrada direta opcional, botões `+`/`−`, rolagem e ajuste por coroa/rotary.
- Descanso automático, `+30 s`, pausa, retomada e pulo; deadlines monotônico e wall-clock persistidos.
- Alarmes hápticos silenciosos em 30 s, 10 s e 0, configuráveis no relógio.
- Ongoing Activity e interface reduzida em ambient mode.
- Resumo com duração, volume, incompletas, correção da última série e finalização offline.
- Room para plano, sessão, ledger, fila, ACKs e conflitos; WorkManager sem requisito de internet.

## Módulos

| Módulo | Responsabilidade |
|---|---|
| `:protocol` | Modelos Kotlin v1, validação estrita, JSON e reducer causal |
| `:app` | Evolução mobile, bridge WebView, Room mobile e listener Data Layer |
| `:wear` | UI Compose Wear, treino offline, timer, Room e transporte |

Mobile e Wear usam `applicationId = com.evolucao.treino` e a mesma chave `_toolchain/debug.keystore`. O namespace Wear é `com.evolucao.treino.wear`.

## Build

No PowerShell, na raiz de `evolucao-android`:

```powershell
.\build-wear.ps1
```

Com testes e lint:

```powershell
.\build-wear.ps1 -WithTests -WithLint
```

Saídas:

- `app\build\outputs\apk\debug\app-debug.apk`
- `wear\build\outputs\apk\debug\wear-debug.apk`

O script cria temporariamente uma unidade `R:`–`Z:` porque o Android test runner no Windows não lida bem com o acento do caminho `Área de Trabalho`. A unidade é removida no bloco `finally` e nenhuma variável de ambiente é alterada permanentemente.

## Uso

1. Instale o APK mobile no telefone e o APK Wear no relógio seguindo [INSTALL_TICWATCH_E3.md](../INSTALL_TICWATCH_E3.md).
2. Confirme que telefone e relógio estão pareados pelo Wear OS/Mobvoi e com Google Play Services ativo.
3. Abra o Evolução no telefone e selecione/inicie a ficha A, B ou C.
4. Abra Evolução no relógio. Se necessário, toque em **Tentar sincronizar**.
5. Inicie o treino, registre as séries e finalize no resumo.
6. Offline, o relógio mostra **Será enviado ao conectar**; não feche nem limpe os dados do app.

## Privacidade

Não há analytics, telemetria, servidor externo nem segredo embarcado. Somente o plano de musculação sanitizado e seus eventos entram no Data Layer. Notas privadas, dados de corrida, Gemini, Health Connect e o backup completo não são enviados ao relógio.

## Compatibilidade

O módulo usa `minSdk 26`, `compileSdk/targetSdk 34`. O instalador verifica a API e recusa dispositivos que não sejam relógio. A versão real do TicWatch deve ser confirmada quando ele estiver conectado; não foi presumida durante o build.
