from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'missing patch target: {label}')
    return text.replace(old, new, 1)

# ----- Core Worker routing / Telegram notification -----
p = Path('cloudflare/app-core-worker/src/index-v4.js')
s = p.read_text()
s = replace_once(
    s,
    "import { BroadcastUserStore } from './broadcast-user-store.js';\n\nexport class UserStore extends BroadcastUserStore {}",
    "import { SupportUserStore } from './support-user-store.js';\n\nexport class UserStore extends SupportUserStore {}",
    'support store import',
)
s = replace_once(
    s,
    "const ANDROID_USER_ACTIONS = new Set(['syncUser', 'updateHistory']);",
    "const ANDROID_USER_ACTIONS = new Set(['syncUser', 'updateHistory', 'supportCreate', 'supportList']);\nconst SUPPORT_USER_ACTIONS = new Set(['supportCreate', 'supportList']);\nconst SUPPORT_ADMIN_ACTIONS = new Set(['supportAdminList', 'supportReply', 'supportSetStatus']);",
    'support action sets',
)
old = """    if (url.pathname === '/compat' && request.method === 'POST') {
      try {
        const body = await request.clone().json();
        const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
        const action = String(payload.action || '');
        if (BROADCAST_ACTIONS.has(action)) {
          if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
          await verifyAdmin(String(body.telegramInitData || ''), env);
          const store = env.USERS.get(env.USERS.idFromName('global'));
          return handleBroadcastAction(store, action, payload, cors);
        }
      } catch (error) {
        if (BROADCAST_ACTIONS.has(await safeAction(request))) {
          return json({ success: false, ok: false, error: String(error?.message || 'Server error') }, Number(error?.status || 500), cors);
        }
      }
      return core.fetch(request, env, ctx);
    }
"""
new = """    if (url.pathname === '/compat' && request.method === 'POST') {
      let action = '';
      try {
        const body = await request.clone().json();
        const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
        action = String(payload.action || '');
        const isSupport = SUPPORT_USER_ACTIONS.has(action) || SUPPORT_ADMIN_ACTIONS.has(action);
        if (BROADCAST_ACTIONS.has(action) || isSupport) {
          if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
          const store = env.USERS.get(env.USERS.idFromName('global'));
          if (BROADCAST_ACTIONS.has(action)) {
            await verifyAdmin(String(body.telegramInitData || ''), env);
            return handleBroadcastAction(store, action, payload, cors);
          }
          if (SUPPORT_ADMIN_ACTIONS.has(action)) {
            await verifyAdmin(String(body.telegramInitData || ''), env);
            return handleSupportAdminAction(store, action, payload, cors);
          }
          const verified = await verifyTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
          const userId = String(verified.user.id || '');
          if (action === 'supportList') {
            return json(await callStore(store, '/support/user-list', { userId }), 200, cors);
          }
          const result = await callStore(store, '/support/create', {
            userId,
            source: 'web',
            subject: payload.subject,
            message: payload.message,
          });
          if (result.ticket) ctx.waitUntil(notifySupportAdmin(env, result.ticket));
          return json(result, 200, cors);
        }
      } catch (error) {
        if (BROADCAST_ACTIONS.has(action) || SUPPORT_USER_ACTIONS.has(action) || SUPPORT_ADMIN_ACTIONS.has(action)) {
          return json({ success: false, ok: false, error: String(error?.message || 'Server error') }, Number(error?.status || 500), cors);
        }
      }
      return core.fetch(request, env, ctx);
    }
"""
s = replace_once(s, old, new, 'web support routing')
old = """      if (action === 'syncUser') {
        const clientUser = payload.user && typeof payload.user === 'object' ? payload.user : {};
        if (String(clientUser.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
        const result = await callStore(store, '/sync', { verifiedUser: syntheticUser, clientUser });
        return json(syncResponse(result.user), 200, cors);
      }

      if (String(payload.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
"""
new = """      if (action === 'supportList') {
        return json(await callStore(store, '/support/user-list', { userId: androidUserId }), 200, cors);
      }

      if (action === 'supportCreate') {
        const result = await callStore(store, '/support/create', {
          userId: androidUserId,
          source: 'android',
          subject: payload.subject,
          message: payload.message,
        });
        if (result.ticket) ctx.waitUntil(notifySupportAdmin(env, result.ticket));
        return json(result, 200, cors);
      }

      if (action === 'syncUser') {
        const clientUser = payload.user && typeof payload.user === 'object' ? payload.user : {};
        if (String(clientUser.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
        const result = await callStore(store, '/sync', { verifiedUser: syntheticUser, clientUser });
        return json(syncResponse(result.user), 200, cors);
      }

      if (String(payload.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
"""
s = replace_once(s, old, new, 'android support routing')
insert_before = "async function handleBroadcastAction(store, action, payload, cors) {"
support_helpers = """async function handleSupportAdminAction(store, action, payload, cors) {
  if (action === 'supportAdminList') {
    return json(await callStore(store, '/support/admin-list', {}), 200, cors);
  }
  if (action === 'supportReply') {
    return json(await callStore(store, '/support/reply', { ticketId: payload.ticketId, message: payload.message }), 200, cors);
  }
  return json(await callStore(store, '/support/status', { ticketId: payload.ticketId, status: payload.status }), 200, cors);
}

async function notifySupportAdmin(env, ticket = {}) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.ADMIN_TELEGRAM_ID) return;
  const firstMessage = Array.isArray(ticket.messages) ? ticket.messages.find((item) => item.sender === 'user')?.body || '' : '';
  const text = [
    '🎧 Новое обращение в техподдержку',
    `№ ${String(ticket.id || '')}`,
    `Пользователь: ${String(ticket.userId || '')}`,
    `Источник: ${ticket.source === 'android' ? 'Android' : 'Web'}`,
    `Тема: ${String(ticket.subject || '')}`,
    '',
    String(firstMessage || '').slice(0, 900),
    '',
    'Откройте админ-панель → Техподдержка для ответа.',
  ].join('\\n');
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(env.ADMIN_TELEGRAM_ID),
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch {}
}

"""
if insert_before not in s:
    raise RuntimeError('missing helper insertion point')
