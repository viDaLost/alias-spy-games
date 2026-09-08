// «Найди пару для ковчега» — memory game for children.
// The game keeps the classic pair-matching mechanic and adds a clearer journey,
// accessible controls, calm/speed modes, themed decks and safe lifecycle cleanup.

(function () {
  "use strict";

  const RECORDS_KEY = "kids_ark_pairs_records_v1";
  const STATS_KEY = "kids_ark_pairs_stats_v2";
  const PREFS_KEY = "kids_ark_pairs_prefs_v2";

  const DIFFICULTIES = {
    easy: { label: "Fácil", short: "4×4", size: 4, hints: 2, note: "8 parejas" },
    medium: { label: "Medio", short: "5×5", size: 5, hints: 2, note: "12 parejas + sorpresa" },
    hard: { label: "Difícil", short: "6×6", size: 6, hints: 1, note: "18 parejas" },
  };

  const MODES = {
    calm: {
      icon: "🧸",
      label: "Tranquilo",
      note: "Sin reloj: juega a tu ritmo",
    },
    speed: {
      icon: "⚡",
      label: "Contrarreloj",
      note: "Reloj y récords; una pista añade 5 segundos",
    },
  };

  const COLLECTIONS = {
    ark: {
      icon: "🛳️",
      label: "Toda el arca",
      note: "Todos los animales",
      back: "⚓",
      bonus: "🕊️",
      animals: [
        "🦁", "🐯", "🐻", "🐼", "🦊", "🐶", "🐱", "🐭",
        "🐹", "🐰", "🦝", "🦓", "🦒", "🐘", "🦏", "🐪",
        "🐴", "🐮", "🐷", "🐸", "🐵", "🦍", "🐔", "🐧",
        "🐦", "🦉", "🦆", "🦅", "🐝", "🦋", "🐢", "🐬",
        "🐳", "🦈", "🐙", "🦀", "🦞", "🐍", "🦎", "🐊",
        "🦜", "🦚", "🦢", "🦛", "🐟", "🦑", "🦔", "🦘",
      ],
    },
    safari: {
      icon: "🌿",
      label: "Safari",
      note: "Animales terrestres",
      back: "🌿",
      bonus: "🌈",
      animals: [
        "🦁", "🐯", "🐻", "🐼", "🦊", "🦝", "🦓", "🦒", "🐘", "🦏",
        "🐪", "🐴", "🦍", "🐵", "🦛", "🐊", "🐍", "🦎", "🦘", "🦔",
      ],
    },
    ocean: {
      icon: "🌊",
      label: "Junto al agua",
      note: "Mar y costas",
      back: "🌊",
      bonus: "🐚",
      animals: [
        "🐬", "🐳", "🐋", "🦈", "🐙", "🦑", "🦀", "🦞", "🦐", "🐟",
        "🐠", "🐡", "🐢", "🐊", "🐧", "🦆", "🦢", "🦭", "🦦", "🐸",
      ],
    },
  };

  const ANIMAL_NAMES = {
    "🦁": "león", "🐯": "tigre", "🐻": "oso", "🐼": "panda",
    "🦊": "zorro", "🐶": "perro", "🐱": "gato", "🐭": "ratón",
    "🐹": "hámster", "🐰": "conejo", "🦝": "mapache", "🦓": "cebra",
    "🦒": "jirafa", "🐘": "elefante", "🦏": "rinoceronte", "🐪": "camello",
    "🐴": "caballo", "🐮": "vaca", "🐷": "cerdito", "🐸": "rana",
    "🐵": "mono", "🦍": "gorila", "🐔": "gallina", "🐧": "pingüino",
    "🐦": "ave", "🦉": "búho", "🦆": "pato", "🦅": "águila",
    "🐝": "abeja", "🦋": "mariposa", "🐢": "tortuga", "🐬": "delfín",
    "🐳": "ballena", "🐋": "gran ballena", "🦈": "tiburón", "🐙": "pulpo",
    "🦀": "cangrejo", "🦞": "langosta", "🦐": "gamba", "🐍": "serpiente",
    "🦎": "lagarto", "🐊": "cocodrilo", "🦜": "loro", "🦚": "pavo real",
    "🦢": "cisne", "🦛": "hipopótamo", "🐟": "pez", "🐠": "pez tropical",
    "🐡": "pez globo", "🦑": "calamar", "🦔": "erizo", "🦘": "canguro",
    "🦭": "foca", "🦦": "nutria", "🕊️": "paloma de la paz",
    "🌈": "arcoíris", "🐚": "concha",
  };

  let activeSession = null;
  let activeModalCleanup = null;

  function defaultRecords() {
    return { easy: [], medium: [], hard: [] };
  }

  function defaultStats() {
    return {
      games: 0,
      pairs: 0,
      bestMoves: { easy: null, medium: null, hard: null },
      bestAccuracy: { easy: null, medium: null, hard: null },
    };
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function readRecords() {
    const raw = readJson(RECORDS_KEY, defaultRecords());
    const records = defaultRecords();
    Object.keys(DIFFICULTIES).forEach((key) => {
      records[key] = Array.isArray(raw[key])
        ? raw[key].filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b).slice(0, 3)
        : [];
    });
    return records;
  }

  function readStats() {
    const raw = readJson(STATS_KEY, defaultStats());
    const stats = defaultStats();
    stats.games = Number.isFinite(raw.games) ? Math.max(0, Math.floor(raw.games)) : 0;
    stats.pairs = Number.isFinite(raw.pairs) ? Math.max(0, Math.floor(raw.pairs)) : 0;
    Object.keys(DIFFICULTIES).forEach((key) => {
      const moves = raw.bestMoves?.[key];
      const accuracy = raw.bestAccuracy?.[key];
      stats.bestMoves[key] = Number.isFinite(moves) && moves > 0 ? Math.floor(moves) : null;
      stats.bestAccuracy[key] = Number.isFinite(accuracy) && accuracy > 0
        ? Math.min(100, Math.round(accuracy))
        : null;
    });
    return stats;
  }

  function readPreferences() {
    const raw = readJson(PREFS_KEY, {});
    return {
      mode: hasOwn(MODES, raw.mode) ? raw.mode : "calm",
      collection: hasOwn(COLLECTIONS, raw.collection) ? raw.collection : "ark",
    };
  }

  function fmtMs(ms) {
    const safeMs = Math.max(0, Number(ms) || 0);
    if (safeMs >= 60_000) {
      const minutes = Math.floor(safeMs / 60_000);
      const seconds = ((safeMs % 60_000) / 1000).toFixed(1).padStart(4, "0");
      return `${minutes}:${seconds}`;
    }
    return `${(safeMs / 1000).toFixed(2)} с`;
  }

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function cardName(emoji) {
    return ANIMAL_NAMES[emoji] || "animal";
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function haptic(kind) {
    try {
      const feedback = window.Telegram?.WebApp?.HapticFeedback;
      if (kind === "success" || kind === "error" || kind === "warning") {
        feedback?.notificationOccurred?.(kind);
      } else if (kind === "selection") {
        feedback?.selectionChanged?.();
      } else {
        feedback?.impactOccurred?.(kind === "medium" ? "medium" : "light");
      }
      if (!feedback && navigator.vibrate) {
        navigator.vibrate(kind === "success" ? [14, 24, 18] : kind === "error" ? [22, 28, 22] : 10);
      }
    } catch {}
  }

  function createSession() {
    const handles = new Set();
    return {
      disposed: false,
      later(callback, delay) {
        const handle = setTimeout(() => {
          handles.delete(handle);
          if (!this.disposed) callback();
        }, delay);
        handles.add(handle);
        return handle;
      },
      every(callback, delay) {
        const handle = setInterval(() => {
          if (!this.disposed) callback();
        }, delay);
        handles.add(handle);
        return handle;
      },
      clear(handle) {
        clearTimeout(handle);
        clearInterval(handle);
        handles.delete(handle);
      },
      dispose() {
        this.disposed = true;
        handles.forEach((handle) => {
          clearTimeout(handle);
          clearInterval(handle);
        });
        handles.clear();
      },
    };
  }

  function closeOwnedModal() {
    if (typeof activeModalCleanup === "function") activeModalCleanup();
    activeModalCleanup = null;
  }

  function cleanupActiveGame() {
    if (activeSession) activeSession.dispose();
    activeSession = null;
    closeOwnedModal();
    document.querySelectorAll("[data-kids-particle-layer]").forEach((node) => node.remove());
  }

  function mountModal(markup, { dismissible = true, onDismiss = null } = {}) {
    closeOwnedModal();
    const opener = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "kids-modal";
    overlay.dataset.kidsOwned = "true";
    overlay.innerHTML = markup;

    let closed = false;
    const close = ({ restoreFocus = true, notify = false } = {}) => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      if (activeModalCleanup === cleanup) activeModalCleanup = null;
      if (restoreFocus && opener instanceof HTMLElement && opener.isConnected) opener.focus();
      if (notify && typeof onDismiss === "function") onDismiss();
    };
    const cleanup = () => close({ restoreFocus: false, notify: false });

    function onKeyDown(event) {
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        close({ notify: true });
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...overlay.querySelectorAll("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    if (dismissible) {
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close({ notify: true });
      });
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.appendChild(overlay);
    activeModalCleanup = cleanup;
    requestAnimationFrame(() => overlay.querySelector("button")?.focus());
    return { overlay, close };
  }

  function renderRecordsModal() {
    const records = readRecords();
    const stats = readStats();
    const rows = Object.keys(DIFFICULTIES).map((key) => {
      const times = records[key];
      const bestTime = times.length ? fmtMs(times[0]) : "—";
      const bestMoves = stats.bestMoves[key] || "—";
      const accuracy = stats.bestAccuracy[key] ? `${stats.bestAccuracy[key]}%` : "—";
      return `
        <article class="kids-record-card">
          <div class="kids-record-card__title">${DIFFICULTIES[key].label} <span>${DIFFICULTIES[key].short}</span></div>\n          <dl>\n            <div><dt>Mejor tiempo</dt><dd>${bestTime}</dd></div>\n            <div><dt>Menos movimientos</dt><dd>${bestMoves}</dd></div>\n            <div><dt>Precisión</dt><dd>${accuracy}</dd></div>
          </dl>
        </article>
      `;
    }).join("");

    const modal = mountModal(`\n      <section class="kids-modal-card kids-records-modal" role="dialog" aria-modal="true" aria-labelledby="kids-records-title">\n        <div class="kids-modal-badge" aria-hidden="true">🏆</div>\n        <h2 class="kids-modal-title" id="kids-records-title">Libro de viajes</h2>\n        <p class="kids-modal-lead">Los mejores resultados se guardan solo en este dispositivo.</p>\n        <div class="kids-record-grid">${rows}</div>
        <div class="kids-record-summary">
          <span><strong>${stats.games}</strong> partidas</span>\n          <span><strong>${stats.pairs}</strong> parejas encontradas</span>\n        </div>\n        <button class="game-button" id="kids-records-close" type="button">Continuar</button>\n      </section>\n    `);
    modal.overlay.querySelector("#kids-records-close")?.addEventListener("click", () => modal.close());
  }

  function startGameUI() {
    cleanupActiveGame();
    const container = document.getElementById("game-container");
    if (!container) return;

    const records = readRecords();
    const stats = readStats();
    const preferences = readPreferences();

    container.innerHTML = `
      <section class="kids-screen kids-setup kids-theme-${preferences.collection}" aria-labelledby="kids-title">\n        <div class="kids-hero">\n          <div class="kids-hero__sky" aria-hidden="true">\n            <span class="kids-cloud kids-cloud--one">☁️</span>\n            <span class="kids-cloud kids-cloud--two">☁️</span>\n            <span class="kids-rainbow">🌈</span>\n            <span class="kids-ark">🛳️</span>\n            <span class="kids-hero-pair kids-hero-pair--one">🦒</span>\n            <span class="kids-hero-pair kids-hero-pair--two">🦒</span>\n          </div>\n          <p class="kids-kicker">Un juego de atención y memoria</p>\n          <h2 id="kids-title">Encuentra parejas para el arca</h2>\n          <p>Voltea dos cartas, recuerda los animales y encuentra todas las parejas.</p>\n        </div>\n\n        <div class="kids-setup-card">\n          <fieldset class="kids-fieldset">\n            <legend>¿Cómo jugamos?</legend>\n            <div class="kids-choice-grid kids-choice-grid--modes" role="group">\n              ${Object.entries(MODES).map(([key, mode]) => `
                <button class="kids-choice kids-mode-choice" type="button" data-mode="${key}" aria-pressed="${preferences.mode === key}">
                  <span class="kids-choice__icon" aria-hidden="true">${mode.icon}</span>
                  <span><strong>${mode.label}</strong><small>${mode.note}</small></span>
                </button>
              `).join("")}\n            </div>\n          </fieldset>\n\n          <fieldset class="kids-fieldset">\n            <legend>¿A quién llevamos de viaje?</legend>\n            <div class="kids-choice-grid kids-choice-grid--collections" role="group">\n              ${Object.entries(COLLECTIONS).map(([key, collection]) => `
                <button class="kids-choice kids-collection-choice" type="button" data-collection="${key}" aria-pressed="${preferences.collection === key}">
                  <span class="kids-choice__icon" aria-hidden="true">${collection.icon}</span>
                  <span><strong>${collection.label}</strong><small>${collection.note}</small></span>
                </button>
              `).join("")}\n            </div>\n          </fieldset>\n\n          <fieldset class="kids-fieldset">\n            <legend>Elige un tablero</legend>\n            <div class="kids-difficulty-grid">\n              ${Object.entries(DIFFICULTIES).map(([key, difficulty]) => {
                const best = records[key]?.[0] ? fmtMs(records[key][0]) : "sin récord";
                return `
                  <button class="kids-difficulty-card" type="button" data-diff="${key}">
                    <span class="kids-difficulty-card__size">${difficulty.short}</span>
                    <strong>${difficulty.label}</strong>
                    <small>${difficulty.note}</small>
                    <span class="kids-difficulty-card__record">⚡ ${best}</span>
                  </button>
                `;
              }).join("")}\n            </div>\n          </fieldset>\n        </div>\n\n        <div class="kids-setup-footer">\n          <button class="menu-button" id="kids-best-btn" type="button">Resultados</button>\n          <button class="back-button" id="kids-back" type="button">Al menú</button>\n        </div>\n        <p class="kids-total-note">Partidas jugadas: <strong>${stats.games}</strong> · parejas encontradas: <strong>${stats.pairs}</strong></p>
      </section>
    `;

    const screen = container.querySelector(".kids-screen");
    const applyPreferences = () => {
      screen.className = `kids-screen kids-setup kids-theme-${preferences.collection}`;
      screen.querySelectorAll("[data-mode]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.mode === preferences.mode));
      });
      screen.querySelectorAll("[data-collection]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.collection === preferences.collection));
      });
      writeJson(PREFS_KEY, preferences);
    };

    screen.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        preferences.mode = button.dataset.mode;
        haptic("selection");
        applyPreferences();
      });
    });
    screen.querySelectorAll("[data-collection]").forEach((button) => {
      button.addEventListener("click", () => {
        preferences.collection = button.dataset.collection;
        haptic("selection");
        applyPreferences();
      });
    });
    screen.querySelectorAll("[data-diff]").forEach((button) => {
      button.addEventListener("click", () => {
        haptic("medium");
        startBoard({
          diffKey: button.dataset.diff,
          modeKey: preferences.mode,
          collectionKey: preferences.collection,
        });
      });
    });
    screen.querySelector("#kids-best-btn")?.addEventListener("click", renderRecordsModal);
    screen.querySelector("#kids-back")?.addEventListener("click", () => {
      cleanupActiveGame();
      window.goToMainMenu?.();
    });
  }

  function startBoard(options) {
    cleanupActiveGame();
    const diffKey = hasOwn(DIFFICULTIES, options.diffKey) ? options.diffKey : "easy";
    const modeKey = hasOwn(MODES, options.modeKey) ? options.modeKey : "calm";
    const collectionKey = hasOwn(COLLECTIONS, options.collectionKey) ? options.collectionKey : "ark";
    const difficulty = DIFFICULTIES[diffKey];
    const mode = MODES[modeKey];
    const collection = COLLECTIONS[collectionKey];
    const speedMode = modeKey === "speed";
    const totalCards = difficulty.size * difficulty.size;
    const hasBonus = totalCards % 2 === 1;
    const pairsCount = Math.floor(totalCards / 2);
    const selectedAnimals = shuffle(collection.animals).slice(0, pairsCount);
    let deck = shuffle([...selectedAnimals, ...selectedAnimals].map((emoji, index) => ({ emoji, id: `${index}-${emoji}` })));
    if (hasBonus) deck = shuffle([...deck, { emoji: collection.bonus, id: `bonus-${collection.bonus}`, bonus: true }]);

    const session = createSession();
    activeSession = session;

    let first = null;
    let second = null;
    let locked = false;
    let finished = false;
    let matchedPairs = 0;
    let bonusFound = !hasBonus;
    let moves = 0;
    let combo = 0;
    let hintsLeft = difficulty.hints;
    let hintsUsed = 0;
    let timerStarted = false;
    let timerStart = 0;
    let timerHandle = null;
    let timePenalty = 0;

    const container = document.getElementById("game-container");
    if (!container) return;
    container.innerHTML = `
      <section class="kids-screen kids-game kids-theme-${collectionKey}" data-size="${difficulty.size}" aria-labelledby="kids-board-title">
        <header class="kids-game-header">
          <div>
            <p class="kids-kicker">${collection.icon} ${collection.label} · ${mode.icon} ${mode.label}</p>
            <h2 id="kids-board-title">${difficulty.label} viaje <span>${difficulty.short}</span></h2>\n          </div>\n          <button class="kids-icon-button" id="kids-restart" type="button" aria-label="Reiniciar este tablero">↻</button>\n        </header>\n\n        <div class="kids-progress-card" aria-label="Progreso del viaje">\n          <div class="kids-progress-copy">\n            <span>Animales a bordo</span>\n            <strong id="kids-progress-label">0 de ${pairsCount + (hasBonus ? 1 : 0)}</strong>\n          </div>\n          <div class="kids-progress-track" aria-hidden="true">\n            <span class="kids-progress-fill" id="kids-progress-fill"></span>\n            <span class="kids-progress-ark" id="kids-progress-ark">🛳️</span>\n          </div>\n        </div>\n\n        <div class="kids-hud">\n          <div class="kids-metric"><span>Parejas</span><strong id="kids-pairs">0/${pairsCount}</strong></div>\n          <div class="kids-metric"><span>Movimientos</span><strong id="kids-moves">0</strong></div>\n          <div class="kids-metric"><span>${speedMode ? "Tiempo" : "Precisión"}</span><strong id="kids-mode-value">${speedMode ? "0.00 с" : "100%"}</strong></div>\n        </div>\n\n        <div class="kids-feedback-row">\n          <p class="kids-status" id="kids-status" role="status" aria-live="polite">Elige la primera carta</p>\n          <span class="kids-combo" id="kids-combo" aria-live="polite" hidden>Combo ×2</span>\n        </div>\n\n        <div class="kids-board-shell">\n          <div class="kids-grid" style="--kids-grid:${difficulty.size}">
            ${deck.map((card, index) => {
              const label = card.bonus ? `Sorpresa: ${cardName(card.emoji)}` : cardName(card.emoji);
              return `
                <button class="kids-card" type="button" data-idx="${index}" data-emoji="${card.emoji}" data-label="${label}" data-bonus="${card.bonus ? "true" : "false"}" style="--kids-order:${index}" aria-label="Carta ${index + 1} de ${totalCards}, boca abajo" aria-pressed="false">\n                  <span class="kids-card-inner">\n                    <span class="kids-card-face kids-card-back" aria-hidden="true"><span>${collection.back}</span></span>
                    <span class="kids-card-face kids-card-front" aria-hidden="true"><span>${card.emoji}</span></span>
                  </span>
                </button>
              `;
            }).join("")}\n          </div>\n        </div>\n\n        <div class="kids-game-actions">\n          <button class="menu-button kids-hint-button" id="kids-hint" type="button">Pista · ${hintsLeft}</button>\n          <button class="back-button" id="kids-exit" type="button">Ajustes</button>\n        </div>\n        <p class="kids-rule-note">${hasBonus ? `Hay una sorpresa escondida entre las cartas ${collection.bonus} — subirá a bordo de inmediato.` : "En cada turno se revelan dos cartas."}</p>
      </section>
    `;

    const screen = container.querySelector(".kids-screen");
    const statusEl = screen.querySelector("#kids-status");
    const pairsEl = screen.querySelector("#kids-pairs");
    const movesEl = screen.querySelector("#kids-moves");
    const modeValueEl = screen.querySelector("#kids-mode-value");
    const comboEl = screen.querySelector("#kids-combo");
    const hintButton = screen.querySelector("#kids-hint");
    const progressFill = screen.querySelector("#kids-progress-fill");
    const progressArk = screen.querySelector("#kids-progress-ark");
    const progressLabel = screen.querySelector("#kids-progress-label");

    function elapsedMs() {
      return timerStarted ? performance.now() - timerStart + timePenalty : timePenalty;
    }

    function updateTimer() {
      if (speedMode && modeValueEl) modeValueEl.textContent = fmtMs(elapsedMs());
    }

    function stopTimer() {
      if (timerHandle) session.clear(timerHandle);
      timerHandle = null;
    }

    function startTimerIfNeeded() {
      if (!speedMode || timerStarted) return;
      timerStarted = true;
      timerStart = performance.now();
      timerHandle = session.every(updateTimer, 80);
    }

    function accuracyValue() {
      if (moves === 0) return 100;
      return Math.min(100, Math.round((matchedPairs / moves) * 100));
    }

    function announce(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function updateHud(message) {
      const foundTargets = matchedPairs + (hasBonus && bonusFound ? 1 : 0);
      const totalTargets = pairsCount + (hasBonus ? 1 : 0);
      const progress = totalTargets ? foundTargets / totalTargets : 0;
      pairsEl.textContent = `${matchedPairs}/${pairsCount}`;
      movesEl.textContent = String(moves);
      if (!speedMode) modeValueEl.textContent = `${accuracyValue()}%`;
      progressLabel.textContent = `${foundTargets} de ${totalTargets}`;
      progressFill.style.width = `${Math.round(progress * 100)}%`;
      progressArk.style.left = `${8 + Math.round(progress * 84)}%`;
      hintButton.textContent = `💡 Pista · ${hintsLeft}`;
      hintButton.disabled = hintsLeft <= 0 || locked || finished || matchedPairs >= pairsCount;
      comboEl.hidden = combo < 2;
      if (combo >= 2) comboEl.textContent = `Combo ×${combo}`;
      if (message) announce(message);
    }

    function setCardLabel(button, state) {
      const position = Number(button.dataset.idx) + 1;
      const name = button.dataset.label;
      if (state === "matched") {
        button.setAttribute("aria-label", `${name} — pareja encontrada`);
        button.setAttribute("aria-disabled", "true");
      } else if (state === "open") {
        button.setAttribute("aria-label", `${name}, boca arriba`);
      } else {
        button.setAttribute("aria-label", `Carta ${position} de ${totalCards}, boca abajo`);
        button.removeAttribute("aria-disabled");
      }
      button.setAttribute("aria-pressed", String(state !== "closed"));
    }

    function flip(button, className = "flipped") {
      button.classList.add(className);
      setCardLabel(button, "open");
    }

    function unflip(button, className = "flipped") {
      button.classList.remove(className, "wrong");
      setCardLabel(button, "closed");
    }

    function setMatched(button, bonus = false) {
      button.classList.remove("flipped", "peeked", "wrong");
      button.classList.add("matched");
      if (bonus) button.classList.add("bonus");
      setCardLabel(button, "matched");
    }

    function markWrong(button) {
      button.classList.add("wrong");
    }

    function clearTurn() {
      first = null;
      second = null;
      locked = false;
      updateHud();
    }

    function createMatchParticles(button, emoji) {
      const rect = button.getBoundingClientRect();
      const layer = document.createElement("div");
      layer.className = "kids-particle-layer";
      layer.dataset.kidsParticleLayer = "true";
      layer.setAttribute("aria-hidden", "true");
      const symbols = ["✨", "⭐", "💛", emoji, "✨"];
      layer.innerHTML = symbols.map((symbol, index) => `
        <span style="--kids-particle-x:${rect.left + rect.width / 2}px;--kids-particle-y:${rect.top + rect.height / 2}px;--kids-particle-i:${index};--kids-particle-dx:${(index - 2) * 22}px;--kids-particle-dy:${-74 - index * 6}px;--kids-particle-rotate:${(index - 2) * 28}deg">${symbol}</span>
      `).join("");
      document.body.appendChild(layer);
      session.later(() => layer.remove(), 920);
    }

    function starsForResult() {
      let stars = 1;
      if (moves <= Math.ceil(pairsCount * 1.5)) stars = 3;
      else if (moves <= Math.ceil(pairsCount * 2.25)) stars = 2;
      if (hintsUsed > 0) stars = Math.min(stars, 2);
      return stars;
    }

    function finishGame() {
      if (finished || matchedPairs !== pairsCount || !bonusFound) return;
      finished = true;
      locked = true;
      stopTimer();
      updateTimer();

      const finalTime = speedMode ? elapsedMs() : null;
      const accuracy = accuracyValue();
      const stars = starsForResult();
      let newTimeRecord = false;

      if (speedMode && finalTime != null) {
        const records = readRecords();
        const previousBest = records[diffKey]?.[0] ?? null;
        records[diffKey] = [...(records[diffKey] || []), finalTime].sort((a, b) => a - b).slice(0, 3);
        newTimeRecord = previousBest == null || finalTime < previousBest;
        writeJson(RECORDS_KEY, records);
      }

      const stats = readStats();
      const previousMoves = stats.bestMoves[diffKey];
      const newMoveRecord = previousMoves == null || moves < previousMoves;
      stats.games += 1;
      stats.pairs += matchedPairs;
      stats.bestMoves[diffKey] = previousMoves == null ? moves : Math.min(previousMoves, moves);
      stats.bestAccuracy[diffKey] = Math.max(stats.bestAccuracy[diffKey] || 0, accuracy);
      writeJson(STATS_KEY, stats);

      screen.classList.add("kids-complete");
      announce("¡Todas las parejas encontradas! ¡El arca está lista para viajar!");
      session.later(() => showVictory({ finalTime, accuracy, stars, newTimeRecord, newMoveRecord }), 680);
    }

    function showVictory(result) {
      if (session.disposed) return;
      const starRow = `${"★".repeat(result.stars)}${"☆".repeat(3 - result.stars)}`;
      const recordBadge = result.newTimeRecord
        ? "🏆 ¡Nuevo récord de tiempo!"
        : result.newMoveRecord
          ? "🎯 ¡Nuevo récord de movimientos!"
          : "🌈 ¡Un viaje fantástico!";
      const confetti = Array.from({ length: 18 }, (_, index) => {
        const symbols = ["✨", "⭐", "🌈", collection.icon, "💛"];
        return `<span style="--kids-confetti-x:${(index * 37) % 100}%;--kids-confetti-duration:${2600 + index * 70}ms;--kids-confetti-delay:${index * 90}ms">${symbols[index % symbols.length]}</span>`;
      }).join("");

      const modal = mountModal(`
        <div class="kids-confetti" aria-hidden="true">${confetti}</div>
        <section class="kids-modal-card kids-victory-card" role="dialog" aria-modal="true" aria-labelledby="kids-victory-title">
          <div class="kids-victory-ark" aria-hidden="true">🛳️</div>
          <p class="kids-victory-badge">${recordBadge}</p>\n          <h2 class="kids-modal-title" id="kids-victory-title">¡El arca está lista!</h2>\n          <div class="kids-stars" aria-label="${result.stars} de 3 estrellas">${starRow}</div>\n          <p class="kids-modal-lead">Todos los animales encontraron su pareja y subieron a bordo a salvo.</p>\n          <div class="kids-result-grid">\n            <div><span>Movimientos</span><strong>${moves}</strong></div>\n            <div><span>Precisión</span><strong>${result.accuracy}%</strong></div>
            ${speedMode ? `<div><span>Tiempo</span><strong>${fmtMs(result.finalTime)}</strong></div>` : `<div><span>Pistas</span><strong>${hintsUsed}</strong></div>`}\n          </div>\n          <div class="kids-modal-actions">\n            <button class="game-button" id="kids-play-again" type="button">Otro viaje</button>\n            <button class="menu-button" id="kids-change-settings" type="button">Otro modo</button>\n            <button class="back-button" id="kids-to-main" type="button">Al menú principal</button>\n          </div>\n        </section>\n      `, { dismissible: false });

      modal.overlay.querySelector("#kids-play-again")?.addEventListener("click", () => startBoard({ diffKey, modeKey, collectionKey }));
      modal.overlay.querySelector("#kids-change-settings")?.addEventListener("click", startGameUI);
      modal.overlay.querySelector("#kids-to-main")?.addEventListener("click", () => {
        cleanupActiveGame();
        window.goToMainMenu?.();
      });
    }

    function onCardClick(event) {
      const button = event.currentTarget;
      if (locked || finished || button.classList.contains("matched") || button.classList.contains("flipped") || button.classList.contains("peeked")) return;

      startTimerIfNeeded();

      if (button.dataset.bonus === "true") {
        const pendingPairName = first?.dataset.label || "";
        flip(button);
        locked = true;
        session.later(() => {
          setMatched(button, true);
          bonusFound = true;
          locked = false;
          createMatchParticles(button, button.dataset.emoji);
          updateHud(pendingPairName
            ? `${button.dataset.label} ya está a bordo. La carta revelada aún espera su pareja.`
            : `${button.dataset.label} encontrado: ¡la sorpresa está a bordo!`);
          finishGame();
        }, 260);
        return;
      }

      flip(button);
      if (!first) {
        first = button;
        updateHud(`En la carta — ${button.dataset.label}. Encuentra otra igual.`);
        return;
      }

      second = button;
      locked = true;
      moves += 1;
      updateHud();
      const firstCard = first;
      const secondCard = second;

      if (firstCard.dataset.emoji === secondCard.dataset.emoji) {
        session.later(() => {
          setMatched(firstCard);
          setMatched(secondCard);
          matchedPairs += 1;
          combo += 1;
          createMatchParticles(secondCard, secondCard.dataset.emoji);
          clearTurn();
          updateHud(combo >= 2 ? `Racha de ${combo} parejas. ¡Sigue así!` : `Pareja «${secondCard.dataset.label}» ¡ya está a bordo!`);
          finishGame();
        }, 300);
      } else {
        combo = 0;
        markWrong(firstCard);
        markWrong(secondCard);
        updateHud("No son pareja. Recuerda las cartas antes de que se den la vuelta.");
        session.later(() => {
          unflip(firstCard);
          unflip(secondCard);
          clearTurn();
          updateHud("Inténtalo de nuevo");
        }, 820);
      }
    }

    function useHint() {
      if (hintsLeft <= 0 || locked || finished) return;
      if (first) {
        announce("Termina primero el turno actual");
        return;
      }

      const unmatched = [...screen.querySelectorAll(".kids-card:not(.matched)")]
        .filter((button) => button.dataset.bonus !== "true");
      const groups = new Map();
      unmatched.forEach((button) => {
        const list = groups.get(button.dataset.emoji) || [];
        list.push(button);
        groups.set(button.dataset.emoji, list);
      });
      const pair = shuffle([...groups.values()].filter((cards) => cards.length >= 2))[0];
      if (!pair) {
        announce("Ya están todas las parejas: descubre la sorpresa");
        return;
      }

      startTimerIfNeeded();
      locked = true;
      hintsLeft -= 1;
      hintsUsed += 1;
      if (speedMode) timePenalty += 5_000;
      pair.slice(0, 2).forEach((button) => flip(button, "peeked"));
      haptic("light");
      updateHud(speedMode ? "La pista mostró una pareja. Se añadieron 5 segundos a tu tiempo." : "Recuerda esta pareja antes de que las cartas se den la vuelta.");
      session.later(() => {
        pair.slice(0, 2).forEach((button) => unflip(button, "peeked"));
        locked = false;
        updateHud("Ahora encuentra la pareja mostrada");
      }, 1250);
    }

    screen.querySelectorAll(".kids-card").forEach((button) => button.addEventListener("click", onCardClick));
    screen.querySelector("#kids-hint")?.addEventListener("click", useHint);
    screen.querySelector("#kids-restart")?.addEventListener("click", () => startBoard({ diffKey, modeKey, collectionKey }));
    screen.querySelector("#kids-exit")?.addEventListener("click", startGameUI);
    updateHud();
  }

  window.__kidsArkPairsCleanup = cleanupActiveGame;
  window.startKidsArkPairsGame = startGameUI;
})();
