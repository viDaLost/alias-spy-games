// games/bible-wow.js — мини-«Words of Wonders» на библейскую тему
// Без библиотек. Mobile-first. Мышь + тач.
// Совместим с форматами уровней: {letters, words} или {letters, crossword, bonus}
/* global loadJSON, goToMainMenu */

function startBibleWowGame(levelsUrl) {
  const container = document.getElementById("game-container");
  if (!container) return;

  // -------------------- helpers --------------------
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function normWord(s) {
    return String(s || "")
      .trim()
      .toUpperCase()
      .replace(/Ё/g, "Е")
      .replace(/[^А-Я]/g, "");
  }

  function uniqLetters(str) {
    return Array.from(String(str || ""));
  }

  function countLetters(str) {
    const m = Object.create(null);
    for (const ch of String(str || "")) m[ch] = (m[ch] || 0) + 1;
    return m;
  }

  function canMakeFromLetters(word, letters) {
    const pool = countLetters(letters);
    for (const ch of word) {
      if (!pool[ch]) return false;
      pool[ch]--;
    }
    return true;
  }

  function safeJSON(x, fallback) {
    try {
      return JSON.parse(x);
    } catch {
      return fallback;
    }
  }

  // -------------------- Styles (в стиле приложения + правильная адаптивность) --------------------
  const styleId = "bible-wow-style";
  document.getElementById(styleId)?.remove();

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    /* ---------- Layout: всё в 1 экран (кроссворд + поле слова + кольцо + кнопки) ---------- */
    .wow-page{
      width:100%;
      max-width:980px;
      margin:0 auto;
      padding:12px 12px calc(12px + env(safe-area-inset-bottom));
      box-sizing:border-box;
    }

    .wow-headerRow{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin-bottom:10px;
      flex-wrap:nowrap;
    }

    .wow-backBtn{
      width:44px;height:44px;
      border-radius:14px;
      border:none;
      background:rgba(79,70,229,.10);
      color:var(--accent-active);
      font-weight:900;
      box-shadow:0 8px 18px var(--shadow);
      cursor:pointer;
      display:grid;
      place-items:center;
      flex:0 0 auto;
    }
    .wow-backBtn:active{transform:scale(.98)}

    .wow-levelPill{
      display:flex;
      align-items:center;
      gap:10px;
      background:var(--card-bg);
      border-radius:999px;
      box-shadow:0 8px 18px var(--shadow);
      padding:8px 10px;
      border:1px solid rgba(0,0,0,.06);
      flex:1 1 auto;
      min-width:0;
      justify-content:center;
    }
    .wow-levelText{
      font-weight:900;
      color:var(--text-color);
      font-size:14px;
      min-width:140px;
      text-align:center;
      white-space:nowrap;
    }
    .wow-navBtn{
      width:36px;height:36px;
      border-radius:12px;
      border:none;
      background:var(--accent-color);
      box-shadow:0 6px 14px var(--shadow);
      cursor:pointer;
      font-weight:900;
      color:var(--accent-active);
      display:grid;
      place-items:center;
      flex:0 0 auto;
    }
    .wow-navBtn:active{transform:scale(.98)}

    .wow-burger{
      width:44px;height:44px;
      border-radius:14px;
      border:none;
      background:var(--accent-active);
      color:#fff;
      box-shadow:0 10px 22px var(--shadow);
      cursor:pointer;
      display:grid;
      place-items:center;
      font-size:20px;
      font-weight:900;
      flex:0 0 auto;
    }
    .wow-burger:active{transform:scale(.98)}

    .wow-card{
      background:var(--card-bg);
      border-radius:18px;
      box-shadow:0 10px 26px var(--shadow);
      border:1px solid rgba(0,0,0,.06);
      padding:12px;
      box-sizing:border-box;

      /* критично: ограничиваем высоту, чтобы не было огромных пустот и всё влезало */
      height: calc(100vh - 110px - env(safe-area-inset-bottom));
      min-height: 520px;
      display:flex;
      flex-direction:column;
      gap:10px;
      overflow:hidden;
    }

    /* ---------- Кроссворд ---------- */
    .wow-gridWrap{
      flex: 1 1 auto;
      min-height: 220px;
      display:flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
    }

    .wow-grid{
      display:grid;
      justify-content:center;
      align-content:center;
      --gap:6px;
      gap:var(--gap);
      --cols:10;

      /* ключ: размер клетки зависит и от ширины и от высоты, чтобы не улетало вниз */
      --cell: clamp(26px,
        calc((min(92vw, 440px) - (var(--cols) - 1)*var(--gap))/var(--cols)),
        42px);

      grid-template-columns: repeat(var(--cols), var(--cell));
    }

    .wow-cell{
      width:var(--cell);
      height:var(--cell);
      border-radius:12px;
      background:#fff;
      border:2px solid rgba(79,70,229,.20);
      box-shadow:0 6px 16px rgba(0,0,0,.06);
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:900;
      color:var(--accent-active);
      user-select:none;
      -webkit-user-select:none;
      box-sizing:border-box;
      transition: transform .15s ease, background .15s ease;
    }
    .wow-cell.block{background:transparent;border:none;box-shadow:none;}
    .wow-cell.revealed{
      background:rgba(79,70,229,.12);
      border-color:rgba(79,70,229,.35);
      color:#111;
    }
    .wow-cell.pop{animation:wowPop .18s ease-out;}
    @keyframes wowPop{from{transform:scale(.85)}to{transform:scale(1)}}

    /* ---------- Поле текущего слова ---------- */
    .wow-current{
      flex: 0 0 auto;
      height: 54px;
      border-radius:16px;
      border:1px solid rgba(0,0,0,.07);
      background:rgba(0,0,0,.04);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.6);
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:900;
      letter-spacing:1px;
      width: 100%;
      max-width: 100%;
      box-sizing:border-box;
      overflow:hidden;
      text-overflow:ellipsis;
      padding: 0 14px;
    }

    .wow-toast{
      flex:0 0 auto;
      min-height:20px;
      font-weight:800;
      color:var(--text-color);
      display:flex;
      align-items:center;
      justify-content:center;
      text-align:center;
    }

    /* ---------- Кольцо букв ---------- */
    .wow-wheelWrap{
      flex: 0 0 auto;
      display:flex;
      justify-content:center;
      align-items:center;
      margin-top:auto;
    }

    .wow-wheel{
      position:relative;
      width:min(330px, 92vw);
      aspect-ratio: 1/1;
      border-radius:999px;
      background:rgba(79,70,229,.06);
      border:1px solid rgba(79,70,229,.18);
      box-shadow:0 10px 26px rgba(0,0,0,.08);
      touch-action:none;
    }
    .wow-wheel svg{position:absolute;inset:0;pointer-events:none;}
    .wow-wheel path{stroke:rgba(79,70,229,.75)}

    .wow-letter{
      position:absolute;
      left:50%;
      top:50%;
      transform:translate(-50%,-50%);
      width:58px;
      height:58px;
      border-radius:999px;
      background:#fff;
      border:1px solid rgba(0,0,0,.08);
      box-shadow:0 10px 22px rgba(0,0,0,.14);
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:900;
      color:#111;
      user-select:none;
      -webkit-user-select:none;
      touch-action:none;
    }
    .wow-letter.active{
      transform:translate(-50%,-50%) scale(1.08);
      border-color:rgba(79,70,229,.35);
    }

    /* центр кольца просто декоративный, без кнопок */
    .wow-center{
      position:absolute;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      pointer-events:none;
    }
    .wow-centerInner{
      width:92px;
      height:92px;
      border-radius:999px;
      background:rgba(255,255,255,.70);
      border:1px solid rgba(0,0,0,.08);
      box-shadow:0 12px 24px rgba(0,0,0,.08);
    }

    /* ---------- Кнопки под кольцом (shuffle/hint) ---------- */
    .wow-underWheel{
      flex:0 0 auto;
      display:flex;
      justify-content:center;
      gap:10px;
    }
    .wow-underBtn{
      border:none;
      border-radius:14px;
      padding:10px 14px;
      background:rgba(79,70,229,.12);
      color:var(--accent-active);
      font-weight:900;
      cursor:pointer;
      box-shadow:0 8px 16px rgba(0,0,0,.08);
      display:flex;
      align-items:center;
      gap:8px;
      white-space:nowrap;
    }
    .wow-underBtn:active{transform:scale(.98)}

    /* ---------- Нижняя строка ---------- */
    .wow-bottomRow{
      flex:0 0 auto;
      display:flex;
      gap:10px;
      justify-content:space-between;
      align-items:center;
      flex-wrap:wrap;
    }
    .wow-help{font-size:12px;opacity:.85;flex:1 1 auto;min-width:220px}
    .wow-next{
      border:none;
      border-radius:14px;
      padding:12px 14px;
      background:var(--accent-active);
      color:#fff;
      font-weight:900;
      box-shadow:0 10px 24px var(--shadow);
      cursor:pointer;
      flex:0 0 auto;
    }
    .wow-next:active{transform:scale(.98)}

    /* ---------- Модалка бургер-меню ---------- */
    .wow-modalOverlay{
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.25);
      display:none;
      align-items:center;
      justify-content:center;
      padding:16px;
      z-index:9999;
    }
    .wow-modalOverlay.open{display:flex;}
    .wow-modal{
      width:min(520px, 96vw);
      background:var(--card-bg);
      border-radius:18px;
      box-shadow:0 20px 50px rgba(0,0,0,.25);
      border:1px solid rgba(0,0,0,.08);
      overflow:hidden;
    }
    .wow-modalTop{
      padding:12px 14px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      background:linear-gradient(to right, var(--accent-color), #fff);
    }
    .wow-modalTitle{font-weight:900;color:var(--accent-active)}
    .wow-close{
      border:none;
      border-radius:12px;
      width:40px;
      height:40px;
      background:rgba(0,0,0,.06);
      cursor:pointer;
      font-weight:900;
    }
    .wow-tabs{
      display:flex;
      gap:8px;
      padding:10px 14px;
      border-bottom:1px solid rgba(0,0,0,.07);
      flex-wrap:wrap;
    }
    .wow-tab{
      border:none;
      border-radius:999px;
      padding:8px 12px;
      background:rgba(0,0,0,.05);
      cursor:pointer;
      font-weight:800;
    }
    .wow-tab.active{
      background:rgba(79,70,229,.14);
      color:var(--accent-active);
    }
    .wow-modalBody{
      padding:12px 14px;
      max-height:min(68vh, 520px);
      overflow:auto;
    }
    .wow-statRow{
      display:flex;
      gap:10px;
      align-items:center;
      justify-content:space-between;
      margin-bottom:12px;
      flex-wrap:wrap;
    }
    .wow-chip2{
      background:rgba(0,0,0,.05);
      border:1px solid rgba(0,0,0,.07);
      border-radius:999px;
      padding:8px 12px;
      font-weight:900;
    }
    .wow-list{display:flex;flex-direction:column;gap:10px;}
    .wow-levelItem{
      padding:12px 12px;
      border-radius:16px;
      border:1px solid rgba(0,0,0,.07);
      background:#fff;
      box-shadow:0 6px 14px rgba(0,0,0,.06);
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }
    .wow-levelItem .t{font-weight:900}
    .wow-levelItem .s{opacity:.7;font-size:12px}
    .wow-dot{width:10px;height:10px;border-radius:999px;background:rgba(79,70,229,.35)}
    .wow-bonusGrid{display:flex;flex-wrap:wrap;gap:8px;}
    .wow-bonusTag{
      padding:8px 10px;
      border-radius:999px;
      background:rgba(79,70,229,.10);
      border:1px solid rgba(79,70,229,.18);
      font-weight:900;
      color:#111;
    }

    /* Очень низкие экраны: чуть уменьшаем всё */
    @media (max-height: 740px){
      .wow-card{min-height: 480px;}
      .wow-wheel{width:min(300px, 92vw);}
      .wow-letter{width:54px;height:54px;}
      .wow-current{height:50px;}
      .wow-grid{--cell: clamp(24px, calc((min(92vw, 420px) - (var(--cols) - 1)*var(--gap))/var(--cols)), 38px);}
    }
  `;
  document.head.appendChild(style);

  // -------------------- State --------------------
  const LS_PROGRESS = "bibleWow_progress_v3";
  const LS_COINS = "bibleWow_coins_v3";
  const LS_BONUS = "bibleWow_bonus_by_level_v3";

  const state = {
    levels: [],
    levelIndex: 0,
    coins: 0,

    foundWords: new Set(),
    bonusFound: new Set(),

    grid: null,
    placements: [],

    isDragging: false,
    dragPath: [],
    lastToastAt: 0,

    dictMain: new Set(),
    dictExtra: new Set(),
    bonusAllForLevel: new Set(),
  };

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
      const p = safeJSON(localStorage.getItem(LS_PROGRESS) || "null", null);
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

  function loadBonusPersisted(levelIndex) {
    try {
      const map = safeJSON(localStorage.getItem(LS_BONUS) || "{}", {});
      const arr = Array.isArray(map[levelIndex]) ? map[levelIndex] : [];
      return new Set(arr.map(normWord).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function saveBonusPersisted(levelIndex, set) {
    try {
      const map = safeJSON(localStorage.getItem(LS_BONUS) || "{}", {});
      map[levelIndex] = Array.from(set);
      localStorage.setItem(LS_BONUS, JSON.stringify(map));
    } catch {}
  }

  // -------------------- Crossword builder --------------------
  function buildCrossword(words) {
    const W = 11, H = 11;
    const grid = Array.from({ length: H }, () => Array(W).fill(null));
    const placements = [];

    function canPlace(word, x, y, dir) {
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
    if (!sorted.length) return { grid: [[null]], placements: [] };

    const w0 = sorted[0];
    place(w0, Math.floor((W - w0.length) / 2), Math.floor(H / 2), 0);

    for (let wi = 1; wi < sorted.length; wi++) {
      const word = sorted[wi];
      let placed = false;

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
    if (maxX === -1) return { grid: [[null]], placements: [] };

    const cropped = [];
    for (let y = minY; y <= maxY; y++) cropped.push(grid[y].slice(minX, maxX + 1));
    for (const p of placements) p.cells = p.cells.map(c => ({ x: c.x - minX, y: c.y - minY }));
    return { grid: cropped, placements };
  }

  // -------------------- UI Skeleton (убрали “Библейские слова” и “Составляй...”) --------------------
  function renderSkeleton() {
    container.innerHTML = `
      <div class="wow-page">
        <div class="wow-headerRow">
          <button class="wow-backBtn" id="wow-back" title="В меню">←</button>

          <div class="wow-levelPill">
            <button class="wow-navBtn" id="wow-prev" title="Назад">◀</button>
            <div class="wow-levelText" id="wow-levelText">Уровень —</div>
            <button class="wow-navBtn" id="wow-next" title="Вперёд">▶</button>
          </div>

          <button class="wow-burger" id="wow-burger" title="Меню">≡</button>
        </div>

        <div class="wow-card">
          <div class="wow-gridWrap">
            <div id="wow-grid" class="wow-grid" aria-label="Кроссворд"></div>
          </div>

          <div id="wow-toast" class="wow-toast"></div>
          <div class="wow-current" id="wow-current"> </div>

          <div class="wow-wheelWrap">
            <div class="wow-wheel" id="wow-wheel">
              <svg id="wow-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path id="wow-path" d="" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
              <div class="wow-center">
                <div class="wow-centerInner"></div>
              </div>
            </div>
          </div>

          <!-- Кнопки ПОД кольцом -->
          <div class="wow-underWheel">
            <button class="wow-underBtn" id="wow-shuffle" title="Перемешать">⟲ Перемешать</button>
            <button class="wow-underBtn" id="wow-hint" title="Подсказка">💡 Подсказка</button>
          </div>

          <div class="wow-bottomRow">
            <div class="wow-help">Проведи по буквам, чтобы составить слово. За бонусные слова: +2 🪙</div>
            <button class="wow-next" id="wow-advance">Следующий ▶</button>
          </div>
        </div>
      </div>

      <div class="wow-modalOverlay" id="wow-modalOverlay" aria-hidden="true">
        <div class="wow-modal" role="dialog" aria-modal="true">
          <div class="wow-modalTop">
            <div class="wow-modalTitle">Меню</div>
            <button class="wow-close" id="wow-closeModal">✕</button>
          </div>

          <div class="wow-tabs">
            <button class="wow-tab active" data-tab="stats">Статус</button>
            <button class="wow-tab" data-tab="levels">Уровни</button>
            <button class="wow-tab" data-tab="bonus">Бонусные</button>
          </div>

          <div class="wow-modalBody">
            <div class="wow-tabPanel" data-panel="stats">
              <div class="wow-statRow">
                <div class="wow-chip2" id="wow-coinsChip">🪙 0</div>
                <div class="wow-chip2" id="wow-bonusChip">⭐ 0</div>
              </div>
              <div style="opacity:.9;line-height:1.4">
                <div><b>Подсказка</b>: −10 🪙 (открывает одно слово в кроссворде)</div>
                <div style="margin-top:8px"><b>Бонус</b>: слово засчитывается, если оно библейское и собирается из букв уровня.</div>
              </div>
            </div>

            <div class="wow-tabPanel" data-panel="levels" style="display:none">
              <div class="wow-list" id="wow-levelList"></div>
            </div>

            <div class="wow-tabPanel" data-panel="bonus" style="display:none">
              <div style="font-weight:900;margin-bottom:10px">Найденные бонусные слова</div>
              <div class="wow-bonusGrid" id="wow-bonusList"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // navigation
    document.getElementById("wow-back")?.addEventListener("click", () => {
      cleanupAll();
      goToMainMenu();
    });

    document.getElementById("wow-prev")?.addEventListener("click", () => {
      if (state.levelIndex > 0) {
        state.levelIndex--;
        savePersisted();
        startLevel();
      }
    });

    document.getElementById("wow-next")?.addEventListener("click", () => {
      if (state.levelIndex < state.levels.length - 1) {
        state.levelIndex++;
        savePersisted();
        startLevel();
      }
    });

    document.getElementById("wow-advance")?.addEventListener("click", () => {
      if (!isLevelCompleted()) {
        toast("Сначала найди все слова 😉");
        return;
      }
      nextLevel();
    });

    // burger modal
    const overlay = document.getElementById("wow-modalOverlay");
    const openModal = () => {
      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden", "false");
      renderModalContent();
    };
    const closeModal = () => {
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
    };

    document.getElementById("wow-burger")?.addEventListener("click", openModal);
    document.getElementById("wow-closeModal")?.addEventListener("click", closeModal);
    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    // tabs
    document.querySelectorAll(".wow-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".wow-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;
        document.querySelectorAll(".wow-tabPanel").forEach(p => {
          p.style.display = (p.dataset.panel === tab) ? "" : "none";
        });
        renderModalContent();
      });
    });
  }

  function updateHeader() {
    const t = document.getElementById("wow-levelText");
    if (t) t.textContent = `Уровень ${state.levelIndex + 1} / ${state.levels.length}`;
  }

  function updateCoinsUI() {
    const chip = document.getElementById("wow-coinsChip");
    if (chip) chip.textContent = `🪙 ${state.coins}`;
  }

  function setCurrentWord(s) {
    const el = document.getElementById("wow-current");
    if (el) el.textContent = s || " ";
  }

  // -------------------- Grid render --------------------
  function renderGrid() {
    const gridEl = document.getElementById("wow-grid");
    if (!gridEl || !state.grid) return;

    const h = state.grid.length;
    const w = state.grid[0].length;

    gridEl.style.setProperty("--cols", String(w));
    gridEl.style.gridTemplateColumns = `repeat(${w}, var(--cell))`;

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
          cell.className = "wow-cell" + (isRev ? " revealed pop" : "");
          cell.textContent = isRev ? ch : "";
        }
        gridEl.appendChild(cell);
      }
    }
  }

  // -------------------- Wheel + dragging (липкий hit-test) --------------------
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
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    path.setAttribute("d", d);
  }

  function clearDragUI() {
    state.dragPath = [];
    drawPath([]);
    document.querySelectorAll(".wow-letter.active").forEach(el => el.classList.remove("active"));
    setCurrentWord("");
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

  let wheelOnlyOff = [];
  function cleanupWheelOnly() {
    for (const off of wheelOnlyOff) off();
    wheelOnlyOff = [];
  }
  function listenWheel(el, ev, fn, opts) {
    el.addEventListener(ev, fn, opts);
    wheelOnlyOff.push(() => el.removeEventListener(ev, fn, opts));
  }

  function attachWheelHandlers(wheel, nodes) {
    cleanupWheelOnly();

    const getCenters = () => nodes.map(node => {
      const r = node.getBoundingClientRect();
      return { node, cx: r.left + r.width / 2, cy: r.top + r.height / 2, radius: Math.max(r.width, r.height) / 2 };
    });

    let centers = getCenters();
    const wheelRect = () => wheel.getBoundingClientRect();

    function hitTestNearest(clientX, clientY) {
      const el = document.elementFromPoint(clientX, clientY);
      const direct = el?.closest?.(".wow-letter");
      if (direct) return direct;

      centers = getCenters();
      let best = null;
      let bestD2 = Infinity;

      for (const c of centers) {
        const dx = clientX - c.cx;
        const dy = clientY - c.cy;
        const d2 = dx * dx + dy * dy;
        const max = (c.radius * 0.65) ** 2;
        if (d2 <= max && d2 < bestD2) {
          bestD2 = d2;
          best = c.node;
        }
      }
      return best;
    }

    function addNode(node, clientX, clientY) {
      const letter = node?.dataset?.letter;
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

      const node = hitTestNearest(clientX, clientY);
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
      const node = hitTestNearest(clientX, clientY);
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
      wheel.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      start(e.clientX, e.clientY);
    }, { passive: false });

    listenWheel(wheel, "pointermove", (e) => {
      e.preventDefault();
      move(e.clientX, e.clientY);
    }, { passive: false });

    listenWheel(wheel, "pointerup", (e) => {
      e.preventDefault();
      end();
    }, { passive: false });

    listenWheel(wheel, "pointercancel", () => end(), { passive: true });

    listenWheel(wheel, "touchmove", (e) => {
      if (state.isDragging) e.preventDefault();
    }, { passive: false });
  }

  // -------------------- Bonus generation --------------------
  function isBibleWord(word) {
    if (state.dictMain.size === 0 && state.dictExtra.size === 0) return false;
    return state.dictMain.has(word) || state.dictExtra.has(word);
  }

  function computeAllBonusForLevel(level) {
    const letters = level.letters;
    const crosswordSet = new Set(level.crossword);

    if (state.dictMain.size === 0 && state.dictExtra.size === 0) {
      return new Set((level.bonus || []).filter(w => !crosswordSet.has(w)));
    }

    const out = new Set();
    const minLen = 3;
    const maxLen = Math.max(3, letters.length);

    const scan = (set) => {
      for (const w of set) {
        if (w.length < minLen || w.length > maxLen) continue;
        if (crosswordSet.has(w)) continue;
        if (!canMakeFromLetters(w, letters)) continue;
        out.add(w);
      }
    };

    scan(state.dictMain);
    scan(state.dictExtra);

    for (const w of (level.bonus || [])) {
      if (!crosswordSet.has(w) && canMakeFromLetters(w, letters)) out.add(w);
    }

    return out;
  }

  // -------------------- Validate words --------------------
  function isLevelCompleted() {
    const level = state.levels[state.levelIndex];
    return level.crossword.every(w => state.foundWords.has(w));
  }

  function validateWord(wordRaw) {
    const word = normWord(wordRaw);
    if (word.length < 3) {
      toast("Слишком коротко");
      return;
    }

    const level = state.levels[state.levelIndex];

    if (level.crosswordSet.has(word)) {
      if (state.foundWords.has(word)) {
        toast("✅ Уже найдено");
        return;
      }
      state.foundWords.add(word);
      toast("✨ Отлично!");
      renderGrid();

      if (isLevelCompleted() && !level._completedOnce) {
        level._completedOnce = true;
        state.coins += 10;
        toast("🏁 Уровень пройден! +10 🪙");
      }

      updateCoinsUI();
      savePersisted();
      return;
    }

    if (canMakeFromLetters(word, level.letters)) {
      let ok = false;
      if (state.dictMain.size || state.dictExtra.size) ok = isBibleWord(word);
      else ok = state.bonusAllForLevel.has(word);

      if (ok) {
        if (state.bonusFound.has(word)) {
          toast("⭐ Уже в бонусах");
          return;
        }
        state.bonusFound.add(word);
        saveBonusPersisted(state.levelIndex, state.bonusFound);

        state.coins += 2;
        updateCoinsUI();
        toast("🪙 Бонус! +2");

        renderModalContent();
        savePersisted();
        return;
      }
    }

    toast("❌ Нет такого слова");
  }

  // -------------------- Hint --------------------
  function giveHint() {
    if (state.coins < 10) {
      toast("Нужно 10 🪙");
      return;
    }
    const level = state.levels[state.levelIndex];
    const remaining = level.crossword.filter(w => !state.foundWords.has(w));
    if (!remaining.length) {
      toast("Уже всё найдено ✨");
      return;
    }
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    state.foundWords.add(pick);
    state.coins -= 10;
    updateCoinsUI();
    toast(`💡 Открыто: «${pick}»`);
    renderGrid();

    if (isLevelCompleted() && !level._completedOnce) {
      level._completedOnce = true;
      state.coins += 10;
      updateCoinsUI();
      toast("🏁 Уровень пройден! +10 🪙");
    }

    savePersisted();
  }

  // -------------------- Levels progression --------------------
  function nextLevel() {
    if (state.levelIndex < state.levels.length - 1) {
      state.levelIndex++;
      savePersisted();
      startLevel();
      return;
    }

    container.innerHTML = `
      <div class="wow-page">
        <div class="wow-card" style="text-align:center;padding:18px;">
          <div style="font-weight:900;font-size:22px;margin-bottom:8px;">🎉 Ты прошёл все уровни!</div>
          <div style="opacity:.9;margin-bottom:14px;">Монеты: 🪙 ${state.coins}</div>
          <button class="start-button" id="wow-restart">Начать заново</button>
          <button class="back-button" id="wow-back2">⬅️ В меню</button>
        </div>
      </div>
    `;
    document.getElementById("wow-restart")?.addEventListener("click", () => {
      state.levelIndex = 0;
      state.coins = 0;
      try { localStorage.removeItem(LS_BONUS); } catch {}
      savePersisted();
      startBibleWowGame(levelsUrl);
    });
    document.getElementById("wow-back2")?.addEventListener("click", () => {
      cleanupAll();
      goToMainMenu();
    });
  }

  // -------------------- Modal content --------------------
  function renderModalContent() {
    const coinsChip = document.getElementById("wow-coinsChip");
    if (coinsChip) coinsChip.textContent = `🪙 ${state.coins}`;

    const bonusChip = document.getElementById("wow-bonusChip");
    if (bonusChip) bonusChip.textContent = `⭐ ${state.bonusFound.size}`;

    const list = document.getElementById("wow-levelList");
    if (list) {
      list.innerHTML = "";
      for (let i = 0; i < state.levels.length; i++) {
        const item = document.createElement("div");
        item.className = "wow-levelItem";
        item.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <div class="wow-dot"></div>
            <div style="min-width:0">
              <div class="t">Уровень ${i + 1}</div>
              <div class="s">${i === state.levelIndex ? "текущий" : ""}</div>
            </div>
          </div>
          <div style="font-weight:900;color:var(--accent-active)">${i === state.levelIndex ? "▶" : ""}</div>
        `;
        item.addEventListener("click", () => {
          state.levelIndex = i;
          savePersisted();
          document.getElementById("wow-modalOverlay")?.classList.remove("open");
          startLevel();
        });
        list.appendChild(item);
      }
    }

    const bonusList = document.getElementById("wow-bonusList");
    if (bonusList) {
      bonusList.innerHTML = "";
      const arr = Array.from(state.bonusFound).sort((a, b) => a.localeCompare(b, "ru"));
      if (!arr.length) {
        const empty = document.createElement("div");
        empty.style.opacity = ".75";
        empty.textContent = "Пока нет бонусных слов";
        bonusList.appendChild(empty);
      } else {
        for (const w of arr) {
          const tag = document.createElement("div");
          tag.className = "wow-bonusTag";
          tag.textContent = w;
          bonusList.appendChild(tag);
        }
      }
    }
  }

  // -------------------- cleanup --------------------
  let offAll = [];
  function listen(el, ev, fn, opts) {
    el.addEventListener(ev, fn, opts);
    offAll.push(() => el.removeEventListener(ev, fn, opts));
  }

  function cleanupAll() {
    for (const off of offAll) off();
    offAll = [];
    cleanupWheelOnly();
    document.getElementById(styleId)?.remove();
  }

  // -------------------- Start level --------------------
  function startLevel() {
    const level = state.levels[state.levelIndex];

    state.foundWords = new Set();
    state.bonusFound = loadBonusPersisted(state.levelIndex);
    level._shuffled = level.letters;

    state.bonusAllForLevel = computeAllBonusForLevel(level);

    const crossword = buildCrossword(level.crossword);
    state.grid = crossword.grid;
    state.placements = crossword.placements;

    renderSkeleton();
    updateHeader();
    updateCoinsUI();

    renderGrid();
    renderWheel();
    setCurrentWord("");

    // кнопки под кольцом
    document.getElementById("wow-shuffle")?.addEventListener("click", shuffleLetters);
    document.getElementById("wow-hint")?.addEventListener("click", giveHint);

    listen(window, "resize", () => renderWheel(), { passive: true });

    renderModalContent();
  }

  // -------------------- Load dictionaries (optional) --------------------
  async function tryLoadDict(url) {
    try {
      const data = await loadJSON(url);
      return data;
    } catch {
      return null;
    }
  }

  function flattenStructuredDictionary(obj) {
    const out = [];
    if (!obj) return out;
    if (Array.isArray(obj.words)) out.push(...obj.words);
    for (const k of ["names", "places", "items", "concepts", "actions"]) {
      if (Array.isArray(obj[k])) out.push(...obj[k]);
    }
    return out.map(normWord).filter(w => w.length >= 3);
  }

  function normalizeExtra(obj) {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj.map(normWord).filter(w => w.length >= 3);
    if (Array.isArray(obj.words)) return obj.words.map(normWord).filter(w => w.length >= 3);
    return [];
  }

  // -------------------- Load levels and start --------------------
  container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";

  loadPersisted();

  (async () => {
    let data;
    try {
      data = await loadJSON(levelsUrl);
    } catch (e) {
      console.error(e);
      container.innerHTML = `
        <div style="padding:16px; text-align:center;">
          <p style="color:var(--wrong-color); font-weight:800;">❌ Не удалось загрузить уровни.</p>
          <p style="opacity:.9;">Проверь файл <b>${levelsUrl}</b>.</p>
          <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
        </div>
      `;
      return;
    }

    const rawLevels = (data && Array.isArray(data.levels)) ? data.levels : [];
    state.levels = rawLevels
      .map((l, idx) => {
        const letters = normWord(l.letters);
        const crossword = (l.crossword || l.words || []).map(normWord).filter(Boolean);
        const bonus = (l.bonus || []).map(normWord).filter(Boolean);

        return {
          id: l.id ?? (idx + 1),
          letters,
          crossword,
          bonus,
          crosswordSet: new Set(crossword),
          _completedOnce: false,
          _shuffled: letters
        };
      })
      .filter(l => l.letters.length >= 3 && l.crossword.length);

    if (!state.levels.length) {
      container.innerHTML = `
        <div style="padding:16px; text-align:center;">
          <p style="color:var(--wrong-color); font-weight:800;">❌ Уровни пустые.</p>
          <p style="opacity:.9;">В JSON должны быть <b>letters</b> и <b>words</b> (или <b>crossword</b>).</p>
          <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
        </div>
      `;
      return;
    }

    // dictionaries (optional)
    const base = String(levelsUrl || "").split("/").slice(0, -1).join("/");
    const candidatesMain = [
      "/data/bible_dictionary_structured.json",
      (base ? `${base}/bible_dictionary_structured.json` : "data/bible_dictionary_structured.json"),
      "data/bible_dictionary_structured.json",
    ];
    const candidatesExtra = [
      "/data/bible_extra_words.json",
      (base ? `${base}/bible_extra_words.json` : "data/bible_extra_words.json"),
      "data/bible_extra_words.json",
    ];

    let mainObj = null;
    for (const u of candidatesMain) {
      // eslint-disable-next-line no-await-in-loop
      mainObj = await tryLoadDict(u);
      if (mainObj) break;
    }

    let extraObj = null;
    for (const u of candidatesExtra) {
      // eslint-disable-next-line no-await-in-loop
      extraObj = await tryLoadDict(u);
      if (extraObj) break;
    }

    state.dictMain = new Set(flattenStructuredDictionary(mainObj));
    state.dictExtra = new Set(normalizeExtra(extraObj));

    state.levelIndex = clamp(state.levelIndex, 0, state.levels.length - 1);
    savePersisted();

    startLevel();
  })();
}