s = s.replace(insert_before, support_helpers + insert_before, 1)
p.write_text(s)

# ----- Android CloudRepository -----
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt')
s = p.read_text()
needle = """    suspend fun updateHistory(id: String, routes: List<String>) = withContext(Dispatchers.IO) {
        runCatching {
            val payload = JSONObject().put("action", "updateHistory").put("id", id).put("history", JSONArray(routes))
            post("$CORE/android/compat", JSONObject().put("payload", payload).put("androidUserId", id))
        }
    }

"""
addition = needle + """    suspend fun createSupportTicket(id: String, subject: String, message: String): Result<SupportTicket> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = JSONObject()
                .put("action", "supportCreate")
                .put("subject", subject)
                .put("message", message)
                .put("source", "android")
            val json = post("$CORE/android/compat", JSONObject().put("payload", payload).put("androidUserId", id))
            parseSupportTicket(json.getJSONObject("ticket"))
        }
    }

    suspend fun listSupportTickets(id: String): Result<List<SupportTicket>> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = JSONObject().put("action", "supportList")
            val json = post("$CORE/android/compat", JSONObject().put("payload", payload).put("androidUserId", id))
            val array = json.optJSONArray("tickets") ?: JSONArray()
            List(array.length()) { index -> parseSupportTicket(array.getJSONObject(index)) }
        }
    }

    private fun parseSupportTicket(json: JSONObject): SupportTicket {
        val messagesJson = json.optJSONArray("messages") ?: JSONArray()
        val messages = List(messagesJson.length()) { index ->
            val item = messagesJson.getJSONObject(index)
            SupportMessage(
                sender = item.optString("sender", "user"),
                body = item.optString("body", ""),
                createdAt = item.optLong("createdAt", 0L),
            )
        }
        return SupportTicket(
            id = json.optString("id", ""),
            userId = json.optString("userId", ""),
            source = json.optString("source", "android"),
            subject = json.optString("subject", ""),
            status = json.optString("status", "new"),
            createdAt = json.optLong("createdAt", 0L),
            updatedAt = json.optLong("updatedAt", 0L),
            messages = messages,
        )
    }

"""
s = replace_once(s, needle, addition, 'CloudRepository support methods')
p.write_text(s)

