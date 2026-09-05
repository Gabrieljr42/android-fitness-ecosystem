package com.coach.app.bridge

import com.coach.app.domain.BodyRegion
import com.coach.app.domain.CheckIn
import com.coach.app.domain.Contract
import com.coach.app.domain.SorenessLevel
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

object CheckInPayloadParser {
    private val keys = setOf(
        "energy", "perceivedSleepQuality", "motivation", "soreness", "jointPainFlag", "note"
    )

    fun parse(data: JSONObject, logicalDate: LocalDate, nowEpochMs: Long): CheckIn {
        BridgeProtocol.requireExactKeys(data, keys, "check-in")
        val sorenessObject = data.optJSONObject("soreness")
            ?: BridgeProtocol.fail("E_CHECKIN", "Dor muscular precisa ser um objeto.")
        val soreness = linkedMapOf<BodyRegion, SorenessLevel>()
        sorenessObject.keys().asSequence().forEach { rawRegion ->
            val region = try { BodyRegion.valueOf(rawRegion) } catch (_: IllegalArgumentException) {
                BridgeProtocol.fail("E_CHECKIN", "Região muscular desconhecida.")
            }
            val level = try { SorenessLevel.valueOf(sorenessObject.optString(rawRegion)) }
            catch (_: IllegalArgumentException) {
                BridgeProtocol.fail("E_CHECKIN", "Nível de dor muscular inválido.")
            }
            soreness[region] = level
        }
        val note = when {
            data.isNull("note") -> null
            data.opt("note") !is String -> BridgeProtocol.fail("E_CHECKIN", "Observação inválida.")
            else -> data.getString("note").trim().takeIf { it.isNotEmpty() }
        }
        return try {
            CheckIn(
                logicalDate = logicalDate,
                energy = strictInt(data, "energy"),
                perceivedSleepQuality = strictInt(data, "perceivedSleepQuality"),
                motivation = strictInt(data, "motivation"),
                soreness = soreness,
                jointPainFlag = strictBoolean(data, "jointPainFlag"),
                note = note,
                recordedAtEpochMs = nowEpochMs
            )
        } catch (_: IllegalArgumentException) {
            BridgeProtocol.fail("E_CHECKIN", "Respostas fora dos limites aceitos.")
        }
    }

    private fun strictInt(data: JSONObject, key: String): Int {
        val value = data.opt(key)
        if (value !is Int || value !in 1..5) BridgeProtocol.fail("E_CHECKIN", "$key precisa estar entre 1 e 5.")
        return value
    }

    private fun strictBoolean(data: JSONObject, key: String): Boolean {
        val value = data.opt(key)
        if (value !is Boolean) BridgeProtocol.fail("E_CHECKIN", "$key precisa ser booleano.")
        return value
    }
}

data class ParsedProposal(
    val id: String,
    val target: String,
    val operation: String,
    val payloadJson: String,
    val reason: String,
    val evidenceIds: List<String>
)

data class ParsedPlan(
    val snapshotHash: String,
    val engineVersion: String,
    val outputJson: String,
    val proposals: List<ParsedProposal>,
    val evidenceIds: Set<String>
)

object PlanPayloadParser {
    private val rootKeys = setOf("snapshotHash", "engineVersion", "output")
    private val outputKeys = setOf(
        "schemaVersion", "engineVersion", "generatedFor", "snapshotHash", "dataQuality",
        "readiness", "dimensions", "safety", "proposals"
    )
    private val proposalKeys = setOf(
        "id", "target", "operation", "payload", "title", "reason", "benefit", "cost",
        "confidence", "alternative", "evidence", "status"
    )
    private val dataQualityKeys = setOf(
        "score", "observedMetrics", "totalMetricSlots", "checkInPresent", "missing", "label"
    )
    private val readinessKeys = setOf(
        "score", "label", "confidence", "confidenceLabel", "evidence"
    )
    private val dimensionKeys = setOf("muscleReadiness", "runningLoad", "fueling")
    private val muscleKeys = setOf("region", "label", "score", "status", "confidence")
    private val dimensionSummaryKeys = setOf("status", "score", "message")
    private val safetyKeys = setOf("aggressiveChangesBlocked", "flags", "guidance")
    private val targets = setOf("today.training", "strength.session")
    private val operations = setOf("maintain_plan", "increase_rir", "reduce_set", "safety_hold")
    private val hashPattern = Regex("[a-f0-9]{64}")
    private val versionPattern = Regex("[0-9]+(?:\\.[0-9]+){1,2}(?:[-A-Za-z0-9.]+)?")

