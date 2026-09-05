package com.coach.app.domain

import java.time.LocalDate
import java.time.ZoneId
import java.util.Collections

class DailySnapshot(
    val logicalDate: LocalDate,
    val zoneId: ZoneId,
    metrics: Map<String, MetricValue>,
    val checkIn: CheckIn?,
    val createdAtEpochMs: Long,
    val contractVersion: Int = Contract.VERSION
) {

    val metrics: Map<String, MetricValue> =
        Collections.unmodifiableMap(LinkedHashMap(metrics))

    private val presentMetrics = metrics.values.filter { it.status != MetricStatus.ABSENT }
    val isDemo: Boolean = presentMetrics.any { it.source.isDemo } || checkIn?.source?.isDemo == true

    init {
        require(metrics.isNotEmpty()) { "snapshot requires at least one metric slot" }
        val demoCount = presentMetrics.count { it.source.isDemo }
        require(demoCount == 0 || demoCount == presentMetrics.size) {
            "demo and non-demo metrics must not be mixed in one snapshot"
        }
        if (checkIn != null) {
            require(checkIn.source.isDemo == isDemo) {
                "check-in provenance does not match snapshot provenance"
            }
        }
        require(logicalDate == checkIn?.logicalDate || checkIn == null) {
            "check-in logical date must match the snapshot logical date"
        }
    }

    val canonicalJson: String by lazy { CanonicalJson.write(canonicalMap()) }
    val hash: String by lazy { SnapshotHashing.sha256Hex(canonicalJson) }

    fun metric(key: String): MetricValue? = metrics[key]

    private fun canonicalMap(): Map<String, Any?> = linkedMapOf(
        "contractVersion" to contractVersion,
        "logicalDate" to logicalDate.toString(),
        "zoneId" to zoneId.id,
        "createdAtEpochMs" to createdAtEpochMs,
        "isDemo" to isDemo,
        "checkIn" to (checkIn?.let { c ->
            linkedMapOf(
                "logicalDate" to c.logicalDate.toString(),
                "energy" to c.energy,
                "perceivedSleepQuality" to c.perceivedSleepQuality,
                "motivation" to c.motivation,
                "soreness" to c.soreness.entries.associate { (k, v) -> k.name to v.name },
                "jointPainFlag" to c.jointPainFlag,
                "note" to c.note,
                "recordedAtEpochMs" to c.recordedAtEpochMs,
                "source" to c.source.name,
                "contractVersion" to c.contractVersion
            )
        }),
        "metrics" to metrics.entries.associate { (k, m) ->
            k to linkedMapOf(
                "key" to m.key,
                "value" to m.value,
                "unit" to m.unit,
                "source" to m.source.name,
                "sourceRecordId" to m.sourceRecordId,
                "observedAtEpochMs" to m.observedAtEpochMs,
                "status" to m.status.name,
                "confidence" to m.confidence,
                "contractVersion" to m.contractVersion
            )
        }
    )
}
