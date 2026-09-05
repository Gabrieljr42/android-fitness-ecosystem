package com.coach.app.domain

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.coach.app.data.CoachDatabase
import com.coach.app.data.SnapshotStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.ZoneId

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class DailySnapshotBuilderTest {
    private lateinit var store: SnapshotStore
    private val date = LocalDate.of(2026, 8, 23)
    private val zone = ZoneId.of("America/Sao_Paulo")

    @Before
    fun setUp() {
        store = SnapshotStore(CoachDatabase(ApplicationProvider.getApplicationContext(), null))
    }

    @Test
    fun emptyStoreProducesEveryExplicitAbsentSlot() {
        val snapshot = builder().build(date, zone)
        assertEquals(DailySnapshotBuilder.SLOT_UNITS.keys, snapshot.metrics.keys)
        assertTrue(snapshot.metrics.values.all { it.status == MetricStatus.ABSENT && it.value == null })
        assertNull(snapshot.checkIn)
    }

    @Test
    fun latestObservedMetricAndCheckInAreIncluded() {
        store.upsertSourceRecord("old", MetricValue.observed(
            MetricKeys.WEIGHT_KG, 80.0, "kg", DataSource.HEALTH_CONNECT, "old", 1L
        ), date, 1L)
        store.upsertSourceRecord("new", MetricValue.observed(
            MetricKeys.WEIGHT_KG, 81.0, "kg", DataSource.HEALTH_CONNECT, "new", 2L
        ), date, 2L)
        val checkIn = CheckIn(date, 4, 3, 5, emptyMap(), false, null, 3L)
        store.upsertCheckIn(checkIn, "ci:$date")
        val snapshot = builder().build(date, zone)
        assertEquals(81.0, snapshot.metric(MetricKeys.WEIGHT_KG)!!.value!!, 0.0)
        assertEquals(checkIn, snapshot.checkIn)
        assertEquals(MetricStatus.ABSENT, snapshot.metric(MetricKeys.SLEEP_MINUTES)!!.status)
    }

    @Test
    fun unchangedInputsProduceStableSnapshotHash() {
        val first = builder().build(date, zone)
        val second = builder().build(date, zone)
        assertEquals(first.createdAtEpochMs, second.createdAtEpochMs)
        assertEquals(first.hash, second.hash)
    }

    @Test
    fun evolucaoWeightWinsOverNewerHealthConnectWeight() {
        store.upsertSourceRecord("hc", MetricValue.observed(
            MetricKeys.WEIGHT_KG, 90.0, "kg", DataSource.HEALTH_CONNECT, "hc", 20L
        ), date, 20L)
        store.upsertSourceRecord("evo", MetricValue.observed(
            MetricKeys.WEIGHT_KG, 81.5, "kg", DataSource.EVOLUCAO, "evo", 10L
        ), date, 20L)
        val weight = builder().build(date, zone).metric(MetricKeys.WEIGHT_KG)!!
        assertEquals(81.5, weight.value!!, 0.0)
        assertEquals(DataSource.EVOLUCAO, weight.source)
    }

    private fun builder() = DailySnapshotBuilder(store)
}
