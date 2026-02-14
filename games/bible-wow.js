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
    .wow-wrap{max-width:980px;margin:0 auto;padding:14px 14px 28px;}
    .wow-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}
    .wow-pill{display:flex;gap:10px;align-items:center;}
    .wow-chip{background:rgba(255,255,255,.55);border:1px solid rgba(120,120,160,.14);border-radius:999px;padding:8px 12px;font-size:14px;backdrop-filter: blur(10px);}
    .wow-btn{border:none;border-radius:14px;padding:10px 14px;font-weight:700;cursor:pointer;}
    .wow-btn.secondary{background:rgba(255,255,255,.65);color:#1b1b1b;border:1px solid rgba(120,120,160,.14);}
    .wow-btn.primary{background:#5b5eea;color:#fff;box-shadow:0 14px 30px rgba(91,94,234,.25);}

    .wow-panel{background:rgba(255,255,255,.55);border:1px solid rgba(120,120,160,.14);border-radius:18px;padding:14px;backdrop-filter: blur(12px);}
    .wow-gridWrap{display:flex;justify-content:center;align-items:center;}
    .wow-grid{
      display:grid;
      justify-content:center;
      align-content:center;
      gap:6px;
      grid-template-columns: repeat(9, var(--cellPx, 40px));
      width: max-content;
      user-select:none;-webkit-user-select:none;
    }
    .wow-cell{
      width:var(--cellPx, 40px);
      height:var(--cellPx, 40px);
      border-radius:14px;
      display:flex;align-items:center;justify-content:center;
      font-weight:900;letter-spacing:.5px;text-transform:uppercase;
      background:rgba(255,255,255,.72);
      border:2px solid rgba(152,140,255,.35);
      box-shadow: 0 10px 26px rgba(0,0,0,.05);
      box-sizing:border-box;
    }
    .wow-cell.block{background:transparent;border-color:transparent;box-shadow:none;}
    .wow-cell.revealed{background:rgba(230,230,255,.95);}

    .wow-mid{margin-top:12px;display:grid;gap:10px;}
    .wow-toast{min-height:22px;text-align:center;font-weight:800;opacity:.92;}
    .wow-wordline{display:flex;justify-content:center;}
    .wow-current{
      width:min(560px, 92vw);
      min-height:54px;
      border-radius:16px;
      background:rgba(255,255,255,.72);
      border:1px solid rgba(120,120,160,.14);
      display:flex;align-items:center;justify-content:center;
      padding:8px 12px;
      box-shadow: 0 10px 26px rgba(0,0,0,.05);
      box-sizing:border-box;
      overflow:hidden;
    }
    .wow-current span{font-weight:900;letter-spacing:1px;font-size:18px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;max-width:100%;}

    .wow-wheelWrap{display:flex;justify-content:center;align-items:center;}
    .wow-wheel{
      position:relative;
      width:min(320px,86vw);
      aspect-ratio:1/1;
      border-radius:999px;
      background:rgba(235,235,255,.7);
      border:1px solid rgba(120,120,160,.14);
      box-shadow: 0 18px 40px rgba(0,0,0,.08);
      overflow:hidden;
    }
    .wow-wheel svg{position:absolute;inset:0;pointer-events:none;}
    .wow-letter{
      position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:60px;height:60px;border-radius:999px;background:#fff;color:#111;font-weight:900;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 12px 28px rgba(0,0,0,.18);
      touch-action:none;
    }
    .wow-letter.active{transform:translate(-50%,-50%) scale(1.08);}
    .wow-bottom{margin-top:10px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;}
    .wow-small{opacity:.9;font-size:12px;max-width:520px;}
    .wow-burger{
      position:fixed;
      right:18px;
      bottom:18px;
      width:56px;height:56px;border-radius:16px;
      background:#5b5eea;color:#fff;border:none;
      box-shadow:0 18px 40px rgba(91,94,234,.28);
      font-weight:900;font-size:22px;
      z-index:50;
    }
    @media (max-width:380px){
      .wow-letter{width:54px;height:54px;}
      .wow-chip{padding:7px 10px;}
    }
  `;
  document.head.appendChild(style);

  // ---- State ----
  const LS_PROGRESS = "bibleWow_progress_v1";
  const LS_COINS = "bibleWow_coins_v1";

  const state = {
    levels: [],
    levelIndex: 0,
    coins: 0,
    foundWords: new Set(),
    bonusWords: new Set(),
    grid: null,
    placements: [],
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
  }

  function savePersisted() {
    try {
      localStorage.setItem(LS_PROGRESS, JSON.stringify({ levelIndex: state.levelIndex }));
    } catch {}
    try {
      localStorage.setItem(LS_COINS, String(state.coins));
    } catch {}
  }

  // ---- Crossword builder (квадратный, компактный, без "слипания боком") ----
  function buildCrossword(words) {
    const src = [...words].map(normWord).filter(Boolean);
    if (!src.length) return { grid: [[null]], placements: [] };

    const longest = src.reduce((m, w) => Math.max(m, w.length), 0);
    // квадратное поле: чем длиннее слова — тем больше поле, но без безумных размеров
    const S = Math.min(13, Math.max(9, longest + 2)); // 9..13

    // внутреннее поле для сборки чуть больше — чтобы было куда «поиграть»
    const W = S + 6;
    const H = S + 6;

    function tryBuild(order) {
      const grid = Array.from({ length: H }, () => Array(W).fill(null));
      const placements = [];

      const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
      const get = (x, y) => (inBounds(x, y) ? grid[y][x] : "#");

      function intersectsCount(word, x, y, dir) {
        let c = 0;
        for (let i = 0; i < word.length; i++) {
          const xx = x + (dir === 0 ? i : 0);
          const yy = y + (dir === 1 ? i : 0);
          if (get(xx, yy) === word[i]) c++;
        }
        return c;
      }

      function canPlace(word, x, y, dir) {
        // границы и конфликт букв
        for (let i = 0; i < word.length; i++) {
          const xx = x + (dir === 0 ? i : 0);
          const yy = y + (dir === 1 ? i : 0);
          if (!inBounds(xx, yy)) return false;
          const cell = grid[yy][xx];
          if (cell && cell !== word[i]) return false;
        }

        // нельзя «прилипать боком» без пересечения
        // 1) перед/после слова по направлению должны быть пустыми
        const bx = x + (dir === 0 ? -1 : 0);
        const by = y + (dir === 1 ? -1 : 0);
        const ax = x + (dir === 0 ? word.length : 0);
        const ay = y + (dir === 1 ? word.length : 0);
        if (get(bx, by)) return false;
        if (get(ax, ay)) return false;

        // 2) перпендикулярные соседи должны быть пустыми,
        //    если клетка НЕ является пересечением (там уже стоит такая же буква).
        for (let i = 0; i < word.length; i++) {
          const xx = x + (dir === 0 ? i : 0);
          const yy = y + (dir === 1 ? i : 0);
          const isCross = grid[yy][xx] === word[i];

          if (dir === 0) {
            if (!isCross && (get(xx, yy - 1) || get(xx, yy + 1))) return false;
          } else {
            if (!isCross && (get(xx - 1, yy) || get(xx + 1, yy))) return false;
          }
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
        placements.push({ word, dir, cells });
      }

      // 1) первое слово — по центру
      const first = order[0];
      const cx = Math.floor(W / 2);
      const cy = Math.floor(H / 2);
      place(first, cx - Math.floor(first.length / 2), cy, 0);

      // 2) остальные — через пересечения (или компактно рядом)
      for (let k = 1; k < order.length; k++) {
        const w = order[k];
        let best = null;

        for (const p of placements) {
          for (let i = 0; i < w.length; i++) {
            const ch = w[i];
            for (let j = 0; j < p.word.length; j++) {
              if (p.word[j] !== ch) continue;

              const anchor = p.cells[j];
              const dir = 1 - p.dir;
              const x = anchor.x - (dir === 0 ? i : 0);
              const y = anchor.y - (dir === 1 ? i : 0);

              if (!canPlace(w, x, y, dir)) continue;

              const inter = intersectsCount(w, x, y, dir);
              const score = inter * 10;

              if (!best || score > best.score) best = { x, y, dir, score };
            }
          }
        }

        if (!best) {
          // bbox текущих букв
          let minX = W, minY = H, maxX = -1, maxY = -1;
          for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
            if (grid[yy][xx]) { minX = Math.min(minX, xx); minY = Math.min(minY, yy); maxX = Math.max(maxX, xx); maxY = Math.max(maxY, yy); }
          }
          if (maxX === -1) { minX = cx; maxX = cx; minY = cy; maxY = cy; }

          const scanMinX = Math.max(0, minX - 3);
          const scanMaxX = Math.min(W - 1, maxX + 3);
          const scanMinY = Math.max(0, minY - 3);
          const scanMaxY = Math.min(H - 1, maxY + 3);

          for (let yy = scanMinY; yy <= scanMaxY && !best; yy++) {
            for (let xx = scanMinX; xx <= scanMaxX && !best; xx++) {
              for (let dir = 0; dir <= 1; dir++) {
                if (!canPlace(w, xx, yy, dir)) continue;
                best = { x: xx, y: yy, dir, score: 1 };
                break;
              }
            }
          }
        }

        if (best) place(w, best.x, best.y, best.dir);
      }

      // bbox
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
        if (grid[yy][xx]) { minX = Math.min(minX, xx); minY = Math.min(minY, yy); maxX = Math.max(maxX, xx); maxY = Math.max(maxY, yy); }
      }
      if (maxX === -1) return { grid: [[null]], placements: [], score: -999, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const area = bw * bh;

      // пересечения
      const occ = {};
      for (const p of placements) for (const c of p.cells) {
        const key = `${c.x},${c.y}`;
        occ[key] = (occ[key] || 0) + 1;
      }
      const intersections = Object.values(occ).filter(v => v >= 2).length;

      const score = intersections * 5 - area * 0.35 - (bw + bh) * 0.5;
      return { grid, placements, score, bbox: { minX, minY, maxX, maxY } };
    }

    // несколько попыток — выбираем лучший
    const base = [...src].sort((a, b) => b.length - a.length);
    let bestTry = null;
    const tries = 60;

    for (let t = 0; t < tries; t++) {
      const order = [...base];
      for (let i = 1; i < order.length; i++) {
        const j = 1 + Math.floor(Math.random() * (order.length - 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const attempt = tryBuild(order);
      if (!bestTry || attempt.score > bestTry.score) bestTry = attempt;
    }
    if (!bestTry) bestTry = tryBuild(base);

    const { grid: bigGrid, placements: bigPlacements, bbox } = bestTry;

    // квадрат SxS и центрирование bbox
    const square = Array.from({ length: S }, () => Array(S).fill(null));

    const bw = bbox.maxX - bbox.minX + 1;
    const bh = bbox.maxY - bbox.minY + 1;

    const cutMinX = bbox.minX;
    const cutMinY = bbox.minY;

    const offX = Math.floor((S - bw) / 2);
    const offY = Math.floor((S - bh) / 2);

    for (let yy = 0; yy < bh; yy++) {
      for (let xx = 0; xx < bw; xx++) {
        const ch = bigGrid[cutMinY + yy]?.[cutMinX + xx];
        const tx = offX + xx;
        const ty = offY + yy;
        if (tx >= 0 && ty >= 0 && tx < S && ty < S) square[ty][tx] = ch || null;
      }
    }

    const placements = bigPlacements.map(p => ({
      word: p.word,
      dir: p.dir,
      cells: p.cells
        .map(c => ({ x: offX + (c.x - cutMinX), y: offY + (c.y - cutMinY) }))
        .filter(c => c.x >= 0 && c.y >= 0 && c.x < S && c.y < S)
    }));

    return { grid: square, placements };
  }

  // ---- UI ----
  function renderSkeleton() {
    container.innerHTML = `
      <div class="wow-wrap">
        <div class="wow-top" id="wow-top">
          <button class="wow-btn secondary" id="wow-back">⬅️ В меню</button>
          <div class="wow-pill">
            <button class="wow-btn secondary" id="wow-prev">◀</button>
            <div class="wow-chip" id="wow-level">Уровень —</div>
            <button class="wow-btn secondary" id="wow-next">▶</button>
          </div>
        </div>

        <div class="wow-panel">
          <div class="wow-gridWrap" id="wow-gridWrap">
            <div id="wow-grid" class="wow-grid" aria-label="Кроссворд"></div>
          </div>

          <div class="wow-mid" id="wow-mid">
            <div id="wow-toast" class="wow-toast"></div>

            <div class="wow-wordline" id="wow-wordline">
              <div class="wow-current"><span id="wow-current"> </span></div>
            </div>

            <div class="wow-wheelWrap">
              <div class="wow-wheel" id="wow-wheel">
                <svg id="wow-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path id="wow-path" d="" fill="none" stroke="rgba(91,94,234,.75)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </div>

            <div class="wow-bottom" id="wow-bottom">
              <div class="wow-small">Проведи по буквам, чтобы составить слово. Бонусные слова дают монеты.</div>
              <button class="wow-btn primary" id="wow-skip">Следующий ▶</button>
            </div>
          </div>
        </div>

        <button class="wow-burger" id="wow-burger" title="Меню">≡</button>
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
    if (levelEl) levelEl.textContent = `Уровень ${state.levelIndex + 1} / ${state.levels.length}`;
  }

  function renderGrid() {
    const gridEl = document.getElementById("wow-grid");
    if (!gridEl || !state.grid) return;

    const h = state.grid.length;
    const w = state.grid[0].length;

    gridEl.style.gridTemplateColumns = `repeat(${w}, var(--cellPx, 40px))`;

    const revealed = new Set();
    for (const p of state.placements) {
      if (state.foundWords.has(p.word)) {
        for (const c of p.cells) revealed.add(`${c.x},${c.y}`);
      }
    }

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
          cell.className = "wow-cell" + (isRev ? " revealed" : "");
          cell.textContent = isRev ? ch : "";
          cell.dataset.x = String(x);
          cell.dataset.y = String(y);
        }
        gridEl.appendChild(cell);
      }
    }

    fitLayout();
  }

  function setCurrentWord(s) {
    state.currentWord = s;
    const el = document.getElementById("wow-current");
    if (el) el.textContent = s || " ";
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

    wheel.querySelectorAll(".wow-letter").forEach(n => n.remove());

    const level = state.levels[state.levelIndex];
    const letters = uniqLetters(level._shuffled || level.letters);
    const n = letters.length;

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
    const targetWords = new Set(level.crossword);

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
        state.coins += 10;
        toast("🏁 Уровень пройден! +10 🪙");
        savePersisted();
      }
      return;
    }

    const bonusSet = new Set(level.bonus || []);
    if (bonusSet.has(word)) {
      if (state.bonusWords.has(word)) {
        toast("⭐ Уже в бонусах");
        return;
      }
      state.bonusWords.add(word);
      state.coins += 2;
      toast("🪙 Бонус! +2");
      savePersisted();
      return;
    }

    toast("❌ Нет такого слова");
  }

  function isLevelCompleted() {
    const level = state.levels[state.levelIndex];
    return level.crossword.every(w => state.foundWords.has(w));
  }

  function nextLevel(dir) {
    const next = state.levelIndex + dir;
    if (next < 0 || next > state.levels.length - 1) return;
    state.levelIndex = next;
    savePersisted();
    startLevel();
  }

  function fitLayout() {
    const gridEl = document.getElementById("wow-grid");
    const gridWrap = document.getElementById("wow-gridWrap");
    const wheel = document.getElementById("wow-wheel");
    const mid = document.getElementById("wow-mid");
    if (!gridEl || !gridWrap || !state.grid) return;

    const cols = state.grid[0]?.length || 1;
    const rows = state.grid.length || 1;

    const vw = Math.max(320, window.innerWidth || 0);
    const vh = Math.max(480, window.innerHeight || 0);

    const availW = Math.min(vw - 28, 560);

    const gridTop = gridWrap.getBoundingClientRect().top;
    const midH = mid ? mid.getBoundingClientRect().height : 0;
    const paddingSafety = 22;

    const availH = Math.max(150, vh - gridTop - midH - paddingSafety);

    const gap = vw < 380 ? 5 : 6;
    gridEl.style.gap = `${gap}px`;

    const cellByW = Math.floor((availW - gap * (cols - 1)) / cols);
    const cellByH = Math.floor((availH - gap * (rows - 1)) / rows);

    const cellPx = Math.max(26, Math.min(46, Math.min(cellByW, cellByH)));
    document.documentElement.style.setProperty("--cellPx", `${cellPx}px`);

    const gridH = rows * cellPx + gap * (rows - 1);
    gridWrap.style.height = `${gridH}px`;
    gridWrap.style.maxHeight = `${gridH}px`;

    if (wheel) {
      const maxWheel = Math.min(320, Math.floor(vw * 0.86));
      const wanted = Math.min(maxWheel, Math.floor(vh * 0.42));
      wheel.style.width = `${wanted}px`;
    }
  }

  function attachWheelHandlers(wheel, nodes) {
    cleanupWheelOnly();

    const wheelRect = () => wheel.getBoundingClientRect();

    function hitTest(clientX, clientY) {
      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return null;
      return el.closest?.(".wow-letter") || null;
    }

    function addNode(node, clientX, clientY) {
      const letter = node.dataset.letter;
      if (!letter) return;

      const last = state.dragPath[state.dragPath.length - 1];
      if (last && last.node === node) return;
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

  function startLevel() {
    const level = state.levels[state.levelIndex];
    state.foundWords = new Set();
    state.bonusWords = new Set();
    level._shuffled = level.letters;

    const crossword = buildCrossword(level.crossword);
    state.grid = crossword.grid;
    state.placements = crossword.placements;

    renderSkeleton();
    updateTopbar();
    renderGrid();
    renderWheel();
    setCurrentWord("");

    document.getElementById("wow-prev")?.addEventListener("click", () => nextLevel(-1));
    document.getElementById("wow-next")?.addEventListener("click", () => nextLevel(1));
    document.getElementById("wow-burger")?.addEventListener("click", shuffleLetters);

    document.getElementById("wow-skip")?.addEventListener("click", () => {
      if (!isLevelCompleted()) {
        toast("Сначала найди все слова 😉");
        return;
      }
      nextLevel(1);
    });

    listen(window, "resize", () => {
      renderWheel();
      fitLayout();
    }, { passive: true });

    // после первой отрисовки — подгон
    setTimeout(() => {
      renderWheel();
      fitLayout();
    }, 0);
  }

  // ---- Load levels and start ----
  container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";

  loadPersisted();
  loadJSON(levelsUrl)
    .then((data) => {
      const levels = (data && data.levels) ? data.levels : [];
      state.levels = levels
        .map(l => ({
          id: l.id,
          letters: normWord(l.letters),
          crossword: (l.crossword || l.words || []).map(normWord).filter(Boolean),
          bonus: (l.bonus || []).map(normWord).filter(Boolean)
        }))
        .filter(l => l.letters.length >= 3 && l.crossword.length >= 4);

      if (!state.levels.length) throw new Error("Нет уровней");
      if (state.levelIndex >= state.levels.length) state.levelIndex = 0;
      savePersisted();
      startLevel();
    })
    .catch((e) => {
      console.error(e);
      container.innerHTML = `
        <div style="padding:16px; text-align:center;">
          <p style="color:#ff3b3b; font-weight:800;">❌ Не удалось загрузить уровни.</p>
          <p style="opacity:.9;">Проверь файл <b>${levelsUrl}</b> (и путь без 404).</p>
          <button class="wow-btn primary" onclick="goToMainMenu()">⬅️ В меню</button>
        </div>
      `;
    });
}
