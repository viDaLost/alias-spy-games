let aliasWords = [];
let aliasIndex = 0;
let aliasGuessed = [];

function startAliasGame(words) {
  const container = document.getElementById("game-container");
  aliasWords = [...words];
  aliasIndex = 0;

  container.innerHTML = `
    <h2>🎮 Алиас</h2>
    <p><strong>Правила:</strong> Объясняйте слово, не называя его. На каждое слово — 60 секунд.</p>
    <p id="alias-timer" style="font-size: 2rem; color: black;">60</p>
    <div id="alias-word" style="margin: 20px 0;"></div>
    <button onclick="goToMainMenu()">⬅️ Главное меню</button>
    <button onclick="startAliasGame(aliasWords)">🔄 Новая игра</button>
  `;

  showNextAliasWord();
}

function showNextAliasWord() {
  const wordEl = document.getElementById("alias-word");
  if (aliasIndex >= aliasWords.length) {
    showAliasResults();
    return;
  }

  wordEl.innerHTML = `<h3>${aliasWords[aliasIndex]}</h3>`;
  startAliasTimer(60);
}

function startAliasTimer(seconds) {
  let timeLeft = seconds;
  const timerEl = document.getElementById("alias-timer");

  window.aliasInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 10) {
      timerEl.style.color = "red";
    }
    if (timeLeft <= 0) {
      clearInterval(window.aliasInterval);
      timerEl.textContent = "Время вышло!";
      setTimeout(() => {
        aliasIndex++;
        showNextAliasWord();
      }, 1000);
    }
  }, 1000);
}

function showAliasResults() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>Результаты:</h2>";

  for (let i = 0; i < aliasWords.length; i++) {
    container.innerHTML += `<p>${aliasWords[i]}</p>`;
  }

  container.innerHTML += `<button onclick="startAliasGame(aliasWords)">🔄 Новая игра</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()" style="margin-left:10px;">⬅️ Главное меню</button>`;
}
