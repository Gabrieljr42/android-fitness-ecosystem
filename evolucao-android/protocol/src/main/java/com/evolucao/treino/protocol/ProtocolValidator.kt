package com.evolucao.treino.protocol

import java.text.SimpleDateFormat
import java.util.Locale
import java.util.UUID

object ProtocolValidator {
    private val exerciseIdRegex = Regex("^ex_[a-z0-9][a-z0-9._-]{0,95}$")
    private val sha256Regex = Regex("^[a-f0-9]{64}$")
    private val dateRegex = Regex("^\\d{4}-\\d{2}-\\d{2}$")

    @JvmStatic
    fun validatePlan(plan: WorkoutPlan): WorkoutPlan {
        requireVersion(plan.protocolVersion)
        requireUuid("planId", plan.planId)
        requireUuid("sessionId", plan.sessionId)
        requireLogicalDate(plan.logicalDate)
        requireText("day", plan.day, ProtocolLimits.MAX_DAY)
        requireText("name", plan.name, ProtocolLimits.MAX_STRING)
        requireTimestamp("generatedAt", plan.generatedAt)
        plan.conservativeWarning?.let {
            requireText("conservativeWarning", it, ProtocolLimits.MAX_STRING)
        }
        if (plan.exercises.isEmpty() || plan.exercises.size > ProtocolLimits.MAX_EXERCISES) {
            fail("PLAN_EXERCISES", "plan must contain 1..${ProtocolLimits.MAX_EXERCISES} exercises")
        }
        if (plan.phoneCompletedSetIds.size > ProtocolLimits.MAX_FINAL_HEADS) {
            fail("PLAN_PHONE_SET_LIMIT", "too many phone-completed sets")
        }
        plan.phoneCompletedSetIds.forEach { requireUuid("phoneCompletedSetId", it) }
        plan.phoneRest?.let(::validateTimer)
        val exerciseIds = HashSet<String>()
        val setIds = HashSet<String>()
        plan.exercises.forEachIndexed { expectedOrder, exercise ->
            if (!exerciseIds.add(exercise.exerciseId)) fail("DUPLICATE_EXERCISE_ID", exercise.exerciseId)
            validateExercise(exercise, expectedOrder, setIds)
        }
        val bytes = ProtocolJson.encodePlanUnchecked(plan).toByteArray(Charsets.UTF_8).size
        if (bytes > ProtocolLimits.MAX_PLAN_BYTES) fail("PLAN_SIZE", "plan exceeds byte limit")
        return plan
    }

    @JvmStatic
    fun validateSession(session: WorkoutSession): WorkoutSession {
        requireVersion(session.protocolVersion)
        requireUuid("sessionId", session.sessionId)
        requireUuid("planId", session.planId)
        requireLogicalDate(session.logicalDate)
        session.startedAt?.let { requireTimestamp("startedAt", it) }
        session.finishedAt?.let { requireTimestamp("finishedAt", it) }
        session.currentExerciseId?.let { requireExerciseId(it) }
        session.currentSetId?.let { requireUuid("currentSetId", it) }
        session.unilateralPendingSetId?.let { requireUuid("unilateralPendingSetId", it) }
        if (session.completedSetIds.size > ProtocolLimits.MAX_FINAL_HEADS) {
            fail("SESSION_SET_LIMIT", "too many completed sets")
        }
        session.completedSetIds.forEach { requireUuid("completedSetId", it) }
        session.timer?.let(::validateTimer)
        return session
    }

