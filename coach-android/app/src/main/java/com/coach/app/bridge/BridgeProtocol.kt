package com.coach.app.bridge

import org.json.JSONException
import org.json.JSONObject
import java.nio.charset.StandardCharsets

data class BridgeRequest(
    val operation: String,
    val requestId: String,
    val data: JSONObject
)

class BridgeProtocolException(
    val code: String,
    override val message: String
) : IllegalArgumentException(message)

/** Small, allowlist-only and versioned WebView boundary. */
object BridgeProtocol {
    const val VERSION = 1
    const val MAX_PAYLOAD_BYTES = 32 * 1024

    val allowedOperations = setOf(
        "app.bootstrap",
        "health.requestPermissions",
        "health.sync",
        "health.openSettings",
        "checkin.save",
        "plan.persist",
        "decision.save",
        "gemini.saveKey",
        "gemini.clearKey",
        "gemini.preview",
        "gemini.review",
        "notification.schedule",
        "privacy.deleteLocalData"
    )

    private val requestIdPattern = Regex("[A-Za-z0-9._:-]{1,80}")

    fun parse(operation: String, rawPayload: String): BridgeRequest {
        if (operation.length > 64) fail("E_OP_UNKNOWN", "Operação não permitida.")
        if (operation !in allowedOperations) fail("E_OP_UNKNOWN", "Operação não permitida.")
        if (rawPayload.length > MAX_PAYLOAD_BYTES) {
            fail("E_PAYLOAD_TOO_LARGE", "Mensagem maior que o limite de 32 KiB.")
        }
        if (rawPayload.toByteArray(StandardCharsets.UTF_8).size > MAX_PAYLOAD_BYTES) {
            fail("E_PAYLOAD_TOO_LARGE", "Mensagem maior que o limite de 32 KiB.")
        }
        val root = try {
            JSONObject(rawPayload)
        } catch (_: JSONException) {
            fail("E_JSON", "Mensagem JSON inválida.")
        }
        requireExactKeys(root, setOf("version", "requestId", "data"), "mensagem")
        if (root.opt("version") !is Int || root.getInt("version") != VERSION) {
            fail("E_VERSION", "Versão da ponte incompatível.")
        }
        val requestId = root.opt("requestId") as? String
            ?: fail("E_REQUEST_ID", "Identificador de requisição inválido.")
        if (!requestIdPattern.matches(requestId)) fail("E_REQUEST_ID", "Identificador de requisição inválido.")
        val data = root.optJSONObject("data") ?: fail("E_DATA", "O campo data precisa ser um objeto.")
        return BridgeRequest(operation, requestId, data)
    }

    fun requestIdHint(rawPayload: String): String? = if (rawPayload.length > MAX_PAYLOAD_BYTES) null else try {
        (JSONObject(rawPayload).opt("requestId") as? String)?.takeIf { requestIdPattern.matches(it) }
    } catch (_: JSONException) {
        null
    }

    fun success(requestId: String, data: JSONObject = JSONObject()): String = JSONObject()
        .put("version", VERSION)
        .put("requestId", requestId)
        .put("ok", true)
        .put("data", data)
        .toString()

    fun error(requestId: String, code: String, message: String): String = JSONObject()
        .put("version", VERSION)
        .put("requestId", requestId)
        .put("ok", false)
        .put("error", JSONObject().put("code", code).put("message", message.take(240)))
        .toString()

    fun requireExactKeys(value: JSONObject, expected: Set<String>, label: String) {
        val actual = value.keys().asSequence().toSet()
        if (actual != expected) fail("E_SCHEMA", "$label contém campos ausentes ou desconhecidos.")
    }

    fun requireOnlyKeys(value: JSONObject, allowed: Set<String>, label: String) {
        val unexpected = value.keys().asSequence().filterNot { it in allowed }.toList()
        if (unexpected.isNotEmpty()) fail("E_SCHEMA", "$label contém campos desconhecidos.")
    }

    fun boundedString(value: JSONObject, key: String, max: Int, allowBlank: Boolean = false): String {
        val raw = value.opt(key)
        if (raw !is String) fail("E_SCHEMA", "$key precisa ser texto.")
        val result = raw
        if ((!allowBlank && result.isBlank()) || result.length > max || result.hasUnsafeControlCharacters()) {
            fail("E_SCHEMA", "$key é inválido.")
        }
        return result
    }

    fun fail(code: String, message: String): Nothing = throw BridgeProtocolException(code, message)

    private fun String.hasUnsafeControlCharacters(): Boolean = any {
        it.code < 0x20 && it !in setOf('\n', '\r', '\t')
    }
}
