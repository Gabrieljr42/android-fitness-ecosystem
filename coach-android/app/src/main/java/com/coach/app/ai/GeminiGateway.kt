package com.coach.app.ai

import com.coach.app.security.CredentialPolicy
import com.coach.app.security.GeminiCredentialStore
import org.json.JSONException
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URL
import java.nio.charset.StandardCharsets
import javax.net.ssl.HttpsURLConnection

interface GeminiTransport {
    fun generate(model: String, apiKey: String, request: JSONObject): String
}

data class GeminiReviewResult(
    val sentPayload: JSONObject,
    val opinion: GeminiOpinion
)

class GeminiGateway(
    private val credentials: GeminiCredentialStore,
    private val transport: GeminiTransport = HttpGeminiTransport()
) {
    fun review(model: String, payload: GeminiReviewPayload): GeminiReviewResult {
        val validatedModel = try { CredentialPolicy.validateModel(model) }
        catch (error: IllegalArgumentException) { throw GeminiException("E_GEMINI_MODEL", error.message ?: "Modelo inválido.") }
        val key = credentials.load() ?: throw GeminiException("E_GEMINI_KEY", "Configure uma chave Gemini primeiro.")
        val raw = transport.generate(validatedModel, key, GeminiRequestBuilder.wireRequest(payload.json))
        val opinion = GeminiValidator.validate(raw, payload.validationContext)
        return GeminiReviewResult(payload.json, opinion)
    }
}

class HttpGeminiTransport : GeminiTransport {
    override fun generate(model: String, apiKey: String, request: JSONObject): String {
        val endpoint = URL("https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent")
        val connection = endpoint.openConnection() as HttpsURLConnection
        try {
            val bytes = request.toString().toByteArray(StandardCharsets.UTF_8)
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 45_000
            connection.doOutput = true
            connection.useCaches = false
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("x-goog-api-key", apiKey)
            connection.setFixedLengthStreamingMode(bytes.size)
            connection.outputStream.use { it.write(bytes) }
            val status = connection.responseCode
            val responseBytes = readBounded(
                if (status in 200..299) connection.inputStream else connection.errorStream,
                MAX_HTTP_RESPONSE_BYTES
            )
            val responseText = String(responseBytes, StandardCharsets.UTF_8)
            if (status !in 200..299) {
                val providerMessage = runCatching {
                    JSONObject(responseText).getJSONObject("error").getString("message").take(180)
                }.getOrNull()
                throw GeminiException(
                    "E_GEMINI_HTTP",
                    providerMessage?.let { "Gemini recusou a solicitação ($status): $it" }
                        ?: "Gemini recusou a solicitação (HTTP $status)."
                )
            }
            return extractCandidate(responseText)
        } catch (error: GeminiException) {
            throw error
        } catch (_: java.net.SocketTimeoutException) {
            throw GeminiException("E_GEMINI_TIMEOUT", "A revisão do Gemini excedeu o tempo limite.")
        } catch (_: java.io.IOException) {
            throw GeminiException("E_GEMINI_NETWORK", "Não foi possível acessar o Gemini. O plano local continua disponível.")
        } finally {
            connection.disconnect()
        }
    }

    private fun extractCandidate(raw: String): String {
        try {
            val candidates = JSONObject(raw).getJSONArray("candidates")
            if (candidates.length() != 1) throw GeminiException("E_GEMINI_RESPONSE", "Quantidade inesperada de respostas.")
            val candidate = candidates.getJSONObject(0)
            val finish = candidate.optString("finishReason")
            if (finish !in setOf("STOP", "MAX_TOKENS")) {
                throw GeminiException("E_GEMINI_RESPONSE", "A resposta do Gemini foi bloqueada ou interrompida.")
            }
            val parts = candidate.getJSONObject("content").getJSONArray("parts")
            val textParts = (0 until parts.length()).mapNotNull { parts.optJSONObject(it)?.optString("text") }
            val result = textParts.joinToString("").trim()
            if (result.isBlank()) throw GeminiException("E_GEMINI_RESPONSE", "O Gemini não devolveu conteúdo.")
            return result
        } catch (error: GeminiException) {
            throw error
        } catch (_: JSONException) {
            throw GeminiException("E_GEMINI_RESPONSE", "Envelope de resposta Gemini inválido.")
        }
    }

    private fun readBounded(input: java.io.InputStream?, limit: Int): ByteArray {
        if (input == null) return ByteArray(0)
        return input.use { stream ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8_192)
            while (true) {
                val count = stream.read(buffer)
                if (count < 0) break
                if (output.size() + count > limit) {
                    throw GeminiException("E_GEMINI_RESPONSE", "Resposta HTTP maior que o limite seguro.")
                }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        }
    }

    companion object { private const val MAX_HTTP_RESPONSE_BYTES = 256 * 1024 }
}
