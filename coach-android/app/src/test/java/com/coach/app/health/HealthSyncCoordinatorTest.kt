package com.coach.app.health

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.coach.app.data.CoachDatabase
import com.coach.app.data.SnapshotStore
import com.coach.app.data.SyncCursorState
import com.coach.app.domain.DataSource
import com.coach.app.domain.MetricKeys
import com.coach.app.domain.MetricStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
class HealthSyncCoordinatorTest {
    private lateinit var store: SnapshotStore
    private lateinit var fake: FakeHealthSource
    private lateinit var coordinator: HealthSyncCoordinator
    private val date = LocalDate.of(2026, 8, 23)
    private val zone = ZoneId.of("America/Sao_Paulo")
    private val dayStart = date.atStartOfDay(zone).toInstant().toEpochMilli()
    private val permissionMap = linkedMapOf(
        HealthMetricKind.SLEEP to "sleep",
        HealthMetricKind.STEPS to "steps",
        HealthMetricKind.RESTING_HEART_RATE to "rhr",
        HealthMetricKind.WEIGHT to "weight"
    )

    @Before
    fun setUp() {
        store = SnapshotStore(CoachDatabase(ApplicationProvider.getApplicationContext(), null))
        fake = FakeHealthSource()
        coordinator = HealthSyncCoordinator(fake, store, permissionMap.values.toSet(), permissionMap)
    }

    @Test
    fun unavailableNeverReads() = runBlocking {
        fake.available = HealthAvailability.UNAVAILABLE
        assertEquals(HealthSyncState.UNAVAILABLE, coordinator.sync(date, zone, dayStart + 1).state)
        assertEquals(0, fake.readCount)
    }

    @Test
    fun partialPermissionsReadAndPersistAuthorizedKindsWhileReportingMissing() = runBlocking {
        fake.permissions = setOf("sleep", "steps")
        fake.samples = listOf(
            sample(HealthMetricKind.SLEEP, "sleep", dayStart - 7 * HOUR, dayStart, 420.0),
            sample(HealthMetricKind.STEPS, "steps", dayStart, dayStart + HOUR, 1_200.0),
            sample(HealthMetricKind.RESTING_HEART_RATE, "denied", dayStart, dayStart, 55.0)
        )

        val result = coordinator.sync(date, zone, dayStart + 2 * HOUR)

        assertEquals(HealthSyncState.PERMISSION_REQUIRED, result.state)
        assertEquals(setOf("rhr", "weight"), result.missingPermissions)
        assertEquals(setOf(MetricKeys.SLEEP_MINUTES, MetricKeys.STEPS), result.observedKeys)
        assertTrue(result.usedBoundedResync)
        assertEquals(1, fake.readCount)
        assertEquals(setOf(HealthMetricKind.SLEEP, HealthMetricKind.STEPS), fake.lastAllowedKinds)
        assertEquals(2, store.countSourceRecords())
        assertNull(store.syncCursorFor(DataSource.HEALTH_CONNECT))
    }

    @Test
    fun noGrantedPermissionDoesNotRead() = runBlocking {
        fake.permissions = emptySet()
        val result = coordinator.sync(date, zone, dayStart + 1)
        assertEquals(HealthSyncState.PERMISSION_REQUIRED, result.state)
        assertEquals(permissionMap.values.toSet(), result.missingPermissions)
        assertEquals(0, fake.readCount)
    }

