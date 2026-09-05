package com.evolucao.treino.protocol

enum class ReconcileStatus {
    APPLIED,
    DUPLICATE,
    BLOCKED,
    CONFLICT_STORED,
    REJECTED
}

data class ReconcileResult(
    val eventId: String,
    val status: ReconcileStatus,
    val payloadHash: String,
    val detail: String? = null
)

/**
 * Pure deterministic reducer used by both persistence adapters. It never drops a valid payload:
 * causal gaps remain BLOCKED and concurrent heads remain available in conflicts().
 */
class EventReconciler {
    private enum class RecordState { RECEIVED, APPLIED, BLOCKED, CONFLICT }

    private data class Record(
        val event: WorkoutEvent,
        val hash: String,
        var state: RecordState,
        var detail: String?
    )

    private val records = LinkedHashMap<String, Record>()
    private val headsBySet = LinkedHashMap<String, String>()
    private val undoneSets = LinkedHashSet<String>()
    private val conflicts = LinkedHashSet<String>()
    private val finishedBySession = LinkedHashMap<String, String>()

    @Synchronized
    fun submit(event: WorkoutEvent): ReconcileResult {
        return try {
            ProtocolValidator.validateEvent(event)
            val hash = ProtocolJson.eventPayloadHash(event)
            val existing = records[event.eventId]
            if (existing != null) {
                if (existing.hash != hash) {
                    conflicts += event.eventId
                    return ReconcileResult(event.eventId, ReconcileStatus.CONFLICT_STORED, hash, "eventId reused with another payload")
                }
                drainBlocked()
                return if (existing.state == RecordState.APPLIED) {
                    ReconcileResult(event.eventId, ReconcileStatus.DUPLICATE, hash, "already applied")
                } else {
                    resultFor(existing)
                }
            }
            val record = Record(event, hash, RecordState.RECEIVED, null)
            records[event.eventId] = record
            process(record)
            drainBlocked()
            resultFor(record)
        } catch (e: ProtocolException) {
            ReconcileResult(event.eventId, ReconcileStatus.REJECTED, "", "${e.code}:${e.message}")
        }
    }

    @Synchronized
    fun headEventId(setId: String): String? = headsBySet[setId]

    @Synchronized
    fun headEvent(setId: String): WorkoutEvent? = headsBySet[setId]?.let { records[it]?.event }

    @Synchronized
    fun isSetUndone(setId: String): Boolean = setId in undoneSets

    @Synchronized
    fun finishedEventId(sessionId: String): String? = finishedBySession[sessionId]

    @Synchronized
    fun blockedEventIds(): Set<String> = records.values
        .filter { it.state == RecordState.BLOCKED }
        .mapTo(LinkedHashSet()) { it.event.eventId }

    @Synchronized
    fun conflictEventIds(): Set<String> = LinkedHashSet(conflicts)

    @Synchronized
    fun appliedEventIds(): Set<String> = records.values
        .filter { it.state == RecordState.APPLIED }
        .mapTo(LinkedHashSet()) { it.event.eventId }

    private fun process(record: Record) {
        when (val event = record.event) {
            is CompletedSetEvent -> applySetHead(record, event.setId, null)
            is SetEditedEvent -> {
                val base = records[event.baseEventId]
                if (base == null || base.state == RecordState.BLOCKED) {
                    block(record, "missing baseEventId")
                } else if (!sameSet(base.event, event.setId)) {
                    conflict(record, "baseEventId belongs to another set")
                } else {
                    applySetHead(record, event.setId, event.baseEventId)
                }
            }
            is SetUndoneEvent -> {
                val base = records[event.baseEventId]
                if (base == null || base.state == RecordState.BLOCKED) {
                    block(record, "missing baseEventId")
                } else if (!sameSet(base.event, event.setId)) {
                    conflict(record, "baseEventId belongs to another set")
                } else {
                    applyUndo(record, event)
                }
            }
            is SessionFinishedEvent -> applyFinish(record, event)
        }
    }

