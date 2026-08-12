package com.vidalost.biblegames.games

import android.graphics.Paint
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.model.PlayerProfile
import com.vidalost.biblegames.model.WowLevel
import com.vidalost.biblegames.ui.GameScaffold
import com.vidalost.biblegames.ui.GlassCard
import com.vidalost.biblegames.ui.Gold
import com.vidalost.biblegames.ui.Indigo
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.PrimaryButton
import com.vidalost.biblegames.ui.SecondaryButton
import com.vidalost.biblegames.ui.StatusPill
import com.vidalost.biblegames.ui.Success
import com.vidalost.biblegames.ui.bounceClick
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

private data class WowCell(val row: Int, val col: Int)
private data class WowPlacement(val word: String, val row: Int, val col: Int, val dr: Int, val dc: Int) {
    fun cells(): List<WowCell> = word.indices.map { WowCell(row + dr * it, col + dc * it) }
}
private data class WowLayout(val placed: List<WowPlacement>, val notPlaced: List<String>)

@Composable
fun BibleWowGame(
    assets: AssetRepository,
    profile: PlayerProfile,
    onProfileChange: (PlayerProfile) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("bible_games_native", 0) }
    val levels = remember { assets.wowLevels() }
    val userKey = profile.id.ifBlank { "anon" }
    val levelPref = "wow_${userKey}_level"
    var levelIndex by rememberSaveable(userKey) {
        mutableIntStateOf(prefs.getInt(levelPref, 0).coerceIn(0, levels.lastIndex))
    }
    var coins by rememberSaveable(userKey) { mutableIntStateOf(profile.wowStars) }
    val completed = remember(userKey) {
        mutableStateListOf<Int>().apply {
            addAll(prefs.getStringSet("wow_${userKey}_completed", emptySet()).orEmpty().mapNotNull(String::toIntOrNull))
        }
    }
    val level = levels[levelIndex]
    val layout = remember(level.id) { generateWowLayout(level.words.map(::normaliseWow)) }
    val targetWords = remember(layout) { layout.placed.map { it.word } }
    val allowedBonus = remember(level.id, layout) {
        (level.bonus.map(::normaliseWow) + layout.notPlaced)
            .filter { it.length >= 3 && it !in targetWords }.toSet()
    }
    fun setKey(kind: String) = "wow_${userKey}_${kind}_${level.id}"
    val found = remember(level.id) {
        mutableStateListOf<String>().apply {
            val saved = prefs.getStringSet(setKey("found"), emptySet()).orEmpty().map(::normaliseWow)
            addAll(if (level.id in completed) targetWords else saved.filter { it in targetWords })
        }
    }
    val hinted = remember(level.id) {
        mutableStateListOf<String>().apply { addAll(prefs.getStringSet(setKey("hints"), emptySet()).orEmpty()) }
    }
    val bonusFound = remember(level.id) {
        mutableStateListOf<String>().apply {
            addAll(prefs.getStringSet(setKey("bonus"), emptySet()).orEmpty().map(::normaliseWow).filter { it in allowedBonus })
        }
    }
    var wheelLetters by remember(level.id) { mutableStateOf(level.letters.map(Char::uppercaseChar)) }
    var selectedIndices by remember(level.id) { mutableStateOf(emptyList<Int>()) }
    var wrongPulse by remember { mutableIntStateOf(0) }
    var zoom by rememberSaveable { mutableFloatStateOf(1f) }
    var message by remember { mutableStateOf("") }
    var messageToken by remember { mutableIntStateOf(0) }
    var levelsOpen by remember { mutableStateOf(false) }
    var bonusOpen by remember { mutableStateOf(false) }
    var autoAdvanceToken by remember { mutableIntStateOf(0) }
    val haptic = LocalHapticFeedback.current

    fun persistSet(kind: String, value: Collection<String>) {
        prefs.edit().putStringSet(setKey(kind), value.toSet()).apply()
    }
    fun persistCompleted() {
        prefs.edit().putStringSet("wow_${userKey}_completed", completed.map(Int::toString).toSet()).apply()
    }
    fun updateCoins(next: Int) {
        coins = next.coerceAtLeast(0)
        onProfileChange(profile.copy(wowStars = coins))
    }
    fun showMessage(value: String) {
        message = value
        messageToken++
    }
    fun selectLevel(index: Int) {
        levelIndex = index.coerceIn(0, levels.lastIndex)
        prefs.edit().putInt(levelPref, levelIndex).apply()
        levelsOpen = false
    }
    fun submit(raw: String) {
        val word = normaliseWow(raw)
        selectedIndices = emptyList()
        if (word.length < 3) return
        when {
            word in targetWords -> {
                if (word in found) {
                    showMessage("Уже найдено!")
                    return
                }
                found += word
                persistSet("found", found)
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                val completedNow = targetWords.all(found::contains)
                if (completedNow) {
                    if (level.id !in completed) {
                        completed += level.id
                        persistCompleted()
                        updateCoins(coins + 10)
                        showMessage("Уровень пройден! +10⭐")
                    } else showMessage("Уровень пройден!")
                    autoAdvanceToken++
                } else showMessage("Отлично!")
            }
            word in allowedBonus -> {
                if (word in bonusFound) {
                    showMessage("Уже в бонусах")
                    return
                }
                bonusFound += word
                persistSet("bonus", bonusFound)
                updateCoins(coins + 2)
                showMessage("Бонус! +2⭐")
            }
            else -> {
                wrongPulse++
                showMessage("Нет такого слова")
            }
        }
    }
    fun giveHint() {
        if (coins < 6) return showMessage("Нужно 6⭐")
        val candidates = layout.placed.filter { it.word !in found }.flatMap { placement ->
            placement.cells().mapIndexedNotNull { index, cell ->
                val key = "${cell.row},${cell.col}"
                if (key in hinted) null else key to placement.word[index]
            }
        }
        if (candidates.isEmpty()) return showMessage(if (targetWords.all(found::contains)) "Всё найдено" else "Нет букв для подсказки")
        val picked = candidates.random()
        hinted += picked.first
        persistSet("hints", hinted)
        updateCoins(coins - 6)
        showMessage("💡 Открыта буква: ${picked.second}")
    }
    fun revealWord() {
        if (coins < 20) return showMessage("Нужно 20⭐")
        val remaining = targetWords.filterNot(found::contains)
        if (remaining.isEmpty()) return showMessage("Всё найдено")
        val word = remaining.random()
        found += word
        layout.placed.firstOrNull { it.word == word }?.cells()?.forEach { hinted.remove("${it.row},${it.col}") }
        persistSet("found", found)
        persistSet("hints", hinted)
        updateCoins(coins - 20)
        showMessage("👁 Открыто: $word")
    }
    fun resetLevel() {
        var earned = bonusFound.size * 2
        if (level.id in completed) {
            earned += 10
            completed.remove(level.id)
            persistCompleted()
        }
        updateCoins(coins - earned)
        found.clear(); hinted.clear(); bonusFound.clear()
        persistSet("found", found); persistSet("hints", hinted); persistSet("bonus", bonusFound)
        showMessage("Уровень сброшен")
    }

    LaunchedEffect(profile.wowStars) {
        if (profile.wowStars != coins) coins = profile.wowStars
    }
    LaunchedEffect(messageToken) {
        if (messageToken > 0) {
            val token = messageToken
            delay(1_400)
            if (messageToken == token) message = ""
        }
    }
    LaunchedEffect(autoAdvanceToken) {
        if (autoAdvanceToken > 0 && levelIndex < levels.lastIndex) {
            delay(450)
            selectLevel(levelIndex + 1)
        }
    }

    GameScaffold("Библейские слова", "Собирайте слова из букв", onBack, scroll = false) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            SecondaryButton("Уровни", { levelsOpen = true }, Modifier.weight(1f), icon = "▦")
            StatusPill("⭐ $coins", Modifier.weight(.72f), Gold)
            SecondaryButton("Бонус: ${bonusFound.size}", { bonusOpen = true }, Modifier.weight(1f), icon = "★")
        }
        Spacer(Modifier.height(7.dp))
        GlassCard(Modifier.fillMaxWidth().weight(.78f), padding = 8.dp) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                SecondaryButton("−", { zoom = (zoom - .1f).coerceAtLeast(.6f) }, Modifier.size(38.dp), enabled = zoom > .6f)
                Text(
                    "Кроссворд · ${targetWords.count(found::contains)}/${targetWords.size}",
                    Modifier.weight(1f).padding(horizontal = 6.dp),
                    color = Ink,
                    fontSize = 13.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                SecondaryButton("+", { zoom = (zoom + .1f).coerceAtMost(2.2f) }, Modifier.size(38.dp), enabled = zoom < 2.2f)
            }
            WowCrossword(layout, found, hinted, zoom, Modifier.fillMaxWidth().weight(1f))
        }
        AnimatedVisibility(message.isNotBlank(), enter = fadeIn() + scaleIn(initialScale = .9f), exit = fadeOut() + scaleOut(targetScale = .94f)) {
            Text(message, Modifier.fillMaxWidth().height(25.dp), color = Indigo, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
        }
        if (message.isBlank()) Spacer(Modifier.height(25.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            SecondaryButton("◀", { selectLevel(levelIndex - 1) }, Modifier.size(42.dp), enabled = levelIndex > 0)
            Text("Уровень ${level.id}", color = Ink, fontWeight = FontWeight.Black)
            SecondaryButton("▶", { selectLevel(levelIndex + 1) }, Modifier.size(42.dp), enabled = levelIndex < levels.lastIndex)
        }
        val currentWord = selectedIndices.joinToString("") { wheelLetters.getOrNull(it)?.toString().orEmpty() }
        Spacer(Modifier.height(5.dp))
        BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
            // aspectRatio + weight made the canvas insist on the full screen
            // width even when the remaining height was smaller.  That pushed
            // it under both the level caption and the hint controls.  Size the
            // wheel from both axes and reserve the controls' height explicitly.
            val preferredWheel = if (maxWidth < 400.dp) 238.dp else 300.dp
            val heightBound = (maxHeight - 94.dp).coerceAtLeast(120.dp)
            val wheelSize = minOf(preferredWheel, maxWidth * .74f, heightBound)
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                AnimatedContent(currentWord, label = "wowPreview") { preview ->
                    Text(
                        preview,
                        Modifier.fillMaxWidth().height(28.dp),
                        color = Indigo,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                    )
                }
                Spacer(Modifier.height(4.dp))
                LetterWheel(
                    letters = wheelLetters,
                    selected = selectedIndices,
                    wrongPulse = wrongPulse,
                    onSelection = { selectedIndices = it },
                    onSubmit = ::submit,
                    modifier = Modifier.size(wheelSize),
                )
                Spacer(Modifier.weight(1f))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    SecondaryButton("Микс", { wheelLetters = wheelLetters.shuffled() }, Modifier.weight(1f), icon = "⟳")
                    SecondaryButton("6⭐", ::giveHint, Modifier.weight(1f), enabled = coins >= 6, icon = "💡")
                    SecondaryButton("20⭐", ::revealWord, Modifier.weight(1f), enabled = coins >= 20, icon = "👁")
                    SecondaryButton("Сброс", ::resetLevel, Modifier.weight(1f), icon = "↺")
                }
            }
        }
    }

    if (levelsOpen) WowLevelsDialog(levels, levelIndex, completed, onSelect = ::selectLevel, onClose = { levelsOpen = false })
    if (bonusOpen) WowBonusDialog(bonusFound, onClose = { bonusOpen = false })
}

