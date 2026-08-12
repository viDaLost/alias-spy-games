package com.vidalost.biblegames

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.vidalost.biblegames.data.AppPresenceClient
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.data.CloudRepository
import com.vidalost.biblegames.data.AndroidAuthChallenge
import com.vidalost.biblegames.data.AndroidSessionStore
import com.vidalost.biblegames.data.AuthBotStartRequired
import com.vidalost.biblegames.games.GameHost
import com.vidalost.biblegames.model.GameKey
import com.vidalost.biblegames.model.GameSection
import com.vidalost.biblegames.model.PlayerProfile
import com.vidalost.biblegames.ui.AppBackground
import com.vidalost.biblegames.ui.AssetImage
import com.vidalost.biblegames.ui.Cyan
import com.vidalost.biblegames.ui.GlassCard
import com.vidalost.biblegames.ui.Indigo
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.PrimaryButton
import com.vidalost.biblegames.ui.SecondaryButton
import com.vidalost.biblegames.ui.StatusPill
import com.vidalost.biblegames.ui.bounceClick
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

private const val PREFS = "bible_games_native"
private const val ID_KEY = "telegram_id"
private const val HISTORY_KEY = "last_games"
private const val RECENT_HIDDEN_KEY = "recent_games_hidden"
private const val ADMIN_ID = "1288379477"
private const val ACCESS_POLL_MS = 3_000L
private const val ACCESS_RETRY_MS = 900L
private fun profileKey(userId: String, field: String) = "profile_${userId}_$field"
private fun banKey(userId: String) = "profile_${userId}_banned"

private fun historyRoute(value: String): String? = GameKey.entries
    .firstOrNull { it.route == value || it.title == value }
    ?.route

private fun normalizeHistory(values: Iterable<String>): List<String> = values
    .mapNotNull(::historyRoute)
    .distinct()
    .take(3)

private fun cloudHistory(routes: Iterable<String>): List<String> = routes
    .mapNotNull(GameKey::fromRoute)
    .map(GameKey::title)
    .distinct()
    .take(3)

private fun loadLocalProfile(context: Context, userId: String, history: List<String>): PlayerProfile {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return PlayerProfile(
        id = userId,
        wowStars = prefs.getInt(profileKey(userId, "wow"), 20),
        wordSearchStars = prefs.getInt(profileKey(userId, "word_search"), 0),
        sacredLevel = prefs.getInt(profileKey(userId, "sacred"), 0),
        lastGames = cloudHistory(history),
    )
}

private fun saveLocalProfile(context: Context, profile: PlayerProfile) {
    if (profile.id.isBlank()) return
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putInt(profileKey(profile.id, "wow"), profile.wowStars)
        .putInt(profileKey(profile.id, "word_search"), profile.wordSearchStars)
        .putInt(profileKey(profile.id, "sacred"), profile.sacredLevel)
        .apply()
}

