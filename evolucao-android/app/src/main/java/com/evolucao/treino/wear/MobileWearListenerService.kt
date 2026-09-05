package com.evolucao.treino.wear

import android.util.Log
import com.evolucao.treino.protocol.WearTransport
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

class MobileWearListenerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        val repository = MobileWearRepository.get(applicationContext)
        events.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED) return@forEach
            val path = event.dataItem.uri.path ?: return@forEach
            if (!path.startsWith(WearTransport.ENVELOPE_PREFIX)) return@forEach
            try {
                val dataMap = DataMapItem.fromDataItem(event.dataItem).dataMap
                val payload = dataMap.getString(WearTransport.DATA_PAYLOAD) ?: return@forEach
                val hash = dataMap.getString(WearTransport.DATA_PAYLOAD_HASH) ?: return@forEach
                repository.receiveEnvelope(payload, hash, path)
            } catch (error: Exception) {
                Log.e(TAG, "Invalid DataItem at $path", error)
            }
        }
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != WearTransport.POKE_PATH) return
        MobileWearRepository.get(applicationContext).apply {
            republishActivePlan()
            scheduleSync()
            requestDrain()
        }
    }

    override fun onPeerConnected(peer: com.google.android.gms.wearable.Node) {
        MobileWearRepository.get(applicationContext).apply {
            scheduleSync()
            requestDrain()
        }
    }

    companion object {
        private const val TAG = "EvolucaoWearListener"
    }
}
