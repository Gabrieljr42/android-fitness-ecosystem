package com.evolucao.treino;

import android.app.Application;
import android.app.Notification;
import android.app.Service;
import android.content.ComponentName;
import android.content.Intent;
import androidx.test.core.app.ApplicationProvider;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.android.controller.ServiceController;
import java.time.Duration;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class WorkoutSessionServiceTest {
    private Application app;
    private ServiceController<WorkoutSessionService> controller;
    private long startedAt;

    @Before public void setUp() {
        app = ApplicationProvider.getApplicationContext();
        startedAt = System.currentTimeMillis();
        WorkoutSessionService.updateSession(app, startedAt, startedAt, "A", true);
        controller = Robolectric.buildService(WorkoutSessionService.class).create();
    }

    @After public void tearDown() { controller.destroy(); }

    @Test public void staysForegroundAfterThreeMinutesAndNotificationOpensApp() throws Exception {
        startedAt = System.currentTimeMillis() - 4 * 60_000L;
        WorkoutSessionService.updateSession(app, startedAt, startedAt, "A", false);
        assertEquals(Service.START_STICKY, controller.get().onStartCommand(null, 0, 1));
        shadowOf(android.os.Looper.getMainLooper()).idleFor(Duration.ofMinutes(4));
        assertFalse(shadowOf(controller.get()).isStoppedBySelf());
        Notification notification = shadowOf(controller.get()).getLastForegroundNotification();
        assertNotNull(notification);
        assertEquals(startedAt, notification.when);
        assertTrue((notification.flags & Notification.FLAG_ONGOING_EVENT) != 0);
        notification.contentIntent.send();
        assertEquals(new ComponentName(app, MainActivity.class),
                shadowOf(app).getNextStartedActivity().getComponent());
    }

    @Test public void systemRestartKeepsOriginalSessionClock() {
        controller.get().onStartCommand(null, 0, 1);
        controller.destroy();
        controller = Robolectric.buildService(WorkoutSessionService.class).create();
        assertEquals(Service.START_STICKY, controller.get().onStartCommand(null, 0, 2));
        assertEquals(startedAt, shadowOf(controller.get()).getLastForegroundNotification().when);
    }

    @Test public void finishingSessionStopsServiceAndDoesNotRestartIt() {
        controller.get().onStartCommand(null, 0, 1);
        WorkoutSessionService.updateSession(app, 0, 0, "", true);
        Intent stopped = shadowOf(app).getNextStoppedService();
        assertEquals(new ComponentName(app, WorkoutSessionService.class), stopped.getComponent());
        assertFalse(WorkoutSessionService.hasActiveSession(app));
        assertEquals(Service.START_NOT_STICKY, controller.get().onStartCommand(null, 0, 2));
        assertTrue(shadowOf(controller.get()).isStoppedBySelf());
    }

    @Test public void abandonedSessionStopsAfterExistingThreeHourLimit() {
        controller.get().onStartCommand(null, 0, 1);
        // idleFor avança o uptime do Android, mas não System.currentTimeMillis da JVM.
        // Envelhecer o registro simula o tempo real transcorrido antes do próximo tick.
        app.getSharedPreferences("active_workout_service", Application.MODE_PRIVATE).edit()
                .putLong("lastActiveAt", System.currentTimeMillis()
                        - WorkoutSessionService.INACTIVITY_TIMEOUT_MS - 1).apply();
        shadowOf(android.os.Looper.getMainLooper()).idleFor(Duration.ofMinutes(1));
        assertTrue(shadowOf(controller.get()).isStoppedBySelf());
        assertFalse(WorkoutSessionService.hasActiveSession(app));
    }
}
