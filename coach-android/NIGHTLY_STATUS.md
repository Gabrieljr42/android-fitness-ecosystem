# Coach — Night 1 Execution Status (durable memory)

This file is the live execution log of the autonomous Night 1 build.
It is updated after every milestone. Compiler and test output are the only
authoritative evidence; nothing is marked "passed" without an observed
exit code 0.

## Follow-up v0.2.0 — 2026-08-23

- O Coach agora importa, em modo somente leitura, o peso e as corridas
  registrados no Evolução e os totais/metas diários agregados do NutriTrack.
  Ausência de registro continua sendo ausência; indisponibilidade de um app
  preserva o último espelho válido em vez de inventar zero.
- O peso do Evolução tem prioridade sobre o peso do Health Connect, preservando
  a data da pesagem. Passos continuam sem representar uma corrida.
- Corrida mostra somente quantidade, distância e duração observadas no
  Evolução. O acesso direto ao Strava foi desenhado em
  `STRAVA_INTEGRATION.md`, mas não foi incluído no APK porque a troca/renovação
  OAuth exige um `client_secret`, que deve permanecer em backend.
- Combustível mostra refeições, calorias, macronutrientes, água e metas
  publicadas pelo NutriTrack; nomes de alimentos/refeições, fotos, hábitos,
  preferências e chave Gemini não atravessam o provider.
- A navegação inferior usa os insets nativos de system bars/cutout/IME em
  quatro variáveis CSS. Isso mantém os botões acima tanto da navegação por
  três botões quanto da barra de gestos e reserva a mesma altura no conteúdo.
- A tela exibe o estado separado de Evolução e NutriTrack para diferenciar
  “conectado sem registro hoje” de “app indisponível/desatualizado”.

Evidência observada nesta versão:

| Gate | Resultado |
|---|---|
| JUnit/Robolectric Coach | **110 testes**, 17 XMLs, 0 failures, 0 errors, 0 skipped |
| Motor Node Coach | **13 testes**, 0 failures |
| Regressão de insets | `system-insets.test.js: OK` |
| Exportação NutriTrack | `coach_nutrition_export.test.js: OK` |
| Android Lint Coach | `:app:lintDebug` exit 0 |
| Build Coach | `:app:testDebugUnitTest :app:assembleDebug` exit 0 |
| APK Coach | 5.540.106 bytes; SHA-256 `E0B73B5CF870F1A1091C6E16243758831276C2EFA6C40C65C9DB6AED93C5A509` |
| APK Evolução | provider/asset de peso verificados; 3.754.598 bytes; SHA-256 `37A7C81CB991E1DFCCCACE8DEB7CE6AED9AD6DB2437AC23282A63C11412E67DD` |
| APK NutriTrack | provider/exportador principal verificados; 174.826 bytes; SHA-256 `A2F7FE1616A9DB6A8677EDB162AD45788D33FBBE43EB223A08BEB725610F1F10` |

Limites ambientais desta rodada:

- Nenhum telefone/emulador apareceu em `adb devices`; o toque físico nas abas
  e a leitura de dados reais precisam ser confirmados depois da instalação.
- O APK atual do NutriTrack contém a integração principal. Duas melhorias
  posteriores no fonte (republicar após apagar dados e compatibilidade com a
  antiga chave de água) passaram nos testes Node, mas a recompilação foi
  bloqueada pelo limite de aprovação da ferramenta; execute `build.ps1` para
  incorporá-las ao APK antes de testar esses dois casos específicos.

## Session baseline

- Date: 2026-08-22 (overnight session)
- Agent: ox-alpha via OpenCode (Build agent owns all edits)
- Workspace root: `C:\Users\gabri\OneDrive\Área de Trabalho\Android`
- `git status --short` at session start (read-only):
  ```text
  ?? .opencode/
  ?? docs/
  ```
  These untracked entries belong to the user. They will not be staged,
  committed, modified, or removed.

## Tooling discovered (read-only inspection)

- System JDK: Java 20.0.1 (`java -version` observed).
- Portable JDK 17.0.19 exists under `evolucao-android\_toolchain\jdk17\jdk-17.0.19+10`
  (sibling app asset — used read-only if ever needed; not modified).
