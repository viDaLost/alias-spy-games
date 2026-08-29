package com.vidalost.biblegames.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.model.GameKey
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private data class LoaderCopy(val eyebrow: String, val status: String, val status2: String)

private fun loaderCopy(game: GameKey): LoaderCopy = when (game) {
    GameKey.ALIAS -> LoaderCopy("Игра на скорость", "Перемешиваем слова…", "Запускаем таймер…")
    GameKey.COIMAGINARIUM -> LoaderCopy("Игра идей", "Зажигаем идеи…", "Готовим ассоциации…")
    GameKey.GUESS -> LoaderCopy("Игра вопросов", "Выбираем персонажа…", "Готовим подсказки…")
    GameKey.DESCRIBE -> LoaderCopy("Игра подсказок", "Готовим слова…", "Настраиваем подсказки…")
    GameKey.SPY -> LoaderCopy("Секретная игра", "Шифруем роли…", "Выбираем тайную локацию…")
    GameKey.QUARTET -> LoaderCopy("Карточная игра", "Тасуем колоду…", "Раздаём карты…")
    GameKey.SKETCH -> LoaderCopy("Рисуй и угадывай", "Готовим холст…", "Затачиваем карандаши…")
    GameKey.WOW -> LoaderCopy("Игра со словами", "Собираем буквы…", "Готовим уровень…")
    GameKey.WORD_SEARCH -> LoaderCopy("Найди скрытое", "Строим сетку…", "Прячем слова…")
    GameKey.SACRED -> LoaderCopy("Открой слово", "Зажигаем свет подсказок…", "Готовим загадку…")
    GameKey.PAIRS -> LoaderCopy("Игра на память", "Перемешиваем пары…", "Прячем карточки…")
    GameKey.MATCH_THREE -> LoaderCopy("Собирай сокровища", "Открываем сокровищницу…", "Расставляем драгоценности…")
}

@Composable
fun GameEntryLoader(game: GameKey, assets: AssetRepository) {
    val copy = remember(game) { loaderCopy(game) }
    var status by remember(game) { mutableStateOf(copy.status) }
    LaunchedEffect(game) {
        delay(2_200)
        status = copy.status2
    }

    val transition = rememberInfiniteTransition(label = "gameEntry")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(2_700, easing = LinearEasing)),
        label = "entryRing",
    )
    val pulse by transition.animateFloat(
        initialValue = .96f,
        targetValue = 1.045f,
        animationSpec = infiniteRepeatable(tween(1_100), repeatMode = RepeatMode.Reverse),
        label = "entryPulse",
    )
    val drift by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(3_800, easing = LinearEasing)),
        label = "entryMotif",
    )

    Box(
        Modifier.fillMaxSize().background(
            Brush.radialGradient(
                listOf(Color(0xFFF0F9FF), Color(0xFFDBEAFE), Color(0xFF818CF8).copy(.70f), Color(0xFF312E81)),
                center = Offset.Unspecified,
                radius = 1_650f,
            ),
        ).safeDrawingPadding(),
        contentAlignment = Alignment.Center,
    ) {
        LoaderMotif(game, drift, Modifier.fillMaxSize())
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(Modifier.size(184.dp), contentAlignment = Alignment.Center) {
                Canvas(Modifier.fillMaxSize().graphicsLayer { rotationZ = rotation }) {
                    drawArc(
                        color = Color.White.copy(.82f),
                        startAngle = 8f,
                        sweepAngle = 224f,
                        useCenter = false,
                        style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round),
                    )
                    drawArc(
                        color = Color(game.accent).copy(.72f),
                        startAngle = 245f,
                        sweepAngle = 76f,
                        useCenter = false,
                        style = Stroke(width = 7.dp.toPx(), cap = StrokeCap.Round),
                    )
                }
                Surface(
                    Modifier.size(128.dp).graphicsLayer { scaleX = pulse; scaleY = pulse },
                    RoundedCornerShape(36.dp),
                    color = Color.White.copy(.94f),
                    shadowElevation = 16.dp,
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color.White),
                ) {
                    AssetImage(assets, game.iconAsset, Modifier.fillMaxSize().padding(10.dp))
                }
            }
            Spacer(Modifier.height(22.dp))
            Text(copy.eyebrow.uppercase(), color = Color(0xFF4F46E5), fontSize = 11.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(6.dp))
            Text(game.title, color = Color(0xFF1E1B4B), fontSize = 29.sp, lineHeight = 33.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
            Spacer(Modifier.height(9.dp))
            Text(status, color = Color(0xFF475569), fontSize = 14.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(18.dp))
            Surface(Modifier.width(176.dp).height(5.dp), CircleShape, color = Color.White.copy(.62f)) {
                Box(Modifier.fillMaxSize()) {
                    Box(
                        Modifier.fillMaxWidth(.72f).height(5.dp).graphicsLayer {
                            translationX = (drift * 66f - 18f).coerceIn(-18f, 48f)
                        }.background(Brush.horizontalGradient(listOf(Color(0xFF6366F1), Color(0xFF22D3EE))), CircleShape),
                    )
                }
            }
        }
    }
}

