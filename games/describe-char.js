let describePlayers = [];
let describeIndex = 0;

function startDescribeCharacterGame(characters) {
  const container = document.getElementById("game-container");
  describePlayers = [];

  // Генерируем 4 случайных персонажа
  for (let i = 0; i < 4; i++) {
    describePlayers.push(characters[Math.floor(Math.random() * characters.length)]);
  }

  describeIndex = 0;

  container.innerHTML = `
    <h2>🗣️ Опиши, но не называй</h2>
    <p><strong>Правила:</strong> Каждому игроку даётся имя персонажа. Остальные должны догадаться, кто он.</p>
    <div id="describe-card" style="margin:20px 0;"></div>
    <button onclick="nextDescribePlayer()" style="width:100%; padding:15px; font-size:16px;">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px;">⬅️ Главное меню</button>
  `;

  nextDescribePlayer();
}

function nextDescribePlayer() {
  const card = document.getElementById("describe-card");

  if (describeIndex >= describePlayers.length) {
    card.innerHTML = "<h3>🎉 Все персонажи описаны!</h3>";
    return;
  }

  card.innerHTML = `
    <div class="card" style="text-align:center;">
      <strong>Игрок ${describeIndex + 1}</strong>, ваш персонаж:
      <h3 style="color:#4a90e2; margin:10px 0;">${describePlayers[describeIndex]}</h3>
      <small>Опишите его, чтобы другие догадались.</small>
    </div>
  `;

  describeIndex++;
}
