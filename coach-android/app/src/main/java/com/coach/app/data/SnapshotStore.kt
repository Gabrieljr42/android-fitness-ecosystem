package com.coach.app.data

import android.content.ContentValues
import android.database.sqlite.SQLiteConstraintException
import com.coach.app.domain.BodyRegion
import com.coach.app.domain.CanonicalJson
import com.coach.app.domain.CheckIn
import com.coach.app.domain.DataSource
import com.coach.app.domain.DailySnapshot
import com.coach.app.domain.MetricStatus
import com.coach.app.domain.MetricValue
import com.coach.app.domain.SorenessLevel
import java.time.LocalDate

data class StoredSnapshot(
    val snapshotHash: String,
    val logicalDate: LocalDate,
    val canonicalJson: String,
    val isDemo: Boolean,
    val contractVersion: Int,
    val createdAtEpochMs: Long
)

data class StoredPlanRun(
    val planRunId: String,
    val snapshotHash: String,
    val engineVersion: String,
    val outputJson: String,
    val outputHash: String,
    val createdAtEpochMs: Long,
    val contractVersion: Int
)

data class StoredGeminiOpinion(
    val snapshotHash: String,
    val planRunId: String,
    val model: String,
    val requestJson: String,
    val responseJson: String,
    val verdict: String,
    val confidence: Double,
    val createdAtEpochMs: Long,
    val contractVersion: Int
)

data class SyncCursorState(
    val source: DataSource,
    val cursorToken: String?,
    val lastSuccessEpochMs: Long?,
    val updatedAtEpochMs: Long
)

enum class ProposalStatus { PENDING, ACCEPTED, EDITED, REJECTED }

data class ProposalRow(
    val proposalId: String,
    val planRunId: String,
    val target: String,
    val operation: String,
    val payloadJson: String,
    val reason: String,
    val status: ProposalStatus,
    val createdAtEpochMs: Long,
    val updatedEpochMs: Long,
    val contractVersion: Int
)

/**
 * Typed access layer over the versioned Coach database.
 *
 * Invariants:
 * - every write path is idempotent for identical content (stable primary keys);
 * - demo data never mixes with real data (is_demo column on personal-data tables);
 * - snapshots are immutable and keyed by canonical content hash;
 * - absence is derived at snapshot build time and never persisted as zero.
 */
class SnapshotStore(private val db: CoachDatabase) {

    private fun writable() = db.writableDatabase
    private fun readable() = db.readableDatabase

    // ---- source_record -------------------------------------------------

    /** Stable [stableId] must be derived from source identity + time window by the caller. */
    fun upsertSourceRecord(stableId: String, metric: MetricValue, logicalDate: LocalDate, nowEpochMs: Long) {
        require(metric.status != MetricStatus.ABSENT) {
            "absent metrics are not persisted as source records"
        }
        val values = ContentValues().apply {
            put("id", stableId)
            put("metric_key", metric.key)
            put("status", metric.status.name)
            put("value", metric.value!!)
            put("unit", metric.unit)
            put("confidence", metric.confidence)
            put("source", metric.source.name)
            put("source_record_ref", metric.sourceRecordId)
            put("observed_at_epoch_ms", metric.observedAtEpochMs!!)
            put("logical_date", logicalDate.toString())
            put("is_demo", if (metric.source.isDemo) 1 else 0)
            put("contract_version", metric.contractVersion)
        }
        val sql = writable()
        sql.beginTransaction()
        try {
            val existingCreatedAt = readableQuery(
                Schema.TABLE_SOURCE_RECORD, "id = ?", arrayOf(stableId)
            ).use { c -> if (c.moveToFirst()) c.getLong(c.getColumnIndexOrThrow("created_at_epoch_ms")) else null }
            values.put("created_at_epoch_ms", existingCreatedAt ?: nowEpochMs)
            values.put("updated_at_epoch_ms", nowEpochMs)
            sql.insertWithOnConflict(Schema.TABLE_SOURCE_RECORD, null, values, CONFLICT_REPLACE)
            sql.setTransactionSuccessful()
        } finally {
            sql.endTransaction()
        }
    }

