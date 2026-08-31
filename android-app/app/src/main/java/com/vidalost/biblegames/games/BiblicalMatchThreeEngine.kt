package com.vidalost.biblegames.games

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.random.Random

internal const val BMT_COLS = 8

internal enum class BmtSymbol(
    val id: String,
    val label: String,
    val asset: String,
    val color: Long,
) {
    BIBLE("bible", "Библия", "assets/biblical-match-three/icons-v17/bible.webp", 0xFF315F91),
    FISH("fish", "Рыба", "assets/biblical-match-three/icons-v17/fish.webp", 0xFF2D8AA8),
    DOVE("dove", "Голубь", "assets/biblical-match-three/icons-v17/dove.webp", 0xFF7C8DA6),
    LAMP("lamp", "Светильник", "assets/biblical-match-three/icons-v17/candle.webp", 0xFFD39B39),
    CROWN("crown", "Венец", "assets/biblical-match-three/icons-v17/crown.webp", 0xFFB7791F),
    ARK("ark", "Ковчег", "assets/biblical-match-three/icons-v17/ark.webp", 0xFF8B5E3C),
    BREAD("bread", "Хлеб", "assets/biblical-match-three/icons-v17/bread.webp", 0xFFC78B45),
    GRAPES("grapes", "Виноград", "assets/biblical-match-three/icons-v17/grapes.webp", 0xFF7553AA),
    TABLETS("tablets", "Скрижали", "assets/biblical-match-three/icons-v17/tablets.webp", 0xFF64748B),
    ;

    companion object {
        fun fromId(id: String?) = entries.firstOrNull { it.id == id }
    }
}

internal enum class BmtSpecial(val label: String, val asset: String) {
    LINE_H("Труба по ряду", "assets/biblical-match-three/icons-v17/staff.webp"),
    LINE_V("Труба по столбцу", "assets/biblical-match-three/icons-v17/staff.webp"),
    BURST("Свет Иерихона", "assets/biblical-match-three/icons-v17/jericho.webp"),
    RAINBOW("Радуга Завета", "assets/biblical-match-three/icons-v17/covenant.webp"),
}

internal enum class BmtBlockerType(val id: String, val label: String, val asset: String) {
    TABLET("tablet", "Скрижали", "assets/biblical-match-three/icons-v17/tablets.webp"),
    CHAIN("chain", "Цепи", "assets/biblical-match-three/icons-v17/chains.webp"),
    LAMP("lamp", "Светильники", "assets/biblical-match-three/icons-v29/lamp-unlit.webp"),
    ;

    companion object {
        fun fromId(id: String?) = entries.firstOrNull { it.id == id }
    }
}

internal enum class BmtGoalType {
    SCORE, COLLECT, CLEAR_BLOCKERS, LIGHT_LAMPS, ACTIVATE_SPECIALS, CASCADE;

    companion object {
        fun fromId(id: String?) = when (id) {
            "score" -> SCORE
            "collect" -> COLLECT
            "clearBlockers" -> CLEAR_BLOCKERS
            "lightLamps" -> LIGHT_LAMPS
            "activateSpecials" -> ACTIVATE_SPECIALS
            "cascade" -> CASCADE
            else -> null
        }
    }
}

internal enum class BmtBoardShape {
    RECT, OVAL, BOWL, DIAMOND, CROSS, SHIELD;

    companion object {
        fun fromId(id: String?) = entries.firstOrNull { it.name.equals(id, ignoreCase = true) }
    }
}

internal enum class BmtPreBooster(
    val title: String,
    val shortTitle: String,
    val description: String,
    val cost: Int,
    val asset: String,
) {
    MANNA("Манна с небес", "Манна", "Две направленные особые фишки", 6, "assets/biblical-match-three/icons-v17/bread.webp"),
    LAMP_OIL("Масло светильника", "Масло", "Одна фишка-вспышка", 8, "assets/biblical-match-three/icons-v17/candle.webp"),
    COVENANT("Радуга Завета", "Радуга", "Одна радужная фишка", 12, "assets/biblical-match-three/icons-v17/covenant.webp"),
}

