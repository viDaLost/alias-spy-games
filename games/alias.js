let aliasWords = [];
let aliasIndex = 0;
let guessedAlias = [];

function startAliasGame() {
  const container = document.getElementById("game-container");

  // Отображение уровней сложности
  container.innerHTML = `
    <h2>🎮 Алиас</h2>
    <p><strong>Правила:</strong> Выберите уровень сложности и объясняйте слова по очереди.</p>

    <div style="margin-bottom:15px;">
      <button onclick="loadAliasWords('easy')" style="width:100%; padding:15px; font-size:16px;">🟢 Лёгкий</button><br>
      <button onclick="loadAliasWords('medium')" style="width:100%; padding:15px; font-size:16px; margin-top:10px;">🟡 Средний</button><br>
      <button onclick="loadAliasWords('hard')" style="width:100%; padding:15px; font-size:16px; margin-top:10px;">🔴 Тяжёлый</button><br>
    </div>

    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>
  `;
}

// Загрузка слов из JSON
async function loadAliasWords(difficulty) {
  let url = "";
  if (difficulty === "easy") {
    url = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/easy_words.json ";
  } else if (difficulty === "medium") {
    url = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/medium_words.json ";
  } else if (difficulty === "hard") {
    url = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/hard_words.json ";
  }

  try {
    const words = await loadJSON(url);
    showAliasSetup(words);
  } catch (e) {
    alert("Ошибка загрузки слов. Проверьте подключение к интернету или наличие файла.");
    console.error(e);
  }
}

// Показ формы настройки времени
function showAliasSetup(words) {
  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🎮 Алиас — ${getDifficultyName()} уровень</h2>
    <p><strong>Выберите время:</strong></p>
    <input type="number" id="timerValue" min="1" max="60" value="60"><br><br>
    <button onclick="startAliasTimer(words)" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">▶️ Начать игру</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>
  `;
}

// Получить название уровня сложности
function getDifficultyName() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("diff") || "неизвестный";
}

// Запуск таймера
function startAliasTimer(words) {
  const input = document.getElementById("timerValue").value;
  let seconds = parseInt(input);

  if (isNaN(seconds) || seconds < 1 || seconds > 60) {
    alert("Введите число от 1 до 60.");
    return;
  }

  aliasWords = shuffleArray([...words]);
  aliasIndex = 0;
  guessedAlias = [];

  // Очистка предыдущего таймера
  if (window.aliasInterval) clearInterval(window.aliasInterval);

  const timerEl = document.getElementById("alias-timer") || document.createElement("p");
  timerEl.id = "alias-timer";
  timerEl.style.fontSize = "2rem";
  timerEl.style.textAlign = "center";
  timerEl.style.marginTop = "20px";
  timerEl.textContent = `${seconds} секунд`;

  const wordEl = document.getElementById("alias-word") || document.createElement("div");
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

  const roundCounter = document.createElement("p");
  roundCounter.id = "round-counter";
  roundCounter.style.textAlign = "center";
  roundCounter.style.marginTop = "10px";

  const buttonContainer = document.getElementById("game-container");

  buttonContainer.innerHTML = "";
  buttonContainer.appendChild(timerEl);
  buttonContainer.appendChild(wordEl);
  buttonContainer.appendChild(roundCounter);
  buttonContainer.appendChild(controls);
  buttonContainer.innerHTML += `<button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>`;

  showNextAliasWord();
  runAliasTimer(seconds);
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

// Запустить таймер
function runAliasTimer(totalSeconds) {
  let seconds = totalSeconds;
  const timerEl = document.getElementById("alias-timer");

  window.aliasInterval = setInterval(() => {
    seconds--;
    timerEl.textContent = `${seconds} секунд`;
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
    if (seconds <= 10) timerEl.style.color = "red";
  }, 1000);
}

// Отметить слово как отгаданное или нет
function markGuessed(correct) {
  if (aliasIndex < aliasWords.length) {
    guessedAlias.push({ word: aliasWords[aliasIndex], correct });
    aliasIndex++;
    showNextAliasWord();
  }
}

// Показать результаты
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

// Функция загрузки JSON
async function loadJSON(url) {
  const res = await fetch(url);
  return await res.json();
}
