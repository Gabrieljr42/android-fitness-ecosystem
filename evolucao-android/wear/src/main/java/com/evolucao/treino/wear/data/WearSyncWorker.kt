package com.evolucao.treino.wear.data

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class WearSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result = try {
        if (WearWorkoutRepository.get(applicationContext).flushOutboxBlocking()) {
            Result.success()
        } else {
            Result.retry()
        }
    } catch (_: Exception) {
        Result.retry()
    }
}