    @Test
    fun initialSyncDeduplicatesAndAggregatesWithoutInventingMissingValues() = runBlocking {
        fake.samples = listOf(
            sample(HealthMetricKind.SLEEP, "sleep-1", dayStart - 7 * HOUR, dayStart, 420.0),
            sample(HealthMetricKind.SLEEP, "sleep-1", dayStart - 7 * HOUR, dayStart, 420.0),
            sample(HealthMetricKind.STEPS, "steps-1", dayStart, dayStart + HOUR, 1_200.0),
            sample(HealthMetricKind.STEPS, "steps-2", dayStart + HOUR, dayStart + 2 * HOUR, 800.0),
            sample(HealthMetricKind.RESTING_HEART_RATE, "rhr-old", dayStart - HOUR, dayStart - HOUR, 58.0),
            sample(HealthMetricKind.RESTING_HEART_RATE, "rhr-new", dayStart + HOUR, dayStart + HOUR, 55.0)
        )
        val result = coordinator.sync(date, zone, dayStart + 4 * HOUR)
        assertEquals(HealthSyncState.SYNCED, result.state)
        assertTrue(result.usedBoundedResync)
        val metrics = store.sourceRecordsForDate(date).associate { it.second.key to it.second }
        assertEquals(420.0, metrics[MetricKeys.SLEEP_MINUTES]!!.value!!, 0.0)
        assertEquals(2_000.0, metrics[MetricKeys.STEPS]!!.value!!, 0.0)
        assertEquals(55.0, metrics[MetricKeys.RESTING_HEART_RATE]!!.value!!, 0.0)
        assertNull(metrics[MetricKeys.WEIGHT_KG])
        assertEquals(3, store.countSourceRecords())
        assertTrue(fake.events.indexOf("token") < fake.events.indexOf("read"))
    }

    @Test
    fun observedZeroRemainsObservedAndDistinctFromAbsent() = runBlocking {
        fake.samples = listOf(sample(HealthMetricKind.STEPS, "zero", dayStart, dayStart + HOUR, 0.0))
        coordinator.sync(date, zone, dayStart + 2 * HOUR)
        val metric = store.sourceRecordsForDate(date).single().second
        assertEquals(0.0, metric.value!!, 0.0)
        assertEquals(MetricStatus.OBSERVED, metric.status)
    }

    @Test
    fun overlappingStepsFromPhoneAndWatchAreNotDoubleCounted() = runBlocking {
        fake.samples = listOf(
            HealthSample(HealthMetricKind.STEPS, "same-id", "watch.app", dayStart, dayStart + HOUR, 500.0),
            HealthSample(HealthMetricKind.STEPS, "same-id", "phone.app", dayStart, dayStart + HOUR, 700.0)
        )
        coordinator.sync(date, zone, dayStart + 2 * HOUR)
        assertEquals(700.0, store.sourceRecordsForDate(date).single().second.value!!, 0.0)
    }

    @Test
    fun overlappingSleepFromWatchAndSleepAppIsNotDoubleCounted() = runBlocking {
        fake.samples = listOf(
            HealthSample(
                HealthMetricKind.SLEEP, "watch-session", "watch.app",
                dayStart - 7 * HOUR, dayStart, 420.0
            ),
            HealthSample(
                HealthMetricKind.SLEEP, "sleep-cycle-session", "sleep.cycle",
                dayStart - 7 * HOUR, dayStart, 420.0
            )
        )

        coordinator.sync(date, zone, dayStart + HOUR)

        assertEquals(420.0, store.sourceRecordsForDate(date).single().second.value!!, 0.0)
    }

    @Test
    fun noChangesUsesCursorWithoutFullRead() = runBlocking {
        store.recordSyncCursor(SyncCursorState(DataSource.HEALTH_CONNECT, "old", dayStart + 1, dayStart + 1))
        fake.changes = HealthChangeBatch(false, "next", false)
        val result = coordinator.sync(date, zone, dayStart + HOUR)
        assertEquals(HealthSyncState.NO_CHANGES, result.state)
        assertEquals(0, fake.readCount)
        assertEquals("next", store.syncCursorFor(DataSource.HEALTH_CONNECT)!!.cursorToken)
        assertEquals(listOf("changes"), fake.events)
    }

