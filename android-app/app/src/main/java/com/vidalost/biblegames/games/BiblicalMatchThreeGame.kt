package com.vidalost.biblegames.games

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.model.PlayerProfile
import com.vidalost.biblegames.ui.AssetImage
import com.vidalost.biblegames.ui.GameScaffold
import com.vidalost.biblegames.ui.GameTopBar
import com.vidalost.biblegames.ui.GlassCard
import com.vidalost.biblegames.ui.Indigo
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.PrimaryButton
import com.vidalost.biblegames.ui.SecondaryButton
import com.vidalost.biblegames.ui.Success
import com.vidalost.biblegames.ui.bounceClick
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs

private enum class BmtScreen { MENU, PRE_LEVEL, BOARD }
private enum class BmtMenuSection { CAMPAIGN, FREE }

private enum class BmtFreeMode(
    val title: String,
    val rows: Int,
    val symbolCount: Int,
    val shape: BmtBoardShape,
) {
    EASY("Лёгкий", 7, 7, BmtBoardShape.OVAL),
    MEDIUM("Средний", 8, 8, BmtBoardShape.BOWL),
    HARD("Тяжёлый", 8, 9, BmtBoardShape.CROSS),
}

@Composable
fun BiblicalMatchThreeGame(
    assets: AssetRepository,
    profile: PlayerProfile,
    onProfileChange: (PlayerProfile) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val catalog = remember(assets) { BmtCatalog.load(assets) }
    val progress = remember(profile.id) { BmtProgressStore(context, profile.id) }
    var screen by rememberSaveable { mutableStateOf(BmtScreen.MENU) }
    var menuSection by rememberSaveable { mutableStateOf(BmtMenuSection.CAMPAIGN) }
    var levelId by rememberSaveable { mutableIntStateOf(1) }
    var freeModeName by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedPreBoosters by remember { mutableStateOf(emptySet<BmtPreBooster>()) }
    var wallet by rememberSaveable(profile.id) { mutableIntStateOf(profile.wowStars) }

    LaunchedEffect(profile.wowStars) {
        if (profile.wowStars != wallet) wallet = profile.wowStars
    }

    fun updateWallet(next: Int) {
        wallet = next.coerceAtLeast(0)
        onProfileChange(profile.copy(wowStars = wallet))
    }

    val level = catalog.levels.firstOrNull { it.id == levelId } ?: catalog.levels.first()
    val freeMode = freeModeName?.let { name -> BmtFreeMode.entries.firstOrNull { it.name == name } }

    when (screen) {
        BmtScreen.MENU -> BmtCampaignScreen(
            assets = assets,
            levels = catalog.levels,
            progress = progress,
            wallet = wallet,
            section = menuSection,
            onSectionChange = { menuSection = it },
            onLevel = { chosen ->
                menuSection = BmtMenuSection.CAMPAIGN
                levelId = chosen.id
                freeModeName = null
                selectedPreBoosters = emptySet()
                screen = BmtScreen.PRE_LEVEL
            },
            onFree = { mode ->
                menuSection = BmtMenuSection.FREE
                freeModeName = mode.name
                selectedPreBoosters = emptySet()
                screen = BmtScreen.PRE_LEVEL
            },
            onBack = onBack,
        )

        BmtScreen.PRE_LEVEL -> BmtPreLevelScreen(
            assets = assets,
            level = if (freeMode == null) level else null,
            freeMode = freeMode,
            wallet = wallet,
            selected = selectedPreBoosters,
            onToggle = { booster ->
                val next = if (booster in selectedPreBoosters) selectedPreBoosters - booster else selectedPreBoosters + booster
                if (next.sumOf(BmtPreBooster::cost) <= wallet) selectedPreBoosters = next
            },
            onStart = {
                updateWallet(wallet - selectedPreBoosters.sumOf(BmtPreBooster::cost))
                screen = BmtScreen.BOARD
            },
            onBack = { screen = BmtScreen.MENU },
        )

        BmtScreen.BOARD -> BmtBoardScreen(
            assets = assets,
            level = if (freeMode == null) level else null,
            freeMode = freeMode,
            preBoosters = selectedPreBoosters,
            progress = progress,
            wallet = wallet,
            onWalletChange = ::updateWallet,
            onMap = { screen = BmtScreen.MENU },
            onNext = {
                val next = catalog.levels.firstOrNull { it.id == levelId + 1 }
                if (next == null) screen = BmtScreen.MENU else {
                    levelId = next.id
                    selectedPreBoosters = emptySet()
                    screen = BmtScreen.PRE_LEVEL
                }
            },
            onBack = { screen = BmtScreen.MENU },
        )
    }
}

