package com.coach.app.integrations

import com.coach.app.domain.DataSource
import com.coach.app.domain.MetricKeys
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class LocalPayloadParserTest {
    private val date = LocalDate.parse("2026-08-23")
    private val zone = ZoneId.of("America/Sao_Paulo")

    @Test fun parsesLatestEvolucaoWeightAndOnlyExplicitRuns() {
        val payload = JSONObject()
            .put("schemaVersion", 1)
            .put("source", "com.evolucao.treino")
            .put("date", date.toString())
            .put("weight", JSONObject().put("date", "2026-08-22").put("kg", 82.4))
            .put("sessions", JSONArray()
                .put(JSONObject().put("type", "musculacao").put("distanciaKm", 99))
                .put(JSONObject().put("type", "corrida").put("distanciaKm", 8.2).put("duracaoSeg", 2820)))

        val metrics = LocalPayloadParser.parseEvolucao(payload.toString(), date, zone)
            .associateBy { it.metric.key }
        assertEquals(DataSource.EVOLUCAO, metrics.getValue(MetricKeys.WEIGHT_KG).metric.source)
        assertEquals(82.4, metrics.getValue(MetricKeys.WEIGHT_KG).metric.value!!, 0.001)
        assertEquals(1.0, metrics.getValue(MetricKeys.RUN_SESSION_COUNT).metric.value!!, 0.001)
        assertEquals(8.2, metrics.getValue(MetricKeys.RUN_DISTANCE_KM).metric.value!!, 0.001)
        assertEquals(47.0, metrics.getValue(MetricKeys.RUN_DURATION_MINUTES).metric.value!!, 0.001)
        assertTrue(metrics.getValue(MetricKeys.WEIGHT_KG).metric.sourceRecordId!!.endsWith("2026-08-22"))
    }

    @Test fun rejectsFutureOrImplausibleWeight() {
        val future = JSONObject()
            .put("schemaVersion", 1).put("source", "com.evolucao.treino").put("date", date.toString())
            .put("weight", JSONObject().put("date", "2026-08-24").put("kg", 82.4))
            .put("sessions", JSONArray())
        expectFailure { LocalPayloadParser.parseEvolucao(future.toString(), date, zone) }
        future.put("weight", JSONObject().put("date", date.toString()).put("kg", 0))
        expectFailure { LocalPayloadParser.parseEvolucao(future.toString(), date, zone) }
    }

    @Test fun parsesAggregateOnlyNutriTrackSummaryIncludingExplicitZero() {
        val summary = JSONObject()
            .put("date", date.toString()).put("mealCount", 3).put("hasWaterLog", true)
            .put("energyKcal", 1800).put("proteinG", 125.5).put("carbsG", 210).put("fatG", 61)
            .put("waterMl", 0)
            .put("targets", JSONObject().put("energyKcal", 2200).put("proteinG", 150)
                .put("carbsG", 260).put("fatG", 70).put("waterMl", 3000))
        val payload = JSONObject()
            .put("schemaVersion", 1).put("source", "com.nutricao.app").put("date", date.toString())
            .put("summary", summary)

        val metrics = LocalPayloadParser.parseNutriTrack(payload.toString(), date, zone)
            .associateBy { it.metric.key }
        assertEquals(DataSource.NUTRITRACK, metrics.getValue(MetricKeys.NUTRITION_ENERGY_KCAL).metric.source)
        assertEquals(1800.0, metrics.getValue(MetricKeys.NUTRITION_ENERGY_KCAL).metric.value!!, 0.001)
        assertEquals(0.0, metrics.getValue(MetricKeys.NUTRITION_WATER_ML).metric.value!!, 0.001)
        assertEquals(3000.0, metrics.getValue(MetricKeys.NUTRITION_TARGET_WATER_ML).metric.value!!, 0.001)
    }

    @Test fun nullSummaryIsAbsenceNotZero() {
        val payload = JSONObject()
            .put("schemaVersion", 1).put("source", "com.nutricao.app").put("date", date.toString())
            .put("summary", JSONObject.NULL)
        assertTrue(LocalPayloadParser.parseNutriTrack(payload.toString(), date, zone).isEmpty())
    }

    @Test fun parsesNutriTrackDMinusOneWithTargetLogicalDate() {
        val d1Date = date.minusDays(1)
        val summary = JSONObject()
            .put("date", d1Date.toString()).put("mealCount", 4).put("hasWaterLog", true)
            .put("energyKcal", 2100).put("proteinG", 140.0).put("carbsG", 230).put("fatG", 65)
            .put("waterMl", 2500)
            .put("targets", JSONObject().put("energyKcal", 2200).put("proteinG", 150)
                .put("carbsG", 260).put("fatG", 70).put("waterMl", 3000))
        val payload = JSONObject()
            .put("schemaVersion", 1).put("source", "com.nutricao.app").put("date", d1Date.toString())
            .put("summary", summary)

        val metrics = LocalPayloadParser.parseNutriTrack(payload.toString(), d1Date, zone, targetLogicalDate = date)
            .associateBy { it.metric.key }

        assertEquals(DataSource.NUTRITRACK, metrics.getValue(MetricKeys.NUTRITION_ENERGY_KCAL).metric.source)
        assertEquals(2100.0, metrics.getValue(MetricKeys.NUTRITION_ENERGY_KCAL).metric.value!!, 0.001)
        assertTrue(metrics.getValue(MetricKeys.NUTRITION_ENERGY_KCAL).stableId.contains(date.toString()))
        assertTrue(metrics.getValue(MetricKeys.NUTRITION_ENERGY_KCAL).metric.sourceRecordId!!.contains(d1Date.toString()))
    }

    private fun expectFailure(block: () -> Unit) {
        try {
            block()
            throw AssertionError("expected parser failure")
        } catch (_: IllegalArgumentException) { }
    }
}
