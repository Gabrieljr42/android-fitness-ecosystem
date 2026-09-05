package com.coach.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.HealthConnectClient
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import com.coach.app.ai.GeminiException
import com.coach.app.ai.GeminiGateway
import com.coach.app.ai.GeminiRequestBuilder
import com.coach.app.ai.GeminiValidator
import com.coach.app.bridge.BridgeProtocol
import com.coach.app.bridge.BridgeProtocolException
import com.coach.app.bridge.BridgeRequest
import com.coach.app.bridge.CheckInPayloadParser
import com.coach.app.bridge.PlanPayloadParser
import com.coach.app.bridge.ProposalEditValidator
import com.coach.app.data.CoachDatabase
import com.coach.app.data.ProposalRow
import com.coach.app.data.ProposalStatus
import com.coach.app.data.SnapshotStore
import com.coach.app.domain.Contract
import com.coach.app.domain.DailySnapshotBuilder
import com.coach.app.domain.DataSource
import com.coach.app.domain.SnapshotHashing
import com.coach.app.health.AndroidHealthConnectSource
import com.coach.app.health.HealthAvailability
import com.coach.app.health.HealthSyncCoordinator
import com.coach.app.health.HealthSyncResult
import com.coach.app.integrations.LocalAppSync
import com.coach.app.integrations.LocalSourcesSyncResult
import com.coach.app.notify.BriefingScheduler
import com.coach.app.security.CredentialPolicy
import com.coach.app.security.PreviewBinding
import com.coach.app.security.PreviewReceiptStore
import com.coach.app.security.SecureCredentialStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.coroutineContext