    fun sourceRecordsForDate(logicalDate: LocalDate): List<Pair<String, MetricValue>> {
        val rows = mutableListOf<Pair<String, MetricValue>>()
        readableQuery(
            Schema.TABLE_SOURCE_RECORD,
            selection = "logical_date = ?",
            args = arrayOf(logicalDate.toString()),
            orderBy = "observed_at_epoch_ms ASC, id ASC"
        ).use { c ->
            while (c.moveToNext()) {
                val status = MetricStatus.valueOf(c.getString(c.getColumnIndexOrThrow("status")))
                val key = c.getString(c.getColumnIndexOrThrow("metric_key"))
                val value = c.getDouble(c.getColumnIndexOrThrow("value"))
                val unit = c.getString(c.getColumnIndexOrThrow("unit"))
                val confidence = c.getDouble(c.getColumnIndexOrThrow("confidence"))
                val source = DataSource.valueOf(c.getString(c.getColumnIndexOrThrow("source")))
                val ref = if (c.isNull(c.getColumnIndexOrThrow("source_record_ref"))) null
                else c.getString(c.getColumnIndexOrThrow("source_record_ref"))
                val observedAt = c.getLong(c.getColumnIndexOrThrow("observed_at_epoch_ms"))
                val contractVersion = c.getInt(c.getColumnIndexOrThrow("contract_version"))
                val metric = when (status) {
                    MetricStatus.OBSERVED -> MetricValue.observed(key, value, unit, source, ref!!, observedAt, confidence, contractVersion)
                    MetricStatus.INFORMED -> MetricValue.informed(key, value, unit, source, ref!!, observedAt, confidence, contractVersion)
                    MetricStatus.ESTIMATED -> MetricValue.estimated(key, value, unit, source, estimatedAtEpochMs = observedAt, confidence = confidence, contractVersion = contractVersion)
                    MetricStatus.ABSENT -> throw IllegalStateException("absent row persisted in source_record")
                }
                rows.add(c.getString(c.getColumnIndexOrThrow("id")) to metric)
            }
        }
        return rows
    }

    fun countSourceRecords(isDemo: Boolean? = null): Int =
        countWhere(Schema.TABLE_SOURCE_RECORD, isDemo)

    fun deleteSourceRecord(stableId: String): Int =
        writable().delete(Schema.TABLE_SOURCE_RECORD, "id = ?", arrayOf(stableId))

    // ---- sync_cursor ---------------------------------------------------

    fun recordSyncCursor(state: SyncCursorState) {
        val values = ContentValues().apply {
            put("source", state.source.name)
            put("cursor_token", state.cursorToken)
            put("last_success_epoch_ms", state.lastSuccessEpochMs)
            put("updated_at_epoch_ms", state.updatedAtEpochMs)
        }
        writable().insertWithOnConflict(Schema.TABLE_SYNC_CURSOR, null, values, CONFLICT_REPLACE)
    }

    fun syncCursorFor(source: DataSource): SyncCursorState? =
        readableQuery(Schema.TABLE_SYNC_CURSOR, "source = ?", arrayOf(source.name)).use { c ->
            if (!c.moveToFirst()) null else SyncCursorState(
                source = source,
                cursorToken = if (c.isNull(c.getColumnIndexOrThrow("cursor_token"))) null
                else c.getString(c.getColumnIndexOrThrow("cursor_token")),
                lastSuccessEpochMs = if (c.isNull(c.getColumnIndexOrThrow("last_success_epoch_ms"))) null
                else c.getLong(c.getColumnIndexOrThrow("last_success_epoch_ms")),
                updatedAtEpochMs = c.getLong(c.getColumnIndexOrThrow("updated_at_epoch_ms"))
            )
        }

    // ---- daily_snapshot --------------------------------------------------

    /** @return true when the snapshot was new content; false when this hash already exists. */
    fun insertSnapshotIfAbsent(snapshot: DailySnapshot, nowEpochMs: Long): Boolean {
        val values = ContentValues().apply {
            put("snapshot_hash", snapshot.hash)
            put("logical_date", snapshot.logicalDate.toString())
            put("canonical_json", snapshot.canonicalJson)
            put("is_demo", if (snapshot.isDemo) 1 else 0)
            put("contract_version", snapshot.contractVersion)
            put("created_at_epoch_ms", nowEpochMs)
        }
        return writable()
            .insertWithOnConflict(Schema.TABLE_DAILY_SNAPSHOT, null, values, CONFLICT_IGNORE) != -1L
    }

