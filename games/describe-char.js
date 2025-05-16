let currentDescribeIndex = 0;
let describePlayers = [];

function startDescribeCharacterGame(characters) {
  const container = document.getElementById("game-container");

  // Генерируем случайных персонажей для игроков
  const playerCount = 4; // можно сделать выбором, если нужно
  describePlayers = [];

  for (let i = 0; i < playerCount; i++) {
    const randomChar = characters[Math.floor(Math.random() * characters.length)];
    describePlayers.push({
      id: i + 1,
      character: randomChar
    });
  }

  currentDescribeIndex = 0;

  showNextCharacter();
}

function showNextCharacter() {
  const container = document.getElementById("game-container");
  if (currentDescribeIndex >= describePlayers.length) {
    container.innerHTML = `
      <h2>Игра окончена!</h2>
      <p>Все персонажи были описаны.</p>
      <button onclick="startDescribeCharacterGame(characters.json)">🔄 Новая игра</button>
      <button onclick="goToMainMenu()" style="margin-left:10px;">🏠 Главное меню</button>
    `;
    return;
  }

  const player = describePlayers[currentDescribeIndex];

  container.innerHTML = `
    <h2>🗣️ Опиши, но не называй</h2>
    <p><strong>Игрок ${player.id}</strong>, опишите персонажа:</p>
    <h3 style="color:#4a90e2;">${player.character}</h3>
    <p>Не говорите имя вслух!</p>
    <button onclick="nextCharacter()">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="margin-left:10px;">🏠 Главное меню</button>
  `;
}

function nextCharacter() {
  currentDescribeIndex++;
  showNextCharacter();
}
