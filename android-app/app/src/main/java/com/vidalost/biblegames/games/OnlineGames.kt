package com.vidalost.biblegames.games

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.ActivityInfo
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.data.CloudRepository
import com.vidalost.biblegames.data.RealtimeRoomClient
import com.vidalost.biblegames.model.QuartetSet
import com.vidalost.biblegames.ui.Cyan
import com.vidalost.biblegames.ui.Danger
import com.vidalost.biblegames.ui.ErrorCard
import com.vidalost.biblegames.ui.GameScaffold
import com.vidalost.biblegames.ui.GlassCard
import com.vidalost.biblegames.ui.Gold
import com.vidalost.biblegames.ui.Indigo
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.LoadingCard
import com.vidalost.biblegames.ui.PrimaryButton
import com.vidalost.biblegames.ui.SecondaryButton
import com.vidalost.biblegames.ui.StatusPill
import com.vidalost.biblegames.ui.Success
import com.vidalost.biblegames.ui.bounceClick
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.Date
import java.text.SimpleDateFormat
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.roundToInt

@Composable
fun QuartetGame(assets: AssetRepository, cloud: CloudRepository, userId: String, onRoomChanged: (String) -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    val catalog = remember { assets.quartetSets() }
    val session = remember(userId) { RealtimeRoomClient(context, cloud, CloudRepository.QUARTET, "quartet", userId) }
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf(session.savedName) }
    var code by rememberSaveable { mutableStateOf("") }
    var lastLobbyAction by rememberSaveable { mutableStateOf("create") }
    var selectedTarget by rememberSaveable { mutableStateOf("") }
    var selectedCard by rememberSaveable { mutableStateOf("") }
    val state = session.state
    val status = state?.optString("status").orEmpty()

    LaunchedEffect(Unit) { if (session.hasSavedRoom) session.resumeSaved(name) }
    LaunchedEffect(session.roomId) { onRoomChanged(session.roomId) }
    DisposableEffect(session) { onDispose { onRoomChanged(""); session.close() } }
    BackHandler { if (session.roomId.isNotBlank()) session.leave() else onBack() }

    GameScaffold(
        "Квартет",
        if (session.roomId.isBlank()) "Онлайн‑игра · 2–8 игроков" else "Комната ${session.roomId}",
        onBack = { if (session.roomId.isNotBlank()) session.leave() else onBack() },
    ) {
        ConnectionStrip(session.connected, session.connecting, session.roomId)
        session.error?.let {
            Spacer(Modifier.height(8.dp)); ErrorCard(it) {
                if (session.roomId.isNotBlank()) session.retry()
                else {
                    session.dismissError()
                    scope.launch {
                        if (lastLobbyAction == "join") session.join(code, name)
                        else session.create(name)
                    }
                }
            }
        }
        Spacer(Modifier.height(9.dp))
        AnimatedContent(status.ifBlank { "home" }, transitionSpec = {
            (slideInHorizontally(tween(360)) { it / 2 } + fadeIn()) togetherWith
                (slideOutHorizontally(tween(280)) { -it / 3 } + fadeOut())
        }, label = "quartetState") { target ->
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                val renderState = state
                when {
                    target == "home" || renderState == null -> QuartetHome(
                        name, { name = it.take(32); session.rememberName(it) }, code, { code = it.uppercase().filter(Char::isLetterOrDigit).take(10) },
                        loading = session.connecting,
                        create = { lastLobbyAction = "create"; scope.launch { session.create(name) } },
                        join = { lastLobbyAction = "join"; scope.launch { session.join(code, name) } },
                    )
                    target == "lobby" -> QuartetLobby(context, renderState, session.roomId, { session.action("startGame") }, { session.leave() })
                    target == "playing" -> QuartetPlaying(
                        renderState, catalog, selectedTarget, { selectedTarget = it; selectedCard = "" },
                        selectedCard, { selectedCard = it },
                        ask = {
                            session.action("askCard", JSONObject().put("targetId", selectedTarget).put("cardId", selectedCard))
                            selectedCard = ""
                        },
                        leave = { session.leave() },
                    )
                    target == "finished" -> QuartetResults(renderState, { session.action("restartGame") }, { session.leave() })
                    else -> LoadingCard("Получаем состояние комнаты…")
                }
            }
        }
    }
}

@Composable
private fun ConnectionStrip(connected: Boolean, connecting: Boolean, room: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        StatusPill(
            when { connected -> "Онлайн"; connecting -> "Подключение…"; else -> "Не подключено" },
            when { connected -> Success; connecting -> Gold; else -> InkSoft },
            if (connected) "●" else "○",
        )
        if (room.isNotBlank()) StatusPill("Код $room", Indigo, "#")
    }
}

@Composable
private fun QuartetHome(
    name: String, setName: (String) -> Unit,
    code: String, setCode: (String) -> Unit,
    loading: Boolean, create: () -> Unit, join: () -> Unit,
) {
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(27.dp)).background(Brush.linearGradient(listOf(Color(0xFF0F172A), Color(0xFF164E63), Color(0xFF0F766E)))).padding(20.dp)) {
        Column {
            StatusPill("REALTIME · 2–8 ИГРОКОВ", Cyan)
            Spacer(Modifier.height(11.dp))
            Text("Соберите четыре карты одной темы", color = Color.White, fontSize = 27.sp, lineHeight = 31.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(8.dp))
            Text("Просите недостающие карты у соперников. Угадали — ходите ещё раз. Ошиблись — ход переходит дальше.", color = Color.White.copy(.74f), lineHeight = 20.sp)
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                listOf("1" to "Выберите соперника", "2" to "Назовите карту", "3" to "Соберите квартет").forEach { (n, text) ->
                    Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(.08f)).padding(9.dp)) {
                        Text(n, color = Color(0xFF5EEAD4), fontWeight = FontWeight.Black)
                        Text(text, color = Color.White.copy(.86f), fontSize = 10.sp, lineHeight = 13.sp)
                    }
                }
            }
        }
    }
    Spacer(Modifier.height(12.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        Text("Создать комнату", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(10.dp))
        OnlineTextField(name, setName, "Ваше имя")
        Spacer(Modifier.height(11.dp))
        PrimaryButton("Создать лобби", create, Modifier.fillMaxWidth(), enabled = !loading && name.isNotBlank(), icon = "＋", colors = listOf(Color(0xFF0F766E), Color(0xFF14B8A6)))
    }
    Spacer(Modifier.height(11.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        Text("Войти по коду", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(10.dp))
        OnlineTextField(code, setCode, "Код комнаты", centered = true)
        Spacer(Modifier.height(11.dp))
        SecondaryButton("Войти в комнату", join, Modifier.fillMaxWidth(), enabled = !loading && code.length >= 4, accent = Color(0xFF0F766E), icon = "→")
    }
}

@Composable
private fun QuartetLobby(context: Context, state: JSONObject, roomId: String, start: () -> Unit, leave: () -> Unit) {
    val players = state.optJSONArray("players").objects()
    val me = state.optJSONObject("me")
    val host = me?.optBoolean("isHost") == true
    Text("Лобби готово", color = Ink, fontSize = 26.sp, fontWeight = FontWeight.Black)
    Text("Отправьте друзьям код комнаты", color = InkSoft)
    Spacer(Modifier.height(12.dp))
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.horizontalGradient(listOf(Color(0xFFCCFBF1), Color(0xFFDBEAFE)))).padding(18.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(roomId, color = Color(0xFF115E59), fontSize = 38.sp, letterSpacing = 5.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(9.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SecondaryButton("Копировать", { copyRoomCode(context, roomId) }, Modifier.weight(1f), accent = Color(0xFF0F766E), icon = "⧉")
                SecondaryButton("Поделиться", { shareRoomCode(context, roomId, "Квартет") }, Modifier.weight(1f), accent = Color(0xFF0F766E), icon = "↗")
            }
        }
    }
    Spacer(Modifier.height(12.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Игроки", color = Ink, fontWeight = FontWeight.ExtraBold)
            StatusPill("${players.size} / 8", Color(0xFF0F766E))
        }
        Spacer(Modifier.height(8.dp))
        players.forEach { player -> PlayerLobbyRow(player) }
    }
    Spacer(Modifier.height(13.dp))
    if (host) PrimaryButton("Начать игру", start, Modifier.fillMaxWidth(), enabled = players.size >= 2, icon = "▶", colors = listOf(Color(0xFF0F766E), Color(0xFF14B8A6)))
    else GlassCard(Modifier.fillMaxWidth(), padding = 13.dp) { Text("Ждём, когда создатель комнаты начнёт игру…", Modifier.fillMaxWidth(), color = InkSoft, textAlign = TextAlign.Center) }
    Spacer(Modifier.height(9.dp))
    SecondaryButton("Выйти из комнаты", leave, Modifier.fillMaxWidth(), accent = Danger)
}

