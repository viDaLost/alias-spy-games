// games/bible-wow.js
// Visuals: Restored Original (Chips, Layout).
// Logic: Strict Grid Generation kept AS-IS (no empty cells / no touching lines).
// Features restored: prev/next level, level list modal, bonus list modal (current level only),
// shuffle, hint (10⭐), reveal word (25⭐), persistent progress, completion reward, bonus reward.
// Also: solved word reveals fully in crossword (no missing letters due to overlaps).

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
        gap: 10px;
        margin-bottom: 12px;
        flex-shrink: 0;
    }
    .wow-title {
        font-weight: 800;
        font-size: 18px;
        color: var(--accent-active, #d32f2f);
        text-align: center;
        white-space: nowrap;
    }
    .wow-pill { display:flex; gap:8px; align-items:center; }
    .wow-chip {
        background: var(--card-bg, #fff);
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 999px;
        padding: 7px 12px;
        font-size: 14px;
        box-shadow: 0 1px 3px rgba(0,0,0,.05);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        color: #333;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
    }
    .wow-chip:active { transform: scale(.99); }
    .wow-chip.disabled { opacity:.55; cursor:not-allowed; transform:none; }

    /* Board Area */
    .wow-board-area {
        flex-grow: 1;
        position: relative;
        overflow: auto;
        background: rgba(0,0,0,0.02);
        border-radius: 12px;
        margin-bottom: 15px;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 200px;
        padding: 20px;
    }
    .wow-grid { position: relative; margin: auto; }

    /* Grid Cells */
    .wow-cell {
        position: absolute;
        width: 36px;
        height: 36px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 20px;
        color: #333;
        transition: transform 0.3s, background 0.3s;
        z-index: 10;
    }
    .wow-cell.solved {
        background: var(--wow-accent);
        color: #fff;
        transform: scale(1.05);
    }
    .wow-cell.anim-pop { animation: popCell 0.4s ease-out; }
    @keyframes popCell {
        0% { transform: scale(0.5); opacity: 0; }
        70% { transform: scale(1.15); }
        100% { transform: scale(1); }
    }

    /* Controls & Wheel */
    .wow-controls {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 15px;
        padding-bottom: 10px;
    }
    .wow-preview {
        height: 36px;
        display: flex;
        gap: 6px;
        justify-content: center;
        margin-bottom: 5px;
        flex-wrap: wrap;
    }
    .wow-preview-let {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: #fff;
        border: 2px solid var(--wow-accent);
        color: var(--wow-accent);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 18px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .wow-wheel-wrap {
        position: relative;
        width: 250px;
        height: 250px;
        user-select: none;
        touch-action: none;
    }
    .wow-wheel-bg {
        position: absolute;
        inset: 10px;
        background: var(--card-bg, #fdfdfd);
        border-radius: 50%;
        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        border: 1px solid rgba(0,0,0,0.05);
    }

    .wow-btn-let {
        position: absolute;
        width: 50px;
        height: 50px;
        margin-left: -25px;
        margin-top: -25px;
        background: #fff;
        border-radius: 50%;
        box-shadow: 0 3px 6px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 22px;
        color: #444;
        cursor: pointer;
        transition: transform 0.1s;
        z-index: 10;
        user-select: none;
        -webkit-user-select: none;
    }
    .wow-btn-let.active {
        background: var(--wow-accent);
        color: #fff;
        transform: scale(1.15);
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    }

    .wow-line-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 5;
    }

    .wow-bonus-msg {
        position: absolute;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.85);
        color: #fff;
        padding: 10px 18px;
        border-radius: 30px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.25s;
        z-index: 100;
        white-space: nowrap;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .wow-bonus-msg.show { opacity: 1; }

    /* ---- Added (modals & small actions, styled to match chips) ---- */
    .wow-actions { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top: 2px; }
    .wow-modal {
      position: fixed; inset:0; background: rgba(0,0,0,.42);
      display:none; align-items:center; justify-content:center; padding:18px; z-index: 999;
      backdrop-filter: blur(4px);
    }
    .wow-modal.open { display:flex; }
    .wow-modal-card {
      width: min(520px, 92vw);
      max-height: min(70vh, 560px);
      overflow:auto;
      background: var(--card-bg, #fff);
      border: 1px solid rgba(0,0,0,.10);
      border-radius: 18px;
      box-shadow: 0 18px 46px rgba(0,0,0,.28);
      padding: 14px;
    }
    .wow-modal-top { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom: 10px; }
    .wow-modal-title { font-weight: 900; font-size: 16px; color: var(--accent-active, #d32f2f); }
    .wow-x {
      border:none; background:#fff; border:1px solid rgba(0,0,0,.10);
      width:40px; height:40px; border-radius: 14px; cursor:pointer;
      box-shadow: 0 10px 22px rgba(0,0,0,.12); font-weight: 900;
    }
    .wow-list { display:grid; gap:8px; }
    .wow-item {
      display:flex; align-items:center; justify-content:space-between; gap:10px;
      background:#fff; border:1px solid rgba(0,0,0,.10); border-radius: 16px; padding:12px 12px;
      box-shadow: 0 10px 22px rgba(0,0,0,.10); cursor:pointer;
    }
    .wow-item:active { transform: scale(.99); }
    .wow-muted { opacity:.75; font-size: 12px; }

    /* Hint-revealed single letters */
    .wow-cell.hinted{
        background: rgba(79,70,229,.10);
        color: var(--wow-accent);
    }

    /* Zoom controls for crossword */
    .wow-zoom{
        position:absolute;
        right: 12px;
        top: 12px;
        display:flex;
        gap:8px;
        z-index:150;
    }
    .wow-zoom .wow-chip{
        padding: 7px 10px;
        font-weight: 900;
        color: #fff;
        background: var(--wow-accent);
        border-color: rgba(0,0,0,.06);
    }

    /* Right side stack: stars over bonus button */
    .wow-rightCol{
        display:flex;
        flex-direction:column;
        gap:6px;
        align-items:flex-end;
    }
    .wow-stars{
        background: var(--wow-chip-bg, rgba(0,0,0,0.02));
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 13px;
        font-weight: 800;
        color: var(--wow-accent);
        box-shadow: 0 1px 3px rgba(0,0,0,.05);
        line-height: 1;
        user-select:none;
        -webkit-user-select:none;
    }

    /* Make action chips colored like app */
    .wow-chip.btn{
        background: var(--wow-accent);
        color: #fff;
        border-color: rgba(0,0,0,.06);
    }
    .wow-chip.btn:active{ transform: scale(.99); }
    .wow-chip.btn.disabled{
        opacity:.55;
        cursor:not-allowed;
        transform:none;
    }

    @media (max-width: 420px){
        .wow-chip{ padding: 6px 10px; font-size: 13px; }
        .wow-title{ font-size: 16px; }
    }

  `;
  document.head.appendChild(style);

  // -------------------- Persistence --------------------
  const LS_DATA = "bibleWowData_v5";         // { coins, levelIndex }
  const LS_COMPLETED = "bibleWowCompleted";  // [levelId]
  const LS_BONUS = "bibleWowBonusByLevel";   // { [levelId]: [words...] }

  function loadPersisted(st) {
    try {
      const raw = localStorage.getItem(LS_DATA);
      if (raw) {
        const d = JSON.parse(raw);
        st.coins = Number.isFinite(d.coins) ? d.coins : 0;
        st.levelIndex = Number.isFinite(d.levelIndex) ? d.levelIndex : 0;
      }
    } catch {}
    try {
      const raw = localStorage.getItem(LS_COMPLETED);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) st.completed = new Set(arr.map(Number).filter(Number.isFinite));
    } catch {}
    try {
      const raw = localStorage.getItem(LS_BONUS);
      const obj = raw ? JSON.parse(raw) : {};
      st.bonusByLevel = (obj && typeof obj === "object") ? obj : {};
    } catch {
      st.bonusByLevel = {};
    }
  }

  function savePersisted(st) {
    try {
      localStorage.setItem(LS_DATA, JSON.stringify({ coins: st.coins, levelIndex: st.levelIndex }));
    } catch {}
    try {
      localStorage.setItem(LS_COMPLETED, JSON.stringify(Array.from(st.completed || new Set())));
    } catch {}
    try {
      localStorage.setItem(LS_BONUS, JSON.stringify(st.bonusByLevel || {}));
    } catch {}
  }

  // -------------------- State --------------------
  const st = {
    levels: [],
    levelIndex: 0,
    currLevel: null,

    foundWords: new Set(),
    completed: new Set(),
    bonusByLevel: {},

    bonusWordsFound: new Set(), // found bonus words for current level
    bonusAll: new Set(),        // allowed bonus words for current level

    coins: 0,

    gridInfo: [], // [{word, r, c, dr, dc}]

    inputPath: [],
    inputWord: "",

    _wheelHandlers: null,

    zoom: 1,
    hintedCells: new Set() // absolute cell keys "r,c" in virtual coordinates
  };

  function normWord(w) {
    return String(w || "")
      .toUpperCase()
      .replace(/Ё/g, "Е")
      .trim()
      .replace(/[^А-Я]/g, "");
  }

  // -------------------- STRICT GRID GENERATION (DO NOT CHANGE) --------------------
  function canPlaceWord(grid, word, r, c, dr, dc) {
    const len = word.length;
    if (r < 0 || c < 0 || r + dr * len > 40 || c + dc * len > 40) return false;

    for (let i = 0; i < len; i++) {
      const cr = r + dr * i;
      const cc = c + dc * i;
      const cell = grid[cr][cc];

      if (cell) {
        if (cell !== word[i]) return false;
      } else {
        const neighbors = [
          { nr: cr + 1, nc: cc }, { nr: cr - 1, nc: cc },
          { nr: cr, nc: cc + 1 }, { nr: cr, nc: cc - 1 }
        ];

        for (const n of neighbors) {
          if (n.nr === cr - dr && n.nc === cc - dc) continue;
          if (n.nr === cr + dr && n.nc === cc + dc) continue;
          if (grid[n.nr] && grid[n.nr][n.nc]) return false;
        }
      }
    }
    return true;
  }

  function placeWord(grid, word, r, c, dr, dc) {
    for (let i = 0; i < word.length; i++) {
      grid[r + dr * i][c + dc * i] = word[i];
    }
  }

  function generateLayout(words) {
    const sorted = [...words].sort((a, b) => b.length - a.length);
    const gridSize = 40;
    const center = 20;

    const grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));
    const placedWords = [];

    if (sorted.length > 0) {
      const w = sorted[0];
      const dir = Math.random() > 0.5 ? 0 : 1;
      const dr = dir === 0 ? 0 : 1;
      const dc = dir === 0 ? 1 : 0;
      const sr = center - Math.floor((dr * w.length) / 2);
      const sc = center - Math.floor((dc * w.length) / 2);

      placeWord(grid, w, sr, sc, dr, dc);
      placedWords.push({ word: w, r: sr, c: sc, dr, dc });
    }

    const remaining = sorted.slice(1);
    let changed = true;

    while (changed && remaining.length > 0) {
      changed = false;
      for (let i = 0; i < remaining.length; i++) {
        const w = remaining[i];
        let placed = false;

        for (let j = 0; j < w.length; j++) {
          if (placed) break;
          const letter = w[j];

          for (const pw of placedWords) {
            if (placed) break;
            for (let k = 0; k < pw.word.length; k++) {
              if (pw.word[k] === letter) {
                const interR = pw.r + pw.dr * k;
                const interC = pw.c + pw.dc * k;
                const newDr = pw.dr === 0 ? 1 : 0;
                const newDc = pw.dc === 0 ? 1 : 0;
                const startR = interR - newDr * j;
                const startC = interC - newDc * j;

                if (canPlaceWord(grid, w, startR, startC, newDr, newDc)) {
                  placeWord(grid, w, startR, startC, newDr, newDc);
                  placedWords.push({ word: w, r: startR, c: startC, dr: newDr, dc: newDc });
                  remaining.splice(i, 1);
                  i--;
                  placed = true;
                  changed = true;
                  break;
                }
              }
            }
          }
        }
      }
    }

    return { placed: placedWords, notPlaced: remaining };
  }
  // -------------------- end of strict generator --------------------

  // -------------------- Helpers --------------------
  function showMsg(text) {
    const msg = document.getElementById("wow-bonus-msg");
    if (!msg) return;
    msg.textContent = text;
    msg.classList.add("show");
    setTimeout(() => msg.classList.remove("show"), 1400);
  }

  function setChipDisabled(el, disabled) {
    if (!el) return;
    el.classList.toggle("disabled", !!disabled);
  }


  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function hexToRgb(hex){
    let h = String(hex || '').trim();
    if (!h) return [79,70,229];
    if (h.startsWith('rgb')) {
      const m = h.match(/rgba?\(([^)]+)\)/i);
      if (m) {
        const parts = m[1].split(',').map(s => parseFloat(s.trim())).filter(n => Number.isFinite(n));
        return [parts[0]||79, parts[1]||70, parts[2]||229].map(x=>Math.round(x));
      }
      return [79,70,229];
    }
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3) h = h.split('').map(ch=>ch+ch).join('');
    if (h.length !== 6) return [79,70,229];
    const n = parseInt(h,16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }

  function applyZoom(){
    const gridEl = document.getElementById('wow-grid');
    if (!gridEl) return;
    const z = clamp(st.zoom || 1, 0.6, 2.2);
    st.zoom = z;
    gridEl.style.transform = `scale(${z})`;
    gridEl.style.transformOrigin = 'center center';
  }

  function changeZoom(delta){
    st.zoom = clamp((st.zoom || 1) + delta, 0.6, 2.2);
    applyZoom();
  }


  // -------------------- UI Render --------------------
  function renderGame() {
    const lvl = st.currLevel;
    container.innerHTML = `
      <div class="wow-wrap">
        <div class="wow-top">
           <div class="wow-pill">
             <div class="wow-chip btn" id="wow-menu">⬅ Меню</div>
           </div>

           <div class="wow-pill">
             <div class="wow-chip btn" id="wow-prev">◀</div>
             <div class="wow-title" id="wow-title">Уровень ${lvl ? lvl.id : ""}</div>
             <div class="wow-chip btn" id="wow-next">▶</div>
           </div>

           <div class="wow-pill">
             <div class="wow-rightCol">
               <div class="wow-stars">⭐ <span id="wow-score">${st.coins}</span></div>
               <div class="wow-chip btn" id="wow-bonus-open">Бонус: <span id="wow-bonus-count">${st.bonusWordsFound.size}</span></div>
             </div>
             <div class="wow-chip btn" id="wow-levels-open">≡</div>
           </div>
        </div>

        <div class="wow-board-area" id="wow-board-area">
           <div class="wow-zoom">
             <div class="wow-chip" id="wow-zoom-out">−</div>
             <div class="wow-chip" id="wow-zoom-in">＋</div>
           </div>
           <div class="wow-grid" id="wow-grid"></div>
           <div class="wow-bonus-msg" id="wow-bonus-msg"></div>
        </div>

        <div class="wow-controls">
           <div class="wow-preview" id="wow-preview"></div>

           <div class="wow-actions">
             <div class="wow-chip btn" id="wow-shuffle">⟲ Перемешать</div>
             <div class="wow-chip btn" id="wow-hint">💡 Подсказка (6⭐)</div>
             <div class="wow-chip btn" id="wow-reveal">👁 Слово (20⭐)</div>
           </div>

           <div class="wow-wheel-wrap" id="wow-wheel">
              <div class="wow-wheel-bg"></div>
              <canvas class="wow-line-canvas" id="wow-canvas"></canvas>
           </div>
        </div>

        <!-- Levels modal -->
        <div class="wow-modal" id="wow-levels-modal" aria-hidden="true">
          <div class="wow-modal-card" role="dialog" aria-label="Уровни">
            <div class="wow-modal-top">
              <div class="wow-modal-title">Уровни</div>
              <button class="wow-x" id="wow-levels-close">✕</button>
            </div>
            <div class="wow-muted" style="margin:0 0 10px;">Нажми, чтобы перейти.</div>
            <div class="wow-list" id="wow-levels-list"></div>
          </div>
        </div>

        <!-- Bonus modal -->
        <div class="wow-modal" id="wow-bonus-modal" aria-hidden="true">
          <div class="wow-modal-card" role="dialog" aria-label="Бонусные слова">
            <div class="wow-modal-top">
              <div class="wow-modal-title">Бонусные слова уровня</div>
              <button class="wow-x" id="wow-bonus-close">✕</button>
            </div>
            <div class="wow-muted" style="margin:0 0 10px;">Засчитанные бонусы этого уровня. За каждое +2⭐ один раз.</div>
            <div class="wow-list" id="wow-bonus-list"></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById("wow-menu")?.addEventListener("click", () => {
      cleanupAll();
      goToMainMenu();
    });

    document.getElementById("wow-prev")?.addEventListener("click", () => {
      if (st.levelIndex <= 0) return;
      st.levelIndex--;
      savePersisted(st);
      startLevel();
    });
    document.getElementById("wow-next")?.addEventListener("click", () => {
      if (st.levelIndex >= st.levels.length - 1) return;
      st.levelIndex++;
      savePersisted(st);
      startLevel();
    });

    document.getElementById("wow-shuffle")?.addEventListener("click", () => {
      shuffleLetters();
      renderWheel();
    });

    document.getElementById("wow-zoom-in")?.addEventListener("click", () => changeZoom(0.1));
    document.getElementById("wow-zoom-out")?.addEventListener("click", () => changeZoom(-0.1));


    document.getElementById("wow-hint")?.addEventListener("click", () => giveHint());
    document.getElementById("wow-reveal")?.addEventListener("click", () => revealWordPaid());

    const levelsModal = document.getElementById("wow-levels-modal");
    const bonusModal = document.getElementById("wow-bonus-modal");
    const openModal = (m) => m?.classList.add("open");
    const closeModal = (m) => m?.classList.remove("open");

    document.getElementById("wow-levels-open")?.addEventListener("click", () => {
      renderLevelsList();
      openModal(levelsModal);
    });
    document.getElementById("wow-levels-close")?.addEventListener("click", () => closeModal(levelsModal));
    levelsModal?.addEventListener("pointerdown", (e) => { if (e.target === levelsModal) closeModal(levelsModal); }, { passive: true });

    document.getElementById("wow-bonus-open")?.addEventListener("click", () => {
      renderBonusList();
      openModal(bonusModal);
    });
    document.getElementById("wow-bonus-close")?.addEventListener("click", () => closeModal(bonusModal));
    bonusModal?.addEventListener("pointerdown", (e) => { if (e.target === bonusModal) closeModal(bonusModal); }, { passive: true });

    updateChips();
    renderGrid();
    renderWheel();
    updatePreview();
  }

  function updateChips() {
    const prev = document.getElementById("wow-prev");
    const next = document.getElementById("wow-next");
    setChipDisabled(prev, st.levelIndex <= 0);
    setChipDisabled(next, st.levelIndex >= st.levels.length - 1);

    const hint = document.getElementById("wow-hint");
    const reveal = document.getElementById("wow-reveal");
    setChipDisabled(hint, st.coins < 6);
    setChipDisabled(reveal, st.coins < 20);

    const score = document.getElementById("wow-score");
    if (score) score.textContent = String(st.coins);
    const bc = document.getElementById("wow-bonus-count");
    if (bc) bc.textContent = String(st.bonusWordsFound.size);
  }

  function renderLevelsList() {
    const box = document.getElementById("wow-levels-list");
    if (!box) return;
    box.innerHTML = "";
    for (let i = 0; i < st.levels.length; i++) {
      const lvl = st.levels[i];
      const done = st.completed.has(Number(lvl.id));
      const row = document.createElement("div");
      row.className = "wow-item";
      row.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;">
          <div class="wow-chip" style="padding:6px 10px;cursor:default;">${done ? "✓" : "•"}</div>
          <div>
            <div style="font-weight:900;">Уровень ${i + 1}</div>
            <div class="wow-muted">${done ? "пройден" : ""}</div>
          </div>
        </div>
        <div class="wow-muted">ID ${lvl.id}</div>
      `;
      row.addEventListener("click", () => {
        st.levelIndex = i;
        savePersisted(st);
        document.getElementById("wow-levels-modal")?.classList.remove("open");
        startLevel();
      });
      box.appendChild(row);
    }
  }

  function renderBonusList() {
    const box = document.getElementById("wow-bonus-list");
    if (!box) return;
    const arr = Array.from(st.bonusWordsFound).sort((a, b) => a.localeCompare(b, "ru"));
    if (!arr.length) {
      box.innerHTML = `<div class="wow-muted" style="padding:10px;">Пока нет бонусных слов на этом уровне.</div>`;
      return;
    }
    box.innerHTML = "";
    for (const w of arr) {
      const row = document.createElement("div");
      row.className = "wow-item";
      row.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;">
          <div class="wow-chip" style="padding:6px 10px;cursor:default;">+2⭐</div>
          <div style="font-weight:900;letter-spacing:.4px;">${w}</div>
        </div>
        <div class="wow-muted">бонус</div>
      `;
      box.appendChild(row);
    }
  }

  // -------------------- Grid rendering (FIX: show full solved words even with overlaps) --------------------
  function renderGrid() {
    const gridEl = document.getElementById("wow-grid");
    if (!gridEl) return;
    gridEl.innerHTML = "";

    const layout = st.gridInfo || [];
    if (!layout.length) return;

    let minR = 100, maxR = -100, minC = 100, maxC = -100;
    layout.forEach(item => {
      const endR = item.r + item.dr * (item.word.length - 1);
      const endC = item.c + item.dc * (item.word.length - 1);
      minR = Math.min(minR, item.r, endR);
      maxR = Math.max(maxR, item.r, endR);
      minC = Math.min(minC, item.c, endC);
      maxC = Math.max(maxC, item.c, endC);
    });

    const rows = maxR - minR + 1;
    const cols = maxC - minC + 1;
    const cellSize = 40;

    gridEl.style.width = (cols * cellSize) + "px";
    gridEl.style.height = (rows * cellSize) + "px";
    applyZoom();

    const cellMap = new Map(); // key -> {letter, solved:boolean}
    for (const wObj of layout) {
      const solvedWord = st.foundWords.has(wObj.word);
      for (let i = 0; i < wObj.word.length; i++) {
        const r = (wObj.r + wObj.dr * i) - minR;
        const c = (wObj.c + wObj.dc * i) - minC;
        const key = `${r},${c}`;
        const letter = wObj.word[i];

        const prev = cellMap.get(key);
        if (!prev) {
          cellMap.set(key, { letter, solved: !!solvedWord });
        } else {
          prev.solved = prev.solved || !!solvedWord;
        }
      }
    }

    for (const [key, data] of cellMap.entries()) {
      const [r, c] = key.split(",").map(Number);
      const cell = document.createElement("div");
      cell.className = "wow-cell";
      cell.style.top = (r * cellSize) + "px";
      cell.style.left = (c * cellSize) + "px";

      const absR = r + minR;
      const absC = c + minC;
      const absKey = `${absR},${absC}`;

      if (data.solved) {
        cell.textContent = data.letter;
        cell.classList.add("solved");
        cell.classList.add("anim-pop");
      } else if (st.hintedCells && st.hintedCells.has(absKey)) {
        cell.textContent = data.letter;
        cell.classList.add("hinted");
      } else {
        cell.textContent = "";
      }

      gridEl.appendChild(cell);
    }
  }

  // -------------------- Wheel + input --------------------
  function shuffleLetters() {
    const lvl = st.currLevel;
    const arr = lvl.letters.split("");
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    lvl._shuffled = arr.join("");
  }

  function renderWheel() {
    const wheel = document.getElementById("wow-wheel");
    if (!wheel) return;

    wheel.querySelectorAll(".wow-btn-let").forEach(b => b.remove());

    const lettersStr = st.currLevel._shuffled || st.currLevel.letters;
    const letters = lettersStr.split("");
    const count = letters.length;
    const radius = 90;
    const center = 125;

    letters.forEach((l, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);

      const btn = document.createElement("div");
      btn.className = "wow-btn-let";
      btn.textContent = l;
      btn.style.left = x + "px";
      btn.style.top = y + "px";
      btn.dataset.idx = String(i);
      btn.dataset.letter = l;

      wheel.appendChild(btn);
    });

    attachWheelHandlers();
  }

  function updatePreview() {
    const p = document.getElementById("wow-preview");
    if (!p) return;
    p.innerHTML = "";
    if (!st.inputWord) return;
    for (const ch of st.inputWord) {
      const d = document.createElement("div");
      d.className = "wow-preview-let";
      d.textContent = ch;
      p.appendChild(d);
    }
  }

  function clearCanvas() {
    const canvas = document.getElementById("wow-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = 250;
    canvas.height = 250;
    ctx.clearRect(0, 0, 250, 250);
  }

  function drawLines(extraPoint) {
    const canvas = document.getElementById("wow-canvas");
    const wheel = document.getElementById("wow-wheel");
    if (!canvas || !wheel) return;
    const ctx = canvas.getContext("2d");
    canvas.width = 250;
    canvas.height = 250;
    ctx.clearRect(0, 0, 250, 250);

    if (st.inputPath.length < 1) return;

    const btns = Array.from(document.querySelectorAll(".wow-btn-let"));
    const wheelRect = wheel.getBoundingClientRect();

    const coords = [];
    for (const b of btns) {
      const rect = b.getBoundingClientRect();
      const idx = parseInt(b.dataset.idx, 10);
      coords[idx] = {
        x: rect.left - wheelRect.left + rect.width / 2,
        y: rect.top - wheelRect.top + rect.height / 2
      };
    }

    const path = st.inputPath.map(idx => coords[idx]).filter(Boolean);
    if (extraPoint) path.push(extraPoint);
    if (path.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent-active') || '').trim();
    ctx.strokeStyle = accent ? `rgba(${hexToRgb(accent).join(',')}, 0.45)` : "rgba(79, 70, 229, 0.45)";
    ctx.stroke();
  }

  function attachWheelHandlers() {
    const wheel = document.getElementById("wow-wheel");
    if (!wheel) return;

    detachWheelHandlers();

    const btns = Array.from(document.querySelectorAll(".wow-btn-let"));

    function btnByPoint(clientX, clientY) {
      const el = document.elementFromPoint(clientX, clientY);
      const btn = el && el.closest ? el.closest(".wow-btn-let") : null;
      if (btn) return btn;

      const best = { b: null, d: Infinity };
      for (const b of btns) {
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.hypot(clientX - cx, clientY - cy);
        if (d < best.d && d < Math.max(r.width, r.height) * 0.75) {
          best.b = b; best.d = d;
        }
      }
      return best.b;
    }

    function startAt(btn) {
      if (!btn) return;
      st.inputPath = [];
      st.inputWord = "";
      clearCanvas();
      btns.forEach(b => b.classList.remove("active"));

      const idx = parseInt(btn.dataset.idx, 10);
      st.inputPath.push(idx);
      st.inputWord += btn.dataset.letter;
      btn.classList.add("active");
      updatePreview();
    }

    function addBtn(btn) {
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      if (st.inputPath.includes(idx)) return;
      st.inputPath.push(idx);
      st.inputWord += btn.dataset.letter;
      btn.classList.add("active");
      updatePreview();
    }

    function endInput() {
      if (!st.inputPath.length) return;
      const word = st.inputWord;

      st.inputPath = [];
      st.inputWord = "";
      updatePreview();
      clearCanvas();
      btns.forEach(b => b.classList.remove("active"));

      checkWord(word);
    }

    const onPointerDown = (e) => {
      e.preventDefault();
      wheel.setPointerCapture?.(e.pointerId);
      const btn = btnByPoint(e.clientX, e.clientY);
      startAt(btn);
    };
    const onPointerMove = (e) => {
      if (!st.inputPath.length) return;
      e.preventDefault();
      const btn = btnByPoint(e.clientX, e.clientY);
      if (btn) addBtn(btn);

      const wheelRect = wheel.getBoundingClientRect();
      drawLines({ x: e.clientX - wheelRect.left, y: e.clientY - wheelRect.top });
    };
    const onPointerUp = (e) => { e.preventDefault(); endInput(); };
    const onPointerCancel = (e) => { e.preventDefault(); endInput(); };

    wheel.addEventListener("pointerdown", onPointerDown, { passive: false });
    wheel.addEventListener("pointermove", onPointerMove, { passive: false });
    wheel.addEventListener("pointerup", onPointerUp, { passive: false });
    wheel.addEventListener("pointercancel", onPointerCancel, { passive: false });

    st._wheelHandlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
  }

  function detachWheelHandlers() {
    const wheel = document.getElementById("wow-wheel");
    if (!wheel) return;
    const h = st._wheelHandlers;
    if (!h) return;
    wheel.removeEventListener("pointerdown", h.onPointerDown);
    wheel.removeEventListener("pointermove", h.onPointerMove);
    wheel.removeEventListener("pointerup", h.onPointerUp);
    wheel.removeEventListener("pointercancel", h.onPointerCancel);
    st._wheelHandlers = null;
  }

  // -------------------- Word checking / rewards --------------------
  function checkWord(wordRaw) {
    const word = normWord(wordRaw);
    if (word.length < 3) return;

    const targetSet = new Set(st.currLevel.words);

    if (targetSet.has(word)) {
      if (st.foundWords.has(word)) { showMsg("Уже найдено!"); return; }

      st.foundWords.add(word);
      showMsg("Отлично!");
      renderGrid();

      if (isLevelCompleted()) {
        const levelId = Number(st.currLevel.id);
        if (!st.completed.has(levelId)) {
          st.completed.add(levelId);
          st.coins += 10;
          showMsg("Уровень пройден! +10⭐");
        } else {
          showMsg("Уровень пройден!");
        }
        savePersisted(st);
        updateChips();

        setTimeout(() => {
          if (st.levelIndex < st.levels.length - 1) {
            st.levelIndex++;
            savePersisted(st);
            startLevel();
          }
        }, 450);
      } else {
        savePersisted(st);
        updateChips();
      }
      return;
    }

    if (st.bonusAll.has(word)) {
      if (st.bonusWordsFound.has(word)) { showMsg("Уже в бонусах"); return; }
      st.bonusWordsFound.add(word);

      const lid = String(st.currLevel.id);
      st.bonusByLevel[lid] = Array.from(new Set([...(st.bonusByLevel[lid] || []), word]));

      st.coins += 2;
      showMsg("Бонус! +2⭐");
      savePersisted(st);
      updateChips();
      return;
    }

    showMsg("Нет такого слова");
  }

  function isLevelCompleted() {
    for (const w of st.currLevel.words) {
      if (!st.foundWords.has(w)) return false;
    }
    return true;
  }

  function giveHint() {
    if (st.coins < 6) { showMsg("Нужно 6⭐"); return; }

    // Find a word with at least one unrevealed cell
    const remaining = st.currLevel.words.filter(w => !st.foundWords.has(w));
    if (!remaining.length) { showMsg("Всё найдено"); return; }

    const candidates = [];
    for (const w of remaining) {
      const p = st.gridInfo.find(x => x.word === w);
      if (!p) continue;
      for (let i = 0; i < w.length; i++) {
        const ar = p.r + p.dr * i;
        const ac = p.c + p.dc * i;
        const k = `${ar},${ac}`;
        if (!st.hintedCells.has(k)) candidates.push({ key: k, letter: w[i], word: w });
      }
    }
    if (!candidates.length) { showMsg("Нет букв для подсказки"); return; }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    st.coins -= 6;
    st.hintedCells.add(pick.key);

    showMsg(`💡 Открыта буква: ${pick.letter}`);
    savePersisted(st);
    renderGrid();
    updateChips();
  }

  function revealWordPaid() {
    if (st.coins < 20) { showMsg("Нужно 20⭐"); return; }
    const remaining = st.currLevel.words.filter(w => !st.foundWords.has(w));
    if (!remaining.length) { showMsg("Всё найдено"); return; }
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    st.coins -= 20;
    st.foundWords.add(pick);

    // remove hinted cells of that word (optional, but keeps state clean)
    const p = st.gridInfo.find(x => x.word === pick);
    if (p) {
      for (let i = 0; i < pick.length; i++) {
        const k = `${p.r + p.dr * i},${p.c + p.dc * i}`;
        st.hintedCells.delete(k);
      }
    }

    showMsg(`👁 Открыто: ${pick}`);
    savePersisted(st);
    renderGrid();
    updateChips();
  }

  // -------------------- Level setup --------------------
  function buildBonusSetForLevel(rawLevel, placedWords, notPlaced) {
    const fromFile =
      (Array.isArray(rawLevel.bonusWords) ? rawLevel.bonusWords :
      (Array.isArray(rawLevel.bonus) ? rawLevel.bonus : []))
      .map(normWord)
      .filter(w => w.length >= 3);

    const auto = (notPlaced || []).map(normWord).filter(w => w.length >= 3);

    const crosswordSet = new Set(placedWords.map(x => x.word));
    const bonus = new Set();
    for (const w of fromFile.concat(auto)) {
      if (!crosswordSet.has(w)) bonus.add(w);
    }
    return bonus;
  }

  function startLevel() {
    detachWheelHandlers();

    if (st.levelIndex >= st.levels.length) st.levelIndex = 0;

    const rawLevel = st.levels[st.levelIndex];
    const letters = normWord(rawLevel.letters);

    const rawGridWords = (rawLevel.words || []).map(normWord).filter(w => w.length >= 3);

    const layoutResult = generateLayout(rawGridWords);

    st.gridInfo = layoutResult.placed;

    const placedSet = new Set(st.gridInfo.map(x => x.word));
    const levelWords = Array.from(placedSet);

    st.bonusAll = buildBonusSetForLevel(rawLevel, st.gridInfo, layoutResult.notPlaced);

    const lid = String(rawLevel.id);
    const saved = Array.isArray(st.bonusByLevel[lid]) ? st.bonusByLevel[lid].map(normWord) : [];
    st.bonusWordsFound = new Set(saved.filter(w => st.bonusAll.has(w)));

    st.foundWords = new Set();
    st.hintedCells = new Set();

    st.currLevel = { id: rawLevel.id, letters, words: levelWords, _shuffled: letters };

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
        <div style="padding:16px; text-align:center;">
          <p style="color:#ffb3b3; font-weight:700;">❌ Не удалось загрузить уровни.</p>
          <p style="opacity:.9;">Проверь файл уровней.</p>
          <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
        </div>
      `;
    });
}
