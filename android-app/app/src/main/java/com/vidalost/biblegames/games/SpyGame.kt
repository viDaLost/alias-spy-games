package com.vidalost.biblegames.games

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
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.ui.AssetImage
import com.vidalost.biblegames.ui.ConfettiOverlay
import com.vidalost.biblegames.ui.Danger
import com.vidalost.biblegames.ui.GameScaffold
import com.vidalost.biblegames.ui.GlassCard
import com.vidalost.biblegames.ui.Gold
import com.vidalost.biblegames.ui.Indigo
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.NumberStepper
import com.vidalost.biblegames.ui.PrimaryButton
import com.vidalost.biblegames.ui.SecondaryButton
import com.vidalost.biblegames.ui.StatusPill
import com.vidalost.biblegames.ui.Success
import com.vidalost.biblegames.ui.bounceClick
import kotlinx.coroutines.delay
import java.security.SecureRandom

private enum class SpyStage { SETUP, ROLES, DISCUSSION, VOTE, GUESS, RESULT }

@Composable
fun SpyGame(assets: AssetRepository, onBack: () -> Unit) {
    val locations = remember { assets.stringList("data/spy_locations.json") }
    var stage by rememberSaveable { mutableStateOf(SpyStage.SETUP) }
    var playerCount by rememberSaveable { mutableIntStateOf(5) }
    var spyCount by rememberSaveable { mutableIntStateOf(1) }
    var currentPlayer by rememberSaveable { mutableIntStateOf(0) }
    var roles by remember { mutableStateOf(emptyList<Boolean>()) }
    var location by rememberSaveable { mutableStateOf("") }
    var revealed by rememberSaveable { mutableStateOf(false) }
    var handoffInProgress by rememberSaveable { mutableStateOf(false) }
    var accused by rememberSaveable { mutableIntStateOf(1) }
    var guess by rememberSaveable { mutableStateOf("") }
    var resultTitle by rememberSaveable { mutableStateOf("") }
    var resultText by rememberSaveable { mutableStateOf("") }
    var spiesWin by rememberSaveable { mutableStateOf(false) }
    var guessFeedback by rememberSaveable { mutableStateOf<String?>(null) }

    fun start() {
        val random = SecureRandom()
        val spyIndices = mutableSetOf<Int>()
        while (spyIndices.size < spyCount) spyIndices += random.nextInt(playerCount)
        roles = List(playerCount) { it in spyIndices }
        location = locations.randomOrNull() ?: "Иерусалим"
        currentPlayer = 0
        revealed = false
        handoffInProgress = false
        stage = SpyStage.ROLES
    }

    fun nextPlayer() {
        if (!revealed || handoffInProgress) return
        handoffInProgress = true
        revealed = false
    }

    LaunchedEffect(handoffInProgress) {
        if (handoffInProgress) {
            delay(620)
            if (currentPlayer + 1 >= playerCount) stage = SpyStage.DISCUSSION
            else currentPlayer++
            handoffInProgress = false
        }
    }

    fun vote() {
        val caught = roles.getOrElse(accused - 1) { false }
        spiesWin = !caught
        resultTitle = if (caught) "Шпионы найдены" else "Шпионы скрылись"
        resultText = if (caught) "Игрок $accused действительно был шпионом." else "Игрок $accused не был шпионом."
        stage = SpyStage.RESULT
    }

    fun checkGuess() {
        val correct = guess.trim().lowercase() == location.trim().lowercase()
        guessFeedback = (if (correct) "🎉 Шпион угадал!" else "❌ Шпион не угадал.") + "\nЛокация: $location"
        guess = ""
        stage = SpyStage.VOTE
    }

    GameScaffold(
        title = "Шпион",
        subtitle = when (stage) {
            SpyStage.ROLES -> "Секретные карточки"
            SpyStage.DISCUSSION -> "Найдите того, кто не знает локацию"
            else -> "Секретная роль и локация"
        },
        onBack = { if (stage == SpyStage.SETUP) onBack() else stage = SpyStage.SETUP },
    ) {
        AnimatedContent(stage, transitionSpec = {
            (slideInHorizontally(tween(390)) { it / 2 } + fadeIn()) togetherWith
                (slideOutHorizontally(tween(290)) { -it / 3 } + fadeOut())
        }, label = "spyStage") { target ->
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                when (target) {
                    SpyStage.SETUP -> {
                        SpySetup(
                            playerCount, { playerCount = it; spyCount = spyCount.coerceAtMost(it - 1) },
                            spyCount, { spyCount = it }, ::start,
                        )
                    }
                    SpyStage.ROLES -> SpyRoleScreen(
                        assets = assets,
                        player = currentPlayer + 1,
                        total = playerCount,
                        isSpy = roles.getOrElse(currentPlayer) { false },
                        location = location,
                        revealed = revealed,
                        handoffInProgress = handoffInProgress,
                        onReveal = { if (!handoffInProgress) revealed = true },
                        onNext = ::nextPlayer,
                    )
                    SpyStage.DISCUSSION -> SpyDiscussion(playerCount, spyCount, { stage = SpyStage.VOTE }) {
                        guess = ""; accused = 1; stage = SpyStage.SETUP
                    }
                    SpyStage.VOTE -> SpyVote(playerCount, accused, { accused = it }, ::vote, { stage = SpyStage.GUESS })
                    SpyStage.GUESS -> SpyGuess(guess, { guess = it }, ::checkGuess) { stage = SpyStage.VOTE }
                    SpyStage.RESULT -> SpyResult(resultTitle, resultText, location, roles, spiesWin) {
                        guess = ""; accused = 1; stage = SpyStage.SETUP
                    }
                }
            }
        }
        ConfettiOverlay(stage == SpyStage.RESULT && !spiesWin, Modifier.fillMaxWidth().height(86.dp))
        guessFeedback?.let { message ->
            AlertDialog(
                onDismissRequest = { guessFeedback = null },
                title = { Text("Проверка локации", fontWeight = FontWeight.Black) },
                text = { Text(message) },
                confirmButton = { TextButton(onClick = { guessFeedback = null }) { Text("Продолжить") } },
            )
        }
    }
}

