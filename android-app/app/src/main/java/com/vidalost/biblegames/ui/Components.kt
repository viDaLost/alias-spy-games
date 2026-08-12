package com.vidalost.biblegames.ui

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidalost.biblegames.data.AssetRepository
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

val AppGradient = Brush.linearGradient(
    listOf(Color(0xFFFDFBF8), Color(0xFFF1F3FF), Color(0xFFDFF7FF)),
    start = Offset.Zero,
    end = Offset(1100f, 1900f),
)

@Composable
fun AppBackground(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(AppGradient).safeDrawingPadding().imePadding()) {
        SoftOrbs()
        content()
    }
}

@Composable
private fun SoftOrbs() {
    val transition = rememberInfiniteTransition(label = "orbs")
    val drift by transition.animateFloat(
        0f, 1f,
        animationSpec = infiniteRepeatable(tween(9_000)), label = "orbDrift",
    )
    Canvas(Modifier.fillMaxSize()) {
        val d = sin(drift * PI * 2).toFloat()
        drawCircle(Color(0x184F46E5), size.minDimension * .46f, Offset(size.width * .1f + d * 18, size.height * .18f))
        drawCircle(Color(0x160EA5E9), size.minDimension * .55f, Offset(size.width * .92f - d * 22, size.height * .73f))
    }
}