    fun latestSnapshotForDate(logicalDate: LocalDate): StoredSnapshot? =
        readableQuery(
            Schema.TABLE_DAILY_SNAPSHOT,
            selection = "logical_date = ?",
            args = arrayOf(logicalDate.toString()),
            orderBy = "created_at_epoch_ms DESC, snapshot_hash DESC",
            limit = "1"
        ).use { c ->
            if (!c.moveToFirst()) null else StoredSnapshot(
                snapshotHash = c.getString(c.getColumnIndexOrThrow("snapshot_hash")),
                logicalDate = logicalDate,
                canonicalJson = c.getString(c.getColumnIndexOrThrow("canonical_json")),
                isDemo = c.getInt(c.getColumnIndexOrThrow("is_demo")) == 1,
                contractVersion = c.getInt(c.getColumnIndexOrThrow("contract_version")),
                createdAtEpochMs = c.getLong(c.getColumnIndexOrThrow("created_at_epoch_ms"))
            )
        }

    fun snapshotByHash(snapshotHash: String): StoredSnapshot? =
        readableQuery(
            Schema.TABLE_DAILY_SNAPSHOT,
            selection = "snapshot_hash = ?",
            args = arrayOf(snapshotHash),
            limit = "1"
        ).use { c ->
            if (!c.moveToFirst()) null else StoredSnapshot(
                snapshotHash = c.getString(c.getColumnIndexOrThrow("snapshot_hash")),
                logicalDate = LocalDate.parse(c.getString(c.getColumnIndexOrThrow("logical_date"))),
                canonicalJson = c.getString(c.getColumnIndexOrThrow("canonical_json")),
                isDemo = c.getInt(c.getColumnIndexOrThrow("is_demo")) == 1,
                contractVersion = c.getInt(c.getColumnIndexOrThrow("contract_version")),
                createdAtEpochMs = c.getLong(c.getColumnIndexOrThrow("created_at_epoch_ms"))
            )
        }

    // ---- check_in --------------------------------------------------------

    fun upsertCheckIn(checkIn: CheckIn, stableId: String) {
        val values = ContentValues().apply {
            put("id", stableId)
            put("logical_date", checkIn.logicalDate.toString())
            put("energy", checkIn.energy)
            put("perceived_sleep_quality", checkIn.perceivedSleepQuality)
            put("motivation", checkIn.motivation)
            put("soreness_encoded", SorenessCodec.encode(checkIn.soreness))
            put("joint_pain_flag", if (checkIn.jointPainFlag) 1 else 0)
            put("note", checkIn.note)
            put("recorded_at_epoch_ms", checkIn.recordedAtEpochMs)
            put("source", checkIn.source.name)
            put("is_demo", if (checkIn.source.isDemo) 1 else 0)
            put("contract_version", checkIn.contractVersion)
        }
        writable().insertWithOnConflict(Schema.TABLE_CHECK_IN, null, values, CONFLICT_REPLACE)
    }

    fun latestCheckInForDate(logicalDate: LocalDate): CheckIn? =
        readableQuery(
            Schema.TABLE_CHECK_IN,
            selection = "logical_date = ?",
            args = arrayOf(logicalDate.toString()),
            orderBy = "recorded_at_epoch_ms DESC, id DESC",
            limit = "1"
        ).use { c ->
            if (!c.moveToFirst()) null else CheckIn(
                logicalDate = logicalDate,
                energy = c.getInt(c.getColumnIndexOrThrow("energy")),
                perceivedSleepQuality = c.getInt(c.getColumnIndexOrThrow("perceived_sleep_quality")),
                motivation = c.getInt(c.getColumnIndexOrThrow("motivation")),
                soreness = SorenessCodec.decode(c.getString(c.getColumnIndexOrThrow("soreness_encoded"))),
                jointPainFlag = c.getInt(c.getColumnIndexOrThrow("joint_pain_flag")) == 1,
                note = if (c.isNull(c.getColumnIndexOrThrow("note"))) null
                else c.getString(c.getColumnIndexOrThrow("note")),
                recordedAtEpochMs = c.getLong(c.getColumnIndexOrThrow("recorded_at_epoch_ms")),
                source = DataSource.valueOf(c.getString(c.getColumnIndexOrThrow("source"))),
                contractVersion = c.getInt(c.getColumnIndexOrThrow("contract_version"))
            )
        }

    // ---- plan_run ---------------------------------------------------------

