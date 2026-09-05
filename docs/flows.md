# APIs and key application flows

No REST backend exists. "APIs" here are: the WebView bridges, the cross-app `ContentProvider`s, the Gemini calls, and the pure JS engines. All validation is local.

## WebView bridges

### Evolução `AndroidBridge` (`MainActivity.java`, all `@JavascriptInterface`)

| Method | Purpose |
| --- | --- |
| `syncWorkoutState(json)` | Mirrors `{sessions, corridas, peso}` to `SharedPreferences['evolucao_workouts_export']` for the provider. UI routine/settings/draft never cross. |
| `startRestNotification(label, endAt, alertEnabled)` / `stopRestNotification()` / `restDoneNotification(label, alert)` | Exact-alarm rest countdown + completion alert. |
| `sendNotification(title, body)`, `vibrate(ms)` | One-shot notice + haptics. |
| `saveBackup(json, filename)` | Writes JSON to `Downloads/` (MediaStore, API 29+) or app storage. |
| `publishWearPlan(json)`, `requestWearInboxDrain()`, `confirmWearEventsApplied(json)`, `reportWearApplyFailure(reason)` | Wear sync outbox/inbox. |
| `startScaleMeasurement()`, `stopScaleMeasurement()`, `startBleScan()`, `stopBleScan()`, `getBleTelemetry()`, `getBleDiagnosticState()`, `isBluetoothAvailable/Enabled()`, `hasBlePermissions()`, `requestBlePermissions()` | Davely BLE scale flow. |
| `copyToClipboard(text)`, `saveBleDiagnosticFile(content, filename, mime)` | Diagnostics export. |
| File chooser (`onShowFileChooser`) | Camera (`EXTRA_OUTPUT` MediaStore URI) + gallery. |

WebView settings: JS on, DOM storage on, `allowFileAccess` + `allowUniversalAccessFromFileURLs` so `file:///android_asset/` subpaths resolve (the `build.ps1` backslash patch exists for this).

### NutriTrack `AndroidBridge` (`nutricao-android/.../MainActivity.java`)

| Method | Purpose |
| --- | --- |
| `getEvolucaoWorkout(date)` | Synchronous read of `content://com.evolucao.treino.workouts/workouts?date=…` for the "Buscar treino do dia" flow. Returns the provider payload string or error JSON. |
| `syncNutritionSummary(json)` | Writes the aggregate mirror to `nutritrack_coach_export`. |
| `startAudioRecording()` / `stopAudioRecording()` / `cancelAudioRecording()` / `isAudioRecording()` | `MediaRecorder` voice-note capture (≤12 MB), permission-aware. |
| `scheduleAlarm(id, title, message, hour, enabled)`, `cancelAlarm(id)`, `syncAlarms(json)`, `cancelAllAlarms()` | Meal reminders via `AlarmManager`. |
| `sendNotification(title, message)`, `vibrate(ms)`, `saveBackup(json, filename)` | Same pattern as Evolução. |

### Coach `CoachNative` (`MainActivity.kt`, gated by `BridgeProtocol`)

Envelope in: `{"version":1,"requestId":"web-…","data":{}}`; out: `{"version":1,"requestId":…,"ok":true,"data":{}}` or `{"ok":false,"error":{"code","message"}}`. Limits: 32 KiB UTF-8, `requestId` `[A-Za-z0-9._:-]{1,80}`, exact keys, no unknown fields on sensitive ops, in-flight ID dedup, `JSONObject.quote` on the way back.

Allowed ops (13): `app.bootstrap`, `health.requestPermissions`, `health.sync`, `health.openSettings`, `checkin.save`, `plan.persist`, `decision.save`, `gemini.saveKey`, `gemini.clearKey`, `gemini.preview`, `gemini.review`, `notification.schedule`, `privacy.deleteLocalData`.

## Cross-app reads (representative)

Evolução → consumer (`date=2026-09-05`):

