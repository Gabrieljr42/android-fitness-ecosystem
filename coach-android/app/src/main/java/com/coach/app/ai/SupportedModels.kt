package com.coach.app.ai

/**
 * Central Gemini model allowlist (Phase 2 centralization, 2026-09-05).
 *
 * Mirrors nutricao `core/gemini-models.js` (config version 1): same IDs, same
 * fallback order, same default. [CredentialPolicy.validateModel] enforces
 * format (regex) AND membership here, so the bridge and [GeminiGateway] only
 * ever accept a verified model. No transport/validator behavior changes.
 *
 * Order of [MODELS] documents the NutriTrack fallback order; Coach itself
 * sends a single configured model per review (see MainActivity KEY_MODEL).
 */
object SupportedModels {
    const val CONFIG_VERSION = 1
    const val DEFAULT_MODEL = "gemini-3.7-flash"

    data class Model(val id: String, val label: String)

    val MODELS: List<Model> = listOf(
        Model("gemini-3.7-flash", "Gemini 3.7 Flash"),
        Model("gemini-3.6-flash", "Gemini 3.6 Flash"),
        Model("gemini-3.5-flash", "Gemini 3.5 Flash")
    )

    val IDS: Set<String> = MODELS.map { it.id }.toSet()

    fun isSupported(id: String): Boolean = IDS.contains(id)
}
