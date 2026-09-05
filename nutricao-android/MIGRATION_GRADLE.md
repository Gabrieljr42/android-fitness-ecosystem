# NutriTrack — Gradle Migration (Phase 4 SCAFFOLD, side-by-side)

> **Status: SCAFFOLD ONLY — the manual build (`build.ps1`) is still canonical.**
> Nothing here is wired to CI, no cutover has happened, and the working
> `aapt2/javac/d8/zipalign/apksigner` flow is untouched. These Gradle files exist
> so the cutover step can be rehearsed and compared without risk.

## 1. What was scaffolded (reversible)

| File | Purpose / key values |
|---|---|
| `settings.gradle.kts` | `rootProject.name = "NutriTrack"`, `include(":app")` only (Evolução includes `:app, :protocol, :wear`; NutriTrack is single-module). Same `pluginManagement` + `FAIL_ON_PROJECT_REPOS` repos as `evolucao-android`. |
| `build.gradle.kts` (root) | AGP placeholder `com.android.tools.build:gradle:8.4.2` — matches `evolucao-android/build.gradle.kts` baseline. No Kotlin plugin (Java-only: 3 files in `com.nutricao.app`). |
| `app/build.gradle.kts` | `namespace` + `applicationId com.nutricao.app`, `compileSdk 34`, `minSdk 24`, `targetSdk 34` (from `AndroidManifest.xml` post-Phase-3), `versionCode 1 / versionName 1.0` (from manifest), Java 8 compat, `lint.abortOnError + checkReleaseBuilds`, `testOptions.unitTests.isIncludeAndroidResources`, debug signing → `../evolucao-android/_toolchain/debug.keystore` (alias `ak`, passwords `android`). Single dep: `androidx.annotation:annotation:1.8.2` (lint parity; code itself is framework-only `android.*` + `org.json`). No Room/Work/Wearable/GMS. |
| `gradle.properties` | `android.overridePathCheck=true` (accented path `Área de Trabalho`), `org.gradle.jvmargs=-Xmx3072m -Dfile.encoding=UTF-8`, `android.useAndroidX=true`, plus `parallel/caching=true` (parity with Evolução). `kotlin.code.style` omitted (no Kotlin). |
| `gradle/wrapper/gradle-wrapper.properties` | Exact copy of Evolução's: `gradle-8.7-bin.zip`. |
| This file | Cutover + rollback procedure. |

### Why these values

- **compileSdk 34 / minSdk 24:** match Evolução (`compileSdk 34`, `minSdk 24`) and the manual toolchain (`BUILDTOOLS 34.0.0`, `PLATFORM android-34`, `d8 --min-api 24`, `javac -source/-target 8`).
- **targetSdk 34:** taken from the manifest (`<uses-sdk … targetSdkVersion="34"/>`), per Phase-3. Known discrepancy: `build.ps1`'s `aapt2 link` step passes `--target-sdk-version 29`; the manifest value governs the installed manual APK, but the two must be reconciled to one value at cutover (recommend 34, then update both files together).
- **Shared debug keystore:** `nutricao-android/_toolchain/debug.keystore` and `evolucao-android/_toolchain/debug.keystore` already use identical credentials (`ak` / `android`), so pointing Gradle at the sibling copy keeps manual and Gradle APKs signature-compatible during comparison. Fallback is the local copy (see comment in `app/build.gradle.kts`).
- **No new deps:** `MainActivity` / `NotificationReceiver` / `NutritionProvider` import only `android.*`, `org.json`, `java.*` — no Room, WorkManager, or Wearable APIs to migrate.

## 2. How to finish (cutover step — NOT done yet)

1. **Wrapper scripts + jar (TODO — missing in this scaffold):**
   - `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar` do **not** exist here yet (only the `.properties` was copied).
   - Generate without a network Gradle install by copying from the sibling: `Copy-Item ../evolucao-android/gradlew*, gradle/wrapper/gradle-wrapper.jar` equivalents, or run `gradle wrapper --gradle-version 8.7` once network is allowed.
   - Do **not** run `gradlew` downloads as part of Phase 4 (forbidden); do it in the cutover step.
