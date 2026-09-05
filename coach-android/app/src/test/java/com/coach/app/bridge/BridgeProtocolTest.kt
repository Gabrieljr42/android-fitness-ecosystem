package com.coach.app.bridge

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BridgeProtocolTest {
    @Test fun parsesAllowedVersionedRequest() {
        val result = BridgeProtocol.parse(
            "health.sync",
            """{"version":1,"requestId":"web-abc-1","data":{}}"""
        )
        assertEquals("web-abc-1", result.requestId)
        assertEquals("health.sync", result.operation)
    }

    @Test fun rejectsUnknownOperationBeforeDispatch() {
        val error = expectFailure { BridgeProtocol.parse("database.dump", valid()) }
        assertEquals("E_OP_UNKNOWN", error.code)
    }

    @Test fun rejectsExtraEnvelopeField() {
        val error = expectFailure {
            BridgeProtocol.parse("health.sync", """{"version":1,"requestId":"x","data":{},"admin":true}""")
        }
        assertEquals("E_SCHEMA", error.code)
    }

    @Test fun rejectsWrongVersionAndInvalidId() {
        assertEquals("E_VERSION", expectFailure {
            BridgeProtocol.parse("health.sync", """{"version":2,"requestId":"x","data":{}}""")
        }.code)
        assertEquals("E_REQUEST_ID", expectFailure {
            BridgeProtocol.parse("health.sync", """{"version":1,"requestId":"x');alert(1)//","data":{}}""")
        }.code)
    }

    @Test fun rejectsTypeCoercionInEnvelope() {
        assertEquals("E_VERSION", expectFailure {
            BridgeProtocol.parse("health.sync", """{"version":"1","requestId":"x","data":{}}""")
        }.code)
        assertEquals("E_REQUEST_ID", expectFailure {
            BridgeProtocol.parse("health.sync", """{"version":1,"requestId":7,"data":{}}""")
        }.code)
    }

    @Test fun responseIsStructuredAndEscaped() {
        val encoded = BridgeProtocol.error("x", "E_TEST", "aspas \" e quebra\n")
        val parsed = JSONObject(encoded)
        assertTrue(!parsed.getBoolean("ok"))
        assertEquals("aspas \" e quebra\n", parsed.getJSONObject("error").getString("message"))
    }

    @Test fun enforcesUtf8ByteLimit() {
        val oversized = "á".repeat(BridgeProtocol.MAX_PAYLOAD_BYTES)
        val error = expectFailure { BridgeProtocol.parse("health.sync", oversized) }
        assertEquals("E_PAYLOAD_TOO_LARGE", error.code)
    }

    private fun valid() = """{"version":1,"requestId":"x","data":{}}"""
    private fun expectFailure(block: () -> Unit): BridgeProtocolException = try {
        block(); throw AssertionError("expected BridgeProtocolException")
    } catch (error: BridgeProtocolException) { error }
}
