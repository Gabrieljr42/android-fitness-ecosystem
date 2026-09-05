package com.evolucao.treino.wear

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

@Entity(tableName = "wear_mobile_plan")
data class MobilePlanEntity(
    @androidx.room.PrimaryKey val slot: String = "active",
    val planId: String,
    val sessionId: String,
    val revision: Int,
    val logicalDate: String,
    val payload: String,
    val payloadHash: String,
    val updatedAt: Long
)

@Entity(
    tableName = "wear_mobile_envelope",
    indices = [Index("state"), Index("receivedAt")]
)
data class MobileEnvelopeEntity(
    @androidx.room.PrimaryKey val envelopeId: String,
    val originInstanceId: String,
    val payload: String,
    val payloadHash: String,
    val state: String,
    val attempts: Int,
    val lastError: String?,
    val receivedAt: Long,
    val updatedAt: Long
)

@Entity(
    tableName = "wear_mobile_inbox",
    indices = [Index("state"), Index("receivedAt")]
)
data class MobileInboxEventEntity(
    @androidx.room.PrimaryKey val eventId: String,
    val firstEnvelopeId: String,
    val payload: String,
    val payloadHash: String,
    val state: String,
    val receivedAt: Long,
    val appliedAt: Long?,
    val lastError: String?
)

@Entity(
    tableName = "wear_mobile_envelope_event",
    primaryKeys = ["envelopeId", "eventId"],
    indices = [Index("eventId"), Index("state")]
)
data class MobileEnvelopeEventEntity(
    val envelopeId: String,
    val eventId: String,
    val payloadHash: String,
    val ordinal: Int,
    val state: String,
    val detail: String?
)

@Entity(
    tableName = "wear_mobile_outbox",
    indices = [Index("state"), Index("nextAttemptAt"), Index("path")]
)
data class MobileOutboxEntity(
    @androidx.room.PrimaryKey val outboxId: String,
    val path: String,
    val kind: String,
    val payload: String,
    val payloadHash: String,
    val state: String,
    val attempts: Int,
    val nextAttemptAt: Long,
    val createdAt: Long,
    val updatedAt: Long,
    val lastError: String?
)

@Entity(
    tableName = "wear_mobile_conflict",
    indices = [Index("eventId"), Index("createdAt")]
)
data class MobileSyncConflictEntity(
    @androidx.room.PrimaryKey val conflictId: String,
    val eventId: String,
    val envelopeId: String,
    val existingHash: String?,
    val incomingHash: String,
    val incomingPayload: String,
    val reason: String,
    val createdAt: Long
)

