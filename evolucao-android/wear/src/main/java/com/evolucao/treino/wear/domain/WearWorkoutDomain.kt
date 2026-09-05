package com.evolucao.treino.wear.domain

import com.evolucao.treino.protocol.CompletedSetEvent
import com.evolucao.treino.protocol.EventReconciler
import com.evolucao.treino.protocol.ExercisePlan
import com.evolucao.treino.protocol.RestTimerState
import com.evolucao.treino.protocol.SetEditedEvent
import com.evolucao.treino.protocol.SetKind
import com.evolucao.treino.protocol.SetUndoneEvent
import com.evolucao.treino.protocol.WorkoutEvent
import com.evolucao.treino.protocol.WorkoutPlan
import kotlin.math.ceil

data class PlannedSet(
    val exercise: ExercisePlan,
    val setId: String,
    val setIndex: Int,
    val globalIndex: Int
)

data class SetValues(
    val eventId: String,
    val loadGrams: Int,
    val reps: Int,
    val partialReps: Int,
    val rir: Int?,
    val targetRir: Int?,
    val completedSides: Int,
    val setKind: SetKind
)

data class WorkoutReplay(
    val heads: Map<String, SetValues>,
    val completedSetIds: Set<String>,
    val blockedEventIds: Set<String>,
    val conflictEventIds: Set<String>
)

object WearWorkoutDomain {
    fun newestSessionPlan(plans: List<WorkoutPlan>): WorkoutPlan? = plans
        .groupBy { it.sessionId }
        .mapNotNull { (_, revisions) ->
            revisions.maxWithOrNull(
                compareBy<WorkoutPlan> { it.revision.value }
                    .thenBy { it.generatedAt }
                    .thenBy { it.planId }
            )
        }
        .maxWithOrNull(
            compareBy<WorkoutPlan> { it.generatedAt }
                .thenBy { it.sessionId }
        )

    fun shouldActivatePlan(
        incoming: WorkoutPlan,
        activePlan: WorkoutPlan?,
        activeSessionId: String?,
        finishedSessionIds: Set<String> = emptySet()
    ): Boolean {
        if (incoming.sessionId in finishedSessionIds) return false
        if (activeSessionId != null) {
            if (incoming.sessionId != activeSessionId) return false
            if (activePlan == null || activePlan.sessionId != activeSessionId) return true
            return incoming.revision.value > activePlan.revision.value
        }
        activePlan ?: return true
        if (incoming.sessionId == activePlan.sessionId) {
            return incoming.revision.value > activePlan.revision.value
        }
        return incoming.generatedAt > activePlan.generatedAt ||
            (incoming.generatedAt == activePlan.generatedAt && incoming.sessionId > activePlan.sessionId)
    }

    fun orderedSets(plan: WorkoutPlan): List<PlannedSet> {
        var global = 0
        return plan.exercises.sortedBy { it.order }.flatMap { exercise ->
            exercise.prescriptions.sortedBy { it.index }.map { prescription ->
                PlannedSet(exercise, prescription.setId, prescription.index, global++)
            }
        }
    }

    fun replay(plan: WorkoutPlan, events: List<WorkoutEvent>): WorkoutReplay {
        val reconciler = EventReconciler()
        events.sortedWith(compareBy<WorkoutEvent>({ it.originSequence }, { it.occurredAt }, { it.eventId }))
            .forEach(reconciler::submit)
        val heads = linkedMapOf<String, SetValues>()
        val completed = linkedSetOf<String>()
        orderedSets(plan).forEach { planned ->
            val event = reconciler.headEvent(planned.setId)
            val values = event?.toSetValues()
            if (values != null) {
                heads[planned.setId] = values
                val requiredSides = if (planned.exercise.unilateral) 2 else 1
                if (values.completedSides >= requiredSides) completed += planned.setId
            }
        }
        return WorkoutReplay(
            heads = heads,
            completedSetIds = completed,
            blockedEventIds = reconciler.blockedEventIds(),
            conflictEventIds = reconciler.conflictEventIds()
        )
    }

