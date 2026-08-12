package com.vidalost.biblegames.games

import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.vidalost.biblegames.ui.ConfettiOverlay
import com.vidalost.biblegames.ui.GameScaffold
import com.vidalost.biblegames.ui.GlassCard
import com.vidalost.biblegames.ui.Indigo
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.PrimaryButton
import com.vidalost.biblegames.ui.SecondaryButton
import com.vidalost.biblegames.ui.StatusPill
import com.vidalost.biblegames.ui.Success
import com.vidalost.biblegames.ui.bounceClick
import kotlinx.coroutines.delay
import java.util.Locale

private enum class MemoryDifficulty(val label: String, val size: Int, val pairs: Int) {
    EASY("Лёгкий", 4, 8), MEDIUM("Средний", 5, 12), HARD("Тяжёлый", 6, 18)
}

private data class MemoryCard(val id: Int, val emoji: String, val bonus: Boolean = false)

@Composable
fun MemoryGame(onBack: () -> Unit) {
    var difficulty by rememberSaveable { mutableStateOf<MemoryDifficulty?>(null) }
    var speedMode by rememberSaveable { mutableStateOf(false) }
    if (difficulty == null) MemoryMenu(speedMode, { speedMode = it }, { difficulty = it }, onBack)
    else MemoryBoard(difficulty!!, speedMode, onExit = onBack)
}

@Composable
private fun MemoryMenu(speed: Boolean, setSpeed: (Boolean) -> Unit, choose: (MemoryDifficulty) -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    var recordsShown by remember { mutableStateOf(false) }
    GameScaffold("Найди пару", "Животные Ноева ковчега", onBack) {
        Text("🛳️", fontSize = 58.sp)
        Text("Открой две карточки", color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Black)
        Text("Если животные одинаковые — пара найдена!", color = InkSoft, textAlign = TextAlign.Center)
        Spacer(Modifier.height(15.dp))
        GlassCard(Modifier.fillMaxWidth(), padding = 14.dp) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("На скорость", color = Ink, fontWeight = FontWeight.ExtraBold)
                    Text("Таймер и лучшие результаты", color = InkSoft, fontSize = 12.sp)
                }
                Switch(speed, setSpeed, colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = Indigo))
            }
        }
        Spacer(Modifier.height(12.dp))
        MemoryDifficulty.entries.forEach { diff ->
            val best = context.getSharedPreferences("memory_records", 0)
                .getString(diff.name, "").orEmpty().split(',').mapNotNull(String::toLongOrNull).minOrNull()
            val colors = when (diff) {
                MemoryDifficulty.EASY -> listOf(Color(0xFF16A34A), Color(0xFF22C55E))
                MemoryDifficulty.MEDIUM -> listOf(Color(0xFFF59E0B), Color(0xFFF97316))
                MemoryDifficulty.HARD -> listOf(Color(0xFF7C3AED), Color(0xFF4F46E5))
            }
            PrimaryButton("${diff.label} · ${diff.size}×${diff.size} · ${best?.let(::formatTime) ?: "—"}", { choose(diff) }, Modifier.fillMaxWidth().padding(bottom = 10.dp), icon = when (diff) { MemoryDifficulty.EASY -> "🌱"; MemoryDifficulty.MEDIUM -> "🌿"; MemoryDifficulty.HARD -> "🌳" }, colors = colors)
        }
        SecondaryButton("Лучшие результаты", { recordsShown = true }, Modifier.fillMaxWidth(), icon = "🏆")
        if (recordsShown) {
            Spacer(Modifier.height(12.dp))
            GlassCard(Modifier.fillMaxWidth()) {
                Text("Лучшие результаты", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black)
                MemoryDifficulty.entries.forEach { diff ->
                    val values = context.getSharedPreferences("memory_records", 0).getString(diff.name, "").orEmpty().split(',').mapNotNull(String::toLongOrNull)
                    Spacer(Modifier.height(9.dp))
                    Text(diff.label, color = Indigo, fontWeight = FontWeight.ExtraBold)
                    Text(if (values.isEmpty()) "Пока нет результатов" else values.mapIndexed { i, ms -> "${i + 1}. ${formatTime(ms)}" }.joinToString("   "), color = InkSoft, fontSize = 13.sp)
                }
            }
        }
    }
}

