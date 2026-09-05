package com.evolucao.treino.wear.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

@Entity(
    tableName = "wear_plan",
    indices = [Index("sessionId"), Index("isActive"), Index("receivedAt")]
)
data class WearPlanEntity(
    @androidx.room.PrimaryKey val planKey: String,
    val planId: String,
    val sessionId: String,
    val revision: Int,
    val logicalDate: String,
    val payload: String,
    val payloadHash: String,
    val isActive: Boolean,
    val receivedAt: Long
)

@Entity(
    tableName = "wear_session",
    indices = [Index("isActive"), Index("updatedAt")]
)
data class WearSessionEntity(
    @androidx.room.PrimaryKey val sessionId: String,
    val planId: String,
    val planRevision: Int,
    val logicalDate: String,
    val state: String,
    val payload: String,
    val originSequence: Long,
    val finishedEventId: String?,
    val isActive: Boolean,
    val updatedAt: Long
)

@Entity(
    tableName = "wear_event",
    indices = [Index("sessionId"), Index("state"), Index("nextAttemptAt"), Index("originSequence")]
)
data class WearEventEntity(
    @androidx.room.PrimaryKey val eventId: String,
    val envelopeId: String,
    val sessionId: String,
    val setId: String?,
    val eventType: String,
    val originSequence: Long,
    val payload: String,
    val payloadHash: String,
    val envelopePayload: String,
    val state: String,
    val attempts: Int,
    val nextAttemptAt: Long,
    val createdAt: Long,
    val updatedAt: Long,
    val lastError: String?
)

@Entity(tableName = "wear_ack", indices = [Index("envelopeId"), Index("receivedAt")])
data class WearAckEntity(
    @androidx.room.PrimaryKey val ackId: String,
    val envelopeId: String,
    val payloadHash: String,
    val payload: String,
    val receivedAt: Long
)

@Entity(tableName = "wear_conflict", indices = [Index("relatedId"), Index("createdAt")])
data class WearConflictEntity(
    @androidx.room.PrimaryKey val conflictId: String,
    val relatedId: String,
    val kind: String,
    val detail: String,
    val payloadHash: String?,
    val createdAt: Long
)

@Dao
interface WearDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertPlan(value: WearPlanEntity)

    @Query("SELECT * FROM wear_plan WHERE planKey = :key")
    fun plan(key: String): WearPlanEntity?

    @Query("SELECT * FROM wear_plan WHERE isActive = 1 ORDER BY receivedAt DESC LIMIT 1")
    fun activePlan(): WearPlanEntity?

    @Query("SELECT * FROM wear_plan WHERE isActive = 0 ORDER BY receivedAt DESC LIMIT 1")
    fun newestWaitingPlan(): WearPlanEntity?

    @Query("SELECT * FROM wear_plan WHERE isActive = 0 ORDER BY receivedAt DESC")
    fun inactivePlans(): List<WearPlanEntity>

    @Query("UPDATE wear_plan SET isActive = CASE WHEN planKey = :key THEN 1 ELSE 0 END")
    fun activatePlan(key: String)

    @Query("UPDATE wear_plan SET isActive = 0")
    fun deactivatePlans()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun putSession(value: WearSessionEntity)

    @Query("SELECT * FROM wear_session WHERE isActive = 1 ORDER BY updatedAt DESC LIMIT 1")
    fun activeSession(): WearSessionEntity?

    @Query("SELECT * FROM wear_session WHERE sessionId = :sessionId")
    fun session(sessionId: String): WearSessionEntity?

    @Query("SELECT sessionId FROM wear_session WHERE state = 'FINISHED'")
    fun finishedSessionIds(): List<String>

    @Query("UPDATE wear_session SET isActive = 0 WHERE isActive = 1")
    fun deactivateSessions()

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertEvent(value: WearEventEntity)

    @Query("SELECT * FROM wear_event WHERE eventId = :eventId")
    fun event(eventId: String): WearEventEntity?

    @Query("SELECT * FROM wear_event WHERE sessionId = :sessionId ORDER BY originSequence, createdAt, eventId")
    fun eventsForSession(sessionId: String): List<WearEventEntity>

    @Query("SELECT * FROM wear_event WHERE state NOT IN ('ACKED','CONFLICT_STORED','REJECTED') AND nextAttemptAt <= :now ORDER BY createdAt, eventId LIMIT :limit")
    fun dueEvents(now: Long, limit: Int): List<WearEventEntity>

    @Query("SELECT COUNT(*) FROM wear_event WHERE state NOT IN ('ACKED','CONFLICT_STORED','REJECTED')")
    fun pendingEventCount(): Int

    @Query("SELECT COALESCE(SUM(LENGTH(envelopePayload)), 0) FROM wear_event WHERE state NOT IN ('ACKED','CONFLICT_STORED','REJECTED')")
    fun pendingEventChars(): Long

    @Query("SELECT envelopePayload FROM wear_event WHERE state NOT IN ('ACKED','CONFLICT_STORED','REJECTED')")
    fun pendingEnvelopePayloads(): List<String>

    @Query("SELECT MIN(nextAttemptAt) FROM wear_event WHERE state NOT IN ('ACKED','CONFLICT_STORED','REJECTED')")
    fun nextPendingAttemptAt(): Long?

    @Query("UPDATE wear_event SET state = :state, attempts = :attempts, nextAttemptAt = :nextAttemptAt, updatedAt = :updatedAt, lastError = :error WHERE eventId = :eventId")
    fun setEventSyncState(eventId: String, state: String, attempts: Int, nextAttemptAt: Long, updatedAt: Long, error: String?)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun insertAck(value: WearAckEntity): Long

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun insertConflict(value: WearConflictEntity): Long
}

@Database(
    entities = [
        WearPlanEntity::class,
        WearSessionEntity::class,
        WearEventEntity::class,
        WearAckEntity::class,
        WearConflictEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class WearDatabase : RoomDatabase() {
    abstract fun wearDao(): WearDao

    companion object {
        @Volatile private var instance: WearDatabase? = null

        fun get(context: Context): WearDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                WearDatabase::class.java,
                "evolucao-wear-v1.db"
            ).build().also { instance = it }
        }
    }
}