    fun plannedSet(plan: WorkoutPlan, setId: String?): PlannedSet? =
        setId?.let { id -> orderedSets(plan).firstOrNull { it.setId == id } }

    fun firstIncomplete(plan: WorkoutPlan, completed: Set<String>): PlannedSet? =
        orderedSets(plan).firstOrNull { it.setId !in completed }

    /**
     * Progresso efetivo: eventos próprios do relógio + séries concluídas no
     * telefone (interseção com as prescrições do plano; IDs desconhecidos
     * são ignorados em vez de travar o cursor).
     */
    fun effectiveCompleted(plan: WorkoutPlan, watchCompleted: Set<String>): Set<String> {
        if (plan.phoneCompletedSetIds.isEmpty()) return watchCompleted
        val planSetIds = orderedSets(plan).map { it.setId }.toSet()
        return watchCompleted + (plan.phoneCompletedSetIds intersect planSetIds)
    }

    sealed interface PhoneRestAction {
        data object Ignore : PhoneRestAction
        data class AdoptRunning(val remainingSeconds: Int, val phoneEndWallMillis: Long) : PhoneRestAction
        data class AdoptPaused(val remainingSeconds: Int) : PhoneRestAction
        data object CancelAdopted : PhoneRestAction
    }

    /**
     * Decide o que fazer com o descanso publicado pelo telefone.
     *
     * @param adoptedPhoneEndWall pref local: 0 = nenhuma adoção, -1 = adotado
     * pausado, >0 = endWallClock adotado em execução.
     *
     * Regras: descanso próprio em execução nunca é substituído por outro
     * deadline (só atualiza adoção intacta); pausa/cancelamento do telefone
     * só tocam adoção intacta; cancelamento às vésperas do disparo é
     * ignorado para o alarme local disparar sozinho.
     */
    fun decidePhoneRest(
        localTimer: RestTimerState?,
        adoptedPhoneEndWall: Long,
        phoneRest: RestTimerState?,
        nowWallClock: Long,
        nowElapsedRealtime: Long,
        currentBootCount: Int
    ): PhoneRestAction {
        val localRemaining = remainingSeconds(localTimer, nowElapsedRealtime, nowWallClock, currentBootCount)
        val localRunning = localTimer?.running == true && localTimer.paused.not() && localRemaining > 0
        if (phoneRest != null && phoneRest.running && !phoneRest.paused) {
            val remaining = ((phoneRest.endWallClockMillis - nowWallClock + 999) / 1000).toInt()
                .coerceAtLeast(0)
            if (remaining <= 0) return PhoneRestAction.Ignore
            if (!localRunning) return PhoneRestAction.AdoptRunning(remaining, phoneRest.endWallClockMillis)
            if (adoptedPhoneEndWall > 0 && localTimer?.endWallClockMillis == adoptedPhoneEndWall &&
                adoptedPhoneEndWall != phoneRest.endWallClockMillis
            ) {
                return PhoneRestAction.AdoptRunning(remaining, phoneRest.endWallClockMillis)
            }
            return PhoneRestAction.Ignore
        }
        if (phoneRest != null && phoneRest.paused) {
            val remaining = phoneRest.remainingWhenPausedSeconds.coerceAtLeast(0)
            if (remaining <= 0) return PhoneRestAction.Ignore
            if (!localRunning) return PhoneRestAction.AdoptPaused(remaining)
            if (adoptedPhoneEndWall != 0L && localTimer?.endWallClockMillis == adoptedPhoneEndWall) {
                return PhoneRestAction.AdoptPaused(remaining)
            }
            return PhoneRestAction.Ignore
        }
        if (adoptedPhoneEndWall > 0 && localRunning && localTimer?.endWallClockMillis == adoptedPhoneEndWall) {
            if (adoptedPhoneEndWall - nowWallClock > 5_000) return PhoneRestAction.CancelAdopted
        }
        return PhoneRestAction.Ignore
    }

