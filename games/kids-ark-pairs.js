// games/kids-ark-pairs.js — «Найди пару для ковчега» (memory / перевёртыши)
// - 3 сложности: 4x4, 5x5, 6x6
// - Режим «на скорость» с таймером
// - Рекорды: топ-3 лучших результатов (быстрее = лучше)
//
// Важно: 5x5 = 25 карточек (нечётное), поэтому добавлена 1 бонус-карта 🕊️ без пары.
// Она считается найденной при открытии и нужна для завершения уровня.

(function () {
  let activeKidsTimer = null;
  window.__kidsArkCleanup = function kidsArkCleanup() {
    if (activeKidsTimer) {
      clearInterval(activeKidsTimer);
      activeKidsTimer = null;
    }
  };

  const STORAGE_KEY = "kids_ark_pairs_records_v1";

  const DIFFICULTIES = {
    easy: { label: "Лёгкий", size: 4 },   // 4x4 = 16 = 8 пар
    medium: { label: "Средний", size: 5 },// 5x5 = 25 = 12 пар + 1 бонус
    hard: { label: "Тяжёлый", size: 6 },  // 6x6 = 36 = 18 пар
  };

  const BONUS_CARD = "🕊️"; // одиночная карта для нечётного поля (5x5)

  // Нужно минимум 18 уникальных животных для 6x6 (18 пар)
  const ANIMALS = [
    "🦁","🐯","🐻","🐼","🦊","🐶","🐱","🐭",
    "🐹","🐰","🦝","🦓","🦒","🐘","🦏","🐪",
    "🐴","🐮","🐷","🐸","🐵","🦍","🐔","🐧",
    "🐦","🦉","🦆","🦅","🐝","🦋","🐢","🐬",
    "🐳","🦈","🐙","🦀","🦞","🐍","🦎","🐊",
    "🦜","🦚","🦢","🦛","🐟","🦑","🦔","🦘"
  ];

  function readRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { easy: [], medium: [], hard: [] };
      const parsed = JSON.parse(raw);
      return {
        easy: Array.isArray(parsed.easy) ? parsed.easy : [],
        medium: Array.isArray(parsed.medium) ? parsed.medium : [],
        hard: Array.isArray(parsed.hard) ? parsed.hard : [],
      };
    } catch {
      return { easy: [], medium: [], hard: [] };
    }
  }

  function writeRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function fmtMs(ms) {
    const totalSeconds = Math.round(ms / 10) / 100; // 2 знака
    return `${totalSeconds.toFixed(2)}с`;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderRecordsModal() {
    const rec = readRecords();
    const modal = document.createElement("div");
    modal.className = "kids-modal";
    modal.innerHTML = `
      <div class="kids-modal-card">
        <div class="kids-modal-title">🏆 Лучшие результаты</div>
        <div class="kids-modal-body">
          ${Object.keys(DIFFICULTIES)
            .map((k) => {
              const list = rec[k] || [];
              const title = DIFFICULTIES[k].label;
              const items = list.length
                ? list.map((ms, idx) => `<li>${idx + 1}. ${fmtMs(ms)}</li>`).join("")
                : `<li class="muted">Пока нет результатов</li>`;
              return `
                <div class="kids-record-block">
                  <div class="kids-record-title">${title}</div>
                  <ol class="kids-record-list">${items}</ol>
                </div>
              `;
            })
            .join("")}
        </div>
        <button class="menu-button" id="kids-modal-close">Закрыть</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector("#kids-modal-close").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function startGameUI() {
    try { window.__kidsArkCleanup?.(); } catch (e) {}
    const container = document.getElementById("game-container");
    const records = readRecords();

    container.innerHTML = `
      <div class="kids-screen fade-in">
        <h2>🛳️ Найди пару для ковчега</h2>
        <p class="kids-subtitle">Открой две карточки. Если животные одинаковые — пара найдена!</p>

        <div class="kids-panel">
          <label class="kids-switch">
            <input type="checkbox" id="kids-speed" />
            <span class="kids-switch-ui"></span>
            <span class="kids-switch-text">На скорость</span>
          </label>

          <button class="menu-button" id="kids-best-btn">🏆 Лучшие результаты</button>
        </div>

        <div class="kids-difficulty">
          ${Object.keys(DIFFICULTIES)
            .map((key) => {
              const best = (records[key] && records[key][0] != null) ? fmtMs(records[key][0]) : "—";
              const s = DIFFICULTIES[key].size;
              return `
                <button class="game-button" data-diff="${key}">
                  ${DIFFICULTIES[key].label} • поле ${s}×${s} • рекорд: ${best}
                </button>
              `;
            })
            .join("")}
        </div>

        <button class="back-button" id="kids-back">⬅ В меню</button>
      </div>
    `;

    container.querySelector("#kids-best-btn").addEventListener("click", renderRecordsModal);
    container.querySelector("#kids-back").addEventListener("click", () => goToMainMenu());

    [...container.querySelectorAll("button[data-diff]")].forEach((btn) => {
      btn.addEventListener("click", () => {
        const diff = btn.dataset.diff;
        const speed = container.querySelector("#kids-speed").checked;
        startBoard(diff, speed);
      });
    });
  }

  function startBoard(diffKey, speedMode) {
    try { window.__kidsArkCleanup?.(); } catch (e) {}
    const { size, label } = DIFFICULTIES[diffKey];
    const totalCards = size * size;

    const hasBonus = (totalCards % 2 === 1);
    const pairsCount = Math.floor(totalCards / 2);

    const chosen = shuffle(ANIMALS).slice(0, pairsCount);
    let deck = shuffle([...chosen, ...chosen]);
    if (hasBonus) deck = shuffle([...deck, BONUS_CARD]); // 5x5 -> +1 бонус

    let first = null;
    let second = null;
    let lock = false;

    let matchedPairs = 0;
    let bonusFound = !hasBonus;

    let timerStarted = false;
    let startTs = 0;
    let timerInterval = null;

    const container = document.getElementById("game-container");
    container.innerHTML = `
      <div class="kids-screen fade-in">
        <div class="kids-topbar">
          <div>
            <div class="kids-title-small">${label} • ${size}×${size}</div>
            <div class="kids-hint">Найди все пары животных${hasBonus ? " и открой 🕊️" : ""}</div>
          </div>
          <button class="menu-button kids-small" id="kids-restart">🔄 Заново</button>
        </div>

        ${speedMode ? `<div class="kids-timer" id="kids-timer">⏱ 0.00с</div>` : ""}

        <div class="kids-grid" style="--kids-grid:${size}">
          ${deck
            .map(
              (emoji, idx) => `
                <button class="kids-card" data-idx="${idx}" data-emoji="${emoji}" aria-label="карточка">
                  <div class="kids-card-inner">
                    <div class="kids-card-face kids-card-back">🛳️</div>
                    <div class="kids-card-face kids-card-front">${emoji}</div>
                  </div>
                </button>
              `
            )
            .join("")}
        </div>

        <div class="kids-bottom">
          <button class="back-button" id="kids-exit">⬅ В меню</button>
        </div>
      </div>
    `;

    const timerEl = container.querySelector("#kids-timer");

    function stopTimer() {
      if (timerInterval) clearInterval(timerInterval);
      if (activeKidsTimer === timerInterval) activeKidsTimer = null;
      timerInterval = null;
    }

    function startTimerIfNeeded() {
      if (!speedMode || timerStarted) return;
      timerStarted = true;
      startTs = performance.now();
      timerInterval = setInterval(() => {
        const ms = performance.now() - startTs;
        if (timerEl) timerEl.textContent = `⏱ ${fmtMs(ms)}`;
      }, 50);
      activeKidsTimer = timerInterval;
    }

    function finishIfDone() {
      const done = (matchedPairs === pairsCount) && bonusFound;
      if (!done) return;

      stopTimer();

      let msg = "🎉 Молодец! Все пары найдены!";

      if (speedMode) {
        const ms = performance.now() - startTs;
        const rec = readRecords();
        const list = Array.isArray(rec[diffKey]) ? rec[diffKey] : [];
        const updated = [...list, ms].sort((a, b) => a - b).slice(0, 3);
        rec[diffKey] = updated;
        writeRecords(rec);

        const best = updated[0] === ms;
        msg = best
          ? `🏆 Новый рекорд! Время: ${fmtMs(ms)}`
          : `⏱ Время: ${fmtMs(ms)} • Рекорд: ${fmtMs(updated[0])}`;
      }

      const modal = document.createElement("div");
      modal.className = "kids-modal";
      modal.innerHTML = `
        <div class="kids-modal-card">
          <div class="kids-modal-title">${msg}</div>
          <div class="kids-modal-actions">
            <button class="game-button" id="kids-play-again">Играть ещё</button>
            <button class="menu-button" id="kids-to-menu">В меню</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector("#kids-play-again").addEventListener("click", () => {
        modal.remove();
        startBoard(diffKey, speedMode);
      });
      modal.querySelector("#kids-to-menu").addEventListener("click", () => {
        modal.remove();
        goToMainMenu();
      });
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.remove();
          goToMainMenu();
        }
      });
    }

    function flip(btn) {
      btn.classList.add("flipped");
      btn.disabled = true;
    }

    function unflip(btn) {
      btn.classList.remove("flipped");
      btn.classList.remove("wrong");
      btn.disabled = false;
    }

    function setMatched(btn) {
      btn.classList.add("matched");
      btn.disabled = true;
    }

    function setBonusMatched(btn) {
      btn.classList.add("matched");
      btn.classList.add("bonus");
      btn.disabled = true;
    }

    function shake(btn) {
      btn.classList.add("wrong");
      void btn.offsetWidth; // перезапуск анимации
      btn.classList.add("shake");
      setTimeout(() => btn.classList.remove("shake"), 260);
    }

    function clearPairState() {
      first = null;
      second = null;
      lock = false;
    }

    function onCardClick(e) {
      const btn = e.currentTarget;
      if (lock) return;
      if (btn.classList.contains("matched") || btn.classList.contains("flipped")) return;

      startTimerIfNeeded();

      const emoji = btn.dataset.emoji;

      // Бонус-карта (одиночная): сразу фиксируем и не участвует в паре
      if (hasBonus && !bonusFound && emoji === BONUS_CARD) {
        flip(btn);
        setBonusMatched(btn);
        bonusFound = true;
        finishIfDone();
        return;
      }

      flip(btn);

      if (!first) {
        first = btn;
        return;
      }

      second = btn;
      lock = true;

      const a = first.dataset.emoji;
      const b = second.dataset.emoji;

      // На всякий случай: если бонус попал вторым (например бонус уже найден — не должен попадать)
      if (hasBonus && (a === BONUS_CARD || b === BONUS_CARD)) {
        // просто закрываем пару корректно
        setTimeout(() => {
          if (a === BONUS_CARD) setBonusMatched(first);
          if (b === BONUS_CARD) setBonusMatched(second);
          bonusFound = true;
          clearPairState();
          finishIfDone();
        }, 160);
        return;
      }

      if (a === b) {
        setTimeout(() => {
          setMatched(first);
          setMatched(second);
          matchedPairs += 1;
          clearPairState();
          finishIfDone();
        }, 220);
      } else {
        shake(first);
        shake(second);
        setTimeout(() => {
          unflip(first);
          unflip(second);
          clearPairState();
        }, 650);
      }
    }

    [...container.querySelectorAll(".kids-card")].forEach((btn) => btn.addEventListener("click", onCardClick));

    container.querySelector("#kids-exit").addEventListener("click", () => {
      stopTimer();
      goToMainMenu();
    });

    container.querySelector("#kids-restart").addEventListener("click", () => {
      stopTimer();
      startBoard(diffKey, speedMode);
    });
  }

  // Экспорт для лаунчера
  window.startKidsArkPairsGame = function () {
    startGameUI();
  };
})();
