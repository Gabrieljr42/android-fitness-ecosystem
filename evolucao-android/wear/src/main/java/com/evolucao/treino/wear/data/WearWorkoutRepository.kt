package com.evolucao.treino.wear.data

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.evolucao.treino.protocol.AckStatus
import com.evolucao.treino.protocol.CompletedSetEvent
import com.evolucao.treino.protocol.LoadMode
import com.evolucao.treino.protocol.Origin
import com.evolucao.treino.protocol.PlanRevision
import com.evolucao.treino.protocol.ProtocolJson
import com.evolucao.treino.protocol.ProtocolLimits
import com.evolucao.treino.protocol.RestTimerState
import com.evolucao.treino.protocol.SessionFinishedEvent
import com.evolucao.treino.protocol.SessionState
import com.evolucao.treino.protocol.SetEditedEvent
import com.evolucao.treino.protocol.SetUndoneEvent
import com.evolucao.treino.protocol.SyncEnvelope
import com.evolucao.treino.protocol.SyncStatus
import com.evolucao.treino.protocol.WorkoutEvent
import com.evolucao.treino.protocol.WorkoutPlan
import com.evolucao.treino.protocol.WorkoutSession
import com.evolucao.treino.protocol.WearTransport
import com.evolucao.treino.wear.domain.PlannedSet
import com.evolucao.treino.wear.domain.WearWorkoutDomain
import com.evolucao.treino.wear.system.RestTimerCoordinator
import com.evolucao.treino.wear.system.WorkoutOngoingActivity
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

data class SetInput(
    val loadMode: LoadMode,
    val loadGrams: Int,
    val reps: Int,
    val partialReps: Int,
    val rir: Int?
)

data class WearRepositoryState(
    val loading: Boolean = true,
    val plan: WorkoutPlan? = null,
    val waitingPlan: WorkoutPlan? = null,
    val session: WorkoutSession? = null,
    val events: List<WorkoutEvent> = emptyList(),
    val eventSyncStates: Map<String, String> = emptyMap(),
    val syncStatus: SyncStatus = SyncStatus.OFFLINE,
    val phoneReachable: Boolean = false,
    val pendingEvents: Int = 0,
    val hapticsEnabled: Boolean = true,
    val lastError: String? = null,
    /** Séries concluídas no telefone (para selo "telefone" na UI). */
    val phoneCompletedSetIds: Set<String> = emptySet()
)

class WearWorkoutRepository private constructor(context: Context) {
    private val appContext = context.applicationContext
    private val database = WearDatabase.get(appContext)
    private val dao = database.wearDao()
    private val mutex = Mutex()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val syncing = AtomicBoolean(false)
    private val preferences = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val instanceId = preferences.getString(INSTANCE_ID, null)
        ?: UUID.randomUUID().toString().also {
            check(preferences.edit().putString(INSTANCE_ID, it).commit())
        }
    private val _state = MutableStateFlow(
        WearRepositoryState(hapticsEnabled = preferences.getBoolean(HAPTICS, true))
    )
    val state: StateFlow<WearRepositoryState> = _state.asStateFlow()

    init {
        scope.launch {
            mutex.withLock {
                refreshStateLocked()
                restoreTimerLocked()
            }
            refreshPhoneReachability()
        }
        ensurePeriodicSync()
    }

    fun receivePlan(payload: String, transportHash: String, path: String) {
        scope.launch {
            mutex.withLock {
                try {
                    val plan = ProtocolJson.decodePlan(payload)
                    require(path == WearTransport.planPath(plan.sessionId)) { "Plan path/session mismatch" }
                    val canonical = ProtocolJson.encodePlan(plan)
                    val hash = sha256(canonical)
                    require(transportHash == hash) { "Plan transport hash mismatch" }
                    val now = System.currentTimeMillis()
                    val key = planKey(plan)
                    database.runInTransaction {
                        val activeSession = dao.activeSession()?.let(::decodeSession)
                        val activePlan = dao.activePlan()?.let(::decodePlan)
                        val finishedSessionIds = dao.finishedSessionIds().toSet()
                        val existing = dao.plan(key)
                        if (existing != null) {
                            if (existing.payloadHash != hash) {
                                dao.insertConflict(
                                    WearConflictEntity(
                                        conflictId = stableUuid("plan-reuse:$key:$hash"),
                                        relatedId = key,
                                        kind = "PLAN_REVISION_REUSE",
                                        detail = "Mesma revisão recebida com conteúdo diferente",
                                        payloadHash = hash,
                                        createdAt = now
                                    )
                                )
                            } else if (WearWorkoutDomain.shouldActivatePlan(
                                    plan,
                                    activePlan,
                                    activeSession?.sessionId,
                                    finishedSessionIds
                                )) {
                                dao.activatePlan(key)
                            }
                            return@runInTransaction
                        }

                        val shouldActivate = WearWorkoutDomain.shouldActivatePlan(
                            plan,
                            activePlan,
                            activeSession?.sessionId,
                            finishedSessionIds
                        )
                        dao.insertPlan(
                            WearPlanEntity(
                                planKey = key,
                                planId = plan.planId,
                                sessionId = plan.sessionId,
                                revision = plan.revision.value,
                                logicalDate = plan.logicalDate,
                                payload = canonical,
                                payloadHash = hash,
                                isActive = false,
                                receivedAt = now
                            )
                        )
                        if (shouldActivate) {
                            dao.activatePlan(key)
                            if (activeSession != null && activeSession.sessionId == plan.sessionId &&
                                activeSession.state != SessionState.FINISHED) {
                                val replay = WearWorkoutDomain.replay(plan, eventsLocked(activeSession.sessionId))
                                val effective = WearWorkoutDomain.effectiveCompleted(plan, replay.completedSetIds)
                                val current = WearWorkoutDomain.plannedSet(plan, activeSession.currentSetId)
                                    ?.takeIf { it.setId !in effective }
                                    ?: WearWorkoutDomain.firstIncomplete(plan, effective)
                                val updated = activeSession.copy(
                                    planId = plan.planId,
                                    planRevision = plan.revision,
                                    currentExerciseId = current?.exercise?.exerciseId,
                                    currentSetId = current?.setId,
                                    completedSetIds = effective
                                )
                                val row = requireNotNull(dao.activeSession())
                                dao.putSession(row.copy(
                                    planId = plan.planId,
                                    planRevision = plan.revision.value,
                                    payload = ProtocolJson.encodeSession(updated),
                                    updatedAt = now
                                ))
                                applyPhoneRestLocked(plan, now)
                            }
                        }
                    }
                    refreshStateLocked()
                } catch (error: Exception) {
                    Log.e(TAG, "Plan rejected: ${safeMessage(error)}")
                    setErrorLocked("Plano recebido é inválido. Tente sincronizar novamente.")
                }
            }
        }
    }

