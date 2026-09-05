# Play release — signing, versioning, and rollout log

Status: doc-only plan. No Play upload, no release key, and no store listing exist yet.
Current truth (2026-09-05): all distributed builds are locally-signed debug APKs —
see [deployment-troubleshooting](deployment-troubleshooting.md).

Current signing state:

- Evolução (`evolucao-android/app/build.gradle.kts:20-36`): only a `debug`
  `signingConfig` exists (store `_toolchain/debug.keystore`, alias `ak`).
  Both `debug` and `release` build types point at it — there is no dedicated
  release/upload key.
- Coach (`coach-android/app/build.gradle.kts:18-22`): no `signingConfigs` block at
  all; `release { isMinifyEnabled = false }` is unsigned and relies on the
  Gradle default. Debug APKs are developer-signed by the local SDK.
- NutriTrack (`nutricao-android/build.ps1:189-200`, `app/src/main/AndroidManifest.xml:4`):
  manual `apksigner` flow reusing the shared `_toolchain/debug.keystore`
  (`versionCode 1 / 1.0`). Same key-reuse problem as Evolução.

Do not ship any of the above to Play. Follow the plan below first.

## 1. Dedicated upload key procedure (placeholders only)

One upload key per app (or one clearly-labelled key per package — never reuse
the debug keystore). All secrets stay in Play Console + private offline backup,
never in git, docs, logs, or screenshots.

```powershell
# Example only — replace every <PLACEHOLDER> locally, never commit the result.
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore <UPLOAD_KEYSTORE_PATH_EVOLUCAO> `
  -alias <UPLOAD_KEY_ALIAS_EVOLUCAO> `
  -keyalg RSA -keysize 2048 -validity 10950 `
  -dname "CN=<Your Name>, OU=<Your Org>, O=<Your Org>, L=<City>, ST=<State>, C=<CountryCode>"

& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore <UPLOAD_KEYSTORE_PATH_NUTRITRACK> `
  -alias <UPLOAD_KEY_ALIAS_NUTRITRACK> `
  -keyalg RSA -keysize 2048 -validity 10950 `
  -dname "CN=<Your Name>, OU=<Your Org>, O=<Your Org>, L=<City>, ST=<State>, C=<CountryCode>"

& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore <UPLOAD_KEYSTORE_PATH_COACH> `
  -alias <UPLOAD_KEY_ALIAS_COACH> `
  -keyalg RSA -keysize 2048 -validity 10950 `
  -dname "CN=<Your Name>, OU=<Your Org>, O=<Your Org>, L=<City>, ST=<State>, C=<CountryCode>"
