package com.evolucao.treino.wear.system

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.wear.ongoing.OngoingActivity
import com.evolucao.treino.protocol.WorkoutPlan
import com.evolucao.treino.protocol.WorkoutSession
import com.evolucao.treino.wear.MainActivity
import com.evolucao.treino.wear.R

object WorkoutOngoingActivity {
    private const val CHANNEL = "workout_ongoing"
    private const val NOTIFICATION_ID = 4242

    fun show(context: Context, plan: WorkoutPlan, session: WorkoutSession, completedSets: Int) {
        createChannel(context)
        val totalSets = plan.exercises.sumOf { it.prescriptions.size }
        val currentName = plan.exercises.firstOrNull {
            it.exerciseId == session.currentExerciseId
        }?.name ?: plan.name
        val launchIntent = Intent(context, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
        )
        val builder = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_workout)
            .setContentTitle("Treino em andamento")
            .setContentText("$currentName · $completedSets/$totalSets séries")
            .setContentIntent(pendingIntent)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        OngoingActivity.Builder(context, NOTIFICATION_ID, builder)
            .setStaticIcon(R.drawable.ic_workout)
            .setTouchIntent(pendingIntent)
            .build()
            .apply(context)

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.notify(NOTIFICATION_ID, builder.build())
    }

    fun cancel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.cancel(NOTIFICATION_ID)
    }

    private fun createChannel(context: Context) {
        val channel = NotificationChannel(
            CHANNEL,
            "Treino em andamento",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Atalho silencioso para voltar ao treino"
            enableVibration(false)
            setSound(null, null)
        }
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.createNotificationChannel(channel)
    }

    private fun immutableFlag(): Int = PendingIntent.FLAG_IMMUTABLE
}