    fun receiveAck(payload: String, transportHash: String, path: String) {
        scope.launch {
            mutex.withLock {
                try {
                    val ack = ProtocolJson.decodeAck(payload)
                    require(ack.receiver == Origin.PHONE) { "Only PHONE acknowledgements are accepted" }
                    require(path == WearTransport.ackPath(ack.ackId)) { "Ack path/id mismatch" }
                    val canonical = ProtocolJson.encodeAck(ack)
                    val hash = sha256(canonical)
                    require(transportHash == hash) { "Ack transport hash mismatch" }
                    val now = System.currentTimeMillis()
                    database.runInTransaction {
                        val inserted = dao.insertAck(
                            WearAckEntity(ack.ackId, ack.envelopeId, hash, canonical, now)
                        )
                        if (inserted == -1L) return@runInTransaction
                        ack.events.forEach { item ->
                            val event = dao.event(item.eventId) ?: return@forEach
                            if (event.envelopeId != ack.envelopeId || event.payloadHash != item.payloadHash) {
                                dao.insertConflict(
                                    WearConflictEntity(
                                        conflictId = stableUuid("ack-mismatch:${ack.ackId}:${item.eventId}"),
                                        relatedId = item.eventId,
                                        kind = "ACK_MISMATCH",
                                        detail = "ACK não corresponde ao envelope/hash persistido",
                                        payloadHash = item.payloadHash,
                                        createdAt = now
                                    )
                                )
                                return@forEach
                            }
                            val state = when (item.status) {
                                AckStatus.RECEIVED -> EVENT_RECEIVED
                                AckStatus.APPLIED, AckStatus.ALREADY_APPLIED -> EVENT_ACKED
                                AckStatus.BLOCKED -> EVENT_BLOCKED
                                AckStatus.CONFLICT_STORED -> EVENT_CONFLICT
                                AckStatus.REJECTED -> EVENT_REJECTED
                            }
                            val nextAttempt = when (item.status) {
                                AckStatus.RECEIVED -> now + RECEIVED_RETRY_MS
                                AckStatus.BLOCKED -> now + BLOCKED_RETRY_MS
                                else -> Long.MAX_VALUE
                            }
                            dao.setEventSyncState(
                                event.eventId,
                                state,
                                event.attempts,
                                nextAttempt,
                                now,
                                item.detail?.take(ProtocolLimits.MAX_ERROR_STRING)
                            )
                        }
                    }
                    refreshStateLocked()
                } catch (error: Exception) {
                    Log.e(TAG, "Ack rejected: ${safeMessage(error)}")
                    setErrorLocked("Confirmação de sincronização inválida. Tente novamente.")
                }
            }
        }
    }

    suspend fun startWorkout() = withContext(Dispatchers.IO) {
        mutex.withLock {
            val plan = requireNotNull(dao.activePlan()?.let(::decodePlan)) { "Nenhum treino recebido" }
            val existing = dao.activeSession()?.let(::decodeSession)
            if (existing != null && existing.state != SessionState.FINISHED) {
                refreshStateLocked()
                return@withLock
            }
            val first = WearWorkoutDomain.firstIncomplete(
                plan,
                WearWorkoutDomain.effectiveCompleted(plan, emptySet())
            ) ?: throw IllegalStateException("Plano sem séries")
            val now = System.currentTimeMillis()
            val session = WorkoutSession(
                sessionId = plan.sessionId,
                planId = plan.planId,
                planRevision = plan.revision,
                logicalDate = plan.logicalDate,
                state = SessionState.ACTIVE,
                startedAt = now,
                finishedAt = null,
                currentExerciseId = first.exercise.exerciseId,
                currentSetId = first.setId,
                completedSetIds = WearWorkoutDomain.effectiveCompleted(plan, emptySet()),
                mode = plan.mode,
                unilateralPendingSetId = null,
                timer = null
            )
            database.runInTransaction {
                dao.deactivateSessions()
                dao.putSession(sessionRow(session, 0L, null, true, now))
            }
            applyPhoneRestLocked(plan, System.currentTimeMillis())
            refreshStateLocked()
            WorkoutOngoingActivity.show(appContext, plan, session, 0)
        }
    }

