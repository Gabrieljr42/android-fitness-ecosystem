package com.coach.app.bridge

import com.coach.app.domain.BodyRegion
import com.coach.app.domain.SorenessLevel
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class CheckInPayloadParserTest {
    @Test fun parsesAndNormalizesValidCheckIn() {
        val parsed = CheckInPayloadParser.parse(JSONObject(valid()), LocalDate.parse("2026-08-23"), 100)
        assertEquals(4, parsed.energy)
        assertEquals(SorenessLevel.MODERATE, parsed.soreness[BodyRegion.QUADS])
        assertNull(parsed.note)
    }

    @Test fun rejectsNumericCoercionAndUnknownRegion() {
        val numericString = JSONObject(valid()).put("energy", "4")
        assertEquals("E_CHECKIN", expectFailure { CheckInPayloadParser.parse(numericString, date(), 1) }.code)
        val region = JSONObject(valid())
        region.getJSONObject("soreness").put("KNEE", "SEVERE")
        assertEquals("E_CHECKIN", expectFailure { CheckInPayloadParser.parse(region, date(), 1) }.code)
    }

    @Test fun rejectsExtraFieldsAndOversizedNote() {
        assertEquals("E_SCHEMA", expectFailure {
            CheckInPayloadParser.parse(JSONObject(valid()).put("hidden", true), date(), 1)
        }.code)
        assertEquals("E_CHECKIN", expectFailure {
            CheckInPayloadParser.parse(JSONObject(valid()).put("note", "x".repeat(281)), date(), 1)
        }.code)
    }

    private fun valid() = """{
      "energy":4,"perceivedSleepQuality":3,"motivation":5,
      "soreness":{"QUADS":"MODERATE"},"jointPainFlag":false,"note":"   "
    }"""
    private fun date() = LocalDate.parse("2026-08-23")
    private fun expectFailure(block: () -> Unit): BridgeProtocolException = try {
        block(); throw AssertionError("expected failure")
    } catch (error: BridgeProtocolException) { error }
}
