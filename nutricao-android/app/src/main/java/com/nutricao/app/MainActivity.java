package com.nutricao.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
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
import android.database.Cursor;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
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
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * NutriTrack — WebView wrapper com suporte a camera, backup, notificacoes locais,
 * integracao com AlarmManager nativo para segundo plano e haptics.
 */
public class MainActivity extends Activity {
    private WebView web;
    private Runnable finishLaunch;
    private boolean launchPageReady;
    private static final int FILE_CHOOSER_CODE = 51;
    private static final int NOTIF_PERM_CODE = 102;
    private static final int AUDIO_PERM_CODE = 103;
    private static final int EXACT_ALARM_REQ_CODE = 104;
    private static final String PREFS_UI = "nutritrack_ui";
    private static final String KEY_EXACT_ASKED = "exact_alarm_asked";
    private static final long MAX_AUDIO_BYTES = 12L * 1024L * 1024L;
    public static final String CHANNEL_ID = "nutricao_lembretes";
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraOutputUri;
    private MediaRecorder audioRecorder;
    private File audioRecordingFile;
    private long audioRecordingStartedAt;
    private boolean audioPermissionPending;

    /** Remove da MediaStore a entrada pendente de foto não utilizada (usuário
     *  cancelou a captura ou o lançamento falhou). Sem isto, linhas vazias de
     *  imagem acumulam na galeria. */
    private void discardCameraOutput() {
        if (cameraOutputUri == null) return;
        try {
            getContentResolver().delete(cameraOutputUri, null, null);
        } catch (Exception ignored) {}
        cameraOutputUri = null;
    }

