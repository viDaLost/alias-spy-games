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
    .wow-wrap{max-width:980px;margin:0 auto;width:100%;padding:10px 8px 78px;}
    .wow-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;}
    .wow-title{display:none;}
    .wow-pill{display:flex;gap:8px;align-items:center;}
    .wow-chip{background:var(--card-bg);border:1px solid rgba(0,0,0,.08);border-radius:999px;padding:7px 10px;font-size:13px;box-shadow:0 4px 10px var(--shadow);}
    .wow-btn{border:none;border-radius:var(--button-radius);padding:12px 14px;font-weight:700;cursor:pointer;}
    .wow-btn.secondary{background:var(--card-bg);color:var(--text-color);border:1px solid rgba(0,0,0,.08);box-shadow:0 4px 10px var(--shadow);}
    .wow-btn.primary{background:var(--accent-active);color:#fff;box-shadow:0 6px 14px rgba(0,0,0,.14);}
    .wow-btn.primary:disabled{opacity:.55;cursor:not-allowed;}
    .wow-panel{background:var(--card-bg);border:1px solid rgba(0,0,0,.08);border-radius:18px;padding:12px;box-shadow:0 8px 24px var(--shadow);
      display:flex;flex-direction:column;gap:10px;}

    /* --- Crossword --- */
    .wow-gridWrap{display:flex;justify-content:center;}
    .wow-grid{display:grid;gap:var(--gridGap,7px);justify-content:center;padding:6px 4px;}
    .wow-cell{width:var(--cellPx, clamp(34px,8.6vw,50px));height:var(--cellPx, clamp(34px,8.6vw,50px));border-radius:12px;display:flex;align-items:center;justify-content:center;
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
    .wow-mid{display:grid;gap:10px;}
    .wow-toast{min-height:22px;text-align:center;font-weight:800;color:var(--accent-active);}

    /* --- Current word (как в оригинале: "плитки") --- */
    .wow-wordline{display:flex;justify-content:center;}
    .wow-current{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;min-height:46px;}
    .wow-tile{width:var(--tileW, clamp(34px,7.5vw,42px));height:var(--tileH, clamp(44px,9vw,50px));border-radius:12px;background:#fff;border:2px solid rgba(0,0,0,.08);
      box-shadow:0 6px 16px rgba(0,0,0,.06);display:flex;align-items:center;justify-content:center;
      font-weight:900;font-size:18px;}
    .wow-tile.ghost{opacity:.35;}

    /* --- Wheel --- */
    .wow-wheelWrap{display:flex;justify-content:center;align-items:center;}
    .wow-wheel{position:relative;width:min(340px,86vw,42vh);aspect-ratio:1/1;border-radius:999px;
      background:linear-gradient(180deg, rgba(79,70,229,.06), rgba(79,70,229,.02));
      border:1px solid rgba(79,70,229,.18);
      box-shadow:0 14px 34px rgba(0,0,0,.10);
      overflow:hidden;touch-action:none;}
    .wow-wheel::after{content:"";position:absolute;inset:14%;border-radius:999px;border:1px dashed rgba(79,70,229,.18);opacity:.7;}
    .wow-wheel svg{position:absolute;inset:0;pointer-events:none;}
    .wow-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
    .wow-centerInner{width:92px;height:92px;border-radius:999px;background:rgba(255,255,255,.9);
      border:1px solid rgba(0,0,0,.08);box-shadow:0 10px 24px rgba(0,0,0,.12);}
    .wow-letter{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:clamp(54px,14vw,68px);height:clamp(54px,14vw,68px);border-radius:999px;background:#fff;color:var(--accent-active);font-weight:900;
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

    /* --- Modal / Lists --- */
    .wow-modal{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;
      background:rgba(0,0,0,.42);backdrop-filter: blur(4px);padding:18px;}
    .wow-modal.open{display:flex;}
    .wow-modalCard{width:min(520px,92vw);max-height:min(72vh,560px);overflow:auto;
      background:var(--card-bg);border:1px solid rgba(0,0,0,.10);border-radius:18px;box-shadow:0 18px 46px rgba(0,0,0,.28);
      padding:14px;}
    .wow-modalTop{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}
    .wow-modalTitle{font-weight:900;font-size:16px;color:var(--accent-active);}
    .wow-x{border:none;background:#fff;border:1px solid rgba(0,0,0,.10);width:40px;height:40px;border-radius:14px;cursor:pointer;
      box-shadow:0 10px 22px rgba(0,0,0,.12);font-weight:900;}
    .wow-list{display:grid;gap:8px;}
    .wow-levelItem{display:flex;align-items:center;justify-content:space-between;gap:10px;
      background:#fff;border:1px solid rgba(0,0,0,.10);border-radius:16px;padding:12px 12px;cursor:pointer;
      box-shadow:0 10px 22px rgba(0,0,0,.10);}
    .wow-levelItem:active{transform:scale(.99);}
    .wow-levelLeft{display:flex;align-items:center;gap:10px;}
    .wow-badge{font-weight:900;border-radius:999px;padding:6px 10px;font-size:12px;background:rgba(79,70,229,.08);color:var(--accent-active);
      border:1px solid rgba(79,70,229,.18);}
    .wow-done{background:rgba(34,197,94,.10);color:rgba(22,101,52,1);border-color:rgba(34,197,94,.22);}
    .wow-muted{opacity:.75;font-size:12px;}
    .wow-topBtns{display:flex;gap:8px;align-items:center;}
    .wow-iconBtn{width:42px;height:42px;border-radius:14px;border:1px solid rgba(0,0,0,.08);
      background:var(--card-bg);box-shadow:0 4px 10px var(--shadow);cursor:pointer;font-weight:900;}
    .wow-iconBtn:disabled{opacity:.55;cursor:not-allowed;}

    @media (min-width:520px){
      .wow-title{display:none;}
      .wow-tile{font-size:20px;}
      .wow-centerInner{width:104px;height:104px;}
    }

    /* Compact screens (small height): keep crossword + wheel on one screen */
    @media (max-height:760px){
      .wow-wrap{padding-bottom:74px;}
      .wow-top{margin-bottom:10px;}
      .wow-panel{padding:10px;gap:8px;}
      .wow-grid{gap:6px;}
      .wow-wheel{width:min(320px,84vw,40vh);}
      .wow-bottom .wow-small{display:none;}
    }
  `;
  document.head.appendChild(style);

  // ---- State ----
  const LS_PROGRESS = "bibleWow_progress_v4";
  const LS_PROGRESS_OLD = "bibleWow_progress_v2";
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

  // Extra словарь на случай, если офлайн-словари неполные.
  // Это НЕ "все слова русского языка" — только частые библейские/контекстные.
  // (поправляет кейсы вроде «МЕРА»).
  const EXTRA_BIBLE_WORDS = [
    "МЕРА","МЕРЫ","СЕМ","ХАМ","СИМ","ЕВА","АДАМ","РАЙ","АД","ГРЕХ","ПОСТ","СВЕТ","ТЬМА","ХРАМ","ГРОБ","КРЕСТ","ПЛОТ","КОВЧЕГ",
    "ЖЕРТВА","АГНЕЦ","ПАСХА","ПРИТЧА","МАТФЕЙ","МАРК","ЛУКА","ИОАНН","ПЕТР","ПАВЕЛ","САУЛ","РИМ","СИНАЙ","СИОН","САРРА","РЕВЕККА",
    "ИАКОВ","ИСАВ","ИОСИФ","МОИСЕЙ","ААРОН","МИРИАМ","ИИСУС","ХРИСТОС","ВЕРА","НАДЕЖДА","ЛЮБОВЬ","СЛОВО","ЗАВЕТ","ПСАЛОМ","ПСАЛМЫ",
    "МАННА","ПЛЕМЯ","ИЕРИХОН","САМУИЛ","ДАВИД","СОЛОМОН","ИОВ","РУФЬ","ЕСТИРЬ","ПИЛАТ","ИУДА","ЛАЗАРЬ"
  ].map(s => s.replace(/Ё/g,"Е"));

  function safeLoadJSON(url) {
    try {
      const p = loadJSON(url);
      return Promise.resolve(p).catch(() => []);
    } catch {
      return Promise.resolve([]);
    }
  }

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
      const p3 = JSON.parse(localStorage.getItem(LS_PROGRESS) || "null");
      const p2 = JSON.parse(localStorage.getItem(LS_PROGRESS_OLD) || "null");
      const p = p3 || p2;
      if (p && typeof p.levelIndex === "number") state.levelIndex = Math.max(0, p.levelIndex);
      state._bonusByLevel = (p && p.bonusByLevel && typeof p.bonusByLevel === "object") ? p.bonusByLevel : {};
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
      localStorage.setItem(LS_PROGRESS, JSON.stringify({
        levelIndex: state.levelIndex,
        bonusByLevel: state._bonusByLevel || {}
      }));
    } catch {}
    try {
      localStorage.setItem(LS_COINS, String(state.coins));
    } catch {}
    try {
      localStorage.setItem(LS_COMPLETED, JSON.stringify(Array.from(state.completed)));
    } catch {}
  }

  // ---- Crossword builder (стараемся делать «как в настоящих кроссвордах»)
  // Правила:
  //  - слова не должны касаться боком (только пересекаться)
  //  - много попыток, выбираем лучшую раскладку
  function buildCrossword(words) {
    const src = [...words].filter(Boolean);
    if (!src.length) {
      return { grid: [[null]], placements: [] };
    }

    // делаем поле побольше — потом обрежем
    const W = 15;
    const H = 15;

    function tryBuild(order) {
      const grid = Array.from({ length: H }, () => Array(W).fill(null));
      const placements = [];

      function get(x, y) {
        if (x < 0 || y < 0 || x >= W || y >= H) return "#";
        return grid[y][x];
      }

      function canPlace(word, x, y, dir) {
        const dx = (dir === 0) ? 1 : 0;
        const dy = (dir === 1) ? 1 : 0;

        // клетка перед и после слова должна быть пустой (чтобы не слипались окончания)
        if (get(x - dx, y - dy)) return false;
        if (get(x + dx * word.length, y + dy * word.length)) return false;

        for (let i = 0; i < word.length; i++) {
          const xx = x + dx * i;
          const yy = y + dy * i;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) return false;

          const cell = grid[yy][xx];
          const ch = word[i];
          if (cell && cell !== ch) return false;

          // запрещаем боковые касания (если в этой клетке нет пересечения)
          if (!cell) {
            if (dir === 0) {
              if (get(xx, yy - 1) || get(xx, yy + 1)) return false;
            } else {
              if (get(xx - 1, yy) || get(xx + 1, yy)) return false;
            }
          }
        }
        return true;
      }

      function place(word, x, y, dir) {
        const dx = (dir === 0) ? 1 : 0;
        const dy = (dir === 1) ? 1 : 0;
        const cells = [];
        for (let i = 0; i < word.length; i++) {
          const xx = x + dx * i;
          const yy = y + dy * i;
          grid[yy][xx] = word[i];
          cells.push({ x: xx, y: yy });
        }
        placements.push({ word, cells, dir });
      }

      // первое слово по центру
      const w0 = order[0];
      const x0 = Math.floor((W - w0.length) / 2);
      const y0 = Math.floor(H / 2);
      place(w0, x0, y0, 0);

      for (let wi = 1; wi < order.length; wi++) {
        const word = order[wi];
        let best = null;

        // ищем пересечения со всеми уже поставленными словами
        for (const p of placements) {
          for (let i = 0; i < word.length; i++) {
            const ch = word[i];
            for (let j = 0; j < p.word.length; j++) {
              if (p.word[j] !== ch) continue;
              const anchor = p.cells[j];
              const dir = 1 - p.dir;
              const x = anchor.x - (dir === 0 ? i : 0);
              const y = anchor.y - (dir === 1 ? i : 0);
              if (!canPlace(word, x, y, dir)) continue;

              // оцениваем кандидат: больше пересечений, компактнее, ближе к квадрату
              const dx = (dir === 0) ? 1 : 0;
              const dy = (dir === 1) ? 1 : 0;
              let intersections = 0;
              for (let k = 0; k < word.length; k++) {
                const xx = x + dx * k;
                const yy = y + dy * k;
                if (grid[yy][xx]) intersections++;
              }

              // bounding box текущих букв
              let minX = W, minY = H, maxX = -1, maxY = -1;
              for (let yy = 0; yy < H; yy++) {
                for (let xx = 0; xx < W; xx++) {
                  if (!grid[yy][xx]) continue;
                  minX = Math.min(minX, xx);
                  minY = Math.min(minY, yy);
                  maxX = Math.max(maxX, xx);
                  maxY = Math.max(maxY, yy);
                }
              }
              // + новое слово
              for (let k = 0; k < word.length; k++) {
                const xx = x + dx * k;
                const yy = y + dy * k;
                minX = Math.min(minX, xx);
                minY = Math.min(minY, yy);
                maxX = Math.max(maxX, xx);
                maxY = Math.max(maxY, yy);
              }
              const bw = maxX - minX + 1;
              const bh = maxY - minY + 1;
              const area = bw * bh;
              const ratio = bw > bh ? (bw / bh) : (bh / bw);

              const score = intersections * 1000 - area * 3 - (ratio - 1) * 120;
              if (!best || score > best.score) best = { x, y, dir, score };
            }
          }
        }

        if (best) {
          place(word, best.x, best.y, best.dir);
          continue;
        }

        // если пересечений нет — пробуем поставить отдельно (но не слипая)
        let placed = false;
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
        if (!placed) return null;
      }

      // обрезаем по занятым клеткам + 1 клетка поля
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!grid[y][x]) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX === -1) return null;
      minX = Math.max(0, minX - 1);
      minY = Math.max(0, minY - 1);
      maxX = Math.min(W - 1, maxX + 1);
      maxY = Math.min(H - 1, maxY + 1);

      const cropped = [];
      for (let y = minY; y <= maxY; y++) {
        cropped.push(grid[y].slice(minX, maxX + 1));
      }
      for (const p of placements) {
        p.cells = p.cells.map(c => ({ x: c.x - minX, y: c.y - minY }));
      }
      return { grid: cropped, placements };
    }

    const base = [...src].sort((a, b) => b.length - a.length);
    let best = null;
    for (let t = 0; t < 60; t++) {
      const order = [...base];
      for (let i = 1; i < order.length; i++) {
        const j = 1 + Math.floor(Math.random() * (order.length - 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const res = tryBuild(order);
      if (!res) continue;
      const w = res.grid[0]?.length || 1;
      const h = res.grid.length || 1;
      const area = w * h;
      const ratio = w > h ? (w / h) : (h / w);
      const longLine = Math.max(w, h);

      // считаем пересечения: сколько клеток участвует минимум в 2 словах
      const countMap = new Map();
      for (const p of res.placements) {
        for (const c of p.cells) {
          const k = `${c.x},${c.y}`;
          countMap.set(k, (countMap.get(k) || 0) + 1);
        }
      }
      let intersections = 0;
      for (const v of countMap.values()) if (v >= 2) intersections++;

      const score = intersections * 900 - area * 3 - (ratio - 1) * 180 - longLine * 12;
      if (!best || score > best.score) best = { ...res, score };
    }

    if (!best) {
      const res = tryBuild(base);
      if (res) return res;
      const single = base[0];
      return {
        grid: [single.split("")],
        placements: [{ word: single, cells: single.split("").map((_, i) => ({ x: i, y: 0 })), dir: 0 }]
      };
    }
    return { grid: best.grid, placements: best.placements };
  }

  // ---- UI ----
  function renderSkeleton() {
    container.innerHTML = `
      <div class="wow-wrap">
        <div class="wow-top">
          <div class="wow-topBtns">
            <button class="wow-btn secondary" id="wow-back">⬅️ В меню</button>
          </div>

          <div class="wow-title"></div>

          <div class="wow-pill">
            <button class="wow-iconBtn" id="wow-prev" title="Предыдущий уровень">◀</button>
            <div class="wow-chip" id="wow-level" style="cursor:pointer;">Уровень —</div>
            <button class="wow-iconBtn" id="wow-nextMini" title="Следующий уровень">▶</button>
          </div>
        </div>

        <div class="wow-panel">
          <div class="wow-gridWrap" id="wow-gridWrap"><div id="wow-grid" class="wow-grid" aria-label="Кроссворд"></div></div>
          <div class="wow-mid">
            <div id="wow-toast" class="wow-toast"></div>
            <div class="wow-wordline" id="wow-wordline"><div id="wow-current" class="wow-current" aria-label="Текущее слово"></div></div>
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
              <button class="wow-btn primary" id="wow-next">Следующий ▶</button>
            </div>
          </div>
        </div>

        <div class="wow-fab" aria-label="Меню">
          <div class="wow-fabMenu" id="wow-fabMenu">
            <div class="wow-fabItem">
              <div class="wow-fabLabel" id="wow-coinsMenu">🪙 0</div>
              <button class="wow-miniBtn" id="wow-levelsOpen" title="Уровни">≡</button>
            </div>
            <div class="wow-fabItem">
              <div class="wow-fabLabel">⭐ Бонусные слова</div>
              <button class="wow-miniBtn" id="wow-bonusOpen" title="Бонусные">★</button>
            </div>
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

        <!-- Modal: уровни -->
        <div class="wow-modal" id="wow-levelsModal" aria-hidden="true">
          <div class="wow-modalCard" role="dialog" aria-label="Уровни">
            <div class="wow-modalTop">
              <div class="wow-modalTitle">Уровни</div>
              <button class="wow-x" id="wow-levelsClose" title="Закрыть">✕</button>
            </div>
            <div class="wow-muted" style="margin:0 0 10px;">Нажми на уровень, чтобы перейти.</div>
            <div class="wow-list" id="wow-levelsList"></div>
          </div>
        </div>

        <!-- Modal: бонусные слова -->
        <div class="wow-modal" id="wow-bonusModal" aria-hidden="true">
          <div class="wow-modalCard" role="dialog" aria-label="Бонусные слова">
            <div class="wow-modalTop">
              <div class="wow-modalTitle">⭐ Бонусные слова</div>
              <button class="wow-x" id="wow-bonusClose" title="Закрыть">✕</button>
            </div>
            <div class="wow-muted" style="margin:0 0 10px;">Это слова, которых нет в кроссворде, но они есть в словаре. За каждое +2 🪙 (один раз).</div>
            <div class="wow-list" id="wow-bonusList"></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById("wow-back")?.addEventListener("click", () => {
      cleanupAll();
      goToMainMenu();
    });

    const levelsModal = document.getElementById("wow-levelsModal");
    const bonusModal = document.getElementById("wow-bonusModal");
    const openModal = (m) => { m?.classList.add("open"); };
    const closeModal = (m) => { m?.classList.remove("open"); };
    document.getElementById("wow-level")?.addEventListener("click", () => { renderLevelsList(); openModal(levelsModal); });
    document.getElementById("wow-levelsClose")?.addEventListener("click", () => closeModal(levelsModal));

    const fabMenu = () => document.getElementById("wow-fabMenu");
    document.getElementById("wow-levelsOpen")?.addEventListener("click", () => { fabMenu()?.classList.remove("open"); renderLevelsList(); openModal(levelsModal); });
    document.getElementById("wow-bonusOpen")?.addEventListener("click", () => { fabMenu()?.classList.remove("open"); renderBonusList(); openModal(bonusModal); });
    document.getElementById("wow-bonusClose")?.addEventListener("click", () => closeModal(bonusModal));

    ;[levelsModal, bonusModal].forEach(m => {
      m?.addEventListener("pointerdown", (e) => {
        if (e.target === m) closeModal(m);
      }, { passive: true });
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
    const coinsEl = document.getElementById("wow-coinsMenu");
    if (levelEl) levelEl.textContent = `Уровень ${state.levelIndex + 1} / ${state.levels.length}`;
    if (coinsEl) coinsEl.textContent = `🪙 ${state.coins}`;

    const prevBtn = document.getElementById("wow-prev");
    const nextMini = document.getElementById("wow-nextMini");
    if (prevBtn) prevBtn.disabled = state.levelIndex <= 0;
    if (nextMini) nextMini.disabled = state.levelIndex >= state.levels.length - 1;

    // disable paid actions when low coins
    const hintBtn = document.getElementById("wow-hint");
    const revealBtn = document.getElementById("wow-reveal");
    if (hintBtn) hintBtn.disabled = state.coins < 10;
    if (revealBtn) revealBtn.disabled = state.coins < 25;
  }

  function renderBonusList() {
    const box = document.getElementById("wow-bonusList");
    if (!box) return;
    const arr = Array.from(state.bonusWords || []).sort((a, b) => a.localeCompare(b, "ru"));
    if (!arr.length) {
      box.innerHTML = `<div class="wow-muted" style="padding:10px;">Пока нет бонусных слов. Попробуй найти слова, которых нет в кроссворде 😉</div>`;
      return;
    }
    box.innerHTML = "";
    for (const w of arr) {
      const row = document.createElement("div");
      row.className = "wow-levelItem";
      row.innerHTML = `
        <div class="wow-levelLeft">
          <span class="wow-badge">+2 🪙</span>
          <div style="font-weight:900;letter-spacing:.4px;">${w}</div>
        </div>
        <div class="wow-muted">бонус</div>
      `;
      box.appendChild(row);
    }
  }

  function renderLevelsList() {
    const box = document.getElementById("wow-levelsList");
    if (!box) return;
    box.innerHTML = "";
    for (let i = 0; i < state.levels.length; i++) {
      const lvl = state.levels[i];
      const id = Number(lvl.id);
      const done = state.completed.has(id);
      const row = document.createElement("div");
      row.className = "wow-levelItem";
      row.innerHTML = `
        <div class="wow-levelLeft">
          <span class="wow-badge ${done ? "wow-done" : ""}">${done ? "✓" : "•"}</span>
          <div>
            <div style="font-weight:900;">Уровень ${i + 1}</div>
          </div>
        </div>
        <div class="wow-muted">${done ? "пройден" : ""}</div>
      `;
      row.addEventListener("click", () => {
        state.levelIndex = i;
        savePersisted();
        document.getElementById("wow-levelsModal")?.classList.remove("open");
        startLevel();
      });
      box.appendChild(row);
    }
  }

  function renderGrid() {
    const gridEl = document.getElementById("wow-grid");
    if (!gridEl || !state.grid) return;

    const h = state.grid.length;
    const w = state.grid[0].length;
    // колонки задаём через фиксированный размер клетки, который мы вычисляем в fitLayout()
    gridEl.style.gridTemplateColumns = `repeat(${w}, var(--cellPx, 40px))`;

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

    // подгоняем размеры под экран, чтобы кроссворд не обрезался и помещались кольцо + поле
    fitLayout();
  }

  function fitLayout() {
    const gridEl = document.getElementById("wow-grid");
    const gridWrap = document.getElementById("wow-gridWrap");
    const wheel = document.getElementById("wow-wheel");
    const wordline = document.getElementById("wow-wordline");
    if (!gridEl || !state.grid) return;

    const cols = state.grid[0]?.length || 1;
    const rows = state.grid.length || 1;

    const vw = Math.max(320, window.innerWidth || 0);
    const vh = Math.max(480, window.innerHeight || 0);

    const wheelH = wheel ? wheel.getBoundingClientRect().height : 0;
    const wordH = wordline ? wordline.getBoundingClientRect().height : 0;

    // стараемся уместить всё в один экран (без вертикального скролла)
    // оставляем небольшой запас под верхнюю панель + отступы
    const reservedTop = 210; // верхние элементы (заголовок/пилюля/паддинги)
    const reservedBottom = 24;
    const availH = Math.max(160, vh - reservedTop - wheelH - wordH - reservedBottom);
    const availW = Math.min(520, vw - 24);

    const gap = vw < 380 ? 6 : 7;
    const cellW = Math.floor((availW - gap * (cols - 1)) / cols);
    const cellH = Math.floor((availH - gap * (rows - 1)) / rows);
    const cell = Math.max(24, Math.min(50, cellW, cellH));

    gridEl.style.setProperty("--gridGap", `${gap}px`);
    gridEl.style.setProperty("--cellPx", `${cell}px`);

    // поле текущего слова
    const tileW = Math.max(28, Math.min(42, Math.floor((availW - 6 * 5) / 6)));
    const tileH = Math.max(40, Math.min(52, Math.floor(tileW * 1.15)));
    document.documentElement.style.setProperty("--tileW", `${tileW}px`);
    document.documentElement.style.setProperty("--tileH", `${tileH}px`);

    if (gridWrap) {
      // ограничиваем высоту обёртки, чтобы кроссворд точно не выходил за блок
      gridWrap.style.maxHeight = `${Math.max(160, Math.min(availH + 16, vh * 0.48))}px`;
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
      // persist per level
      const lid = String(level.id);
      state._bonusByLevel = state._bonusByLevel || {};
      const prev = Array.isArray(state._bonusByLevel[lid]) ? state._bonusByLevel[lid] : [];
      if (!prev.includes(word)) state._bonusByLevel[lid] = prev.concat([word]);
      state.coins += 2;
      toast("🪙 Бонусное слово! +2");
      updateTopbar();
      renderBonusList();
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

    // Precompute centers for more reliable hit-testing while swiping fast
    let centers = [];
    function refreshCenters() {
      centers = nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return {
          node,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          // radius based on size (+ padding)
          rr: Math.max(r.width, r.height) * 0.55
        };
      });
    }
    // refresh after layout
    requestAnimationFrame(refreshCenters);

    function hitTest(clientX, clientY) {
      // 1) DOM hit-test (fast)
      const el = document.elementFromPoint(clientX, clientY);
      const node1 = el?.closest?.(".wow-letter") || null;
      if (node1) return node1;

      // 2) Fallback: nearest center (reliable when finger moves fast)
      if (!centers.length) refreshCenters();
      let best = null;
      let bestD = Infinity;
      for (const c of centers) {
        const dx = clientX - c.cx;
        const dy = clientY - c.cy;
        const d = Math.hypot(dx, dy);
        // allow a small tolerance beyond the visual circle so the swipe feels "sticky"
        const tol = Math.max(12, c.rr * 0.18);
        if (d < (c.rr + tol) && d < bestD) {
          best = c.node;
          bestD = d;
        }
      }
      return best;
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

    let moveTick = 0;
    function move(clientX, clientY) {
      if (!state.isDragging) return;
      // Keep centers fresh on mobile when browser changes layout during gesture
      if ((moveTick++ % 6) === 0) refreshCenters();
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
      refreshCenters();
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
      e.preventDefault();
      wheel.setPointerCapture?.(e.pointerId);
      start(e.clientX, e.clientY);
    }, { passive: false });
    listenWheel(wheel, "pointermove", (e) => {
      if (!(e instanceof PointerEvent)) return;
      if (state.isDragging) e.preventDefault();
      move(e.clientX, e.clientY);
    }, { passive: false });
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
    // avoid stacking listeners when restarting level / switching levels
    for (const off of offAll) off();
    offAll = [];
    cleanupWheelOnly();

    const level = state.levels[state.levelIndex];
    state.foundWords = new Set();
    const lid = String(level.id);
    const savedBonus = (state._bonusByLevel && Array.isArray(state._bonusByLevel[lid])) ? state._bonusByLevel[lid] : [];
    state.bonusWords = new Set(savedBonus.map(normWord));
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

    renderBonusList();

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

    document.getElementById("wow-prev")?.addEventListener("click", () => {
      if (state.levelIndex <= 0) return;
      state.levelIndex--;
      savePersisted();
      startLevel();
    });
    document.getElementById("wow-nextMini")?.addEventListener("click", () => {
      if (state.levelIndex >= state.levels.length - 1) return;
      state.levelIndex++;
      savePersisted();
      startLevel();
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
      fitLayout();
    }, { passive: true });
  }

  // ---- Load levels and start ----
  container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";

  loadPersisted();
  Promise.all([
    loadJSON(levelsUrl),
    safeLoadJSON("data/bible_dictionary_structured.json"),
    safeLoadJSON("data/easy_bible_words.json"),
    safeLoadJSON("data/medium_bible_words.json"),
    safeLoadJSON("data/hard_bible_words.json"),
    safeLoadJSON("data/bible_extra_words.json")
  ])
    .then(([levelsData, easy, medium, hard, extra]) => {
      const levels = (levelsData && levelsData.levels) ? levelsData.levels : [];
      // build offline dictionary (for bonus words)
      const all = []
        .concat(Array.isArray(easy) ? easy : [])
        .concat(Array.isArray(medium) ? medium : [])
        .concat(Array.isArray(hard) ? hard : [])
        .concat(Array.isArray(extra) ? extra : [])
        .concat(EXTRA_BIBLE_WORDS);
      state.dict = new Set(all.map(normWord).filter(w => w.length >= 3));

      // Build levels WITHOUT повторов слов между уровнями.
      // Если после фильтрации осталось < 4 слов — уровень пропускаем.
      const used = new Set();
      const built = [];

      for (const l of levels) {
        const letters = normWord(l.letters);
        if (letters.length < 3) continue;

        const baseWords = (l.words || []).map(normWord).filter(w => w.length >= 3);
        const set = new Set();

        for (const w of baseWords) {
          if (used.has(w)) continue;
          if (!canMakeFromLetters(w, letters)) continue;
          set.add(w);
        }

        // Добиваем уровень словами из словаря (но тоже без повторов)
        if (set.size < 4) {
          for (const w of state.dict) {
            if (set.size >= 4) break;
            if (w.length < 3 || w.length > letters.length) continue;
            if (used.has(w) || set.has(w)) continue;
            if (!canMakeFromLetters(w, letters)) continue;
            set.add(w);
          }
        }

        if (set.size < 4) continue;

        // Фиксируем, что эти слова уже использованы
        for (const w of set) used.add(w);

        built.push({
          id: l.id,
          letters,
          words: Array.from(set)
        });
      }

      state.levels = built;

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
