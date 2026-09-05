package com.coach.app.notify

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.coach.app.MainActivity
import com.coach.app.R
import java.time.ZonedDateTime

object BriefingTime {
    fun next(now: ZonedDateTime, hour: Int = 5, minute: Int = 40): ZonedDateTime {
        require(hour in 0..23 && minute in 0..59)
        val candidate = now.withHour(hour).withMinute(minute).withSecond(0).withNano(0)
        return if (candidate.isAfter(now)) candidate else candidate.plusDays(1)
    }
}

class BriefingScheduler(private val context: Context) {
    private val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun setEnabled(enabled: Boolean): Long? {
        if (!enabled) {
            alarmManager().cancel(alarmIntent())
            preferences.edit().putBoolean(KEY_ENABLED, false).apply()
            return null
        }
        preferences.edit().putBoolean(KEY_ENABLED, true).apply()
        return scheduleNext()
    }

    fun isEnabled(): Boolean {
        val desired = preferences.getBoolean(KEY_ENABLED, false)
        val permissionGranted = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (desired && !permissionGranted) {
            alarmManager().cancel(alarmIntent())
            preferences.edit().putBoolean(KEY_ENABLED, false).apply()
            return false
        }
        return desired
    }

    fun scheduleNext(now: ZonedDateTime = ZonedDateTime.now()): Long {
        val trigger = BriefingTime.next(now).toInstant().toEpochMilli()
        // This API is deliberately inexact: no privileged exact-alarm permission is requested.
        alarmManager().setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, alarmIntent())
        preferences.edit().putLong(KEY_NEXT_TRIGGER, trigger).apply()
        return trigger
    }

    fun rescheduleIfEnabled() { if (isEnabled()) scheduleNext() }

    private fun alarmManager() = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private fun alarmIntent(): PendingIntent = PendingIntent.getBroadcast(
        context,
        REQUEST_CODE,
        Intent(context, BriefingReceiver::class.java).setAction(ACTION_BRIEFING),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    companion object {
        const val CHANNEL_ID = "daily_briefing"
        private const val PREFS = "coach_notifications"
        private const val KEY_ENABLED = "briefing_enabled"
        private const val KEY_NEXT_TRIGGER = "briefing_next_trigger"
        private const val ACTION_BRIEFING = "com.coach.app.action.DAILY_BRIEFING"
        private const val REQUEST_CODE = 540
    }
}

class BriefingReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val scheduler = BriefingScheduler(context)
        if (!scheduler.isEnabled()) return
        scheduler.scheduleNext()
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel(
            BriefingScheduler.CHANNEL_ID,
            "Briefing diário",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply { description = "Lembrete do briefing de treino e recuperação" })
        val openApp = PendingIntent.getActivity(
            context,
            541,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, BriefingScheduler.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Seu briefing está pronto")
            .setContentText("Confira prontidão, sinais disponíveis e o plano local de hoje.")
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()
        NotificationManagerCompat.from(context).notify(540, notification)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action in setOf(
                Intent.ACTION_BOOT_COMPLETED,
                Intent.ACTION_MY_PACKAGE_REPLACED,
                Intent.ACTION_TIME_CHANGED,
                Intent.ACTION_TIMEZONE_CHANGED
            )) {
            BriefingScheduler(context).rescheduleIfEnabled()
        }
    }
}
