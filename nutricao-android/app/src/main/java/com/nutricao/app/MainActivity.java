package com.nutricao.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * NutriTrack — WebView wrapper.
 * Habilita camera/galeria (<input type=file capture>) e backup em arquivo,
 * exatamente como o projeto Evolucao.
 *
 * FIX v1.1: a camera era chamada com ACTION_IMAGE_CAPTURE SEM EXTRA_OUTPUT.
 * Na API moderna do MediaStore, isso faz a camera retornar data==null,
 * e o <input> do JS nunca recebia a foto (nada acontecia no app).
 * Corrigido: criamos um Uri proprio no MediaStore e passamos EXTRA_OUTPUT,
 * com fallback para o mesmo Uri quando a Intent retorna vazia.
 */
public class MainActivity extends Activity {
    private WebView web;
    private static final int FILE_CHOOSER_CODE = 51;
    private ValueCallback<Uri[]> filePathCallback;
    /** Uri proprio criado para receber a foto da camera (fallback se data.getData() for null). */
    private Uri cameraOutputUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestCameraPermission();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        // permite que o JS em file:// faca fetch para https (analise de foto)
        s.setAllowUniversalAccessFromFileURLs(true);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        // abre camera/galeria (para a foto do prato) e o seletor de backup
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                filePathCallback = callback;
                cameraOutputUri = null;
                String[] accepts = params.getAcceptTypes();
                boolean isImage = accepts != null && accepts.length > 0
                        && accepts[0] != null && accepts[0].startsWith("image/");
                Intent intent;
                if (isImage) {
                    // foto do prato: camera direta
                    intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    if (intent.resolveActivity(getPackageManager()) == null) {
                        // sem camera nativa disponivel -> galeria
                        intent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
                        intent.setType("image/*");
                    } else {
                        // FIX: Uri proprio para receber a foto (antes ficava null e o JS nao recebia nada)
                        try {
                            ContentValues cv = new ContentValues();
                            cv.put(MediaStore.Images.Media.DISPLAY_NAME, "nutritrack_foto_" + System.currentTimeMillis() + ".jpg");
                            cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                            cameraOutputUri = getContentResolver().insert(
                                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                            if (cameraOutputUri != null) {
                                intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
                                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                            }
                        } catch (Exception ignored) {
                            cameraOutputUri = null;
                        }
                    }
                } else {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.setType("*/*");
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                }
                try {
                    startActivityForResult(Intent.createChooser(intent, "Selecionar"), FILE_CHOOSER_CODE);
                } catch (Exception e) {
                    filePathCallback = null;
                    cameraOutputUri = null;
                    return false;
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

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** Bridge chamada do JS para salvar backup em arquivo local. */
    public class Bridge {
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
