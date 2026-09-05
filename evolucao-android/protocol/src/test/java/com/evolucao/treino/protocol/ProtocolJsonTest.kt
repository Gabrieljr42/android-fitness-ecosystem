package com.evolucao.treino.protocol

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProtocolJsonTest {
    @Test
    fun planRoundTripPreservesTypedSnapshot() {
        val plan = ProtocolFixtures.plan()
        assertEquals(plan, ProtocolJson.decodePlan(ProtocolJson.encodePlan(plan)))
    }

    @Test
    fun planRoundTripPreservesPhoneProgressAndRest() {
        val plan = ProtocolFixtures.plan().copy(
            phoneCompletedSetIds = setOf(ProtocolFixtures.SET_ID),
            phoneRest = RestTimerState(true, false, 90, 90, 0, 1_777_000_200_000, 3)
        )
        assertEquals(plan, ProtocolJson.decodePlan(ProtocolJson.encodePlan(plan)))
    }

    @Test
    fun legacyPlanWithoutPhoneFieldsStillDecodes() {
        val root = JSONObject(ProtocolJson.encodePlan(ProtocolFixtures.plan()))
        root.remove("phoneCompletedSetIds")
        root.remove("phoneRest")
        val decoded = ProtocolJson.decodePlan(root.toString())
        assertTrue(decoded.phoneCompletedSetIds.isEmpty())
        assertEquals(null, decoded.phoneRest)
    }

    @Test
    fun planRejectsInvalidPhoneProgress() {
        assertProtocolError("UUID") {
            ProtocolValidator.validatePlan(ProtocolFixtures.plan().copy(phoneCompletedSetIds = setOf("not-a-uuid")))
        }
        assertProtocolError("TIMER_DEADLINE") {
            ProtocolValidator.validatePlan(
                ProtocolFixtures.plan().copy(
                    phoneRest = RestTimerState(true, false, 90, 90, 0, 1_777_000_200_000, -1)
                )
            )
        }
    }

    @Test
    fun everyEventTypeRoundTrips() {
        val completed = ProtocolFixtures.completed()
        val edited = ProtocolFixtures.edited()
        val undone = SetUndoneEvent(
            eventId = ProtocolFixtures.EVENT_3,
            sessionId = ProtocolFixtures.SESSION_ID,
            planId = ProtocolFixtures.PLAN_ID,
            planRevision = PlanRevision(1),
            logicalDate = "2026-08-23",
            occurredAt = 1_777_000_030_000,
            createdAt = 1_777_000_030_100,
            origin = Origin.WEAR,
            originInstanceId = ProtocolFixtures.INSTANCE_WEAR,
            originSequence = 3,
            exerciseId = completed.exerciseId,
            setId = completed.setId,
            baseEventId = edited.eventId,
            reason = "Correção"
        )
        val finished = SessionFinishedEvent(
            eventId = ProtocolFixtures.EVENT_4,
            sessionId = ProtocolFixtures.SESSION_ID,
            planId = ProtocolFixtures.PLAN_ID,
            planRevision = PlanRevision(1),
            logicalDate = "2026-08-23",
            occurredAt = 1_777_000_040_000,
            createdAt = 1_777_000_040_100,
            origin = Origin.WEAR,
            originInstanceId = ProtocolFixtures.INSTANCE_WEAR,
            originSequence = 4,
            mode = WorkoutMode.SHORT,
            durationSeconds = 2_400,
            finalSetHeads = mapOf(completed.setId to edited.eventId)
        )
        listOf(completed, edited, undone, finished).forEach {
            assertEquals(it, ProtocolJson.decodeEvent(ProtocolJson.encodeEvent(it)))
        }
    }

    @Test
    fun envelopeAndAckRoundTrip() {
        val event = ProtocolFixtures.completed()
        val envelope = SyncEnvelope(
            envelopeId = ProtocolFixtures.ENVELOPE_ID,
            origin = Origin.WEAR,
            originInstanceId = ProtocolFixtures.INSTANCE_WEAR,
            createdAt = 1_777_000_050_000,
            events = listOf(event)
        )
        assertEquals(envelope, ProtocolJson.decodeEnvelope(ProtocolJson.encodeEnvelope(envelope)))

        val ack = Ack(
            ackId = ProtocolFixtures.ACK_ID,
            envelopeId = envelope.envelopeId,
            receiver = Origin.PHONE,
            receiverInstanceId = ProtocolFixtures.INSTANCE_PHONE,
            createdAt = 1_777_000_060_000,
            events = listOf(EventAck(event.eventId, AckStatus.APPLIED, ProtocolJson.eventPayloadHash(event)))
        )
        assertEquals(ack, ProtocolJson.decodeAck(ProtocolJson.encodeAck(ack)))
    }

    @Test
    fun sessionAndTimerRoundTripAfterProcessDeath() {
        val session = WorkoutSession(
            sessionId = ProtocolFixtures.SESSION_ID,
            planId = ProtocolFixtures.PLAN_ID,
            planRevision = PlanRevision(2),
            logicalDate = "2026-08-23",
            state = SessionState.RESTING,
            startedAt = 1_777_000_000_000,
            finishedAt = null,
            currentExerciseId = "ex_supino-reto-c-halteres",
            currentSetId = ProtocolFixtures.SET_ID_2,
            completedSetIds = setOf(ProtocolFixtures.SET_ID),
            mode = WorkoutMode.SHORT,
            unilateralPendingSetId = null,
            timer = RestTimerState(true, false, 120, 0, 88_000, 1_777_000_120_000, 7)
        )
        assertEquals(session, ProtocolJson.decodeSession(ProtocolJson.encodeSession(session)))
    }

    @Test
    fun unknownVersionAndUnknownFieldsFailClosed() {
        val root = JSONObject(ProtocolJson.encodePlan(ProtocolFixtures.plan()))
        root.put("protocolVersion", 99)
        assertProtocolError("UNKNOWN_VERSION") { ProtocolJson.decodePlan(root.toString()) }

        val event = JSONObject(ProtocolJson.encodeEvent(ProtocolFixtures.completed()))
        event.put("javascript", "window.evil()")
        assertProtocolError("UNKNOWN_FIELD") { ProtocolJson.decodeEvent(event.toString()) }
    }

    @Test
    fun injectionTextIsDataAndCanonicalHashIsStable() {
        val plan = ProtocolFixtures.plan("Treino </script><script>attack()</script>")
        val decoded = ProtocolJson.decodePlan(ProtocolJson.encodePlan(plan))
        assertEquals(plan.name, decoded.name)
        val event = ProtocolFixtures.completed()
        assertEquals(ProtocolJson.eventPayloadHash(event), ProtocolJson.eventPayloadHash(ProtocolJson.decodeEvent(ProtocolJson.encodeEvent(event))))
        assertNotEquals("", ProtocolJson.eventPayloadHash(event))
    }

    @Test
    fun validationRejectsInvalidIdsNumbersAndLimits() {
        assertProtocolError("UUID") {
            ProtocolValidator.validateEvent(ProtocolFixtures.completed(eventId = "not-a-uuid"))
        }
        assertProtocolError("REPS_RANGE") {
            ProtocolValidator.validateEvent(ProtocolFixtures.completed(reps = 0))
        }
        assertProtocolError("LOAD_RANGE") {
            ProtocolValidator.validateEvent(ProtocolFixtures.completed(loadGrams = -1))
        }
        assertProtocolError("BODYWEIGHT_LOAD") {
            ProtocolValidator.validateEvent(
                ProtocolFixtures.completed(loadMode = LoadMode.BODYWEIGHT, loadGrams = 1_000)
            )
        }
        assertProtocolError("TEXT") {
            ProtocolValidator.validatePlan(ProtocolFixtures.plan("x".repeat(ProtocolLimits.MAX_STRING + 1)))
        }
        assertProtocolError("ORIGIN_SEQUENCE") {
            ProtocolValidator.validateEvent(
                ProtocolFixtures.completed().copy(originSequence = ProtocolLimits.MAX_SAFE_INTEGER + 1)
            )
        }
        assertProtocolError("TIMESTAMP") {
            ProtocolValidator.validateEvent(
                ProtocolFixtures.completed().copy(createdAt = ProtocolLimits.MAX_SAFE_INTEGER + 1)
            )
        }
    }

    @Test
    fun malformedJsonAndFractionalIntegerAreRejected() {
        assertProtocolError("MALFORMED_JSON") { ProtocolJson.decodeEvent("{") }
        val root = JSONObject(ProtocolJson.encodeEvent(ProtocolFixtures.completed()))
        root.put("reps", 10.5)
        assertProtocolError("FIELD_TYPE") { ProtocolJson.decodeEvent(root.toString()) }
    }

    private fun assertProtocolError(code: String, block: () -> Unit) {
        try {
            block()
            throw AssertionError("Expected ProtocolException($code)")
        } catch (e: ProtocolException) {
            assertEquals(code, e.code)
            assertTrue(e.message?.isNotBlank() == true)
        }
    }
}
