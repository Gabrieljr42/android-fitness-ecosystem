# Project: Android Multi-App Ecosystem (Evolução, NutriTrack, Coach)

## Architecture
The ecosystem consists of three interconnected Android hybrid applications:
1. **Evolução** (`evolucao-android`): Strength and cardio workout tracking, double progression RIR engine, marathon planning, and Strava integration. Exposes `com.evolucao.treino.workouts` ContentProvider.
2. **NutriTrack** (`nutricao-android`): Nutritional tracking, Gemini AI photo analysis, macro aggregation. Exposes `com.nutricao.app.nutrition` ContentProvider.
3. **Coach** (`coach-android`): Daily AI coaching and orchestration hub. Consumes data from Evolução and NutriTrack ContentProviders via `LocalAppSync.kt`, executes rule/AI engine in `engine.js`, and renders Android WebView UI with native insets bridge.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1.1 Double Progression Rep Increment | 45kg x 8 reps in 8-12 @ 2 RIR prescribes 45kg seeking 9 reps (up to 12) before increasing weight | M1 | ORIGINAL_REQUEST §R1 |
| 2 | R1.2 Strict Range Candidate Selection | 17.5kg x 7 reps in 6-10 @ 2 RIR maintains 17.5kg seeking 8 reps; prevents anomalous 15kg x 14 | M1 | ORIGINAL_REQUEST §R1 |
| 3 | R1.3 Progression Unit Tests | Comprehensive tests in `progressao.test.js` for RIR/double progression logic | M1 | ORIGINAL_REQUEST §R1 |
| 4 | R2.1 Workout Timer Inactivity Reset | Auto-reset/timeout workout draft and timer when inactive for > 3 hours | M2 | ORIGINAL_REQUEST §R2 |
| 5 | R2.2 Inactivity Duration Sanity | Prevent calculation of unreal session durations (> 3h without activity) | M2 | ORIGINAL_REQUEST §R2 |
| 6 | R3.1 Strava Activity Sync | Ingest Strava run activities (distance, time, pace, elevation, date) with deduplication | M3 | ORIGINAL_REQUEST §R3 |
| 7 | R3.2 Marathon Dashboard Auto-Update | Reflect Strava runs in weekly mileage, adherence, and marathon plan dashboard | M3 | ORIGINAL_REQUEST §R3 |
| 8 | R4.1 Robust Photo Error Handling | Comprehensive try/catch and timeout handling for file input, canvas decode, base64, and Gemini API | M4 | ORIGINAL_REQUEST §R4 |
| 9 | R4.2 Diagnostic Modal & Retry UI | Clear diagnostic error display, copyable trace, and "Tentar novamente" (retry) action | M4 | ORIGINAL_REQUEST §R4 |
| 10 | R5.1 Nutrition D-1 Window Fallback | Fallback to D-1 nutrition in `LocalAppSync.kt` and `engine.js` when today has 0 meals | M5 | ORIGINAL_REQUEST §R5 |
| 11 | R5.2 Bottom Nav Safe Area Insets | Scale insets by display density and tune `.bottom-nav` CSS to eliminate bottom void | M5 | ORIGINAL_REQUEST §R5 |
| 12 | E2E Integration Suite | Full cross-app test suite covering Tiers 1-4 requirements and regressions | M_E2E | ORIGINAL_REQUEST §Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Evolução Progressão Formula & Tests | `progressao.js`, `progressao.test.js` | none | DONE |
| M2 | Evolução Timer Inactivity Auto-Reset | `db.js`, `logic.js`, `ui.js`, `treino.js`, `timer_inactivity.test.js` | none | DONE |
| M3 | Evolução Strava Sync & Marathon Dashboard | `strava.js`, `maratonaplano.js`, `maratona.js`, `strava.test.js` | none | DONE |
| M4 | NutriTrack Photo Logs & Diagnostic Modal | `gemini.js`, `gemini_photo_error.test.js` | none | DONE |
| M5 | Coach D-1 Nutrition & Bottom Nav Insets | `LocalAppSync.kt`, `engine.js`, `MainActivity.kt`, `app.css`, tests | none | DONE |
| M_E2E | E2E Integration & Verification Suite | Full test execution across ecosystem (`test.ps1`, node test suites, gradlew) | M1, M2, M3, M4, M5 | DONE |

## Interface Contracts
### Evolução Progressão Engine (`progressao.js`)
- `rirMeta(carga, reps, rir, range, targetRir, inc, profile)` -> `{ carga: number, repsMeta: number, status: 'manter'|'aumentar'|'reduzir', feedback: string, model: object }`
- When load is maintained within range (`range.min <= reps < range.max`): `repsMeta = Math.min(range.max, reps + 1)`.

### Evolução Timer & Draft State (`db.js`, `logic.js`, `ui.js`)
- `state.draft`: `{ startedAt: number|null, lastActiveAt: number|null, entries: object, ... }`
- `checkDraftInactivity()`: if `Date.now() - (state.draft.lastActiveAt || state.draft.startedAt) > 3 * 3600 * 1000`, discard draft and reset timer.

### Evolução Strava Integration (`strava.js` <-> `state.corridas`)
- `syncStravaActivities(activitiesArray)` -> `{ importedCount: number, duplicatesCount: number }`
- Deduplication key: `stravaId` or `id`.
- Normalizes distance, duration, date, pace, elevation, calories into `state.corridas` canonical schema.

### NutriTrack Photo Pipeline (`gemini.js`)
- `processarFoto(file)` -> Promise resolving base64 or displaying user-friendly error with retry action.
- `consultarModelo(prompt, b64, mime)` -> with per-request timeout abort signal and diagnostic error trace.
- Failure UI modal renders `<button onclick="tentarNovamenteFoto()">Tentar novamente</button>` and `<details>` diagnostic trace.

### Coach Cross-App Sync (`LocalAppSync.kt` <-> `engine.js`)
- `LocalAppSync.kt` queries `content://com.nutricao.app.nutrition/daily?date=YYYY-MM-DD`. If 0 meals, queries `date.minusDays(1)` and injects `isDMinusOne = true`.
- `engine.js` renders fuel card: if `isDMinusOne`, displays `"NutriTrack ontem (D-1): ..."` with status `observed`.
- `MainActivity.kt` scales WindowInsets by `density`: `--android-inset-bottom: (inset.bottom / density)px`.

## Code Layout
- `evolucao-android/app/src/main/assets/`: Evolução `index.html` shell + `kernel/` (db, fmt, ui, …) + `core/progressao.js` + `apps/evolucao/` (logic, strava, maratonaplano, views).
- `nutricao-android/app/src/main/assets/`: NutriTrack `apps/nutricao/index.html` shell + `apps/nutricao/` (estado, logic, views) + `core/gemini.js`.
- `coach-android/app/src/main/java/com/coach/app/`: Coach Kotlin native layer (`LocalAppSync.kt`, `MainActivity.kt`).
- `coach-android/app/src/main/assets/www/`: Coach web assets (`js/engine.js`, `css/app.css`, `index.html`).
- Root test runner: `test.ps1` (runs all unit test suites).
