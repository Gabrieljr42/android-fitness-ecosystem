package com.coach.app.domain

import com.coach.app.data.SnapshotStore
import java.time.LocalDate
import java.time.ZoneId

class DailySnapshotBuilder(
    private val store: SnapshotStore
) {
    fun build(date: LocalDate, zoneId: ZoneId): DailySnapshot {
        val sourceMetrics = store.sourceRecordsForDate(date).map { it.second }
        val records = sourceMetrics.groupBy { it.key }
        val metrics = linkedMapOf<String, MetricValue>()
        SLOT_UNITS.forEach { (key, unit) ->
            metrics[key] = records[key]
                ?.maxWithOrNull(compareBy<MetricValue> { sourcePriority(key, it.source) }
                    .thenBy { it.observedAtEpochMs ?: Long.MIN_VALUE }
                    .thenBy { it.sourceRecordId ?: "" })
                ?: MetricValue.absent(key, unit)
        }
        val checkIn = store.latestCheckInForDate(date)
        // Stable semantic timestamp: rebuilding unchanged inputs must keep the same hash.
        val createdAt = buildList {
            add(date.atStartOfDay(zoneId).toInstant().toEpochMilli())
            sourceMetrics.mapNotNullTo(this) { it.observedAtEpochMs }
            checkIn?.recordedAtEpochMs?.let(::add)
        }.max()
        return DailySnapshot(
            logicalDate = date,
            zoneId = zoneId,
            metrics = metrics,
            checkIn = checkIn,
            createdAtEpochMs = createdAt
        )
    }

    companion object {
        private fun sourcePriority(key: String, source: DataSource): Int = when (key) {
            MetricKeys.WEIGHT_KG -> when (source) {
                DataSource.EVOLUCAO -> 30
                DataSource.HEALTH_CONNECT -> 20
                else -> 10
            }
            in MetricKeys.RUNNING -> when (source) {
                DataSource.STRAVA -> 30
                DataSource.EVOLUCAO -> 20
                else -> 10
            }
            else -> 10
        }

        val SLOT_UNITS = linkedMapOf(
            MetricKeys.SLEEP_MINUTES to "min",
            MetricKeys.STEPS to "count",
            MetricKeys.RESTING_HEART_RATE to "bpm",
            MetricKeys.WEIGHT_KG to "kg",
            MetricKeys.RUN_SESSION_COUNT to "count",
            MetricKeys.RUN_DISTANCE_KM to "km",
            MetricKeys.RUN_DURATION_MINUTES to "min",
            MetricKeys.NUTRITION_MEAL_COUNT to "count",
            MetricKeys.NUTRITION_ENERGY_KCAL to "kcal",
            MetricKeys.NUTRITION_PROTEIN_G to "g",
            MetricKeys.NUTRITION_CARBS_G to "g",
            MetricKeys.NUTRITION_FAT_G to "g",
            MetricKeys.NUTRITION_WATER_ML to "ml",
            MetricKeys.NUTRITION_TARGET_ENERGY_KCAL to "kcal",
            MetricKeys.NUTRITION_TARGET_PROTEIN_G to "g",
            MetricKeys.NUTRITION_TARGET_CARBS_G to "g",
            MetricKeys.NUTRITION_TARGET_FAT_G to "g",
            MetricKeys.NUTRITION_TARGET_WATER_ML to "ml"
        )
    }
}
