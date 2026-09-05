package com.coach.app.ai

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.text.Normalizer

object GeminiValidator {
    const val MAX_RESPONSE_BYTES = 64 * 1024
    private val rootKeys = setOf(
        "verdict", "summary", "observations", "concerns", "suggestedAdjustments", "questions", "confidence"
    )
    private val observationKeys = setOf("text", "evidenceIds")
    private val adjustmentKeys = setOf("target", "operation", "payload", "reason", "evidenceIds")
    private val verdicts = setOf("agree", "adjust", "insufficient_data")
    private val targets = setOf("today.training", "strength.session")
    private val operations = setOf("maintain_plan", "increase_rir", "reduce_set", "safety_hold")
    private val medicalLanguagePatterns = listOf(
        Regex("""\b(?:diagnostico|diagnosticar|diagnosticado|diagnosticada|prescricao|prescrever|prescrito|prescrita)\b"""),
        Regex(
            """\b(?:voce|o quadro|isso|os? sintomas?)\s+(?:tem|indica|indicam|sugere|sugerem|parece|parecem|e|sao|esta com|apresenta|apresentam)\b.{0,80}\b(?:lesao|doenca|sindrome|patologia|inflamacao|infeccao|hernia|arritmia)\b"""
        ),
        Regex(
            """\b(?:provavelmente|possivelmente|aparentemente|talvez|pode ser|compativel com|trata se de)\b.{0,80}\b(?:lesao|doenca|sindrome|patologia|inflamacao|infeccao|hernia|arritmia|tendinite|bursite|fratura|entorse|distensao)\b"""
        ),
        Regex("""\b(?:tendinite|tendinopatia|bursite|fratura|entorse|distensao|luxacao|rabdomiolise|arritmia|hernia de disco)\b"""),
        Regex(
            """\b(?:medicamento|medicacao|remedio|pomada|analgesico|anti\s*inflamatorio|corticoide|antibiotico|relaxante muscular|ibuprofeno|dipirona|paracetamol|aspirina|naproxeno|diclofenaco)\b"""
        ),
        Regex("""\b\d+(?:[.,]\d+)?\s*(?:mg|ml|comprimidos?|capsulas?|gotas?)\b"""),
        Regex(
            """\b(?:tome|ingira|aplique|medique se|aumente a dose|reduza a dose|dobre a dose|pare de tomar|substitua o tratamento)\b"""
        ),
        Regex(
            """\b(?:considere|recomendo|sugiro|seria bom|seria melhor|vale a pena|o ideal e|poderia|pode ajudar|converse com.{0,40}sobre)\b.{0,80}\b(?:tomar|ingerir|usar|aplicar|iniciar|suspender|substituir|fazer)\b.{0,50}\b(?:tratamento|terapia|fisioterapia|gelo|compressa|calor)\b"""
        ),
        Regex(
            """\b(?:considere|recomendo|sugiro|seria bom|seria melhor|vale a pena|o ideal e|deveria|poderia|talvez deva)\b.{0,80}\b(?:tomar|ingerir|se medicar)\b"""
        ),
        Regex("""\b(?:faca|aplique|use)\s+(?:gelo|compressa|calor)\b"""),
        Regex("""\b(?:inicie|faca|considere)\s+(?:tratamento|terapia|fisioterapia)\b""")
    )

    /** Compatibility overload for callers that have not yet retained the review context. */
    fun validate(raw: String, allowedEvidenceIds: Set<String>): GeminiOpinion =
        validate(raw, GeminiValidationContext(allowedEvidenceIds))

