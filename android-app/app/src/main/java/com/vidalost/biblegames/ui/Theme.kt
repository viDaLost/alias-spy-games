package com.vidalost.biblegames.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Ink = Color(0xFF1F2A44)
val InkSoft = Color(0xFF667085)
val Indigo = Color(0xFF4F46E5)
val Cyan = Color(0xFF0EA5E9)
val Paper = Color(0xFFFDFBF8)
val Success = Color(0xFF16A34A)
val Danger = Color(0xFFDC2626)
val Gold = Color(0xFFF7B731)

private val LightColors = lightColorScheme(
    primary = Indigo,
    onPrimary = Color.White,
    secondary = Cyan,
    onSecondary = Color.White,
    background = Paper,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    surfaceVariant = Color(0xFFF1F5FF),
    onSurfaceVariant = InkSoft,
    error = Danger,
)

@Composable
fun BibleGamesTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = LightColors, typography = Typography(), content = content)
}
