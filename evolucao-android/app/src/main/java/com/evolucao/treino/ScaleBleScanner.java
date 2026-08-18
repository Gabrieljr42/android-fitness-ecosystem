package com.evolucao.treino;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;
import android.util.SparseArray;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/**
 * ScaleBleScanner
 * Scanner Bluetooth Low Energy (BLE) de diagnóstico de alta fidelidade para captura
 * de pacotes brutos emitidos pela balança Davely e outros dispositivos BLE.
 */
public class ScaleBleScanner {
    public static final String TAG = "EvolucaoBLE";
    private static final long BATCH_FLUSH_INTERVAL_MS = 100L;

    public interface BleScanListener {
        void onScanStateChanged(boolean scanning, String statusMessage);
        void onAdvertisementsBatchReceived(JSONArray batchJson);
        void onScanError(int errorCode, String errorMessage);
    }

    private final Context context;
    private final BluetoothAdapter bluetoothAdapter;
    private final Handler mainHandler;
    private final BleScanListener listener;

    private BluetoothLeScanner bleScanner;
    private ScanCallback scanCallback;
    private boolean isScanning = false;

    private final List<JSONObject> packetBatch = new ArrayList<>();
    private boolean batchFlushScheduled = false;

    private final Runnable batchFlushRunnable = new Runnable() {
        @Override
        public void run() {
            flushBatch();
        }
    };

    public ScaleBleScanner(Context context, BleScanListener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
        this.mainHandler = new Handler(Looper.getMainLooper());

        BluetoothAdapter adapter = null;
        try {
            BluetoothManager bm = (BluetoothManager) this.context.getSystemService(Context.BLUETOOTH_SERVICE);
            if (bm != null) {
                adapter = bm.getAdapter();
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao obter BluetoothManager", e);
        }
        this.bluetoothAdapter = adapter;
    }

    public boolean isBluetoothSupported() {
        return bluetoothAdapter != null && context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE);
    }

    public boolean isBluetoothEnabled() {
        return bluetoothAdapter != null && bluetoothAdapter.isEnabled();
    }

