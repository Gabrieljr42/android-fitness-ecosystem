package com.evolucao.treino.protocol

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.security.MessageDigest

object ProtocolJson {
    private val planKeys = setOf(
        "protocolVersion", "planId", "sessionId", "planRevision", "logicalDate",
        "day", "name", "generatedAt", "mode", "conservativeWarning", "exercises",
        "phoneCompletedSetIds", "phoneRest"
    )
    /** Plan keys aceitos mas opcionais: planos v1 (sem estes campos) continuam válidos. */
    private val optionalPlanKeys = setOf("phoneCompletedSetIds", "phoneRest")
    private val exerciseKeys = setOf(
        "exerciseId", "name", "aliases", "order", "restSeconds", "loadIncrementGrams",
        "perSide", "unilateral", "targetRir", "prescriptions"
    )
    private val prescriptionKeys = setOf(
        "setId", "index", "setKind", "repsMin", "repsMax", "suggestedLoadGrams",
        "previousLoadGrams", "previousReps", "targetRir"
    )
    private val envelopeKeys = setOf(
        "protocolVersion", "envelopeId", "origin", "originInstanceId", "createdAt", "events"
    )
    private val ackKeys = setOf(
        "protocolVersion", "ackId", "envelopeId", "receiver", "receiverInstanceId", "createdAt", "events"
    )
    private val eventAckKeys = setOf("eventId", "status", "payloadHash", "detail")
    private val commonEventKeys = setOf(
        "protocolVersion", "eventType", "eventId", "sessionId", "planId", "planRevision",
        "logicalDate", "occurredAt", "createdAt", "origin", "originInstanceId", "originSequence"
    )
    private val setValueKeys = setOf(
        "exerciseId", "setId", "setKind", "loadMode", "loadGrams", "reps", "partialReps",
        "rir", "targetRir", "completedSides"
    )
    private val sessionKeys = setOf(
        "protocolVersion", "sessionId", "planId", "planRevision", "logicalDate", "state",
        "startedAt", "finishedAt", "currentExerciseId", "currentSetId", "completedSetIds",
        "mode", "unilateralPendingSetId", "timer"
    )
    private val timerKeys = setOf(
        "running", "paused", "durationSeconds", "remainingWhenPausedSeconds",
        "endElapsedRealtime", "endWallClockMillis", "bootCount"
    )

    @JvmStatic
    fun encodePlan(plan: WorkoutPlan): String {
        ProtocolValidator.validatePlan(plan)
        val encoded = encodePlanUnchecked(plan)
        requireByteLimit(encoded, ProtocolLimits.MAX_PLAN_BYTES, "PLAN_SIZE")
        return encoded
    }

    @JvmStatic
    fun decodePlan(raw: String): WorkoutPlan = guarded {
        requireByteLimit(raw, ProtocolLimits.MAX_PLAN_BYTES, "PLAN_SIZE")
        val root = JSONObject(raw)
        requireKnownKeys(root, planKeys, "plan", optionalPlanKeys)
        val exercisesJson = root.requireArray("exercises")
        val exercises = ArrayList<ExercisePlan>(exercisesJson.length())
        for (i in 0 until exercisesJson.length()) exercises += decodeExercise(exercisesJson.getJSONObject(i))
        val phoneCompleted = if (root.isNull("phoneCompletedSetIds")) {
            emptySet()
        } else {
            val ids = root.requireArray("phoneCompletedSetIds")
            LinkedHashSet<String>().also { out ->
                for (i in 0 until ids.length()) out += ids.getString(i)
            }
        }
        ProtocolValidator.validatePlan(
            WorkoutPlan(
                protocolVersion = root.requireInt("protocolVersion"),
                planId = root.requireString("planId"),
                sessionId = root.requireString("sessionId"),
                revision = PlanRevision(root.requireInt("planRevision")),
                logicalDate = root.requireString("logicalDate"),
                day = root.requireString("day"),
                name = root.requireString("name"),
                generatedAt = root.requireLong("generatedAt"),
                mode = enumValue<WorkoutMode>(root.requireString("mode"), "mode"),
                conservativeWarning = root.optionalString("conservativeWarning"),
                exercises = exercises,
                phoneCompletedSetIds = phoneCompleted,
                phoneRest = if (root.isNull("phoneRest")) null else decodeTimer(root.getJSONObject("phoneRest"))
            )
        )
    }