@Composable
private fun WowCrossword(layout: WowLayout, found: List<String>, hinted: List<String>, zoom: Float, modifier: Modifier) {
    val cells = remember(layout, found.toList()) {
        linkedMapOf<WowCell, Pair<Char, Boolean>>().apply {
            layout.placed.forEach { placement ->
                placement.cells().forEachIndexed { index, cell ->
                    val previous = get(cell)
                    put(cell, placement.word[index] to ((previous?.second == true) || placement.word in found))
                }
            }
        }
    }
    val pulse = rememberInfiniteTransition(label = "wowHintPulse")
    val hintAlpha by pulse.animateFloat(.55f, 1f, infiniteRepeatable(tween(760), repeatMode = androidx.compose.animation.core.RepeatMode.Reverse), label = "wowHintAlpha")
    Canvas(modifier.clip(RoundedCornerShape(18.dp)).background(Brush.linearGradient(listOf(Color(0xFFF8FBFF), Color(0xFFEEF2FF))))) {
        if (cells.isEmpty()) return@Canvas
        val minR = cells.keys.minOf { it.row }; val maxR = cells.keys.maxOf { it.row }
        val minC = cells.keys.minOf { it.col }; val maxC = cells.keys.maxOf { it.col }
        val rows = maxR - minR + 1; val cols = maxC - minC + 1
        val fitted = minOf(size.width / cols, size.height / rows)
        val cellSize = fitted * zoom
        val origin = Offset((size.width - cols * cellSize) / 2f, (size.height - rows * cellSize) / 2f)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; typeface = android.graphics.Typeface.DEFAULT_BOLD; textSize = cellSize * .56f }
        cells.forEach { (cell, data) ->
            val left = origin.x + (cell.col - minC) * cellSize
            val top = origin.y + (cell.row - minR) * cellSize
            val key = "${cell.row},${cell.col}"
            val solved = data.second
            val isHint = key in hinted && !solved
            drawRoundRect(
                color = when { solved -> Color(0xFFDCFCE7); isHint -> Gold.copy(hintAlpha * .38f); else -> Color.White },
                topLeft = Offset(left + 1.5f, top + 1.5f),
                size = Size(cellSize - 3f, cellSize - 3f),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(cellSize * .14f),
            )
            drawRoundRect(Color(0x224F46E5), Offset(left + 1.5f, top + 1.5f), Size(cellSize - 3f, cellSize - 3f), androidx.compose.ui.geometry.CornerRadius(cellSize * .14f), style = Stroke(width = 1.5f))
            if (solved || isHint) {
                paint.color = (if (solved) Color(0xFF15803D) else Indigo).toArgb()
                drawContext.canvas.nativeCanvas.drawText(data.first.toString(), left + cellSize / 2, top + cellSize / 2 - (paint.ascent() + paint.descent()) / 2, paint)
            }
        }
    }
}

