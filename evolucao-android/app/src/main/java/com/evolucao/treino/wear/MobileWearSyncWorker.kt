package com.evolucao.treino.wear

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class MobileWearSyncWorker(
    context: Context,
    params: WorkerParameters
) : Worker(context, params) {
    override fun doWork(): Result = try {
        if (MobileWearRepository.get(applicationContext).flushOutboxBlocking()) {
            Result.success()
        } else {
            Result.retry()
        }
    } catch (_: Exception) {
        Result.retry()
    }
}
