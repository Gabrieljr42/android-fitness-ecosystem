package com.coach.app.security

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PreviewReceiptStoreTest {
    private val binding = PreviewBinding("a".repeat(64), "plan-1", "gemini-3.7-flash", "b".repeat(64))

    @Test
    fun receiptIsBoundAndOneShot() {
        var token = 0
        val store = PreviewReceiptStore({ 1_000L }) { "x".repeat(31) + (++token).toString() }
        val receipt = store.issue(binding)

        assertTrue(store.consume(receipt.token, binding))
        assertFalse(store.consume(receipt.token, binding))
    }

    @Test
    fun mismatchConsumesReceiptAndPreventsReplay() {
        val store = PreviewReceiptStore({ 1_000L }) { "y".repeat(32) }
        val receipt = store.issue(binding)

        assertFalse(store.consume(receipt.token, binding.copy(planRunId = "other")))
        assertFalse(store.consume(receipt.token, binding))
    }

    @Test
    fun expiredReceiptFailsClosed() {
        var now = 1_000L
        val store = PreviewReceiptStore({ now }) { "z".repeat(32) }
        val receipt = store.issue(binding)
        now = receipt.expiresAtEpochMs + 1

        assertFalse(store.consume(receipt.token, binding))
    }

    @Test
    fun malformedTokenNeverMatches() {
        val store = PreviewReceiptStore({ 1_000L }) { "q".repeat(32) }
        store.issue(binding)
        assertFalse(store.consume("../bad", binding))
    }
}