@Composable
private fun MemoryBoard(diff: MemoryDifficulty, speed: Boolean, onExit: () -> Unit) {
    val context = LocalContext.current
    val animals = remember {
        listOf(
            "🦁", "🐯", "🐻", "🐼", "🦊", "🐶", "🐱", "🐭",
            "🐹", "🐰", "🦝", "🦓", "🦒", "🐘", "🦏", "🐪",
            "🐴", "🐮", "🐷", "🐸", "🐵", "🦍", "🐔", "🐧",
            "🐦", "🦉", "🦆", "🦅", "🐝", "🦋", "🐢", "🐬",
            "🐳", "🦈", "🐙", "🦀", "🦞", "🐍", "🦎", "🐊",
            "🦜", "🦚", "🦢", "🦛", "🐟", "🦑", "🦔", "🦘",
        )
    }
    var deckKey by remember { mutableIntStateOf(0) }
    val deck = remember(diff, deckKey) {
        val pairs = animals.shuffled().take(diff.pairs).flatMapIndexed { i, emoji -> listOf(MemoryCard(i * 2, emoji), MemoryCard(i * 2 + 1, emoji)) }.toMutableList()
        if (diff == MemoryDifficulty.MEDIUM) pairs += MemoryCard(999, "🕊️", bonus = true)
        pairs.shuffled()
    }
    val open = remember(diff, deckKey) { mutableStateListOf<Int>() }
    val matched = remember(diff, deckKey) { mutableStateListOf<Int>() }
    var locked by remember { mutableStateOf(false) }
    var mismatchToken by remember { mutableIntStateOf(0) }
    var startTime by remember { mutableLongStateOf(0L) }
    var elapsed by remember { mutableLongStateOf(0L) }
    var finished by remember { mutableStateOf(false) }
    var newRecord by remember { mutableStateOf(false) }
    var bestTime by remember { mutableLongStateOf(0L) }

    LaunchedEffect(speed, startTime, finished) {
        while (speed && startTime > 0 && !finished) {
            elapsed = SystemClock.elapsedRealtime() - startTime
            delay(50)
        }
    }

    fun saveRecord(time: Long): Boolean {
        if (!speed) return false
        val prefs = context.getSharedPreferences("memory_records", 0)
        val old = prefs.getString(diff.name, "").orEmpty().split(',').mapNotNull(String::toLongOrNull)
        val updated = (old + time).sorted().take(3)
        prefs.edit().putString(diff.name, updated.joinToString(",")).apply()
        bestTime = updated.firstOrNull() ?: time
        return updated.firstOrNull() == time
    }

    fun restart() {
        deckKey++; startTime = 0; elapsed = 0; finished = false; newRecord = false; bestTime = 0; locked = false
    }

    fun flip(index: Int) {
        if (locked || index in open || index in matched) return
        if (speed && startTime == 0L) startTime = SystemClock.elapsedRealtime()
        val card = deck[index]
        if (card.bonus) {
            matched += index
            if (matched.size == deck.size) {
                elapsed = if (startTime > 0) SystemClock.elapsedRealtime() - startTime else 0
                newRecord = saveRecord(elapsed); finished = true
            }
            return
        }
        open += index
    }

    LaunchedEffect(open.toList()) {
        if (open.size != 2) return@LaunchedEffect
        locked = true
        val first = open[0]
        val second = open[1]
        if (deck[first].emoji == deck[second].emoji) {
            delay(220)
            matched += listOf(first, second)
            open.clear()
            locked = false
            if (matched.size == deck.size) {
                elapsed = if (startTime > 0) SystemClock.elapsedRealtime() - startTime else 0
                newRecord = saveRecord(elapsed); finished = true
            }
        } else {
            // The web game starts the shake immediately and turns both cards
            // back after 650 ms.  Keep those two animations concurrent rather
            // than delaying the shake until just before the cards close.
            mismatchToken++
            delay(650)
            open.clear()
            locked = false
        }
    }

    GameScaffold(
        "Найди пару",
        "${diff.label} · ${diff.size}×${diff.size}",
        onBack = onExit,
        scroll = false,
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
            StatusPill("${matched.count { !deck[it].bonus } / 2} / ${diff.pairs} пар", Modifier.weight(1f), Success, "✓")
            if (speed) StatusPill(formatTime(elapsed), Modifier.weight(1f), Indigo, "⏱")
            else StatusPill("Запоминайте", Modifier.weight(1f), Indigo, "◉")
        }
        Spacer(Modifier.height(7.dp))
        SecondaryButton("Заново", ::restart, Modifier.fillMaxWidth(), icon = "↻")
        Spacer(Modifier.height(9.dp))
        LazyVerticalGrid(
            columns = GridCells.Fixed(diff.size),
            modifier = Modifier.fillMaxWidth().weight(1f),
            horizontalArrangement = Arrangement.spacedBy(if (diff.size == 6) 5.dp else 7.dp),
            verticalArrangement = Arrangement.spacedBy(if (diff.size == 6) 5.dp else 7.dp),
            userScrollEnabled = false,
        ) {
            items(deck.indices.toList(), key = { deck[it].id }) { index ->
                MemoryTile(
                    card = deck[index],
                    faceUp = index in open || index in matched,
                    matched = index in matched,
                    mismatchToken = if (index in open && open.size == 2 && deck[open[0]].emoji != deck[open[1]].emoji) mismatchToken else 0,
                    compact = diff.size == 6,
                    onClick = { flip(index) },
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(if (diff == MemoryDifficulty.MEDIUM) "Найдите все пары и откройте голубя 🕊️" else "Откройте все пары животных", Modifier.fillMaxWidth(), color = InkSoft, fontSize = 12.sp, textAlign = TextAlign.Center)

        if (finished) {
            Dialog(
                onDismissRequest = onExit,
                properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
            ) {
                Box(Modifier.fillMaxSize().background(Color(0x660F172A)).padding(18.dp), contentAlignment = Alignment.Center) {
                    GlassCard(Modifier.fillMaxWidth(), padding = 22.dp) {
                        Text(if (newRecord) "🏆 Новый рекорд!" else "🎉 Все пары найдены!", Modifier.fillMaxWidth(), color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                        if (speed) {
                            Spacer(Modifier.height(7.dp))
                            Text(
                                if (newRecord) "Время: ${formatTime(elapsed)}" else "Время: ${formatTime(elapsed)} · Рекорд: ${formatTime(bestTime)}",
                                Modifier.fillMaxWidth(), color = Indigo, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center,
                            )
                        }
                        Spacer(Modifier.height(16.dp))
                        PrimaryButton("Играть ещё", ::restart, Modifier.fillMaxWidth(), icon = "↻")
                        Spacer(Modifier.height(9.dp))
                        SecondaryButton("В меню", onExit, Modifier.fillMaxWidth())
                    }
                    ConfettiOverlay(true, Modifier.fillMaxSize())
                }
            }
        }
    }
}

@Composable
private fun MemoryTile(card: MemoryCard, faceUp: Boolean, matched: Boolean, mismatchToken: Int, compact: Boolean, onClick: () -> Unit) {
    val rotation by animateFloatAsState(if (faceUp) 180f else 0f, tween(400), label = "memoryFlip")
    val showFront = rotation > 90f
    val shake = remember { Animatable(0f) }
    LaunchedEffect(mismatchToken) {
        if (mismatchToken > 0) shake.animateTo(0f, keyframes {
            durationMillis = 260
            0f at 0; -9f at 45; 8f at 90; -7f at 135; 5f at 185; 0f at 260
        })
    }
    Box(
        Modifier.aspectRatio(1f).graphicsLayer {
            rotationY = if (showFront) rotation - 180f else rotation
            cameraDistance = 20f * density
            translationX = shake.value
            scaleX = if (matched) 1.035f else 1f
            scaleY = if (matched) 1.035f else 1f
        }.clip(RoundedCornerShape(if (compact) 12.dp else 17.dp))
            .background(
                if (showFront) Brush.linearGradient(listOf(Color.White, if (matched) Color(0xFFDCFCE7) else Color(0xFFF1F6FF)))
                else Brush.linearGradient(listOf(Color(0xFF60A5FA), Color(0xFF4F46E5), Color(0xFF312E81)))
            )
            .border(if (matched) 2.dp else 1.dp, if (matched) Color(0xFF22C55E) else Color.White.copy(.55f), RoundedCornerShape(if (compact) 12.dp else 17.dp))
            .bounceClick(enabled = !matched, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (showFront) card.emoji else "🛳️", fontSize = if (compact) 25.sp else 34.sp)
        if (matched) Box(Modifier.align(Alignment.TopEnd).padding(4.dp).size(if (compact) 14.dp else 18.dp).background(Color(0xFF22C55E), CircleShape), contentAlignment = Alignment.Center) { Text("✓", color = Color.White, fontSize = if (compact) 8.sp else 10.sp, fontWeight = FontWeight.Black) }
    }
}

private fun formatTime(ms: Long): String = String.format(Locale.US, "%.2fс", ms / 1000.0)
