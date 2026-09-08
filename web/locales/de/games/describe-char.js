let describePlayers = [];
let describeIndex = 0;

function describeSafe(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value);
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}

function startDescribeCharacterGame(charsUrl) {
  window.charsUrl = charsUrl;
  const container = document.getElementById("game-container");

  container.innerHTML = `\n    <h2>🗣️ Beschreibe das Wort</h2>\n    <div class="card">\n      <strong>Regeln</strong>\n      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Spieler sehen abwechselnd ihr Wort und erklären es, ohne es zu nennen. Nutzt Eigenschaften, Verwendung und Assoziationen.</p>\n    </div>\n\n    <div class="setup-block">\n      <label for="playerCount" class="setup-label">Anzahl der Spieler</label>\n      <input type="number" id="playerCount" min="2" max="15" value="4" class="number-input input-lg">\n      <p class="hint">2 bis 15 Spieler</p>\n    </div>\n\n    <button onclick="startDescribeNewGame()" class="menu-button">Spiel starten</button>\n    <button onclick="goToMainMenu()" class="back-button">Hauptmenü</button>\n  `;
}

async function startDescribeNewGame() {
  const input = document.getElementById("playerCount").value;
  const playerCount = parseInt(input, 10);

  if (isNaN(playerCount) || playerCount < 2 || playerCount > 15) {
    alert("Gib eine Spielerzahl von 2 bis 15 ein.");
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
    alert("Fehler beim Laden der Wörter.");
  }
}

function showNextDescribePlayer() {
  const container = document.getElementById("game-container");

  if (describeIndex >= describePlayers.length) {
    container.innerHTML = `\n      <h2>🎉 Alle Wörter verteilt</h2>\n      <div class="card"><strong>Erklärt abwechselnd</strong></div>\n      <button onclick="startDescribeCharacterGame('${window.charsUrl}')" class="menu-button">Neues Spiel</button>\n      <button onclick="goToMainMenu()" class="back-button">Hauptmenü</button>\n    `;
    return;
  }

  container.innerHTML = `\n    <h2>🗣️ Beschreibe das Wort</h2>\n    <div class="card">\n      <strong>Spieler ${describeIndex + 1} von ${describePlayers.length}</strong>\n      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Sieh dir dein Wort an, ohne den anderen den Bildschirm zu zeigen.</p>\n    </div>\n    <button onclick="revealDescribeCard(${describeIndex})" class="menu-button">Wort anzeigen</button>\n    <button onclick="goToMainMenu()" class="back-button">Hauptmenü</button>\n  `;
}

function revealDescribeCard(index) {
  const container = document.getElementById("game-container");
  const character = describePlayers[index];

  container.innerHTML = `\n    <h2>🗣️ Beschreibe das Wort</h2>\n    <div class="card secret-card">\n      <span class="theme-label">Spieler ${index + 1}</span>
      <h3>${describeSafe(character)}</h3>\n      <small>Nenne das Wort nicht — beschreibe seine Merkmale.</small>\n    </div>\n    <button onclick="nextDescribePlayer()" class="correct-button">Nächster Spieler</button>\n    <button onclick="goToMainMenu()" class="back-button">Hauptmenü</button>\n  `;

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
  if (!res.ok) throw new Error(`HTTP Fehler: ${res.status}`);
  return await res.json();
}
