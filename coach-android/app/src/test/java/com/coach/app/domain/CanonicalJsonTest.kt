package com.coach.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class CanonicalJsonTest {

    @Test
    fun keyOrderDoesNotAffectOutput() {
        val a = linkedMapOf<String, Any?>("b" to 1, "a" to 2)
        val b = linkedMapOf<String, Any?>("a" to 2, "b" to 1)
        assertEquals(CanonicalJson.write(a), CanonicalJson.write(b))
        assertEquals("""{"a":2,"b":1}""", CanonicalJson.write(a))
    }

    @Test
    fun escapesStringsPredictably() {
        val out = CanonicalJson.write(mapOf("k" to "he said \"hi\"\n\tx"))
        assertEquals("""{"k":"he said \"hi\"\n\tx"}""", out)
    }

    @Test
    fun controlCharsAreUnicodeEscaped() {
        val input = "a" + Char(1) + "b"
        val out = CanonicalJson.write(mapOf("k" to input))
        assertEquals("{\"k\":\"a\\u0001b\"}", out)
    }

    @Test
    fun plainNumberFormattingAvoidsScientificNotation() {
        assertEquals("1000000000000000000000", extract(CanonicalJson.write(mapOf("n" to 1e21))))
        assertEquals("0.001", extract(CanonicalJson.write(mapOf("n" to 0.001))))
        assertEquals("-2.5", extract(CanonicalJson.write(mapOf("n" to -2.5))))
        assertEquals("0", extract(CanonicalJson.write(mapOf("n" to 0.0))))
        assertEquals("42", extract(CanonicalJson.write(mapOf("n" to 42L))))
    }

    private fun extract(json: String): String =
        json.substringAfter(":").removeSuffix("}")

    @Test
    fun nestedStructuresSerializeDeterministically() {
        val v: Map<String, Any?> = mapOf(
            "list" to listOf(1, "two", null, true),
            "obj" to mapOf("z" to 0.5, "y" to null)
        )
        val once = CanonicalJson.write(v)
        repeat(10) { assertEquals(once, CanonicalJson.write(v)) }
        assertTrue(once.contains("\"obj\":{\"y\":null,\"z\":0.5}"))
    }

    @Test
    fun nonFiniteNumbersRejected() {
        assertThrows(IllegalArgumentException::class.java) {
            CanonicalJson.write(mapOf("n" to Double.POSITIVE_INFINITY))
        }
    }

    @Test
    fun unsupportedTypesRejected() {
        assertThrows(IllegalArgumentException::class.java) {
            CanonicalJson.write(mapOf("o" to Any()))
        }
    }
}
