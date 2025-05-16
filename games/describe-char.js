let describePlayers = [];
let describeIndex = 0;

function startDescribeCharacterGame(characters) {
  const container = document.getElementById("game-container");
  describePlayers = [];

  // Генерируем 4 случайных персонажей
  for (let i = 0; i < 4; i++) {
    describePlayers.push(characters[Math.floor(Math.random() * characters.length)];
  }

  describeIndex = 0;

  container.innerHTML = `
    <h2>🗣️ Опиши, но не называй</h2>
    <p><strong>Правила:</strong> Показывается персонаж каждому игроку по очереди. Остальные должны догадаться, кто он.</p>
    <div id="describe-card"></div>
    <button onclick="nextDescribePlayer()">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()">⬅️ Главное меню</button>
  `;

  nextDescribePlayer();
}

function nextDescribePlayer() {
  const card = document.getElementById("describe-card");

  if (describeIndex >= describePlayers.length) {
    card.innerHTML = "<h3>🎉 Все персонажи показаны!</h3>";
    return;
  }

  card.innerHTML = `
    <div class="card">
      <strong>Игрок ${describeIndex + 1}</strong>, ваш персонаж:
      <h3 style="color:#4a90e2;">${describePlayers[describeIndex]}</h3>
      <small>Опишите его, чтобы другие догадались.</small>
    </div>
  `;

  describeIndex++;
}
