let aliasWords = [];
let aliasIndex = 0;
let aliasGuessed = [];

function startAliasGame(words) {
  const container = document.getElementById("game-container");
  aliasWords = [...words];
  aliasIndex = 0;
  aliasGuessed = [];

  container.innerHTML = `
    <h2>🎮 Алиас</h2>
    <p>Выберите слово:</p>
    <button onclick="showNextAliasWord()">➡️ Следующее слово</button>
    <button onclick="goToMainMenu()">🏠 Главное меню</button>
    <button onclick="startAliasGame(aliasWords)">🔄 Новая игра</button>
  `;

  showNextAliasWord(container);
}

function showNextAliasWord(container) {
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
    <button onclick="goToMainMenu()">🏠 Главное меню</button>
    <button onclick="startAliasGame(aliasWords)">🔄 Новая игра</button>
  `;

  startAliasTimer(60);
}

function markAliasGuessed(correct) {
  aliasGuessed.push({ word: aliasWords[aliasIndex], correct });
  aliasIndex++;
}

function startAliasTimer(seconds) {
  let timeLeft = seconds;
  const timerEl = document.getElementById("alias-timer");

  window.aliasInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(window.aliasInterval);
      timerEl.textContent = "Время вышло";
      setTimeout(() => {
        showNextAliasWord(document.getElementById("game-container"));
      }, 1000);
    } else {
      timerEl.textContent = timeLeft;
    }
  }, 1000);
}

function showAliasResults(container) {
  container.innerHTML = "<h2>Результаты:</h2><ul>";

  aliasGuessed.forEach(item => {
    const color = item.correct ? "green" : "red";
    container.innerHTML += `<li style="color:${color}">${item.word}</li>`;
  });

  container.innerHTML += "</ul>";
  container.innerHTML += `<button onclick="startAliasGame(aliasWords)">🔄 Новая игра</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()">🏠 Главное меню</button>`;
}
