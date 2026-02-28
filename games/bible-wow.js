/// games/bible-wow.js
// Visuals: Restored Original (Chips, Layout).
// Logic: Strict Grid Generation with crossword rules (no end-to-end touching, no parallel touching).
// Features restored: prev/next level, level list modal, bonus list modal (current level only),
// shuffle, hint (10⭐), reveal word (25⭐), persistent progress (remembering found words per level), completion reward, bonus reward.

/* global loadJSON, goToMainMenu */

function startBibleWowGame(levelsUrl) {
  const container = document.getElementById("game-container");
  if (!container) return;

  // -------------------- Styles (keep EXACT aesthetic from user's file; only adding missing UI bits) --------------------
  const styleId = "bible-wow-style";
  const oldStyle = document.getElementById(styleId);
  if (oldStyle) oldStyle.remove();
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    /* Main Layout */
    .wow-wrap {
        --wow-accent: var(--accent-active, #4f46e5);
        max-width: 980px;
        margin: 0 auto;
        width: 100%;
        padding: 10px 8px 78px;
        display: flex;
        flex-direction: column;
        height: 100vh;
        box-sizing: border-box;
    }

    /* Top Bar (Chips) */
    .wow-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 12px;
        flex-shrink: 0;
    }
    .wow-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.05);
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        transition: transform 0.1s;
    }
    .wow-chip:active { transform: scale(0.95); }
    .wow-chip.btn-levels {
        background: var(--wow-accent);
        color: #fff;
    }

    /* Main Area (Flex 1) */
    .wow-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-height: 0;
    }

    /* Crossword Board */
    .wow-board-wrap {
        flex: 1;
        background: rgba(0,0,0,0.02);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        padding: 8px;
    }
    .wow-board {
        position: relative;
    }
    .wow-cell {
        position: absolute;
        background: #fff;
        border: 2px solid #ddd;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: #333;
        box-sizing: border-box;
        text-transform: uppercase;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .wow-cell.found {
        background: var(--wow-accent);
        border-color: var(--wow-accent);
        color: #fff;
        transform: scale(1.05);
    }
    .wow-cell.hinted {
        background: #e0e7ff;
        border-color: var(--wow-accent);
        color: var(--wow-accent);
    }

    /* Bottom Controls */
    .wow-controls {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }
    .wow-word-display {
        height: 36px;
        font-size: 24px;
        font-weight: bold;
        letter-spacing: 2px;
        color: var(--wow-accent);
        text-transform: uppercase;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .wow-word-display.error {
        animation: shake 0.4s;
        color: #ef4444;
    }
    .wow-wheel-container {
        position: relative;
        width: 240px;
        height: 240px;
        touch-action: none;
    }
    .wow-wheel-bg {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: rgba(0,0,0,0.04);
        border: 2px solid rgba(0,0,0,0.08);
    }
    .wow-letter {
        position: absolute;
        width: 50px;
        height: 50px;
        margin-left: -25px;
        margin-top: -25px;
        background: #fff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        font-weight: bold;
        color: #333;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        user-select: none;
        transition: transform 0.1s;
        z-index: 2;
    }
    .wow-letter.active {
        background: var(--wow-accent);
        color: #fff;
        transform: scale(1.15);
    }
    .wow-line-canvas {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        z-index: 1;
    }

    /* Action Bar (Shuffle, Hints) */
    .wow-actions {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 4px;
    }
    .wow-action-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid #ddd;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        cursor: pointer;
        transition: transform 0.1s;
    }
    .wow-action-btn:active { transform: scale(0.9); }
    .wow-action-btn.hint-btn { color: #f59e0b; }
    .wow-action-btn.reveal-btn { color: #ef4444; }

    /* Modal Overlay */
    .wow-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
        padding: 16px;
        box-sizing: border-box;
    }
    .wow-modal-overlay.active {
        opacity: 1;
        pointer-events: auto;
    }
    .wow-modal-box {
        background: #fff;
        border-radius: 16px;
        width: 100%;
        max-width: 400px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        transform: translateY(20px);
        transition: transform 0.2s;
    }
    .wow-modal-overlay.active .wow-modal-box {
        transform: translateY(0);
    }
    .wow-modal-header {
        padding: 16px;
        border-bottom: 1px solid #eee;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: bold;
        font-size: 18px;
    }
    .wow-modal-close {
        background: none; border: none; font-size: 20px; cursor: pointer; color: #888;
    }
    .wow-modal-body {
        padding: 16px;
        overflow-y: auto;
        flex: 1;
    }

    /* Modal List Items */
    .wow-level-item {
        padding: 12px;
        border-radius: 8px;
        background: #f8f9fa;
        margin-bottom: 8px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        font-weight: 500;
    }
    .wow-level-item:hover { background: #e2e8f0; }
    .wow-level-item.active { background: var(--wow-accent); color: #fff; }

    .wow-bonus-item {
        padding: 8px 12px;
        background: #fffbeb;
        border-radius: 6px;
        margin-bottom: 6px;
        font-weight: 500;
        display: flex;
        justify-content: space-between;
    }

    /* Animations */
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-4px); }
        40%, 80% { transform: translateX(4px); }
    }
    @keyframes popIn {
        0% { transform: scale(0.5); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
    }

    /* Toast */
    .wow-toast {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(0,0,0,0.8);
        color: #fff;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 14px;
        pointer-events: none;
        opacity: 0;
        transition: all 0.3s;
        z-index: 10000;
    }
    .wow-toast.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
    }
  `;
  document.head.appendChild(style);

  // -------------------- State --------------------
  const st = {
    levels: [],
    levelIndex: 0,
    stars: 0,
    bonusByLevel: {},
    foundWordsByLevel: {},
    hintedCellsByLevel: {},
    currLevel: null,
    gridInfo: null,
    foundWords: new Set(),
    bonusWordsFound: new Set(),
    bonusAll: new Set(),
    hintedCells: new Set(),
    wheelLine: null
  };

  function normWord(w) { return w.toUpperCase().trim(); }

  // -------------------- Persistence --------------------
  function savePersisted(st) {
    const data = {
      levelIndex: st.levelIndex,
      stars: st.stars,
      bonusByLevel: st.bonusByLevel,
      foundWordsByLevel: st.foundWordsByLevel,
      hintedCellsByLevel: st.hintedCellsByLevel
    };
    localStorage.setItem("bibleWowGameSave", JSON.stringify(data));
  }

  function loadPersisted(st) {
    try {
      const raw = localStorage.getItem("bibleWowGameSave");
      if (raw) {
        const data = JSON.parse(raw);
        if (typeof data.levelIndex === "number") st.levelIndex = data.levelIndex;
        if (typeof data.stars === "number") st.stars = data.stars;
        if (data.bonusByLevel) st.bonusByLevel = data.bonusByLevel;
        if (data.foundWordsByLevel) st.foundWordsByLevel = data.foundWordsByLevel;
        if (data.hintedCellsByLevel) st.hintedCellsByLevel = data.hintedCellsByLevel;
      }
    } catch (e) {
      console.error("Load save error", e);
    }
    if (!st.bonusByLevel) st.bonusByLevel = {};
    if (!st.foundWordsByLevel) st.foundWordsByLevel = {};
    if (!st.hintedCellsByLevel) st.hintedCellsByLevel = {};
  }

  function showToast(msg) {
    let t = document.getElementById("wow-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "wow-toast";
      t.className = "wow-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2000);
  }

  // -------------------- Grid Logic (Strict Crossword Rules) --------------------
  function buildLayout(words) {
    const LIMIT = 15;
    let grid = Array.from({ length: LIMIT }, () => Array(LIMIT).fill(null));

    function canPlace(word, r, c, dr, dc) {
      if (r < 0 || c < 0 || r + dr * word.length > LIMIT || c + dc * word.length > LIMIT) return false;

      // Prevent end-to-end touching lines
      const rBefore = r - dr, cBefore = c - dc;
      if (rBefore >= 0 && rBefore < LIMIT && cBefore >= 0 && cBefore < LIMIT) {
        if (grid[rBefore][cBefore] !== null) return false;
      }
      const rAfter = r + dr * word.length, cAfter = c + dc * word.length;
      if (rAfter >= 0 && rAfter < LIMIT && cAfter >= 0 && cAfter < LIMIT) {
        if (grid[rAfter][cAfter] !== null) return false;
      }

      // Check each letter
      for (let i = 0; i < word.length; i++) {
        let nr = r + dr * i;
        let nc = c + dc * i;
        if (grid[nr][nc] !== null) {
          if (grid[nr][nc] !== word[i]) return false; // Clash
        } else {
          // Empty cell: Prevent parallel touching words
          let n1r = nr + dc, n1c = nc + dr;
          let n2r = nr - dc, n2c = nc - dr;
          if (n1r >= 0 && n1r < LIMIT && n1c >= 0 && n1c < LIMIT && grid[n1r][n1c] !== null) return false;
          if (n2r >= 0 && n2r < LIMIT && n2c >= 0 && n2c < LIMIT && grid[n2r][n2c] !== null) return false;
        }
      }
      return true;
    }

    function placeWord(word, r, c, dr, dc) {
      for (let i = 0; i < word.length; i++) {
        grid[r + dr * i][c + dc * i] = word[i];
      }
    }

    let placed = [];
    let notPlaced = [];

    // Place first word at center
    if (words.length > 0) {
      const w0 = words[0];
      const r0 = Math.floor(LIMIT / 2);
      const c0 = Math.floor((LIMIT - w0.length) / 2);
      placeWord(w0, r0, c0, 0, 1);
      placed.push({ word: w0, r: r0, c: c0, dr: 0, dc: 1 });
    }

    const ATTEMPTS_PER_WORD = 150;

    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      let matchFound = false;
      let options = [];

      for (let p of placed) {
        for (let j = 0; j < p.word.length; j++) {
          const lPlaced = p.word[j];
          for (let k = 0; k < w.length; k++) {
            if (w[k] === lPlaced) {
              const crossR = p.r + p.dr * j - (p.dc === 1 ? k : 0);
              const crossC = p.c + p.dc * j - (p.dr === 1 ? k : 0);
              const ndr = p.dc === 1 ? 1 : 0;
              const ndc = p.dr === 1 ? 1 : 0;
              options.push({ r: crossR, c: crossC, dr: ndr, dc: ndc });
            }
          }
        }
      }

      options.sort(() => Math.random() - 0.5);

      for (let opt of options) {
        if (canPlace(w, opt.r, opt.c, opt.dr, opt.dc)) {
          placeWord(w, opt.r, opt.c, opt.dr, opt.dc);
          placed.push({ word: w, r: opt.r, c: opt.c, dr: opt.dr, dc: opt.dc });
          matchFound = true;
          break;
        }
      }

      if (!matchFound) {
        let placedFree = false;
        for (let attempt = 0; attempt < ATTEMPTS_PER_WORD; attempt++) {
          let dr = Math.random() > 0.5 ? 1 : 0;
          let dc = dr === 1 ? 0 : 1;
          let r = Math.floor(Math.random() * LIMIT);
          let c = Math.floor(Math.random() * LIMIT);
          if (canPlace(w, r, c, dr, dc)) {
            placeWord(w, r, c, dr, dc);
            placed.push({ word: w, r, c, dr, dc });
            placedFree = true;
            break;
          }
        }
        if (!placedFree) notPlaced.push(w);
      }
    }

    if (placed.length === 0) return { placed: [], minR: 0, maxR: 0, minC: 0, maxC: 0, notPlaced: words };

    let minR = LIMIT, maxR = -1, minC = LIMIT, maxC = -1;
    for (let p of placed) {
      if (p.r < minR) minR = p.r;
      if (p.c < minC) minC = p.c;
      const endR = p.r + p.dr * (p.word.length - 1);
      const endC = p.c + p.dc * (p.word.length - 1);
      if (endR > maxR) maxR = endR;
      if (endC > maxC) maxC = endC;
    }

    return { placed, minR, maxR, minC, maxC, notPlaced };
  }

  function buildBonusSetForLevel(rawLevel, gridInfo, notPlacedMainWords) {
    let s = new Set();
    if (Array.isArray(rawLevel.bonus)) {
      rawLevel.bonus.forEach(bw => s.add(normWord(bw)));
    }
    notPlacedMainWords.forEach(w => s.add(normWord(w)));
    return s;
  }

  // -------------------- Render Main UI --------------------
  function renderGame() {
    container.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "wow-wrap";

    // Top
    const top = document.createElement("div");
    top.className = "wow-top";

    const leftGroup = document.createElement("div");
    leftGroup.style.display = "flex"; leftGroup.style.gap = "8px";

    const btnBack = document.createElement("div");
    btnBack.className = "wow-chip";
    btnBack.innerHTML = "🏠";
    btnBack.onclick = () => { cleanupAll(); if (typeof goToMainMenu === "function") goToMainMenu(); };
    leftGroup.appendChild(btnBack);

    const btnLevels = document.createElement("div");
    btnLevels.className = "wow-chip btn-levels";
    btnLevels.innerHTML = `Ур. ${st.levelIndex + 1} ▾`;
    btnLevels.onclick = showLevelsModal;
    leftGroup.appendChild(btnLevels);

    const btnPrev = document.createElement("div");
    btnPrev.className = "wow-chip";
    btnPrev.innerHTML = "◀";
    if (st.levelIndex === 0) btnPrev.style.opacity = "0.5";
    else btnPrev.onclick = () => { st.levelIndex--; savePersisted(st); startLevel(); };
    leftGroup.appendChild(btnPrev);

    const btnNext = document.createElement("div");
    btnNext.className = "wow-chip";
    btnNext.innerHTML = "▶";
    if (st.levelIndex >= st.levels.length - 1) btnNext.style.opacity = "0.5";
    else btnNext.onclick = () => { st.levelIndex++; savePersisted(st); startLevel(); };
    leftGroup.appendChild(btnNext);

    top.appendChild(leftGroup);

    const rightGroup = document.createElement("div");
    rightGroup.style.display = "flex"; rightGroup.style.gap = "8px";

    const btnBonus = document.createElement("div");
    btnBonus.className = "wow-chip";
    btnBonus.innerHTML = `🎁 ${st.bonusWordsFound.size}`;
    btnBonus.onclick = showBonusModal;
    rightGroup.appendChild(btnBonus);

    const chipStars = document.createElement("div");
    chipStars.className = "wow-chip";
    chipStars.id = "wow-stars-display";
    chipStars.innerHTML = `⭐ ${st.stars}`;
    rightGroup.appendChild(chipStars);

    top.appendChild(rightGroup);
    wrap.appendChild(top);

    // Main
    const mainArea = document.createElement("div");
    mainArea.className = "wow-main";

    // Board
    const boardWrap = document.createElement("div");
    boardWrap.className = "wow-board-wrap";
    const board = document.createElement("div");
    board.className = "wow-board";
    renderCrossword(board);
    boardWrap.appendChild(board);
    mainArea.appendChild(boardWrap);

    // Controls
    const controls = document.createElement("div");
    controls.className = "wow-controls";

    const wordDisplay = document.createElement("div");
    wordDisplay.className = "wow-word-display";
    wordDisplay.id = "wow-word-display";
    controls.appendChild(wordDisplay);

    const wheelWrap = document.createElement("div");
    wheelWrap.className = "wow-wheel-container";
    wheelWrap.id = "wow-wheel";
    renderWheel(wheelWrap);
    controls.appendChild(wheelWrap);

    const actions = document.createElement("div");
    actions.className = "wow-actions";

    const btnShuffle = document.createElement("button");
    btnShuffle.className = "wow-action-btn";
    btnShuffle.innerHTML = "🔀";
    btnShuffle.title = "Перемешать";
    btnShuffle.onclick = () => {
      let arr = st.currLevel._shuffled.split('');
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      st.currLevel._shuffled = arr.join('');
      renderGame();
    };
    actions.appendChild(btnShuffle);

    const btnHint = document.createElement("button");
    btnHint.className = "wow-action-btn hint-btn";
    btnHint.innerHTML = "💡";
    btnHint.title = "Подсказка (10⭐)";
    btnHint.onclick = handleHint;
    actions.appendChild(btnHint);

    const btnReveal = document.createElement("button");
    btnReveal.className = "wow-action-btn reveal-btn";
    btnReveal.innerHTML = "🎯";
    btnReveal.title = "Открыть слово (25⭐)";
    btnReveal.onclick = handleRevealWord;
    actions.appendChild(btnReveal);

    controls.appendChild(actions);
    mainArea.appendChild(controls);

    wrap.appendChild(mainArea);
    container.appendChild(wrap);

    setTimeout(() => {
      const boardW = boardWrap.clientWidth;
      const boardH = boardWrap.clientHeight;
      scaleBoard(board, boardW, boardH);
    }, 10);
  }

  function renderCrossword(board) {
    board.innerHTML = "";
    if (!st.gridInfo || st.gridInfo.placed.length === 0) return;

    const rows = st.gridInfo.maxR - st.gridInfo.minR + 1;
    const cols = st.gridInfo.maxC - st.gridInfo.minC + 1;
    const cellSize = 36;
    const gap = 4;

    board.style.width = `${cols * cellSize + (cols - 1) * gap}px`;
    board.style.height = `${rows * cellSize + (rows - 1) * gap}px`;

    st.gridInfo.placed.forEach(p => {
      const isFound = st.foundWords.has(p.word);
      for (let i = 0; i < p.word.length; i++) {
        const r = p.r + p.dr * i;
        const c = p.c + p.dc * i;
        const cellId = `${r}_${c}`;
        const isHinted = st.hintedCells.has(cellId);

        let cell = document.getElementById(`wow-c-${cellId}`);
        if (!cell) {
          cell = document.createElement("div");
          cell.className = "wow-cell";
          cell.id = `wow-c-${cellId}`;
          const localR = r - st.gridInfo.minR;
          const localC = c - st.gridInfo.minC;
          cell.style.top = `${localR * (cellSize + gap)}px`;
          cell.style.left = `${localC * (cellSize + gap)}px`;
          cell.style.width = `${cellSize}px`;
          cell.style.height = `${cellSize}px`;
          board.appendChild(cell);
        }

        if (isFound) {
          cell.classList.add("found");
          cell.textContent = p.word[i];
        } else if (isHinted) {
          cell.classList.add("hinted");
          cell.textContent = p.word[i];
        } else {
          cell.classList.remove("found", "hinted");
          cell.textContent = "";
        }
      }
    });
  }

  function scaleBoard(board, contW, contH) {
    if (!contW || !contH) return;
    const padding = 16;
    const availW = contW - padding;
    const availH = contH - padding;
    const bw = board.offsetWidth;
    const bh = board.offsetHeight;
    if (bw === 0 || bh === 0) return;
    const scale = Math.min(1, availW / bw, availH / bh);
    board.style.transform = `scale(${scale})`;
    board.style.transformOrigin = "center center";
  }

  function renderWheel(container) {
    container.innerHTML = `<div class="wow-wheel-bg"></div><canvas class="wow-line-canvas" id="wow-canvas"></canvas>`;
    const letters = st.currLevel._shuffled.split('');
    const radius = 80;
    const cx = 120, cy = 120;
    const letterEls = [];

    letters.forEach((char, i) => {
      const angle = (i / letters.length) * 2 * Math.PI - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      const el = document.createElement("div");
      el.className = "wow-letter";
      el.textContent = char;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.dataset.idx = i;
      el.dataset.char = char;
      container.appendChild(el);
      letterEls.push(el);
    });

    attachWheelHandlers(container, letterEls, cx, cy);
  }

  // -------------------- Wheel Interaction --------------------
  let isDragging = false;
  let currentPath = [];
  let currentWord = "";

  function attachWheelHandlers(container, letterEls, cx, cy) {
    st.wheelLine = { container, letterEls, cx, cy };

    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    container.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
  }

  function detachWheelHandlers() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  function onPointerDown(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el.classList.contains("wow-letter")) {
      isDragging = true;
      currentPath = [el];
      currentWord = el.dataset.char;
      el.classList.add("active");
      updateDisplay();
      drawLines(e.clientX, e.clientY);
    }
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el.classList.contains("wow-letter")) {
      if (!currentPath.includes(el)) {
        currentPath.push(el);
        currentWord += el.dataset.char;
        el.classList.add("active");
        updateDisplay();
      } else if (currentPath.length > 1 && el === currentPath[currentPath.length - 2]) {
        const removed = currentPath.pop();
        removed.classList.remove("active");
        currentWord = currentWord.slice(0, -1);
        updateDisplay();
      }
    }
    drawLines(e.clientX, e.clientY);
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    if (currentWord.length > 0) handleWordSubmission(currentWord);

    currentPath.forEach(el => el.classList.remove("active"));
    currentPath = [];
    currentWord = "";
    updateDisplay();
    clearLines();
  }

  function updateDisplay() {
    const disp = document.getElementById("wow-word-display");
    if (disp) {
      disp.textContent = currentWord;
      disp.classList.remove("error");
    }
  }

  function drawLines(tx, ty) {
    if (!st.wheelLine) return;
    const canvas = document.getElementById("wow-canvas");
    if (!canvas) return;
    const rect = st.wheelLine.container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentPath.length === 0) return;

    ctx.beginPath();
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(79, 70, 229, 0.4)"; // accent color

    currentPath.forEach((el, i) => {
      const lx = parseFloat(el.style.left);
      const ly = parseFloat(el.style.top);
      if (i === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    });

    const localX = tx - rect.left;
    const localY = ty - rect.top;
    ctx.lineTo(localX, localY);
    ctx.stroke();
  }

  function clearLines() {
    const canvas = document.getElementById("wow-canvas");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function updateStarsDisplay() {
    const d = document.getElementById("wow-stars-display");
    if (d) d.innerHTML = `⭐ ${st.stars}`;
  }

  // -------------------- Logic Handlers --------------------
  function handleWordSubmission(word) {
    const norm = normWord(word);
    if (norm.length < 2) return;

    if (st.currLevel.words.includes(norm)) {
      if (!st.foundWords.has(norm)) {
        st.foundWords.add(norm);
        
        // Save to persistent storage
        const lid = String(st.currLevel.id);
        st.foundWordsByLevel[lid] = Array.from(st.foundWords);
        savePersisted(st);

        renderGame();
        setTimeout(checkCompletion, 400);
      } else {
        showErrorDisplay();
        showToast("Уже найдено!");
      }
    } else if (st.bonusAll.has(norm)) {
      if (!st.bonusWordsFound.has(norm)) {
        st.bonusWordsFound.add(norm);
        st.stars += 2;
        updateStarsDisplay();
        const lid = String(st.currLevel.id);
        st.bonusByLevel[lid] = Array.from(st.bonusWordsFound);
        savePersisted(st);
        showToast("Бонус! +2 ⭐");
        renderGame();
      } else {
        showErrorDisplay();
        showToast("Бонус уже найден!");
      }
    } else {
      showErrorDisplay();
    }
  }

  function showErrorDisplay() {
    const disp = document.getElementById("wow-word-display");
    if (disp) {
      disp.classList.remove("error");
      void disp.offsetWidth;
      disp.classList.add("error");
    }
  }

  function handleHint() {
    const cost = 10;
    if (st.stars < cost) { showToast("Не хватает звезд!"); return; }

    const empty = [];
    st.gridInfo.placed.forEach(p => {
      if (!st.foundWords.has(p.word)) {
        for (let i = 0; i < p.word.length; i++) {
          const cid = `${p.r + p.dr * i}_${p.c + p.dc * i}`;
          if (!st.hintedCells.has(cid)) empty.push(cid);
        }
      }
    });

    if (empty.length === 0) { showToast("Нет свободных букв!"); return; }

    st.stars -= cost;
    const pick = empty[Math.floor(Math.random() * empty.length)];
    st.hintedCells.add(pick);
    
    // Save hint and check for full word auto-completion
    const lid = String(st.currLevel.id);
    st.hintedCellsByLevel[lid] = Array.from(st.hintedCells);

    for (let wInfo of st.gridInfo.placed) {
      if (!st.foundWords.has(wInfo.word)) {
        let allHinted = true;
        for (let i = 0; i < wInfo.word.length; i++) {
          let cid = `${wInfo.r + wInfo.dr * i}_${wInfo.c + wInfo.dc * i}`;
          if (!st.hintedCells.has(cid)) { allHinted = false; break; }
        }
        if (allHinted) {
          st.foundWords.add(wInfo.word);
          st.foundWordsByLevel[lid] = Array.from(st.foundWords);
        }
      }
    }
    
    savePersisted(st);
    renderGame();
    setTimeout(checkCompletion, 400);
  }

  function handleRevealWord() {
    const cost = 25;
    if (st.stars < cost) { showToast("Не хватает звезд!"); return; }

    let targetWord = null;
    for (let p of st.gridInfo.placed) {
      if (!st.foundWords.has(p.word)) { targetWord = p.word; break; }
    }

    if (targetWord) {
      st.stars -= cost;
      st.foundWords.add(targetWord);
      
      const lid = String(st.currLevel.id);
      st.foundWordsByLevel[lid] = Array.from(st.foundWords);
      savePersisted(st);

      renderGame();
      setTimeout(checkCompletion, 400);
    } else {
      showToast("Все слова открыты!");
    }
  }

  function checkCompletion() {
    if (st.foundWords.size === st.currLevel.words.length) {
      st.stars += 10;
      savePersisted(st);
      showToast("Уровень пройден! +10 ⭐");
      setTimeout(() => {
        st.levelIndex++;
        if (st.levelIndex >= st.levels.length) {
          showToast("Игра пройдена!");
          st.levelIndex = 0; // wrap around or handle ending
        }
        savePersisted(st);
        startLevel();
      }, 1500);
    }
  }

  // -------------------- Modals --------------------
  function createModal(titleText) {
    const overlay = document.createElement("div");
    overlay.className = "wow-modal-overlay";

    const box = document.createElement("div");
    box.className = "wow-modal-box";

    const header = document.createElement("div");
    header.className = "wow-modal-header";
    header.innerHTML = `<span>${titleText}</span>`;

    const closeBtn = document.createElement("button");
    closeBtn.className = "wow-modal-close";
    closeBtn.innerHTML = "✖";
    closeBtn.onclick = () => {
      overlay.classList.remove("active");
      setTimeout(() => overlay.remove(), 200);
    };
    header.appendChild(closeBtn);
    box.appendChild(header);

    const body = document.createElement("div");
    body.className = "wow-modal-body";
    box.appendChild(body);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // force reflow
    void overlay.offsetWidth;
    overlay.classList.add("active");

    return { body, close: closeBtn.onclick };
  }

  function showLevelsModal() {
    const modal = createModal("Уровни");
    st.levels.forEach((lvl, i) => {
      const el = document.createElement("div");
      el.className = "wow-level-item";
      if (i === st.levelIndex) el.classList.add("active");
      el.innerHTML = `<span>Уровень ${i + 1}</span>`;
      el.onclick = () => {
        st.levelIndex = i;
        savePersisted(st);
        modal.close();
        startLevel();
      };
      modal.body.appendChild(el);
    });
  }

  function showBonusModal() {
    const modal = createModal("Бонусные слова (этот уровень)");
    if (st.bonusAll.size === 0) {
      modal.body.innerHTML = "<p style='color:#666;text-align:center;'>Нет бонусных слов.</p>";
      return;
    }
    st.bonusAll.forEach(w => {
      const el = document.createElement("div");
      el.className = "wow-bonus-item";
      if (st.bonusWordsFound.has(w)) {
        el.innerHTML = `<span>${w}</span><span>✔️</span>`;
      } else {
        el.innerHTML = `<span style="color:#aaa;">${w.replace(/./g, '*')}</span>`;
      }
      modal.body.appendChild(el);
    });
  }

  // -------------------- Start Level --------------------
  function startLevel() {
    if (!st.levels || !st.levels.length) return;
    if (st.levelIndex >= st.levels.length) st.levelIndex = 0;

    const rawLevel = st.levels[st.levelIndex];
    const letters = normWord(rawLevel.letters);
    const levelWords = Array.isArray(rawLevel.words) ? rawLevel.words.map(normWord) : [];

    const layoutResult = buildLayout(levelWords);
    st.gridInfo = layoutResult;

    const placedSet = new Set(layoutResult.placed.map(p => p.word));
    const validLevelWords = Array.from(placedSet);

    st.bonusAll = buildBonusSetForLevel(rawLevel, st.gridInfo, layoutResult.notPlaced);

    const lid = String(rawLevel.id);
    
    const savedBonus = Array.isArray(st.bonusByLevel[lid]) ? st.bonusByLevel[lid].map(normWord) : [];
    st.bonusWordsFound = new Set(savedBonus.filter(w => st.bonusAll.has(w)));

    const savedFound = Array.isArray(st.foundWordsByLevel[lid]) ? st.foundWordsByLevel[lid].map(normWord) : [];
    st.foundWords = new Set(savedFound.filter(w => validLevelWords.includes(w)));

    const savedHints = Array.isArray(st.hintedCellsByLevel[lid]) ? st.hintedCellsByLevel[lid] : [];
    st.hintedCells = new Set(savedHints);

    st.currLevel = { id: rawLevel.id, letters, words: validLevelWords, _shuffled: letters };

    renderGame();
  }

  // -------------------- Cleanup --------------------
  function cleanupAll() {
    detachWheelHandlers();
    const stEl = document.getElementById(styleId);
    if (stEl) stEl.remove();
  }

  // -------------------- Init --------------------
  container.innerHTML = "<p style='padding:16px'>🔄 Загрузка...</p>";

  loadPersisted(st);

  loadJSON(levelsUrl)
    .then(data => {
      st.levels = (data && Array.isArray(data.levels)) ? data.levels : [];
      if (!st.levels.length) throw new Error("No levels");
      if (st.levelIndex >= st.levels.length) st.levelIndex = 0;
      startLevel();
    })
    .catch(e => {
      console.error(e);
      container.innerHTML = `
        <div style="padding:16px; text-align:center; color:#ef4444;">
          <h3>Ошибка загрузки</h3>
          <p>${e.message}</p>
        </div>
      `;
    });
}
