// games/bible-wordsearch.js
// Игра: поиск слов в сетке (без диагоналей, путь может изгибаться под прямым углом)

function startBibleWordSearchGame(levelsUrl) {
  const container = document.getElementById("game-container");
  if (!container) return;

  const tgUser = (typeof getTelegramUser === "function") ? getTelegramUser() : { id: "anon" };
  const STORAGE_KEY = `bible_wordsearch_progress_v1_${tgUser.id}`;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const now = () => Date.now();

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveProgress(p) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, _ts: now() }));
    } catch {}
  }

  function defaultProgress(levelsCount) {
    return {
      currentLevel: 0,
      completed: {},
      // per-level state: { found: [word], revealed: [word] }
      state: {},
      levelsCount,
    };
  }

  let LEVELS = [];
  let progress = null;

  // ===== UI helpers =====
  function renderShell() {
    container.innerHTML = `
      <div class="ws-wrap fade-in">
        <div class="ws-topbar">
          <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
          <div class="ws-title">
            <div class="ws-title__name">🔎 Поиск библейских слов</div>
            <div class="ws-title__meta" id="ws-meta"></div>
          </div>
        </div>

        <div class="ws-panel">
          <div class="ws-actions">
            <button class="start-button" id="ws-hint">💡 Подсказка</button>
            <button class="wrong-button" id="ws-reset">♻️ Сброс уровня</button>
          </div>
          <div class="ws-progress" id="ws-progress"></div>
        </div>

        <div class="ws-board" id="ws-board" aria-label="Игровое поле"></div>

        <div class="ws-words">
          <div class="ws-words__title">Слова уровня</div>
          <div class="ws-words__list" id="ws-words"></div>
        </div>

        <div class="ws-bottom">
          <button class="start-button" id="ws-prev">⬅️ Пред. уровень</button>
          <button class="start-button" id="ws-next">След. уровень ➡️</button>
        </div>
      </div>
    `;
  }

  function getLevelState(levelIndex) {
    const k = String(levelIndex);
    if (!progress.state[k]) {
      progress.state[k] = { found: [], revealed: [] };
    }
    return progress.state[k];
  }

  function setCurrentLevel(i) {
    progress.currentLevel = clamp(i, 0, LEVELS.length - 1);
    saveProgress(progress);
    renderLevel();
  }

  function isSolved(levelIndex) {
    return !!progress.completed[String(levelIndex)];
  }

  function markSolved(levelIndex) {
    progress.completed[String(levelIndex)] = true;
    saveProgress(progress);
  }

  // ===== Game logic =====
  let selecting = false;
  let selected = []; // list of {r,c,el}
  let solvedCells = new Set(); // "r,c"

  function keyOf(r, c) { return `${r},${c}`; }

  function buildBoard(level, levelState) {
    const board = document.getElementById("ws-board");
    const wordsWrap = document.getElementById("ws-words");
    const meta = document.getElementById("ws-meta");
    const prog = document.getElementById("ws-progress");
    if (!board || !wordsWrap || !meta || !prog) return;

    meta.textContent = `Уровень ${progress.currentLevel + 1} из ${LEVELS.length} • ${level.theme}${level.note ? " • " + level.note : ""}`;

    // Reset per-render
    selecting = false;
    selected = [];
    solvedCells = new Set();

    // Build words list
    const foundSet = new Set(levelState.found || []);
    wordsWrap.innerHTML = "";
    level.words.forEach(w => {
      const item = document.createElement("div");
      item.className = "ws-word" + (foundSet.has(w.text) ? " ws-word--done" : "");
      item.textContent = w.text;
      wordsWrap.appendChild(item);
    });

    // Mark solved cells from found words
    const byText = new Map(level.words.map(w => [w.text, w]));
    (levelState.found || []).forEach(t => {
      const w = byText.get(t);
      if (!w) return;
      w.path.forEach(([r, c]) => solvedCells.add(keyOf(r, c)));
    });

    const totalCells = level.rows * level.cols;
    prog.textContent = `Заполнено: ${solvedCells.size}/${totalCells} ячеек • Найдено: ${(levelState.found || []).length}/${level.words.length} слов`;

    // Build grid
    board.style.setProperty("--ws-cols", level.cols);
    board.innerHTML = "";

    for (let r = 0; r < level.rows; r++) {
      const rowStr = level.grid[r];
      for (let c = 0; c < level.cols; c++) {
        const ch = rowStr[c];
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "ws-cell";
        cell.textContent = ch;
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);

        if (solvedCells.has(keyOf(r, c))) {
          cell.classList.add("ws-cell--solved");
          cell.disabled = true;
        }

        board.appendChild(cell);
      }
    }
  }

  function cellsAreAdjacent(a, b) {
    const dr = Math.abs(a.r - b.r);
    const dc = Math.abs(a.c - b.c);
    return (dr + dc) === 1;
  }

  function clearSelection() {
    selected.forEach(x => x.el.classList.remove("ws-cell--sel"));
    selected = [];
  }

  function selectCell(el) {
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    const k = keyOf(r, c);
    if (solvedCells.has(k)) return;

    if (selected.length === 0) {
      selected.push({ r, c, el });
      el.classList.add("ws-cell--sel");
      return;
    }

    const last = selected[selected.length - 1];
    // Backtrack
    if (selected.length >= 2) {
      const prev = selected[selected.length - 2];
      if (prev.r === r && prev.c === c) {
        last.el.classList.remove("ws-cell--sel");
        selected.pop();
        return;
      }
    }

    // No repeats
    if (selected.some(x => x.r === r && x.c === c)) return;

    // Must be adjacent
    if (!cellsAreAdjacent(last, { r, c })) return;

    selected.push({ r, c, el });
    el.classList.add("ws-cell--sel");
  }

  function selectionToText() {
    return selected.map(x => x.el.textContent).join("");
  }

  function tryCommitSelection(level, levelState) {
    if (selected.length < 2) {
      clearSelection();
      return;
    }
    const text = selectionToText();
    const rev = text.split("").reverse().join("");

    const remaining = new Set(level.words.map(w => w.text));
    (levelState.found || []).forEach(t => remaining.delete(t));

    let matched = null;
    for (const w of level.words) {
      if (!remaining.has(w.text)) continue;
      if (w.text === text || w.text === rev) {
        // Also verify exact path (same coordinates order OR reverse)
        const coords = selected.map(x => [x.r, x.c]);
        const p = w.path;
        const same = p.length === coords.length && p.every((pc, i) => pc[0] === coords[i][0] && pc[1] === coords[i][1]);
        const sameRev = p.length === coords.length && p.every((pc, i) => pc[0] === coords[coords.length - 1 - i][0] && pc[1] === coords[coords.length - 1 - i][1]);
        if (same || sameRev) {
          matched = w;
          break;
        }
      }
    }

    if (!matched) {
      // small shake
      const board = document.getElementById("ws-board");
      if (board) {
        board.classList.remove("ws-shake");
        void board.offsetWidth;
        board.classList.add("ws-shake");
      }
      clearSelection();
      return;
    }

    // Mark found
    levelState.found = Array.from(new Set([...(levelState.found || []), matched.text]));
    saveProgress(progress);

    // Lock cells
    matched.path.forEach(([r, c]) => solvedCells.add(keyOf(r, c)));
    clearSelection();
    renderLevel(false);

    // Completed?
    if (solvedCells.size === level.rows * level.cols) {
      markSolved(progress.currentLevel);
      showWin(level);
    }
  }

  function showWin(level) {
    const done = document.createElement("div");
    done.className = "ws-win";
    done.innerHTML = `
      <div class="ws-win__card">
        <div class="ws-win__title">✅ Уровень пройден!</div>
        <div class="ws-win__text">Тема: <b>${level.theme}</b></div>
        <div class="ws-win__actions">
          <button class="start-button" id="ws-win-next">Следующий уровень ➡️</button>
          <button class="back-button" id="ws-win-menu">⬅️ В меню</button>
        </div>
      </div>
    `;
    container.querySelector(".ws-wrap")?.appendChild(done);

    done.querySelector("#ws-win-menu")?.addEventListener("click", () => goToMainMenu());
    done.querySelector("#ws-win-next")?.addEventListener("click", () => {
      done.remove();
      if (progress.currentLevel < LEVELS.length - 1) {
        setCurrentLevel(progress.currentLevel + 1);
      }
    });
  }

  function hint(level, levelState) {
    const found = new Set(levelState.found || []);
    const remaining = level.words.filter(w => !found.has(w.text));
    if (!remaining.length) return;

    // 50%: подсветить первую букву, 50%: открыть слово целиком
    const w = remaining[Math.floor(Math.random() * remaining.length)];
    const mode = Math.random() < 0.5 ? "first" : "full";
    const board = document.getElementById("ws-board");
    if (!board) return;

    if (mode === "first") {
      const [r, c] = w.path[0];
      const el = board.querySelector(`.ws-cell[data-r="${r}"][data-c="${c}"]`);
      if (!el) return;
      el.classList.add("ws-cell--hint");
      setTimeout(() => el.classList.remove("ws-cell--hint"), 900);
      return;
    }

    // reveal full word
    levelState.revealed = Array.from(new Set([...(levelState.revealed || []), w.text]));
    levelState.found = Array.from(new Set([...(levelState.found || []), w.text]));
    saveProgress(progress);
    w.path.forEach(([r, c]) => solvedCells.add(keyOf(r, c)));
    renderLevel(false);
    if (solvedCells.size === level.rows * level.cols) {
      markSolved(progress.currentLevel);
      showWin(level);
    }
  }

  function resetLevel() {
    const levelIndex = progress.currentLevel;
    const st = getLevelState(levelIndex);
    st.found = [];
    st.revealed = [];
    // Не снимаем флаг "completed" — если хочешь, можно снять вручную ниже.
    delete progress.completed[String(levelIndex)];
    saveProgress(progress);
    renderLevel();
  }

  function attachEvents(level) {
    const board = document.getElementById("ws-board");
    if (!board) return;

    const st = getLevelState(progress.currentLevel);

    // Controls
    document.getElementById("ws-prev")?.addEventListener("click", () => setCurrentLevel(progress.currentLevel - 1));
    document.getElementById("ws-next")?.addEventListener("click", () => setCurrentLevel(progress.currentLevel + 1));
    document.getElementById("ws-reset")?.addEventListener("click", resetLevel);
    document.getElementById("ws-hint")?.addEventListener("click", () => hint(level, st));

    // Selection (pointer events)
    const onDown = (e) => {
      const target = e.target.closest(".ws-cell");
      if (!target || target.disabled) return;
      selecting = true;
      clearSelection();
      selectCell(target);
      try { target.setPointerCapture?.(e.pointerId); } catch {}
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!selecting) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest?.(".ws-cell");
      if (!target || target.disabled) return;
      selectCell(target);
      e.preventDefault();
    };

    const onUp = () => {
      if (!selecting) return;
      selecting = false;
      tryCommitSelection(level, st);
    };

    board.addEventListener("pointerdown", onDown, { passive: false });
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });

    // Cleanup when leaving game
    window.__wsCleanup = () => {
      board.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }

  function renderLevel(withEvents = true) {
    const level = LEVELS[progress.currentLevel];
    const st = getLevelState(progress.currentLevel);
    buildBoard(level, st);

    // Disable prev/next appropriately
    const prevBtn = document.getElementById("ws-prev");
    const nextBtn = document.getElementById("ws-next");
    if (prevBtn) prevBtn.disabled = progress.currentLevel === 0;
    if (nextBtn) nextBtn.disabled = progress.currentLevel === LEVELS.length - 1;

    if (withEvents) {
      try { window.__wsCleanup?.(); } catch {}
      attachEvents(level);
    }
  }

  // ===== boot =====
  renderShell();

  loadJSON(levelsUrl)
    .then((data) => {
      LEVELS = (data && data.levels) ? data.levels : [];
      if (!LEVELS.length) throw new Error("Пустой список уровней");

      progress = loadProgress() || defaultProgress(LEVELS.length);
      // Если обновилось количество уровней
      progress.levelsCount = LEVELS.length;
      if (typeof progress.currentLevel !== "number") progress.currentLevel = 0;
      progress.currentLevel = clamp(progress.currentLevel, 0, LEVELS.length - 1);
      if (!progress.state) progress.state = {};
      if (!progress.completed) progress.completed = {};
      saveProgress(progress);

      renderLevel();
    })
    .catch((e) => {
      console.error(e);
      container.innerHTML = `
        <div class="fade-in">
          <p style="color:red">❌ Не удалось загрузить уровни.</p>
          <p style="opacity:.85">${String(e && e.message ? e.message : e)}</p>
          <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
        </div>
      `;
    });
}
