package com.coach.app.domain

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

object SnapshotHashing {
    fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest(input.toByteArray(StandardCharsets.UTF_8))
        return bytes.joinToString("") { String.format("%02x", it) }
    }
}
