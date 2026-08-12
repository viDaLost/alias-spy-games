package com.vidalost.biblegames.games

import android.graphics.Paint
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.window.DialogProperties
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.model.PlayerProfile
import com.vidalost.biblegames.model.WordSearchLevel
import com.vidalost.biblegames.ui.ConfettiOverlay
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
import java.security.SecureRandom
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

private const val WORD_SEARCH_HINT_COST = 4
private const val WORD_SEARCH_REWARD = 2
private const val WORD_SEARCH_LEVEL_REWARD = 8

private data class SearchCell(val row: Int, val col: Int)
private data class SearchBoard(val letters: List<List<Char>>, val placements: LinkedHashMap<String, List<SearchCell>>)

@Composable
fun WordSearchGame(
    assets: AssetRepository,
    profile: PlayerProfile,
    onProfileChange: (PlayerProfile) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("bible_games_native", 0) }
    val levels = remember { assets.wordSearchLevels() }
    val userKey = profile.id.ifBlank { "anon" }
    val currentKey = "ws_${userKey}_current"
    var levelIndex by rememberSaveable(userKey) { mutableIntStateOf(prefs.getInt(currentKey, 0).coerceIn(0, levels.lastIndex)) }
    var stars by rememberSaveable(userKey) { mutableIntStateOf(profile.wordSearchStars) }
    val completed = remember(userKey) {
        mutableStateListOf<Int>().apply { addAll(prefs.getStringSet("ws_${userKey}_completed", emptySet()).orEmpty().mapNotNull(String::toIntOrNull)) }
    }
    val rewarded = remember(userKey) {
        mutableStateListOf<Int>().apply { addAll(prefs.getStringSet("ws_${userKey}_rewarded", emptySet()).orEmpty().mapNotNull(String::toIntOrNull)) }
    }
    val level = levels[levelIndex]
    fun key(kind: String) = "ws_${userKey}_${kind}_${level.id}"
    var boardSeed by remember(level.id) {
        val saved = prefs.getLong(key("seed"), 0L)
        val actual = if (saved != 0L) saved else SecureRandom().nextLong().let { if (it == 0L) 1L else it }
        if (saved == 0L) prefs.edit().putLong(key("seed"), actual).apply()
        mutableLongStateOf(actual)
    }
    val board = remember(level.id, boardSeed) { generateSearchBoard(level, boardSeed) }
    val targetWords = remember(board) { board.placements.keys.toList() }
    val found = remember(level.id) {
        mutableStateListOf<String>().apply {
            addAll(prefs.getStringSet(key("found"), emptySet()).orEmpty().filter { it in targetWords })
        }
    }
    val revealed = remember(level.id) {
        mutableStateListOf<String>().apply {
            addAll(prefs.getStringSet(key("revealed"), emptySet()).orEmpty().filter { it in targetWords })
        }
    }
    var selection by remember(level.id, boardSeed) { mutableStateOf(emptyList<SearchCell>()) }
    var wrongPulse by remember { mutableIntStateOf(0) }
    var levelsOpen by remember { mutableStateOf(false) }
    var showWin by remember(level.id) { mutableStateOf(false) }
    var toast by remember { mutableStateOf("") }
    var toastToken by remember { mutableIntStateOf(0) }
    val colors = remember {
        listOf(
            Color(0xFFDBEAFE), Color(0xFFDCFCE7), Color(0xFFFEF08A), Color(0xFFFCE7F3),
            Color(0xFFF3E8FF), Color(0xFFFFEDD5), Color(0xFFCCFBF1), Color(0xFFFEE2E2),
        )
    }

    fun persistSet(kind: String, value: Collection<String>) {
        prefs.edit().putStringSet(key(kind), value.toSet()).apply()
    }
    fun persistGlobal(kind: String, value: Collection<Int>) {
        prefs.edit().putStringSet("ws_${userKey}_$kind", value.map(Int::toString).toSet()).apply()
    }
    fun changeStars(delta: Int) {
        val next = (stars + delta).coerceAtLeast(0)
        stars = next
        onProfileChange(profile.copy(wordSearchStars = next))
    }
    fun showToast(value: String) {
        toast = value; toastToken++
    }
    fun completeIfNeeded(): Int {
        if (targetWords.isEmpty() || !targetWords.all(found::contains)) return 0
        if (level.id !in completed) {
            completed += level.id
            persistGlobal("completed", completed)
        }
        var reward = 0
        if (level.id !in rewarded) {
            rewarded += level.id
            persistGlobal("rewarded", rewarded)
            reward = WORD_SEARCH_LEVEL_REWARD
        }
        showWin = true
        return reward
    }
    fun submit(cells: List<SearchCell>) {
        selection = emptyList()
        if (cells.size < 2) return
        val raw = cells.joinToString("") { board.letters[it.row][it.col].toString() }
        val match = board.placements.entries.firstOrNull { (word, path) ->
            word !in found && (word == raw || word == raw.reversed()) && (path == cells || path == cells.reversed())
        }
        if (match == null) {
            wrongPulse++
            return
        }
        found += match.key
        persistSet("found", found)
        val completionReward = completeIfNeeded()
        changeStars(WORD_SEARCH_REWARD + completionReward)
        showToast("Найдено: ${match.key} · +${WORD_SEARCH_REWARD}⭐")
    }
    fun hint() {
        if (stars < WORD_SEARCH_HINT_COST) return showToast("Нужно ${WORD_SEARCH_HINT_COST}⭐")
        val missing = targetWords.filterNot(found::contains)
        if (missing.isEmpty()) return
        val word = missing.random()
        found += word
        revealed += word
        persistSet("found", found); persistSet("revealed", revealed)
        val completionReward = completeIfNeeded()
        changeStars(-WORD_SEARCH_HINT_COST + completionReward)
    }
    fun reset() {
        val manualFound = (found.toSet() - revealed.toSet()).size
        val penalty = manualFound * WORD_SEARCH_REWARD
        if (penalty > 0) {
            changeStars(-penalty)
            showToast("Списано $penalty⭐ за сброшенный прогресс")
        }
        found.clear(); revealed.clear(); selection = emptyList(); showWin = false
        completed.remove(level.id)
        persistGlobal("completed", completed)
        persistSet("found", found); persistSet("revealed", revealed)
        boardSeed = SecureRandom().nextLong().let { if (it == 0L) 1L else it }
        prefs.edit().putLong(key("seed"), boardSeed).apply()
    }
    fun selectLevel(index: Int) {
        levelIndex = index.coerceIn(0, levels.lastIndex)
        prefs.edit().putInt(currentKey, levelIndex).apply()
        levelsOpen = false
    }

    LaunchedEffect(profile.wordSearchStars) {
        if (profile.wordSearchStars != stars) stars = profile.wordSearchStars
    }
    LaunchedEffect(toastToken) {
        if (toastToken > 0) {
            val token = toastToken
            delay(1_600)
            if (token == toastToken) toast = ""
        }
    }

    val manualFound = (found.toSet() - revealed.toSet()).size
    val resetPenalty = manualFound * WORD_SEARCH_REWARD
    val paths = found.mapNotNull { word ->
        board.placements[word]?.let { path -> Triple(word, path, targetWords.indexOf(word).coerceAtLeast(0)) }
    }

    GameScaffold("Поиск слов", "Библейские темы", onBack, scroll = false) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            GlassCard(
                Modifier.weight(1f).heightIn(min = 56.dp).bounceClick { levelsOpen = true }, padding = 9.dp,
            ) {
                Text("Тема: ${level.theme}", color = Ink, fontSize = 13.sp, lineHeight = 16.sp, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("Уровень ${levelIndex + 1} · Меню", color = InkSoft, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.size(7.dp))
            StatusPill("⭐ $stars", Gold)
        }
        Spacer(Modifier.height(7.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            PrimaryButton("Подсказка −4⭐", ::hint, Modifier.weight(1f), enabled = stars >= WORD_SEARCH_HINT_COST, icon = "💡")
            SecondaryButton(if (resetPenalty > 0) "Сброс −$resetPenalty⭐" else "Сброс", ::reset, Modifier.weight(1f), icon = "♻")
        }
        Spacer(Modifier.height(6.dp))
        Text("Слов: ${targetWords.size} · Найдено: ${found.size}/${targetWords.size}", Modifier.fillMaxWidth(), color = Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        SearchBoardCanvas(
            board = board,
            found = paths,
            selection = selection,
            colors = colors,
            wrongPulse = wrongPulse,
            onSelection = { selection = it },
            onSubmit = ::submit,
            modifier = Modifier.fillMaxWidth().weight(1f).aspectRatio(level.cols.toFloat() / level.rows),
        )
        AnimatedVisibility(toast.isNotBlank(), enter = slideInVertically { it / 2 } + fadeIn(), exit = slideOutVertically { it / 2 } + fadeOut()) {
            Text(toast, Modifier.fillMaxWidth().heightIn(min = 27.dp).padding(top = 5.dp), color = Indigo, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, textAlign = TextAlign.Center)
        }
        if (toast.isBlank()) Spacer(Modifier.height(27.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PrimaryButton("Пред.", { selectLevel(levelIndex - 1) }, Modifier.weight(1f), enabled = levelIndex > 0, icon = "←")
            PrimaryButton("След.", { selectLevel(levelIndex + 1) }, Modifier.weight(1f), enabled = levelIndex < levels.lastIndex, icon = "→")
        }
    }

    if (levelsOpen) SearchLevelsDialog(levels, levelIndex, completed, ::selectLevel) { levelsOpen = false }
    if (showWin) {
        Dialog(onDismissRequest = {}, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Box(Modifier.fillMaxSize().background(Color(0x660F172A)).padding(18.dp), contentAlignment = Alignment.Center) {
                GlassCard(Modifier.fillMaxWidth()) {
                    Text("✅ Уровень пройден!", Modifier.fillMaxWidth(), color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                    Text("Тема: ${level.theme}", Modifier.fillMaxWidth().padding(top = 7.dp), color = InkSoft, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(16.dp))
                    PrimaryButton("Следующий уровень", {
                        showWin = false
                        if (levelIndex < levels.lastIndex) selectLevel(levelIndex + 1)
                    }, Modifier.fillMaxWidth(), icon = "→")
                    Spacer(Modifier.height(8.dp))
                    SecondaryButton("В меню игры", onBack, Modifier.fillMaxWidth(), icon = "←")
                }
                ConfettiOverlay(true, Modifier.fillMaxSize())
            }
        }
    }
}

@Composable
private fun SearchBoardCanvas(
    board: SearchBoard,
    found: List<Triple<String, List<SearchCell>, Int>>,
    selection: List<SearchCell>,
    colors: List<Color>,
    wrongPulse: Int,
    onSelection: (List<SearchCell>) -> Unit,
    onSubmit: (List<SearchCell>) -> Unit,
    modifier: Modifier,
) {
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    val shake = remember { Animatable(0f) }
    LaunchedEffect(wrongPulse) {
        if (wrongPulse > 0) shake.animateTo(0f, keyframes {
            durationMillis = 260
            0f at 0; -9f at 45; 8f at 90; -7f at 135; 5f at 185; 0f at 260
        })
    }
    val rows = board.letters.size
    val cols = board.letters.firstOrNull()?.size ?: 1
    val solved = found.flatMap { it.second }.toSet()
    fun cellAt(position: Offset): SearchCell? {
        if (canvasSize.width <= 0 || canvasSize.height <= 0) return null
        val col = (position.x / (canvasSize.width / cols.toFloat())).toInt()
        val row = (position.y / (canvasSize.height / rows.toFloat())).toInt()
        return SearchCell(row, col).takeIf { row in 0 until rows && col in 0 until cols }
    }
    fun append(path: List<SearchCell>, cell: SearchCell): List<SearchCell> {
        if (cell in solved) return path
        if (path.isEmpty()) return listOf(cell)
        if (path.size >= 2 && path[path.lastIndex - 1] == cell) return path.dropLast(1)
        if (cell in path) return path
        val last = path.last()
        if (kotlin.math.abs(last.row - cell.row) + kotlin.math.abs(last.col - cell.col) != 1) return path
        return path + cell
    }
    val haptic = LocalHapticFeedback.current
    Canvas(
        modifier.graphicsLayer { translationX = shake.value }.clip(RoundedCornerShape(20.dp))
            .background(Color.White.copy(.94f)).border(1.dp, Color.White, RoundedCornerShape(20.dp))
            .onSizeChanged { canvasSize = it }
            .pointerInput(board, canvasSize, solved) {
                var gesture = emptyList<SearchCell>()
                detectDragGestures(
                    onDragStart = { position ->
                        gesture = cellAt(position)?.let { append(emptyList(), it) }.orEmpty()
                        onSelection(gesture)
                        if (gesture.isNotEmpty()) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    },
                    onDrag = { change, _ ->
                        cellAt(change.position)?.let { cell ->
                            val next = append(gesture, cell)
                            if (next != gesture) {
                                gesture = next; onSelection(gesture)
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            }
                        }
                    },
                    onDragEnd = { onSubmit(gesture); gesture = emptyList() },
                    onDragCancel = { gesture = emptyList(); onSelection(emptyList()) },
                )
            },
    ) {
        val cellW = size.width / cols; val cellH = size.height / rows
        fun center(cell: SearchCell) = Offset((cell.col + .5f) * cellW, (cell.row + .5f) * cellH)
        val cellColors = mutableMapOf<SearchCell, Color>()
        found.forEach { entry -> entry.second.forEach { cellColors[it] = colors[entry.third % colors.size] } }
        for (row in 0 until rows) for (col in 0 until cols) {
            val cell = SearchCell(row, col)
            drawRoundRect(
                cellColors[cell] ?: Color(0xFFF6F8FC),
                Offset(col * cellW + 1.5f, row * cellH + 1.5f),
                Size(cellW - 3f, cellH - 3f),
                androidx.compose.ui.geometry.CornerRadius(minOf(cellW, cellH) * .17f),
            )
        }
        found.forEach { (_, pathCells, _) -> drawSearchPath(pathCells, ::center, Color.Black.copy(.10f), minOf(cellW, cellH) * .08f) }
        drawSearchPath(selection, ::center, Indigo.copy(.45f), minOf(cellW, cellH) * .08f)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = Paint.Align.CENTER; typeface = android.graphics.Typeface.DEFAULT_BOLD; textSize = minOf(cellW, cellH) * .43f
        }
        for (row in 0 until rows) for (col in 0 until cols) {
            val cell = SearchCell(row, col); val at = center(cell)
            paint.color = Ink.toArgb()
            drawContext.canvas.nativeCanvas.drawText(board.letters[row][col].toString(), at.x, at.y - (paint.ascent() + paint.descent()) / 2, paint)
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawSearchPath(
    cells: List<SearchCell>,
    center: (SearchCell) -> Offset,
    color: Color,
    width: Float,
) {
    if (cells.size < 2) return
    val path = Path().apply {
        val first = center(cells.first()); moveTo(first.x, first.y)
        cells.drop(1).forEach { val point = center(it); lineTo(point.x, point.y) }
    }
    drawPath(path, color, style = Stroke(width, cap = StrokeCap.Round))
    val tip = center(cells.last()); val before = center(cells[cells.lastIndex - 1])
    val angle = atan2(tip.y - before.y, tip.x - before.x)
    val length = width * 2.7f
    val arrow = Path().apply {
        moveTo(tip.x, tip.y)
        lineTo(tip.x - cos(angle - PI / 6).toFloat() * length, tip.y - sin(angle - PI / 6).toFloat() * length)
        lineTo(tip.x - cos(angle + PI / 6).toFloat() * length, tip.y - sin(angle + PI / 6).toFloat() * length)
        close()
    }
    drawPath(arrow, color)
}

@Composable
private fun SearchLevelsDialog(levels: List<WordSearchLevel>, selected: Int, completed: List<Int>, onSelect: (Int) -> Unit, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose) {
        GlassCard(Modifier.fillMaxWidth().height(500.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Выбор уровня", color = Ink, fontSize = 23.sp, fontWeight = FontWeight.Black)
                SecondaryButton("×", onClose, Modifier.size(42.dp))
            }
            Spacer(Modifier.height(12.dp))
            LazyVerticalGrid(GridCells.Fixed(5), Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(7.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                items(levels.indices.toList()) { index ->
                    val done = levels[index].id in completed
                    Box(
                        Modifier.aspectRatio(1f).clip(RoundedCornerShape(14.dp))
                            .background(when { index == selected -> Indigo; done -> Color(0xFFDCFCE7); else -> Color(0xFFF1F5F9) })
                            .bounceClick { onSelect(index) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text((index + 1).toString(), color = if (index == selected) Color.White else Ink, fontWeight = FontWeight.Black)
                            if (done) Text("✓", color = if (index == selected) Color.White else Success, fontSize = 10.sp)
                        }
                    }
                }
            }
        }
    }
}

private fun generateSearchBoard(level: WordSearchLevel, seed: Long): SearchBoard {
    val random = Random(seed)
    var bestGrid: Array<CharArray>? = null
    var bestPaths = linkedMapOf<String, List<SearchCell>>()
    var maxPlaced = -1
    val sorted = level.words.sortedByDescending(String::length)
    for (attempt in 0 until 200) {
        val grid = Array(level.rows) { CharArray(level.cols) { '\u0000' } }
        val paths = linkedMapOf<String, List<SearchCell>>()
        for (word in sorted) {
            var path: List<SearchCell>? = null
            repeat(15) {
                if (path == null) path = placeSearchWord(word, grid, random)
            }
            if (path == null) break
            paths[word] = path!!
        }
        if (paths.size == sorted.size) {
            bestGrid = grid; bestPaths = paths
            break
        }
        if (paths.size > maxPlaced) {
            maxPlaced = paths.size
            bestGrid = Array(level.rows) { grid[it].clone() }
            bestPaths = LinkedHashMap(paths)
        }
    }
    val grid = bestGrid ?: Array(level.rows) { CharArray(level.cols) { '\u0000' } }
    val alphabet = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ"
    for (row in 0 until level.rows) for (col in 0 until level.cols) if (grid[row][col] == '\u0000') grid[row][col] = alphabet.random(random)
    return SearchBoard(grid.map(CharArray::toList), bestPaths)
}

private fun placeSearchWord(word: String, grid: Array<CharArray>, random: Random): List<SearchCell>? {
    val cells = buildList { for (row in grid.indices) for (col in grid[row].indices) add(SearchCell(row, col)) }.shuffled(random)
    for (start in cells) {
        if (grid[start.row][start.col] != '\u0000') continue
        val path = mutableListOf(start)
        grid[start.row][start.col] = word.first()
        if (searchWordDfs(word, 1, start, path, grid, random)) return path.toList()
        grid[start.row][start.col] = '\u0000'
    }
    return null
}

private fun searchWordDfs(
    word: String,
    index: Int,
    current: SearchCell,
    path: MutableList<SearchCell>,
    grid: Array<CharArray>,
    random: Random,
): Boolean {
    if (index == word.length) return true
    val directions = listOf(0 to 1, 1 to 0, 0 to -1, -1 to 0).shuffled(random)
    for ((dr, dc) in directions) {
        val next = SearchCell(current.row + dr, current.col + dc)
        if (next.row !in grid.indices || next.col !in grid[0].indices || next in path || grid[next.row][next.col] != '\u0000') continue
        grid[next.row][next.col] = word[index]
        path += next
        if (searchWordDfs(word, index + 1, next, path, grid, random)) return true
        path.removeAt(path.lastIndex)
        grid[next.row][next.col] = '\u0000'
    }
    return false
}
