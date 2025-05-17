let describePlayers = [];
let describeIndex = 0;

function startDescribeCharacterGame(charsUrl) {
  window.charsUrl = charsUrl;

  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🗣️ Опиши, но не называй</h2>
    <p><strong>Все игроки по очереди смотрят свое слово, потом начинают описывать это слово, к примеру ,где этот предмет используется, из какого он материала, твёрдый мягкий и т.д.Основная задача, отгадать слова других игроков.</strong></p>

    <label for="playerCount">Количество игроков (2–15):</label><br>
    <input type="number" id="playerCount" min="2" max="15" value="4"><br><br>

    <button onclick="startDescribeNewGame()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">▶️ Начать игру</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>
  `;
}

// Начало новой игры с заданным количеством игроков
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

    // Раздаём слова каждому игроку
    for (let i = 0; i < playerCount; i++) {
      describePlayers.push(shuffled[i % shuffled.length]);
    }

    describeIndex = 0;
    nextDescribePlayer();
  } catch (e) {
    alert("Ошибка загрузки персонажей.");
    console.error(e);
  }
}

// Показ карточки текущего игрока
function nextDescribePlayer() {
  const container = document.getElementById("game-container");
  container.innerHTML = `<h2>🗣️ Опиши, но не называй</h2>`;

  if (describeIndex >= describePlayers.length) {
    container.innerHTML += "<h3>🎉 Все персонажи описаны!</h3>";
    container.innerHTML += `<button onclick="startDescribeCharacterGame('${window.charsUrl}')" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white; margin-top:10px;">🔄 Новая игра</button>`;
    container.innerHTML += `<button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>`;
    return;
  }

  container.innerHTML += `
    <p><strong>Игрок ${describeIndex + 1}</strong>, ваш персонаж:</p>
    <div class="card" style="text-align:center;">
      <h3 style="color:#4a90e2; margin:10px 0;">${describePlayers[describeIndex]}</h3>
      <small>Опишите его, чтобы другие догадались.</small>
    </div>
    <button onclick="nextDescribePlayer()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white; margin-top:10px;">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>
  `;

  describeIndex++;
}
