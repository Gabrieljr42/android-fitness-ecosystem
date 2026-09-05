package com.coach.app.health

import com.coach.app.data.SnapshotStore
import com.coach.app.data.SyncCursorState
import com.coach.app.domain.DataSource
import com.coach.app.domain.LogicalDay
import com.coach.app.domain.MetricKeys
import com.coach.app.domain.MetricValue
import com.coach.app.domain.SnapshotHashing
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlin.math.max

class HealthSyncCoordinator(
    private val source: HealthConnectSource,
    private val store: SnapshotStore,
    private val requiredPermissions: Set<String> = AndroidHealthConnectSource.REQUIRED_PERMISSIONS,
    private val readPermissionsByKind: Map<HealthMetricKind, String> =
        AndroidHealthConnectSource.READ_PERMISSIONS_BY_KIND
) {
    suspend fun sync(date: LocalDate, zoneId: ZoneId, nowEpochMs: Long): HealthSyncResult {
        var grantedPermissions = emptySet<String>()
        return try {
            when (source.availability()) {
                HealthAvailability.UNAVAILABLE -> return HealthSyncResult(HealthSyncState.UNAVAILABLE)
                HealthAvailability.PROVIDER_UPDATE_REQUIRED ->
                    return HealthSyncResult(HealthSyncState.PROVIDER_UPDATE_REQUIRED)
                HealthAvailability.AVAILABLE -> Unit
            }

            grantedPermissions = source.grantedPermissions()
            val missingPermissions = requiredPermissions - grantedPermissions
            val allowedKinds = readPermissionsByKind
                .filterValues { it in grantedPermissions }
                .keys
                .toSet()
            if (allowedKinds.isEmpty()) {
                return HealthSyncResult(
                    state = HealthSyncState.PERMISSION_REQUIRED,
                    missingPermissions = missingPermissions.ifEmpty { requiredPermissions }
                )
            }

            // A partial grant is deliberately a bounded read. We do not advance/store the shared
            // cursor because a token scoped to only some record types could hide newly granted
            // metrics on a later sync.
            if (missingPermissions.isNotEmpty()) {
                val samples = source.readForDay(date, zoneId, nowEpochMs, allowedKinds)
                currentCoroutineContext().ensureActive()
                val observed = persistAggregates(
                    input = samples,
                    date = date,
                    zoneId = zoneId,
                    nowEpochMs = nowEpochMs,
                    allowedKinds = allowedKinds
                )
                currentCoroutineContext().ensureActive()
                return HealthSyncResult(
                    state = HealthSyncState.PERMISSION_REQUIRED,
                    observedKeys = observed,
                    missingPermissions = missingPermissions,
                    usedBoundedResync = true,
                    message = "Dados autorizados sincronizados; faltam permissões para outros sinais."
                )
            }

            val previous = store.syncCursorFor(DataSource.HEALTH_CONNECT)
            val previousWasSameDay = previous?.lastSuccessEpochMs?.let {
                LogicalDay.fromInstant(it, zoneId) == date
            } == true
            var boundedResync = previous == null || previous.cursorToken.isNullOrBlank() || !previousWasSameDay
            var nextToken: String? = null
            var cursorExpired = false
            if (!boundedResync) {
                val changes = source.readChanges(previous!!.cursorToken!!)
                nextToken = changes.nextToken
                cursorExpired = changes.tokenExpired
                boundedResync = changes.tokenExpired || changes.hasChanges
                if (!boundedResync) {
                    currentCoroutineContext().ensureActive()
                    store.recordSyncCursor(previous.copy(
                        cursorToken = nextToken,
                        lastSuccessEpochMs = nowEpochMs,
                        updatedAtEpochMs = nowEpochMs
                    ))
                    return HealthSyncResult(HealthSyncState.NO_CHANGES)
                }
            }

            // Reserve a token before the bounded read whenever readChanges did not already give us
            // a valid next token. Changes written during the read are then visible on the next run.
            if (nextToken == null || cursorExpired) {
                nextToken = source.createChangesToken(allowedKinds)
            }

            val samples = source.readForDay(date, zoneId, nowEpochMs, allowedKinds)
            currentCoroutineContext().ensureActive()
            val observed = persistAggregates(
                input = samples,
                date = date,
                zoneId = zoneId,
                nowEpochMs = nowEpochMs,
                allowedKinds = allowedKinds
            )
            currentCoroutineContext().ensureActive()
            store.recordSyncCursor(SyncCursorState(
                source = DataSource.HEALTH_CONNECT,
                cursorToken = nextToken,
                lastSuccessEpochMs = nowEpochMs,
                updatedAtEpochMs = nowEpochMs
            ))
            HealthSyncResult(
                state = HealthSyncState.SYNCED,
                observedKeys = observed,
                usedBoundedResync = boundedResync
            )
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (security: SecurityException) {
            HealthSyncResult(
                HealthSyncState.PERMISSION_REQUIRED,
                missingPermissions = (requiredPermissions - grantedPermissions)
                    .ifEmpty { requiredPermissions },
                message = "Permissão do Health Connect foi revogada."
            )
        } catch (_: Exception) {
            HealthSyncResult(HealthSyncState.ERROR, message = "Falha ao ler o Health Connect; tente novamente.")
        }
    }

    internal fun persistAggregates(
        input: List<HealthSample>,
        date: LocalDate,
        zoneId: ZoneId,
        nowEpochMs: Long,
        allowedKinds: Set<HealthMetricKind> = HealthMetricKind.entries.toSet()
    ): Set<String> {
        val unique = input.distinctBy { "${it.kind}:${it.originPackage}:${it.recordId}" }
        val observed = linkedSetOf<String>()

        if (HealthMetricKind.SLEEP in allowedKinds) {
            val sleep = unique.filter {
                it.kind == HealthMetricKind.SLEEP &&
                    LogicalDay.sessionDay(it.startEpochMs, it.endEpochMs, zoneId) == date
            }
            persistOrDelete(MetricKeys.SLEEP_MINUTES, "min", date, sleep, nowEpochMs, observed) {
                reconciledIntervalTotal(
                    rows = it,
                    windowStart = it.minOf(HealthSample::startEpochMs),
                    windowEnd = it.maxOf(HealthSample::endEpochMs)
                ).coerceAtMost(1_440.0)
            }
        }

        val dayStart = date.atStartOfDay(zoneId).toInstant().toEpochMilli()
        val dayEnd = date.plusDays(1).atStartOfDay(zoneId).toInstant().toEpochMilli()
        if (HealthMetricKind.STEPS in allowedKinds) {
            val steps = unique.filter {
                it.kind == HealthMetricKind.STEPS &&
                    it.endEpochMs > dayStart &&
                    it.startEpochMs < dayEnd
            }
            persistOrDelete(MetricKeys.STEPS, "count", date, steps, nowEpochMs, observed) { rows ->
                reconciledIntervalTotal(rows, dayStart, dayEnd)
            }
        }

        if (HealthMetricKind.RESTING_HEART_RATE in allowedKinds) {
            val rhr = unique.filter { it.kind == HealthMetricKind.RESTING_HEART_RATE }
            persistOrDelete(MetricKeys.RESTING_HEART_RATE, "bpm", date, rhr, nowEpochMs, observed) {
                it.maxBy(HealthSample::endEpochMs).value
            }
        }

        if (HealthMetricKind.WEIGHT in allowedKinds) {
            val weight = unique.filter { it.kind == HealthMetricKind.WEIGHT }
            persistOrDelete(MetricKeys.WEIGHT_KG, "kg", date, weight, nowEpochMs, observed) {
                it.maxBy(HealthSample::endEpochMs).value
            }
        }
        return observed
    }

    /**
     * Defensive reconciliation for fake/legacy sources. Production activity and sleep arrive as a
     * single Health Connect aggregate, but selecting the highest rate over overlapping intervals
     * also prevents obvious double counting if a raw multi-origin source is ever supplied.
     */
    private fun reconciledIntervalTotal(
        rows: List<HealthSample>,
        windowStart: Long,
        windowEnd: Long
    ): Double {
        if (rows.isEmpty() || windowEnd < windowStart) return 0.0
        val intervals = rows.mapNotNull { row ->
            val start = maxOf(row.startEpochMs, windowStart)
            val end = minOf(row.endEpochMs, windowEnd)
            if (end <= start) null else ReconciledInterval(row, start, end)
        }
        val pointTotal = rows
            .filter { it.startEpochMs == it.endEpochMs && it.startEpochMs in windowStart..windowEnd }
            .groupBy(HealthSample::startEpochMs)
            .values
            .sumOf { atSameInstant -> atSameInstant.maxOf(HealthSample::value) }
        if (intervals.isEmpty()) return pointTotal

        val boundaries = intervals.flatMap { listOf(it.start, it.end) }.distinct().sorted()
        val intervalTotal = boundaries.zipWithNext().sumOf { (segmentStart, segmentEnd) ->
            val highestRate = intervals.asSequence()
                .filter { it.start < segmentEnd && it.end > segmentStart }
                .maxOfOrNull { interval ->
                    interval.row.value / max(1L, interval.row.endEpochMs - interval.row.startEpochMs)
                } ?: 0.0
            highestRate * (segmentEnd - segmentStart).toDouble()
        }
        return intervalTotal + pointTotal
    }

    private data class ReconciledInterval(
        val row: HealthSample,
        val start: Long,
        val end: Long
    )

    private fun persistOrDelete(
        key: String,
        unit: String,
        date: LocalDate,
        rows: List<HealthSample>,
        nowEpochMs: Long,
        observed: MutableSet<String>,
        aggregate: (List<HealthSample>) -> Double
    ) {
        val stableId = "hc:daily:$key:$date"
        if (rows.isEmpty()) {
            store.deleteSourceRecord(stableId)
            return
        }
        val evidence = rows.map { "${it.originPackage}:${it.recordId}" }.sorted().joinToString("|")
        val metric = MetricValue.observed(
            key = key,
            value = aggregate(rows),
            unit = unit,
            source = DataSource.HEALTH_CONNECT,
            sourceRecordId = SnapshotHashing.sha256Hex(evidence),
            observedAtEpochMs = rows.maxOf(HealthSample::endEpochMs)
        )
        store.upsertSourceRecord(stableId, metric, date, nowEpochMs)
        observed += key
    }

}