```json
{
  "schemaVersion": 1,
  "source": "com.evolucao.treino",
  "date": "2026-09-05",
  "generatedAt": "2026-09-05T12:00:00.000Z",
  "weight": { "date": "2026-09-04", "kg": 82.5 },
  "sessions": [
    {
      "tipo": "musculacao", "type": "musculacao",
      "nome": "Treino A", "dia": "A", "duracaoSeg": 3200,
      "exercicios": [
        { "nome": "Supino reto c/ halteres",
          "series": [{ "repeticoes": 9, "reps": 9, "cargaKg": 45, "carga": 45, "rir": 2, "concluida": true }] }
      ]
    },
    { "tipo": "corrida", "type": "corrida", "nome": "Corrida",
      "distanciaKm": 8.2, "duracaoSeg": 2700, "ritmoMedioSegKm": 329 }
  ]
}
```

NutriTrack → Coach:

```json
{
  "schemaVersion": 1, "source": "com.nutricao.app", "date": "2026-09-05",
  "generatedAt": "2026-09-05T12:00:00.000Z",
  "summary": {
    "date": "2026-09-05", "mealCount": 3,
    "energyKcal": 2150, "proteinG": 150, "carbsG": 220, "fatG": 70,
    "waterMl": 1800, "hasWaterLog": true,
    "targets": { "energyKcal": 2600, "proteinG": 170, "waterMl": 3000 }
  }
}
```

Field names follow the code: Evolução sets use compact `w/r/rir/wu` in state and readable aliases in the provider; Coach parsers accept both `duracaoSeg`/`duration` and `distanciaKm`. Errors are explicit: unknown caller → `SecurityException`; bad date → null cursor; write attempt → `UnsupportedOperationException("read-only")`.

## Core engines (pure JS, test-covered)

**RIR progression** (`evolucao-android/.../core/progressao.js`, `rirMeta(carga, reps, rir, range, targetRir, inc, profile)`): within-range sets keep load and ask `min(range.max, reps+1)` (e.g. 45 kg × 8 in 8–12 @ RIR 2 → 45 kg × 9); top-of-range triggers a load bump by equipment increment (halter 2.5 / polia-máquina-barra 5 / bodyweight 0); no-RIR history falls back to legacy double progression; short sessions never penalize targets; stall counter suggests deload.

**Gemini food/activity** (`nutricao-android/.../core/gemini.js`): `processarFoto(file)` → base64 + per-request timeout → `consultarModelo` against `FOOD_SCHEMA` (or `TEXT_FOOD_PROMPT` / `AUDIO_FOOD_PROMPT` / `DAILY_FOOD_PROMPT` / `ACTIVITY_SCHEMA` variants). Precise mode = 3 samples + outlier trim + weighted mean; fast = 1. Model fallback `gemini-3.7-flash → 3.6 → 3.5`, `RETRY_DELAY_MS 3000`, diagnostic modal with `Tentar novamente` + copyable trace. Auth: `x-goog-api-key: <nt_apikey>`.

**Coach readiness** (`coach-android/.../www/js/engine.js`, `analyze(snapshot)`): pure `(snapshot, engine 0.2.0)` → `{recoveryScore, muscle[], coverage, proposals[≤1 conservative], flags}`. Absent ≠ zero; steps ≠ runs; joint/severe-muscle pain blocks aggressive changes; confidence capped at 0.7 without a personal baseline.

## Main user flows and where they live

