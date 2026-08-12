from pathlib import Path

p = Path('android-app/app/src/main/java/com/vidalost/biblegames/games/SpyGame.kt')
s = p.read_text()

old = '    var revealed by rememberSaveable { mutableStateOf(false) }\n    var accused by rememberSaveable { mutableIntStateOf(1) }'
new = '    var revealed by rememberSaveable { mutableStateOf(false) }\n    var handoffInProgress by rememberSaveable { mutableStateOf(false) }\n    var accused by rememberSaveable { mutableIntStateOf(1) }'
assert old in s
s = s.replace(old, new, 1)

old = '''        currentPlayer = 0
        revealed = false
        stage = SpyStage.ROLES
    }

    fun nextPlayer() {
        if (currentPlayer + 1 >= playerCount) stage = SpyStage.DISCUSSION
        else { currentPlayer++; revealed = false }
    }
'''
new = '''        currentPlayer = 0
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
'''
assert old in s
s = s.replace(old, new, 1)

old = '''                        revealed = revealed,
                        onReveal = { revealed = true },
                        onNext = ::nextPlayer,
'''
new = '''                        revealed = revealed,
                        handoffInProgress = handoffInProgress,
                        onReveal = { if (!handoffInProgress) revealed = true },
                        onNext = ::nextPlayer,
'''
assert old in s
s = s.replace(old, new, 1)

old = '''    location: String,
    revealed: Boolean,
    onReveal: () -> Unit,
    onNext: () -> Unit,
) {
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    val revealWithFeedback = {
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        onReveal()
    }
    val nextWithFeedback = {
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        onNext()
    }
'''
new = '''    location: String,
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
'''
assert old in s
s = s.replace(old, new, 1)

old = '''    Spacer(Modifier.height(9.dp))
    Text("Карточка перевернётся с анимацией. После просмотра нажмите «Передать следующему».", Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White.copy(.65f)).padding(10.dp), color = InkSoft, fontSize = 11.sp, textAlign = TextAlign.Center)
    Spacer(Modifier.height(11.dp))
    SpyRoleCard(assets, isSpy, location, revealed, revealWithFeedback)
    Spacer(Modifier.height(12.dp))
    AnimatedVisibility(!revealed, enter = fadeIn(), exit = fadeOut()) {
        PrimaryButton("Перевернуть карточку", revealWithFeedback, Modifier.fillMaxWidth(), icon = "👁")
    }
    AnimatedVisibility(revealed, enter = fadeIn(tween(280)) + scaleIn(initialScale = .92f), exit = fadeOut()) {
        PrimaryButton(if (player == total) "Начать обсуждение" else "Передать следующему", nextWithFeedback, Modifier.fillMaxWidth(), icon = "→")
    }
'''
new = '''    Spacer(Modifier.height(12.dp))
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
'''
assert old in s
s = s.replace(old, new, 1)

start = s.index('@Composable\nprivate fun SpyRoleCard(')
end = s.index('\n@Composable\nprivate fun SpyDiscussion', start)
replacement = '''@Composable
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
'''
s = s[:start] + replacement + s[end:]
p.write_text(s)

g = Path('android-app/app/build.gradle')
gs = g.read_text()
assert 'versionCode 14' in gs
assert "versionName '2.6.2-native'" in gs
gs = gs.replace('versionCode 14', 'versionCode 15', 1)
gs = gs.replace("versionName '2.6.2-native'", "versionName '2.6.3-native'", 1)
g.write_text(gs)
