package com.coach.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class LogicalDayTest {

    private val sp = ZoneId.of("America/Sao_Paulo")
    private val tokyo = ZoneId.of("Asia/Tokyo")

    @Test
    fun midnightCrossingAssignsCorrectDatesInSaoPaulo() {
        val before = java.time.ZonedDateTime.of(2026, 8, 22, 23, 50, 0, 0, sp).toInstant().toEpochMilli()
        val after = before + 20 * 60 * 1000L
        assertEquals(java.time.LocalDate.of(2026, 8, 22), LogicalDay.fromInstant(before, sp))
        assertEquals(java.time.LocalDate.of(2026, 8, 23), LogicalDay.fromInstant(after, sp))
    }

    @Test
    fun sameInstantHasDifferentLocalDatesAcrossOffsets() {
        val t = java.time.ZonedDateTime.of(2026, 8, 22, 12, 0, 0, 0, sp).toInstant().toEpochMilli()
        assertEquals(java.time.LocalDate.of(2026, 8, 22), LogicalDay.fromInstant(t, sp))
        assertEquals(java.time.LocalDate.of(2026, 8, 23), LogicalDay.fromInstant(t, tokyo))
    }

    @Test
    fun sessionCrossingMidnightBelongsToWakeUpDay() {
        val start = java.time.ZonedDateTime.of(2026, 8, 21, 23, 0, 0, 0, sp).toInstant().toEpochMilli()
        val end = java.time.ZonedDateTime.of(2026, 8, 22, 6, 30, 0, 0, sp).toInstant().toEpochMilli()
        assertEquals(java.time.LocalDate.of(2026, 8, 22), LogicalDay.sessionDay(start, end, sp))
    }

    @Test
    fun invertedSessionRejected() {
        assertThrows(IllegalArgumentException::class.java) {
            LogicalDay.sessionDay(2_000L, 1_000L, sp)
        }
    }

    @Test
    fun recoverySleepWindowsMeetWithoutOverlap() {
        val date = LocalDate.of(2026, 8, 23)
        val today = LogicalDay.recoverySleepWindow(date, sp)
        val tomorrow = LogicalDay.recoverySleepWindow(date.plusDays(1), sp)

        assertEquals(today.second, tomorrow.first)
        assertEquals(18, today.first.atZone(sp).hour)
        assertEquals(18, today.second.atZone(sp).hour)
    }
}
