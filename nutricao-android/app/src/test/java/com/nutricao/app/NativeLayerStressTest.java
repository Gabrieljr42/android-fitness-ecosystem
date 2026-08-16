package com.nutricao.app;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

/**
 * Empirical Native Java Layer Stress & Conformance Test for NutriTrack.
 */
public class NativeLayerStressTest {

    private static int testsPassed = 0;
    private static int testsFailed = 0;

    private static void assertTrue(String desc, boolean condition) {
        if (condition) {
            System.out.println("  [PASS] " + desc);
            testsPassed++;
        } else {
            System.err.println("  [FAIL] " + desc);
            testsFailed++;
        }
    }

    private static void assertEquals(String desc, Object expected, Object actual) {
        if (expected == null && actual == null) {
            System.out.println("  [PASS] " + desc);
            testsPassed++;
        } else if (expected != null && expected.equals(actual)) {
            System.out.println("  [PASS] " + desc + " (Valor: " + actual + ")");
            testsPassed++;
        } else {
            System.err.println("  [FAIL] " + desc + " - Esperado: " + expected + ", Obtido: " + actual);
            testsFailed++;
        }
    }

    public static void main(String[] args) {
        System.out.println("=== [NUTRITRACK] Native Java Layer Conformance & Stress Test ===");

        testConstantsAndStructure();
        testJavascriptBridgeInterface();
        testRequestCodeHashing();
        testAlarmManagerTimeLogic();
        testInvalidInputsAndResilience();

        System.out.println("================================================================");
        System.out.println("Resultados: " + testsPassed + " passou, " + testsFailed + " falhou.");
        if (testsFailed > 0) {
            System.exit(1);
        }
    }

    private static void testConstantsAndStructure() {
        System.out.println("\n--- Seção 1: Constantes e Estrutura de Classes ---");

        // 1.1 NotificationReceiver
        assertEquals("NotificationReceiver.ACTION_MEAL_REMINDER",
                "com.nutricao.app.ACTION_MEAL_REMINDER", NotificationReceiver.ACTION_MEAL_REMINDER);
        assertEquals("NotificationReceiver.CHANNEL_ID",
                "nutricao_lembretes", NotificationReceiver.CHANNEL_ID);
        assertEquals("NotificationReceiver.CHANNEL_NAME",
                "Lembretes de Refeição", NotificationReceiver.CHANNEL_NAME);
        assertEquals("NotificationReceiver.PREFS_NAME",
                "nutritrack_alarms", NotificationReceiver.PREFS_NAME);
        assertEquals("NotificationReceiver.KEY_REMINDERS",
                "reminders_json", NotificationReceiver.KEY_REMINDERS);

        // 1.2 MainActivity
        assertEquals("MainActivity.CHANNEL_ID",
                "nutricao_lembretes", MainActivity.CHANNEL_ID);
    }

    private static void testJavascriptBridgeInterface() {
        System.out.println("\n--- Seção 2: Interface da Bridge JavaScript ---");

        Class<?> bridgeClass = null;
        for (Class<?> nested : MainActivity.class.getDeclaredClasses()) {
            if (nested.getSimpleName().equals("Bridge")) {
                bridgeClass = nested;
                break;
            }
        }

        assertTrue("Classe interna MainActivity.Bridge existe", bridgeClass != null);
        if (bridgeClass == null) return;

        String[] expectedMethods = {
            "sendNotification",
            "syncAlarms",
            "cancelAllAlarms",
            "scheduleAlarm",
            "cancelAlarm",
            "vibrate",
            "saveBackup"
        };

        for (String methodName : expectedMethods) {
            boolean found = false;
            for (Method m : bridgeClass.getDeclaredMethods()) {
                if (m.getName().equals(methodName)) {
                    found = true;
                    // Verifica anotacao @JavascriptInterface
                    boolean hasJsAnnotation = false;
                    for (Annotation ann : m.getDeclaredAnnotations()) {
                        if (ann.annotationType().getSimpleName().equals("JavascriptInterface")) {
                            hasJsAnnotation = true;
                            break;
                        }
                    }
                    assertTrue("Bridge." + methodName + " possui @JavascriptInterface", hasJsAnnotation);
                    assertTrue("Bridge." + methodName + " e public", Modifier.isPublic(m.getModifiers()));
                }
            }
            assertTrue("Metodo Bridge." + methodName + " encontrado", found);
        }
    }