    /** @return true when inserted; false when a run for (hash, engineVersion) already existed. */
    fun insertPlanRunIfAbsent(
        planRunId: String,
        snapshotHash: String,
        engineVersion: String,
        outputJson: String,
        outputHash: String,
        createdAtEpochMs: Long,
        contractVersion: Int
    ): Boolean {
        val values = ContentValues().apply {
            put("plan_run_id", planRunId)
            put("snapshot_hash", snapshotHash)
            put("engine_version", engineVersion)
            put("output_json", outputJson)
            put("output_hash", outputHash)
            put("created_at_epoch_ms", createdAtEpochMs)
            put("contract_version", contractVersion)
        }
        return writable()
            .insertWithOnConflict(Schema.TABLE_PLAN_RUN, null, values, CONFLICT_IGNORE) != -1L
    }

    fun planRunById(planRunId: String): StoredPlanRun? =
        readableQuery(
            Schema.TABLE_PLAN_RUN,
            selection = "plan_run_id = ?",
            args = arrayOf(planRunId),
            limit = "1"
        ).use { c ->
            if (!c.moveToFirst()) null else StoredPlanRun(
                planRunId = c.getString(c.getColumnIndexOrThrow("plan_run_id")),
                snapshotHash = c.getString(c.getColumnIndexOrThrow("snapshot_hash")),
                engineVersion = c.getString(c.getColumnIndexOrThrow("engine_version")),
                outputJson = c.getString(c.getColumnIndexOrThrow("output_json")),
                outputHash = c.getString(c.getColumnIndexOrThrow("output_hash")),
                createdAtEpochMs = c.getLong(c.getColumnIndexOrThrow("created_at_epoch_ms")),
                contractVersion = c.getInt(c.getColumnIndexOrThrow("contract_version"))
            )
        }

    // ---- proposal / decision ----------------------------------------------

    /**
     * Inserts a deterministic proposal once.
     *
     * A proposal may already have a decision attached when the same snapshot is
     * rendered again. Replacing that row would either erase its status or violate
     * the decision foreign key, so an existing proposal is deliberately immutable.
     */
    fun upsertProposal(proposal: ProposalRow): Boolean {
        val values = ContentValues().apply {
            put("proposal_id", proposal.proposalId)
            put("plan_run_id", proposal.planRunId)
            put("target", proposal.target)
            put("operation", proposal.operation)
            put("payload_json", proposal.payloadJson)
            put("reason", proposal.reason)
            put("status", proposal.status.name.lowercase())
            put("created_at_epoch_ms", proposal.createdAtEpochMs)
            put("updated_at_epoch_ms", proposal.updatedEpochMs)
            put("contract_version", proposal.contractVersion)
        }
        val inserted = writable().insertWithOnConflict(
            Schema.TABLE_PROPOSAL,
            null,
            values,
            CONFLICT_IGNORE
        )
        if (inserted != -1L) return true
        val alreadyExists = readableQuery(
            Schema.TABLE_PROPOSAL,
            columns = arrayOf("proposal_id"),
            selection = "proposal_id = ?",
            args = arrayOf(proposal.proposalId),
            limit = "1"
        ).use { it.moveToFirst() }
        if (alreadyExists) return false
        throw SQLiteConstraintException("proposal insert violated a database constraint")
    }

    fun setProposalStatus(proposalId: String, status: ProposalStatus, updatedAtEpochMs: Long): Int =
        writable().update(
            Schema.TABLE_PROPOSAL,
            ContentValues().apply {
                put("status", status.name.lowercase())
                put("updated_at_epoch_ms", updatedAtEpochMs)
            },
            "proposal_id = ?", arrayOf(proposalId)
        )

    fun proposalsForPlan(planRunId: String): List<ProposalRow> {
        val rows = mutableListOf<ProposalRow>()
        readableQuery(
            Schema.TABLE_PROPOSAL,
            selection = "plan_run_id = ?",
            args = arrayOf(planRunId),
            orderBy = "created_at_epoch_ms ASC, proposal_id ASC"
        ).use { c ->
            while (c.moveToNext()) {
                rows.add(
                    ProposalRow(
                        proposalId = c.getString(c.getColumnIndexOrThrow("proposal_id")),
                        planRunId = c.getString(c.getColumnIndexOrThrow("plan_run_id")),
                        target = c.getString(c.getColumnIndexOrThrow("target")),
                        operation = c.getString(c.getColumnIndexOrThrow("operation")),
                        payloadJson = c.getString(c.getColumnIndexOrThrow("payload_json")),
                        reason = c.getString(c.getColumnIndexOrThrow("reason")),
                        status = ProposalStatus.valueOf(c.getString(c.getColumnIndexOrThrow("status")).uppercase()),
                        createdAtEpochMs = c.getLong(c.getColumnIndexOrThrow("created_at_epoch_ms")),
                        updatedEpochMs = c.getLong(c.getColumnIndexOrThrow("updated_at_epoch_ms")),
                        contractVersion = c.getInt(c.getColumnIndexOrThrow("contract_version"))
                    )
                )
            }
        }
        return rows
    }

