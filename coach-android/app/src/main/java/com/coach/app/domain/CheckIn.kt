package com.coach.app.domain

import java.time.LocalDate

enum class BodyRegion {
    CHEST,
    BACK,
    SHOULDERS,
    ARMS,
    GLUTES,
    QUADS,
    HAMSTRINGS,
    CALVES,
    CORE
}

enum class SorenessLevel {
    NONE,
    MILD,
    MODERATE,
    SEVERE
}

data class CheckIn(
    val logicalDate: LocalDate,
    val energy: Int,
    val perceivedSleepQuality: Int,
    val motivation: Int,
    val soreness: Map<BodyRegion, SorenessLevel>,
    val jointPainFlag: Boolean,
    val note: String?,
    val recordedAtEpochMs: Long,
    val source: DataSource = DataSource.CHECK_IN,
    val contractVersion: Int = Contract.VERSION
) {

    init {
        require(energy in 1..5) { "energy out of range: $energy" }
        require(perceivedSleepQuality in 1..5) { "sleep quality out of range: $perceivedSleepQuality" }
        require(motivation in 1..5) { "motivation out of range: $motivation" }
        if (note != null) {
            require(note.length <= MAX_NOTE_LENGTH) { "note exceeds ${MAX_NOTE_LENGTH} chars" }
            require(note.none { it.code < 0x20 && it !in ALLOWED_CONTROL }) { "note contains control characters" }
        }
    }

    val hasSafetyFlag: Boolean
        get() = jointPainFlag || soreness.containsValue(SorenessLevel.SEVERE)

    companion object {
        const val MAX_NOTE_LENGTH = 280
        private val ALLOWED_CONTROL = setOf('\n', '\r', '\t')
    }
}
