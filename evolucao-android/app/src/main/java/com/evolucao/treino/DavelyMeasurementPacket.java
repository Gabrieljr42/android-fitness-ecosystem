package com.evolucao.treino;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;
import java.util.Objects;

/**
 * DavelyMeasurementPacket
 * Modelo de dados imutável representando um pacote de medição emitido por balanças BLE Davely / Chipsea.
 */
public final class DavelyMeasurementPacket {
    private final boolean isValid;
    private final String errorReason;
    private final double weightKg;
    private final int weightRaw;
    private final int impedanceRaw;
    private final int unitCode;
    private final int stepSeq;
    private final int seq;
    private final int attributeByte;
    private final boolean isStable;
    private final String embeddedMac;
    private final String rawHex;
    private final long timestampMs;
    private final String deviceAddress;
    private final int offset;
    private final String source;

    public DavelyMeasurementPacket(
            boolean isValid,
            String errorReason,
            double weightKg,
            int weightRaw,
            int impedanceRaw,
            int unitCode,
            int stepSeq,
            int seq,
            int attributeByte,
            boolean isStable,
            String embeddedMac,
            String rawHex,
            long timestampMs,
            String deviceAddress,
            int offset,
            String source
    ) {
        this.isValid = isValid;
        this.errorReason = errorReason;
        this.weightKg = weightKg;
        this.weightRaw = weightRaw;
        this.impedanceRaw = impedanceRaw;
        this.unitCode = unitCode;
        this.stepSeq = stepSeq;
        this.seq = seq;
        this.attributeByte = attributeByte;
        this.isStable = isStable;
        this.embeddedMac = embeddedMac;
        this.rawHex = rawHex != null ? rawHex : "";
        this.timestampMs = timestampMs > 0 ? timestampMs : System.currentTimeMillis();
        this.deviceAddress = deviceAddress;
        this.offset = offset;
        this.source = source != null ? source : "ble";
    }

    /**
     * Construtor para pacotes válidos.
     */
    public DavelyMeasurementPacket(
            double weightKg,
            int weightRaw,
            int impedanceRaw,
            int unitCode,
            int stepSeq,
            int seq,
            int attributeByte,
            boolean isStable,
            String embeddedMac,
            String rawHex,
            long timestampMs,
            String deviceAddress,
            int offset
    ) {
        this(true, null, weightKg, weightRaw, impedanceRaw, unitCode, stepSeq, seq, attributeByte, isStable, embeddedMac, rawHex, timestampMs, deviceAddress, offset, "ble");
    }

    /**
     * Cria uma instância de pacote inválido com motivo de erro documentado.
     */
    public static DavelyMeasurementPacket invalid(String reason, String rawHex, String deviceAddress) {
        return new DavelyMeasurementPacket(
                false,
                reason,
                0.0,
                0,
                0,
                0,
                0,
                0,
                0,
                false,
                null,
                rawHex,
                System.currentTimeMillis(),
                deviceAddress,
                -1,
                "ble"
        );
    }

    public boolean isValid() {
        return isValid;
    }

    public String getErrorReason() {
        return errorReason;
    }

    public double getWeightKg() {
        return weightKg;
    }

    public float getWeightKgFloat() {
        return (float) weightKg;
    }

    public int getWeightRaw() {
        return weightRaw;
    }

    public int getImpedanceRaw() {
        return impedanceRaw;
    }

    public int getUnitCode() {
        return unitCode;
    }

    public int getStepSeq() {
        return stepSeq;
    }

    public int getSeq() {
        return seq;
    }

    public int getAttributeByte() {
        return attributeByte;
    }

    public boolean isStable() {
        return isStable;
    }

    public String getEmbeddedMac() {
        return embeddedMac;
    }

    public String getRawHex() {
        return rawHex;
    }

    public long getTimestampMs() {
        return timestampMs;
    }

    public long getTimestamp() {
        return timestampMs;
    }

    public String getDeviceAddress() {
        return deviceAddress;
    }

    public int getOffset() {
        return offset;
    }

    public String getSource() {
        return source;
    }