    fun parse(data: JSONObject): ParsedPlan {
        BridgeProtocol.requireExactKeys(data, rootKeys, "plano")
        val snapshotHash = BridgeProtocol.boundedString(data, "snapshotHash", 64)
        if (!hashPattern.matches(snapshotHash)) BridgeProtocol.fail("E_PLAN", "Hash do snapshot inválido.")
        val engineVersion = BridgeProtocol.boundedString(data, "engineVersion", 32)
        if (!versionPattern.matches(engineVersion)) BridgeProtocol.fail("E_PLAN", "Versão do motor inválida.")
        if (engineVersion != "0.2.0") BridgeProtocol.fail("E_PLAN", "Versão do motor ainda não suportada.")
        val output = data.optJSONObject("output") ?: BridgeProtocol.fail("E_PLAN", "Saída do motor inválida.")
        BridgeProtocol.requireExactKeys(output, outputKeys, "saída do motor")
        if (output.opt("schemaVersion") !is Int || output.getInt("schemaVersion") != Contract.VERSION ||
            BridgeProtocol.boundedString(output, "engineVersion", 32) != engineVersion ||
            BridgeProtocol.boundedString(output, "snapshotHash", 64) != snapshotHash
        ) BridgeProtocol.fail("E_PLAN", "Plano não corresponde ao snapshot e motor informados.")
        try { LocalDate.parse(BridgeProtocol.boundedString(output, "generatedFor", 10)) }
        catch (_: Exception) { BridgeProtocol.fail("E_PLAN", "Data do plano inválida.") }

        validateDataQuality(output.optJSONObject("dataQuality")
            ?: BridgeProtocol.fail("E_PLAN", "Qualidade de dados inválida."))
        val readinessEvidence = validateReadiness(output.optJSONObject("readiness")
            ?: BridgeProtocol.fail("E_PLAN", "Prontidão inválida."))
        validateDimensions(output.optJSONObject("dimensions")
            ?: BridgeProtocol.fail("E_PLAN", "Dimensões inválidas."))
        val safetyBlocked = validateSafety(output.optJSONObject("safety")
            ?: BridgeProtocol.fail("E_PLAN", "Estado de segurança inválido."))

        val proposalArray = output.optJSONArray("proposals")
            ?: BridgeProtocol.fail("E_PLAN", "Lista de propostas inválida.")
        if (proposalArray.length() !in 1..12) BridgeProtocol.fail("E_PLAN", "Quantidade de propostas inválida.")
        val proposals = (0 until proposalArray.length()).map { index ->
            parseProposal(proposalArray.optJSONObject(index)
                ?: BridgeProtocol.fail("E_PLAN", "Proposta inválida."), snapshotHash)
        }
        if (proposals.map { it.id }.distinct().size != proposals.size) {
            BridgeProtocol.fail("E_PLAN", "IDs de propostas duplicados.")
        }
        if (safetyBlocked && proposals.any { it.operation != "safety_hold" }) {
            BridgeProtocol.fail("E_PLAN", "Plano ignora o bloqueio de segurança.")
        }
        if (!safetyBlocked && proposals.any { it.operation == "safety_hold" }) {
            BridgeProtocol.fail("E_PLAN", "Bloqueio de segurança sem sinal correspondente.")
        }
        val outputJson = output.toString()
        if (outputJson.toByteArray().size > 28 * 1024) BridgeProtocol.fail("E_PLAN", "Plano excede o limite.")
        return ParsedPlan(
            snapshotHash, engineVersion, outputJson, proposals,
            (readinessEvidence + proposals.flatMap { it.evidenceIds }).toSet()
        )
    }

