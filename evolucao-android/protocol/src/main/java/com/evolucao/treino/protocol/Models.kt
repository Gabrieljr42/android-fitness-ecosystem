package com.evolucao.treino.protocol

const val PROTOCOL_VERSION: Int = 1

object ProtocolLimits {
    const val MAX_STRING = 120
    const val MAX_ERROR_STRING = 240
    const val MAX_DAY = 8
    const val MAX_ALIASES = 16
    const val MAX_EXERCISES = 100
    const val MAX_SETS_PER_EXERCISE = 64
    const val MAX_EVENTS_PER_ENVELOPE = 64
    const val MAX_FINAL_HEADS = 512
    const val MAX_EVENT_BYTES = 16 * 1024
    const val MAX_ENVELOPE_BYTES = 64 * 1024
    const val MAX_PLAN_BYTES = 64 * 1024
    const val MAX_LOAD_GRAMS = 500_000
    const val MAX_REPS = 200
    const val MAX_PARTIAL_REPS = 100
    const val MAX_RIR = 6
    const val MAX_REST_SECONDS = 3_600
    const val MAX_DURATION_SECONDS = 72 * 60 * 60
    const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L
    const val MAX_ORIGIN_SEQUENCE = MAX_SAFE_INTEGER
}

data class PlanRevision(val value: Int) {
    init {
        require(value in 1..Int.MAX_VALUE) { "planRevision must be positive" }
    }
}

enum class Origin { PHONE, WEAR }
enum class SetKind { WARMUP, WORK }
enum class LoadMode { EXTERNAL, BODYWEIGHT, ASSISTED }
enum class WorkoutMode { NORMAL, SHORT }
enum class SessionState { PLANNED, ACTIVE, RESTING, REVIEW, FINISHED }
enum class EventType { COMPLETED_SET, SET_EDITED, SET_UNDONE, SESSION_FINISHED }
enum class SyncStatus { OFFLINE, PENDING, SYNCING, SYNCED, ERROR, QUEUE_FULL }

enum class AckStatus {
    RECEIVED,
    APPLIED,
    ALREADY_APPLIED,
    BLOCKED,
    CONFLICT_STORED,
    REJECTED
}

data class SetPrescription(
    val setId: String,
    val index: Int,
    val kind: SetKind,
    val repsMin: Int,
    val repsMax: Int,
    val suggestedLoadGrams: Int?,
    val previousLoadGrams: Int?,
    val previousReps: Int?,
    val targetRir: Int?
)

data class ExercisePlan(
    val exerciseId: String,
    val name: String,
    val aliases: List<String>,
    val order: Int,
    val restSeconds: Int,
    val loadIncrementGrams: Int,
    val perSide: Boolean,
    val unilateral: Boolean,
    val targetRir: Int?,
    val prescriptions: List<SetPrescription>
)

data class WorkoutPlan(
    val protocolVersion: Int = PROTOCOL_VERSION,
    val planId: String,
    val sessionId: String,
    val revision: PlanRevision,
    val logicalDate: String,
    val day: String,
    val name: String,
    val generatedAt: Long,
    val mode: WorkoutMode,
    val conservativeWarning: String?,
    val exercises: List<ExercisePlan>,
    /**
     * Progresso feito no telefone: IDs de prescrição já concluídas no draft.
     * O relógio une com seus próprios eventos para posicionar o cursor e
     * nunca apaga ledger próprio por causa deste campo.
     */
    val phoneCompletedSetIds: Set<String> = emptySet(),
    /**
     * Descanso em andamento no telefone (wall-clock). O relógio adota como
     * timer local somente quando não tem timer próprio rodando.
     */
    val phoneRest: RestTimerState? = null
)

data class RestTimerState(
    val running: Boolean,
    val paused: Boolean,
    val durationSeconds: Int,
    val remainingWhenPausedSeconds: Int,
    val endElapsedRealtime: Long,
    val endWallClockMillis: Long,
    val bootCount: Int
)

