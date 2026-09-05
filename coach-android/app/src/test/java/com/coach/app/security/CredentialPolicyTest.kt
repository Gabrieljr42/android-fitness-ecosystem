package com.coach.app.security

import org.junit.Assert.assertEquals
import org.junit.Test

class CredentialPolicyTest {
    @Test fun validatesAndTrimsPlausibleKey() {
        assertEquals("test-key-012345678901234567890123", CredentialPolicy.validateApiKey("  test-key-012345678901234567890123  "))
    }

    @Test fun rejectsShortWhitespaceAndControlCharacters() {
        assertFails { CredentialPolicy.validateApiKey("short") }
        assertFails { CredentialPolicy.validateApiKey("test-key-01234567890 123456789") }
        assertFails { CredentialPolicy.validateApiKey("test-key-01234567890\n123456789") }
    }

    @Test fun modelNameCannotEscapeEndpointPath() {
        assertEquals("gemini-3.7-flash", CredentialPolicy.validateModel(" gemini-3.7-flash "))
        assertFails { CredentialPolicy.validateModel("../../secrets") }
        assertFails { CredentialPolicy.validateModel("models/gemini-flash") }
        assertFails { CredentialPolicy.validateModel("other-model") }
    }

    private fun assertFails(block: () -> Unit) {
        try { block(); throw AssertionError("expected IllegalArgumentException") }
        catch (_: IllegalArgumentException) { }
    }
}
