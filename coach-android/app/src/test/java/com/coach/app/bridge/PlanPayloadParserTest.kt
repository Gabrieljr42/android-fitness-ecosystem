package com.coach.app.bridge

import com.coach.app.domain.BodyRegion
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class PlanPayloadParserTest {
    private val hash = "a".repeat(64)

    @Test fun acceptsBoundedDeterministicPlan() {
        val parsed = PlanPayloadParser.parse(root())
        assertEquals(hash, parsed.snapshotHash)
        assertEquals("0.2.0", parsed.engineVersion)
        assertEquals("increase_rir", parsed.proposals.single().operation)
    }

    @Test fun rejectsMismatchedSnapshotAndUnknownOperation() {
        val mismatched = root().put("snapshotHash", "b".repeat(64))
        assertEquals("E_PLAN", expectFailure { PlanPayloadParser.parse(mismatched) }.code)
        val operation = root()
        operation.getJSONObject("output").getJSONArray("proposals").getJSONObject(0)
            .put("operation", "write_other_app")
        assertEquals("E_PLAN", expectFailure { PlanPayloadParser.parse(operation) }.code)
    }

    @Test fun rejectsProposalFromAnotherSnapshotAndSchemaSmuggling() {
        val id = root()
        id.getJSONObject("output").getJSONArray("proposals").getJSONObject(0)
            .put("id", "bbbbbbbbbbbbbbbb:increase-rir")
        assertEquals("E_PLAN", expectFailure { PlanPayloadParser.parse(id) }.code)
        val extra = root()
        extra.getJSONObject("output").getJSONArray("proposals").getJSONObject(0)
            .put("applyImmediately", true)
        assertEquals("E_SCHEMA", expectFailure { PlanPayloadParser.parse(extra) }.code)
    }

    @Test fun rejectsNestedScoreInconsistencyAndSafetyBypass() {
        val coverage = root()
        coverage.getJSONObject("output").getJSONObject("dataQuality").put("score", 100)
        assertEquals("E_PLAN", expectFailure { PlanPayloadParser.parse(coverage) }.code)

        val safety = root()
        safety.getJSONObject("output").getJSONObject("safety")
            .put("aggressiveChangesBlocked", true)
            .put("flags", JSONArray(listOf("Dor articular informada")))
            .put("guidance", "Cautela.")
        assertEquals("E_PLAN", expectFailure { PlanPayloadParser.parse(safety) }.code)
    }

    @Test fun editedPayloadHasOperationSpecificSchema() {
        assertEquals("{\"rirDelta\":2}", ProposalEditValidator.validate("increase_rir", JSONObject().put("rirDelta", 2)))
        assertEquals("E_SCHEMA", expectFailure {
            ProposalEditValidator.validate("increase_rir", JSONObject().put("rirDelta", 1).put("writeOtherApp", true))
        }.code)
        assertEquals("E_DECISION", expectFailure {
            ProposalEditValidator.validate("reduce_set", JSONObject().put("setsDelta", -99).put("scope", "all"))
        }.code)
    }

    @Test fun acceptsBoundedObservedLocalDimensionsAndRejectsFreeText() {
        val observed = root()
        val dimensions = observed.getJSONObject("output").getJSONObject("dimensions")
        dimensions.put("runningLoad", JSONObject().put("status", "observed")
            .put("score", JSONObject.NULL).put("message", "Evolução hoje: 1 corrida · 8,2 km · 47 min."))
        dimensions.put("fueling", JSONObject().put("status", "observed")
            .put("score", JSONObject.NULL).put("message", "NutriTrack hoje: 1.850/2.200 kcal · 132/150 g proteína · 2,0/3,0 L água."))
        PlanPayloadParser.parse(observed)

        dimensions.getJSONObject("fueling").put("message", "<script>alert(1)</script>")
        assertEquals("E_PLAN", expectFailure { PlanPayloadParser.parse(observed) }.code)
    }

    private fun root(): JSONObject = JSONObject()
        .put("snapshotHash", hash)
        .put("engineVersion", "0.2.0")
        .put("output", validOutput())

    private fun validOutput(): JSONObject {
        val labels = mapOf(
            BodyRegion.CHEST to "Peito", BodyRegion.BACK to "Costas", BodyRegion.SHOULDERS to "Ombros",
            BodyRegion.ARMS to "Braços", BodyRegion.GLUTES to "Glúteos", BodyRegion.QUADS to "Quadríceps",
            BodyRegion.HAMSTRINGS to "Posteriores", BodyRegion.CALVES to "Panturrilhas", BodyRegion.CORE to "Core"
        )
        val muscles = JSONArray(BodyRegion.entries.map { region ->
            JSONObject()
                .put("region", region.name)
                .put("label", labels.getValue(region))
                .put("score", JSONObject.NULL)
                .put("status", "unknown")
                .put("confidence", 0.15)
        })
        return JSONObject()
            .put("schemaVersion", 1)
            .put("engineVersion", "0.2.0")
            .put("generatedFor", "2026-08-23")
            .put("snapshotHash", hash)
            .put("dataQuality", JSONObject()
                .put("score", 60).put("observedMetrics", 3).put("totalMetricSlots", 4)
                .put("checkInPresent", false).put("missing", JSONArray(listOf("peso", "check-in")))
                .put("label", "cobertura parcial"))
            .put("readiness", JSONObject()
                .put("score", 55).put("label", "conservador").put("confidence", 0.65)
                .put("confidenceLabel", "moderada").put("evidence", JSONArray(listOf("e1"))))
            .put("dimensions", JSONObject()
                .put("muscleReadiness", muscles)
                .put("runningLoad", JSONObject().put("status", "insufficient_data").put("score", JSONObject.NULL)
                    .put("message", "Passos observados não são tratados como corrida."))
                .put("fueling", JSONObject().put("status", "insufficient_data").put("score", JSONObject.NULL)
                    .put("message", "Nenhum registro de alimentação ou hidratação foi importado hoje.")))
            .put("safety", JSONObject().put("aggressiveChangesBlocked", false)
                .put("flags", JSONArray()).put("guidance", JSONObject.NULL))
            .put("proposals", JSONArray().put(JSONObject()
                .put("id", "${hash.take(16)}:increase-rir")
                .put("target", "strength.session").put("operation", "increase_rir")
                .put("payload", JSONObject().put("rirDelta", 1)).put("title", "Elevar RIR")
                .put("reason", "Prontidão intermediária.").put("benefit", "Mais margem.")
                .put("cost", "Menos proximidade da falha.").put("confidence", 0.65)
                .put("alternative", "Manter e observar.").put("evidence", JSONArray(listOf("e1")))
                .put("status", "pending")))
    }

    private fun expectFailure(block: () -> Unit): BridgeProtocolException = try {
        block(); throw AssertionError("expected failure")
    } catch (error: BridgeProtocolException) { error }
}
