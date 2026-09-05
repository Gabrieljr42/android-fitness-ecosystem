# New developer onboarding

## First-run checklist

- [ ] Clone to a short ASCII path if possible (e.g. `C:\dev\Android`) — the repo works under `Área de Trabalho` via `overridePathCheck`, but a short path avoids edge cases.
- [ ] Install Node.js 18+ and verify `node --version`.
- [ ] Run the fast, safe verification: `node evolucao-android/app/src/test/js/run_all.js`, `node nutricao-android/app/src/test/js/run_all.js`, `node coach-android/app/src/test/js/engine.test.js`, `node coach-android/app/src/test/js/system-insets.test.js` (or `test.ps1` for all). All green is your baseline.
- [ ] Build Evolução: `cd evolucao-android; powershell -ExecutionPolicy Bypass -File build.ps1` → expect `Evolucao.apk` (first run downloads ~1 GB into `_toolchain/`).
- [ ] Build NutriTrack: `cd ../nutricao-android; powershell -ExecutionPolicy Bypass -File build.ps1` → expect `NutriTrack.apk`.
- [ ] Build Coach: set `JAVA_HOME` to `../evolucao-android/_toolchain/jdk17/<version>`, run `:app:testDebugUnitTest` then `:app:assembleDebug` → expect `app/build/outputs/apk/debug/app-debug.apk`.
- [ ] Sideload in order (Evolução → NutriTrack → Coach), open the first two once, then Coach **Sincronizar tudo** + check-in → briefing.
- [ ] Optional: add a personal Gemini key in NutriTrack/Coach **Ajustes** and try one fast photo analysis.

## Reading order (≈45 min)

1. This repo's [README](../README.md) + [architecture](architecture.md) (the two diagrams).
2. [database](database.md) — LocalStorage keys, Coach tables, provider URIs.
3. [flows](flows.md) — the bridge table for the app you will touch first.
4. The app README you will touch: [Evolução](../evolucao-android/README.md), [NutriTrack](../nutricao-android/README.md), or [Coach](../coach-android/README.md) + [ARCHITECTURE](../coach-android/ARCHITECTURE.md).
5. [configuration](configuration.md) + [development](development.md) before changing anything.
6. Specialists only: `evolucao-android/PROGRESSAO.md`, `SYNC_PROTOCOL.md`, `coach-android/STRAVA_INTEGRATION.md`, `docs/coach/COACH_DESIGN.md`.

## Where to look for common tasks

| Task | Start here |
| --- | --- |
| Change workout UI/keypad | `evolucao-android/app/src/main/assets/apps/evolucao/views/treino.js`, `kernel/db.js` draft logic |
| Change progression math | `…/core/progressao.js` + `app/src/test/js/progressao.test.js` |
| Change rest timer behavior | `MainActivity.java` (`startRestNotification…`), `RestAlarmReceiver.java`, `views/treino.js` |
| Change food analysis prompt/schema | `nutricao-android/…/core/gemini.js` (`FOOD_*_PROMPT`, `FOOD_SCHEMA`) |
| Change daily totals/TDEE | `nutricao-android/…/apps/nutricao/logic.js`, `views/metas.js`, `referencia.js` |
| Change Coach briefing rules | `coach-android/…/www/js/engine.js` + `engine.test.js` (pure — start here, not Kotlin) |
| Change Coach sync/validation | `integrations/LocalAppSync.kt`, `data/SnapshotStore.kt`, `domain/*` |
| Change Coach bridge/security | `bridge/BridgeProtocol.kt`, `MainActivity.kt`, `security/*` |
| Add a test | Nearest `*.test.js` + its `run_all.js`; Kotlin: `src/test/java` via Gradle task |

## First-change walkthrough (safe, ~15 min)

Add a boundary assertion to the RIR engine without touching the app:

1. Open `evolucao-android/app/src/main/assets/core/progressao.js` and find `rirMeta`.
2. Open `evolucao-android/app/src/test/js/progressao.test.js` and find the 17.5 kg × 7 case (must stay `manter @ 17.5 kg × 8`, never drop to `15 kg × 14`).
3. Add one assertion: same input with `rir: 0` at the top of range still increases load by exactly the equipment increment.
4. Run `node app/src/test/js/progressao.test.js`, then the full `run_all.js`. Both must pass.
5. Revert or keep as a scratch commit — you have now touched the engine, its test harness, and the build gate.

## Pitfalls and known limitations

- **Two copies of the JS exist.** Edit `evolucao-android/app/src/main/assets/…`, not root `kernel/` or `apps/evolucao/` mirrors — each mirror has a `README.md` route file pointing at the canonical path (Phase 1: drift proven, e.g. root `kernel/db.js` 193 lines vs canonical 283).
- **Script order matters.** A missing `<script>` in `index.html` breaks views silently — check the order table in [architecture](architecture.md).
- **Decimal comma.** The Evolução keypad accepts `12,5` and stores `12.5` — parse accordingly in any new numeric input.
- **No network in engines.** `progressao.js`/`engine.js` must stay pure; do I/O in views/Kotlin.
- **Providers need the source app opened once** after every update, or Coach/NutriTrack see stale/empty data by design.
- **Debug signing only.** All APKs are locally signed dev builds, not Play releases; rotation = reinstall.
- **Physical-device gaps.** Providers, insets on real gesture nav, Health Connect data, BLE scale, and Wear drain are documented from code + AVD-14 evidence; confirm on hardware before calling them done (see [deployment](deployment-troubleshooting.md)).

## Unresolved questions for a maintainer

1. Canonical Gemini model set: centralized in Phase 2 (`gemini-models.js` + `SupportedModels.kt`) — live-verify IDs/quota with a maintainer key before changing prompts.
2. ~~NutriTrack `targetSdk 33` vs. Evolução/Coach `34/36`~~ Resolved Phase 3: NutriTrack + Evolução at 34, Coach at 36. Remaining: joint bump to 35/36 + AGP 8.4.2→8.13.x (see `docs/configuration.md`).
3. Long-term plan for root `kernel/` + `apps/evolucao/` mirrors (archive, symlink, or codegen?).
4. Release signing/Play strategy and whether `allowBackup=false` should extend beyond Coach.
5. Owner for re-validating Coach providers + insets on physical devices with personal data.