    fun validate(raw: String, context: GeminiValidationContext): GeminiOpinion {
        if (raw.toByteArray(StandardCharsets.UTF_8).size > MAX_RESPONSE_BYTES) fail("Resposta excede o limite.")
        if (context.allowedOperations.any { it !in operations }) fail("Contexto contém operação desconhecida.")
        val root = try { JSONObject(raw) } catch (_: JSONException) { fail("Resposta não é JSON válido.") }
        exactKeys(root, rootKeys, "resposta")
        val verdict = strictString(root, "verdict", 32)
        if (verdict !in verdicts) fail("Veredito desconhecido.")
        val summary = strictString(root, "summary", 600)
        val observations = parseObservations(strictArray(root, "observations"), context.allowedEvidenceIds)
        val concerns = parseStringArray(strictArray(root, "concerns"), 12, 500, "concerns")
        val adjustments = parseAdjustments(strictArray(root, "suggestedAdjustments"), context)
        val questions = parseStringArray(strictArray(root, "questions"), 6, 300, "questions")
        val confidenceValue = root.opt("confidence")
        if (confidenceValue !is Number) fail("Confiança precisa ser numérica.")
        val confidence = confidenceValue.toDouble()
        if (!confidence.isFinite() || confidence !in 0.0..1.0) fail("Confiança fora do intervalo.")

        validateVerdictCoherence(verdict, adjustments)

        val allText = buildList {
            add(summary)
            addAll(observations.map { it.text })
            addAll(concerns)
            addAll(adjustments.map { it.reason })
            addAll(questions)
        }
        if (allText.any(::containsForbiddenMedicalLanguage)) {
            fail("Resposta contém diagnóstico, medicamento ou orientação médica prescritiva.")
        }
        return GeminiOpinion(verdict, summary, observations, concerns, adjustments, questions, confidence)
    }

    private fun parseObservations(value: JSONArray, allowed: Set<String>): List<GeminiObservation> {
        if (value.length() > 12) fail("Observações excedem o limite.")
        return (0 until value.length()).map { index ->
            val item = value.optJSONObject(index) ?: fail("Observação inválida.")
            exactKeys(item, observationKeys, "observação")
            GeminiObservation(
                strictString(item, "text", 500),
                evidence(item, allowed, requireOne = true)
            )
        }
    }

    private fun parseAdjustments(value: JSONArray, context: GeminiValidationContext): List<GeminiAdjustment> {
        if (value.length() > 8) fail("Ajustes excedem o limite.")
        return (0 until value.length()).map { index ->
            val item = value.optJSONObject(index) ?: fail("Ajuste inválido.")
            exactKeys(item, adjustmentKeys, "ajuste")
            val target = strictString(item, "target", 40)
            val operation = strictString(item, "operation", 40)
            if (target !in targets || operation !in operations) fail("Ajuste fora da allowlist.")
            if (operation !in context.allowedOperations) fail("Operação não autorizada para esta revisão.")
            if (context.aggressiveChangesBlocked && operation != "safety_hold") {
                fail("Ajuste incompatível com o bloqueio de segurança.")
            }
            GeminiAdjustment(
                target = target,
                operation = operation,
                payload = parseAdjustmentPayload(target, operation, item.optJSONObject("payload")),
                reason = strictString(item, "reason", 500),
                evidenceIds = evidence(item, context.allowedEvidenceIds, true)
            )
        }
    }

    private fun parseAdjustmentPayload(
        target: String,
        operation: String,
        payload: JSONObject?
    ): GeminiAdjustmentPayload {
        val value = payload ?: fail("Payload do ajuste precisa ser um objeto.")
        return when (operation) {
            "maintain_plan" -> {
                if (target != "today.training") fail("Alvo incompatível com manutenção do plano.")
                exactKeys(value, setOf("change"), "payload maintain_plan")
                val change = strictString(value, "change", 16)
                if (change != "none") fail("Payload maintain_plan inválido.")
                GeminiAdjustmentPayload.MaintainPlan(change)
            }
            "increase_rir" -> {
                if (target != "strength.session") fail("Alvo incompatível com aumento de RIR.")
                exactKeys(value, setOf("rirDelta"), "payload increase_rir")
                val delta = strictInt(value, "rirDelta")
                if (delta != 1) fail("rirDelta precisa ser exatamente 1.")
                GeminiAdjustmentPayload.IncreaseRir(delta)
            }
            "reduce_set" -> {
                if (target != "strength.session") fail("Alvo incompatível com redução de série.")
                exactKeys(value, setOf("setsDelta", "scope"), "payload reduce_set")
                val delta = strictInt(value, "setsDelta")
                val scope = strictString(value, "scope", 48)
                if (delta != -1 || scope != "highest_fatigue_exercise") {
                    fail("Payload reduce_set inválido.")
                }
                GeminiAdjustmentPayload.ReduceSet(delta, scope)
            }
            "safety_hold" -> {
                if (target != "today.training") fail("Alvo incompatível com bloqueio de segurança.")
                exactKeys(value, setOf("intensity"), "payload safety_hold")
                val intensity = strictString(value, "intensity", 48)
                if (intensity != "avoid_aggressive_progression") fail("Payload safety_hold inválido.")
                GeminiAdjustmentPayload.SafetyHold(intensity)
            }
            else -> fail("Ajuste fora da allowlist.")
        }
    }

