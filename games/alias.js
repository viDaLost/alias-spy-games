let aliasWords = [];
let aliasIndex = 0;
let guessedAlias = [];

function startAliasGame(words) {
  const container = document.getElementById("game-container");
  aliasWords = [...words];
  aliasIndex = 0;
  guessedAlias = [];

  container.innerHTML = `
    <h2>🎮 Алиас</h2>
    <p id="alias-timer">60</p>
    <button onclick="markGuessed(true)">✅ Отгадано</button>
    <button onclick="markGuessed(false)">❌ Не отгадано</button>
    <button onclick="goToMainMenu()">⬅️ Главное меню</button>
    <button onclick="startAliasGame(aliasWords)">🔄 Новая игра</button>
  `;

  startAliasTimer(60);
}

function markGuessed(correct) {
  guessedAlias.push({ word: aliasWords[aliasIndex], correct });
  aliasIndex++;
  startAliasTimer(60);
}

function startAliasTimer(seconds) {
  let timeLeft = seconds;
  const timerEl = document.getElementById("alias-timer");
  timerEl.textContent = timeLeft;

  window.aliasInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(window.aliasInterval);
      timerEl.textContent = "Время вышло!";
      setTimeout(() => {
        if (aliasIndex < aliasWords.length) {
          markGuessed(false);
        } else {
          showAliasResults();
        }
      }, 1000);
    } else {
      timerEl.textContent = timeLeft;
    }
  }, 1000);
}

function showAliasResults() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>Результаты:</h2><ul>";

  guessedAlias.forEach(item => {
    const color = item.correct ? "green" : "red";
    container.innerHTML += `<li style="color:${color}">${item.word}</li>`;
  });

  container.innerHTML += "</ul>";
  container.innerHTML += `<button onclick="startAliasGame(aliasWords)">🔄 Новая игра</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()">⬅️ Главное меню</button>`;
}