    suspend fun completeCurrentSet(input: SetInput) = withContext(Dispatchers.IO) {
        mutex.withLock {
            val plan = requireActivePlanLocked()
            val row = requireNotNull(dao.activeSession()) { "Treino não iniciado" }
            val session = decodeSession(row)
            require(session.state == SessionState.ACTIVE) { "Encerre ou pule o descanso primeiro" }
            val planned = requireNotNull(WearWorkoutDomain.plannedSet(plan, session.currentSetId)) { "Série atual inválida" }
            val oldEvents = eventsLocked(session.sessionId)
            val replay = WearWorkoutDomain.replay(plan, oldEvents)
            val oldHead = replay.heads[planned.setId]
            val completingSecondSide = planned.exercise.unilateral &&
                session.unilateralPendingSetId == planned.setId && oldHead?.completedSides == 1
            val sequence = row.originSequence + 1
            val now = System.currentTimeMillis()
            val eventId = UUID.randomUUID().toString()
            val prescription = planned.exercise.prescriptions.first { it.setId == planned.setId }
            val event: WorkoutEvent = if (completingSecondSide) {
                SetEditedEvent(
                    eventId = eventId,
                    sessionId = session.sessionId,
                    planId = plan.planId,
                    planRevision = plan.revision,
                    logicalDate = session.logicalDate,
                    occurredAt = now,
                    createdAt = now,
                    origin = Origin.WEAR,
                    originInstanceId = instanceId,
                    originSequence = sequence,
                    exerciseId = planned.exercise.exerciseId,
                    setId = planned.setId,
                    baseEventId = requireNotNull(oldHead).eventId,
                    setKind = prescription.kind,
                    loadMode = input.loadMode,
                    loadGrams = input.loadGrams,
                    reps = input.reps,
                    partialReps = input.partialReps,
                    rir = input.rir,
                    targetRir = prescription.targetRir ?: planned.exercise.targetRir,
                    completedSides = 2
                )
            } else {
                CompletedSetEvent(
                    eventId = eventId,
                    sessionId = session.sessionId,
                    planId = plan.planId,
                    planRevision = plan.revision,
                    logicalDate = session.logicalDate,
                    occurredAt = now,
                    createdAt = now,
                    origin = Origin.WEAR,
                    originInstanceId = instanceId,
                    originSequence = sequence,
                    exerciseId = planned.exercise.exerciseId,
                    setId = planned.setId,
                    setKind = prescription.kind,
                    loadMode = input.loadMode,
                    loadGrams = input.loadGrams,
                    reps = input.reps,
                    partialReps = input.partialReps,
                    rir = input.rir,
                    targetRir = prescription.targetRir ?: planned.exercise.targetRir,
                    completedSides = 1
                )
            }
            ProtocolJson.encodeEvent(event) // validates before the transaction
            val allEvents = oldEvents + event
            val after = WearWorkoutDomain.replay(plan, allEvents)
            val secondSidePending = planned.exercise.unilateral && !completingSecondSide
            val next = if (secondSidePending) planned
                else WearWorkoutDomain.nextIncomplete(plan, planned.setId, after.completedSetIds)
            val restSeconds = WearWorkoutDomain.restSeconds(planned, if (secondSidePending) 1 else 2, next != null)
            val timer = if (restSeconds > 0) newTimer(restSeconds) else null
            val newState = when {
                next == null -> SessionState.REVIEW
                timer != null -> SessionState.RESTING
                else -> SessionState.ACTIVE
            }
            val updatedSession = session.copy(
                planId = plan.planId,
                planRevision = plan.revision,
                state = newState,
                currentExerciseId = next?.exercise?.exerciseId,
                currentSetId = next?.setId,
                completedSetIds = WearWorkoutDomain.effectiveCompleted(plan, after.completedSetIds),
                unilateralPendingSetId = if (secondSidePending) planned.setId else null,
                timer = timer
            )
            val eventRow = eventRow(event, now)
            database.runInTransaction {
                ensureQueueCapacityLocked(eventRow.envelopePayload)
                dao.insertEvent(eventRow)
                dao.putSession(sessionRow(updatedSession, sequence, row.finishedEventId, true, now))
            }
            if (timer != null) RestTimerCoordinator.schedule(appContext, timer)
            else RestTimerCoordinator.cancel(appContext)
            refreshStateLocked()
            WorkoutOngoingActivity.show(
                appContext,
                plan,
                updatedSession,
                updatedSession.completedSetIds.size
            )
            scheduleImmediateSync()
        }
    }