    @Test
    fun expiredCursorTriggersBoundedResync() = runBlocking {
        store.recordSyncCursor(SyncCursorState(DataSource.HEALTH_CONNECT, "expired", dayStart + 1, dayStart + 1))
        fake.changes = HealthChangeBatch(false, "ignored", true)
        fake.samples = listOf(sample(HealthMetricKind.WEIGHT, "w1", dayStart, dayStart, 81.2))
        val result = coordinator.sync(date, zone, dayStart + HOUR)
        assertEquals(HealthSyncState.SYNCED, result.state)
        assertTrue(result.usedBoundedResync)
        assertEquals(1, fake.readCount)
        assertEquals("fresh", store.syncCursorFor(DataSource.HEALTH_CONNECT)!!.cursorToken)
        assertEquals(listOf("changes", "token", "read"), fake.events)
    }

    @Test
    fun revokedPermissionFailsClosed() = runBlocking {
        fake.throwSecurity = true
        val result = coordinator.sync(date, zone, dayStart + HOUR)
        assertEquals(HealthSyncState.PERMISSION_REQUIRED, result.state)
        assertTrue(result.message!!.contains("revogada"))
    }

    @Test
    fun emptyResyncDeletesStaleDailyAggregate() = runBlocking {
        fake.samples = listOf(sample(HealthMetricKind.WEIGHT, "w1", dayStart, dayStart, 80.0))
        coordinator.sync(date, zone, dayStart + HOUR)
        assertEquals(1, store.countSourceRecords())
        fake.samples = emptyList()
        store.recordSyncCursor(SyncCursorState(DataSource.HEALTH_CONNECT, "old", dayStart + 1, dayStart + 1))
        fake.changes = HealthChangeBatch(true, "next", false)
        coordinator.sync(date, zone, dayStart + 2 * HOUR)
        assertEquals(0, store.countSourceRecords())
    }

    @Test
    fun newLogicalDayForcesBoundedReadEvenWithoutReportedChanges() = runBlocking {
        store.recordSyncCursor(SyncCursorState(
            DataSource.HEALTH_CONNECT, "old", dayStart - HOUR, dayStart - HOUR
        ))
        fake.changes = HealthChangeBatch(false, "next", false)
        fake.samples = listOf(sample(HealthMetricKind.WEIGHT, "carry", dayStart - HOUR, dayStart - HOUR, 81.0))

        val result = coordinator.sync(date, zone, dayStart + HOUR)

        assertEquals(HealthSyncState.SYNCED, result.state)
        assertTrue(result.usedBoundedResync)
        assertEquals(1, fake.readCount)
        assertEquals(81.0, store.sourceRecordsForDate(date).single().second.value!!, 0.0)
        assertEquals(listOf("token", "read"), fake.events)
    }

    @Test
    fun partialSyncDoesNotDeletePreviouslyAuthorizedMetric() = runBlocking {
        fake.samples = listOf(sample(HealthMetricKind.WEIGHT, "w1", dayStart, dayStart, 80.0))
        coordinator.sync(date, zone, dayStart + HOUR)
        assertEquals(80.0, store.sourceRecordsForDate(date).single().second.value!!, 0.0)

        fake.events.clear()
        fake.permissions = setOf("sleep", "steps", "rhr")
        fake.samples = listOf(sample(HealthMetricKind.STEPS, "s1", dayStart, dayStart + HOUR, 900.0))
        val result = coordinator.sync(date, zone, dayStart + 2 * HOUR)

        assertEquals(HealthSyncState.PERMISSION_REQUIRED, result.state)
        val metrics = store.sourceRecordsForDate(date).associate { it.second.key to it.second }
        assertEquals(80.0, metrics[MetricKeys.WEIGHT_KG]!!.value!!, 0.0)
        assertEquals(900.0, metrics[MetricKeys.STEPS]!!.value!!, 0.0)
        assertFalse("token" in fake.events)
    }

