let describePlayers = [];
let describeIndex = 0;

function describeSafe(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value);
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}

function startDescribeCharacterGame(charsUrl) {
  window.charsUrl = charsUrl;
  const container = document.getElementById("game-container");

  container.innerHTML = `\n    <h2>🗣️ Describe the word</h2>\n    <div class="card">\n      <strong>Rules</strong>\n      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Players take turns viewing their word, then describe it without naming it. Use traits, purpose and associations.</p>\n    </div>\n\n    <div class="setup-block">\n      <label for="playerCount" class="setup-label">Number of players</label>\n      <input type="number" id="playerCount" min="2" max="15" value="4" class="number-input input-lg">\n      <p class="hint">2 to 15 players</p>\n    </div>\n\n    <button onclick="startDescribeNewGame()" class="menu-button">Start game</button>\n    <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n  `;
}

async function startDescribeNewGame() {
  const input = document.getElementById("playerCount").value;
  const playerCount = parseInt(input, 10);

  if (isNaN(playerCount) || playerCount < 2 || playerCount > 15) {
    alert("Enter a player count from 2 to 15.");
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
    alert("Error loading words.");
  }
}

function showNextDescribePlayer() {
  const container = document.getElementById("game-container");

  if (describeIndex >= describePlayers.length) {
    container.innerHTML = `\n      <h2>🎉 All words dealt</h2>\n      <div class="card"><strong>Take turns explaining</strong></div>\n      <button onclick="startDescribeCharacterGame('${window.charsUrl}')" class="menu-button">New game</button>\n      <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n    `;
    return;
  }

  container.innerHTML = `\n    <h2>🗣️ Describe the word</h2>\n    <div class="card">\n      <strong>Player ${describeIndex + 1} of ${describePlayers.length}</strong>\n      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">View your word without letting others see the screen.</p>\n    </div>\n    <button onclick="revealDescribeCard(${describeIndex})" class="menu-button">Show word</button>\n    <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n  `;
}

function revealDescribeCard(index) {
  const container = document.getElementById("game-container");
  const character = describePlayers[index];

  container.innerHTML = `\n    <h2>🗣️ Describe the word</h2>\n    <div class="card secret-card">\n      <span class="theme-label">Player ${index + 1}</span>
      <h3>${describeSafe(character)}</h3>\n      <small>Do not name the word — describe its features.</small>\n    </div>\n    <button onclick="nextDescribePlayer()" class="correct-button">Next player</button>\n    <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n  `;

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
