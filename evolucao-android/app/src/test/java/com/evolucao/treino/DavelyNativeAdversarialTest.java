package com.evolucao.treino;

import java.util.Arrays;

/**
 * DavelyNativeAdversarialTest
 * Suite de testes adversariais nativos em Java para DavelyScaleParser e DavelyMeasurementPacket.
 */
public class DavelyNativeAdversarialTest {

    private static int assertionsCount = 0;

    private static void assertTrue(boolean condition, String message) {
        assertionsCount++;
        if (!condition) {
            throw new AssertionError("FALHA: " + message);
        }
    }

    private static void assertEquals(Object expected, Object actual, String message) {
        assertionsCount++;
        if (expected == null && actual == null) return;
        if (expected != null && expected.equals(actual)) return;
        throw new AssertionError("FALHA: " + message + " | Esperado: " + expected + " mas obteve: " + actual);
    }

    private static void assertEqualsDouble(double expected, double actual, double delta, String message) {
        assertionsCount++;
        if (Math.abs(expected - actual) > delta) {
            throw new AssertionError("FALHA: " + message + " | Esperado: " + expected + " mas obteve: " + actual);
        }
    }

    public static void main(String[] args) {
        System.out.println("================================================================");
        System.out.println("=== EMPIRICAL CHALLENGER: JAVA NATIVE BLE ADVERSARIAL SUITE ===");
        System.out.println("================================================================\n");

        testGoldenVectors();
        testWeightRangeAndBoundaries();
        testExhaustiveStabilityBitmask();
        testBioimpedancePreservation();
        testSlidingWindowAndOffsetShifting();
        testMalformedAndHostileInputs();
        testPacketModelInvariants();

        System.out.println("\n================================================================");
        System.out.println("🎉 TODOS OS TESTES JAVA NATIVOS PASSARAM COM SUCESSO! (" + assertionsCount + " asserções)");
        System.out.println("================================================================\n");
    }

    private static void testGoldenVectors() {
        System.out.println("--- 1. Testando Vetores de Teste Oficiais (Golden Vectors) ---");

        // Vector 1: Unstable Measuring Packet
        DavelyMeasurementPacket p1 = DavelyScaleParser.parseHex("10FFC00D19B900000A01247866A55EC459", "78:66:A5:5E:C4:59");
        assertTrue(p1.isValid(), "Vector 1 deve ser válido");
        assertEqualsDouble(65.85, p1.getWeightKg(), 0.001, "Vector 1 weightKg");
        assertEquals(6585, p1.getWeightRaw(), "Vector 1 weightRaw");
        assertEquals(false, p1.isStable(), "Vector 1 isStable (0x24)");
        assertEquals(0, p1.getImpedanceRaw(), "Vector 1 impedanceRaw");
        assertEquals(0x0A, p1.getUnitCode(), "Vector 1 unitCode");
        assertEquals(0x0D, p1.getSeq(), "Vector 1 seq");
        assertEquals(0x01, p1.getStepSeq(), "Vector 1 stepSeq");
        assertEquals(0x24, p1.getAttributeByte(), "Vector 1 attributeByte");
        assertEquals("78:66:A5:5E:C4:59", p1.getEmbeddedMac(), "Vector 1 embeddedMac");
        assertEquals("78:66:A5:5E:C4:59", p1.getDeviceAddress(), "Vector 1 deviceAddress");

        // Vector 2: Unstable Fluctuating Packet
        DavelyMeasurementPacket p2 = DavelyScaleParser.parseHex("10FFC010195F00000A01247866A55EC459", "78:66:A5:5E:C4:59");
        assertTrue(p2.isValid(), "Vector 2 deve ser válido");
        assertEqualsDouble(64.95, p2.getWeightKg(), 0.001, "Vector 2 weightKg");
        assertEquals(6495, p2.getWeightRaw(), "Vector 2 weightRaw");
        assertEquals(false, p2.isStable(), "Vector 2 isStable");
        assertEquals(0, p2.getImpedanceRaw(), "Vector 2 impedanceRaw");
        assertEquals(0x10, p2.getSeq(), "Vector 2 seq");

        // Vector 3: Stable Locked Packet with Bioimpedance
        DavelyMeasurementPacket p3 = DavelyScaleParser.parseHex("10FFC007191917700A01257866A55EC459", "78:66:A5:5E:C4:59");
        assertTrue(p3.isValid(), "Vector 3 deve ser válido");
        assertEqualsDouble(64.25, p3.getWeightKg(), 0.001, "Vector 3 weightKg");
        assertEquals(6425, p3.getWeightRaw(), "Vector 3 weightRaw");
        assertEquals(true, p3.isStable(), "Vector 3 isStable (0x25)");
        assertEquals(6000, p3.getImpedanceRaw(), "Vector 3 impedanceRaw (0x1770)");
        assertEquals(0x25, p3.getAttributeByte(), "Vector 3 attributeByte");
        assertEquals("78:66:A5:5E:C4:59", p3.getEmbeddedMac(), "Vector 3 embeddedMac");

        System.out.println("  -> Vetores oficiais validados com sucesso.");
    }