internal enum class BmtBooster(
    val title: String,
    val shortTitle: String,
    val description: String,
    val cost: Int,
    val asset: String,
    val needsTarget: Boolean,
) {
    SLING("Праща Давида", "Праща", "Убирает одну клетку", 5, "assets/biblical-match-three/icons-v17/sling.webp", true),
    STAFF("Посох Моисея", "Посох", "Очищает столбец", 7, "assets/biblical-match-three/icons-v17/staff.webp", true),
    JERICHO("Трубы Иерихона", "Трубы", "Очищают область 3×3", 10, "assets/biblical-match-three/icons-v17/jericho.webp", true),
    ARK("Ноев ковчег", "Ковчег", "Перемешивает и даёт две особые", 8, "assets/biblical-match-three/icons-v17/ark.webp", false),
}

internal data class BmtCell(val symbol: BmtSymbol, val special: BmtSpecial? = null)
internal data class BmtBlocker(val type: BmtBlockerType, val layers: Int, val maxLayers: Int, val lit: Boolean = false)
internal data class BmtBlockerSeed(val type: BmtBlockerType, val cells: List<Int>, val layers: Int)
internal data class BmtGoal(
    val type: BmtGoalType,
    val count: Int,
    val symbol: BmtSymbol? = null,
    val blocker: BmtBlockerType? = null,
)

internal data class BmtLevel(
    val id: Int,
    val title: String,
    val moves: Int,
    val rows: Int,
    val symbolCount: Int,
    val reward: Int,
    val starThresholds: List<Int>,
    val goals: List<BmtGoal>,
    val blockerSeeds: List<BmtBlockerSeed>,
    val shape: BmtBoardShape,
)

internal data class BmtBoardConfig(
    val rows: Int,
    val cols: Int = BMT_COLS,
    val symbols: List<BmtSymbol>,
    val mask: List<Boolean>,
)

internal data class BmtMatchGroup(val indices: Set<Int>, val horizontal: Boolean)
internal data class BmtMatchAnalysis(val clearSet: Set<Int>, val creations: Map<Int, BmtSpecial>)
internal data class BmtTurnResult(
    val board: List<BmtCell?>,
    val blockers: Map<Int, BmtBlocker>,
    val scoreDelta: Int,
    val collected: Map<BmtSymbol, Int>,
    val specialsActivated: Int,
    val maxCascade: Int,
)

internal object BmtEngine {
    fun shapeForLevel(id: Int): BmtBoardShape = when (id) {
        1, 2 -> BmtBoardShape.RECT
        3, 6, 12 -> BmtBoardShape.OVAL
        4, 8, 14, 19, 23, 27 -> BmtBoardShape.BOWL
        5, 9, 13, 18, 21, 24, 28 -> BmtBoardShape.DIAMOND
        7, 10, 15, 17, 22, 26, 30 -> BmtBoardShape.CROSS
        else -> BmtBoardShape.SHIELD
    }

