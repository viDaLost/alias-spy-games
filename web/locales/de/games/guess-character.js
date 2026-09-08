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
      document.getElementById("game-container").innerHTML = `\n        <section class="app-error-card fade-in">\n          <div class="app-error-icon">!</div>\n          <h2>Fehler beim Laden der Personen</h2>\n          <p>Personendatei konnte nicht geladen werden oder hat ein ungültiges Format.</p>\n          <button onclick="goToMainMenu()" class="back-button">Zum Menü</button>\n        </section>\n      `;
    });
}

function displayPlayerButton() {
  const container = document.getElementById("game-container");
  if (!container) return;

  if (guessCurrentPlayer > 2 || guessCharacters.length < 2) {
    container.innerHTML = `\n      <h2>🏁 Runde beendet</h2>\n      <div class="card">\n        <strong>Beide Spieler haben ihre Personen</strong>\n        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Jetzt könnt ihr raten oder eine neue Runde beginnen.</p>\n      </div>\n      <button onclick="startGuessCharacterGame('${currentCharsUrl}')" class="menu-button">Neue Runde</button>\n      <button onclick="goToMainMenu()" class="back-button">Hauptmenü</button>\n    `;
    return;
  }

  container.innerHTML = `\n    <h2>👥 Errate die Person</h2>\n    <div class="card">\n      <strong>Spieler ${guessCurrentPlayer}</strong>\n      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Tippe auf die Schaltfläche, sieh dir deine Person an und halte sie geheim.</p>\n    </div>\n    <button onclick="revealCharacter()" class="menu-button">Person anzeigen</button>\n    <button onclick="goToMainMenu()" class="back-button">Hauptmenü</button>\n  `;
}

function revealCharacter() {
  const container = document.getElementById("game-container");
  const character = guessCharacters[guessCurrentPlayer - 1];

  container.innerHTML = `\n    <h2>👥 Errate die Person</h2>\n    <div class="card secret-card">\n      <span class="theme-label">Spieler ${guessCurrentPlayer}</span>
      <h3>${guessSafe(character)}</h3>\n      <small>Beschreibe die Person, damit der andere Spieler sie erraten kann.</small>\n    </div>\n    <button onclick="nextGuessPlayer()" class="correct-button">Nächster Spieler</button>\n    <button onclick="goToMainMenu()" class="back-button">Hauptmenü</button>\n  `;

  guessCurrentPlayer++;
}

function nextGuessPlayer() {
  displayPlayerButton();
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