    /**
     * Serializa o pacote para JSONObject compatível com os contratos do WebView/Bridge.
     */
    public JSONObject toJsonObject() {
        JSONObject json = new JSONObject();
        try {
            json.put("valid", isValid);
            if (!isValid) {
                json.put("reason", errorReason != null ? errorReason : "unknown_error");
                json.put("errorReason", errorReason != null ? errorReason : "unknown_error");
                json.put("rawHex", rawHex != null ? rawHex : "");
                json.put("raw", rawHex != null ? rawHex : "");
                if (deviceAddress != null) {
                    json.put("deviceAddress", deviceAddress);
                } else {
                    json.put("deviceAddress", JSONObject.NULL);
                }
                return json;
            }

            json.put("weightKg", weightKg);
            json.put("weightRaw", weightRaw);
            json.put("stable", isStable);
            json.put("isStable", isStable);
            json.put("impedanceRaw", impedanceRaw);
            json.put("embeddedMac", embeddedMac != null ? embeddedMac : JSONObject.NULL);
            json.put("raw", rawHex != null ? rawHex : "");
            json.put("rawHex", rawHex != null ? rawHex : "");
            json.put("source", source);
            json.put("timestamp", timestampMs);
            json.put("timestampMs", timestampMs);
            json.put("deviceAddress", deviceAddress != null ? deviceAddress : (embeddedMac != null ? embeddedMac : JSONObject.NULL));
            json.put("unitCode", unitCode);
            json.put("stepSeq", stepSeq);
            json.put("seq", seq);
            json.put("attributeByte", attributeByte);
            json.put("offset", offset);
        } catch (JSONException e) {
            // Em caso de falha silenciosa, retorna json parcial
        }
        return json;
    }

    public String toJsonString() {
        return toJsonObject().toString();
    }

    @Override
    public String toString() {
        if (!isValid) {
            return "DavelyMeasurementPacket{valid=false, error='" + errorReason + "', rawHex='" + rawHex + "'}";
        }
        return "DavelyMeasurementPacket{" +
                "weightKg=" + weightKg +
                ", stable=" + isStable +
                ", impedanceRaw=" + impedanceRaw +
                ", embeddedMac='" + embeddedMac + '\'' +
                ", seq=0x" + Integer.toHexString(seq).toUpperCase(Locale.ROOT) +
                ", attr=0x" + Integer.toHexString(attributeByte).toUpperCase(Locale.ROOT) +
                ", unit=0x" + Integer.toHexString(unitCode).toUpperCase(Locale.ROOT) +
                ", rawHex='" + rawHex + '\'' +
                ", timestampMs=" + timestampMs +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        DavelyMeasurementPacket that = (DavelyMeasurementPacket) o;
        if (isValid != that.isValid) return false;
        if (Double.compare(that.weightKg, weightKg) != 0) return false;
        if (weightRaw != that.weightRaw) return false;
        if (impedanceRaw != that.impedanceRaw) return false;
        if (unitCode != that.unitCode) return false;
        if (stepSeq != that.stepSeq) return false;
        if (seq != that.seq) return false;
        if (attributeByte != that.attributeByte) return false;
        if (isStable != that.isStable) return false;
        if (offset != that.offset) return false;
        if (timestampMs != that.timestampMs) return false;
        if (!Objects.equals(errorReason, that.errorReason)) return false;
        if (!Objects.equals(embeddedMac, that.embeddedMac)) return false;
        if (!Objects.equals(rawHex, that.rawHex)) return false;
        if (!Objects.equals(deviceAddress, that.deviceAddress)) return false;
        return Objects.equals(source, that.source);
    }

    @Override
    public int hashCode() {
        int result;
        long temp;
        result = (isValid ? 1 : 0);
        result = 31 * result + (errorReason != null ? errorReason.hashCode() : 0);
        temp = Double.doubleToLongBits(weightKg);
        result = 31 * result + (int) (temp ^ (temp >>> 32));
        result = 31 * result + weightRaw;
        result = 31 * result + impedanceRaw;
        result = 31 * result + unitCode;
        result = 31 * result + stepSeq;
        result = 31 * result + seq;
        result = 31 * result + attributeByte;
        result = 31 * result + (isStable ? 1 : 0);
        result = 31 * result + (embeddedMac != null ? embeddedMac.hashCode() : 0);
        result = 31 * result + (rawHex != null ? rawHex.hashCode() : 0);
        result = 31 * result + (int) (timestampMs ^ (timestampMs >>> 32));
        result = 31 * result + (deviceAddress != null ? deviceAddress.hashCode() : 0);
        result = 31 * result + offset;
        result = 31 * result + (source != null ? source.hashCode() : 0);
        return result;
    }
}
