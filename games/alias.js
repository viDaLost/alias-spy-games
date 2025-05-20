let aliasWords = [];
let aliasIndex = 0;
let guessedAlias = [];

function startAliasGame() {
  const container = document.getElementById("game-container");

  // Показываем уровни сложности
  container.innerHTML = `
    <h2>🎮 Алиас</h2>
    <p><strong>Выберите уровень:</strong></p>

    <div style="margin-bottom:15px;">
      <button onclick="loadAliasWords('easy')" class="menu-button">🟢 Лёгкий</button><br>
      <button onclick="loadAliasWords('medium')" class="menu-button">🟡 Средний</button><br>
      <button onclick="loadAliasWords('hard')" class="menu-button">🔴 Тяжёлый</button><br>
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
    <input type="number" id="timerValue" min="1" max="60" value="60"><br><br>
    
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
    aliasWords = shuffleArray([...words]);
    aliasIndex = 0;
    guessedAlias = [];

    const container = document.getElementById("game-container");
    container.innerHTML = `
      <p id="alias-timer" style="font-size:2rem; text-align:center; margin-top:20px; font-weight:bold;">${seconds} секунд</p>
      <div id="alias-word" style="text-align:center; font-size:1.5rem; margin:20px 0;"></div>

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
          while (aliasIndex < aliasWords.length) {
            guessedAlias.push({ word: aliasWords[aliasIndex], correct: false });
            aliasIndex++;
          }
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
}

// Отметить как угаданное / не угаданное
function markGuessed(correct) {
  if (aliasIndex < aliasWords.length) {
    guessedAlias.push({ word: aliasWords[aliasIndex], correct });
    aliasIndex++;
    showNextAliasWord();
  }
}

// Результаты — только использованные слова
function showAliasResults() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>🏁 Результаты:</h2><ul>";

  guessedAlias.forEach(item => {
    const color = item.correct ? "green" : "red";
    container.innerHTML += `<li style="color:${color};">${item.word}</li>`;
  });

  container.innerHTML += "</ul>";
  container.innerHTML += `<button onclick="startAliasGame()" class="menu-button">🔄 Новая игра</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>`;
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
