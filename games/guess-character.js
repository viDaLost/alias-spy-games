let guessCharacters = [];
let guessCurrentPlayer = 1;

function startGuessCharacterGame(characters) {
  const container = document.getElementById("game-container");
  guessCharacters = shuffleArray([...characters]).slice(0, 2);
  guessCurrentPlayer = 1;

  container.innerHTML = `
    <h2>👥 Угадай персонажа</h2>
    <p><strong>Правила:</strong> Игроки по очереди получают имя персонажа. Один описывает, другой должен угадать.</p>
    <div id="guess-player-card"></div>
    <button onclick="nextGuessPlayer()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;

  nextGuessPlayer();
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function nextGuessPlayer() {
  const card = document.getElementById("guess-player-card");

  if (guessCurrentPlayer > guessCharacters.length) {
    card.innerHTML = "<h3>🎉 Игра окончена</h3>";
    return;
  }

  card.innerHTML = `
    <div class="card" style="text-align:center;">
      <strong>Игрок ${guessCurrentPlayer}</strong>, ваш персонаж:
      <h3 style="color:#4a90e2; margin:10px 0;">${guessCharacters[guessCurrentPlayer - 1]}</h3>
      <small>Опишите его, чтобы второй игрок мог угадать.</small>
    </div>
  `;

  guessCurrentPlayer++;
}
