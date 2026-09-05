package com.evolucao.treino;

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
import java.util.Iterator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.TimeZone;
import java.util.regex.Pattern;

/** Read-only bridge consumed by NutriTrack and Coach. The mirrored state is written by MainActivity. */
public final class WorkoutProvider extends ContentProvider {
    public static final String AUTHORITY = "com.evolucao.treino.workouts";
    public static final String PATH = "workouts";
    public static final String PREFS = "evolucao_workouts_export";
    public static final String STATE_KEY = "state";
    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final String NUTRICAO_PACKAGE = "com.nutricao.app";
    private static final String COACH_PACKAGE = "com.coach.app";
    private static final int MAX_SESSIONS = 20, MAX_EXERCISES = 50, MAX_SETS = 100, MAX_NOTE_CHARS = 2000;

    @Override public boolean onCreate() { return true; }

    @Override public Cursor query(Uri uri, String[] projection, String selection,
                                  String[] selectionArgs, String sortOrder) {
        enforceCaller();
        if (uri == null || uri.getPathSegments().isEmpty() || !PATH.equals(uri.getPathSegments().get(0))) return null;
        String date = uri == null ? null : uri.getQueryParameter("date");
        if (TextUtils.isEmpty(date) && selectionArgs != null && selectionArgs.length > 0) date = selectionArgs[0];
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
        if (packages != null) for (String pkg : packages) {
            if (NUTRICAO_PACKAGE.equals(pkg) || COACH_PACKAGE.equals(pkg)) return;
        }
        throw new SecurityException("Chamador não autorizado a ler o histórico do Evolução");
    }

