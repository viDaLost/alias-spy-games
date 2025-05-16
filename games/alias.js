let aliasWords = [];
let aliasIndex = 0;
let guessedAlias = [];

function startAliasGame(words) {
  const container = document.getElementById("game-container");
  aliasWords = [...words];
  aliasIndex = 0;
  guessedAlias = [];

  startAliasRound(container);
}

function startAliasRound(container) {
  if (aliasIndex >= aliasWords.length) {
    showAliasResults(container);
    return;
  }

  const word = aliasWords[aliasIndex];

  container.innerHTML = `
    <h2>Слово: ${word}</h2>
    <p id="alias-timer">60</p>
    <div class="timer-label">секунд</div>
    <button onclick="markAliasGuessed(true)">✅ Отгадано</button>
    <button onclick="markAliasGuessed(false)">❌ Не отгадано</button>
  `;

  startAliasTimer(60, () => {
    aliasIndex++;
    startAliasRound(container);
  });
}

function markAliasGuessed(correct) {
  guessedAlias.push({ word: aliasWords[aliasIndex], correct });
  aliasIndex++;
  startAliasRound(document.getElementById("game-container"));
}

function startAliasTimer(seconds, callback) {
  let timeLeft = seconds;
  const timerEl = document.getElementById("alias-timer");

  window.aliasInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(window.aliasInterval);
      timerEl.textContent = "Время вышло!";
      setTimeout(callback, 1000);
    } else {
      timerEl.textContent = timeLeft;
    }
  }, 1000);
}

function showAliasResults(container) {
  container.innerHTML = "<h2>Результаты:</h2><ul>";
  guessedAlias.forEach(item => {
    const color = item.correct ? "green" : "red";
    container.innerHTML += `<li style="color:${color}">${item.word}</li>`;
  });
  container.innerHTML += "</ul>";
  container.innerHTML += `<button onclick="startAliasGame(aliasWords)">🔄 Новая игра</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()" style="margin-left:10px;">🏠 Главное меню</button>`;
}