/** Native security boundary and host for the entirely local WebView UI. */
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var database: CoachDatabase
    private lateinit var store: SnapshotStore
    private lateinit var healthSource: AndroidHealthConnectSource
    private lateinit var healthSync: HealthSyncCoordinator
    private lateinit var localAppSync: LocalAppSync
    private lateinit var snapshotBuilder: DailySnapshotBuilder
    private lateinit var credentials: SecureCredentialStore
    private lateinit var gemini: GeminiGateway
    private lateinit var scheduler: BriefingScheduler

    @Volatile private var activeSnapshotHash: String? = null
    @Volatile private var activePlanRunId: String? = null
    private var pendingHealthPermissionRequest: String? = null
    private var pendingNotificationPermissionRequest: String? = null
    private val previewReceipts = PreviewReceiptStore()
    private val activeRequestIds = ConcurrentHashMap.newKeySet<String>()
    @Volatile private var webContentReady = false
    private var lastForegroundRefreshEpochMs = 0L
    private var webInsetLeft = 0
    private var webInsetTop = 0
    private var webInsetRight = 0
    private var webInsetBottom = 0

    private val healthPermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        val requestId = pendingHealthPermissionRequest ?: return@registerForActivityResult
        pendingHealthPermissionRequest = null
        val missing = AndroidHealthConnectSource.REQUIRED_PERMISSIONS - granted
        deliverSuccess(requestId, JSONObject()
            .put("allGranted", missing.isEmpty())
            .put("grantedPermissions", JSONArray(granted.sorted()))
            .put("missingPermissionCount", missing.size))
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val requestId = pendingNotificationPermissionRequest ?: return@registerForActivityResult
        pendingNotificationPermissionRequest = null
        if (granted) {
            respondWithScheduledNotification(requestId)
        } else {
            scheduler.setEnabled(false)
            deliverError(requestId, "E_NOTIFICATION_PERMISSION", "A permissão de notificações não foi concedida.")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingHealthPermissionRequest = savedInstanceState?.getString(STATE_HEALTH_PERMISSION_REQUEST)
        pendingNotificationPermissionRequest = savedInstanceState?.getString(STATE_NOTIFICATION_PERMISSION_REQUEST)
        database = CoachDatabase(applicationContext)
        store = SnapshotStore(database)
        healthSource = AndroidHealthConnectSource(applicationContext)
        healthSync = HealthSyncCoordinator(healthSource, store)
        localAppSync = LocalAppSync(applicationContext, store)
        snapshotBuilder = DailySnapshotBuilder(store)
        credentials = SecureCredentialStore(applicationContext)
        gemini = GeminiGateway(credentials)
        scheduler = BriefingScheduler(applicationContext)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        WebView.setWebContentsDebuggingEnabled(false)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = false
                allowFileAccess = false
                allowContentAccess = false
                cacheMode = WebSettings.LOAD_NO_CACHE
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                mediaPlaybackRequiresUserGesture = true
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                setGeolocationEnabled(false)
                safeBrowsingEnabled = true
            }
            setBackgroundColor(resources.getColor(R.color.coach_bg, theme))
            removeJavascriptInterface("searchBoxJavaBridge_")
            removeJavascriptInterface("accessibility")
            removeJavascriptInterface("accessibilityTraversal")
            webChromeClient = WebChromeClient()
            webViewClient = LocalOnlyWebViewClient(assetLoader) {
                webContentReady = true
                lastForegroundRefreshEpochMs = System.currentTimeMillis()
                applyInsetsToWebContent()
            }
            addJavascriptInterface(BridgeHost(), "CoachBridge")
            setDownloadListener { _, _, _, _, _ -> /* Downloads are never permitted. */ }
        }
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val system = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val density = resources.displayMetrics.density.coerceAtLeast(1.0f)
            webInsetLeft = Math.round(system.left / density)
            webInsetTop = Math.round(system.top / density)
            webInsetRight = Math.round(system.right / density)
            webInsetBottom = Math.round(maxOf(system.bottom, ime.bottom) / density)
            if (webContentReady) applyInsetsToWebContent()
            insets
        }
        setContentView(webView)
        ViewCompat.requestApplyInsets(webView)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack()
                else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
        webView.loadUrl(LOCAL_URL)
    }

    /**
     * CSS safe-area env() values are not consistently populated by Android WebView.
     * Forward the authoritative native insets as integer CSS custom properties so
     * fixed controls remain tappable above both 3-button and gesture navigation.
     */
    private fun applyInsetsToWebContent() {
        if (!::webView.isInitialized || !webContentReady) return
        val script = """
            (() => {
              const style = document.documentElement.style;
              style.setProperty('--android-inset-left', '${webInsetLeft}px');
              style.setProperty('--android-inset-top', '${webInsetTop}px');
              style.setProperty('--android-inset-right', '${webInsetRight}px');
              style.setProperty('--android-inset-bottom', '${webInsetBottom}px');
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    override fun onResume() {
        super.onResume()
        val now = System.currentTimeMillis()
        if (webContentReady && now - lastForegroundRefreshEpochMs >= FOREGROUND_REFRESH_THROTTLE_MS) {
            lastForegroundRefreshEpochMs = now
            webView.evaluateJavascript("window.CoachApp && window.CoachApp.refreshFromNative();", null)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        pendingHealthPermissionRequest?.let { outState.putString(STATE_HEALTH_PERMISSION_REQUEST, it) }
        pendingNotificationPermissionRequest?.let { outState.putString(STATE_NOTIFICATION_PERMISSION_REQUEST, it) }
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        webContentReady = false
        previewReceipts.clear()
        activeRequestIds.clear()
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("CoachBridge")
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.destroy()
        }
        if (::database.isInitialized) database.close()
        super.onDestroy()
    }

    private inner class BridgeHost {
        @JavascriptInterface
        fun request(operation: String, payload: String) {
            val request = try {
                BridgeProtocol.parse(operation, payload)
            } catch (error: BridgeProtocolException) {
                BridgeProtocol.requestIdHint(payload)?.let { deliverUntrackedError(it, error.code, error.message) }
                return
            }
            if (activeRequestIds.size >= MAX_IN_FLIGHT_REQUESTS) {
                deliverUntrackedError(request.requestId, "E_BUSY", "Muitas operações em andamento.")
                return
            }
            if (!activeRequestIds.add(request.requestId)) {
                deliverUntrackedError(request.requestId, "E_REPLAY", "ID de operação já está em uso.")
                return
            }
            when (request.operation) {
                "health.requestPermissions" -> requestHealthPermissions(request)
                "health.openSettings" -> openHealthSettings(request)
                "notification.schedule" -> handleNotificationRequest(request)
                "gemini.review" -> confirmGeminiReview(request)
                "privacy.deleteLocalData" -> confirmLocalDataDeletion(request)
                else -> dispatchAsync(request)
            }
        }
    }

    private fun dispatchAsync(request: BridgeRequest) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val data = PROCESS_OPERATION_MUTEX.withLock { dispatch(request) }
                coroutineContext.ensureActive()
                deliverSuccess(request.requestId, data)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: BridgeProtocolException) {
                deliverError(request.requestId, error.code, error.message)
            } catch (error: GeminiException) {
                deliverError(request.requestId, error.code, error.message)
            } catch (_: Exception) {
                deliverError(request.requestId, "E_INTERNAL", "Falha interna ao concluir a operação.")
            }
        }
    }

    private suspend fun dispatch(request: BridgeRequest): JSONObject = when (request.operation) {
        "app.bootstrap" -> {
            requireEmpty(request.data, "bootstrap")
            bootstrapData()
        }
        "health.sync" -> {
            requireEmpty(request.data, "sincronização")
            syncHealthData()
        }
        "checkin.save" -> saveCheckIn(request)
        "plan.persist" -> persistPlan(request)
        "decision.save" -> saveDecision(request)
        "gemini.saveKey" -> saveGeminiKey(request.data)
        "gemini.clearKey" -> clearGeminiKey(request.data)
        "gemini.preview" -> previewGemini(request.data)
        "gemini.review" -> reviewWithGemini(request.data)
        "privacy.deleteLocalData" -> deleteLocalData(request.data)
        else -> BridgeProtocol.fail("E_OP_UNKNOWN", "Operação não permitida.")
    }

    private suspend fun bootstrapData(): JSONObject {
        val now = System.currentTimeMillis()
        val zone = ZoneId.systemDefault()
        val date = LocalDate.now(zone)
        val pausedAfterDeletion = preferences().getBoolean(KEY_HEALTH_SYNC_PAUSED, false)
        val result = if (pausedAfterDeletion) {
            HealthSyncResult(
                state = com.coach.app.health.HealthSyncState.NO_CHANGES,
                message = "Sincronização pausada após a exclusão local. Toque em reconectar para importar novamente."
            )
        } else healthSync.sync(date, zone, now)
        val localSources = if (pausedAfterDeletion) LocalSourcesSyncResult.paused()
        else localAppSync.sync(date, zone, now)
        val snapshot = buildAndStoreSnapshot(date, zone, now)
        val model = preferences().getString(KEY_MODEL, DEFAULT_MODEL) ?: DEFAULT_MODEL
        return JSONObject()
            .put("snapshot", snapshot)
            .put("health", healthJson(result, pausedAfterDeletion))
            .put("sources", localSources.toJson())
            .put("gemini", JSONObject()
                .put("keyConfigured", credentials.hasKey())
                .put("model", model))
            .put("notification", JSONObject().put("enabled", scheduler.isEnabled()))
    }

    private suspend fun syncHealthData(): JSONObject {
        val now = System.currentTimeMillis()
        val zone = ZoneId.systemDefault()
        val date = LocalDate.now(zone)
        preferences().edit().putBoolean(KEY_HEALTH_SYNC_PAUSED, false).apply()
        val result = healthSync.sync(date, zone, now)
        val localSources = localAppSync.sync(date, zone, now)
        return JSONObject()
            .put("health", healthJson(result))
            .put("sources", localSources.toJson())
            .put("snapshot", buildAndStoreSnapshot(date, zone, now))
    }

    private fun saveCheckIn(request: BridgeRequest): JSONObject {
        val now = System.currentTimeMillis()
        val zone = ZoneId.systemDefault()
        val date = LocalDate.now(zone)
        val checkIn = CheckInPayloadParser.parse(request.data, date, now)
        store.upsertCheckIn(checkIn, "checkin:$date:${request.requestId}")
        return JSONObject().put("snapshot", buildAndStoreSnapshot(date, zone, now))
    }

    private fun persistPlan(request: BridgeRequest): JSONObject {
        val parsed = PlanPayloadParser.parse(request.data)
        val storedSnapshot = store.snapshotByHash(parsed.snapshotHash)
        if (parsed.snapshotHash != activeSnapshotHash || storedSnapshot == null) {
            BridgeProtocol.fail("E_STALE", "O briefing mudou; recalcule o plano antes de salvá-lo.")
        }
        if (!snapshotEvidenceIds(storedSnapshot.canonicalJson).containsAll(parsed.evidenceIds)) {
            BridgeProtocol.fail("E_PLAN", "O plano cita evidências que não pertencem ao snapshot.")
        }
        validatePlanAgainstSnapshot(parsed.outputJson, storedSnapshot.canonicalJson)
        val now = System.currentTimeMillis()
        val planRunId = "plan:${parsed.snapshotHash.take(24)}:${parsed.engineVersion}"
        val outputHash = SnapshotHashing.sha256Hex(parsed.outputJson)
        val inserted = store.insertPlanRunIfAbsent(
            planRunId, parsed.snapshotHash, parsed.engineVersion, parsed.outputJson,
            outputHash, now, Contract.VERSION
        )
        val stored = store.planRunById(planRunId)
            ?: BridgeProtocol.fail("E_PLAN", "Não foi possível confirmar o plano salvo.")
        if (stored.outputHash != outputHash) {
            BridgeProtocol.fail("E_PLAN_CONFLICT", "O motor produziu saídas diferentes para o mesmo snapshot.")
        }
        parsed.proposals.forEach { proposal ->
            store.upsertProposal(ProposalRow(
                proposalId = proposal.id,
                planRunId = planRunId,
                target = proposal.target,
                operation = proposal.operation,
                payloadJson = proposal.payloadJson,
                reason = proposal.reason,
                status = ProposalStatus.PENDING,
                createdAtEpochMs = now,
                updatedEpochMs = now,
                contractVersion = Contract.VERSION
            ))
        }
        activePlanRunId = planRunId
        val proposalStatuses = JSONObject()
        store.proposalsForPlan(planRunId).forEach { proposal ->
            proposalStatuses.put(proposal.proposalId, proposal.status.name.lowercase())
        }
        return JSONObject()
            .put("planRunId", planRunId)
            .put("inserted", inserted)
            .put("proposalStatuses", proposalStatuses)
    }

    private fun saveDecision(request: BridgeRequest): JSONObject {
        BridgeProtocol.requireExactKeys(
            request.data,
            setOf("planRunId", "proposalId", "choice", "editedPayload"),
            "decisão"
        )
        val planRunId = BridgeProtocol.boundedString(request.data, "planRunId", 120)
        val proposalId = BridgeProtocol.boundedString(request.data, "proposalId", 160)
        val choice = BridgeProtocol.boundedString(request.data, "choice", 10)
        if (planRunId != activePlanRunId || store.planRunById(planRunId) == null) {
            BridgeProtocol.fail("E_STALE", "O plano desta decisão não está mais ativo.")
        }
        if (choice !in setOf("accept", "edit", "reject")) BridgeProtocol.fail("E_DECISION", "Decisão inválida.")
        val proposal = store.proposalsForPlan(planRunId).firstOrNull { it.proposalId == proposalId }
            ?: BridgeProtocol.fail("E_DECISION", "Proposta desconhecida.")
        val editedJson = if (choice == "edit") {
            val edited = request.data.optJSONObject("editedPayload")
                ?: BridgeProtocol.fail("E_DECISION", "A edição precisa ser um objeto JSON.")
            ProposalEditValidator.validate(proposal.operation, edited)
        } else {
            if (!request.data.isNull("editedPayload")) BridgeProtocol.fail("E_DECISION", "Payload editado inesperado.")
            null
        }
        val status = when (choice) {
            "accept" -> ProposalStatus.ACCEPTED
            "edit" -> ProposalStatus.EDITED
            else -> ProposalStatus.REJECTED
        }
        val decisionId = "decision:${SnapshotHashing.sha256Hex("${proposal.proposalId}:${request.requestId}")}"
        val decidedAt = System.currentTimeMillis()
        if (!store.recordDecisionIfPending(
                decisionId = decisionId,
                proposalId = proposal.proposalId,
                status = status,
                choice = choice,
                editedPayloadJson = editedJson,
                decidedAtEpochMs = decidedAt,
                appliedToSource = null,
                contractVersion = Contract.VERSION
            )) {
            BridgeProtocol.fail("E_DECISION_ALREADY_RECORDED", "Esta proposta já recebeu uma decisão.")
        }
        return JSONObject().put("proposalId", proposalId).put("status", status.name.lowercase())
    }

    private fun saveGeminiKey(data: JSONObject): JSONObject {
        BridgeProtocol.requireExactKeys(data, setOf("apiKey", "model"), "credencial Gemini")
        val key = BridgeProtocol.boundedString(data, "apiKey", 512)
        val model = try { CredentialPolicy.validateModel(BridgeProtocol.boundedString(data, "model", 80)) }
        catch (error: IllegalArgumentException) { BridgeProtocol.fail("E_GEMINI_MODEL", error.message ?: "Modelo inválido.") }
        try { credentials.save(key) }
        catch (error: IllegalArgumentException) { BridgeProtocol.fail("E_GEMINI_KEY", error.message ?: "Chave inválida.") }
        preferences().edit().putString(KEY_MODEL, model).apply()
        previewReceipts.clear()
        return JSONObject().put("keyConfigured", true).put("model", model)
    }

    private fun clearGeminiKey(data: JSONObject): JSONObject {
        requireEmpty(data, "remoção de chave")
        credentials.clear()
        previewReceipts.clear()
        return JSONObject().put("keyConfigured", false)
    }

    @SuppressLint("ApplySharedPref") // The response must only succeed after the privacy wipe is durable.
    private fun deleteLocalData(data: JSONObject): JSONObject {
        BridgeProtocol.requireExactKeys(data, setOf("confirmation"), "exclusão local")
        if (BridgeProtocol.boundedString(data, "confirmation", 6) != "DELETE") {
            BridgeProtocol.fail("E_CONFIRMATION", "Confirmação de exclusão inválida.")
        }
        scheduler.setEnabled(false)
        credentials.clear()
        previewReceipts.clear()
        preferences().edit().clear().putBoolean(KEY_HEALTH_SYNC_PAUSED, true).commit()
        val deletedRows = store.clearAllPersonalData()
        activeSnapshotHash = null
        activePlanRunId = null
        return JSONObject().put("cleared", true).put("deletedRows", deletedRows)
    }

    private fun previewGemini(data: JSONObject): JSONObject {
        val context = resolveGeminiContext(data)
        val receipt = previewReceipts.issue(context.previewBinding())
        return JSONObject()
            .put("payload", context.payload.json)
            .put("previewToken", receipt.token)
            .put("expiresAtEpochMs", receipt.expiresAtEpochMs)
    }

    private suspend fun reviewWithGemini(data: JSONObject): JSONObject {
        val previewToken = BridgeProtocol.boundedString(data, "previewToken", 64)
        val context = resolveGeminiContext(data, includesPreviewToken = true)
        if (!previewReceipts.consume(previewToken, context.previewBinding())) {
            BridgeProtocol.fail(
                "E_PREVIEW_REQUIRED",
                "A confirmação expirou ou não corresponde ao payload exibido. Revise os dados novamente."
            )
        }
        val cached = store.geminiOpinion(
            context.snapshotHash, context.planRunId, context.model, Contract.VERSION
        )
        if (cached != null) {
            val opinion = GeminiValidator.validate(cached.responseJson, context.payload.validationContext)
            return JSONObject()
                .put("sentPayload", JSONObject(cached.requestJson))
                .put("opinion", opinion.toJson())
                .put("cached", true)
        }
        val result = runInterruptible(Dispatchers.IO) { gemini.review(context.model, context.payload) }
        coroutineContext.ensureActive()
        if (activeSnapshotHash != context.snapshotHash || activePlanRunId != context.planRunId) {
            BridgeProtocol.fail("E_STALE", "O briefing mudou enquanto o Gemini respondia; a opinião foi descartada.")
        }
        val opinionId = "gemini:${SnapshotHashing.sha256Hex("${context.snapshotHash}:${context.planRunId}:${context.model}:${Contract.VERSION}")}"
        store.insertGeminiOpinionIfAbsent(
            opinionId = opinionId,
            snapshotHash = context.snapshotHash,
            planRunId = context.planRunId,
            model = context.model,
            requestJson = result.sentPayload.toString(),
            responseJson = result.opinion.toJson().toString(),
            verdict = result.opinion.verdict,
            confidence = result.opinion.confidence,
            createdAtEpochMs = System.currentTimeMillis(),
            contractVersion = Contract.VERSION
        )
        return JSONObject()
            .put("sentPayload", result.sentPayload)
            .put("opinion", result.opinion.toJson())
            .put("cached", false)
    }

    private fun resolveGeminiContext(data: JSONObject, includesPreviewToken: Boolean = false): GeminiContext {
        BridgeProtocol.requireExactKeys(
            data,
            setOf("snapshotHash", "planRunId", "model", "snapshot", "localPlan") +
                if (includesPreviewToken) setOf("previewToken") else emptySet(),
            "contexto Gemini"
        )
        val snapshotHash = BridgeProtocol.boundedString(data, "snapshotHash", 64)
        val planRunId = BridgeProtocol.boundedString(data, "planRunId", 120)
        val model = try { CredentialPolicy.validateModel(BridgeProtocol.boundedString(data, "model", 80)) }
        catch (error: IllegalArgumentException) { BridgeProtocol.fail("E_GEMINI_MODEL", error.message ?: "Modelo inválido.") }
        val configuredModel = preferences().getString(KEY_MODEL, DEFAULT_MODEL) ?: DEFAULT_MODEL
        if (model != configuredModel) BridgeProtocol.fail("E_GEMINI_MODEL", "Use o modelo configurado nos ajustes.")
        val clientSnapshot = data.optJSONObject("snapshot")
            ?: BridgeProtocol.fail("E_GEMINI_CONTEXT", "Snapshot de interface inválido.")
        val clientPlan = data.optJSONObject("localPlan")
            ?: BridgeProtocol.fail("E_GEMINI_CONTEXT", "Plano de interface inválido.")
        if (clientSnapshot.optString("hash") != snapshotHash || clientPlan.optString("snapshotHash") != snapshotHash) {
            BridgeProtocol.fail("E_GEMINI_CONTEXT", "Contexto de interface inconsistente.")
        }
        if (snapshotHash != activeSnapshotHash || planRunId != activePlanRunId) {
            BridgeProtocol.fail("E_STALE", "O briefing ou plano mudou; gere um novo contexto.")
        }
        val snapshot = store.snapshotByHash(snapshotHash)
            ?: BridgeProtocol.fail("E_GEMINI_CONTEXT", "Snapshot não encontrado.")
        val plan = store.planRunById(planRunId)
            ?: BridgeProtocol.fail("E_GEMINI_CONTEXT", "Plano não encontrado.")
        if (plan.snapshotHash != snapshotHash) BridgeProtocol.fail("E_GEMINI_CONTEXT", "Plano não pertence ao snapshot.")
        return GeminiContext(
            snapshotHash,
            planRunId,
            model,
            GeminiRequestBuilder.build(snapshotHash, snapshot.canonicalJson, planRunId, plan.outputJson)
        )
    }

    private fun requestHealthPermissions(request: BridgeRequest) {
        try { requireEmpty(request.data, "permissões") }
        catch (error: BridgeProtocolException) { deliverError(request.requestId, error.code, error.message); return }
        lifecycleScope.launch {
            if (pendingHealthPermissionRequest != null) {
                deliverError(request.requestId, "E_BUSY", "Já existe um pedido de permissão em andamento.")
                return@launch
            }
            pendingHealthPermissionRequest = request.requestId
            val availability = runCatching { healthSource.availability() }.getOrDefault(HealthAvailability.UNAVAILABLE)
            if (availability != HealthAvailability.AVAILABLE) {
                pendingHealthPermissionRequest = null
                deliverError(request.requestId, "E_HEALTH_UNAVAILABLE", "Health Connect não está disponível.")
                return@launch
            }
            val granted = try { withContext(Dispatchers.IO) { healthSource.grantedPermissions() } }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) {
                pendingHealthPermissionRequest = null
                deliverError(request.requestId, "E_HEALTH_PERMISSION", "Não foi possível consultar as permissões do Health Connect.")
                return@launch
            }
            val missing = AndroidHealthConnectSource.REQUIRED_PERMISSIONS - granted
            if (missing.isEmpty()) {
                pendingHealthPermissionRequest = null
                deliverSuccess(request.requestId, JSONObject().put("allGranted", true))
            } else {
                healthPermissionLauncher.launch(missing)
            }
        }
    }

    private fun openHealthSettings(request: BridgeRequest) {
        try { requireEmpty(request.data, "ajustes do Health Connect") }
        catch (error: BridgeProtocolException) { deliverError(request.requestId, error.code, error.message); return }
        runOnUiThread {
            try {
                startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS))
                deliverSuccess(request.requestId, JSONObject().put("opened", true))
            } catch (_: ActivityNotFoundException) {
                deliverError(request.requestId, "E_HEALTH_SETTINGS", "Não foi possível abrir os ajustes do Health Connect.")
            }
        }
    }

    private fun handleNotificationRequest(request: BridgeRequest) {
        try {
            BridgeProtocol.requireExactKeys(request.data, setOf("enabled"), "notificação")
            if (request.data.opt("enabled") !is Boolean) BridgeProtocol.fail("E_NOTIFICATION", "Estado de notificação inválido.")
        } catch (error: BridgeProtocolException) {
            deliverError(request.requestId, error.code, error.message)
            return
        }
        val enabled = request.data.getBoolean("enabled")
        runOnUiThread {
            if (!enabled) {
                scheduler.setEnabled(false)
                deliverSuccess(request.requestId, JSONObject()
                    .put("enabled", false)
                    .put("message", "Briefing diário desativado."))
            } else if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                if (pendingNotificationPermissionRequest != null) {
                    deliverError(request.requestId, "E_BUSY", "Já existe um pedido de notificação em andamento.")
                } else {
                    pendingNotificationPermissionRequest = request.requestId
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            } else {
                respondWithScheduledNotification(request.requestId)
            }
        }
    }

    private fun respondWithScheduledNotification(requestId: String) {
        val next = scheduler.setEnabled(true)
        deliverSuccess(requestId, JSONObject()
            .put("enabled", true)
            .put("nextTriggerEpochMs", next)
            .put("message", "Briefing diário programado para perto de 05:40."))
    }

    private fun buildAndStoreSnapshot(date: LocalDate, zone: ZoneId, now: Long): JSONObject {
        val snapshot = snapshotBuilder.build(date, zone)
        store.insertSnapshotIfAbsent(snapshot, now)
        activeSnapshotHash = snapshot.hash
        activePlanRunId = null
        previewReceipts.clear()
        return JSONObject(snapshot.canonicalJson).put("hash", snapshot.hash)
    }

    private fun healthJson(result: HealthSyncResult, pausedAfterDeletion: Boolean = false): JSONObject {
        val lastSuccess = store.syncCursorFor(DataSource.HEALTH_CONNECT)?.lastSuccessEpochMs
        val availability = runCatching { healthSource.availability().name }.getOrDefault(HealthAvailability.UNAVAILABLE.name)
        return JSONObject()
            .put("availability", availability)
            .put("state", if (pausedAfterDeletion) "PAUSED" else result.state.name)
            .put("observedKeys", JSONArray(result.observedKeys.sorted()))
            .put("requiredPermissionCount", AndroidHealthConnectSource.REQUIRED_PERMISSIONS.size)
            .put("missingPermissionCount", result.missingPermissions.size)
            .put("usedBoundedResync", result.usedBoundedResync)
            .put("lastSuccessEpochMs", lastSuccess ?: JSONObject.NULL)
            .put("message", result.message ?: JSONObject.NULL)
    }

    private fun snapshotEvidenceIds(canonicalJson: String): Set<String> {
        val snapshot = JSONObject(canonicalJson)
        val result = linkedSetOf<String>()
        val metrics = snapshot.getJSONObject("metrics")
        metrics.keys().asSequence().forEach { key ->
            val metric = metrics.getJSONObject(key)
            if (!metric.isNull("sourceRecordId")) result += metric.getString("sourceRecordId")
        }
        if (!snapshot.isNull("checkIn")) result += "checkin:${snapshot.getString("logicalDate")}"
        return result
    }

    /** Recomputes safety/date/coverage invariants from the native stored snapshot. */
    private fun validatePlanAgainstSnapshot(outputJson: String, snapshotJson: String) {
        val output = JSONObject(outputJson)
        val snapshot = JSONObject(snapshotJson)
        if (output.getString("generatedFor") != snapshot.getString("logicalDate")) {
            BridgeProtocol.fail("E_PLAN", "A data do plano não corresponde ao snapshot armazenado.")
        }
        val metrics = snapshot.getJSONObject("metrics")
        val metricLabels = linkedMapOf(
            "recovery.sleepMinutes" to "sono",
            "activity.steps" to "passos",
            "recovery.restingHeartRate" to "FC de repouso",
            "body.weightKg" to "peso"
        )
        val missing = metricLabels.filterKeys { key ->
            metrics.getJSONObject(key).getString("status") == "ABSENT"
        }.values.toMutableSet()
        val hasCheckIn = !snapshot.isNull("checkIn")
        if (!hasCheckIn) missing += "check-in"
        val quality = output.getJSONObject("dataQuality")
        val reportedMissing = quality.getJSONArray("missing").let { array ->
            (0 until array.length()).map(array::getString).toSet()
        }
        val observed = metricLabels.size - missing.count { it != "check-in" }
        if (quality.getInt("observedMetrics") != observed ||
            quality.getBoolean("checkInPresent") != hasCheckIn ||
            quality.getInt("score") != (observed + if (hasCheckIn) 1 else 0) * 20 ||
            reportedMissing != missing
        ) {
            BridgeProtocol.fail("E_PLAN", "A cobertura do plano não corresponde aos dados locais.")
        }
        val dimensions = output.getJSONObject("dimensions")
        val hasRun = listOf(
            "running.sessionCount", "running.distanceKm", "running.durationMinutes"
        ).any { key -> metrics.getJSONObject(key).getString("status") != "ABSENT" }
        val hasFuel = listOf(
            "nutrition.mealCount", "nutrition.energyKcal", "nutrition.proteinG", "nutrition.waterMl"
        ).any { key -> metrics.getJSONObject(key).getString("status") != "ABSENT" }
        if ((dimensions.getJSONObject("runningLoad").getString("status") == "observed") != hasRun ||
            (dimensions.getJSONObject("fueling").getString("status") == "observed") != hasFuel
        ) {
            BridgeProtocol.fail("E_PLAN", "As dimensões não correspondem às fontes locais importadas.")
        }
        val safetySignal = snapshot.optJSONObject("checkIn")?.let { checkIn ->
            checkIn.optBoolean("jointPainFlag") || checkIn.getJSONObject("soreness")
                .keys().asSequence().any { region -> checkIn.getJSONObject("soreness").optString(region) == "SEVERE" }
        } == true
        if (output.getJSONObject("safety").getBoolean("aggressiveChangesBlocked") != safetySignal) {
            BridgeProtocol.fail("E_PLAN", "O plano não corresponde aos sinais de segurança do check-in.")
        }
        if (output.getJSONObject("readiness").getDouble("confidence") > 0.7) {
            BridgeProtocol.fail("E_PLAN", "Sem baseline pessoal, a confiança de prontidão não pode ser alta.")
        }
    }

    private fun requireEmpty(data: JSONObject, label: String) {
        BridgeProtocol.requireExactKeys(data, emptySet(), label)
    }

    private fun deliverSuccess(requestId: String, data: JSONObject = JSONObject()) {
        activeRequestIds.remove(requestId)
        deliver(BridgeProtocol.success(requestId, data))
    }

    private fun deliverError(requestId: String, code: String, message: String) {
        activeRequestIds.remove(requestId)
        deliver(BridgeProtocol.error(requestId, code, message))
    }

    private fun deliverUntrackedError(requestId: String, code: String, message: String) {
        deliver(BridgeProtocol.error(requestId, code, message))
    }

    private fun deliver(raw: String) {
        runOnUiThread {
            if (!::webView.isInitialized || isFinishing || isDestroyed) return@runOnUiThread
            val quoted = JSONObject.quote(raw)
            webView.evaluateJavascript("window.CoachNative && window.CoachNative.receive($quoted);", null)
        }
    }

    private fun preferences() = getSharedPreferences(PREFS, MODE_PRIVATE)

    private data class GeminiContext(
        val snapshotHash: String,
        val planRunId: String,
        val model: String,
        val payload: com.coach.app.ai.GeminiReviewPayload
    ) {
        fun previewBinding() = PreviewBinding(
            snapshotHash = snapshotHash,
            planRunId = planRunId,
            model = model,
            payloadHash = SnapshotHashing.sha256Hex(payload.json.toString())
        )
    }

    private class LocalOnlyWebViewClient(
        private val assetLoader: WebViewAssetLoader,
        private val onContentReady: () -> Unit
    ) : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            val url = request.url
            return if (url.scheme == "https" &&
                url.host == WebViewAssetLoader.DEFAULT_DOMAIN &&
                url.path.orEmpty().startsWith("/assets/www/")
            ) {
                assetLoader.shouldInterceptRequest(url) ?: errorResponse(404, "Not Found")
            } else {
                errorResponse(403, "Forbidden")
            }
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (url == LOCAL_URL) onContentReady()
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            return url.toString() != LOCAL_URL
        }

        private fun errorResponse(status: Int, reason: String) = WebResourceResponse(
            "text/plain", "utf-8", status, reason,
            mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(ByteArray(0))
        )
    }

    private fun confirmGeminiReview(request: BridgeRequest) {
        try {
            BridgeProtocol.boundedString(request.data, "previewToken", 64)
        } catch (error: BridgeProtocolException) {
            deliverError(request.requestId, error.code, error.message)
            return
        }
        runOnUiThread {
            AlertDialog.Builder(this)
                .setTitle("Enviar para o Gemini?")
                .setMessage("Confirme o envio exato do resumo sanitizado que acabou de ser exibido. O plano local não será alterado automaticamente.")
                .setNegativeButton("Cancelar") { _, _ ->
                    deliverError(request.requestId, "E_CANCELLED", "Envio cancelado.")
                }
                .setPositiveButton("Enviar") { _, _ -> dispatchAsync(request) }
                .setOnCancelListener { deliverError(request.requestId, "E_CANCELLED", "Envio cancelado.") }
                .show()
        }
    }

    private fun confirmLocalDataDeletion(request: BridgeRequest) {
        try {
            BridgeProtocol.requireExactKeys(request.data, setOf("confirmation"), "exclusão local")
            if (BridgeProtocol.boundedString(request.data, "confirmation", 6) != "DELETE") {
                BridgeProtocol.fail("E_CONFIRMATION", "Confirmação de exclusão inválida.")
            }
        } catch (error: BridgeProtocolException) {
            deliverError(request.requestId, error.code, error.message)
            return
        }
        runOnUiThread {
            AlertDialog.Builder(this)
                .setTitle("Excluir todos os dados locais?")
                .setMessage("Esta ação remove check-ins, snapshots, decisões, opiniões, chave Gemini e lembretes. A sincronização com o Health Connect ficará pausada até você reconectar.")
                .setNegativeButton("Cancelar") { _, _ ->
                    deliverError(request.requestId, "E_CANCELLED", "Exclusão cancelada.")
                }
                .setPositiveButton("Excluir") { _, _ -> dispatchAsync(request) }
                .setOnCancelListener { deliverError(request.requestId, "E_CANCELLED", "Exclusão cancelada.") }
                .show()
        }
    }

    companion object {
        private const val LOCAL_URL = "https://appassets.androidplatform.net/assets/www/index.html"
        private const val PREFS = "coach_settings"
        private const val KEY_MODEL = "gemini_model"
        private const val KEY_HEALTH_SYNC_PAUSED = "health_sync_paused_after_deletion"
        private const val DEFAULT_MODEL = "gemini-3.7-flash"
        private const val STATE_HEALTH_PERMISSION_REQUEST = "pending_health_permission_request"
        private const val STATE_NOTIFICATION_PERMISSION_REQUEST = "pending_notification_permission_request"
        private const val FOREGROUND_REFRESH_THROTTLE_MS = 2_000L
        private const val MAX_IN_FLIGHT_REQUESTS = 16
        private val PROCESS_OPERATION_MUTEX = Mutex()
    }
}
