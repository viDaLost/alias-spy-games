package com.vidalost.biblegames.games

import android.content.Context
import com.vidalost.biblegames.data.AssetRepository
import org.json.JSONArray
import org.json.JSONObject

internal data class BmtCatalog(val levels: List<BmtLevel>) {
    companion object {
        fun load(assets: AssetRepository): BmtCatalog {
            val root = JSONObject(assets.text("data/biblical_match_three_levels.json"))
            val rawLevels = root.getJSONArray("levels")
            val levels = buildList {
                for (index in 0 until rawLevels.length()) {
                    val raw = rawLevels.getJSONObject(index)
                    val id = raw.getInt("id")
                    val goals = raw.optJSONArray("goals").objects().mapNotNull { goal ->
                        val type = BmtGoalType.fromId(goal.optString("type")) ?: return@mapNotNull null
                        BmtGoal(
                            type = type,
                            count = goal.optInt("count", 0).coerceAtLeast(0),
                            symbol = BmtSymbol.fromId(goal.optString("symbol")),
                            blocker = BmtBlockerType.fromId(goal.optString("blocker")),
                        )
                    }
                    val blockerSeeds = raw.optJSONArray("blockers").objects().mapNotNull { group ->
                        val type = BmtBlockerType.fromId(group.optString("type")) ?: return@mapNotNull null
                        BmtBlockerSeed(
                            type = type,
                            cells = group.optJSONArray("cells").ints(),
                            layers = group.optInt("layers", 1).coerceIn(1, 3),
                        )
                    }
                    add(
                        BmtLevel(
                            id = id,
                            title = raw.optString("title", "Уровень $id"),
                            moves = raw.optInt("moves", 24).coerceAtLeast(1),
                            rows = raw.optInt("rows", root.optInt("rows", 8)).coerceIn(5, 8),
                            symbolCount = raw.optInt("symbolCount", 6).coerceIn(3, BmtSymbol.entries.size),
                            reward = raw.optInt("reward", 0).coerceAtLeast(0),
                            starThresholds = raw.optJSONArray("starThresholds").ints(),
                            goals = goals,
                            blockerSeeds = blockerSeeds,
                            shape = BmtEngine.shapeForLevel(id),
                        ),
                    )
                }
            }
            require(levels.size == 30) { "В кампании должно быть 30 уровней" }
            return BmtCatalog(levels)
        }
    }
}

internal data class BmtCompletion(
    val rating: Int,
    val awarded: Int,
    val unlocked: Int,
    val improved: Boolean,
)

internal class BmtProgressStore(context: Context, userId: String) {
    private val prefs = context.getSharedPreferences("biblical_match_three_native_v2_${userId.ifBlank { "guest" }}", Context.MODE_PRIVATE)
    private val legacy = context.getSharedPreferences("biblical_match_three_progress_v1", Context.MODE_PRIVATE)

    fun unlocked(): Int = maxOf(1, prefs.getInt("unlocked", 1), legacy.getInt("unlocked", 1)).coerceAtMost(30)
    fun rating(levelId: Int): Int = prefs.getInt("rating_$levelId", 0).coerceIn(0, 3)
    fun bestScore(levelId: Int): Int = prefs.getInt("score_$levelId", 0).coerceAtLeast(0)
    fun freeBest(mode: String): Int = prefs.getInt("free_$mode", 0).coerceAtLeast(0)

    fun saveFreeBest(mode: String, score: Int) {
        if (score > freeBest(mode)) prefs.edit().putInt("free_$mode", score).apply()
    }

    fun complete(level: BmtLevel, score: Int): BmtCompletion {
        val oldRating = rating(level.id)
        val newRating = maxOf(oldRating, BmtEngine.rating(score, level.starThresholds))
        val firstClear = !prefs.getBoolean("rewarded_${level.id}", false)
        val awarded = (if (firstClear) level.reward else 0) + (newRating - oldRating) * 2
        val nextUnlocked = maxOf(unlocked(), (level.id + 1).coerceAtMost(30))
        prefs.edit()
            .putInt("rating_${level.id}", newRating)
            .putInt("score_${level.id}", maxOf(bestScore(level.id), score))
            .putBoolean("rewarded_${level.id}", true)
            .putInt("unlocked", nextUnlocked)
            .apply()
        return BmtCompletion(newRating, awarded, nextUnlocked, firstClear || newRating > oldRating)
    }
}

private fun JSONArray?.objects(): List<JSONObject> {
    if (this == null) return emptyList()
    return buildList { for (index in 0 until length()) optJSONObject(index)?.let(::add) }
}

private fun JSONArray?.ints(): List<Int> {
    if (this == null) return emptyList()
    return buildList { for (index in 0 until length()) add(optInt(index)) }
}
