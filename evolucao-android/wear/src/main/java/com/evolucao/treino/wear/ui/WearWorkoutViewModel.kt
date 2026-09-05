package com.evolucao.treino.wear.ui

import android.app.Application
import android.os.SystemClock
import android.provider.Settings
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.evolucao.treino.protocol.LoadMode
import com.evolucao.treino.protocol.ProtocolLimits
import com.evolucao.treino.protocol.SessionState
import com.evolucao.treino.protocol.SetKind
import com.evolucao.treino.protocol.SyncStatus
import com.evolucao.treino.wear.data.SetInput
import com.evolucao.treino.wear.data.WearRepositoryState
import com.evolucao.treino.wear.data.WearWorkoutRepository
import com.evolucao.treino.wear.domain.WearWorkoutDomain
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.math.RoundingMode

enum class WearScreen { TODAY, WORKOUT, REST, SUMMARY }
enum class ConfirmAction { NONE, LEAVE, UNDO, FINISH }

data class SetEditorState(
    val setId: String? = null,
    val loadMode: LoadMode = LoadMode.EXTERNAL,
    val loadGrams: Int = 0,
    val reps: Int = 1,
    val partialReps: Int = 0,
    val rir: Int? = null,
    val previousLoadGrams: Int? = null,
    val previousReps: Int? = null,
    val previousRir: Int? = null
)

data class ExerciseRowUi(
    val exerciseId: String,
    val name: String,
    val completedSets: Int,
    val totalSets: Int
)

data class WearWorkoutUiState(
    val loading: Boolean = true,
    val screen: WearScreen = WearScreen.TODAY,
    val title: String = "Treino de hoje",
    val logicalDate: String = "",
    val exerciseRows: List<ExerciseRowUi> = emptyList(),
    val totalExercises: Int = 0,
    val totalSets: Int = 0,
    val completedSets: Int = 0,
    val currentExerciseName: String = "",
    val currentExerciseId: String? = null,
    val currentSetId: String? = null,
    val currentSetNumber: Int = 0,
    val currentExerciseSetCount: Int = 0,
    val globalSetNumber: Int = 0,
    val setKindLabel: String = "",
    val repsTargetLabel: String = "",
    val suggestionLabel: String? = null,
    val targetRir: Int? = null,
    val nextExerciseName: String? = null,
    val unilateralSide: Int? = null,
    val editor: SetEditorState = SetEditorState(),
    val loadIncrementGrams: Int = 1000,
    val timerRemainingSeconds: Int = 0,
    val timerPaused: Boolean = false,
    val durationSeconds: Int = 0,
    val volumeGrams: Long = 0,
    val incompleteSets: Int = 0,
    val syncStatus: SyncStatus = SyncStatus.OFFLINE,
    val syncLabel: String = "Offline",
    val pendingEvents: Int = 0,
    val phoneReachable: Boolean = false,
    val waitingPlan: Boolean = false,
    val conservativeWarning: String? = null,
    val hapticsEnabled: Boolean = true,
    val canUndo: Boolean = false,
    val canPreviousExercise: Boolean = false,
    val canNextExercise: Boolean = false,
    val ambient: Boolean = false,
    val confirmation: ConfirmAction = ConfirmAction.NONE,
    val error: String? = null,
    val finished: Boolean = false
)

