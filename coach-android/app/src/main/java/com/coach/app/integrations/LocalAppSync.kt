package com.coach.app.integrations

import android.content.Context
import android.net.Uri
import com.coach.app.data.SnapshotStore
import com.coach.app.data.SyncCursorState
import com.coach.app.domain.DataSource
import com.coach.app.domain.MetricKeys
import com.coach.app.domain.MetricValue
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId

data class LocalMetricRecord(val stableId: String, val metric: MetricValue)

data class LocalSourceStatus(
    val state: String,
    val observedKeys: Set<String> = emptySet(),
    val message: String? = null
) {
    fun toJson(): JSONObject = JSONObject()
        .put("state", state)
        .put("observedKeys", JSONArray(observedKeys.sorted()))
        .put("message", message ?: JSONObject.NULL)
}

data class LocalSourcesSyncResult(
    val evolucao: LocalSourceStatus,
    val nutritrack: LocalSourceStatus
) {
    fun toJson(): JSONObject = JSONObject()
        .put("evolucao", evolucao.toJson())
        .put("nutritrack", nutritrack.toJson())

    companion object {
        fun paused() = LocalSourcesSyncResult(
            LocalSourceStatus("PAUSED", message = "Importação local pausada após exclusão."),
            LocalSourceStatus("PAUSED", message = "Importação local pausada após exclusão.")
        )
    }
}

/**
 * Pulls aggregate, read-only contracts published by the user's other two apps.
 * A valid empty payload removes that day's prior mirror; provider failures keep
 * the last valid local record instead of turning an outage into fabricated zero.
 */
