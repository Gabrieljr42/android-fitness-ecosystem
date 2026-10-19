package com.nutricao.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * BroadcastReceiver para alarmes exatos de lembretes de refeicao do NutriTrack.
 * Executa em background, exibe notificacoes nativas, reagenda o alarme para 24h
 * depois e restaura todos os alarmes salvos apos reinicializacao do aparelho.
 */
public class NotificationReceiver extends BroadcastReceiver {
    private static final String TAG = "NutriTrackNotif";
    public static final String ACTION_MEAL_REMINDER = "com.nutricao.app.ACTION_MEAL_REMINDER";
    public static final String CHANNEL_ID = "nutricao_lembretes";
    public static final String CHANNEL_NAME = "Lembretes de Refeição";
    public static final String PREFS_NAME = "nutritrack_alarms";
    public static final String KEY_REMINDERS = "reminders_json";

    private static final String[] POSITIVE_MESSAGES = {
        "Chegou o horário do seu lembrete de refeição.",
        "Se quiser, registre sua refeição no NutriTrack.",
        "Uma pausa para a refeição, no seu tempo.",
        "Seu lembrete de refeição está aqui.",
        "Abra o NutriTrack para adicionar uma refeição ao diário.",
        "Já fez sua refeição? Você pode registrá-la no app.",
        "Um lembrete para acompanhar suas refeições.",
        "Quando for conveniente, atualize seu diário alimentar.",
        "O NutriTrack está disponível para registrar sua refeição.",
        "Este é o horário que você escolheu para o lembrete.",
        "Você pode consultar os registros de hoje no app.",
        "Registre sua refeição quando puder.",
        "Seu diário alimentar está a um toque.",
        "Uma pausa para conferir seus registros, se desejar.",
        "Lembrete programado: acompanhe sua alimentação no app."
    };

    public static String getPositiveMessageFor(String name) {
        if (name == null || name.trim().isEmpty()) name = "Refeição";
        String cleanName = name.replace("NutriTrack ⏰", "").trim();
        String lower = cleanName.toLowerCase();
        if (lower.contains("água") || lower.contains("agua") || lower.contains("hidrata")) {
            return "Lembrete para beber água ao longo do dia.";
        }
        if (lower.contains("creatina")) {
            return "Lembrete de creatina no horário que você configurou.";
        }
        if (lower.contains("pré-treino") || lower.contains("pre-treino") || lower.contains("pre treino")) {
            return "Lembrete de pré-treino no horário que você configurou.";
        }
        if (lower.contains("pós-treino") || lower.contains("pos-treino") || lower.contains("pos treino")) {
            return "Lembrete de pós-treino no horário que você configurou.";
        }
        int idx = (int) (Math.random() * POSITIVE_MESSAGES.length);
        return POSITIVE_MESSAGES[idx];
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
                || "android.intent.action.MY_PACKAGE_REPLACED".equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
            Log.d(TAG, "Boot completado / pacote atualizado. Reagendando alarmes...");
            rescheduleAllAlarms(context);
            return;
        }