    private static void testWeightRangeAndBoundaries() {
        System.out.println("\n--- 2. Testando Limites e Extremos de Peso (0.00kg a 655.35kg) ---");

        int[] rawValues = {
                0x0000, // 0.00 kg
                0x0001, // 0.01 kg
                0x0064, // 1.00 kg
                0x01F3, // 4.99 kg
                0x01F4, // 5.00 kg (min threshold)
                0x01F5, // 5.01 kg
                0x0BB8, // 30.00 kg
                0x1388, // 50.00 kg
                0x1F40, // 80.00 kg
                0x2710, // 100.00 kg
                0x2EE0, // 120.00 kg
                0x3E80, // 160.00 kg
                0x4E20, // 200.00 kg
                0x55EE, // 219.98 kg
                0x55F0, // 220.00 kg (max threshold)
                0x55F2, // 220.02 kg
                0x61A8, // 250.00 kg (overload)
                0xFFFF  // 655.35 kg (16-bit max)
        };

        for (int raw : rawValues) {
            double expectedKg = Math.round((raw / 100.0) * 100.0) / 100.0;
            int msb = (raw >> 8) & 0xFF;
            int lsb = raw & 0xFF;
            String hex = String.format("10FFC001%02X%02X00000A01257866A55EC459", msb, lsb);
            DavelyMeasurementPacket p = DavelyScaleParser.parseHex(hex);

            assertTrue(p.isValid(), "Pacote de peso raw " + raw + " deve ser válido");
            assertEquals(raw, p.getWeightRaw(), "weightRaw para " + expectedKg + "kg");
            assertEqualsDouble(expectedKg, p.getWeightKg(), 0.001, "weightKg para " + expectedKg + "kg");
        }

        System.out.println("  -> Limites de peso validados com sucesso.");
    }