    fun nextIncomplete(plan: WorkoutPlan, currentSetId: String?, completed: Set<String>): PlannedSet? {
        val ordered = orderedSets(plan)
        val currentIndex = ordered.indexOfFirst { it.setId == currentSetId }.coerceAtLeast(-1)
        return ordered.drop(currentIndex + 1).firstOrNull { it.setId !in completed }
            ?: ordered.take(currentIndex + 1).firstOrNull { it.setId !in completed }
    }

    fun previousExercise(plan: WorkoutPlan, exerciseId: String?): ExercisePlan? {
        val exercises = plan.exercises.sortedBy { it.order }
        val index = exercises.indexOfFirst { it.exerciseId == exerciseId }
        return if (index > 0) exercises[index - 1] else null
    }

    fun nextExercise(plan: WorkoutPlan, exerciseId: String?): ExercisePlan? {
        val exercises = plan.exercises.sortedBy { it.order }
        val index = exercises.indexOfFirst { it.exerciseId == exerciseId }
        return if (index in 0 until exercises.lastIndex) exercises[index + 1] else null
    }

    fun firstIncompleteInExercise(
        plan: WorkoutPlan,
        exerciseId: String,
        completed: Set<String>
    ): PlannedSet? = orderedSets(plan).firstOrNull {
        it.exercise.exerciseId == exerciseId && it.setId !in completed
    } ?: orderedSets(plan).firstOrNull { it.exercise.exerciseId == exerciseId }

    fun latestUndoable(plan: WorkoutPlan, events: List<WorkoutEvent>): PlannedSet? {
        val replay = replay(plan, events)
        val latestSetId = replay.heads.values.maxByOrNull { values ->
            events.firstOrNull { it.eventId == values.eventId }?.originSequence ?: Long.MIN_VALUE
        }?.let { values -> replay.heads.entries.firstOrNull { it.value.eventId == values.eventId }?.key }
        return plannedSet(plan, latestSetId)
    }

    fun totalVolumeGrams(plan: WorkoutPlan, events: List<WorkoutEvent>): Long {
        val replay = replay(plan, events)
        return orderedSets(plan).sumOf { planned ->
            val values = replay.heads[planned.setId] ?: return@sumOf 0L
            if (planned.setId !in replay.completedSetIds) return@sumOf 0L
            val multiplier = when {
                planned.exercise.unilateral -> 2L
                planned.exercise.perSide -> 2L
                else -> 1L
            }
            values.loadGrams.toLong() * values.reps.toLong() * multiplier
        }
    }

    fun restSeconds(planned: PlannedSet, completedSides: Int, hasNextSet: Boolean): Int {
        if (!hasNextSet) return 0
        if (planned.exercise.unilateral && completedSides < 2) return 30
        val prescription = planned.exercise.prescriptions.first { it.setId == planned.setId }
        return if (prescription.kind == SetKind.WARMUP) planned.exercise.restSeconds / 2 else planned.exercise.restSeconds
    }

    fun remainingSeconds(
        timer: RestTimerState?,
        nowElapsedRealtime: Long,
        nowWallClock: Long,
        currentBootCount: Int
    ): Int {
        timer ?: return 0
        if (timer.paused) return timer.remainingWhenPausedSeconds.coerceAtLeast(0)
        if (!timer.running) return 0
        val remainingMillis = if (timer.bootCount == currentBootCount && timer.endElapsedRealtime > 0) {
            timer.endElapsedRealtime - nowElapsedRealtime
        } else {
            timer.endWallClockMillis - nowWallClock
        }
        return ceil(remainingMillis / 1000.0).toInt().coerceAtLeast(0)
    }

    private fun WorkoutEvent.toSetValues(): SetValues? = when (this) {
        is CompletedSetEvent -> SetValues(
            eventId, loadGrams, reps, partialReps, rir, targetRir, completedSides, setKind
        )
        is SetEditedEvent -> SetValues(
            eventId, loadGrams, reps, partialReps, rir, targetRir, completedSides, setKind
        )
        is SetUndoneEvent -> null
        else -> null
    }
}
