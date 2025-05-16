let aliasWords = [];
let aliasIndex = 0;
let guessedAlias = [];
let timerValue = 60;

function startAliasGame(words) {
  const container = document.getElementById("game-container");
  aliasWords = shuffleArray([...words]);
  aliasIndex = 0;
  guessedAlias = [];

  // Отображение интерфейса
  container.innerHTML = `
    <h2>🎮 Алиас</h2>
    <p><strong>Правила:</strong> За указанное время объясни как можно больше слов, не называя их.</p>

    <label for="timerValue">Выберите время (1–60 секунд):</label><br>
    <input type="number" id="timerValue" min="1" max="60" value="60"><br><br>

    <button onclick="startAliasTimer()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">▶️ Начать игру</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>

    <p id="alias-timer" style="font-size:2rem; text-align:center; margin-top:20px;"></p>
    <div id="alias-word" style="margin: 20px 0; font-size:1.5rem; text-align:center;"></div>

    <div style="display:flex; gap:10px; margin-top:20px;">
      <button onclick="markGuessed(true)" style="flex:1; padding:15px; background:#28a745; color:white;">✅ Отгадано</button>
      <button onclick="markGuessed(false)" style="flex:1; padding:15px; background:#dc3545; color:white;">❌ Не отгадано</button>
    </div>
  `;

  showNextAliasWord();
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function showNextAliasWord() {
  const wordEl = document.getElementById("alias-word");

  if (aliasIndex >= aliasWords.length) {
    showAliasResults();
    return;
  }

  wordEl.innerHTML = `<div style="padding:20px; border:2px dashed #4a90e2; margin-top:20px;">${aliasWords[aliasIndex]}</div>`;
}

function markGuessed(correct) {
  if (window.aliasInterval) {
    clearInterval(window.aliasInterval);
  }
  guessedAlias.push({ word: aliasWords[aliasIndex], correct });
  aliasIndex++;
  showNextAliasWord();
}

function startAliasTimer() {
  const input = document.getElementById("timerValue").value;
  let seconds = parseInt(input);

  if (isNaN(seconds) || seconds < 1 || seconds > 60) {
    alert("Введите число от 1 до 60.");
    return;
  }

  const timerEl = document.getElementById("alias-timer");
  timerEl.textContent = `${seconds} секунд`;
  timerEl.style.color = "black";

  window.aliasInterval = setInterval(() => {
    seconds--;
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
    } else {
      timerEl.textContent = `${seconds} секунд`;
      if (seconds <= 10) timerEl.style.color = "red";
    }
  }, 1000);
}

function showAliasResults() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>Результаты:</h2><ul>";

  guessedAlias.forEach(item => {
    const color = item.correct ? "green" : "red";
    container.innerHTML += `<li style="color:${color};">${item.word}</li>`;
  });

  container.innerHTML += "</ul>";
  container.innerHTML += `<button onclick="startAliasGame(aliasWords)" style="width:100%; padding:15px; font-size:16px; margin-top:10px;">🔄 Новая игра</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>`;
}
