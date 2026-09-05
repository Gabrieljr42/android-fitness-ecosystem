package com.evolucao.treino.wear

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.evolucao.treino.protocol.AckStatus
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MobileWearStoreTest {
    private lateinit var db: MobileWearDatabase
    private lateinit var dao: MobileWearDao

    @Before fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MobileWearDatabase::class.java
        ).allowMainThreadQueries().build()
        dao = db.wearDao()
    }

    @After fun tearDown() { db.close() }

    @Test fun `native inbox envelope event and received ack are one transaction`() {
        val envelopeId = UUID.randomUUID().toString()
        val eventId = UUID.randomUUID().toString()
        val now = 1_800_000_000_000
        db.runInTransaction {
            dao.insertEnvelope(MobileEnvelopeEntity(envelopeId, UUID.randomUUID().toString(), "{}", "a".repeat(64), "READY", 0, null, now, now))
            dao.insertInbox(MobileInboxEventEntity(eventId, envelopeId, "{}", "b".repeat(64), "RECEIVED", now, null, null))
            dao.insertEnvelopeEvent(MobileEnvelopeEventEntity(envelopeId, eventId, "b".repeat(64), 0, "RECEIVED", null))
            dao.putOutbox(MobileOutboxEntity(UUID.randomUUID().toString(), "/ack", "ACK", "{}", "c".repeat(64), "PENDING", 0, now, now, now, null))
        }
        assertNotNull(dao.envelope(envelopeId))
        assertNotNull(dao.inbox(eventId))
        assertEquals(1, dao.envelopeEvents(envelopeId).size)
        assertEquals(1, dao.pendingOutboxCount())
    }

    @Test fun `duplicate event id never overwrites first payload`() {
        val eventId = UUID.randomUUID().toString()
        val first = MobileInboxEventEntity(eventId, UUID.randomUUID().toString(), "first", "a".repeat(64), "RECEIVED", 1, null, null)
        val reused = first.copy(payload = "hostile", payloadHash = "b".repeat(64))
        assertNotNull(dao.insertInbox(first))
        assertEquals(-1L, dao.insertInbox(reused))
        assertEquals("first", dao.inbox(eventId)?.payload)
    }

    @Test fun `duplicate terminal status never claims a rejected event was applied`() {
        assertEquals(AckStatus.ALREADY_APPLIED, duplicateInboxAckStatus(AckStatus.APPLIED.name))
        assertEquals(AckStatus.ALREADY_APPLIED, duplicateInboxAckStatus(AckStatus.ALREADY_APPLIED.name))
        assertEquals(AckStatus.CONFLICT_STORED, duplicateInboxAckStatus(AckStatus.CONFLICT_STORED.name))
        assertEquals(AckStatus.REJECTED, duplicateInboxAckStatus(AckStatus.REJECTED.name))
    }

    @Test fun `transaction rollback models crash before durable receipt`() {
        val envelopeId = UUID.randomUUID().toString()
        try {
            db.runInTransaction {
                dao.insertEnvelope(MobileEnvelopeEntity(envelopeId, UUID.randomUUID().toString(), "{}", "a".repeat(64), "READY", 0, null, 1, 1))
                error("simulated crash")
            }
        } catch (_: IllegalStateException) {
            // Expected.
        }
        assertNull(dao.envelope(envelopeId))
    }

    @Test fun `outbox remains durable through retry and leaves pending after send`() {
        val id = UUID.randomUUID().toString()
        dao.putOutbox(MobileOutboxEntity(id, "/plan", "PLAN", "payload", "a".repeat(64), "PENDING", 0, 1, 1, 1, null))
        dao.markOutboxRetry(id, 1, 10, 2, "offline")
        assertEquals(1, dao.pendingOutboxCount())
        dao.markOutboxSent(id, 3)
        assertEquals(0, dao.pendingOutboxCount())
    }
}