| Flow | Steps | Code |
| --- | --- | --- |
| Log a strength set | `views/treino.js` keypad (comma decimal: `12,5→12.5`) → `draft.entries` → `save()` → auto rest timer | `evolucao-android/app/src/main/assets/apps/evolucao/views/treino.js`, `evolucao-android/app/src/main/assets/kernel/db.js`, `MainActivity.java` rest methods |
| Import Strava run | Paste/connect activity → `normalizeStravaActivity` → dedup by `stravaId/id` → `state.corridas` → marathon dashboard recompute | `evolucao-android/app/src/main/assets/apps/evolucao/strava.js`, `evolucao-android/app/src/main/assets/apps/evolucao/maratonaplano.js`, `evolucao-android/app/src/main/assets/apps/evolucao/views/maratona.js`, test `evolucao-android/app/src/test/js/strava.test.js` |
| Photo meal | Camera/gallery → `gemini.js` precise/fast → validate → `nt_meals[date]` → progress bars + 7-day chart | `core/gemini.js`, `views/hoje.js`, `views/diario.js` |
| Evolução → NutriTrack energy estimate | **Hoje → Estimar gasto c/ IA → Buscar treino do dia** (`getEvolucaoWorkout`) → optional feeling note → Gemini MET/kcal → confirm into `nt_activities` | `views/hoje.js`, `core/gemini.js` activity schema, `MainActivity.getEvolucaoWorkout` |
| Coach morning briefing | **Sincronizar tudo** → providers + Health → snapshot → `engine.js` → proposals → optional Gemini preview → native confirm → decision stored locally | `LocalAppSync.kt`, `DailySnapshotBuilder.kt`, `engine.js`, `GeminiGateway.kt`, `MainActivity.kt` |
| Weigh on BLE scale | `ble-diag` view → permissions → scan → `DavelyScaleParser` packets → `peso[]` → provider weight updates | `ScaleBleScanner.java`, `DavelyScaleParser.java`, `views/ble-diag.js` |
| Phone↔watch set | Publish plan → Data Layer envelope → watch applies → inbox drain → reconcile → conflict cap 200 | `protocol/*`, `wear/*`, `wear-sync.js`, `SYNC_PROTOCOL.md` |

## Events, queues, scheduled tasks

No message queue or cron. Scheduling is `AlarmManager`-only: Evolução exact rest alarm (+ Handler fallback), NutriTrack meal alarms with boot re-registration, Coach inexact 05:40 briefing with boot/timezone reschedule. Notification channels: Evolução `descanso` (ongoing countdown) + `descanso_alerta`; NutriTrack `nutricao_lembretes`; Coach briefing channel in `BriefingScheduler`.

## Appendix: contract v2 policy (doc-only, no code change)

Current wire version is `schemaVersion: 1` on both providers (Evolução
`content://com.evolucao.treino.workouts`, NutriTrack
`content://com.nutricao.app.nutrition`). No v2 payload exists. The rules below
govern how a future v2 would be introduced — they change no parser, schema, or
test in this commit.

1. **Dual-read window.** When a v2 is ever proposed, producers keep emitting
   v1 alongside v2, and every consumer parser (`NutriTrack` Evolução client,
   Coach `LocalPayloadParser` / `NutritionProvider`) must accept both v1 and
   v2 until the maintainer explicitly retires v1 in the docs. Absent fields
   stay absent (`ABSENT`/`null`) — never defaulted to zero. A consumer that
   only understands v1 must keep working against a v2 producer (unknown
   fields ignored on tolerant reads; sensitive bridge ops keep their exact-keys
   rule per `BridgeProtocol`).
2. **Fixture-driven parsers.** No contract change without fixtures first:
   add a versioned example payload (v1 + proposed v2, including boundary
   cases: missing optional blocks, both alias spellings such as
   `duracaoSeg`/`duration`, `distanciaKm` variants, compact `w/r/rir/wu` vs
   readable aliases) to the owning JS/Kotlin test suite, show the parser
   accepting both, then document the outcome here. Builds gate on the suites
   (`run_all.js`, `:app:testDebugUnitTest`), so the fixture is the proof.
3. **Cap-change procedure (doc-only).** Payload size caps and bridge byte
   limits (Coach 32 KiB envelope, `requestId` pattern, provider cursor limits)
   are contracts too. To change any cap: (a) state the old/new value and why
   in the PR description, (b) update this file + `docs/database.md` +
   the owning app README in the same PR, (c) add a boundary test that sends
   an over-cap payload and asserts the explicit rejection path
   (`SecurityException` / `UnsupportedOperationException("read-only")` /
   `{"ok":false,...}` — never a silent truncate). No silent cap bumps.
