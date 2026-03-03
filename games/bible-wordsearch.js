// games/bible-wordsearch.js
// Игра: поиск слов в сетке (без диагоналей, без пересечений слов, с аккуратными стрелочками)

function startBibleWordSearchGame(levelsUrl) {
  // Фикс для Telegram Web App
  if (window.Telegram && window.Telegram.WebApp) {
    const twa = window.Telegram.WebApp;
    twa.expand();
    if (twa.disableVerticalSwipes) twa.disableVerticalSwipes();
  }

  const container = document.getElementById("game-container");
  if (!container) return;

  const tgUser = (typeof getTelegramUser === "function") ? getTelegramUser() : { id: "anon" };
  const STORAGE_KEY = `bible_wordsearch_progress_v2_${tgUser.id}`;
  const STARS_KEY = `bible_stars_v1_${tgUser.id}`;

  const HINT_COST = 4;
  const STAR_PER_WORD = 2;
  const STAR_PER_LEVEL = 8;

  const WORD_COLORS = [
    '#dbeafe', '#dcfce7', '#fef08a', '#fce7f3', 
    '#f3e8ff', '#ffedd5', '#ccfbf1', '#fee2e2'
  ];

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const now = () => Date.now();

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function saveProgress(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, _ts: now() })); } catch {}
  }

  function defaultProgress(levelsCount) {
    return {
      version: 4, 
      currentLevel: 0,
      completed: {},
      levelRewarded: {},
      state: {}, 
      levelsCount,
    };
  }

  function loadStars() {
    try {
      const n = Number(localStorage.getItem(STARS_KEY));
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    } catch { return 0; }
  }

  function saveStars(n) {
    try { localStorage.setItem(STARS_KEY, String(Math.max(0, Math.floor(n)))); } catch {}
  }

  function setStars(n) {
    stars = Math.max(0, Math.floor(n));
    saveStars(stars);
    const el = document.getElementById("ws-stars");
    if (el) el.textContent = String(stars);
  }

  function addStars(delta) {
    setStars(stars + delta);
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "ws-toast";
    t.textContent = msg;
    container.querySelector(".ws-wrap")?.appendChild(t);
    setTimeout(() => t.classList.add("ws-toast--in"), 0);
    setTimeout(() => {
      t.classList.remove("ws-toast--in");
      setTimeout(() => t.remove(), 200);
    }, 1600);
  }

  let LEVELS = [];
  let progress = null;
  let stars = loadStars();

  window.__wsPrev = () => setCurrentLevel(progress.currentLevel - 1);
  window.__wsNext = () => setCurrentLevel(progress.currentLevel + 1);
  window.__wsReset = () => resetLevel();
  window.__wsHint = () => {
    const st = getLevelState(progress.currentLevel);
    const rawLevel = ensureLevelGenerated(progress.currentLevel);
    hint(rawLevel, st);
  };

  // ===== UI helpers =====
  function renderShell() {
    container.innerHTML = `
      <style>
        #ws-board, .ws-cell { touch-action: none !important; user-select: none !important; -webkit-user-select: none !important; position: relative;}
      </style>
      <div class="ws-wrap fade-in">
        <div class="ws-topbar">
          <button class="back-button" style="width:auto; padding: 10px 14px; margin:0;" onclick="goToMainMenu()">⬅️ Назад</button>
          <div class="ws-title">
            <div class="ws-title__name">Поиск слов</div>
            <div class="ws-title__meta">
              <span class="ws-stars">⭐ <b id="ws-stars">${stars}</b></span>
            </div>
          </div>
        </div>

        <div class="ws-panel">
          <div class="ws-levelrow">
            <div id="ws-level-btn" class="ws-level-btn">
               <div>Тема: <b id="ws-theme-label">...</b> <span class="ws-level-num">(Ур. <span id="ws-lvl-label">1</span>)</span></div>
               <div style="font-size:0.85rem; opacity:0.8;">📋 Меню</div>
            </div>
          </div>
          <div class="ws-actions">
            <button class="start-button" id="ws-hint" onclick="window.__wsHint()">💡 Подсказка (-${HINT_COST}⭐)</button>
            <button class="wrong-button" id="ws-reset" onclick="window.__wsReset()">♻️ Сброс</button>
          </div>
          <div class="ws-progress" id="ws-progress"></div>
        </div>

        <div class="ws-board" id="ws-board" aria-label="Игровое поле"></div>

        <div class="ws-bottom">
          <button class="start-button" id="ws-prev" onclick="window.__wsPrev()">⬅️ Пред.</button>
          <button class="start-button" id="ws-next" onclick="window.__wsNext()">След. ➡️</button>
        </div>

        <div id="ws-level-modal" class="ws-modal hidden">
           <div class="ws-modal-content">
              <div class="ws-modal-header">
                <h3>Выбор уровня</h3>
                <button class="ws-modal-close" id="ws-modal-close">✖</button>
              </div>
              <div class="ws-levels-grid" id="ws-levels-grid"></div>
           </div>
        </div>
      </div>
    `;

    document.getElementById("ws-level-btn").addEventListener("click", openLevelModal);
    document.getElementById("ws-modal-close").addEventListener("click", closeLevelModal);
  }

  function openLevelModal() {
    const grid = document.getElementById("ws-levels-grid");
    grid.innerHTML = "";
    for (let i = 0; i < LEVELS.length; i++) {
      const btn = document.createElement("button");
      btn.className = "ws-level-item";
      if (progress.currentLevel === i) btn.classList.add("active");
      if (isSolved(i)) btn.classList.add("completed");
      
      btn.textContent = i + 1;
      btn.addEventListener("click", () => {
        closeLevelModal();
        setCurrentLevel(i);
      });
      grid.appendChild(btn);
    }
    document.getElementById("ws-level-modal").classList.remove("hidden");
  }

  function closeLevelModal() {
    document.getElementById("ws-level-modal").classList.add("hidden");
  }

  function getLevelState(levelIndex) {
    const k = String(levelIndex);
    if (!progress.state[k]) progress.state[k] = { found: [], revealed: [] };
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

  function generateWordSearchLevel(wordsList, rows, cols) {
    let bestGrid = null;
    let bestPaths = null;
    let maxPlaced = -1;

    const sortedWords = [...wordsList].sort((a,b) => b.length - a.length);

    for (let attempt = 0; attempt < 200; attempt++) {
        const grid = Array(rows).fill(null).map(() => Array(cols).fill(''));
        const paths = [];
        let placedCount = 0;

        for (const word of sortedWords) {
            let placedPath = null;
            for (let tryWord = 0; tryWord < 15; tryWord++) {
                placedPath = placeWord(word, grid, rows, cols);
                if (placedPath) break;
            }
            
            if (placedPath) {
                paths.push({ text: word, path: placedPath });
                placedCount++;
            } else {
                break; 
            }
        }

        if (placedCount === sortedWords.length) {
            bestGrid = grid;
            bestPaths = paths;
            break;
        }

        if (placedCount > maxPlaced) {
            maxPlaced = placedCount;
            bestGrid = grid.map(row => [...row]);
            bestPaths = [...paths];
        }
    }

    const letters = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ";
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (bestGrid[r][c] === '') {
                bestGrid[r][c] = letters[Math.floor(Math.random() * letters.length)];
            }
        }
    }

    return { grid: bestGrid.map(row => row.join('')), words: bestPaths };
  }

  function placeWord(word, grid, rows, cols) {
      const cells = [];
      for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) cells.push([r,c]);
      cells.sort(() => Math.random() - 0.5); 

      for (const [r, c] of cells) {
          if (grid[r][c] === '') {
              const path = [[r, c]];
              grid[r][c] = word[0];

              if (dfs(word, 1, r, c, path, grid, rows, cols)) {
                  return path;
              }
              grid[r][c] = ''; 
          }
      }
      return null;
  }

  function dfs(word, charIdx, r, c, path, grid, rows, cols) {
      if (charIdx === word.length) return true;
      const dirs = [[0,1], [1,0], [0,-1], [-1,0]].sort(() => Math.random() - 0.5);

      for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              if (!path.some(([pr, pc]) => pr === nr && pc === nc)) {
                  if (grid[nr][nc] === '') {
                      grid[nr][nc] = word[charIdx];
                      path.push([nr, nc]);

                      if (dfs(word, charIdx + 1, nr, nc, path, grid, rows, cols)) {
                          return true;
                      }

                      path.pop();
                      grid[nr][nc] = ''; 
                  }
              }
          }
      }
      return false;
  }

  function ensureLevelGenerated(levelIndex) {
    const level = LEVELS[levelIndex];
    if (level.grid && level.words && level.grid.length > 0 && !level.wordsList) return level; 

    const st = getLevelState(levelIndex);
    if (st.generatedGrid && st.generatedWords) {
      level.grid = st.generatedGrid;
      level.words = st.generatedWords;
      return level;
    }

    const list = level.wordsList || (level.words ? level.words.map(w => w.text) : []);
    const result = generateWordSearchLevel(list, level.rows || 8, level.cols || 8);
    if (result) {
      level.grid = result.grid;
      level.words = result.words;
      st.generatedGrid = result.grid;
      st.generatedWords = result.words;
      saveProgress(progress);
    }
    return level;
  }

  // ===== Game logic =====
  let selecting = false;
  let selected = []; 
  let solvedCells = new Map(); 

  function keyOf(r, c) { return `${r},${c}`; }

  // ===== ОТРИСОВКА СТРЕЛОЧЕК (SVG) - УЛУЧШЕННАЯ ВЕРСИЯ =====
  function drawLines() {
    const board = document.getElementById("ws-board");
    if (!board) return;

    const levelIndex = progress.currentLevel;
    const level = LEVELS[levelIndex];
    const levelState = getLevelState(levelIndex);
    if (!level || !level.grid) return;

    let svg = document.getElementById("ws-svg-overlay");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = "ws-svg-overlay";
      svg.setAttribute("class", "ws-svg-layer");
      svg.style.position = "absolute";
      svg.style.top = "0";
      svg.style.left = "0";
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.style.pointerEvents = "none";
      svg.style.zIndex = "5"; // Чуть ниже букв, чтобы точно не мешать

      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      // Изящные, менее массивные наконечники стрелок
      defs.innerHTML = `
        <marker id="arrow-found" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 L1.5,3 z" fill="rgba(0,0,0,0.15)" /> 
        </marker>
        <marker id="arrow-sel" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 L1.5,3 z" fill="rgba(79,70,229,0.5)" />
        </marker>
      `;
      svg.appendChild(defs);
      board.appendChild(svg);
    }

    // Удаляем старые линии
    const paths = svg.querySelectorAll('.ws-path-line');
    paths.forEach(p => p.remove());

    const getCenter = (r, c) => {
      const cell = board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      if (!cell) return null;
      return `${cell.offsetLeft + cell.offsetWidth / 2},${cell.offsetTop + cell.offsetHeight / 2}`;
    };

    // Отрисовка найденных слов (очень тускло, не мешает чтению)
    const wordsByText = new Map(level.words.map(w => [w.text, w]));
    const found = levelState.found || [];

    found.forEach(text => {
      const w = wordsByText.get(text);
      if (!w) return;
      const points = w.path.map(([r, c]) => getCenter(r, c)).filter(Boolean);
      if (points.length > 1) {
        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute("points", points.join(" "));
        polyline.setAttribute("fill", "none");
        polyline.setAttribute("stroke", "rgba(0, 0, 0, 0.1)"); // Едва заметная тень
        polyline.setAttribute("stroke-width", "3"); // Тоньше
        polyline.setAttribute("stroke-linecap", "round");
        polyline.setAttribute("stroke-linejoin", "round");
        polyline.setAttribute("marker-end", "url(#arrow-found)");
        polyline.setAttribute("class", "ws-path-line ws-path-found");
        svg.appendChild(polyline);
      }
    });

    // Отрисовка текущего выделения (аккуратная линия)
    if (selected && selected.length > 1) {
      const points = selected.map(x => getCenter(x.r, x.c)).filter(Boolean);
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("points", points.join(" "));
      polyline.setAttribute("fill", "none");
      polyline.setAttribute("stroke", "rgba(79,70,229,0.4)"); // Мягкий фиолетовый
      polyline.setAttribute("stroke-width", "3"); // Тоньше
      polyline.setAttribute("stroke-linecap", "round");
      polyline.setAttribute("stroke-linejoin", "round");
      polyline.setAttribute("marker-end", "url(#arrow-sel)");
      polyline.setAttribute("class", "ws-path-line ws-path-selecting");
      svg.appendChild(polyline);
    }
  }

  function buildBoard(level, levelState) {
    const board = document.getElementById("ws-board");
    const prog = document.getElementById("ws-progress");
    const themeLabel = document.getElementById("ws-theme-label");
    const lvlLabel = document.getElementById("ws-lvl-label");
    if (!board || !prog) return;

    themeLabel.textContent = level.theme || "Загадка";
    lvlLabel.textContent = progress.currentLevel + 1;

    selecting = false;
    selected = [];
    solvedCells.clear();

    const byText = new Map(level.words.map(w => [w.text, w]));
    
    level.words.forEach((w, i) => {
      if ((levelState.found || []).includes(w.text)) {
         const color = WORD_COLORS[i % WORD_COLORS.length];
         w.path.forEach(([r, c]) => solvedCells.set(keyOf(r, c), color));
      }
    });

    prog.textContent = `Слов: ${level.words.length} • Найдено: ${(levelState.found || []).length}/${level.words.length}`;

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
        cell.style.zIndex = "10"; // Буквы всегда поверх линий

        const color = solvedCells.get(keyOf(r, c));
        if (color) {
          cell.classList.add("ws-cell--solved");
          cell.style.backgroundColor = color;
          cell.disabled = true; 
        }

        board.appendChild(cell);
      }
    }

    // Отрисовываем стрелочки поверх поля после того как браузер разместит кнопки
    requestAnimationFrame(drawLines);
  }

  function cellsAreAdjacent(a, b) {
    const dr = Math.abs(a.r - b.r);
    const dc = Math.abs(a.c - b.c);
    return (dr + dc) === 1;
  }

  function clearSelection() {
    selected.forEach(x => x.el.classList.remove("ws-cell--sel"));
    selected = [];
    drawLines();
  }

  function selectCell(el) {
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    const k = keyOf(r, c);
    
    if (solvedCells.has(k)) return; 

    if (selected.length === 0) {
      selected.push({ r, c, el });
      el.classList.add("ws-cell--sel");
      drawLines();
      return;
    }

    const last = selected[selected.length - 1];
    if (selected.length >= 2) {
      const prev = selected[selected.length - 2];
      if (prev.r === r && prev.c === c) {
        last.el.classList.remove("ws-cell--sel");
        selected.pop();
        drawLines();
        return;
      }
    }

    if (selected.some(x => x.r === r && x.c === c)) return;
    if (!cellsAreAdjacent(last, { r, c })) return;

    selected.push({ r, c, el });
    el.classList.add("ws-cell--sel");
    drawLines();
  }

  function tryCommitSelection(level, levelState) {
    if (selected.length < 2) {
      clearSelection();
      return;
    }
    const text = selected.map(x => x.el.textContent).join("");
    const rev = text.split("").reverse().join("");

    const remaining = new Set(level.words.map(w => w.text));
    (levelState.found || []).forEach(t => remaining.delete(t));

    let matched = null;
    let matchIndex = -1;
    for (let i = 0; i < level.words.length; i++) {
      const w = level.words[i];
      if (!remaining.has(w.text)) continue;
      if (w.text === text || w.text === rev) {
        const coords = selected.map(x => [x.r, x.c]);
        const p = w.path;
        const same = p.length === coords.length && p.every((pc, idx) => pc[0] === coords[idx][0] && pc[1] === coords[idx][1]);
        const sameRev = p.length === coords.length && p.every((pc, idx) => pc[0] === coords[coords.length - 1 - idx][0] && pc[1] === coords[coords.length - 1 - idx][1]);
        if (same || sameRev) {
          matched = w;
          matchIndex = i;
          break;
        }
      }
    }

    if (!matched) {
      const board = document.getElementById("ws-board");
      if (board) {
        board.classList.remove("ws-shake");
        void board.offsetWidth;
        board.classList.add("ws-shake");
      }
      clearSelection();
      return;
    }

    const wasAlreadyFound = (levelState.found || []).includes(matched.text);
    levelState.found = Array.from(new Set([...(levelState.found || []), matched.text]));
    saveProgress(progress);

    if (!wasAlreadyFound) addStars(STAR_PER_WORD);

    const color = WORD_COLORS[matchIndex % WORD_COLORS.length];
    matched.path.forEach(([r, c]) => solvedCells.set(keyOf(r, c), color));
    clearSelection();
    renderLevel(false);

    if (solvedCells.size === level.rows * level.cols || levelState.found.length === level.words.length) {
      if (!isSolved(progress.currentLevel)) markSolved(progress.currentLevel);
      const lk = String(progress.currentLevel);
      if (!progress.levelRewarded?.[lk]) {
        if (!progress.levelRewarded) progress.levelRewarded = {};
        progress.levelRewarded[lk] = true;
        saveProgress(progress);
        addStars(STAR_PER_LEVEL);
      }
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
          <button class="back-button" id="ws-win-menu">⬅️ В меню игры</button>
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
    if (stars < HINT_COST) {
      toast(`Нужно ${HINT_COST}⭐`);
      return;
    }

    const found = new Set(levelState.found || []);
    const remaining = level.words.map((w, index) => ({w, index})).filter(item => !found.has(item.w.text));
    if (!remaining.length) return;

    addStars(-HINT_COST);

    const match = remaining[Math.floor(Math.random() * remaining.length)];
    const w = match.w;
    levelState.revealed = Array.from(new Set([...(levelState.revealed || []), w.text]));
    levelState.found = Array.from(new Set([...(levelState.found || []), w.text]));
    saveProgress(progress);
    
    const color = WORD_COLORS[match.index % WORD_COLORS.length];
    w.path.forEach(([r, c]) => solvedCells.set(keyOf(r, c), color));
    renderLevel(false);

    if (solvedCells.size === level.rows * level.cols || levelState.found.length === level.words.length) {
      if (!isSolved(progress.currentLevel)) markSolved(progress.currentLevel);
      const lk = String(progress.currentLevel);
      if (!progress.levelRewarded?.[lk]) {
        if (!progress.levelRewarded) progress.levelRewarded = {};
        progress.levelRewarded[lk] = true;
        saveProgress(progress);
        addStars(STAR_PER_LEVEL);
      }
      showWin(level);
    }
  }

  function resetLevel() {
    const levelIndex = progress.currentLevel;
    const st = getLevelState(levelIndex);
    st.found = [];
    st.revealed = [];
    delete progress.completed[String(levelIndex)];
    
    delete st.generatedGrid;
    delete st.generatedWords;
    
    saveProgress(progress);
    renderLevel();
  }

  function attachEvents(level) {
    const board = document.getElementById("ws-board");
    if (!board) return;

    const st = getLevelState(progress.currentLevel);

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

    const onTouchMove = (e) => { e.preventDefault(); };
    board.addEventListener("touchmove", onTouchMove, { passive: false });

    board.addEventListener("pointerdown", onDown, { passive: false });
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("resize", drawLines); // Перерисовка стрелочек при повороте экрана

    window.__wsCleanup = () => {
      board.removeEventListener("pointerdown", onDown);
      board.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", drawLines);
    };
  }

  function renderLevel(withEvents = true) {
    const rawLevel = ensureLevelGenerated(progress.currentLevel);
    const st = getLevelState(progress.currentLevel);
    buildBoard(rawLevel, st);

    const prevBtn = document.getElementById("ws-prev");
    const nextBtn = document.getElementById("ws-next");
    if (prevBtn) prevBtn.disabled = progress.currentLevel === 0;
    if (nextBtn) nextBtn.disabled = progress.currentLevel === LEVELS.length - 1;

    if (withEvents) {
      try { window.__wsCleanup?.(); } catch {}
      attachEvents(rawLevel);
    }
  }

  // ===== boot =====
  renderShell();

  loadJSON(levelsUrl)
    .then((data) => {
      LEVELS = (data && data.levels) ? data.levels : [];
      if (!LEVELS.length) throw new Error("Пустой список уровней");

      progress = loadProgress() || defaultProgress(LEVELS.length);
      
      if (progress.version !== 4) {
        if (progress.state) {
          Object.keys(progress.state).forEach(k => {
            delete progress.state[k].generatedGrid;
            delete progress.state[k].generatedWords;
          });
        }
        progress.version = 4;
      }
      
      progress.levelsCount = LEVELS.length;
      if (typeof progress.currentLevel !== "number") progress.currentLevel = 0;
      progress.currentLevel = clamp(progress.currentLevel, 0, LEVELS.length - 1);
      if (!progress.state) progress.state = {};
      if (!progress.completed) progress.completed = {};
      if (!progress.levelRewarded) progress.levelRewarded = {};
      saveProgress(progress);

      setStars(loadStars());
      renderLevel();
    })
    .catch((e) => {
      console.error(e);
      container.innerHTML = `
        <div class="fade-in">
          <p style="color:red">❌ Не удалось загрузить уровни.</p>
          <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
        </div>
      `;
    });
}
