package com.nutricao.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Binder;
import android.text.TextUtils;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Pattern;

/**
 * Read-only, aggregate-only nutrition contract for Coach. Meal names, items,
 * photos, habits, activity logs and credentials never enter this provider.
 */
public final class NutritionProvider extends ContentProvider {
    public static final String AUTHORITY = "com.nutricao.app.nutrition";
    public static final String PATH = "daily";
    public static final String PREFS = "nutritrack_coach_export";
    public static final String STATE_KEY = "summaries";
    private static final String COACH_PACKAGE = "com.coach.app";
    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    @Override public boolean onCreate() { return true; }

    @Override public Cursor query(Uri uri, String[] projection, String selection,
                                  String[] selectionArgs, String sortOrder) {
        enforceCaller();
        if (uri == null || uri.getPathSegments().isEmpty() ||
                !PATH.equals(uri.getPathSegments().get(0))) return null;
        String date = uri.getQueryParameter("date");
        if (TextUtils.isEmpty(date) && selectionArgs != null && selectionArgs.length > 0) {
            date = selectionArgs[0];
        }
        if (date == null || !ISO_DATE.matcher(date).matches()) return null;
        MatrixCursor out = new MatrixCursor(new String[]{"_id", "payload"});
        out.addRow(new Object[]{1L, buildPayload(date)});
        return out;
    }

    private void enforceCaller() {
        int uid = Binder.getCallingUid();
        if (uid == android.os.Process.myUid()) return;
        String[] packages;
        try { packages = getContext().getPackageManager().getPackagesForUid(uid); }
        catch (RuntimeException e) { throw new SecurityException("Caller UID indisponível", e); }
        if (packages != null) for (String pkg : packages) if (COACH_PACKAGE.equals(pkg)) return;
        throw new SecurityException("Somente o Coach pode ler resumos do NutriTrack");
    }

    private String buildPayload(String date) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("schemaVersion", 1);
            payload.put("source", "com.nutricao.app");
            payload.put("date", date);
            payload.put("generatedAt", nowIso());
            payload.put("summary", JSONObject.NULL);
            String raw = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(STATE_KEY, null);
            if (raw != null) {
                JSONArray days = new JSONObject(raw).optJSONArray("days");
                if (days != null) for (int i = days.length() - 1; i >= 0; i--) {
                    JSONObject day = days.optJSONObject(i);
                    if (day != null && date.equals(day.optString("date"))) {
                        payload.put("summary", day);
                        break;
                    }
                }
            }
        } catch (Exception ignored) { }
        return payload.toString();
    }

    private static String nowIso() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    @Override public String getType(Uri uri) {
        return "vnd.android.cursor.item/vnd.com.nutricao.app.daily-summary";
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("read-only"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException("read-only"); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException("read-only"); }
}
