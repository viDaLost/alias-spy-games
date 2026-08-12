package com.vidalost.biblegames.games

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.model.PlayerProfile
import com.vidalost.biblegames.ui.ConfettiOverlay
import com.vidalost.biblegames.ui.Danger
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

private const val MAX_SACRED_ERRORS = 7

@Composable
fun SacredWordGame(assets: AssetRepository, profile: PlayerProfile, onProfileChange: (PlayerProfile) -> Unit, onBack: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val prefs = remember { context.getSharedPreferences("bible_games_native", 0) }
    val levels = remember { assets.sacredLevels() }
    val userKey = profile.id.ifBlank { "anon" }
    val storedLevel = if (prefs.contains("sacred_${userKey}_level")) prefs.getInt("sacred_${userKey}_level", 0) else profile.sacredLevel
    var levelIndex by rememberSaveable(userKey) { mutableIntStateOf(storedLevel.coerceIn(0, (levels.size - 1).coerceAtLeast(0))) }
    val level = levels.getOrNull(levelIndex)
    val used = remember(userKey) {
        mutableStateListOf<Char>().apply { addAll(prefs.getString("sacred_${userKey}_used", "").orEmpty().toList()) }
    }
    var errors by rememberSaveable(userKey) { mutableIntStateOf(prefs.getInt("sacred_${userKey}_errors", 0).coerceIn(0, MAX_SACRED_ERRORS)) }
    val sacredWord = level?.word.orEmpty()
    val won = sacredWord.filter(Char::isLetter).all { it in used }
    val lost = errors >= MAX_SACRED_ERRORS
    val finished = won || lost
    val haptic = LocalHapticFeedback.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var glView by remember { mutableStateOf<MenorahGLView?>(null) }
    var levelsOpen by remember { mutableStateOf(false) }

    DisposableEffect(lifecycleOwner, glView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> glView?.onResume()
                Lifecycle.Event.ON_PAUSE -> glView?.onPause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            glView?.onPause()
        }
    }

    fun guess(raw: Char) {
        if (finished) return
        val char = raw.uppercaseChar()
        if (char in used) return
        used += char
        if (char !in sacredWord) {
            errors++
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        } else haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        prefs.edit().putString("sacred_${userKey}_used", used.joinToString("")).putInt("sacred_${userKey}_errors", errors).apply()
    }

    fun createRound(target: Int) {
        levelIndex = ((target % levels.size) + levels.size) % levels.size
        used.clear(); errors = 0; levelsOpen = false
        prefs.edit()
            .putInt("sacred_${userKey}_level", levelIndex)
            .putString("sacred_${userKey}_used", "")
            .putInt("sacred_${userKey}_errors", 0)
            .apply()
        onProfileChange(profile.copy(sacredLevel = levelIndex))
    }

    if (level == null) {
        GameScaffold("Священное слово", null, onBack) { Text("Нет уровней", color = Ink) }
        return
    }

    val stackedRound = LocalConfiguration.current.screenWidthDp < 370 || LocalDensity.current.fontScale > 1.15f

    GameScaffold("Священное слово", "Угадайте слово, пока горит светильник", onBack) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(
                Modifier.clip(RoundedCornerShape(50)).background(Color(0xFFE0E7FF))
                    .bounceClick { levelsOpen = true }.padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Text("Уровень ${levelIndex + 1} ▾", color = Color(0xFF312E81), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
            }
        }
        Spacer(Modifier.height(9.dp))
        GlassCard(Modifier.fillMaxWidth(), padding = 9.dp) {
            if (stackedRound) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    MenorahScene(errors, Modifier.fillMaxWidth().height(224.dp)) { glView = it }
                    SacredCluePanel(level.category, level.hint, level.word, used.toSet(), lost, errors)
                }
            } else {
                Row(Modifier.fillMaxWidth().height(224.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MenorahScene(errors, Modifier.weight(.43f).fillMaxHeight()) { glView = it }
                    SacredCluePanel(level.category, level.hint, level.word, used.toSet(), lost, errors, Modifier.weight(.57f))
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            when {
                won -> "Победа! Свет сохранён."
                lost -> "Светильник угас. Загаданное слово: ${level.word}."
                else -> "Открывай буквы и береги пламя меноры."
            },
            Modifier.fillMaxWidth(), color = when { won -> Success; lost -> Danger; else -> InkSoft }, textAlign = TextAlign.Center, fontSize = 13.sp, fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(7.dp))
        SacredKeyboard(used.toSet(), sacredWord, finished, ::guess)
        Spacer(Modifier.height(10.dp))
        if (won) PrimaryButton("Следующий уровень", { createRound(levelIndex + 1) }, Modifier.fillMaxWidth(), icon = "→", colors = listOf(Indigo, Color(0xFF3B82F6)))
        else SecondaryButton("Сбросить уровень", { createRound(levelIndex) }, Modifier.fillMaxWidth(), icon = "↻")
        ConfettiOverlay(won, Modifier.fillMaxWidth().height(86.dp))
    }

    if (levelsOpen) Dialog(onDismissRequest = { levelsOpen = false }) {
        GlassCard(Modifier.fillMaxWidth().height(500.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Выберите уровень", color = Ink, fontSize = 23.sp, fontWeight = FontWeight.Black)
                SecondaryButton("×", { levelsOpen = false }, Modifier.size(42.dp))
            }
            Spacer(Modifier.height(10.dp))
            LazyColumn(Modifier.fillMaxWidth().weight(1f)) {
                items(levels.indices.toList()) { index ->
                    Row(
                        Modifier.fillMaxWidth().padding(bottom = 7.dp).clip(RoundedCornerShape(15.dp))
                            .background(if (index == levelIndex) Color(0xFFE0E7FF) else Color(0xFFF8FAFC))
                            .bounceClick { createRound(index) }.padding(13.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Уровень ${index + 1}", color = Ink, fontWeight = FontWeight.ExtraBold)
                        Text(levels[index].category, color = InkSoft, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun MenorahScene(errors: Int, modifier: Modifier, onView: (MenorahGLView) -> Unit) {
    Surface(
        modifier.clip(RoundedCornerShape(22.dp)),
        RoundedCornerShape(22.dp),
        color = Color(0xFF071329),
        shadowElevation = 10.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF26416D)),
    ) {
        Box(
            Modifier.fillMaxSize().background(
                Brush.radialGradient(
                    listOf(Color(0xFF1E293B), Color(0xFF0F172A), Color(0xFF020617)),
                ),
            ),
        ) {
            AndroidView(
                factory = { MenorahGLView(it).apply { setErrors(errors) }.also(onView) },
                update = { it.setErrors(errors) },
                modifier = Modifier.fillMaxSize(),
            )
            Row(Modifier.align(Alignment.TopCenter).padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                repeat(7) { index ->
                    val extinctOrder = listOf(0, 6, 1, 5, 2, 4, 3)
                    val alive = extinctOrder.indexOf(index) >= errors
                    Box(Modifier.size(6.dp).background(if (alive) Color(0xFFFFC247) else Color(0xFF475569), CircleShape))
                }
            }
        }
    }
}

@Composable
private fun SacredCluePanel(
    category: String,
    hint: String,
    word: String,
    used: Set<Char>,
    lost: Boolean,
    errors: Int,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(7.dp)) {
        StatusPill("Категория: $category", Modifier.fillMaxWidth(), Indigo)
        StatusPill("Угасание: $errors / $MAX_SACRED_ERRORS", Modifier.fillMaxWidth(), if (lost) Danger else Color(0xFF2563EB))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(Color(0xFFF8FAFC))
                .border(1.dp, Color(0xFFCBD5E1), RoundedCornerShape(13.dp)).padding(9.dp),
        ) {
            Text(hint.replace('_', ' '), color = Color(0xFF334155), fontSize = 11.sp, lineHeight = 15.sp, fontWeight = FontWeight.Medium)
        }
        Text("Скрытое слово", color = InkSoft, fontSize = 9.sp, fontWeight = FontWeight.Bold)
        SacredWordSlots(word, used, reveal = lost)
    }
}

@Composable
private fun SacredWordSlots(word: String, used: Set<Char>, reveal: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
        word.forEach { raw ->
            val char = raw
            if (raw == ' ') Spacer(Modifier.weight(.45f))
            else if (raw == '-') {
                Box(Modifier.padding(horizontal = 1.dp).weight(.6f).height(36.dp), contentAlignment = Alignment.Center) { Text("–", color = Ink, fontWeight = FontWeight.Black) }
            }
            else {
                val visible = char in used || reveal
                Box(
                    Modifier.padding(horizontal = 1.dp).weight(1f).height(38.dp)
                        .clip(RoundedCornerShape(9.dp)).background(if (visible) Color(0xFFEEF2FF) else Color(0xFFF8FAFC))
                        .border(1.dp, if (visible) Indigo.copy(.28f) else Color(0xFFCBD5E1), RoundedCornerShape(9.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    AnimatedContent(if (visible) raw.toString() else "_", label = "letterReveal") { value ->
                        Text(value, color = if (reveal && char !in used) Danger else Ink, fontSize = if (word.length > 10) 14.sp else 18.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }
    }
}

@Composable
private fun SacredKeyboard(used: Set<Char>, word: String, finished: Boolean, onLetter: (Char) -> Unit) {
    val rows = listOf("ЙЦУКЕНГШЩЗХЪ", "ФЫВАПРОЛДЖЭ", "ЯЧСМИТЬБЮЁ")
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        rows.forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                row.forEach { char ->
                    val wasUsed = char in used
                    val color = when {
                        !wasUsed -> Color.White
                        char in word -> Color(0xFFDCFCE7)
                        else -> Color(0xFFFEE2E2)
                    }
                    Box(
                        Modifier.weight(1f).height(39.dp).clip(RoundedCornerShape(9.dp)).background(color)
                        .border(1.dp, when { !wasUsed -> Color(0xFFD7DEEB); char in word -> Color(0xFF86EFAC); else -> Color(0xFFFCA5A5) }, RoundedCornerShape(9.dp))
                            .bounceClick(enabled = !wasUsed && !finished) { onLetter(char) },
                        contentAlignment = Alignment.Center,
                    ) { Text(char.toString(), color = if (wasUsed) InkSoft else Ink, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold) }
                }
            }
        }
    }
}
