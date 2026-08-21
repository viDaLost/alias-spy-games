package com.vidalost.biblegames.games

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class BiblicalMatchThreeEngineTest {
    @Test
    fun fourInARowCreatesHorizontalSpecial() {
        val board = listOf(
            cell(BmtSymbol.BIBLE), cell(BmtSymbol.BIBLE), cell(BmtSymbol.BIBLE), cell(BmtSymbol.BIBLE),
            cell(BmtSymbol.FISH), cell(BmtSymbol.DOVE), cell(BmtSymbol.LAMP), cell(BmtSymbol.CROWN),
        )
        val result = BmtEngine.analyzeMatches(board, rows = 1, preferred = listOf(3))
        assertEquals(BmtSpecial.LINE_H, result.creations[3])
        assertEquals(3, result.clearSet.size)
    }

    @Test
    fun fiveInARowCreatesRainbowSpecial() {
        val board = listOf(
            cell(BmtSymbol.BIBLE), cell(BmtSymbol.BIBLE), cell(BmtSymbol.BIBLE), cell(BmtSymbol.BIBLE),
            cell(BmtSymbol.BIBLE), cell(BmtSymbol.FISH), cell(BmtSymbol.DOVE), cell(BmtSymbol.LAMP),
        )
        val result = BmtEngine.analyzeMatches(board, rows = 1, preferred = listOf(4))
        assertEquals(BmtSpecial.RAINBOW, result.creations[4])
        assertEquals(4, result.clearSet.size)
    }

    @Test
    fun intersectingMatchesCreateBurstSpecial() {
        val board = MutableList<BmtCell?>(24) { null }
        listOf(1, 8, 9, 10, 17).forEach { board[it] = cell(BmtSymbol.BIBLE) }
        val result = BmtEngine.analyzeMatches(board, rows = 3, preferred = listOf(9))
        assertEquals(BmtSpecial.BURST, result.creations[9])
        assertEquals(4, result.clearSet.size)
    }

    @Test
    fun activatedSpecialsTriggerEachOther() {
        val symbols = BmtSymbol.entries.take(6)
        val config = BmtBoardConfig(rows = 3, symbols = symbols, mask = List(24) { true })
        val base = BmtEngine.createPlayableBoard(config, Random(17)).toMutableList()
        base[0] = base[0]!!.copy(special = BmtSpecial.LINE_H)
        base[1] = base[1]!!.copy(special = BmtSpecial.LINE_V)
        val result = BmtEngine.resolveTurn(base, emptyMap(), config, forcedClear = setOf(0), random = Random(18))
        assertTrue(result.specialsActivated >= 2)
        assertTrue(result.scoreDelta > 0)
    }

    @Test
    fun everyBoardShapeProducesPlayableBoards() {
        BmtBoardShape.entries.forEachIndexed { index, shape ->
            val mask = BmtEngine.activeMask(shape, rows = 8)
            val config = BmtBoardConfig(8, symbols = BmtSymbol.entries.take(7), mask = mask)
            val board = BmtEngine.createPlayableBoard(config, Random(100 + index))
            assertTrue("$shape starts with a match", BmtEngine.findGroups(board, 8).isEmpty())
            assertTrue("$shape has fewer than three moves", BmtEngine.findMoves(board, config).size >= 3)
        }
    }

    @Test
    fun specialGoalLevelsReceivePlayableSpecialPieces() {
        val config = BmtBoardConfig(6, symbols = BmtSymbol.entries.take(7), mask = List(48) { true })
        val board = BmtEngine.createPlayableBoard(config, Random(66))
        val seeded = BmtEngine.seedSpecials(board, config, emptySet(), specialGoal = 2, blockers = emptyMap(), random = Random(67))
        assertTrue(seeded.count { it?.special != null } >= 2)
        assertTrue(BmtEngine.findMoves(seeded, config).isNotEmpty())
    }

    @Test
    fun blockerSeedsCreateVisibleLayeredObstacles() {
        val seeds = listOf(
            BmtBlockerSeed(BmtBlockerType.CHAIN, listOf(2, 5), 2),
            BmtBlockerSeed(BmtBlockerType.LAMP, listOf(9), 1),
        )
        val blockers = BmtEngine.blockersFrom(seeds)
        assertEquals(3, blockers.size)
        assertEquals(2, blockers[2]?.layers)
        assertEquals(BmtBlockerType.LAMP, blockers[9]?.type)
    }

    private fun cell(symbol: BmtSymbol) = BmtCell(symbol)
}
