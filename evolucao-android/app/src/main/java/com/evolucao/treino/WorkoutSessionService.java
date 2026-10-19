package com.evolucao.treino;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

/** Mantém a sessão de treino com prioridade de foreground enquanto a tela está fechada.
 * Os registros continuam no localStorage; aqui só persistimos o estado do serviço. */
public class WorkoutSessionService extends Service {
    static final int NOTIFICATION_ID = 3; // Independente dos alertas de descanso (1 e 2).
    static final long INACTIVITY_TIMEOUT_MS = 3 * 3600 * 1000L; // Igual ao logic.js.
    private static final String CHANNEL = "treino_em_andamento";
    private static final String PREFS = "active_workout_service";
    private static volatile boolean running;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable checkInactivity = new Runnable() {
        @Override public void run() {
            if (!hasActiveSession(WorkoutSessionService.this)) {
                stopSession();
            } else {
                handler.postDelayed(this, 60_000L);
            }
        }
    };

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean hasActiveSession(Context context) {
        SharedPreferences state = prefs(context);
        long startedAt = state.getLong("startedAt", 0);
        long lastActiveAt = state.getLong("lastActiveAt", startedAt);
        return startedAt > 0 && lastActiveAt > 0
                && System.currentTimeMillis() - lastActiveAt <= INACTIVITY_TIMEOUT_MS;
    }

    static void updateSession(Context context, long startedAt, long lastActiveAt,
                              String day, boolean appVisible) {
        prefs(context).edit().putLong("startedAt", startedAt)
                .putLong("lastActiveAt", lastActiveAt > 0 ? lastActiveAt : startedAt)
                .putString("day", day == null ? "" : day).apply();
        Intent service = new Intent(context, WorkoutSessionService.class);
        if (!hasActiveSession(context)) {
            prefs(context).edit().clear().apply();
            context.stopService(service);
            return;
        }
        // Android 12+: iniciar pelo treino visível; em background só atualizar
        // o serviço existente. onResume tenta novamente se o sistema o encerrou.
        if (!appVisible && !running) return;
        try {
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service);
            else context.startService(service);
        } catch (RuntimeException error) {
            Log.w("WorkoutSession", "Não foi possível manter o treino em foreground", error);
        }
    }

    @Override public void onCreate() {
        super.onCreate();
        running = true;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL, "Treino em andamento", NotificationManager.IMPORTANCE_LOW);
            channel.setSound(null, null);
            channel.enableVibration(false);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!hasActiveSession(this)) {
            stopSession();
            return START_NOT_STICKY;
        }
        SharedPreferences state = prefs(this);
        String day = state.getString("day", "");
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Notification notification = builder
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("Treino em andamento")
                .setContentText((day.isEmpty() ? "" : "Treino " + day + " · ") + "Toque para voltar")
                .setContentIntent(MainActivity.appPendingIntent(this))
                .setWhen(state.getLong("startedAt", System.currentTimeMillis()))
                .setShowWhen(true).setUsesChronometer(true)
                .setOngoing(true).setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setPriority(Notification.PRIORITY_LOW).build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        handler.removeCallbacks(checkInactivity);
        handler.postDelayed(checkInactivity, 60_000L);
        // Reinício pelo sistema restaura os horários, sem reiniciar o cronômetro.
        return START_STICKY;
    }

    private void stopSession() {
        prefs(this).edit().clear().apply();
        handler.removeCallbacks(checkInactivity);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onDestroy() {
        running = false;
        handler.removeCallbacks(checkInactivity);
        stopForeground(STOP_FOREGROUND_REMOVE);
        // Não apagar horários aqui: o sistema pode recriar o serviço.
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
