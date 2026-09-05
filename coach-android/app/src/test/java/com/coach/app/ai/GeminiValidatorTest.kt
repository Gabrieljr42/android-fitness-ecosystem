package com.coach.app.ai

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GeminiValidatorTest {
    @Test fun acceptsAgreeAdjustAndInsufficientDataWithCoherentShapes() {
        val agree = GeminiValidator.validate(response("agree"), setOf("e1"))
        assertEquals("agree", agree.verdict)
        assertEquals(0.72, agree.confidence, 0.0)

        val adjustJson = response(
            "adjust",
            adjustment("strength.session", "increase_rir", JSONObject().put("rirDelta", 1))
        )
        val adjusted = GeminiValidator.validate(adjustJson, setOf("e1"))
        assertEquals("adjust", adjusted.verdict)
        val payload = adjusted.suggestedAdjustments.single().payload
        assertTrue(payload is GeminiAdjustmentPayload.IncreaseRir)
        assertEquals(1, (payload as GeminiAdjustmentPayload.IncreaseRir).rirDelta)

        val insufficient = GeminiValidator.validate(response("insufficient_data"), setOf("e1"))
        assertEquals("insufficient_data", insufficient.verdict)
    }

    @Test fun acceptsEveryOperationOnlyWithItsTypedPayloadAndTarget() {
        val cases = listOf(
            Triple(
                "agree",
                adjustment("today.training", "maintain_plan", JSONObject().put("change", "none")),
                GeminiValidationContext(setOf("e1"), allowedOperations = setOf("maintain_plan"))
            ),
            Triple(
                "adjust",
                adjustment("strength.session", "increase_rir", JSONObject().put("rirDelta", 1)),
                GeminiValidationContext(setOf("e1"), allowedOperations = setOf("increase_rir"))
            ),
            Triple(
                "adjust",
                adjustment(
                    "strength.session",
                    "reduce_set",
                    JSONObject().put("setsDelta", -1).put("scope", "highest_fatigue_exercise")
                ),
                GeminiValidationContext(setOf("e1"), allowedOperations = setOf("reduce_set"))
            ),
            Triple(
                "adjust",
                adjustment(
                    "today.training",
                    "safety_hold",
                    JSONObject().put("intensity", "avoid_aggressive_progression")
                ),
                GeminiValidationContext(setOf("e1"), aggressiveChangesBlocked = true)
            )
        )

        cases.forEach { (verdict, candidate, context) ->
            assertEquals(verdict, GeminiValidator.validate(response(verdict, candidate), context).verdict)
        }
    }

    @Test fun rejectsUnknownEvidenceExtraFieldsAndNonAllowlistedMutation() {
        val unknown = JSONObject(response("agree"))
        unknown.getJSONArray("observations").getJSONObject(0).getJSONArray("evidenceIds").put("invented")
        assertSchemaFailure { GeminiValidator.validate(unknown.toString(), setOf("e1")) }

        val extra = JSONObject(response("agree")).put("toolCall", JSONObject().put("name", "mutatePlan"))
        assertSchemaFailure { GeminiValidator.validate(extra.toString(), setOf("e1")) }

        val mutation = adjustment("strength.session", "write_database", JSONObject())
        assertSchemaFailure { GeminiValidator.validate(response("adjust", mutation), setOf("e1")) }
    }

    @Test fun rejectsMalformedOrOutOfRangeOperationPayloads() {
        val invalid = listOf(
            adjustment("strength.session", "increase_rir", JSONObject().put("rirDelta", 2)),
            adjustment("strength.session", "increase_rir", JSONObject().put("rirDelta", 1.5)),
            adjustment("strength.session", "increase_rir", JSONObject().put("rirDelta", 1).put("setsDelta", -1)),
            adjustment(
                "strength.session",
                "reduce_set",
                JSONObject().put("setsDelta", -2).put("scope", "highest_fatigue_exercise")
            ),
            adjustment(
                "strength.session",
                "reduce_set",
                JSONObject().put("setsDelta", -1).put("scope", "all_exercises")
            ),
            adjustment("strength.session", "maintain_plan", JSONObject().put("change", "none")),
            adjustment("today.training", "safety_hold", JSONObject().put("intensity", "train_harder"))
        )
        invalid.forEach { candidate ->
            val verdict = if (candidate.getString("operation") == "maintain_plan") "agree" else "adjust"
            assertSchemaFailure { GeminiValidator.validate(response(verdict, candidate), setOf("e1")) }
        }

        val notAnObject = adjustment("strength.session", "increase_rir", JSONObject()).put("payload", "1")
        assertSchemaFailure { GeminiValidator.validate(response("adjust", notAnObject), setOf("e1")) }
    }

    @Test fun enforcesSafetyAllowedOperationsAndVerdictCoherence() {
        val blocked = GeminiValidationContext(setOf("e1"), aggressiveChangesBlocked = true)
        val reduction = adjustment(
            "strength.session",
            "reduce_set",
            JSONObject().put("setsDelta", -1).put("scope", "highest_fatigue_exercise")
        )
        assertSchemaFailure { GeminiValidator.validate(response("adjust", reduction), blocked) }

        val increase = adjustment("strength.session", "increase_rir", JSONObject().put("rirDelta", 1))
        assertSchemaFailure { GeminiValidator.validate(response("agree", increase), setOf("e1")) }
        assertSchemaFailure { GeminiValidator.validate(response("insufficient_data", increase), setOf("e1")) }
        assertSchemaFailure { GeminiValidator.validate(response("adjust"), setOf("e1")) }

        val maintain = adjustment("today.training", "maintain_plan", JSONObject().put("change", "none"))
        assertSchemaFailure { GeminiValidator.validate(response("adjust", maintain), setOf("e1")) }

        val disallowed = GeminiValidationContext(setOf("e1"), allowedOperations = setOf("maintain_plan"))
        assertSchemaFailure { GeminiValidator.validate(response("adjust", increase), disallowed) }
    }

    @Test fun rejectsDiagnosticMedicationDoseAndIndirectPrescriptionCorpus() {
        val adversarialCorpus = listOf(
            "Você tem uma lesão no ombro.",
            "O quadro sugere inflamação.",
            "Provavelmente é uma tendinite.",
            "Isso é compatível com hérnia de disco.",
            "Considere tomar ibuprofeno.",
            "Talvez deva tomar alguma coisa para a dor.",
            "Um anti-inflamatório pode ajudar.",
            "Use dipirona se a dor aumentar.",
            "A dose adequada seria 400 mg.",
            "Converse com um médico sobre iniciar fisioterapia.",
            "Seria melhor fazer uma compressa de calor.",
            "Faça gelo no joelho por vinte minutos.",
            "Não é conselho médico, mas talvez seja bursite."
        )
        adversarialCorpus.forEach { text ->
            val raw = JSONObject(response("agree")).put("summary", text).toString()
            assertSchemaFailure { GeminiValidator.validate(raw, setOf("e1")) }
        }
    }

    @Test fun permitsNonDiagnosticSafetyReferralLanguage() {
        val raw = JSONObject(response("agree")).put(
            "summary",
            "Interrompa a sessão se houver dor aguda ou sintoma incomum e procure avaliação profissional."
        ).toString()
        assertEquals("agree", GeminiValidator.validate(raw, setOf("e1")).verdict)
    }

    @Test fun rejectsCoercedConfidenceAndOversizedText() {
        val stringConfidence = JSONObject(response("agree")).put("confidence", "0.9")
        assertSchemaFailure { GeminiValidator.validate(stringConfidence.toString(), setOf("e1")) }
        val longSummary = JSONObject(response("agree")).put("summary", "x".repeat(601))
        assertSchemaFailure { GeminiValidator.validate(longSummary.toString(), setOf("e1")) }
    }

    private fun response(verdict: String, adjustment: JSONObject? = null): String = JSONObject()
        .put("verdict", verdict)
        .put("summary", "O plano é conservador para os sinais disponíveis.")
        .put(
            "observations",
            JSONArray().put(
                JSONObject()
                    .put("text", "O sinal observado sustenta cautela.")
                    .put("evidenceIds", JSONArray().put("e1"))
            )
        )
        .put("concerns", JSONArray())
        .put("suggestedAdjustments", JSONArray().also { if (adjustment != null) it.put(adjustment) })
        .put("questions", JSONArray())
        .put("confidence", 0.72)
        .toString()

    private fun adjustment(target: String, operation: String, payload: JSONObject): JSONObject = JSONObject()
        .put("target", target)
        .put("operation", operation)
        .put("payload", payload)
        .put("reason", "Preservar margem hoje.")
        .put("evidenceIds", JSONArray().put("e1"))

    private fun assertSchemaFailure(block: () -> Unit) {
        assertEquals("E_GEMINI_SCHEMA", expectFailure(block).code)
    }

    private fun expectFailure(block: () -> Unit): GeminiException = try {
        block(); throw AssertionError("expected GeminiException")
    } catch (error: GeminiException) { error }
}