- Android SDK at `%LOCALAPPDATA%\Android\Sdk`:
  - platforms: android-33, android-34
  - build-tools: 33.0.1, 34.0.0
  - licenses accepted
- Node.js v22.15.1 available for JS engine tests.
- Gradle 8.0 binary distribution cached in `~\.gradle\wrapper\dists`
  (usable to bootstrap wrapper generation offline).
- Network reachability verified:
  - `HEAD https://dl.google.com/dl/android/maven2/...pom` → HTTP 200
  - `HEAD https://repo.maven.apache.org/maven2/junit/junit/4.13.2/junit-4.13.2.pom` → HTTP 200
  → Gradle distribution + dependency downloads are viable this session.

## Approved decisions adopted from COACH_DESIGN.md

Binding constraints honored without reopening:

| Topic | Decision |
|---|---|
| Project | New standalone Gradle project at `coach-android/`, single `app` module |
| UI | Local WebView, HTML/CSS/vanilla JS assets, zero remote content |
| Language | Kotlin native layer; pt-BR copy |
| Storage | Versioned SQLite via `SQLiteOpenHelper` (no ORM) |
| Bridge | Small typed/versioned JSON bridge, allowlist, size caps, structured errors |
| Gemini key | Android Keystore AES-GCM encrypted at rest; settings screen entry |
| minSdk | **26** — chosen because current stable Health Connect client library targets API 26+ as its floor and API 26 covers the intended permission/read flow with runtime feature detection; document per prompt |
| compileSdk/target | **36** na entrega final; edge-to-edge, back dispatcher e manifest foram validados no Android 14 |
| Engine | Deterministic pure JS module in assets, tested with Node harness |
| Absence | Explicit `absent` status; never coerced to zero |
| Writes | Night 1 is review-only; no writes to Evolução/NutriTrack |

## Interruption recovery (resume session)

### What happened

The first run stopped during M0 while generating the Gradle wrapper: OpenCode
requested broad external-directory access (`C:\*`) to satisfy a Gradle
invocation, which was not approved and must not be repeated.

### Evidence at resume start

- `git status --short` (read-only):
  ```text
  ?? .opencode/
  ?? coach-android/
  ?? docs/
  ```
  All untracked entries belong to the user/run history; nothing is staged or modified.
- Present in `coach-android/`: root + app `build.gradle.kts`, `settings.gradle.kts`,
  `gradle.properties`, `local.properties`, `.gitignore`, minimal WebView shell
  (`MainActivity.kt` with placeholder allowlist bridge), placeholder assets,
  stale local `.gradle/` caches from the aborted attempt.
- Absent: Gradle wrapper, verified build/tests/APK, all feature layers.

### Tooling re-verified this session (read-only)

- Portable JDK 17 present: `evolucao-android\_toolchain\jdk17\jdk-17.0.19+10\bin\java.exe`.
- Cached Gradle 8.0 binary distribution found at
  `%USERPROFILE%\.gradle\wrapper\dists\gradle-8.0-bin\...\gradle-8.0\bin\gradle.bat`
  (used read-only to generate the wrapper only).

### Recovery plan (safe, no `C:\*` access)

1. Create isolated bootstrap build under `coach-android\.wrapper-bootstrap\`
   with its own minimal `settings.gradle.kts` / `build.gradle.kts` containing
   only the wrapper task config (no Android plugin).
2. Run cached Gradle 8.0 with project dir = `.wrapper-bootstrap` to emit a
   Gradle 8.7 binary wrapper.
3. Copy only wrapper artifacts into `coach-android/`; verify `distributionUrl`
   is official HTTPS for 8.7.
4. Run `gradlew.bat --version` and `:app:assembleDebug` with JAVA_HOME set to
   the portable JDK 17 (read-only use of sibling toolchain).
5. Remove `.wrapper-bootstrap` after the real wrapper works.

AGP 8.4.2 requires Gradle ≥ 8.6; wrapper targets 8.7 accordingly.

## Milestone log

### M0 — Inspection & skeleton — DONE (verified)

Planned structure (as built):

```text
coach-android/
  gradlew.bat / gradle/wrapper/
  settings.gradle.kts, build.gradle.kts, gradle.properties, local.properties
  app/
    build.gradle.kts
    src/main/java/com/coach/app/MainActivity.kt   (WebView shell + placeholder bridge)
    src/main/assets/www/                          (placeholder UI)