    private fun parseProposal(value: JSONObject, snapshotHash: String): ParsedProposal {
        BridgeProtocol.requireExactKeys(value, proposalKeys, "proposta")
        val id = BridgeProtocol.boundedString(value, "id", 140)
        if (!id.startsWith(snapshotHash.take(16) + ":")) BridgeProtocol.fail("E_PLAN", "ID de proposta fora do snapshot.")
        val target = BridgeProtocol.boundedString(value, "target", 40)
        val operation = BridgeProtocol.boundedString(value, "operation", 40)
        if (target !in targets || operation !in operations) BridgeProtocol.fail("E_PLAN", "Operação de proposta não permitida.")
        val reason = BridgeProtocol.boundedString(value, "reason", 500)
        listOf("title", "benefit", "cost", "alternative").forEach {
            BridgeProtocol.boundedString(value, it, 500)
        }
        strictNumber(value, "confidence", 0.0, 1.0)
        if (value.optString("status") != "pending") BridgeProtocol.fail("E_PLAN", "Estado inicial de proposta inválido.")
        val evidence = validateEvidence(value.optJSONArray("evidence") ?: BridgeProtocol.fail("E_PLAN", "Evidências inválidas."))
        val payload = value.optJSONObject("payload") ?: BridgeProtocol.fail("E_PLAN", "Payload de proposta inválido.")
        val payloadJson = try { ProposalEditValidator.validate(operation, payload) }
        catch (_: BridgeProtocolException) { BridgeProtocol.fail("E_PLAN", "Payload de proposta incompatível com a operação.") }
        return ParsedProposal(id, target, operation, payloadJson, reason, evidence)
    }

    private fun validateDataQuality(value: JSONObject) {
        BridgeProtocol.requireExactKeys(value, dataQualityKeys, "qualidade dos dados")
        val score = strictInt(value, "score", 0, 100)
        val observed = strictInt(value, "observedMetrics", 0, 4)
        if (strictInt(value, "totalMetricSlots", 4, 4) != 4) BridgeProtocol.fail("E_PLAN", "Total de slots inválido.")
        val checkInPresent = strictBoolean(value, "checkInPresent")
        val missing = stringArray(value.optJSONArray("missing")
            ?: BridgeProtocol.fail("E_PLAN", "Lista de dados ausentes inválida."), 5, 30)
        if (missing.any { it !in setOf("sono", "passos", "FC de repouso", "peso", "check-in") }) {
            BridgeProtocol.fail("E_PLAN", "Slot ausente desconhecido.")
        }
        if (observed != 4 - missing.count { it != "check-in" } || checkInPresent == ("check-in" in missing)) {
            BridgeProtocol.fail("E_PLAN", "Cobertura inconsistente.")
        }
        val expectedScore = ((observed + if (checkInPresent) 1 else 0) * 20)
        if (score != expectedScore) BridgeProtocol.fail("E_PLAN", "Pontuação de cobertura inconsistente.")
        val expectedLabel = if (score >= 80) "boa cobertura" else if (score >= 40) "cobertura parcial" else "poucos dados"
        if (BridgeProtocol.boundedString(value, "label", 30) != expectedLabel) {
            BridgeProtocol.fail("E_PLAN", "Rótulo de cobertura inválido.")
        }
    }

    private fun validateReadiness(value: JSONObject): List<String> {
        BridgeProtocol.requireExactKeys(value, readinessKeys, "prontidão")
        val score = nullableScore(value, "score")
        val expectedLabel = when {
            score == null -> "dados insuficientes"
            score >= 80 -> "pronto"
            score >= 62 -> "atenção leve"
            score >= 45 -> "conservador"
            else -> "recuperação prioritária"
        }
        if (BridgeProtocol.boundedString(value, "label", 40) != expectedLabel) {
            BridgeProtocol.fail("E_PLAN", "Rótulo de prontidão inválido.")
        }
        val confidence = strictNumber(value, "confidence", 0.0, 1.0)
        val expectedConfidence = if (confidence >= 0.75) "alta" else if (confidence >= 0.45) "moderada" else "baixa"
        if (BridgeProtocol.boundedString(value, "confidenceLabel", 20) != expectedConfidence) {
            BridgeProtocol.fail("E_PLAN", "Rótulo de confiança inválido.")
        }
        return validateEvidence(value.optJSONArray("evidence")
            ?: BridgeProtocol.fail("E_PLAN", "Evidências de prontidão inválidas."))
    }

