package com.vidalost.biblegames.games

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.model.PlayerProfile
import com.vidalost.biblegames.ui.AssetImage
import com.vidalost.biblegames.ui.GameScaffold
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
            onLevel = { chosen ->
                levelId = chosen.id
                freeModeName = null
                selectedPreBoosters = emptySet()
                screen = BmtScreen.PRE_LEVEL
            },
            onFree = { mode ->
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
    onLevel: (BmtLevel) -> Unit,
    onFree: (BmtFreeMode) -> Unit,
    onBack: () -> Unit,
) {
    val unlocked = progress.unlocked()
    val stars = levels.sumOf { progress.rating(it.id) }
    GameScaffold("Библейские сокровища", "Путь света · 30 уровней", onBack, scroll = false) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BmtMetric("★ $wallet", "баланс", Color(0xFFB7791F), Modifier.weight(1f))
            BmtMetric("$stars / 90 ★", "прогресс", Indigo, Modifier.weight(1f))
        }
        Spacer(Modifier.height(8.dp))
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
            item("free_title") {
                Text("СВОБОДНАЯ ИГРА", Modifier.padding(top = 12.dp), color = Ink, fontWeight = FontWeight.Black, fontSize = 15.sp)
            }
            items(BmtFreeMode.entries, key = BmtFreeMode::name) { mode ->
                SecondaryButton(
                    "${mode.title} · 30 ходов · рекорд ${progress.freeBest(mode.name)}",
                    { onFree(mode) },
                    Modifier.fillMaxWidth(),
                    accent = Indigo,
                )
            }
            item { Spacer(Modifier.height(14.dp)) }
        }
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
    val mask = remember(level?.id, freeMode) { BmtEngine.activeMask(shape, rows, blockerSeeds = level?.blockerSeeds.orEmpty()) }
    val symbols = remember(level?.id, freeMode) {
        level?.let(BmtEngine::symbolPool) ?: BmtSymbol.entries.take(freeMode?.symbolCount ?: 7)
    }
    val config = remember(level?.id, freeMode) { BmtBoardConfig(rows, symbols = symbols, mask = mask) }
    val initialBlockers = remember(level?.id) { level?.let(BmtEngine::blockersFrom).orEmpty() }
    val initialBlockerCounts = remember(level?.id) { initialBlockers.values.groupingBy(BmtBlocker::type).eachCount() }
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
        if (combo == null && BmtEngine.findGroups(swapped, rows).isEmpty()) {
            selected = null
            hint = null
            return
        }
        busy = true
        selected = null
        hint = null
        moves -= 1
        board = swapped
        scope.launch {
            delay(105)
            applyTurn(BmtEngine.resolveTurn(swapped, blockers, config, preferred = listOf(b, a), forcedClear = combo))
            delay(90)
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
        result = null
    }

    Box(Modifier.fillMaxSize()) {
        GameScaffold(
            level?.title ?: "Свободно · ${freeMode?.title.orEmpty()}",
            level?.let { "Уровень ${it.id}" } ?: "Библейские сокровища",
            onBack,
            scroll = false,
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
                    Modifier.size(boardWidth, boardHeight).clip(RoundedCornerShape(24.dp))
                        .background(Brush.verticalGradient(listOf(Color(0xFFDDEBFF), Color(0xFFE8E2FF), Color(0xFFD7F4FF)))),
                ) {
                    AssetImage(assets, "assets/biblical-match-three/board-background-v35.webp", Modifier.fillMaxSize(), ContentScale.Crop)
                    Column(Modifier.fillMaxSize().padding(4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        for (row in 0 until rows) {
                            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
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
    modifier: Modifier,
    onTap: () -> Unit,
    onSwipe: (BmtSwipe) -> Unit,
) {
    val scale by animateFloatAsState(if (selected || hinted) 1.06f else 1f, label = "bmtTileScale")
    var dx = 0f
    var dy = 0f
    val drag = Modifier.pointerInput(enabled) {
        if (!enabled) return@pointerInput
        detectDragGestures(
            onDragStart = { dx = 0f; dy = 0f },
            onDragEnd = {
                if (maxOf(abs(dx), abs(dy)) >= 18f) {
                    onSwipe(if (abs(dx) > abs(dy)) if (dx < 0) BmtSwipe.LEFT else BmtSwipe.RIGHT else if (dy < 0) BmtSwipe.UP else BmtSwipe.DOWN)
                }
            },
            onDrag = { change, amount ->
                change.consume()
                dx += amount.x
                dy += amount.y
            },
        )
    }
    Surface(
        modifier.scale(scale).then(drag).bounceClick(enabled, onTap),
        RoundedCornerShape(11.dp),
        color = if (targeted) Color(0xFFFFF3BF) else Color.White.copy(.93f),
        border = BorderStroke(if (selected || hinted || targeted) 2.dp else 1.dp, if (selected || hinted) Indigo else if (targeted) Color(0xFFE3AC39) else Color.White),
        shadowElevation = if (selected || hinted) 6.dp else 2.dp,
    ) {
        Box(Modifier.fillMaxSize().padding(2.dp), contentAlignment = Alignment.Center) {
            AssetImage(assets, cell.special?.asset ?: cell.symbol.asset, Modifier.fillMaxSize().padding(if (cell.special == null) 1.dp else 0.dp))
            cell.special?.let { special ->
                val marker = when (special) { BmtSpecial.LINE_H -> "↔"; BmtSpecial.LINE_V -> "↕"; BmtSpecial.BURST -> "✦"; BmtSpecial.RAINBOW -> "◎" }
                Surface(Modifier.align(Alignment.TopEnd).size(15.dp), CircleShape, color = Indigo.copy(.88f)) {
                    Box(contentAlignment = Alignment.Center) { Text(marker, color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Black) }
                }
            }
            blocker?.let { current ->
                val asset = if (current.type == BmtBlockerType.LAMP && current.lit) BmtSymbol.LAMP.asset else current.type.asset
                Box(Modifier.fillMaxSize().background(Color(0x884B3B70), RoundedCornerShape(9.dp)), contentAlignment = Alignment.Center) {
                    AssetImage(assets, asset, Modifier.fillMaxSize().padding(3.dp))
                    if (current.layers > 1) Surface(Modifier.align(Alignment.BottomEnd).size(15.dp), CircleShape, color = Color(0xFF7C3AED)) {
                        Box(contentAlignment = Alignment.Center) { Text(current.layers.toString(), color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Black) }
                    }
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