@Composable
private fun SpySetup(players: Int, setPlayers: (Int) -> Unit, spies: Int, setSpies: (Int) -> Unit, start: () -> Unit) {
    Text("Настройте состав игры", color = Ink, fontSize = 24.sp, fontWeight = FontWeight.Black)
    Text("Роли перемешиваются на устройстве и никому не отправляются", color = InkSoft, textAlign = TextAlign.Center, fontSize = 13.sp)
    Spacer(Modifier.height(17.dp))
    NumberStepper("Количество игроков", players, 3..20, setPlayers, Modifier.fillMaxWidth())
    Spacer(Modifier.height(11.dp))
    NumberStepper("Количество шпионов", spies, 1..(players - 1), setSpies, Modifier.fillMaxWidth())
    Spacer(Modifier.height(13.dp))
    GlassCard(Modifier.fillMaxWidth(), padding = 14.dp, color = Color(0xFFEEF6FF)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).background(Color.White, CircleShape), contentAlignment = Alignment.Center) { Text("🔒", fontSize = 19.sp) }
            Text("Передавайте телефон по очереди. Каждый игрок открывает только свою карточку.", Modifier.padding(start = 11.dp), color = InkSoft, fontSize = 13.sp)
        }
    }
    Spacer(Modifier.height(17.dp))
    PrimaryButton("Начать игру", start, Modifier.fillMaxWidth(), icon = "▶")
}