2. **`assembleDebug`:**
    - `.\gradlew.bat :app:assembleDebug --offline` first (if SDK cached), then online if needed. Requires JDK 17 + Android SDK platform-34 / build-tools 34.0.0 (same `_toolchain` layout the manual script uses). Gradle does not auto-discover `_toolchain/android-sdk` — set `$env:ANDROID_HOME` (and `ANDROID_SDK_ROOT`) to the local `_toolchain/android-sdk` (or the sibling `../evolucao-android/_toolchain/android-sdk`) in the same session before invoking `gradlew`.
   - Expected output: `app/build/outputs/apk/debug/app-debug.apk`.
3. **Provider-payload byte-compare procedure (TODO):**
   - Seed both APKs with the same export: drive the WebView `syncNutritionSummary()` bridge with a fixed JSON fixture (`schemaVersion 1`, 1–2 days), then query:
     - NutriTrack manual APK: `content://com.nutricao.app.nutrition/daily?date=YYYY-MM-DD` → `_id, payload`.
     - NutriTrack Gradle APK (after reinstall, same device, same fixture): same URI.
   - Compare `payload` bytes **after normalizing `generatedAt`** (the provider stamps `nowIso()` per query, so raw bytes always differ — compare the `summary` object / canonical JSON of `summary` only).
   - Cross-check the Evolução bridge direction too: `getEvolucaoWorkout("YYYY-MM-DD")` against `content://com.evolucao.treino.workouts/workouts?date=…` with Evolução installed; both manual and Gradle NutriTrack APKs must return identical pass-through JSON (or identical `NO_DATA` / `PROVIDER_UNAVAILABLE` envelopes when Evolução is absent).
4. **Install-order test (TODO, on device):**
   - Fresh uninstall of both apps. Order A: install Evolução debug → install NutriTrack-Gradle debug → open NutriTrack, trigger workout import + reminder alarm + reboot → verify alarms reschedule. Order B: NutriTrack first, Evolução second → verify `<queries>` visibility + `READ_WORKOUTS` still resolves after Evolução appears.
   - Also verify Coach export path: a caller with package `com.coach.app` can read `com.nutricao.app.nutrition/daily`, any other package gets `SecurityException`.
5. **Promote (only after 2–4 pass):** rename `build.ps1` → `build-legacy.ps1`, point docs/CI at `gradlew`, keep the legacy script for one release.

## 3. Rollback

- **Manual build is still canonical:** `powershell -ExecutionPolicy Bypass -File build.ps1` produces `NutriTrack.apk` exactly as before. This scaffold adds files only; it modifies no `app/src/main/` content and changes no build output.
- To abandon the Gradle path: delete `settings.gradle.kts`, `build.gradle.kts`, `app/build.gradle.kts`, `gradle.properties`, `gradle/`, and this file. Nothing else references them.
- The header comment in `build.ps1` points here for discoverability; it does not alter build behavior.

## 4. Explicit TODO / missing pieces (cutover step)

- [ ] `gradlew` + `gradlew.bat` + `gradle/wrapper/gradle-wrapper.jar` (intentionally absent — copy from `evolucao-android/` or `gradle wrapper --gradle-version 8.7`).
- [ ] First `assembleDebug` run + `app-debug.apk` artifact (network/SDK download forbidden in Phase 4).
- [ ] Provider-payload byte-compare (manual vs Gradle, `summary`-only, `generatedAt`-normalized) + Evolução bridge parity check.
- [ ] On-device install-order test (Evolução↔NutriTrack both orders, boot-reschedule, Coach `READ_NUTRITION` allow/deny).
- [ ] Reconcile `targetSdk` 29 (`build.ps1` aapt2 flag) vs 34 (manifest + Gradle) to a single value.
- [ ] Decide long-term keystore: keep shared `../evolucao-android/_toolchain/debug.keystore` reference or switch Gradle to the local `_toolchain/debug.keystore` once signatures are proven equal.
