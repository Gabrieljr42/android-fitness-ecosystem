package com.evolucao.treino.wear.domain

import com.evolucao.treino.protocol.CompletedSetEvent
import com.evolucao.treino.protocol.ExercisePlan
import com.evolucao.treino.protocol.LoadMode
import com.evolucao.treino.protocol.Origin
import com.evolucao.treino.protocol.PlanRevision
import com.evolucao.treino.protocol.RestTimerState
import com.evolucao.treino.protocol.SetEditedEvent
import com.evolucao.treino.protocol.SetKind
import com.evolucao.treino.protocol.SetPrescription
import com.evolucao.treino.protocol.SetUndoneEvent
import com.evolucao.treino.protocol.WorkoutMode
import com.evolucao.treino.protocol.WorkoutPlan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class WearWorkoutDomainTest {
    private val sessionId = UUID.randomUUID().toString()
    private val planId = UUID.randomUUID().toString()
    private val instanceId = UUID.randomUUID().toString()
    private val unilateralSet = UUID.randomUUID().toString()
    private val warmupSet = UUID.randomUUID().toString()
    private val workSet = UUID.randomUUID().toString()
    private val secondExerciseSet = UUID.randomUUID().toString()

    private fun plan(mode: WorkoutMode = WorkoutMode.NORMAL): WorkoutPlan = WorkoutPlan(
        planId = planId,
        sessionId = sessionId,
        revision = PlanRevision(1),
        logicalDate = "2026-08-23",
        day = "A",
        name = "Treino A",
        generatedAt = 1_800_000_000_000,
        mode = mode,
        conservativeWarning = null,
        exercises = listOf(
            ExercisePlan(
                exerciseId = "ex_afundo",
                name = "Afundo",
                aliases = emptyList(),
                order = 0,
                restSeconds = 120,
                loadIncrementGrams = 2000,
                perSide = false,
                unilateral = true,
                targetRir = 2,
                prescriptions = listOf(
                    SetPrescription(unilateralSet, 0, SetKind.WORK, 8, 12, 20_000, 18_000, 10, 2)
                )
            ),
            ExercisePlan(
                exerciseId = "ex_supino",
                name = "Supino",
                aliases = listOf("Supino reto"),
                order = 1,
                restSeconds = 180,
                loadIncrementGrams = 2500,
                perSide = true,
                unilateral = false,
                targetRir = 2,
                prescriptions = listOf(
                    SetPrescription(warmupSet, 0, SetKind.WARMUP, 10, 12, 10_000, null, null, 3),
                    SetPrescription(workSet, 1, SetKind.WORK, 6, 10, 30_000, 28_000, 8, 2)
                )
            ),
            ExercisePlan(
                exerciseId = "ex_flexao",
                name = "Flexão",
                aliases = emptyList(),
                order = 2,
                restSeconds = 60,
                loadIncrementGrams = 1000,
                perSide = false,
                unilateral = false,
                targetRir = null,
                prescriptions = listOf(
                    SetPrescription(secondExerciseSet, 0, SetKind.WORK, 10, 20, 0, 0, 15, null)
                )
            )
        )
    )

    private fun complete(
        setId: String,
        exerciseId: String,
        sequence: Long,
        sides: Int = 1,
        load: Int = 20_000,
        reps: Int = 10,
        partials: Int = 0,
        rir: Int? = 2,
        kind: SetKind = SetKind.WORK,
        loadMode: LoadMode = LoadMode.EXTERNAL
    ) = CompletedSetEvent(
        eventId = UUID.randomUUID().toString(),
        sessionId = sessionId,
        planId = planId,
        planRevision = PlanRevision(1),
        logicalDate = "2026-08-23",
        occurredAt = 1_800_000_000_000 + sequence,
        createdAt = 1_800_000_000_000 + sequence,
        origin = Origin.WEAR,
        originInstanceId = instanceId,
        originSequence = sequence,
        exerciseId = exerciseId,
        setId = setId,
        setKind = kind,
        loadMode = loadMode,
        loadGrams = load,
        reps = reps,
        partialReps = partials,
        rir = rir,
        targetRir = rir,
        completedSides = sides
    )

    @Test fun `ordered plan keeps exercise and set progression`() {
        val ordered = WearWorkoutDomain.orderedSets(plan())
        assertEquals(listOf(unilateralSet, warmupSet, workSet, secondExerciseSet), ordered.map { it.setId })
        assertEquals(3, ordered.last().globalIndex)
    }

    @Test fun `older revision cannot replace newer revision even with later timestamp`() {
        val current = plan().copy(revision = PlanRevision(3), generatedAt = 2_000)
        val delayedOld = plan().copy(revision = PlanRevision(2), generatedAt = 3_000)
        assertFalse(WearWorkoutDomain.shouldActivatePlan(delayedOld, current, null))
    }

    @Test fun `old session arriving after a newer session remains waiting`() {
        val oldSession = plan().copy(sessionId = "10000000-0000-4000-8000-000000000001", generatedAt = 1_000)
        val newSession = plan().copy(sessionId = "20000000-0000-4000-8000-000000000002", generatedAt = 2_000)
        assertTrue(WearWorkoutDomain.shouldActivatePlan(newSession, oldSession, null))
        assertFalse(WearWorkoutDomain.shouldActivatePlan(oldSession, newSession, null))
    }

    @Test fun `active workout pins other sessions and accepts only its newer revision`() {
        val active = plan().copy(revision = PlanRevision(2))
        val other = plan().copy(
            sessionId = "30000000-0000-4000-8000-000000000003",
            generatedAt = active.generatedAt + 10_000
        )
        assertFalse(WearWorkoutDomain.shouldActivatePlan(other, active, active.sessionId))
        assertTrue(
            WearWorkoutDomain.shouldActivatePlan(
                active.copy(revision = PlanRevision(3)),
                active,
                active.sessionId
            )
        )
    }

    @Test fun `waiting plan selection prefers revision before timestamp within a session`() {
        val staleRevision = plan().copy(revision = PlanRevision(1), generatedAt = 9_000)
        val currentRevision = plan().copy(revision = PlanRevision(2), generatedAt = 8_000)
        assertEquals(
            2,
            WearWorkoutDomain.newestSessionPlan(listOf(staleRevision, currentRevision))?.revision?.value
        )
    }

    @Test fun `finished session never becomes active again`() {
        val finished = plan()
        val newerRevision = finished.copy(revision = PlanRevision(2), generatedAt = finished.generatedAt + 1)

        assertFalse(
            WearWorkoutDomain.shouldActivatePlan(
                newerRevision,
                null,
                null,
                setOf(finished.sessionId)
            )
        )
        assertFalse(
            WearWorkoutDomain.shouldActivatePlan(
                newerRevision,
                finished,
                finished.sessionId,
                setOf(finished.sessionId)
            )
        )
    }

    @Test fun `weight reps partials and rir survive replay`() {
        val event = complete(workSet, "ex_supino", 1, load = 32_500, reps = 8, partials = 2, rir = 1)
        val values = WearWorkoutDomain.replay(plan(), listOf(event)).heads.getValue(workSet)
        assertEquals(32_500, values.loadGrams)
        assertEquals(8, values.reps)
        assertEquals(2, values.partialReps)
        assertEquals(1, values.rir)
    }

    @Test fun `unilateral first side is not a completed set`() {
        val sideOne = complete(unilateralSet, "ex_afundo", 1, sides = 1)
        val replay = WearWorkoutDomain.replay(plan(), listOf(sideOne))
        assertFalse(unilateralSet in replay.completedSetIds)
        assertEquals(30, WearWorkoutDomain.restSeconds(WearWorkoutDomain.orderedSets(plan()).first(), 1, true))
    }

    @Test fun `unilateral edit completing side two advances set`() {
        val sideOne = complete(unilateralSet, "ex_afundo", 1, sides = 1)
        val sideTwo = SetEditedEvent(
            eventId = UUID.randomUUID().toString(), sessionId = sessionId, planId = planId,
            planRevision = PlanRevision(1), logicalDate = "2026-08-23",
            occurredAt = 1_800_000_000_002, createdAt = 1_800_000_000_002,
            origin = Origin.WEAR, originInstanceId = instanceId, originSequence = 2,
            exerciseId = "ex_afundo", setId = unilateralSet, baseEventId = sideOne.eventId,
            setKind = SetKind.WORK, loadMode = LoadMode.EXTERNAL, loadGrams = 20_000,
            reps = 10, partialReps = 0, rir = 2, targetRir = 2, completedSides = 2
        )
        val replay = WearWorkoutDomain.replay(plan(), listOf(sideTwo, sideOne))
        assertTrue(unilateralSet in replay.completedSetIds)
        assertEquals(warmupSet, WearWorkoutDomain.nextIncomplete(plan(), unilateralSet, replay.completedSetIds)?.setId)
    }

    @Test fun `warmup rest is half and work rest is full`() {
        val ordered = WearWorkoutDomain.orderedSets(plan())
        assertEquals(90, WearWorkoutDomain.restSeconds(ordered[1], 1, true))
        assertEquals(180, WearWorkoutDomain.restSeconds(ordered[2], 1, true))
        assertEquals(0, WearWorkoutDomain.restSeconds(ordered.last(), 1, false))
    }

    @Test fun `undo removes an already synchronized head without deleting history`() {
        val completed = complete(workSet, "ex_supino", 1)
        val undone = SetUndoneEvent(
            eventId = UUID.randomUUID().toString(), sessionId = sessionId, planId = planId,
            planRevision = PlanRevision(1), logicalDate = "2026-08-23",
            occurredAt = 1_800_000_000_002, createdAt = 1_800_000_000_002,
            origin = Origin.WEAR, originInstanceId = instanceId, originSequence = 2,
            exerciseId = "ex_supino", setId = workSet, baseEventId = completed.eventId,
            reason = "USER_UNDO"
        )
        val replay = WearWorkoutDomain.replay(plan(), listOf(completed, undone))
        assertFalse(workSet in replay.completedSetIds)
        assertNull(replay.heads[workSet])
    }

    @Test fun `volume accounts for per-side and unilateral but excludes bodyweight zero`() {
        val unilateral = complete(unilateralSet, "ex_afundo", 1, sides = 2, load = 20_000, reps = 10)
        val bilateralPerSide = complete(workSet, "ex_supino", 2, load = 30_000, reps = 8)
        val bodyweight = complete(
            secondExerciseSet, "ex_flexao", 3, load = 0, reps = 15, rir = null,
            loadMode = LoadMode.BODYWEIGHT
        )
        assertEquals(880_000L, WearWorkoutDomain.totalVolumeGrams(plan(), listOf(unilateral, bilateralPerSide, bodyweight)))
    }

    @Test fun `short mode never expands hidden sets`() {
        val shortPlan = plan(WorkoutMode.SHORT).copy(
            exercises = plan().exercises.map { exercise ->
                exercise.copy(prescriptions = exercise.prescriptions.take(1))
            }
        )
        assertEquals(WorkoutMode.SHORT, shortPlan.mode)
        assertEquals(3, WearWorkoutDomain.orderedSets(shortPlan).size)
    }

    @Test fun `timer uses monotonic deadline on same boot`() {
        val timer = RestTimerState(true, false, 60, 60, 160_000, 1_060_000, 7)
        assertEquals(30, WearWorkoutDomain.remainingSeconds(timer, 130_000, 9_999_999, 7))
    }

    @Test fun `timer falls back to wall deadline after reboot`() {
        val timer = RestTimerState(true, false, 60, 60, 160_000, 1_060_000, 7)
        assertEquals(20, WearWorkoutDomain.remainingSeconds(timer, 2_000, 1_040_000, 8))
    }

    @Test fun `paused timer keeps its persisted remainder`() {
        val timer = RestTimerState(false, true, 60, 17, 0, 0, 7)
        assertEquals(17, WearWorkoutDomain.remainingSeconds(timer, Long.MAX_VALUE, Long.MAX_VALUE, 99))
    }

    @Test fun `advance skips completed sets and reaches next exercise`() {
        val first = complete(unilateralSet, "ex_afundo", 1, sides = 2)
        val warmup = complete(warmupSet, "ex_supino", 2, kind = SetKind.WARMUP)
        val replay = WearWorkoutDomain.replay(plan(), listOf(first, warmup))
        assertEquals(workSet, WearWorkoutDomain.firstIncomplete(plan(), replay.completedSetIds)?.setId)
        assertEquals("ex_flexao", WearWorkoutDomain.nextExercise(plan(), "ex_supino")?.exerciseId)
    }

    @Test fun `effectiveCompleted unions phone sets and ignores unknown ids`() {
        val p = plan().copy(phoneCompletedSetIds = setOf(workSet, "00000000-0000-4000-8000-00000000ffff"))
        val effective = WearWorkoutDomain.effectiveCompleted(p, setOf(unilateralSet))
        assertEquals(setOf(unilateralSet, workSet), effective)
        assertEquals(workSet, WearWorkoutDomain.firstIncomplete(p, setOf(unilateralSet, warmupSet))?.setId)
    }

    @Test fun `effectiveCompleted without phone progress is identity`() {
        val watch = setOf(workSet)
        assertEquals(watch, WearWorkoutDomain.effectiveCompleted(plan(), watch))
    }

    @Test fun `phone rest is adopted when watch has no timer`() {
        val phoneRest = RestTimerState(true, false, 90, 90, 0, 2_000_000, 3)
        val action = WearWorkoutDomain.decidePhoneRest(null, 0L, phoneRest, 1_950_000, 500_000, 7)
        assertTrue(action is WearWorkoutDomain.PhoneRestAction.AdoptRunning)
        assertEquals(50, (action as WearWorkoutDomain.PhoneRestAction.AdoptRunning).remainingSeconds)
    }

    @Test fun `own running timer is never replaced by phone rest`() {
        val own = RestTimerState(true, false, 90, 90, 600_000, 2_100_000, 7)
        val phoneRest = RestTimerState(true, false, 90, 90, 0, 2_050_000, 3)
        assertEquals(
            WearWorkoutDomain.PhoneRestAction.Ignore,
            WearWorkoutDomain.decidePhoneRest(own, 0L, phoneRest, 1_900_000, 550_000, 7)
        )
    }

    @Test fun `pristine adoption refreshes to the new phone deadline`() {
        val adopted = RestTimerState(true, false, 90, 90, 600_000, 2_100_000, 7)
        val phoneRest = RestTimerState(true, false, 120, 120, 0, 2_130_000, 3)
        val action = WearWorkoutDomain.decidePhoneRest(adopted, 2_100_000, phoneRest, 1_900_000, 550_000, 7)
        assertTrue(action is WearWorkoutDomain.PhoneRestAction.AdoptRunning)
        assertEquals(2_130_000L, (action as WearWorkoutDomain.PhoneRestAction.AdoptRunning).phoneEndWallMillis)
    }

    @Test fun `expired phone rest never cancels an adopted timer about to fire`() {
        val adopted = RestTimerState(true, false, 90, 90, 600_000, 2_100_000, 7)
        assertEquals(
            WearWorkoutDomain.PhoneRestAction.Ignore,
            WearWorkoutDomain.decidePhoneRest(adopted, 2_100_000, null, 2_098_000, 700_000, 7)
        )
        assertEquals(
            WearWorkoutDomain.PhoneRestAction.CancelAdopted,
            WearWorkoutDomain.decidePhoneRest(adopted, 2_100_000, null, 2_000_000, 500_000, 7)
        )
    }

    @Test fun `paused phone rest is adopted when idle`() {
        val paused = RestTimerState(false, true, 90, 42, 0, 0, 3)
        val action = WearWorkoutDomain.decidePhoneRest(null, 0L, paused, 1_950_000, 500_000, 7)
        assertTrue(action is WearWorkoutDomain.PhoneRestAction.AdoptPaused)
        assertEquals(42, (action as WearWorkoutDomain.PhoneRestAction.AdoptPaused).remainingSeconds)
    }
}