@Composable
private fun BmtCampaignScreen(
    assets: AssetRepository,
    levels: List<BmtLevel>,
    progress: BmtProgressStore,
    wallet: Int,
    section: BmtMenuSection,
    onSectionChange: (BmtMenuSection) -> Unit,
    onLevel: (BmtLevel) -> Unit,
    onFree: (BmtFreeMode) -> Unit,
    onBack: () -> Unit,
) {
    val unlocked = progress.unlocked()
    val stars = levels.sumOf { progress.rating(it.id) }
    GameScaffold("Библейские сокровища", if (section == BmtMenuSection.CAMPAIGN) "Путь света · 30 уровней" else "Свободная игра", onBack, scroll = false) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BmtMetric("★ $wallet", "баланс", Color(0xFFB7791F), Modifier.weight(1f))
            BmtMetric("$stars / 90 ★", "прогресс", Indigo, Modifier.weight(1f))
        }
        Spacer(Modifier.height(8.dp))
        BmtMenuTabs(section, onSectionChange)
        Spacer(Modifier.height(8.dp))
        if (section == BmtMenuSection.CAMPAIGN) {
            GlassCard(Modifier.fillMaxWidth(), padding = 12.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AssetImage(assets, BmtSymbol.BIBLE.asset, Modifier.size(48.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Путь света", color = Indigo, fontWeight = FontWeight.Black, fontSize = 12.sp)
                        Text("Собирайте символы, создавайте особые фишки и проходите главы.", color = Ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, lineHeight = 18.sp)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            LazyColumn(
                Modifier.fillMaxWidth().weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                levels.chunked(10).forEachIndexed { chapterIndex, chapterLevels ->
                    item(key = "chapter_$chapterIndex") {
                        Text(
                            "ГЛАВА ${chapterIndex + 1} · ${chapterTitle(chapterIndex)}",
                            Modifier.fillMaxWidth().padding(top = if (chapterIndex == 0) 2.dp else 8.dp),
                            color = Indigo,
                            fontWeight = FontWeight.Black,
                            fontSize = 12.sp,
                        )
                    }
                    items(chapterLevels.chunked(2), key = { "${chapterIndex}_${it.first().id}" }) { pair ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            pair.forEach { item ->
                                BmtLevelCard(
                                    assets = assets,
                                    level = item,
                                    rating = progress.rating(item.id),
                                    unlocked = item.id <= unlocked,
                                    onClick = { onLevel(item) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
                item { Spacer(Modifier.height(14.dp)) }
            }
        } else {
            BmtFreeSection(assets, progress, onFree)
        }
    }
}

@Composable
private fun BmtMenuTabs(section: BmtMenuSection, onChange: (BmtMenuSection) -> Unit) {
    Surface(Modifier.fillMaxWidth(), RoundedCornerShape(18.dp), color = Color(0xFFDDE6F5).copy(.8f)) {
        Row(Modifier.padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            BmtMenuTab("Путь света", section == BmtMenuSection.CAMPAIGN, Modifier.weight(1f)) { onChange(BmtMenuSection.CAMPAIGN) }
            BmtMenuTab("Свободная игра", section == BmtMenuSection.FREE, Modifier.weight(1f)) { onChange(BmtMenuSection.FREE) }
        }
    }
}

@Composable
private fun BmtMenuTab(title: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Surface(
        modifier.heightIn(min = 48.dp).bounceClick(onClick = onClick),
        RoundedCornerShape(15.dp),
        color = if (selected) Color.White else Color.Transparent,
        shadowElevation = if (selected) 3.dp else 0.dp,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(title, color = if (selected) Indigo else InkSoft, fontWeight = FontWeight.Black, fontSize = 13.sp, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun BmtFreeSection(assets: AssetRepository, progress: BmtProgressStore, onFree: (BmtFreeMode) -> Unit) {
    GlassCard(Modifier.fillMaxWidth(), padding = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AssetImage(assets, BmtSymbol.ARK.asset, Modifier.size(52.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("Рекордный режим", color = Color(0xFF9A6A14), fontWeight = FontWeight.Black, fontSize = 12.sp)
                Text("Выберите сложность и начинайте сразу — кампания остаётся в соседнем разделе.", color = Ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, lineHeight = 17.sp)
            }
        }
    }
    Spacer(Modifier.height(8.dp))
    LazyColumn(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        items(BmtFreeMode.entries, key = BmtFreeMode::name) { mode ->
            val accent = when (mode) {
                BmtFreeMode.EASY -> Color(0xFF198754)
                BmtFreeMode.MEDIUM -> Color(0xFFB7791F)
                BmtFreeMode.HARD -> Color(0xFF7C3AED)
            }
            Surface(
                Modifier.fillMaxWidth().heightIn(min = 94.dp).bounceClick { onFree(mode) },
                RoundedCornerShape(22.dp),
                color = Color.White.copy(.92f),
                border = BorderStroke(1.dp, accent.copy(.2f)),
                shadowElevation = 4.dp,
            ) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Surface(Modifier.size(54.dp), RoundedCornerShape(18.dp), color = accent.copy(.11f)) {
                        Box(contentAlignment = Alignment.Center) {
                            AssetImage(assets, when (mode) {
                                BmtFreeMode.EASY -> BmtSymbol.DOVE.asset
                                BmtFreeMode.MEDIUM -> BmtBlockerType.CHAIN.asset
                                BmtFreeMode.HARD -> BmtBlockerType.LAMP.asset
                            }, Modifier.padding(7.dp))
                        }
                    }
                    Spacer(Modifier.width(11.dp))
                    Column(Modifier.weight(1f)) {
                        Text(mode.title, color = Ink, fontWeight = FontWeight.Black, fontSize = 17.sp)
                        Text("30 ходов · ${mode.rows}×8 · ${if (mode == BmtFreeMode.EASY) "без преград" else "с преградами"}", color = InkSoft, fontSize = 11.sp)
                        Text("Рекорд: ${progress.freeBest(mode.name)}", color = accent, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
                    }
                    Text("›", color = accent, fontWeight = FontWeight.Black, fontSize = 28.sp)
                }
            }
        }
        item { Spacer(Modifier.height(14.dp)) }
    }
}

@Composable
private fun BmtLevelCard(
    assets: AssetRepository,
    level: BmtLevel,
    rating: Int,
    unlocked: Boolean,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    Surface(
        modifier.heightIn(min = 92.dp).bounceClick(unlocked, onClick),
        RoundedCornerShape(20.dp),
        color = if (unlocked) Color.White.copy(.92f) else Color(0xFFE9EEF5).copy(.72f),
        border = BorderStroke(1.dp, if (unlocked) Indigo.copy(.16f) else Color.White.copy(.5f)),
        shadowElevation = if (unlocked) 4.dp else 0.dp,
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(Modifier.size(42.dp), RoundedCornerShape(14.dp), color = if (unlocked) Indigo else Color(0xFFCBD5E1)) {
                Box(contentAlignment = Alignment.Center) {
                    Text(if (unlocked) level.id.toString() else "◆", color = Color.White, fontWeight = FontWeight.Black, fontSize = 16.sp)
                }
            }
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(level.title, color = if (unlocked) Ink else InkSoft, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(if (unlocked) (1..3).joinToString("") { if (it <= rating) "★" else "☆" } else "Закрыто", color = if (unlocked) Color(0xFFB7791F) else InkSoft, fontSize = 12.sp)
            }
            if (unlocked) BmtGoalIcon(assets, level.goals.first(), 30)
        }
    }
}

@Composable
private fun BmtPreLevelScreen(
    assets: AssetRepository,
    level: BmtLevel?,
    freeMode: BmtFreeMode?,
    wallet: Int,
    selected: Set<BmtPreBooster>,
    onToggle: (BmtPreBooster) -> Unit,
    onStart: () -> Unit,
    onBack: () -> Unit,
) {
    val total = selected.sumOf(BmtPreBooster::cost)
    val title = level?.title ?: "Свободно · ${freeMode?.title.orEmpty()}"
    GameScaffold("Библейские сокровища", "Подготовка", onBack) {
        GlassCard(Modifier.fillMaxWidth(), padding = 16.dp) {
            Text(level?.let { "УРОВЕНЬ ${it.id}" } ?: "СВОБОДНАЯ ИГРА", color = Color(0xFF9A6A14), fontWeight = FontWeight.Black, fontSize = 12.sp)
            Text(title, color = Ink, fontWeight = FontWeight.Black, fontSize = 28.sp, lineHeight = 32.sp)
            Text("Поле ${level?.rows ?: freeMode?.rows}×8 · ${(level?.moves ?: 30)} ходов", color = InkSoft, fontSize = 13.sp)
            Spacer(Modifier.height(13.dp))
            Text("Цели", color = Ink, fontWeight = FontWeight.Black, fontSize = 15.sp)
            Spacer(Modifier.height(7.dp))
            if (level != null) level.goals.forEach { BmtGoalRow(assets, it) }
            else BmtGoalRow(assets, BmtGoal(BmtGoalType.SCORE, freeTarget(freeMode ?: BmtFreeMode.EASY)))
            Spacer(Modifier.height(13.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Усилители перед стартом", color = Ink, fontWeight = FontWeight.Black, fontSize = 14.sp)
                Text("$wallet ★", color = Color(0xFF9A6A14), fontWeight = FontWeight.Black, fontSize = 14.sp)
            }
            Spacer(Modifier.height(7.dp))
            BmtPreBooster.entries.forEach { booster ->
                val availableBalance = wallet - total + (if (booster in selected) booster.cost else 0)
                BmtPreBoosterRow(assets, booster, booster in selected, availableBalance >= booster.cost) { onToggle(booster) }
                Spacer(Modifier.height(7.dp))
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SecondaryButton("Назад", onBack, Modifier.weight(.78f))
            PrimaryButton(if (total == 0) "Начать уровень" else "Начать · −$total ★", onStart, Modifier.weight(1.22f))
        }
    }
}

@Composable
private fun BmtGoalRow(assets: AssetRepository, goal: BmtGoal) {
    Surface(Modifier.fillMaxWidth().padding(bottom = 6.dp), RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, Color(0xFFE4EAF4))) {
        Row(Modifier.padding(9.dp), verticalAlignment = Alignment.CenterVertically) {
            BmtGoalIcon(assets, goal, 38)
            Spacer(Modifier.width(10.dp))
            Text(goalDescription(goal), color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
        }
    }
}

@Composable
private fun BmtPreBoosterRow(assets: AssetRepository, booster: BmtPreBooster, selected: Boolean, affordable: Boolean, onClick: () -> Unit) {
    Surface(
        Modifier.fillMaxWidth().bounceClick(affordable || selected, onClick),
        RoundedCornerShape(17.dp),
        color = if (selected) Color(0xFFFFF5CF) else Color.White,
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) Color(0xFFE3AC39) else Color(0xFFE4EAF4)),
    ) {
        Row(Modifier.padding(9.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(Modifier.size(48.dp), RoundedCornerShape(15.dp), color = Color(0xFFF0F6F9)) {
                AssetImage(assets, booster.asset, Modifier.padding(5.dp))
            }
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Text(booster.title, color = Ink, fontWeight = FontWeight.Black, fontSize = 13.sp)
                Text(booster.description, color = InkSoft, fontSize = 10.sp, lineHeight = 13.sp)
            }
            Text(if (selected) "✓" else "${booster.cost} ★", color = if (affordable || selected) Color(0xFF9A6A14) else InkSoft, fontWeight = FontWeight.Black, fontSize = 13.sp)
        }
    }
}

@Composable
private fun BmtBoardScaffold(
    assets: AssetRepository,
    title: String,
    subtitle: String,
    onBack: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(Modifier.fillMaxSize().background(Color(0xFFE8E4F8))) {
        AssetImage(
            assets,
            "assets/biblical-match-three/board-background-v35.webp",
            Modifier.fillMaxSize(),
            ContentScale.Crop,
        )
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    listOf(
                        Color.White.copy(.68f),
                        Color.White.copy(.16f),
                        Color(0xFFEAF7FF).copy(.34f),
                    ),
                ),
            ),
        )
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().imePadding().padding(horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            GameTopBar(title, subtitle, onBack)
            Column(
                Modifier.fillMaxWidth().weight(1f).padding(top = 3.dp, bottom = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                content = content,
            )
        }
    }
}

@Composable
private fun BmtBoardScreen(
    assets: AssetRepository,
    level: BmtLevel?,
    freeMode: BmtFreeMode?,
    preBoosters: Set<BmtPreBooster>,
    progress: BmtProgressStore,
    wallet: Int,
    onWalletChange: (Int) -> Unit,
    onMap: () -> Unit,
    onNext: () -> Unit,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val rows = level?.rows ?: freeMode?.rows ?: 7
    val shape = level?.shape ?: freeMode?.shape ?: BmtBoardShape.RECT
    val baseMask = remember(level?.id, freeMode) { BmtEngine.activeMask(shape, rows) }
    val blockerSeeds = remember(level?.id, freeMode) {
        level?.blockerSeeds ?: freeChallengeSeeds(freeMode ?: BmtFreeMode.EASY, baseMask)
    }
    val mask = remember(level?.id, freeMode) { BmtEngine.activeMask(shape, rows, blockerSeeds = blockerSeeds) }
    val symbols = remember(level?.id, freeMode) {
        level?.let(BmtEngine::symbolPool) ?: BmtSymbol.entries.take(freeMode?.symbolCount ?: 7)
    }
    val config = remember(level?.id, freeMode) { BmtBoardConfig(rows, symbols = symbols, mask = mask) }
    val initialBlockers = remember(level?.id, freeMode) { BmtEngine.blockersFrom(blockerSeeds) }
    val initialBlockerCounts = remember(level?.id, freeMode) { initialBlockers.values.groupingBy(BmtBlocker::type).eachCount() }
    val initialBoard = remember(level?.id, freeMode, preBoosters) {
        BmtEngine.seedSpecials(
            BmtEngine.createPlayableBoard(config),
            config,
            preBoosters,
            level?.goals?.firstOrNull { it.type == BmtGoalType.ACTIVATE_SPECIALS }?.count ?: 0,
            initialBlockers,
        )
    }
    var board by remember(level?.id, freeMode, preBoosters) { mutableStateOf(initialBoard) }
    var blockers by remember(level?.id, freeMode, preBoosters) { mutableStateOf(initialBlockers) }
    var moves by remember(level?.id, freeMode, preBoosters) { mutableIntStateOf(level?.moves ?: 30) }
    var score by remember(level?.id, freeMode, preBoosters) { mutableIntStateOf(0) }
    var collected by remember(level?.id, freeMode, preBoosters) { mutableStateOf(emptyMap<BmtSymbol, Int>()) }
    var specialsActivated by remember(level?.id, freeMode, preBoosters) { mutableIntStateOf(0) }
    var maxCascade by remember(level?.id, freeMode, preBoosters) { mutableIntStateOf(1) }
    var selected by remember { mutableStateOf<Int?>(null) }
    var hint by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    var targetBooster by remember { mutableStateOf<BmtBooster?>(null) }
    var busy by remember { mutableStateOf(false) }
    var paused by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<BmtResult?>(null) }
    var boardWallet by remember { mutableIntStateOf(wallet) }
    var animatedSwap by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    val swapProgress = remember { Animatable(0f) }

    LaunchedEffect(wallet) { if (wallet != boardWallet) boardWallet = wallet }

    fun updateWallet(next: Int) {
        boardWallet = next.coerceAtLeast(0)
        onWalletChange(boardWallet)
    }

    fun goalValue(goal: BmtGoal, currentBlockers: Map<Int, BmtBlocker> = blockers): Int = BmtEngine.goalValue(
        goal, score, collected, currentBlockers, initialBlockerCounts, specialsActivated, maxCascade,
    )

    fun goalsDone(): Boolean {
        val campaignGoals = level?.goals
        return if (campaignGoals != null) campaignGoals.all { goalValue(it) >= it.count }
        else score >= freeTarget(freeMode ?: BmtFreeMode.EASY)
    }

    fun applyTurn(turn: BmtTurnResult) {
        board = turn.board
        blockers = turn.blockers
        score += turn.scoreDelta
        collected = buildMap {
            putAll(collected)
            turn.collected.forEach { (symbol, count) -> put(symbol, (get(symbol) ?: 0) + count) }
        }
        specialsActivated += turn.specialsActivated
        maxCascade = maxOf(maxCascade, turn.maxCascade)
        if (BmtEngine.findMoves(board, config).isEmpty()) board = BmtEngine.reshuffle(board, config)
    }

    fun finishIfNeeded() {
        val won = goalsDone()
        if (!won && moves > 0) return
        if (level != null && won) {
            val completion = progress.complete(level, score)
            if (completion.awarded > 0) updateWallet(boardWallet + completion.awarded)
            result = BmtResult(true, completion.rating, completion.awarded)
        } else if (freeMode != null) {
            progress.saveFreeBest(freeMode.name, score)
            result = BmtResult(won, if (won) BmtEngine.rating(score, listOf(freeTarget(freeMode), freeTarget(freeMode) + 1000, freeTarget(freeMode) + 2200)) else 0, 0)
        } else result = BmtResult(false, 0, 0)
    }

    fun performMove(a: Int, b: Int) {
        if (busy || paused || result != null || moves <= 0 || !BmtEngine.areAdjacent(a, b) || board.getOrNull(a) == null || board.getOrNull(b) == null) return
        val combo = BmtEngine.specialComboClearSet(board, a, b, config)
        val swapped = BmtEngine.swap(board, a, b)
        val valid = combo != null || BmtEngine.findGroups(swapped, rows).isNotEmpty()
        busy = true
        selected = null
        hint = null
        scope.launch {
            animatedSwap = a to b
            swapProgress.snapTo(0f)
            if (!valid) {
                swapProgress.animateTo(.22f, tween(90, easing = FastOutSlowInEasing))
                swapProgress.animateTo(0f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessHigh))
                animatedSwap = null
                busy = false
                return@launch
            }
            moves -= 1
            swapProgress.animateTo(1f, tween(265, easing = FastOutSlowInEasing))
            board = swapped
            animatedSwap = null
            swapProgress.snapTo(0f)
            delay(55)
            applyTurn(BmtEngine.resolveTurn(swapped, blockers, config, preferred = listOf(b, a), forcedClear = combo))
            delay(170)
            busy = false
            finishIfNeeded()
        }
    }

    fun useTargetBooster(index: Int) {
        val booster = targetBooster ?: return
        if (busy || result != null || boardWallet < booster.cost || board.getOrNull(index) == null) return
        updateWallet(boardWallet - booster.cost)
        targetBooster = null
        selected = null
        busy = true
        scope.launch {
            applyTurn(BmtEngine.resolveBooster(board, blockers, config, booster, index))
            delay(100)
            busy = false
            finishIfNeeded()
        }
    }

    fun chooseBooster(booster: BmtBooster) {
        if (busy || result != null || boardWallet < booster.cost) return
        if (booster == BmtBooster.ARK) {
            updateWallet(boardWallet - booster.cost)
            board = BmtEngine.reshuffle(board, config, addArkSpecials = true)
            selected = null
            hint = null
        } else targetBooster = if (targetBooster == booster) null else booster
    }

    fun reset() {
        board = BmtEngine.seedSpecials(BmtEngine.createPlayableBoard(config), config, preBoosters, level?.goals?.firstOrNull { it.type == BmtGoalType.ACTIVATE_SPECIALS }?.count ?: 0, initialBlockers)
        blockers = initialBlockers
        moves = level?.moves ?: 30
        score = 0
        collected = emptyMap()
        specialsActivated = 0
        maxCascade = 1
        selected = null
        hint = null
        targetBooster = null
        busy = false
        animatedSwap = null
        scope.launch { swapProgress.snapTo(0f) }
        result = null
    }

    Box(Modifier.fillMaxSize()) {
        BmtBoardScaffold(
            assets = assets,
            title = level?.title ?: "Свободно · ${freeMode?.title.orEmpty()}",
            subtitle = level?.let { "Уровень ${it.id}" } ?: "Библейские сокровища",
            onBack = onBack,
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                BmtMetric(score.toString(), "очки", Indigo, Modifier.weight(1f))
                BmtMetric(moves.toString(), "ходов", Color(0xFF9A6A14), Modifier.weight(1f))
                BmtMetric("×$maxCascade", "каскад", Color(0xFF0F8B8D), Modifier.weight(1f))
                BmtMetric("★ $boardWallet", "баланс", Color(0xFFB7791F), Modifier.weight(1f))
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                val shownGoals = level?.goals ?: listOf(BmtGoal(BmtGoalType.SCORE, freeTarget(freeMode ?: BmtFreeMode.EASY)))
                shownGoals.forEach { goal ->
                    BmtGoalChip(assets, goal, goalValue(goal), Modifier.weight(1f))
                }
            }
            Spacer(Modifier.height(6.dp))
            BoxWithConstraints(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                val cellByWidth = maxWidth / BMT_COLS
                val cellByHeight = maxHeight / rows
                val cell = minOf(cellByWidth, cellByHeight)
                val boardWidth = cell * BMT_COLS
                val boardHeight = cell * rows
                Box(
                    Modifier.size(boardWidth, boardHeight),
                ) {
                    Column(Modifier.fillMaxSize().padding(horizontal = 2.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        for (row in 0 until rows) {
                            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                                for (col in 0 until BMT_COLS) {
                                    val index = row * BMT_COLS + col
                                    val cellValue = board.getOrNull(index)
                                    if (!mask[index] || cellValue == null) Spacer(Modifier.weight(1f).fillMaxHeight())
                                    else BmtTile(
                                        assets = assets,
                                        cell = cellValue,
                                        blocker = blockers[index],
                                        selected = selected == index,
                                        hinted = hint?.let { index == it.first || index == it.second } == true,
                                        targeted = targetBooster != null,
                                        enabled = !busy && !paused && result == null,
                                        swapDeltaColumn = when (index) {
                                            animatedSwap?.first -> (animatedSwap?.second ?: index) % BMT_COLS - index % BMT_COLS
                                            animatedSwap?.second -> (animatedSwap?.first ?: index) % BMT_COLS - index % BMT_COLS
                                            else -> 0
                                        },
                                        swapDeltaRow = when (index) {
                                            animatedSwap?.first -> (animatedSwap?.second ?: index) / BMT_COLS - index / BMT_COLS
                                            animatedSwap?.second -> (animatedSwap?.first ?: index) / BMT_COLS - index / BMT_COLS
                                            else -> 0
                                        },
                                        swapFraction = if (index == animatedSwap?.first || index == animatedSwap?.second) swapProgress.value else 0f,
                                        modifier = Modifier.weight(1f).fillMaxHeight(),
                                        onTap = {
                                            if (targetBooster != null) useTargetBooster(index)
                                            else {
                                                val previous = selected
                                                when {
                                                    previous == null -> selected = index
                                                    previous == index -> selected = null
                                                    BmtEngine.areAdjacent(previous, index) -> performMove(previous, index)
                                                    else -> selected = index
                                                }
                                            }
                                        },
                                        onSwipe = { direction ->
                                            val target = when (direction) {
                                                BmtSwipe.LEFT -> index - 1
                                                BmtSwipe.RIGHT -> index + 1
                                                BmtSwipe.UP -> index - BMT_COLS
                                                BmtSwipe.DOWN -> index + BMT_COLS
                                            }
                                            performMove(index, target)
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
            AnimatedVisibility(targetBooster != null) {
                Text("Выберите фишку для усилителя «${targetBooster?.shortTitle}»", Modifier.fillMaxWidth().padding(vertical = 4.dp), color = Color(0xFF9A6A14), textAlign = TextAlign.Center, fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }
            Text("УСИЛИТЕЛИ", color = InkSoft, fontWeight = FontWeight.Black, fontSize = 10.sp, letterSpacing = 1.sp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                BmtBooster.entries.forEach { booster ->
                    BmtBoosterButton(assets, booster, boardWallet, targetBooster == booster, Modifier.weight(1f)) { chooseBooster(booster) }
                }
            }
            Spacer(Modifier.height(5.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                SecondaryButton("✦ Подсказка", { hint = BmtEngine.findMoves(board, config).firstOrNull() }, Modifier.weight(1f), enabled = !busy && result == null)
                SecondaryButton("Ⅱ Пауза", { paused = true }, Modifier.weight(1f), enabled = !busy && result == null, accent = Color(0xFF9A6A14))
            }
        }

        if (paused) BmtPauseOverlay(onResume = { paused = false }, onRestart = { paused = false; reset() }, onMap = onMap)
        result?.let { current -> BmtResultOverlay(assets, current, level, score, moves, maxCascade, onNext, ::reset, onMap) }
    }
}

private enum class BmtSwipe { LEFT, RIGHT, UP, DOWN }

@Composable
private fun BmtTile(
    assets: AssetRepository,
    cell: BmtCell,
    blocker: BmtBlocker?,
    selected: Boolean,
    hinted: Boolean,
    targeted: Boolean,
    enabled: Boolean,
    swapDeltaColumn: Int,
    swapDeltaRow: Int,
    swapFraction: Float,
    modifier: Modifier,
    onTap: () -> Unit,
    onSwipe: (BmtSwipe) -> Unit,
) {
    val scale by animateFloatAsState(
        if (selected || hinted) 1.05f else 1f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "bmtTileScale",
    )
    var dragOffset by remember { mutableStateOf(Offset.Zero) }
    val dragX by animateFloatAsState(
        dragOffset.x,
        spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessHigh),
        label = "bmtDragX",
    )
    val dragY by animateFloatAsState(
        dragOffset.y,
        spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessHigh),
        label = "bmtDragY",
    )
    val drag = Modifier.pointerInput(enabled) {
        if (!enabled) return@pointerInput
        detectDragGestures(
            onDragStart = { dragOffset = Offset.Zero },
            onDragEnd = {
                val released = dragOffset
                dragOffset = Offset.Zero
                if (maxOf(abs(released.x), abs(released.y)) >= 18f) {
                    onSwipe(if (abs(released.x) > abs(released.y)) if (released.x < 0) BmtSwipe.LEFT else BmtSwipe.RIGHT else if (released.y < 0) BmtSwipe.UP else BmtSwipe.DOWN)
                }
            },
            onDragCancel = { dragOffset = Offset.Zero },
            onDrag = { change, amount ->
                change.consume()
                dragOffset = Offset(
                    (dragOffset.x + amount.x).coerceIn(-64f, 64f),
                    (dragOffset.y + amount.y).coerceIn(-64f, 64f),
                )
            },
        )
    }
    val shape = RoundedCornerShape(12.dp)
    val highlight = selected || hinted || targeted
    Box(
        modifier.zIndex(if (swapFraction > 0f || dragOffset != Offset.Zero) 6f else if (blocker != null) 4f else 1f)
            .scale(scale).then(drag).bounceClick(enabled, onTap),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.fillMaxSize()
                .background(
                    when {
                        targeted -> Color(0x55FFE082)
                        selected || hinted -> Color(0x44FFFFFF)
                        else -> Color.Transparent
                    },
                    shape,
                )
                .then(if (highlight) Modifier.border(2.dp, if (selected || hinted) Indigo.copy(.78f) else Color(0xFFE3AC39), shape) else Modifier),
        )
        if (blocker?.type != BmtBlockerType.LAMP) {
            Box(
                Modifier.fillMaxSize().zIndex(2f)
                    .graphicsLayer {
                        translationX = size.width * swapDeltaColumn * swapFraction + dragX
                        translationY = size.height * swapDeltaRow * swapFraction + dragY
                    }
                    .alpha(if (blocker == null) 1f else .58f),
                contentAlignment = Alignment.Center,
            ) {
                AssetImage(
                    assets,
                    cell.special?.asset ?: cell.symbol.asset,
                    Modifier.fillMaxSize().scale(if (cell.special == null) 1.16f else 1.22f),
                )
                cell.special?.let { special ->
                    val marker = when (special) { BmtSpecial.LINE_H -> "↔"; BmtSpecial.LINE_V -> "↕"; BmtSpecial.BURST -> "✦"; BmtSpecial.RAINBOW -> "◎" }
                    Surface(Modifier.align(Alignment.TopEnd).size(15.dp), CircleShape, color = Indigo.copy(.9f)) {
                        Box(contentAlignment = Alignment.Center) { Text(marker, color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Black) }
                    }
                }
            }
        }
        blocker?.let { current ->
            val asset = if (current.type == BmtBlockerType.LAMP && current.lit) BmtSymbol.LAMP.asset else current.type.asset
            val blockerScale = when (current.type) {
                BmtBlockerType.CHAIN -> 1.34f
                BmtBlockerType.TABLET -> 1.24f
                BmtBlockerType.LAMP -> 1.08f
            }
            Box(Modifier.fillMaxSize().zIndex(8f), contentAlignment = Alignment.Center) {
                AssetImage(assets, asset, Modifier.fillMaxSize().scale(blockerScale))
                if (current.layers > 1) Surface(Modifier.align(Alignment.BottomEnd).size(17.dp), CircleShape, color = Color(0xFF6D28D9), shadowElevation = 3.dp) {
                    Box(contentAlignment = Alignment.Center) { Text(current.layers.toString(), color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Black) }
                }
            }
        }
    }
}

@Composable
private fun BmtBoosterButton(assets: AssetRepository, booster: BmtBooster, wallet: Int, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val enabled = wallet >= booster.cost
    Surface(
        modifier.heightIn(min = 64.dp).bounceClick(enabled, onClick),
        RoundedCornerShape(15.dp),
        color = if (selected) Color(0xFFFFF2C2) else Color.White.copy(.9f),
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) Color(0xFFE3AC39) else Color.White),
    ) {
        Column(Modifier.padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            AssetImage(assets, booster.asset, Modifier.size(31.dp).alpha(if (enabled) 1f else .42f))
            Text(booster.shortTitle, color = if (enabled) Ink else InkSoft, fontWeight = FontWeight.Bold, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${booster.cost} ★", color = if (enabled) Color(0xFF9A6A14) else InkSoft, fontWeight = FontWeight.Black, fontSize = 9.sp)
        }
    }
}

private data class BmtResult(val won: Boolean, val rating: Int, val award: Int)

@Composable
private fun BmtResultOverlay(
    assets: AssetRepository,
    result: BmtResult,
    level: BmtLevel?,
    score: Int,
    moves: Int,
    cascade: Int,
    onNext: () -> Unit,
    onRestart: () -> Unit,
    onMap: () -> Unit,
) {
    BmtOverlay {
        if (result.won) {
            val art = "assets/biblical-match-three/completion-${result.rating.coerceIn(1, 3)}-${if (result.rating == 1) "star" else "stars"}-v40.webp"
            AssetImage(assets, art, Modifier.fillMaxWidth().heightIn(max = 220.dp), ContentScale.Fit)
            Text(level?.let { "УРОВЕНЬ ${it.id} · ${it.title}" } ?: "СВОБОДНАЯ ИГРА", color = Color(0xFF766C8D), fontWeight = FontWeight.Black, fontSize = 11.sp, textAlign = TextAlign.Center)
            Text("Уровень пройден!", color = Ink, fontWeight = FontWeight.Black, fontSize = 27.sp, textAlign = TextAlign.Center)
            Text((1..3).joinToString(" ") { if (it <= result.rating) "★" else "☆" }, color = Color(0xFFF2B633), fontSize = 27.sp, textAlign = TextAlign.Center)
        } else {
            Text("◇", color = InkSoft, fontSize = 54.sp, textAlign = TextAlign.Center)
            Text("Ходы закончились", color = Ink, fontWeight = FontWeight.Black, fontSize = 26.sp, textAlign = TextAlign.Center)
            Text("Попробуйте усилители или другую комбинацию.", color = InkSoft, fontSize = 13.sp, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(9.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            BmtMetric(score.toString(), "очки", Indigo, Modifier.weight(1f))
            BmtMetric(moves.toString(), "ходы", Color(0xFF9A6A14), Modifier.weight(1f))
            BmtMetric("×$cascade", "каскад", Color(0xFF0F8B8D), Modifier.weight(1f))
        }
        if (result.won && result.award > 0) {
            Spacer(Modifier.height(8.dp))
            Surface(Modifier.fillMaxWidth(), RoundedCornerShape(16.dp), color = Color(0xFFFFF5D8)) {
                Text("Награда  +${result.award} ★", Modifier.padding(11.dp), color = Color(0xFF8C610F), fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
            }
        }
        Spacer(Modifier.height(10.dp))
        if (result.won) PrimaryButton(if (level != null) "Следующий уровень" else "В меню", if (level != null) onNext else onMap, Modifier.fillMaxWidth())
        else PrimaryButton("Попробовать снова", onRestart, Modifier.fillMaxWidth())
        Spacer(Modifier.height(7.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            SecondaryButton("↻ Повторить", onRestart, Modifier.weight(1f))
            SecondaryButton("⌂ В меню", onMap, Modifier.weight(1f))
        }
    }
}

@Composable
private fun BmtPauseOverlay(onResume: () -> Unit, onRestart: () -> Unit, onMap: () -> Unit) {
    BmtOverlay {
        Text("Ⅱ", Modifier.fillMaxWidth(), color = Color(0xFF9A6A14), fontWeight = FontWeight.Black, fontSize = 42.sp, textAlign = TextAlign.Center)
        Text("Пауза", Modifier.fillMaxWidth(), color = Ink, fontWeight = FontWeight.Black, fontSize = 28.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(12.dp))
        PrimaryButton("Продолжить", onResume, Modifier.fillMaxWidth())
        Spacer(Modifier.height(7.dp))
        SecondaryButton("Начать заново", onRestart, Modifier.fillMaxWidth())
        Spacer(Modifier.height(7.dp))
        SecondaryButton("В меню", onMap, Modifier.fillMaxWidth())
    }
}

@Composable
private fun BmtOverlay(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0x99304764)).padding(18.dp), contentAlignment = Alignment.Center) {
        Surface(Modifier.fillMaxWidth().widthIn(max = 480.dp), RoundedCornerShape(28.dp), color = Color.White, shadowElevation = 18.dp) {
            Column(Modifier.padding(15.dp), horizontalAlignment = Alignment.CenterHorizontally, content = content)
        }
    }
}

@Composable
private fun BmtMetric(value: String, label: String, color: Color, modifier: Modifier) {
    Surface(modifier, RoundedCornerShape(15.dp), color = Color.White.copy(.9f), border = BorderStroke(1.dp, color.copy(.12f))) {
        Column(Modifier.padding(horizontal = 5.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, color = color, fontWeight = FontWeight.Black, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(label.uppercase(), color = InkSoft, fontWeight = FontWeight.Bold, fontSize = 8.sp, maxLines = 1)
        }
    }
}

@Composable
private fun BmtGoalChip(assets: AssetRepository, goal: BmtGoal, current: Int, modifier: Modifier) {
    val done = current >= goal.count
    Surface(modifier.heightIn(min = 48.dp), RoundedCornerShape(16.dp), color = if (done) Color(0xFFE8F8EF) else Color.White.copy(.92f), border = BorderStroke(1.dp, if (done) Success.copy(.25f) else Indigo.copy(.1f))) {
        Row(Modifier.padding(horizontal = 7.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            BmtGoalIcon(assets, goal, 29)
            Spacer(Modifier.width(5.dp))
            Column {
                Text(goalShort(goal), color = if (done) Success else InkSoft, fontSize = 8.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text("${current.coerceAtMost(goal.count)}/${goal.count}", color = if (done) Success else Ink, fontSize = 12.sp, fontWeight = FontWeight.Black)
            }
        }
    }
}

@Composable
private fun BmtGoalIcon(assets: AssetRepository, goal: BmtGoal, size: Int) {
    val asset = when (goal.type) {
        BmtGoalType.SCORE -> "assets/biblical-match-three/icons-v17/score.webp"
        BmtGoalType.COLLECT -> goal.symbol?.asset
        BmtGoalType.CLEAR_BLOCKERS, BmtGoalType.LIGHT_LAMPS -> goal.blocker?.asset ?: BmtBlockerType.LAMP.asset
        BmtGoalType.ACTIVATE_SPECIALS -> BmtSpecial.LINE_H.asset
        BmtGoalType.CASCADE -> BmtSpecial.BURST.asset
    }
    if (asset != null) AssetImage(assets, asset, Modifier.size(size.dp))
    else Text("✦", color = Indigo, fontSize = (size * .62f).sp)
}

private fun goalDescription(goal: BmtGoal): String = when (goal.type) {
    BmtGoalType.SCORE -> "Набрать ${goal.count} очков"
    BmtGoalType.COLLECT -> "Собрать «${goal.symbol?.label}» ×${goal.count}"
    BmtGoalType.CLEAR_BLOCKERS -> "Разрушить «${goal.blocker?.label}» ×${goal.count}"
    BmtGoalType.LIGHT_LAMPS -> "Зажечь светильники ×${goal.count}"
    BmtGoalType.ACTIVATE_SPECIALS -> "Активировать особые фишки ×${goal.count}"
    BmtGoalType.CASCADE -> "Создать каскад ×${goal.count}"
}

private fun goalShort(goal: BmtGoal): String = when (goal.type) {
    BmtGoalType.SCORE -> "Очки"
    BmtGoalType.COLLECT -> goal.symbol?.label ?: "Собрать"
    BmtGoalType.CLEAR_BLOCKERS -> goal.blocker?.label ?: "Преграды"
    BmtGoalType.LIGHT_LAMPS -> "Светильники"
    BmtGoalType.ACTIVATE_SPECIALS -> "Особые"
    BmtGoalType.CASCADE -> "Каскад"
}

private fun chapterTitle(index: Int): String = when (index) {
    0 -> "Свет и призвание"
    1 -> "Путь обетования"
    else -> "Царство и надежда"
}

private fun freeTarget(mode: BmtFreeMode): Int = when (mode) {
    BmtFreeMode.EASY -> 3_000
    BmtFreeMode.MEDIUM -> 4_500
    BmtFreeMode.HARD -> 6_200
}

private fun freeChallengeSeeds(mode: BmtFreeMode, mask: List<Boolean>): List<BmtBlockerSeed> {
    if (mode == BmtFreeMode.EASY) return emptyList()
    val active = mask.indices.filter { mask[it] }
    val used = mutableSetOf<Int>()
    fun pick(count: Int, offset: Int): List<Int> = buildList {
        repeat(count) { number ->
            if (active.isEmpty()) return@repeat
            var slot = (((number + .5) * active.size / count) + offset * 3).toInt() % active.size
            var candidate = active[slot]
            var probe = 0
            while (candidate in used && probe < active.size) {
                probe += 1
                slot = (slot + 1) % active.size
                candidate = active[slot]
            }
            if (used.add(candidate)) add(candidate)
        }
    }
    return if (mode == BmtFreeMode.MEDIUM) listOf(
        BmtBlockerSeed(BmtBlockerType.CHAIN, pick(6, 1), 1),
        BmtBlockerSeed(BmtBlockerType.TABLET, pick(4, 3), 1),
    ) else listOf(
        BmtBlockerSeed(BmtBlockerType.CHAIN, pick(8, 1), 2),
        BmtBlockerSeed(BmtBlockerType.TABLET, pick(6, 4), 2),
        BmtBlockerSeed(BmtBlockerType.LAMP, pick(4, 7), 1),
    )
}
