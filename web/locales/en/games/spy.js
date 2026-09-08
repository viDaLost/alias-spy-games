let spyPlayers = [];
let currentSpyIndex = 0;
let sharedLocation = "";
let allLocations = [];

const SPY_ROLE_CARD_VERSION = "2";
const SPY_ROLE_CARD_ASSETS = Object.freeze({
  back: `web/assets/cards/spy-card-back.webp?v=${SPY_ROLE_CARD_VERSION}`,
  player: `web/assets/cards/spy-card-player.webp?v=${SPY_ROLE_CARD_VERSION}`,
  spy: `web/assets/cards/spy-card-spy.webp?v=${SPY_ROLE_CARD_VERSION}`,
});

function spySafe(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value);
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
}

function spyHaptic(type = "light") {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);
  } catch {}
}

function ensureSpyRoleCardStyles() {
  if (document.getElementById("spy-role-card-styles")) return;

  const style = document.createElement("style");
  style.id = "spy-role-card-styles";
  style.textContent = `\n    .spy-role-stage {\n      width: min(100%, 520px);\n      margin: 0 auto;\n      padding: 0 0 22px;\n      text-align: center;\n    }\n\n    .spy-role-header {\n      display: grid;\n      gap: 8px;\n      margin: 0 0 16px;\n    }\n\n    .spy-role-title {\n      margin: 0;\n      color: #312e81;\n      font-size: clamp(1.72rem, 7vw, 2.32rem);\n      line-height: 1;\n      font-weight: 950;\n      letter-spacing: -0.055em;\n    }\n\n    .spy-role-hint {\n      margin: 0 auto;\n      max-width: 410px;\n      color: rgba(49, 46, 129, .62);\n      font-size: .98rem;\n      line-height: 1.35;\n      font-weight: 750;\n    }\n\n    .spy-card-shell {\n      width: min(86vw, 360px);\n      aspect-ratio: 5 / 7;\n      margin: 14px auto 18px;\n      border: 0;\n      padding: 0;\n      background: transparent;\n      perspective: 1300px;\n      cursor: pointer;\n      display: block;\n      filter: drop-shadow(0 22px 34px rgba(49, 46, 129, .22));\n      -webkit-tap-highlight-color: transparent;\n    }\n\n    .spy-card-shell:focus-visible {\n      outline: 4px solid rgba(79, 70, 229, .28);\n      outline-offset: 8px;\n      border-radius: 32px;\n    }\n\n    .spy-card-shell__inner {\n      position: relative;\n      display: block;\n      width: 100%;\n      height: 100%;\n      transform-style: preserve-3d;\n      transform-origin: center center;\n      will-change: transform;\n      transition:\n        transform .82s cubic-bezier(.18, .86, .26, 1),\n        filter .24s ease;\n    }\n\n    .spy-card-shell:active .spy-card-shell__inner {\n      filter: brightness(1.03);\n      transform: scale(.985);\n    }\n\n    .spy-card-shell.is-revealed .spy-card-shell__inner {\n      transform: rotateY(180deg);\n    }\n\n    .spy-card-shell.is-revealed:active .spy-card-shell__inner {\n      transform: rotateY(180deg) scale(.985);\n    }\n\n    .spy-card-face {\n      position: absolute;\n      inset: 0;\n      border-radius: 30px;\n      overflow: hidden;\n      background: #dbeafe;\n      backface-visibility: hidden;\n      -webkit-backface-visibility: hidden;\n      box-shadow:\n        inset 0 0 0 1px rgba(255, 255, 255, .55),\n        0 18px 44px rgba(15, 23, 42, .16);\n    }\n\n    .spy-card-face--front {\n      transform: rotateY(180deg);\n    }\n\n    .spy-card-face img {\n      width: 100%;\n      height: 100%;\n      display: block;\n      object-fit: cover;\n      user-select: none;\n      -webkit-user-drag: none;\n      pointer-events: none;\n    }\n\n    .spy-card-back-glow {\n      position: absolute;\n      inset: 10%;\n      border-radius: 999px;\n      background: radial-gradient(circle, rgba(255,255,255,.42), transparent 62%);\n      opacity: .55;\n      pointer-events: none;\n      mix-blend-mode: screen;\n    }\n\n    .spy-card-value {\n      position: absolute;\n      left: 13.5%;\n      right: 13.5%;\n      top: 54.5%;\n      min-height: 17%;\n      transform: translateY(-50%);\n      display: flex;\n      flex-direction: column;\n      align-items: center;\n      justify-content: center;\n      gap: 6px;\n      padding: 10px 14px;\n      color: #0f172a;\n      text-align: center;\n      pointer-events: none;\n      text-shadow:\n        0 2px 0 rgba(255, 255, 255, .72),\n        0 10px 24px rgba(255, 255, 255, .68);\n    }\n\n    .spy-card-value__eyebrow {\n      font-size: clamp(.66rem, 2.7vw, .82rem);\n      font-weight: 950;\n      letter-spacing: .12em;\n      text-transform: uppercase;\n      color: rgba(49, 46, 129, .62);\n    }\n\n    .spy-card-value__main {\n      max-width: 100%;\n      color: #111827;\n      font-size: clamp(1.32rem, 6vw, 2.2rem);\n      font-weight: 950;\n      line-height: .98;\n      letter-spacing: -.04em;\n      overflow-wrap: anywhere;\n    }\n\n    .spy-card-value__main--spy {\n      color: #0f172a;\n      font-size: clamp(1.55rem, 7vw, 2.42rem);\n    }\n\n    .spy-card-value__note {\n      max-width: 92%;\n      color: rgba(49, 46, 129, .66);\n      font-size: clamp(.72rem, 2.8vw, .92rem);\n      font-weight: 850;\n      line-height: 1.15;\n    }\n\n    .spy-role-actions {\n      display: grid;\n      gap: 10px;\n      width: min(100%, 420px);\n      margin: 0 auto;\n    }\n\n    .spy-role-next[hidden],\n    .spy-role-reveal[hidden] {\n      display: none !important;\n    }\n\n    .spy-role-progress {\n      display: inline-flex;\n      align-items: center;\n      justify-content: center;\n      width: fit-content;\n      margin: 0 auto;\n      padding: 8px 12px;\n      border-radius: 999px;\n      background: rgba(255,255,255,.72);\n      border: 1px solid rgba(99,102,241,.14);\n      color: rgba(49, 46, 129, .72);\n      box-shadow: 0 12px 28px rgba(79,70,229,.08);\n      font-size: .86rem;\n      font-weight: 900;\n    }\n\n    .spy-card-privacy {\n      width: min(100%, 420px);\n      margin: 0 auto 12px;\n      padding: 12px 14px;\n      border: 1px solid rgba(99,102,241,.14);\n      border-radius: 20px;\n      background: rgba(255,255,255,.72);\n      box-shadow: 0 14px 34px rgba(79,70,229,.08);\n      color: rgba(17,24,39,.68);\n      font-weight: 750;\n      line-height: 1.32;\n    }\n\n    @media (max-width: 380px) {\n      .spy-card-shell {\n        width: min(90vw, 330px);\n      }\n\n      .spy-card-face {\n        border-radius: 24px;\n      }\n\n      .spy-card-value {\n        left: 12.5%;\n        right: 12.5%;\n        top: 54.8%;\n      }\n    }\n\n    @media (prefers-reduced-motion: reduce) {\n      .spy-card-shell__inner {\n        transition: none;\n      }\n      .spy-mode-card {\n        transition: none;\n      }\n    }\n\n    /* ---- choose mode ---- */\n    .spy-mode-wrap {\n      width: min(100%, 540px);\n      margin: 0 auto;\n      display: grid;\n      gap: 14px;\n      padding-bottom: 24px;\n    }\n\n    .spy-mode-wrap h2 {\n      margin: 0;\n      color: #312e81;\n      font-size: clamp(1.72rem, 7vw, 2.32rem);\n      line-height: 1;\n      font-weight: 950;\n      letter-spacing: -0.055em;\n    }\n\n    .spy-mode-lead {\n      margin: 0;\n      color: rgba(49, 46, 129, .66);\n      font-size: .98rem;\n      line-height: 1.42;\n      font-weight: 700;\n    }\n\n    .spy-mode-card {\n      display: flex;\n      align-items: center;\n      gap: 14px;\n      width: 100%;\n      padding: 18px 18px;\n      border: 2px solid rgba(79, 70, 229, .16);\n      border-radius: 22px;\n      background: #fff;\n      text-align: left;\n      cursor: pointer;\n      box-shadow: 0 10px 26px rgba(49, 46, 129, .10);\n      transition: transform .14s ease, border-color .14s ease, box-shadow .14s ease;\n      -webkit-tap-highlight-color: transparent;\n    }\n\n    .spy-mode-card:active {\n      transform: scale(.98);\n      border-color: rgba(79, 70, 229, .42);\n    }\n\n    .spy-mode-icon {\n      flex: none;\n      width: 52px;\n      height: 52px;\n      display: grid;\n      place-items: center;\n      border-radius: 16px;\n      background: linear-gradient(140deg, rgba(79, 70, 229, .14), rgba(124, 58, 237, .16));\n      font-size: 1.7rem;\n    }\n\n    .spy-mode-body {\n      display: grid;\n      gap: 4px;\n    }\n\n    .spy-mode-title {\n      color: #312e81;\n      font-size: 1.06rem;\n      font-weight: 900;\n      line-height: 1.2;\n    }\n\n    .spy-mode-note {\n      color: rgba(49, 46, 129, .58);\n      font-size: .88rem;\n      font-weight: 650;\n      line-height: 1.34;\n    }\n  `;
  document.head.appendChild(style);
}

