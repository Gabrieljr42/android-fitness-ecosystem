package com.coach.app.health

import java.time.LocalDate
import java.time.ZoneId

enum class HealthAvailability {
    AVAILABLE,
    PROVIDER_UPDATE_REQUIRED,
    UNAVAILABLE
}

enum class HealthMetricKind {
    SLEEP,
    STEPS,
    RESTING_HEART_RATE,
    WEIGHT
}

data class HealthSample(
    val kind: HealthMetricKind,
    val recordId: String,
    val originPackage: String,
    val startEpochMs: Long,
    val endEpochMs: Long,
    val value: Double
) {
    init {
        require(recordId.isNotBlank())
        require(originPackage.isNotBlank())
        require(endEpochMs >= startEpochMs)
        require(value.isFinite() && value >= 0.0)
    }
}

data class HealthChangeBatch(
    val hasChanges: Boolean,
    val nextToken: String,
    val tokenExpired: Boolean
)

interface HealthConnectSource {
    fun availability(): HealthAvailability
    suspend fun grantedPermissions(): Set<String>
    suspend fun readForDay(date: LocalDate, zoneId: ZoneId, nowEpochMs: Long): List<HealthSample>

    /**
     * Reads only record types whose permission is currently granted. The default implementation
     * keeps test/fake sources source-compatible while the Android implementation avoids issuing
     * forbidden Health Connect calls in a partial-permission state.
     */
    suspend fun readForDay(
        date: LocalDate,
        zoneId: ZoneId,
        nowEpochMs: Long,
        allowedKinds: Set<HealthMetricKind>
    ): List<HealthSample> = readForDay(date, zoneId, nowEpochMs).filter { it.kind in allowedKinds }

    suspend fun createChangesToken(): String

    /** Creates a token scoped to the same record types that can be read. */
    suspend fun createChangesToken(allowedKinds: Set<HealthMetricKind>): String = createChangesToken()

    suspend fun readChanges(token: String): HealthChangeBatch
}

enum class HealthSyncState {
    SYNCED,
    NO_CHANGES,
    PERMISSION_REQUIRED,
    PROVIDER_UPDATE_REQUIRED,
    UNAVAILABLE,
    ERROR
}

data class HealthSyncResult(
    val state: HealthSyncState,
    val observedKeys: Set<String> = emptySet(),
    val missingPermissions: Set<String> = emptySet(),
    val usedBoundedResync: Boolean = false,
    val message: String? = null
)
