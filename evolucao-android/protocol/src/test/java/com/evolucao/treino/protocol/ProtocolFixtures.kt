package com.evolucao.treino.protocol

internal object ProtocolFixtures {
    const val PLAN_ID = "00000000-0000-4000-8000-000000000001"
    const val SESSION_ID = "00000000-0000-4000-8000-000000000002"
    const val INSTANCE_PHONE = "00000000-0000-4000-8000-000000000003"
    const val INSTANCE_WEAR = "00000000-0000-4000-8000-000000000004"
    const val SET_ID = "00000000-0000-4000-8000-000000000005"
    const val SET_ID_2 = "00000000-0000-4000-8000-000000000006"
    const val EVENT_1 = "00000000-0000-4000-8000-000000000011"
    const val EVENT_2 = "00000000-0000-4000-8000-000000000012"
    const val EVENT_3 = "00000000-0000-4000-8000-000000000013"
    const val EVENT_4 = "00000000-0000-4000-8000-000000000014"
    const val ENVELOPE_ID = "00000000-0000-4000-8000-000000000021"
    const val ACK_ID = "00000000-0000-4000-8000-000000000022"

    fun plan(name: String = "Treino A"): WorkoutPlan = WorkoutPlan(
        planId = PLAN_ID,
        sessionId = SESSION_ID,
        revision = PlanRevision(1),
        logicalDate = "2026-08-23",
        day = "A",
        name = name,
        generatedAt = 1_777_000_000_000,
        mode = WorkoutMode.NORMAL,
        conservativeWarning = null,
        exercises = listOf(
            ExercisePlan(
                exerciseId = "ex_supino-reto-c-halteres",
                name = "Supino reto c/ halteres",
                aliases = listOf("Supino reto"),
                order = 0,
                restSeconds = 120,
                loadIncrementGrams = 2_000,
                perSide = false,
                unilateral = false,
                targetRir = 2,
                prescriptions = listOf(
                    SetPrescription(SET_ID, 0, SetKind.WARMUP, 10, 12, 20_000, 20_000, 12, 3),
                    SetPrescription(SET_ID_2, 1, SetKind.WORK, 8, 10, 30_000, 28_000, 9, 2)
                )
            )
        )
    )

    fun completed(
        eventId: String = EVENT_1,
        setId: String = SET_ID,
        origin: Origin = Origin.WEAR,
        originSequence: Long = 1,
        reps: Int = 10,
        loadMode: LoadMode = LoadMode.EXTERNAL,
        loadGrams: Int = 30_000
    ): CompletedSetEvent = CompletedSetEvent(
        eventId = eventId,
        sessionId = SESSION_ID,
        planId = PLAN_ID,
        planRevision = PlanRevision(1),
        logicalDate = "2026-08-23",
        occurredAt = 1_777_000_010_000,
        createdAt = 1_777_000_010_100,
        origin = origin,
        originInstanceId = if (origin == Origin.WEAR) INSTANCE_WEAR else INSTANCE_PHONE,
        originSequence = originSequence,
        exerciseId = "ex_supino-reto-c-halteres",
        setId = setId,
        setKind = SetKind.WORK,
        loadMode = loadMode,
        loadGrams = loadGrams,
        reps = reps,
        partialReps = 0,
        rir = 2,
        targetRir = 2,
        completedSides = 1
    )

    fun edited(
        eventId: String = EVENT_2,
        baseEventId: String = EVENT_1,
        setId: String = SET_ID,
        origin: Origin = Origin.WEAR,
        originSequence: Long = 2
    ): SetEditedEvent = SetEditedEvent(
        eventId = eventId,
        sessionId = SESSION_ID,
        planId = PLAN_ID,
        planRevision = PlanRevision(1),
        logicalDate = "2026-08-23",
        occurredAt = 1_777_000_020_000,
        createdAt = 1_777_000_020_100,
        origin = origin,
        originInstanceId = if (origin == Origin.WEAR) INSTANCE_WEAR else INSTANCE_PHONE,
        originSequence = originSequence,
        exerciseId = "ex_supino-reto-c-halteres",
        setId = setId,
        baseEventId = baseEventId,
        setKind = SetKind.WORK,
        loadMode = LoadMode.EXTERNAL,
        loadGrams = 32_000,
        reps = 9,
        partialReps = 1,
        rir = 1,
        targetRir = 2,
        completedSides = 1
    )
}