/*
  Точка входа в «Соглядатая». Режима два: на одном телефоне (карта передаётся из
  рук в руки — так игра работала всегда) и по сети, где каждый смотрит свою
  роль на своём экране и обсуждает в общем чате.

  Второй аргумент нужен, чтобы вернуться к раздаче, не показывая выбор снова:
  кнопка «Новая игра» внутри партии зовёт startSpyGame(url, 'single').
*/
async function startSpyGame(locationsUrl, mode) {
  if (mode !== 'single') return showSpyModePicker(locationsUrl);
  return startSpySingleDevice(locationsUrl);
}

function showSpyModePicker(locationsUrl) {
  const container = document.getElementById('game-container');
  if (!container) return;
  ensureSpyRoleCardStyles();
  container.innerHTML = `\n    <div class="spy-mode-wrap fade-in">\n      <h2>🕵️ Spy</h2>\n      <p class="spy-mode-lead">One or more players are spies. Everyone else knows the location. Citizens find the spies; spies stay hidden and guess the place.</p>\n\n      <button class="spy-mode-card" data-spy-mode="single" type="button">\n        <span class="spy-mode-icon">📱</span>\n        <span class="spy-mode-body">\n          <span class="spy-mode-title">On one phone</span>\n          <span class="spy-mode-note">Pass the phone around. No setup needed.</span>\n        </span>\n      </button>\n\n      <button class="spy-mode-card" data-spy-mode="online" type="button">\n        <span class="spy-mode-icon">🌐</span>\n        <span class="spy-mode-body">\n          <span class="spy-mode-title">Online, each with a phone</span>\n          <span class="spy-mode-note">Join by code, private roles and built-in chat.</span>\n        </span>\n      </button>\n\n      <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n    </div>\n  `;
  container.querySelectorAll('[data-spy-mode]').forEach(node => {
    node.addEventListener('click', () => {
      spyHaptic('light');
      if (node.dataset.spyMode === 'single') return startSpySingleDevice(locationsUrl);
      openSpyOnline();
    });
  });
}