    private fun validateDimensions(value: JSONObject) {
        BridgeProtocol.requireExactKeys(value, dimensionKeys, "dimensões")
        val muscles = value.optJSONArray("muscleReadiness")
            ?: BridgeProtocol.fail("E_PLAN", "Prontidão muscular inválida.")
        if (muscles.length() != BodyRegion.entries.size) BridgeProtocol.fail("E_PLAN", "Regiões musculares incompletas.")
        val regions = (0 until muscles.length()).map { index ->
            val row = muscles.optJSONObject(index) ?: BridgeProtocol.fail("E_PLAN", "Região muscular inválida.")
            BridgeProtocol.requireExactKeys(row, muscleKeys, "região muscular")
            val region = BridgeProtocol.boundedString(row, "region", 20)
            if (region !in BodyRegion.entries.map { it.name }) BridgeProtocol.fail("E_PLAN", "Região muscular desconhecida.")
            val expectedLabel = mapOf(
                "CHEST" to "Peito", "BACK" to "Costas", "SHOULDERS" to "Ombros",
                "ARMS" to "Braços", "GLUTES" to "Glúteos", "QUADS" to "Quadríceps",
                "HAMSTRINGS" to "Posteriores", "CALVES" to "Panturrilhas", "CORE" to "Core"
            ).getValue(region)
            if (BridgeProtocol.boundedString(row, "label", 30) != expectedLabel) {
                BridgeProtocol.fail("E_PLAN", "Rótulo muscular inválido.")
            }
            val score = nullableScore(row, "score")
            val status = BridgeProtocol.boundedString(row, "status", 20)
            if (status !in
                setOf("unknown", "none", "mild", "moderate", "severe")) {
                BridgeProtocol.fail("E_PLAN", "Estado muscular inválido.")
            }
            if (score != null) BridgeProtocol.fail("E_PLAN", "Dor muscular categórica não aceita falsa precisão numérica.")
            val confidence = strictNumber(row, "confidence", 0.0, 1.0)
            if ((status == "unknown" && confidence != 0.15) || (status != "unknown" && confidence != 0.7)) {
                BridgeProtocol.fail("E_PLAN", "Confiança muscular inconsistente.")
            }
            region
        }
        if (regions.toSet().size != BodyRegion.entries.size) BridgeProtocol.fail("E_PLAN", "Regiões musculares duplicadas.")
        validateSummaryDimension(
            value.optJSONObject("runningLoad") ?: BridgeProtocol.fail("E_PLAN", "Carga de corrida inválida."),
            setOf("Passos observados não são tratados como corrida.", "Nenhum treino de corrida foi importado."),
            Regex("^(Evolução|Strava|Fonte local) hoje: [0-9.,]+ (corrida|corridas|km|min)( · [0-9.,]+ (corrida|corridas|km|min)){0,2}\\.$")
        )
        validateSummaryDimension(
            value.optJSONObject("fueling") ?: BridgeProtocol.fail("E_PLAN", "Combustível inválido."),
            setOf("Nenhum registro de alimentação ou hidratação foi importado hoje."),
            Regex("^NutriTrack hoje: [0-9.,/]+ (kcal|g proteína|L água|refeição|refeições)( · [0-9.,/]+ (kcal|g proteína|L água|refeição|refeições)){0,2}\\.$")
        )
    }

    private fun validateSummaryDimension(value: JSONObject, insufficientMessages: Set<String>, observedPattern: Regex) {
        BridgeProtocol.requireExactKeys(value, dimensionSummaryKeys, "resumo de dimensão")
        if (!value.isNull("score")) BridgeProtocol.fail("E_PLAN", "Dimensão observacional não aceita pontuação inferida.")
        val status = BridgeProtocol.boundedString(value, "status", 24)
        val message = BridgeProtocol.boundedString(value, "message", 180)
        when (status) {
            "insufficient_data" -> if (message !in insufficientMessages) {
                BridgeProtocol.fail("E_PLAN", "Mensagem de dimensão insuficiente inválida.")
            }
            "observed" -> if (!observedPattern.matches(message)) {
                BridgeProtocol.fail("E_PLAN", "Resumo observado inválido.")
            }
            else -> BridgeProtocol.fail("E_PLAN", "Estado de dimensão inválido.")
        }
    }

