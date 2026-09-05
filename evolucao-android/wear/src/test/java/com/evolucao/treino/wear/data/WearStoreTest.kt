package com.evolucao.treino.wear.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.evolucao.treino.protocol.PlanRevision
import com.evolucao.treino.protocol.ProtocolJson
import com.evolucao.treino.protocol.RestTimerState
import com.evolucao.treino.protocol.SessionState
import com.evolucao.treino.protocol.WorkoutMode
import com.evolucao.treino.protocol.WorkoutSession
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
class WearStoreTest {
    private lateinit var db: WearDatabase
    private lateinit var dao: WearDao

    @Before fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            WearDatabase::class.java
        ).allowMainThreadQueries().build()
        dao = db.wearDao()
    }

    @After fun tearDown() { db.close() }

    @Test fun `event and session commit atomically`() {
        val session = session()
        val event = event(session.sessionId)
        db.runInTransaction {
            dao.putSession(sessionRow(session))
            dao.insertEvent(event)
        }
        assertNotNull(dao.activeSession())
        assertEquals(1, dao.eventsForSession(session.sessionId).size)
        assertEquals(1, dao.pendingEventCount())
    }

    @Test fun `failed transaction leaves neither partial plan nor event`() {
        val key = "${UUID.randomUUID()}:1"
        try {
            db.runInTransaction {
                dao.insertPlan(
                    WearPlanEntity(key, UUID.randomUUID().toString(), UUID.randomUUID().toString(), 1,
                        "2026-08-23", "{}", "0".repeat(64), true, 1)
                )
                error("simulated process death")
            }
        } catch (_: IllegalStateException) {
            // Expected.
        }
        assertNull(dao.plan(key))
    }

    @Test fun `event leaves pending queue only after terminal ack`() {
        val event = event(UUID.randomUUID().toString())
        dao.insertEvent(event)
        dao.setEventSyncState(event.eventId, "SENT", 1, 1000, 2, null)
        assertEquals(1, dao.pendingEventCount())
        dao.setEventSyncState(event.eventId, "RECEIVED", 1, 2000, 3, null)
        assertEquals(1, dao.pendingEventCount())
        dao.setEventSyncState(event.eventId, "ACKED", 1, Long.MAX_VALUE, 4, null)
        assertEquals(0, dao.pendingEventCount())
        assertNotNull(dao.event(event.eventId))
    }

    @Test fun `timer deadline survives database close and reopen`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "wear-process-death-${UUID.randomUUID()}.db"
        val timer = RestTimerState(true, false, 90, 90, 123_456, 987_654, 4)
        val session = session().copy(state = SessionState.RESTING, timer = timer)
        val first = Room.databaseBuilder(context, WearDatabase::class.java, name)
            .allowMainThreadQueries().build()
        first.wearDao().putSession(sessionRow(session))
        first.close()
        val reopened = Room.databaseBuilder(context, WearDatabase::class.java, name)
            .allowMainThreadQueries().build()
        val restored = ProtocolJson.decodeSession(requireNotNull(reopened.wearDao().activeSession()).payload)
        assertEquals(timer, restored.timer)
        reopened.close()
        context.deleteDatabase(name)
    }

    @Test fun `finished session ids remain available after summary is closed`() {
        val finished = session().copy(
            state = SessionState.FINISHED,
            finishedAt = 1_800_000_000_900
        )
        dao.putSession(sessionRow(finished).copy(isActive = false))

        assertEquals(listOf(finished.sessionId), dao.finishedSessionIds())
        assertNull(dao.activeSession())
    }

    private fun session(): WorkoutSession = WorkoutSession(
        sessionId = UUID.randomUUID().toString(),
        planId = UUID.randomUUID().toString(),
        planRevision = PlanRevision(1),
        logicalDate = "2026-08-23",
        state = SessionState.ACTIVE,
        startedAt = 1_800_000_000_000,
        finishedAt = null,
        currentExerciseId = "ex_supino",
        currentSetId = UUID.randomUUID().toString(),
        completedSetIds = emptySet(),
        mode = WorkoutMode.NORMAL,
        unilateralPendingSetId = null,
        timer = null
    )

    private fun sessionRow(session: WorkoutSession) = WearSessionEntity(
        session.sessionId,
        session.planId,
        session.planRevision.value,
        session.logicalDate,
        session.state.name,
        ProtocolJson.encodeSession(session),
        0,
        null,
        true,
        1
    )

    private fun event(sessionId: String) = WearEventEntity(
        eventId = UUID.randomUUID().toString(),
        envelopeId = UUID.randomUUID().toString(),
        sessionId = sessionId,
        setId = UUID.randomUUID().toString(),
        eventType = "COMPLETED_SET",
        originSequence = 1,
        payload = "{}",
        payloadHash = "a".repeat(64),
        envelopePayload = "{}",
        state = "PENDING",
        attempts = 0,
        nextAttemptAt = 1,
        createdAt = 1,
        updatedAt = 1,
        lastError = null
    )
}
