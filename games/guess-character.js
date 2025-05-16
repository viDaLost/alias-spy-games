let guessCharacters = [];
let guessCurrentPlayer = 1;

function startGuessCharacterGame(characters) {
  const container = document.getElementById("game-container");
  guessCharacters = characters.sort(() => 0.5 - Math.random()).slice(0, 2);
  guessCurrentPlayer = 1;

  container.innerHTML = `
    <h2>👥 Угадай персонажа</h2>
    <p><strong>Правила:</strong> Каждому игроку даётся имя персонажа. Один описывает, другой должен угадать.</p>
    <div id="guess-player-card"></div>
    <button onclick="nextGuessPlayer()" style="width:100%; padding:15px; font-size:16px;">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px;">⬅️ Главное меню</button>
  `;

  nextGuessPlayer();
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
      <small>Опишите, чтобы второй игрок мог угадать.</small>
    </div>
  `;

  guessCurrentPlayer++;
}