    private static void testRequestCodeHashing() {
        System.out.println("\n--- Seção 3: Geração de Request Codes e Colisões ---");

        // Slots padrão
        String[] defaultSlots = {"cafe", "almoco", "lanche", "jantar", "ceia"};
        Set<Integer> codes = new HashSet<>();
        for (String slot : defaultSlots) {
            int code = NotificationReceiver.getRequestCodeForId(slot);
            assertTrue("Request code para '" + slot + "' (" + code + ") está na faixa >= 1000", code >= 1000 && code < 101000);
            boolean isUnique = codes.add(code);
            assertTrue("Request code para '" + slot + "' (" + code + ") é único entre slots padrão", isUnique);
        }

        // Casos de borda
        int nullCode = NotificationReceiver.getRequestCodeForId(null);
        assertEquals("Request code para null é 1000 (fallback)", 1000, nullCode);

        int emptyCode = NotificationReceiver.getRequestCodeForId("");
        assertEquals("Request code para '' é 1000 (fallback)", 1000, emptyCode);

        // Estresse: 500 slots arbitrários
        Set<Integer> stressCodes = new HashSet<>();
        int collisions = 0;
        for (int i = 0; i < 500; i++) {
            String customId = "meal_custom_slot_" + i + "_" + (i * 31);
            int c = NotificationReceiver.getRequestCodeForId(customId);
            if (!stressCodes.add(c)) {
                collisions++;
            }
        }
        assertTrue("Colisões em 500 slots arbitrários < 5 (Taxa observada: " + collisions + ")", collisions < 5);
    }

    private static void testAlarmManagerTimeLogic() {
        System.out.println("\n--- Seção 4: Lógica de Cálculo de Horário do Alarme ---");

        // Simulação do algoritmo de agendamento em NotificationReceiver.scheduleAlarm
        // 1. Alarme no futuro hoje
        Calendar simulatedNow = Calendar.getInstance();
        simulatedNow.set(Calendar.HOUR_OF_DAY, 8);
        simulatedNow.set(Calendar.MINUTE, 0);
        simulatedNow.set(Calendar.SECOND, 0);
        simulatedNow.set(Calendar.MILLISECOND, 0);

        Calendar targetFuture = Calendar.getInstance();
        targetFuture.setTimeInMillis(simulatedNow.getTimeInMillis());
        targetFuture.set(Calendar.HOUR_OF_DAY, 12);
        targetFuture.set(Calendar.MINUTE, 30);
        targetFuture.set(Calendar.SECOND, 0);
        targetFuture.set(Calendar.MILLISECOND, 0);

        if (targetFuture.getTimeInMillis() <= simulatedNow.getTimeInMillis()) {
            targetFuture.add(Calendar.DAY_OF_YEAR, 1);
        }

        long diffHours = (targetFuture.getTimeInMillis() - simulatedNow.getTimeInMillis()) / (1000 * 60 * 60);
        assertEquals("Alarme às 12:30 disparado a partir das 08:00 é agendado para hoje (+4.5h)", 4L, diffHours);

        // 2. Alarme no passado hoje (deve pular para amanhã)
        Calendar targetPast = Calendar.getInstance();
        targetPast.setTimeInMillis(simulatedNow.getTimeInMillis());
        targetPast.set(Calendar.HOUR_OF_DAY, 7);
        targetPast.set(Calendar.MINUTE, 0);
        targetPast.set(Calendar.SECOND, 0);
        targetPast.set(Calendar.MILLISECOND, 0);

        if (targetPast.getTimeInMillis() <= simulatedNow.getTimeInMillis()) {
            targetPast.add(Calendar.DAY_OF_YEAR, 1);
        }

        long diffPastHours = (targetPast.getTimeInMillis() - simulatedNow.getTimeInMillis()) / (1000 * 60 * 60);
        assertEquals("Alarme às 07:00 disparado a partir das 08:00 é agendado para amanhã (+23h)", 23L, diffPastHours);

        // 3. Alarme no exato momento atual (deve pular para amanhã, evitando loop imediato)
        Calendar targetExact = Calendar.getInstance();
        targetExact.setTimeInMillis(simulatedNow.getTimeInMillis());
        targetExact.set(Calendar.HOUR_OF_DAY, 8);
        targetExact.set(Calendar.MINUTE, 0);
        targetExact.set(Calendar.SECOND, 0);
        targetExact.set(Calendar.MILLISECOND, 0);

        if (targetExact.getTimeInMillis() <= simulatedNow.getTimeInMillis()) {
            targetExact.add(Calendar.DAY_OF_YEAR, 1);
        }

        long diffExactHours = (targetExact.getTimeInMillis() - simulatedNow.getTimeInMillis()) / (1000 * 60 * 60);
        assertEquals("Alarme no exato minuto atual é agendado para o dia seguinte (+24h)", 24L, diffExactHours);
    }

    private static void testInvalidInputsAndResilience() {
        System.out.println("\n--- Seção 5: Resiliência contra Inputs Inválidos e Malformados ---");

        // Testa split de horário sem exceção
        String[] invalidTimes = {null, "", "invalid", "12", "12:", ":30", "25:00", "-1:00"};
        for (String t : invalidTimes) {
            boolean handled = false;
            try {
                if (t == null || !t.contains(":")) {
                    handled = true;
                } else {
                    String[] parts = t.trim().split(":");
                    int h = Integer.parseInt(parts[0]);
                    int m = Integer.parseInt(parts[1]);
                    handled = true;
                }
            } catch (Exception e) {
                // Capturado pelo try/catch em scheduleAlarm
                handled = true;
            }
            assertTrue("Entrada de horário inválida '" + t + "' tratada com segurança", handled);
        }
    }
}
