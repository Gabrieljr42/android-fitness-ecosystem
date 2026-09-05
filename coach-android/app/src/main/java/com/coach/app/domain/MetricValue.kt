package com.coach.app.domain

object MetricKeys {
    const val SLEEP_MINUTES = "recovery.sleepMinutes"
    const val RESTING_HEART_RATE = "recovery.restingHeartRate"
    const val STEPS = "activity.steps"
    const val WEIGHT_KG = "body.weightKg"
    const val RUN_SESSION_COUNT = "running.sessionCount"
    const val RUN_DISTANCE_KM = "running.distanceKm"
    const val RUN_DURATION_MINUTES = "running.durationMinutes"
    const val NUTRITION_MEAL_COUNT = "nutrition.mealCount"
    const val NUTRITION_ENERGY_KCAL = "nutrition.energyKcal"
    const val NUTRITION_PROTEIN_G = "nutrition.proteinG"
    const val NUTRITION_CARBS_G = "nutrition.carbsG"
    const val NUTRITION_FAT_G = "nutrition.fatG"
    const val NUTRITION_WATER_ML = "nutrition.waterMl"
    const val NUTRITION_TARGET_ENERGY_KCAL = "nutrition.target.energyKcal"
    const val NUTRITION_TARGET_PROTEIN_G = "nutrition.target.proteinG"
    const val NUTRITION_TARGET_CARBS_G = "nutrition.target.carbsG"
    const val NUTRITION_TARGET_FAT_G = "nutrition.target.fatG"
    const val NUTRITION_TARGET_WATER_ML = "nutrition.target.waterMl"

    val CORE = listOf(SLEEP_MINUTES, RESTING_HEART_RATE, STEPS, WEIGHT_KG)
    val RUNNING = listOf(RUN_SESSION_COUNT, RUN_DISTANCE_KM, RUN_DURATION_MINUTES)
    val NUTRITION = listOf(
        NUTRITION_MEAL_COUNT, NUTRITION_ENERGY_KCAL, NUTRITION_PROTEIN_G,
        NUTRITION_CARBS_G, NUTRITION_FAT_G, NUTRITION_WATER_ML,
        NUTRITION_TARGET_ENERGY_KCAL, NUTRITION_TARGET_PROTEIN_G,
        NUTRITION_TARGET_CARBS_G, NUTRITION_TARGET_FAT_G, NUTRITION_TARGET_WATER_ML
    )
    val ALL = CORE + RUNNING + NUTRITION
}

data class MetricValue internal constructor(
    val key: String,
    val value: Double?,
    val unit: String,
    val source: DataSource,
    val sourceRecordId: String?,
    val observedAtEpochMs: Long?,
    val status: MetricStatus,
    val confidence: Double,
    val contractVersion: Int
) {

    init {
        require(key.isNotBlank()) { "metric key must not be blank" }
        require(unit.isNotBlank()) { "unit must not be blank" }
        require(confidence in 0.0..1.0) { "confidence out of range: $confidence" }
        when (status) {
            MetricStatus.ABSENT -> {
                require(value == null) { "absent metric must carry no value (got $value)" }
                require(sourceRecordId == null) { "absent metric must carry no source record id" }
                require(observedAtEpochMs == null) { "absent metric must carry no observation instant" }
            }
            MetricStatus.OBSERVED, MetricStatus.INFORMED -> {
                requireNotNull(value) { "$status metric requires a value" }
                require(value.isFinite()) { "$status value must be finite" }
                requireNotNull(sourceRecordId) { "$status metric requires a source record id" }
                requireNotNull(observedAtEpochMs) { "$status metric requires an observation instant" }
            }
            MetricStatus.ESTIMATED -> {
                requireNotNull(value) { "estimated metric requires a value" }
                require(value.isFinite()) { "estimated value must be finite" }
                requireNotNull(observedAtEpochMs) { "estimated metric requires an estimation instant" }
            }
        }
    }

    companion object {
        fun observed(
            key: String,
            value: Double,
            unit: String,
            source: DataSource,
            sourceRecordId: String,
            observedAtEpochMs: Long,
            confidence: Double = 1.0,
            contractVersion: Int = Contract.VERSION
        ): MetricValue = MetricValue(
            key = key,
            value = value,
            unit = unit,
            source = source,
            sourceRecordId = sourceRecordId,
            observedAtEpochMs = observedAtEpochMs,
            status = MetricStatus.OBSERVED,
            confidence = confidence,
            contractVersion = contractVersion
        )

        fun informed(
            key: String,
            value: Double,
            unit: String,
            source: DataSource,
            sourceRecordId: String,
            observedAtEpochMs: Long,
            confidence: Double = 0.9,
            contractVersion: Int = Contract.VERSION
        ): MetricValue = MetricValue(
            key = key,
            value = value,
            unit = unit,
            source = source,
            sourceRecordId = sourceRecordId,
            observedAtEpochMs = observedAtEpochMs,
            status = MetricStatus.INFORMED,
            confidence = confidence,
            contractVersion = contractVersion
        )

        fun estimated(
            key: String,
            value: Double,
            unit: String,
            source: DataSource = DataSource.LOCAL_ESTIMATE,
            estimatedAtEpochMs: Long,
            confidence: Double,
            contractVersion: Int = Contract.VERSION
        ): MetricValue = MetricValue(
            key = key,
            value = value,
            unit = unit,
            source = source,
            sourceRecordId = null,
            observedAtEpochMs = estimatedAtEpochMs,
            status = MetricStatus.ESTIMATED,
            confidence = confidence,
            contractVersion = contractVersion
        )

        fun absent(
            key: String,
            unit: String,
            contractVersion: Int = Contract.VERSION
        ): MetricValue = MetricValue(
            key = key,
            value = null,
            unit = unit,
            source = DataSource.HEALTH_CONNECT,
            sourceRecordId = null,
            observedAtEpochMs = null,
            status = MetricStatus.ABSENT,
            confidence = 0.0,
            contractVersion = contractVersion
        )
    }
}