        if (ACTION_MEAL_REMINDER.equals(action) || intent.hasExtra("time") || intent.hasExtra("id")) {
            String id = intent.getStringExtra("id");
            String title = intent.getStringExtra("title");
            String message = intent.getStringExtra("message");
            String timeStr = intent.getStringExtra("time");

            if (title == null || title.trim().isEmpty()) {
                title = "NutriTrack ⏰ Lembrete";
            }
            // Resolve o texto atual também para alarmes criados antes da atualização.
            message = getPositiveMessageFor(title);

            Log.d(TAG, "Disparando notificacao de lembrete: " + id + " - " + title);
            showNotification(context, id, title, message);

            // Rearma o alarme para o dia seguinte com um lembrete neutro.
            if (id != null && timeStr != null && !timeStr.trim().isEmpty()) {
                String nextMessage = getPositiveMessageFor(title);
                rearmAlarm(context, id, title, nextMessage, timeStr);
            }
        }
    }

    /**
     * Exibe a notificacao nativa no canal configurado.
     */
    public static void showNotification(Context context, String id, String title, String message) {
        createNotificationChannel(context);

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        int reqCode = getRequestCodeForId(id);
        PendingIntent contentIntent = PendingIntent.getActivity(context, reqCode, openIntent, flags);

        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            nb = new Notification.Builder(context, CHANNEL_ID);
        } else {
            nb = new Notification.Builder(context);
            nb.setDefaults(Notification.DEFAULT_ALL);
            nb.setPriority(Notification.PRIORITY_HIGH);
        }

        nb.setSmallIcon(android.R.drawable.ic_popup_reminder)
          .setContentTitle(title)
          .setContentText(message)
          .setContentIntent(contentIntent)
          .setAutoCancel(true);

        if (Build.VERSION.SDK_INT >= 21) {
            nb.setVisibility(Notification.VISIBILITY_PUBLIC);
        }

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(reqCode, nb.build());
        }
    }

    /**
     * Agenda um alarme exato que acorda o dispositivo mesmo em Doze Mode (RTC_WAKEUP).
     * Sem permissão de alarme exato (Android 14+/targetSdk 34 negam por padrão),
     * usa alarme inexato como fallback para o lembrete ao menos disparar.
     */
    public static void scheduleAlarm(Context context, String id, String title, String message, String timeStr) {
        if (timeStr == null || !timeStr.contains(":")) return;
        try {
            String[] parts = timeStr.trim().split(":");
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);

            Calendar now = Calendar.getInstance();
            Calendar target = Calendar.getInstance();
            target.set(Calendar.HOUR_OF_DAY, hour);
            target.set(Calendar.MINUTE, minute);
            target.set(Calendar.SECOND, 0);
            target.set(Calendar.MILLISECOND, 0);

            if (target.getTimeInMillis() <= now.getTimeInMillis()) {
                target.add(Calendar.DAY_OF_YEAR, 1);
            }

            long triggerAtMillis = target.getTimeInMillis();

            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent alarmIntent = new Intent(context, NotificationReceiver.class);
            alarmIntent.setAction(ACTION_MEAL_REMINDER);
            alarmIntent.putExtra("id", id);
            alarmIntent.putExtra("title", title);
            alarmIntent.putExtra("message", message);
            alarmIntent.putExtra("time", timeStr);

            int requestCode = getRequestCodeForId(id);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pi = PendingIntent.getBroadcast(context, requestCode, alarmIntent, flags);

            scheduleAlarmWithFallback(am, triggerAtMillis, pi, canScheduleExactAlarms(context));

            Log.d(TAG, "Alarme agendado para [" + id + "] em " + target.getTime().toString()
                    + (canScheduleExactAlarms(context) ? " (exato)" : " (inexato: sem permissão de alarme exato)"));
        } catch (Exception e) {
            Log.e(TAG, "Erro ao agendar alarme para " + id, e);
        }
    }

    public static boolean canScheduleExactAlarms(Context context) {
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
                return am != null && am.canScheduleExactAlarms();
            } catch (Exception ignored) {
                return false;
            }
        }
        return true;
    }

    private static void scheduleAlarmWithFallback(AlarmManager am, long triggerAtMillis,
                                                  PendingIntent pi, boolean exactAllowed) {
        if (exactAllowed) {
            try {
                if (Build.VERSION.SDK_INT >= 23) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
                } else if (Build.VERSION.SDK_INT >= 19) {
                    am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
                } else {
                    am.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
                }
                return;
            } catch (SecurityException se) {
                Log.w(TAG, "Sem permissão de alarme exato; usando fallback inexato.", se);
            }
        }
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao agendar alarme inexato", e);
        }
    }

    /**
     * Cancela o alarme de um determinado slot.
     */
    public static void cancelAlarm(Context context, String id) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent alarmIntent = new Intent(context, NotificationReceiver.class);
            alarmIntent.setAction(ACTION_MEAL_REMINDER);

            int requestCode = getRequestCodeForId(id);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pi = PendingIntent.getBroadcast(context, requestCode, alarmIntent, flags);
            am.cancel(pi);
            pi.cancel();
            Log.d(TAG, "Alarme cancelado para [" + id + "]");
        } catch (Exception e) {
            Log.e(TAG, "Erro ao cancelar alarme para " + id, e);
        }
    }

    /**
     * Rearma o alarme para 24 horas no futuro.
     */
    private static void rearmAlarm(Context context, String id, String title, String message, String timeStr) {
        scheduleAlarm(context, id, title, message, timeStr);
    }

    /**
     * Reagenda todos os alarmes salvos no SharedPreferences.
     */
    public static void rescheduleAllAlarms(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String json = prefs.getString(KEY_REMINDERS, null);
            if (json == null || json.trim().isEmpty()) {
                Log.d(TAG, "Nenhum alarme salvo para reagendar.");
                return;
            }

            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.getJSONObject(i);
                String id = item.optString("id", "lembrete_" + i);
                String nome = item.optString("nome", item.optString("name", "Refeição"));
                String hora = item.optString("hora", item.optString("time", ""));
                boolean ativo = item.optBoolean("ativo", item.optBoolean("enabled", true));

                if (ativo && !hora.isEmpty()) {
                    String title = "NutriTrack ⏰ " + nome;
                    String msg = getPositiveMessageFor(nome);
                    scheduleAlarm(context, id, title, msg, hora);
                } else {
                    cancelAlarm(context, id);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao restaurar alarmes apos boot", e);
        }
    }

    /**
     * Garante criacao do NotificationChannel em Android 8.0+ (API 26+).
     */
    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Lembretes de horários para alimentação e hidratação");
            channel.enableVibration(true);
            channel.setShowBadge(true);
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Mapeia ID de string para request code inteiro estavel.
     */
    public static int getRequestCodeForId(String id) {
        if (id == null || id.isEmpty()) return 1000;
        return Math.abs(id.hashCode() % 100000) + 1000;
    }
}
