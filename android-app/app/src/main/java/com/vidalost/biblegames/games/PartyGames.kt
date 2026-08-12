package com.vidalost.biblegames.games

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.ui.Cyan
import com.vidalost.biblegames.ui.Danger
import com.vidalost.biblegames.ui.GameScaffold
import com.vidalost.biblegames.ui.GlassCard
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

private enum class AliasScreen { DIFFICULTY, SETUP, ROUND, SUMMARY, ALL_WORDS }
private data class AliasAnswer(val word: String, val correct: Boolean?, val round: Int, val team: Int)

@Composable
fun AliasGame(assets: AssetRepository, onBack: () -> Unit) {
    var screen by rememberSaveable { mutableStateOf(AliasScreen.DIFFICULTY) }
    var difficulty by rememberSaveable { mutableStateOf("easy") }
    var secondsPreset by rememberSaveable { mutableIntStateOf(60) }
    var secondsLeft by rememberSaveable { mutableIntStateOf(60) }
    var teamCount by rememberSaveable { mutableIntStateOf(2) }
    var currentTeam by rememberSaveable { mutableIntStateOf(1) }
    var nextTeam by rememberSaveable { mutableIntStateOf(1) }
    var currentRound by rememberSaveable { mutableIntStateOf(1) }
    var wordIndex by rememberSaveable { mutableIntStateOf(0) }
    var roundWords by remember { mutableStateOf(emptyList<String>()) }
    var inputLocked by remember { mutableStateOf(false) }
    val answers = remember { mutableStateListOf<AliasAnswer>() }
    val scores = remember { mutableStateMapOf<Int, Int>() }

    fun initialiseScores() {
        scores.clear()
        repeat(teamCount) { scores[it + 1] = 0 }
        answers.filter { it.correct == true && it.team in 1..teamCount }
            .forEach { scores[it.team] = (scores[it.team] ?: 0) + 1 }
    }

    fun hardReset() {
        screen = AliasScreen.DIFFICULTY
        difficulty = "easy"
        secondsPreset = 60
        secondsLeft = 60
        teamCount = 2
        currentTeam = 1
        nextTeam = 1
        currentRound = 1
        wordIndex = 0
        roundWords = emptyList()
        answers.clear()
        initialiseScores()
    }

    fun loadWords(level: String) {
        difficulty = level
        answers.clear()
        teamCount = 2
        currentTeam = 1
        nextTeam = 1
        currentRound = 1
        initialiseScores()
        roundWords = emptyList()
        wordIndex = 0
        screen = AliasScreen.SETUP
    }

    fun beginRound() {
        initialiseScores()
        val used = answers.map { it.word.trim().lowercase() }.toSet()
        val unused = assets.stringList("data/${difficulty}_bible_words.json")
            .filterNot { it.trim().lowercase() in used }
        if (unused.isEmpty()) {
            screen = AliasScreen.ALL_WORDS
            return
        }
        roundWords = unused.shuffled()
        wordIndex = 0
        secondsLeft = secondsPreset
        inputLocked = false
        screen = AliasScreen.ROUND
    }

    fun answer(correct: Boolean?) {
        if (screen != AliasScreen.ROUND || inputLocked) return
        val word = roundWords.getOrNull(wordIndex) ?: return
        inputLocked = true
        answers += AliasAnswer(word, correct, currentRound, currentTeam)
        if (correct == true) scores[currentTeam] = (scores[currentTeam] ?: 0) + 1
        wordIndex++
        if (wordIndex >= roundWords.size) {
            nextTeam = currentTeam
            screen = AliasScreen.SUMMARY
        }
    }

    fun restartRound() {
        answers.removeAll { it.round == currentRound }
        initialiseScores()
        beginRound()
    }

    LaunchedEffect(screen, secondsLeft) {
        if (screen == AliasScreen.ROUND && secondsLeft > 0) {
            delay(1000)
            secondsLeft--
        } else if (screen == AliasScreen.ROUND && secondsLeft == 0) {
            delay(250)
            nextTeam = currentTeam
            screen = AliasScreen.SUMMARY
        }
    }

    LaunchedEffect(wordIndex, screen) {
        if (screen == AliasScreen.ROUND && inputLocked) {
            delay(90)
            inputLocked = false
        }
    }

    GameScaffold(
        title = "Алиас",
        subtitle = when (screen) {
            AliasScreen.ROUND -> "Команда $currentTeam · Раунд на скорость"
            else -> "Объясняйте слова, не называя их"
        },
        onBack = { if (screen == AliasScreen.DIFFICULTY) onBack() else hardReset() },
    ) {
        AnimatedContent(screen, transitionSpec = {
            (slideInHorizontally(tween(350)) { it / 2 } + fadeIn()) togetherWith
                (slideOutHorizontally(tween(260)) { -it / 3 } + fadeOut())
        }, label = "aliasScreen") { target ->
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                when (target) {
                    AliasScreen.DIFFICULTY -> AliasDifficulty(::loadWords)
                    AliasScreen.SETUP -> AliasSetup(
                        difficulty, secondsPreset, { secondsPreset = it }, teamCount,
                        { teamCount = it; currentTeam = currentTeam.coerceAtMost(it); nextTeam = currentTeam; initialiseScores() },
                        currentTeam, { currentTeam = it }, ::beginRound,
                    )
                    AliasScreen.ROUND -> AliasRound(
                        secondsLeft, secondsPreset, currentTeam, currentRound,
                        roundWords.getOrNull(wordIndex).orEmpty(), inputLocked,
                        onCorrect = { answer(true) }, onWrong = { answer(false) },
                        onSkip = { answer(null) }, onRestart = ::restartRound,
                    )
                    AliasScreen.SUMMARY -> AliasSummary(
                        answers = answers,
                        scores = scores,
                        teamCount = teamCount,
                        nextTeam = nextTeam,
                        setNextTeam = { nextTeam = it },
                        editResult = { index, value ->
                            answers[index] = answers[index].copy(correct = value)
                            initialiseScores()
                        },
                        onNext = {
                            currentTeam = nextTeam
                            currentRound++
                            screen = AliasScreen.SETUP
                        },
                        onChooseLevel = ::hardReset,
                    )
                    AliasScreen.ALL_WORDS -> AliasAllWords(
                        resetUsed = {
                            answers.clear(); currentRound = 1; initialiseScores(); screen = AliasScreen.SETUP
                        },
                        newGame = ::hardReset,
                    )
                }
            }
        }
    }
}

