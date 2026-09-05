package com.evolucao.treino.wear.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.evolucao.treino.protocol.LoadMode
import com.evolucao.treino.protocol.SyncStatus
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.Vignette
import androidx.wear.compose.material.VignettePosition
import java.math.BigDecimal

private val Accent = Color(0xFFB9F27C)
private val Warning = Color(0xFFFFC857)
private val Error = Color(0xFFFF8A80)
private val Surface = Color(0xFF1B1B1B)

private enum class DirectField { LOAD, REPS, PARTIALS, RIR }

@Composable
fun EvolucaoWearApp(viewModel: WearWorkoutViewModel) {
    val ui by viewModel.uiState.collectAsStateWithLifecycle()
    var directField by remember { mutableStateOf<DirectField?>(null) }

    MaterialTheme(
        colors = MaterialTheme.colors.copy(
            primary = Accent,
            secondary = Accent,
            background = Color.Black,
            surface = Surface,
            onPrimary = Color.Black,
            onBackground = Color.White,
            onSurface = Color.White,
            error = Error
        )
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            when (ui.screen) {
                WearScreen.TODAY -> TodayScreen(ui, viewModel)
                WearScreen.WORKOUT -> WorkoutScreen(ui, viewModel) { directField = it }
                WearScreen.REST -> RestScreen(ui, viewModel)
                WearScreen.SUMMARY -> SummaryScreen(ui, viewModel)
            }

            if (ui.confirmation != ConfirmAction.NONE) {
                ConfirmationDialog(ui.confirmation, viewModel::dismissConfirmation, viewModel::confirmCurrentAction)
            }
            ui.error?.let { error ->
                MessageDialog("Algo deu errado", error, viewModel::clearError)
            }
            directField?.let { field ->
                val initial = when (field) {
                    DirectField.LOAD -> WearWorkoutViewModel.formatKg(ui.editor.loadGrams)
                    DirectField.REPS -> ui.editor.reps.toString()
                    DirectField.PARTIALS -> ui.editor.partialReps.toString()
                    DirectField.RIR -> (ui.editor.rir ?: ui.targetRir ?: 0).toString()
                }
                DirectEntryDialog(
                    title = when (field) {
                        DirectField.LOAD -> "Carga (kg)"
                        DirectField.REPS -> "Repetições"
                        DirectField.PARTIALS -> "Parciais"
                        DirectField.RIR -> "RIR"
                    },
                    initial = initial,
                    allowDecimal = field == DirectField.LOAD,
                    onDismiss = { directField = null },
                    onConfirm = { raw ->
                        val valid = when (field) {
                            DirectField.LOAD -> viewModel.setLoadText(raw)
                            DirectField.REPS -> raw.toIntOrNull()?.let(viewModel::setReps) == true
                            DirectField.PARTIALS -> raw.toIntOrNull()?.let(viewModel::setPartials) == true
                            DirectField.RIR -> raw.toIntOrNull()?.let(viewModel::setRir) == true
                        }
                        if (valid) directField = null
                        valid
                    }
                )
            }
        }
    }

    BackHandler(enabled = ui.screen != WearScreen.TODAY) {
        viewModel.requestLeave()
    }
}