    public boolean hasRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            boolean scanGranted = context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED;
            boolean connectGranted = context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
            return scanGranted && connectGranted;
        } else {
            return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                   context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        }
    }

    public String[] getRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            return new String[]{
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            };
        } else {
            return new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION
            };
        }
    }

    public JSONObject getDiagnosticState() {
        JSONObject state = new JSONObject();
        try {
            state.put("isSupported", isBluetoothSupported());
            state.put("isEnabled", isBluetoothEnabled());
            state.put("hasPermissions", hasRequiredPermissions());
            state.put("isScanning", isScanning);
            state.put("androidVersion", Build.VERSION.RELEASE);
            state.put("sdkInt", Build.VERSION.SDK_INT);
            state.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
        } catch (JSONException e) {
            Log.e(TAG, "Erro ao montar getDiagnosticState", e);
        }
        return state;
    }

    public synchronized void startScan() {
        if (!isBluetoothSupported()) {
            notifyError(101, "Bluetooth Low Energy não é suportado neste aparelho.");
            return;
        }

        if (!isBluetoothEnabled()) {
            notifyError(102, "Bluetooth desligado. Ative o Bluetooth nas configurações.");
            return;
        }

        if (!hasRequiredPermissions()) {
            notifyError(103, "Permissão Bluetooth / Localização necessária para escanear.");
            return;
        }

        if (isScanning) {
            Log.i(TAG, "Scanner já está ativo.");
            return;
        }

        try {
            bleScanner = bluetoothAdapter.getBluetoothLeScanner();
            if (bleScanner == null) {
                notifyError(104, "Sub-sistema BluetoothLeScanner não pôde ser instanciado.");
                return;
            }

            ScanSettings.Builder settingsBuilder = new ScanSettings.Builder();
            settingsBuilder.setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY);

            scanCallback = new ScanCallback() {
                @Override
                public void onScanResult(int callbackType, ScanResult result) {
                    processScanResult(result);
                }

                @Override
                public void onBatchScanResults(List<ScanResult> results) {
                    if (results != null) {
                        for (ScanResult r : results) {
                            processScanResult(r);
                        }
                    }
                }

                @Override
                public void onScanFailed(int errorCode) {
                    handleScanFailed(errorCode);
                }
            };

            // Scan sem filtros para capturar todos os broadcasts entregues pelo subsistema Android
            bleScanner.startScan(null, settingsBuilder.build(), scanCallback);
            isScanning = true;
            Log.i(TAG, "BLE Scan iniciado com sucesso (LOW_LATENCY, sem filtros).");

            if (listener != null) {
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        listener.onScanStateChanged(true, "Scanner ativo");
                    }
                });
            }
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException ao iniciar BLE scan", se);
            notifyError(105, "Erro de segurança (permissão revogada durante início do scan): " + se.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Exceção inesperada ao iniciar BLE scan", e);
            notifyError(100, "Falha ao iniciar scanner: " + e.getMessage());
        }
    }

    public synchronized void stopScan() {
        if (!isScanning) return;

        isScanning = false;
        try {
            if (bleScanner != null && scanCallback != null) {
                bleScanner.stopScan(scanCallback);
                Log.i(TAG, "BLE Scan parado com sucesso.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao parar BLE scan", e);
        } finally {
            scanCallback = null;
        }

        // Despeja imediatamente qualquer pacote remanescente na fila de batch
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                flushBatch();
                if (listener != null) {
                    listener.onScanStateChanged(false, "Scanner parado");
                }
            }
        });
    }

    private void processScanResult(ScanResult result) {
        if (result == null) return;
        try {
            JSONObject packet = parseScanResult(result);
            synchronized (packetBatch) {
                packetBatch.add(packet);
                if (!batchFlushScheduled) {
                    batchFlushScheduled = true;
                    mainHandler.postDelayed(batchFlushRunnable, BATCH_FLUSH_INTERVAL_MS);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao processar ScanResult", e);
        }
    }

    private void flushBatch() {
        List<JSONObject> batchCopy;
        synchronized (packetBatch) {
            if (packetBatch.isEmpty()) {
                batchFlushScheduled = false;
                return;
            }
            batchCopy = new ArrayList<>(packetBatch);
            packetBatch.clear();
            batchFlushScheduled = false;
        }

        JSONArray array = new JSONArray();
        for (JSONObject p : batchCopy) {
            array.put(p);
        }

        if (listener != null) {
            listener.onAdvertisementsBatchReceived(array);
        }
    }

    private void handleScanFailed(int errorCode) {
        Log.e(TAG, "ScanCallback.onScanFailed: " + errorCode);
        isScanning = false;
        String msg;
        switch (errorCode) {
            case ScanCallback.SCAN_FAILED_ALREADY_STARTED:
                msg = "Scanner já estava em execução.";
                break;
            case ScanCallback.SCAN_FAILED_APPLICATION_REGISTRATION_FAILED:
                msg = "Falha ao registrar aplicação no controlador Bluetooth.";
                break;
            case ScanCallback.SCAN_FAILED_FEATURE_UNSUPPORTED:
                msg = "Recurso de scan não suportado pelo chipset Bluetooth.";
                break;
            case ScanCallback.SCAN_FAILED_INTERNAL_ERROR:
                msg = "Erro interno do subsistema Bluetooth do Android.";
                break;
            case ScanCallback.SCAN_FAILED_OUT_OF_HARDWARE_RESOURCES:
                msg = "Sem recursos de hardware BLE livres.";
                break;
            default:
                msg = "Falha no scanner BLE (código " + errorCode + ")";
                break;
        }
        notifyError(errorCode, msg);
    }

    private void notifyError(final int code, final String message) {
        if (listener != null) {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    listener.onScanError(code, message);
                    listener.onScanStateChanged(false, "Erro: " + message);
                }
            });
        }
    }

    /**
     * Extrai todos os metadados do ScanResult e ScanRecord em um JSONObject completo.
     */
    private JSONObject parseScanResult(ScanResult result) throws JSONException {
        JSONObject json = new JSONObject();
        BluetoothDevice device = result.getDevice();
        ScanRecord record = result.getScanRecord();

        long nowMs = System.currentTimeMillis();
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        String receivedAtIso = sdf.format(new Date(nowMs));

        // 1. Identificação do Dispositivo
        String deviceName = null;
        try {
            if (device != null) deviceName = device.getName();
        } catch (SecurityException se) {
            Log.w(TAG, "Permissão BLUETOOTH_CONNECT necessária para device.getName()");
        }

        String advertisedName = (record != null) ? record.getDeviceName() : null;
        String address = (device != null && device.getAddress() != null) ? device.getAddress() : "00:00:00:00:00:00";

        json.put("deviceName", deviceName != null ? deviceName : JSONObject.NULL);
        json.put("advertisedName", advertisedName != null ? advertisedName : JSONObject.NULL);
        json.put("address", address);
        json.put("rssi", result.getRssi());

        // 2. Temporização
        json.put("receivedAt", receivedAtIso);
        json.put("receivedAtEpochMs", nowMs);
        json.put("timestampNanos", result.getTimestampNanos());

        // 3. Propriedades de Conectividade e Hardware (com verificações de versão)
        if (Build.VERSION.SDK_INT >= 26) {
            json.put("isConnectable", result.isConnectable());
            int tx = result.getTxPower();
            json.put("txPower", (tx != 127) ? tx : JSONObject.NULL);
            json.put("advertisingSid", result.getAdvertisingSid() != 255 ? result.getAdvertisingSid() : JSONObject.NULL);
            json.put("primaryPhy", result.getPrimaryPhy());
            json.put("secondaryPhy", result.getSecondaryPhy());
            json.put("periodicAdvertisingInterval", result.getPeriodicAdvertisingInterval());

            int dataStatus = result.getDataStatus();
            String dataStatusStr;
            if (dataStatus == ScanResult.DATA_COMPLETE) dataStatusStr = "COMPLETE";
            else if (dataStatus == ScanResult.DATA_TRUNCATED) dataStatusStr = "TRUNCATED";
            else dataStatusStr = "STATUS_" + dataStatus;
            json.put("dataStatus", dataStatusStr);
        } else {
            json.put("isConnectable", JSONObject.NULL);
            int tx = (record != null) ? record.getTxPowerLevel() : Integer.MIN_VALUE;
            json.put("txPower", (tx != Integer.MIN_VALUE) ? tx : JSONObject.NULL);
            json.put("advertisingSid", JSONObject.NULL);
            json.put("primaryPhy", JSONObject.NULL);
            json.put("secondaryPhy", JSONObject.NULL);
            json.put("periodicAdvertisingInterval", JSONObject.NULL);
            json.put("dataStatus", JSONObject.NULL);
        }

        // 4. Detalhamento do ScanRecord
        if (record != null) {
            json.put("advertiseFlags", record.getAdvertiseFlags());

            // Service UUIDs
            JSONArray srvUuids = new JSONArray();
            List<ParcelUuid> uuids = record.getServiceUuids();
            if (uuids != null) {
                for (ParcelUuid u : uuids) {
                    if (u != null) srvUuids.put(u.toString());
                }
            }
            json.put("serviceUuids", srvUuids);

            // Manufacturer Specific Data
            JSONArray mfgArray = new JSONArray();
            SparseArray<byte[]> mfgData = record.getManufacturerSpecificData();
            if (mfgData != null && mfgData.size() > 0) {
                for (int i = 0; i < mfgData.size(); i++) {
                    int mfgId = mfgData.keyAt(i);
                    byte[] mfgBytes = mfgData.valueAt(i);
                    JSONObject mfgObj = new JSONObject();
                    mfgObj.put("id", mfgId);
                    mfgObj.put("idHex", String.format("0x%04X", mfgId));
                    mfgObj.put("dataHex", bytesToHexSpaced(mfgBytes));
                    mfgObj.put("dataHexNoSpaces", bytesToHex(mfgBytes));
                    mfgObj.put("length", mfgBytes != null ? mfgBytes.length : 0);
                    mfgArray.put(mfgObj);
                }
            }
            json.put("manufacturerData", mfgArray);

            // Service Data
            JSONArray srvDataArray = new JSONArray();
            Map<ParcelUuid, byte[]> srvMap = record.getServiceData();
            if (srvMap != null && !srvMap.isEmpty()) {
                for (Map.Entry<ParcelUuid, byte[]> entry : srvMap.entrySet()) {
                    if (entry.getKey() != null) {
                        JSONObject srvObj = new JSONObject();
                        srvObj.put("uuid", entry.getKey().toString());
                        byte[] srvBytes = entry.getValue();
                        srvObj.put("dataHex", bytesToHexSpaced(srvBytes));
                        srvObj.put("dataHexNoSpaces", bytesToHex(srvBytes));
                        srvObj.put("length", srvBytes != null ? srvBytes.length : 0);
                        srvDataArray.put(srvObj);
                    }
                }
            }
            json.put("serviceData", srvDataArray);

            // Pacote bruto de advertisement (ScanRecord.getBytes)
            byte[] rawBytes = record.getBytes();
            if (rawBytes != null) {
                json.put("rawHex", bytesToHexSpaced(rawBytes));
                json.put("rawHexNoSpaces", bytesToHex(rawBytes));
                json.put("rawBytesLength", rawBytes.length);
            } else {
                json.put("rawHex", "");
                json.put("rawHexNoSpaces", "");
                json.put("rawBytesLength", 0);
            }
        } else {
            json.put("advertiseFlags", -1);
            json.put("serviceUuids", new JSONArray());
            json.put("manufacturerData", new JSONArray());
            json.put("serviceData", new JSONArray());
            json.put("rawHex", "");
            json.put("rawHexNoSpaces", "");
            json.put("rawBytesLength", 0);
        }

        return json;
    }

    public static String bytesToHexSpaced(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return "";
        StringBuilder sb = new StringBuilder(bytes.length * 3);
        for (int i = 0; i < bytes.length; i++) {
            sb.append(String.format("%02X", bytes[i] & 0xFF));
            if (i < bytes.length - 1) sb.append(' ');
        }
        return sb.toString();
    }

    public static String bytesToHex(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return "";
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02X", b & 0xFF));
        }
        return sb.toString();
    }
}
