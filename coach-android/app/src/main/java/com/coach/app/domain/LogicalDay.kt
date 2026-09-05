package com.coach.app.domain

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

object LogicalDay {

    private val RECOVERY_DAY_CUTOFF: LocalTime = LocalTime.of(18, 0)

    fun fromInstant(epochMs: Long, zone: ZoneId): LocalDate =
        Instant.ofEpochMilli(epochMs).atZone(zone).toLocalDate()

    fun sessionDay(startEpochMs: Long, endEpochMs: Long, zone: ZoneId): LocalDate {
        require(endEpochMs >= startEpochMs) { "session end before start" }
        return fromInstant(endEpochMs, zone)
    }

    /**
     * Non-overlapping window used for the recovery sleep aggregate. A calendar-midnight window
     * would lose the part of an overnight session before midnight; an unbounded look-back would
     * count the same night on consecutive briefings. The 18:00 cutoff keeps a normal overnight
     * session together while assigning every instant to exactly one logical recovery day.
     */
    fun recoverySleepWindow(date: LocalDate, zone: ZoneId): Pair<Instant, Instant> =
        date.minusDays(1).atTime(RECOVERY_DAY_CUTOFF).atZone(zone).toInstant() to
            date.atTime(RECOVERY_DAY_CUTOFF).atZone(zone).toInstant()
}
