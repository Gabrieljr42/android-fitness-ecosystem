package com.evolucao.treino.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EventReconcilerTest {
    @Test
    fun duplicateEventIsAnIdempotentSuccess() {
        val reducer = EventReconciler()
        val event = ProtocolFixtures.completed()
        assertEquals(ReconcileStatus.APPLIED, reducer.submit(event).status)
        assertEquals(ReconcileStatus.DUPLICATE, reducer.submit(event).status)
        assertEquals(event.eventId, reducer.headEventId(event.setId))
        assertEquals(1, reducer.appliedEventIds().size)
    }

    @Test
    fun reusedEventIdWithDifferentPayloadIsStoredAsConflict() {
        val reducer = EventReconciler()
        reducer.submit(ProtocolFixtures.completed(reps = 10))
        val result = reducer.submit(ProtocolFixtures.completed(reps = 11))
        assertEquals(ReconcileStatus.CONFLICT_STORED, result.status)
        assertTrue(result.eventId in reducer.conflictEventIds())
    }

    @Test
    fun editArrivingBeforeBaseIsBlockedThenAppliedDeterministically() {
        val reducer = EventReconciler()
        val edit = ProtocolFixtures.edited()
        assertEquals(ReconcileStatus.BLOCKED, reducer.submit(edit).status)
        assertTrue(edit.eventId in reducer.blockedEventIds())

        val base = ProtocolFixtures.completed()
        assertEquals(ReconcileStatus.APPLIED, reducer.submit(base).status)
        assertTrue(reducer.blockedEventIds().isEmpty())
        assertEquals(edit.eventId, reducer.headEventId(base.setId))
    }

    @Test
    fun wearCompletionWinsConcurrentPhoneCompletionWithoutDroppingEither() {
        val reducer = EventReconciler()
        val phone = ProtocolFixtures.completed(
            eventId = ProtocolFixtures.EVENT_1,
            origin = Origin.PHONE,
            originSequence = 99,
            reps = 8
        )
        val wear = ProtocolFixtures.completed(
            eventId = ProtocolFixtures.EVENT_2,
            origin = Origin.WEAR,
            originSequence = 1,
            reps = 10
        )
        assertEquals(ReconcileStatus.APPLIED, reducer.submit(phone).status)
        assertEquals(ReconcileStatus.CONFLICT_STORED, reducer.submit(wear).status)
        assertEquals(wear.eventId, reducer.headEventId(wear.setId))
        assertTrue(phone.eventId in reducer.conflictEventIds())
        assertTrue(wear.eventId in reducer.conflictEventIds())
    }

    @Test
    fun finishBeforeSetWaitsAndCreatesOneFinishOnly() {
        val reducer = EventReconciler()
        val set = ProtocolFixtures.completed()
        val finish = finish(ProtocolFixtures.EVENT_3, mapOf(set.setId to set.eventId), 3)
        assertEquals(ReconcileStatus.BLOCKED, reducer.submit(finish).status)
        reducer.submit(set)
        assertEquals(finish.eventId, reducer.finishedEventId(finish.sessionId))

        val secondFinish = finish(ProtocolFixtures.EVENT_4, mapOf(set.setId to set.eventId), 4)
        assertEquals(ReconcileStatus.CONFLICT_STORED, reducer.submit(secondFinish).status)
        assertEquals(finish.eventId, reducer.finishedEventId(finish.sessionId))
    }

    @Test
    fun undoRemovesHeadAndRetryDoesNotApplyTwice() {
        val reducer = EventReconciler()
        val base = ProtocolFixtures.completed()
        reducer.submit(base)
        val undo = SetUndoneEvent(
            eventId = ProtocolFixtures.EVENT_2,
            sessionId = base.sessionId,
            planId = base.planId,
            planRevision = base.planRevision,
            logicalDate = base.logicalDate,
            occurredAt = base.occurredAt + 1_000,
            createdAt = base.createdAt + 1_000,
            origin = Origin.WEAR,
            originInstanceId = ProtocolFixtures.INSTANCE_WEAR,
            originSequence = 2,
            exerciseId = base.exerciseId,
            setId = base.setId,
            baseEventId = base.eventId,
            reason = null
        )
        assertEquals(ReconcileStatus.APPLIED, reducer.submit(undo).status)
        assertNull(reducer.headEventId(base.setId))
        assertTrue(reducer.isSetUndone(base.setId))
        assertEquals(ReconcileStatus.DUPLICATE, reducer.submit(undo).status)
    }

    @Test
    fun invalidEventIsRejectedWithoutChangingProjection() {
        val reducer = EventReconciler()
        val invalid = ProtocolFixtures.completed(reps = ProtocolLimits.MAX_REPS + 1)
        assertEquals(ReconcileStatus.REJECTED, reducer.submit(invalid).status)
        assertNull(reducer.headEventId(invalid.setId))
    }

    private fun finish(eventId: String, heads: Map<String, String>, sequence: Long) = SessionFinishedEvent(
        eventId = eventId,
        sessionId = ProtocolFixtures.SESSION_ID,
        planId = ProtocolFixtures.PLAN_ID,
        planRevision = PlanRevision(1),
        logicalDate = "2026-08-23",
        occurredAt = 1_777_000_040_000 + sequence,
        createdAt = 1_777_000_040_100 + sequence,
        origin = Origin.WEAR,
        originInstanceId = ProtocolFixtures.INSTANCE_WEAR,
        originSequence = sequence,
        mode = WorkoutMode.NORMAL,
        durationSeconds = 1_800,
        finalSetHeads = heads
    )
}