```

After generating each key (on a trusted machine only):

1. Enroll in Play App Signing and register the upload certificate per package
   (`com.evolucao.treino`, `com.nutricao.app`, `com.coach.app`).
2. Store the keystore file + `<STORE_PASSWORD>` / `<KEY_PASSWORD>` / alias in
   two private offline locations (e.g. encrypted USB + password manager).
   The debug keystore (`_toolchain/debug.keystore`, alias `ak`) must never
   become an upload key.
3. Verify the certificate fingerprint before first upload:
   `keytool -list -v -keystore <UPLOAD_KEYSTORE_PATH> -alias <UPLOAD_KEY_ALIAS>`
   and compare with Play Console.

## 2. Separate release signingConfig plan (per app)

Gradle apps (Evolução, Coach) — add a `release` signing config fed only by
environment / local `keystore.properties` (git-ignored), never hardcoded:

```kotlin
// Sketch — do not paste real passwords. keystore.properties stays git-ignored.
val ksProps = java.util.Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
signingConfigs {
    create("release") {
        storeFile = file(ksProps.getProperty("storeFile", "<UPLOAD_KEYSTORE_PATH>"))
        storePassword = System.getenv("KEYSTORE_PASSWORD") ?: ksProps.getProperty("storePassword", "<STORE_PASSWORD>")
        keyAlias = System.getenv("KEY_ALIAS") ?: ksProps.getProperty("keyAlias", "<UPLOAD_KEY_ALIAS>")
        keyPassword = System.getenv("KEY_PASSWORD") ?: ksProps.getProperty("keyPassword", "<KEY_PASSWORD>")
    }
}
buildTypes {
    release {
        isMinifyEnabled = false // revisit only with a full regression pass
        signingConfig = signingConfigs.getByName("release")
    }
}
```

- `keystore.properties` (root of `evolucao-android/` and `coach-android/`)
  must be added to `.gitignore` before the first real key exists.
- CI must never print these values; release signing happens on a trusted
  runner or locally, not on every PR.
- NutriTrack (manual `aapt2`/`apksigner` flow): add a `-Release` switch to
  `build.ps1` that takes `-KeystorePath <UPLOAD_KEYSTORE_PATH>`,
  `-KeyAlias <UPLOAD_KEY_ALIAS>` and reads passwords from env vars
  (`$env:KEYSTORE_PASSWORD`, `$env:KEY_PASSWORD`), defaulting to nothing —
  never fall back to `debug.keystore` silently. Doc-only proposal; no script
  change is made by this file.

## 3. versionCode monotonic policy

- `versionCode` is an integer that only ever increases per `applicationId`,
  across all tracks (internal → closed → open → production). Never reuse or
  decrease a shipped `versionCode`; Android blocks downgrades.
- Bump `versionCode` by exactly +1 per uploaded artifact (one track at a time).
  `versionName` is display-only (`major.minor.patch[-suffix]`) and may stay
  the same across tracks, but `versionCode` must not.
- Current baselines (debug only, not shipped): Evolução `2 / 1.1-wear`,
  NutriTrack `1 / 1.0`, Coach `2 / 0.2.0`. First Play upload for each package
  starts at `versionCode = <current max> + 1`.
- Record the chosen `versionCode`/`versionName` in the rollout log below before
  uploading; if an upload is rejected, keep the number retired — do not recycle
  it for the next build.

## 4. What to log per release

Extend the pre-distribute checklist in
[deployment-troubleshooting](deployment-troubleshooting.md#pre-distribute-checklist-from-repo-gates)
with one row per uploaded artifact (keep a `docs/RELEASE_LOG.md` or Play
Console notes — same fields):

| Field | Example (placeholder) |
| --- | --- |
| Date (UTC) | `2026-__-__` |
| App / package | `Evolução / com.evolucao.treino` |
| `versionCode` / `versionName` | `3 / 1.2.0` |
| Artifact (AAB/APK) | `app-release.aab` |
| SHA-256 | `<SHA256_HEX>` (`Get-FileHash <artifact> -Algorithm SHA256`) |
| Size (bytes) | `<SIZE_BYTES>` |
| Track / rollout | `internal / 100%` |
| Test evidence | `test.ps1 exit 0; :app:testDebugUnitTest green; ui-smoke N/A` |
| Play declaration state | `Data Safety submitted; Health Connect declaration pending` |

Commands (same as sideload log, run on the exact uploaded file):

```powershell
Get-FileHash <ARTIFACT_PATH> -Algorithm SHA256
(Get-Item <ARTIFACT_PATH>).Length
```

## 5. Rollback rule

- There is no server-side downgrade. "Rollback" = halt the staged rollout in
  Play Console, then promote the previous good artifact (or upload a new
  hotfix with `versionCode = <bad build> + 1`). Never re-upload an old
  `versionCode`.
- Keep the previous good AAB/APK + its SHA-256/size row so testers can
  sideload it while the hotfix rolls out.
- Sideload downgrades still follow the local rule: uninstall-first if the
  installed `versionCode` is higher (data loss — export JSON first), per
  [deployment-troubleshooting](deployment-troubleshooting.md).

## 6. TODO before first Play upload

- [ ] Data Safety form per app (data collected/shared, purposes, encryption,
      deletion path; Coach `privacy.deleteLocalData` + `allowBackup=false`
      must match the answers).
- [ ] Health permissions declaration (Coach: `READ_SLEEP`, `READ_STEPS`,
      `READ_RESTING_HEART_RATE`, `READ_WEIGHT` — read-only, no write scope;
      confirm the Health Connect declaration form matches the manifest).
- [ ] Exact-alarm justification (Evolução + NutriTrack declare
      `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` for rest timer + meal
      reminders; Coach uses inexact 05:40 briefing — confirm each listing's
      "exact alarm required" statement or remove the permission before upload).
- [ ] Separate `release` signingConfig wired per app (section 2) + upload key
      enrolled in Play App Signing.
- [ ] Release artifact is AAB, not APK (Play requires AAB for new apps):
      Gradle apps via `bundleRelease`; NutriTrack's manual `build.ps1` is
      APK-only today (`zipalign` + `apksigner`, no `bundletool` anywhere in
      the repo) — add a `bundletool build-bundle` path before first upload.
- [ ] `keystore.properties` git-ignored; no password/key in git, logs, or docs.
- [ ] First internal-track upload logged per section 4 (versionCode/Name, hash,
      size, track).

Non-goals respected: no keystore was generated, no password or key is stored
in this repo, no AAB/APK was uploaded, no Play listing was created.