@Composable
private fun LoaderMotif(game: GameKey, phase: Float, modifier: Modifier) {
    Canvas(modifier) {
        val accent = Color(game.accent).copy(.20f)
        val secondary = Color.White.copy(.32f)
        val t = phase * PI.toFloat() * 2f
        when (game) {
            GameKey.SPY -> {
                val center = Offset(size.width * .5f, size.height * .42f)
                repeat(3) { index -> drawCircle(accent.copy(alpha = .10f + index * .04f), size.minDimension * (.18f + index * .11f), center, style = Stroke(2f)) }
                val end = Offset(center.x + cos(t) * size.minDimension * .40f, center.y + sin(t) * size.minDimension * .40f)
                drawLine(accent.copy(.50f), center, end, 4f, StrokeCap.Round)
            }
            GameKey.QUARTET -> repeat(4) { index ->
                val a = t * .22f + index * PI.toFloat() / 2f
                val x = size.width * .5f + cos(a) * size.width * .36f
                val y = size.height * .43f + sin(a) * size.height * .19f
                drawRoundRect(accent, Offset(x - 28f, y - 38f), androidx.compose.ui.geometry.Size(56f, 76f), androidx.compose.ui.geometry.CornerRadius(12f))
            }
            GameKey.WOW, GameKey.WORD_SEARCH -> repeat(12) { index ->
                val col = index % 4
                val row = index / 4
                val wobble = sin(t + index) * 8f
                drawCircle(if (index % 3 == 0) accent else secondary, 15f, Offset(size.width * (.16f + col * .23f), size.height * (.23f + row * .25f) + wobble))
            }
            GameKey.PAIRS -> repeat(6) { index ->
                val x = size.width * (.18f + (index % 3) * .32f)
                val y = size.height * (.28f + (index / 3) * .35f)
                drawCircle(if (index % 2 == 0) accent else secondary, 28f + sin(t + index) * 4f, Offset(x, y))
            }
            GameKey.MATCH_THREE -> repeat(10) { index ->
                val a = t * .16f + index * .63f
                val x = size.width * .5f + cos(a) * size.width * (.25f + (index % 3) * .05f)
                val y = size.height * .43f + sin(a * 1.2f) * size.height * .28f
                drawCircle(if (index % 2 == 0) accent else secondary, 16f + index % 3 * 3f, Offset(x, y))
            }
            else -> repeat(8) { index ->
                val a = t * .12f + index * PI.toFloat() / 4f
                val radius = size.minDimension * (.31f + (index % 2) * .09f)
                drawCircle(if (index % 2 == 0) accent else secondary, 12f + (index % 3) * 4f, Offset(size.width * .5f + cos(a) * radius, size.height * .43f + sin(a) * radius))
            }
        }
    }
}
