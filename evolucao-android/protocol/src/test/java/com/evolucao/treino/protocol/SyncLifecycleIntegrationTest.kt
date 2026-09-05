package com.evolucao.treino.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class SyncLifecycleIntegrationTest {
    private val sessionId = UUID.randomUUID().toString()
    private val planId = UUID.randomUUID().toString()
    private val instanceId = UUID.randomUUID().toString()
    private val setId = UUID.randomUUID().toString()

    @Test fun `durable end to end lifecycle only releases Wear event after applied ack`() {
        val event = completed(1)
        val wear = FakeWearOutbox(event)
        val phone = FakePhoneInbox()
        val envelope = wear.envelope()

        val received = phone.receive(ProtocolJson.encodeEnvelope(envelope))
        assertEquals(AckStatus.RECEIVED, received.events.single().status)
        wear.accept(received)
        assertFalse(wear.released)

        val applied = phone.apply(envelope.envelopeId)
        assertEquals(AckStatus.APPLIED, applied.events.single().status)
        wear.accept(applied)
        assertTrue(wear.released)
        assertEquals(1, phone.durableEvents.size)
    }

    @Test fun `phone crash after inbox commit retries without duplicating event`() {
        val event = completed(1)
        val wear = FakeWearOutbox(event)
        val phone = FakePhoneInbox()
        val raw = ProtocolJson.encodeEnvelope(wear.envelope())
        phone.receive(raw)
        // Process dies before domain apply; DataItem is delivered again.
        phone.receive(raw)
        assertEquals(1, phone.durableEvents.size)
        assertEquals(AckStatus.APPLIED, phone.apply(wear.envelopeId).events.single().status)
    }

    @Test fun `JS crash after commit returns idempotent success on replay`() {
        val event = completed(1)
        val wear = FakeWearOutbox(event)
        val phone = FakePhoneInbox()
        val raw = ProtocolJson.encodeEnvelope(wear.envelope())
        phone.receive(raw)
        phone.apply(wear.envelopeId) // final ACK is intentionally lost
        phone.receive(raw)
        val replayAck = phone.apply(wear.envelopeId)
        assertEquals(AckStatus.ALREADY_APPLIED, replayAck.events.single().status)
        assertEquals(1, phone.reconciler.appliedEventIds().size)
    }

    @Test fun `finish retry produces one finished session head`() {
        val set = completed(1)
        val finish = SessionFinishedEvent(
            eventId = UUID.randomUUID().toString(), sessionId = sessionId, planId = planId,
            planRevision = PlanRevision(1), logicalDate = "2026-08-23",
            occurredAt = 1_800_000_000_002, createdAt = 1_800_000_000_002,
            origin = Origin.WEAR, originInstanceId = instanceId, originSequence = 2,
            mode = WorkoutMode.SHORT, durationSeconds = 600,
            finalSetHeads = mapOf(setId to set.eventId)
        )
        val reducer = EventReconciler()
        assertEquals(ReconcileStatus.APPLIED, reducer.submit(set).status)
        assertEquals(ReconcileStatus.APPLIED, reducer.submit(finish).status)
        assertEquals(ReconcileStatus.DUPLICATE, reducer.submit(finish).status)
        assertEquals(finish.eventId, reducer.finishedEventId(sessionId))
    }

    private fun completed(sequence: Long) = CompletedSetEvent(
        eventId = UUID.randomUUID().toString(), sessionId = sessionId, planId = planId,
        planRevision = PlanRevision(1), logicalDate = "2026-08-23",
        occurredAt = 1_800_000_000_000 + sequence,
        createdAt = 1_800_000_000_000 + sequence,
        origin = Origin.WEAR, originInstanceId = instanceId, originSequence = sequence,
        exerciseId = "ex_supino", setId = setId, setKind = SetKind.WORK,
        loadMode = LoadMode.EXTERNAL, loadGrams = 50_000, reps = 8,
        partialReps = 0, rir = 2, targetRir = 2, completedSides = 1
    )

    private inner class FakeWearOutbox(private val event: WorkoutEvent) {
        val envelopeId = UUID.nameUUIDFromBytes("envelope:${event.eventId}".toByteArray()).toString()
        var released = false
        fun envelope() = SyncEnvelope(
            envelopeId = envelopeId,
            origin = Origin.WEAR,
            originInstanceId = instanceId,
            createdAt = event.createdAt,
            events = listOf(event)
        )
        fun accept(ack: Ack) {
            val item = ack.events.single()
            require(item.payloadHash == ProtocolJson.eventPayloadHash(event))
            released = item.status in setOf(
                AckStatus.APPLIED, AckStatus.ALREADY_APPLIED,
                AckStatus.CONFLICT_STORED, AckStatus.REJECTED
            )
        }
    }

    private inner class FakePhoneInbox {
        val durableEvents = linkedMapOf<String, Pair<String, WorkoutEvent>>()
        val reconciler = EventReconciler()
        private val envelopes = linkedMapOf<String, SyncEnvelope>()

        fun receive(raw: String): Ack {
            val envelope = ProtocolJson.decodeEnvelope(raw)
            envelopes.putIfAbsent(envelope.envelopeId, envelope)
            envelope.events.forEach { event ->
                val hash = ProtocolJson.eventPayloadHash(event)
                val old = durableEvents[event.eventId]
                require(old == null || old.first == hash)
                durableEvents.putIfAbsent(event.eventId, hash to event)
            }
            return ack(envelope, AckStatus.RECEIVED)
        }

        fun apply(envelopeId: String): Ack {
            val envelope = requireNotNull(envelopes[envelopeId])
            val items = envelope.events.map { event ->
                val result = reconciler.submit(event)
                EventAck(
                    eventId = event.eventId,
                    status = when (result.status) {
                        ReconcileStatus.APPLIED -> AckStatus.APPLIED
                        ReconcileStatus.DUPLICATE -> AckStatus.ALREADY_APPLIED
                        ReconcileStatus.BLOCKED -> AckStatus.BLOCKED
                        ReconcileStatus.CONFLICT_STORED -> AckStatus.CONFLICT_STORED
                        ReconcileStatus.REJECTED -> AckStatus.REJECTED
                    },
                    payloadHash = ProtocolJson.eventPayloadHash(event)
                )
            }
            return Ack(
                ackId = UUID.randomUUID().toString(), envelopeId = envelopeId,
                receiver = Origin.PHONE, receiverInstanceId = UUID.randomUUID().toString(),
                createdAt = System.currentTimeMillis(), events = items
            )
        }

        private fun ack(envelope: SyncEnvelope, status: AckStatus) = Ack(
            ackId = UUID.randomUUID().toString(), envelopeId = envelope.envelopeId,
            receiver = Origin.PHONE, receiverInstanceId = UUID.randomUUID().toString(),
            createdAt = System.currentTimeMillis(),
            events = envelope.events.map { EventAck(it.eventId, status, ProtocolJson.eventPayloadHash(it)) }
        )
    }
}
