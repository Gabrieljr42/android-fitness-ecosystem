package com.evolucao.treino;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Intent;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class RestNotificationTest {
    private Application application;
    private NotificationManager notifications;

    @Before
    public void setUp() {
        application = ApplicationProvider.getApplicationContext();
        notifications = application.getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(
                "descanso_alerta", "Fim do descanso", NotificationManager.IMPORTANCE_HIGH));
    }

    @Test
    public void tappingAlarmCompletionOpensWorkout() throws Exception {
        Intent alarm = new Intent(application, RestAlarmReceiver.class)
                .setAction(RestAlarmReceiver.ACTION_REST_DONE)
                .putExtra("label", "Supino")
                .putExtra("alertEnabled", true);

        new RestAlarmReceiver().onReceive(application, alarm);

        assertCompletionOpensWorkout("Supino — próxima série!");
    }

    @Test
    public void tappingFallbackCompletionOpensWorkout() throws Exception {
        MainActivity.deliverRestDone(application, "", true);

        assertCompletionOpensWorkout("Pronto! Próxima série.");
    }

    private void assertCompletionOpensWorkout(String expectedBody) throws Exception {
        Notification notification = shadowOf(notifications)
                .getNotification(MainActivity.REST_DONE_NOTIFICATION_ID);
        assertNotNull("O fim do descanso deve publicar uma notificação", notification);
        assertEquals(expectedBody, notification.extras.getString(Notification.EXTRA_TEXT));
        assertTrue((notification.flags & Notification.FLAG_AUTO_CANCEL) != 0);
        assertNotNull("Tocar na notificação deve abrir o app", notification.contentIntent);

        notification.contentIntent.send();

        Intent launched = shadowOf(application).getNextStartedActivity();
        assertNotNull("O toque deve iniciar uma Activity diretamente", launched);
        assertEquals(new ComponentName(application, MainActivity.class), launched.getComponent());
        // Reutilizar a Activity mantém o WebView e o treino em andamento.
        assertTrue((launched.getFlags() & Intent.FLAG_ACTIVITY_SINGLE_TOP) != 0);
        assertTrue((launched.getFlags() & Intent.FLAG_ACTIVITY_CLEAR_TOP) != 0);
        assertEquals(0, launched.getFlags() & Intent.FLAG_ACTIVITY_CLEAR_TASK);
    }
}
