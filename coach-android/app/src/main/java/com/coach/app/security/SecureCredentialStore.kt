package com.coach.app.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.coach.app.ai.SupportedModels
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface GeminiCredentialStore {
    fun save(apiKey: String)
    fun load(): String?
    fun hasKey(): Boolean = load() != null
    fun clear()
}

object CredentialPolicy {
    private val modelPattern = Regex("gemini-[A-Za-z0-9.-]{1,72}")

    fun validateApiKey(value: String): String {
        val trimmed = value.trim()
        require(trimmed.length in 20..512) { "A chave precisa ter entre 20 e 512 caracteres." }
        require(trimmed.none { it.isWhitespace() || it.code < 0x21 || it.code > 0x7e }) {
            "A chave contém caracteres inválidos."
        }
        return trimmed
    }

    fun validateModel(value: String): String {
        val trimmed = value.trim()
        require(modelPattern.matches(trimmed)) { "Nome de modelo Gemini inválido." }
        require(SupportedModels.isSupported(trimmed)) { "Modelo Gemini não suportado." }
        return trimmed
    }
}

/** AES-GCM envelope whose non-exportable key lives in AndroidKeyStore. */
class SecureCredentialStore(context: Context) : GeminiCredentialStore {
    private val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun save(apiKey: String) {
        val validated = CredentialPolicy.validateApiKey(apiKey)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(validated.toByteArray(StandardCharsets.UTF_8))
        preferences.edit()
            .putString(KEY_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(KEY_CIPHERTEXT, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .apply()
    }

    override fun load(): String? {
        val ivText = preferences.getString(KEY_IV, null) ?: return null
        val ciphertextText = preferences.getString(KEY_CIPHERTEXT, null) ?: return null
        return try {
            val key = keyStore().getKey(KEY_ALIAS, null) as? SecretKey ?: return null
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                key,
                GCMParameterSpec(128, Base64.decode(ivText, Base64.NO_WRAP))
            )
            String(cipher.doFinal(Base64.decode(ciphertextText, Base64.NO_WRAP)), StandardCharsets.UTF_8)
                .let(CredentialPolicy::validateApiKey)
        } catch (_: Exception) {
            // Corrupted/invalidated material is made unusable without ever logging the secret.
            preferences.edit().remove(KEY_IV).remove(KEY_CIPHERTEXT).apply()
            null
        }
    }

    override fun clear() {
        preferences.edit().remove(KEY_IV).remove(KEY_CIPHERTEXT).apply()
        runCatching { keyStore().deleteEntry(KEY_ALIAS) }
    }

    private fun getOrCreateKey(): SecretKey {
        val existing = keyStore().getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val KEY_ALIAS = "coach.gemini.api.v1"
        private const val PREFS_NAME = "coach_secure_credentials"
        private const val KEY_IV = "gemini_iv"
        private const val KEY_CIPHERTEXT = "gemini_ciphertext"
    }
}
