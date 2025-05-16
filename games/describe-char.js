let describePlayers = [];
let describeIndex = 0;

function startDescribeCharacterGame(characters) {
  const container = document.getElementById("game-container");
  describePlayers = shuffleArray([...characters]).slice(0, 4); // первые 4 случайных персонажа
  describeIndex = 0;

  container.innerHTML = `
    <h2>🗣️ Опиши, но не называй</h2>
    <p><strong>Правила:</strong> Каждый игрок получает имя персонажа. Остальные должны догадаться, кто он.</p>
    <div id="describe-card" style="margin:20px 0;"></div>
    <button onclick="nextDescribePlayer()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;

  nextDescribePlayer();
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
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