    private fun validateSafety(value: JSONObject): Boolean {
        BridgeProtocol.requireExactKeys(value, safetyKeys, "segurança")
        val blocked = strictBoolean(value, "aggressiveChangesBlocked")
        val flags = stringArray(value.optJSONArray("flags") ?: BridgeProtocol.fail("E_PLAN", "Alertas inválidos."), 10, 180)
        val guidance = if (value.isNull("guidance")) null else BridgeProtocol.boundedString(value, "guidance", 500)
        if (blocked != flags.isNotEmpty() || blocked != (guidance != null)) {
            BridgeProtocol.fail("E_PLAN", "Sinais e bloqueio de segurança inconsistentes.")
        }
        return blocked
    }

    private fun validateEvidence(value: JSONArray): List<String> {
        if (value.length() > 16) BridgeProtocol.fail("E_PLAN", "Evidências excedem o limite.")
        return (0 until value.length()).map { index ->
            val item = value.opt(index)
            if (item !is String || item.isBlank() || item.length > 128) {
                BridgeProtocol.fail("E_PLAN", "Evidência inválida.")
            }
            item
        }.also { if (it.distinct().size != it.size) BridgeProtocol.fail("E_PLAN", "Evidências duplicadas.") }
    }

    private fun stringArray(value: JSONArray, maxItems: Int, maxLength: Int): List<String> {
        if (value.length() > maxItems) BridgeProtocol.fail("E_PLAN", "Lista excede o limite.")
        return (0 until value.length()).map { index ->
            val item = value.opt(index)
            if (item !is String || item.isBlank() || item.length > maxLength) BridgeProtocol.fail("E_PLAN", "Item de lista inválido.")
            item
        }
    }

    private fun nullableScore(value: JSONObject, key: String): Int? =
        if (value.isNull(key)) null else strictInt(value, key, 0, 100)

    private fun strictInt(value: JSONObject, key: String, min: Int, max: Int): Int {
        val raw = value.opt(key)
        if (raw !is Number || raw.toDouble().isFinite().not() || raw.toDouble() % 1.0 != 0.0) {
            BridgeProtocol.fail("E_PLAN", "$key precisa ser inteiro.")
        }
        val result = raw.toInt()
        if (result !in min..max) BridgeProtocol.fail("E_PLAN", "$key fora do intervalo.")
        return result
    }

    private fun strictNumber(value: JSONObject, key: String, min: Double, max: Double): Double {
        val raw = value.opt(key)
        if (raw !is Number) BridgeProtocol.fail("E_PLAN", "$key precisa ser numérico.")
        val result = raw.toDouble()
        if (!result.isFinite() || result !in min..max) BridgeProtocol.fail("E_PLAN", "$key fora do intervalo.")
        return result
    }

    private fun strictBoolean(value: JSONObject, key: String): Boolean {
        val raw = value.opt(key)
        if (raw !is Boolean) BridgeProtocol.fail("E_PLAN", "$key precisa ser booleano.")
        return raw
    }
}

/** Operation-specific schema for user edits and engine proposal payloads. */
object ProposalEditValidator {
    fun validate(operation: String, value: JSONObject): String {
        when (operation) {
            "maintain_plan" -> {
                BridgeProtocol.requireExactKeys(value, setOf("change"), "payload manter")
                if (value.opt("change") != "none") BridgeProtocol.fail("E_DECISION", "Payload de manutenção inválido.")
            }
            "increase_rir" -> {
                BridgeProtocol.requireExactKeys(value, setOf("rirDelta"), "payload RIR")
                val delta = value.opt("rirDelta")
                if (delta !is Int || delta !in 1..2) BridgeProtocol.fail("E_DECISION", "Ajuste de RIR precisa ser 1 ou 2.")
            }
            "reduce_set" -> {
                BridgeProtocol.requireExactKeys(value, setOf("setsDelta", "scope"), "payload de séries")
                if (value.opt("setsDelta") != -1 || value.opt("scope") != "highest_fatigue_exercise") {
                    BridgeProtocol.fail("E_DECISION", "Ajuste de séries inválido.")
                }
            }
            "safety_hold" -> {
                BridgeProtocol.requireExactKeys(value, setOf("intensity"), "payload de segurança")
                if (value.opt("intensity") != "avoid_aggressive_progression") {
                    BridgeProtocol.fail("E_DECISION", "Payload de segurança inválido.")
                }
            }
            else -> BridgeProtocol.fail("E_DECISION", "Operação não editável.")
        }
        val encoded = value.toString()
        if (encoded.toByteArray().size > 2_048) BridgeProtocol.fail("E_DECISION", "Payload excede o limite.")
        return encoded
    }
}
