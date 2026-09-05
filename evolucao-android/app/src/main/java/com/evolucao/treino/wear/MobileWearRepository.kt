package com.evolucao.treino.wear

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.evolucao.treino.protocol.Ack
import com.evolucao.treino.protocol.AckStatus
import com.evolucao.treino.protocol.EventAck
import com.evolucao.treino.protocol.Origin
import com.evolucao.treino.protocol.PROTOCOL_VERSION
import com.evolucao.treino.protocol.ProtocolJson
import com.evolucao.treino.protocol.ProtocolLimits
import com.evolucao.treino.protocol.WearTransport
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

fun interface WearEnvelopeDispatcher {
    fun dispatch(envelopeJson: String)
}

internal fun duplicateInboxAckStatus(state: String): AckStatus = when (state) {
    AckStatus.CONFLICT_STORED.name -> AckStatus.CONFLICT_STORED
    AckStatus.REJECTED.name -> AckStatus.REJECTED
    AckStatus.APPLIED.name, AckStatus.ALREADY_APPLIED.name -> AckStatus.ALREADY_APPLIED
    else -> AckStatus.RECEIVED
}

class MobileWearRepository private constructor(context: Context) {
    private val appContext = context.applicationContext
    private val database = MobileWearDatabase.get(appContext)
    private val dao = database.wearDao()
    private val io = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "evolucao-mobile-wear-sync").apply { isDaemon = true }
    }
    /**
     * Retry de drain com backoff curto. Cobre a janela em que o envelope
     * chegou mas a WebView ainda não está pronta (cold start) ou o JS ainda
     * não carregou: sem isto, o envelope só seria drenado na próxima
     * abertura do app. Limitado a poucas tentativas; a próxima conexão
     * (attach/poke) sempre drena de novo.
     */
    private val retryScheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "evolucao-mobile-wear-retry").apply { isDaemon = true }
    }
    private val drainRetries = AtomicInteger(0)
    private val dispatching = AtomicBoolean(false)
    private val instanceId: String = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .let { prefs ->
            prefs.getString(INSTANCE_ID, null) ?: UUID.randomUUID().toString().also {
                check(prefs.edit().putString(INSTANCE_ID, it).commit())
            }
        }

    @Volatile private var dispatcher: WearEnvelopeDispatcher? = null
    @Volatile private var inFlightEnvelopeId: String? = null

    fun attachDispatcher(value: WearEnvelopeDispatcher) {
        dispatcher = value
        drainRetries.set(0)
        io.execute {
            dao.recoverDispatchingEnvelopes(System.currentTimeMillis())
            dispatching.set(false)
            inFlightEnvelopeId = null
            drainOnIo()
        }
    }

    fun detachDispatcher() {
        dispatcher = null
        io.execute {
            inFlightEnvelopeId?.let { id ->
                dao.envelope(id)?.let { dao.setEnvelopeState(id, STATE_READY, it.attempts, "WEBVIEW_DETACHED", System.currentTimeMillis()) }
            }
            inFlightEnvelopeId = null
            dispatching.set(false)
        }
    }

    fun publishPlanJson(raw: String) {
        io.execute {
            try {
                val plan = ProtocolJson.decodePlan(raw)
                val canonical = ProtocolJson.encodePlan(plan)
                val hash = sha256(canonical)
                val now = System.currentTimeMillis()
                val path = WearTransport.planPath(plan.sessionId)
                database.runInTransaction {
                    dao.pruneSentOutbox(now - SENT_RETENTION_MS)
                    dao.putPlan(
                        MobilePlanEntity(
                            planId = plan.planId,
                            sessionId = plan.sessionId,
                            revision = plan.revision.value,
                            logicalDate = plan.logicalDate,
                            payload = canonical,
                            payloadHash = hash,
                            updatedAt = now
                        )
                    )
                    dao.removePendingAtPath(path)
                    enqueueOutboxLocked(path, KIND_PLAN, canonical, hash, now)
                }
                scheduleSync()
            } catch (error: Exception) {
                Log.e(TAG, "Plan rejected before durable publish", error)
            }
        }
    }

    fun receiveEnvelope(raw: String, transportHash: String, path: String) {
        io.execute {
            try {
                val envelope = ProtocolJson.decodeEnvelope(raw)
                require(envelope.origin == Origin.WEAR) { "Only WEAR envelopes are accepted by the phone" }
                val canonical = ProtocolJson.encodeEnvelope(envelope)
                val envelopeHash = sha256(canonical)
                require(path == WearTransport.envelopePath(envelope.envelopeId)) { "Envelope path/id mismatch" }
                require(transportHash == envelopeHash) { "Envelope transport hash mismatch" }
                val now = System.currentTimeMillis()
                database.runInTransaction {
                    dao.pruneSentOutbox(now - SENT_RETENTION_MS)
                    val existingEnvelope = dao.envelope(envelope.envelopeId)
                    if (existingEnvelope != null && existingEnvelope.payloadHash != envelopeHash) {
                        envelope.events.forEach { event ->
                            val payload = ProtocolJson.encodeEvent(event)
                            val incomingHash = ProtocolJson.eventPayloadHash(event)
                            dao.insertConflict(
                                MobileSyncConflictEntity(
                                    conflictId = stableUuid("envelope-reuse:${envelope.envelopeId}:${event.eventId}:$incomingHash"),
                                    eventId = event.eventId,
                                    envelopeId = envelope.envelopeId,
                                    existingHash = existingEnvelope.payloadHash,
                                    incomingHash = incomingHash,
                                    incomingPayload = payload,
                                    reason = "ENVELOPE_ID_REUSE",
                                    createdAt = now
                                )
                            )
                        }
                        enqueueDirectAckLocked(envelope.envelopeId, envelope.events.map { event ->
                            EventAck(event.eventId, AckStatus.CONFLICT_STORED, ProtocolJson.eventPayloadHash(event), "envelopeId reused")
                        }, now)
                        return@runInTransaction
                    }

                    if (existingEnvelope == null) {
                        dao.insertEnvelope(
                            MobileEnvelopeEntity(
                                envelopeId = envelope.envelopeId,
                                originInstanceId = envelope.originInstanceId,
                                payload = canonical,
                                payloadHash = envelopeHash,
                                state = STATE_READY,
                                attempts = 0,
                                lastError = null,
                                receivedAt = now,
                                updatedAt = now
                            )
                        )
                    }

                    envelope.events.forEachIndexed { ordinal, event ->
                        val eventPayload = ProtocolJson.encodeEvent(event)
                        val incomingHash = ProtocolJson.eventPayloadHash(event)
                        val existingEvent = dao.inbox(event.eventId)
                        val refState = when {
                            existingEvent == null -> {
                                dao.insertInbox(
                                    MobileInboxEventEntity(
                                        eventId = event.eventId,
                                        firstEnvelopeId = envelope.envelopeId,
                                        payload = eventPayload,
                                        payloadHash = incomingHash,
                                        state = AckStatus.RECEIVED.name,
                                        receivedAt = now,
                                        appliedAt = null,
                                        lastError = null
                                    )
                                )
                                AckStatus.RECEIVED.name
                            }
                            existingEvent.payloadHash != incomingHash -> {
                                dao.insertConflict(
                                    MobileSyncConflictEntity(
                                        conflictId = stableUuid("event-reuse:${envelope.envelopeId}:${event.eventId}:$incomingHash"),
                                        eventId = event.eventId,
                                        envelopeId = envelope.envelopeId,
                                        existingHash = existingEvent.payloadHash,
                                        incomingHash = incomingHash,
                                        incomingPayload = eventPayload,
                                        reason = "EVENT_ID_REUSE",
                                        createdAt = now
                                    )
                                )
                                AckStatus.CONFLICT_STORED.name
                            }
                            isTerminal(existingEvent.state) -> duplicateInboxAckStatus(existingEvent.state).name
                            else -> AckStatus.RECEIVED.name
                        }
                        dao.insertEnvelopeEvent(
                            MobileEnvelopeEventEntity(
                                envelopeId = envelope.envelopeId,
                                eventId = event.eventId,
                                payloadHash = incomingHash,
                                ordinal = ordinal,
                                state = refState,
                                detail = if (refState == AckStatus.CONFLICT_STORED.name) "eventId reused" else null
                            )
                        )
                    }
                    dao.releaseBlockedEnvelopes(now)
                    refreshEnvelopeStateLocked(envelope.envelopeId, now)
                    enqueueAckForEnvelopeLocked(envelope.envelopeId, now)
                }
                scheduleSync()
                drainOnIo()
            } catch (error: Exception) {
                Log.e(TAG, "Wear envelope rejected", error)
            }
        }
    }

    fun confirmAppliedJson(raw: String) {
        io.execute {
            val currentId = inFlightEnvelopeId
            try {
                val root = JSONObject(raw)
                require(root.optBoolean("ok", false)) { "JS did not commit" }
                require(root.optInt("protocolVersion", -1) == PROTOCOL_VERSION) { "Wrong JS protocol version" }
                val envelopeId = root.getString("envelopeId")
                require(envelopeId == currentId) { "Unexpected envelope confirmation" }
                val results = root.getJSONArray("results")
                require(results.length() <= MAX_QUEUE_ITEMS) { "Too many JS results" }
                val now = System.currentTimeMillis()
                val affectedEnvelopes = linkedSetOf<String>()
                val returnedIds = linkedSetOf<String>()

                database.runInTransaction {
                    val expected = dao.envelopeEvents(envelopeId)
                        .filter { it.state == AckStatus.RECEIVED.name || it.state == AckStatus.BLOCKED.name }
                        .map { it.eventId }
                    for (index in 0 until results.length()) {
                        val item = results.getJSONObject(index)
                        val eventId = item.getString("eventId")
                        val status = AckStatus.valueOf(item.getString("status"))
                        require(status in JS_FINAL_OR_BLOCKED) { "Unsupported JS status" }
                        val detail = item.optString("detail", "").take(ProtocolLimits.MAX_ERROR_STRING).ifEmpty { null }
                        val inbox = requireNotNull(dao.inbox(eventId)) { "Unknown JS event" }
                        returnedIds += eventId
                        affectedEnvelopes += dao.envelopesForEvent(eventId, inbox.payloadHash)
                        val inboxState = if (status == AckStatus.ALREADY_APPLIED) AckStatus.ALREADY_APPLIED.name else status.name
                        dao.setInboxState(
                            eventId,
                            inbox.payloadHash,
                            inboxState,
                            if (status == AckStatus.BLOCKED) null else now,
                            detail
                        )
                        dao.setEnvelopeEventState(eventId, inbox.payloadHash, status.name, detail)
                        if (status == AckStatus.CONFLICT_STORED) {
                            dao.insertConflict(
                                MobileSyncConflictEntity(
                                    conflictId = stableUuid("js-conflict:$envelopeId:$eventId:${inbox.payloadHash}"),
                                    eventId = eventId,
                                    envelopeId = envelopeId,
                                    existingHash = inbox.payloadHash,
                                    incomingHash = inbox.payloadHash,
                                    incomingPayload = inbox.payload,
                                    reason = "JS_CONFLICT_STORED",
                                    createdAt = now
                                )
                            )
                        }
                    }

                    require(expected.all { it in returnedIds }) { "JS omitted envelope result" }
                    affectedEnvelopes += envelopeId
                    affectedEnvelopes.forEach { affected ->
                        refreshEnvelopeStateLocked(affected, now)
                        enqueueAckForEnvelopeLocked(affected, now)
                    }
                }
                scheduleSync()
            } catch (error: Exception) {
                Log.e(TAG, "Invalid JS apply confirmation", error)
                currentId?.let { markDispatchFailureOnIo(it, error.message ?: "INVALID_JS_CONFIRMATION") }
            } finally {
                inFlightEnvelopeId = null
                dispatching.set(false)
                drainRetries.set(0)
                drainOnIo()
            }
        }
    }

    fun reportApplyFailure(reason: String?) {
        io.execute {
            inFlightEnvelopeId?.let { markDispatchFailureOnIo(it, reason ?: "JS_APPLY_FAILED") }
            inFlightEnvelopeId = null
            dispatching.set(false)
            scheduleDrainRetry()
        }
    }

    fun requestDrain() {
        io.execute { drainOnIo() }
    }

    fun republishActivePlan() {
        io.execute {
            try {
                val plan = dao.activePlan() ?: return@execute
                val now = System.currentTimeMillis()
                val path = WearTransport.planPath(plan.sessionId)
                database.runInTransaction {
                    dao.removePendingAtPath(path)
                    enqueueOutboxLocked(path, KIND_PLAN, plan.payload, plan.payloadHash, now)
                }
                scheduleSync()
            } catch (error: Exception) {
                Log.e(TAG, "Could not republish active Wear plan", error)
            }
        }
    }

    fun scheduleSync() {
        val request = OneTimeWorkRequestBuilder<MobileWearSyncWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(appContext).enqueueUniqueWork(
            WORK_NAME,
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            request
        )
    }

    fun flushOutboxBlocking(): Boolean {
        var allSent = true
        var loops = 0
        while (loops++ < 16) {
            val rows = dao.dueOutbox(System.currentTimeMillis(), 32)
            if (rows.isEmpty()) break
            rows.forEach { row ->
                try {
                    val request = PutDataMapRequest.create(row.path).apply {
                        dataMap.putString(WearTransport.DATA_PAYLOAD, row.payload)
                        dataMap.putString(WearTransport.DATA_PAYLOAD_HASH, row.payloadHash)
                        dataMap.putLong(WearTransport.DATA_UPDATED_AT, row.updatedAt)
                    }.asPutDataRequest().setUrgent()
                    Tasks.await(Wearable.getDataClient(appContext).putDataItem(request), 20, TimeUnit.SECONDS)
                    dao.markOutboxSent(row.outboxId, System.currentTimeMillis())
                    pokeReachableWearNodes(row.path)
                } catch (error: Exception) {
                    allSent = false
                    val attempts = row.attempts + 1
                    val delay = (10_000L shl minOf(attempts, 8)).coerceAtMost(6 * 60 * 60 * 1000L)
                    dao.markOutboxRetry(
                        row.outboxId,
                        attempts,
                        System.currentTimeMillis() + delay,
                        System.currentTimeMillis(),
                        (error.message ?: error.javaClass.simpleName).take(ProtocolLimits.MAX_ERROR_STRING)
                    )
                }
            }
            if (!allSent) break
        }
        return allSent && dao.pendingOutboxCount() == 0
    }

    private fun drainOnIo() {
        val target = dispatcher ?: return
        if (!dispatching.compareAndSet(false, true)) return
        val envelope = dao.nextDispatchEnvelope()
        if (envelope == null) {
            dispatching.set(false)
            return
        }
        dao.setEnvelopeState(envelope.envelopeId, STATE_DISPATCHING, envelope.attempts + 1, null, System.currentTimeMillis())
        inFlightEnvelopeId = envelope.envelopeId
        try {
            target.dispatch(envelope.payload)
        } catch (error: Exception) {
            markDispatchFailureOnIo(envelope.envelopeId, error.message ?: "DISPATCH_FAILED")
            inFlightEnvelopeId = null
            dispatching.set(false)
        }
    }

    private fun markDispatchFailureOnIo(envelopeId: String, reason: String) {
        dao.envelope(envelopeId)?.let { envelope ->
            dao.setEnvelopeState(
                envelopeId,
                STATE_RETRY,
                envelope.attempts,
                reason.take(ProtocolLimits.MAX_ERROR_STRING),
                System.currentTimeMillis()
            )
        }
        scheduleDrainRetry()
    }

    private fun scheduleDrainRetry() {
        val attempt = drainRetries.getAndIncrement()
        if (attempt >= DRAIN_RETRY_DELAYS_MS.size) return
        try {
            retryScheduler.schedule({ drainOnIo() }, DRAIN_RETRY_DELAYS_MS[attempt], TimeUnit.MILLISECONDS)
        } catch (_: Exception) {
            // Processo morrendo: o próximo attach/poke drena de qualquer forma.
        }
    }

    private fun refreshEnvelopeStateLocked(envelopeId: String, now: Long) {
        val envelope = dao.envelope(envelopeId) ?: return
        val refs = dao.envelopeEvents(envelopeId)
        val state = when {
            refs.any { it.state == AckStatus.RECEIVED.name } -> STATE_READY
            refs.any { it.state == AckStatus.BLOCKED.name } -> STATE_BLOCKED
            else -> STATE_COMPLETE
        }
        dao.setEnvelopeState(envelopeId, state, envelope.attempts, envelope.lastError, now)
    }

    private fun enqueueAckForEnvelopeLocked(envelopeId: String, now: Long) {
        val refs = dao.envelopeEvents(envelopeId)
        if (refs.isEmpty()) return
        val items = refs.map { ref ->
            val status = when (ref.state) {
                AckStatus.APPLIED.name -> AckStatus.APPLIED
                AckStatus.ALREADY_APPLIED.name -> AckStatus.ALREADY_APPLIED
                AckStatus.BLOCKED.name -> AckStatus.BLOCKED
                AckStatus.CONFLICT_STORED.name -> AckStatus.CONFLICT_STORED
                AckStatus.REJECTED.name -> AckStatus.REJECTED
                else -> AckStatus.RECEIVED
            }
            EventAck(ref.eventId, status, ref.payloadHash, ref.detail)
        }
        enqueueDirectAckLocked(envelopeId, items, now)
    }

    private fun enqueueDirectAckLocked(envelopeId: String, items: List<EventAck>, now: Long) {
        val signature = items.joinToString("|") { "${it.eventId}:${it.status}:${it.payloadHash}:${it.detail.orEmpty()}" }
        val ackId = stableUuid("phone-ack:$envelopeId:$signature")
        val ack = Ack(
            ackId = ackId,
            envelopeId = envelopeId,
            receiver = Origin.PHONE,
            receiverInstanceId = instanceId,
            createdAt = now,
            events = items
        )
        val payload = ProtocolJson.encodeAck(ack)
        val path = WearTransport.ackPath(ackId)
        enqueueOutboxLocked(path, KIND_ACK, payload, sha256(payload), now)
    }

    private fun enqueueOutboxLocked(path: String, kind: String, payload: String, hash: String, now: Long) {
        val bytes = payload.toByteArray(StandardCharsets.UTF_8).size
        val queuedBytes = dao.activeOutboxPayloads().sumOf {
            it.toByteArray(StandardCharsets.UTF_8).size.toLong()
        }
        if (dao.activeOutboxCount() >= MAX_QUEUE_ITEMS || queuedBytes + bytes > MAX_QUEUE_BYTES) {
            throw IllegalStateException("WEAR_OUTBOX_FULL")
        }
        val id = stableUuid("$kind:$path:$hash")
        dao.putOutbox(
            MobileOutboxEntity(
                outboxId = id,
                path = path,
                kind = kind,
                payload = payload,
                payloadHash = hash,
                state = STATE_PENDING,
                attempts = 0,
                nextAttemptAt = now,
                createdAt = now,
                updatedAt = now,
                lastError = null
            )
        )
    }

    private fun pokeReachableWearNodes(changedPath: String) {
        try {
            val capability = Tasks.await(
                Wearable.getCapabilityClient(appContext).getCapability(
                    WearTransport.WEAR_CAPABILITY,
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
                } catch (ignored: Exception) {
                    // The DataItem is durable; a poke is only a latency optimization.
                }
            }
        } catch (ignored: Exception) {
            // Offline is normal. WorkManager will retry durable outbox entries.
        }
    }

    private fun isTerminal(state: String): Boolean = state in TERMINAL_STATES

    companion object {
        private const val TAG = "EvolucaoWearMobile"
        private const val PREFS = "evolucao_wear_transport_v1"
        private const val INSTANCE_ID = "phone_instance_id"
        private const val WORK_NAME = "evolucao-mobile-wear-outbox-v1"
        private const val KIND_PLAN = "PLAN"
        private const val KIND_ACK = "ACK"
        private const val STATE_PENDING = "PENDING"
        private const val STATE_READY = "READY"
        private const val STATE_RETRY = "RETRY"
        private const val STATE_DISPATCHING = "DISPATCHING"
        private const val STATE_BLOCKED = "BLOCKED"
        private const val STATE_COMPLETE = "COMPLETE"
        private const val MAX_QUEUE_ITEMS = 4096
        private const val MAX_QUEUE_BYTES = 8L * 1024L * 1024L
        private const val SENT_RETENTION_MS = 7L * 24L * 60L * 60L * 1000L
        private val TERMINAL_STATES = setOf(
            AckStatus.APPLIED.name,
            AckStatus.ALREADY_APPLIED.name,
            AckStatus.CONFLICT_STORED.name,
            AckStatus.REJECTED.name
        )
        private val JS_FINAL_OR_BLOCKED = setOf(
            AckStatus.APPLIED,
            AckStatus.ALREADY_APPLIED,
            AckStatus.BLOCKED,
            AckStatus.CONFLICT_STORED,
            AckStatus.REJECTED
        )
        /** Backoff curto do retry de drain (cold start WebView/JS). */
        private val DRAIN_RETRY_DELAYS_MS = longArrayOf(5_000L, 15_000L, 30_000L)

        @Volatile private var instance: MobileWearRepository? = null

        @JvmStatic fun get(context: Context): MobileWearRepository = instance ?: synchronized(this) {
            instance ?: MobileWearRepository(context).also { instance = it }
        }

        @JvmStatic fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

        @JvmStatic fun stableUuid(value: String): String = UUID.nameUUIDFromBytes(
            value.toByteArray(StandardCharsets.UTF_8)
        ).toString()
    }
}