@Composable
private fun AliasDifficulty(onChoose: (String) -> Unit) {
    Text("Выберите уровень сложности", color = InkSoft, fontSize = 15.sp)
    Spacer(Modifier.height(20.dp))
    listOf(
        Triple("easy", "Лёгкий", Color(0xFF16A34A)),
        Triple("medium", "Средний", Color(0xFFF59E0B)),
        Triple("hard", "Тяжёлый", Color(0xFFDC2626)),
    ).forEach { (id, label, color) ->
        GlassCard(Modifier.fillMaxWidth().padding(bottom = 11.dp).bounceClick { onChoose(id) }, padding = 16.dp) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(15.dp).background(color, CircleShape))
                Spacer(Modifier.width(13.dp))
                Text(label, Modifier.weight(1f), color = Ink, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                Text("→", color = color, fontSize = 23.sp)
            }
        }
    }
}

@Composable
private fun AliasSetup(
    difficulty: String,
    seconds: Int,
    setSeconds: (Int) -> Unit,
    teams: Int,
    setTeams: (Int) -> Unit,
    currentTeam: Int,
    setCurrentTeam: (Int) -> Unit,
    onStart: () -> Unit,
) {
    StatusPill(mapOf("easy" to "Лёгкий", "medium" to "Средний", "hard" to "Тяжёлый")[difficulty] ?: difficulty)
    Spacer(Modifier.height(14.dp))
    NumberStepper("Время раунда, секунд", seconds, 1..180, setSeconds, Modifier.fillMaxWidth())
    Spacer(Modifier.height(11.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        NumberStepper("Команды", teams, 1..5, setTeams, Modifier.weight(1f))
        NumberStepper("Играет", currentTeam, 1..teams, setCurrentTeam, Modifier.weight(1f))
    }
    Spacer(Modifier.height(10.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(30, 60, 90).forEach { preset ->
            SecondaryButton(if (preset == 90) "1:30" else "$preset сек", { setSeconds(preset) }, Modifier.weight(1f), accent = if (seconds == preset) Indigo else InkSoft)
        }
    }
    Spacer(Modifier.height(18.dp))
    PrimaryButton("Начать раунд", onStart, Modifier.fillMaxWidth(), icon = "▶")
}

@Composable
private fun AliasRound(
    seconds: Int,
    total: Int,
    team: Int,
    round: Int,
    word: String,
    locked: Boolean,
    onCorrect: () -> Unit,
    onWrong: () -> Unit,
    onSkip: () -> Unit,
    onRestart: () -> Unit,
) {
    val progress = seconds.toFloat() / total.coerceAtLeast(1)
    val timerColor = when { seconds <= 5 -> Danger; seconds <= 15 -> Color(0xFFF59E0B); else -> Indigo }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        StatusPill("Раунд #$round", Indigo, "●")
        StatusPill("Команда $team", Success, "◆")
    }
    Spacer(Modifier.height(15.dp))
    Box(
        Modifier.size(92.dp).clip(CircleShape).background(Color.White.copy(.9f)),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize().padding(5.dp)) {
            drawCircle(timerColor.copy(alpha = .14f), style = Stroke(width = 7.dp.toPx()))
            drawArc(
                color = timerColor,
                startAngle = -90f,
                sweepAngle = progress.coerceIn(0f, 1f) * 360f,
                useCenter = false,
                style = Stroke(width = 7.dp.toPx(), cap = StrokeCap.Round),
            )
        }
        AnimatedContent(seconds, label = "aliasTimer") { value ->
            Text(value.toString(), color = timerColor, fontSize = 34.sp, fontWeight = FontWeight.Black)
        }
    }
    Spacer(Modifier.height(17.dp))
    AnimatedContent(word, transitionSpec = {
        (slideInHorizontally(tween(260)) { it } + fadeIn()) togetherWith
            (slideOutHorizontally(tween(220)) { -it } + fadeOut())
    }, label = "aliasWord") { current ->
        GlassCard(Modifier.fillMaxWidth().height(220.dp), padding = 20.dp) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(current, color = Ink, fontSize = if (current.length > 16) 29.sp else 38.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center, lineHeight = 42.sp)
            }
        }
    }
    Spacer(Modifier.height(15.dp))
    PrimaryButton("Отгадано", onCorrect, Modifier.fillMaxWidth(), enabled = !locked, icon = "✓", colors = listOf(Color(0xFF16A34A), Color(0xFF22C55E)))
    Spacer(Modifier.height(8.dp))
    SecondaryButton("Не отгадано", onWrong, Modifier.fillMaxWidth(), enabled = !locked, accent = Danger, icon = "×")
    Spacer(Modifier.height(8.dp))
    SecondaryButton("Пропустить", onSkip, Modifier.fillMaxWidth(), enabled = !locked, accent = Color(0xFF1E40AF), icon = "⏭")
    Spacer(Modifier.height(12.dp))
    SecondaryButton("Начать этот раунд заново", onRestart, Modifier.fillMaxWidth(), icon = "↻")
}

