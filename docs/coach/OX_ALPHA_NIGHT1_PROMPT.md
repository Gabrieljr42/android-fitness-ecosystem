# OX Alpha / OpenCode — Coach Night 1

You are the autonomous implementation agent for one bounded overnight build. Work continuously and leave a truthful, runnable result by morning.

## Mission

Build the first vertical slice of **Coach**, a personal, local-first Android performance coach that helps its single user maximize gym progress while preparing to complete a marathon in 2027 safely. Coach combines opportunistic Health Connect data, a 30-second subjective check-in, a deterministic local recommendation engine, and a strictly advisory Gemini second opinion.

The approved product and technical design is in `docs/coach/COACH_DESIGN.md`. Treat it as the source of truth. Do not reopen approved product decisions unless a hard Android/API constraint makes one impossible. In that case, choose the smallest safe adaptation and document it.

## Non-negotiable workspace boundary

You may create and modify files only under:

```text
coach-android/**
```

Everything else is read-only. In particular:

- do not modify `evolucao-android/**`;
- do not modify `nutricao-android/**`;
- do not modify root build scripts, root documentation, `.gitignore`, OpenCode configuration, or this prompt;
- do not restore, stage, commit, stash, rebase, reset, clean, checkout, or otherwise alter existing Git work;
- never use destructive filesystem or Git commands;
- do not push, publish, upload artifacts, open a PR, or send messages externally;
- do not inspect secret files, environment-variable dumps, browser profiles, credentials, keystores, or unrelated user data;
- never place an API key, token, health payload, or personal data in source code, fixtures, logs, screenshots, or reports.

Assume existing uncommitted changes belong to the user. At the beginning and end, run a read-only `git status --short` and record it in `coach-android/NIGHTLY_STATUS.md`. If any tool changes an out-of-scope file, stop that operation and revert only your own known change without touching pre-existing content. If safe restoration is not certain, leave the file untouched and document the incident.

## Use OpenCode deliberately

1. Read this prompt and `docs/coach/COACH_DESIGN.md` completely.
2. Inspect `README.md`, `PROJECT.md`, and the two app READMEs for conventions. Read additional existing files only when they answer a concrete implementation question.
3. Use `todowrite` immediately to create a milestone plan. Keep exactly one main implementation item in progress and update the list as work advances.
4. If the `task` tool and built-in subagents are available, use **Explore** only for read-only repository pattern discovery and **Scout** only for current official API/dependency research. Give each a narrow question. The primary Build agent owns all edits, architectural decisions, integration, and verification. Do not create an editing swarm.
5. Use `glob`, `grep`, and `read` before broad shell exploration. Use `edit`/`write` for intentional files and `bash` for builds/tests. Treat compiler and test results as authoritative; LSP diagnostics are advisory.
6. When an API detail may have changed, use `websearch`/`webfetch` only against primary documentation, especially `developer.android.com` and `ai.google.dev`. Do not copy code from blogs or random repositories.
7. Create `coach-android/NIGHTLY_STATUS.md` during Milestone 0 and update it after every milestone. This file is durable memory if the session is compacted. Record decisions, completed work, exact verification commands/results, failures, and the next action. Never claim a command passed unless you actually ran it and observed exit code 0.
8. Do not stop to ask routine questions. Make conservative assumptions consistent with the approved design and record them. Pause only for an unavoidable secret, a destructive action, or a genuinely irreducible decision that would materially change the product. No secret is required to complete the offline slice.

If OpenCode reports context compaction, immediately reread `coach-android/NIGHTLY_STATUS.md`, this prompt, and the relevant section of the design before continuing.

## Time and priority strategy

Implement in this order. A smaller complete vertical slice is more valuable than many disconnected stubs:

1. repository inspection, status report, architecture skeleton;
2. reproducible Gradle build and launchable Android shell;
3. canonical domain model and versioned local database;
4. Health Connect availability/permissions/read path;
5. check-in, snapshot builder, deterministic local engine, briefing UI;
6. Gemini gateway, schema, validator, and offline/keyless behavior;
7. tests, accessibility/polish, README, final debug APK.

If time becomes constrained, preserve in this order: successful build, offline app, real data semantics, local engine/tests, Health Connect, then Gemini. Do not break the local path to finish the remote path.

## Required technical shape

Create a conventional standalone Android Gradle project at `coach-android/` with its own wrapper and a single application module.

- Kotlin native layer.
- A local WebView UI built from HTML/CSS/vanilla JavaScript assets; no CDN, remote font, framework, analytics, or WebView remote content.
- Portuguese-Brazilian user-facing copy.
- A versioned SQLite database. `SQLiteOpenHelper` is acceptable and keeps the dependency surface small.
- A small typed/versioned JavaScript bridge. Every message must have a known operation, contract version, bounded JSON payload, validated fields, structured success/error response, and safe thread handling.
- Android Keystore-backed protection for the Gemini credential. Never embed a real or placeholder-looking secret in assets. It is acceptable to provide a settings screen for the user to enter a key later.
- Dependency and SDK versions must be discovered from installed tooling and current official stable documentation. Prefer stable APIs compatible with the available Android SDK. Do not adopt preview-only APIs merely because a sample uses them.
- Choose the lowest practical `minSdk` that supports the intended Health Connect flow; document the choice. Feature-detect Health Connect at runtime.

Use clear packages such as `data`, `domain`, `health`, `ai`, `bridge`, and `ui` where helpful. Avoid premature abstraction, service locators, global mutable state, and giant Activity files.

## Canonical data model

Implement an immutable `DailySnapshot` shared semantically by Kotlin, JavaScript, persistence, and Gemini request construction. It must represent these domains:

- strength;
- running;
- nutrition;
- body;
- recovery;
- subjective check-in.

Every metric representation must include, as applicable:

```text
value
unit
source
sourceRecordId
observedAt
status = observed | informed | estimated | absent
confidence
contractVersion
```

Absence is explicit. Missing sleep is not zero sleep; missing resting heart rate is not 0 bpm; missing steps is not 0 steps. Add tests that would fail if absence is accidentally collapsed to a number.

Create migrations/schema for at least:

```text
source_record
sync_cursor
daily_snapshot
check_in
plan_run
proposal
gemini_opinion
decision
```

Use stable IDs, timestamps with offsets/instants as appropriate, a logical local date, source provenance, schema versions, and hashes for snapshot/plan caching. Demo records must be clearly labeled and separable from real records. Never silently seed demo data into a real user's active timeline.

## Health Connect vertical slice

Implement a real adapter and onboarding flow, not a pretend toggle. Use the current official Android Health Connect APIs and request only read permissions needed for:

- sleep sessions;
- steps;
- resting heart rate;
- body weight.

Requirements:

- detect unsupported/unavailable/install-required/available states;
- show a rationale before requesting permissions;
- distinguish not requested, denied/revoked, granted with no records, and granted with observed values;
- allow the rest of the app to work when Health Connect is absent;
- read a bounded relevant window and normalize records with source metadata;
- deduplicate by source identity and time window;
- structure synchronization so change tokens/cursors can be used safely; handle expired cursors with a bounded resync if the selected stable API supports them;
- never request write permissions in Night 1;
- never infer a zero from an empty query result.

Use the official `FakeHealthConnectClient` in tests when it is compatible with the selected stable dependency. If it is not compatible, keep the Health Connect client behind an interface, test the normalization/sync logic with an in-project fake, and document the precise incompatibility rather than faking a successful official test.

## Thirty-second check-in

Build a fast input flow for:

- energy;
- perceived sleep quality;
- motivation;
- muscle soreness by broad body region;
- joint pain or a safety flag;
- optional short note.