class LocalAppSync(
    context: Context,
    private val store: SnapshotStore
) {
    private val resolver = context.applicationContext.contentResolver

    fun sync(date: LocalDate, zoneId: ZoneId, nowEpochMs: Long): LocalSourcesSyncResult {
        val evolucao = syncProvider(
            source = DataSource.EVOLUCAO,
            uri = EVOLUCAO_URI.buildUpon().appendQueryParameter("date", date.toString()).build(),
            date = date,
            knownKeys = EVOLUCAO_KEYS,
            nowEpochMs = nowEpochMs
        ) { LocalPayloadParser.parseEvolucao(it, date, zoneId) }
        val nutritrack = syncNutriTrack(date, zoneId, nowEpochMs)
        return LocalSourcesSyncResult(evolucao, nutritrack)
    }

    private fun syncNutriTrack(
        date: LocalDate,
        zoneId: ZoneId,
        nowEpochMs: Long
    ): LocalSourceStatus {
        val todayUri = NUTRITRACK_URI.buildUpon().appendQueryParameter("date", date.toString()).build()
        val todayPayload = try { readPayload(todayUri) } catch (_: Exception) { null }
            ?: return LocalSourceStatus("UNAVAILABLE", message = "Aplicativo não instalado, desatualizado ou sem acesso.")

        val todayRecords = try {
            LocalPayloadParser.parseNutriTrack(todayPayload, date, zoneId)
        } catch (_: Exception) {
            return LocalSourceStatus("ERROR", message = "O aplicativo publicou um resumo incompatível.")
        }

        if (todayRecords.isNotEmpty()) {
            val presentIds = todayRecords.mapTo(linkedSetOf()) { it.stableId }
            NUTRITRACK_KEYS.forEach { key ->
                val expected = stableId(DataSource.NUTRITRACK, date, key)
                if (expected !in presentIds) store.deleteSourceRecord(expected)
            }
            todayRecords.forEach { record ->
                store.upsertSourceRecord(record.stableId, record.metric, date, nowEpochMs)
            }
            store.recordSyncCursor(SyncCursorState(DataSource.NUTRITRACK, null, nowEpochMs, nowEpochMs))
            return LocalSourceStatus(
                state = "SYNCED",
                observedKeys = todayRecords.mapTo(linkedSetOf()) { it.metric.key }
            )
        }

        // Se hoje não possui refeições/dados, busca D-1 (dia anterior) como referência
        val dMinusOneDate = date.minusDays(1)
        val d1Uri = NUTRITRACK_URI.buildUpon().appendQueryParameter("date", dMinusOneDate.toString()).build()
        val d1Payload = try { readPayload(d1Uri) } catch (_: Exception) { null }

        if (d1Payload != null) {
            val d1Records = try {
                LocalPayloadParser.parseNutriTrack(d1Payload, dMinusOneDate, zoneId, targetLogicalDate = date)
            } catch (_: Exception) {
                emptyList()
            }

            if (d1Records.isNotEmpty()) {
                val presentIds = d1Records.mapTo(linkedSetOf()) { it.stableId }
                NUTRITRACK_KEYS.forEach { key ->
                    val expected = stableId(DataSource.NUTRITRACK, date, key)
                    if (expected !in presentIds) store.deleteSourceRecord(expected)
                }
                d1Records.forEach { record ->
                    store.upsertSourceRecord(record.stableId, record.metric, date, nowEpochMs)
                }
                store.recordSyncCursor(SyncCursorState(DataSource.NUTRITRACK, null, nowEpochMs, nowEpochMs))
                return LocalSourceStatus(
                    state = "SYNCED",
                    observedKeys = d1Records.mapTo(linkedSetOf()) { it.metric.key },
                    message = "Nutrição de D-1 ($dMinusOneDate) utilizada como referência."
                )
            }
        }

        // Sem registros nem hoje nem em D-1
        NUTRITRACK_KEYS.forEach { key ->
            val expected = stableId(DataSource.NUTRITRACK, date, key)
            store.deleteSourceRecord(expected)
        }
        store.recordSyncCursor(SyncCursorState(DataSource.NUTRITRACK, null, nowEpochMs, nowEpochMs))
        return LocalSourceStatus(
            state = "NO_DATA",
            message = "Nenhum registro para esta data."
        )
    }

    private fun syncProvider(
        source: DataSource,
        uri: Uri,
        date: LocalDate,
        knownKeys: Set<String>,
        nowEpochMs: Long,
        parser: (String) -> List<LocalMetricRecord>
    ): LocalSourceStatus {
        val payload = try { readPayload(uri) } catch (_: Exception) { null }
            ?: return LocalSourceStatus("UNAVAILABLE", message = "Aplicativo não instalado, desatualizado ou sem acesso.")
        val records = try { parser(payload) } catch (_: Exception) {
            return LocalSourceStatus("ERROR", message = "O aplicativo publicou um resumo incompatível.")
        }
        val presentIds = records.mapTo(linkedSetOf()) { it.stableId }
        knownKeys.forEach { key ->
            val expected = stableId(source, date, key)
            if (expected !in presentIds) store.deleteSourceRecord(expected)
        }
        records.forEach { record ->
            store.upsertSourceRecord(record.stableId, record.metric, date, nowEpochMs)
        }
        store.recordSyncCursor(SyncCursorState(source, null, nowEpochMs, nowEpochMs))
        return LocalSourceStatus(
            state = if (records.isEmpty()) "NO_DATA" else "SYNCED",
            observedKeys = records.mapTo(linkedSetOf()) { it.metric.key },
            message = if (records.isEmpty()) "Nenhum registro para esta data." else null
        )
    }

    private fun readPayload(uri: Uri): String? = resolver.query(
        uri, arrayOf("_id", "payload"), null, null, "_id DESC"
    )?.use { cursor ->
        if (!cursor.moveToFirst()) return@use null
        val index = cursor.getColumnIndex("payload")
        if (index < 0 || cursor.isNull(index)) null else cursor.getString(index).takeIf { it.isNotBlank() }
    }

    companion object {
        private val EVOLUCAO_URI by lazy { Uri.parse("content://com.evolucao.treino.workouts/workouts") }
        private val NUTRITRACK_URI by lazy { Uri.parse("content://com.nutricao.app.nutrition/daily") }
        private val EVOLUCAO_KEYS = setOf(
            MetricKeys.WEIGHT_KG, MetricKeys.RUN_SESSION_COUNT,
            MetricKeys.RUN_DISTANCE_KM, MetricKeys.RUN_DURATION_MINUTES
        )
        private val NUTRITRACK_KEYS = MetricKeys.NUTRITION.toSet()

        fun stableId(source: DataSource, date: LocalDate, key: String): String =
            "local:${source.name.lowercase()}:$date:$key"
    }
}

