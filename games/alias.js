let aliasWords = [];
let aliasIndex = 0;

function startAliasGame(words) {
  const container = document.getElementById("game-container");
  aliasWords = [...words];
  aliasIndex = 0;

  container.innerHTML = `
    <h2>🎮 Алиас</h2>
    <p><strong>Правила:</strong> За 60 секунд объясни как можно больше слов, не называя их. Последние 10 секунд — красный таймер.</p>
    <p id="alias-timer" style="font-size: 2rem; color: black; text-align:center;">60</p>
    <div id="alias-word" style="margin: 20px 0; font-size: 1.5rem; text-align: center;"></div>
    <div style="display:flex; justify-content: space-between; gap:10px;">
      <button onclick="markGuessed(true)" style="flex:1; padding:15px; background:#28a745;">✅ Отгадано</button>
      <button onclick="markGuessed(false)" style="flex:1; padding:15px; background:#dc3545;">❌ Не отгадано</button>
    </div>
    <button onclick="goToMainMenu()" style="margin-top: 20px; width:100%;">⬅️ Главное меню</button>
  `;

  showNextAliasWord();
}

function showNextAliasWord() {
  const wordEl = document.getElementById("alias-word");
  const container = document.getElementById("game-container");

  if (aliasIndex >= aliasWords.length) {
    showAliasResults();
    return;
  }

  wordEl.innerHTML = `<div style="padding:20px; border:2px dashed #4a90e2; margin-top:20px;">${aliasWords[aliasIndex]}</div>`;
  startAliasTimer(60);
}

function markGuessed(correct) {
  aliasIndex++;
  showNextAliasWord();
}

function startAliasTimer(seconds) {
  let timeLeft = seconds;
  const timerEl = document.getElementById("alias-timer");

  window.aliasInterval && clearInterval(window.aliasInterval);
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
        markGuessed(false);
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