```

### M0.1 — Wrapper recovery — DONE (verified)

Evidence (observed exit codes):

1. `gradle.bat --no-daemon -p .wrapper-bootstrap wrapper` → **exit 0**
   (Gradle 8.0 generated a binary wrapper inside `.wrapper-bootstrap/`; no
   Android plugin loaded, real build scripts untouched).
2. Copied `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`,
   `gradle/wrapper/gradle-wrapper.properties` into `coach-android/`.
3. `.wrapper-bootstrap/` removed after path check confirmed it was inside
   `coach-android/`.

### Build compatibility fixes (documented adaptations)

- Non-ASCII workspace path (`Área de Trabalho`) is rejected by AGP by default.
  Adopted the official remedy `android.overridePathCheck=true`
  (`coach-android/gradle.properties`). Sibling apps ship APKs built from this
  same path family, confirming the override is safe here.
- First `:app:assembleDebug` failed (exit 1): `health-connect 1.1.0` requires
  AGP ≥ 8.9.1 and current androidx stable artifacts require compileSdk 36.
- Verified published versions on Google Maven metadata, then upgraded coherently:
  AGP 8.4.2 → **8.13.2** (latest stable 8.x; supports compileSdk 36),
  compileSdk 34 → **36** (targetSdk ficou 34 nesta etapa intermediária e foi elevado a 36 no hardening final), Gradle wrapper 8.7 → **8.13**
  (minimum for AGP ≥ 8.11). Kotlin 1.9.24 and minSdk 26 unchanged.

### First verified build — DONE

```text
Command : gradlew.bat :app:assembleDebug --console=plain
Exit    : 0            BUILD SUCCESSFUL in 2m 49s (36 tasks)
Warnings: deprecated WebView settings + onBackPressed in placeholder shell
          (will be replaced by real implementation)
APK     : app/build/outputs/apk/debug/app-debug.apk
          size 5,266,889 bytes
          sha256 03DFC1A647FF7FF1BA86967B8734FE7FC7088CAEA24848D5564ED987EEE7B9C4
```

M0 gate met: reproducible build + launchable shell exists. The shell's bridge/UI
are still placeholders; replaced from later milestones onward.

Next action: M1 canonical immutable domain model with explicit missing-data semantics.

## Resume session 2 (M1 completion)

Environment rules honored this session: portable JDK 17 only
(`evolucao-android\_toolchain\jdk17\jdk-17.0.19+10`, read-only), no JDK 20,
no manual JUnitCore runner, no PowerShell output pipelines around Gradle
(output redirected via `cmd /c` into `build\testDebugUnitTest.log`).

### M1 — Canonical immutable domain model — DONE (verified)

Starting evidence from previous run: 26 tests executed, 3 failures.

Three fixes applied:

1. `CanonicalJson.appendNumber` — numbers now go through
   `BigDecimal(d.toString()).stripTrailingZeros()` with an explicit
   zero-normalization guard, so integral doubles serialize without a redundant
   decimal (`0.0` → `0`) while large magnitudes keep plain notation
   (`1e21` → `1000000000000000000000`). Verified cases: `1e21`, `0.001`,
   `-2.5`, `0.0`, `42L`, plus nested determinism and non-finite rejection.
2. `CanonicalJsonTest.escapesStringsPredictably` — the test input contained a
   literal invisible U+0001 byte (confirmed by hex dump of line 20:
   `5C 74 01 78`) that the expected raw string lacked; the dedicated
   `controlCharsAreUnicodeEscaped` test already asserts `\u0001`. Removed the
   stray byte from the general quotes/newline/tab test; escaping behavior was
   correct and unchanged. Post-write scan: no stray control bytes in the file.
3. `MetricValue` factories (`observed`, `informed`, `estimated`) silently
   clamped confidence with `coerceIn(0.0, 1.0)` before the constructor could
   validate it, violating the strict canonical contract. Clamping removed;
   invalid confidence now fails explicitly. Added boundary tests for
   0.0/1.0 accepted, below-zero/above-one rejected on every factory, and
   NaN/±Infinity rejected.

Verification (real Gradle task, observed):

```text
Command : gradlew.bat :app:testDebugUnitTest --rerun-tasks --no-daemon --no-watch-fs --console=plain
          (JAVA_HOME = portable JDK 17; output redirected to build\testDebugUnitTest.log)
