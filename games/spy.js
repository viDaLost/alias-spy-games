let spyPlayers = [];
let currentSpyIndex = 0;
let sharedLocation = "";
let allLocations = [];

function spySafe(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value);
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}

async function startSpyGame(locationsUrl) {
  try {
    const locations = await loadJSON(locationsUrl);
    allLocations = Array.isArray(locations) ? locations : [];

    document.getElementById("game-container").innerHTML = `
      <h2>🕵️ Шпион</h2>
      <div class="card">
        <strong>Правила</strong>
        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Один или несколько игроков — шпионы. Остальные знают локацию. После раздачи ролей обсуждайте и голосуйте.</p>
      </div>

      <div class="setup-grid">
        <div class="setup-block">
          <label for="playerCount" class="setup-label">Количество игроков</label>
          <input type="number" id="playerCount" min="3" max="20" value="5" class="number-input input-lg">
          <p class="hint">От 3 до 20</p>
        </div>
        <div class="setup-block">
          <label for="spyCount" class="setup-label">Количество шпионов</label>
          <input type="number" id="spyCount" min="1" max="19" value="1" class="number-input input-lg">
          <p class="hint">Должно быть меньше игроков</p>
        </div>
      </div>

      <button onclick="handleStartGame()" class="menu-button">▶️ Начать игру</button>
      <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
    `;
  } catch (e) {
    console.error(e);
    document.getElementById("game-container").innerHTML = `
      <section class="app-error-card fade-in">
        <div class="app-error-icon">!</div>
        <h2>Не удалось загрузить локации</h2>
        <p>Проверьте файл ` + locationsUrl + ` и попробуйте снова.</p>
        <button onclick="goToMainMenu()" class="back-button">⬅️ В меню</button>
      </section>
    `;
  }
}

function handleStartGame() {
  const playerCountInput = document.getElementById("playerCount").value.trim();
  const spyCountInput = document.getElementById("spyCount").value.trim();

  if (!playerCountInput || !spyCountInput) {
    alert("Введите все значения");
    return;
  }

  const playerCount = parseInt(playerCountInput, 10);
  const spyCount = parseInt(spyCountInput, 10);

  if (isNaN(playerCount) || isNaN(spyCount)) {
    alert("Все значения должны быть числами");
    return;
  }
  if (playerCount < 3 || playerCount > 20) {
    alert("Количество игроков должно быть от 3 до 20");
    return;
  }
  if (spyCount < 1 || spyCount >= playerCount) {
    alert("Шпионов должно быть минимум 1 и меньше, чем игроков");
    return;
  }
  if (!allLocations.length) {
    alert("Список локаций пуст.");
    return;
  }

  sharedLocation = allLocations[Math.floor(Math.random() * allLocations.length)];

  const players = Array.from({ length: playerCount }, (_, i) => ({ id: i + 1, role: "локация", revealed: false }));
  const shuffledIndices = shuffleArray([...Array(players.length).keys()]);
  for (let i = 0; i < spyCount; i++) players[shuffledIndices[i]].role = "шпион";

  spyPlayers = players;
  currentSpyIndex = 0;
  showNextPlayerRole();
}

function showNextPlayerRole() {
  const container = document.getElementById("game-container");

  if (currentSpyIndex >= spyPlayers.length) {
    showDiscussionScreen();
    return;
  }

  const player = spyPlayers[currentSpyIndex];
  container.innerHTML = `
    <h2>🔍 Игрок ${player.id}</h2>
    <div class="card">
      <strong>Секретная роль</strong>
      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Нажмите и посмотрите роль так, чтобы её не увидели другие.</p>
    </div>
    <button onclick="revealRole(${player.id})" class="menu-button">👁 Показать роль</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function revealRole(id) {
  const container = document.getElementById("game-container");
  const player = spyPlayers.find(p => p.id === id);
  const roleText = player.role === "шпион" ? "🕵️ Вы — шпион" : `📍 Локация: <strong>${spySafe(sharedLocation)}</strong>`;

  container.innerHTML = `
    <h2>🔍 Ваша роль</h2>
    <div class="card secret-card">
      <span class="theme-label">Игрок ${player.id}</span>
      <h3>${roleText}</h3>
      <small>Запомните и передайте телефон следующему игроку.</small>
    </div>
    <button onclick="currentSpyIndex++; showNextPlayerRole();" class="menu-button">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function showDiscussionScreen() {
  const container = document.getElementById("game-container");
  container.innerHTML = `
    <h2>🗣 Раунд общения</h2>
    <div class="card"><strong>Обсуждение началось</strong><p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Задавайте вопросы и ищите игроков, которые не знают локацию.</p></div>
    <button onclick="showFinalScreen()" class="correct-button">🎯 Голосование</button>
    <button onclick="startSpyGame('data/spy_locations.json')" class="menu-button">🔄 Новая игра</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function showFinalScreen() {
  const container = document.getElementById("game-container");
  container.innerHTML = `
    <h2>🎯 Голосование</h2>
    <div class="setup-block">
      <label for="voteSelect" class="setup-label">Кто шпион?</label>
      <select id="voteSelect" class="input select input-lg">
        ${spyPlayers.map(p => `<option value="${p.id}">Игрок ${p.id}</option>`).join("")}
      </select>
    </div>
    <button onclick="submitVote()" class="correct-button">🗳 Проголосовать</button>
    <button onclick="tryGuessLocation()" class="menu-button">🔍 Шпион угадывает локацию</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function submitVote() {
  const votedId = document.getElementById("voteSelect").value.trim();
  showResults(votedId);
}

function tryGuessLocation() {
  const container = document.getElementById("game-container");
  container.innerHTML = `
    <h2>🔍 Угадай локацию</h2>
    <div class="setup-block">
      <label for="locationInput" class="setup-label">Вариант шпиона</label>
      <input type="text" id="locationInput" placeholder="Введите локацию" class="input input-lg" />
    </div>
    <button onclick="checkGuessedLocation()" class="correct-button">✅ Проверить</button>
    <button onclick="showFinalScreen()" class="back-button">⬅️ Назад</button>
  `;
}

function checkGuessedLocation() {
  const guess = document.getElementById("locationInput").value.trim().toLowerCase();
  const correct = String(sharedLocation).toLowerCase();
  alert((guess === correct ? "🎉 Шпион угадал!" : "❌ Шпион не угадал.") + "\nЛокация: " + sharedLocation);
  showFinalScreen();
}

function showResults(votedId) {
  const container = document.getElementById("game-container");
  const spies = spyPlayers.filter(p => p.role === "шпион").map(p => p.id);
  const guessedCorrectly = spies.includes(Number(votedId));

  container.innerHTML = `
    <h2>🏁 Конец игры</h2>
    <div class="card">
      <strong>${guessedCorrectly ? "Шпионы найдены" : "Шпионы скрылись"}</strong>
      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;"><b>Шпионы:</b> ${spies.join(", ")}<br><b>Локация:</b> ${spySafe(sharedLocation)}</p>
    </div>
    <button onclick="startSpyGame('data/spy_locations.json')" class="menu-button">🔄 Новая игра</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status}`);
  return await res.json();
}
