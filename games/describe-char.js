let describePlayers = [];
let describeIndex = 0;

function startDescribeCharacterGame(charsUrl) {
  window.charsUrl = charsUrl;

  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🗣️ Опиши, но не называй</h2>
    <p><strong>Все игроки по очереди смотрят своё слово, потом начинают описывать его. 
    Например: где используется этот предмет, из чего он сделан, твёрдый или мягкий.
    Задача — отгадать слова других игроков.</strong></p>

    <label for="playerCount">Количество игроков (2–15):</label><br>
    <input type="number" id="playerCount" min="2" max="15" value="4"><br><br>

    <button onclick="startDescribeNewGame()" class="menu-button">▶️ Начать игру</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

// Запуск новой игры
async function startDescribeNewGame() {
  const input = document.getElementById("playerCount").value;
  const playerCount = parseInt(input);

  if (isNaN(playerCount) || playerCount < 2 || playerCount > 15) {
    alert("Введите количество игроков от 2 до 15.");
    return;
  }

  try {
    const chars = await loadJSON(window.charsUrl);
    const shuffled = shuffleArray([...chars]);
    describePlayers = [];

    // Раздаём слова
    for (let i = 0; i < playerCount; i++) {
      describePlayers.push(shuffled[i % shuffled.length]);
    }

    describeIndex = 0;
    displayDescribePlayer();
  } catch (e) {
    alert("Ошибка загрузки персонажей.");
    console.error(e);
  }
}

// Отображаем кнопку "Показать слово"
function displayDescribePlayer() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>🗣️ Опиши, но не называй</h2>";

  if (describeIndex >= describePlayers.length) {
    container.innerHTML += `<h3 class="fade-in">🎉 Все персонажи описаны!</h3>`;
    container.innerHTML += `<button onclick="startDescribeCharacterGame('${window.charsUrl}')" class="menu-button">🔄 Новая игра</button>`;
    container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Вернуться в главное меню</button>`;
    return;
  }

  container.innerHTML += `
    <p><strong>Игрок ${describeIndex + 1}</strong>, нажмите ниже, чтобы увидеть ваше слово:</p>
    <button onclick="revealDescribeCard(${describeIndex})" class="menu-button">👁 Показать слово</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

// Показываем слово при нажатии
function revealDescribeCard(index) {
  const container = document.getElementById("game-container");
  const character = describePlayers[index];

  container.innerHTML = `<h2>🗣️ Опиши, но не называй</h2>`;

  container.innerHTML += `
    <div class="card">
      <strong>Игрок ${index + 1}</strong>, Ваше слово:
      <h3>${character}</h3>
      <small>Опишите его, чтобы другие догадались.</small>
    </div>
    <button onclick="describeIndex++; displayDescribePlayer();" class="correct-button">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;

  describeIndex++;
}