@Composable
private fun PlayerLobbyRow(player: JSONObject) {
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).background(Color(0xFFE0F2FE), CircleShape), contentAlignment = Alignment.Center) { Text(player.optString("name").take(1).uppercase(), color = Indigo, fontWeight = FontWeight.Black) }
        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
            Text(player.optString("name"), color = Ink, fontWeight = FontWeight.Bold)
            Text(if (player.optBoolean("connected")) "в сети" else "подключается", color = if (player.optBoolean("connected")) Success else InkSoft, fontSize = 11.sp)
        }
        if (player.optBoolean("isHost")) StatusPill("Ведущий", Color(0xFF0F766E), "★")
    }
}

@Composable
private fun QuartetPlaying(
    state: JSONObject,
    catalog: List<QuartetSet>,
    selectedTarget: String,
    setTarget: (String) -> Unit,
    selectedCard: String,
    setCard: (String) -> Unit,
    ask: () -> Unit,
    leave: () -> Unit,
) {
    val me = state.optJSONObject("me") ?: JSONObject()
    val myId = me.optString("playerId")
    val myTurn = state.optString("turnPlayerId") == myId
    val hand = me.optJSONArray("hand").strings().toSet()
    val completed = me.optJSONArray("completedQuartets").strings().toSet()
    val activePlayers = state.optJSONArray("players").objects().filter { it.optBoolean("isActive", true) }
    val targets = activePlayers.filter { it.optString("playerId") != myId && it.optInt("cardsCount") > 0 }
    val haptic = LocalHapticFeedback.current
    var seconds by remember(state.optLong("turnDeadlineMs")) { mutableIntStateOf(0) }
    LaunchedEffect(state.optLong("turnDeadlineMs")) {
        while (true) {
            seconds = ceil((state.optLong("turnDeadlineMs") - System.currentTimeMillis()).coerceAtLeast(0) / 1000.0).toInt()
            delay(250)
        }
    }
    LaunchedEffect(state.optString("turnPlayerId")) {
        setTarget("")
        setCard("")
        if (myTurn) haptic.performHapticFeedback(HapticFeedbackType.LongPress)
    }
    val event = state.optJSONObject("lastEvent")
    LaunchedEffect(event?.optString("id")) {
        when (event?.optString("type")) {
            "ask_success", "game_finished" -> haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            "ask_miss", "turn_timeout" -> haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }
    val timerProgress by animateFloatAsState((seconds / 90f).coerceIn(0f, 1f), tween(250), label = "quartetTimer")

    GlassCard(Modifier.fillMaxWidth(), padding = 13.dp, color = if (myTurn) Color(0xFFECFDF5) else Color.White.copy(.9f)) {
        StatusPill(if (myTurn) "ВАШ ХОД" else "ОЖИДАНИЕ", if (myTurn) Color(0xFF0F766E) else InkSoft, if (myTurn) "✦" else "⌛")
        Spacer(Modifier.height(9.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(45.dp).background(if (myTurn) Color(0xFF14B8A6) else Color(0xFFE2E8F0), CircleShape), contentAlignment = Alignment.Center) { Text(if (myTurn) "✓" else "⌛", color = if (myTurn) Color.White else InkSoft, fontWeight = FontWeight.Black) }
            Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                Text(if (myTurn) "Ваш ход начался" else "Ход игрока ${state.optString("turnPlayerName")}", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Black)
                Text(if (myTurn) "Выберите соперника и карту, затем подтвердите запрос." else "Игровые действия временно заблокированы. Следите за партией.", color = InkSoft, fontSize = 11.sp, lineHeight = 14.sp)
            }
            StatusPill("${seconds}с", if (seconds <= 15) Danger else Color(0xFF0F766E), "◷")
        }
        Spacer(Modifier.height(9.dp))
        Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(Color(0xFFDDE6E7))) {
            Box(Modifier.fillMaxWidth(timerProgress).height(6.dp).background(if (seconds <= 15) Danger else Color(0xFF14B8A6), CircleShape))
        }
    }
    Spacer(Modifier.height(10.dp))
    GlassCard(Modifier.fillMaxWidth(), padding = 12.dp) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("Игроки", color = Ink, fontWeight = FontWeight.ExtraBold)
                Text(if (myTurn) "Шаг 1 · выберите, у кого спросить" else "Сейчас действует ${state.optString("turnPlayerName")}", color = InkSoft, fontSize = 11.sp)
            }
            StatusPill("${activePlayers.size} в партии", Color(0xFF0F766E))
        }
        Spacer(Modifier.height(7.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            activePlayers.forEach { player ->
                val id = player.optString("playerId")
                val selected = selectedTarget == id
                val selectable = myTurn && id != myId && player.optInt("cardsCount") > 0
                val isTurn = id == state.optString("turnPlayerId")
                Surface(
                    Modifier.width(135.dp).bounceClick(enabled = selectable) { setTarget(id) },
                    RoundedCornerShape(18.dp),
                    color = when { selected -> Color(0xFFCCFBF1); id == myId -> Color(0xFFF0F9FF); else -> Color(0xFFF8FAFC) },
                    border = androidx.compose.foundation.BorderStroke(if (selected || isTurn) 2.dp else 1.dp, when { selected -> Color(0xFF0F766E); isTurn -> Gold; else -> Color(0xFFE2E8F0) }),
                ) {
                    Column(Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(player.optString("name") + if (id == myId) " · вы" else "", color = Ink, fontWeight = FontWeight.ExtraBold, maxLines = 1)
                            Spacer(Modifier.width(5.dp))
                            Text(if (player.optBoolean("connected")) "●" else "○", color = if (player.optBoolean("connected")) Success else InkSoft, fontSize = 10.sp)
                        }
                        Text("🃏 ${player.optInt("cardsCount")}   🏆 ${player.optInt("quartetsCount")}", color = InkSoft, fontSize = 10.sp)
                        if (isTurn) Text("Сейчас ходит", color = Color(0xFFB7791F), fontSize = 9.sp, fontWeight = FontWeight.Black)
                        if (selected) Text("Выбран", color = Color(0xFF0F766E), fontSize = 9.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }
    }

    event?.let { lastEvent ->
        quartetEventText(lastEvent, myId)?.let { (icon, message, positive) ->
            Spacer(Modifier.height(9.dp))
            GlassCard(Modifier.fillMaxWidth(), padding = 12.dp, color = if (positive) Color(0xFFECFDF5) else Color(0xFFFFF7ED)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(icon, fontSize = 23.sp)
                    Text(message, Modifier.weight(1f).padding(start = 10.dp), color = if (positive) Color(0xFF047857) else Color(0xFF9A3412), fontWeight = FontWeight.Bold, fontSize = 12.sp, lineHeight = 16.sp)
                }
            }
        }
    }

    Spacer(Modifier.height(6.dp))
    Column(Modifier.fillMaxWidth()) {
        Text("Ваша рука", color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Black)
        Text(if (myTurn) "Шаг 2 · выберите недостающую карту" else "Можно продумать следующий запрос", color = InkSoft, fontSize = 11.sp)
        Spacer(Modifier.height(5.dp))
        StatusPill("${hand.size} карт · ${completed.size} квартетов", Color(0xFF0F766E))
    }
    if (completed.isNotEmpty()) {
        Spacer(Modifier.height(7.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            catalog.filter { it.id in completed }.forEach { set -> StatusPill("${set.icon} ${set.name}", Color(0xFFB7791F), "🏆") }
        }
    }
    Spacer(Modifier.height(7.dp))
    val handGroups = catalog.filter { set -> set.cards.any { it.id in hand } }
        .sortedWith(compareByDescending<QuartetSet> { set -> set.cards.count { it.id in hand } }.thenBy { it.name.lowercase(Locale("ru")) })
    if (handGroups.isEmpty()) GlassCard(Modifier.fillMaxWidth()) { Text("В руке больше нет карт.", Modifier.fillMaxWidth(), color = InkSoft, textAlign = TextAlign.Center) }
    handGroups.forEachIndexed { groupIndex, set ->
        val ownedCount = set.cards.count { it.id in hand }
        val near = ownedCount == 3
        GlassCard(Modifier.fillMaxWidth().padding(bottom = 9.dp), padding = 12.dp, color = if (near) Color(0xFFFFF9DD) else Color.White.copy(.9f)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(42.dp).background(listOf(Color(0xFFE0F2FE), Color(0xFFF3E8FF), Color(0xFFFFF1F2), Color(0xFFECFDF5))[groupIndex % 4], RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) { Text(set.icon, fontSize = 23.sp) }
                Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                    Text(set.name, color = Ink, fontWeight = FontWeight.ExtraBold)
                    Text(when (ownedCount) { 3 -> "Осталась 1 карта"; 2 -> "Половина собрана"; else -> "Квартет открыт" }, color = InkSoft, fontSize = 10.sp)
                }
                Text("$ownedCount", color = if (near) Color(0xFFB7791F) else Color(0xFF0F766E), fontSize = 25.sp, fontWeight = FontWeight.Black)
                Text("/4", color = InkSoft, fontSize = 11.sp)
            }
            Spacer(Modifier.height(7.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                repeat(4) { index -> Box(Modifier.weight(1f).height(5.dp).background(if (index < ownedCount) Color(0xFF14B8A6) else Color(0xFFE2E8F0), CircleShape)) }
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                set.cards.forEachIndexed { cardIndex, card ->
                    val owned = card.id in hand
                    val selected = selectedCard == card.id
                    Box(
                        Modifier.weight(1f).height(106.dp).clip(RoundedCornerShape(14.dp))
                            .background(when { owned -> Color(0xFFE0F2FE); selected -> Color(0xFFCCFBF1); else -> Color(0xFFF1F5F9) })
                            .border(if (selected) 2.dp else 1.dp, when { selected -> Color(0xFF0F766E); owned -> Color(0xFF7DD3FC); else -> Color(0xFFCBD5E1) }, RoundedCornerShape(12.dp))
                            .bounceClick(enabled = myTurn && !owned && selectedTarget.isNotBlank()) { setCard(card.id) }
                            .padding(4.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(set.icon, fontSize = 11.sp); Text("${cardIndex + 1}", color = InkSoft, fontSize = 9.sp, fontWeight = FontWeight.Black) }
                            Text(if (owned) set.icon else if (selected) "✓" else "?", fontSize = 25.sp, color = if (selected) Color(0xFF0F766E) else InkSoft)
                            Text(card.title, color = Ink, fontSize = 8.sp, lineHeight = 10.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2)
                            Text(when { owned -> "✓ В руке"; selected -> "Выбрана"; myTurn && selectedTarget.isNotBlank() -> "Выбрать"; else -> "Не хватает" }, color = when { owned -> Color(0xFF0369A1); selected -> Color(0xFF0F766E); else -> InkSoft }, fontSize = 7.sp, fontWeight = FontWeight.Black)
                        }
                    }
                }
            }
        }
    }
    val targetName = targets.firstOrNull { it.optString("playerId") == selectedTarget }?.optString("name")
    val cardTitle = catalog.asSequence().flatMap { it.cards.asSequence() }.firstOrNull { it.id == selectedCard }?.title
    GlassCard(Modifier.fillMaxWidth(), padding = 12.dp, color = if (myTurn) Color(0xFFF0FDFA) else Color(0xFFF8FAFC)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            StatusPill("1", Color(0xFF0F766E))
            Text(targetName ?: if (myTurn) "Выберите игрока" else "Недоступно", Modifier.weight(1f).padding(horizontal = 6.dp), color = Ink, fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Text("→", color = InkSoft)
            StatusPill("2", Color(0xFF0F766E))
            Text(cardTitle ?: if (myTurn) "Выберите карту" else "Ждите хода", Modifier.weight(1f).padding(start = 6.dp), color = Ink, fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(9.dp))
        PrimaryButton(
            if (myTurn) if (targetName != null && cardTitle != null) "Спросить карту" else "Сделайте два выбора" else "Ходит ${state.optString("turnPlayerName")}",
            ask,
            Modifier.fillMaxWidth(),
            enabled = myTurn && targetName != null && cardTitle != null,
            icon = "🃏",
            colors = listOf(Color(0xFF0F766E), Color(0xFF14B8A6)),
        )
    }
    Spacer(Modifier.height(10.dp))
    GameLog(state.optJSONArray("log").strings())
    Spacer(Modifier.height(10.dp))
    SecondaryButton("Выйти из партии", leave, Modifier.fillMaxWidth(), accent = Danger)
}

@Composable
private fun QuartetResults(state: JSONObject, restart: () -> Unit, leave: () -> Unit) {
    val scores = state.optJSONArray("score").objects()
    val me = state.optJSONObject("me")
    val isHost = me?.optBoolean("isHost") == true
    val winnerIds = state.optJSONArray("winnerIds").strings().toSet()
    val iWon = me?.optString("playerId") in winnerIds
    val winners = scores.filter { it.optString("playerId") in winnerIds }.joinToString(", ") { it.optString("name") }
    Text(if (iWon) "🏆" else "🎉", fontSize = 60.sp)
    Text(if (iWon) "Победа!" else "Игра завершена", color = Ink, fontSize = 27.sp, fontWeight = FontWeight.Black)
    Text(winners.ifBlank { "Партия завершена" }, Modifier.fillMaxWidth(), color = InkSoft, textAlign = TextAlign.Center)
    Spacer(Modifier.height(12.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Результаты", color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Black)
        StatusPill("${state.optInt("totalQuartets")} квартетов", Color(0xFF0F766E))
    }
    Spacer(Modifier.height(8.dp))
    scores.forEachIndexed { index, player ->
        GlassCard(Modifier.fillMaxWidth().padding(bottom = 8.dp), padding = 13.dp, color = if (index == 0) Color(0xFFFFF9DD) else Color.White.copy(.9f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${index + 1}", Modifier.size(35.dp).background(if (index == 0) Gold.copy(.18f) else Color(0xFFE2E8F0), CircleShape).padding(top = 7.dp), color = if (index == 0) Color(0xFFB7791F) else InkSoft, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                Text(player.optString("name") + if (player.optString("playerId") == me?.optString("playerId")) " · вы" else "", Modifier.weight(1f).padding(horizontal = 10.dp), color = Ink, fontWeight = FontWeight.ExtraBold)
                Text("🏆 ${player.optInt("quartetsCount")}", color = Color(0xFF0F766E), fontWeight = FontWeight.Black)
            }
        }
    }
    if (isHost) PrimaryButton("Сыграть ещё", restart, Modifier.fillMaxWidth(), icon = "↻", colors = listOf(Color(0xFF0F766E), Color(0xFF14B8A6)))
    else GlassCard(Modifier.fillMaxWidth(), padding = 12.dp) { Text("Ведущий может запустить новую партию в этой же комнате.", Modifier.fillMaxWidth(), color = InkSoft, textAlign = TextAlign.Center) }
    Spacer(Modifier.height(9.dp))
    SecondaryButton("Выйти", leave, Modifier.fillMaxWidth(), accent = Danger)
}

private data class QuartetEventUi(val icon: String, val message: String, val positive: Boolean)
private data class SketchCategoryUi(val id: String, val icon: String, val title: String, val size: Int, val hint: String)

private fun quartetEventText(event: JSONObject, meId: String): QuartetEventUi? = when (event.optString("type")) {
    "ask_success" -> {
        val actor = if (event.optString("actorId") == meId) "Вы" else event.optString("actorName", "Игрок")
        val verb = if (event.optString("actorId") == meId) "получили" else "получил"
        val target = if (event.optString("targetId") == meId) "у вас" else "у ${event.optString("targetName", "игрока")}"
        val completed = event.optJSONArray("completedQuartets").strings()
        QuartetEventUi("✓", "$actor $verb карту «${event.optString("cardTitle")}» $target.${if (completed.isNotEmpty()) " Собран квартет «${completed.joinToString()}» 🏆" else ""}", true)
    }
    "ask_miss" -> QuartetEventUi("↻", "${if (event.optString("actorId") == meId) "Ваш запрос" else "Запрос игрока ${event.optString("actorName")}"}: карты «${event.optString("cardTitle")}» нет. Ход завершён.", false)
    "turn_timeout" -> QuartetEventUi("⌛", "${event.optString("actorName", "Игрок")} не успел сделать ход. Очередь переключена.", false)
    "game_started" -> QuartetEventUi("▶", "Партия началась. Первый ход уже активен.", true)
    else -> null
}

@Composable
fun BibleSketchGame(cloud: CloudRepository, userId: String, onRoomChanged: (String) -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }
    val session = remember(userId) { RealtimeRoomClient(context, cloud, CloudRepository.SKETCH, "bible_sketch", userId) }
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf(session.savedName) }
    var code by rememberSaveable { mutableStateOf("") }
    var lastLobbyAction by rememberSaveable { mutableStateOf("create") }
    var category by rememberSaveable { mutableStateOf("objects") }
    var brushColor by rememberSaveable { mutableStateOf("#111827") }
    var brushWidth by rememberSaveable { mutableIntStateOf(5) }
    var erase by rememberSaveable { mutableStateOf(false) }
    var guess by rememberSaveable { mutableStateOf("") }
    var chat by rememberSaveable { mutableStateOf("") }
    val state = session.state
    val status = state?.optString("status").orEmpty()

    LaunchedEffect(Unit) { if (session.hasSavedRoom) session.resumeSaved(name) }
    LaunchedEffect(session.roomId) { onRoomChanged(session.roomId) }
    LaunchedEffect(status) {
        activity?.requestedOrientation = if (status in setOf("drawing", "answerReview", "voting", "finalGuess")) {
            ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }
    DisposableEffect(session) {
        onDispose {
            onRoomChanged("")
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            session.close()
        }
    }
    BackHandler { if (session.roomId.isNotBlank()) session.leave() else onBack() }

    GameScaffold(
        "Библейский художник",
        if (session.roomId.isBlank()) "Онлайн‑рисование со шпионом" else "Комната ${session.roomId}",
        onBack = { if (session.roomId.isNotBlank()) session.leave() else onBack() },
        scroll = status !in setOf("drawing", "answerReview", "voting", "finalGuess"),
    ) {
        ConnectionStrip(session.connected, session.connecting, session.roomId)
        session.error?.let {
            Spacer(Modifier.height(8.dp))
            ErrorCard(it) {
                if (session.roomId.isNotBlank()) session.retry()
                else {
                    session.dismissError()
                    scope.launch {
                        if (lastLobbyAction == "join") session.join(code, name)
                        else session.create(name, JSONObject().put("categoryId", category))
                    }
                }
            }
        }
        Spacer(Modifier.height(9.dp))
        when {
            state == null && session.connecting -> LoadingCard("Создаём защищённое лобби…")
            state == null -> SketchHome(
                name, { name = it.take(32); session.rememberName(it) }, code, { code = it.uppercase().filter(Char::isLetterOrDigit).take(10) }, category, { category = it },
                create = { lastLobbyAction = "create"; scope.launch { session.create(name, JSONObject().put("categoryId", category)) } },
                join = { lastLobbyAction = "join"; scope.launch { session.join(code, name) } },
            )
            status == "lobby" -> {
                SketchLobby(context, state, session.roomId, { session.action("startRound") }, { session.leave() })
                Spacer(Modifier.height(10.dp))
                SketchChat(state.optJSONArray("chat").objects(), state.optJSONObject("me")?.optString("playerId").orEmpty(), chat, { chat = it }) {
                    session.action("chat", JSONObject().put("text", chat)); chat = ""
                }
            }
            else -> SketchRound(
                state = state,
                brushColor = brushColor,
                setBrushColor = { brushColor = it; erase = false },
                brushWidth = brushWidth,
                setBrushWidth = { brushWidth = it },
                erase = erase,
                setErase = { erase = it },
                guess = guess,
                setGuess = { guess = it },
                chat = chat,
                setChat = { chat = it },
                action = session::action,
                roomId = session.roomId,
                leave = { session.leave() },
                modifier = if (status in setOf("drawing", "answerReview", "voting", "finalGuess")) Modifier.fillMaxWidth().weight(1f) else Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun SketchHome(
    name: String, setName: (String) -> Unit, code: String, setCode: (String) -> Unit,
    category: String, setCategory: (String) -> Unit, create: () -> Unit, join: () -> Unit,
) {
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(27.dp)).background(Brush.linearGradient(listOf(Color(0xFF4C1D95), Color(0xFF7C3AED), Color(0xFFDB2777)))).padding(20.dp)) {
        Column {
            StatusPill("REALTIME · 3–8 ИГРОКОВ", Color(0xFFF0ABFC))
            Spacer(Modifier.height(10.dp))
            Text("Рисуйте. Наблюдайте. Найдите шпиона.", color = Color.White, fontSize = 27.sp, lineHeight = 31.sp, fontWeight = FontWeight.Black)
            Text("Все, кроме шпиона, знают библейское слово. Продолжайте общий рисунок по очереди.", color = Color.White.copy(.76f), lineHeight = 20.sp)
            Spacer(Modifier.height(13.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("1" to "Категория", "2" to "40 секунд", "3" to "Найдите шпиона").forEach { (n, label) ->
                    Column(Modifier.weight(1f).background(Color.White.copy(.1f), RoundedCornerShape(13.dp)).padding(8.dp)) { Text(n, color = Color(0xFFF0ABFC), fontWeight = FontWeight.Black); Text(label, color = Color.White, fontSize = 10.sp) }
                }
            }
        }
    }
    Spacer(Modifier.height(11.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        Text("Создать комнату", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(9.dp)); OnlineTextField(name, setName, "Ваше имя")
        Spacer(Modifier.height(10.dp))
        Text("Категория", color = Ink, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(7.dp))
        val categories = listOf(
            SketchCategoryUi("objects", "🪔", "Предметы", 32, "Ковчег, жезл, скрижали и другие предметы"),
            SketchCategoryUi("places", "🗺️", "Места", 32, "Города, земли, горы и места событий"),
            SketchCategoryUi("people", "👤", "Люди", 38, "Персонажи Ветхого и Нового Завета"),
            SketchCategoryUi("events", "✨", "События", 30, "События и короткие фразы из библейского текста"),
        )
        categories.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth().padding(bottom = 7.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                row.forEach { item ->
                    val selected = item.id == category
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(17.dp)).background(if (selected) Color(0xFFEEF2FF) else Color(0xFFF8FAFC)).border(if (selected) 2.dp else 1.dp, if (selected) Color(0xFF6366F1) else Color(0xFFE2E8F0), RoundedCornerShape(17.dp)).bounceClick { setCategory(item.id) }.padding(10.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(item.icon, fontSize = 22.sp)
                            Column(Modifier.padding(start = 7.dp)) {
                                Text(item.title, color = Color(0xFF312E81), fontSize = 12.sp, fontWeight = FontWeight.Black)
                                Text("${item.size} слов", color = InkSoft, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        Text(item.hint, Modifier.padding(top = 6.dp), color = InkSoft, fontSize = 8.sp, lineHeight = 10.sp)
                    }
                }
            }
        }
        Spacer(Modifier.height(11.dp))
        PrimaryButton("Создать лобби", create, Modifier.fillMaxWidth(), enabled = name.isNotBlank(), icon = "＋", colors = listOf(Color(0xFF7C3AED), Color(0xFFDB2777)))
    }
    Spacer(Modifier.height(10.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        Text("Войти по коду", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(9.dp)); OnlineTextField(code, setCode, "Код комнаты", centered = true)
        Spacer(Modifier.height(10.dp)); SecondaryButton("Войти", join, Modifier.fillMaxWidth(), enabled = code.length >= 4, accent = Color(0xFF7C3AED), icon = "→")
    }
}

@Composable
private fun SketchLobby(context: Context, state: JSONObject, room: String, start: () -> Unit, leave: () -> Unit) {
    val players = state.optJSONArray("players").objects()
    val me = state.optJSONObject("me") ?: JSONObject()
    val category = state.optJSONObject("category") ?: JSONObject()
    Text("Лобби художников", color = Ink, fontSize = 26.sp, fontWeight = FontWeight.Black)
    Spacer(Modifier.height(9.dp))
    Box(Modifier.fillMaxWidth().background(Brush.horizontalGradient(listOf(Color(0xFFF3E8FF), Color(0xFFFCE7F3))), RoundedCornerShape(24.dp)).padding(17.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(room, color = Color(0xFF6B21A8), fontSize = 38.sp, letterSpacing = 5.sp, fontWeight = FontWeight.Black)
            Text("${category.optString("icon")} ${category.optString("title")} · ${category.optInt("size")} слов · использовано ${state.optInt("usedWordsCount")}", color = InkSoft, fontWeight = FontWeight.Bold, fontSize = 11.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(9.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SecondaryButton("Копировать", { copyRoomCode(context, room) }, Modifier.weight(1f), accent = Color(0xFF7C3AED), icon = "⧉")
                SecondaryButton("Поделиться", { shareRoomCode(context, room, "Библейский художник") }, Modifier.weight(1f), accent = Color(0xFF7C3AED), icon = "↗")
            }
        }
    }
    Spacer(Modifier.height(11.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Игроки", color = Ink, fontWeight = FontWeight.ExtraBold); StatusPill("${players.size} / 8", Color(0xFF7C3AED)) }
        players.forEach { player -> PlayerLobbyRow(player) }
    }
    Spacer(Modifier.height(12.dp))
    if (me.optBoolean("isHost")) PrimaryButton("Начать раунд", start, Modifier.fillMaxWidth(), enabled = players.size >= 3, icon = "🎨", colors = listOf(Color(0xFF7C3AED), Color(0xFFDB2777)))
    else GlassCard(Modifier.fillMaxWidth(), padding = 13.dp) { Text("Ждём ведущего…", Modifier.fillMaxWidth(), color = InkSoft, textAlign = TextAlign.Center) }
    Spacer(Modifier.height(8.dp)); SecondaryButton("Выйти", leave, Modifier.fillMaxWidth(), accent = Danger)
}

@Composable
private fun SketchRound(
    state: JSONObject,
    brushColor: String, setBrushColor: (String) -> Unit,
    brushWidth: Int, setBrushWidth: (Int) -> Unit,
    erase: Boolean, setErase: (Boolean) -> Unit,
    guess: String, setGuess: (String) -> Unit,
    chat: String, setChat: (String) -> Unit,
    action: (String, JSONObject) -> Boolean,
    roomId: String,
    leave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val status = state.optString("status")
    val me = state.optJSONObject("me") ?: JSONObject()
    val players = state.optJSONArray("players").objects()
    val role = me.optString("role")
    val canDraw = me.optBoolean("canDraw")
    val secret = me.optJSONObject("secret")
    var seconds by remember(state.optLong("turnDeadlineMs")) { mutableIntStateOf(0) }
    LaunchedEffect(state.optLong("turnDeadlineMs"), status) {
        while (true) {
            seconds = ceil((state.optLong("turnDeadlineMs") - System.currentTimeMillis()).coerceAtLeast(0) / 1000.0).toInt()
            delay(250)
        }
    }
    val phaseSeconds = when (status) { "drawing" -> 40f; "answerReview" -> 30f; "voting" -> 50f; "finalGuess" -> 30f; else -> 1f }
    val phaseProgress by animateFloatAsState((seconds / phaseSeconds).coerceIn(0f, 1f), tween(250), label = "sketchPhase")
    val statusPanel: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit = {
        if (status != "finished") {
            GlassCard(Modifier.fillMaxWidth(), padding = 10.dp) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text(sketchPhaseTitle(status, role), color = Ink, fontWeight = FontWeight.Black)
                        Text(if (status == "drawing") "Ход ${minOf(state.optInt("turnIndex") + 1, state.optInt("turnCount"))} из ${state.optInt("turnCount")}" else sketchPhaseDescription(status), color = InkSoft, fontSize = 10.sp)
                    }
                    Text("${seconds}с", color = if (seconds <= 8) Danger else Indigo, fontSize = 20.sp, fontWeight = FontWeight.Black)
                }
                Spacer(Modifier.height(7.dp))
                Box(Modifier.fillMaxWidth().height(6.dp).background(Color(0xFFE2E8F0), CircleShape)) {
                    Box(Modifier.fillMaxWidth(phaseProgress).height(6.dp).background(Brush.horizontalGradient(listOf(Color(0xFF6366F1), Color(0xFF0EA5E9))), CircleShape))
                }
            }
        }
        Spacer(Modifier.height(7.dp))
        if (role == "artist" && secret != null) {
            GlassCard(Modifier.fillMaxWidth(), padding = 11.dp, color = Color(0xFFF3E8FF)) {
                Text("Секретное слово: ${secret.optString("label")}", Modifier.fillMaxWidth(), color = Color(0xFF6B21A8), fontSize = 17.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                Text(secret.optString("ref"), Modifier.fillMaxWidth(), color = InkSoft, fontSize = 10.sp, textAlign = TextAlign.Center)
            }
        } else if (role == "spy" && status != "finished") {
            GlassCard(Modifier.fillMaxWidth(), padding = 11.dp, color = Color(0xFFFFF7ED)) {
                Text("Вы — шпион 🕵️", Modifier.fillMaxWidth(), color = Color(0xFFB45309), textAlign = TextAlign.Center, fontWeight = FontWeight.Black)
                Text("Вы знаете только категорию: ${state.optJSONObject("category")?.optString("title").orEmpty()}. Смотрите на рисунки и не выдавайте себя.", Modifier.fillMaxWidth(), color = InkSoft, fontSize = 10.sp, textAlign = TextAlign.Center)
            }
        }
        Spacer(Modifier.height(7.dp))
        GlassCard(Modifier.fillMaxWidth(), padding = 9.dp) {
            Text("Игроки", color = Ink, fontWeight = FontWeight.ExtraBold)
            players.filter { it.optBoolean("isActive", true) }.forEach { player -> SketchPlayerRow(player) }
        }
    }

    val canvasPanel: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit = {
        when (status) {
            "drawing" -> {
                Text(if (canDraw) "Ваш ход — рисуйте" else "Сейчас рисует ${state.optString("currentDrawerName")}", Modifier.fillMaxWidth(), color = if (canDraw) Success else Ink, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                Spacer(Modifier.height(5.dp))
                SketchCanvas(
                    strokes = state.optJSONArray("strokes").objects(), enabled = canDraw,
                    color = brushColor, width = brushWidth, erase = erase,
                    modifier = Modifier.fillMaxWidth().aspectRatio(5f / 3f),
                    onStroke = { points ->
                        val array = JSONArray().apply { points.forEach { put(JSONArray().put(it.x).put(it.y)) } }
                        val stroke = JSONObject().put("points", array).put("color", brushColor).put("width", brushWidth).put("mode", if (erase) "erase" else "draw")
                        action("drawStroke", JSONObject().put("stroke", stroke))
                    },
                )
                if (canDraw) {
                    Spacer(Modifier.height(6.dp))
                    SketchTools(brushColor, setBrushColor, brushWidth, setBrushWidth, erase, setErase)
                    Spacer(Modifier.height(6.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        SecondaryButton("Отменить", { action("undoStroke", JSONObject()) }, Modifier.weight(1f), icon = "↶")
                        PrimaryButton("Завершить ход", { action("finishTurn", JSONObject()) }, Modifier.weight(1f), icon = "✓", colors = listOf(Color(0xFF7C3AED), Color(0xFFDB2777)))
                    }
                }
                if (role == "spy" && !me.optBoolean("earlyGuessUsed")) {
                    Spacer(Modifier.height(7.dp)); GuessForm(guess, setGuess, "Рискнуть и назвать слово") { action("submitGuess", JSONObject().put("text", guess)); setGuess("") }
                }
            }
            "answerReview" -> {
                SketchCanvas(state.optJSONArray("strokes").objects(), false, brushColor, brushWidth, erase, Modifier.fillMaxWidth().aspectRatio(5f / 3f)) {}
                Spacer(Modifier.height(7.dp))
                val review = state.optJSONObject("guessReview") ?: JSONObject()
                GlassCard(Modifier.fillMaxWidth(), padding = 13.dp) {
                    Text(if (role == "spy") "Ответ отправлен" else "Засчитать ответ?", color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Black)
                    Text("«${review.optString("text")}»", Modifier.fillMaxWidth().padding(vertical = 9.dp), color = Color(0xFF7C3AED), fontSize = 23.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                    Text(if (role == "spy") "Приложение не нашло точного совпадения. Ждём решения остальных игроков: ${review.optInt("votesCount")}/${review.optInt("votersCount")}." else "Если это допустимая формулировка или синоним — подтвердите. Голосов: ${review.optInt("votesCount")}/${review.optInt("votersCount")}.", color = InkSoft, fontSize = 10.sp)
                }
                if (review.optBoolean("canVote") && review.isNull("myVote")) {
                    Spacer(Modifier.height(7.dp)); Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        SecondaryButton("Не засчитать", { action("reviewGuess", JSONObject().put("accept", false)) }, Modifier.weight(1f), accent = Danger)
                        PrimaryButton("Засчитать", { action("reviewGuess", JSONObject().put("accept", true)) }, Modifier.weight(1f), icon = "✓", colors = listOf(Success, Color(0xFF22C55E)))
                    }
                }
            }
            "voting" -> {
                SketchCanvas(state.optJSONArray("strokes").objects(), false, brushColor, brushWidth, erase, Modifier.fillMaxWidth().aspectRatio(5f / 3f)) {}
                Spacer(Modifier.height(7.dp)); Text("Кто был шпионом?", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Black)
                Text("Выберите одного игрока", color = InkSoft, fontSize = 11.sp)
                Spacer(Modifier.height(6.dp))
                players.filter { it.optBoolean("isActive", true) && it.optString("playerId") != me.optString("playerId") }.forEach { player ->
                    GlassCard(Modifier.fillMaxWidth().padding(bottom = 6.dp).bounceClick(enabled = !me.optBoolean("hasVotedSpy")) { action("voteSpy", JSONObject().put("targetId", player.optString("playerId"))) }, padding = 10.dp) {
                        Row(verticalAlignment = Alignment.CenterVertically) { Text("👤", fontSize = 22.sp); Text(player.optString("name"), Modifier.weight(1f).padding(horizontal = 8.dp), color = Ink, fontWeight = FontWeight.ExtraBold); Text("Выбрать →", color = Color(0xFF7C3AED), fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                    }
                }
                if (me.optBoolean("hasVotedSpy")) StatusPill("Ваш голос принят", Success, "✓")
            }
            "finalGuess" -> {
                SketchCanvas(state.optJSONArray("strokes").objects(), false, brushColor, brushWidth, erase, Modifier.fillMaxWidth().aspectRatio(5f / 3f)) {}
                Spacer(Modifier.height(7.dp))
                if (role == "spy") {
                    Text("Вас нашли — последний шанс", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Black)
                    Spacer(Modifier.height(7.dp)); GuessForm(guess, setGuess, "Назвать скрытое слово") { action("submitGuess", JSONObject().put("text", guess)); setGuess("") }
                } else GlassCard(Modifier.fillMaxWidth()) { Text("Шпион найден. Ждём его последний ответ…", Modifier.fillMaxWidth(), color = InkSoft, textAlign = TextAlign.Center) }
            }
            "finished" -> SketchFinished(state, roomId, { action("restartRound", JSONObject()) }, leave)
        }
    }

    val communicationPanel: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit = {
        SketchChat(state.optJSONArray("chat").objects(), me.optString("playerId"), chat, setChat) {
            action("chat", JSONObject().put("text", chat)); setChat("")
        }
        Spacer(Modifier.height(7.dp))
        GameLog(state.optJSONArray("log").strings())
        if (status != "finished") {
            Spacer(Modifier.height(7.dp))
            SecondaryButton("Выйти из комнаты", leave, Modifier.fillMaxWidth(), accent = Danger)
        }
    }

    BoxWithConstraints(modifier) {
        val landscapeGrid = maxWidth >= 700.dp && status != "finished"
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                StatusPill("Раунд ${state.optInt("roundNumber")} · ${state.optJSONObject("category")?.optString("title").orEmpty()}", Color(0xFF7C3AED))
                StatusPill(if (role == "spy") "Вы — шпион" else "Вы — художник", if (role == "spy") Danger else Success, if (role == "spy") "🕵️" else "🎨")
                if (status != "finished") StatusPill("${seconds}с", if (seconds <= 10) Danger else Indigo, "◷")
            }
            Spacer(Modifier.height(6.dp))
            if (landscapeGrid) {
                Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Column(Modifier.weight(.23f).fillMaxSize().verticalScroll(rememberScrollState())) { statusPanel() }
                    Column(Modifier.weight(.52f).fillMaxSize().verticalScroll(rememberScrollState())) { canvasPanel() }
                    Column(Modifier.weight(.25f).fillMaxSize().verticalScroll(rememberScrollState())) { communicationPanel() }
                }
            } else {
                Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
                    statusPanel()
                    Spacer(Modifier.height(8.dp))
                    canvasPanel()
                    Spacer(Modifier.height(9.dp))
                    communicationPanel()
                }
            }
        }
    }
}

@Composable
private fun SketchPlayerRow(player: JSONObject) {
    Row(
        Modifier.fillMaxWidth().padding(top = 6.dp).background(Color(0xFFF8FAFC), RoundedCornerShape(14.dp)).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(34.dp).background(Brush.linearGradient(listOf(Color(0xFF6366F1), Color(0xFF0EA5E9))), RoundedCornerShape(11.dp)), contentAlignment = Alignment.Center) {
            Text(player.optString("name").take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Black)
        }
        Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
            Text(player.optString("name"), color = Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text(listOfNotNull(if (player.optBoolean("isCurrentDrawer")) "сейчас рисует" else null, if (player.optBoolean("connected")) "онлайн" else "нет связи").joinToString(" · "), color = if (player.optBoolean("connected")) Success else InkSoft, fontSize = 9.sp)
        }
        if (player.optBoolean("isHost")) StatusPill("Ведущий", Color(0xFF7C3AED))
    }
}

@Composable
private fun SketchCanvas(
    strokes: List<JSONObject>, enabled: Boolean, color: String, width: Int, erase: Boolean,
    modifier: Modifier, onStroke: (List<Offset>) -> Unit,
) {
    var current by remember { mutableStateOf(emptyList<Offset>()) }
    val haptic = LocalHapticFeedback.current
    Canvas(
        modifier.clip(RoundedCornerShape(20.dp)).background(Color.White).border(if (enabled) 3.dp else 1.dp, if (enabled) Color(0xFF9333EA) else Color(0xFFD8DEEA), RoundedCornerShape(20.dp))
            .pointerInput(enabled, color, width, erase) {
                if (!enabled) return@pointerInput
                detectDragGestures(
                    onDragStart = { pos -> current = listOf(pos); haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) },
                    onDrag = { change, _ ->
                        val last = current.lastOrNull()
                        val point = change.position
                        if (last == null || hypot((point.x - last.x) / size.width, (point.y - last.y) / size.height) >= .0025f) {
                            current = current + point
                        }
                        change.consume()
                    },
                    onDragEnd = {
                        if (current.size >= 2) {
                            val step = ceil(current.size / 300.0).toInt().coerceAtLeast(1)
                            val compact = current.filterIndexed { index, _ -> index % step == 0 }.toMutableList()
                            if (compact.lastOrNull() != current.last()) compact += current.last()
                            onStroke(compact.map { Offset((it.x / size.width).coerceIn(0f, 1f), (it.y / size.height).coerceIn(0f, 1f)) })
                        }
                        current = emptyList()
                    },
                    onDragCancel = { current = emptyList() },
                )
            },
    ) {
        strokes.forEach { stroke ->
            val points = stroke.optJSONArray("points") ?: JSONArray()
            val path = Path()
            for (i in 0 until points.length()) {
                val point = points.optJSONArray(i) ?: continue
                val x = point.optDouble(0).toFloat() * size.width; val y = point.optDouble(1).toFloat() * size.height
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            val strokeColor = if (stroke.optString("mode") == "erase") Color.White else parseHex(stroke.optString("color", "#111827"))
            drawPath(path, strokeColor, style = Stroke(width = stroke.optDouble("width", 5.0).toFloat() * density, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        if (current.size >= 2) {
            val path = Path().apply { moveTo(current.first().x, current.first().y); current.drop(1).forEach { lineTo(it.x, it.y) } }
            drawPath(path, if (erase) Color.White else parseHex(color), style = Stroke(width = width * density, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
private fun SketchTools(color: String, setColor: (String) -> Unit, width: Int, setWidth: (Int) -> Unit, erase: Boolean, setErase: (Boolean) -> Unit) {
    val colors = listOf("#111827", "#4f46e5", "#0284c7", "#059669", "#d97706", "#dc2626", "#9333ea")
    GlassCard(Modifier.fillMaxWidth(), padding = 10.dp) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            colors.forEach { hex -> Box(Modifier.size(if (hex == color && !erase) 31.dp else 27.dp).background(parseHex(hex), CircleShape).border(if (hex == color && !erase) 3.dp else 1.dp, if (hex == color && !erase) Color.White else Color.Transparent, CircleShape).bounceClick { setColor(hex) }) }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(3 to "Тонко", 6 to "Средне", 11 to "Толсто").forEach { (value, label) -> SecondaryButton(label, { setWidth(value) }, Modifier.weight(1f), accent = if (width == value) Color(0xFF7C3AED) else InkSoft) }
            SecondaryButton("Ластик", { setErase(!erase) }, Modifier.weight(1.15f), accent = if (erase) Danger else InkSoft, icon = "⌫")
        }
    }
}

@Composable
private fun GuessForm(value: String, setValue: (String) -> Unit, button: String, submit: () -> Unit) {
    GlassCard(Modifier.fillMaxWidth(), padding = 12.dp) {
        OnlineTextField(value, setValue, "Ваш ответ")
        Spacer(Modifier.height(8.dp)); PrimaryButton(button, submit, Modifier.fillMaxWidth(), enabled = value.isNotBlank(), icon = "✓", colors = listOf(Color(0xFF7C3AED), Color(0xFFDB2777)))
    }
}

@Composable
private fun SketchFinished(state: JSONObject, roomId: String, restart: () -> Unit, leave: () -> Unit) {
    val context = LocalContext.current
    val result = state.optJSONObject("result") ?: JSONObject()
    val teamWon = result.optString("winner") == "team"
    Text(if (teamWon) "🎨" else "🕵️", fontSize = 64.sp)
    Text(if (teamWon) "Художники победили" else "Шпион победил", color = Ink, fontSize = 27.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
    Text(sketchResultReason(result.optString("reason")), Modifier.fillMaxWidth(), color = InkSoft, fontSize = 12.sp, lineHeight = 17.sp, textAlign = TextAlign.Center)
    Spacer(Modifier.height(10.dp))
    GlassCard(Modifier.fillMaxWidth(), color = if (teamWon) Color(0xFFF0FDF4) else Color(0xFFFFF1F2)) {
        val word = result.optJSONObject("word")
        Text("Секретное слово", Modifier.fillMaxWidth(), color = InkSoft, fontSize = 10.sp, textAlign = TextAlign.Center)
        Text(word?.optString("label").orEmpty(), Modifier.fillMaxWidth(), color = Indigo, fontSize = 22.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
        Text("${word?.optString("ref").orEmpty()} · Синодальный перевод", Modifier.fillMaxWidth(), color = InkSoft, fontSize = 10.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(7.dp))
        Text("Шпион: ${result.optString("spyName")}", Modifier.fillMaxWidth(), color = Danger, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        if (result.optString("guessText").isNotBlank()) Text("Ответ: «${result.optString("guessText")}»", Modifier.fillMaxWidth(), color = InkSoft, textAlign = TextAlign.Center)
    }
    Spacer(Modifier.height(10.dp))
    SketchCanvas(state.optJSONArray("strokes").objects(), false, "#111827", 5, false, Modifier.fillMaxWidth().aspectRatio(5f / 3f)) {}
    Spacer(Modifier.height(12.dp))
    if (state.optJSONObject("me")?.optBoolean("isHost") == true) PrimaryButton("Новый раунд", restart, Modifier.fillMaxWidth(), icon = "↻", colors = listOf(Color(0xFF7C3AED), Color(0xFFDB2777)))
    else GlassCard(Modifier.fillMaxWidth(), padding = 12.dp) { Text("Ждём, когда ведущий начнёт новый раунд…", Modifier.fillMaxWidth(), color = InkSoft, textAlign = TextAlign.Center) }
    Spacer(Modifier.height(8.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SecondaryButton("Код $roomId", { copyRoomCode(context, roomId) }, Modifier.weight(1f), accent = Color(0xFF7C3AED), icon = "⧉")
        SecondaryButton("Выйти", leave, Modifier.weight(1f), accent = Danger)
    }
}

@Composable
private fun SketchChat(messages: List<JSONObject>, meId: String, value: String, setValue: (String) -> Unit, send: () -> Unit) {
    GlassCard(Modifier.fillMaxWidth(), padding = 12.dp) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Чат комнаты", color = Ink, fontWeight = FontWeight.ExtraBold)
            StatusPill("${messages.size}", Color(0xFF7C3AED))
        }
        Column(Modifier.fillMaxWidth().heightIn(min = 80.dp, max = 310.dp).verticalScroll(rememberScrollState())) {
            if (messages.isEmpty()) Text("Сообщений пока нет", Modifier.fillMaxWidth().padding(16.dp), color = InkSoft, textAlign = TextAlign.Center, fontSize = 12.sp)
            messages.forEach { message ->
                val mine = message.optString("playerId") == meId
                Column(
                    Modifier.fillMaxWidth(.88f).align(if (mine) Alignment.End else Alignment.Start).padding(top = 6.dp)
                        .background(if (mine) Color(0xFFEEF2FF) else Color(0xFFF1F5F9), RoundedCornerShape(if (mine) 14.dp else 12.dp)).padding(horizontal = 10.dp, vertical = 8.dp),
                ) {
                    Text(message.optString("name"), color = InkSoft, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    Text(message.optString("text"), color = if (mine) Color(0xFF3730A3) else Ink, fontSize = 12.sp)
                    Text(formatChatTime(message.optLong("at")), Modifier.fillMaxWidth(), color = InkSoft, fontSize = 8.sp, textAlign = TextAlign.End)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { OnlineTextField(value, setValue, "Сообщение") }
            SecondaryButton("↑", send, Modifier.size(52.dp), enabled = value.isNotBlank(), accent = Color(0xFF7C3AED))
        }
        Text("Во время раунда секретное слово нельзя отправить в чат.", Modifier.fillMaxWidth().padding(top = 7.dp), color = InkSoft, fontSize = 9.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun GameLog(lines: List<String>) {
    if (lines.isEmpty()) return
    GlassCard(Modifier.fillMaxWidth(), padding = 12.dp, color = Color.White.copy(.72f)) {
        Text("События", color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
        lines.takeLast(5).reversed().forEach { Text("• $it", Modifier.padding(top = 4.dp), color = InkSoft, fontSize = 11.sp, lineHeight = 14.sp) }
    }
}

@Composable
private fun OnlineTextField(value: String, onChange: (String) -> Unit, label: String, centered: Boolean = false) {
    OutlinedTextField(
        value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true,
        textStyle = androidx.compose.ui.text.TextStyle(textAlign = if (centered) TextAlign.Center else TextAlign.Start, fontWeight = if (centered) FontWeight.Black else FontWeight.Medium, fontSize = if (centered) 20.sp else 16.sp, letterSpacing = if (centered) 3.sp else 0.sp),
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Indigo, unfocusedBorderColor = Color(0xFFD6DDEA)),
    )
}

private fun sketchPhaseTitle(status: String, role: String): String = when (status) {
    "drawing" -> "Раунд рисования"
    "answerReview" -> "Проверка ответа шпиона"
    "voting" -> "Кто шпион?"
    "finalGuess" -> if (role == "spy") "Последний шанс" else "Шпион отвечает"
    else -> "Раунд"
}

private fun sketchPhaseDescription(status: String): String = when (status) {
    "answerReview" -> "Художники решают, засчитать ли ответ."
    "voting" -> "Выберите игрока, который не знал слово."
    "finalGuess" -> "Шпион может назвать слово и украсть победу."
    else -> ""
}

private fun sketchResultReason(reason: String): String = mapOf(
    "early_guess_auto" to "Шпион назвал слово досрочно, и приложение подтвердило точное совпадение.",
    "early_guess_human" to "Шпион назвал слово досрочно, и художники засчитали его ответ.",
    "final_guess_auto" to "Шпиона нашли, но он точно назвал слово в последней попытке.",
    "final_guess_human" to "Шпиона нашли, но команда засчитала его финальный ответ.",
    "final_guess_rejected" to "Шпиона нашли, а его последний ответ команда не засчитала.",
    "final_guess_timeout" to "Шпиона нашли, но он не успел назвать слово.",
    "spy_not_found" to "После рисунков команда выбрала не того игрока.",
    "vote_tie" to "Голоса разделились, поэтому шпион остался нераскрытым.",
    "spy_left" to "Шпион покинул раунд.",
    "not_enough_players" to "В комнате осталось слишком мало игроков для продолжения.",
)[reason] ?: "Раунд завершён."

private fun copyRoomCode(context: Context, roomId: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Код комнаты", roomId))
    Toast.makeText(context, "Код комнаты скопирован", Toast.LENGTH_SHORT).show()
}

private fun shareRoomCode(context: Context, roomId: String, gameName: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, gameName)
        putExtra(Intent.EXTRA_TEXT, "$gameName · код комнаты: $roomId")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(Intent.createChooser(intent, "Поделиться кодом").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private fun formatChatTime(epochMs: Long): String = if (epochMs <= 0L) "" else SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(epochMs))

private fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else List(length()) { optJSONObject(it) ?: JSONObject() }
private fun JSONArray?.strings(): List<String> = if (this == null) emptyList() else List(length()) { optString(it) }.filter { it.isNotBlank() }
private fun parseHex(value: String): Color = runCatching { Color(android.graphics.Color.parseColor(value)) }.getOrDefault(Ink)