    private boolean hasAudioPermission() {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void notifyAudioPermissionResult(final boolean granted) {
        audioPermissionPending = false;
        if (web == null) return;
        web.post(new Runnable() {
            @Override public void run() {
                String js = "if(window.__nutriAudioPermissionResult)window.__nutriAudioPermissionResult(" + granted + ");";
                web.evaluateJavascript(js, null);
            }
        });
    }

    private void notifyNotifPermissionResult(final boolean granted, final boolean permanentlyDenied) {
        if (web == null) return;
        web.post(new Runnable() {
            @Override public void run() {
                String js = "if(window.__nutriNotifPermissionResult)window.__nutriNotifPermissionResult("
                        + granted + "," + permanentlyDenied + ");";
                web.evaluateJavascript(js, null);
            }
        });
    }

    private void requestAudioPermissionFromBridge() {
        if (audioPermissionPending) return;
        audioPermissionPending = true;
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (hasAudioPermission()) {
                    notifyAudioPermissionResult(true);
                } else if (Build.VERSION.SDK_INT >= 23) {
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERM_CODE);
                }
            }
        });
    }

    private String audioResult(boolean ok, String code, String message) {
        try {
            JSONObject result = new JSONObject().put("ok", ok);
            if (code != null) result.put("code", code);
            if (message != null) result.put("message", message);
            return result.toString();
        } catch (Exception ignored) {
            return ok ? "{\"ok\":true}" : "{\"ok\":false}";
        }
    }

    private String startAudioCapture() {
        if (!hasAudioPermission()) {
            requestAudioPermissionFromBridge();
            return audioResult(false, "permission_required", "O microfone precisa ser autorizado para gravar.");
        }
        if (audioRecorder != null) return audioResult(false, "already_recording", "Já existe uma gravação em andamento.");

        MediaRecorder recorder = null;
        File output = null;
        try {
            output = File.createTempFile("nutritrack_audio_", ".m4a", getCacheDir());
            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(64000);
            recorder.setAudioSamplingRate(44100);
            recorder.setOutputFile(output.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            audioRecorder = recorder;
            audioRecordingFile = output;
            audioRecordingStartedAt = System.currentTimeMillis();
            return audioResult(true, "recording", null);
        } catch (Exception e) {
            if (recorder != null) {
                try { recorder.reset(); } catch (Exception ignored) {}
                try { recorder.release(); } catch (Exception ignored) {}
            }
            if (output != null) {
                try { output.delete(); } catch (Exception ignored) {}
            }
            audioRecorder = null;
            audioRecordingFile = null;
            return audioResult(false, "recording_failed", "Não foi possível iniciar o microfone.");
        }
    }

    private String stopAudioCapture() {
        MediaRecorder recorder = audioRecorder;
        File output = audioRecordingFile;
        long startedAt = audioRecordingStartedAt;
        audioRecorder = null;
        audioRecordingFile = null;
        audioRecordingStartedAt = 0L;
        if (recorder == null || output == null) {
            return audioResult(false, "not_recording", "Nenhuma gravação está em andamento.");
        }

        try {
            recorder.stop();
        } catch (Exception e) {
            try { recorder.reset(); } catch (Exception ignored) {}
            try { recorder.release(); } catch (Exception ignored) {}
            try { output.delete(); } catch (Exception ignored) {}
            return audioResult(false, "recording_too_short", "Grave por pelo menos um segundo.");
        }
        try { recorder.release(); } catch (Exception ignored) {}

        try {
            long length = output.length();
            if (!output.exists() || length < 128L) {
                output.delete();
                return audioResult(false, "empty_recording", "O áudio ficou vazio. Tente gravar novamente.");
            }
            if (length > MAX_AUDIO_BYTES) {
                output.delete();
                return audioResult(false, "recording_too_large", "A gravação ficou grande demais. Faça um áudio mais curto.");
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream((int) length);
            FileInputStream input = new FileInputStream(output);
            try {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            } finally {
                input.close();
            }
            String encoded = Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
            long duration = Math.max(0L, System.currentTimeMillis() - startedAt);
            JSONObject result = new JSONObject()
                    .put("ok", true)
                    .put("mimeType", "audio/mp4")
                    .put("data", encoded)
                    .put("durationMs", duration);
            output.delete();
            return result.toString();
        } catch (Exception e) {
            try { output.delete(); } catch (Exception ignored) {}
            return audioResult(false, "read_failed", "Não foi possível preparar o áudio para análise.");
        }
    }

    private void cancelAudioCapture() {
        MediaRecorder recorder = audioRecorder;
        File output = audioRecordingFile;
        audioRecorder = null;
        audioRecordingFile = null;
        audioRecordingStartedAt = 0L;
        if (recorder != null) {
            try { recorder.stop(); } catch (Exception ignored) {}
            try { recorder.release(); } catch (Exception ignored) {}
        }
        if (output != null) {
            try { output.delete(); } catch (Exception ignored) {}
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final long launchStarted = android.os.SystemClock.uptimeMillis();
        if (Build.VERSION.SDK_INT >= 31) {
            getSplashScreen().setOnExitAnimationListener(splash -> {
                final boolean[] removed = {false};
                final Runnable remove = () -> {
                    if (removed[0]) return;
                    removed[0] = true;
                    splash.animate().alpha(0f).setDuration(180).withEndAction(() -> splash.remove()).start();
                    finishLaunch = null;
                };
                finishLaunch = () -> {
                    boolean motion = android.animation.ValueAnimator.areAnimatorsEnabled();
                    long remaining = motion ? Math.max(0, 700 - (android.os.SystemClock.uptimeMillis() - launchStarted)) : 0;
                    splash.postDelayed(remove, remaining);
                };
                if (launchPageReady) finishLaunch.run();
                // Uma falha no carregamento nunca deve prender a tela de abertura.
                splash.postDelayed(remove, 2000);
            });
        }
        requestCameraPermission();
        createNotificationChannel();
        requestNotificationPermission();

        // Sincroniza e agenda alarmes salvos caso o processo seja recriado
        NotificationReceiver.rescheduleAllAlarms(this);

        web = new WebView(this);
        web.setBackgroundColor(android.graphics.Color.rgb(16, 21, 16));
        web.setWebViewClient(new android.webkit.WebViewClient() {
            @Override public void onPageCommitVisible(WebView view, String url) {
                launchPageReady = true;
                if (finishLaunch != null) finishLaunch.run();
            }
        });
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
                boolean isImage = false;
                if (accepts != null) {
                    for (String accept : accepts) {
                        if (accept != null && accept.startsWith("image/")) {
                            isImage = true;
                            break;
                        }
                    }
                }
                boolean allowMultiple = isImage
                        && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                Intent intent;
                if (isImage && !allowMultiple) {
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
                        discardCameraOutput();
                        return false;
                    }
                } else {
                    // O fluxo de resumo diário usa <input multiple>: abre a
                    // galeria e devolve todos os URIs escolhidos ao WebView.
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.setType(isImage ? "image/*" : "*/*");
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    if (allowMultiple) {
                        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    }
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
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
                if (data != null && data.getClipData() != null) {
                    ClipData clip = data.getClipData();
                    int count = clip.getItemCount();
                    if (count > 0) {
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = clip.getItemAt(i).getUri();
                        }
                    }
                } else if (data != null && data.getData() != null) {
                    results = new Uri[]{ data.getData() };
                } else if (cameraOutputUri != null) {
                    // foto tirada com a camera: usar o Uri proprio (data.getData() é null nesse caso)
                    results = new Uri[]{ cameraOutputUri };
                }
            }
            // Foto cancelada ou substituída por pick da galeria: descarta a
            // entrada pendente da câmera para não acumular lixo na galeria.
            boolean cameraConsumed = results != null && results.length == 1
                    && cameraOutputUri != null && cameraOutputUri.equals(results[0]);
            if (cameraOutputUri != null && !cameraConsumed) {
                discardCameraOutput();
            } else {
                cameraOutputUri = null; // URI consumida pelo JS
            }
            // se results == null, o JS recebe nada e mostra o fallback "nenhuma foto"
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == AUDIO_PERM_CODE) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            notifyAudioPermissionResult(granted);
        } else if (requestCode == NOTIF_PERM_CODE) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            // A partir do Android 11, duas negativas fazem o sistema parar de
            // exibir o diálogo ("nem pede mais"): detecta e orienta para Ajustes.
            boolean permanentlyDenied = !granted && Build.VERSION.SDK_INT >= 23
                    && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS);
            notifyNotifPermissionResult(granted, permanentlyDenied);
            if (!granted) {
                Toast.makeText(this,
                        permanentlyDenied
                                ? "Notificações bloqueadas — ative em Ajustes do app"
                                : "Permita as notificações para receber os lembretes",
                        Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        promptExactAlarmPermissionIfNeeded();
    }

    @Override
    protected void onDestroy() {
        cancelAudioCapture();
        super.onDestroy();
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        }
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }

    private boolean canScheduleExactAlarms() {
        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            return am != null && am.canScheduleExactAlarms();
        }
        return true;
    }

    private boolean hasActiveReminders() {
        try {
            SharedPreferences prefs = getSharedPreferences(
                    NotificationReceiver.PREFS_NAME, Context.MODE_PRIVATE);
            String saved = prefs.getString(NotificationReceiver.KEY_REMINDERS, null);
            if (saved == null || saved.trim().isEmpty()) return false;
            JSONArray arr = new JSONArray(saved);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                boolean ativo = item.optBoolean("ativo", item.optBoolean("enabled", true));
                String hora = item.optString("hora", item.optString("time", ""));
                if (ativo && hora != null && !hora.trim().isEmpty()) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    /** No Android 14+ (targetSdk 34) o alarme exato nasce negado e o sistema
     *  nunca pergunta sozinho: abre a tela de permissão uma única vez quando
     *  há lembretes ativos. Sem isto, setExactAndAllowWhileIdle lança
     *  SecurityException e nenhum lembrete dispara (falha silenciosa). */
    private void promptExactAlarmPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < 31) return;
        if (canScheduleExactAlarms() || !hasActiveReminders()) return;
        SharedPreferences ui = getSharedPreferences(PREFS_UI, MODE_PRIVATE);
        if (ui.getBoolean(KEY_EXACT_ASKED, false)) return;
        ui.edit().putBoolean(KEY_EXACT_ASKED, true).apply();
        Toast.makeText(this,
                "Permita alarmes exatos para os lembretes tocarem na hora certa",
                Toast.LENGTH_LONG).show();
        openExactAlarmSettings();
    }

    private void openExactAlarmSettings() {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getPackageName()));
                startActivity(i);
                return;
            }
        } catch (Exception ignored) {}
        openAppDetailsSettings();
    }

    private void openAppDetailsSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {}
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
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("typeof handleAppBack === 'function' && handleAppBack()", handled -> {
            if ("true".equals(handled)) return;
            if (web.canGoBack()) web.goBack();
            else MainActivity.super.onBackPressed();
        });
    }

    /** Bridge chamada do JS para notificacoes, vibracao, agendamento de alarmes e backup. */
    public class Bridge {
        @JavascriptInterface
        public boolean hasNativeLaunchAnimation() { return Build.VERSION.SDK_INT >= 31; }
        @JavascriptInterface
        public String startAudioRecording() {
            return startAudioCapture();
        }

        @JavascriptInterface
        public String stopAudioRecording() {
            return stopAudioCapture();
        }

        @JavascriptInterface
        public void cancelAudioRecording() {
            cancelAudioCapture();
        }

        @JavascriptInterface
        public boolean isAudioRecording() {
            return audioRecorder != null;
        }

        /** Consulta o treino diário publicado pelo Evolução. Nunca propaga exceções ao WebView. */
        @JavascriptInterface
        public String getEvolucaoWorkout(final String date) {
            JSONObject error = new JSONObject();
            try {
                if (date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) {
                    error.put("ok", false).put("error", new JSONObject()
                            .put("code", "INVALID_DATE").put("message", "Data deve estar no formato YYYY-MM-DD"));
                    return error.toString();
                }
                Uri uri = Uri.parse("content://com.evolucao.treino.workouts/workouts")
                        .buildUpon().appendQueryParameter("date", date).build();
                Cursor cursor = null;
                try {
                    cursor = getContentResolver().query(uri, new String[]{"_id", "payload"},
                            null, null, "_id DESC");
                    if (cursor == null || !cursor.moveToFirst()) {
                        error.put("ok", false).put("error", new JSONObject()
                                .put("code", "NO_DATA").put("message", "Nenhum treino encontrado para esta data"));
                        return error.toString();
                    }
                    int payloadIndex = cursor.getColumnIndex("payload");
                    String raw = payloadIndex >= 0 ? cursor.getString(payloadIndex) : null;
                    if (raw == null || raw.trim().isEmpty()) {
                        error.put("ok", false).put("error", new JSONObject()
                                .put("code", "EMPTY_PAYLOAD").put("message", "O treino publicado não possui dados"));
                        return error.toString();
                    }
                    // Validar e devolver JSON do contrato, sem embrulhar nem alterar o payload.
                    return new JSONObject(raw).toString();
                } finally {
                    if (cursor != null) cursor.close();
                }
            } catch (Exception e) {
                try {
                    error.put("ok", false).put("error", new JSONObject()
                            .put("code", "PROVIDER_UNAVAILABLE")
                            .put("message", "Evolução indisponível ou incompatível"));
                } catch (Exception ignored) {}
                return error.toString();
            }
        }

        /** Persists a bounded aggregate-only mirror for the Coach provider. */
        @JavascriptInterface
        public void syncNutritionSummary(final String json) {
            if (json == null) return;
            try {
                if (json.getBytes("UTF-8").length > 256 * 1024) return;
                JSONObject root = new JSONObject(json);
                if (root.optInt("schemaVersion", -1) != 1) return;
                JSONArray input = root.optJSONArray("days");
                if (input == null || input.length() > 120) return;
                JSONArray days = new JSONArray();
                JSONObject seen = new JSONObject();
                for (int i = 0; i < input.length(); i++) {
                    JSONObject source = input.optJSONObject(i);
                    if (source == null) continue;
                    String date = source.optString("date", "");
                    Object mealRaw = source.opt("mealCount");
                    Object waterRaw = source.opt("hasWaterLog");
                    if (!date.matches("\\d{4}-\\d{2}-\\d{2}") || seen.has(date) ||
                            !(mealRaw instanceof Number) || !(waterRaw instanceof Boolean)) continue;
                    double mealNumber = ((Number) mealRaw).doubleValue();
                    if (Double.isNaN(mealNumber) || Double.isInfinite(mealNumber) ||
                            mealNumber % 1.0 != 0.0) continue;
                    int mealCount = (int) mealNumber;
                    boolean hasWaterLog = (Boolean) waterRaw;
                    if (mealCount < 0 || mealCount > 200 || (mealCount == 0 && !hasWaterLog)) continue;
                    JSONObject targets = source.optJSONObject("targets");
                    if (targets == null) continue;
                    JSONObject day = new JSONObject()
                            .put("date", date)
                            .put("mealCount", mealCount)
                            .put("hasWaterLog", hasWaterLog)
                            .put("energyKcal", boundedNumber(source, "energyKcal", 100000.0))
                            .put("proteinG", boundedNumber(source, "proteinG", 10000.0))
                            .put("carbsG", boundedNumber(source, "carbsG", 20000.0))
                            .put("fatG", boundedNumber(source, "fatG", 10000.0))
                            .put("waterMl", boundedNumber(source, "waterMl", 100000.0))
                            .put("targets", new JSONObject()
                                    .put("energyKcal", boundedNumber(targets, "energyKcal", 10000.0))
                                    .put("proteinG", boundedNumber(targets, "proteinG", 1000.0))
                                    .put("carbsG", boundedNumber(targets, "carbsG", 2000.0))
                                    .put("fatG", boundedNumber(targets, "fatG", 1000.0))
                                    .put("waterMl", boundedNumber(targets, "waterMl", 20000.0)));
                    seen.put(date, true);
                    days.put(day);
                }
                JSONObject sanitized = new JSONObject().put("schemaVersion", 1).put("days", days);
                getSharedPreferences(NutritionProvider.PREFS, MODE_PRIVATE).edit()
                        .putString(NutritionProvider.STATE_KEY, sanitized.toString()).commit();
            } catch (Exception ignored) { }
        }

        private double boundedNumber(JSONObject value, String key, double max) throws Exception {
            Object raw = value.opt(key);
            if (!(raw instanceof Number)) throw new IllegalArgumentException("number required");
            double number = ((Number) raw).doubleValue();
            if (Double.isNaN(number) || Double.isInfinite(number) || number < 0.0 || number > max) {
                throw new IllegalArgumentException("number outside bounds");
            }
            return number;
        }

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
                        String msg = NotificationReceiver.getPositiveMessageFor(nome);
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

        /** Estado lido pela tela Ajustes para exibir o card de permissão. */
        @JavascriptInterface
        public boolean hasNotificationPermission() {
            try {
                return MainActivity.this.hasNotificationPermission();
            } catch (Exception ignored) {
                return true;
            }
        }

        @JavascriptInterface
        public boolean areNotificationsEnabled() {
            try {
                NotificationManager nm = (NotificationManager)
                        getSystemService(Context.NOTIFICATION_SERVICE);
                return nm == null || nm.areNotificationsEnabled();
            } catch (Exception ignored) {
                return true;
            }
        }

        @JavascriptInterface
        public boolean canScheduleExactAlarms() {
            try {
                return MainActivity.this.canScheduleExactAlarms();
            } catch (Exception ignored) {
                return true;
            }
        }

        /** Re-dispara o diálogo de permissão (sem efeito se negado 2x: o
         *  sistema responde direto no onRequestPermissionsResult). */
        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    MainActivity.this.requestNotificationPermission();
                }
            });
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    MainActivity.this.openAppDetailsSettings();
                }
            });
        }

        @JavascriptInterface
        public void openExactAlarmSettings() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    MainActivity.this.openExactAlarmSettings();
                }
            });
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
