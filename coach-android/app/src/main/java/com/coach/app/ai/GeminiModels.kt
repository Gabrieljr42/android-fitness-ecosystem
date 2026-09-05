package com.coach.app.ai

import org.json.JSONArray
import org.json.JSONObject

data class GeminiObservation(val text: String, val evidenceIds: List<String>)

sealed interface GeminiAdjustmentPayload {
    fun toJson(): JSONObject

    data class MaintainPlan(val change: String) : GeminiAdjustmentPayload {
        override fun toJson(): JSONObject = JSONObject().put("change", change)
    }

    data class IncreaseRir(val rirDelta: Int) : GeminiAdjustmentPayload {
        override fun toJson(): JSONObject = JSONObject().put("rirDelta", rirDelta)
    }

    data class ReduceSet(val setsDelta: Int, val scope: String) : GeminiAdjustmentPayload {
        override fun toJson(): JSONObject = JSONObject()
            .put("setsDelta", setsDelta)
            .put("scope", scope)
    }

    data class SafetyHold(val intensity: String) : GeminiAdjustmentPayload {
        override fun toJson(): JSONObject = JSONObject().put("intensity", intensity)
    }
}

data class GeminiAdjustment(
    val target: String,
    val operation: String,
    val payload: GeminiAdjustmentPayload,
    val reason: String,
    val evidenceIds: List<String>
)

data class GeminiValidationContext(
    val allowedEvidenceIds: Set<String>,
    val aggressiveChangesBlocked: Boolean = false,
    val allowedOperations: Set<String> = if (aggressiveChangesBlocked) {
        setOf("safety_hold")
    } else {
        setOf("maintain_plan", "increase_rir", "reduce_set")
    }
)

data class GeminiOpinion(
    val verdict: String,
    val summary: String,
    val observations: List<GeminiObservation>,
    val concerns: List<String>,
    val suggestedAdjustments: List<GeminiAdjustment>,
    val questions: List<String>,
    val confidence: Double
) {
    fun toJson(): JSONObject = JSONObject()
        .put("verdict", verdict)
        .put("summary", summary)
        .put("observations", JSONArray(observations.map { observation ->
            JSONObject().put("text", observation.text).put("evidenceIds", JSONArray(observation.evidenceIds))
        }))
        .put("concerns", JSONArray(concerns))
        .put("suggestedAdjustments", JSONArray(suggestedAdjustments.map { adjustment ->
            JSONObject()
                .put("target", adjustment.target)
                .put("operation", adjustment.operation)
                .put("payload", adjustment.payload.toJson())
                .put("reason", adjustment.reason)
                .put("evidenceIds", JSONArray(adjustment.evidenceIds))
        }))
        .put("questions", JSONArray(questions))
        .put("confidence", confidence)
}

class GeminiException(val code: String, override val message: String) : Exception(message)