@Composable
private fun LetterWheel(
    letters: List<Char>,
    selected: List<Int>,
    wrongPulse: Int,
    onSelection: (List<Int>) -> Unit,
    onSubmit: (String) -> Unit,
    modifier: Modifier,
) {
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    val shake = remember { Animatable(0f) }
    LaunchedEffect(wrongPulse) {
        if (wrongPulse > 0) {
            shake.snapTo(-9f); shake.animateTo(8f, tween(70)); shake.animateTo(-6f, tween(65)); shake.animateTo(0f, tween(85))
        }
    }
    fun centers(): List<Offset> {
        val center = Offset(canvasSize.width / 2f, canvasSize.height / 2f)
        val radius = minOf(canvasSize.width, canvasSize.height) * .34f
        return letters.indices.map { index ->
            val angle = -PI / 2 + index * 2 * PI / letters.size
            Offset(center.x + cos(angle).toFloat() * radius, center.y + sin(angle).toFloat() * radius)
        }
    }
    fun hit(offset: Offset): Int? {
        val nodes = centers()
        val radius = minOf(canvasSize.width, canvasSize.height) * .105f
        return nodes.indices.minByOrNull { (nodes[it] - offset).getDistance() }?.takeIf { (nodes[it] - offset).getDistance() <= radius }
    }
    val haptic = LocalHapticFeedback.current
    Canvas(
        modifier.graphicsLayer { translationX = shake.value }.onSizeChanged { canvasSize = it }
            .pointerInput(letters, canvasSize) {
                var gesture = emptyList<Int>()
                detectDragGestures(
                    onDragStart = { position ->
                        gesture = hit(position)?.let(::listOf).orEmpty(); onSelection(gesture)
                        if (gesture.isNotEmpty()) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    },
                    onDrag = { change, _ ->
                        hit(change.position)?.let { index ->
                            if (index !in gesture) {
                                gesture += index; onSelection(gesture)
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            }
                        }
                    },
                    onDragEnd = { onSubmit(gesture.joinToString("") { letters[it].toString() }); gesture = emptyList() },
                    onDragCancel = { gesture = emptyList(); onSelection(emptyList()) },
                )
            },
    ) {
        val center = Offset(size.width / 2, size.height / 2)
        val radius = size.minDimension * .48f
        drawCircle(Color.White.copy(.94f), radius, center)
        drawCircle(Color(0x224F46E5), radius, center, style = Stroke(3f))
        val nodes = letters.indices.map { index ->
            val angle = -PI / 2 + index * 2 * PI / letters.size
            Offset(center.x + cos(angle).toFloat() * size.minDimension * .34f, center.y + sin(angle).toFloat() * size.minDimension * .34f)
        }
        if (selected.size > 1) {
            val path = Path().apply { moveTo(nodes[selected.first()].x, nodes[selected.first()].y); selected.drop(1).forEach { lineTo(nodes[it].x, nodes[it].y) } }
            drawPath(path, Indigo.copy(.65f), style = Stroke(size.minDimension * .045f, cap = StrokeCap.Round))
        }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; typeface = android.graphics.Typeface.DEFAULT_BOLD }
        val nodeRadius = size.minDimension * .10f
        letters.forEachIndexed { index, char ->
            val active = index in selected
            drawCircle(if (active) Indigo else Color(0xFFF0F4FF), nodeRadius, nodes[index])
            drawCircle(if (active) Color.White.copy(.45f) else Color(0x334F46E5), nodeRadius, nodes[index], style = Stroke(3f))
            paint.color = (if (active) Color.White else Ink).toArgb(); paint.textSize = size.minDimension * .082f
            drawContext.canvas.nativeCanvas.drawText(char.toString(), nodes[index].x, nodes[index].y - (paint.ascent() + paint.descent()) / 2, paint)
        }
        drawCircle(Color(0xFFF8FAFF), size.minDimension * .12f, center)
        paint.color = Indigo.toArgb(); paint.textSize = size.minDimension * .078f
        drawContext.canvas.nativeCanvas.drawText("✦", center.x, center.y - (paint.ascent() + paint.descent()) / 2, paint)
    }
}

