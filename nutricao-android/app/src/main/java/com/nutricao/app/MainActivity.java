package com.nutricao.app;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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

/**
 * NutriTrack — WebView wrapper com suporte a camera, backup, notificacoes locais,
 * integracao com AlarmManager nativo para segundo plano e haptics.
 */
public class MainActivity extends Activity {
    private WebView web;
    private static final int FILE_CHOOSER_CODE = 51;
    private static final int NOTIF_PERM_CODE = 102;
    public static final String CHANNEL_ID = "nutricao_lembretes";
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraOutputUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestCameraPermission();
        createNotificationChannel();
        requestNotificationPermission();

        // Sincroniza e agenda alarmes salvos caso o processo seja recriado
        NotificationReceiver.rescheduleAllAlarms(this);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        // abre camera/galeria (para a foto do prato) e o seletor de backup
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    try {
                        filePathCallback.onReceiveValue(null);
                    } catch (Exception ignored) {}
                    filePathCallback = null;
                }
                filePathCallback = callback;
                cameraOutputUri = null;
                String[] accepts = params.getAcceptTypes();
                boolean isImage = accepts != null && accepts.length > 0
                        && accepts[0] != null && accepts[0].startsWith("image/");
                Intent intent;
                if (isImage) {
                    // foto do prato: camera direta sem envolver em chooser
                    intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    if (intent.resolveActivity(getPackageManager()) == null) {
                        // sem camera nativa disponivel -> galeria
                        intent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
                        intent.setType("image/*");
                    } else {
                        try {
                            ContentValues cv = new ContentValues();
                            cv.put(MediaStore.Images.Media.DISPLAY_NAME, "nutritrack_foto_" + System.currentTimeMillis() + ".jpg");
                            cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                            cameraOutputUri = getContentResolver().insert(
                                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                            if (cameraOutputUri != null) {
                                intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
                                intent.setClipData(ClipData.newRawUri("", cameraOutputUri));
                                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                            }
                        } catch (Exception ignored) {
                            cameraOutputUri = null;
                        }
                    }
                    try {
                        startActivityForResult(intent, FILE_CHOOSER_CODE);
                    } catch (Exception e) {
                        if (filePathCallback != null) {
                            try { filePathCallback.onReceiveValue(null); } catch (Exception ignored) {}
                            filePathCallback = null;
                        }
                        cameraOutputUri = null;
                        return false;
                    }
                } else {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.setType("*/*");
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    try {
                        startActivityForResult(Intent.createChooser(intent, "Selecionar"), FILE_CHOOSER_CODE);
                    } catch (Exception e) {
                        if (filePathCallback != null) {
                            try { filePathCallback.onReceiveValue(null); } catch (Exception ignored) {}
                            filePathCallback = null;
                        }
                        cameraOutputUri = null;
                        return false;
                    }
                }
                return true;
            }
        });

        setContentView(web);
        // Versao modular: o shell do app modular fica em assets/apps/nutricao/
        // (paths relativos do index.html: theme.css, estado.js, views/*, ../../core/gemini.js)
        web.loadUrl("file:///android_asset/apps/nutricao/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_CODE) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK) {
                Uri picked = null;
                if (data != null && data.getData() != null) {
                    picked = data.getData();
                } else if (cameraOutputUri != null) {
                    // foto tirada com a camera: usar o Uri proprio (data.getData() é null nesse caso)
                    picked = cameraOutputUri;
                }
                if (picked != null) {
                    results = new Uri[]{ picked };
                }
            }
            // se results == null, o JS recebe nada e mostra o fallback "nenhuma foto"
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            cameraOutputUri = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    private void requestCameraPermission() {
        if (Build.VERSION.SDK_INT >= 23) {
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, 101);
            }
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIF_PERM_CODE);
            }
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Lembretes de Refeição",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Lembretes de horários para alimentação e hidratação");
            channel.enableVibration(true);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private PendingIntent getAppPendingIntent() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(this, 0, intent, flags);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** Bridge chamada do JS para notificacoes, vibracao, agendamento de alarmes e backup. */
    public class Bridge {
        @JavascriptInterface
        public void sendNotification(final String title, final String message) {
            try {
                Notification.Builder nb;
                if (Build.VERSION.SDK_INT >= 26) {
                    nb = new Notification.Builder(MainActivity.this, CHANNEL_ID);
                } else {
                    nb = new Notification.Builder(MainActivity.this);
                    nb.setDefaults(Notification.DEFAULT_ALL);
                    nb.setPriority(Notification.PRIORITY_HIGH);
                }
                nb.setSmallIcon(android.R.drawable.ic_popup_reminder)
                  .setContentTitle(title != null ? title : "NutriTrack")
                  .setContentText(message != null ? message : "")
                  .setContentIntent(getAppPendingIntent())
                  .setAutoCancel(true);

                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    int notifId = (int) (System.currentTimeMillis() & 0xfffffff);
                    nm.notify(notifId, nb.build());
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void syncAlarms(final String jsonReminders) {
            if (jsonReminders == null) return;
            try {
                SharedPreferences prefs = getSharedPreferences(NotificationReceiver.PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit().putString(NotificationReceiver.KEY_REMINDERS, jsonReminders).apply();

                JSONArray arr = new JSONArray(jsonReminders);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject item = arr.getJSONObject(i);
                    String id = item.optString("id", "lembrete_" + i);
                    String nome = item.optString("nome", item.optString("name", "Refeição"));
                    String hora = item.optString("hora", item.optString("time", ""));
                    boolean ativo = item.optBoolean("ativo", item.optBoolean("enabled", true));

                    if (ativo && !hora.isEmpty()) {
                        String title = "NutriTrack ⏰ " + nome;
                        String msg = item.optString("mensagem", item.optString("message", NotificationReceiver.getPositiveMessageFor(nome)));
                        NotificationReceiver.scheduleAlarm(MainActivity.this, id, title, msg, hora);
                    } else {
                        NotificationReceiver.cancelAlarm(MainActivity.this, id);
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void cancelAllAlarms() {
            try {
                SharedPreferences prefs = getSharedPreferences(NotificationReceiver.PREFS_NAME, Context.MODE_PRIVATE);
                String saved = prefs.getString(NotificationReceiver.KEY_REMINDERS, null);
                if (saved != null) {
                    try {
                        JSONArray arr = new JSONArray(saved);
                        for (int i = 0; i < arr.length(); i++) {
                            JSONObject item = arr.getJSONObject(i);
                            String id = item.optString("id", "lembrete_" + i);
                            NotificationReceiver.cancelAlarm(MainActivity.this, id);
                        }
                    } catch (Exception ignored) {}
                }
                String[] defaultIds = {"cafe", "almoco", "lanche", "jantar", "ceia"};
                for (String defId : defaultIds) {
                    NotificationReceiver.cancelAlarm(MainActivity.this, defId);
                }
                prefs.edit().remove(NotificationReceiver.KEY_REMINDERS).apply();
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void scheduleAlarm(final String id, final String title, final String message, final String hour, final boolean enabled) {
            if (enabled && hour != null && !hour.isEmpty()) {
                NotificationReceiver.scheduleAlarm(MainActivity.this, id, title, message, hour);
            } else {
                NotificationReceiver.cancelAlarm(MainActivity.this, id);
            }
        }

        @JavascriptInterface
        public void cancelAlarm(final String id) {
            NotificationReceiver.cancelAlarm(MainActivity.this, id);
        }

        @JavascriptInterface
        public void vibrate(final long ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null) return;
                if (Build.VERSION.SDK_INT >= 26) {
                    v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(ms);
                }
            } catch (Exception ignored) {}
        }

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
    }
}
