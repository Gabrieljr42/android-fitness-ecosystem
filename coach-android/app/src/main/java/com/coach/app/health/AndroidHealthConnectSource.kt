package com.coach.app.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.coach.app.domain.LogicalDay
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.reflect.KClass

class AndroidHealthConnectSource(private val context: Context) : HealthConnectSource {

    private val client: HealthConnectClient by lazy { HealthConnectClient.getOrCreate(context) }

    override fun availability(): HealthAvailability = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> HealthAvailability.AVAILABLE
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HealthAvailability.PROVIDER_UPDATE_REQUIRED
        else -> HealthAvailability.UNAVAILABLE
    }

    override suspend fun grantedPermissions(): Set<String> =
        if (availability() == HealthAvailability.AVAILABLE) {
            client.permissionController.getGrantedPermissions()
        } else emptySet()

    override suspend fun readForDay(
        date: LocalDate,
        zoneId: ZoneId,
        nowEpochMs: Long
    ): List<HealthSample> = readForDay(
        date = date,
        zoneId = zoneId,
        nowEpochMs = nowEpochMs,
        allowedKinds = HealthMetricKind.entries.toSet()
    )

    override suspend fun readForDay(
        date: LocalDate,
        zoneId: ZoneId,
        nowEpochMs: Long,
        allowedKinds: Set<HealthMetricKind>
    ): List<HealthSample> {
        val dayStart = date.atStartOfDay(zoneId).toInstant()
        val dayEnd = date.plusDays(1).atStartOfDay(zoneId).toInstant()
        val boundedEnd = minOf(dayEnd, Instant.ofEpochMilli(nowEpochMs))
        val samples = mutableListOf<HealthSample>()

        // Activity and sleep are intentionally read through Aggregate API. Health Connect applies
        // the user's origin priority and removes overlapping phone/watch/app data before returning
        // these totals. Raw record summing would double count TicWatch + phone + Sleep Cycle.
        val (sleepStart, sleepWindowEnd) = LogicalDay.recoverySleepWindow(date, zoneId)
        val boundedSleepEnd = minOf(sleepWindowEnd, Instant.ofEpochMilli(nowEpochMs))
        if (HealthMetricKind.SLEEP in allowedKinds && boundedSleepEnd.isAfter(sleepStart)) {
            val result = client.aggregate(
                AggregateRequest(
                    metrics = setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(sleepStart, boundedSleepEnd)
                )
            )
            result[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.let { duration ->
                val origin = aggregateOrigin(result.dataOrigins.map { it.packageName })
                samples += HealthSample(
                    kind = HealthMetricKind.SLEEP,
                    recordId = aggregateRecordId("sleep", date, sleepStart, boundedSleepEnd, origin),
                    originPackage = origin,
                    startEpochMs = sleepStart.toEpochMilli(),
                    endEpochMs = boundedSleepEnd.toEpochMilli(),
                    value = duration.toMillis() / 60_000.0
                )
            }
        }

        if (
            HealthMetricKind.STEPS in allowedKinds &&
            boundedEnd.isAfter(dayStart)
        ) {
            val result = client.aggregate(
                AggregateRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(dayStart, boundedEnd)
                )
            )
            result[StepsRecord.COUNT_TOTAL]?.let { count ->
                val origin = aggregateOrigin(result.dataOrigins.map { it.packageName })
                samples += HealthSample(
                    kind = HealthMetricKind.STEPS,
                    recordId = aggregateRecordId("steps", date, dayStart, boundedEnd, origin),
                    originPackage = origin,
                    startEpochMs = dayStart.toEpochMilli(),
                    endEpochMs = boundedEnd.toEpochMilli(),
                    value = count.toDouble()
                )
            }
        }

        if (HealthMetricKind.RESTING_HEART_RATE in allowedKinds) {
            readAll(RestingHeartRateRecord::class.java.kotlin, dayStart.minusSeconds(7 * 86_400L), boundedEnd)
                .forEach { samples += sample(it) }
        }
        if (HealthMetricKind.WEIGHT in allowedKinds) {
            readAll(WeightRecord::class.java.kotlin, dayStart.minusSeconds(28 * 86_400L), boundedEnd)
                .forEach { samples += sample(it) }
        }
        return samples
    }

    private fun aggregateOrigin(packages: List<String>): String {
        val contributors = packages.filter(String::isNotBlank).distinct().sorted()
        return if (contributors.isEmpty()) {
            "health-connect.aggregate"
        } else {
            "health-connect.aggregate[${contributors.joinToString(",")}]"
        }
    }

    private fun aggregateRecordId(
        metric: String,
        date: LocalDate,
        start: Instant,
        end: Instant,
        origin: String
    ): String = "aggregate:$metric:$date:${start.toEpochMilli()}:${end.toEpochMilli()}:$origin"

    private suspend fun <T : Record> readAll(
        type: kotlin.reflect.KClass<T>,
        start: Instant,
        end: Instant
    ): List<T> {
        if (!end.isAfter(start)) return emptyList()
        val records = mutableListOf<T>()
        var token: String? = null
        var pages = 0
        do {
            pages += 1
            check(pages <= MAX_READ_PAGES) { "Health Connect page limit exceeded" }
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = type,
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                    ascendingOrder = true,
                    pageSize = 1000,
                    pageToken = token
                )
            )
            records += response.records
            token = response.pageToken
        } while (token != null)
        return records
    }

    private fun sample(record: Record): HealthSample {
        val metadata = record.metadata
        val id = metadata.id.ifBlank {
            metadata.clientRecordId ?: "${record::class.java.simpleName}:${metadata.lastModifiedTime.toEpochMilli()}"
        }
        val origin = metadata.dataOrigin.packageName.ifBlank { "health-connect" }
        return when (record) {
            is SleepSessionRecord -> HealthSample(
                HealthMetricKind.SLEEP, id, origin,
                record.startTime.toEpochMilli(), record.endTime.toEpochMilli(),
                (record.endTime.toEpochMilli() - record.startTime.toEpochMilli()) / 60_000.0
            )
            is StepsRecord -> HealthSample(
                HealthMetricKind.STEPS, id, origin,
                record.startTime.toEpochMilli(), record.endTime.toEpochMilli(), record.count.toDouble()
            )
            is RestingHeartRateRecord -> HealthSample(
                HealthMetricKind.RESTING_HEART_RATE, id, origin,
                record.time.toEpochMilli(), record.time.toEpochMilli(), record.beatsPerMinute.toDouble()
            )
            is WeightRecord -> HealthSample(
                HealthMetricKind.WEIGHT, id, origin,
                record.time.toEpochMilli(), record.time.toEpochMilli(), record.weight.inKilograms
            )
            else -> error("unsupported Health Connect record ${record::class.java.name}")
        }
    }

    override suspend fun createChangesToken(): String = createChangesToken(HealthMetricKind.entries.toSet())

    override suspend fun createChangesToken(allowedKinds: Set<HealthMetricKind>): String {
        val recordTypes = allowedKinds.mapNotNullTo(linkedSetOf()) { RECORD_TYPES_BY_KIND[it] }
        require(recordTypes.isNotEmpty()) { "at least one Health Connect record type is required" }
        return client.getChangesToken(ChangesTokenRequest(recordTypes))
    }

    override suspend fun readChanges(token: String): HealthChangeBatch {
        var current = token
        var changed = false
        var expired = false
        var pages = 0
        do {
            pages += 1
            check(pages <= MAX_CHANGE_PAGES) { "Health Connect change page limit exceeded" }
            val response = client.getChanges(current)
            changed = changed || response.changes.any {
                it is UpsertionChange || it is androidx.health.connect.client.changes.DeletionChange
            }
            expired = expired || response.changesTokenExpired
            current = response.nextChangesToken
        } while (!expired && response.hasMore)
        return HealthChangeBatch(changed, current, expired)
    }

    companion object {
        private const val MAX_READ_PAGES = 20
        private const val MAX_CHANGE_PAGES = 50
        val RECORD_TYPES_BY_KIND: Map<HealthMetricKind, KClass<out Record>> = linkedMapOf(
            HealthMetricKind.SLEEP to SleepSessionRecord::class,
            HealthMetricKind.STEPS to StepsRecord::class,
            HealthMetricKind.RESTING_HEART_RATE to RestingHeartRateRecord::class,
            HealthMetricKind.WEIGHT to WeightRecord::class
        )
        val RECORD_TYPES: Set<KClass<out Record>> = RECORD_TYPES_BY_KIND.values.toSet()

        val READ_PERMISSIONS_BY_KIND: Map<HealthMetricKind, String> = RECORD_TYPES_BY_KIND
            .mapValues { (_, recordType) -> HealthPermission.getReadPermission(recordType) }

        val REQUIRED_PERMISSIONS: Set<String> = READ_PERMISSIONS_BY_KIND.values.toSet()
    }
}
