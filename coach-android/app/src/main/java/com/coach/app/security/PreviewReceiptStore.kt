package com.coach.app.security

import java.security.SecureRandom
import java.util.Base64

data class PreviewBinding(
    val snapshotHash: String,
    val planRunId: String,
    val model: String,
    val payloadHash: String
)

data class PreviewReceipt(val token: String, val expiresAtEpochMs: Long)

/** One-shot, short-lived proof that the exact external payload was previewed. */
class PreviewReceiptStore(
    private val nowEpochMs: () -> Long = System::currentTimeMillis,
    private val tokenFactory: () -> String = ::secureToken
) {
    private val receipts = linkedMapOf<String, Pair<PreviewBinding, Long>>()

    @Synchronized
    fun issue(binding: PreviewBinding): PreviewReceipt {
        removeExpired()
        while (receipts.size >= MAX_PENDING) receipts.remove(receipts.keys.first())
        var token: String
        do token = tokenFactory() while (token in receipts)
        require(TOKEN_PATTERN.matches(token)) { "invalid preview token" }
        val expiry = nowEpochMs() + TTL_MS
        receipts[token] = binding to expiry
        return PreviewReceipt(token, expiry)
    }

    /** Consumes before comparing so a failed or mismatched attempt cannot be replayed. */
    @Synchronized
    fun consume(token: String, expected: PreviewBinding): Boolean {
        if (!TOKEN_PATTERN.matches(token)) return false
        val stored = receipts.remove(token) ?: return false
        return stored.second >= nowEpochMs() && stored.first == expected
    }

    @Synchronized
    fun clear() = receipts.clear()

    private fun removeExpired() {
        val now = nowEpochMs()
        receipts.entries.removeAll { it.value.second < now }
    }

    companion object {
        private const val TTL_MS = 2 * 60_000L
        private const val MAX_PENDING = 8
        private val TOKEN_PATTERN = Regex("[A-Za-z0-9_-]{32,64}")

        private fun secureToken(): String {
            val bytes = ByteArray(24)
            SecureRandom().nextBytes(bytes)
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        }
    }
}