    internal fun encodePlanUnchecked(plan: WorkoutPlan): String {
        val root = JSONObject()
        root.put("protocolVersion", plan.protocolVersion)
        root.put("planId", plan.planId)
        root.put("sessionId", plan.sessionId)
        root.put("planRevision", plan.revision.value)
        root.put("logicalDate", plan.logicalDate)
        root.put("day", plan.day)
        root.put("name", plan.name)
        root.put("generatedAt", plan.generatedAt)
        root.put("mode", plan.mode.name)
        putNullable(root, "conservativeWarning", plan.conservativeWarning)
        val exercises = JSONArray()
        plan.exercises.forEach { exercises.put(encodeExercise(it)) }
        root.put("exercises", exercises)
        root.put("phoneCompletedSetIds", JSONArray(plan.phoneCompletedSetIds.sorted()))
        root.put("phoneRest", plan.phoneRest?.let(::encodeTimer) ?: JSONObject.NULL)
        return root.toString()
    }

    @JvmStatic
    fun encodeEvent(event: WorkoutEvent): String {
        ProtocolValidator.validateEvent(event)
        return encodeEventUnchecked(event)
    }

    @JvmStatic
    fun decodeEvent(raw: String): WorkoutEvent = guarded {
        requireByteLimit(raw, ProtocolLimits.MAX_EVENT_BYTES, "EVENT_SIZE")
        ProtocolValidator.validateEvent(decodeEventObject(JSONObject(raw)))
    }

    internal fun encodeEventUnchecked(event: WorkoutEvent): String = encodeEventObject(event).toString()

    @JvmStatic
    fun eventPayloadHash(event: WorkoutEvent): String {
        val canonical = encodeEvent(event).toByteArray(Charsets.UTF_8)
        return MessageDigest.getInstance("SHA-256").digest(canonical)
            .joinToString(separator = "") { "%02x".format(it) }
    }

    @JvmStatic
    fun encodeEnvelope(envelope: SyncEnvelope): String {
        ProtocolValidator.validateEnvelope(envelope)
        return encodeEnvelopeUnchecked(envelope)
    }

    @JvmStatic
    fun decodeEnvelope(raw: String): SyncEnvelope = guarded {
        requireByteLimit(raw, ProtocolLimits.MAX_ENVELOPE_BYTES, "ENVELOPE_SIZE")
        val root = JSONObject(raw)
        requireKnownKeys(root, envelopeKeys, "envelope")
        val eventsJson = root.requireArray("events")
        val events = ArrayList<WorkoutEvent>(eventsJson.length())
        for (i in 0 until eventsJson.length()) events += decodeEventObject(eventsJson.getJSONObject(i))
        ProtocolValidator.validateEnvelope(
            SyncEnvelope(
                protocolVersion = root.requireInt("protocolVersion"),
                envelopeId = root.requireString("envelopeId"),
                origin = enumValue(root.requireString("origin"), "origin"),
                originInstanceId = root.requireString("originInstanceId"),
                createdAt = root.requireLong("createdAt"),
                events = events
            )
        )
    }

    internal fun encodeEnvelopeUnchecked(envelope: SyncEnvelope): String {
        val root = JSONObject()
        root.put("protocolVersion", envelope.protocolVersion)
        root.put("envelopeId", envelope.envelopeId)
        root.put("origin", envelope.origin.name)
        root.put("originInstanceId", envelope.originInstanceId)
        root.put("createdAt", envelope.createdAt)
        val events = JSONArray()
        envelope.events.forEach { events.put(encodeEventObject(it)) }
        root.put("events", events)
        return root.toString()
    }

