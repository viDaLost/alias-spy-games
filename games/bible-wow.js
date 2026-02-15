// games/bible-wow.js
// Visuals: Restored Original (Chips, Layout).
// Logic: Corrected (Strict Grid + Auto-Bonus).

/* global loadJSON, goToMainMenu */

function startBibleWowGame(levelsUrl) {
  const container = document.getElementById("game-container");
  if (!container) return;

  // ---- Styles: Restored to match original aesthetic ----
  const styleId = "bible-wow-style";
  const oldStyle = document.getElementById(styleId);
  if (oldStyle) oldStyle.remove();
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    /* Main Layout */
    .wow-wrap {
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
    }
    .wow-pill {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    .wow-chip {
        background: var(--card-bg, #fff);
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 999px;
        padding: 7px 12px;
        font-size: 14px;
        box-shadow: 0 1px 3px rgba(0,0,0,.05);
        display: flex;
        align-items: center;
        gap: 5px;
        font-weight: 600;
        color: #333;
        cursor: pointer;
    }
    
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
    .wow-grid {
        position: relative;
        margin: auto;
    }
    
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
        background: var(--accent, #ff9800);
        color: #fff;
        transform: scale(1.05);
    }
    .wow-cell.anim-pop {
        animation: popCell 0.4s ease-out;
    }
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
    }
    .wow-preview-let {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: #fff;
        border: 2px solid var(--accent, #ff9800);
        color: var(--accent, #ff9800);
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
    }
    .wow-btn-let.active {
        background: var(--accent, #ff9800);
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
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.85);
        color: #fff;
        padding: 12px 24px;
        border-radius: 30px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.4s;
        z-index: 100;
        white-space: nowrap;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .wow-bonus-msg.show { opacity: 1; }
  `;
  document.head.appendChild(style);

  // State
  const state = {
    levels: [],
    levelIndex: 0,
    currLevel: null,
    foundWords: new Set(),
    bonusWordsFound: new Set(),
    coins: 0,
    gridInfo: null, // { word, r, c, dr, dc }
    inputPath: [], // indices of letters
    inputWord: ""
  };

  // --- Logic: Strict Grid Generation (FIXED) ---

  // Проверка: можно ли поставить слово.
  // Правило: Слова пересекаются только по одинаковым буквам.
  // Соседние клетки должны быть абсолютно пустыми (никаких касаний боками).
  function canPlaceWord(grid, word, r, c, dr, dc) {
    const len = word.length;
    if (r < 0 || c < 0 || r + dr * len > 40 || c + dc * len > 40) return false;

    for (let i = 0; i < len; i++) {
      const cr = r + dr * i;
      const cc = c + dc * i;
      const cell = grid[cr][cc];
      
      if (cell) {
        if (cell !== word[i]) return false; // Конфликт букв
      } else {
        // Strict Isolation: Check neighbors
        const neighbors = [
          {nr: cr+1, nc: cc}, {nr: cr-1, nc: cc},
          {nr: cr, nc: cc+1}, {nr: cr, nc: cc-1}
        ];

        for (const n of neighbors) {
            // Игнорируем предыдущую и следующую клетку текущего слова
            if (n.nr === cr - dr && n.nc === cc - dc) continue;
            if (n.nr === cr + dr && n.nc === cc + dc) continue;
            
            // Если сосед существует и занят -> это касание боком. Запрещено.
            if (grid[n.nr] && grid[n.nr][n.nc]) {
                return false;
            }
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
    // Сортируем: длинные первыми
    const sorted = [...words].sort((a, b) => b.length - a.length);
    
    // Grid 40x40 (виртуальная)
    const gridSize = 40;
    const center = 20;
    
    const grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));
    const placedWords = []; 

    // 1. Ставим первое слово в центр
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

    // 2. Пытаемся пристроить остальные
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

  // --- Helpers ---
  function normWord(w) { return w.toUpperCase().replace(/Ё/g, "Е").replace(/Й/g, "И").trim(); }

  // --- Main Render ---
  function renderGame() {
    container.innerHTML = `
      <div class="wow-wrap">
        <div class="wow-top">
           <div class="wow-pill" onclick="goToMainMenu()" style="cursor:pointer">
             <div class="wow-chip" style="padding-left:12px">⬅ Меню</div>
           </div>
           <div class="wow-title">Уровень ${state.currLevel.id}</div>
           <div class="wow-pill">
             <div class="wow-chip">⭐ <span id="wow-score">${state.coins}</span></div>
             <div class="wow-chip">Бонус: <span id="wow-bonus-count">${state.bonusWordsFound.size}</span></div>
           </div>
        </div>

        <div class="wow-board-area" id="wow-board-area">
           <div class="wow-grid" id="wow-grid"></div>
           <div class="wow-bonus-msg" id="wow-bonus-msg"></div>
        </div>

        <div class="wow-controls">
           <div class="wow-preview" id="wow-preview"></div>
           <div class="wow-wheel-wrap" id="wow-wheel">
              <div class="wow-wheel-bg"></div>
              <canvas class="wow-line-canvas" id="wow-canvas"></canvas>
              </div>
        </div>
      </div>
    `;

    renderGrid();
    renderWheel();
  }

  function renderGrid() {
    const gridEl = document.getElementById("wow-grid");
    if(!gridEl) return;
    gridEl.innerHTML = "";
    
    const layout = state.gridInfo;
    if (!layout || layout.length === 0) return;

    let minR=100, maxR=-100, minC=100, maxC=-100;
    layout.forEach(item => {
        const endR = item.r + item.dr * (item.word.length - 1);
        const endC = item.c + item.dc * (item.word.length - 1);
        minR = Math.min(minR, item.r);
        maxR = Math.max(maxR, endR);
        minC = Math.min(minC, item.c);
        maxC = Math.max(maxC, endC);
    });

    const rows = maxR - minR + 1;
    const cols = maxC - minC + 1;
    const cellSize = 40; // Чуть больше для визуальной красоты

    gridEl.style.width = (cols * cellSize) + "px";
    gridEl.style.height = (rows * cellSize) + "px";

    layout.forEach(wObj => {
      const isFound = state.foundWords.has(wObj.word);
      for (let i = 0; i < wObj.word.length; i++) {
        const r = wObj.r + wObj.dr * i - minR;
        const c = wObj.c + wObj.dc * i - minC;
        const letter = wObj.word[i];
        
        const cellId = `c-${r}-${c}`;
        let cell = document.getElementById(cellId);
        
        if (!cell) {
          cell = document.createElement("div");
          cell.id = cellId;
          cell.className = "wow-cell";
          cell.style.top = (r * cellSize) + "px";
          cell.style.left = (c * cellSize) + "px";
          gridEl.appendChild(cell);
        }
        
        if (isFound) {
            cell.textContent = letter;
            cell.classList.add("solved");
            cell.classList.add("anim-pop");
        } else {
            cell.textContent = "";
            cell.classList.remove("solved");
            cell.classList.remove("anim-pop");
        }
      }
    });
  }

  function renderWheel() {
    const wheel = document.getElementById("wow-wheel");
    if(!wheel) return;
    
    const oldBtns = wheel.querySelectorAll(".wow-btn-let");
    oldBtns.forEach(b => b.remove());

    const letters = state.currLevel.letters.split("");
    const count = letters.length;
    const radius = 90; 
    const center = 125; // center of 250px container

    letters.forEach((l, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      
      const btn = document.createElement("div");
      btn.className = "wow-btn-let";
      btn.textContent = l;
      btn.style.left = x + "px";
      btn.style.top = y + "px";
      btn.dataset.idx = i;
      
      const handleStart = (e) => {
          e.preventDefault();
          startInput(i);
      };
      
      btn.addEventListener("mousedown", handleStart);
      btn.addEventListener("touchstart", handleStart, {passive: false});
      
      wheel.appendChild(btn);
    });

    const moveHandler = (e) => {
        if (!state.inputPath.length) return;
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (el && el.classList.contains("wow-btn-let")) {
            const idx = parseInt(el.dataset.idx);
            addToInput(idx);
        }
    };
    
    const endHandler = (e) => {
        if (!state.inputPath.length) return;
        checkWord();
        state.inputPath = [];
        state.inputWord = "";
        updatePreview();
        clearCanvas();
        document.querySelectorAll(".wow-btn-let").forEach(b => b.classList.remove("active"));
    };

    wheel.addEventListener("mousemove", moveHandler);
    wheel.addEventListener("touchmove", moveHandler, {passive: false});
    document.addEventListener("mouseup", endHandler);
    document.addEventListener("touchend", endHandler);
  }

  // --- Input Logic ---
  function startInput(idx) {
    state.inputPath = [idx];
    state.inputWord = state.currLevel.letters[idx];
    updatePreview();
    highlightBtn(idx);
  }

  function addToInput(idx) {
    if (state.inputPath.includes(idx)) return;
    
    state.inputPath.push(idx);
    state.inputWord += state.currLevel.letters[idx];
    highlightBtn(idx);
    updatePreview();
    drawLines();
  }

  function highlightBtn(idx) {
      const btns = document.querySelectorAll(".wow-btn-let");
      btns.forEach(b => {
          if (parseInt(b.dataset.idx) === idx) b.classList.add("active");
      });
  }

  function updatePreview() {
      const p = document.getElementById("wow-preview");
      if(!p) return;
      p.innerHTML = state.inputWord.split("").map(l => `<div class="wow-preview-let">${l}</div>`).join("");
  }

  function drawLines() {
      const canvas = document.getElementById("wow-canvas");
      if(!canvas) return;
      const ctx = canvas.getContext("2d");
      canvas.width = 250;
      canvas.height = 250;
      ctx.clearRect(0,0,250,250);
      
      if (state.inputPath.length < 2) return;
      
      ctx.beginPath();
      const btns = document.querySelectorAll(".wow-btn-let");
      const coords = [];
      const wheelRect = document.getElementById("wow-wheel").getBoundingClientRect();
      
      btns.forEach(b => {
          const rect = b.getBoundingClientRect();
          coords[parseInt(b.dataset.idx)] = {
              x: rect.left - wheelRect.left + 25, // center of btn
              y: rect.top - wheelRect.top + 25
          };
      });

      const start = coords[state.inputPath[0]];
      ctx.moveTo(start.x, start.y);
      
      for(let i=1; i<state.inputPath.length; i++){
          const pt = coords[state.inputPath[i]];
          ctx.lineTo(pt.x, pt.y);
      }
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255, 152, 0, 0.5)"; // Original orange glow
      ctx.stroke();
  }

  function clearCanvas() {
      const canvas = document.getElementById("wow-canvas");
      if(canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0,0,250,250);
      }
  }

  function showMsg(text) {
      const msg = document.getElementById("wow-bonus-msg");
      if(!msg) return;
      msg.textContent = text;
      msg.classList.add("show");
      setTimeout(() => msg.classList.remove("show"), 1500);
  }

  function checkWord() {
    const word = state.inputWord;
    if (word.length < 3) return;

    const mainMatch = state.gridInfo.find(o => o.word === word);
    
    if (mainMatch) {
        if (!state.foundWords.has(word)) {
            state.foundWords.add(word);
            renderGrid(); 
            state.coins += 10;
            savePersisted();
            checkWin();
        } else {
            showMsg("Уже найдено!");
        }
        return;
    }

    // Logic: Bonus Words (JSON file + auto-detected leftovers)
    const isBonusListed = state.currLevel.bonus.includes(word);
    
    if (isBonusListed) {
        if (!state.bonusWordsFound.has(word)) {
            state.bonusWordsFound.add(word);
            state.coins += 5;
            document.getElementById("wow-score").textContent = state.coins;
            document.getElementById("wow-bonus-count").textContent = state.bonusWordsFound.size;
            showMsg("Бонус! +5");
            savePersisted();
        } else {
            showMsg("Уже в бонусах");
        }
    } else {
        showMsg("Нет такого слова");
    }
  }

  function checkWin() {
      const allNeeded = state.gridInfo.map(i => i.word);
      const isWin = allNeeded.every(w => state.foundWords.has(w));
      
      if (isWin) {
          setTimeout(() => {
              alert(`Уровень пройден!`);
              state.levelIndex++;
              savePersisted();
              startLevel();
          }, 500);
      }
  }

  // --- Setup & Persistence ---
  function savePersisted() {
      localStorage.setItem("bibleWowData", JSON.stringify({
          coins: state.coins,
          levelIndex: state.levelIndex
      }));
  }

  function loadPersisted() {
      try {
          const raw = localStorage.getItem("bibleWowData");
          if (raw) {
              const d = JSON.parse(raw);
              state.coins = d.coins || 0;
              state.levelIndex = d.levelIndex || 0;
          }
      } catch(e){}
  }

  function startLevel() {
      if (state.levelIndex >= state.levels.length) {
          alert("Поздравляем! Все уровни пройдены!");
          state.levelIndex = 0;
      }
      
      const rawLevel = state.levels[state.levelIndex];
      state.foundWords.clear();
      state.bonusWordsFound.clear();
      state.inputPath = [];
      state.inputWord = "";

      // Words preparation
      const rawGridWords = (rawLevel.words || []).map(normWord);
      const rawBonusWords = (rawLevel.bonus || []).map(normWord);

      // GENERATE GRID: strict mode (prevents touching lines)
      const layoutResult = generateLayout(rawGridWords);
      
      state.gridInfo = layoutResult.placed;
      
      // AUTO-CORRECTION: words that didn't fit go to BONUS (prevents empty cells)
      const extraBonuses = layoutResult.notPlaced;
      const finalBonus = [...new Set([...rawBonusWords, ...extraBonuses])];

      state.currLevel = {
          ...rawLevel,
          letters: normWord(rawLevel.letters),
          words: state.gridInfo.map(x => x.word),
          bonus: finalBonus
      };

      renderGame();
  }

  // Init
  loadJSON(levelsUrl)
    .then(data => {
      state.levels = data.levels; 
      loadPersisted();
      startLevel();
    })
    .catch(e => console.error(e));
}