    suspend fun undoLastSet() = withContext(Dispatchers.IO) {
        mutex.withLock {
            val plan = requireActivePlanLocked()
            val row = requireNotNull(dao.activeSession()) { "Treino não iniciado" }
            val session = decodeSession(row)
            require(session.state != SessionState.FINISHED) { "Treino já finalizado" }
            val oldEvents = eventsLocked(session.sessionId)
            val replay = WearWorkoutDomain.replay(plan, oldEvents)
            val planned = requireNotNull(WearWorkoutDomain.latestUndoable(plan, oldEvents)) { "Nenhuma série para desfazer" }
            val head = requireNotNull(replay.heads[planned.setId])
            val now = System.currentTimeMillis()
            val sequence = row.originSequence + 1
            val event = SetUndoneEvent(
                eventId = UUID.randomUUID().toString(),
                sessionId = session.sessionId,
                planId = plan.planId,
                planRevision = plan.revision,
                logicalDate = session.logicalDate,
                occurredAt = now,
                createdAt = now,
                origin = Origin.WEAR,
                originInstanceId = instanceId,
                originSequence = sequence,
                exerciseId = planned.exercise.exerciseId,
                setId = planned.setId,
                baseEventId = head.eventId,
                reason = "USER_UNDO"
            )
            val after = WearWorkoutDomain.replay(plan, oldEvents + event)
            val updated = session.copy(
                state = SessionState.ACTIVE,
                finishedAt = null,
                currentExerciseId = planned.exercise.exerciseId,
                currentSetId = planned.setId,
                completedSetIds = WearWorkoutDomain.effectiveCompleted(plan, after.completedSetIds),
                unilateralPendingSetId = null,
                timer = null
            )
            val eventRow = eventRow(event, now)
            database.runInTransaction {
                ensureQueueCapacityLocked(eventRow.envelopePayload)
                dao.insertEvent(eventRow)
                dao.putSession(sessionRow(updated, sequence, null, true, now))
            }
            RestTimerCoordinator.cancel(appContext)
            refreshStateLocked()
            WorkoutOngoingActivity.show(appContext, plan, updated, after.completedSetIds.size)
            scheduleImmediateSync()
        }
    }

    suspend fun finishWorkout() = withContext(Dispatchers.IO) {
        mutex.withLock {
            val plan = requireActivePlanLocked()
            val row = requireNotNull(dao.activeSession()) { "Treino não iniciado" }
            val session = decodeSession(row)
            if (row.finishedEventId != null || session.state == SessionState.FINISHED) return@withLock
            val events = eventsLocked(session.sessionId)
            val replay = WearWorkoutDomain.replay(plan, events)
            val now = System.currentTimeMillis()
            val sequence = row.originSequence + 1
            val heads = replay.heads.filterKeys { it in replay.completedSetIds }.mapValues { it.value.eventId }
            val duration = (((now - (session.startedAt ?: now)) / 1000L)
                .coerceIn(0L, ProtocolLimits.MAX_DURATION_SECONDS.toLong())).toInt()
            val event = SessionFinishedEvent(
                eventId = UUID.randomUUID().toString(),
                sessionId = session.sessionId,
                planId = plan.planId,
                planRevision = plan.revision,
                logicalDate = session.logicalDate,
                occurredAt = now,
                createdAt = now,
                origin = Origin.WEAR,
                originInstanceId = instanceId,
                originSequence = sequence,
                mode = session.mode,
                durationSeconds = duration,
                finalSetHeads = heads
            )
            val finished = session.copy(
                state = SessionState.FINISHED,
                finishedAt = now,
                currentExerciseId = null,
                currentSetId = null,
                completedSetIds = WearWorkoutDomain.effectiveCompleted(plan, replay.completedSetIds),
                unilateralPendingSetId = null,
                timer = null
            )
            val eventRow = eventRow(event, now)
            database.runInTransaction {
                ensureQueueCapacityLocked(eventRow.envelopePayload)
                dao.insertEvent(eventRow)
                dao.putSession(sessionRow(finished, sequence, event.eventId, true, now))
            }
            RestTimerCoordinator.cancel(appContext)
            WorkoutOngoingActivity.cancel(appContext)
            refreshStateLocked()
            scheduleImmediateSync()
        }
    }

    suspend fun reviewWorkout() = withContext(Dispatchers.IO) {
        mutex.withLock {
            val row = requireNotNull(dao.activeSession()) { "Treino não iniciado" }
            val session = decodeSession(row)
            require(session.state != SessionState.FINISHED) { "Treino já finalizado" }
            val updated = session.copy(state = SessionState.REVIEW, timer = null)
            dao.putSession(row.copy(
                state = updated.state.name,
                payload = ProtocolJson.encodeSession(updated),
                updatedAt = System.currentTimeMillis()
            ))
            RestTimerCoordinator.cancel(appContext)
            refreshStateLocked()
        }
    }

    suspend fun closeFinishedWorkout() = withContext(Dispatchers.IO) {
        mutex.withLock {
            val row = dao.activeSession() ?: return@withLock
            val session = decodeSession(row)
            require(session.state == SessionState.FINISHED) { "Treino ainda não finalizado" }
            database.runInTransaction {
                dao.putSession(row.copy(isActive = false, updatedAt = System.currentTimeMillis()))
                val finishedSessionIds = dao.finishedSessionIds().toSet()
                val candidates = dao.inactivePlans()
                    .map(::decodePlan)
                    .filter { plan -> plan.sessionId !in finishedSessionIds }
                dao.deactivatePlans()
                WearWorkoutDomain.newestSessionPlan(candidates)
                    ?.let { next -> dao.activatePlan(planKey(next)) }
            }
            refreshStateLocked()
        }
    }

    suspend fun navigateToExercise(exerciseId: String) = withContext(Dispatchers.IO) {
        mutex.withLock {
            val plan = requireActivePlanLocked()
            val row = requireNotNull(dao.activeSession())
            val session = decodeSession(row)
            require(session.state == SessionState.ACTIVE) { "Navegação indisponível durante descanso" }
            val replay = WearWorkoutDomain.replay(plan, eventsLocked(session.sessionId))
            val target = WearWorkoutDomain.firstIncompleteInExercise(plan, exerciseId, replay.completedSetIds)
                ?.takeIf { it.setId !in replay.completedSetIds } ?: return@withLock
            val updated = session.copy(currentExerciseId = exerciseId, currentSetId = target.setId)
            dao.putSession(row.copy(payload = ProtocolJson.encodeSession(updated), updatedAt = System.currentTimeMillis()))
            refreshStateLocked()
        }
    }

