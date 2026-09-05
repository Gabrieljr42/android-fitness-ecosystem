package com.evolucao.treino.protocol

object WearTransport {
    const val ROOT = "/evolucao/v1"
    const val PLAN_PREFIX = "$ROOT/plans/"
    const val ENVELOPE_PREFIX = "$ROOT/envelopes/"
    const val ACK_PREFIX = "$ROOT/acks/"
    const val POKE_PATH = "$ROOT/poke"
    const val DATA_PAYLOAD = "payload"
    const val DATA_PAYLOAD_HASH = "payloadHash"
    const val DATA_UPDATED_AT = "updatedAt"
    const val WEAR_CAPABILITY = "evolucao_workout_sync_v1"
    const val PHONE_CAPABILITY = "evolucao_phone_sync_v1"

    @JvmStatic fun planPath(sessionId: String): String = PLAN_PREFIX + sessionId
    @JvmStatic fun envelopePath(envelopeId: String): String = ENVELOPE_PREFIX + envelopeId
    @JvmStatic fun ackPath(ackId: String): String = ACK_PREFIX + ackId
}