/*
  Онлайн живёт в отдельном файле: он тянет за собой транспорт, чат и своё
  оформление, и грузить всё это тем, кто играет на одном телефоне, незачем.
*/
function openSpyOnline() {
  const container = document.getElementById('game-container');
  if (window.startSpyOnlineGame) return window.startSpyOnlineGame();
  if (container) {
    container.innerHTML = '<div class="app-game-loading"><div class="app-loader__ring"></div><p>Loading online mode…</p></div>';
  }
  if (typeof loadGameScript === 'function') {
    loadGameScript(window.AppLanguage?.asset?.('web/locales/en/games/spy-online.js') || 'web/locales/en/games/spy-online.js', () => window.startSpyOnlineGame?.());
    return;
  }
  const script = document.createElement('script');
  script.src = window.AppLanguage?.asset?.('web/locales/en/games/spy-online.js') || 'web/locales/en/games/spy-online.js';
  script.onload = () => window.startSpyOnlineGame?.();
  script.onerror = () => {
    if (container) {
      container.innerHTML = `\n        <section class="app-error-card fade-in">\n          <div class="app-error-icon">!</div>\n          <h2>Online mode could not load</h2>\n          <button onclick="startSpyGame('web/locales/en/data/spy_locations.json')" class="menu-button">Back</button>\n        </section>`;
    }
  };
  document.head.appendChild(script);
}

