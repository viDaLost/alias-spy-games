from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_one(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


cloud_path = "android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt"
replace_one(
    cloud_path,
    "import java.io.IOException\nimport java.util.concurrent.TimeUnit",
    "import java.io.IOException\nimport java.util.UUID\nimport java.util.concurrent.TimeUnit",
)
replace_one(
    cloud_path,
    """data class AndroidAuthChallenge(\n    val telegramId: String,\n    val challengeId: String,\n    val expiresInSeconds: Int,\n)""",
    """data class AndroidAuthChallenge(\n    val telegramId: String,\n    val challengeId: String,\n    val expiresInSeconds: Int,\n    val deliveryConfirmed: Boolean = true,\n)""",
)
replace_one(
    cloud_path,
    """class AuthBotStartRequired(\n    val botUsername: String,\n    message: String,\n) : IOException(message)\n\nclass AuthSessionInvalid(message: String) : IOException(message)""",
    """class AuthBotStartRequired(\n    val botUsername: String,\n    message: String,\n) : IOException(message)\n\nclass AuthRequestRejected(message: String) : IOException(message)\n\nclass AuthSessionInvalid(message: String) : IOException(message)""",
)
replace_one(
    cloud_path,
    """    suspend fun requestLoginCode(id: String): Result<AndroidAuthChallenge> = withContext(Dispatchers.IO) {\n        runCatching {\n            val body = JSONObject().put(\"telegramId\", id)\n            val request = Request.Builder()\n                .url(\"$CORE/android/auth/request\")\n                .post(body.toString().toRequestBody(\"application/json; charset=utf-8\".toMediaType()))\n                .header(\"Accept\", \"application/json\")\n                .header(\"Origin\", \"https://vidalost.github.io\")\n                .header(\"Cache-Control\", \"no-store\")\n                .header(\"User-Agent\", \"BibleGames-Android/2.7.1 Native\")\n                .build()\n            accessFallbackClient.newCall(request).execute().use { response ->\n                val text = response.body?.string().orEmpty()\n                val json = runCatching { JSONObject(text) }.getOrNull()\n                if (!response.isSuccessful || json == null || !json.optBoolean(\"success\", false)) {\n                    val message = json?.optString(\"error\")?.takeIf { it.isNotBlank() } ?: \"Не удалось отправить код\"\n                    if (json?.optBoolean(\"requiresBotStart\", false) == true) {\n                        throw AuthBotStartRequired(json.optString(\"botUsername\", \"\"), message)\n                    }\n                    throw IOException(message)\n                }\n                AndroidAuthChallenge(\n                    telegramId = id,\n                    challengeId = json.getString(\"challengeId\"),\n                    expiresInSeconds = json.optInt(\"expiresInSeconds\", 600),\n                )\n            }\n        }.recoverCatching { cause ->\n            if (cause is AuthBotStartRequired) throw cause\n            if (cause is IOException && cause.message?.lowercase()?.contains(\"timeout\") == true) {\n                throw IOException(\"Сервер отвечает медленно. Проверьте интернет или VPN и запросите код ещё раз.\", cause)\n            }\n            throw cause\n        }\n    }""",
    """    suspend fun requestLoginCode(id: String): Result<AndroidAuthChallenge> = withContext(Dispatchers.IO) {\n        // The client owns the challenge id. This makes requesting a code retry-safe:\n        // if Telegram received the code but the HTTP response was lost, Android can\n        // repeat the same request and the server will return the existing challenge.\n        val challengeId = \"ach_${UUID.randomUUID().toString().replace(\"-\", \"\")}\"\n        runCatching {\n            val body = JSONObject()\n                .put(\"telegramId\", id)\n                .put(\"challengeId\", challengeId)\n            val request = Request.Builder()\n                .url(\"$CORE/android/auth/request\")\n                .post(body.toString().toRequestBody(\"application/json; charset=utf-8\".toMediaType()))\n                .header(\"Accept\", \"application/json\")\n                .header(\"Origin\", \"https://vidalost.github.io\")\n                .header(\"Cache-Control\", \"no-store\")\n                .header(\"User-Agent\", \"BibleGames-Android/2.7.2 Native\")\n                .build()\n            val response = executeSmallJsonWithRetry(request)\n            val json = response.json\n            if (response.status !in 200..299 || json == null || !json.optBoolean(\"success\", false)) {\n                val message = json?.optString(\"error\")?.takeIf { it.isNotBlank() } ?: \"Не удалось отправить код\"\n                if (json?.optBoolean(\"requiresBotStart\", false) == true) {\n                    throw AuthBotStartRequired(json.optString(\"botUsername\", \"\"), message)\n                }\n                throw AuthRequestRejected(message)\n            }\n            AndroidAuthChallenge(\n                telegramId = id,\n                challengeId = json.optString(\"challengeId\", challengeId).ifBlank { challengeId },\n                expiresInSeconds = json.optInt(\"expiresInSeconds\", 600),\n                deliveryConfirmed = true,\n            )\n        }.recoverCatching { cause ->\n            if (cause is AuthBotStartRequired || cause is AuthRequestRejected) throw cause\n            if (cause is IOException) {\n                // A lost response must not hide the code field. If the server already\n                // sent the Telegram message, the locally known challenge id is enough\n                // to verify it. If the request never arrived, no code will arrive and\n                // the player can simply request another one.\n                AndroidAuthChallenge(\n                    telegramId = id,\n                    challengeId = challengeId,\n                    expiresInSeconds = 600,\n                    deliveryConfirmed = false,\n                )\n            } else {\n                throw cause\n            }\n        }\n    }""",
)
replace_one(cloud_path, 'BibleGames-Android/2.7.1 Native', 'BibleGames-Android/2.7.2 Native')

app_path = "android-app/app/src/main/java/com/vidalost/biblegames/App.kt"
replace_one(
    app_path,
    """            cloud.requestLoginCode(id).onSuccess {\n                challenge = it\n                info = \"Код отправлен в @$TELEGRAM_BOT_USERNAME. Введите 6 цифр из сообщения бота.\"\n            }.onFailure { cause ->""",
    """            cloud.requestLoginCode(id).onSuccess {\n                challenge = it\n                info = if (it.deliveryConfirmed) {\n                    \"Код отправлен в @$TELEGRAM_BOT_USERNAME. Введите 6 цифр из сообщения бота.\"\n                } else {\n                    \"Если код уже пришёл в @$TELEGRAM_BOT_USERNAME, введите 6 цифр ниже. Ответ сервера потерялся, но полученный код можно подтвердить.\"\n                }\n            }.onFailure { cause ->""",
)

store_path = "cloudflare/app-core-worker/src/android-auth-user-store.js"
replace_one(
    store_path,
    """    this.cleanupAuth(now);\n    const byId = this.sql.exec(""",
    """    this.cleanupAuth(now);\n\n    // A mobile request can reach Cloudflare and send the Telegram message while\n    // its HTTP response is lost. The client therefore retries with the same\n    // challenge id. Return the existing challenge before rate-limit accounting\n    // so a transport retry neither creates a second code nor consumes quota.\n    const existing = this.sql.exec(\n      'SELECT telegram_id, expires_at FROM android_auth_challenges WHERE id = ?',\n      challengeId,\n    ).toArray()[0];\n    if (existing) {\n      if (String(existing.telegram_id || '') !== telegramId) {\n        return fail(409, 'AUTH_CHALLENGE_CONFLICT', 'Некорректный запрос подтверждения');\n      }\n      if (Number(existing.expires_at || 0) > now) {\n        return {\n          ok: true,\n          success: true,\n          existing: true,\n          expiresAt: Number(existing.expires_at || 0),\n        };\n      }\n      this.sql.exec('DELETE FROM android_auth_challenges WHERE id = ?', challengeId);\n    }\n\n    const byId = this.sql.exec(""",
)
replace_one(
    store_path,
    """    return { ok: true, success: true };\n  }\n\n  async dropChallenge""",
    """    return { ok: true, success: true, existing: false, expiresAt };\n  }\n\n  async dropChallenge""",
)

core_path = "cloudflare/app-core-worker/src/index-v4.js"
replace_one(
    core_path,
    """    const challengeId = `ach_${crypto.randomUUID().replaceAll('-', '')}`;\n    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');""",
    """    const requestedChallengeId = String(body?.challengeId || '').trim();\n    const challengeId = /^ach_[a-zA-Z0-9_-]{20,80}$/.test(requestedChallengeId)\n      ? requestedChallengeId\n      : `ach_${crypto.randomUUID().replaceAll('-', '')}`;\n    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');""",
)
replace_one(
    core_path,
    """    const store = env.USERS.get(env.USERS.idFromName('global'));\n    await callStore(store, '/android-auth/begin', { challengeId, telegramId, codeHash, requestKey, expiresAt });\n\n    const sent = await telegramSendLoginCode(env, telegramId, code);""",
    """    const store = env.USERS.get(env.USERS.idFromName('global'));\n    const begin = await callStore(store, '/android-auth/begin', { challengeId, telegramId, codeHash, requestKey, expiresAt });\n\n    if (begin.existing) {\n      return json({\n        success: true,\n        challengeId,\n        expiresInSeconds: Math.max(1, Math.floor((Number(begin.expiresAt || expiresAt) - Date.now()) / 1000)),\n        reused: true,\n      }, 200, cors);\n    }\n\n    const sent = await telegramSendLoginCode(env, telegramId, code);""",
)

build_path = "android-app/app/build.gradle"
replace_one(build_path, "versionCode 21", "versionCode 22")
replace_one(build_path, "versionName '2.7.1-native'", "versionName '2.7.2-native'")

check_path = "scripts/check-android-secure-auth.mjs"
replace_one(
    check_path,
    """need(cloud, 'executeSmallJsonWithRetry', 'verification/access calls do not retry alternate transport');\nreject(cloud, 'android/access?id=', 'client can still choose identity in access URL');""",
    """need(cloud, 'executeSmallJsonWithRetry', 'verification/access calls do not retry alternate transport');\nneed(cloud, '.put(\"challengeId\", challengeId)', 'code request does not carry a client-owned retry id');\nneed(cloud, 'deliveryConfirmed = false', 'lost auth-request responses still hide the code entry step');\nreject(cloud, 'android/access?id=', 'client can still choose identity in access URL');""",
)
replace_one(
    check_path,
    """need(core, \"request.headers.get('CF-Connecting-IP')\", 'auth request rate limit is not keyed to requester network');\nreject(core, 'Вход администратора через Android недоступен', 'backend still blocks the administrator account on Android');""",
    """need(core, \"request.headers.get('CF-Connecting-IP')\", 'auth request rate limit is not keyed to requester network');\nneed(core, 'if (begin.existing)', 'retrying a lost code-request response can send a second Telegram code');\nreject(core, 'Вход администратора через Android недоступен', 'backend still blocks the administrator account on Android');""",
)
replace_one(
    check_path,
    """need(authStore, 'INSERT OR IGNORE INTO android_sessions', 'verification is not idempotent after a lost response');\nneed(authStore, 'CHALLENGE_VERIFY_GRACE_MS', 'OTP can expire while a verification request is in flight');""",
    """need(authStore, 'INSERT OR IGNORE INTO android_sessions', 'verification is not idempotent after a lost response');\nneed(authStore, 'existing: true', 'code request is not idempotent after a lost response');\nneed(authStore, 'CHALLENGE_VERIFY_GRACE_MS', 'OTP can expire while a verification request is in flight');""",
)
replace_one(check_path, "versionName '2.7.1-native'", "versionName '2.7.2-native'")
replace_one(check_path, "versionCode 21", "versionCode 22")

print("Android auth request timeout 2.7.2 patch applied successfully")
