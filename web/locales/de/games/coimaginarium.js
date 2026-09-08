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
      if (!res.ok) throw new Error(`Fehler beim Laden der Themen: ${res.status}`);
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
        container.innerHTML = `\n          <section class="app-error-card fade-in">\n            <div class="app-error-icon">!</div>\n            <h2>Themen konnten nicht geladen werden</h2>\n            <p>Prüfe die Themendatei und die Verbindung.</p>\n            <button onclick="goToMainMenu()" class="back-button">Zum Menü</button>\n          </section>\n        `;
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
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ".split("");
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
    container.innerHTML = `\n      <h2>🧠 Denk schnell</h2>\n      <div class="card">\n        <strong>Keine Themen mehr</strong>\n        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Starte einen neuen Themensatz oder kehre zum Menü zurück.</p>\n      </div>\n      <button onclick="startCoimaginariumGame('${themesUrlGlobal}')" class="menu-button">Neu beginnen</button>\n      <button onclick="goToMainMenu()" class="back-button">Hauptmenü</button>\n    `;
    return;
  }

  container.innerHTML = `\n    <h2>🧠 Denk schnell</h2>\n    <p><strong>Runde ${shownThemes.length}</strong> von ${shownThemes.length + coimaginariumThemes.length}. Der Gastgeber nennt ein Thema und einen Buchstaben. Die erste richtige Antwort erhält einen Punkt.</p>\n\n    <div class="theme-letter premium-theme-card">\n      <span class="theme-label">Thema</span>\n      <strong>${coimSafe(currentTheme)}</strong>
      <span class="theme-letter-big">${coimSafe(currentLetter)}</span>\n      <span class="theme-label">Rundenbuchstabe</span>\n    </div>\n\n    <div class="premium-actions">\n      <button onclick="changeCoimaginariumLetter()" class="menu-button">Buchstaben ändern</button>\n      <button onclick="nextCoimaginariumRound()" class="correct-button">Neue Runde</button>\n      <button onclick="goToMainMenu()" class="back-button">Hauptmenü</button>\n    </div>\n  `;
}

function changeCoimaginariumLetter() {
  currentLetter = getRandomLetter();
  displayCoimaginariumUI();
}

function nextCoimaginariumRound() {
  selectRandomThemeAndLetter();
  displayCoimaginariumUI();
}
