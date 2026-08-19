package com.evolucao.treino;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private WebView web;
    private static final String CH_TIMER = "descanso";
    private static final String CH_ALERT = "descanso_alerta";
    private static final int REST_NOTIFICATION_ID = 1;
    private static final int REST_DONE_NOTIFICATION_ID = 2;
    private static final int FILE_CHOOSER_CODE = 51;
    private static final int BLE_PERMISSION_REQ_CODE = 201;

    private ValueCallback<Uri[]> filePathCallback;
    private final Handler restHandler = new Handler(Looper.getMainLooper());
    private boolean restActive;
    private boolean restAlertEnabled = true;
    private boolean restAlertPosted;
    private boolean appInForeground;
    private long restEndAt;
    private String restLabel = "";

    private ScaleBleScanner bleScanner;

    private String restClock(long seconds) {
        long safe = Math.max(0, seconds);
        return (safe / 60) + ":" + String.format(java.util.Locale.US, "%02d", safe % 60);
    }

    private PendingIntent appPendingIntent() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, 0, intent, flags);
    }

    private Notification restNotification(String title, String body, boolean ongoing, boolean alert) {
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            nb = new Notification.Builder(this, alert ? CH_ALERT : CH_TIMER);
        }
        else {
            nb = new Notification.Builder(this);
            if (alert) {
                nb.setPriority(Notification.PRIORITY_HIGH);
                nb.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
                nb.setVibrate(new long[]{0, 250, 150, 250});
            } else {
                nb.setPriority(Notification.PRIORITY_LOW);
                nb.setDefaults(0);
                nb.setSound(null);
            }
        }
        return nb.setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(appPendingIntent())
                .setOngoing(ongoing)
                .setOnlyAlertOnce(ongoing)
                .setAutoCancel(!ongoing)
                .build();
    }

    private void updateRestNotification(String body, boolean ongoing) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(REST_NOTIFICATION_ID, restNotification("Descanso", body, ongoing, false));
    }

    private void postRestDoneNotification(String body, boolean alert) {
        if (restAlertPosted) return;
        restAlertPosted = true;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.cancel(REST_NOTIFICATION_ID);
        nm.notify(REST_DONE_NOTIFICATION_ID, restNotification("Descanso", body, false, alert));
    }

    private final Runnable restTicker = new Runnable() {
        @Override public void run() {
            if (!restActive) return;
            long left = Math.max(0, (restEndAt - System.currentTimeMillis() + 999) / 1000);
            if (left <= 0) {
                restActive = false;
                postRestDoneNotification(
                        restLabel.isEmpty() ? "Pronto! Próxima série." : restLabel + " — próxima série!",
                        restAlertEnabled && !appInForeground);
                return;
            }
            updateRestNotification(restClock(left) + " restantes" + (restLabel.isEmpty() ? "" : " · " + restLabel), true);
            restHandler.postDelayed(this, 1000L);
        }
    };

    private void runOnJs(final String js) {
        if (web == null) return;
        web.post(new Runnable() {
            @Override
            public void run() {
                if (web != null) {
                    web.evaluateJavascript(js, null);
                }
            }
        });
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createChannel();
        requestNotifPermission();

        // Inicializa o Scanner BLE de diagnóstico e medição
        bleScanner = new ScaleBleScanner(this, new ScaleBleScanner.BleScanListener() {
            @Override
            public void onScanStateChanged(final boolean scanning, final String statusMessage) {
                try {
                    final JSONObject diagJson = new JSONObject();
                    diagJson.put("scanning", scanning);
                    diagJson.put("message", statusMessage);

                    final JSONObject scaleState = new JSONObject();
                    scaleState.put("state", scanning ? "SCANNING" : "IDLE");
                    scaleState.put("scanning", scanning);
                    scaleState.put("message", statusMessage);

                    runOnJs("if (window.onBleScanStateChanged) window.onBleScanStateChanged(" + diagJson.toString() + ");" +
                            "if (window.onScaleStateChanged) window.onScaleStateChanged(" + scaleState.toString() + ");");
                } catch (Exception e) { /* ignore */ }
            }

            @Override
            public void onAdvertisementsBatchReceived(final JSONArray batchJson) {
                if (batchJson == null || batchJson.length() == 0) return;
                runOnJs("if (window.onBleAdvertisementsBatch) { window.onBleAdvertisementsBatch(" + batchJson.toString() + "); } else if (window.onBleAdvertisement) { var _arr=" + batchJson.toString() + "; for(var _i=0;_i<_arr.length;_i++) window.onBleAdvertisement(_arr[_i]); }");
            }

            @Override
            public void onScanError(final int errorCode, final String errorMessage) {
                try {
                    final JSONObject json = new JSONObject();
                    json.put("code", errorCode);
                    json.put("message", errorMessage);
                    final String jsonStr = json.toString();

                    runOnJs("if (window.onBleScanError) window.onBleScanError(" + jsonStr + ");" +
                            "if (window.onScaleError) window.onScaleError(" + jsonStr + ");");
                } catch (Exception e) { /* ignore */ }
            }

            @Override
            public void onScaleMeasurementPacket(final DavelyMeasurementPacket packet) {
                if (packet == null || !packet.isValid()) return;
                final String jsonStr = packet.toJsonString();
                runOnJs("if (window.onScaleMeasurement) window.onScaleMeasurement(" + jsonStr + ");");
            }

            @Override
            public void onScaleTelemetryUpdated(final JSONObject telemetry) {
                if (telemetry == null) return;
                final String jsonStr = telemetry.toString();
                runOnJs("if (window.onScaleTelemetry) window.onScaleTelemetry(" + jsonStr + ");");
            }
        });

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        // sem isto, CSS/JS em subpastas de file:///android_asset/ sao
        // bloqueados por seguranca (era por isso que o CSS nao carregava)
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        // Sem isto, <input type=file> nao abre NADA dentro de uma WebView pura
        // (era por isso que "Restaurar" nao funcionava no app instalado).
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType("*/*");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    startActivityForResult(Intent.createChooser(intent, "Selecionar backup"), FILE_CHOOSER_CODE);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        appInForeground = true;
    }

    @Override
    protected void onPause() {
        appInForeground = false;
        if (bleScanner != null) {
            bleScanner.stopScan();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (bleScanner != null) {
            bleScanner.stopScan();
        }
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_CODE) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{ data.getData() };
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == BLE_PERMISSION_REQ_CODE) {
            boolean allGranted = true;
            if (grantResults == null || grantResults.length == 0) {
                allGranted = false;
            } else {
                for (int res : grantResults) {
                    if (res != PackageManager.PERMISSION_GRANTED) {
                        allGranted = false;
                        break;
                    }
                }
            }
            if (allGranted) {
                runOnJs("if (window.onScalePermissionResult) window.onScalePermissionResult(true);");
                if (bleScanner != null) {
                    bleScanner.startScan();
                }
            } else {
                try {
                    JSONObject err = new JSONObject();
                    err.put("code", 103);
                    err.put("message", "Permissão necessária de Bluetooth não foi concedida.");
                    String errStr = err.toString();
                    runOnJs("if (window.onScalePermissionResult) window.onScalePermissionResult(false);" +
                            "if (window.onBleScanError) window.onBleScanError(" + errStr + ");" +
                            "if (window.onScaleError) window.onScaleError(" + errStr + ");");
                } catch (Exception e) { /* ignore */ }
            }
        } else {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        }
    }

    private void requestNotifPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 100);
            }
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel timerChannel = new NotificationChannel(
                    CH_TIMER, "Descanso", NotificationManager.IMPORTANCE_LOW);
            timerChannel.enableVibration(false);
            timerChannel.setSound(null, null);

            NotificationChannel alertChannel = new NotificationChannel(
                    CH_ALERT, "Fim do descanso", NotificationManager.IMPORTANCE_HIGH);
            alertChannel.enableVibration(true);
            alertChannel.setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                    new AudioAttributes.Builder()
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                            .build());

            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(timerChannel);
                nm.createNotificationChannel(alertChannel);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    public class Bridge {
        @JavascriptInterface
        public void startRestNotification(final String label, final long endAt, final boolean alertEnabled) {
            restHandler.post(new Runnable() {
                @Override public void run() {
                    restLabel = label == null ? "" : label;
                    restEndAt = endAt;
                    restActive = true;
                    restAlertEnabled = alertEnabled;
                    restAlertPosted = false;
                    restHandler.removeCallbacks(restTicker);
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(REST_DONE_NOTIFICATION_ID);
                    restTicker.run();
                }
            });
        }

        @JavascriptInterface
        public void stopRestNotification() {
            restHandler.post(new Runnable() {
                @Override public void run() {
                    restActive = false;
                    restHandler.removeCallbacks(restTicker);
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    restAlertPosted = false;
                    if (nm != null) {
                        nm.cancel(REST_NOTIFICATION_ID);
                        nm.cancel(REST_DONE_NOTIFICATION_ID);
                    }
                }
            });
        }

        @JavascriptInterface
        public void restDoneNotification(final String label, final boolean alertEnabled) {
            restHandler.post(new Runnable() {
                @Override public void run() {
                    restActive = false;
                    restHandler.removeCallbacks(restTicker);
                    restLabel = label == null ? "" : label;
                    restAlertEnabled = alertEnabled;
                    postRestDoneNotification(
                            restLabel.isEmpty() ? "Pronto! Próxima série." : restLabel + " — próxima série!",
                            restAlertEnabled && !appInForeground);
                }
            });
        }

        @JavascriptInterface
        public void sendNotification(String title, String body) {
            try {
                Notification.Builder nb;
                if (Build.VERSION.SDK_INT >= 26) {
                    // setSilent() e da AndroidX (NotificationCompat), nao existe na classe nativa
                    // Notification.Builder. O canal ja sai mudo por createChannel() (setSound(null,null)
                    // + enableVibration(false)), e no Android 8+ o canal manda nessas configs mesmo.
                    nb = new Notification.Builder(MainActivity.this, CH_TIMER);
                } else {
                    nb = new Notification.Builder(MainActivity.this);
                    nb.setDefaults(0);
                    nb.setSound(null);
                }
                nb.setSmallIcon(android.R.drawable.ic_popup_reminder)
                  .setContentTitle(title)
                  .setContentText(body)
                  .setContentIntent(appPendingIntent())
                  .setAutoCancel(true);
                NotificationManager nm =
                        (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.notify(1, nb.build());
            } catch (Exception e) { /* ignore */ }
        }

        @JavascriptInterface
        public void vibrate(long ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null) return;
                if (Build.VERSION.SDK_INT >= 26) {
                    v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(ms);
                }
            } catch (Exception e) { /* ignore */ }
        }

        // Salvamento nativo do backup: um <a download> com blob: geralmente NAO
        // dispara nada dentro de uma WebView pura (sem download manager ligado).
        // Aqui gravamos direto em Downloads/ (API 29+) ou na pasta do app (mais antigo).
        @JavascriptInterface
        public void saveBackup(final String json, final String filename) {
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    cv.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    cv.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri != null) {
                        OutputStream os = getContentResolver().openOutputStream(uri);
                        if (os != null) { os.write(json.getBytes("UTF-8")); os.close(); }
                        cv.clear(); cv.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(uri, cv, null, null);
                        runOnUiThread(new Runnable() { public void run() {
                            Toast.makeText(MainActivity.this, "Salvo em Downloads/" + filename, Toast.LENGTH_LONG).show();
                        }});
                        return;
                    }
                }
                File dir = getExternalFilesDir(null);
                File f = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(f);
                fos.write(json.getBytes("UTF-8"));
                fos.close();
                final String path = f.getAbsolutePath();
                runOnUiThread(new Runnable() { public void run() {
                    Toast.makeText(MainActivity.this, "Salvo em " + path, Toast.LENGTH_LONG).show();
                }});
            } catch (Exception e) {
                runOnUiThread(new Runnable() { public void run() {
                    Toast.makeText(MainActivity.this, "Erro ao salvar backup", Toast.LENGTH_LONG).show();
                }});
            }
        }

        // =========================================================================
        // BLE SCALE MEASUREMENT & DIAGNOSTIC BRIDGE METHODS (Milestone M3)
        // =========================================================================

        @JavascriptInterface
        public void startScaleMeasurement() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (bleScanner == null) return;
                    if (bleScanner.hasRequiredPermissions()) {
                        bleScanner.startScan();
                    } else if (Build.VERSION.SDK_INT >= 23) {
                        requestPermissions(bleScanner.getRequiredPermissions(), BLE_PERMISSION_REQ_CODE);
                    } else {
                        bleScanner.startScan();
                    }
                }
            });
        }

        @JavascriptInterface
        public void stopScaleMeasurement() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (bleScanner != null) {
                        bleScanner.stopScan();
                    }
                }
            });
        }

        @JavascriptInterface
        public String getBleTelemetry() {
            return bleScanner != null ? bleScanner.getTelemetryJson().toString() : "{}";
        }

        @JavascriptInterface
        public void startBleScan() {
            startScaleMeasurement();
        }

        @JavascriptInterface
        public void stopBleScan() {
            stopScaleMeasurement();
        }

        @JavascriptInterface
        public boolean isBluetoothAvailable() {
            return bleScanner != null && bleScanner.isBluetoothSupported();
        }

        @JavascriptInterface
        public boolean isBluetoothEnabled() {
            return bleScanner != null && bleScanner.isBluetoothEnabled();
        }

        @JavascriptInterface
        public boolean hasBlePermissions() {
            return bleScanner != null && bleScanner.hasRequiredPermissions();
        }

        @JavascriptInterface
        public void requestBlePermissions() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (bleScanner != null && Build.VERSION.SDK_INT >= 23) {
                        requestPermissions(bleScanner.getRequiredPermissions(), BLE_PERMISSION_REQ_CODE);
                    }
                }
            });
        }

        @JavascriptInterface
        public String getBleDiagnosticState() {
            return bleScanner != null ? bleScanner.getDiagnosticState().toString() : "{}";
        }

        @JavascriptInterface
        public void copyToClipboard(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                        if (cm != null) {
                            ClipData cd = ClipData.newPlainText("Evolucao BLE Diagnostic", text != null ? text : "");
                            cm.setPrimaryClip(cd);
                            Toast.makeText(MainActivity.this, "Copiado para a área de transferência", Toast.LENGTH_SHORT).show();
                        }
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Falha ao copiar", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void saveBleDiagnosticFile(final String content, final String filename, final String mimeType) {
            try {
                String safeMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "text/plain";
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    cv.put(MediaStore.Downloads.MIME_TYPE, safeMime);
                    cv.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri != null) {
                        OutputStream os = getContentResolver().openOutputStream(uri);
                        if (os != null) {
                            os.write((content != null ? content : "").getBytes("UTF-8"));
                            os.close();
                        }
                        cv.clear();
                        cv.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(uri, cv, null, null);
                        runOnUiThread(new Runnable() {
                            public void run() {
                                Toast.makeText(MainActivity.this, "Diagnóstico salvo em Downloads/" + filename, Toast.LENGTH_LONG).show();
                            }
                        });
                        return;
                    }
                }
                File dir = getExternalFilesDir(null);
                File f = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(f);
                fos.write((content != null ? content : "").getBytes("UTF-8"));
                fos.close();
                final String path = f.getAbsolutePath();
                runOnUiThread(new Runnable() {
                    public void run() {
                        Toast.makeText(MainActivity.this, "Salvo em " + path, Toast.LENGTH_LONG).show();
                    }
                });
            } catch (Exception e) {
                runOnUiThread(new Runnable() {
                    public void run() {
                        Toast.makeText(MainActivity.this, "Erro ao salvar arquivo de diagnóstico", Toast.LENGTH_LONG).show();
                    }
                });
            }
        }
    }
}
