let guessCharacters = [];
let guessCurrentPlayer = 1;
let currentCharsUrl = null;

function guessSafe(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value);
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}

function startGuessCharacterGame(charsUrl) {
  currentCharsUrl = charsUrl;

  fetch(charsUrl, { cache: "no-store" })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(chars => {
      const shuffled = shuffleArray([...(Array.isArray(chars) ? chars : [])]);
      guessCharacters = [shuffled[0], shuffled[1]].filter(Boolean);
      guessCurrentPlayer = 1;
      displayPlayerButton();
    })
    .catch(err => {
      console.error(err);
      document.getElementById("game-container").innerHTML = `
        <section class="app-error-card fade-in">
          <div class="app-error-icon">!</div>
          <h2>Ошибка загрузки персонажей</h2>
          <p>Файл персонажей не загрузился или содержит неверный формат.</p>
          <button onclick="goToMainMenu()" class="back-button">⬅️ В меню</button>
        </section>
      `;
    });
}

function displayPlayerButton() {
  const container = document.getElementById("game-container");
  if (!container) return;

  if (guessCurrentPlayer > 2 || guessCharacters.length < 2) {
    container.innerHTML = `
      <h2>🏁 Раунд окончен</h2>
      <div class="card">
        <strong>Оба игрока получили персонажей</strong>
        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Теперь можно играть в отгадывание или начать новый раунд.</p>
      </div>
      <button onclick="startGuessCharacterGame('${currentCharsUrl}')" class="menu-button">🔄 Новый раунд</button>
      <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
    `;
    return;
  }

  container.innerHTML = `
    <h2>👥 Угадай персонажа</h2>
    <div class="card">
      <strong>Игрок ${guessCurrentPlayer}</strong>
      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Нажмите кнопку, посмотрите персонажа и никому его не показывайте.</p>
    </div>
    <button onclick="revealCharacter()" class="menu-button">👁 Показать персонажа</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function revealCharacter() {
  const container = document.getElementById("game-container");
  const character = guessCharacters[guessCurrentPlayer - 1];

  container.innerHTML = `
    <h2>👥 Угадай персонажа</h2>
    <div class="card secret-card">
      <span class="theme-label">Игрок ${guessCurrentPlayer}</span>
      <h3>${guessSafe(character)}</h3>
      <small>Опишите персонажа так, чтобы другой игрок смог угадать.</small>
    </div>
    <button onclick="nextGuessPlayer()" class="correct-button">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;

  guessCurrentPlayer++;
}

function nextGuessPlayer() {
  displayPlayerButton();
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
