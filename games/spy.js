let spyPlayers = [];
let currentSpyIndex = 0;
let sharedLocation = "";

// Начало игры
async function startSpyGame(locationsUrl) {
  try {
    const locations = await loadJSON(locationsUrl);

    document.getElementById("game-container").innerHTML = `
      <h2>🕵️‍♂️ Шпион</h2>
      <p><strong>Правила:</strong> Один или несколько игроков — шпионы. Остальные знают локацию. Задача — вычислить шпионов.</p>

      <label for="playerCount">Количество игроков (3–20):</label><br>
      <input type="number" id="playerCount" min="3" max="20" value="5"><br><br>

      <label for="spyCount">Количество шпионов (1–N-1):</label><br>
      <input type="number" id="spyCount" min="1" max="19" value="1"><br><br>

      <button onclick="setupSpyGame(locations)" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">▶️ Начать игру</button>
      <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
    `;
  } catch (e) {
    alert("Ошибка загрузки локаций.");
    console.error(e);
  }
}

// Настройка игры
function setupSpyGame(locations) {
  const playerCount = parseInt(document.getElementById("playerCount").value);
  const spyCount = parseInt(document.getElementById("spyCount").value);

  if (isNaN(playerCount) || isNaN(spyCount) || spyCount >= playerCount || playerCount < 3) {
    alert("Введите корректные значения.");
    return;
  }

  // Выбираем случайную локацию
  sharedLocation = locations[Math.floor(Math.random() * locations.length)];

  // Создаём список игроков
  const players = [];
  for (let i = 1; i <= playerCount; i++) {
    players.push({ id: i, role: "локация", revealed: false });
  }

  // Делаем шпионов
  const shuffledIndices = shuffleArray([...Array(players.length).keys()]);
  for (let i = 0; i < shuffledIndices.length && i < spyCount; i++) {
    players[shuffledIndices[i]].role = "шпион";
  }

  spyPlayers = players;
  currentSpyIndex = 0;

  showNextPlayerRole();
}

// Показываем роль по одному
function showNextPlayerRole() {
  const container = document.getElementById("game-container");
  container.innerHTML = "";

  if (currentSpyIndex >= spyPlayers.length) {
    showDiscussionScreen();
    return;
  }

  const player = spyPlayers[currentSpyIndex];

  container.innerHTML = `
    <h2>🔍 Игрок ${player.id}</h2>
    <p><strong>Нажмите кнопку ниже, чтобы увидеть свою роль.</strong></p>
    
    <button onclick="revealRole(${player.id})" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">👁 Показать роль</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;
}

// Открываем роль
function revealRole(id) {
  const container = document.getElementById("game-container");
  const player = spyPlayers.find(p => p.id === id);

  let roleText = "";
  if (player.role === "шпион") {
    roleText = "🕵️‍♂️ Вы — шпион.";
  } else {
    roleText = `📍 Локация: <strong>${sharedLocation}</strong>`;
  }

  container.innerHTML = `
    <h2>🔍 Ваша роль</h2>
    <div class="card" style="margin:20px 0;">
      ${roleText}
    </div>
    <button onclick="currentSpyIndex++; showNextPlayerRole();" style="width:100%; padding:15px; font-size:16px; background:#28a745; color:white;">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;
}

// Экран обсуждения
function showDiscussionScreen() {
  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🗣️ Раунд общения</h2>
    <p>Обсудите всё вместе и попробуйте вычислить шпионов.</p>
    <button onclick="showFinalScreen()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">🏁 Завершить раунд</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;
}

// Финальный экран голосования
function showFinalScreen() {
  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🎯 Голосование</h2>
    <p><strong>Выберите, кто из игроков шпион:</strong></p>
    <select id="voteSelect" style="width:100%; padding:10px; font-size:16px;"></select><br><br>

    <button onclick="submitVote()" style="width:100%; padding:15px; font-size:16px; background:#28a745; color:white;">🗳 Проголосовать</button>
    <button onclick="tryGuessLocation()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#4a90e2; color:white;">🔍 Шпион угадывает локацию</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;

  const voteSelect = document.getElementById("voteSelect");
  voteSelect.innerHTML = spyPlayers.map(p => `<option value="${p.id}">Игрок ${p.id}</option>`).join("");
}

// Обработка голосования
function submitVote() {
  const votedId = document.getElementById("voteSelect").value.trim();
  alert(`Вы проголосовали против игрока #${votedId}`);
  showResults(votedId);
}

// Шпион угадывает локацию
function tryGuessLocation() {
  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🕵️‍♂️ Шпион угадывает локацию</h2>
    <p>Какой, по вашему мнению, была локация?</p>
    <input type="text" id="locationInput" placeholder="Локация" style="width:100%; padding:10px; font-size:16px;" /><br><br>
    
    <button onclick="checkGuessedLocation()" style="width:100%; padding:15px; font-size:16px; background:#28a745; color:white;">✅ Отправить</button>
    <button onclick="showFinalScreen()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Назад</button>
  `;
}

// Проверяем угаданную локацию
function checkGuessedLocation() {
  const guess = document.getElementById("locationInput").value.trim().toLowerCase();
  const correct = sharedLocation.toLowerCase();

  const result = guess === correct ? "🎉 Шпион угадал!" : "❌ Шпион не угадал.";

  alert(result + "\nЛокация: " + sharedLocation);
  showFinalScreen();
}

// Показываем результаты
function showResults(votedId) {
  const container = document.getElementById("game-container");
  const spies = spyPlayers.filter(p => p.role === "шпион").map(p => p.id);

  container.innerHTML = `
    <h2>🏁 Конец игры</h2>
    <p><strong>Шпионы:</strong> ${spies.join(", ")}</p>
    <p><strong>Локация:</strong> ${sharedLocation}</p>
    <button onclick="startSpyGame('https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/spy_locations.json ')" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">🔄 Новая игра</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;
}

// Вспомогательные функции
function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

async function loadJSON(url) {
  const res = await fetch(url);
  return await res.json();
}
