# Configuration and integrations

## Environment variables: none by dotenv

No `.env` file, dotenv loader, or `BuildConfig` secret was found in the repo. Configuration is:

- **Evolução/NutriTrack:** `localStorage` keys + `SharedPreferences` mirrors + Android manifest permissions. No env vars.
- **Coach:** `gradle.properties` build flags, `local.properties:sdk.dir` (local SDK path, machine-specific, do not commit changes), `SharedPreferences` + Keystore at runtime. No env vars.
- **No `.env.example` is shipped** — creating one would invent config that the code does not read. If you need a personal checklist, keep API keys in the apps' **Ajustes** screens, never in files.

Use `YOUR_GEMINI_KEY_HERE`-style placeholders in any notes. Real keys must never enter git, logs, screenshots, or docs.

## Required external services

| Service | Needed for | Setup | Cost/quota note (from `LEIAME.txt`) |
| --- | --- | --- | --- |
| Google Gemini API | NutriTrack photo/text/audio analysis; Coach optional review | Free key at `https://aistudio.google.com/app/apikey` → NutriTrack **Ajustes → API do Gemini → Salvar**; Coach **Ajustes → save key** (Keystore-encrypted) | Free tier ~15 req/min, 50 req/day; one precise photo = 3 requests |
| Strava API | Evolução run import | In-app connect/import (`strava.js`); Coach deliberately has no direct Strava path — see `coach-android/STRAVA_INTEGRATION.md` for why `client_secret` must stay in a future backend. Scope policy (per that doc): request `activity:read` only; elevate to `activity:read_all` solely if "Somente você" activities are truly needed | User token flow; estimate calories locally if Strava omits them |
| Health Connect | Coach sleep/steps/resting-HR/weight | Install Health Connect (built in on Android 14+), **Conectar** in Coach, grant a subset — partial access is supported | Read-only; no write scope is ever requested |
| Google Play Services Wearable | Evolução Wear sync | Phone + watch signed with same keystore, Data Layer available | On-device only |

Everything else works offline: training logs, TDEE math, progression, merge/restore, Coach deterministic briefing.

## Android permissions (manifest truth) — Phase 3 aligned

- **Evolução** (`minSdk 24`, `target/compile 34`, AGP 8.4.2 deferred): `VIBRATE`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` + `USE_EXACT_ALARM` (exact rest alarm), BLE (`BLUETOOTH/ADMIN` ≤30 with location; `BLUETOOTH_SCAN[neverForLocation]` + `CONNECT` on 31+), custom `READ_WORKOUTS` (normal). Wear service intents for `/evolucao/v1/envelopes/` + `/evolucao/v1/poke`. Wear module (`minSdk 26`, `target/compile 34`): `VIBRATE`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` (no `USE_EXACT_ALARM`), `RECEIVE_BOOT_COMPLETED` + `WAKE_LOCK`, `allowBackup=true`.
- **NutriTrack** (`minSdk 24`, `target/compile 34` — Phase 3: manifest `targetSdkVersion 33→34` to match `build.ps1` `platform android-34` / `build-tools 34.0.0` + `app/build.gradle.kts`): `INTERNET`, `CAMERA`, `RECORD_AUDIO` (voice notes), `POST_NOTIFICATIONS`, `VIBRATE`, exact-alarms (`SCHEDULE_EXACT_ALARM` + `USE_EXACT_ALARM`) + `WAKE_LOCK` + `RECEIVE_BOOT_COMPLETED` (reminders), `READ_WORKOUTS` (Evolução client), own `TRIGGER_REMINDERS` (signature) + `READ_NUTRITION` (normal). `<queries>` lists the Evolução provider + `IMAGE_CAPTURE` (Android 11+ visibility).
- **Coach** (`minSdk 26`, `target/compile 36`, AGP 8.13.2): `INTERNET`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, Health reads (`READ_SLEEP/STEPS/RESTING_HEART_RATE/WEIGHT`), `READ_WORKOUTS` + `READ_NUTRITION`. Deliberately no exact-alarm permission (inexact 05:40 briefing). `allowBackup=false`, `usesCleartextTraffic=false`, backup/data-extraction rules under `res/xml/`.

### SDK / AGP alignment (Phase 3 truth)