@Composable
fun GameScaffold(
    title: String,
    subtitle: String? = null,
    onBack: () -> Unit,
    scroll: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    AppBackground {
        Column(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            GameTopBar(title, subtitle, onBack)
            val body = Modifier.fillMaxWidth().weight(1f)
                .then(if (scroll) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                .padding(top = 8.dp, bottom = 28.dp)
            Column(body, horizontalAlignment = Alignment.CenterHorizontally, content = content)
        }
    }
}

@Composable
fun GameTopBar(title: String, subtitle: String?, onBack: () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val fontScale = LocalDensity.current.fontScale
        val compact = maxWidth < 360.dp || fontScale > 1.2f
        val buttonSize = if (compact) 44.dp else 46.dp
        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(buttonSize).bounceClick(onClick = onBack),
                shape = CircleShape,
                color = Color.White.copy(alpha = .82f),
                shadowElevation = 5.dp,
                border = androidx.compose.foundation.BorderStroke(1.dp, Color.White),
            ) { Box(contentAlignment = Alignment.Center) { Text("←", fontSize = 24.sp, color = Ink, fontWeight = FontWeight.Bold) } }
            Column(Modifier.weight(1f).padding(horizontal = 9.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    title,
                    fontSize = if (compact) 18.sp else 21.sp,
                    lineHeight = if (compact) 21.sp else 24.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Ink,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!subtitle.isNullOrBlank()) Text(
                    subtitle,
                    fontSize = if (compact) 11.sp else 12.sp,
                    lineHeight = if (compact) 14.sp else 16.sp,
                    color = InkSoft,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.size(buttonSize))
        }
    }
}

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    padding: Dp = 18.dp,
    color: Color = Color.White.copy(alpha = .9f),
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(26.dp),
        color = color,
        tonalElevation = 1.dp,
        shadowElevation = 9.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = .94f)),
    ) { Column(Modifier.padding(padding), content = content) }
}

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: String? = null,
    colors: List<Color> = listOf(Indigo, Cyan),
) {
    val haptic = LocalHapticFeedback.current
    Box(
        modifier.heightIn(min = 58.dp).clip(RoundedCornerShape(19.dp))
            .background(if (enabled) Brush.horizontalGradient(colors) else Brush.horizontalGradient(listOf(Color(0xFFCBD5E1), Color(0xFF94A3B8))))
            .bounceClick(enabled) { haptic.performHapticFeedback(HapticFeedbackType.LongPress); onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            listOfNotNull(icon, text).joinToString("  "),
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            color = Color.White,
            fontSize = 16.sp,
            lineHeight = 19.sp,
            fontWeight = FontWeight.ExtraBold,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    accent: Color = Indigo,
    icon: String? = null,
) {
    val haptic = LocalHapticFeedback.current
    Surface(
        modifier = modifier.heightIn(min = 54.dp).bounceClick(enabled) {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onClick()
        },
        shape = RoundedCornerShape(18.dp),
        color = if (enabled) Color.White.copy(alpha = .9f) else Color(0xFFE2E8F0),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (enabled) accent.copy(alpha = .25f) else Color.Transparent),
        shadowElevation = 3.dp,
    ) {
        // Do not use fillMaxSize() here.  Inside a non-scrolling game Column it
        // eagerly consumed the whole available height, turning ordinary action
        // buttons into the giant empty panels seen on several phones.  The
        // outer heightIn supplies the touch target while this content measures
        // only its real height.
        Box(Modifier.fillMaxWidth().heightIn(min = 54.dp), contentAlignment = Alignment.Center) {
            Text(
                listOfNotNull(icon, text).joinToString("  "),
                Modifier.fillMaxWidth().padding(horizontal = 11.dp, vertical = 9.dp),
                color = if (enabled) accent else InkSoft,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                lineHeight = 17.sp,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

fun Modifier.bounceClick(enabled: Boolean = true, onClick: () -> Unit): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (pressed && enabled) .965f else 1f,
        spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = .65f), label = "pressScale",
    )
    graphicsLayer { scaleX = scale; scaleY = scale }
        .clickable(enabled = enabled, interactionSource = source, indication = null, onClick = onClick)
}

@Composable
fun AssetImage(assets: AssetRepository, path: String, modifier: Modifier, contentScale: ContentScale = ContentScale.Fit) {
    val bitmap = remember(path) { assets.bitmap(path)?.asImageBitmap() }
    if (bitmap != null) Image(bitmap, null, modifier, contentScale = contentScale)
    else Box(modifier.background(Color(0xFFEFF3FF), RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) { Text("✦", color = Indigo, fontSize = 28.sp) }
}

@Composable
fun NumberStepper(label: String, value: Int, range: IntRange, onChange: (Int) -> Unit, modifier: Modifier = Modifier) {
    GlassCard(modifier = modifier, padding = 14.dp) {
        Text(label, color = Ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            StepCircle("−", value > range.first) { onChange((value - 1).coerceIn(range)) }
            AnimatedContent(value, label = "stepValue") { target ->
                Text(target.toString(), fontSize = 30.sp, fontWeight = FontWeight.Black, color = Indigo)
            }
            StepCircle("+", value < range.last) { onChange((value + 1).coerceIn(range)) }
        }
        Text("${range.first}–${range.last}", Modifier.fillMaxWidth(), color = InkSoft, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun StepCircle(text: String, enabled: Boolean, onClick: () -> Unit) {
    Surface(
        Modifier.size(44.dp).bounceClick(enabled, onClick), CircleShape,
        color = if (enabled) Color(0xFFEEF2FF) else Color(0xFFF1F5F9),
    ) { Box(contentAlignment = Alignment.Center) { Text(text, color = if (enabled) Indigo else InkSoft, fontSize = 24.sp, fontWeight = FontWeight.Bold) } }
}

@Composable
fun StatusPill(text: String, modifier: Modifier = Modifier, color: Color = Indigo, icon: String? = null) {
    Row(
        modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = .11f)).padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) { Text(icon, fontSize = 13.sp); Spacer(Modifier.width(5.dp)) }
        Text(
            text,
            color = color,
            fontSize = 12.sp,
            lineHeight = 15.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun StatusPill(text: String, color: Color, icon: String? = null) {
    StatusPill(text = text, modifier = Modifier, color = color, icon = icon)
}

@Composable
fun LoadingCard(text: String = "Загрузка…") {
    GlassCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(28.dp), color = Indigo, strokeWidth = 3.dp)
            Spacer(Modifier.width(14.dp))
            Text(text, color = Ink, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun ErrorCard(message: String, onRetry: (() -> Unit)? = null) {
    GlassCard(Modifier.fillMaxWidth(), color = Color(0xFFFFF7F7)) {
        Text("Не удалось продолжить игру", color = Danger, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(7.dp))
        Text(message, color = InkSoft)
        if (onRetry != null) { Spacer(Modifier.height(14.dp)); PrimaryButton("Попробовать снова", onRetry, Modifier.fillMaxWidth(), icon = "↻") }
    }
}

@Composable
fun ConfettiOverlay(active: Boolean, modifier: Modifier = Modifier) {
    AnimatedVisibility(active, enter = fadeIn(), exit = fadeOut(tween(700)), modifier = modifier) {
        val transition = rememberInfiniteTransition(label = "confetti")
        val progress by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(2400)), label = "confettiProgress")
        val pieces = remember { List(46) { Random(it * 31).let { r -> Triple(r.nextFloat(), r.nextFloat(), r.nextInt(6)) } } }
        val palette = listOf(Indigo, Cyan, Gold, Color(0xFFEC4899), Success, Color(0xFFFB7185))
        Canvas(Modifier.fillMaxSize()) {
            pieces.forEachIndexed { i, (x, phase, color) ->
                val y = ((progress + phase) % 1f) * size.height
                rotate(progress * 360 + i * 13f, Offset(x * size.width, y)) {
                    drawRoundRect(palette[color], Offset(x * size.width, y), androidx.compose.ui.geometry.Size(9f, 17f), androidx.compose.ui.geometry.CornerRadius(3f))
                }
            }
        }
    }
}