    @JvmStatic
    fun validateEvent(event: WorkoutEvent): WorkoutEvent {
        requireVersion(event.protocolVersion)
        requireUuid("eventId", event.eventId)
        requireUuid("sessionId", event.sessionId)
        requireUuid("planId", event.planId)
        requireUuid("originInstanceId", event.originInstanceId)
        requireLogicalDate(event.logicalDate)
        requireTimestamp("occurredAt", event.occurredAt)
        requireTimestamp("createdAt", event.createdAt)
        if (event.originSequence !in 1..ProtocolLimits.MAX_ORIGIN_SEQUENCE) {
            fail("ORIGIN_SEQUENCE", "originSequence out of range")
        }

        when (event) {
            is CompletedSetEvent -> validateSetPayload(
                event.exerciseId, event.setId, event.setKind, event.loadMode,
                event.loadGrams, event.reps, event.partialReps, event.rir,
                event.targetRir, event.completedSides
            )
            is SetEditedEvent -> {
                requireUuid("baseEventId", event.baseEventId)
                if (event.baseEventId == event.eventId) fail("SELF_REFERENCE", "event cannot edit itself")
                validateSetPayload(
                    event.exerciseId, event.setId, event.setKind, event.loadMode,
                    event.loadGrams, event.reps, event.partialReps, event.rir,
                    event.targetRir, event.completedSides
                )
            }
            is SetUndoneEvent -> {
                requireExerciseId(event.exerciseId)
                requireUuid("setId", event.setId)
                requireUuid("baseEventId", event.baseEventId)
                if (event.baseEventId == event.eventId) fail("SELF_REFERENCE", "event cannot undo itself")
                event.reason?.let { requireText("reason", it, ProtocolLimits.MAX_ERROR_STRING) }
            }
            is SessionFinishedEvent -> {
                if (event.durationSeconds !in 0..ProtocolLimits.MAX_DURATION_SECONDS) {
                    fail("DURATION_RANGE", "durationSeconds out of range")
                }
                if (event.finalSetHeads.size > ProtocolLimits.MAX_FINAL_HEADS) {
                    fail("FINAL_HEAD_LIMIT", "too many final set heads")
                }
                event.finalSetHeads.forEach { (setId, eventId) ->
                    requireUuid("finalSetHeads.setId", setId)
                    requireUuid("finalSetHeads.eventId", eventId)
                }
            }
        }
        val bytes = ProtocolJson.encodeEventUnchecked(event).toByteArray(Charsets.UTF_8).size
        if (bytes > ProtocolLimits.MAX_EVENT_BYTES) fail("EVENT_SIZE", "event exceeds byte limit")
        return event
    }

    @JvmStatic
    fun validateEnvelope(envelope: SyncEnvelope): SyncEnvelope {
        requireVersion(envelope.protocolVersion)
        requireUuid("envelopeId", envelope.envelopeId)
        requireUuid("originInstanceId", envelope.originInstanceId)
        requireTimestamp("createdAt", envelope.createdAt)
        if (envelope.events.isEmpty() || envelope.events.size > ProtocolLimits.MAX_EVENTS_PER_ENVELOPE) {
            fail("ENVELOPE_EVENT_LIMIT", "envelope event count out of range")
        }
        val ids = HashSet<String>()
        envelope.events.forEach {
            validateEvent(it)
            if (it.origin != envelope.origin || it.originInstanceId != envelope.originInstanceId) {
                fail("ENVELOPE_ORIGIN", "event origin does not match envelope")
            }
            if (!ids.add(it.eventId)) fail("DUPLICATE_EVENT_ID", it.eventId)
        }
        val bytes = ProtocolJson.encodeEnvelopeUnchecked(envelope).toByteArray(Charsets.UTF_8).size
        if (bytes > ProtocolLimits.MAX_ENVELOPE_BYTES) fail("ENVELOPE_SIZE", "envelope exceeds byte limit")
        return envelope
    }

    @JvmStatic
    fun validateAck(ack: Ack): Ack {
        requireVersion(ack.protocolVersion)
        requireUuid("ackId", ack.ackId)
        requireUuid("envelopeId", ack.envelopeId)
        requireUuid("receiverInstanceId", ack.receiverInstanceId)
        requireTimestamp("createdAt", ack.createdAt)
        if (ack.events.isEmpty() || ack.events.size > ProtocolLimits.MAX_EVENTS_PER_ENVELOPE) {
            fail("ACK_EVENT_LIMIT", "ack event count out of range")
        }
        val ids = HashSet<String>()
        ack.events.forEach {
            requireUuid("eventId", it.eventId)
            if (!ids.add(it.eventId)) fail("DUPLICATE_ACK", it.eventId)
            if (!sha256Regex.matches(it.payloadHash)) fail("PAYLOAD_HASH", "invalid SHA-256")
            it.detail?.let { detail -> requireText("detail", detail, ProtocolLimits.MAX_ERROR_STRING) }
        }
        return ack
    }

    private fun validateExercise(exercise: ExercisePlan, expectedOrder: Int, setIds: MutableSet<String>) {
        requireExerciseId(exercise.exerciseId)
        requireText("exercise.name", exercise.name, ProtocolLimits.MAX_STRING)
        if (exercise.aliases.size > ProtocolLimits.MAX_ALIASES) fail("ALIAS_LIMIT", exercise.exerciseId)
        exercise.aliases.forEach { requireText("exercise.alias", it, ProtocolLimits.MAX_STRING) }
        if (exercise.order != expectedOrder) fail("EXERCISE_ORDER", "exercise order must be contiguous")
        if (exercise.restSeconds !in 0..ProtocolLimits.MAX_REST_SECONDS) fail("REST_RANGE", exercise.exerciseId)
        if (exercise.loadIncrementGrams !in 1..ProtocolLimits.MAX_LOAD_GRAMS) {
            fail("INCREMENT_RANGE", exercise.exerciseId)
        }
        exercise.targetRir?.let(::requireRir)
        if (exercise.prescriptions.isEmpty() ||
            exercise.prescriptions.size > ProtocolLimits.MAX_SETS_PER_EXERCISE) {
            fail("PRESCRIPTION_LIMIT", exercise.exerciseId)
        }
        exercise.prescriptions.forEachIndexed { expectedIndex, prescription ->
            requireUuid("setId", prescription.setId)
            if (!setIds.add(prescription.setId)) fail("DUPLICATE_SET_ID", prescription.setId)
            if (prescription.index != expectedIndex) fail("SET_INDEX", "set index must be contiguous")
            if (prescription.repsMin !in 1..ProtocolLimits.MAX_REPS ||
                prescription.repsMax !in prescription.repsMin..ProtocolLimits.MAX_REPS) {
                fail("REP_RANGE", prescription.setId)
            }
            prescription.suggestedLoadGrams?.let { requireLoad(it) }
            prescription.previousLoadGrams?.let { requireLoad(it) }
            prescription.previousReps?.let { requireReps(it) }
            prescription.targetRir?.let(::requireRir)
        }
    }