    private String buildPayload(String date) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("schemaVersion", 1);
            payload.put("source", "com.evolucao.treino");
            payload.put("date", date);
            payload.put("generatedAt", nowIso());
            payload.put("weight", JSONObject.NULL);
            ArrayList<Candidate> candidates = new ArrayList<>();
            String raw = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(STATE_KEY, null);
            if (raw != null) {
                JSONObject state = new JSONObject(raw);
                JSONArray strength = state.optJSONArray("sessions");
                if (strength != null) for (int i = 0; i < strength.length(); i++) {
                    JSONObject source = strength.optJSONObject(i);
                    if (source == null) continue;
                    // Casamento SOMENTE pela data lógica do treino (session.date).
                    // O dia efetivo é resolvido no Evolução: data escolhida pelo
                    // usuário (backdating) vence; default automático vencido
                    // avança para o dia da conclusão. Um treino = um dia.
                    if (date.equals(source.optString("date"))) {
                        candidates.add(new Candidate(normalizeStrength(source), orderOf(source, i)));
                    }
                }
                JSONArray runs = state.optJSONArray("corridas");
                if (runs != null) for (int i = 0; i < runs.length(); i++) {
                    JSONObject source = runs.optJSONObject(i);
                    if (source != null && date.equals(source.optString("date"))) candidates.add(new Candidate(normalizeRun(source), orderOf(source, i)));
                }
                JSONObject weight = latestWeightAtOrBefore(state.optJSONArray("peso"), date);
                if (weight != null) payload.put("weight", weight);
            }
            Collections.sort(candidates, new Comparator<Candidate>() { public int compare(Candidate a, Candidate b) { return Long.compare(b.order, a.order); } });
            JSONArray sessions = new JSONArray();
            for (int i = 0; i < candidates.size() && i < MAX_SESSIONS; i++) sessions.put(candidates.get(i).value);
            payload.put("sessions", sessions);
        } catch (Exception ignored) {
            try { payload.put("sessions", new JSONArray()); } catch (Exception impossible) { }
        }
        return payload.toString();
    }

    private JSONObject latestWeightAtOrBefore(JSONArray values, String date) throws Exception {
        if (values == null) return null;
        String bestDate = null;
        double bestKg = Double.NaN;
        for (int i = 0; i < values.length(); i++) {
            JSONObject source = values.optJSONObject(i);
            if (source == null) continue;
            String observedDate = source.optString("date", source.optString("data", ""));
            double kg = source.has("kg") ? source.optDouble("kg", Double.NaN)
                    : source.optDouble("peso", Double.NaN);
            if (!ISO_DATE.matcher(observedDate).matches() || observedDate.compareTo(date) > 0 ||
                    Double.isNaN(kg) || Double.isInfinite(kg) || kg < 20.0 || kg > 400.0) continue;
            if (bestDate == null || observedDate.compareTo(bestDate) >= 0) {
                bestDate = observedDate;
                bestKg = kg;
            }
        }
        return bestDate == null ? null : new JSONObject().put("date", bestDate).put("kg", bestKg);
    }

    private static final class Candidate {
        final JSONObject value; final long order;
        Candidate(JSONObject value, long order) { this.value = value; this.order = order; }
    }
    private static long orderOf(JSONObject source, int fallback) {
        long id = source.optLong("id", 0L);
        return id != 0L ? id : fallback;
    }

    private JSONObject normalizeStrength(JSONObject source) throws Exception {
        JSONObject out = new JSONObject();
        out.put("tipo", "musculacao");
        out.put("type", "musculacao");
        String day = source.optString("day", "");
        String nome = source.optString("name", "");
        if (nome == null || nome.trim().isEmpty()) {
            nome = (day == null || day.trim().isEmpty()) ? "Treino" : ("Treino " + day);
        }
        out.put("nome", nome);
        out.put("name", nome);
        out.put("dia", day);
        if (source.has("duration") && !source.isNull("duration")) {
            out.put("duration", source.get("duration"));
            out.put("duracaoSeg", source.get("duration"));
        }
        out.put("exercicios", new JSONArray());
        JSONArray exercises = out.getJSONArray("exercicios");
        JSONObject entries = source.optJSONObject("entries");
        int exerciseCount = 0;
        if (entries != null) for (Iterator<String> it = entries.keys(); it.hasNext() && exerciseCount < MAX_EXERCISES;) {
            String key = it.next();
            exerciseCount++;
            JSONObject exercise = new JSONObject();
            exercise.put("nome", key);
            JSONArray setsOut = new JSONArray();
            JSONArray sets = entries.optJSONArray(key);
            if (sets != null) for (int i = sets.length() - 1, count = 0; i >= 0 && count < MAX_SETS; i--, count++) {
                JSONObject set = sets.optJSONObject(i);
                if (set == null) continue;
                JSONObject normalized = new JSONObject();
                copyIfPresent(set, normalized, "serie", "serie");
                // Web state uses compact keys w/r/p; retain readable aliases in export.
                if (set.has("r") && !set.isNull("r")) { normalized.put("repeticoes", set.get("r")); normalized.put("reps", set.get("r")); }
                else copyIfPresent(set, normalized, "reps", "repeticoes");
                if (set.has("w") && !set.isNull("w")) { normalized.put("cargaKg", set.get("w")); normalized.put("carga", set.get("w")); }
                else copyIfPresent(set, normalized, "weight", "cargaKg");
                copyIfPresent(set, normalized, "carga", "carga");
                copyIfPresent(set, normalized, "p", "parciais");
                copyIfPresent(set, normalized, "rir", "rir");
                copyIfPresent(set, normalized, "done", "concluida");
                copyIfPresent(set, normalized, "warmup", "aquecimento");
                copyIfPresent(set, normalized, "wu", "aquecimento");
                setsOut.put(normalized);
            }
            exercise.put("series", setsOut);
            exercises.put(exercise);
        }
        String note = cleanNote(source.opt("notes"));
        if (!note.isEmpty()) { out.put("notas", note); out.put("notes", note); }
        return out;
    }

    private JSONObject normalizeRun(JSONObject source) throws Exception {
        JSONObject out = new JSONObject();
        out.put("tipo", "corrida");
        out.put("type", "corrida");
        out.put("nome", source.optString("nome", "Corrida"));
        out.put("name", source.optString("nome", "Corrida"));
        copyIfPresent(source, out, "distanciaKm", "distanciaKm");
        copyIfPresent(source, out, "duracaoSeg", "duracaoSeg");
        copyIfPresent(source, out, "duracaoSeg", "duration");
        copyIfPresent(source, out, "ritmoMedioSegKm", "ritmoMedioSegKm");
        copyIfPresent(source, out, "paceMinKm", "paceMinKm");
        copyIfPresent(source, out, "velocidadeMediaKmh", "velocidadeMediaKmh");
        copyIfPresent(source, out, "calorias", "calorias");
        copyIfPresent(source, out, "mode", "modo");
        copyIfPresent(source, out, "intervalos", "intervalos");
        String note = cleanNote(source.opt("notas"));
        if (!note.isEmpty()) { out.put("notas", note); out.put("notes", note); }
        return out;
    }

    private static String cleanNote(Object value) {
        if (value == null || value == JSONObject.NULL) return "";
        String text = String.valueOf(value).replaceAll("[\\u0000-\\u001F\\u007F]", " ").trim();
        return text.length() > MAX_NOTE_CHARS ? text.substring(0, MAX_NOTE_CHARS) : text;
    }

    private static void copyIfPresent(JSONObject from, JSONObject to, String fromKey, String toKey) throws Exception {
        if (from.has(fromKey) && !from.isNull(fromKey)) to.put(toKey, from.get(fromKey));
    }

    private static String nowIso() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date());
    }

    @Override public String getType(Uri uri) { return "vnd.android.cursor.item/vnd.com.evolucao.treino.workout"; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("read-only"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException("read-only"); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException("read-only"); }
}