@Composable
fun BibleGamesApp(assets: AssetRepository, cloud: CloudRepository) {
    val context = LocalContext.current
    val appScope = rememberCoroutineScope()
    val prefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    val sessionStore = remember { AndroidSessionStore(context) }
    val restoredSession = remember { sessionStore.load() }
    var userId by rememberSaveable { mutableStateOf(restoredSession?.userId.orEmpty()) }
    var currentGame by rememberSaveable { mutableStateOf<String?>(null) }
    var supportOpen by rememberSaveable { mutableStateOf(false) }
    var activeRoomId by rememberSaveable { mutableStateOf("") }
    var history by remember {
        mutableStateOf(normalizeHistory(prefs.getString(HISTORY_KEY, "").orEmpty().split(',').filter { it.isNotBlank() }))
    }
    var profile by remember(userId) { mutableStateOf(loadLocalProfile(context, userId, history)) }
    var isBanned by remember(userId) { mutableStateOf(prefs.getBoolean(banKey(userId), false)) }
    var accessChecked by remember(userId) { mutableStateOf(false) }
    var syncing by remember(userId) { mutableStateOf(false) }
    val lifecycleOwner = LocalLifecycleOwner.current
    // Do not open the presence WebSocket until access is verified. Besides
    // preventing blocked/unverified sessions from appearing online, this avoids
    // competing with the tiny access request during cold mobile/VPN startup.
    val presence = remember(userId, accessChecked, isBanned) {
        if (userId.matches(Regex("^[0-9]{5,20}$")) && accessChecked && !isBanned)
            AppPresenceClient(context, cloud, userId)
        else null
    }

    DisposableEffect(lifecycleOwner, presence) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> presence?.start()
                Lifecycle.Event.ON_STOP -> presence?.stop()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) presence?.start()
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            presence?.stop()
        }
    }

    LaunchedEffect(presence, currentGame, activeRoomId) {
        presence?.update(currentGame, activeRoomId)
    }

    fun applyAccessState(banned: Boolean) {
        isBanned = banned
        accessChecked = true
        prefs.edit().putBoolean(banKey(userId), banned).apply()
        if (banned) {
            currentGame = null
            activeRoomId = ""
        }
    }

    // One access monitor owns both startup verification and later ban/unban
    // refreshes. Network failures retry automatically; there are no overlapping
    // manual + polling requests and no raw timeout screen for the player.
    LaunchedEffect(userId) {
        if (!userId.matches(Regex("^[0-9]{5,20}$")) || userId == ADMIN_ID) {
            accessChecked = false
            return@LaunchedEffect
        }
        if (!isBanned) accessChecked = false
        while (true) {
            val firstVerification = !accessChecked
            val wasBanned = isBanned
            val result = cloud.checkAccess(userId)
            result.onSuccess { banned ->
                applyAccessState(banned)
                if (!banned && (firstVerification || wasBanned)) {
                    syncing = true
                    launch {
                        cloud.syncProfile(userId, profile).onSuccess {
                            profile = it
                            saveLocalProfile(context, it)
                            if (it.lastGames.isNotEmpty()) {
                                history = normalizeHistory(history + it.lastGames)
                                prefs.edit().putString(HISTORY_KEY, history.joinToString(",")).apply()
                            }
                        }
                        syncing = false
                    }
                }
            }
            delay(if (result.isSuccess) ACCESS_POLL_MS else ACCESS_RETRY_MS)
        }
    }

    // The web app writes progress immediately.  Mirror that behaviour with a
    // short debounce so a completed level survives process death and appears
    // on the website/admin panel without waiting for the game screen to close.
    LaunchedEffect(userId, profile.wowStars, profile.wordSearchStars, profile.sacredLevel, history, accessChecked, isBanned) {
        if (!userId.matches(Regex("^[0-9]{5,20}$")) || userId == ADMIN_ID || !accessChecked || isBanned) return@LaunchedEffect
        delay(650)
        val snapshot = profile.copy(lastGames = cloudHistory(history))
        saveLocalProfile(context, snapshot)
        cloud.syncProfile(userId, snapshot)
        cloud.updateHistory(userId, snapshot.lastGames)
    }

    fun openGame(game: GameKey) {
        if (!accessChecked) {
            Toast.makeText(context, "Проверяем доступ. Игра откроется после подтверждения.", Toast.LENGTH_SHORT).show()
            return
        }
        if (isBanned) return
        activeRoomId = ""
        currentGame = game.route
        history = (listOf(game.route) + history).distinct().take(3)
        prefs.edit().putString(HISTORY_KEY, history.joinToString(",")).apply()
        val historySnapshot = cloudHistory(history)
        appScope.launch { cloud.updateHistory(userId, historySnapshot) }
    }

    fun logout() {
        val oldToken = cloud.currentSessionToken()
        appScope.launch {
            if (oldToken.isNotBlank()) cloud.logoutSession()
        }
        cloud.setSessionToken("")
        sessionStore.clear()
        prefs.edit().remove(ID_KEY).apply()
        userId = ""
        currentGame = null
        activeRoomId = ""
        accessChecked = false
        isBanned = false
    }

    fun closeGame() {
        activeRoomId = ""
        currentGame = null
        if (isBanned) return
        val historySnapshot = history
        val profileSnapshot = profile.copy(lastGames = cloudHistory(historySnapshot))
        saveLocalProfile(context, profileSnapshot)
        appScope.launch {
            cloud.syncProfile(userId, profileSnapshot)
            cloud.updateHistory(userId, profileSnapshot.lastGames)
        }
    }

    if (supportOpen) {
        BackHandler { supportOpen = false }
        SupportScreen(cloud = cloud, initialUserId = userId, onBack = { supportOpen = false })
        return
    }

    BackHandler(enabled = currentGame != null) { closeGame() }

    AnimatedContent(
        targetState = Triple(userId.isNotBlank(), currentGame, isBanned),
        transitionSpec = {
            val forward = targetState.second != null
            (slideInHorizontally(tween(420)) { if (forward) it else -it / 3 } + fadeIn(tween(260))) togetherWith
                (slideOutHorizontally(tween(340)) { if (forward) -it / 4 else it } + fadeOut(tween(220)))
        },
        label = "rootNavigation",
    ) { (signedIn, route, banned) ->
        when {
            !signedIn -> LoginScreen(
                cloud = cloud,
                onLogin = { id, token, expiresAt ->
                    cloud.setSessionToken(token)
                    sessionStore.save(id, token, expiresAt)
                    prefs.edit().putString(ID_KEY, id).apply()
                    userId = id
                },
            )
            banned -> AccessRestrictedScreen(
                onLogout = ::logout,
                onSupport = { supportOpen = true },
            )
            route != null -> GameHost(
                game = GameKey.fromRoute(route) ?: GameKey.ALIAS,
                assets = assets,
                cloud = cloud,
                userId = userId,
                profile = profile,
                onProfileChange = {
                    profile = it
                    saveLocalProfile(context, it)
                },
                onRoomChanged = { activeRoomId = it },
                onBack = ::closeGame,
            )
            else -> HomeScreen(
                assets = assets,
                history = history,
                syncing = syncing,
                accessReady = accessChecked,
                profile = profile,
                onOpenGame = ::openGame,
                onLogout = ::logout,
                onSupport = { supportOpen = true },
            )
        }
    }
}