The UI must be usable with one hand and save locally. Treat the note as untrusted data: it must never be concatenated into system/developer instructions. Bound its length and sanitize it for display and remote serialization.

## Deterministic local engine v0

Implement the first useful, transparent engine as pure testable JavaScript or an equivalently pure domain module exposed to the WebView. For identical input snapshot and engine version, output must be byte-for-byte stable after canonical serialization.

Calculate separate dimensions:

- global recovery;
- muscle readiness by broad region;
- running load/trend;
- fueling/hydration adequacy;
- data coverage/quality.

The first weeks have no personal baseline, so confidence must be low and changes conservative. Make room for a rolling 21–28 day baseline without inventing history. Do not hard-code the belief that running always harms strength or hypertrophy. Use proximity, intensity, volume, involved muscle groups, recovery, fueling, and data confidence.

Candidate interventions progress from least to most disruptive:

1. keep the plan;
2. alter warm-up, rest, or timing advice;
3. adjust target RIR/load;
4. reduce a set;
5. substitute an exercise;
6. reorganize running/strength placement;
7. propose a deload.

Each proposal must contain facts/evidence IDs, reason, expected benefit, cost/trade-off, confidence, and a conservative alternative. A joint-pain/safety flag or unusual symptom blocks aggressive recommendations and produces a non-diagnostic recommendation to stop/escalate appropriately. Do not produce medical diagnosis or treatment advice.

Night 1 proposals are review-only inside Coach. Do not implement writes to Evolução or NutriTrack.

## Briefing experience

Build a polished but bounded morning briefing screen designed for a 05:40 notification. Scheduling the notification is desirable after the core path works; the screen itself is mandatory.

Show:

1. synchronization and data coverage;
2. global and muscle readiness;
3. running load;
4. fueling/hydration status;
5. deterministic local plan;
6. Gemini opinion as a visually separate optional section;
7. granular proposals with accept, edit, and reject controls.

For Night 1, decisions persist locally but do not write to the other apps. Clearly label pending/future application. Show why each result exists and which inputs were absent. Do not use fake precision. Ensure loading, empty, denied, offline, error, and demo states are visually distinct.

The WebView UI must work at approximately 360, 412, and 480 CSS-pixel widths, respect safe areas, have accessible contrast, semantic controls, visible focus, and touch targets around 48dp. Avoid excessive animation. No network-loaded assets.

## Gemini second-opinion contract

The app must be fully useful without Gemini. Implement the remote path only after the local path works.

Create a sanitized `CoachReviewRequest` containing the canonical current snapshot, coverage metadata, 7-day and 28-day aggregates when actually available, the local candidate plan, evidence IDs, non-negotiable boundaries, and schema version. Do not send raw database dumps. Include a user-visible “O que será/foi enviado” representation.

Use Gemini Structured Outputs/JSON Schema. Do **not** use function calling in v1. The response contract is:

```json
{
  "verdict": "agree | adjust | insufficient_data",
  "summary": "string",
  "observations": [
    { "text": "string", "evidenceIds": ["string"] }
  ],
  "concerns": ["string"],
  "suggestedAdjustments": [
    {
      "target": "string",
      "operation": "string",
      "value": "bounded scalar or object",
      "reason": "string",
      "evidenceIds": ["string"]
    }
  ],
  "questions": ["string"],
  "confidence": 0.0
}
```

Make the concrete JSON Schema strict: required fields, enums, bounds, `additionalProperties: false`, array caps, and string-length caps. The local validator must reject:

- malformed or version-incompatible output;
- unsupported targets/operations;
- missing or invented evidence IDs;
- out-of-range changes;
- medical diagnosis/prescription;
- prompt-injection attempts reflected from the user's note;
- responses for a stale snapshot or plan hash;
- oversized payloads.

Gemini never mutates the plan, database, or other applications. Store only a validated opinion keyed by snapshot hash, plan hash, model, and contract version. Clearly separate local plan, Gemini opinion, and final user decision. Show a stable offline/key-missing/rate-limited fallback instead of an error loop.