    @JvmStatic
    fun encodeAck(ack: Ack): String {
        ProtocolValidator.validateAck(ack)
        val root = JSONObject()
        root.put("protocolVersion", ack.protocolVersion)
        root.put("ackId", ack.ackId)
        root.put("envelopeId", ack.envelopeId)
        root.put("receiver", ack.receiver.name)
        root.put("receiverInstanceId", ack.receiverInstanceId)
        root.put("createdAt", ack.createdAt)
        val events = JSONArray()
        ack.events.forEach {
            val item = JSONObject()
            item.put("eventId", it.eventId)
            item.put("status", it.status.name)
            item.put("payloadHash", it.payloadHash)
            putNullable(item, "detail", it.detail)
            events.put(item)
        }
        root.put("events", events)
        return root.toString()
    }

    @JvmStatic
    fun decodeAck(raw: String): Ack = guarded {
        requireByteLimit(raw, ProtocolLimits.MAX_ENVELOPE_BYTES, "ACK_SIZE")
        val root = JSONObject(raw)
        requireKnownKeys(root, ackKeys, "ack")
        val itemsJson = root.requireArray("events")
        val items = ArrayList<EventAck>(itemsJson.length())
        for (i in 0 until itemsJson.length()) {
            val item = itemsJson.getJSONObject(i)
            requireKnownKeys(item, eventAckKeys, "eventAck")
            items += EventAck(
                eventId = item.requireString("eventId"),
                status = enumValue(item.requireString("status"), "status"),
                payloadHash = item.requireString("payloadHash"),
                detail = item.optionalString("detail")
            )
        }
        ProtocolValidator.validateAck(
            Ack(
                protocolVersion = root.requireInt("protocolVersion"),
                ackId = root.requireString("ackId"),
                envelopeId = root.requireString("envelopeId"),
                receiver = enumValue(root.requireString("receiver"), "receiver"),
                receiverInstanceId = root.requireString("receiverInstanceId"),
                createdAt = root.requireLong("createdAt"),
                events = items
            )
        )
    }

    @JvmStatic
    fun encodeSession(session: WorkoutSession): String {
        ProtocolValidator.validateSession(session)
        val root = JSONObject()
        root.put("protocolVersion", session.protocolVersion)
        root.put("sessionId", session.sessionId)
        root.put("planId", session.planId)
        root.put("planRevision", session.planRevision.value)
        root.put("logicalDate", session.logicalDate)
        root.put("state", session.state.name)
        putNullable(root, "startedAt", session.startedAt)
        putNullable(root, "finishedAt", session.finishedAt)
        putNullable(root, "currentExerciseId", session.currentExerciseId)
        putNullable(root, "currentSetId", session.currentSetId)
        root.put("completedSetIds", JSONArray(session.completedSetIds.sorted()))
        root.put("mode", session.mode.name)
        putNullable(root, "unilateralPendingSetId", session.unilateralPendingSetId)
        root.put("timer", session.timer?.let(::encodeTimer) ?: JSONObject.NULL)
        return root.toString()
    }

    @JvmStatic
    fun decodeSession(raw: String): WorkoutSession = guarded {
        requireByteLimit(raw, ProtocolLimits.MAX_PLAN_BYTES, "SESSION_SIZE")
        val root = JSONObject(raw)
        requireKnownKeys(root, sessionKeys, "session")
        val completed = root.requireArray("completedSetIds")
        val completedIds = LinkedHashSet<String>()
        for (i in 0 until completed.length()) completedIds += completed.getString(i)
        ProtocolValidator.validateSession(
            WorkoutSession(
                protocolVersion = root.requireInt("protocolVersion"),
                sessionId = root.requireString("sessionId"),
                planId = root.requireString("planId"),
                planRevision = PlanRevision(root.requireInt("planRevision")),
                logicalDate = root.requireString("logicalDate"),
                state = enumValue(root.requireString("state"), "state"),
                startedAt = root.optionalLong("startedAt"),
                finishedAt = root.optionalLong("finishedAt"),
                currentExerciseId = root.optionalString("currentExerciseId"),
                currentSetId = root.optionalString("currentSetId"),
                completedSetIds = completedIds,
                mode = enumValue(root.requireString("mode"), "mode"),
                unilateralPendingSetId = root.optionalString("unilateralPendingSetId"),
                timer = if (root.isNull("timer")) null else decodeTimer(root.getJSONObject("timer"))
            )
        )
    }

