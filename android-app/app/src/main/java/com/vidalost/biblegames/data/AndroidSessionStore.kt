package com.vidalost.biblegames.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Keeps the bearer token encrypted at rest with a non-exportable Android Keystore key.
 * The Telegram ID itself is not secret; the bearer token is.
 */
data class StoredAndroidSession(
    val userId: String,
    val token: String,
    val expiresAt: Long,
)

class AndroidSessionStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun save(userId: String, token: String, expiresAt: Long) {
        require(userId.matches(Regex("^[0-9]{5,20}$")))
        require(token.matches(Regex("^bgs_[A-Za-z0-9_-]{40,80}$")))
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val plaintext = "$userId\n$expiresAt\n$token".toByteArray(StandardCharsets.UTF_8)
        val encrypted = cipher.doFinal(plaintext)
        prefs.edit()
            .putString(IV_KEY, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(DATA_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .apply()
    }

    fun load(): StoredAndroidSession? {
        val ivText = prefs.getString(IV_KEY, null) ?: return null
        val dataText = prefs.getString(DATA_KEY, null) ?: return null
        return runCatching {
            val iv = Base64.decode(ivText, Base64.NO_WRAP)
            val encrypted = Base64.decode(dataText, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
            val plaintext = String(cipher.doFinal(encrypted), StandardCharsets.UTF_8)
            val parts = plaintext.split('\n', limit = 3)
            require(parts.size == 3)
            val userId = parts[0]
            val expiresAt = parts[1].toLong()
            val token = parts[2]
            require(userId.matches(Regex("^[0-9]{5,20}$")))
            require(token.matches(Regex("^bgs_[A-Za-z0-9_-]{40,80}$")))
            require(expiresAt > System.currentTimeMillis())
            StoredAndroidSession(userId, token, expiresAt)
        }.getOrElse {
            clear()
            null
        }
    }

    fun clear() {
        prefs.edit().remove(IV_KEY).remove(DATA_KEY).apply()
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        private const val PREFS = "bible_games_secure_session"
        private const val IV_KEY = "session_iv_v1"
        private const val DATA_KEY = "session_ciphertext_v1"
        private const val KEY_ALIAS = "bible_games_android_session_v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