Exit    : 0            BUILD SUCCESSFUL in 26s (30 actionable tasks)
Results : TOTAL tests=30 failures=0 errors=0 skipped=0
          CanonicalJsonTest=7, CheckInTest=3, DailySnapshotTest=6,
          LogicalDayTest=4, MetricValueTest=10
```

Next action: M2 versioned SQLite persistence (source_record, sync_cursor,
daily_snapshot, check_in, plan_run, proposal, gemini_opinion, decision).

## Fechamento integral — 2026-08-23

As linhas anteriores permanecem como histórico das retomadas do ox-alpha. A partir daqui está o estado autoritativo da entrega final concluída pelo Codex. Nenhum marco abaixo foi marcado como pronto sem execução observada.

### M2 — SQLite versionado — DONE

- Schema v1 com oito tabelas e chaves estrangeiras habilitadas.
- Upserts idempotentes para fontes/check-in/cursor; snapshots e execuções de plano imutáveis por hash.
- Reprocessar o mesmo snapshot preserva proposta e decisão existentes.
- A primeira decisão altera proposta + insere recibo na mesma transação; tentativas seguintes falham fechadas.
- Exclusão percorre dependências em ordem segura e executa `VACUUM` após apagar os registros.

### M3 — Health Connect real — DONE

- Disponibilidade, onboarding oficial, permissões e ajustes nativos.
- Leitura somente de `Sleep`, `Steps`, `Resting heart rate` e `Weight`; nenhuma permissão de escrita.
- Aggregate API para sono/passos com prioridade de origem do Health Connect, evitando duplicidade entre telefone, relógio e Sleep Cycle.
- Janelas de sono não sobrepostas (18:00–18:00), paginação de FC/peso, change token, recuperação de token expirado e token reservado antes do resync.
- Permissões parciais leem apenas os tipos concedidos, preservam métricas negadas, não avançam cursor parcial e mostram **Acesso parcial / Completar acesso**.
- Cancelamento de coroutine é propagado; exceções do provider viram estado seguro e não crash.

### M4 — Check-in de 30 segundos — DONE

- Escalas 1–5, nove regiões de dor muscular, dor articular e nota limitada a 280 caracteres.
- Payload tipado e validado no Kotlin; campos desconhecidos, coerção numérica, controles inseguros e limites inválidos são rejeitados.
- Formulário inteiro é reidratado depois do save/refresh, inclusive sinais de segurança.
- Troca de aba move foco para o painel ativo e alvos interativos têm no mínimo 48 px.

### M5 — Motor determinístico e briefing — DONE

- `engine.js` puro, sem relógio, rede, DOM, aleatoriedade ou mutação do input.
- Ausência permanece `null`/`ABSENT`; passos não viram corrida e nutrição permanece insuficiente.
- Dor articular ou dor muscular forte bloqueia progressão agressiva.
- Sem baseline pessoal, prontidão não declara confiança alta; dor muscular continua categórica, sem falsa precisão “100/100”.
- O texto é condicional quando nenhuma sessão foi importada: não inventa que existe treino hoje.
- Decisões aceitas/rejeitadas reaparecem após refresh e ficam desabilitadas para nova decisão.

### M6 — Gemini Structured Output — DONE

- Modelo configurado `gemini-3.7-flash`; request usa `responseMimeType` + `responseJsonSchema`, sem tools/function calling e sem parâmetros de amostragem incompatíveis.
- Payload reconstruído do SQLite pelo nativo; chave, nota livre, timestamps brutos e banco bruto não são enviados.
- Preview obrigatório emite token aleatório de uso único, validade de dois minutos e binding a snapshot/plano/modelo/hash; `AlertDialog` nativo confirma o envio.
- Validador local exige schema exato, evidência existente, operações/payloads tipados, coerência do veredito, limites e bloqueio de linguagem médica prescritiva.
- Resposta obsoleta ou hostil é descartada; opinião nunca altera proposta/plano e detalhes são exibidos como observações, pontos de atenção, ajuste acionável e perguntas.
- Credencial cifrada com AES-GCM e chave não exportável no Android Keystore.

### M7 — Notificação, privacidade e hardening — DONE

- Lembrete diário inexacto perto de 05:40, reagendado após boot/update/hora/fuso e desativado se a permissão for revogada.
- WebView local-only: CSP, origem exata, 403 fora da allowlist, 404 para asset inexistente, sem arquivo/provider/mixed content/download/janelas remotas.
- Bridge v1 com schema/tipos estritos, allowlist, limite UTF-8 de 32 KiB, IDs correlacionados, replay/emissão concorrente limitados e erros estruturados.
- Confirmação nativa para exclusão; DB, preferências, chave e alarme são removidos e o Health autosync fica pausado até reconexão explícita.
- Backup e device transfer desativados; nenhum analytics ou segredo em assets/SQLite/logs.
- `README.md`, `ARCHITECTURE.md` e `AGENTS.md` refletem o contrato final.

## Evidência final observada

| Gate | Resultado |
|---|---|
| JUnit/Robolectric | **104 testes**, 16 arquivos XML, 0 failures, 0 errors, 0 skipped |
| Motor Node | **11 testes**, 0 failures |
| UI smoke assets reais | **8 screenshots**, larguras 360/412/480, sem overflow, sem alvo <48 px, sem exceção JS |
| Android Lint | **0 errors**; 24 avisos consultivos (13 `UseKtx`, 6 versões de dependência, 4 versões disponíveis, 1 versão do AGP) |
| Build | `:app:assembleDebug` exit 0 |
| APK | 5.470.066 bytes; SHA-256 `9A44154BE03F8CF6E9FFE449F0EC1E320026F5A65CFD801D6BF9A09A1EE97D1F` |

Comandos finais relevantes:

```text
gradlew.bat :app:testDebugUnitTest :app:assembleDebug --rerun-tasks --no-daemon --no-watch-fs --console=plain
BUILD SUCCESSFUL in 1m 20s — 45 actionable tasks

