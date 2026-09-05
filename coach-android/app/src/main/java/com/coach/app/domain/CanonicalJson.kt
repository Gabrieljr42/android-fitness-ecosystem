package com.coach.app.domain

import java.math.BigDecimal

object CanonicalJson {

    fun write(value: Any?): String {
        val sb = StringBuilder()
        writeTo(value, sb)
        return sb.toString()
    }

    private fun writeTo(value: Any?, sb: StringBuilder) {
        when (value) {
            null -> sb.append("null")
            is Boolean -> sb.append(if (value) "true" else "false")
            is Int, is Long, is Short, is Byte -> sb.append(value.toString())
            is Double -> appendNumber(value, sb)
            is Float -> appendNumber(value.toDouble(), sb)
            is String -> appendEscaped(value, sb)
            is Map<*, *> -> writeObject(value, sb)
            is List<*> -> writeArray(value, sb)
            is Array<*> -> writeArray(value.toList(), sb)
            else -> throw IllegalArgumentException("unsupported canonical type: ${value::class.java}")
        }
    }

    private fun writeObject(map: Map<*, *>, sb: StringBuilder) {
        sb.append('{')
        val keys = map.keys.map { it as String }.sorted()
        keys.forEachIndexed { i, k ->
            if (i > 0) sb.append(',')
            appendEscaped(k, sb)
            sb.append(':')
            writeTo(map[k], sb)
        }
        sb.append('}')
    }

    private fun writeArray(list: List<*>, sb: StringBuilder) {
        sb.append('[')
        list.forEachIndexed { i, v ->
            if (i > 0) sb.append(',')
            writeTo(v, sb)
        }
        sb.append(']')
    }

    private fun appendNumber(d: Double, sb: StringBuilder) {
        require(d.isFinite()) { "non-finite numbers are not canonical: $d" }
        val normalized = BigDecimal(d.toString()).stripTrailingZeros()
        sb.append(if (normalized.signum() == 0) "0" else normalized.toPlainString())
    }

    private fun appendEscaped(s: String, sb: StringBuilder) {
        sb.append('"')
        for (c in s) {
            when {
                c == '"' -> sb.append("\\\"")
                c == '\\' -> sb.append("\\\\")
                c == '\n' -> sb.append("\\n")
                c == '\r' -> sb.append("\\r")
                c == '\t' -> sb.append("\\t")
                c.code < 0x20 -> sb.append("\\u").append(String.format("%04x", c.code))
                else -> sb.append(c)
            }
        }
        sb.append('"')
    }
}
