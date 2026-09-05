package com.coach.app.data

object Schema {

    const val VERSION = 1

    const val TABLE_SOURCE_RECORD = "source_record"
    const val TABLE_SYNC_CURSOR = "sync_cursor"
    const val TABLE_DAILY_SNAPSHOT = "daily_snapshot"
    const val TABLE_CHECK_IN = "check_in"
    const val TABLE_PLAN_RUN = "plan_run"
    const val TABLE_PROPOSAL = "proposal"
    const val TABLE_GEMINI_OPINION = "gemini_opinion"
    const val TABLE_DECISION = "decision"

    val ALL_TABLES = listOf(
        TABLE_SOURCE_RECORD,
        TABLE_SYNC_CURSOR,
        TABLE_DAILY_SNAPSHOT,
        TABLE_CHECK_IN,
        TABLE_PLAN_RUN,
        TABLE_PROPOSAL,
        TABLE_GEMINI_OPINION,
        TABLE_DECISION
    )

    /**
     * Incremental migration registry. Key = the schema version the step migrates FROM.
     * Every step must be additive/idempotent-safe under a fresh create as well,
     * because onCreate replays all steps in order starting from version 0.
     */
    val MIGRATIONS: Map<Int, List<String>> = mapOf(
        0 to listOf(
            // Normalized, deduplicated upstream records. One row per source identity.
            // ABSENT slots are never persisted here; absence is derived when snapshots are built.
            """
            CREATE TABLE $TABLE_SOURCE_RECORD (
                id                   TEXT PRIMARY KEY NOT NULL,
                metric_key           TEXT NOT NULL,
                status               TEXT NOT NULL CHECK (status IN ('OBSERVED','INFORMED','ESTIMATED')),
                value                REAL NOT NULL,
                unit                 TEXT NOT NULL,
                confidence           REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
                source               TEXT NOT NULL,
                source_record_ref    TEXT,
                observed_at_epoch_ms INTEGER NOT NULL,
                logical_date         TEXT NOT NULL,
                is_demo              INTEGER NOT NULL CHECK (is_demo IN (0,1)),
                contract_version     INTEGER NOT NULL,
                created_at_epoch_ms  INTEGER NOT NULL,
                updated_at_epoch_ms  INTEGER NOT NULL
            )
            """.trimIndent(),
            "CREATE INDEX idx_source_record_key_date ON $TABLE_SOURCE_RECORD(metric_key, logical_date)",
            // Incremental sync checkpoints per data source. Expired cursors are replaced, never silently reused.
            """
            CREATE TABLE $TABLE_SYNC_CURSOR (
                source                TEXT PRIMARY KEY NOT NULL,
                cursor_token          TEXT,
                last_success_epoch_ms INTEGER,
                updated_at_epoch_ms   INTEGER NOT NULL
            )
            """.trimIndent(),
            // Immutable snapshots keyed by content hash: identical content is never stored twice.
            """
            CREATE TABLE $TABLE_DAILY_SNAPSHOT (
                snapshot_hash       TEXT PRIMARY KEY NOT NULL,
                logical_date        TEXT NOT NULL,
                canonical_json      TEXT NOT NULL,
                is_demo             INTEGER NOT NULL CHECK (is_demo IN (0,1)),
                contract_version    INTEGER NOT NULL,
                created_at_epoch_ms INTEGER NOT NULL
            )
            """.trimIndent(),
            "CREATE INDEX idx_daily_snapshot_date ON $TABLE_DAILY_SNAPSHOT(logical_date)",
            // Subjective check-ins; source column distinguishes real vs demo entries.
            """
            CREATE TABLE $TABLE_CHECK_IN (
                id                       TEXT PRIMARY KEY NOT NULL,
                logical_date             TEXT NOT NULL,
                energy                   INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 5),
                perceived_sleep_quality  INTEGER NOT NULL CHECK (perceived_sleep_quality BETWEEN 1 AND 5),
                motivation               INTEGER NOT NULL CHECK (motivation BETWEEN 1 AND 5),
                soreness_encoded         TEXT NOT NULL,
                joint_pain_flag          INTEGER NOT NULL CHECK (joint_pain_flag IN (0,1)),
                note                     TEXT,
                recorded_at_epoch_ms     INTEGER NOT NULL,
                source                   TEXT NOT NULL,
                is_demo                  INTEGER NOT NULL CHECK (is_demo IN (0,1)),
                contract_version         INTEGER NOT NULL
            )
            """.trimIndent(),
            "CREATE INDEX idx_check_in_date ON $TABLE_CHECK_IN(logical_date)",
            // Deterministic engine runs cached by snapshot hash + engine version.
            """
            CREATE TABLE $TABLE_PLAN_RUN (
                plan_run_id         TEXT PRIMARY KEY NOT NULL,
                snapshot_hash       TEXT NOT NULL,
                engine_version      TEXT NOT NULL,
                output_json         TEXT NOT NULL,
                output_hash         TEXT NOT NULL,
                created_at_epoch_ms INTEGER NOT NULL,
                contract_version    INTEGER NOT NULL,
                UNIQUE (snapshot_hash, engine_version)
            )
            """.trimIndent(),
            "CREATE INDEX idx_plan_run_snapshot ON $TABLE_PLAN_RUN(snapshot_hash)",
            // Granular review-only proposals produced by plan runs.
            """
            CREATE TABLE $TABLE_PROPOSAL (
                proposal_id         TEXT PRIMARY KEY NOT NULL,
                plan_run_id         TEXT NOT NULL REFERENCES $TABLE_PLAN_RUN(plan_run_id),
                target              TEXT NOT NULL,
                operation           TEXT NOT NULL,
                payload_json        TEXT NOT NULL,
                reason              TEXT NOT NULL,
                status              TEXT NOT NULL CHECK (status IN ('pending','accepted','edited','rejected')),
                created_at_epoch_ms INTEGER NOT NULL,
                updated_at_epoch_ms INTEGER NOT NULL,
                contract_version    INTEGER NOT NULL
            )
            """.trimIndent(),
            "CREATE INDEX idx_proposal_plan ON $TABLE_PROPOSAL(plan_run_id)",
            // Validated Gemini opinions cached by snapshot+plan+model+contract version.
            """
            CREATE TABLE $TABLE_GEMINI_OPINION (
                opinion_id          TEXT PRIMARY KEY NOT NULL,
                snapshot_hash       TEXT NOT NULL,
                plan_run_id         TEXT NOT NULL,
                model               TEXT NOT NULL,
                request_json        TEXT NOT NULL,
                response_json       TEXT NOT NULL,
                verdict             TEXT NOT NULL CHECK (verdict IN ('agree','adjust','insufficient_data')),
                confidence          REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
                created_at_epoch_ms INTEGER NOT NULL,
                contract_version    INTEGER NOT NULL,
                UNIQUE (snapshot_hash, plan_run_id, model, contract_version)
            )
            """.trimIndent(),
            "CREATE INDEX idx_gemini_opinion_snapshot ON $TABLE_GEMINI_OPINION(snapshot_hash)",
            // User decisions; application target stays NULL during Night 1 (review-only).
            """
            CREATE TABLE $TABLE_DECISION (
                decision_id         TEXT PRIMARY KEY NOT NULL,
                proposal_id         TEXT NOT NULL REFERENCES $TABLE_PROPOSAL(proposal_id),
                choice              TEXT NOT NULL CHECK (choice IN ('accept','edit','reject')),
                edited_payload_json TEXT,
                decided_at_epoch_ms INTEGER NOT NULL,
                applied_to_source   TEXT,
                contract_version    INTEGER NOT NULL
            )
            """.trimIndent(),
            "CREATE INDEX idx_decision_proposal ON $TABLE_DECISION(proposal_id)"
        )
    )

    fun migrationStepsFrom(fromVersion: Int): List<String> =
        (fromVersion until VERSION).flatMap { step -> MIGRATIONS[step] ?: emptyList() }
}
