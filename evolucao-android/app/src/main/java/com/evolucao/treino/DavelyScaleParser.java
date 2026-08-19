package com.evolucao.treino;

import java.util.Locale;

/**
 * DavelyScaleParser
 * Decodificador de alta fidelidade para pacotes de broadcast BLE emitidos pela balança Davely / Chipsea.
 */
public final class DavelyScaleParser {
    public static final int PACKET_LENGTH = 17;
    public static final byte AD_HEADER_LEN = 0x10;
    public static final byte AD_HEADER_TYPE = (byte) 0xFF;
    public static final byte PROTOCOL_FAMILY = (byte) 0xC0;

    private DavelyScaleParser() {
        // Utilitário estático
    }

    /**
     * Limpa formatação da string hexadecimal (remove espaços, hífens, dois pontos).
     * Retorna null se a string for nula, possuir comprimento ímpar ou caracteres não-hexadecimais.
     */
    public static String cleanHex(String hexStr) {
        if (hexStr == null) return null;
        String clean = hexStr.replaceAll("[\\s:-]", "").toUpperCase(Locale.US);
        if (clean.length() % 2 != 0) return null;
        for (int i = 0; i < clean.length(); i++) {
            char c = clean.charAt(i);
            if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F'))) {
                return null;
            }
        }
        return clean;
    }

    /**
     * Converte string hexadecimal limpa em array de bytes.
     */
    public static byte[] hexToBytes(String cleanHex) {
        if (cleanHex == null || cleanHex.length() % 2 != 0) return null;
        int len = cleanHex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            int high = Character.digit(cleanHex.charAt(i), 16);
            int low = Character.digit(cleanHex.charAt(i + 1), 16);
            if (high == -1 || low == -1) return null;
            data[i / 2] = (byte) ((high << 4) + low);
        }
        return data;
    }

    /**
     * Converte array de bytes em string hexadecimal sem separadores.
     */
    public static String bytesToHex(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return "";
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format(Locale.US, "%02X", b & 0xFF));
        }
        return sb.toString();
    }

    /**
     * Converte 6 bytes a partir de um deslocamento em formato de endereço MAC (XX:XX:XX:XX:XX:XX).
     */
    public static String bytesToMac(byte[] bytes, int startOffset) {
        if (bytes == null || bytes.length < startOffset + 6) return null;
        return String.format(
                Locale.US,
                "%02X:%02X:%02X:%02X:%02X:%02X",
                bytes[startOffset] & 0xFF,
                bytes[startOffset + 1] & 0xFF,
                bytes[startOffset + 2] & 0xFF,
                bytes[startOffset + 3] & 0xFF,
                bytes[startOffset + 4] & 0xFF,
                bytes[startOffset + 5] & 0xFF
        );
    }

    /**
     * Heurística para verificar se o buffer contém o padrão da balança Davely (17 bytes iniciando com 0x10 0xFF 0xC0).
     */
    public static boolean looksLikeDavelyPacket(byte[] bytes) {
        if (bytes == null || bytes.length < PACKET_LENGTH) return false;
        for (int i = 0; i <= bytes.length - PACKET_LENGTH; i++) {
            if ((bytes[i] & 0xFF) == (AD_HEADER_LEN & 0xFF) &&
                (bytes[i + 1] & 0xFF) == (AD_HEADER_TYPE & 0xFF) &&
                (bytes[i + 2] & 0xFF) == (PROTOCOL_FAMILY & 0xFF)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Heurística sobre representação hexadecimal.
     */
    public static boolean looksLikeDavelyPacket(String hexStr) {
        String clean = cleanHex(hexStr);
        if (clean == null || clean.length() < PACKET_LENGTH * 2) return false;
        byte[] bytes = hexToBytes(clean);
        return looksLikeDavelyPacket(bytes);
    }

    /**
     * Decodifica um payload bruto em array de bytes.
     * Suporta busca com janela deslizante dentro de ScanRecords completos com outros AD structures.
     */
    public static DavelyMeasurementPacket parse(byte[] data, String fallbackDeviceAddress) {
        if (data == null) {
            return DavelyMeasurementPacket.invalid("empty_or_invalid_input", "", fallbackDeviceAddress);
        }

        String rawHex = bytesToHex(data);
        if (data.length < PACKET_LENGTH) {
            return DavelyMeasurementPacket.invalid("truncated_payload", rawHex, fallbackDeviceAddress);
        }

        int offset = -1;
        for (int i = 0; i <= data.length - PACKET_LENGTH; i++) {
            if ((data[i] & 0xFF) == (AD_HEADER_LEN & 0xFF) &&
                (data[i + 1] & 0xFF) == (AD_HEADER_TYPE & 0xFF) &&
                (data[i + 2] & 0xFF) == (PROTOCOL_FAMILY & 0xFF)) {
                offset = i;
                break;
            }
        }

        if (offset == -1) {
            return DavelyMeasurementPacket.invalid("invalid_header_or_family", rawHex, fallbackDeviceAddress);
        }

        int seq = data[offset + 3] & 0xFF;
        int weightRaw = ((data[offset + 4] & 0xFF) << 8) | (data[offset + 5] & 0xFF);
        double weightKg = Math.round((weightRaw / 100.0) * 100.0) / 100.0;
        int impedanceRaw = ((data[offset + 6] & 0xFF) << 8) | (data[offset + 7] & 0xFF);
        int unitCode = data[offset + 8] & 0xFF;
        int stepSeq = data[offset + 9] & 0xFF;
        int attributeByte = data[offset + 10] & 0xFF;
        boolean isStable = (attributeByte & 0x01) != 0;
        String embeddedMac = bytesToMac(data, offset + 11);
        long timestampMs = System.currentTimeMillis();
        String deviceAddress = (fallbackDeviceAddress != null && !fallbackDeviceAddress.trim().isEmpty())
                ? fallbackDeviceAddress
                : embeddedMac;

        return new DavelyMeasurementPacket(
                weightKg,
                weightRaw,
                impedanceRaw,
                unitCode,
                stepSeq,
                seq,
                attributeByte,
                isStable,
                embeddedMac,
                rawHex,
                timestampMs,
                deviceAddress,
                offset
        );
    }

    public static DavelyMeasurementPacket parse(byte[] data) {
        return parse(data, null);
    }

    /**
     * Decodifica uma string hexadecimal.
     */
    public static DavelyMeasurementPacket parseHex(String hex, String fallbackDeviceAddress) {
        if (hex == null) {
            return DavelyMeasurementPacket.invalid("empty_or_invalid_input", "", fallbackDeviceAddress);
        }
        String clean = cleanHex(hex);
        if (clean == null) {
            return DavelyMeasurementPacket.invalid("malformed_or_odd_hex", hex, fallbackDeviceAddress);
        }
        if (clean.length() < PACKET_LENGTH * 2) {
            return DavelyMeasurementPacket.invalid("truncated_payload", clean, fallbackDeviceAddress);
        }
        byte[] bytes = hexToBytes(clean);
        if (bytes == null) {
            return DavelyMeasurementPacket.invalid("malformed_or_odd_hex", clean, fallbackDeviceAddress);
        }
        return parse(bytes, fallbackDeviceAddress);
    }

    public static DavelyMeasurementPacket parseHex(String hex) {
        return parseHex(hex, null);
    }
}