    fun insertDecision(
        decisionId: String,
        proposalId: String,
        choice: String,
        editedPayloadJson: String?,
        decidedAtEpochMs: Long,
        appliedToSource: String?,
        contractVersion: Int
    ) {
        val values = ContentValues().apply {
            put("decision_id", decisionId)
            put("proposal_id", proposalId)
            put("choice", choice)
            put("edited_payload_json", editedPayloadJson)
            put("decided_at_epoch_ms", decidedAtEpochMs)
            put("applied_to_source", appliedToSource)
            put("contract_version", contractVersion)
        }
        writable().insertOrThrow(Schema.TABLE_DECISION, null, values)
    }

    /** Atomically records the first and only decision for a pending proposal. */
    fun recordDecisionIfPending(
        decisionId: String,
        proposalId: String,
        status: ProposalStatus,
        choice: String,
        editedPayloadJson: String?,
        decidedAtEpochMs: Long,
        appliedToSource: String?,
        contractVersion: Int
    ): Boolean {
        val sql = writable()
        var recorded = false
        sql.beginTransaction()
        try {
            val changed = sql.update(
                Schema.TABLE_PROPOSAL,
                ContentValues().apply {
                    put("status", status.name.lowercase())
                    put("updated_at_epoch_ms", decidedAtEpochMs)
                },
                "proposal_id = ? AND status = ?",
                arrayOf(proposalId, ProposalStatus.PENDING.name.lowercase())
            )
            if (changed == 1) {
                val values = ContentValues().apply {
                    put("decision_id", decisionId)
                    put("proposal_id", proposalId)
                    put("choice", choice)
                    put("edited_payload_json", editedPayloadJson)
                    put("decided_at_epoch_ms", decidedAtEpochMs)
                    put("applied_to_source", appliedToSource)
                    put("contract_version", contractVersion)
                }
                sql.insertOrThrow(Schema.TABLE_DECISION, null, values)
                sql.setTransactionSuccessful()
                recorded = true
            }
        } finally {
            sql.endTransaction()
        }
        return recorded
    }

    // ---- gemini_opinion -----------------------------------------------------

    /** @return true when cached; false when an opinion for the same cache key already existed. */
    fun insertGeminiOpinionIfAbsent(
        opinionId: String,
        snapshotHash: String,
        planRunId: String,
        model: String,
        requestJson: String,
        responseJson: String,
        verdict: String,
        confidence: Double,
        createdAtEpochMs: Long,
        contractVersion: Int
    ): Boolean {
        require(confidence in 0.0..1.0 && confidence.isFinite()) { "opinion confidence out of range" }
        val values = ContentValues().apply {
            put("opinion_id", opinionId)
            put("snapshot_hash", snapshotHash)
            put("plan_run_id", planRunId)
            put("model", model)
            put("request_json", requestJson)
            put("response_json", responseJson)
            put("verdict", verdict)
            put("confidence", confidence)
            put("created_at_epoch_ms", createdAtEpochMs)
            put("contract_version", contractVersion)
        }
        return writable()
            .insertWithOnConflict(Schema.TABLE_GEMINI_OPINION, null, values, CONFLICT_IGNORE) != -1L
    }

    fun hasGeminiOpinion(snapshotHash: String, planRunId: String, model: String, contractVersion: Int): Boolean =
        readableQuery(
            Schema.TABLE_GEMINI_OPINION,
            selection = "snapshot_hash = ? AND plan_run_id = ? AND model = ? AND contract_version = ?",
            args = arrayOf(snapshotHash, planRunId, model, contractVersion.toString())
        ).use { it.count > 0 }