Use a configurable model identifier and verify the currently supported stable model/API details in official Google documentation. Tests must mock the network; no test may require a real key or quota.

## Security and failure behavior

- Private application database only.
- No analytics or health values in logs.
- Do not enable unsafe WebView file/universal access unless strictly necessary; prefer a hardened local asset loading approach supported by Android.
- Do not expose arbitrary native methods to JavaScript.
- Reject unknown bridge operations and excessive payloads.
- Escape all rendered free text; do not inject check-in notes with `innerHTML`.
- Network calls use explicit timeouts, cancellation, bounded retries, and no secret logging.
- Backup/export, if included, must exclude Gemini key, Gemini cache, and raw recoverable Health Connect records.
- Permission revocation, offline state, duplicate records, timezone changes, midnight crossing, and corrupted/old DB data must fail visibly and safely.
- The app must never call an unavailable source a successful sync.

## Required tests

Add meaningful tests, not placeholder assertions:

- pure engine determinism and invariants;
- absent versus zero for every supported metric;
- local-date and cross-midnight behavior in `America/Sao_Paulo` and at least one other offset;
- Health Connect availability, denial/revocation, empty results, duplicates, and normalization;
- database creation/migration and idempotent upsert/deduplication;
- bridge allowlist, version mismatch, malformed JSON, and payload size;
- Gemini valid fixture, invalid JSON, extra fields, unknown evidence, stale hash, out-of-range adjustment, medical language, and prompt-injection note;
- offline, keyless, and Health-Connect-less snapshot/briefing behavior.

Use fuzz/property-style cases where practical for numeric bounds and malformed payloads. Keep all tests hermetic.

## Build and verification loop

After each meaningful layer, run the narrowest relevant test/build. At the end, run all available checks from inside `coach-android/`, including at minimum the equivalent of:

```text
gradlew test
gradlew assembleDebug
```

Also run JavaScript tests directly with Node if the project includes a separate JS harness and Node is available. Record exact commands, exit codes, test counts, and APK path/hash/size in `NIGHTLY_STATUS.md`. If dependency download or network access fails, retry conservatively, inspect local toolchains/caches, and adapt without touching sibling apps. Never report a build as successful merely because source files look plausible.

Inspect the final diff and verify every path you created or changed is under `coach-android/`. Do not stage or commit.

## Required documentation inside `coach-android/`

Create:

- `README.md`: purpose, architecture, privacy, setup, Health Connect behavior, Gemini key setup, build/test/install instructions, and known limitations;
- `AGENTS.md`: durable project-specific boundaries, commands, architecture invariants, and testing rules for future OpenCode sessions;
- `NIGHTLY_STATUS.md`: live and final execution report;
- an architecture/contract document with the DB schema, snapshot shape, bridge operations, Gemini schema, and future source-app integration boundary.

Do not duplicate false aspirational claims. Clearly distinguish implemented behavior from roadmap items.

## Definition of done for the morning

A strong Night 1 result means:

- `coach-android/` is a coherent standalone Android project;
- a debug APK was actually built, or a precise reproducible blocker is documented after multiple sensible attempts;
- the app launches into a useful briefing with demo mode clearly labeled;
- the check-in creates a real local snapshot and deterministic recommendation;
- Health Connect has a real permission/read adapter and degrades correctly when unavailable;
- Gemini has a secure, schema-constrained, non-authoritative path or a clearly isolated incomplete adapter that cannot harm the offline flow;
- tests cover the important invariants and actual executed results are recorded;
- no file outside `coach-android/` was modified;
- `NIGHTLY_STATUS.md` ends with completed items, incomplete items, exact verification evidence, known risks, and the next three highest-value tasks.

Begin now. First read the design, inspect status and tooling, create the todo plan, then create `coach-android/NIGHTLY_STATUS.md` before writing implementation code.