@Composable
private fun WowLevelsDialog(levels: List<WowLevel>, selected: Int, completed: List<Int>, onSelect: (Int) -> Unit, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose) {
        GlassCard(Modifier.fillMaxWidth().height(520.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Уровни", color = Ink, fontSize = 24.sp, fontWeight = FontWeight.Black)
                SecondaryButton("×", onClose, Modifier.size(42.dp))
            }
            Text("Нажмите, чтобы перейти", color = InkSoft, fontSize = 12.sp)
            Spacer(Modifier.height(10.dp))
            LazyColumn(Modifier.fillMaxWidth().weight(1f)) {
                itemsIndexed(levels) { index, level ->
                    val done = level.id in completed
                    Row(
                        Modifier.fillMaxWidth().padding(bottom = 7.dp).clip(RoundedCornerShape(16.dp))
                            .background(if (index == selected) Color(0xFFEEF2FF) else Color(0xFFF8FAFC))
                            .bounceClick { onSelect(index) }.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        StatusPill(if (done) "✓" else "•", if (done) Success else InkSoft)
                        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                            Text("Уровень ${index + 1}", color = Ink, fontWeight = FontWeight.ExtraBold)
                            if (done) Text("пройден", color = Success, fontSize = 11.sp)
                        }
                        Text("ID ${level.id}", color = InkSoft, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun WowBonusDialog(words: List<String>, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose) {
        GlassCard(Modifier.fillMaxWidth().height(430.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Бонусные слова уровня", Modifier.weight(1f), color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Black)
                SecondaryButton("×", onClose, Modifier.size(42.dp))
            }
            Text("За каждое слово +2⭐ один раз", color = InkSoft, fontSize = 12.sp)
            Spacer(Modifier.height(10.dp))
            if (words.isEmpty()) Text("Пока нет бонусных слов на этом уровне.", color = InkSoft)
            else LazyColumn { itemsIndexed(words.sorted()) { _, word ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    StatusPill("+2⭐", Gold); Text(word, Modifier.padding(start = 11.dp), color = Ink, fontWeight = FontWeight.Black)
                }
            } }
        }
    }
}

private fun normaliseWow(value: String): String = value.uppercase().replace('Ё', 'Е').filter { it in 'А'..'Я' }

private fun generateWowLayout(words: List<String>): WowLayout {
    val sorted = words.sortedByDescending(String::length)
    if (sorted.isEmpty()) return WowLayout(emptyList(), emptyList())
    val grid = Array(40) { arrayOfNulls<Char>(40) }
    val placed = mutableListOf<WowPlacement>()
    val random = Random(sorted.joinToString("|").hashCode())
    val first = sorted.first()
    val vertical = random.nextBoolean()
    val firstPlacement = WowPlacement(first, 20 - if (vertical) first.length / 2 else 0, 20 - if (vertical) 0 else first.length / 2, if (vertical) 1 else 0, if (vertical) 0 else 1)
    placeWow(grid, firstPlacement)
    placed += firstPlacement
    val remaining = sorted.drop(1).toMutableList()
    var changed = true
    while (changed && remaining.isNotEmpty()) {
        changed = false
        var index = 0
        while (index < remaining.size) {
            val word = remaining[index]
            var candidate: WowPlacement? = null
            loop@ for (wordIndex in word.indices) {
                for (previous in placed) {
                    for (placedIndex in previous.word.indices) {
                        if (previous.word[placedIndex] != word[wordIndex]) continue
                        val crossR = previous.row + previous.dr * placedIndex
                        val crossC = previous.col + previous.dc * placedIndex
                        val dr = if (previous.dr == 0) 1 else 0
                        val dc = if (previous.dc == 0) 1 else 0
                        val next = WowPlacement(word, crossR - dr * wordIndex, crossC - dc * wordIndex, dr, dc)
                        if (canPlaceWow(grid, next)) { candidate = next; break@loop }
                    }
                }
            }
            if (candidate != null) {
                placeWow(grid, candidate)
                placed += candidate
                remaining.removeAt(index)
                changed = true
            } else index++
        }
    }
    return WowLayout(placed, remaining)
}

private fun canPlaceWow(grid: Array<Array<Char?>>, value: WowPlacement): Boolean {
    val length = value.word.length
    if (value.row < 0 || value.col < 0 || value.row + value.dr * length > 40 || value.col + value.dc * length > 40) return false
    val headR = value.row - value.dr; val headC = value.col - value.dc
    if (headR in 0 until 40 && headC in 0 until 40 && grid[headR][headC] != null) return false
    val tailR = value.row + value.dr * length; val tailC = value.col + value.dc * length
    if (tailR in 0 until 40 && tailC in 0 until 40 && grid[tailR][tailC] != null) return false
    value.word.indices.forEach { index ->
        val row = value.row + value.dr * index; val col = value.col + value.dc * index
        val existing = grid[row][col]
        if (existing != null) {
            if (existing != value.word[index]) return false
        } else {
            val r1 = row + value.dc; val c1 = col + value.dr
            val r2 = row - value.dc; val c2 = col - value.dr
            if (r1 in 0 until 40 && c1 in 0 until 40 && grid[r1][c1] != null) return false
            if (r2 in 0 until 40 && c2 in 0 until 40 && grid[r2][c2] != null) return false
        }
    }
    return true
}

private fun placeWow(grid: Array<Array<Char?>>, value: WowPlacement) {
    value.word.indices.forEach { index -> grid[value.row + value.dr * index][value.col + value.dc * index] = value.word[index] }
}