    fun geminiOpinion(
        snapshotHash: String,
        planRunId: String,
        model: String,
        contractVersion: Int
    ): StoredGeminiOpinion? = readableQuery(
        Schema.TABLE_GEMINI_OPINION,
        selection = "snapshot_hash = ? AND plan_run_id = ? AND model = ? AND contract_version = ?",
        args = arrayOf(snapshotHash, planRunId, model, contractVersion.toString()),
        limit = "1"
    ).use { c ->
        if (!c.moveToFirst()) null else StoredGeminiOpinion(
            snapshotHash = c.getString(c.getColumnIndexOrThrow("snapshot_hash")),
            planRunId = c.getString(c.getColumnIndexOrThrow("plan_run_id")),
            model = c.getString(c.getColumnIndexOrThrow("model")),
            requestJson = c.getString(c.getColumnIndexOrThrow("request_json")),
            responseJson = c.getString(c.getColumnIndexOrThrow("response_json")),
            verdict = c.getString(c.getColumnIndexOrThrow("verdict")),
            confidence = c.getDouble(c.getColumnIndexOrThrow("confidence")),
            createdAtEpochMs = c.getLong(c.getColumnIndexOrThrow("created_at_epoch_ms")),
            contractVersion = c.getInt(c.getColumnIndexOrThrow("contract_version"))
        )
    }

    /** Removes every locally persisted personal record in foreign-key-safe order. */
    fun clearAllPersonalData(): Int {
        val sql = writable()
        var deleted = 0
        sql.beginTransaction()
        try {
            listOf(
                Schema.TABLE_DECISION,
                Schema.TABLE_GEMINI_OPINION,
                Schema.TABLE_PROPOSAL,
                Schema.TABLE_PLAN_RUN,
                Schema.TABLE_DAILY_SNAPSHOT,
                Schema.TABLE_CHECK_IN,
                Schema.TABLE_SOURCE_RECORD,
                Schema.TABLE_SYNC_CURSOR
            ).forEach { table -> deleted += sql.delete(table, null, null) }
            sql.setTransactionSuccessful()
        } finally {
            sql.endTransaction()
        }
        // Compact free pages so a user-requested deletion does not leave rows in SQLite slack space.
        sql.execSQL("VACUUM")
        return deleted
    }

    // ---- helpers -------------------------------------------------------------

    private fun readableQuery(
        table: String,
        selection: String? = null,
        args: Array<String>? = null,
        orderBy: String? = null,
        limit: String? = null,
        columns: Array<String>? = null
    ) = readable().query(table, columns, selection, args, null, null, orderBy, limit)

    private fun countWhere(table: String, isDemo: Boolean?): Int {
        if (isDemo == null) return readableQuery(table).use { it.count }
        return readableQuery(table, "is_demo = ?", arrayOf(if (isDemo) "1" else "0")).use { it.count }
    }

    companion object {
        private const val CONFLICT_REPLACE = android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE
        private const val CONFLICT_IGNORE = android.database.sqlite.SQLiteDatabase.CONFLICT_IGNORE
    }
}

/** Deterministic, bounded-alphabet encoding of soreness maps for storage. */
object SorenessCodec {

    fun encode(soreness: Map<BodyRegion, SorenessLevel>): String =
        CanonicalJson.write(soreness.entries.associate { (k, v) -> k.name to v.name })

    fun decode(encoded: String): Map<BodyRegion, SorenessLevel> {
        if (encoded == "{}") return emptyMap()
        require(encoded.startsWith("{") && encoded.endsWith("}")) { "malformed soreness payload" }
        val inner = encoded.substring(1, encoded.length - 1)
        if (inner.isBlank()) return emptyMap()
        return inner.split(",").associate { entryRaw ->
            val parts = splitEntry(entryRaw)
            val region = BodyRegion.valueOf(unquote(parts[0]))
            val level = SorenessLevel.valueOf(unquote(parts[1]))
            region to level
        }
    }

    private fun splitEntry(raw: String): List<String> {
        val idx = raw.indexOf(':')
        require(idx > 0) { "malformed soreness entry: $raw" }
        return listOf(raw.substring(0, idx), raw.substring(idx + 1))
    }

    private fun unquote(raw: String): String {
        require(raw.length >= 2 && raw.startsWith("\"") && raw.endsWith("\"")) {
            "malformed soreness token: $raw"
        }
        return raw.substring(1, raw.length - 1)
    }
}