| App / module | compileSdk | targetSdk | minSdk | AGP | Gradle wrapper | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `evolucao-android:app` | 34 | 34 | 24 | 8.4.2 (deferred → 8.13.x) | 8.7 | `app/build.gradle.kts:9` (compileSdk) / `:14` (targetSdk); AGP at root `build.gradle.kts:16`; see deferred-bump plan below |
| `evolucao-android:wear` | 34 | 34 | 26 | 8.4.2 (same root) | 8.7 | `SCHEDULE_EXACT_ALARM` only, no `USE_EXACT_ALARM` |
| `evolucao-android:protocol` | 34 | n/a (library) | 24 | 8.4.2 (same root) | 8.7 | No targetSdk (library) |
| `nutricao-android` manual (`build.ps1`) | `android-34` / `build-tools 34.0.0` | 34 (manifest; `aapt2 link --target-sdk-version 29` still hardcoded — manifest wins, reconcile at Gradle cutover) | 24 | n/a (manual `aapt2`/`d8`/`apksigner`) | n/a | Phase 3 bumped manifest `33→34`; do not touch signing |
| `nutricao-android` Gradle scaffold (`app/build.gradle.kts`) | 34 | 34 | 24 | 8.4.2 (deferred → 8.13.x, lockstep) | 8.7 (exact copy of Evolução's `gradle-8.7-bin.zip`; no `gradlew`/`jar` yet) | Scaffold only, not wired to CI |
| `coach-android:app` | 36 | 36 | 26 | 8.13.2 | 8.13 | Reference target; requires AGP ≥ 8.9.1 for `health.connect:connect-client:1.1.0` |

### `allowBackup` rationale

Evolução (`allowBackup=true`) and NutriTrack (`allowBackup=true`) keep auto-backup on because their stores are plain `localStorage`/`SharedPreferences` training and nutrition logs the user expects to survive reinstalls, with no Keystore-bound secrets (NutriTrack Gemini key is a user-managed plain pref, Coach doc warns to scrub exports). Coach sets `allowBackup=false` (+ `dataExtractionRules`/`fullBackupContent` under `res/xml/`) because it holds an AES-GCM Keystore-encrypted Gemini credential (`coach_secure_credentials`) and a health-derived SQLite store subject to Data Safety / deletion-path promises — auto-backup would copy sensitive material off-device and contradict `privacy.deleteLocalData`. TODO (maintainer): if Evolução/NutriTrack ever store tokens or health data under backup, re-evaluate to `false` + exclusion rules; see `docs/onboarding.md` Q4 and `docs/play-release.md` §6.

### Deferred-bump plan (do NOT bump yet)

- **Evolução AGP 8.4.2 → 8.13.x:** deferred pending verification of `room-runtime/compiler/testing 2.6.1` + `work-runtime(-ktx) 2.9.1` + `play-services-wearable 18.2.0` + Compose BOM `2024.06.00` / `kotlinCompilerExtension 1.5.14` against AGP 8.13.x (Gradle 8.13, JDK 17, namespace/`BuildConfig` behavior). Steps: bump in a branch, run `:app:testDebugUnitTest` + `:wear` tests + `assembleDebug`, check Room schema diff + Wear install on hardware, then align `nutricao-android` scaffold in lockstep.
- **compileSdk/targetSdk 34 → 35/36 (Evolução/NutriTrack):** deferred pending 16 KB page-size check, edge-to-edge + `POST_NOTIFICATIONS`/exact-alarm retest on Android 15/16, and Play targetSdk-floor confirmation. Coach (36) is the reference; do not downgrade Coach to match.
- **Non-goals this phase:** no Gradle `assemble`/`test` runs, no SDK downloads, no signing changes, no `allowBackup` flag changes.

## Gradle/toolchain settings (checked in)

| File | Notable values |
| --- | --- |
| `coach-android/gradle.properties` | `android.overridePathCheck=true` (non-ASCII workspace path `Área de Trabalho`), `org.gradle.daemon=false`, `vfs.watch=false`, `kotlin.compiler.execution.strategy=in-process`, JVM 2 GB |
| `evolucao-android/gradle.properties` | `overridePathCheck=true`, parallel + caching, 3 GB JVM |
| `coach-android/local.properties` | `sdk.dir=C:\Users\gabri\AppData\Local\Android\Sdk` — local only; update to your machine, do not commit |
| `evolucao-android/_toolchain/` | Portable JDK 17 (`jdk-17.0.19+10` observed) + `android-sdk` (`cmdline-tools`, `platforms;android-34`, `build-tools;34.0.0`) + persistent `debug.keystore` (alias `ak`, passwords `android`). NutriTrack reuses this tree when the folders are side by side; otherwise it downloads its own (`jdk-17.0.20+8` observed). |

## Where secrets live (and must not leak)

- NutriTrack key: plain `localStorage['nt_apikey']` — convenient, user-managed; export files may include settings, so scrub before sharing.
- Coach key: AES-GCM, non-exportable Keystore key (`alias coach.gemini.api.v1`), prefs `coach_secure_credentials`; validated 20–512 printable chars; never in assets/SQLite/bridge/logs. Corrupt material self-wipes to null.
- Keystore file: `evolucao-android/_toolchain/debug.keystore` signs Evolução (and Wear). Losing it forces reinstalls (Android rejects updates with a different key). Back it up privately, never commit it (already git-ignored).

## Gemini model centralization (2026-09-05, Phase 2)

One ordered fallback list, two apps, same IDs/order. Model behavior and
fallback order did **not** change — only where the list lives.

| # | Model ID | Label | thinkingLevel | Notes |
| --- | --- | --- | --- | --- |
| 1 (default) | `gemini-3.7-flash` | Gemini 3.7 Flash | `low` | First attempt; Coach `DEFAULT_MODEL` / `KEY_MODEL` default |
| 2 | `gemini-3.6-flash` | Gemini 3.6 Flash | `low` | NutriTrack auto-fallback after retryable failure |
| 3 | `gemini-3.5-flash` | Gemini 3.5 Flash | `low` | Last resort before surfacing the diagnostic trace |

- **NutriTrack:** `nutricao-android/app/src/main/assets/core/gemini-models.js`
  (`GEMINI_MODELS_CONFIG`, schema `{ version, apiBase, retryDelayMs, models }`,
  currently `version: 1`, `retryDelayMs: 3000`). Loaded via `<script>` in
  `apps/nutricao/index.html` **before** `core/gemini.js`, which reads the
  config when present and falls back to identical inline constants otherwise
  (so the Node `vm.runInContext` test harness, which evals `gemini.js` alone,
  keeps working). Values are identical in both load orders (3 model IDs in
  order, same `apiBase`, `retryDelayMs: 3000`); only
  `GEMINI_MODELS_CONFIG_VERSION` differs by design (`1` with the config
  script, `0` in fallback-alone mode — a sentinel, never a behavior switch).
  `gemini.js` additionally shape-checks config entries (ID format, non-blank
  label/thinkingLevel) and drops invalid ones, so a stale or foreign
  `GEMINI_MODELS_CONFIG` global cannot silently replace the fallback order.
  A `.json` file was deliberately not used: `file://`
  WebView script tags and single-file `vm` evals cannot synchronously load
  JSON. To change models: edit the config file, keep the order, mirror Coach
  `SupportedModels.kt`, and update this table.
- **Coach:** `coach-android/.../ai/SupportedModels.kt` (`CONFIG_VERSION = 1`,
  same IDs/order). `security/CredentialPolicy.validateModel` checks format
  (existing regex, path-traversal guard) **and** allowlist membership, so the
  bridge (`saveGeminiKey`, `resolveGeminiContext`) and `GeminiGateway.review`
  only accept verified models. Rejected models fail with `E_GEMINI_MODEL`.
- **Success-model visibility:** NutriTrack already logs the winning model per
  analysis — per-attempt `apiTraceHtml` entries (`modelLabel`/`modelId`) plus
  the green success step line naming `<model>` in all four flows (foto,
  texto and resumo do dia use `✓ Análise N … · <model>`; atividade uses
  `✓ Estimativa N … · <model>`). Coach persists the used model per opinion:
  `gemini_opinion.model` (`Schema.kt` column + `UNIQUE(snapshot_hash,
  plan_run_id, model, contract_version)`, written by
  `SnapshotStore.insertGeminiOpinionIfAbsent` from `MainActivity`).

## Development setup for integrations

1. Install the three debug APKs in order and open Evolução + NutriTrack once so the export mirrors exist.
2. For Gemini: use a personal key with tight quota; prefer fast mode while developing.
3. For Health Connect: use a physical device or an AVD image with Health Connect; grant one permission at a time to exercise the partial-access path.
4. For Strava: import the bundled test fixtures first (`strava.test.js`); only then connect a real account.
5. For Wear: follow `evolucao-android/INSTALL_TICWATCH_E3.md`; phone and watch must share the debug keystore signature.