async function startSpySingleDevice(locationsUrl) {
  ensureSpyRoleCardStyles();

  try {
    const locations = await loadJSON(locationsUrl);
    allLocations = Array.isArray(locations) ? locations : [];

    document.getElementById("game-container").innerHTML = `\n      <h2>🕵️ Spy</h2>\n      <div class="card">\n        <strong>Rules</strong>\n        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">One or more players are spies. Others know the location. After dealing roles, discuss and vote.</p>\n      </div>\n\n      <div class="setup-grid">\n        <div class="setup-block">\n          <label for="playerCount" class="setup-label">Number of players</label>\n          <input type="number" id="playerCount" min="3" max="20" value="5" class="number-input input-lg">\n          <p class="hint">From 3 to 20</p>\n        </div>\n        <div class="setup-block">\n          <label for="spyCount" class="setup-label">Number of spies</label>\n          <input type="number" id="spyCount" min="1" max="19" value="1" class="number-input input-lg">\n          <p class="hint">Must be fewer than the player count</p>\n        </div>\n      </div>\n\n      <button onclick="handleStartGame()" class="menu-button">Start game</button>\n      <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n    `;
  } catch (e) {
    console.error(e);
    document.getElementById("game-container").innerHTML = `\n      <section class="app-error-card fade-in">\n        <div class="app-error-icon">!</div>\n        <h2>Could not load locations</h2>\n        <p>Check the file ` + spySafe(locationsUrl) + ` and try again.</p>\n        <button onclick="goToMainMenu()" class="back-button">Menu</button>\n      </section>\n    `;
  }
}

function handleStartGame() {
  const playerCountInput = document.getElementById("playerCount").value.trim();
  const spyCountInput = document.getElementById("spyCount").value.trim();

  if (!playerCountInput || !spyCountInput) {
    alert("Enter all values");
    return;
  }

  const playerCount = parseInt(playerCountInput, 10);
  const spyCount = parseInt(spyCountInput, 10);

  if (isNaN(playerCount) || isNaN(spyCount)) {
    alert("All values must be numbers");
    return;
  }
  if (playerCount < 3 || playerCount > 20) {
    alert("There must be 3 to 20 players");
    return;
  }
  if (spyCount < 1 || spyCount >= playerCount) {
    alert("At least 1 spy, fewer than the number of players");
    return;
  }
  if (!allLocations.length) {
    alert("Location list is empty.");
    return;
  }

  sharedLocation = allLocations[randomInt(allLocations.length)];

  const players = Array.from({ length: playerCount }, (_, i) => ({ id: i + 1, role: "location", revealed: false }));
  const spyIndices = pickUniqueRandomIndices(playerCount, spyCount);
  spyIndices.forEach(index => {
    players[index].role = "spy";
  });

  spyPlayers = players;
  currentSpyIndex = 0;
  showNextPlayerRole();
}

