package com.evolucao.treino;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.app.Notification;
import android.app.NotificationManager;

/**
 * Disparado por AlarmManager.setExactAndAllowWhileIdle no fim do descanso.
 * Funciona em Doze (o antigo ticker de 1 s era adiado e congelava a contagem).
 * Se o app está em foreground, o JS cuida do feedback e este receiver apenas
 * limpa a notificação de contagem.
 */
public class RestAlarmReceiver extends BroadcastReceiver {
    public static final String ACTION_REST_DONE = "com.evolucao.treino.ACTION_REST_DONE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_REST_DONE.equals(intent.getAction())) return;
        String label = intent.getStringExtra("label");
        boolean alertEnabled = intent.getBooleanExtra("alertEnabled", true);

        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Remove a contagem ativa em qualquer caso
        nm.cancel(MainActivity.REST_NOTIFICATION_ID);

        // Em foreground o JS já vibrou/tostrou — não duplicar alerta
        if (MainActivity.isAppForeground()) return;
        if (!alertEnabled) return;

        String body = (label == null || label.isEmpty())
                ? "Pronto! Próxima série."
                : label + " — próxima série!";
        Notification nb = MainActivity.buildRestDoneNotification(context, body);
        if (nb != null) nm.notify(MainActivity.REST_DONE_NOTIFICATION_ID, nb);
    }
}