/** Strict pure parsers kept independent from ContentResolver for unit testing. */
object LocalPayloadParser {
    fun parseEvolucao(raw: String, logicalDate: LocalDate, zoneId: ZoneId): List<LocalMetricRecord> {
        val root = JSONObject(raw)
        require(requiredInteger(root, "schemaVersion", 1, 1) == 1)
        require(root.optString("source") == "com.evolucao.treino")
        require(root.optString("date") == logicalDate.toString())
        val records = mutableListOf<LocalMetricRecord>()
        root.optJSONObject("weight")?.let { weight ->
            val observedDate = LocalDate.parse(weight.getString("date"))
            val kg = requiredNumber(weight, "kg", 20.0, 400.0)
            require(!observedDate.isAfter(logicalDate))
            records += observed(
                DataSource.EVOLUCAO, logicalDate, MetricKeys.WEIGHT_KG, kg, "kg",
                "evolucao:weight:$observedDate", observedDate.atStartOfDay(zoneId).toInstant().toEpochMilli()
            )
        }

        val sessions = root.optJSONArray("sessions") ?: JSONArray()
        require(sessions.length() <= 20)
        var runCount = 0
        var distanceKm = 0.0
        var distanceCount = 0
        var durationMinutes = 0.0
        var durationCount = 0
        for (index in 0 until sessions.length()) {
            val session = sessions.optJSONObject(index) ?: continue
            if (session.optString("type", session.optString("tipo")) != "corrida") continue
            runCount++
            optionalNumber(session, "distanciaKm", 0.0, 500.0)?.let {
                distanceKm += it
                distanceCount++
            }
            val seconds = optionalNumber(session, "duracaoSeg", 0.0, 172_800.0)
                ?: optionalNumber(session, "duration", 0.0, 172_800.0)
            seconds?.let {
                durationMinutes += it / 60.0
                durationCount++
            }
        }
        val observedAt = logicalDate.atStartOfDay(zoneId).toInstant().toEpochMilli()
        if (runCount > 0) {
            records += observed(DataSource.EVOLUCAO, logicalDate, MetricKeys.RUN_SESSION_COUNT,
                runCount.toDouble(), "count", "evolucao:runs:$logicalDate:count", observedAt)
        }
        if (distanceCount > 0) {
            records += observed(DataSource.EVOLUCAO, logicalDate, MetricKeys.RUN_DISTANCE_KM,
                distanceKm, "km", "evolucao:runs:$logicalDate:distance", observedAt)
        }
        if (durationCount > 0) {
            records += observed(DataSource.EVOLUCAO, logicalDate, MetricKeys.RUN_DURATION_MINUTES,
                durationMinutes, "min", "evolucao:runs:$logicalDate:duration", observedAt)
        }
        return records
    }

