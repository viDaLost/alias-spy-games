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
      if (!res.ok) throw new Error(`Error al cargar temas: ${res.status}`);
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
        container.innerHTML = `\n          <section class="app-error-card fade-in">\n            <div class="app-error-icon">!</div>\n            <h2>No se pudieron cargar los temas</h2>\n            <p>Revisa el archivo de temas y la conexión.</p>\n            <button onclick="goToMainMenu()" class="back-button">Al menú</button>\n          </section>\n        `;
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
  const letters = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");
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
    container.innerHTML = `\n      <h2>🧠 Piensa rápido</h2>\n      <div class="card">\n        <strong>No quedan temas</strong>\n        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Empieza un nuevo conjunto de temas o vuelve al menú.</p>\n      </div>\n      <button onclick="startCoimaginariumGame('${themesUrlGlobal}')" class="menu-button">Empezar de nuevo</button>\n      <button onclick="goToMainMenu()" class="back-button">Menú principal</button>\n    `;
    return;
  }

  container.innerHTML = `\n    <h2>🧠 Piensa rápido</h2>\n    <p><strong>Ronda ${shownThemes.length}</strong> de ${shownThemes.length + coimaginariumThemes.length}. El anfitrión dice un tema y una letra. La primera respuesta correcta gana un punto.</p>\n\n    <div class="theme-letter premium-theme-card">\n      <span class="theme-label">Tema</span>\n      <strong>${coimSafe(currentTheme)}</strong>
      <span class="theme-letter-big">${coimSafe(currentLetter)}</span>\n      <span class="theme-label">Letra de la ronda</span>\n    </div>\n\n    <div class="premium-actions">\n      <button onclick="changeCoimaginariumLetter()" class="menu-button">Cambiar letra</button>\n      <button onclick="nextCoimaginariumRound()" class="correct-button">Nueva ronda</button>\n      <button onclick="goToMainMenu()" class="back-button">Menú principal</button>\n    </div>\n  `;
}

function changeCoimaginariumLetter() {
  currentLetter = getRandomLetter();
  displayCoimaginariumUI();
}

function nextCoimaginariumRound() {
  selectRandomThemeAndLetter();
  displayCoimaginariumUI();
}