private data class ViewControls(
    val editor: SetEditorState,
    val forceToday: Boolean,
    val confirmation: ConfirmAction,
    val ambient: Boolean,
    val actionError: String?
)

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class WearWorkoutViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = WearWorkoutRepository.get(application)
    private val editor = MutableStateFlow(SetEditorState())
    private val forceToday = MutableStateFlow(false)
    private val confirmation = MutableStateFlow(ConfirmAction.NONE)
    private val ambient = MutableStateFlow(false)
    private val actionError = MutableStateFlow<String?>(null)

    private val timerRemaining = combine(
        repository.state.map { it.session?.timer }.distinctUntilChanged(),
        ambient
    ) { timer, isAmbient -> timer to isAmbient }
        .flatMapLatest { (timer, isAmbient) ->
            flow {
                if (timer == null) {
                    emit(0)
                } else if (timer.paused) {
                    emit(timer.remainingWhenPausedSeconds)
                } else {
                    while (true) {
                        val remaining = WearWorkoutDomain.remainingSeconds(
                            timer,
                            SystemClock.elapsedRealtime(),
                            System.currentTimeMillis(),
                            bootCount()
                        )
                        emit(remaining)
                        if (remaining <= 0) {
                            repository.onTimerExpired()
                            break
                        }
                        delay(if (isAmbient) 60_000L else 500L)
                    }
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    private val duration = combine(
        repository.state.map { it.session }.distinctUntilChanged(),
        ambient
    ) { session, isAmbient -> session to isAmbient }
        .flatMapLatest { (session, isAmbient) ->
            flow {
                if (session?.startedAt == null) {
                    emit(0)
                } else {
                    val startedAt = requireNotNull(session.startedAt)
                    while (true) {
                        val end = session.finishedAt ?: System.currentTimeMillis()
                        emit(((end - startedAt) / 1000L).coerceAtLeast(0L).toInt())
                        if (session.finishedAt != null) break
                        delay(if (isAmbient) 60_000L else 1_000L)
                    }
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    private val controls = combine(editor, forceToday, confirmation, ambient, actionError) {
            editorValue, forceTodayValue, confirmValue, ambientValue, errorValue ->
        ViewControls(editorValue, forceTodayValue, confirmValue, ambientValue, errorValue)
    }

    val uiState: StateFlow<WearWorkoutUiState> = combine(
        repository.state,
        controls,
        timerRemaining,
        duration
    ) { repositoryState, viewControls, remaining, durationSeconds ->
        buildUiState(repositoryState, viewControls, remaining, durationSeconds)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), WearWorkoutUiState())

    init {
        viewModelScope.launch {
            repository.state.map { state ->
                Triple(state.plan, state.session?.currentSetId, state.session?.unilateralPendingSetId)
            }.distinctUntilChanged().collect { (plan, setId, unilateralPending) ->
                if (plan == null || setId == null) return@collect
                if (editor.value.setId != setId || unilateralPending == setId) {
                    editor.value = initialEditor(repository.state.value, setId)
                }
            }
        }
    }

    fun startOrContinue() {
        forceToday.value = false
        launchAction { repository.startWorkout() }
    }

    fun completeSet() {
        val value = editor.value
        launchAction {
            repository.completeCurrentSet(
                SetInput(
                    loadMode = value.loadMode,
                    loadGrams = if (value.loadMode == LoadMode.BODYWEIGHT) 0 else value.loadGrams,
                    reps = value.reps,
                    partialReps = value.partialReps,
                    rir = value.rir
                )
            )
        }
    }

    fun changeLoad(direction: Int) {
        val increment = uiState.value.loadIncrementGrams.coerceAtLeast(1)
        editor.value = editor.value.copy(
            loadGrams = (editor.value.loadGrams + direction * increment)
                .coerceIn(0, ProtocolLimits.MAX_LOAD_GRAMS),
            loadMode = if (editor.value.loadMode == LoadMode.BODYWEIGHT) LoadMode.EXTERNAL else editor.value.loadMode
        )
    }

    fun setLoadText(value: String): Boolean {
        val kg = value.trim().replace(',', '.').toBigDecimalOrNull() ?: return false
        if (kg < BigDecimal.ZERO || kg > BigDecimal(500)) return false
        val grams = kg.multiply(BigDecimal(1000)).setScale(0, RoundingMode.HALF_UP).toInt()
        editor.value = editor.value.copy(loadGrams = grams, loadMode = LoadMode.EXTERNAL)
        return true
    }

    fun toggleBodyweight() {
        editor.value = if (editor.value.loadMode == LoadMode.BODYWEIGHT) {
            editor.value.copy(loadMode = LoadMode.EXTERNAL)
        } else {
            editor.value.copy(loadMode = LoadMode.BODYWEIGHT, loadGrams = 0)
        }
    }

    fun changeReps(direction: Int) {
        editor.value = editor.value.copy(
            reps = (editor.value.reps + direction).coerceIn(1, ProtocolLimits.MAX_REPS)
        )
    }

    fun setReps(value: Int): Boolean {
        if (value !in 1..ProtocolLimits.MAX_REPS) return false
        editor.value = editor.value.copy(reps = value)
        return true
    }

    fun changePartials(direction: Int) {
        editor.value = editor.value.copy(
            partialReps = (editor.value.partialReps + direction).coerceIn(0, ProtocolLimits.MAX_PARTIAL_REPS)
        )
    }

    fun setPartials(value: Int): Boolean {
        if (value !in 0..ProtocolLimits.MAX_PARTIAL_REPS) return false
        editor.value = editor.value.copy(partialReps = value)
        return true
    }

    fun changeRir(direction: Int) {
        val current = editor.value.rir ?: uiState.value.targetRir ?: 0
        editor.value = editor.value.copy(rir = (current + direction).coerceIn(0, ProtocolLimits.MAX_RIR))
    }

    fun setRir(value: Int): Boolean {
        if (value !in 0..ProtocolLimits.MAX_RIR) return false
        editor.value = editor.value.copy(rir = value)
        return true
    }

    fun reusePrevious() {
        val current = editor.value
        editor.value = current.copy(
            loadGrams = current.previousLoadGrams ?: current.loadGrams,
            reps = current.previousReps ?: current.reps,
            rir = current.previousRir ?: current.rir
        )
    }

    fun requestUndo() { confirmation.value = ConfirmAction.UNDO }
    fun requestFinish() { confirmation.value = ConfirmAction.FINISH }
    fun requestLeave() { confirmation.value = ConfirmAction.LEAVE }
    fun dismissConfirmation() { confirmation.value = ConfirmAction.NONE }

    fun confirmCurrentAction() {
        when (confirmation.value) {
            ConfirmAction.LEAVE -> forceToday.value = true
            ConfirmAction.UNDO -> launchAction { repository.undoLastSet() }
            ConfirmAction.FINISH -> launchAction { repository.finishWorkout() }
            ConfirmAction.NONE -> Unit
        }
        confirmation.value = ConfirmAction.NONE
    }

    fun correctLastSet() {
        launchAction { repository.undoLastSet() }
    }

    fun reviewWorkout() {
        launchAction { repository.reviewWorkout() }
    }

    fun closeFinished() {
        launchAction { repository.closeFinishedWorkout() }
    }

    fun pauseOrResumeTimer() {
        launchAction {
            if (uiState.value.timerPaused) repository.resumeTimer() else repository.pauseTimer()
        }
    }

    fun addThirtySeconds() { launchAction { repository.addThirtySeconds() } }
    fun endTimer() { launchAction { repository.endTimer() } }
    fun retrySync() { repository.retryNow() }
    fun toggleHaptics() { repository.setHapticsEnabled(!uiState.value.hapticsEnabled) }
    fun clearError() { actionError.value = null }
    fun setAmbient(value: Boolean) { ambient.value = value }

    fun previousExercise() {
        val state = repository.state.value
        val plan = state.plan ?: return
        val current = state.session?.currentExerciseId ?: return
        val target = WearWorkoutDomain.previousExercise(plan, current) ?: return
        launchAction { repository.navigateToExercise(target.exerciseId) }
    }

    fun nextExercise() {
        val state = repository.state.value
        val plan = state.plan ?: return
        val current = state.session?.currentExerciseId ?: return
        val target = WearWorkoutDomain.nextExercise(plan, current) ?: return
        launchAction { repository.navigateToExercise(target.exerciseId) }
    }

    private fun initialEditor(state: WearRepositoryState, setId: String): SetEditorState {
        val plan = state.plan ?: return SetEditorState(setId = setId)
        val planned = WearWorkoutDomain.plannedSet(plan, setId) ?: return SetEditorState(setId = setId)
        val prescription = planned.exercise.prescriptions.first { it.setId == setId }
        val replay = WearWorkoutDomain.replay(plan, state.events)
        val pendingSide = replay.heads[setId]?.takeIf {
            planned.exercise.unilateral && it.completedSides == 1
        }
        val previous = WearWorkoutDomain.orderedSets(plan)
            .filter { it.exercise.exerciseId == planned.exercise.exerciseId && it.globalIndex < planned.globalIndex }
            .mapNotNull { replay.heads[it.setId] }
            .lastOrNull()
        val suggested = pendingSide?.loadGrams
            ?: previous?.loadGrams
            ?: prescription.suggestedLoadGrams
            ?: prescription.previousLoadGrams
            ?: 0
        val previousLoad = previous?.loadGrams ?: prescription.previousLoadGrams
        val previousReps = previous?.reps ?: prescription.previousReps
        val defaultRir = pendingSide?.rir ?: previous?.rir ?: prescription.targetRir ?: planned.exercise.targetRir
        return SetEditorState(
            setId = setId,
            loadMode = pendingSide?.let { if (it.loadGrams == 0) LoadMode.BODYWEIGHT else LoadMode.EXTERNAL }
                ?: if (suggested == 0 && previousLoad == 0) LoadMode.BODYWEIGHT else LoadMode.EXTERNAL,
            loadGrams = suggested.coerceIn(0, ProtocolLimits.MAX_LOAD_GRAMS),
            reps = (pendingSide?.reps ?: previousReps ?: prescription.repsMin).coerceIn(1, ProtocolLimits.MAX_REPS),
            partialReps = pendingSide?.partialReps ?: 0,
            rir = defaultRir,
            previousLoadGrams = previousLoad,
            previousReps = previousReps,
            previousRir = previous?.rir
        )
    }

    private fun buildUiState(
        state: WearRepositoryState,
        controls: ViewControls,
        remaining: Int,
        durationSeconds: Int
    ): WearWorkoutUiState {
        val plan = state.plan
        val session = state.session
        val replay = if (plan != null) WearWorkoutDomain.replay(plan, state.events) else null
        /** Inclui séries concluídas no telefone: cursor, contadores e listas andam juntos. */
        val done = if (plan != null) WearWorkoutDomain.effectiveCompleted(plan, replay?.completedSetIds.orEmpty()) else emptySet()
        val ordered = plan?.let(WearWorkoutDomain::orderedSets).orEmpty()
        val current = plan?.let { WearWorkoutDomain.plannedSet(it, session?.currentSetId) }
        val prescription = current?.exercise?.prescriptions?.firstOrNull { it.setId == current.setId }
        val next = if (plan != null) {
            WearWorkoutDomain.nextIncomplete(plan, session?.currentSetId, done)
        } else null
        val completed = done.size
        val naturalScreen = when (session?.state) {
            SessionState.ACTIVE -> WearScreen.WORKOUT
            SessionState.RESTING -> WearScreen.REST
            SessionState.REVIEW, SessionState.FINISHED -> WearScreen.SUMMARY
            else -> WearScreen.TODAY
        }
        val screen = if (controls.forceToday && session?.state != SessionState.FINISHED) WearScreen.TODAY else naturalScreen
        val currentExerciseSets = current?.exercise?.prescriptions?.size ?: 0
        val currentSetNumber = current?.setIndex?.plus(1) ?: 0
        val targetRir = prescription?.targetRir ?: current?.exercise?.targetRir
        val suggestedLabel = prescription?.let {
            val parts = mutableListOf<String>()
            it.previousLoadGrams?.let { grams -> parts += "Anterior ${formatKg(grams)} kg" }
            it.suggestedLoadGrams?.let { grams -> parts += "Sugerida ${formatKg(grams)} kg" }
            parts.takeIf { values -> values.isNotEmpty() }?.joinToString(" · ")
        }
        val rows = plan?.exercises?.sortedBy { it.order }?.map { exercise ->
            ExerciseRowUi(
                exerciseId = exercise.exerciseId,
                name = exercise.name,
                completedSets = exercise.prescriptions.count { it.setId in done },
                totalSets = exercise.prescriptions.size
            )
        }.orEmpty()
        val syncLabel = when (state.syncStatus) {
            SyncStatus.SYNCED -> "Sincronizado"
            SyncStatus.SYNCING -> "Sincronizando…"
            SyncStatus.PENDING -> "Pendente (${state.pendingEvents})"
            SyncStatus.OFFLINE -> if (state.pendingEvents > 0) "Será enviado ao conectar" else "Telefone offline"
            SyncStatus.ERROR -> "Erro de sincronização"
            SyncStatus.QUEUE_FULL -> "Fila cheia — conecte o telefone"
        }
        val currentExerciseId = current?.exercise?.exerciseId
        val previousAvailable = plan?.let { WearWorkoutDomain.previousExercise(it, currentExerciseId) }?.let { exercise ->
            exercise.prescriptions.any { it.setId !in done }
        } ?: false
        val nextAvailable = plan?.let { WearWorkoutDomain.nextExercise(it, currentExerciseId) }?.let { exercise ->
            exercise.prescriptions.any { it.setId !in done }
        } ?: false
        return WearWorkoutUiState(
            loading = state.loading,
            screen = screen,
            title = plan?.name ?: "Treino de hoje",
            logicalDate = plan?.logicalDate.orEmpty(),
            exerciseRows = rows,
            totalExercises = plan?.exercises?.size ?: 0,
            totalSets = ordered.size,
            completedSets = completed,
            currentExerciseName = current?.exercise?.name.orEmpty(),
            currentExerciseId = currentExerciseId,
            currentSetId = current?.setId,
            currentSetNumber = currentSetNumber,
            currentExerciseSetCount = currentExerciseSets,
            globalSetNumber = current?.globalIndex?.plus(1) ?: 0,
            setKindLabel = if (prescription?.kind == SetKind.WARMUP) "Aquecimento" else "Série de trabalho",
            repsTargetLabel = prescription?.let { "${it.repsMin}–${it.repsMax} reps" }.orEmpty(),
            suggestionLabel = suggestedLabel,
            targetRir = targetRir,
            nextExerciseName = next?.exercise?.name,
            unilateralSide = current?.exercise?.takeIf { it.unilateral }?.let {
                if (session?.unilateralPendingSetId == current.setId) 2 else 1
            },
            editor = controls.editor,
            loadIncrementGrams = current?.exercise?.loadIncrementGrams ?: 1000,
            timerRemainingSeconds = remaining,
            timerPaused = session?.timer?.paused == true,
            durationSeconds = durationSeconds,
            volumeGrams = if (plan != null) WearWorkoutDomain.totalVolumeGrams(plan, state.events) else 0,
            incompleteSets = (ordered.size - completed).coerceAtLeast(0),
            syncStatus = state.syncStatus,
            syncLabel = syncLabel,
            pendingEvents = state.pendingEvents,
            phoneReachable = state.phoneReachable,
            waitingPlan = state.waitingPlan != null,
            conservativeWarning = plan?.conservativeWarning,
            hapticsEnabled = state.hapticsEnabled,
            canUndo = plan != null && WearWorkoutDomain.latestUndoable(plan, state.events) != null,
            canPreviousExercise = previousAvailable,
            canNextExercise = nextAvailable,
            ambient = controls.ambient,
            confirmation = controls.confirmation,
            error = controls.actionError ?: state.lastError,
            finished = session?.state == SessionState.FINISHED
        )
    }

    private fun launchAction(action: suspend () -> Unit) {
        actionError.value = null
        viewModelScope.launch {
            try {
                action()
            } catch (error: Exception) {
                actionError.value = (error.message ?: "Não foi possível concluir a ação").take(180)
            }
        }
    }

    private fun bootCount(): Int = try {
        Settings.Global.getInt(getApplication<Application>().contentResolver, Settings.Global.BOOT_COUNT)
    } catch (_: Exception) {
        0
    }

    companion object {
        fun formatKg(grams: Int): String {
            val whole = grams / 1000
            val decimal = grams % 1000
            return if (decimal == 0) whole.toString()
            else BigDecimal(grams).divide(BigDecimal(1000)).stripTrailingZeros().toPlainString().replace('.', ',')
        }
    }
}