    fun parseNutriTrack(
        raw: String,
        logicalDate: LocalDate,
        zoneId: ZoneId,
        targetLogicalDate: LocalDate = logicalDate
    ): List<LocalMetricRecord> {
        val root = JSONObject(raw)
        require(requiredInteger(root, "schemaVersion", 1, 1) == 1)
        require(root.optString("source") == "com.nutricao.app")
        require(root.optString("date") == logicalDate.toString())
        val summary = root.optJSONObject("summary") ?: return emptyList()
        require(summary.optString("date") == logicalDate.toString())
        val mealCount = requiredInteger(summary, "mealCount", 0, 200)
        val waterRaw = summary.opt("hasWaterLog")
        require(waterRaw is Boolean)
        val hasWater = waterRaw
        require(mealCount > 0 || hasWater)
        val targets = summary.optJSONObject("targets") ?: error("targets missing")
        val observedAt = logicalDate.atStartOfDay(zoneId).toInstant().toEpochMilli()
        val records = mutableListOf<LocalMetricRecord>()

        if (mealCount > 0) {
            records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_MEAL_COUNT, mealCount.toDouble(), "count", observedAt)
            records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_ENERGY_KCAL,
                requiredNumber(summary, "energyKcal", 0.0, 100_000.0), "kcal", observedAt)
            records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_PROTEIN_G,
                requiredNumber(summary, "proteinG", 0.0, 10_000.0), "g", observedAt)
            records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_CARBS_G,
                requiredNumber(summary, "carbsG", 0.0, 20_000.0), "g", observedAt)
            records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_FAT_G,
                requiredNumber(summary, "fatG", 0.0, 10_000.0), "g", observedAt)
            positiveNumber(targets, "energyKcal", 10_000.0)?.let {
                records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_TARGET_ENERGY_KCAL, it, "kcal", observedAt)
            }
            positiveNumber(targets, "proteinG", 1_000.0)?.let {
                records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_TARGET_PROTEIN_G, it, "g", observedAt)
            }
            positiveNumber(targets, "carbsG", 2_000.0)?.let {
                records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_TARGET_CARBS_G, it, "g", observedAt)
            }
            positiveNumber(targets, "fatG", 1_000.0)?.let {
                records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_TARGET_FAT_G, it, "g", observedAt)
            }
        }
        if (hasWater) {
            records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_WATER_ML,
                requiredNumber(summary, "waterMl", 0.0, 100_000.0), "ml", observedAt)
            positiveNumber(targets, "waterMl", 20_000.0)?.let {
                records += nutrition(targetLogicalDate, logicalDate, MetricKeys.NUTRITION_TARGET_WATER_ML, it, "ml", observedAt)
            }
        }
        return records
    }

    private fun nutrition(
        targetDate: LocalDate,
        sourceDate: LocalDate,
        key: String,
        value: Double,
        unit: String,
        observedAt: Long
    ) = observed(DataSource.NUTRITRACK, targetDate, key, value, unit, "nutritrack:$sourceDate:$key", observedAt)

    private fun observed(
        source: DataSource,
        date: LocalDate,
        key: String,
        value: Double,
        unit: String,
        sourceRecordId: String,
        observedAt: Long
    ) = LocalMetricRecord(
        LocalAppSync.stableId(source, date, key),
        MetricValue.observed(key, value, unit, source, sourceRecordId, observedAt)
    )

    private fun requiredNumber(value: JSONObject, key: String, min: Double, max: Double): Double =
        optionalNumber(value, key, min, max) ?: error("$key missing")

    private fun optionalNumber(value: JSONObject, key: String, min: Double, max: Double): Double? {
        if (!value.has(key) || value.isNull(key)) return null
        val raw = value.opt(key)
        require(raw is Number)
        val number = raw.toDouble()
        require(number.isFinite() && number in min..max)
        return number
    }

    private fun positiveNumber(value: JSONObject, key: String, max: Double): Double? =
        optionalNumber(value, key, 0.0, max)?.takeIf { it > 0.0 }

    private fun requiredInteger(value: JSONObject, key: String, min: Int, max: Int): Int {
        val raw = value.opt(key)
        require(raw is Number)
        val number = raw.toDouble()
        require(number.isFinite() && number % 1.0 == 0.0 && number >= min && number <= max)
        return number.toInt()
    }
}
