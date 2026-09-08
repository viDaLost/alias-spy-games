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
      document.getElementById("game-container").innerHTML = `\n        <section class="app-error-card fade-in">\n          <div class="app-error-icon">!</div>\n          <h2>Error al cargar personajes</h2>\n          <p>No se pudo cargar el archivo de personajes o su formato no es válido.</p>\n          <button onclick="goToMainMenu()" class="back-button">Al menú</button>\n        </section>\n      `;
    });
}

function displayPlayerButton() {
  const container = document.getElementById("game-container");
  if (!container) return;

  if (guessCurrentPlayer > 2 || guessCharacters.length < 2) {
    container.innerHTML = `\n      <h2>🏁 Ronda terminada</h2>\n      <div class="card">\n        <strong>Ambos jugadores tienen sus personajes</strong>\n        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Ahora podéis adivinar o empezar otra ronda.</p>\n      </div>\n      <button onclick="startGuessCharacterGame('${currentCharsUrl}')" class="menu-button">Nueva ronda</button>\n      <button onclick="goToMainMenu()" class="back-button">Menú principal</button>\n    `;
    return;
  }

  container.innerHTML = `\n    <h2>👥 Adivina el personaje</h2>\n    <div class="card">\n      <strong>Jugador ${guessCurrentPlayer}</strong>\n      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Pulsa el botón, mira tu personaje y no se lo enseñes a nadie.</p>\n    </div>\n    <button onclick="revealCharacter()" class="menu-button">Mostrar personaje</button>\n    <button onclick="goToMainMenu()" class="back-button">Menú principal</button>\n  `;
}

function revealCharacter() {
  const container = document.getElementById("game-container");
  const character = guessCharacters[guessCurrentPlayer - 1];

  container.innerHTML = `\n    <h2>👥 Adivina el personaje</h2>\n    <div class="card secret-card">\n      <span class="theme-label">Jugador ${guessCurrentPlayer}</span>
      <h3>${guessSafe(character)}</h3>\n      <small>Describe el personaje para que el otro jugador lo adivine.</small>\n    </div>\n    <button onclick="nextGuessPlayer()" class="correct-button">Siguiente jugador</button>\n    <button onclick="goToMainMenu()" class="back-button">Menú principal</button>\n  `;

  guessCurrentPlayer++;
}

function nextGuessPlayer() {
  displayPlayerButton();
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
