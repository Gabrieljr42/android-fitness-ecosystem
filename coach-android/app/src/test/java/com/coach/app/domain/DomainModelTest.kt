package com.coach.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class CheckInTest {

    private fun valid(
        note: String? = null,
        energy: Int = 4,
        soreness: Map<BodyRegion, SorenessLevel> = mapOf(BodyRegion.QUADS to SorenessLevel.MILD),
        jointPainFlag: Boolean = false
    ) = CheckIn(
        logicalDate = LocalDate.of(2026, 8, 22),
        energy = energy,
        perceivedSleepQuality = 3,
        motivation = 4,
        soreness = soreness,
        jointPainFlag = jointPainFlag,
        note = note,
        recordedAtEpochMs = 1_000L
    )

    @Test
    fun scalesAreValidated() {
        assertThrows(IllegalArgumentException::class.java) { valid(energy = 0) }
        assertThrows(IllegalArgumentException::class.java) { valid(energy = 6) }
    }

    @Test
    fun noteLengthIsBounded() {
        assertThrows(IllegalArgumentException::class.java) {
            valid(note = "x".repeat(CheckIn.MAX_NOTE_LENGTH + 1))
        }
        valid(note = "x".repeat(CheckIn.MAX_NOTE_LENGTH))
    }

    @Test
    fun safetyFlagTriggersOnJointPainOrSevereSoreness() {
        assertTrue(!valid().hasSafetyFlag)
        assertTrue(valid(jointPainFlag = true).hasSafetyFlag)
        assertTrue(
            valid(soreness = mapOf(BodyRegion.BACK to SorenessLevel.SEVERE)).hasSafetyFlag
        )
    }
}

class DailySnapshotTest {

    private val zone = ZoneId.of("America/Sao_Paulo")

    private fun metric(key: String, value: Double, demo: Boolean = false): MetricValue =
        if (demo) {
            MetricValue.observed(
                key, value, unitFor(key), DataSource.DEMO_HEALTH_CONNECT,
                "demo-$key", 1_000L
            )
        } else {
            MetricValue.observed(
                key, value, unitFor(key), DataSource.HEALTH_CONNECT,
                "real-$key", 1_000L
            )
        }

    private fun unitFor(key: String) = when (key) {
        MetricKeys.STEPS -> "count"
        MetricKeys.WEIGHT_KG -> "kg"
        MetricKeys.SLEEP_MINUTES -> "min"
        else -> "bpm"
    }

    private fun snapshot(vararg metrics: MetricValue, checkIn: CheckIn? = null): DailySnapshot {
        val map = linkedMapOf<String, MetricValue>()
        metrics.forEach { map[it.key] = it }
        return DailySnapshot(
            logicalDate = LocalDate.of(2026, 8, 22),
            zoneId = zone,
            metrics = map,
            checkIn = checkIn,
            createdAtEpochMs = 42_000L
        )
    }

    @Test
    fun hashIsStableRegardlessOfInsertionOrder() {
        val a = snapshot(
            metric(MetricKeys.SLEEP_MINUTES, 420.0),
            metric(MetricKeys.STEPS, 8_000.0)
        )
        val b = snapshot(
            metric(MetricKeys.STEPS, 8_000.0),
            metric(MetricKeys.SLEEP_MINUTES, 420.0)
        )
        assertEquals(a.hash, b.hash)
        assertEquals(a.canonicalJson, b.canonicalJson)
    }

    @Test
    fun changingAnyFieldChangesHash() {
        val base = snapshot(metric(MetricKeys.SLEEP_MINUTES, 420.0))
        val changed = snapshot(metric(MetricKeys.SLEEP_MINUTES, 421.0))
        assertNotEquals(base.hash, changed.hash)
    }

    @Test
    fun absentMetricsSerializeWithExplicitNulls() {
        val s = snapshot(MetricValue.absent(MetricKeys.SLEEP_MINUTES, "min"))
        assertTrue(s.canonicalJson.contains("\"status\":\"ABSENT\""))
        assertTrue(s.canonicalJson.contains("\"value\":null"))
    }

    @Test
    fun demoAndRealDataCannotMix() {
        assertThrows(IllegalArgumentException::class.java) {
            snapshot(
                metric(MetricKeys.SLEEP_MINUTES, 400.0, demo = true),
                metric(MetricKeys.STEPS, 9_000.0, demo = false)
            )
        }
    }

    @Test
    fun fullyDemoSnapshotIsLabeled() {
        val s = snapshot(
            metric(MetricKeys.SLEEP_MINUTES, 400.0, demo = true),
            metric(MetricKeys.STEPS, 9_000.0, demo = true)
        )
        assertEquals(true, s.isDemo)
        assertTrue(s.canonicalJson.contains("\"isDemo\":true"))
    }

    @Test
    fun absentSlotsAreNeutralInDemoProvenance() {
        val s = snapshot(
            metric(MetricKeys.SLEEP_MINUTES, 400.0, demo = true),
            MetricValue.absent(MetricKeys.WEIGHT_KG, "kg")
        )
        assertTrue(s.isDemo)
        assertEquals(MetricStatus.ABSENT, s.metric(MetricKeys.WEIGHT_KG)!!.status)
    }

    @Test
    fun checkInDateMustMatchSnapshotDate() {
        val mismatchedCheckIn = CheckIn(
            logicalDate = LocalDate.of(2026, 8, 21),
            energy = 3, perceivedSleepQuality = 3, motivation = 3,
            soreness = emptyMap(), jointPainFlag = false, note = null,
            recordedAtEpochMs = 1_000L
        )
        assertThrows(IllegalArgumentException::class.java) {
            snapshot(metric(MetricKeys.SLEEP_MINUTES, 400.0), checkIn = mismatchedCheckIn)
        }
    }
}