    suspend fun pauseTimer() = mutateTimer { session, remaining ->
        session.copy(
            state = SessionState.RESTING,
            timer = session.timer?.copy(
                running = false,
                paused = true,
                remainingWhenPausedSeconds = remaining,
                endElapsedRealtime = 0,
                endWallClockMillis = 0
            )
        )
    }

    suspend fun resumeTimer() = mutateTimer { session, remaining ->
        session.copy(state = SessionState.RESTING, timer = newTimer(remaining.coerceAtLeast(1)))
    }

    suspend fun addThirtySeconds() = mutateTimer { session, remaining ->
        val adjusted = (remaining + 30).coerceAtMost(ProtocolLimits.MAX_REST_SECONDS)
        val currentTimer = requireNotNull(session.timer)
        session.copy(state = SessionState.RESTING, timer = if (currentTimer.paused) {
            currentTimer.copy(
                durationSeconds = (currentTimer.durationSeconds + 30).coerceAtMost(ProtocolLimits.MAX_REST_SECONDS),
                remainingWhenPausedSeconds = adjusted,
                endElapsedRealtime = 0,
                endWallClockMillis = 0
            )
        } else newTimer(adjusted))
    }

    suspend fun endTimer() = withContext(Dispatchers.IO) {
        mutex.withLock { endTimerLocked() }
    }

    fun onTimerExpired() {
        scope.launch { mutex.withLock { endTimerLocked() } }
    }

    fun onTimerMarker(markerSeconds: Int, expectedEndWallClock: Long) {
        scope.launch {
            mutex.withLock {
                val session = dao.activeSession()?.let(::decodeSession) ?: return@withLock
                val timer = session.timer ?: return@withLock
                if (timer.endWallClockMillis != expectedEndWallClock || timer.paused) return@withLock
                if (preferences.getBoolean(HAPTICS, true)) {
                    RestTimerCoordinator.vibrate(appContext, markerSeconds)
                }
                if (markerSeconds == 0) endTimerLocked()
            }
        }
    }

    fun restoreTimerAfterRestart() {
        scope.launch { mutex.withLock { restoreTimerLocked() } }
    }

    fun setHapticsEnabled(enabled: Boolean) {
        preferences.edit().putBoolean(HAPTICS, enabled).apply()
        _state.value = _state.value.copy(hapticsEnabled = enabled)
    }

    fun retryNow() {
        scope.launch {
            mutex.withLock {
                val now = System.currentTimeMillis()
                dao.dueEvents(Long.MAX_VALUE, MAX_QUEUE_ITEMS).forEach { event ->
                    if (event.state !in TERMINAL_EVENT_STATES) {
                        dao.setEventSyncState(event.eventId, EVENT_RETRY, event.attempts, now, now, null)
                    }
                }
                refreshStateLocked()
            }
            refreshPhoneReachability()
            pokePhoneForPlan()
            scheduleImmediateSync()
        }
    }

    fun refreshPhoneReachability() {
        scope.launch {
            val reachable = try {
                Tasks.await(
                    Wearable.getCapabilityClient(appContext).getCapability(
                        WearTransport.PHONE_CAPABILITY,
                        CapabilityClient.FILTER_REACHABLE
                    ),
                    10,
                    TimeUnit.SECONDS
                ).nodes.isNotEmpty()
            } catch (_: Exception) {
                false
            }
            _state.value = _state.value.copy(
                phoneReachable = reachable,
                syncStatus = calculateSyncStatus(_state.value.pendingEvents, reachable, syncing.get(), _state.value.lastError)
            )
        }
    }

    fun scheduleImmediateSync() {
        val request = OneTimeWorkRequestBuilder<WearSyncWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(appContext).enqueueUniqueWork(
            IMMEDIATE_WORK,
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            request
        )
    }