    private fun applySetHead(record: Record, setId: String, expectedBase: String?) {
        val currentHead = headsBySet[setId]
        if (currentHead == null) {
            if (expectedBase != null && setId !in undoneSets) {
                conflict(record, "base is not the current set head")
                return
            }
            headsBySet[setId] = record.event.eventId
            undoneSets.remove(setId)
            applied(record)
            return
        }
        if (expectedBase == currentHead) {
            headsBySet[setId] = record.event.eventId
            undoneSets.remove(setId)
            applied(record)
            return
        }

        val current = records[currentHead]?.event
        if (current == null) {
            block(record, "current head is unavailable")
            return
        }
        if (wins(record.event, current)) {
            conflicts += current.eventId
            headsBySet[setId] = record.event.eventId
            undoneSets.remove(setId)
        }
        conflict(record, "concurrent set head preserved")
    }

    private fun applyUndo(record: Record, event: SetUndoneEvent) {
        val currentHead = headsBySet[event.setId]
        if (currentHead == event.baseEventId) {
            headsBySet.remove(event.setId)
            undoneSets += event.setId
            applied(record)
            return
        }
        val current = currentHead?.let { records[it]?.event }
        if (current != null && wins(event, current)) {
            conflicts += current.eventId
            headsBySet.remove(event.setId)
            undoneSets += event.setId
        }
        conflict(record, "undo is concurrent with another set head")
    }

    private fun applyFinish(record: Record, event: SessionFinishedEvent) {
        val missing = event.finalSetHeads.values.firstOrNull {
            records[it]?.state != RecordState.APPLIED && records[it]?.state != RecordState.CONFLICT
        }
        if (missing != null) {
            block(record, "missing final set dependency")
            return
        }
        val existing = finishedBySession[event.sessionId]
        if (existing == null) {
            finishedBySession[event.sessionId] = event.eventId
            applied(record)
        } else {
            conflict(record, "session already finished by $existing")
        }
    }

    private fun drainBlocked() {
        var changed: Boolean
        do {
            changed = false
            records.values.filter { it.state == RecordState.BLOCKED }.forEach { record ->
                val before = record.state
                process(record)
                if (before != record.state) changed = true
            }
        } while (changed)
    }

    private fun sameSet(event: WorkoutEvent, setId: String): Boolean = when (event) {
        is CompletedSetEvent -> event.setId == setId
        is SetEditedEvent -> event.setId == setId
        is SetUndoneEvent -> event.setId == setId
        is SessionFinishedEvent -> false
    }

    private fun wins(candidate: WorkoutEvent, current: WorkoutEvent): Boolean {
        val candidateAuthority = if (candidate.origin == Origin.WEAR) 2 else 1
        val currentAuthority = if (current.origin == Origin.WEAR) 2 else 1
        return compareValuesBy(
            candidate,
            current,
            { if (it.origin == Origin.WEAR) 2 else 1 },
            { it.originSequence },
            { it.occurredAt },
            { it.eventId }
        ) > 0 || candidateAuthority > currentAuthority
    }

    private fun applied(record: Record) {
        record.state = RecordState.APPLIED
        record.detail = null
    }

    private fun block(record: Record, detail: String) {
        record.state = RecordState.BLOCKED
        record.detail = detail
    }

    private fun conflict(record: Record, detail: String) {
        record.state = RecordState.CONFLICT
        record.detail = detail
        conflicts += record.event.eventId
    }

    private fun resultFor(record: Record): ReconcileResult {
        val status = when (record.state) {
            RecordState.RECEIVED -> ReconcileStatus.BLOCKED
            RecordState.APPLIED -> ReconcileStatus.APPLIED
            RecordState.BLOCKED -> ReconcileStatus.BLOCKED
            RecordState.CONFLICT -> ReconcileStatus.CONFLICT_STORED
        }
        return ReconcileResult(record.event.eventId, status, record.hash, record.detail)
    }
}
