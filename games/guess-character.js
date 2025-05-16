let guessCharacters = [];
let guessCurrentPlayer = 1;

function startGuessCharacterGame(characters) {
  const container = document.getElementById("game-container");
  guessCharacters = characters.sort(() => 0.5 - Math.random()).slice(0, 2);
  guessCurrentPlayer = 1;
  showGuessCharacter(container);
}

function showGuessCharacter(container) {
  if (guessCurrentPlayer > 2) {
    container.innerHTML = `
      <h2>Игра окончена!</h2>
      <button onclick="startGuessCharacterGame(guessCharacters)">🔄 Новая игра</button>
      <button onclick="goToMainMenu()" style="margin-left:10px;">🏠 Главное меню</button>
    `;
    return;
  }

  const char = guessCharacters[guessCurrentPlayer - 1];

  container.innerHTML = `
    <h2>👥 Угадай персонажа</h2>
    <p><strong>Игрок ${guessCurrentPlayer}</strong>, ваш персонаж:</p>
    <h3 style="color:#4a90e2;">${char}</h3>
    <p>Опишите его, не называя имени.</p>
    <button onclick="nextGuessPlayer()">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="margin-left:10px;">🏠 Главное меню</button>
  `;
}

function nextGuessPlayer() {
  guessCurrentPlayer++;
  showGuessCharacter(document.getElementById("game-container"));
}
