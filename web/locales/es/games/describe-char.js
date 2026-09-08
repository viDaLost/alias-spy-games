let describePlayers = [];
let describeIndex = 0;

function describeSafe(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value);
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}

function startDescribeCharacterGame(charsUrl) {
  window.charsUrl = charsUrl;
  const container = document.getElementById("game-container");

  container.innerHTML = `\n    <h2>🗣️ Describe la palabra</h2>\n    <div class="card">\n      <strong>Reglas</strong>\n      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Los jugadores ven su palabra por turnos y la describen sin nombrarla. Usa características, usos y asociaciones.</p>\n    </div>\n\n    <div class="setup-block">\n      <label for="playerCount" class="setup-label">Número de jugadores</label>\n      <input type="number" id="playerCount" min="2" max="15" value="4" class="number-input input-lg">\n      <p class="hint">De 2 a 15 jugadores</p>\n    </div>\n\n    <button onclick="startDescribeNewGame()" class="menu-button">Empezar partida</button>\n    <button onclick="goToMainMenu()" class="back-button">Menú principal</button>\n  `;
}

async function startDescribeNewGame() {
  const input = document.getElementById("playerCount").value;
  const playerCount = parseInt(input, 10);

  if (isNaN(playerCount) || playerCount < 2 || playerCount > 15) {
    alert("Introduce entre 2 y 15 jugadores.");
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
    alert("Error al cargar palabras.");
  }
}

function showNextDescribePlayer() {
  const container = document.getElementById("game-container");

  if (describeIndex >= describePlayers.length) {
    container.innerHTML = `\n      <h2>🎉 Todas las palabras repartidas</h2>\n      <div class="card"><strong>Explicad por turnos</strong></div>\n      <button onclick="startDescribeCharacterGame('${window.charsUrl}')" class="menu-button">Nueva partida</button>\n      <button onclick="goToMainMenu()" class="back-button">Menú principal</button>\n    `;
    return;
  }

  container.innerHTML = `\n    <h2>🗣️ Describe la palabra</h2>\n    <div class="card">\n      <strong>Jugador ${describeIndex + 1} de ${describePlayers.length}</strong>\n      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Mira tu palabra sin que los demás vean la pantalla.</p>\n    </div>\n    <button onclick="revealDescribeCard(${describeIndex})" class="menu-button">Mostrar palabra</button>\n    <button onclick="goToMainMenu()" class="back-button">Menú principal</button>\n  `;
}

function revealDescribeCard(index) {
  const container = document.getElementById("game-container");
  const character = describePlayers[index];

  container.innerHTML = `\n    <h2>🗣️ Describe la palabra</h2>\n    <div class="card secret-card">\n      <span class="theme-label">Jugador ${index + 1}</span>
      <h3>${describeSafe(character)}</h3>\n      <small>No digas la palabra: describe sus características.</small>\n    </div>\n    <button onclick="nextDescribePlayer()" class="correct-button">Siguiente jugador</button>\n    <button onclick="goToMainMenu()" class="back-button">Menú principal</button>\n  `;

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
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return await res.json();
}
