package com.vidalost.biblegames.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.model.GameKey
import com.vidalost.biblegames.model.PlayerProfile

private data class HomeLayer(
    val file: String,
    val depthY: Float,
    val depthX: Float,
    val scale: Float,
    val opacity: Float,
    val offsetY: Float,
)

private val homeLayers = listOf(
    HomeLayer("assets/home-gamehub-parallax-v1/    01-gamehub-base.PNG", .0015f, .0000f, 1.000f, 1.00f, 0f),
    HomeLayer("assets/home-gamehub-parallax-v1/    02-atmosphere.PNG", -.0055f, .0012f, 1.004f, .78f, -2f),
    HomeLayer("assets/home-gamehub-parallax-v1/    03-architecture.PNG", -.0110f, -.0018f, 1.006f, .94f, 2f),
    HomeLayer("assets/home-gamehub-parallax-v1/    04-game-icons.PNG", -.0160f, .0018f, 1.000f, 1.00f, -8f),
    HomeLayer("assets/home-gamehub-parallax-v1/    05-game-library.PNG", -.0210f, -.0020f, 1.005f, 1.00f, 10f),
)

/** Android equivalent of web/home-parallax-v1: the exact five source artwork layers, scroll driven. */
@Composable
fun HomeParallaxBackground(
    assets: AssetRepository,
    listState: LazyListState,
    content: @Composable () -> Unit,
) {
    val scroll by remember(listState) {
        derivedStateOf {
            (listState.firstVisibleItemIndex * 260f + listState.firstVisibleItemScrollOffset.toFloat())
                .coerceIn(0f, 1600f)
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0xFFF2F6FF))) {
        homeLayers.forEach { layer ->
            val motionY = (scroll * layer.depthY).coerceIn(-40f, 12f)
            val motionX = (scroll * layer.depthX).coerceIn(-4f, 4f)
            AssetImage(
                assets = assets,
                path = layer.file,
                modifier = Modifier.fillMaxSize().graphicsLayer {
                    translationX = motionX
                    translationY = layer.offsetY + motionY
                    scaleX = layer.scale
                    scaleY = layer.scale
                    alpha = layer.opacity
                },
                contentScale = ContentScale.Crop,
            )
        }
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    listOf(
                        Color.White.copy(alpha = .26f),
                        Color(0xFFF8FAFF).copy(alpha = .16f),
                        Color(0xFFEAF3FF).copy(alpha = .34f),
                    ),
                ),
            ),
        )
        Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) { content() }
    }
}

@Composable
fun HomeContinueCard(game: GameKey, assets: AssetRepository, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().bounceClick(onClick = onClick),
        shape = RoundedCornerShape(26.dp),
        color = Color.White.copy(alpha = .92f),
        shadowElevation = 9.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(Modifier.size(68.dp), RoundedCornerShape(21.dp), color = Color(game.accent).copy(alpha = .10f)) {
                AssetImage(assets, game.iconAsset, Modifier.fillMaxSize().padding(5.dp))
            }
            Spacer(Modifier.width(13.dp))
            Column(Modifier.weight(1f)) {
                Text("ПРОДОЛЖИТЬ", color = Indigo, fontSize = 10.sp, letterSpacing = 1.2.sp, fontWeight = FontWeight.Black)
                Text(game.title, color = Ink, fontSize = 18.sp, fontWeight = FontWeight.Black, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(game.description, color = InkSoft, fontSize = 11.sp, lineHeight = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Text("→", color = Color(game.accent), fontSize = 25.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
fun HomeProgressSummary(profile: PlayerProfile) {
    Column(Modifier.fillMaxWidth()) {
        Text("Ваш прогресс", Modifier.padding(start = 6.dp, bottom = 7.dp), color = Ink, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            HomeProgressMetric("${profile.wordSearchStars} ⭐", "Общие звёзды", Indigo, Modifier.weight(1f))
            HomeProgressMetric(profile.wowStars.toString(), "Монеты «Библейских слов»", Color(0xFFB7791F), Modifier.weight(1f))
            HomeProgressMetric(profile.sacredLevel.toString(), "Уровень «Священного слова»", Color(0xFF7C3AED), Modifier.weight(1f))
        }
    }
}

@Composable
private fun HomeProgressMetric(value: String, label: String, accent: Color, modifier: Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(19.dp),
        color = Color.White.copy(alpha = .90f),
        border = androidx.compose.foundation.BorderStroke(1.dp, accent.copy(alpha = .12f)),
        shadowElevation = 4.dp,
    ) {
        Column(Modifier.padding(horizontal = 7.dp, vertical = 11.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, color = accent, fontSize = 15.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center, maxLines = 1)
            Text(label, color = InkSoft, fontSize = 9.sp, lineHeight = 11.sp, textAlign = TextAlign.Center, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
    }
}
