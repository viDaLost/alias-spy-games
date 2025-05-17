let spyPlayers = [];
let currentSpyIndex = 0;
let sharedLocation = "";
let isSpiesShown = false;

// Загрузка локаций из JSON
async function startSpyGame(locationsUrl) {
  try {
    const locations = await loadJSON(locationsUrl);
    document.getElementById("game-container").innerHTML = `
      <h2>🕵️‍♂️ Шпион</h2>
      <p><strong>Правила:</strong> Один или несколько игроков — шпионы, остальные знают локацию. Задача: вычислить шпиона.</p>

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

// Подготовка к игре
function setupSpyGame(locations) {
  const playerCount = parseInt(document.getElementById("playerCount").value);
  const spyCount = parseInt(document.getElementById("spyCount").value);

  if (isNaN(playerCount) || isNaN(spyCount) || spyCount >= playerCount || playerCount < 3) {
    alert("Введите корректное количество игроков и шпионов.");
    return;
  }

  // Выбираем случайную локацию
  sharedLocation = locations[Math.floor(Math.random() * locations.length)];

  // Создаём список игроков
  const players = [];
  for (let i = 1; i <= playerCount; i++) {
    players.push({ id: i, name: "", role: "локация", revealed: false });
  }

  // Случайным образом делаем шпионов
  const shuffledIndices = shuffleArray([...Array(players.length).keys()]);
  for (let i = 0; i < spyCount; i++) {
    players[shuffledIndices[i]].role = "шпион";
  }

  spyPlayers = players;
  currentSpyIndex = 0;
  isSpiesShown = false;

  showNextPlayerRole();
}

// Показываем роль текущего игрока
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
  `;
}

// Открываем роль для игрока
function revealRole(id) {
  const container = document.getElementById("game-container");
  const player = spyPlayers.find(p => p.id === id);

  if (!player.revealed) {
    player.revealed = true;
  }

  let roleText = "";
  if (player.role === "шпион") {
    roleText = "🕵️‍♂️ Вы — шпион. Угадайте локацию.";
  } else {
    roleText = `📍 Ваша локация: <strong>${sharedLocation}</strong>`;
  }

  container.innerHTML = `
    <h2>🔍 Роль игрока ${player.id}</h2>
    <div class="card" style="margin:20px 0;">
      ${roleText}
    </div>
    <button onclick="currentSpyIndex++; showNextPlayerRole();" style="width:100%; padding:15px; font-size:16px; background:#28a745; color:white;">➡️ Следующий игрок</button>
  `;
}

// Экран обсуждения
function showDiscussionScreen() {
  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🗣️ Раунд общения</h2>
    <p>Теперь обсудите всё вместе и попробуйте вычислить шпионов.</p>
    <button onclick="showFinalScreen()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">🏁 Завершить раунд</button>
    <button onclick="startSpyGame('https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/spy_locations.json ')" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">🔄 Новая игра</button>
  `;
}

// Финальный экран голосования
function showFinalScreen() {
  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🎯 Голосование</h2>
    <p><strong>Выберите, кто, по вашему мнению, шпион.</strong></p>

    <select id="voteSelect">
      ${spyPlayers.map(p => `<option value="${p.id}">Игрок ${p.id}${p.name ? ` (${p.name})` : ""}</option>`).join("")}
    </select><br><br>

    <button onclick="submitVote()" style="width:100%; padding:15px; font-size:16px; background:#28a745; color:white;">🗳 Голосовать</button>
    <button onclick="tryGuessLocation()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#4a90e2; color:white;">🔍 Шпион хочет угадать локацию</button>
    <button onclick="startSpyGame('https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/spy_locations.json ')" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">🔄 Новая игра</button>
  `;
}

// Обработка голосования
function submitVote() {
  const vote = document.getElementById("voteSelect").value;
  alert("Вы проголосовали против игрока " + vote);
  showFinalResults();
}

// Шпион пытается угадать локацию
function tryGuessLocation() {
  const container = document.getElementById("game-container");
  container.innerHTML = `
    <h2>🕵️‍♂️ Шпион угадывает локацию</h2>
    <p>Какой, по вашему мнению, была локация?</p>
    <input type="text" id="guessLocationInput" placeholder="Введите локацию" style="width:100%; padding:10px; font-size:16px;" />
    <button onclick="checkGuessedLocation()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#28a745; color:white;">✅ Отправить</button>
    <button onclick="showFinalScreen()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Назад</button>
  `;
}

// Проверяем угаданную локацию
function checkGuessedLocation() {
  const guess = document.getElementById("guessLocationInput").value.trim().toLowerCase();
  const correct = sharedLocation.toLowerCase();

  const result = guess === correct ? "🎉 Шпион угадал!" : "❌ Шпион не угадал.";

  alert(result + "\nЛокация: " + sharedLocation);
  showFinalScreen();
}

// Показываем результаты
function showFinalResults() {
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