    private fun validateVerdictCoherence(verdict: String, adjustments: List<GeminiAdjustment>) {
        when (verdict) {
            "agree" -> if (adjustments.size > 1 || adjustments.any { it.operation != "maintain_plan" }) {
                fail("Veredito agree não pode conter mudanças reais.")
            }
            "adjust" -> if (adjustments.isEmpty() || adjustments.any { it.operation == "maintain_plan" }) {
                fail("Veredito adjust exige ao menos uma mudança real e coerente.")
            }
            "insufficient_data" -> if (adjustments.isNotEmpty()) {
                fail("Veredito insufficient_data não pode sugerir ajustes.")
            }
        }
    }

    private fun containsForbiddenMedicalLanguage(text: String): Boolean {
        val normalized = Normalizer.normalize(text, Normalizer.Form.NFKD)
            .replace(Regex("\\p{M}+"), "")
            .lowercase()
            .replace(Regex("[^a-z0-9]+"), " ")
            .trim()
        return medicalLanguagePatterns.any { it.containsMatchIn(normalized) }
    }

    private fun evidence(item: JSONObject, allowed: Set<String>, requireOne: Boolean): List<String> {
        val array = strictArray(item, "evidenceIds")
        if (array.length() > 12 || (requireOne && array.length() == 0)) fail("Referências de evidência inválidas.")
        return (0 until array.length()).map { index ->
            val id = array.opt(index)
            if (id !is String || id.isBlank() || id.length > 128 || id !in allowed) {
                fail("A resposta citou uma evidência inexistente.")
            }
            id
        }.also { if (it.distinct().size != it.size) fail("Evidências duplicadas.") }
    }

    private fun parseStringArray(value: JSONArray, maxItems: Int, maxLength: Int, label: String): List<String> {
        if (value.length() > maxItems) fail("$label excede o limite.")
        return (0 until value.length()).map { index ->
            val item = value.opt(index)
            if (item !is String || item.isBlank() || item.length > maxLength || item.hasUnsafeControls()) {
                fail("Item inválido em $label.")
            }
            item
        }
    }

    private fun strictString(value: JSONObject, key: String, maxLength: Int): String {
        val result = value.opt(key)
        if (result !is String || result.isBlank() || result.length > maxLength || result.hasUnsafeControls()) {
            fail("Campo $key inválido.")
        }
        return result
    }

    private fun strictInt(value: JSONObject, key: String): Int {
        val raw = value.opt(key)
        if (raw !is Number) fail("Campo $key precisa ser inteiro.")
        val number = raw.toDouble()
        if (!number.isFinite() || number % 1.0 != 0.0 || number !in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble()) {
            fail("Campo $key precisa ser inteiro.")
        }
        return number.toInt()
    }

    private fun strictArray(value: JSONObject, key: String): JSONArray =
        value.optJSONArray(key) ?: fail("Campo $key precisa ser uma lista.")

    private fun exactKeys(value: JSONObject, expected: Set<String>, label: String) {
        if (value.keys().asSequence().toSet() != expected) fail("$label não corresponde ao schema.")
    }

    private fun String.hasUnsafeControls(): Boolean = any { it.code < 0x20 && it !in setOf('\n', '\r', '\t') }
    private fun fail(message: String): Nothing = throw GeminiException("E_GEMINI_SCHEMA", message)
}
