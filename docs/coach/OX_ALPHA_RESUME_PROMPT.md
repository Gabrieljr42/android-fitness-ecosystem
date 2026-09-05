# OX Alpha / OpenCode — Resume Coach Night 1

Resume the interrupted Coach Night 1 implementation. This is a continuation and recovery task, not a fresh architecture exercise.

## Read first

Read these files completely before editing:

1. `coach-android/NIGHTLY_STATUS.md`
2. `docs/coach/OX_ALPHA_NIGHT1_PROMPT.md`
3. `docs/coach/COACH_DESIGN.md`

The original prompt and design remain binding. Preserve all approved decisions and acceptance criteria.

## Known interruption

The previous run started correctly but stopped during Milestone 0 while trying to generate the Gradle wrapper. OpenCode requested broad external-directory access to:

```text
C:\*
```

That request was not approved and must not be repeated. Do not request or depend on broad access to `C:\*`, the user profile, or any unrelated directory. Do not rename, replace, or temporarily overwrite the real `coach-android/build.gradle.kts` or `coach-android/app/build.gradle.kts` just to bootstrap the wrapper.

Current repository evidence:

- `coach-android/` exists with partial Gradle configuration;
- a minimal WebView shell and placeholder bridge exist;
- no Gradle wrapper exists;
- no verified build, tests, or APK exist;
- Health Connect, SQLite, check-in, snapshot engine, Gemini, Keystore, notification, documentation, and tests are still incomplete;
- `NIGHTLY_STATUS.md` still reports M0 in progress.

Do not claim any of those items are complete until inspected and verified.

## Hard scope and safety boundary

Create or modify files only under:

```text
coach-android/**
```

Everything else is read-only. Do not modify `.opencode/**`, `docs/**`, root files, `evolucao-android/**`, or `nutricao-android/**`. Do not stage, commit, stash, reset, clean, checkout, push, publish, or use destructive Git commands. Existing uncommitted files belong to the user.

Run `git status --short` at resume start and at the end. Record both results in `coach-android/NIGHTLY_STATUS.md`.

## OpenCode workflow

1. Use `todowrite` immediately. Reconstruct the remaining milestones from the original prompt, keeping one primary implementation item in progress.
2. Update `coach-android/NIGHTLY_STATUS.md` before new implementation with the interruption cause, current evidence, and exact next action.
3. If useful and available, delegate only narrow read-only questions to the free **Explore** or **Scout** subagents. The primary Build agent owns all edits and verification.
4. Continue autonomously. Do not ask routine questions. When one approach is blocked, choose a safe in-scope alternative and continue.
5. Never wait indefinitely on a permission request. Do not request broad filesystem access. If a tool requires an overly broad permission, cancel that approach, record it, and use another method.
6. After context compaction, reread `NIGHTLY_STATUS.md`, this resume prompt, and the relevant original-design section.

## Recover the Gradle wrapper safely

First establish a reproducible build without touching sibling projects.

Preferred recovery approach:

1. Inspect the existing `coach-android` Gradle files and selected Android Gradle Plugin/Kotlin versions.
2. Create an isolated bootstrap build entirely inside:

   ```text
   coach-android/.wrapper-bootstrap/
   ```

3. Give that bootstrap build its own minimal `settings.gradle.kts` and `build.gradle.kts` containing only the Gradle `wrapper` task configuration. It must not load the Android plugin or the real Coach build.
4. Invoke the already discovered local Gradle 8.0 executable with the working directory/project directory set to `.wrapper-bootstrap`, generating a Gradle 8.7 binary wrapper. Do not modify files in the cached Gradle distribution.
5. Copy only the generated wrapper artifacts into `coach-android/`:

   ```text
   gradlew
   gradlew.bat
   gradle/wrapper/gradle-wrapper.jar
   gradle/wrapper/gradle-wrapper.properties
   ```

6. Verify that `distributionUrl` uses the official Gradle HTTPS distribution and the intended version.
7. Run the wrapper from `coach-android/` with the portable JDK 17 already discovered in the sibling toolchain used read-only. Do not alter that JDK or sibling project.
8. After the real wrapper works, remove only the bootstrap directory that this resumed run created, after resolving and verifying that its absolute path is inside `coach-android/`. If removal would trigger an unsafe permission request, leave it ignored and document it instead of blocking.

Do not use `Set-Content` tricks that temporarily replace the real build scripts. Do not resolve arguments into `C:\*`. If the preferred bootstrap method is incompatible with the locally installed Gradle, use another isolated build under `coach-android/` and document the exact method.

Before continuing, run a narrow verification such as:

```text
gradlew.bat --version
gradlew.bat :app:assembleDebug
```

Capture the actual output/exit status in `NIGHTLY_STATUS.md`. Fix compile/configuration failures before building higher layers.

## Continue the original milestones

Once the minimal shell builds, continue the original Night 1 work in this priority order:

1. canonical immutable domain model and explicit missing-data semantics;
2. versioned SQLite schema and persistence;
3. real Health Connect availability, permission, and read adapter for sleep, steps, resting heart rate, and weight;
4. 30-second check-in;
5. deterministic local snapshot/readiness engine with transparent evidence;
6. useful Portuguese-Brazilian morning briefing UI;
7. Gemini Structured Output gateway, strict validator, Keystore-backed credential, and offline/keyless fallback;
8. notification scheduling, tests, accessibility, README, `AGENTS.md`, architecture/contracts documentation, and final APK.

The original prompt defines the detailed contracts, invariants, security rules, and required tests. Follow them rather than replacing them with placeholders.

Replace the current placeholder bridge and placeholder UI with real bounded behavior. A declared dependency is not an implementation. A mock is not a live adapter. Demo data must be explicitly labeled and isolated from real data.

## Verification discipline

Run narrow tests after each layer and update `NIGHTLY_STATUS.md` after every milestone. The final verification must include, at minimum:

```text
gradlew.bat test
gradlew.bat assembleDebug
```

Run the standalone Node.js tests for the deterministic JavaScript engine when present. Tests must be hermetic and must not require a real Gemini key, network quota, watch, or Health Connect installation.

Before finishing:

- inspect all changed paths and confirm every implementation change is under `coach-android/**`;
- verify missing values never become zero;
- verify the app remains useful offline, keyless, and without Health Connect;
- record exact passing/failing commands, test counts, APK path, APK size/hash, limitations, and next three tasks;
- distinguish implemented features from roadmap items;
- leave no milestone marked complete without observed evidence.

Do not stop after fixing the wrapper. Continue through as many original deliverables as possible, prioritizing a coherent, tested, installable vertical slice over disconnected stubs.

Begin now: inspect status, create the todo list, update `NIGHTLY_STATUS.md` with the recovered diagnosis, and safely complete the wrapper/bootstrap milestone.

