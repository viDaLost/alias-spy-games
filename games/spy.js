let spyPlayers = [];
let currentSpyIndex = 0;
let sharedLocation = "";
let allLocations = [];

const SPY_ROLE_CARD_ASSETS = Object.freeze({
  back: "assets/cards/spy-card-back.png",
  player: "assets/cards/spy-card-player.png",
  spy: "assets/cards/spy-card-spy.png",
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
  style.textContent = `
    .spy-role-stage {
      width: min(100%, 520px);
      margin: 0 auto;
      padding: 0 0 22px;
      text-align: center;
    }

    .spy-role-header {
      display: grid;
      gap: 8px;
      margin: 0 0 16px;
    }

    .spy-role-title {
      margin: 0;
      color: #312e81;
      font-size: clamp(1.72rem, 7vw, 2.32rem);
      line-height: 1;
      font-weight: 950;
      letter-spacing: -0.055em;
    }

    .spy-role-hint {
      margin: 0 auto;
      max-width: 410px;
      color: rgba(49, 46, 129, .62);
      font-size: .98rem;
      line-height: 1.35;
      font-weight: 750;
    }

    .spy-card-shell {
      width: min(86vw, 360px);
      aspect-ratio: 5 / 7;
      margin: 14px auto 18px;
      border: 0;
      padding: 0;
      background: transparent;
      perspective: 1300px;
      cursor: pointer;
      display: block;
      filter: drop-shadow(0 22px 34px rgba(49, 46, 129, .22));
      -webkit-tap-highlight-color: transparent;
    }

    .spy-card-shell:focus-visible {
      outline: 4px solid rgba(79, 70, 229, .28);
      outline-offset: 8px;
      border-radius: 32px;
    }

    .spy-card-shell__inner {
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transition:
        transform .82s cubic-bezier(.18, .86, .26, 1),
        filter .24s ease;
    }

    .spy-card-shell:active .spy-card-shell__inner {
      filter: brightness(1.03);
      transform: scale(.985);
    }

    .spy-card-shell.is-revealed .spy-card-shell__inner {
      transform: rotateY(180deg);
    }

    .spy-card-shell.is-revealed:active .spy-card-shell__inner {
      transform: rotateY(180deg) scale(.985);
    }

    .spy-card-face {
      position: absolute;
      inset: 0;
      border-radius: 30px;
      overflow: hidden;
      background: #dbeafe;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, .55),
        0 18px 44px rgba(15, 23, 42, .16);
    }

    .spy-card-face--front {
      transform: rotateY(180deg);
    }

    .spy-card-face img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      user-select: none;
      -webkit-user-drag: none;
      pointer-events: none;
    }

    .spy-card-back-glow {
      position: absolute;
      inset: 10%;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(255,255,255,.42), transparent 62%);
      opacity: .55;
      pointer-events: none;
      mix-blend-mode: screen;
    }

    .spy-card-value {
      position: absolute;
      left: 13.5%;
      right: 13.5%;
      top: 54.5%;
      min-height: 17%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 14px;
      color: #0f172a;
      text-align: center;
      pointer-events: none;
      text-shadow:
        0 2px 0 rgba(255, 255, 255, .72),
        0 10px 24px rgba(255, 255, 255, .68);
    }

    .spy-card-value__eyebrow {
      font-size: clamp(.66rem, 2.7vw, .82rem);
      font-weight: 950;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: rgba(49, 46, 129, .62);
    }

    .spy-card-value__main {
      max-width: 100%;
      color: #111827;
      font-size: clamp(1.32rem, 6vw, 2.2rem);
      font-weight: 950;
      line-height: .98;
      letter-spacing: -.04em;
      overflow-wrap: anywhere;
    }

    .spy-card-value__main--spy {
      color: #0f172a;
      font-size: clamp(1.55rem, 7vw, 2.42rem);
    }

    .spy-card-value__note {
      max-width: 92%;
      color: rgba(49, 46, 129, .66);
      font-size: clamp(.72rem, 2.8vw, .92rem);
      font-weight: 850;
      line-height: 1.15;
    }

    .spy-role-actions {
      display: grid;
      gap: 10px;
      width: min(100%, 420px);
      margin: 0 auto;
    }

    .spy-role-next[hidden],
    .spy-role-reveal[hidden] {
      display: none !important;
    }

    .spy-role-progress {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: fit-content;
      margin: 0 auto;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,.72);
      border: 1px solid rgba(99,102,241,.14);
      color: rgba(49, 46, 129, .72);
      box-shadow: 0 12px 28px rgba(79,70,229,.08);
      font-size: .86rem;
      font-weight: 900;
    }

    .spy-card-privacy {
      width: min(100%, 420px);
      margin: 0 auto 12px;
      padding: 12px 14px;
      border: 1px solid rgba(99,102,241,.14);
      border-radius: 20px;
      background: rgba(255,255,255,.72);
      box-shadow: 0 14px 34px rgba(79,70,229,.08);
      color: rgba(17,24,39,.68);
      font-weight: 750;
      line-height: 1.32;
    }

    @media (max-width: 380px) {
      .spy-card-shell {
        width: min(90vw, 330px);
      }

      .spy-card-face {
        border-radius: 24px;
      }

      .spy-card-value {
        left: 12.5%;
        right: 12.5%;
        top: 54.8%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .spy-card-shell__inner {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

async function startSpyGame(locationsUrl) {
  ensureSpyRoleCardStyles();

  try {
    const locations = await loadJSON(locationsUrl);
    allLocations = Array.isArray(locations) ? locations : [];

    document.getElementById("game-container").innerHTML = `
      <h2>🕵️ Шпион</h2>
      <div class="card">
        <strong>Правила</strong>
        <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Один или несколько игроков — шпионы. Остальные знают локацию. После раздачи ролей обсуждайте и голосуйте.</p>
      </div>

      <div class="setup-grid">
        <div class="setup-block">
          <label for="playerCount" class="setup-label">Количество игроков</label>
          <input type="number" id="playerCount" min="3" max="20" value="5" class="number-input input-lg">
          <p class="hint">От 3 до 20</p>
        </div>
        <div class="setup-block">
          <label for="spyCount" class="setup-label">Количество шпионов</label>
          <input type="number" id="spyCount" min="1" max="19" value="1" class="number-input input-lg">
          <p class="hint">Должно быть меньше игроков</p>
        </div>
      </div>

      <button onclick="handleStartGame()" class="menu-button">▶️ Начать игру</button>
      <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
    `;
  } catch (e) {
    console.error(e);
    document.getElementById("game-container").innerHTML = `
      <section class="app-error-card fade-in">
        <div class="app-error-icon">!</div>
        <h2>Не удалось загрузить локации</h2>
        <p>Проверьте файл ` + spySafe(locationsUrl) + ` и попробуйте снова.</p>
        <button onclick="goToMainMenu()" class="back-button">⬅️ В меню</button>
      </section>
    `;
  }
}

function handleStartGame() {
  const playerCountInput = document.getElementById("playerCount").value.trim();
  const spyCountInput = document.getElementById("spyCount").value.trim();

  if (!playerCountInput || !spyCountInput) {
    alert("Введите все значения");
    return;
  }

  const playerCount = parseInt(playerCountInput, 10);
  const spyCount = parseInt(spyCountInput, 10);

  if (isNaN(playerCount) || isNaN(spyCount)) {
    alert("Все значения должны быть числами");
    return;
  }
  if (playerCount < 3 || playerCount > 20) {
    alert("Количество игроков должно быть от 3 до 20");
    return;
  }
  if (spyCount < 1 || spyCount >= playerCount) {
    alert("Шпионов должно быть минимум 1 и меньше, чем игроков");
    return;
  }
  if (!allLocations.length) {
    alert("Список локаций пуст.");
    return;
  }

  sharedLocation = allLocations[randomInt(allLocations.length)];

  const players = Array.from({ length: playerCount }, (_, i) => ({ id: i + 1, role: "локация", revealed: false }));
  const spyIndices = pickUniqueRandomIndices(playerCount, spyCount);
  spyIndices.forEach(index => {
    players[index].role = "шпион";
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

  const isSpy = player.role === "шпион";
  const frontAsset = isSpy ? SPY_ROLE_CARD_ASSETS.spy : SPY_ROLE_CARD_ASSETS.player;
  const valueHTML = getSpyRoleValueHTML(player);

  container.innerHTML = `
    <section class="spy-role-stage fade-in">
      <div class="spy-role-header">
        <p class="spy-role-progress">Игрок ${player.id} из ${spyPlayers.length}</p>
        <h2 class="spy-role-title">Секретная карточка</h2>
        <p class="spy-role-hint">Передайте телефон игроку ${player.id}. Нажмите на карточку так, чтобы роль не увидели другие.</p>
      </div>

      <div class="spy-card-privacy">Карточка перевернётся с анимацией. После просмотра нажмите «Передать следующему».</div>

      <button
        type="button"
        id="spy-role-card"
        class="spy-card-shell"
        onclick="revealRole(${player.id})"
        aria-label="Показать роль игрока ${player.id}"
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
        <button id="spy-reveal-btn" onclick="revealRole(${player.id})" class="menu-button spy-role-reveal">👁 Перевернуть карточку</button>
        <button id="spy-next-btn" onclick="showNextSpyPlayer()" class="menu-button spy-role-next" hidden>➡️ Передать следующему</button>
        <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
      </div>
    </section>
  `;
}

function getSpyRoleValueHTML(player) {
  if (player.role === "шпион") {
    return `
      <span class="spy-card-value__eyebrow">Ваша роль</span>
      <span class="spy-card-value__main spy-card-value__main--spy">Вы — шпион</span>
      <span class="spy-card-value__note">Узнайте локацию по ответам игроков</span>
    `;
  }

  return `
    <span class="spy-card-value__eyebrow">Локация</span>
    <span class="spy-card-value__main">${spySafe(sharedLocation)}</span>
    <span class="spy-card-value__note">Запомните место и не показывайте экран</span>
  `;
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
  card.setAttribute("aria-label", `Роль игрока ${player.id} открыта`);
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
  container.innerHTML = `
    <h2>🗣 Раунд общения</h2>
    <div class="card"><strong>Обсуждение началось</strong><p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;">Задавайте вопросы и ищите игроков, которые не знают локацию.</p></div>
    <button onclick="showFinalScreen()" class="correct-button">🎯 Голосование</button>
    <button onclick="startSpyGame('data/spy_locations.json')" class="menu-button">🔄 Новая игра</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function showFinalScreen() {
  const container = document.getElementById("game-container");
  container.innerHTML = `
    <h2>🎯 Голосование</h2>
    <div class="setup-block">
      <label for="voteSelect" class="setup-label">Кто шпион?</label>
      <select id="voteSelect" class="input select input-lg">
        ${spyPlayers.map(p => `<option value="${p.id}">Игрок ${p.id}</option>`).join("")}
      </select>
    </div>
    <button onclick="submitVote()" class="correct-button">🗳 Проголосовать</button>
    <button onclick="tryGuessLocation()" class="menu-button">🔍 Шпион угадывает локацию</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function submitVote() {
  const votedId = document.getElementById("voteSelect").value.trim();
  showResults(votedId);
}

function tryGuessLocation() {
  const container = document.getElementById("game-container");
  container.innerHTML = `
    <h2>🔍 Угадай локацию</h2>
    <div class="setup-block">
      <label for="locationInput" class="setup-label">Вариант шпиона</label>
      <input type="text" id="locationInput" placeholder="Введите локацию" class="input input-lg" />
    </div>
    <button onclick="checkGuessedLocation()" class="correct-button">✅ Проверить</button>
    <button onclick="showFinalScreen()" class="back-button">⬅️ Назад</button>
  `;
}

function checkGuessedLocation() {
  const guess = document.getElementById("locationInput").value.trim().toLowerCase();
  const correct = String(sharedLocation).toLowerCase();
  alert((guess === correct ? "🎉 Шпион угадал!" : "❌ Шпион не угадал.") + "\nЛокация: " + sharedLocation);
  showFinalScreen();
}

function showResults(votedId) {
  const container = document.getElementById("game-container");
  const spies = spyPlayers.filter(p => p.role === "шпион").map(p => p.id);
  const guessedCorrectly = spies.includes(Number(votedId));

  container.innerHTML = `
    <h2>🏁 Конец игры</h2>
    <div class="card">
      <strong>${guessedCorrectly ? "Шпионы найдены" : "Шпионы скрылись"}</strong>
      <p style="margin-top:8px; color:var(--ink-soft); font-size:1rem;"><b>Шпионы:</b> ${spies.join(", ")}<br><b>Локация:</b> ${spySafe(sharedLocation)}</p>
    </div>
    <button onclick="startSpyGame('data/spy_locations.json')" class="menu-button">🔄 Новая игра</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function pickUniqueRandomIndices(totalCount, pickCount) {
  const indices = Array.from({ length: totalCount }, (_, index) => index);
  return shuffleArray(indices).slice(0, pickCount);
}

function shuffleArray(arr) {
  const result = [...arr];

  // Fisher–Yates даёт равномерное распределение.
  // sort(() => Math.random() - 0.5) создаёт перекос и как раз может
  // часто выбирать одни и те же позиции при одном шпионе.
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function randomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("randomInt: maxExclusive должен быть положительным целым числом");
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
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status}`);
  return await res.json();
}
