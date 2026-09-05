package com.coach.app.data

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.coach.app.domain.BodyRegion
import com.coach.app.domain.CheckIn
import com.coach.app.domain.Contract
import com.coach.app.domain.DataSource
import com.coach.app.domain.DailySnapshot
import com.coach.app.domain.MetricKeys
import com.coach.app.domain.MetricStatus
import com.coach.app.domain.MetricValue
import com.coach.app.domain.SorenessLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import android.database.sqlite.SQLiteConstraintException
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.ZoneId

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class SnapshotStoreTest {

    private lateinit var db: CoachDatabase
    private lateinit var store: SnapshotStore

    private val date = LocalDate.of(2026, 8, 22)
    private val zone = ZoneId.of("America/Sao_Paulo")

    @Before
    fun setUp() {
        db = CoachDatabase(ApplicationProvider.getApplicationContext(), null)
        store = SnapshotStore(db)
    }

    private fun metric(
        key: String,
        value: Double,
        demo: Boolean = false,
        observedAt: Long = 1_000L,
        status: MetricStatus = MetricStatus.OBSERVED,
        confidence: Double? = null
    ): MetricValue {
        val source =
            if (demo) DataSource.DEMO_HEALTH_CONNECT else DataSource.HEALTH_CONNECT
        val unit = when (key) {
            MetricKeys.STEPS -> "count"
            MetricKeys.WEIGHT_KG -> "kg"
            MetricKeys.SLEEP_MINUTES -> "min"
            else -> "bpm"
        }
        return when (status) {
            MetricStatus.OBSERVED -> MetricValue.observed(
                key, value, unit, source, "$key-ref-$observedAt", observedAt,
                confidence ?: 1.0
            )
            MetricStatus.INFORMED -> MetricValue.informed(
                key, value, unit, if (demo) DataSource.DEMO_CHECK_IN else DataSource.CHECK_IN,
                "$key-manual-$observedAt", observedAt, confidence ?: 0.9
            )
            MetricStatus.ESTIMATED -> MetricValue.estimated(
                key, value, unit, estimatedAtEpochMs = observedAt, confidence = confidence ?: 0.5
            )
            MetricStatus.ABSENT -> throw IllegalArgumentException("use MetricValue.absent directly")
        }
    }

    private fun snapshotOf(vararg metrics: MetricValue): DailySnapshot {
        val map = linkedMapOf<String, MetricValue>()
        metrics.forEach { map[it.key] = it }
        return DailySnapshot(date, zone, map, null, createdAtEpochMs = 42_000L)
    }

    @Test
    fun allEightTablesAreCreated() {
        store // forces open
        readableTableNames().let { names ->
            Schema.ALL_TABLES.forEach { table ->
                assertTrue("missing table $table", names.contains(table))
            }
        }
        assertEquals(8, Schema.ALL_TABLES.size)
    }

    @Test
    fun sourceRecordUpsertIsIdempotentByStableId() {
        val m = metric(MetricKeys.SLEEP_MINUTES, 420.0)
        store.upsertSourceRecord("hc:sleep:1", m, date, nowEpochMs = 10L)
        store.upsertSourceRecord("hc:sleep:1", m, date, nowEpochMs = 20L)
        assertEquals(1, store.countSourceRecords())

        val rows = store.sourceRecordsForDate(date)
        assertEquals(1, rows.size)
        assertEquals("hc:sleep:1", rows[0].first)
        assertEquals(420.0, rows[0].second.value!!, 0.0)
        assertEquals(MetricStatus.OBSERVED, rows[0].second.status)
    }

    @Test
    fun updatedValueReplacesRowWithoutDuplicating() {
        store.upsertSourceRecord("hc:steps:1", metric(MetricKeys.STEPS, 8_000.0), date, 10L)
        store.upsertSourceRecord("hc:steps:1", metric(MetricKeys.STEPS, 9_100.0, observedAt = 2_000L), date, 20L)
        assertEquals(1, store.countSourceRecords())
        assertEquals(9_100.0, store.sourceRecordsForDate(date)[0].second.value!!, 0.0)
    }

    @Test
    fun metricRoundTripPreservesProvenanceAndConfidence() {
        val informed = metric(MetricKeys.WEIGHT_KG, 81.3, status = MetricStatus.INFORMED, confidence = 0.85)
        store.upsertSourceRecord("manual:weight:1", informed, date, 10L)
        val (_, restored) = store.sourceRecordsForDate(date).single()
        assertEquals(informed, restored)
    }

    @Test
    fun realAndDemoCountsAreSeparable() {
        store.upsertSourceRecord("r1", metric(MetricKeys.SLEEP_MINUTES, 400.0), date, 10L)
        store.upsertSourceRecord("d1", metric(MetricKeys.SLEEP_MINUTES, 410.0, demo = true), date, 11L)
        assertEquals(1, store.countSourceRecords(isDemo = false))
        assertEquals(1, store.countSourceRecords(isDemo = true))
        assertEquals(2, store.countSourceRecords())
    }

    @Test
    fun syncCursorRoundTrips() {
        assertNull(store.syncCursorFor(DataSource.HEALTH_CONNECT))
        store.recordSyncCursor(SyncCursorState(DataSource.HEALTH_CONNECT, "token-abc", 5_000L, 6_000L))
        val cursor = store.syncCursorFor(DataSource.HEALTH_CONNECT)!!
        assertEquals("token-abc", cursor.cursorToken)
        assertEquals(5_000L, cursor.lastSuccessEpochMs)
        store.recordSyncCursor(SyncCursorState(DataSource.HEALTH_CONNECT, null, null, 7_000L))
        val cleared = store.syncCursorFor(DataSource.HEALTH_CONNECT)!!
        assertNull(cleared.cursorToken)
        assertNull(cleared.lastSuccessEpochMs)
    }

    @Test
    fun identicalSnapshotContentIsStoredOnce() {
        val snapshot = snapshotOf(metric(MetricKeys.SLEEP_MINUTES, 420.0), metric(MetricKeys.STEPS, 8_000.0))
        assertTrue(store.insertSnapshotIfAbsent(snapshot, nowEpochMs = 100L))
        assertFalse(store.insertSnapshotIfAbsent(snapshot, nowEpochMs = 200L))

        val stored = store.latestSnapshotForDate(date)!!
        assertEquals(snapshot.hash, stored.snapshotHash)
        assertEquals(snapshot.canonicalJson, stored.canonicalJson)
        assertEquals(false, stored.isDemo)
        assertEquals(snapshot.canonicalJson, store.snapshotByHash(snapshot.hash)!!.canonicalJson)
        assertNull(store.snapshotByHash("missing"))
    }

    @Test
    fun latestSnapshotForDateReturnsMostRecent() {
        val older = snapshotOf(metric(MetricKeys.SLEEP_MINUTES, 400.0))
        val newer = snapshotOf(metric(MetricKeys.SLEEP_MINUTES, 430.0))
        assertTrue(store.insertSnapshotIfAbsent(older, nowEpochMs = 100L))
        assertTrue(store.insertSnapshotIfAbsent(newer, nowEpochMs = 200L))
        assertEquals(newer.hash, store.latestSnapshotForDate(date)!!.snapshotHash)

        assertNull(store.latestSnapshotForDate(LocalDate.of(2026, 8, 21)))
    }

    @Test
    fun checkInRoundTripPreservesAllFields() {
        val checkIn = CheckIn(
            logicalDate = date,
            energy = 4, perceivedSleepQuality = 3, motivation = 5,
            soreness = mapOf(BodyRegion.QUADS to SorenessLevel.MILD, BodyRegion.CALVES to SorenessLevel.NONE),
            jointPainFlag = false,
            note = "dormi bem, treino pesado hoje",
            recordedAtEpochMs = 77_000L
        )
        store.upsertCheckIn(checkIn, "ci:$date")
        val restored = store.latestCheckInForDate(date)!!
        assertEquals(checkIn, restored)

        store.upsertCheckIn(checkIn.copy(note = null), "ci:$date")
        assertNull(store.latestCheckInForDate(date)!!.note)
    }

    @Test
    fun sorenessCodecRoundTripAndRejectsGarbage() {
        val encoded = SorenessCodec.encode(mapOf(BodyRegion.HAMSTRINGS to SorenessLevel.MODERATE))
        assertEquals(mapOf(BodyRegion.HAMSTRINGS to SorenessLevel.MODERATE), SorenessCodec.decode(encoded))
        assertEquals(emptyMap<BodyRegion, SorenessLevel>(), SorenessCodec.decode("{}"))
        try {
            SorenessCodec.decode("{NOT_A_REGION:\"NONE\"}")
            throw AssertionError("decode should reject unknown region")
        } catch (expected: IllegalArgumentException) {
        }
    }

    @Test
    fun planRunCachedOncePerSnapshotAndEngine() {
        val snapshot = snapshotOf(metric(MetricKeys.STEPS, 1_234.0))
        val inserted = store.insertPlanRunIfAbsent(
            planRunId = "pr-1",
            snapshotHash = snapshot.hash,
            engineVersion = "v0",
            outputJson = """{"plan":"keep"}""",
            outputHash = "deadbeef",
            createdAtEpochMs = 500L,
            contractVersion = Contract.VERSION
        )
        assertTrue(inserted)
        assertEquals("deadbeef", store.planRunById("pr-1")!!.outputHash)
        assertNull(store.planRunById("missing"))
        val duplicate = store.insertPlanRunIfAbsent(
            planRunId = "pr-2",
            snapshotHash = snapshot.hash,
            engineVersion = "v0",
            outputJson = """{"plan":"keep"}""",
            outputHash = "deadbeef",
            createdAtEpochMs = 600L,
            contractVersion = Contract.VERSION
        )
        assertFalse(duplicate)
        val newEngine = store.insertPlanRunIfAbsent(
            planRunId = "pr-3",
            snapshotHash = snapshot.hash,
            engineVersion = "v1",
            outputJson = """{"plan":"keep"}""",
            outputHash = "feedface",
            createdAtEpochMs = 700L,
            contractVersion = Contract.VERSION
        )
        assertTrue(newEngine)
    }

    @Test
    fun proposalLifecyclePersistsStatusTransitions() {
        val snapshot = snapshotOf(metric(MetricKeys.STEPS, 5_000.0))
        store.insertPlanRunIfAbsent("pr-x", snapshot.hash, "v0", "{}", "h", 1L, Contract.VERSION)
        val proposal = ProposalRow(
            proposalId = "prop-1", planRunId = "pr-x",
            target = "strength.quads", operation = "reduce_set",
            payloadJson = """{"sets":3}""", reason = "soreness moderate",
            status = ProposalStatus.PENDING, createdAtEpochMs = 1L,
            updatedEpochMs = 1L, contractVersion = Contract.VERSION
        )
        store.upsertProposal(proposal)
        assertEquals(1, store.setProposalStatus("prop-1", ProposalStatus.ACCEPTED, updatedAtEpochMs = 99L))
        assertEquals(ProposalStatus.ACCEPTED, store.proposalsForPlan("pr-x").single().status)

        store.insertDecision("dec-1", "prop-1", "accept", null, decidedAtEpochMs = 120L, appliedToSource = null, contractVersion = Contract.VERSION)
        assertNotNull(store.proposalsForPlan("pr-x").single())

        val reinserted = store.upsertProposal(proposal.copy(
            payloadJson = """{"sets":99}""",
            status = ProposalStatus.PENDING,
            createdAtEpochMs = 500L,
            updatedEpochMs = 500L
        ))
        assertFalse(reinserted)
        val restored = store.proposalsForPlan("pr-x").single()
        assertEquals(ProposalStatus.ACCEPTED, restored.status)
        assertEquals("""{"sets":3}""", restored.payloadJson)
        assertEquals(1L, restored.createdAtEpochMs)
    }

    @Test
    fun decisionAndStatusAreAtomicAndOnlyPendingProposalCanBeDecided() {
        val snapshot = snapshotOf(metric(MetricKeys.STEPS, 4_000.0))
        store.insertPlanRunIfAbsent("pr-once", snapshot.hash, "v0", "{}", "h", 1L, Contract.VERSION)
        store.upsertProposal(ProposalRow(
            proposalId = "prop-once", planRunId = "pr-once",
            target = "today.training", operation = "maintain_plan",
            payloadJson = "{\"change\":\"none\"}", reason = "test",
            status = ProposalStatus.PENDING, createdAtEpochMs = 1L,
            updatedEpochMs = 1L, contractVersion = Contract.VERSION
        ))

        assertTrue(store.recordDecisionIfPending(
            "decision-first", "prop-once", ProposalStatus.ACCEPTED, "accept",
            null, 10L, null, Contract.VERSION
        ))
        assertFalse(store.recordDecisionIfPending(
            "decision-second", "prop-once", ProposalStatus.REJECTED, "reject",
            null, 20L, null, Contract.VERSION
        ))
        val proposal = store.proposalsForPlan("pr-once").single()
        assertEquals(ProposalStatus.ACCEPTED, proposal.status)
        assertEquals(10L, proposal.updatedEpochMs)
    }

    @Test
    fun foreignKeysRejectOrphanProposal() {
        val orphan = ProposalRow(
            proposalId = "orphan", planRunId = "missing-plan",
            target = "strength.session", operation = "increase_rir",
            payloadJson = "{\"rirDelta\":1}", reason = "test",
            status = ProposalStatus.PENDING, createdAtEpochMs = 1L,
            updatedEpochMs = 1L, contractVersion = Contract.VERSION
        )
        try {
            store.upsertProposal(orphan)
            throw AssertionError("orphan proposal should violate foreign key")
        } catch (_: SQLiteConstraintException) {
        }
    }

    @Test
    fun geminiOpinionCacheKeyedOncePerModelAndContract() {
        val snapshot = snapshotOf(metric(MetricKeys.STEPS, 6_000.0))
        store.insertPlanRunIfAbsent("pr-y", snapshot.hash, "v0", "{}", "h", 1L, Contract.VERSION)
        val first = store.insertGeminiOpinionIfAbsent(
            opinionId = "op-1", snapshotHash = snapshot.hash, planRunId = "pr-y",
            model = "gemini-test", requestJson = "{}", responseJson = """{"verdict":"agree"}""",
            verdict = "agree", confidence = 0.8, createdAtEpochMs = 10L, contractVersion = Contract.VERSION
        )
        assertTrue(first)
        val cachedDuplicate = store.insertGeminiOpinionIfAbsent(
            opinionId = "op-2", snapshotHash = snapshot.hash, planRunId = "pr-y",
            model = "gemini-test", requestJson = "{}", responseJson = """{"verdict":"adjust"}""",
            verdict = "adjust", confidence = 0.7, createdAtEpochMs = 20L, contractVersion = Contract.VERSION
        )
        assertFalse(cachedDuplicate)
        assertTrue(store.hasGeminiOpinion(snapshot.hash, "pr-y", "gemini-test", Contract.VERSION))
        assertFalse(store.hasGeminiOpinion(snapshot.hash, "pr-y", "other-model", Contract.VERSION))
        val restored = store.geminiOpinion(snapshot.hash, "pr-y", "gemini-test", Contract.VERSION)!!
        assertEquals("agree", restored.verdict)
        assertEquals(0.8, restored.confidence, 0.0)
    }

    @Test
    fun clearAllPersonalDataRemovesRecordsAndCursors() {
        val snapshot = snapshotOf(metric(MetricKeys.STEPS, 7_000.0))
        store.upsertSourceRecord("hc:steps:clear", metric(MetricKeys.STEPS, 7_000.0), date, 1L)
        store.recordSyncCursor(SyncCursorState(DataSource.HEALTH_CONNECT, "token", 1L, 1L))
        store.insertSnapshotIfAbsent(snapshot, 1L)

        assertTrue(store.clearAllPersonalData() >= 3)
        assertEquals(0, store.countSourceRecords())
        assertNull(store.syncCursorFor(DataSource.HEALTH_CONNECT))
        assertNull(store.latestSnapshotForDate(date))
    }

    private fun readableTableNames(): Set<String> {
        val names = mutableSetOf<String>()
        db.readableDatabase.rawQuery(
            "SELECT name FROM sqlite_master WHERE type='table'",
            emptyArray()
        ).use { c ->
            while (c.moveToNext()) names.add(c.getString(0))
        }
        return names
    }
}
