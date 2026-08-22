package com.vidalost.biblegames.model

enum class GameKey(
    val route: String,
    val title: String,
    val description: String,
    val iconAsset: String,
    val section: GameSection,
    val accent: Long,
) {
    ALIAS("alias", "Алиас", "Объясняй слова на скорость", "assets/icons/alias.png", GameSection.COMPANY, 0xFF4F46E5),
    COIMAGINARIUM("coimaginarium", "Соображариум", "Ассоциации и быстрые идеи", "assets/icons/idea.png", GameSection.COMPANY, 0xFF7C3AED),
    GUESS("guess", "Угадай персонажа", "Вопросы, версии, логика", "assets/icons/character.png", GameSection.COMPANY, 0xFF2563EB),
    DESCRIBE("describe", "Опиши, но не называй", "Подсказки без прямого ответа", "assets/icons/describe.png", GameSection.COMPANY, 0xFFF97316),
    SPY("spy", "Шпион", "Секретная роль и локация", "assets/icons/spy.png", GameSection.COMPANY, 0xFF4338CA),
    QUARTET("quartet", "Квартет", "Собери четыре карты", "assets/icons/quartet.png", GameSection.COMPANY, 0xFF0F766E),
    WOW("bible-wow", "Библейские слова", "Собери слова из букв", "assets/icons/words.png", GameSection.WORDS, 0xFF7C3AED),
    WORD_SEARCH("bible-wordsearch", "Поиск библейских слов", "Найди скрытые слова", "assets/icons/search.png", GameSection.WORDS, 0xFF0284C7),
    SACRED("sacred-word", "Священное слово", "Открой слово по подсказкам", "assets/icons/sacred.png", GameSection.WORDS, 0xFFB7791F),
    PAIRS("kids-ark-pairs", "Найди пару", "Память, пары и ковчег", "assets/icons/ark.png", GameSection.KIDS, 0xFF059669),
    MATCH_THREE("biblical-match-three", "Библейские сокровища", "Матч‑3, каскады и Путь света", "assets/icons/biblical-treasures-v38.png", GameSection.KIDS, 0xFF4F46E5),
    SKETCH("bible-sketch", "Библейский художник", "Рисуйте вместе и найдите шпиона", "assets/icons/bible-sketch.webp", GameSection.COMPANY, 0xFFDB2777),
    ;

    companion object { fun fromRoute(route: String) = entries.firstOrNull { it.route == route } }
}

enum class GameSection(val label: String) {
    COMPANY("Игры для компании"), WORDS("Словесные"), KIDS("Для детей")
}

data class PlayerProfile(
    val id: String,
    val isBanned: Boolean = false,
    val wowStars: Int = 20,
    val wordSearchStars: Int = 0,
    val sacredLevel: Int = 0,
    val lastGames: List<String> = emptyList(),
)

data class SacredLevel(val word: String, val hint: String, val category: String)

data class WowLevel(val id: Int, val letters: String, val words: List<String>, val bonus: List<String>)

data class WordSearchLevel(
    val id: Int,
    val theme: String,
    val rows: Int,
    val cols: Int,
    val words: List<String>,
)

data class QuartetCard(val id: String, val title: String, val art: String = "")
data class QuartetSet(val id: String, val name: String, val icon: String, val cards: List<QuartetCard>)
