# E2E Test Infra: Android Multi-App Ecosystem

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation internals.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinations + Real-World Workload Testing.

## Feature Inventory & Test Mapping
| # | Feature | Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Scenario) |
|---|---------|--------|:-----------------:|:-----------------:|:---------------------:|:-----------------:|
| 1 | R1.1 Double Progression 45kg x 8 | ORIGINAL_REQUEST §R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 2 | R1.2 Candidate Selection 17.5kg x 7 | ORIGINAL_REQUEST §R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 3 | R1.3 Progression Unit Test Suite | ORIGINAL_REQUEST §R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 4 | R2.1 Timer Inactivity Auto-Reset | ORIGINAL_REQUEST §R2 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 5 | R2.2 Timer Max Duration Sanity | ORIGINAL_REQUEST §R2 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 6 | R3.1 Strava Ingestion & Deduplication | ORIGINAL_REQUEST §R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 7 | R3.2 Marathon Dashboard Sync | ORIGINAL_REQUEST §R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 8 | R4.1 Photo Error Handling & Timeout | ORIGINAL_REQUEST §R4 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 9 | R4.2 Diagnostic Modal & Retry Flow | ORIGINAL_REQUEST §R4 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 10 | R5.1 Nutrition D-1 Fallback | ORIGINAL_REQUEST §R5 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 11 | R5.2 Safe Area Insets & Bottom Nav | ORIGINAL_REQUEST §R5 | ≥5 cases | ≥5 cases | ✓ | ✓ |

## Test Architecture
- **Root Unit Test Suite**: `powershell -ExecutionPolicy Bypass -File .\test.ps1` (runs test files across Evolução and NutriTrack).
- **Evolução Test Runner**: `node evolucao-android/app/src/test/js/run_all.js`
- **NutriTrack Test Runner**: `node nutricao-android/app/src/test/js/run_all.js`
- **Coach JS Test Runner**: `node coach-android/app/src/test/js/engine.test.js`, `node coach-android/app/src/test/js/system-insets.test.js`
- **Coach Kotlin Unit Tests**: `coach-android\gradlew.bat :app:testDebugUnitTest --no-daemon`

## Real-World Application Scenarios (Tier 4)
1. **Scenario 1: Strength Progression Workflow**: Athlete logs 45kg x 8 in 8-12 @ 2 RIR -> app prescribes 45kg x 9 reps. In next session, athlete logs 45kg x 9 reps -> app prescribes 45kg x 10 reps. Once 45kg x 12 reps is reached, app recommends load increase.
2. **Scenario 2: Intermediate Load Non-Degradation**: Athlete logs 17.5kg x 7 in 6-10 @ 2 RIR -> app prescribes 17.5kg x 8 reps (never dropping to 15kg x 14).
3. **Scenario 3: Abandoned Workout Session**: User starts workout draft, logs 1 set, closes app for 4 hours. Upon return, stale session is cleared, live timer resets to 0, preventing 38h duration logs.
4. **Scenario 4: Strava Import & Marathon Week Aggregation**: User imports 3 Strava runs (one duplicate). Exact unique mileage aggregates into current marathon training week, long run card updates, adherence recalculated.
5. **Scenario 5: Poor Network Photo Analysis & Retry**: User takes food photo in low-connectivity. API call times out / fails -> clear diagnostic modal appears with "Tentar novamente" button -> user taps retry -> succeeds.
6. **Scenario 6: Morning Briefing with Yesterday's Nutrition**: User opens Coach app at 07:00 AM with 0 meals logged today -> Coach fuel card displays D-1 totals marked "NutriTrack ontem (D-1): ..." as observed baseline.
7. **Scenario 7: Android High-Density Display Navigation Insets**: On a 3.0x density device with 48dp navigation bar (144px physical), bottom nav bar aligns flush with safe area without inflated bottom gap.
