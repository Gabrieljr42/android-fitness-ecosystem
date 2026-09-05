package com.evolucao.treino.wear.data

import android.util.Log
import com.evolucao.treino.protocol.WearTransport
import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.WearableListenerService

class WearDataLayerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        val repository = WearWorkoutRepository.get(applicationContext)
        events.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED) return@forEach
            val path = event.dataItem.uri.path ?: return@forEach
            if (!path.startsWith(WearTransport.PLAN_PREFIX) && !path.startsWith(WearTransport.ACK_PREFIX)) {
                return@forEach
            }
            try {
                val dataMap = DataMapItem.fromDataItem(event.dataItem).dataMap
                val payload = dataMap.getString(WearTransport.DATA_PAYLOAD) ?: return@forEach
                val hash = dataMap.getString(WearTransport.DATA_PAYLOAD_HASH) ?: return@forEach
                when {
                    path.startsWith(WearTransport.PLAN_PREFIX) -> repository.receivePlan(payload, hash, path)
                    path.startsWith(WearTransport.ACK_PREFIX) -> repository.receiveAck(payload, hash, path)
                }
            } catch (error: Exception) {
                Log.e(TAG, "Rejected DataItem at $path: ${error.javaClass.simpleName}")
            }
        }
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != WearTransport.POKE_PATH) return
        WearWorkoutRepository.get(applicationContext).apply {
            refreshPhoneReachability()
            scheduleImmediateSync()
        }
    }

    override fun onCapabilityChanged(info: CapabilityInfo) {
        if (info.name == WearTransport.PHONE_CAPABILITY) {
            WearWorkoutRepository.get(applicationContext).refreshPhoneReachability()
        }
    }

    override fun onPeerConnected(peer: Node) {
        WearWorkoutRepository.get(applicationContext).apply {
            refreshPhoneReachability()
            retryNow()
        }
    }

    companion object {
        private const val TAG = "EvolucaoWearData"
    }
}
