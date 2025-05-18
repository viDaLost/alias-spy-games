let aliasWords = [];
let aliasIndex = 0;
let guessedAlias = [];

// Запуск игры
function startAliasGame() {
  const container = document.getElementById("game-container");

  // Показываем уровни сложности
  container.innerHTML = `
    <h2>🎮 Алиас</h2>
    <p><strong>Выберите уровень:</strong></p>

    <div style="margin-bottom:15px;">
      <button onclick="loadAliasWords('easy')" style="width:100%; padding:15px; font-size:16px;">🟢 Лёгкий</button><br>
      <button onclick="loadAliasWords('medium')" style="width:100%; padding:15px; font-size:16px; margin-top:10px;">🟡 Средний</button><br>
      <button onclick="loadAliasWords('hard')" style="width:100%; padding:15px; font-size:16px; margin-top:10px;">🔴 Тяжёлый</button><br>
    </div>

    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>
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
    alert("Ошибка загрузки слов.");
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
    
    <button onclick="startAliasTimer('${difficulty}')" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">▶️ Начать игру</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
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
    aliasWords = [...words];
    aliasIndex = 0;
    guessedAlias = [];

    const timerEl = document.createElement("p");
    timerEl.id = "alias-timer";
    timerEl.style.fontSize = "2rem";
    timerEl.style.textAlign = "center";
    timerEl.style.marginTop = "20px";

    const wordEl = document.createElement("div");
    wordEl.id = "alias-word";
    wordEl.style.margin = "20px 0";
    wordEl.style.fontSize = "1.5rem";
    wordEl.style.textAlign = "center";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    controls.style.justifyContent = "center";
    controls.style.marginTop = "20px";

    controls.innerHTML = `
      <button onclick="markGuessed(true)" style="flex:1; padding:15px; background:#28a745; color:white;">✅ Отгадано</button>
      <button onclick="markGuessed(false)" style="flex:1; padding:15px; background:#dc3545; color:white;">❌ Не отгадано</button>
    `;

    const buttonContainer = document.getElementById("game-container");
    buttonContainer.innerHTML = "";

    buttonContainer.appendChild(timerEl);
    buttonContainer.appendChild(wordEl);
    buttonContainer.appendChild(controls);
    buttonContainer.innerHTML += `<button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>`;

    showNextAliasWord();

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

  wordEl.innerHTML = `<div style="padding:20px; border:2px dashed #4a90e2; margin-top:20px;">${aliasWords[aliasIndex]}</div>`;
}

// Отметить как отгаданное / не отгаданное
function markGuessed(correct) {
  if (aliasIndex < aliasWords.length) {
    guessedAlias.push({ word: aliasWords[aliasIndex], correct });
    aliasIndex++;
    showNextAliasWord();
  }
}

// Результаты
function showAliasResults() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>🏁 Результаты:</h2><ul>";

  guessedAlias.forEach(item => {
    const color = item.correct ? "green" : "red";
    container.innerHTML += `<li style="color:${color};">${item.word}</li>`;
  });

  container.innerHTML += "</ul>";
  container.innerHTML += `<button onclick="startAliasGame()" style="width:100%; padding:15px; font-size:16px; margin-top:10px;">🔄 Новая игра</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>`;
}

// Перемешивание массива
function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// Загрузка JSON
async function loadJSON(url) {
  const res = await fetch(url);
  return await res.json();
}