function showNextPlayerRole() {
  ensureSpyRoleCardStyles();

  const container = document.getElementById("game-container");

  if (currentSpyIndex >= spyPlayers.length) {
    showDiscussionScreen();
    return;
  }

  const player = spyPlayers[currentSpyIndex];
  player.revealed = false;

  const isSpy = player.role === "spy";
  const frontAsset = isSpy ? SPY_ROLE_CARD_ASSETS.spy : SPY_ROLE_CARD_ASSETS.player;
  const valueHTML = getSpyRoleValueHTML(player);

  container.innerHTML = `\n    <section class="spy-role-stage fade-in">\n      <div class="spy-role-header">\n        <p class="spy-role-progress">Player ${player.id} of ${spyPlayers.length}</p>\n        <h2 class="spy-role-title">Secret card</h2>\n        <p class="spy-role-hint">Pass the phone to player ${player.id}. Tap the card without showing your role to others.</p>\n      </div>\n\n      <div class="spy-card-privacy">The card will flip. After viewing it, tap Pass to next player.</div>\n\n      <button\n        type="button"\n        id="spy-role-card"\n        class="spy-card-shell"\n        onclick="revealRole(${player.id})"\n        aria-label="Show player role ${player.id}"
      >
        <span class="spy-card-shell__inner">
          <span class="spy-card-face spy-card-face--back">
            <img src="${SPY_ROLE_CARD_ASSETS.back}" alt="" loading="eager" decoding="async">
            <span class="spy-card-back-glow" aria-hidden="true"></span>
          </span>
          <span class="spy-card-face spy-card-face--front">
            <img src="${frontAsset}" alt="" loading="eager" decoding="async">
            <span class="spy-card-value">
              ${valueHTML}
            </span>
          </span>
        </span>
      </button>

      <div class="spy-role-actions">
        <button id="spy-reveal-btn" onclick="revealRole(${player.id})" class="menu-button spy-role-reveal">Flip card</button>\n        <button id="spy-next-btn" onclick="showNextSpyPlayer()" class="menu-button spy-role-next" hidden>Pass to next player</button>\n        <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n      </div>\n    </section>\n  `;
}

function getSpyRoleValueHTML(player) {
  if (player.role === "spy") {
    return `\n      <span class="spy-card-value__eyebrow">Your role</span>\n      <span class="spy-card-value__main spy-card-value__main--spy">You are a spy</span>\n      <span class="spy-card-value__note">Work out the location from the answers</span>\n    `;
  }

  return `\n    <span class="spy-card-value__eyebrow">Location</span>\n    <span class="spy-card-value__main">${spySafe(sharedLocation)}</span>\n    <span class="spy-card-value__note">Remember the place and keep your screen private</span>\n  `;
}

function revealRole(id) {
  const player = spyPlayers.find(p => p.id === id);
  if (!player) return;

  player.revealed = true;
  spyHaptic("medium");

  const card = document.getElementById("spy-role-card");
  const revealButton = document.getElementById("spy-reveal-btn");
  const nextButton = document.getElementById("spy-next-btn");

  if (!card || !revealButton || !nextButton) {
    showNextPlayerRole();
    requestAnimationFrame(() => revealRole(id));
    return;
  }

  card.classList.add("is-revealed");
  card.setAttribute("aria-label", `Player role ${player.id} face up`);
  card.onclick = null;
  revealButton.hidden = true;
  nextButton.hidden = false;
  nextButton.focus({ preventScroll: true });
}

function showNextSpyPlayer() {
  spyHaptic("light");
  currentSpyIndex += 1;
  showNextPlayerRole();
}

