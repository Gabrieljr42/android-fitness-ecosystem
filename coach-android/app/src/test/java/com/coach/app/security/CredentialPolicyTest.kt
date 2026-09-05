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

    @Test fun modelMustBeInSupportedAllowlist() {
        assertEquals("gemini-3.7-flash", CredentialPolicy.validateModel("gemini-3.7-flash"))
        assertEquals("gemini-3.6-flash", CredentialPolicy.validateModel("gemini-3.6-flash"))
        assertEquals("gemini-3.5-flash", CredentialPolicy.validateModel("gemini-3.5-flash"))
        // Regex-plausible but not allowlisted: format guard passes, allowlist must reject.
        assertFails { CredentialPolicy.validateModel("gemini-9.9-flash") }
        assertFails { CredentialPolicy.validateModel("gemini-flash-latest") }
        // Challenger hardening: empty, wrong case, and overlong names never reach the allowlist.
        assertFails { CredentialPolicy.validateModel("") }
        assertFails { CredentialPolicy.validateModel("   ") }
        assertFails { CredentialPolicy.validateModel("GEMINI-3.7-FLASH") }
        assertFails { CredentialPolicy.validateModel("gemini-" + "a".repeat(73)) }
    }

    private fun assertFails(block: () -> Unit) {
        try { block(); throw AssertionError("expected IllegalArgumentException") }
        catch (_: IllegalArgumentException) { }
    }
}