@Composable
private fun TodayScreen(ui: WearWorkoutUiState, viewModel: WearWorkoutViewModel) {
    WearPage(ui.ambient) {
        if (ui.loading) {
            item { CircularProgressIndicator(modifier = Modifier.size(32.dp)) }
            item { CenterText("Carregando treino…") }
            return@WearPage
        }
        item {
            Text(
                "Treino de hoje",
                fontWeight = FontWeight.Bold,
                fontSize = 19.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
        if (ui.exerciseRows.isEmpty()) {
            item { CenterText("Nenhum treino recebido") }
            item { CenterText("Abra o Evolução no telefone e selecione a ficha A, B ou C.", color = Color.LightGray) }
            item {
                PrimaryChip("Tentar sincronizar", "Solicita o plano ao telefone", viewModel::retrySync)
            }
        } else {
            item {
                Text(
                    ui.title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            item { CenterText(ui.logicalDate) }
            item {
                CenterText("${ui.totalExercises} exercícios · ${ui.totalSets} séries", color = Color.LightGray)
            }
            item { SyncStatusText(ui) }
            ui.conservativeWarning?.let { warning ->
                item { CenterText(warning, color = Warning) }
            }
            if (ui.waitingPlan) {
                item { CenterText("Há um novo plano aguardando o treino atual terminar.", color = Warning) }
            }
            item {
                PrimaryChip(
                    if (ui.completedSets > 0) "Continuar treino" else "Iniciar treino",
                    "${ui.completedSets}/${ui.totalSets} séries concluídas",
                    viewModel::startOrContinue
                )
            }
            items(ui.exerciseRows, key = { it.exerciseId }) { exercise ->
                Chip(
                    onClick = {},
                    enabled = false,
                    modifier = Modifier.fillMaxWidth().semantics {
                        contentDescription = "${exercise.name}, ${exercise.completedSets} de ${exercise.totalSets} séries"
                    },
                    label = { Text(exercise.name) },
                    secondaryLabel = { Text("${exercise.completedSets}/${exercise.totalSets} séries") }
                )
            }
            item { SecondaryChip("Sincronizar agora", ui.syncLabel, viewModel::retrySync) }
            item {
                SecondaryChip(
                    if (ui.hapticsEnabled) "Hápticos ligados" else "Hápticos desligados",
                    "Alertas em 30 s, 10 s e fim",
                    viewModel::toggleHaptics
                )
            }
        }
    }
}

@Composable
private fun WorkoutScreen(
    ui: WearWorkoutUiState,
    viewModel: WearWorkoutViewModel,
    editDirect: (DirectField) -> Unit
) {
    WearPage(ui.ambient) {
        item {
            Text(
                ui.currentExerciseName,
                fontWeight = FontWeight.Bold,
                fontSize = 19.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
        item {
            CenterText(
                "Série ${ui.currentSetNumber}/${ui.currentExerciseSetCount} · ${ui.globalSetNumber}/${ui.totalSets}",
                color = Color.LightGray
            )
        }
        item {
            CenterText(
                buildString {
                    append(ui.setKindLabel)
                    ui.unilateralSide?.let { append(" · lado $it/2") }
                },
                color = if (ui.setKindLabel == "Aquecimento") Warning else Accent
            )
        }
        item { CenterText(ui.repsTargetLabel) }
        ui.suggestionLabel?.let { item { CenterText(it, color = Color.LightGray) } }
        ui.targetRir?.let { item { CenterText("RIR-alvo $it", color = Color.LightGray) } }

        item {
            RotaryStepper(
                label = "Carga",
                value = if (ui.editor.loadMode == LoadMode.BODYWEIGHT) "Corporal" else "${WearWorkoutViewModel.formatKg(ui.editor.loadGrams)} kg",
                contentDescriptionText = "Carga atual",
                enabled = ui.editor.loadMode != LoadMode.BODYWEIGHT,
                onDelta = viewModel::changeLoad,
                onDirect = { editDirect(DirectField.LOAD) }
            )
        }
        item {
            SecondaryChip(
                if (ui.editor.loadMode == LoadMode.BODYWEIGHT) "Peso corporal ✓" else "Usar peso corporal",
                "Registra carga externa zero",
                viewModel::toggleBodyweight
            )
        }
        item {
            RotaryStepper(
                label = "Repetições",
                value = ui.editor.reps.toString(),
                contentDescriptionText = "Repetições atuais",
                onDelta = viewModel::changeReps,
                onDirect = { editDirect(DirectField.REPS) }
            )
        }
        item {
            RotaryStepper(
                label = "Parciais",
                value = ui.editor.partialReps.toString(),
                contentDescriptionText = "Repetições parciais",
                onDelta = viewModel::changePartials,
                onDirect = { editDirect(DirectField.PARTIALS) }
            )
        }
        if (ui.targetRir != null) {
            item {
                RotaryStepper(
                    label = "RIR",
                    value = (ui.editor.rir ?: ui.targetRir).toString(),
                    contentDescriptionText = "RIR atual",
                    onDelta = viewModel::changeRir,
                    onDirect = { editDirect(DirectField.RIR) }
                )
            }
        }
        if (ui.editor.previousLoadGrams != null || ui.editor.previousReps != null) {
            item { SecondaryChip("Reusar série anterior", "Carga, reps e RIR", viewModel::reusePrevious) }
        }
        item {
            PrimaryChip(
                if (ui.unilateralSide == 1) "Concluir lado 1" else "Concluir série",
                "Salva offline antes de avançar",
                viewModel::completeSet
            )
        }
        ui.nextExerciseName?.let { next -> item { CenterText("Próximo: $next", color = Color.LightGray) } }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                RoundTextButton("‹", "Exercício anterior", ui.canPreviousExercise, viewModel::previousExercise)
                RoundTextButton("›", "Próximo exercício", ui.canNextExercise, viewModel::nextExercise)
            }
        }
        if (ui.canUndo) {
            item { SecondaryChip("Desfazer última série", "Exige confirmação", viewModel::requestUndo) }
        }
        item { SecondaryChip("Revisar e finalizar", "${ui.incompleteSets} séries incompletas", viewModel::reviewWorkout) }
        item { SyncStatusText(ui) }
    }
}

@Composable
private fun RestScreen(ui: WearWorkoutUiState, viewModel: WearWorkoutViewModel) {
    if (ui.ambient) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(formatClock(ui.timerRemainingSeconds), fontSize = 38.sp, fontWeight = FontWeight.Bold)
                Text(
                    if (ui.unilateralSide == 2) "Troca de lado" else "Descanso",
                    color = Color.LightGray,
                    textAlign = TextAlign.Center
                )
                Text(ui.currentExerciseName, textAlign = TextAlign.Center, maxLines = 2)
            }
        }
        return
    }
    WearPage(false) {
        item { CenterText(if (ui.unilateralSide == 2) "Troca de lado" else "Descanso", color = Accent) }
        item {
            Text(
                formatClock(ui.timerRemainingSeconds),
                fontSize = 40.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().semantics {
                    contentDescription = "${ui.timerRemainingSeconds} segundos restantes"
                }
            )
        }
        item { CenterText(ui.currentExerciseName) }
        ui.nextExerciseName?.let { item { CenterText("Depois: $it", color = Color.LightGray) } }
        item { PrimaryChip("+30 segundos", null, viewModel::addThirtySeconds) }
        item {
            SecondaryChip(
                if (ui.timerPaused) "Retomar" else "Pausar",
                if (ui.timerPaused) "Descanso pausado" else "Mantém o prazo salvo",
                viewModel::pauseOrResumeTimer
            )
        }
        item { SecondaryChip("Pular descanso", "Ir para a próxima série", viewModel::endTimer) }
        if (ui.canUndo) item { SecondaryChip("Desfazer última série", "Exige confirmação", viewModel::requestUndo) }
        item { SyncStatusText(ui) }
    }
}

@Composable
private fun SummaryScreen(ui: WearWorkoutUiState, viewModel: WearWorkoutViewModel) {
    WearPage(ui.ambient) {
        item {
            Text(
                if (ui.finished) "Treino finalizado" else "Revisar treino",
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
        item { CenterText("${ui.completedSets}/${ui.totalSets} séries concluídas", color = Accent) }
        item { CenterText("Volume: ${formatVolume(ui.volumeGrams)}", color = Color.LightGray) }
        item { CenterText("Duração: ${formatDuration(ui.durationSeconds)}", color = Color.LightGray) }
        if (ui.incompleteSets > 0) {
            item { CenterText("${ui.incompleteSets} séries incompletas", color = Warning) }
        } else {
            item { CenterText("Todas as séries concluídas", color = Accent) }
        }
        items(ui.exerciseRows, key = { it.exerciseId }) { exercise ->
            Chip(
                onClick = {},
                enabled = false,
                modifier = Modifier.fillMaxWidth(),
                label = { Text(exercise.name) },
                secondaryLabel = { Text("${exercise.completedSets}/${exercise.totalSets} séries") }
            )
        }
        item { SyncStatusText(ui) }
        if (ui.canUndo && !ui.finished) {
            item { SecondaryChip("Corrigir última série", "Desfaz e volta para edição", viewModel::correctLastSet) }
        }
        if (ui.finished) {
            item {
                PrimaryChip(
                    "Fechar resumo",
                    if (ui.pendingEvents > 0) "Os dados serão enviados ao conectar" else "Tudo salvo",
                    viewModel::closeFinished
                )
            }
        } else {
            item {
                PrimaryChip(
                    "Finalizar treino",
                    if (ui.pendingEvents > 0 || !ui.phoneReachable) "Pode finalizar offline" else "Criará uma sessão no Evolução",
                    viewModel::requestFinish
                )
            }
        }
    }
}

@Composable
private fun WearPage(
    ambient: Boolean,
    content: androidx.wear.compose.foundation.lazy.ScalingLazyListScope.() -> Unit
) {
    val listState = rememberScalingLazyListState()
    Scaffold(
        timeText = { if (!ambient) TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
        positionIndicator = { if (!ambient) PositionIndicator(scalingLazyListState = listState) }
    ) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = listState,
            horizontalAlignment = Alignment.CenterHorizontally,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                top = if (ambient) 12.dp else 30.dp,
                bottom = 30.dp,
                start = 10.dp,
                end = 10.dp
            ),
            content = content
        )
    }
}

@Composable
private fun RotaryStepper(
    label: String,
    value: String,
    contentDescriptionText: String,
    enabled: Boolean = true,
    onDelta: (Int) -> Unit,
    onDirect: () -> Unit
) {
    val focusRequester = remember { FocusRequester() }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .onRotaryScrollEvent {
                if (enabled && it.verticalScrollPixels != 0f) {
                    onDelta(if (it.verticalScrollPixels > 0f) 1 else -1)
                }
                true
            }
            .focusRequester(focusRequester)
            .focusable()
            .semantics { contentDescription = "$contentDescriptionText: $value. Gire a coroa ou use mais e menos." },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(label, color = Color.LightGray, fontSize = 13.sp)
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            RoundTextButton("−", "Diminuir $label", enabled) {
                focusRequester.requestFocus(); onDelta(-1)
            }
            Box(
                modifier = Modifier
                    .height(52.dp)
                    .weight(1f)
                    .clickable(enabled = enabled) {
                        focusRequester.requestFocus(); onDirect()
                    },
                contentAlignment = Alignment.Center
            ) {
                Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            }
            RoundTextButton("+", "Aumentar $label", enabled) {
                focusRequester.requestFocus(); onDelta(1)
            }
        }
    }
}