@Composable
private fun AliasSummary(
    answers: List<AliasAnswer>,
    scores: Map<Int, Int>,
    teamCount: Int,
    nextTeam: Int,
    setNextTeam: (Int) -> Unit,
    editResult: (Int, Boolean?) -> Unit,
    onNext: () -> Unit,
    onChooseLevel: () -> Unit,
) {
    Text("Результаты", color = Ink, fontSize = 27.sp, fontWeight = FontWeight.Black)
    Spacer(Modifier.height(10.dp))
    scores.entries.sortedBy { it.key }.chunked(2).forEach { row ->
        Row(Modifier.fillMaxWidth().padding(bottom = 7.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            row.forEach { (team, score) ->
                GlassCard(Modifier.weight(1f), padding = 11.dp) {
                    Text("Команда $team", color = InkSoft, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text(score.toString(), color = Indigo, fontSize = 25.sp, fontWeight = FontWeight.Black)
                }
            }
            if (row.size == 1) Spacer(Modifier.weight(1f))
        }
    }
    answers.map { it.round }.distinct().sorted().forEach { round ->
        val roundItems = answers.withIndex().filter { it.value.round == round }
        val yes = roundItems.count { it.value.correct == true }
        val no = roundItems.count { it.value.correct == false }
        val skipped = roundItems.count { it.value.correct == null }
        Spacer(Modifier.height(10.dp))
        Text("Раунд #$round — ✓ $yes / × $no${if (skipped > 0) " / ⏭ $skipped" else ""}", Modifier.fillMaxWidth(), color = Ink, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(7.dp))
        GlassCard(Modifier.fillMaxWidth(), padding = 12.dp) {
            roundItems.forEachIndexed { rowIndex, indexed ->
                val item = indexed.value
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(item.word, color = Ink, fontWeight = FontWeight.Bold)
                        Text("Команда ${item.team} · ${aliasStatusText(item.correct)}", color = aliasStatusColor(item.correct), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    AliasEditButton("✓", Success) { editResult(indexed.index, true) }
                    Spacer(Modifier.width(5.dp))
                    AliasEditButton("×", Danger) { editResult(indexed.index, false) }
                    Spacer(Modifier.width(5.dp))
                    AliasEditButton("⏭", Color(0xFF1E40AF)) { editResult(indexed.index, null) }
                }
                if (rowIndex < roundItems.lastIndex) HorizontalDivider(color = Color(0xFFE8ECF5))
            }
        }
    }
    val totalYes = answers.count { it.correct == true }
    val totalNo = answers.count { it.correct == false }
    val totalSkipped = answers.count { it.correct == null }
    Spacer(Modifier.height(12.dp))
    StatusPill("Итого: ✓ $totalYes / × $totalNo${if (totalSkipped > 0) " / ⏭ $totalSkipped" else ""}", Indigo)
    Spacer(Modifier.height(14.dp))
    NumberStepper("Кто играет в следующем раунде?", nextTeam, 1..teamCount, setNextTeam, Modifier.fillMaxWidth())
    Spacer(Modifier.height(13.dp))
    PrimaryButton("Начать следующий раунд", onNext, Modifier.fillMaxWidth(), icon = "▶")
    Spacer(Modifier.height(8.dp))
    SecondaryButton("Выбрать уровень", onChooseLevel, Modifier.fillMaxWidth(), icon = "●")
}

@Composable
private fun AliasEditButton(text: String, color: Color, onClick: () -> Unit) {
    Box(Modifier.size(38.dp).clip(CircleShape).background(color.copy(.11f)).bounceClick(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(text, color = color, fontWeight = FontWeight.Black)
    }
}

private fun aliasStatusText(value: Boolean?): String = when (value) {
    true -> "Отгадано"
    false -> "Не отгадано"
    null -> "Пропущено"
}

private fun aliasStatusColor(value: Boolean?): Color = when (value) {
    true -> Success
    false -> Danger
    null -> Color(0xFF1E40AF)
}

@Composable
private fun AliasAllWords(resetUsed: () -> Unit, newGame: () -> Unit) {
    Text("Все слова показаны", color = Ink, fontSize = 27.sp, fontWeight = FontWeight.Black)
    Spacer(Modifier.height(10.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        Text("Можно начать заново или сбросить использованные слова.", Modifier.fillMaxWidth(), color = InkSoft, textAlign = TextAlign.Center)
    }
    Spacer(Modifier.height(14.dp))
    PrimaryButton("Сбросить использованные", resetUsed, Modifier.fillMaxWidth(), icon = "🧹")
    Spacer(Modifier.height(8.dp))
    SecondaryButton("Новая игра", newGame, Modifier.fillMaxWidth(), icon = "↻")
}

@Composable
fun CoimaginariumGame(assets: AssetRepository, onBack: () -> Unit) {
    val allThemes = remember { assets.stringList("data/coimaginarium_themes.json") }
    var themes by remember { mutableStateOf(allThemes.shuffled()) }
    val alphabet = remember { "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ".toList() }
    var index by rememberSaveable { mutableIntStateOf(0) }
    var letter by rememberSaveable { mutableStateOf(alphabet.random().toString()) }
    val recent = remember { mutableStateListOf(letter) }

    fun newLetter() {
        val available = alphabet.map(Char::toString).filterNot(recent::contains).ifEmpty { alphabet.map(Char::toString) }
        letter = available.random()
        recent += letter
        if (recent.size > 6) recent.removeAt(0)
    }

    fun restartThemes() {
        themes = allThemes.shuffled()
        index = 0
        recent.clear()
        letter = alphabet.random().toString()
        recent += letter
    }

    GameScaffold("Соображариум", "Ассоциации на заданную букву", onBack) {
        if (index >= themes.size) {
            Text("Все темы сыграны", color = Ink, fontSize = 26.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(18.dp))
            PrimaryButton("Начать заново", ::restartThemes, Modifier.fillMaxWidth(), icon = "↻")
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                StatusPill("Раунд ${index + 1} из ${themes.size}", Indigo)
                StatusPill("Без повтора букв", Cyan, "✓")
            }
            Spacer(Modifier.height(16.dp))
            GlassCard(Modifier.fillMaxWidth().height(365.dp), padding = 22.dp) {
                Box(
                    Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(24.dp))
                        .background(Brush.linearGradient(listOf(Color(0xFF312E81), Color(0xFF2563EB), Color(0xFF0EA5E9)))),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("ТЕМА", color = Color.White.copy(.7f), fontSize = 12.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Black)
                        Spacer(Modifier.height(7.dp))
                        Text(themes[index], color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center, lineHeight = 30.sp)
                        Spacer(Modifier.height(25.dp))
                        AnimatedContent(letter, label = "letter") { value ->
                            Box(Modifier.size(112.dp).background(Color.White.copy(.16f), CircleShape).border(2.dp, Color.White.copy(.35f), CircleShape), contentAlignment = Alignment.Center) {
                                Text(value, color = Color.White, fontSize = 67.sp, fontWeight = FontWeight.Black)
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        Text("БУКВА РАУНДА", color = Color.White.copy(.7f), fontSize = 11.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            SecondaryButton("Сменить букву", ::newLetter, Modifier.fillMaxWidth(), icon = "↻")
            Spacer(Modifier.height(9.dp))
            PrimaryButton("Новый раунд", { index++; newLetter() }, Modifier.fillMaxWidth(), icon = "→")
        }
    }
}

private enum class SecretStage { HANDOFF, REVEALED, FINISHED }

@Composable
fun GuessCharacterGame(assets: AssetRepository, onBack: () -> Unit) {
    val allCharacters = remember { assets.stringList("data/characters.json") }
    var characters by remember { mutableStateOf(allCharacters.shuffled().take(2)) }
    var player by rememberSaveable { mutableIntStateOf(1) }
    var stage by rememberSaveable { mutableStateOf(SecretStage.HANDOFF) }

    GameScaffold("Угадай персонажа", "Два тайных персонажа", onBack) {
        when (stage) {
            SecretStage.HANDOFF -> SecretHandoff(player, 2, "Передайте телефон игроку $player") { stage = SecretStage.REVEALED }
            SecretStage.REVEALED -> SecretRevealCard(
                player = player,
                value = characters.getOrElse(player - 1) { "Персонаж" },
                note = "Опишите персонажа так, чтобы другой игрок смог угадать",
            ) {
                if (player == 2) stage = SecretStage.FINISHED else { player++; stage = SecretStage.HANDOFF }
            }
            SecretStage.FINISHED -> SecretFinish("Оба игрока получили персонажей") {
                characters = allCharacters.shuffled().take(2); player = 1; stage = SecretStage.HANDOFF
            }
        }
    }
}

@Composable
fun DescribeGame(assets: AssetRepository, onBack: () -> Unit) {
    val allWords = remember { assets.stringList("data/describe_words.json") }
    var count by rememberSaveable { mutableIntStateOf(4) }
    var words by remember { mutableStateOf(emptyList<String>()) }
    var player by rememberSaveable { mutableIntStateOf(1) }
    var stage by rememberSaveable { mutableStateOf<SecretStage?>(null) }

    GameScaffold("Опиши, но не называй", "Тайные слова для каждого игрока", onBack) {
        when (stage) {
            null -> {
                GlassCard(Modifier.fillMaxWidth()) {
                    Text("Правила", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Black)
                    Spacer(Modifier.height(7.dp))
                    Text("Объясняйте слово через признаки, назначение и ассоциации. Нельзя произносить само слово или однокоренные слова.", color = InkSoft, lineHeight = 21.sp)
                }
                Spacer(Modifier.height(13.dp))
                NumberStepper("Количество игроков", count, 2..15, { count = it }, Modifier.fillMaxWidth())
                Spacer(Modifier.height(15.dp))
                PrimaryButton("Начать игру", {
                    val shuffled = allWords.shuffled()
                    if (shuffled.isNotEmpty()) {
                        words = List(count) { shuffled[it % shuffled.size] }
                        player = 1; stage = SecretStage.HANDOFF
                    }
                }, Modifier.fillMaxWidth(), icon = "▶")
            }
            SecretStage.HANDOFF -> SecretHandoff(player, count, "Посмотрите слово так, чтобы остальные не видели экран") { stage = SecretStage.REVEALED }
            SecretStage.REVEALED -> SecretRevealCard(player, words.getOrElse(player - 1) { "Слово" }, "Не называйте слово напрямую — объясняйте через признаки") {
                if (player == count) stage = SecretStage.FINISHED else { player++; stage = SecretStage.HANDOFF }
            }
            SecretStage.FINISHED -> SecretFinish("Все слова розданы — начинайте объяснение по очереди") {
                stage = null
            }
        }
    }
}

@Composable
private fun SecretHandoff(player: Int, count: Int, message: String, onReveal: () -> Unit) {
    StatusPill("Игрок $player из $count", Indigo)
    Spacer(Modifier.height(15.dp))
    GlassCard(Modifier.fillMaxWidth()) {
        Text("Секретная карточка", color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(7.dp))
        Text(message, color = InkSoft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
    Spacer(Modifier.height(15.dp))
    Box(
        Modifier.fillMaxWidth(.78f).aspectRatio(5f / 7f).clip(RoundedCornerShape(29.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF25236E), Color(0xFF4F46E5), Color(0xFF0EA5E9))))
            .border(1.dp, Color.White.copy(.4f), RoundedCornerShape(29.dp)).bounceClick(onClick = onReveal),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("✦", color = Color.White, fontSize = 55.sp)
            Text("НАЖМИТЕ, ЧТОБЫ ОТКРЫТЬ", color = Color.White.copy(.82f), fontSize = 11.sp, letterSpacing = 1.2.sp, fontWeight = FontWeight.Black)
        }
    }
    Spacer(Modifier.height(15.dp))
    PrimaryButton("Показать карточку", onReveal, Modifier.fillMaxWidth(), icon = "👁")
}

@Composable
private fun SecretRevealCard(player: Int, value: String, note: String, onNext: () -> Unit) {
    var entered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entered = true }
    val rotation by animateFloatAsState(if (entered) 0f else 90f, tween(680), label = "secretFlip")
    StatusPill("Игрок $player", Indigo)
    Spacer(Modifier.height(15.dp))
    GlassCard(
        Modifier.fillMaxWidth(.88f).aspectRatio(5f / 7f).graphicsLayer { rotationY = rotation; cameraDistance = 18f * density },
        padding = 22.dp,
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("ВАША КАРТОЧКА", color = Indigo, fontSize = 12.sp, letterSpacing = 1.6.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(18.dp))
                Text(value, color = Ink, fontSize = if (value.length > 16) 29.sp else 38.sp, lineHeight = 42.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                Spacer(Modifier.height(18.dp))
                Text(note, color = InkSoft, fontSize = 14.sp, lineHeight = 20.sp, textAlign = TextAlign.Center)
            }
        }
    }
    Spacer(Modifier.height(16.dp))
    PrimaryButton("Передать следующему", onNext, Modifier.fillMaxWidth(), icon = "→")
}

@Composable
private fun SecretFinish(message: String, onAgain: () -> Unit) {
    Text("🎉", fontSize = 62.sp)
    Spacer(Modifier.height(8.dp))
    Text("Карточки розданы", color = Ink, fontSize = 27.sp, fontWeight = FontWeight.Black)
    Spacer(Modifier.height(10.dp))
    GlassCard(Modifier.fillMaxWidth()) { Text(message, Modifier.fillMaxWidth(), color = InkSoft, textAlign = TextAlign.Center, fontSize = 16.sp) }
    Spacer(Modifier.height(15.dp))
    PrimaryButton("Новый раунд", onAgain, Modifier.fillMaxWidth(), icon = "↻")
}
