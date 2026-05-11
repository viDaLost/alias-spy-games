let describePlayers = [];
let describeIndex = 0;

function describeSafe(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value);
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}

function startDescribeCharacterGame(charsUrl) {
  window.charsUrl = charsUrl;
  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🗣️ Опиши слово</h2>
    <div class="card">
      <strong>Правила</strong>
      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Игроки по очереди смотрят своё слово, затем объясняют его без прямого названия. Можно говорить признаки, назначение и ассоциации.</p>
    </div>

    <div class="setup-block">
      <label for="playerCount" class="setup-label">Количество игроков</label>
      <input type="number" id="playerCount" min="2" max="15" value="4" class="number-input input-lg">
      <p class="hint">От 2 до 15 участников</p>
    </div>

    <button onclick="startDescribeNewGame()" class="menu-button">▶️ Начать игру</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

async function startDescribeNewGame() {
  const input = document.getElementById("playerCount").value;
  const playerCount = parseInt(input, 10);

  if (isNaN(playerCount) || playerCount < 2 || playerCount > 15) {
    alert("Введите количество игроков от 2 до 15.");
    return;
  }

  try {
    const chars = await loadJSON(window.charsUrl);
    const shuffled = shuffleArray([...(Array.isArray(chars) ? chars : [])]);
    describePlayers = [];

    for (let i = 0; i < playerCount; i++) {
      describePlayers.push(shuffled[i % shuffled.length]);
    }

    describeIndex = 0;
    showNextDescribePlayer();
  } catch (e) {
    console.error(e);
    alert("Ошибка загрузки слов.");
  }
}

function showNextDescribePlayer() {
  const container = document.getElementById("game-container");

  if (describeIndex >= describePlayers.length) {
    container.innerHTML = `
      <h2>🎉 Все слова розданы</h2>
      <div class="card"><strong>Начинайте объяснение по очереди</strong></div>
      <button onclick="startDescribeCharacterGame('${window.charsUrl}')" class="menu-button">🔄 Новая игра</button>
      <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
    `;
    return;
  }

  container.innerHTML = `
    <h2>🗣️ Опиши слово</h2>
    <div class="card">
      <strong>Игрок ${describeIndex + 1} из ${describePlayers.length}</strong>
      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Посмотрите своё слово так, чтобы остальные не увидели экран.</p>
    </div>
    <button onclick="revealDescribeCard(${describeIndex})" class="menu-button">👁 Показать слово</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function revealDescribeCard(index) {
  const container = document.getElementById("game-container");
  const character = describePlayers[index];

  container.innerHTML = `
    <h2>🗣️ Опиши слово</h2>
    <div class="card secret-card">
      <span class="theme-label">Игрок ${index + 1}</span>
      <h3>${describeSafe(character)}</h3>
      <small>Не называйте слово напрямую — объясняйте через признаки.</small>
    </div>
    <button onclick="nextDescribePlayer()" class="correct-button">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;

  describeIndex++;
}

function nextDescribePlayer() {
  showNextDescribePlayer();
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status}`);
  return await res.json();
}