    private fun encodeExercise(exercise: ExercisePlan): JSONObject {
        val out = JSONObject()
        out.put("exerciseId", exercise.exerciseId)
        out.put("name", exercise.name)
        out.put("aliases", JSONArray(exercise.aliases))
        out.put("order", exercise.order)
        out.put("restSeconds", exercise.restSeconds)
        out.put("loadIncrementGrams", exercise.loadIncrementGrams)
        out.put("perSide", exercise.perSide)
        out.put("unilateral", exercise.unilateral)
        putNullable(out, "targetRir", exercise.targetRir)
        val prescriptions = JSONArray()
        exercise.prescriptions.forEach { prescription ->
            val item = JSONObject()
            item.put("setId", prescription.setId)
            item.put("index", prescription.index)
            item.put("setKind", prescription.kind.name)
            item.put("repsMin", prescription.repsMin)
            item.put("repsMax", prescription.repsMax)
            putNullable(item, "suggestedLoadGrams", prescription.suggestedLoadGrams)
            putNullable(item, "previousLoadGrams", prescription.previousLoadGrams)
            putNullable(item, "previousReps", prescription.previousReps)
            putNullable(item, "targetRir", prescription.targetRir)
            prescriptions.put(item)
        }
        out.put("prescriptions", prescriptions)
        return out
    }

    private fun decodeExercise(root: JSONObject): ExercisePlan {
        requireKnownKeys(root, exerciseKeys, "exercise")
        val aliasesJson = root.requireArray("aliases")
        val aliases = ArrayList<String>(aliasesJson.length())
        for (i in 0 until aliasesJson.length()) aliases += aliasesJson.getString(i)
        val prescriptionsJson = root.requireArray("prescriptions")
        val prescriptions = ArrayList<SetPrescription>(prescriptionsJson.length())
        for (i in 0 until prescriptionsJson.length()) {
            val item = prescriptionsJson.getJSONObject(i)
            requireKnownKeys(item, prescriptionKeys, "setPrescription")
            prescriptions += SetPrescription(
                setId = item.requireString("setId"),
                index = item.requireInt("index"),
                kind = enumValue(item.requireString("setKind"), "setKind"),
                repsMin = item.requireInt("repsMin"),
                repsMax = item.requireInt("repsMax"),
                suggestedLoadGrams = item.optionalInt("suggestedLoadGrams"),
                previousLoadGrams = item.optionalInt("previousLoadGrams"),
                previousReps = item.optionalInt("previousReps"),
                targetRir = item.optionalInt("targetRir")
            )
        }
        return ExercisePlan(
            exerciseId = root.requireString("exerciseId"),
            name = root.requireString("name"),
            aliases = aliases,
            order = root.requireInt("order"),
            restSeconds = root.requireInt("restSeconds"),
            loadIncrementGrams = root.requireInt("loadIncrementGrams"),
            perSide = root.requireBoolean("perSide"),
            unilateral = root.requireBoolean("unilateral"),
            targetRir = root.optionalInt("targetRir"),
            prescriptions = prescriptions
        )
    }

