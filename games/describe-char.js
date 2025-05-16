let describePlayers = [];
let describeIndex = 0;

function startDescribeCharacterGame(characters) {
  const container = document.getElementById("game-container");
  describePlayers = [];

  // Создаем 4 случайных персонажей
  for (let i = 0; i < 4; i++) {
    const randomChar = characters[Math.floor(Math.random() * characters.length)];
    describePlayers.push(randomChar);
  }

  describeIndex = 0;
  showNextDescribeCharacter(container);
}

function showNextDescribeCharacter(container) {
  if (describeIndex >= describePlayers.length) {
    container.innerHTML = `
      <h2>Игра окончена!</h2>
      <button onclick="startDescribeCharacterGame(characters.json)">🔄 Новая игра</button>
      <button onclick="goToMainMenu()" style="margin-left:10px;">🏠 Главное меню</button>
    `;
    return;
  }

  const character = describePlayers[describeIndex];

  container.innerHTML = `
    <h2>🗣️ Опиши, но не называй</h2>
    <p><strong>Игрок ${describeIndex + 1}</strong>, ваш персонаж:</p>
    <h3 style="color:#4a90e2;">${character}</h3>
    <p>Опишите его, чтобы другие догадались.</p>
    <button onclick="nextDescribeCharacter()">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="margin-left:10px;">🏠 Главное меню</button>
  `;
}

function nextDescribeCharacter() {
  describeIndex++;
  showNextDescribeCharacter(document.getElementById("game-container"));
}
