// games/bible-wow.js — мини-«Words of Wonders / Wordscapes», но на библейскую тему
// Без внешних библиотек. Mobile-first. Работает мышью и тачем.

/* global loadJSON, goToMainMenu */

function startBibleWowGame(levelsUrl) {
  const container = document.getElementById("game-container");
  if (!container) return;

  // ---- Styles (локально, чтобы не трогать общий style.css) ----
  const styleId = "bible-wow-style";
  const oldStyle = document.getElementById(styleId);
  if (oldStyle) oldStyle.remove();
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    /* --- Layout / Cards (под общий стиль приложения) --- */
    .wow-wrap{max-width:980px;margin:0 auto;width:100%;padding:10px 8px 84px;}
    .wow-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;}
    .wow-title{font-weight:800;font-size:18px;color:var(--accent-active);}
    .wow-pill{display:flex;gap:8px;align-items:center;}
    .wow-chip{background:var(--card-bg);border:1px solid rgba(0,0,0,.08);border-radius:999px;padding:7px 10px;font-size:13px;box-shadow:0 4px 10px var(--shadow);}
    .wow-btn{border:none;border-radius:var(--button-radius);padding:12px 14px;font-weight:700;cursor:pointer;}
    .wow-btn.secondary{background:var(--card-bg);color:var(--text-color);border:1px solid rgba(0,0,0,.08);box-shadow:0 4px 10px var(--shadow);}
    .wow-btn.primary{background:var(--accent-active);color:#fff;box-shadow:0 6px 14px rgba(0,0,0,.14);}
    .wow-btn.primary:disabled{opacity:.55;cursor:not-allowed;}
    .wow-panel{background:var(--card-bg);border:1px solid rgba(0,0,0,.08);border-radius:18px;padding:14px;box-shadow:0 8px 24px var(--shadow);}

    /* --- Crossword --- */
    .wow-gridWrap{display:flex;justify-content:center;}
    .wow-grid{display:grid;gap:7px;justify-content:center;padding:8px 6px;}
    .wow-cell{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;
      font-weight:900;letter-spacing:.5px;text-transform:uppercase;
      background:#fff;border:2px solid rgba(79,70,229,.16);
      box-shadow:0 6px 16px rgba(0,0,0,.06);
      user-select:none;-webkit-user-select:none;
      opacity:0;transform:translateY(14px);}
    .wow-cell.block{background:transparent;border:none;box-shadow:none;}
    .wow-cell.revealed{background:rgba(79,70,229,.08);border-color:rgba(79,70,229,.28);opacity:1;transform:none;}
    .wow-cell.empty{opacity:1;transform:none;}
    .wow-cell.in{animation:wowGridIn .42s ease forwards;}
    @keyframes wowGridIn{to{opacity:1;transform:translateY(0);}}

    .wow-cell.pop{animation:wowPop .34s ease;}
    @keyframes wowPop{0%{transform:scale(.85)}60%{transform:scale(1.08)}100%{transform:scale(1)}}

    /* --- Middle --- */
    .wow-mid{margin-top:12px;display:grid;gap:12px;}
    .wow-toast{min-height:22px;text-align:center;font-weight:800;color:var(--accent-active);}

    /* --- Current word (как в оригинале: "плитки") --- */
    .wow-wordline{display:flex;justify-content:center;}
    .wow-current{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;min-height:46px;}
    .wow-tile{width:38px;height:46px;border-radius:12px;background:#fff;border:2px solid rgba(0,0,0,.08);
      box-shadow:0 6px 16px rgba(0,0,0,.06);display:flex;align-items:center;justify-content:center;
      font-weight:900;font-size:18px;}
    .wow-tile.ghost{opacity:.35;}

    /* --- Wheel --- */
    .wow-wheelWrap{display:flex;justify-content:center;align-items:center;}
    .wow-wheel{position:relative;width:min(340px,88vw);aspect-ratio:1/1;border-radius:999px;
      background:linear-gradient(180deg, rgba(79,70,229,.06), rgba(79,70,229,.02));
      border:1px solid rgba(79,70,229,.18);
      box-shadow:0 14px 34px rgba(0,0,0,.10);
      overflow:hidden;}
    .wow-wheel::after{content:"";position:absolute;inset:14%;border-radius:999px;border:1px dashed rgba(79,70,229,.18);opacity:.7;}
    .wow-wheel svg{position:absolute;inset:0;pointer-events:none;}
    .wow-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
    .wow-centerInner{width:92px;height:92px;border-radius:999px;background:rgba(255,255,255,.9);
      border:1px solid rgba(0,0,0,.08);box-shadow:0 10px 24px rgba(0,0,0,.12);}
    .wow-letter{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:62px;height:62px;border-radius:999px;background:#fff;color:var(--accent-active);font-weight:900;
      display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;
      box-shadow:0 12px 26px rgba(0,0,0,.18);touch-action:none;
      border:2px solid rgba(79,70,229,.18);
      transition:transform .08s ease;}
    .wow-letter.active{transform:translate(-50%,-50%) scale(1.08);}

    .wow-bottom{margin-top:6px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;}
    .wow-small{opacity:.85;font-size:12px;}

    /* --- Floating actions --- */
    .wow-fab{position:fixed;right:18px;bottom:18px;z-index:50;}
    .wow-fabBtn{width:58px;height:58px;border-radius:18px;border:none;cursor:pointer;
      background:var(--accent-active);color:#fff;font-size:22px;font-weight:900;
      box-shadow:0 14px 32px rgba(0,0,0,.22);}
    .wow-fabMenu{position:absolute;right:0;bottom:68px;display:none;flex-direction:column;gap:10px;align-items:flex-end;}
    .wow-fabMenu.open{display:flex;}
    .wow-fabItem{display:flex;align-items:center;gap:10px;}
    .wow-fabLabel{background:var(--card-bg);border:1px solid rgba(0,0,0,.08);box-shadow:0 8px 20px rgba(0,0,0,.12);
      padding:10px 12px;border-radius:14px;font-weight:700;font-size:13px;white-space:nowrap;}
    .wow-miniBtn{width:46px;height:46px;border-radius:16px;border:none;cursor:pointer;
      background:#fff;color:var(--accent-active);font-weight:900;font-size:18px;
      border:1px solid rgba(0,0,0,.08);box-shadow:0 10px 24px rgba(0,0,0,.14);}
    .wow-miniBtn:disabled{opacity:.55;cursor:not-allowed;}

    @media (min-width:520px){
      .wow-title{font-size:20px;}
      .wow-cell{width:50px;height:50px;}
      .wow-tile{width:42px;height:50px;font-size:20px;}
      .wow-letter{width:68px;height:68px;}
      .wow-centerInner{width:104px;height:104px;}
    }
  `;
  document.head.appendChild(style);

  // ---- State ----
  const LS_PROGRESS = "bibleWow_progress_v2";
  const LS_COINS = "bibleWow_coins_v2";
  const LS_COMPLETED = "bibleWow_completed_v2";

  const state = {
    levels: [],
    levelIndex: 0,
    coins: 0,
    completed: new Set(),
    dict: new Set(),
    foundWords: new Set(),
    bonusWords: new Set(),
    grid: null,
    placements: [],
    revealedKeys: new Set(),
    isDragging: false,
    dragPath: [],
    currentWord: "",
    lastToastAt: 0
  };

  function normWord(s) {
    return String(s || "")
      .trim()
      .toUpperCase()
      .replace(/Ё/g, "Е")
      .replace(/[^А-Я]/g, "");
  }

  function uniqLetters(str) {
    return Array.from(str);
  }

  function toast(msg) {
    const el = document.getElementById("wow-toast");
    if (!el) return;
    el.textContent = msg;
    state.lastToastAt = Date.now();
    setTimeout(() => {
      if (Date.now() - state.lastToastAt >= 1200) el.textContent = "";
    }, 1300);
  }

  function loadPersisted() {
    try {
      const p = JSON.parse(localStorage.getItem(LS_PROGRESS) || "null");
      if (p && typeof p.levelIndex === "number") state.levelIndex = Math.max(0, p.levelIndex);
    } catch {}
    try {
      const c = Number(localStorage.getItem(LS_COINS) || "0");
      state.coins = Number.isFinite(c) ? Math.max(0, Math.floor(c)) : 0;
    } catch {}
    try {
      const arr = JSON.parse(localStorage.getItem(LS_COMPLETED) || "[]");
      if (Array.isArray(arr)) state.completed = new Set(arr.map(Number).filter(n => Number.isFinite(n)));
    } catch {}
  }

  function savePersisted() {
    try {
      localStorage.setItem(LS_PROGRESS, JSON.stringify({ levelIndex: state.levelIndex }));
    } catch {}
    try {
      localStorage.setItem(LS_COINS, String(state.coins));
    } catch {}
    try {
      localStorage.setItem(LS_COMPLETED, JSON.stringify(Array.from(state.completed)));
    } catch {}
  }

  // ---- Crossword builder (простая расстановка со склейками по общим буквам) ----
  function buildCrossword(words) {
    const W = 11;
    const H = 11;
    const grid = Array.from({ length: H }, () => Array(W).fill(null));
    const placements = [];

    function canPlace(word, x, y, dir) {
      // dir: 0 horiz, 1 vert
      for (let i = 0; i < word.length; i++) {
        const xx = x + (dir === 0 ? i : 0);
        const yy = y + (dir === 1 ? i : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return false;
        const cell = grid[yy][xx];
        if (cell && cell !== word[i]) return false;
      }
      return true;
    }

    function place(word, x, y, dir) {
      const cells = [];
      for (let i = 0; i < word.length; i++) {
        const xx = x + (dir === 0 ? i : 0);
        const yy = y + (dir === 1 ? i : 0);
        grid[yy][xx] = word[i];
        cells.push({ x: xx, y: yy });
      }
      placements.push({ word, cells, dir });
    }

    const sorted = [...words].sort((a, b) => b.length - a.length);
    if (!sorted.length) return { grid, placements };

    // 1) first word centered
    const w0 = sorted[0];
    const x0 = Math.floor((W - w0.length) / 2);
    const y0 = Math.floor(H / 2);
    place(w0, x0, y0, 0);

    // 2) others with intersections
    for (let wi = 1; wi < sorted.length; wi++) {
      const word = sorted[wi];
      let placed = false;

      // try intersect
      for (const p of placements) {
        if (placed) break;
        for (let i = 0; i < word.length; i++) {
          const ch = word[i];
          for (let j = 0; j < p.word.length; j++) {
            if (p.word[j] !== ch) continue;
            const anchor = p.cells[j];
            const dir = 1 - p.dir;
            const x = anchor.x - (dir === 0 ? i : 0);
            const y = anchor.y - (dir === 1 ? i : 0);
            if (canPlace(word, x, y, dir)) {
              place(word, x, y, dir);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }

      // fallback: scan for any empty fit
      if (!placed) {
        for (let y = 0; y < H && !placed; y++) {
          for (let x = 0; x < W && !placed; x++) {
            for (let dir = 0; dir <= 1 && !placed; dir++) {
              if (canPlace(word, x, y, dir)) {
                place(word, x, y, dir);
                placed = true;
              }
            }
          }
        }
      }
    }

    // crop bounding box
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x]) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX === -1) return { grid, placements };

    const cropped = [];
    for (let y = minY; y <= maxY; y++) {
      cropped.push(grid[y].slice(minX, maxX + 1));
    }
    // adjust placements coords
    for (const p of placements) {
      p.cells = p.cells.map(c => ({ x: c.x - minX, y: c.y - minY }));
    }
    return { grid: cropped, placements };
  }

  // ---- UI ----
  function renderSkeleton() {
    container.innerHTML = `
      <div class="wow-wrap">
        <div class="wow-top">
          <button class="wow-btn secondary" id="wow-back">⬅️ В меню</button>
          <div class="wow-title">Библейские слова</div>
          <div class="wow-pill">
            <div class="wow-chip" id="wow-level">Уровень —</div>
            <div class="wow-chip" id="wow-coins">🪙 0</div>
          </div>
        </div>

        <div class="wow-panel">
          <div class="wow-gridWrap"><div id="wow-grid" class="wow-grid" aria-label="Кроссворд"></div></div>
          <div class="wow-mid">
            <div id="wow-toast" class="wow-toast"></div>
            <div class="wow-wordline"><div id="wow-current" class="wow-current" aria-label="Текущее слово"></div></div>
            <div class="wow-wheelWrap">
              <div class="wow-wheel" id="wow-wheel">
                <svg id="wow-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path id="wow-path" d="" fill="none" stroke="rgba(79,70,229,.55)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <div class="wow-center">
                  <div class="wow-centerInner" aria-hidden="true"></div>
                </div>
              </div>
            </div>
            <div class="wow-bottom">
              <div class="wow-small">Проведи по буквам, чтобы составить слово. Бонусные слова дают монеты.</div>
              <button class="wow-btn primary" id="wow-next">Следующий ▶</button>
            </div>
          </div>
        </div>

        <div class="wow-fab" aria-label="Подсказки">
          <div class="wow-fabMenu" id="wow-fabMenu">
            <div class="wow-fabItem">
              <div class="wow-fabLabel">Перемешать</div>
              <button class="wow-miniBtn" id="wow-shuffle" title="Перемешать">⟲</button>
            </div>
            <div class="wow-fabItem">
              <div class="wow-fabLabel">Подсказка (10 🪙)</div>
              <button class="wow-miniBtn" id="wow-hint" title="Подсказка">💡</button>
            </div>
            <div class="wow-fabItem">
              <div class="wow-fabLabel">Показать слово (25 🪙)</div>
              <button class="wow-miniBtn" id="wow-reveal" title="Показать слово">👁</button>
            </div>
          </div>
          <button class="wow-fabBtn" id="wow-fabBtn" title="Меню">☰</button>
        </div>
      </div>
    `;

    document.getElementById("wow-back")?.addEventListener("click", () => {
      cleanupAll();
      goToMainMenu();
    });
  }

  // ---- listeners cleanup ----
  let offAll = [];
  function listen(el, ev, fn, opts) {
    el.addEventListener(ev, fn, opts);
    offAll.push(() => el.removeEventListener(ev, fn, opts));
  }
  function cleanupAll() {
    for (const off of offAll) off();
    offAll = [];
    cleanupWheelOnly();
    const st = document.getElementById(styleId);
    if (st) st.remove();
  }

  function updateTopbar() {
    const levelEl = document.getElementById("wow-level");
    const coinsEl = document.getElementById("wow-coins");
    if (levelEl) levelEl.textContent = `Уровень ${state.levelIndex + 1} / ${state.levels.length}`;
    if (coinsEl) coinsEl.textContent = `🪙 ${state.coins}`;

    // disable paid actions when low coins
    const hintBtn = document.getElementById("wow-hint");
    const revealBtn = document.getElementById("wow-reveal");
    if (hintBtn) hintBtn.disabled = state.coins < 10;
    if (revealBtn) revealBtn.disabled = state.coins < 25;
  }

  function renderGrid() {
    const gridEl = document.getElementById("wow-grid");
    if (!gridEl || !state.grid) return;

    const h = state.grid.length;
    const w = state.grid[0].length;
    gridEl.style.gridTemplateColumns = `repeat(${w}, 1fr)`;

    const revealed = new Set();
    for (const p of state.placements) {
      if (state.foundWords.has(p.word)) {
        for (const c of p.cells) revealed.add(`${c.x},${c.y}`);
      }
    }

    // keep previous for "pop" animation
    const prev = state.revealedKeys;
    state.revealedKeys = revealed;

    gridEl.innerHTML = "";
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = state.grid[y][x];
        const cell = document.createElement("div");
        if (!ch) {
          cell.className = "wow-cell block";
          cell.textContent = "";
        } else {
          const key = `${x},${y}`;
          const isRev = revealed.has(key);
          const baseClass = "wow-cell" + (isRev ? " revealed" : " empty");
          cell.className = baseClass;
          cell.textContent = isRev ? ch : "";
          cell.dataset.x = String(x);
          cell.dataset.y = String(y);

          // grid appear wave
          cell.classList.add("in");
          cell.style.animationDelay = `${(y * w + x) * 10}ms`;

          // newly revealed pop
          if (isRev && prev && !prev.has(key)) {
            cell.classList.add("pop");
          }
        }
        gridEl.appendChild(cell);
      }
    }
  }

  function setCurrentWord(s) {
    state.currentWord = s;
    const box = document.getElementById("wow-current");
    if (!box) return;
    const word = s || "";
    const maxTiles = Math.max(6, word.length || 6);
    box.innerHTML = "";
    for (let i = 0; i < maxTiles; i++) {
      const t = document.createElement("div");
      t.className = "wow-tile" + (i >= word.length ? " ghost" : "");
      t.textContent = word[i] || "";
      box.appendChild(t);
    }
  }

  function shuffleLetters() {
    const level = state.levels[state.levelIndex];
    const arr = uniqLetters(level.letters);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    level._shuffled = arr.join("");
    renderWheel();
  }

  function renderWheel() {
    const wheel = document.getElementById("wow-wheel");
    if (!wheel) return;
    // remove old letters
    wheel.querySelectorAll(".wow-letter").forEach(n => n.remove());

    const level = state.levels[state.levelIndex];
    const letters = uniqLetters(level._shuffled || level.letters);
    const n = letters.length;

    // place letters around circle
    const rect = wheel.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const radius = Math.min(rect.width, rect.height) * 0.34;

    const nodes = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;

      const btn = document.createElement("div");
      btn.className = "wow-letter";
      btn.textContent = letters[i];
      btn.dataset.letter = letters[i];
      btn.style.left = `${(x / rect.width) * 100}%`;
      btn.style.top = `${(y / rect.height) * 100}%`;
      wheel.appendChild(btn);
      nodes.push(btn);
    }

    attachWheelHandlers(wheel, nodes);
  }

  function pointToWheelSvg(xPx, yPx, wheelRect) {
    // convert absolute client px to wheel-local viewBox 0..100
    const x = ((xPx - wheelRect.left) / wheelRect.width) * 100;
    const y = ((yPx - wheelRect.top) / wheelRect.height) * 100;
    return { x, y };
  }

  function drawPath(points) {
    const path = document.getElementById("wow-path");
    if (!path) return;
    if (!points.length) {
      path.setAttribute("d", "");
      return;
    }
    const d = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    path.setAttribute("d", d);
  }

  function clearDragUI() {
    state.dragPath = [];
    drawPath([]);
    document.querySelectorAll(".wow-letter.active").forEach(el => el.classList.remove("active"));
    setCurrentWord("");
  }

  function validateWord(word) {
    const level = state.levels[state.levelIndex];
    const targetWords = new Set(level.words);

    if (word.length < 3) return;

    if (targetWords.has(word)) {
      if (state.foundWords.has(word)) {
        toast("✅ Уже найдено");
        return;
      }
      state.foundWords.add(word);
      toast("✨ Отлично!");
      renderGrid();
      if (isLevelCompleted()) {
        // reward only once per level
        const levelId = Number(level.id);
        if (!state.completed.has(levelId)) {
          state.completed.add(levelId);
          state.coins += 10;
          toast("🏁 Уровень пройден! +10 🪙");
        } else {
          toast("🏁 Уровень пройден!");
        }
        savePersisted();
      }
      updateTopbar();
      return;
    }

    // bonus words: ONLY real words from offline Bible dictionary
    // rule: not target, exists in dict, can be made from letters, once per level
    if (!state.bonusWords.has(word)
        && !targetWords.has(word)
        && state.dict.has(word)
        && canMakeFromLetters(word, level.letters)) {
      state.bonusWords.add(word);
      state.coins += 2;
      toast("🪙 Бонусное слово! +2");
      updateTopbar();
      savePersisted();
      return;
    }

    toast("❌ Нет такого слова");
  }

  function canMakeFromLetters(word, letters) {
    const pool = {};
    for (const ch of uniqLetters(letters)) pool[ch] = (pool[ch] || 0) + 1;
    for (const ch of word) {
      if (!pool[ch]) return false;
      pool[ch]--;
    }
    return true;
  }

  function isLevelCompleted() {
    const level = state.levels[state.levelIndex];
    return level.words.every(w => state.foundWords.has(w));
  }

  function nextLevel() {
    if (state.levelIndex < state.levels.length - 1) {
      state.levelIndex++;
      savePersisted();
      startLevel();
    } else {
      container.innerHTML = `
        <div class="wow-wrap">
          <div class="wow-panel" style="text-align:center;">
            <div style="font-weight:900;font-size:22px;margin:6px 0 8px;">🎉 Ты прошёл все уровни!</div>
            <div style="opacity:.92;margin-bottom:10px;">Монеты: 🪙 ${state.coins}</div>
            <button class="wow-btn primary" id="wow-restart">Начать заново</button>
            <div style="height:10px"></div>
            <button class="wow-btn secondary" id="wow-back2">⬅️ В меню</button>
          </div>
        </div>
      `;
      document.getElementById("wow-restart")?.addEventListener("click", () => {
        state.levelIndex = 0;
        state.coins = 0;
        savePersisted();
        startBibleWowGame(levelsUrl);
      });
      document.getElementById("wow-back2")?.addEventListener("click", () => {
        cleanupAll();
        goToMainMenu();
      });
    }
  }

  function giveHint() {
    if (state.coins < 10) {
      toast("Нужно 10 🪙 для подсказки");
      return;
    }
    const level = state.levels[state.levelIndex];
    // find any not-yet-found word and reveal its first unrevealed letter in grid
    const remaining = level.words.filter(w => !state.foundWords.has(w));
    if (!remaining.length) {
      toast("Уже всё найдено ✨");
      return;
    }
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    // reveal one word (как "покупка подсказки")
    state.foundWords.add(pick);
    state.coins -= 10;
    toast(`💡 Открыто слово: «${pick}»`);
    renderGrid();
    updateTopbar();
    if (isLevelCompleted()) toast("🏁 Уровень пройден!");
    savePersisted();
  }

  function revealWordPaid() {
    if (state.coins < 25) {
      toast("Нужно 25 🪙");
      return;
    }
    const level = state.levels[state.levelIndex];
    const remaining = level.words.filter(w => !state.foundWords.has(w));
    if (!remaining.length) {
      toast("Уже всё найдено ✨");
      return;
    }
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    state.coins -= 25;
    state.foundWords.add(pick);
    toast(`👁 Открыто слово: «${pick}»`);
    renderGrid();
    updateTopbar();
    if (isLevelCompleted()) {
      const levelId = Number(level.id);
      if (!state.completed.has(levelId)) {
        state.completed.add(levelId);
        state.coins += 10;
        toast("🏁 Уровень пройден! +10 🪙");
      } else {
        toast("🏁 Уровень пройден!");
      }
    }
    savePersisted();
  }

  function attachWheelHandlers(wheel, nodes) {
    // remove previous wheel listeners
    cleanupWheelOnly();

    const wheelRect = () => wheel.getBoundingClientRect();

    function hitTest(clientX, clientY) {
      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return null;
      const node = el.closest?.(".wow-letter");
      if (!node) return null;
      return node;
    }

    function addNode(node, clientX, clientY) {
      const letter = node.dataset.letter;
      if (!letter) return;
      const last = state.dragPath[state.dragPath.length - 1];
      if (last && last.node === node) return;

      // allow repeats if there are duplicates in letters, but prevent selecting same exact node twice
      if (state.dragPath.some(p => p.node === node)) return;

      node.classList.add("active");
      state.dragPath.push({ node, letter, point: pointToWheelSvg(clientX, clientY, wheelRect()) });
      setCurrentWord(state.dragPath.map(p => p.letter).join(""));
      drawPath(state.dragPath.map(p => p.point));
    }

    function move(clientX, clientY) {
      if (!state.isDragging) return;
      const node = hitTest(clientX, clientY);
      if (node) addNode(node, clientX, clientY);
      // update tail
      const pts = state.dragPath.map(p => p.point);
      if (pts.length) {
        pts.push(pointToWheelSvg(clientX, clientY, wheelRect()));
        drawPath(pts);
      }
    }

    function start(clientX, clientY) {
      state.isDragging = true;
      clearDragUI();
      const node = hitTest(clientX, clientY);
      if (node) addNode(node, clientX, clientY);
    }

    function end() {
      if (!state.isDragging) return;
      state.isDragging = false;
      const word = state.dragPath.map(p => p.letter).join("");
      clearDragUI();
      validateWord(word);
    }

    // pointer events
    listenWheel(wheel, "pointerdown", (e) => {
      if (!(e instanceof PointerEvent)) return;
      wheel.setPointerCapture?.(e.pointerId);
      start(e.clientX, e.clientY);
    }, { passive: true });
    listenWheel(wheel, "pointermove", (e) => {
      if (!(e instanceof PointerEvent)) return;
      move(e.clientX, e.clientY);
    }, { passive: true });
    listenWheel(wheel, "pointerup", () => end(), { passive: true });
    listenWheel(wheel, "pointercancel", () => end(), { passive: true });

    // prevent page scrolling while dragging in wheel
    listenWheel(wheel, "touchmove", (e) => {
      if (state.isDragging) e.preventDefault();
    }, { passive: false });
  }

  let wheelOnlyOff = [];
  function cleanupWheelOnly() {
    for (const off of wheelOnlyOff) off();
    wheelOnlyOff = [];
  }
  function listenWheel(el, ev, fn, opts) {
    el.addEventListener(ev, fn, opts);
    wheelOnlyOff.push(() => el.removeEventListener(ev, fn, opts));
  }

  // ---- Level start ----
  function startLevel() {
    const level = state.levels[state.levelIndex];
    state.foundWords = new Set();
    state.bonusWords = new Set();
    level._shuffled = level.letters;
    state.revealedKeys = new Set();

    const crossword = buildCrossword(level.words);
    state.grid = crossword.grid;
    state.placements = crossword.placements;

    renderSkeleton();
    updateTopbar();
    renderGrid();
    renderWheel();
    setCurrentWord("");

    document.getElementById("wow-shuffle")?.addEventListener("click", shuffleLetters);
    document.getElementById("wow-hint")?.addEventListener("click", giveHint);
    document.getElementById("wow-reveal")?.addEventListener("click", revealWordPaid);
    document.getElementById("wow-next")?.addEventListener("click", () => {
      if (!isLevelCompleted()) {
        toast("Сначала найди все слова 😉");
        return;
      }
      nextLevel();
    });

    // floating menu
    const fabBtn = document.getElementById("wow-fabBtn");
    const fabMenu = document.getElementById("wow-fabMenu");
    fabBtn?.addEventListener("click", () => {
      fabMenu?.classList.toggle("open");
    });
    // close on outside tap
    listen(document, "pointerdown", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.closest?.("#wow-fabBtn") || t.closest?.("#wow-fabMenu")) return;
      fabMenu?.classList.remove("open");
    }, { passive: true });

    listen(window, "resize", () => {
      // re-render wheel positions
      renderWheel();
    }, { passive: true });
  }

  // ---- Load levels and start ----
  container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";

  loadPersisted();
  Promise.all([
    loadJSON(levelsUrl),
    loadJSON("data/easy_bible_words.json"),
    loadJSON("data/medium_bible_words.json"),
    loadJSON("data/hard_bible_words.json")
  ])
    .then(([levelsData, easy, medium, hard]) => {
      const levels = (levelsData && levelsData.levels) ? levelsData.levels : [];
      state.levels = levels
        .map(l => ({
          id: l.id,
          letters: normWord(l.letters),
          words: (l.words || []).map(normWord).filter(w => w.length >= 3)
        }))
        .filter(l => l.letters.length >= 3 && l.words.length >= 3);

      // build offline dictionary (for bonus words)
      const all = []
        .concat(Array.isArray(easy) ? easy : [])
        .concat(Array.isArray(medium) ? medium : [])
        .concat(Array.isArray(hard) ? hard : []);
      state.dict = new Set(all.map(normWord).filter(w => w.length >= 3));

      if (!state.levels.length) throw new Error("Нет уровней");
      if (state.levelIndex >= state.levels.length) state.levelIndex = 0;
      state.coins = state.coins || 0;
      savePersisted();
      startLevel();
    })
    .catch((e) => {
      console.error(e);
      container.innerHTML = `
        <div style="padding:16px; text-align:center;">
          <p style="color:#ffb3b3; font-weight:700;">❌ Не удалось загрузить уровни.</p>
          <p style="opacity:.9;">Проверь файл <b>${levelsUrl}</b>.</p>
          <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
        </div>
      `;
    });
}
