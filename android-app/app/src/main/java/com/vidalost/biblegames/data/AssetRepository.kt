package com.vidalost.biblegames.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.vidalost.biblegames.model.QuartetCard
import com.vidalost.biblegames.model.QuartetSet
import com.vidalost.biblegames.model.SacredLevel
import com.vidalost.biblegames.model.WordSearchLevel
import com.vidalost.biblegames.model.WowLevel
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

class AssetRepository(private val context: Context) {
    private val textCache = ConcurrentHashMap<String, String>()
    private val bitmapCache = ConcurrentHashMap<String, Bitmap>()

    fun text(path: String): String = textCache.getOrPut(path) {
        context.assets.open(path).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    fun stringList(path: String): List<String> {
        val array = JSONArray(text(path))
        return List(array.length()) { array.optString(it) }.filter { it.isNotBlank() }
    }

    fun bitmap(path: String): Bitmap? = bitmapCache[path] ?: runCatching {
        context.assets.open(path).use(BitmapFactory::decodeStream)
    }.getOrNull()?.also { bitmapCache[path] = it }

    fun sacredLevels(): List<SacredLevel> {
        val raw = text("data/sacred_words.json").trim()
        val source = if (raw.startsWith("[")) JSONArray(raw) else {
            val root = JSONObject(raw)
            root.optJSONArray("levels") ?: root.optJSONArray("words") ?: JSONArray()
        }
        return List(source.length()) { index ->
            val item = source.optJSONObject(index) ?: JSONObject()
            SacredLevel(
                word = item.optString("word").uppercase(),
                hint = item.optString("hint", item.optString("description", "Библейское понятие")),
                category = item.optString("category", "Библия"),
            )
        }.filter { it.word.isNotBlank() }
    }

    fun wowLevels(): List<WowLevel> {
        val source = JSONObject(text("data/bible_wow_levels.json")).getJSONArray("levels")
        return List(source.length()) { index ->
            val item = source.getJSONObject(index)
            WowLevel(
                id = item.optInt("id", index + 1),
                letters = item.getString("letters").uppercase(),
                words = item.getJSONArray("words").toStrings().map(String::uppercase),
                bonus = item.optJSONArray("bonus")?.toStrings()?.map(String::uppercase).orEmpty(),
            )
        }
    }

    fun wordSearchLevels(): List<WordSearchLevel> {
        val source = JSONObject(text("data/bible_wordsearch_levels.json")).getJSONArray("levels")
        return List(source.length()) { index ->
            val item = source.getJSONObject(index)
            WordSearchLevel(
                id = item.optInt("id", index + 1),
                theme = item.optString("theme", "Библия"),
                rows = item.optInt("rows", 8),
                cols = item.optInt("cols", 8),
                words = item.getJSONArray("wordsList").toStrings().map(String::uppercase),
            )
        }
    }

    fun quartetSets(): List<QuartetSet> {
        val source = JSONObject(text("data/quartet_bible.json")).getJSONArray("quartets")
        return List(source.length()) { index ->
            val item = source.getJSONObject(index)
            val id = item.optString("id", "q$index")
            val cards = item.getJSONArray("cards")
            QuartetSet(
                id = id,
                name = item.optString("name", item.optString("theme", "Квартет")),
                icon = item.optString("icon", "🃏"),
                cards = List(cards.length()) { cardIndex ->
                    val raw = cards.get(cardIndex)
                    if (raw is JSONObject) QuartetCard(
                        raw.optString("id", "${id}_$cardIndex"),
                        raw.optString("title"),
                        raw.optString("art").removePrefix("web/"),
                    )
                    else QuartetCard("${id}_$cardIndex", raw.toString())
                },
            )
        }
    }

    private fun JSONArray.toStrings() = List(length()) { optString(it) }.filter { it.isNotBlank() }
}