@Composable
private fun RoundTextButton(text: String, description: String, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.size(52.dp).semantics { contentDescription = description },
        colors = ButtonDefaults.secondaryButtonColors()
    ) { Text(text, fontSize = 22.sp, fontWeight = FontWeight.Bold) }
}

@Composable
private fun PrimaryChip(label: String, secondary: String?, onClick: () -> Unit) {
    Chip(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().heightIn(min = if (secondary == null) 52.dp else 60.dp),
        colors = ChipDefaults.primaryChipColors(),
        label = { Text(label, fontWeight = FontWeight.Bold) },
        secondaryLabel = secondary?.let { value -> { Text(value) } }
    )
}

@Composable
private fun SecondaryChip(label: String, secondary: String?, onClick: () -> Unit) {
    Chip(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().heightIn(min = if (secondary == null) 52.dp else 60.dp),
        colors = ChipDefaults.secondaryChipColors(),
        label = { Text(label) },
        secondaryLabel = secondary?.let { value -> { Text(value) } }
    )
}

@Composable
private fun SyncStatusText(ui: WearWorkoutUiState) {
    val color = when (ui.syncStatus) {
        SyncStatus.SYNCED -> Accent
        SyncStatus.ERROR, SyncStatus.QUEUE_FULL -> Error
        SyncStatus.OFFLINE -> Warning
        else -> Color.LightGray
    }
    CenterText(ui.syncLabel, color)
}