@Composable
private fun SpyRoleScreen(
    assets: AssetRepository,
    player: Int,
    total: Int,
    isSpy: Boolean,
    location: String,
    revealed: Boolean,
    handoffInProgress: Boolean,
    onReveal: () -> Unit,
    onNext: () -> Unit,
) {
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    val revealWithFeedback = {
        if (!handoffInProgress && !revealed) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            onReveal()
        }
    }
    val nextWithFeedback = {
        if (revealed && !handoffInProgress) {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onNext()
        }
    }
    StatusPill("Игрок $player из $total", Indigo)
    Spacer(Modifier.height(8.dp))
    Text("Секретная карточка", color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Black)
    Text("Передайте телефон игроку $player. Нажмите на карточку так, чтобы роль не увидели другие.", Modifier.padding(horizontal = 8.dp), color = InkSoft, fontSize = 13.sp, lineHeight = 18.sp, textAlign = TextAlign.Center)
    Spacer(Modifier.height(12.dp))
    SpyRoleCard(
        assets = assets,
        isSpy = isSpy,
        location = location,
        revealed = revealed,
        interactionEnabled = !handoffInProgress,
        onReveal = revealWithFeedback,
    )
    Spacer(Modifier.height(12.dp))
    AnimatedVisibility(!revealed && !handoffInProgress, enter = fadeIn(), exit = fadeOut()) {
        PrimaryButton("Перевернуть карточку", revealWithFeedback, Modifier.fillMaxWidth(), icon = "👁")
    }
    AnimatedVisibility(revealed && !handoffInProgress, enter = fadeIn(tween(280)) + scaleIn(initialScale = .92f), exit = fadeOut()) {
        PrimaryButton(if (player == total) "Начать обсуждение" else "Передать следующему", nextWithFeedback, Modifier.fillMaxWidth(), icon = "→")
    }
    AnimatedVisibility(handoffInProgress, enter = fadeIn(), exit = fadeOut()) {
        Text("Карточка скрывается…", color = InkSoft, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 13.dp))
    }
}

@Composable
private fun SpyRoleCard(
    assets: AssetRepository,
    isSpy: Boolean,
    location: String,
    revealed: Boolean,
    interactionEnabled: Boolean,
    onReveal: () -> Unit,
) {
    val rotation by animateFloatAsState(if (revealed) 180f else 0f, tween(540), label = "spyCardFlip")
    val showFront = revealed && rotation > 90f
    val facePath = when {
        !showFront -> "assets/cards/spy-card-back.png"
        isSpy -> "assets/cards/spy-card-spy.png"
        else -> "assets/cards/spy-card-player.png"
    }
    val mainText = if (isSpy) "Вы — шпион" else location
    val mainFontSize = when {
        isSpy -> 27.sp
        mainText.length <= 17 -> 25.sp
        mainText.length <= 25 -> 21.sp
        mainText.length <= 34 -> 18.sp
        else -> 16.sp
    }
    val mainLineHeight = when {
        mainText.length <= 17 -> 29.sp
        mainText.length <= 25 -> 25.sp
        mainText.length <= 34 -> 22.sp
        else -> 20.sp
    }

    Box(
        Modifier.fillMaxWidth(.96f).aspectRatio(5f / 7f)
            .graphicsLayer {
                rotationY = if (showFront) rotation - 180f else rotation
                cameraDistance = 26f * density
                shadowElevation = 13f
                clip = true
                shape = RoundedCornerShape(29.dp)
            }
            .bounceClick(enabled = !revealed && interactionEnabled, onClick = onReveal),
    ) {
        AssetImage(assets, facePath, Modifier.fillMaxSize(), ContentScale.FillBounds)
        if (showFront) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    Modifier.fillMaxWidth(.72f).padding(top = 78.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        if (isSpy) "ВАША РОЛЬ" else "ЛОКАЦИЯ",
                        color = Color(0xFF365075),
                        fontSize = 11.sp,
                        letterSpacing = 1.6.sp,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(7.dp))
                    Text(
                        mainText,
                        modifier = Modifier.fillMaxWidth(),
                        color = Color(0xFF102A54),
                        fontSize = mainFontSize,
                        lineHeight = mainLineHeight,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                        maxLines = 3,
                        softWrap = true,
                    )
                }
            }
        }
    }
}