    fun ensurePeriodicSync() {
        val request = PeriodicWorkRequestBuilder<WearSyncWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(appContext).enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    fun flushOutboxBlocking(): Boolean {
        syncing.set(true)
        _state.value = _state.value.copy(syncStatus = SyncStatus.SYNCING)
        var success = true
        try {
            val rows = dao.dueEvents(System.currentTimeMillis(), 64)
            rows.forEach { row ->
                try {
                    val path = WearTransport.envelopePath(row.envelopeId)
                    val request = PutDataMapRequest.create(path).apply {
                        dataMap.putString(WearTransport.DATA_PAYLOAD, row.envelopePayload)
                        dataMap.putString(WearTransport.DATA_PAYLOAD_HASH, sha256(row.envelopePayload))
                        dataMap.putLong(WearTransport.DATA_UPDATED_AT, System.currentTimeMillis())
                    }.asPutDataRequest().setUrgent()
                    Tasks.await(Wearable.getDataClient(appContext).putDataItem(request), 20, TimeUnit.SECONDS)
                    val now = System.currentTimeMillis()
                    dao.setEventSyncState(
                        row.eventId,
                        EVENT_SENT,
                        row.attempts + 1,
                        now + SENT_RETRY_MS,
                        now,
                        null
                    )
                    pokeReachablePhoneNodes(path)
                } catch (error: Exception) {
                    success = false
                    val attempts = row.attempts + 1
                    val delay = (10_000L shl minOf(attempts, 8)).coerceAtMost(6 * 60 * 60 * 1000L)
                    val now = System.currentTimeMillis()
                    dao.setEventSyncState(
                        row.eventId,
                        EVENT_RETRY,
                        attempts,
                        now + delay,
                        now,
                        safeMessage(error)
                    )
                }
            }
        } finally {
            syncing.set(false)
            scope.launch { mutex.withLock { refreshStateLocked() } }
        }
        return success
    }

    private suspend fun mutateTimer(transform: (WorkoutSession, Int) -> WorkoutSession) = withContext(Dispatchers.IO) {
        mutex.withLock {
            val row = requireNotNull(dao.activeSession()) { "Treino não iniciado" }
            val session = decodeSession(row)
            val remaining = WearWorkoutDomain.remainingSeconds(
                session.timer,
                SystemClock.elapsedRealtime(),
                System.currentTimeMillis(),
                bootCount()
            )
            require(session.timer != null && remaining > 0) { "Descanso já terminou" }
            val updated = transform(session, remaining)
            dao.putSession(row.copy(
                state = updated.state.name,
                payload = ProtocolJson.encodeSession(updated),
                updatedAt = System.currentTimeMillis()
            ))
            updated.timer?.takeIf { it.running }?.let { RestTimerCoordinator.schedule(appContext, it) }
                ?: RestTimerCoordinator.cancel(appContext)
            refreshStateLocked()
        }
    }

    private fun endTimerLocked() {
        val row = dao.activeSession() ?: return
        val session = decodeSession(row)
        if (session.timer == null) return
        val updated = session.copy(state = SessionState.ACTIVE, timer = null)
        dao.putSession(row.copy(
            state = updated.state.name,
            payload = ProtocolJson.encodeSession(updated),
            updatedAt = System.currentTimeMillis()
        ))
        RestTimerCoordinator.cancel(appContext)
        refreshStateLocked()
        dao.activePlan()?.let(::decodePlan)?.let { plan ->
            WorkoutOngoingActivity.show(appContext, plan, updated, updated.completedSetIds.size)
        }
    }

    /**
     * Aplica o descanso publicado pelo telefone na sessão ativa do relógio.
     * Chamador deve estar com o mutex; agenda/cancela alarmes nativos.
     * Nunca mexe em timer próprio em execução (ver [WearWorkoutDomain.decidePhoneRest]).
     */
    private fun applyPhoneRestLocked(plan: WorkoutPlan, now: Long) {
        val row = dao.activeSession() ?: return
        val session = decodeSession(row)
        if (session.state == SessionState.FINISHED) return
        val adopted = preferences.getLong(ADOPTED_PHONE_REST_END, 0L)
        val action = WearWorkoutDomain.decidePhoneRest(
            localTimer = session.timer,
            adoptedPhoneEndWall = adopted,
            phoneRest = plan.phoneRest,
            nowWallClock = now,
            nowElapsedRealtime = android.os.SystemClock.elapsedRealtime(),
            currentBootCount = bootCount()
        )
        when (action) {
            is WearWorkoutDomain.PhoneRestAction.AdoptRunning -> {
                val timer = newTimer(action.remainingSeconds)
                dao.putSession(row.copy(
                    state = SessionState.RESTING.name,
                    payload = ProtocolJson.encodeSession(session.copy(state = SessionState.RESTING, timer = timer)),
                    updatedAt = now
                ))
                preferences.edit().putLong(ADOPTED_PHONE_REST_END, action.phoneEndWallMillis).apply()
                RestTimerCoordinator.schedule(appContext, timer)
                refreshStateLocked()
            }
            is WearWorkoutDomain.PhoneRestAction.AdoptPaused -> {
                val current = session.timer
                val duration = current?.durationSeconds
                    ?.takeIf { it > 0 }
                    ?: action.remainingSeconds
                val timer = RestTimerState(
                    running = false,
                    paused = true,
                    durationSeconds = duration.coerceIn(1, ProtocolLimits.MAX_REST_SECONDS),
                    remainingWhenPausedSeconds = action.remainingSeconds,
                    endElapsedRealtime = 0,
                    endWallClockMillis = 0,
                    bootCount = bootCount()
                )
                dao.putSession(row.copy(
                    state = SessionState.RESTING.name,
                    payload = ProtocolJson.encodeSession(session.copy(state = SessionState.RESTING, timer = timer)),
                    updatedAt = now
                ))
                preferences.edit().putLong(ADOPTED_PHONE_REST_END, ADOPTED_PAUSED).apply()
                RestTimerCoordinator.cancel(appContext)
                refreshStateLocked()
            }
            is WearWorkoutDomain.PhoneRestAction.CancelAdopted -> {
                val updated = session.copy(
                    state = SessionState.ACTIVE,
                    timer = null
                )
                dao.putSession(row.copy(
                    state = updated.state.name,
                    payload = ProtocolJson.encodeSession(updated),
                    updatedAt = now
                ))
                preferences.edit().putLong(ADOPTED_PHONE_REST_END, 0L).apply()
                RestTimerCoordinator.cancel(appContext)
                refreshStateLocked()
            }
            is WearWorkoutDomain.PhoneRestAction.Ignore -> {
                if (plan.phoneRest == null) {
                    preferences.edit().putLong(ADOPTED_PHONE_REST_END, 0L).apply()
                }
            }
        }
    }

    private fun restoreTimerLocked() {        val row = dao.activeSession() ?: return
        val session = decodeSession(row)
        val timer = session.timer ?: return
        if (timer.paused) {
            RestTimerCoordinator.cancel(appContext)
            return
        }
        val remaining = WearWorkoutDomain.remainingSeconds(
            timer,
            SystemClock.elapsedRealtime(),
            System.currentTimeMillis(),
            bootCount()
        )
        if (remaining <= 0) {
            endTimerLocked()
            return
        }
        val restored = if (timer.bootCount == bootCount()) timer else newTimer(remaining)
        if (restored != timer) {
            val updated = session.copy(timer = restored, state = SessionState.RESTING)
            dao.putSession(row.copy(
                state = updated.state.name,
                payload = ProtocolJson.encodeSession(updated),
                updatedAt = System.currentTimeMillis()
            ))
            refreshStateLocked()
        }
        RestTimerCoordinator.schedule(appContext, restored)
    }

    private fun newTimer(seconds: Int): RestTimerState {
        val safe = seconds.coerceIn(1, ProtocolLimits.MAX_REST_SECONDS)
        return RestTimerState(
            running = true,
            paused = false,
            durationSeconds = safe,
            remainingWhenPausedSeconds = safe,
            endElapsedRealtime = SystemClock.elapsedRealtime() + safe * 1000L,
            endWallClockMillis = System.currentTimeMillis() + safe * 1000L,
            bootCount = bootCount()
        )
    }

    private fun eventRow(event: WorkoutEvent, now: Long): WearEventEntity {
        val payload = ProtocolJson.encodeEvent(event)
        val eventHash = ProtocolJson.eventPayloadHash(event)
        val envelopeId = stableUuid("wear-envelope:${event.eventId}")
        val envelope = SyncEnvelope(
            envelopeId = envelopeId,
            origin = Origin.WEAR,
            originInstanceId = instanceId,
            createdAt = now,
            events = listOf(event)
        )
        val envelopePayload = ProtocolJson.encodeEnvelope(envelope)
        val setId = when (event) {
            is CompletedSetEvent -> event.setId
            is SetEditedEvent -> event.setId
            is SetUndoneEvent -> event.setId
            is SessionFinishedEvent -> null
        }
        return WearEventEntity(
            eventId = event.eventId,
            envelopeId = envelopeId,
            sessionId = event.sessionId,
            setId = setId,
            eventType = event.eventType.name,
            originSequence = event.originSequence,
            payload = payload,
            payloadHash = eventHash,
            envelopePayload = envelopePayload,
            state = EVENT_PENDING,
            attempts = 0,
            nextAttemptAt = now,
            createdAt = now,
            updatedAt = now,
            lastError = null
        )
    }

    private fun sessionRow(
        session: WorkoutSession,
        sequence: Long,
        finishedEventId: String?,
        active: Boolean,
        now: Long
    ) = WearSessionEntity(
        sessionId = session.sessionId,
        planId = session.planId,
        planRevision = session.planRevision.value,
        logicalDate = session.logicalDate,
        state = session.state.name,
        payload = ProtocolJson.encodeSession(session),
        originSequence = sequence,
        finishedEventId = finishedEventId,
        isActive = active,
        updatedAt = now
    )

    private fun ensureQueueCapacityLocked(envelopePayload: String) {
        val bytes = envelopePayload.toByteArray(StandardCharsets.UTF_8).size
        val queuedBytes = dao.pendingEnvelopePayloads().sumOf {
            it.toByteArray(StandardCharsets.UTF_8).size.toLong()
        }
        if (dao.pendingEventCount() >= MAX_QUEUE_ITEMS || queuedBytes + bytes > MAX_QUEUE_BYTES) {
            throw IllegalStateException("Fila offline cheia; conecte ao telefone antes de registrar outra série")
        }
    }

    private fun eventsLocked(sessionId: String): List<WorkoutEvent> = dao.eventsForSession(sessionId).map { row ->
        ProtocolJson.decodeEvent(row.payload)
    }

    private fun requireActivePlanLocked(): WorkoutPlan =
        requireNotNull(dao.activePlan()?.let(::decodePlan)) { "Nenhum plano ativo" }

    private fun refreshStateLocked() {
        try {
            val sessionRow = dao.activeSession()
            val session = sessionRow?.let(::decodeSession)
            val plan = dao.activePlan()?.let(::decodePlan)
            val finishedSessionIds = dao.finishedSessionIds().toSet()
            val waiting = WearWorkoutDomain.newestSessionPlan(
                dao.inactivePlans().map(::decodePlan)
                    .filter { candidate ->
                        candidate.sessionId != (session?.sessionId ?: plan?.sessionId) &&
                            candidate.sessionId !in finishedSessionIds
                    }
            )
            val eventRows = session?.let { dao.eventsForSession(it.sessionId) }.orEmpty()
            val events = eventRows.map { ProtocolJson.decodeEvent(it.payload) }
            val pending = dao.pendingEventCount()
            val previous = _state.value
            val planSetIds = plan?.let { p -> WearWorkoutDomain.orderedSets(p).map { it.setId }.toSet() }.orEmpty()
            val watchDone = plan?.let { p -> WearWorkoutDomain.replay(p, events).completedSetIds }.orEmpty()
            _state.value = WearRepositoryState(
                loading = false,
                plan = plan,
                waitingPlan = waiting,
                session = session,
                events = events,
                eventSyncStates = eventRows.associate { it.eventId to it.state },
                syncStatus = calculateSyncStatus(pending, previous.phoneReachable, syncing.get(), null),
                phoneReachable = previous.phoneReachable,
                pendingEvents = pending,
                hapticsEnabled = preferences.getBoolean(HAPTICS, true),
                lastError = null,
                phoneCompletedSetIds = (plan?.phoneCompletedSetIds.orEmpty() intersect planSetIds) - watchDone
            )
        } catch (error: Exception) {
            Log.e(TAG, "Local state rejected: ${safeMessage(error)}")
            setErrorLocked("Não foi possível restaurar o treino salvo.")
        }
    }

    private fun setErrorLocked(message: String) {
        val safe = message.take(ProtocolLimits.MAX_ERROR_STRING)
        Log.e(TAG, safe)
        _state.value = _state.value.copy(loading = false, syncStatus = SyncStatus.ERROR, lastError = safe)
    }

    private fun decodePlan(row: WearPlanEntity): WorkoutPlan = ProtocolJson.decodePlan(row.payload)
    private fun decodeSession(row: WearSessionEntity): WorkoutSession = ProtocolJson.decodeSession(row.payload)
    private fun planKey(plan: WorkoutPlan): String = "${plan.sessionId}:${plan.revision.value}"

    private fun bootCount(): Int = try {
        Settings.Global.getInt(appContext.contentResolver, Settings.Global.BOOT_COUNT)
    } catch (_: Exception) {
        0
    }

    private fun pokePhoneForPlan() {
        pokeReachablePhoneNodes(WearTransport.POKE_PATH)
    }

    private fun pokeReachablePhoneNodes(changedPath: String) {
        try {
            val capability = Tasks.await(
                Wearable.getCapabilityClient(appContext).getCapability(
                    WearTransport.PHONE_CAPABILITY,
                    CapabilityClient.FILTER_REACHABLE
                ),
                10,
                TimeUnit.SECONDS
            )
            val payload = changedPath.toByteArray(StandardCharsets.UTF_8)
            capability.nodes.forEach { node ->
                try {
                    Tasks.await(
                        Wearable.getMessageClient(appContext).sendMessage(node.id, WearTransport.POKE_PATH, payload),
                        10,
                        TimeUnit.SECONDS
                    )
                } catch (_: Exception) {
                    // Durable DataItems remain the source of truth.
                }
            }
        } catch (_: Exception) {
            // Offline is expected and not an error.
        }
    }

    private fun calculateSyncStatus(
        pending: Int,
        reachable: Boolean,
        isSyncing: Boolean,
        error: String?
    ): SyncStatus = when {
        error != null -> SyncStatus.ERROR
        pending >= MAX_QUEUE_ITEMS -> SyncStatus.QUEUE_FULL
        isSyncing -> SyncStatus.SYNCING
        pending == 0 -> SyncStatus.SYNCED
        !reachable -> SyncStatus.OFFLINE
        else -> SyncStatus.PENDING
    }

    private fun safeMessage(error: Throwable): String =
        (error.message ?: error.javaClass.simpleName).take(ProtocolLimits.MAX_ERROR_STRING)

    companion object {
        private const val TAG = "EvolucaoWearRepo"
        private const val PREFS = "evolucao_wear_v1"
        private const val INSTANCE_ID = "wear_instance_id"
        private const val HAPTICS = "haptics_enabled"
        /**
         * Deadline wall-clock do descanso do telefone adotado (0 = nenhum,
         * -1 = adotado pausado). Usado para atualizar/cancelar só adoções
         * intactas, sem tocar em timer mexido pelo usuário no relógio.
         */
        private const val ADOPTED_PHONE_REST_END = "adopted_phone_rest_end"
        private const val ADOPTED_PAUSED = -1L
        private const val IMMEDIATE_WORK = "evolucao-wear-outbox-now-v1"
        private const val PERIODIC_WORK = "evolucao-wear-outbox-periodic-v1"
        private const val EVENT_PENDING = "PENDING"
        private const val EVENT_RETRY = "RETRY"
        private const val EVENT_SENT = "SENT"
        private const val EVENT_RECEIVED = "RECEIVED"
        private const val EVENT_BLOCKED = "BLOCKED"
        private const val EVENT_ACKED = "ACKED"
        private const val EVENT_CONFLICT = "CONFLICT_STORED"
        private const val EVENT_REJECTED = "REJECTED"
        private const val MAX_QUEUE_ITEMS = 4096
        private const val MAX_QUEUE_BYTES = 8L * 1024L * 1024L
        private const val SENT_RETRY_MS = 15L * 60L * 1000L
        private const val RECEIVED_RETRY_MS = 6L * 60L * 60L * 1000L
        private const val BLOCKED_RETRY_MS = 15L * 60L * 1000L
        private val TERMINAL_EVENT_STATES = setOf(EVENT_ACKED, EVENT_CONFLICT, EVENT_REJECTED)

        @Volatile private var instance: WearWorkoutRepository? = null

        @JvmStatic fun get(context: Context): WearWorkoutRepository = instance ?: synchronized(this) {
            instance ?: WearWorkoutRepository(context).also { instance = it }
        }

        @JvmStatic fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

        @JvmStatic fun stableUuid(value: String): String = UUID.nameUUIDFromBytes(
            value.toByteArray(StandardCharsets.UTF_8)
        ).toString()
    }
}