    private static void testExhaustiveStabilityBitmask() {
        System.out.println("\n--- 3. Testando Exaustivamente Máscara de Estabilidade (0x00 a 0xFF) ---");

        for (int attr = 0; attr <= 255; attr++) {
            boolean expectedStable = (attr & 0x01) != 0;
            String hex = String.format("10FFC001191917700A01%02X7866A55EC459", attr);
            DavelyMeasurementPacket p = DavelyScaleParser.parseHex(hex);

            assertTrue(p.isValid(), "Pacote attr 0x" + Integer.toHexString(attr) + " deve ser válido");
            assertEquals(attr, p.getAttributeByte(), "attributeByte 0x" + Integer.toHexString(attr));
            assertEquals(expectedStable, p.isStable(), "isStable para attr 0x" + Integer.toHexString(attr));
        }

        // Casos nominais
        DavelyMeasurementPacket p25 = DavelyScaleParser.parseHex("10FFC001191917700A01257866A55EC459");
        assertEquals(true, p25.isStable(), "0x25 deve ser estável");
        DavelyMeasurementPacket p24 = DavelyScaleParser.parseHex("10FFC001191917700A01247866A55EC459");
        assertEquals(false, p24.isStable(), "0x24 deve ser instável");
        DavelyMeasurementPacket p21 = DavelyScaleParser.parseHex("10FFC001191917700A01217866A55EC459");
        assertEquals(true, p21.isStable(), "0x21 deve ser estável");
        DavelyMeasurementPacket p20 = DavelyScaleParser.parseHex("10FFC001191917700A01207866A55EC459");
        assertEquals(false, p20.isStable(), "0x20 deve ser instável");
        DavelyMeasurementPacket p01 = DavelyScaleParser.parseHex("10FFC001191917700A01017866A55EC459");
        assertEquals(true, p01.isStable(), "0x01 deve ser estável");
        DavelyMeasurementPacket p00 = DavelyScaleParser.parseHex("10FFC001191917700A01007866A55EC459");
        assertEquals(false, p00.isStable(), "0x00 deve ser instável");

        System.out.println("  -> Máscara de estabilidade validada para todos os 256 bytes.");
    }

    private static void testBioimpedancePreservation() {
        System.out.println("\n--- 4. Testando Preservação de Impedância Bruta (Contagens de Sensor) ---");

        int[] impValues = { 0, 1, 500, 3000, 5000, 6000, 7500, 10000, 15000, 65535 };

        for (int imp : impValues) {
            int msb = (imp >> 8) & 0xFF;
            int lsb = imp & 0xFF;
            String hex = String.format("10FFC0011919%02X%02X0A01257866A55EC459", msb, lsb);
            DavelyMeasurementPacket p = DavelyScaleParser.parseHex(hex);

            assertTrue(p.isValid(), "Pacote impedância raw " + imp + " deve ser válido");
            assertEquals(imp, p.getImpedanceRaw(), "Impedância bruta preservada sem perdas");
        }

        System.out.println("  -> Impedância bruta preservada com sucesso.");
    }

    private static void testSlidingWindowAndOffsetShifting() {
        System.out.println("\n--- 5. Testando Janela Deslizante e Deslocamento de Offset ---");

        byte[] davelyBytes = DavelyScaleParser.hexToBytes("10FFC007191917700A01257866A55EC459");
        int[] offsets = { 0, 1, 2, 3, 5, 8, 12, 19, 31, 50 };

        for (int off : offsets) {
            byte[] full = new byte[off + davelyBytes.length + 8];
            // Ruído prévio
            for (int i = 0; i < off; i++) {
                full[i] = (byte) (i % 2 == 0 ? 0x10 : 0x00);
            }
            System.arraycopy(davelyBytes, 0, full, off, davelyBytes.length);
            // Ruído posterior
            Arrays.fill(full, off + davelyBytes.length, full.length, (byte) 0xAA);

            assertTrue(DavelyScaleParser.looksLikeDavelyPacket(full), "looksLikeDavelyPacket no offset " + off);
            DavelyMeasurementPacket p = DavelyScaleParser.parse(full, "CUSTOM:MAC:99");

            assertTrue(p.isValid(), "Parse no offset " + off + " deve ser válido");
            assertEquals(off, p.getOffset(), "Offset detectado no buffer");
            assertEqualsDouble(64.25, p.getWeightKg(), 0.001, "weightKg no offset " + off);
            assertEquals(true, p.isStable(), "isStable no offset " + off);
            assertEquals(6000, p.getImpedanceRaw(), "impedanceRaw no offset " + off);
            assertEquals("78:66:A5:5E:C4:59", p.getEmbeddedMac(), "embeddedMac no offset " + off);
        }

        System.out.println("  -> Janela deslizante e offset shifting validados com sucesso.");
    }

