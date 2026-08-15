let coimaginariumThemes = [];
let currentTheme = "";
let currentLetter = "";
let shownThemes = [];
let themesUrlGlobal = "";
let recentLetters = [];
const LETTER_COOLDOWN = 6;

function coimSafe(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value);
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}

function startCoimaginariumGame(themesUrl) {
  themesUrlGlobal = themesUrl;

  fetch(themesUrl, { cache: "no-store" })
    .then(res => {
      if (!res.ok) throw new Error(`Ошибка загрузки тем: ${res.status}`);
      return res.json();
    })
    .then(data => {
      coimaginariumThemes = Array.isArray(data) ? [...data] : [];
      shownThemes = [];
      recentLetters = [];
      selectRandomThemeAndLetter();
      displayCoimaginariumUI();
    })
    .catch(err => {
      console.error(err);
      const container = document.getElementById("game-container");
      if (container) {
        container.innerHTML = `
          <section class="app-error-card fade-in">
            <div class="app-error-icon">!</div>
            <h2>Не удалось загрузить темы</h2>
            <p>Проверьте файл с темами и подключение.</p>
            <button onclick="goToMainMenu()" class="back-button">⬅️ В меню</button>
          </section>
        `;
      }
    });
}

function selectRandomThemeAndLetter() {
  if (coimaginariumThemes.length === 0) {
    currentTheme = null;
    return;
  }

  const randomIndex = Math.floor(Math.random() * coimaginariumThemes.length);
  currentTheme = coimaginariumThemes[randomIndex];
  currentLetter = getRandomLetter();
  coimaginariumThemes.splice(randomIndex, 1);
  shownThemes.push(currentTheme);
}

function getRandomLetter() {
  const letters = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ".split("");
  let available = letters.filter(l => !recentLetters.includes(l));

  if (available.length === 0) {
    available = [...letters];
    recentLetters = [];
  }

  const picked = available[Math.floor(Math.random() * available.length)];
  recentLetters.push(picked);
  if (recentLetters.length > LETTER_COOLDOWN) recentLetters.shift();
  return picked;
}

function displayCoimaginariumUI() {
  const container = document.getElementById("game-container");
  if (!container) return;

  if (!currentTheme) {
    container.innerHTML = `
      <h2>🧠 Соображариум</h2>
      <div class="card">
        <strong>Темы закончились</strong>
        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Можно начать новый набор тем или вернуться в меню.</p>
      </div>
      <button onclick="startCoimaginariumGame('${themesUrlGlobal}')" class="menu-button">🔄 Начать заново</button>
      <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
    `;
    return;
  }

  container.innerHTML = `
    <h2>🧠 Соображариум</h2>
    <p><strong>Раунд ${shownThemes.length}</strong> из ${shownThemes.length + coimaginariumThemes.length}. Ведущий называет тему и букву. Первый точный ответ получает балл.</p>

    <div class="theme-letter premium-theme-card">
      <span class="theme-label">Тема</span>
      <strong>${coimSafe(currentTheme)}</strong>
      <span class="theme-letter-big">${coimSafe(currentLetter)}</span>
      <span class="theme-label">Буква раунда</span>
    </div>

    <div class="premium-actions">
      <button onclick="changeCoimaginariumLetter()" class="menu-button">🔁 Сменить букву</button>
      <button onclick="nextCoimaginariumRound()" class="correct-button">➡️ Новый раунд</button>
      <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
    </div>
  `;
}

function changeCoimaginariumLetter() {
  currentLetter = getRandomLetter();
  displayCoimaginariumUI();
}

function nextCoimaginariumRound() {
  selectRandomThemeAndLetter();
  displayCoimaginariumUI();
}