@Dao
interface MobileWearDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun putPlan(value: MobilePlanEntity)

    @Query("SELECT * FROM wear_mobile_plan WHERE slot = 'active'")
    fun activePlan(): MobilePlanEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertEnvelope(value: MobileEnvelopeEntity)

    @Query("SELECT * FROM wear_mobile_envelope WHERE envelopeId = :id")
    fun envelope(id: String): MobileEnvelopeEntity?

    @Query("UPDATE wear_mobile_envelope SET state = :state, attempts = :attempts, lastError = :error, updatedAt = :updatedAt WHERE envelopeId = :id")
    fun setEnvelopeState(id: String, state: String, attempts: Int, error: String?, updatedAt: Long)

    @Query("UPDATE wear_mobile_envelope SET state = 'READY', updatedAt = :updatedAt WHERE state = 'BLOCKED'")
    fun releaseBlockedEnvelopes(updatedAt: Long)

    @Query("UPDATE wear_mobile_envelope SET state = 'READY', updatedAt = :updatedAt WHERE state = 'DISPATCHING'")
    fun recoverDispatchingEnvelopes(updatedAt: Long)

    @Query("SELECT * FROM wear_mobile_envelope WHERE state IN ('READY','RETRY') ORDER BY receivedAt, envelopeId LIMIT 1")
    fun nextDispatchEnvelope(): MobileEnvelopeEntity?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun insertInbox(value: MobileInboxEventEntity): Long

    @Query("SELECT * FROM wear_mobile_inbox WHERE eventId = :eventId")
    fun inbox(eventId: String): MobileInboxEventEntity?

    @Query("UPDATE wear_mobile_inbox SET state = :state, appliedAt = :appliedAt, lastError = :detail WHERE eventId = :eventId AND payloadHash = :payloadHash")
    fun setInboxState(eventId: String, payloadHash: String, state: String, appliedAt: Long?, detail: String?)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun insertEnvelopeEvent(value: MobileEnvelopeEventEntity): Long

    @Query("SELECT * FROM wear_mobile_envelope_event WHERE envelopeId = :envelopeId ORDER BY ordinal")
    fun envelopeEvents(envelopeId: String): List<MobileEnvelopeEventEntity>

    @Query("SELECT DISTINCT envelopeId FROM wear_mobile_envelope_event WHERE eventId = :eventId AND payloadHash = :payloadHash")
    fun envelopesForEvent(eventId: String, payloadHash: String): List<String>

    @Query("UPDATE wear_mobile_envelope_event SET state = :state, detail = :detail WHERE eventId = :eventId AND payloadHash = :payloadHash AND state IN ('RECEIVED','BLOCKED')")
    fun setEnvelopeEventState(eventId: String, payloadHash: String, state: String, detail: String?)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    fun insertConflict(value: MobileSyncConflictEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun putOutbox(value: MobileOutboxEntity)

    @Query("DELETE FROM wear_mobile_outbox WHERE path = :path AND state != 'SENT'")
    fun removePendingAtPath(path: String)

    @Query("SELECT COUNT(*) FROM wear_mobile_outbox WHERE state != 'SENT'")
    fun activeOutboxCount(): Int

    @Query("SELECT COALESCE(SUM(LENGTH(payload)), 0) FROM wear_mobile_outbox WHERE state != 'SENT'")
    fun activeOutboxChars(): Long

    @Query("SELECT payload FROM wear_mobile_outbox WHERE state != 'SENT'")
    fun activeOutboxPayloads(): List<String>

    @Query("SELECT * FROM wear_mobile_outbox WHERE state != 'SENT' AND nextAttemptAt <= :now ORDER BY createdAt, outboxId LIMIT :limit")
    fun dueOutbox(now: Long, limit: Int): List<MobileOutboxEntity>

    @Query("SELECT COUNT(*) FROM wear_mobile_outbox WHERE state != 'SENT'")
    fun pendingOutboxCount(): Int

    @Query("UPDATE wear_mobile_outbox SET state = 'SENT', updatedAt = :updatedAt, lastError = NULL WHERE outboxId = :id")
    fun markOutboxSent(id: String, updatedAt: Long)

    @Query("UPDATE wear_mobile_outbox SET state = 'RETRY', attempts = :attempts, nextAttemptAt = :nextAttemptAt, updatedAt = :updatedAt, lastError = :error WHERE outboxId = :id")
    fun markOutboxRetry(id: String, attempts: Int, nextAttemptAt: Long, updatedAt: Long, error: String)

    @Query("DELETE FROM wear_mobile_outbox WHERE state = 'SENT' AND updatedAt < :before")
    fun pruneSentOutbox(before: Long)
}

@Database(
    entities = [
        MobilePlanEntity::class,
        MobileEnvelopeEntity::class,
        MobileInboxEventEntity::class,
        MobileEnvelopeEventEntity::class,
        MobileOutboxEntity::class,
        MobileSyncConflictEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class MobileWearDatabase : RoomDatabase() {
    abstract fun wearDao(): MobileWearDao

    companion object {
        @Volatile private var instance: MobileWearDatabase? = null

        fun get(context: Context): MobileWearDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                MobileWearDatabase::class.java,
                "evolucao-wear-mobile-v1.db"
            ).build().also { instance = it }
        }
    }
}