# ----- Android navigation -----
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/App.kt')
s = p.read_text()
s = s.replace('private const val SUPPORT_LINK = "https://t.me/D_a_n_Vi"\n\nprivate fun openSupport(context: Context) {\n    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(SUPPORT_LINK)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))\n}\n\n', '')
s = replace_once(s, '    var currentGame by rememberSaveable { mutableStateOf<String?>(null) }\n', '    var currentGame by rememberSaveable { mutableStateOf<String?>(null) }\n    var supportOpen by rememberSaveable { mutableStateOf(false) }\n', 'support state')
s = replace_once(
    s,
    '    BackHandler(enabled = currentGame != null) { closeGame() }\n\n    AnimatedContent(',
    '    if (supportOpen) {\n        BackHandler { supportOpen = false }\n        SupportScreen(cloud = cloud, initialUserId = userId, onBack = { supportOpen = false })\n        return\n    }\n\n    BackHandler(enabled = currentGame != null) { closeGame() }\n\n    AnimatedContent(',
    'support navigation',
)
s = replace_once(
    s,
    '                onLogin = { id ->\n                    prefs.edit().putString(ID_KEY, id).apply()\n                    userId = id\n                },\n            )',
    '                onLogin = { id ->\n                    prefs.edit().putString(ID_KEY, id).apply()\n                    userId = id\n                },\n                onSupport = { supportOpen = true },\n            )',
    'login support callback',
)
s = replace_once(
    s,
    '                onLogout = {\n                    prefs.edit().remove(ID_KEY).apply(); userId = ""\n                },\n            )',
    '                onLogout = {\n                    prefs.edit().remove(ID_KEY).apply(); userId = ""\n                },\n                onSupport = { supportOpen = true },\n            )',
    'home support callback',
)
s = replace_once(s, 'private fun LoginScreen(onLogin: (String) -> Unit) {', 'private fun LoginScreen(onLogin: (String) -> Unit, onSupport: () -> Unit) {', 'login signature')
s = replace_once(
    s,
    '                    { openSupport(context) },\n                    Modifier.fillMaxWidth(),\n                    icon = "🎧",',
    '                    onSupport,\n                    Modifier.fillMaxWidth(),\n                    icon = "🎧",',
    'login support button',
)
s = replace_once(
    s,
    '    onOpenGame: (GameKey) -> Unit,\n    onLogout: () -> Unit,\n) {',
    '    onOpenGame: (GameKey) -> Unit,\n    onLogout: () -> Unit,\n    onSupport: () -> Unit,\n) {',
    'home signature',
)
# There is a second support button in HomeScreen. Replace the next remaining personal-support callback.
if '{ openSupport(context) }' in s:
    s = s.replace('{ openSupport(context) }', 'onSupport', 1)
# Remove any stale personal support URL accidentally left behind.
if 't.me/D_a_n_Vi' in s or 'SUPPORT_LINK' in s:
    raise RuntimeError('personal support link still present in Android App.kt')
p.write_text(s)

# ----- Web assets -----
p = Path('index.html')
s = p.read_text()
s = replace_once(s, '  <link rel="stylesheet" href="error-system.css?v=1" />\n', '  <link rel="stylesheet" href="error-system.css?v=1" />\n  <link rel="stylesheet" href="support-center.css?v=1" />\n', 'support css')
s = replace_once(s, '  <script src="admin-live-v2.js?v=3" defer></script>\n', '  <script src="admin-live-v2.js?v=3" defer></script>\n  <script src="support-center.js?v=1" defer></script>\n', 'support script')
p.write_text(s)

# ----- Android version -----
p = Path('android-app/app/build.gradle')
s = p.read_text().replace('versionCode 15', 'versionCode 16').replace("versionName '2.6.3-native'", "versionName '2.6.4-native'")
p.write_text(s)

p = Path('.github/workflows/build-android-apk.yml')
s = p.read_text().replace('2.6.3-native', '2.6.4-native')
p.write_text(s)

# ----- CI regression check -----
p = Path('.github/workflows/quality.yml')
s = p.read_text()
needle = '      - name: Check presence freshness logic\n        run: node scripts/check-presence-freshness.mjs\n'
if needle in s and 'Check support center integration' not in s:
    s = s.replace(needle, needle + '      - name: Check support center integration\n        run: node scripts/check-support-center.mjs\n', 1)
p.write_text(s)