@Composable
private fun LoginScreen(
    cloud: CloudRepository,
    onLogin: (String, String, Long) -> Unit,
) {
    val context = LocalContext.current
    val focus = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    var id by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var challenge by remember { mutableStateOf<AndroidAuthChallenge?>(null) }
    var botUsername by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var info by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf(false) }

    fun validId(): Boolean {
        focus.clearFocus()
        error = when {
            !id.matches(Regex("^[0-9]{5,20}$")) -> "Введите числовой Telegram ID (от 5 до 20 цифр)."
            id == ADMIN_ID -> "Вход администратора через Android недоступен."
            else -> null
        }
        return error == null
    }

    fun requestCode() {
        if (!validId() || busy) return
        busy = true
        error = null
        info = null
        challenge = null
        code = ""
        scope.launch {
            cloud.requestLoginCode(id).onSuccess {
                challenge = it
                info = "Код отправлен вам в Telegram. Введите 6 цифр из сообщения бота."
            }.onFailure { cause ->
                if (cause is AuthBotStartRequired) botUsername = cause.botUsername
                error = cause.message ?: "Не удалось отправить код"
            }
            busy = false
        }
    }

    fun verifyCode() {
        val current = challenge ?: run {
            error = "Сначала запросите код в Telegram."
            return
        }
        if (!code.matches(Regex("^\\d{6}$"))) {
            error = "Введите шестизначный код из Telegram."
            return
        }
        if (busy) return
        busy = true
        error = null
        scope.launch {
            cloud.verifyLoginCode(current, code).onSuccess { session ->
                onLogin(session.userId, session.token, session.expiresAt)
            }.onFailure { cause ->
                error = cause.message ?: "Код не подтверждён"
            }
            busy = false
        }
    }

    AppBackground {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(22.dp, 34.dp, 22.dp, 38.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item {
                Surface(Modifier.size(92.dp), RoundedCornerShape(28.dp), color = Color.White, shadowElevation = 12.dp) {
                    Box(Modifier.background(Brush.linearGradient(listOf(Color(0xFFEEF2FF), Color(0xFFE0F7FF)))), contentAlignment = Alignment.Center) {
                        Text("📖", fontSize = 47.sp)
                    }
                }
                Spacer(Modifier.height(18.dp))
                Text("Библейские игры", color = Color(0xFF25236E), fontSize = 31.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                Text("Безопасный вход через Telegram", color = InkSoft, fontSize = 15.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Spacer(Modifier.height(24.dp))
                GlassCard(Modifier.fillMaxWidth()) {
                    Text("Подтвердите свой Telegram", color = Color(0xFF312E81), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                    Spacer(Modifier.height(9.dp))
                    Text(
                        "Теперь одного Telegram ID недостаточно. Мы отправим одноразовый код именно в ваш Telegram — поэтому войти под чужим ID нельзя.",
                        color = InkSoft,
                        lineHeight = 21.sp,
                    )
                    Spacer(Modifier.height(15.dp))
                    OutlinedTextField(
                        value = id,
                        onValueChange = { value ->
                            id = value.filter(Char::isDigit).take(20)
                            challenge = null
                            code = ""
                            error = null
                            info = null
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy,
                        label = { Text("Telegram ID") },
                        placeholder = { Text("Например: 123456789") },
                        singleLine = true,
                        isError = error != null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
                        shape = RoundedCornerShape(18.dp),
                        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Indigo, unfocusedBorderColor = Color(0xFFC7D2FE)),
                    )
                    Spacer(Modifier.height(12.dp))
                    PrimaryButton(
                        if (busy && challenge == null) "Отправляем…" else "Получить код в Telegram",
                        ::requestCode,
                        Modifier.fillMaxWidth(),
                        icon = "✉",
                    )
                    if (botUsername.isNotBlank()) {
                        Spacer(Modifier.height(10.dp))
                        com.vidalost.biblegames.ui.SecondaryButton(
                            "Открыть @$botUsername",
                            { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/$botUsername?start=android_login"))) },
                            Modifier.fillMaxWidth(),
                            icon = "↗",
                        )
                        Spacer(Modifier.height(7.dp))
                        Text("Нажмите Start в Telegram, вернитесь сюда и снова запросите код.", color = InkSoft, fontSize = 12.sp)
                    }
                    if (challenge != null) {
                        Spacer(Modifier.height(14.dp))
                        OutlinedTextField(
                            value = code,
                            onValueChange = { value -> code = value.filter(Char::isDigit).take(6); error = null },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !busy,
                            label = { Text("Код из Telegram") },
                            placeholder = { Text("000000") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { verifyCode() }),
                            shape = RoundedCornerShape(18.dp),
                            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Indigo, unfocusedBorderColor = Color(0xFFC7D2FE)),
                        )
                        Spacer(Modifier.height(12.dp))
                        PrimaryButton(if (busy) "Проверяем…" else "Подтвердить и войти", ::verifyCode, Modifier.fillMaxWidth(), icon = "✓")
                    }
                    info?.let {
                        Spacer(Modifier.height(10.dp))
                        Text(it, color = Color(0xFF047857), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                    error?.let {
                        Spacer(Modifier.height(10.dp))
                        Text(it, color = Color(0xFFB91C1C), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.height(13.dp))
                Text("Код действует 10 минут. После подтверждения приложение хранит защищённую сессию на этом устройстве — вводить ID при каждом запуске не потребуется.", color = InkSoft, textAlign = TextAlign.Center, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun HomeScreen(
    assets: AssetRepository,
    history: List<String>,
    syncing: Boolean,
    accessReady: Boolean,
    profile: PlayerProfile,
    onOpenGame: (GameKey) -> Unit,
    onLogout: () -> Unit,
    onSupport: () -> Unit,
) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    val recentPreferenceKey = "${RECENT_HIDDEN_KEY}_${profile.id.ifBlank { "anon" }}"
    var recentHidden by rememberSaveable(profile.id) {
        mutableStateOf(prefs.getBoolean(recentPreferenceKey, false))
    }
    val screenWidth = LocalConfiguration.current.screenWidthDp
    val fontScale = LocalDensity.current.fontScale
    val columns = when {
        screenWidth < 380 || fontScale > 1.15f -> 1
        screenWidth >= 840 -> 4
        screenWidth >= 600 -> 3
        else -> 2
    }
    AppBackground {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 18.dp, bottom = 34.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("МИНИ‑ИГРЫ ДЛЯ КОМПАНИИ", color = Indigo, fontSize = 11.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Black)
                    Text("Библейские игры", color = Color(0xFF25236E), fontSize = 31.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                    Text("Выберите игру и начните партию", color = InkSoft, fontSize = 15.sp)
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatusPill(
                            when {
                                !accessReady -> "Проверяем доступ…"
                                syncing -> "Синхронизация…"
                                else -> "Прогресс сохранён"
                            },
                            if (!accessReady || syncing) Cyan else Color(0xFF059669),
                            if (!accessReady || syncing) "↻" else "✓",
                        )
                        StatusPill("★ ${profile.wowStars}", Color(0xFFB7791F))
                    }
                }
            }
            if (history.isNotEmpty()) {
                if (!recentHidden) {
                    item { SectionTitle("Недавно открытые") }
                    items(history.mapNotNull(GameKey::fromRoute)) { game ->
                        CompactRecentCard(game, assets) { onOpenGame(game) }
                    }
                    item {
                        SecondaryButton(
                            "Скрыть недавно открытые",
                            {
                                recentHidden = true
                                prefs.edit().putBoolean(recentPreferenceKey, true).apply()
                            },
                            Modifier.fillMaxWidth(),
                            icon = "⌃",
                        )
                    }
                } else {
                    item {
                        SecondaryButton(
                            "Показать недавно открытые",
                            {
                                recentHidden = false
                                prefs.edit().putBoolean(recentPreferenceKey, false).apply()
                            },
                            Modifier.fillMaxWidth(),
                            icon = "⌄",
                        )
                    }
                }
            }
            GameSection.entries.forEach { section ->
                item { SectionTitle(section.label) }
                val games = GameKey.entries.filter { it.section == section }
                items(games.chunked(columns)) { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { game ->
                            GameCard(game, assets, Modifier.weight(1f), rowLayout = columns == 1) { onOpenGame(game) }
                        }
                        repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
            item { SectionTitle("Помощь") }
            item { SupportCard(onSupport) }
            item {
                Spacer(Modifier.height(4.dp))
                Surface(
                    Modifier.fillMaxWidth().bounceClick(onClick = onLogout),
                    RoundedCornerShape(20.dp), color = Color.White.copy(.72f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color.White),
                ) {
                    Text("Сменить Telegram ID", Modifier.padding(16.dp), color = InkSoft, textAlign = TextAlign.Center, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, Modifier.padding(start = 6.dp, top = 8.dp), color = Ink, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
}

@Composable
private fun GameCard(
    game: GameKey,
    assets: AssetRepository,
    modifier: Modifier,
    rowLayout: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        modifier.heightIn(min = if (rowLayout) 116.dp else 178.dp).bounceClick(onClick = onClick),
        RoundedCornerShape(25.dp),
        color = Color.White.copy(alpha = .9f),
        shadowElevation = 7.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White),
    ) {
        if (rowLayout) {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(Modifier.size(76.dp), RoundedCornerShape(21.dp), color = Color(game.accent).copy(alpha = .09f)) {
                    AssetImage(assets, game.iconAsset, Modifier.fillMaxSize().padding(5.dp))
                }
                GameCardText(game, Modifier.weight(1f).padding(horizontal = 14.dp))
                Text("→", color = Color(game.accent), fontSize = 25.sp, fontWeight = FontWeight.Bold)
            }
        } else {
            Column(Modifier.padding(14.dp), horizontalAlignment = Alignment.Start) {
                Surface(Modifier.size(68.dp), RoundedCornerShape(21.dp), color = Color(game.accent).copy(alpha = .09f)) {
                    AssetImage(assets, game.iconAsset, Modifier.fillMaxSize().padding(5.dp))
                }
                Spacer(Modifier.height(10.dp))
                GameCardText(game)
            }
        }
    }
}

@Composable
private fun GameCardText(game: GameKey, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(
            game.title,
            color = Ink,
            fontSize = 15.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 2,
            lineHeight = 18.sp,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(3.dp))
        Text(
            game.description,
            color = InkSoft,
            fontSize = 11.sp,
            maxLines = 3,
            lineHeight = 14.sp,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SupportCard(onClick: () -> Unit) {
    Surface(
        Modifier.fillMaxWidth().heightIn(min = 94.dp).bounceClick(onClick = onClick),
        RoundedCornerShape(24.dp),
        color = Color.White.copy(.9f),
        shadowElevation = 6.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White),
    ) {
        Row(Modifier.padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(Modifier.size(58.dp), RoundedCornerShape(18.dp), color = Color(0xFFE0F2FE)) {
                Box(
                    Modifier.background(Brush.linearGradient(listOf(Color(0xFFE0E7FF), Color(0xFFCFFAFE)))),
                    contentAlignment = Alignment.Center,
                ) { SupportIcon(Modifier.size(48.dp)) }
            }
            Column(Modifier.weight(1f).padding(horizontal = 13.dp)) {
                Text("Техподдержка", color = Ink, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
                Text(
                    "Сообщить об ошибке или предложить улучшение",
                    color = InkSoft,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text("→", color = Indigo, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun SupportIcon(modifier: Modifier = Modifier) {
    Canvas(modifier.padding(7.dp)) {
        val stroke = size.minDimension * .095f
        val gold = Color(0xFFF59E0B)
        drawRoundRect(
            brush = Brush.linearGradient(listOf(Color(0xFF4F46E5), Color(0xFF0EA5E9))),
            size = size,
            cornerRadius = CornerRadius(size.minDimension * .28f),
        )
        drawArc(
            color = Color(0xFFFFE08A),
            startAngle = 195f,
            sweepAngle = 150f,
            useCenter = false,
            topLeft = Offset(size.width * .2f, size.height * .18f),
            size = Size(size.width * .6f, size.height * .62f),
            style = Stroke(stroke, cap = StrokeCap.Round),
        )
        val earSize = Size(size.width * .15f, size.height * .3f)
        drawRoundRect(gold, Offset(size.width * .12f, size.height * .48f), earSize, CornerRadius(stroke))
        drawRoundRect(gold, Offset(size.width * .73f, size.height * .48f), earSize, CornerRadius(stroke))
        drawArc(
            color = Color.White,
            startAngle = 8f,
            sweepAngle = 82f,
            useCenter = false,
            topLeft = Offset(size.width * .42f, size.height * .56f),
            size = Size(size.width * .34f, size.height * .28f),
            style = Stroke(stroke * .55f, cap = StrokeCap.Round),
        )
        drawCircle(Color.White, radius = stroke * .52f, center = Offset(size.width * .69f, size.height * .82f))
    }
}

@Composable
private fun CompactRecentCard(game: GameKey, assets: AssetRepository, onClick: () -> Unit) {
    Surface(
        Modifier.fillMaxWidth().heightIn(min = 90.dp).bounceClick(onClick = onClick), RoundedCornerShape(24.dp),
        color = Color.White.copy(.88f), shadowElevation = 5.dp, border = androidx.compose.foundation.BorderStroke(1.dp, Color.White),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(Modifier.size(61.dp), RoundedCornerShape(18.dp), color = Color(game.accent).copy(.09f)) {
                AssetImage(assets, game.iconAsset, Modifier.fillMaxSize().padding(4.dp))
            }
            Column(Modifier.weight(1f).padding(horizontal = 13.dp)) {
                Text(game.title, color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(game.description, color = InkSoft, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Text("→", color = Color(game.accent), fontSize = 25.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun AccessVerificationScreen(
    error: String?,
    onRetry: () -> Unit,
    onLogout: () -> Unit,
    onSupport: () -> Unit,
) {
    AppBackground {
        Box(Modifier.fillMaxSize().padding(22.dp), contentAlignment = Alignment.Center) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text("Проверка доступа", color = Color(0xFF25236E), fontSize = 25.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(8.dp))
                Text(
                    if (error.isNullOrBlank())
                        "Проверяем статус аккаунта. Игры откроются сразу после подтверждения доступа."
                    else
                        "Не удалось проверить статус аккаунта. До успешной проверки запуск игр временно недоступен.",
                    color = InkSoft,
                    lineHeight = 21.sp,
                )
                if (!error.isNullOrBlank()) {
                    Spacer(Modifier.height(10.dp))
                    Text(error, color = Color(0xFF991B1B), fontSize = 13.sp)
                }
                Spacer(Modifier.height(18.dp))
                PrimaryButton("Повторить проверку", onRetry, Modifier.fillMaxWidth(), icon = "↻")
                Spacer(Modifier.height(10.dp))
                com.vidalost.biblegames.ui.SecondaryButton(
                    "Техподдержка",
                    onSupport,
                    Modifier.fillMaxWidth(),
                    icon = "🎧",
                )
                Spacer(Modifier.height(10.dp))
                com.vidalost.biblegames.ui.SecondaryButton(
                    "Сменить Telegram ID",
                    onLogout,
                    Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun AccessRestrictedScreen(onLogout: () -> Unit, onSupport: () -> Unit) {
    AppBackground {
        Box(Modifier.fillMaxSize().padding(22.dp), contentAlignment = Alignment.Center) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text("Доступ ограничен", color = Color(0xFF991B1B), fontSize = 25.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(8.dp))
                Text("Статус проверяется автоматически каждые несколько секунд. После разблокировки доступ восстановится без смены ID. Обжаловать блокировку можно через техническую поддержку.", color = InkSoft)
                Spacer(Modifier.height(18.dp))
                com.vidalost.biblegames.ui.SecondaryButton(
                    "Написать в техподдержку",
                    onSupport,
                    Modifier.fillMaxWidth(),
                    icon = "🎧",
                )
                Spacer(Modifier.height(10.dp))
                PrimaryButton("Сменить Telegram ID", onLogout, Modifier.fillMaxWidth())
            }
        }
    }
}