@Composable
private fun SpyDiscussion(players: Int, spies: Int, onVote: () -> Unit, onNewGame: () -> Unit) {
    Box(
        Modifier.size(116.dp).clip(CircleShape).background(Brush.linearGradient(listOf(Indigo, Color(0xFF2563EB), Color(0xFF0EA5E9)))),
        contentAlignment = Alignment.Center,
    ) { Text("?", color = Color.White, fontSize = 66.sp, fontWeight = FontWeight.Black) }
    Spacer(Modifier.height(14.dp))
    Text("Обсуждение началось", color = Ink, fontSize = 26.sp, fontWeight = FontWeight.Black)
    Text("Задавайте вопросы и ищите игроков, которые не знают локацию.", Modifier.padding(horizontal = 10.dp), color = InkSoft, textAlign = TextAlign.Center, lineHeight = 20.sp)
    Spacer(Modifier.height(16.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(players.toString(), color = Indigo, fontSize = 27.sp, fontWeight = FontWeight.Black); Text("игроков", color = InkSoft, fontSize = 12.sp) }
            Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(spies.toString(), color = Danger, fontSize = 27.sp, fontWeight = FontWeight.Black); Text("шпионов", color = InkSoft, fontSize = 12.sp) }
        }
    }
    Spacer(Modifier.height(16.dp))
    PrimaryButton("Перейти к голосованию", onVote, Modifier.fillMaxWidth(), icon = "🎯")
    Spacer(Modifier.height(9.dp))
    SecondaryButton("Новая игра", onNewGame, Modifier.fillMaxWidth(), icon = "↻")
}

@Composable
private fun SpyVote(players: Int, selected: Int, setSelected: (Int) -> Unit, vote: () -> Unit, guess: () -> Unit) {
    Text("Кто шпион?", color = Ink, fontSize = 27.sp, fontWeight = FontWeight.Black)
    Text("Обсудите решение и выберите одного игрока", color = InkSoft, textAlign = TextAlign.Center)
    Spacer(Modifier.height(15.dp))
    NumberStepper("Подозреваемый игрок", selected, 1..players, setSelected, Modifier.fillMaxWidth())
    Spacer(Modifier.height(15.dp))
    PrimaryButton("Проголосовать за игрока $selected", vote, Modifier.fillMaxWidth(), icon = "✓")
    Spacer(Modifier.height(9.dp))
    SecondaryButton("Шпион угадывает локацию", guess, Modifier.fillMaxWidth(), icon = "⌕")
}

@Composable
private fun SpyGuess(value: String, setValue: (String) -> Unit, check: () -> Unit, back: () -> Unit) {
    Text("Последний шанс шпиона", color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Black)
    Text("Введите точное название локации", color = InkSoft)
    Spacer(Modifier.height(15.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value, setValue, Modifier.fillMaxWidth(), singleLine = true,
            label = { Text("Вариант шпиона") }, placeholder = { Text("Введите локацию") },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            shape = RoundedCornerShape(18.dp),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Indigo),
        )
    }
    Spacer(Modifier.height(14.dp))
    PrimaryButton("Проверить", check, Modifier.fillMaxWidth(), enabled = value.isNotBlank(), icon = "✓")
    Spacer(Modifier.height(9.dp))
    SecondaryButton("Назад к голосованию", back, Modifier.fillMaxWidth())
}

@Composable
private fun SpyResult(title: String, text: String, location: String, roles: List<Boolean>, spiesWin: Boolean, again: () -> Unit) {
    Text(if (spiesWin) "🕵️" else "🏆", fontSize = 67.sp)
    Text(title, color = Ink, fontSize = 27.sp, lineHeight = 31.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
    Spacer(Modifier.height(13.dp))
    GlassCard(Modifier.fillMaxWidth(), color = if (spiesWin) Color(0xFFFFF7ED) else Color(0xFFF0FDF4)) {
        Text(text, color = InkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(), lineHeight = 21.sp)
        Spacer(Modifier.height(13.dp))
        Text("Локация: $location", color = Indigo, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text("Шпион${if (roles.count { it } > 1) "ы" else ""}: ${roles.mapIndexedNotNull { index, spy -> (index + 1).takeIf { spy } }.joinToString()}", color = Danger, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
    Spacer(Modifier.height(16.dp))
    PrimaryButton("Новая игра", again, Modifier.fillMaxWidth(), icon = "↻")
}
