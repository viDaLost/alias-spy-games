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
      document.getElementById("game-container").innerHTML = `\n        <section class="app-error-card fade-in">\n          <div class="app-error-icon">!</div>\n          <h2>Error loading characters</h2>\n          <p>Character file could not load or has an invalid format.</p>\n          <button onclick="goToMainMenu()" class="back-button">Menu</button>\n        </section>\n      `;
    });
}

function displayPlayerButton() {
  const container = document.getElementById("game-container");
  if (!container) return;

  if (guessCurrentPlayer > 2 || guessCharacters.length < 2) {
    container.innerHTML = `\n      <h2>🏁 Round over</h2>\n      <div class="card">\n        <strong>Both players have their characters</strong>\n        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Now start guessing or begin a new round.</p>\n      </div>\n      <button onclick="startGuessCharacterGame('${currentCharsUrl}')" class="menu-button">New round</button>\n      <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n    `;
    return;
  }

  container.innerHTML = `\n    <h2>👥 Guess the Character</h2>\n    <div class="card">\n      <strong>Player ${guessCurrentPlayer}</strong>\n      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Tap the button, view your character and keep it secret.</p>\n    </div>\n    <button onclick="revealCharacter()" class="menu-button">Show character</button>\n    <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n  `;
}

function revealCharacter() {
  const container = document.getElementById("game-container");
  const character = guessCharacters[guessCurrentPlayer - 1];

  container.innerHTML = `\n    <h2>👥 Guess the Character</h2>\n    <div class="card secret-card">\n      <span class="theme-label">Player ${guessCurrentPlayer}</span>
      <h3>${guessSafe(character)}</h3>\n      <small>Describe the character so the other player can guess.</small>\n    </div>\n    <button onclick="nextGuessPlayer()" class="correct-button">Next player</button>\n    <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n  `;

  guessCurrentPlayer++;
}

function nextGuessPlayer() {
  displayPlayerButton();
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
