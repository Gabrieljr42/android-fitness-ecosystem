package com.evolucao.treino.wear.system

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import com.evolucao.treino.protocol.RestTimerState
import com.evolucao.treino.wear.data.WearWorkoutRepository

object RestTimerCoordinator {
    internal const val ACTION_MARKER = "com.evolucao.treino.wear.REST_MARKER"
    internal const val EXTRA_MARKER = "markerSeconds"
    internal const val EXTRA_END_WALL = "expectedEndWallClock"
    private val markers = intArrayOf(30, 10, 0)

    fun schedule(context: Context, timer: RestTimerState) {
        cancel(context)
        if (!timer.running || timer.paused) return
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val nowElapsed = SystemClock.elapsedRealtime()
        markers.forEach { marker ->
            val trigger = timer.endElapsedRealtime - marker * 1000L
            if (trigger <= nowElapsed) return@forEach
            val operation = pendingIntent(context, marker, timer.endWallClockMillis)
            try {
                if (Build.VERSION.SDK_INT >= 31 && !alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, operation)
                } else {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, operation)
                }
            } catch (_: SecurityException) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, operation)
            }
        }
    }

    fun cancel(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        markers.forEach { marker ->
            val intent = Intent(context, RestTimerReceiver::class.java).setAction(ACTION_MARKER)
            val flags = PendingIntent.FLAG_NO_CREATE or immutableFlag()
            PendingIntent.getBroadcast(context, requestCode(marker), intent, flags)?.let {
                alarmManager.cancel(it)
                it.cancel()
            }
        }
    }

    fun vibrate(context: Context, markerSeconds: Int) {
        val vibrator = context.getSystemService(Vibrator::class.java) ?: return
        val effect = when (markerSeconds) {
            30 -> VibrationEffect.createOneShot(70, VibrationEffect.DEFAULT_AMPLITUDE)
            10 -> VibrationEffect.createWaveform(longArrayOf(0, 90, 70, 90), -1)
            else -> VibrationEffect.createWaveform(longArrayOf(0, 180, 80, 180, 80, 260), -1)
        }
        vibrator.vibrate(effect)
    }

    private fun pendingIntent(context: Context, marker: Int, endWallClock: Long): PendingIntent {
        val intent = Intent(context, RestTimerReceiver::class.java)
            .setAction(ACTION_MARKER)
            .putExtra(EXTRA_MARKER, marker)
            .putExtra(EXTRA_END_WALL, endWallClock)
        return PendingIntent.getBroadcast(
            context,
            requestCode(marker),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
        )
    }

    private fun immutableFlag(): Int = PendingIntent.FLAG_IMMUTABLE
    private fun requestCode(marker: Int): Int = 4200 + marker

}

class RestTimerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != RestTimerCoordinator.ACTION_MARKER) return
        WearWorkoutRepository.get(context).onTimerMarker(
            intent.getIntExtra(RestTimerCoordinator.EXTRA_MARKER, -1),
            intent.getLongExtra(RestTimerCoordinator.EXTRA_END_WALL, -1L)
        )
    }
}

class WearBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            WearWorkoutRepository.get(context).restoreTimerAfterRestart()
        }
    }
}