data class WorkoutSession(
    val protocolVersion: Int = PROTOCOL_VERSION,
    val sessionId: String,
    val planId: String,
    val planRevision: PlanRevision,
    val logicalDate: String,
    val state: SessionState,
    val startedAt: Long?,
    val finishedAt: Long?,
    val currentExerciseId: String?,
    val currentSetId: String?,
    val completedSetIds: Set<String>,
    val mode: WorkoutMode,
    val unilateralPendingSetId: String?,
    val timer: RestTimerState?
)

sealed class WorkoutEvent {
    abstract val protocolVersion: Int
    abstract val eventType: EventType
    abstract val eventId: String
    abstract val sessionId: String
    abstract val planId: String
    abstract val planRevision: PlanRevision
    abstract val logicalDate: String
    abstract val occurredAt: Long
    abstract val createdAt: Long
    abstract val origin: Origin
    abstract val originInstanceId: String
    abstract val originSequence: Long
}

data class CompletedSetEvent(
    override val protocolVersion: Int = PROTOCOL_VERSION,
    override val eventId: String,
    override val sessionId: String,
    override val planId: String,
    override val planRevision: PlanRevision,
    override val logicalDate: String,
    override val occurredAt: Long,
    override val createdAt: Long,
    override val origin: Origin,
    override val originInstanceId: String,
    override val originSequence: Long,
    val exerciseId: String,
    val setId: String,
    val setKind: SetKind,
    val loadMode: LoadMode,
    val loadGrams: Int,
    val reps: Int,
    val partialReps: Int,
    val rir: Int?,
    val targetRir: Int?,
    val completedSides: Int
) : WorkoutEvent() {
    override val eventType: EventType = EventType.COMPLETED_SET
}

data class SetEditedEvent(
    override val protocolVersion: Int = PROTOCOL_VERSION,
    override val eventId: String,
    override val sessionId: String,
    override val planId: String,
    override val planRevision: PlanRevision,
    override val logicalDate: String,
    override val occurredAt: Long,
    override val createdAt: Long,
    override val origin: Origin,
    override val originInstanceId: String,
    override val originSequence: Long,
    val exerciseId: String,
    val setId: String,
    val baseEventId: String,
    val setKind: SetKind,
    val loadMode: LoadMode,
    val loadGrams: Int,
    val reps: Int,
    val partialReps: Int,
    val rir: Int?,
    val targetRir: Int?,
    val completedSides: Int
) : WorkoutEvent() {
    override val eventType: EventType = EventType.SET_EDITED
}

data class SetUndoneEvent(
    override val protocolVersion: Int = PROTOCOL_VERSION,
    override val eventId: String,
    override val sessionId: String,
    override val planId: String,
    override val planRevision: PlanRevision,
    override val logicalDate: String,
    override val occurredAt: Long,
    override val createdAt: Long,
    override val origin: Origin,
    override val originInstanceId: String,
    override val originSequence: Long,
    val exerciseId: String,
    val setId: String,
    val baseEventId: String,
    val reason: String?
) : WorkoutEvent() {
    override val eventType: EventType = EventType.SET_UNDONE
}

data class SessionFinishedEvent(
    override val protocolVersion: Int = PROTOCOL_VERSION,
    override val eventId: String,
    override val sessionId: String,
    override val planId: String,
    override val planRevision: PlanRevision,
    override val logicalDate: String,
    override val occurredAt: Long,
    override val createdAt: Long,
    override val origin: Origin,
    override val originInstanceId: String,
    override val originSequence: Long,
    val mode: WorkoutMode,
    val durationSeconds: Int,
    val finalSetHeads: Map<String, String>
) : WorkoutEvent() {
    override val eventType: EventType = EventType.SESSION_FINISHED
}

data class SyncEnvelope(
    val protocolVersion: Int = PROTOCOL_VERSION,
    val envelopeId: String,
    val origin: Origin,
    val originInstanceId: String,
    val createdAt: Long,
    val events: List<WorkoutEvent>
)

data class EventAck(
    val eventId: String,
    val status: AckStatus,
    val payloadHash: String,
    val detail: String? = null
)

data class Ack(
    val protocolVersion: Int = PROTOCOL_VERSION,
    val ackId: String,
    val envelopeId: String,
    val receiver: Origin,
    val receiverInstanceId: String,
    val createdAt: Long,
    val events: List<EventAck>
)

class ProtocolException(
    val code: String,
    message: String
) : IllegalArgumentException(message)