node app/src/test/js/engine.test.js
11 tests, 0 failures

node app/src/test/js/ui-smoke.js
ok=true, screenshots=8

gradlew.bat :app:lintDebug :app:assembleDebug --no-daemon --no-watch-fs --console=plain
BUILD SUCCESSFUL in 46s
```

### Verificação Android real do sistema

AVD `Pixel_3a_API_34_extension_level_7_x86_64`, Android 14:

- APK final instalado e Activity aberta sem `FATAL EXCEPTION`.
- UI WebView de produção verificada por `uiautomator`: briefing, check-in e ajustes; foco do check-in confirmado.
- Onboarding e `PermissionsActivity` oficiais do Health Connect abriram fora do app.
- Concessão somente de passos resultou em `Acesso parcial`; a segunda solicitação mostrou exclusivamente FC de repouso, sono e peso.
- Chave fictícia salva no Keystore; preview exibido sem a chave; confirmação nativa Gemini validada e cancelada antes da rede.
- Confirmação nativa de exclusão validada e cancelada.
- Dados fictícios foram removidos com `pm clear com.coach.app`; o AVD foi desligado ao final.

Capturas/dumps ficam em `artifacts/ui/`. O screenshot do AVD headless pode sair preto por limitação do renderer SwiftShader; a hierarquia completa do WebView e os diálogos nativos foram confirmados nos XMLs.

## Artefato de entrega

```text
coach-android/app/build/outputs/apk/debug/app-debug.apk
package      com.coach.app
version      0.1.0 (1)
minSdk       26
targetSdk    36
compileSdk   36
debuggable   true
```

O único limite de validação restante é ambiental: usar dados reais do telefone/TicWatch/Sleep Cycle e observar bateria/notificação em hardware físico. Isso não bloqueia a entrega da v0.1.0; não há fonte de corrida ou nutrição nesta fase e o app declara essas lacunas explicitamente.