    private static void testMalformedAndHostileInputs() {
        System.out.println("\n--- 6. Testando Entradas Malformadas, Truncadas e Hostis ---");

        // Nulos e vazios
        DavelyMeasurementPacket pNull = DavelyScaleParser.parse((byte[]) null);
        assertTrue(!pNull.isValid(), "byte[] nulo deve ser inválido");
        assertEquals("empty_or_invalid_input", pNull.getErrorReason(), "Motivo de erro para nulo");

        DavelyMeasurementPacket pHexNull = DavelyScaleParser.parseHex(null);
        assertTrue(!pHexNull.isValid(), "hex nulo deve ser inválido");

        DavelyMeasurementPacket pHexEmpty = DavelyScaleParser.parseHex("");
        assertTrue(!pHexEmpty.isValid(), "hex vazio deve ser inválido");

        // Truncados
        String base = "10FFC007191917700A01257866A55EC459";
        for (int i = 1; i < base.length(); i++) {
            String trunc = base.substring(0, i);
            DavelyMeasurementPacket pt = DavelyScaleParser.parseHex(trunc);
            assertTrue(!pt.isValid(), "Hex truncado len " + i + " deve ser inválido");
        }

        for (int i = 1; i < 17; i++) {
            byte[] trunc = new byte[i];
            DavelyMeasurementPacket pt = DavelyScaleParser.parse(trunc);
            assertTrue(!pt.isValid(), "Byte[] truncado len " + i + " deve ser inválido");
            assertEquals("truncated_payload", pt.getErrorReason(), "Motivo truncated_payload");
        }

        // Caracteres inválidos
        DavelyMeasurementPacket pG = DavelyScaleParser.parseHex("10FFC007191917700A01257866A55EC45G");
        assertTrue(!pG.isValid(), "Caractere 'G' deve ser inválido");

        DavelyMeasurementPacket pOdd = DavelyScaleParser.parseHex("10FFC007191917700A01257866A55EC45");
        assertTrue(!pOdd.isValid(), "Comprimento ímpar deve ser inválido");

        // Cabeçalhos errados
        DavelyMeasurementPacket pBadFamily = DavelyScaleParser.parseHex("10FFB007191917700A01257866A55EC459");
        assertTrue(!pBadFamily.isValid(), "Família 0xB0 deve ser inválida");

        DavelyMeasurementPacket pBadType = DavelyScaleParser.parseHex("1000C007191917700A01257866A55EC459");
        assertTrue(!pBadType.isValid(), "Tipo 0x00 deve ser inválido");

        DavelyMeasurementPacket pBadLen = DavelyScaleParser.parseHex("0EFFC007191917700A01257866A55EC459");
        assertTrue(!pBadLen.isValid(), "Comprimento 0x0E deve ser inválido");

        System.out.println("  -> Entradas malformadas e hostis rejeitadas com segurança.");
    }

    private static void testPacketModelInvariants() {
        System.out.println("\n--- 7. Testando Invariantes e Modelo de Dados Imutável ---");

        DavelyMeasurementPacket p1 = DavelyScaleParser.parseHex("10FFC007191917700A01257866A55EC459");
        DavelyMeasurementPacket p2 = DavelyScaleParser.parseHex("10FFC007191917700A01257866A55EC459");

        assertTrue(p1.toString().contains("64.25"), "toString() contém peso");
        assertTrue(p1.toString().contains("6000"), "toString() contém impedância");

        DavelyMeasurementPacket inv = DavelyMeasurementPacket.invalid("custom_error", "10FF", "00:11:22:33:44:55");
        assertTrue(!inv.isValid(), "Pacote invalid() deve ter isValid() == false");
        assertEquals("custom_error", inv.getErrorReason(), "Motivo do invalid()");
        assertEquals("00:11:22:33:44:55", inv.getDeviceAddress(), "DeviceAddress do invalid()");
        assertEquals("10FF", inv.getRawHex(), "RawHex do invalid()");

        System.out.println("  -> Invariantes do modelo de dados validadas.");
    }
}
