let aliasWords = [];
let aliasIndex = 0;
let guessedAlias = [];
let currentDifficulty = null;

function startAliasGame() {
  const container = document.getElementById("game-container");

  // Отображение уровней сложности
  container.innerHTML = `
    <h2>🎮 Алиас</h2>
    <p><strong>Выберите уровень:</strong></p>

    <div style="margin-bottom:15px;">
      <button onclick="loadAliasWords('easy')" class="menu-button">🟢 Лёгкий</button><br>
      <button onclick="loadAliasWords('medium')" class="menu-button">🟡 Средний</button><br>
      <button onclick="loadAliasUsedWords()" class="menu-button">🔴 Тяжёлый</button><br>
    </div>

    <button onclick="goToMainMenu()" class="back-button">⬅️ Вернуться в главное меню</button>
  `;
}

// Загрузка слов из JSON по уровню
async function loadAliasWords(difficulty) {
  let url = "";

  if (difficulty === "easy") {
    url = "data/easy_bible_words.json";
  } else if (difficulty === "medium") {
    url = "data/medium_bible_words.json";
  } else if (difficulty === "hard") {
    url = "data/hard_bible_words.json";
  }

  try {
    const words = await loadJSON(url);
    currentDifficulty = difficulty; // Сохраняем уровень для перезапуска
    showAliasSetup(words, difficulty);
  } catch (e) {
    alert(`Ошибка загрузки слов: ${e.message}`);
    console.error(e);
  }
}

// Настройка уровня и времени
function showAliasSetup(words, difficulty) {
  const container = document.getElementById("game-container");
  const difficultyName = getDifficultyName(difficulty);

  container.innerHTML = `
    <h2>🎮 Алиас — ${difficultyName} уровень</h2>
    <p><strong>Выберите время (1–60 секунд):</strong></p>
    <input type="number" id="timerValue" min="1" max="60" value="60" class="timer-input">

    <br><br>
    <button onclick="startAliasTimer('${difficulty}')" class="start-button">▶️ Начать игру</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

// Получить название уровня
function getDifficultyName(difficulty) {
  return {
    easy: "Лёгкий",
    medium: "Средний",
    hard: "Тяжёлый"
  }[difficulty] || "Неизвестный";
}

// Используем только те слова, которые ещё не угаданы
function getUnusedWords(allWords, guessedList) {
  const guessedWords = new Set(guessedList.map(item => item.word));
  return allWords.filter(word => !guessedWords.has(word));
}

// Запуск таймера и игры
async function startAliasTimer(difficulty) {
  const input = document.getElementById("timerValue").value;
  let seconds = parseInt(input);

  if (isNaN(seconds) || seconds < 1 || seconds > 60) {
    alert("Введите число от 1 до 60.");
    return;
  }

  let url = "";
  if (difficulty === "easy") {
    url = "data/easy_bible_words.json";
  } else if (difficulty === "medium") {
    url = "data/medium_bible_words.json";
  } else if (difficulty === "hard") {
    url = "data/hard_bible_words.json";
  }

  try {
    const words = await loadJSON(url);
    const unusedWords = getUnusedWords(words, guessedAlias); // Исключаем уже отгаданные

    if (unusedWords.length === 0) {
      showAllWordsShownMessage();
      return;
    }

    aliasWords = shuffleArray([...unusedWords]);
    aliasIndex = 0;

    const container = document.getElementById("game-container");
    container.innerHTML = `
      <p id="alias-timer">${seconds} секунд</p>
      <div id="alias-word" class="card"></div>

      <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
        <button onclick="markGuessed(true)" class="correct-button">✅ Отгадано</button>
        <button onclick="markGuessed(false)" class="wrong-button">❌ Не отгадано</button>
      </div>

      <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
    `;

    showNextAliasWord();

    const timerEl = document.getElementById("alias-timer");

    window.aliasInterval = setInterval(() => {
      seconds--;
      timerEl.textContent = `${seconds} секунд`;
      if (seconds <= 10) timerEl.style.color = "red";

      if (seconds <= 0) {
        clearInterval(window.aliasInterval);
        timerEl.textContent = "⏰ Время вышло!";
        setTimeout(() => {
          showAliasResults();
        }, 1000);
      }
    }, 1000);
  } catch (e) {
    alert("Ошибка при начале игры.");
    console.error(e);
  }
}

// Показать следующее слово
function showNextAliasWord() {
  const wordEl = document.getElementById("alias-word");

  if (aliasIndex >= aliasWords.length) {
    showAliasResults();
    return;
  }

  wordEl.innerHTML = `<div class="card">${aliasWords[aliasIndex]}</div>`;
  aliasIndex++;
}

// Отметить как угаданное / не угаданное
function markGuessed(correct) {
  if (aliasIndex <= 0) return;

  const word = aliasWords[aliasIndex - 1];
  guessedAlias.push({ word, correct });
  showNextAliasWord();
}

// Результаты — только использованные слова
function showAliasResults() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>🏁 Результаты:</h2>";

  if (guessedAlias.length === 0) {
    container.innerHTML += "<p>Нет результатов. Начните игру снова.</p>";
    container.innerHTML += `<button onclick="startAliasGame()" class="menu-button">🔄 Новая игра</button>`;
    container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>`;
    return;
  }

  container.innerHTML += "<ul>";

  guessedAlias.forEach(item => {
    const color = item.correct ? "green" : "red";
    container.innerHTML += `<li style="color:${color};">${item.word}</li>`;
  });

  container.innerHTML += "</ul>";
  container.innerHTML += `<button onclick="startAliasGame()" class="menu-button">🔄 Новый раунд</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>`;
}

// Сообщение, если все слова из категории уже были показаны
function showAllWordsShownMessage() {
  const container = document.getElementById("game-container");
  container.innerHTML = `
    <h2>⚠️ Все слова показаны!</h2>
    <p>Для продолжения начните новую игру.</p>
    <button onclick="startAliasGame()" class="menu-button">🔄 Новая игра</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

// Перемешивание массива
function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// Загрузка JSON
async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status}`);
  return await res.json();
}