    private fun encodeEventObject(event: WorkoutEvent): JSONObject {
        val root = JSONObject()
        root.put("protocolVersion", event.protocolVersion)
        root.put("eventType", event.eventType.name)
        root.put("eventId", event.eventId)
        root.put("sessionId", event.sessionId)
        root.put("planId", event.planId)
        root.put("planRevision", event.planRevision.value)
        root.put("logicalDate", event.logicalDate)
        root.put("occurredAt", event.occurredAt)
        root.put("createdAt", event.createdAt)
        root.put("origin", event.origin.name)
        root.put("originInstanceId", event.originInstanceId)
        root.put("originSequence", event.originSequence)
        when (event) {
            is CompletedSetEvent -> putSetValues(root, event)
            is SetEditedEvent -> {
                root.put("baseEventId", event.baseEventId)
                putSetValues(root, event)
            }
            is SetUndoneEvent -> {
                root.put("exerciseId", event.exerciseId)
                root.put("setId", event.setId)
                root.put("baseEventId", event.baseEventId)
                putNullable(root, "reason", event.reason)
            }
            is SessionFinishedEvent -> {
                root.put("mode", event.mode.name)
                root.put("durationSeconds", event.durationSeconds)
                val heads = JSONObject()
                event.finalSetHeads.toSortedMap().forEach { (setId, eventId) -> heads.put(setId, eventId) }
                root.put("finalSetHeads", heads)
            }
        }
        return root
    }

    private fun putSetValues(root: JSONObject, event: CompletedSetEvent) {
        root.put("exerciseId", event.exerciseId)
        root.put("setId", event.setId)
        root.put("setKind", event.setKind.name)
        root.put("loadMode", event.loadMode.name)
        root.put("loadGrams", event.loadGrams)
        root.put("reps", event.reps)
        root.put("partialReps", event.partialReps)
        putNullable(root, "rir", event.rir)
        putNullable(root, "targetRir", event.targetRir)
        root.put("completedSides", event.completedSides)
    }

    private fun putSetValues(root: JSONObject, event: SetEditedEvent) {
        root.put("exerciseId", event.exerciseId)
        root.put("setId", event.setId)
        root.put("setKind", event.setKind.name)
        root.put("loadMode", event.loadMode.name)
        root.put("loadGrams", event.loadGrams)
        root.put("reps", event.reps)
        root.put("partialReps", event.partialReps)
        putNullable(root, "rir", event.rir)
        putNullable(root, "targetRir", event.targetRir)
        root.put("completedSides", event.completedSides)
    }

