# Development workflow

## Commands

All paths are relative to the repo root unless noted. PowerShell on Windows is assumed (scripts use `powershell -ExecutionPolicy Bypass -File …`).

| Task | Command | Notes |
| --- | --- | --- |
| All JS tests | `powershell -ExecutionPolicy Bypass -File test.ps1` | Runs Evolução (41 files) → NutriTrack (31) → Coach engine + insets. Exit non-zero on any failure. |
| Evolução JS tests | `node evolucao-android/app/src/test/js/run_all.js` | Single file e.g. `node evolucao-android/app/src/test/js/progressao.test.js`. |
| NutriTrack JS tests | `node nutricao-android/app/src/test/js/run_all.js` | Single file e.g. `node nutricao-android/app/src/test/js/gemini_photo_error.test.js`. |
| Coach engine + insets | `node coach-android/app/src/test/js/engine.test.js` and `node coach-android/app/src/test/js/system-insets.test.js` | 15 engine assertions; insets prints `OK`. |
| Coach visual smoke (optional) | `node coach-android/app/src/test/js/ui-smoke.js` | Headless Chrome/Edge + mock bridge; writes 8 screenshots to `coach-android/artifacts/ui/`. Needs a Chromium browser. |
| Build Evolução | `cd evolucao-android; powershell -ExecutionPolicy Bypass -File build.ps1` | Delegates to `build-wear.ps1 -MobileOnly -WithTests`; output `Evolucao.apk` (copy of `app/build/outputs/apk/debug/app-debug.apk`). |
| Build Evolução + Wear + lint | `cd evolucao-android; .\build-wear.ps1 -WithTests -WithLint` | Two signed APKs, same keystore. Wear-only/mobile-only flags exist — see `build-wear.ps1 -?`. |
| Build NutriTrack | `cd nutricao-android; powershell -ExecutionPolicy Bypass -File build.ps1` | Manual toolchain; output `NutriTrack.apk`. Fails fast if its JS suite fails. |
| Build Coach | `cd coach-android; $env:JAVA_HOME=(Resolve-Path '..\evolucao-android\_toolchain\jdk17\jdk-17.0.19+10').Path; $env:Path="$env:JAVA_HOME\bin;$env:Path"; .\gradlew.bat :app:testDebugUnitTest --no-daemon --no-watch-fs --console=plain; .\gradlew.bat :app:assembleDebug --no-daemon --no-watch-fs --console=plain` | JDK 17 only (not system JDK 20). Output `app/build/outputs/apk/debug/app-debug.apk`. Run Gradle directly — do not pipe through `Select-Object`/`Tee-Object`/background jobs (hangs the wrapper per `AGENTS.md`). |
| Coach lint | `.\gradlew.bat :app:lintDebug --no-daemon --no-watch-fs --console=plain` | Run before distributing. |
| Install to phone | `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r <apk>` | Evolução → NutriTrack → Coach order; open the first two once before Coach sync. |

No formatter, linter (JS), type-checker, or CI workflow was found in the repo — match the surrounding file style by hand.

## Conventions and patterns

- **Vanilla JS, no bundler.** Load order = `<script>` order in `index.html`. Evolução's canonical order ends with `views/*` then `kernel/app.js`; NutriTrack ends with `views/*` then `render()`. `db.js`/`estado.js` must load before views; `exercicios/nomes.js` before `kernel/db.js` (canonical `exerciseIdFor`).
- **IDs are contracts.** Exercise `ex_…` IDs and `LocalAppSync.stableId` values are opaque identity — never recompute a persisted ID, only legacy/deviant formats.
- **Additive migrations.** `migrate()` (JS) and `Schema.MIGRATIONS` (Kotlin) only add/fill; never rename in place. Coach `onCreate` replays all steps from 0.
- **Absent ≠ zero.** Coach/Evolução/NutriTrack all preserve "no data" distinctly from 0 (slots, drafts, fuel cards). Do not default missing numbers to 0.
- **Deterministic engines.** `progressao.js` and `engine.js` are pure (no clock/net/DOM/storage) and fully unit-tested — keep them that way.
- **Narrow bridges.** New WebView ops need an allowlist entry + version + byte cap + native revalidation (`BridgeProtocol` / `AndroidBridge`). Secrets never cross.
- **Portuguese UI, English code.** User strings are pt-BR; keep identifiers/comments in the file's existing language.

## Common changes

**Add a JS view (Evolução example):**

1. Create `evolucao-android/app/src/main/assets/apps/evolucao/views/minha.js` exposing `renderMinha()`/`bindMinha()` like `views/treino.js`.
2. Append `<script src="apps/evolucao/views/minha.js"></script>` before `kernel/app.js` in `app/src/main/assets/index.html`.
3. Wire the tab in `kernel/app.js` navigation.
4. Add `app/src/test/js/minha.test.js` (load the file with `vm`/`eval` like `treino_fixes.test.js`) and register it in `run_all.js`.
5. `node app/src/test/js/run_all.js`.

**Add a nutrition field end-to-end:** extend `estado.js` shape + `logic.js` aggregation → mirror it in `syncNutritionSummary` → if Coach needs it, extend `NutritionProvider.buildPayload` **and** `LocalPayloadParser.parseNutriTrack` **and** `MetricKeys` + `Schema` consumers together (contract v1 bump discussion with maintainer).

**Add a Coach bridge op:** add to `BridgeProtocol.allowedOperations` + parser in `bridge/PayloadParsers.kt` + handler in `MainActivity.kt` + `main.js` caller + JUnit boundary test + `engine`/`ui-smoke` if UI-visible.

**Add a progression rule:** edit `core/progressao.js` + cases in `progressao.test.js` (cover RIR path, legacy path, short session, warm-up exclusion) — the build blocks on failure.

## Testing strategy and gaps

- **Strengths:** large Node suites (72 files total) with tiered coverage (unit → boundary → cross-feature → real-world scenarios in `TEST_INFRA.md`); adversarial/stress files (`challenger_*`, `adversarial_*`); Robolectric/JUnit for Coach (`:app:testDebugUnitTest`) and Evolução Room/protocol tests.
- **Gaps:** no JS linter/formatter; no CI; Coach `ui-smoke.js` needs a local Chromium and is not in `test.ps1`; on-device provider/insets/Health paths are only manually verified (Coach README notes AVD-14 validation, physical-device recheck pending); Wear sync needs two devices/emulators (`diagnose-wear-sync.ps1`).
- **Rule:** every behavior or boundary-abuse fix ships with a test; builds run the suites first (`build.ps1` aborts on JS failure, `build-wear.ps1 -WithTests`, Gradle `testDebugUnitTest` before `assembleDebug`).

## Contributions

No `CONTRIBUTING.md` or PR template was found. Follow the in-repo gates: keep changes inside one app unless the task explicitly changes a cross-app contract (`coach-android/AGENTS.md` restricts Coach work to `coach-android/`); never `git reset --hard` / broad cleanups; run the affected suites + the relevant build; update the app README and `ARCHITECTURE.md`/status docs when a contract or limit changes; record APK size + SHA-256 for distributed builds.
