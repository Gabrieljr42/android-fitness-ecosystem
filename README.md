# Android Fitness Ecosystem: Evolução, NutriTrack, Coach

Three local-first Android WebView apps for strength training, nutrition, and daily coaching. No backend. Data stays on device except for direct Google Gemini calls made with the user's own API key.

| App | Package | Folder | What it does |
| --- | --- | --- | --- |
| **Evolução** | `com.evolucao.treino` | `evolucao-android/` | Strength/cardio logging, RIR double-progression engine, rest timer, Strava import, Wear OS companion, BLE scale support |
| **NutriTrack** | `com.nutricao.app` | `nutricao-android/` | Meal logging, Gemini photo/text/audio food analysis, TDEE calculator, Brazilian food database, reminders |
| **Coach** | `com.coach.app` | `coach-android/` | Read-only hub: Health Connect + Evolução + NutriTrack + check-in → deterministic readiness briefing, optional Gemini second opinion |

## Project at a glance

- **Stack:** Java/Kotlin native shell + vanilla JS/CSS in `assets/` + WebView bridge. Evolução and Coach use Gradle; NutriTrack uses a manual `aapt2`/`javac`/`d8` script. Coach adds Room-less `SQLiteOpenHelper`, Health Connect `connect-client 1.1.0`, coroutines, Keystore.
- **Storage:** Evolução and NutriTrack use `localStorage` (+ `SharedPreferences` mirrors for cross-app providers). Coach uses private SQLite (`coach.db`, schema v1, 8 tables). No server database.
- **Cross-app contracts:** read-only `ContentProvider`s. Evolução → NutriTrack/Coach; NutriTrack → Coach. All payloads are versioned (`schemaVersion: 1`), size-capped, and caller-package-checked.
- **AI:** NutriTrack calls Gemini directly from JS (`gemini-3.7/3.6/3.5-flash`, triple-sample "precise" mode). Coach calls Gemini from Kotlin over HTTPS with Structured Output and a mandatory preview + native confirm. No function calling.
- **Tests:** Node suites per app + Kotlin unit tests for Coach/Evolução. Root runner: `test.ps1`. Verified passing on 2026-09-05: 41 Evolução files, 31 NutriTrack files, 15 Coach engine tests, insets test OK (see [docs/development.md](docs/development.md)).

## Quick start

Prerequisites:

- Windows 10/11 PowerShell, Node.js 18+ (`node --version`), internet on first build (~1 GB JDK + SDK download).
- No preinstalled JDK, Android SDK, or Android Studio required for Evolução/NutriTrack (portable `_toolchain/`). Coach reuses Evolução's portable JDK and needs the SDK in `%LOCALAPPDATA%\Android\Sdk` for `adb install` only.

```powershell
# 1. Evolução first (provides the shared _toolchain/ JDK+SDK)
cd evolucao-android
powershell -ExecutionPolicy Bypass -File build.ps1
# -> evolucao-android/Evolucao.apk

# 2. NutriTrack (reuses ../evolucao-android/_toolchain when side by side)
cd ..\nutricao-android
powershell -ExecutionPolicy Bypass -File build.ps1
# -> nutricao-android/NutriTrack.apk

# 3. Coach (Gradle, JDK 17 required)
cd ..\coach-android
$env:JAVA_HOME = (Resolve-Path '..\evolucao-android\_toolchain\jdk17\jdk-17.0.19+10').Path
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat :app:assembleDebug --no-daemon --no-watch-fs --console=plain
# -> coach-android/app/build/outputs/apk/debug/app-debug.apk
```

Run all JS tests:

```powershell
# From the repo root:
powershell -ExecutionPolicy Bypass -File test.ps1
# Or per app:
node evolucao-android/app/src/test/js/run_all.js
node nutricao-android/app/src/test/js/run_all.js
node coach-android/app/src/test/js/engine.test.js
node coach-android/app/src/test/js/system-insets.test.js
```

Install order on a phone (debug builds, allow "unknown apps" / USB debugging):

1. `Evolucao.apk`, open once.
2. `NutriTrack.apk`, open once.
3. Coach `app-debug.apk`, then tap **Sincronizar tudo**.

Confirm it works: log a workout in Evolução, photograph a meal in NutriTrack (needs a Gemini key in **Ajustes**), then Coach → sync → check-in → briefing. Without keys/network/Health Connect the local flows still work; AI and Health slots show explicit absent states.

Get a free Gemini key at `https://aistudio.google.com/app/apikey` and paste it in NutriTrack **Ajustes** (stored in `localStorage`) or Coach **Ajustes** (encrypted in Keystore). Never commit keys.

## Docs

- [docs/architecture.md](docs/architecture.md) — modules, entry points, request/data flow, diagrams.
- [docs/database.md](docs/database.md) — LocalStorage keys, Coach SQLite schema, providers, backup/merge/reset.
- [docs/flows.md](docs/flows.md) — bridges, providers, Gemini flows, notifications/alarms, worked examples.
- [docs/configuration.md](docs/configuration.md) — permissions, no-`.env` policy, Gemini setup, toolchain paths.
- [docs/development.md](docs/development.md) — builds, tests, lint, conventions, how to add a view/field/test.
- [docs/deployment-troubleshooting.md](docs/deployment-troubleshooting.md) — outputs, install, known failures.
- [docs/onboarding.md](docs/onboarding.md) — first-run checklist, reading order, first change.

App-level docs worth keeping: [Evolução](evolucao-android/README.md), [NutriTrack](nutricao-android/README.md), [Coach](coach-android/README.md), [Coach architecture](coach-android/ARCHITECTURE.md), [Wear docs](evolucao-android/wear/README.md).

## Verification status

- Tested 2026-09-05: all Node suites pass (see above). Gradle `testDebugUnitTest` also runs in CI (`gradle-unit` job, JDK 17). Not run here: `assembleDebug` / `lintDebug` and on-device install (heavy, need emulator/SDK). Those steps are documented from `coach-android/README.md`, `coach-android/AGENTS.md`, and the build scripts, marked accordingly in the docs.
- CI exists (`.github/workflows/ci.yml`: JS suites on Node 20/22 + Gradle unit tests on `windows-latest` for push/PR; `ui-smoke.js` stays manual and non-blocking). No backend, no `.env` loader found in the repo — documented as-is, not assumed.
