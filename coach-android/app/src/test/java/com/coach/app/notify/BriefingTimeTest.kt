package com.coach.app.notify

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class BriefingTimeTest {
    private val zone = ZoneId.of("America/Sao_Paulo")

    @Test fun schedulesSameDayBeforeFiveForty() {
        val now = ZonedDateTime.of(2026, 8, 23, 5, 39, 59, 0, zone)
        assertEquals("2026-08-23T05:40-03:00[America/Sao_Paulo]", BriefingTime.next(now).toString())
    }

    @Test fun schedulesNextDayAtOrAfterFiveForty() {
        val exact = ZonedDateTime.of(2026, 8, 23, 5, 40, 0, 0, zone)
        assertEquals(24, java.time.Duration.between(exact, BriefingTime.next(exact)).toHours())
        val later = ZonedDateTime.of(2026, 8, 23, 22, 0, 0, 0, zone)
        assertEquals("2026-08-24", BriefingTime.next(later).toLocalDate().toString())
    }
}