    private fun decodeEventObject(root: JSONObject): WorkoutEvent {
        val type = enumValue<EventType>(root.requireString("eventType"), "eventType")
        val expectedKeys = when (type) {
            EventType.COMPLETED_SET -> commonEventKeys + setValueKeys
            EventType.SET_EDITED -> commonEventKeys + setValueKeys + "baseEventId"
            EventType.SET_UNDONE -> commonEventKeys + setOf("exerciseId", "setId", "baseEventId", "reason")
            EventType.SESSION_FINISHED -> commonEventKeys + setOf("mode", "durationSeconds", "finalSetHeads")
        }
        requireKnownKeys(root, expectedKeys, "event")
        val common = EventCommon(
            protocolVersion = root.requireInt("protocolVersion"),
            eventId = root.requireString("eventId"),
            sessionId = root.requireString("sessionId"),
            planId = root.requireString("planId"),
            planRevision = PlanRevision(root.requireInt("planRevision")),
            logicalDate = root.requireString("logicalDate"),
            occurredAt = root.requireLong("occurredAt"),
            createdAt = root.requireLong("createdAt"),
            origin = enumValue(root.requireString("origin"), "origin"),
            originInstanceId = root.requireString("originInstanceId"),
            originSequence = root.requireLong("originSequence")
        )
        return when (type) {
            EventType.COMPLETED_SET -> CompletedSetEvent(
                protocolVersion = common.protocolVersion,
                eventId = common.eventId,
                sessionId = common.sessionId,
                planId = common.planId,
                planRevision = common.planRevision,
                logicalDate = common.logicalDate,
                occurredAt = common.occurredAt,
                createdAt = common.createdAt,
                origin = common.origin,
                originInstanceId = common.originInstanceId,
                originSequence = common.originSequence,
                exerciseId = root.requireString("exerciseId"),
                setId = root.requireString("setId"),
                setKind = enumValue(root.requireString("setKind"), "setKind"),
                loadMode = enumValue(root.requireString("loadMode"), "loadMode"),
                loadGrams = root.requireInt("loadGrams"),
                reps = root.requireInt("reps"),
                partialReps = root.requireInt("partialReps"),
                rir = root.optionalInt("rir"),
                targetRir = root.optionalInt("targetRir"),
                completedSides = root.requireInt("completedSides")
            )
            EventType.SET_EDITED -> SetEditedEvent(
                protocolVersion = common.protocolVersion,
                eventId = common.eventId,
                sessionId = common.sessionId,
                planId = common.planId,
                planRevision = common.planRevision,
                logicalDate = common.logicalDate,
                occurredAt = common.occurredAt,
                createdAt = common.createdAt,
                origin = common.origin,
                originInstanceId = common.originInstanceId,
                originSequence = common.originSequence,
                exerciseId = root.requireString("exerciseId"),
                setId = root.requireString("setId"),
                baseEventId = root.requireString("baseEventId"),
                setKind = enumValue(root.requireString("setKind"), "setKind"),
                loadMode = enumValue(root.requireString("loadMode"), "loadMode"),
                loadGrams = root.requireInt("loadGrams"),
                reps = root.requireInt("reps"),
                partialReps = root.requireInt("partialReps"),
                rir = root.optionalInt("rir"),
                targetRir = root.optionalInt("targetRir"),
                completedSides = root.requireInt("completedSides")
            )
            EventType.SET_UNDONE -> SetUndoneEvent(
                protocolVersion = common.protocolVersion,
                eventId = common.eventId,
                sessionId = common.sessionId,
                planId = common.planId,
                planRevision = common.planRevision,
                logicalDate = common.logicalDate,
                occurredAt = common.occurredAt,
                createdAt = common.createdAt,
                origin = common.origin,
                originInstanceId = common.originInstanceId,
                originSequence = common.originSequence,
                exerciseId = root.requireString("exerciseId"),
                setId = root.requireString("setId"),
                baseEventId = root.requireString("baseEventId"),
                reason = root.optionalString("reason")
            )
            EventType.SESSION_FINISHED -> {
                val headsJson = root.requireObject("finalSetHeads")
                val heads = LinkedHashMap<String, String>()
                val keys = headsJson.keys()
                while (keys.hasNext()) {
                    val setId = keys.next()
                    heads[setId] = headsJson.getString(setId)
                }
                SessionFinishedEvent(
                    protocolVersion = common.protocolVersion,
                    eventId = common.eventId,
                    sessionId = common.sessionId,
                    planId = common.planId,
                    planRevision = common.planRevision,
                    logicalDate = common.logicalDate,
                    occurredAt = common.occurredAt,
                    createdAt = common.createdAt,
                    origin = common.origin,
                    originInstanceId = common.originInstanceId,
                    originSequence = common.originSequence,
                    mode = enumValue(root.requireString("mode"), "mode"),
                    durationSeconds = root.requireInt("durationSeconds"),
                    finalSetHeads = heads
                )
            }
        }
    }

    private fun encodeTimer(timer: RestTimerState): JSONObject = JSONObject().apply {
        put("running", timer.running)
        put("paused", timer.paused)
        put("durationSeconds", timer.durationSeconds)
        put("remainingWhenPausedSeconds", timer.remainingWhenPausedSeconds)
        put("endElapsedRealtime", timer.endElapsedRealtime)
        put("endWallClockMillis", timer.endWallClockMillis)
        put("bootCount", timer.bootCount)
    }