@Composable
private fun CenterText(text: String, color: Color = Color.White) {
    Text(text, color = color, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun ConfirmationDialog(action: ConfirmAction, dismiss: () -> Unit, confirm: () -> Unit) {
    val title = when (action) {
        ConfirmAction.LEAVE -> "Sair desta tela?"
        ConfirmAction.UNDO -> "Desfazer a última série?"
        ConfirmAction.FINISH -> "Finalizar o treino?"
        ConfirmAction.NONE -> return
    }
    val body = when (action) {
        ConfirmAction.LEAVE -> "O treino continua salvo e pode ser retomado."
        ConfirmAction.UNDO -> "Um evento de desfazer será salvo; nada será apagado silenciosamente."
        ConfirmAction.FINISH -> "Séries incompletas permanecerão marcadas no resumo."
        ConfirmAction.NONE -> ""
    }
    Dialog(onDismissRequest = dismiss) {
        DialogSurface {
            Text(title, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Text(body, fontSize = 13.sp, color = Color.LightGray, textAlign = TextAlign.Center)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                Button(onClick = dismiss, modifier = Modifier.size(52.dp)) { Text("Não") }
                Button(onClick = confirm, modifier = Modifier.size(52.dp)) { Text("Sim") }
            }
        }
    }
}

@Composable
private fun MessageDialog(title: String, message: String, dismiss: () -> Unit) {
    Dialog(onDismissRequest = dismiss) {
        DialogSurface {
            Text(title, color = Error, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Text(message, fontSize = 13.sp, textAlign = TextAlign.Center)
            Button(onClick = dismiss, modifier = Modifier.size(52.dp)) { Text("OK") }
        }
    }
}

@Composable
private fun DirectEntryDialog(
    title: String,
    initial: String,
    allowDecimal: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Boolean
) {
    var text by remember(initial) { mutableStateOf(initial) }
    var invalid by remember { mutableStateOf(false) }
    val requester = remember { FocusRequester() }
    Dialog(onDismissRequest = onDismiss) {
        DialogSurface {
            Text(title, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            BasicTextField(
                value = text,
                onValueChange = { value ->
                    text = value.take(8)
                    invalid = false
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .background(Color(0xFF303030), RoundedCornerShape(12.dp))
                    .padding(10.dp)
                    .focusRequester(requester)
                    .semantics { contentDescription = title },
                textStyle = TextStyle(color = Color.White, fontSize = 22.sp, textAlign = TextAlign.Center),
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = if (allowDecimal) KeyboardType.Decimal else KeyboardType.Number
                )
            )
            if (invalid) Text("Valor fora do limite", color = Error, fontSize = 12.sp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                Button(onClick = onDismiss, modifier = Modifier.size(52.dp)) { Text("×") }
                Button(onClick = { invalid = !onConfirm(text) }, modifier = Modifier.size(52.dp)) { Text("✓") }
            }
        }
    }
    LaunchedEffect(Unit) { requester.requestFocus() }
}

@Composable
private fun DialogSurface(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().padding(18.dp), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Surface, RoundedCornerShape(28.dp))
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content
        )
    }
}

private fun formatClock(seconds: Int): String = "%d:%02d".format(seconds / 60, seconds % 60)
private fun formatDuration(seconds: Int): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val remaining = seconds % 60
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, remaining)
    else "%d:%02d".format(minutes, remaining)
}
private fun formatVolume(grams: Long): String {
    val kg = BigDecimal(grams).divide(BigDecimal(1000)).stripTrailingZeros().toPlainString().replace('.', ',')
    return "$kg kg·reps"
}
