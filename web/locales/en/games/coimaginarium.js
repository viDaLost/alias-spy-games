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
      if (!res.ok) throw new Error(`Error loading themes: ${res.status}`);
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
        container.innerHTML = `\n          <section class="app-error-card fade-in">\n            <div class="app-error-icon">!</div>\n            <h2>Could not load themes</h2>\n            <p>Check the themes file and your connection.</p>\n            <button onclick="goToMainMenu()" class="back-button">Menu</button>\n          </section>\n        `;
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
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
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
    container.innerHTML = `\n      <h2>🧠 Think Fast</h2>\n      <div class="card">\n        <strong>No themes left</strong>\n        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Start a new set of themes or return to the menu.</p>\n      </div>\n      <button onclick="startCoimaginariumGame('${themesUrlGlobal}')" class="menu-button">Start over</button>\n      <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n    `;
    return;
  }

  container.innerHTML = `\n    <h2>🧠 Think Fast</h2>\n    <p><strong>Round ${shownThemes.length}</strong> of ${shownThemes.length + coimaginariumThemes.length}. The host names a theme and a letter. The first correct answer earns a point.</p>\n\n    <div class="theme-letter premium-theme-card">\n      <span class="theme-label">Topic</span>\n      <strong>${coimSafe(currentTheme)}</strong>
      <span class="theme-letter-big">${coimSafe(currentLetter)}</span>\n      <span class="theme-label">Round letter</span>\n    </div>\n\n    <div class="premium-actions">\n      <button onclick="changeCoimaginariumLetter()" class="menu-button">Change letter</button>\n      <button onclick="nextCoimaginariumRound()" class="correct-button">New round</button>\n      <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n    </div>\n  `;
}

function changeCoimaginariumLetter() {
  currentLetter = getRandomLetter();
  displayCoimaginariumUI();
}

function nextCoimaginariumRound() {
  selectRandomThemeAndLetter();
  displayCoimaginariumUI();
}