    private fun decodeTimer(root: JSONObject): RestTimerState {
        requireKnownKeys(root, timerKeys, "timer")
        return RestTimerState(
            running = root.requireBoolean("running"),
            paused = root.requireBoolean("paused"),
            durationSeconds = root.requireInt("durationSeconds"),
            remainingWhenPausedSeconds = root.requireInt("remainingWhenPausedSeconds"),
            endElapsedRealtime = root.requireLong("endElapsedRealtime"),
            endWallClockMillis = root.requireLong("endWallClockMillis"),
            bootCount = root.requireInt("bootCount")
        )
    }

    private data class EventCommon(
        val protocolVersion: Int,
        val eventId: String,
        val sessionId: String,
        val planId: String,
        val planRevision: PlanRevision,
        val logicalDate: String,
        val occurredAt: Long,
        val createdAt: Long,
        val origin: Origin,
        val originInstanceId: String,
        val originSequence: Long
    )

    private fun putNullable(root: JSONObject, key: String, value: Any?) {
        root.put(key, value ?: JSONObject.NULL)
    }

    private fun requireKnownKeys(
        root: JSONObject,
        allowed: Set<String>,
        context: String,
        optional: Set<String> = emptySet()
    ) {
        val keys = root.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (key !in allowed) throw ProtocolException("UNKNOWN_FIELD", "$context.$key")
        }
        allowed.forEach {
            if (it !in optional && !root.has(it)) throw ProtocolException("MISSING_FIELD", "$context.$it")
        }
    }

    private fun JSONObject.requireString(key: String): String {
        if (isNull(key) || get(key) !is String) throw ProtocolException("FIELD_TYPE", "$key must be string")
        return getString(key)
    }

    private fun JSONObject.requireInt(key: String): Int {
        val value = get(key)
        if (value !is Number || value.toLong() !in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong() ||
            value.toDouble() != value.toLong().toDouble()) {
            throw ProtocolException("FIELD_TYPE", "$key must be integer")
        }
        return value.toInt()
    }

    private fun JSONObject.requireLong(key: String): Long {
        val value = get(key)
        if (value !is Number || !value.toDouble().isFinite() || value.toDouble() != value.toLong().toDouble()) {
            throw ProtocolException("FIELD_TYPE", "$key must be long")
        }
        return value.toLong()
    }

    private fun JSONObject.requireBoolean(key: String): Boolean {
        if (isNull(key) || get(key) !is Boolean) throw ProtocolException("FIELD_TYPE", "$key must be boolean")
        return getBoolean(key)
    }

    private fun JSONObject.requireArray(key: String): JSONArray {
        if (isNull(key) || get(key) !is JSONArray) throw ProtocolException("FIELD_TYPE", "$key must be array")
        return getJSONArray(key)
    }

    private fun JSONObject.requireObject(key: String): JSONObject {
        if (isNull(key) || get(key) !is JSONObject) throw ProtocolException("FIELD_TYPE", "$key must be object")
        return getJSONObject(key)
    }

    private fun JSONObject.optionalString(key: String): String? {
        if (isNull(key)) return null
        return requireString(key)
    }

    private fun JSONObject.optionalInt(key: String): Int? {
        if (isNull(key)) return null
        return requireInt(key)
    }

    private fun JSONObject.optionalLong(key: String): Long? {
        if (isNull(key)) return null
        return requireLong(key)
    }

    private inline fun <reified T : Enum<T>> enumValue(raw: String, field: String): T {
        return enumValues<T>().firstOrNull { it.name == raw }
            ?: throw ProtocolException("ENUM", "$field has unknown value")
    }

    private fun requireByteLimit(raw: String, limit: Int, code: String) {
        if (raw.toByteArray(Charsets.UTF_8).size > limit) throw ProtocolException(code, "payload too large")
    }

    private inline fun <T> guarded(block: () -> T): T {
        return try {
            block()
        } catch (e: ProtocolException) {
            throw e
        } catch (e: JSONException) {
            throw ProtocolException("MALFORMED_JSON", e.message ?: "malformed JSON")
        } catch (e: IllegalArgumentException) {
            throw ProtocolException("INVALID_VALUE", e.message ?: "invalid value")
        }
    }
}