    private fun validateSetPayload(
        exerciseId: String,
        setId: String,
        setKind: SetKind,
        loadMode: LoadMode,
        loadGrams: Int,
        reps: Int,
        partialReps: Int,
        rir: Int?,
        targetRir: Int?,
        completedSides: Int
    ) {
        requireExerciseId(exerciseId)
        requireUuid("setId", setId)
        requireLoad(loadGrams)
        requireReps(reps)
        if (partialReps !in 0..ProtocolLimits.MAX_PARTIAL_REPS) fail("PARTIAL_REPS_RANGE", setId)
        rir?.let(::requireRir)
        targetRir?.let(::requireRir)
        if (completedSides !in 1..2) fail("COMPLETED_SIDES", setId)
        if (loadMode == LoadMode.BODYWEIGHT && loadGrams != 0) {
            fail("BODYWEIGHT_LOAD", "bodyweight load must be zero")
        }
        if (setKind == SetKind.WARMUP && completedSides == 2) {
            // This is valid for unilateral warmups; branch intentionally documents the invariant.
        }
    }

    private fun validateTimer(timer: RestTimerState) {
        if (timer.durationSeconds !in 0..ProtocolLimits.MAX_REST_SECONDS) fail("TIMER_DURATION", "invalid timer")
        if (timer.remainingWhenPausedSeconds !in 0..ProtocolLimits.MAX_REST_SECONDS) {
            fail("TIMER_REMAINING", "invalid paused remainder")
        }
        if (timer.endElapsedRealtime < 0 || timer.endWallClockMillis < 0 || timer.bootCount < 0) {
            fail("TIMER_DEADLINE", "invalid timer deadline")
        }
    }

    private fun requireVersion(version: Int) {
        if (version != PROTOCOL_VERSION) fail("UNKNOWN_VERSION", "unsupported protocolVersion=$version")
    }

    private fun requireExerciseId(id: String) {
        if (!exerciseIdRegex.matches(id)) fail("EXERCISE_ID", "invalid exerciseId")
    }

    private fun requireUuid(field: String, value: String) {
        try {
            val parsed = UUID.fromString(value)
            if (parsed.toString() != value.lowercase(Locale.US)) fail("UUID_CANONICAL", "$field is not canonical")
        } catch (_: IllegalArgumentException) {
            fail("UUID", "$field is not a UUID")
        }
    }

    private fun requireLogicalDate(value: String) {
        if (!dateRegex.matches(value)) fail("LOGICAL_DATE", "invalid logicalDate")
        val parser = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }
        try {
            if (parser.parse(value) == null) fail("LOGICAL_DATE", "invalid logicalDate")
        } catch (_: Exception) {
            fail("LOGICAL_DATE", "invalid logicalDate")
        }
    }

    private fun requireText(field: String, value: String, max: Int) {
        if (value.isBlank() || value.length > max || value.any { it == '\u0000' }) {
            fail("TEXT", "$field is blank, too long, or contains NUL")
        }
    }

    private fun requireTimestamp(field: String, value: Long) {
        if (value !in 1..ProtocolLimits.MAX_SAFE_INTEGER) {
            fail("TIMESTAMP", "$field must be a positive JSON-safe integer")
        }
    }

    private fun requireLoad(value: Int) {
        if (value !in 0..ProtocolLimits.MAX_LOAD_GRAMS) fail("LOAD_RANGE", "load out of range")
    }

    private fun requireReps(value: Int) {
        if (value !in 1..ProtocolLimits.MAX_REPS) fail("REPS_RANGE", "reps out of range")
    }

    private fun requireRir(value: Int) {
        if (value !in 0..ProtocolLimits.MAX_RIR) fail("RIR_RANGE", "RIR out of range")
    }

    private fun fail(code: String, message: String): Nothing = throw ProtocolException(code, message)
}
