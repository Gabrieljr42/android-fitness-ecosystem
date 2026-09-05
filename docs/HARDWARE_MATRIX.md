# Hardware verification matrix

Doc-only tracking sheet for on-device verification. No lab run has been
recorded yet — every row below is `Unknown — pending first run` until a real
device pass fills it in (see [deployment-troubleshooting](deployment-troubleshooting.md)
for install order and evidence rules: exit code, APK size, SHA-256).

How to fill a row: install in Evolução → NutriTrack → Coach order, open the
first two once, run Coach **Sincronizar tudo**, then record PASS/FAIL/ABSENT
per column with the app versions + hashes you actually installed.

| Device | OS | Evolução version (code/name/hash) | NutriTrack version (code/name/hash) | Coach version (code/name/hash) | Provider reads (Evolução→NutriTrack/Coach, NutriTrack→Coach) | Insets / gesture nav | Health Connect (sleep/steps/RHR/weight) | BLE scale | Wear sync | Date (UTC) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Unknown — pending first run (physical phone) | Unknown — pending first run | Unknown — pending first run | Unknown — pending first run | Unknown — pending first run | Unknown — pending first run | Unknown — pending first run | Unknown — pending first run | Unknown — pending first run | N/A (no watch) | Unknown — pending first run |
| Unknown — pending first run (physical watch, e.g. TicWatch E3) | Unknown — pending first run | Unknown — pending first run (mobile + wear APKs, same keystore) | N/A | N/A | N/A | N/A | N/A | N/A | Unknown — pending first run (plan publish → drain → reconcile, conflict cap 200) | Unknown — pending first run |
| Unknown — pending first run (AVD 14 + Health Connect) | Unknown — pending first run | Unknown — pending first run | Unknown — pending first run | Unknown — pending first run (Coach README notes prior AVD-14 evidence; physical-device recheck pending) | Unknown — pending first run | Unknown — pending first run | Unknown — pending first run (grant one permission at a time; partial access is normal) | N/A (no BLE on emulator) | N/A | Unknown — pending first run |

Column meanings:

- **Provider reads:** open Evolução/NutriTrack once post-install, then Coach
  sync must show real data or explicit absent states — never silent zeros.
- **Insets / gesture nav:** Coach `system-insets.test.js` is unit-only; confirm
  on a real gesture-nav device.
- **Health Connect:** built in on Android 14+, installable otherwise; grant a
  subset to exercise the partial-access path.
- **BLE scale:** `ble-diag` view → permissions → scan → `DavelyScaleParser`
  packets → `peso[]` (physical device only).
- **Wear sync:** follow `evolucao-android/INSTALL_TICWATCH_E3.md`; phone + watch
  must share the debug keystore signature.