function showDiscussionScreen() {
  const container = document.getElementById("game-container");
  container.innerHTML = `\n    <h2>🗣 Discussion round</h2>\n    <div class="card"><strong>Discussion started</strong><p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Ask questions and find players who do not know the location.</p></div>\n    <button onclick="showFinalScreen()" class="correct-button">Voting</button>\n    <button onclick="startSpyGame('web/locales/en/data/spy_locations.json', 'single')" class="menu-button">New game</button>\n    <button onclick="startSpyGame('web/locales/en/data/spy_locations.json')" class="menu-button">Change mode</button>\n    <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n  `;
}

function showFinalScreen() {
  const container = document.getElementById("game-container");
  container.innerHTML = `\n    <h2>🎯 Voting</h2>\n    <div class="setup-block">\n      <label for="voteSelect" class="setup-label">Who is a spy?</label>\n      <select id="voteSelect" class="input select input-lg">\n        ${spyPlayers.map(p => `<option value="${p.id}">Player ${p.id}</option>`).join("")}\n      </select>\n    </div>\n    <button onclick="submitVote()" class="correct-button">Vote</button>\n    <button onclick="tryGuessLocation()" class="menu-button">Spy guesses the location</button>\n    <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n  `;
}

function submitVote() {
  const votedId = document.getElementById("voteSelect").value.trim();
  showResults(votedId);
}

function tryGuessLocation() {
  const container = document.getElementById("game-container");
  container.innerHTML = `\n    <h2>🔍 Guess the location</h2>\n    <div class="setup-block">\n      <label for="locationInput" class="setup-label">Spy guess</label>\n      <input type="text" id="locationInput" placeholder="Enter location" class="input input-lg" />\n    </div>\n    <button onclick="checkGuessedLocation()" class="correct-button">Check</button>\n    <button onclick="showFinalScreen()" class="back-button">Back</button>\n  `;
}

function checkGuessedLocation() {
  const guess = document.getElementById("locationInput").value.trim().toLowerCase();
  const correct = String(sharedLocation).toLowerCase();
  alert((guess === correct ? "🎉 The spy guessed correctly!" : "❌ The spy guessed incorrectly.") + "\nLocation: " + sharedLocation);
  showFinalScreen();
}

function showResults(votedId) {
  const container = document.getElementById("game-container");
  const spies = spyPlayers.filter(p => p.role === "spy").map(p => p.id);
  const guessedCorrectly = spies.includes(Number(votedId));

  container.innerHTML = `\n    <h2>🏁 Game over</h2>\n    <div class="card">\n      <strong>${guessedCorrectly ? "Spies found" : "Spies escaped"}</strong>\n      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;"><b>Spies:</b> ${spies.join(", ")}<br><b>Location:</b> ${spySafe(sharedLocation)}</p>\n    </div>\n    <button onclick="startSpyGame('web/locales/en/data/spy_locations.json', 'single')" class="menu-button">New game</button>\n    <button onclick="startSpyGame('web/locales/en/data/spy_locations.json')" class="menu-button">Change mode</button>\n    <button onclick="goToMainMenu()" class="back-button">Main menu</button>\n  `;
}

function pickUniqueRandomIndices(totalCount, pickCount) {
  const indices = Array.from({ length: totalCount }, (_, index) => index);
  return shuffleArray(indices).slice(0, pickCount);
}

function shuffleArray(arr) {
  const result = [...arr];

  // Fisher–Yates даёт равномерное распределение.
  // sort(() => Math.random() - 0.5) создаёт перекос и как раз может
  // часто выбирать одни и те же позиции при одном соглядатае.
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function randomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("randomInt: maxExclusive must be a positive integer");
  }

  // crypto.getRandomValues лучше для честной жеребьёвки, а fallback нужен для старых WebView.
  const cryptoObject = globalThis.crypto || globalThis.msCrypto;
  if (cryptoObject?.getRandomValues) {
    const limit = 0x100000000 - (0x100000000 % maxExclusive);
    const buffer = new Uint32Array(1);

    do {
      cryptoObject.getRandomValues(buffer);
    } while (buffer[0] >= limit);

    return buffer[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return await res.json();
}