    @Test
    fun providerFailureDuringAvailabilityFallsBackToErrorResult() = runBlocking {
        fake.availabilityFailure = IllegalStateException("provider binder died")
        val result = coordinator.sync(date, zone, dayStart + HOUR)
        assertEquals(HealthSyncState.ERROR, result.state)
        assertEquals(0, fake.readCount)
    }

    @Test
    fun providerFailureDuringPermissionLookupFallsBackToErrorResult() = runBlocking {
        fake.permissionsFailure = IllegalStateException("provider binder died")
        val result = coordinator.sync(date, zone, dayStart + HOUR)
        assertEquals(HealthSyncState.ERROR, result.state)
        assertEquals(0, fake.readCount)
    }

    @Test
    fun cancellationIsRethrownAndNothingIsPersisted() = runBlocking {
        fake.readFailure = CancellationException("screen closed")

        var thrown: CancellationException? = null
        try {
            coordinator.sync(date, zone, dayStart + HOUR)
        } catch (cancelled: CancellationException) {
            thrown = cancelled
        }

        assertEquals("screen closed", thrown?.message)
        assertEquals(0, store.countSourceRecords())
        assertNull(store.syncCursorFor(DataSource.HEALTH_CONNECT))
        assertEquals(listOf("token", "read"), fake.events)
    }

    @Test
    fun validNextChangesTokenIsPreservedAcrossBoundedRead() = runBlocking {
        store.recordSyncCursor(SyncCursorState(DataSource.HEALTH_CONNECT, "old", dayStart + 1, dayStart + 1))
        fake.changes = HealthChangeBatch(true, "next-from-changes", false)
        fake.samples = listOf(sample(HealthMetricKind.STEPS, "s", dayStart, dayStart + HOUR, 100.0))

        coordinator.sync(date, zone, dayStart + 2 * HOUR)

        assertEquals("next-from-changes", store.syncCursorFor(DataSource.HEALTH_CONNECT)!!.cursorToken)
        assertEquals(listOf("changes", "read"), fake.events)
    }

    private fun sample(kind: HealthMetricKind, id: String, start: Long, end: Long, value: Double) =
        HealthSample(kind, id, "test.source", start, end, value)

    private class FakeHealthSource : HealthConnectSource {
        var available = HealthAvailability.AVAILABLE
        var permissions = setOf("sleep", "steps", "rhr", "weight")
        var samples: List<HealthSample> = emptyList()
        var changes = HealthChangeBatch(false, "next", false)
        var throwSecurity = false
        var availabilityFailure: Throwable? = null
        var permissionsFailure: Throwable? = null
        var readFailure: Throwable? = null
        var readCount = 0
        var lastAllowedKinds: Set<HealthMetricKind> = emptySet()
        val events = mutableListOf<String>()

        override fun availability(): HealthAvailability {
            availabilityFailure?.let { throw it }
            return available
        }

        override suspend fun grantedPermissions(): Set<String> {
            permissionsFailure?.let { throw it }
            return permissions
        }

        override suspend fun readForDay(date: LocalDate, zoneId: ZoneId, nowEpochMs: Long): List<HealthSample> {
            readCount++
            events += "read"
            if (throwSecurity) throw SecurityException("revoked")
            readFailure?.let { throw it }
            return samples
        }

        override suspend fun readForDay(
            date: LocalDate,
            zoneId: ZoneId,
            nowEpochMs: Long,
            allowedKinds: Set<HealthMetricKind>
        ): List<HealthSample> {
            lastAllowedKinds = allowedKinds
            return readForDay(date, zoneId, nowEpochMs).filter { it.kind in allowedKinds }
        }

        override suspend fun createChangesToken(): String {
            events += "token"
            return "fresh"
        }

        override suspend fun createChangesToken(allowedKinds: Set<HealthMetricKind>): String =
            createChangesToken()

        override suspend fun readChanges(token: String): HealthChangeBatch {
            events += "changes"
            return changes
        }
    }

    companion object {
        private const val HOUR = 3_600_000L
    }
}
