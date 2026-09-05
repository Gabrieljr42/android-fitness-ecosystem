package com.coach.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class MetricValueTest {

    @Test
    fun absentMetricHasNoNumericValue() {
        val absent = MetricValue.absent(MetricKeys.SLEEP_MINUTES, "min")
        assertNull(absent.value)
        assertNull(absent.sourceRecordId)
        assertNull(absent.observedAtEpochMs)
        assertEquals(0.0, absent.confidence, 0.0)
    }

    @Test
    fun absentIsNotZero() {
        val absent = MetricValue.absent(MetricKeys.STEPS, "count")
        assertNotEquals(0.0, absent.value ?: -1.0)
        assertEquals(MetricStatus.ABSENT, absent.status)
    }

    @Test
    fun observedZeroIsARealZeroAndDistinctFromAbsent() {
        val zero = MetricValue.observed(
            key = MetricKeys.STEPS,
            value = 0.0,
            unit = "count",
            source = DataSource.HEALTH_CONNECT,
            sourceRecordId = "hc-1",
            observedAtEpochMs = 1_000L
        )
        assertEquals(0.0, zero.value!!, 0.0)
        assertNotEquals(zero.status, MetricStatus.ABSENT)
    }

    @Test
    fun observedRequiresRecordIdAndInstant() {
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue(
                key = MetricKeys.WEIGHT_KG, value = 80.0, unit = "kg",
                source = DataSource.HEALTH_CONNECT, sourceRecordId = null,
                observedAtEpochMs = 1_000L, status = MetricStatus.OBSERVED,
                confidence = 1.0, contractVersion = Contract.VERSION
            )
        }
    }

    @Test
    fun confidenceBoundsEnforced() {
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue.estimated(
                key = MetricKeys.RESTING_HEART_RATE,
                value = 55.0,
                unit = "bpm",
                estimatedAtEpochMs = 5_000L,
                confidence = 1.5
            )
        }
    }

    @Test
    fun confidenceBoundariesZeroAndOneAccepted() {
        val zeroConfidence = MetricValue.observed(
            key = MetricKeys.STEPS, value = 100.0, unit = "count",
            source = DataSource.HEALTH_CONNECT, sourceRecordId = "r0",
            observedAtEpochMs = 1_000L, confidence = 0.0
        )
        assertEquals(0.0, zeroConfidence.confidence, 0.0)
        val fullConfidence = MetricValue.informed(
            key = MetricKeys.STEPS, value = 200.0, unit = "count",
            source = DataSource.CHECK_IN, sourceRecordId = "r1",
            observedAtEpochMs = 2_000L, confidence = 1.0
        )
        assertEquals(1.0, fullConfidence.confidence, 0.0)
    }

    @Test
    fun confidenceBelowZeroRejectedOnEveryFactory() {
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue.observed(
                key = MetricKeys.STEPS, value = 1.0, unit = "count",
                source = DataSource.HEALTH_CONNECT, sourceRecordId = "r2",
                observedAtEpochMs = 3_000L, confidence = -0.001
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue.informed(
                key = MetricKeys.STEPS, value = 1.0, unit = "count",
                source = DataSource.CHECK_IN, sourceRecordId = "r3",
                observedAtEpochMs = 4_000L, confidence = -1.0
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue.estimated(
                key = MetricKeys.STEPS, value = 1.0, unit = "count",
                estimatedAtEpochMs = 5_000L, confidence = -0.0000001
            )
        }
    }

    @Test
    fun confidenceAboveOneRejectedOnEveryFactory() {
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue.observed(
                key = MetricKeys.SLEEP_MINUTES, value = 420.0, unit = "min",
                source = DataSource.HEALTH_CONNECT, sourceRecordId = "r4",
                observedAtEpochMs = 6_000L, confidence = 1.0001
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue.informed(
                key = MetricKeys.WEIGHT_KG, value = 81.0, unit = "kg",
                source = DataSource.CHECK_IN, sourceRecordId = "r5",
                observedAtEpochMs = 7_000L, confidence = 2.0
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue.estimated(
                key = MetricKeys.RESTING_HEART_RATE, value = 55.0, unit = "bpm",
                estimatedAtEpochMs = 8_000L, confidence = 1.0000001
            )
        }
    }

    @Test
    fun nonFiniteConfidenceRejected() {
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue.observed(
                key = MetricKeys.STEPS, value = 10.0, unit = "count",
                source = DataSource.HEALTH_CONNECT, sourceRecordId = "r6",
                observedAtEpochMs = 9_000L, confidence = Double.NaN
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue.estimated(
                key = MetricKeys.STEPS, value = 10.0, unit = "count",
                estimatedAtEpochMs = 10_000L, confidence = Double.POSITIVE_INFINITY
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            MetricValue.informed(
                key = MetricKeys.WEIGHT_KG, value = 80.0, unit = "kg",
                source = DataSource.CHECK_IN, sourceRecordId = "r7",
                observedAtEpochMs = 11_000L, confidence = Double.NEGATIVE_INFINITY
            )
        }
    }

    @Test
    fun informedCarriesExplicitProvenance() {
        val v = MetricValue.informed(
            key = MetricKeys.WEIGHT_KG,
            value = 81.2,
            unit = "kg",
            source = DataSource.CHECK_IN,
            sourceRecordId = "manual-2026-08-22",
            observedAtEpochMs = 10_000L
        )
        assertEquals(MetricStatus.INFORMED, v.status)
        assertEquals("manual-2026-08-22", v.sourceRecordId)
    }
}
