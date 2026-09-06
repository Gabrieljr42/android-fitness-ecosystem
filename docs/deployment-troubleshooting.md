# Deployment, operations, and troubleshooting

There is no store release pipeline or server in the repo. "Deployment" is sideloading locally-signed debug APKs. CI (`.github/workflows/ci.yml`) runs the Node suites + Gradle unit tests on push/PR.

## Environments and outputs

| App | Build | Output | Install |
| --- | --- | --- | --- |
| Evolução | `evolucao-android/build.ps1` → `build-wear.ps1 -MobileOnly -WithTests` | `evolucao-android/Evolucao.apk` (copy of `app/build/outputs/apk/debug/app-debug.apk`), `versionCode 2 / 1.1-wear` | `adb install -r Evolucao.apk` or copy to phone |
| Evolução + Wear | `.\build-wear.ps1 -WithTests -WithLint` | Mobile + Wear APKs, same `_toolchain/debug.keystore` | `install-mobile-debug.ps1` / `install-wear-debug.ps1` |
| NutriTrack | `nutricao-android/build.ps1` | `nutricao-android/NutriTrack.apk` | Same sideload |
| Coach | `.\gradlew.bat :app:assembleDebug` | `coach-android/app/build/outputs/apk/debug/app-debug.apk`, `versionCode 2 / 0.2.0` | `adb install -r` in Evolução → NutriTrack → Coach order |

All debug builds share the persistent `_toolchain/debug.keystore` (alias `ak`). Release builds reuse the debug signing config today — there is no separate release key or Play signing in the repo.

Rollback = reinstall the previous APK file you kept (keep versioned copies; Android blocks downgrades only if `versionCode` goes backwards — uninstall first in that case). There is no OTA, monitoring, crash reporting, analytics, or health endpoint; on-device diagnosis is `adb logcat`, `uiautomator dump`, and screenshots.

## Pre-distribute checklist (from repo gates)

1. `test.ps1` green (or the per-app runners).
2. Coach/Evolução: `:app:testDebugUnitTest` green; Coach UI change: `ui-smoke.js` green.
3. `assembleDebug` (Coach) / `build(-wear).ps1` (Evolução) / `build.ps1` (NutriTrack) exit 0.
4. Coach: `:app:lintDebug` green.
5. Record exit code, APK size, and SHA-256 (`Get-FileHash app…apk -Algorithm SHA256`).
6. Install order + open Evolução/NutriTrack once; verify Coach sync shows data, not silent zeros.

## Common failures

| Symptom | Likely cause | Fix (verified in repo docs/scripts) |
| --- | --- | --- |
| `sdkmanager`/AGP fails on this workspace | Non-ASCII path `Área de Trabalho` | Keep `android.overridePathCheck=true` (already in both `gradle.properties`); Evolução scripts fall back to 8.3 short paths (`%~sI`). Do not move only one app away — NutriTrack reuses `../evolucao-android/_toolchain`. |
| Gradle uses wrong JDK / Kotlin daemon crash | System JDK 20 or daemon Unicode issue | `$env:JAVA_HOME=(Resolve-Path '..\evolucao-android\_toolchain\jdk17\…').Path` first; keep `kotlin.compiler.execution.strategy=in-process`, `--no-daemon --no-watch-fs --console=plain`; never run two Gradle builds at once. |
| PowerShell "hangs" after Gradle finishes | Output piped through `Select-Object`/`Tee-Object`/jobs | Run `gradlew.bat` directly in the foreground per `coach-android/AGENTS.md`. |
| Evolução shows blank WebView | Stale manual-APK path or asset backslashes | Use current `build.ps1` (Gradle path); the legacy `aapt2` branch's in-place `\→/` patch only applies to manual builds. |
| "App não instalado" on update | Keystore changed (fresh `_toolchain`) | Restore the original `_toolchain/debug.keystore` from private backup; reinstalls with a new key need uninstall first (data loss — export JSON first). |
| NutriTrack camera falls back to gallery silently | Android 11+ package visibility | Already handled via `<queries><intent>IMAGE_CAPTURE</intent>` — do not remove; test on a real device. |
| Gemini photo always fails / quota | Missing key, no network, free-tier 50 req/day (precise = 3 req/photo) | Set key in **Ajustes**, use fast mode, retry after the `RETRY_DELAY_MS` backoff; the diagnostic modal's trace tells which stage failed. |
| Coach sync empty after updating sources | Source app not opened once post-update | Open Evolução + NutriTrack once to republish mirrors, then Coach **Sincronizar tudo**. |
| Coach Health shows no data | Permission subset / no Health Connect / revoked | **Conectar** per-signal; partial access is normal — absent slots stay absent. |
| Rest timer freezes in background (old builds) | Ticker-only implementation under Doze | Current code uses exact alarm + `RestAlarmReceiver` + chronometer notification — ensure exact-alarm permission is granted. |
| Node tests fail on one file | Regression in that module | Run that file directly (`node …/<name>.test.js`), fix, then re-run `run_all.js` — builds gate on this. |

Wear-specific issues (pairing, Data Layer drain, conflicts) have their own guides: `ARCHITECTURE_WEAR.md`, `SYNC_PROTOCOL.md`, `TROUBLESHOOTING_WEAR.md`, `diagnose-wear-sync.ps1`.

## What is procedure vs. recommendation

- **Existing procedure:** portable `_toolchain`, Gradle flags, install order, `test.ps1` gates, inexact 05:40 briefing, read-only providers — all from scripts/manifests/docs above.
- **Recommendations (not in repo):** keep versioned APK copies + SHA-256 log; add a JS linter; use separate release signing before any store listing; back up `debug.keystore` offline.