    fun activeMask(
        shape: BmtBoardShape,
        rows: Int,
        cols: Int = BMT_COLS,
        blockerSeeds: List<BmtBlockerSeed> = emptyList(),
    ): List<Boolean> {
        val mask = MutableList(rows * cols) { true }
        val cx = (cols - 1) / 2.0
        val cy = (rows - 1) / 2.0
        for (row in 0 until rows) for (col in 0 until cols) {
            val dx = abs(col - cx)
            val dy = abs(row - cy)
            mask[row * cols + col] = when (shape) {
                BmtBoardShape.RECT -> true
                BmtBoardShape.OVAL -> ((col - cx) / max(1.0, cols * .53)).let { it * it } +
                    ((row - cy) / max(1.0, rows * .57)).let { it * it } <= 1.0
                BmtBoardShape.DIAMOND -> dx / max(1.0, cols * .52) + dy / max(1.0, rows * .55) <= 1.0
                BmtBoardShape.CROSS -> dx <= 1.55 || dy <= 1.15
                BmtBoardShape.BOWL -> row >= ((dx / max(1.0, cx)).let { it * it } * max(1.0, rows * .38)).toInt()
                BmtBoardShape.SHIELD -> {
                    val t = if (rows <= 1) 0.0 else row.toDouble() / (rows - 1)
                    val half = if (t < .42) cols * .46 else max(1.35, cols * .46 - (t - .42) * cols * .52)
                    dx <= half
                }
            }
        }
        blockerSeeds.flatMap(BmtBlockerSeed::cells).forEach { index ->
            if (index !in mask.indices) return@forEach
            mask[index] = true
            val row = index / cols
            val col = index % cols
            listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1).forEach { (dr, dc) ->
                val rr = row + dr
                val cc = col + dc
                if (rr in 0 until rows && cc in 0 until cols) mask[rr * cols + cc] = true
            }
        }
        return mask
    }

    fun symbolPool(level: BmtLevel): List<BmtSymbol> {
        val required = level.goals.mapNotNull(BmtGoal::symbol).distinct()
        val pool = BmtSymbol.entries.take(level.symbolCount.coerceIn(3, BmtSymbol.entries.size)).toMutableList()
        required.forEach { symbol ->
            if (symbol in pool) return@forEach
            val slot = pool.indices.reversed().firstOrNull { pool[it] !in required }
            if (slot != null) pool[slot] = symbol else if (pool.size < BmtSymbol.entries.size) pool += symbol
        }
        return pool.distinct()
    }

    fun createPlayableBoard(config: BmtBoardConfig, random: Random = Random.Default): List<BmtCell?> {
        repeat(420) {
            val board = MutableList<BmtCell?>(config.rows * config.cols) { index ->
                if (config.mask.getOrElse(index) { false }) BmtCell(config.symbols.random(random)) else null
            }
            if (findGroups(board, config.rows, config.cols).isEmpty() && findMoves(board, config).size >= 3) return board
        }
        error("Не удалось создать игровое поле с доступными ходами")
    }

    fun blockersFrom(level: BmtLevel): Map<Int, BmtBlocker> = blockersFrom(level.blockerSeeds)

    fun blockersFrom(seeds: List<BmtBlockerSeed>): Map<Int, BmtBlocker> = buildMap {
        seeds.forEach { seed ->
            seed.cells.forEach { index -> put(index, BmtBlocker(seed.type, seed.layers, seed.layers)) }
        }
    }

    fun swap(board: List<BmtCell?>, a: Int, b: Int): List<BmtCell?> {
        if (a !in board.indices || b !in board.indices) return board
        return board.toMutableList().also { next ->
            val value = next[a]
            next[a] = next[b]
            next[b] = value
        }
    }

    fun areAdjacent(a: Int, b: Int, cols: Int = BMT_COLS): Boolean =
        abs(a / cols - b / cols) + abs(a % cols - b % cols) == 1

    fun findGroups(board: List<BmtCell?>, rows: Int, cols: Int = BMT_COLS): List<BmtMatchGroup> {
        val groups = mutableListOf<BmtMatchGroup>()
        for (row in 0 until rows) {
            var col = 0
            while (col < cols) {
                val symbol = board.getOrNull(row * cols + col)?.symbol
                if (symbol == null) { col += 1; continue }
                var end = col + 1
                while (end < cols && board[row * cols + end]?.symbol == symbol) end += 1
                if (end - col >= 3) groups += BmtMatchGroup((col until end).map { row * cols + it }.toSet(), true)
                col = end
            }
        }
        for (col in 0 until cols) {
            var row = 0
            while (row < rows) {
                val symbol = board.getOrNull(row * cols + col)?.symbol
                if (symbol == null) { row += 1; continue }
                var end = row + 1
                while (end < rows && board[end * cols + col]?.symbol == symbol) end += 1
                if (end - row >= 3) groups += BmtMatchGroup((row until end).map { it * cols + col }.toSet(), false)
                row = end
            }
        }
        return groups
    }

    fun analyzeMatches(
        board: List<BmtCell?>,
        rows: Int,
        cols: Int = BMT_COLS,
        preferred: List<Int> = emptyList(),
    ): BmtMatchAnalysis {
        val groups = findGroups(board, rows, cols)
        val clear = groups.flatMap(BmtMatchGroup::indices).toMutableSet()
        val creations = linkedMapOf<Int, BmtSpecial>()
        val horizontal = groups.filter(BmtMatchGroup::horizontal)
        val vertical = groups.filterNot(BmtMatchGroup::horizontal)
        val intersections = horizontal.flatMap { h -> vertical.flatMap { v -> h.indices.intersect(v.indices) } }.distinct()
        val handled = mutableSetOf<BmtMatchGroup>()
        intersections.forEach { intersection ->
            val h = horizontal.firstOrNull { intersection in it.indices } ?: return@forEach
            val v = vertical.firstOrNull { intersection in it.indices } ?: return@forEach
            val anchor = preferred.firstOrNull { it in h.indices || it in v.indices } ?: intersection
            creations.putIfAbsent(anchor, BmtSpecial.BURST)
            handled += h
            handled += v
        }
        groups.filterNot { it in handled }.filter { it.indices.size >= 4 }.forEach { group ->
            val anchor = preferred.firstOrNull { it in group.indices } ?: group.indices.sorted()[group.indices.size / 2]
            val special = when {
                group.indices.size >= 5 -> BmtSpecial.RAINBOW
                group.horizontal -> BmtSpecial.LINE_H
                else -> BmtSpecial.LINE_V
            }
            creations.putIfAbsent(anchor, special)
        }
        clear.removeAll(creations.keys)
        return BmtMatchAnalysis(clear, creations)
    }

    fun findMoves(board: List<BmtCell?>, config: BmtBoardConfig): List<Pair<Int, Int>> {
        val moves = mutableListOf<Pair<Int, Int>>()
        board.indices.forEach { a ->
            if (!config.mask.getOrElse(a) { false } || board[a] == null) return@forEach
            listOf(a + 1, a + config.cols).forEach { b ->
                if (b !in board.indices || !config.mask.getOrElse(b) { false } || !areAdjacent(a, b, config.cols) || board[b] == null) return@forEach
                if (specialComboClearSet(board, a, b, config) != null || findGroups(swap(board, a, b), config.rows, config.cols).isNotEmpty()) moves += a to b
            }
        }
        return moves
    }

    fun specialComboClearSet(board: List<BmtCell?>, a: Int, b: Int, config: BmtBoardConfig): Set<Int>? {
        val first = board.getOrNull(a) ?: return null
        val second = board.getOrNull(b) ?: return null
        val sa = first.special
        val sb = second.special
        if (sa == null && sb == null) return null
        if (sa == BmtSpecial.RAINBOW && sb == BmtSpecial.RAINBOW) return board.indices.filter { board[it] != null }.toSet()
        if (sa == BmtSpecial.RAINBOW || sb == BmtSpecial.RAINBOW) {
            val target = if (sa == BmtSpecial.RAINBOW) second.symbol else first.symbol
            val seed = board.indices.filter { board[it]?.symbol == target }.toMutableSet()
            seed += a
            seed += b
            return expandSpecials(board, seed, config).first
        }
        if (sa != null && sb != null) return expandSpecials(board, setOf(a, b), config).first
        return null
    }

    fun resolveTurn(
        board: List<BmtCell?>,
        blockers: Map<Int, BmtBlocker>,
        config: BmtBoardConfig,
        preferred: List<Int> = emptyList(),
        forcedClear: Set<Int>? = null,
        random: Random = Random.Default,
    ): BmtTurnResult {
        var work = board.toMutableList()
        var obstacleState = blockers.toMutableMap()
        var score = 0
        val collected = mutableMapOf<BmtSymbol, Int>()
        var specialsActivated = 0
        var cascade = 1
        var highestCascade = 1
        var analysis = if (forcedClear != null) BmtMatchAnalysis(forcedClear, emptyMap())
        else analyzeMatches(work, config.rows, config.cols, preferred)

        while (analysis.clearSet.isNotEmpty()) {
            val (expanded, activated) = expandSpecials(work, analysis.clearSet, config)
            specialsActivated += activated
            highestCascade = max(highestCascade, cascade)
            val blockerResult = damageBlockers(obstacleState, expanded, config)
            obstacleState = blockerResult.first.toMutableMap()
            expanded.forEach { index ->
                work.getOrNull(index)?.symbol?.let { symbol -> collected[symbol] = (collected[symbol] ?: 0) + 1 }
            }
            val multiplier = 1.0 + max(0, cascade - 1) * .55
            score += ((expanded.size * 34 + blockerResult.second) * multiplier).roundToInt()
            expanded.forEach { index -> if (index in work.indices) work[index] = null }
            analysis.creations.forEach { (index, special) ->
                val cell = work.getOrNull(index)
                if (cell != null) work[index] = cell.copy(special = special)
            }
            work = collapse(work, config, random).toMutableList()
            cascade += 1
            analysis = analyzeMatches(work, config.rows, config.cols)
        }
        return BmtTurnResult(work, obstacleState, score, collected, specialsActivated, highestCascade)
    }

    fun resolveBooster(
        board: List<BmtCell?>,
        blockers: Map<Int, BmtBlocker>,
        config: BmtBoardConfig,
        booster: BmtBooster,
        index: Int,
    ): BmtTurnResult {
        val clear = when (booster) {
            BmtBooster.SLING -> setOf(index)
            BmtBooster.STAFF -> (0 until config.rows).map { it * config.cols + index % config.cols }.filter { config.mask[it] }.toSet()
            BmtBooster.JERICHO -> areaIndices(index, config).toSet()
            BmtBooster.ARK -> emptySet()
        }
        return resolveTurn(board, blockers, config, forcedClear = clear)
    }

    fun reshuffle(
        board: List<BmtCell?>,
        config: BmtBoardConfig,
        addArkSpecials: Boolean = false,
        random: Random = Random.Default,
    ): List<BmtCell?> {
        val specials = board.mapNotNull { it?.special }.toMutableList()
        if (addArkSpecials) {
            specials += BmtSpecial.LINE_H
            specials += BmtSpecial.LINE_V
        }
        val fresh = createPlayableBoard(config, random).toMutableList()
        specials.forEach { special ->
            val available = fresh.indices.filter { fresh[it] != null && fresh[it]?.special == null }
            if (available.isNotEmpty()) {
                val index = available.random(random)
                fresh[index] = fresh[index]?.copy(special = special)
            }
        }
        return fresh
    }

    fun seedSpecials(
        board: List<BmtCell?>,
        config: BmtBoardConfig,
        preBoosters: Set<BmtPreBooster>,
        specialGoal: Int,
        blockers: Map<Int, BmtBlocker>,
        random: Random = Random.Default,
    ): List<BmtCell?> {
        val work = board.toMutableList()
        val requested = mutableListOf<BmtSpecial>()
        if (specialGoal > 0) repeat((specialGoal.coerceAtLeast(2) + 1) / 2) {
            requested += BmtSpecial.LINE_H
            requested += BmtSpecial.LINE_V
        }
        if (BmtPreBooster.MANNA in preBoosters) requested += listOf(BmtSpecial.LINE_H, BmtSpecial.LINE_V)
        if (BmtPreBooster.LAMP_OIL in preBoosters) requested += BmtSpecial.BURST
        if (BmtPreBooster.COVENANT in preBoosters) requested += BmtSpecial.RAINBOW
        requested.forEach { special ->
            val available = work.indices.filter { config.mask[it] && work[it] != null && work[it]?.special == null && it !in blockers }
            if (available.isNotEmpty()) {
                val index = available.random(random)
                work[index] = work[index]?.copy(special = special)
            }
        }
        return work
    }

    fun goalValue(
        goal: BmtGoal,
        score: Int,
        collected: Map<BmtSymbol, Int>,
        blockers: Map<Int, BmtBlocker>,
        initialBlockers: Map<BmtBlockerType, Int>,
        specialsActivated: Int,
        maxCascade: Int,
    ): Int = when (goal.type) {
        BmtGoalType.SCORE -> score
        BmtGoalType.COLLECT -> collected[goal.symbol] ?: 0
        BmtGoalType.CLEAR_BLOCKERS -> (initialBlockers[goal.blocker] ?: 0) - blockers.values.count { it.type == goal.blocker }
        BmtGoalType.LIGHT_LAMPS -> blockers.values.count { it.type == BmtBlockerType.LAMP && it.lit }
        BmtGoalType.ACTIVATE_SPECIALS -> specialsActivated
        BmtGoalType.CASCADE -> maxCascade
    }.coerceAtLeast(0)

    fun rating(score: Int, thresholds: List<Int>): Int = when {
        thresholds.getOrNull(2)?.let { score >= it } == true -> 3
        thresholds.getOrNull(1)?.let { score >= it } == true -> 2
        else -> 1
    }

    private fun expandSpecials(
        board: List<BmtCell?>,
        initial: Set<Int>,
        config: BmtBoardConfig,
    ): Pair<Set<Int>, Int> {
        val clear = initial.filter { it in board.indices && config.mask.getOrElse(it) { false } }.toMutableSet()
        val queue = ArrayDeque(clear)
        val activated = mutableSetOf<Int>()
        fun add(index: Int) {
            if (index in board.indices && config.mask.getOrElse(index) { false } && clear.add(index)) queue.addLast(index)
        }
        while (queue.isNotEmpty()) {
            val index = queue.removeFirst()
            val cell = board.getOrNull(index) ?: continue
            when (cell.special ?: continue) {
                BmtSpecial.LINE_H -> (0 until config.cols).forEach { add(index / config.cols * config.cols + it) }
                BmtSpecial.LINE_V -> (0 until config.rows).forEach { add(it * config.cols + index % config.cols) }
                BmtSpecial.BURST -> areaIndices(index, config).forEach(::add)
                BmtSpecial.RAINBOW -> board.indices.filter { board[it]?.symbol == cell.symbol }.forEach(::add)
            }
            activated += index
        }
        return clear to activated.size
    }

    private fun areaIndices(index: Int, config: BmtBoardConfig): List<Int> {
        val row = index / config.cols
        val col = index % config.cols
        return buildList {
            for (rr in row - 1..row + 1) for (cc in col - 1..col + 1) {
                if (rr in 0 until config.rows && cc in 0 until config.cols) {
                    val candidate = rr * config.cols + cc
                    if (config.mask[candidate]) add(candidate)
                }
            }
        }
    }

    private fun damageBlockers(
        blockers: Map<Int, BmtBlocker>,
        clear: Set<Int>,
        config: BmtBoardConfig,
    ): Pair<Map<Int, BmtBlocker>, Int> {
        val next = blockers.toMutableMap()
        val adjacent = mutableSetOf<Int>()
        clear.forEach { index ->
            val row = index / config.cols
            val col = index % config.cols
            listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1).forEach { (dr, dc) ->
                val rr = row + dr
                val cc = col + dc
                if (rr in 0 until config.rows && cc in 0 until config.cols) adjacent += rr * config.cols + cc
            }
        }
        var score = 0
        blockers.forEach { (index, blocker) ->
            if (blocker.type == BmtBlockerType.LAMP) {
                if (!blocker.lit && (index in clear || index in adjacent)) {
                    next[index] = blocker.copy(lit = true)
                    score += 80
                }
                return@forEach
            }
            val hit = if (blocker.type == BmtBlockerType.TABLET) index in clear else index in clear || index in adjacent
            if (!hit) return@forEach
            if (blocker.layers <= 1) {
                next.remove(index)
                score += 135
            } else {
                next[index] = blocker.copy(layers = blocker.layers - 1)
                score += 45
            }
        }
        return next to score
    }

    private fun collapse(
        board: List<BmtCell?>,
        config: BmtBoardConfig,
        random: Random,
    ): List<BmtCell?> {
        val output = MutableList<BmtCell?>(board.size) { null }
        for (col in 0 until config.cols) {
            val activeRows = (0 until config.rows).filter { config.mask[it * config.cols + col] }
            val existing = activeRows.asReversed().mapNotNull { board[it * config.cols + col] }
            var source = 0
            activeRows.asReversed().forEach { row ->
                output[row * config.cols + col] = if (source < existing.size) existing[source++] else BmtCell(config.symbols.random(random))
            }
        }
        return output
    }
}
