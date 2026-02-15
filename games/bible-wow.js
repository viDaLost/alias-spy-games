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
    .wow-title{font-weight:800;font-size:18px;color:var(--accent-active);}
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
    .wow-grid{display:grid;gap:10px;justify-content:center;padding:10px 8px;}
    .wow-cell{width:clamp(34px,8.6vw,50px);height:clamp(34px,8.6vw,50px);border-radius:12px;display:flex;align-items:center;justify-content:center;
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
    .wow-tile{width:clamp(34px,7.5vw,42px);height:clamp(44px,9vw,50px);border-radius:12px;background:#fff;border:2px solid rgba(0,0,0,.08);
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
      .wow-title{font-size:20px;}
      .wow-tile{font-size:20px;}
      .wow-centerInner{width:104px;height:104px;}
    }

    /* Compact screens (small height): keep crossword + wheel on one screen */
    @media (max-height:760px){
      .wow-wrap{padding-bottom:74px;}
      .wow-top{margin-bottom:10px;}
      .wow-panel{padding:10px;gap:8px;}
      .wow-grid{gap:8px;}
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
    bonusWords: new Set(),     // найденные бонусные слова текущего уровня
    bonusAll: new Set(),       // все допустимые бонусные слова текущего уровня
    grid: null,
    placements: [],
    revealedKeys: new Set(),
    isDragging: false,
    dragPath: [],
    currentWord: "",
    lastToastAt: 0
  };

  // Extra словарь на случай, если офлайн-словари неполные.
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

  // ---- Crossword builder (связная расстановка без "островов" и без "склеенных линий") ----
  function buildCrossword(words) {
    const uniq = Array.from(new Set((words || []).map(normWord).filter(Boolean)));
    const sorted = uniq.sort((a, b) => b.length - a.length);
    if (!sorted.length) return { grid: [[]], placements: [] };

    const maxLen = sorted[0].length;
    const size = Math.max(11, maxLen * 2 + 5); // поле с запасом, потом кропаем
    const W = size;
    const H = size;

    const DIR_H = 0;
    const DIR_V = 1;

    function emptyGrid() {
      return Array.from({ length: H }, () => Array(W).fill(null));
    }

    function cloneGrid(g) {
      return g.map(r => r.slice());
    }

    // Проверка "не касаться": вокруг каждой новой буквы (перпендикулярно направлению слова)
    // должно быть пусто, если это не пересечение.
    function canPlace(g, word, x, y, dir) {
      const len = word.length;

      // границы + совпадения
      for (let i = 0; i < len; i++) {
        const xx = x + (dir === DIR_H ? i : 0);
        const yy = y + (dir === DIR_V ? i : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return false;

        const cell = g[yy][xx];
        if (cell && cell !== word[i]) return false;
      }

      // до/после слова в направлении должны быть пустые
      const bx = x - (dir === DIR_H ? 1 : 0);
      const by = y - (dir === DIR_V ? 1 : 0);
      const ax = x + (dir === DIR_H ? len : 0);
      const ay = y + (dir === DIR_V ? len : 0);
      if (bx >= 0 && by >= 0 && bx < W && by < H && g[by][bx]) return false;
      if (ax >= 0 && ay >= 0 && ax < W && ay < H && g[ay][ax]) return false;

      // "не касаться" по бокам
      for (let i = 0; i < len; i++) {
        const xx = x + (dir === DIR_H ? i : 0);
        const yy = y + (dir === DIR_V ? i : 0);

        const already = g[yy][xx]; // пересечение или пусто
        if (already) continue; // в пересечении допускаем соседей (они уже есть в сетке)

        if (dir === DIR_H) {
          if ((yy - 1) >= 0 && g[yy - 1][xx]) return false;
          if ((yy + 1) < H && g[yy + 1][xx]) return false;
        } else {
          if ((xx - 1) >= 0 && g[yy][xx - 1]) return false;
          if ((xx + 1) < W && g[yy][xx + 1]) return false;
        }
      }

      return true;
    }

    function place(g, word, x, y, dir) {
      const cells = [];
      for (let i = 0; i < word.length; i++) {
        const xx = x + (dir === DIR_H ? i : 0);
        const yy = y + (dir === DIR_V ? i : 0);
        g[yy][xx] = word[i];
        cells.push({ x: xx, y: yy });
      }
      return { word, cells, dir, x, y, len: word.length };
    }

    function intersectionsCount(g, word, x, y, dir) {
      let n = 0;
      for (let i = 0; i < word.length; i++) {
        const xx = x + (dir === DIR_H ? i : 0);
        const yy = y + (dir === DIR_V ? i : 0);
        if (g[yy][xx] === word[i]) n++;
      }
      return n;
    }

    function bboxFromGrid(g) {
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let yy = 0; yy < H; yy++) {
        for (let xx = 0; xx < W; xx++) {
          if (g[yy][xx]) {
            if (xx < minX) minX = xx;
            if (yy < minY) minY = yy;
            if (xx > maxX) maxX = xx;
            if (yy > maxY) maxY = yy;
          }
        }
      }
      if (maxX === -1) return null;
      return { minX, minY, maxX, maxY, w: (maxX - minX + 1), h: (maxY - minY + 1) };
    }

    // Запрет "склеенных линий": два параллельных слова не должны стоять в одной строке/колонке с зазором 0..1
    function violatesCollinearGap(placements, candidate) {
      const gapLimit = 1;
      for (const p of placements) {
        if (p.dir !== candidate.dir) continue;

        if (candidate.dir === DIR_H) {
          if (p.y !== candidate.y) continue;
          const a1 = p.x, a2 = p.x + p.len - 1;
          const b1 = candidate.x, b2 = candidate.x + candidate.len - 1;
          const overlap = !(b2 < a1 || b1 > a2);
          if (overlap) continue; // пересечения по длине не рассматриваем как "склейку"
          const gap = (b1 > a2) ? (b1 - a2 - 1) : (a1 - b2 - 1);
          if (gap <= gapLimit) return true;
        } else {
          if (p.x !== candidate.x) continue;
          const a1 = p.y, a2 = p.y + p.len - 1;
          const b1 = candidate.y, b2 = candidate.y + candidate.len - 1;
          const overlap = !(b2 < a1 || b1 > a2);
          if (overlap) continue;
          const gap = (b1 > a2) ? (b1 - a2 - 1) : (a1 - b2 - 1);
          if (gap <= gapLimit) return true;
        }
      }
      return false;
    }

    function isConnected(placements) {
      if (!placements.length) return true;
      const key = (c) => `${c.x},${c.y}`;
      const wordCells = placements.map(p => new Set(p.cells.map(key)));
      const adj = Array.from({ length: placements.length }, () => []);
      for (let i = 0; i < placements.length; i++) {
        for (let j = i + 1; j < placements.length; j++) {
          let inter = false;
          for (const k of wordCells[i]) {
            if (wordCells[j].has(k)) { inter = true; break; }
          }
          if (inter) { adj[i].push(j); adj[j].push(i); }
        }
      }
      const seen = new Set([0]);
      const q = [0];
      while (q.length) {
        const v = q.pop();
        for (const u of adj[v]) {
          if (!seen.has(u)) { seen.add(u); q.push(u); }
        }
      }
      return seen.size === placements.length;
    }

    // Генерация кандидатов: ставим только через пересечения (после первого слова)
    function candidatesForWord(g, placements, word) {
      const cand = [];
      const occ = [];
      for (let yy = 0; yy < H; yy++) {
        for (let xx = 0; xx < W; xx++) {
          const ch = g[yy][xx];
          if (ch) occ.push({ x: xx, y: yy, ch });
        }
      }
      for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        for (const o of occ) {
          if (o.ch !== ch) continue;

          for (const dir of [0, 1]) {
            const x = o.x - (dir === 0 ? i : 0);
            const y = o.y - (dir === 1 ? i : 0);

            if (!canPlace(g, word, x, y, dir)) continue;

            const inter = intersectionsCount(g, word, x, y, dir);
            if (inter <= 0) continue; // обязательно пересечение

            const candidate = { word, x, y, dir, len: word.length, inter };
            if (violatesCollinearGap(placements, candidate)) continue;

            const cx = (W - 1) / 2;
            const cy = (H - 1) / 2;
            const midx = x + (dir === 0 ? (word.length - 1) / 2 : 0);
            const midy = y + (dir === 1 ? (word.length - 1) / 2 : 0);
            const dist = Math.hypot(midx - cx, midy - cy);

            cand.push({ ...candidate, score: inter * 100 - dist });
          }
        }
      }
      const seen = new Set();
      const out = [];
      for (const c of cand.sort((a, b) => b.score - a.score)) {
        const k = `${c.x},${c.y},${c.dir}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(c);
        if (out.length >= 30) break;
      }
      return out;
    }

    function cropResult(g, placements) {
      const bb = bboxFromGrid(g);
      if (!bb) return { grid: [[]], placements: [] };
      const cropped = [];
      for (let yy = bb.minY; yy <= bb.maxY; yy++) {
        cropped.push(g[yy].slice(bb.minX, bb.maxX + 1));
      }
      const adjPlacements = placements.map(p => ({
        word: p.word,
        dir: p.dir,
        cells: p.cells.map(c => ({ x: c.x - bb.minX, y: c.y - bb.minY })),
        x: p.x - bb.minX,
        y: p.y - bb.minY,
        len: p.len
      }));
      return { grid: cropped, placements: adjPlacements };
    }

    function solveOnce(order, firstDir) {
      let g = emptyGrid();
      let placements = [];

      const first = order[0];
      const x0 = Math.floor((W - (firstDir === 0 ? first.length : 1)) / 2);
      const y0 = Math.floor((H - (firstDir === 1 ? first.length : 1)) / 2);
      placements = [place(g, first, x0, y0, firstDir)];

      function dfs(i, gLocal, plLocal) {
        if (i >= order.length) return plLocal.length === order.length;
        const w = order[i];
        const cands = candidatesForWord(gLocal, plLocal, w);
        for (const c of cands) {
          const gNext = cloneGrid(gLocal);
          const pNext = place(gNext, w, c.x, c.y, c.dir);
          const plNext = plLocal.concat([pNext]);
          if (dfs(i + 1, gNext, plNext)) {
            g = gNext;
            placements = plNext;
            return true;
          }
        }
        return false;
      }

      const ok = dfs(1, g, placements);
      if (!ok) return null;
      if (!isConnected(placements)) return null;
      return cropResult(g, placements);
    }

    const attempts = 220;
    for (let t = 0; t < attempts; t++) {
      const groups = {};
      for (const w of sorted) {
        groups[w.length] = groups[w.length] || [];
        groups[w.length].push(w);
      }
      const lens = Object.keys(groups).map(Number).sort((a, b) => b - a);
      const order = [];
      for (const L of lens) {
        const arr = groups[L].slice();
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        order.push(...arr);
      }

      const firstDir = (t % 2 === 0) ? 0 : 1;
      const res = solveOnce(order, firstDir);
      if (res) return res;
    }

    // Если никак не получилось — возвращаем только первое слово (лучше так, чем "острова" и лишние клетки)
    const g0 = emptyGrid();
    const first = sorted[0];
    const x0 = Math.floor((W - first.length) / 2);
    const y0 = Math.floor(H / 2);
    const p0 = place(g0, first, x0, y0, 0);
    return cropResult(g0, [p0]);
  }

  // ---- UI ----
  function renderSkeleton() {
    container.innerHTML = `
      <div class="wow-wrap">
        <div class="wow-top">
          <div class="wow-topBtns">
            <button class="wow-btn secondary" id="wow-back">⬅️ В меню</button>
          </div>

          <div class="wow-title">Библейские слова</div>

          <div class="wow-pill">
            <button class="wow-iconBtn" id="wow-prev" title="Предыдущий уровень">◀</button>
            <div class="wow-chip" id="wow-level" style="cursor:pointer;">Уровень —</div>
            <button class="wow-iconBtn" id="wow-nextMini" title="Следующий уровень">▶</button>
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
            <div class="wow-muted" style="margin:0 0 10px;">Бонусные слова этого уровня (не из кроссворда). За каждое +2 🪙 (один раз).</div>
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
      box.innerHTML = `<div class="wow-muted" style="padding:10px;">Бонусных слов этого уровня пока нет. Попробуй найти слова из тех же букв 😉</div>`;
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
    gridEl.style.gridTemplateColumns = `repeat(${w}, 1fr)`;

    const revealed = new Set();
    for (const p of state.placements) {
      if (state.foundWords.has(p.word)) {
        for (const c of p.cells) revealed.add(`${c.x},${c.y}`);
      }
    }

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

          cell.classList.add("in");
          cell.style.animationDelay = `${(y * w + x) * 10}ms`;

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

  function getBonusAllForLevel(level) {
    const base = Array.isArray(level.bonusWords) ? level.bonusWords.map(normWord) : [];
    const baseSet = new Set(base.filter(w => w.length >= 3));
    if (baseSet.size) return baseSet;

    const target = new Set(level.words);
    const letters = level.letters;
    const gen = [];
    if (state.dict && state.dict.size) {
      for (const w of state.dict) {
        if (w.length < 3) continue;
        if (target.has(w)) continue;
        if (!canMakeFromLetters(w, letters)) continue;
        gen.push(w);
      }
    }
    gen.sort((a, b) => a.localeCompare(b, "ru"));
    for (const w of gen.slice(0, 120)) baseSet.add(w);
    return baseSet;
  }

  function validateWord(word) {
    const level = state.levels[state.levelIndex];
    const targetWords = new Set(level.words);
    const bonusAll = state.bonusAll || new Set();

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

    if (bonusAll.has(word) && !state.bonusWords.has(word)) {
      state.bonusWords.add(word);

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
    const remaining = level.words.filter(w => !state.foundWords.has(w));
    if (!remaining.length) {
      toast("Уже всё найдено ✨");
      return;
    }
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
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
    cleanupWheelOnly();

    const wheelRect = () => wheel.getBoundingClientRect();

    let centers = [];
    function refreshCenters() {
      centers = nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return {
          node,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          rr: Math.max(r.width, r.height) * 0.55
        };
      });
    }
    requestAnimationFrame(refreshCenters);

    function hitTest(clientX, clientY) {
      const el = document.elementFromPoint(clientX, clientY);
      const node1 = el?.closest?.(".wow-letter") || null;
      if (node1) return node1;

      if (!centers.length) refreshCenters();
      let best = null;
      let bestD = Infinity;
      for (const c of centers) {
        const dx = clientX - c.cx;
        const dy = clientY - c.cy;
        const d = Math.hypot(dx, dy);
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
      if (state.dragPath.some(p => p.node === node)) return;

      node.classList.add("active");
      state.dragPath.push({ node, letter, point: pointToWheelSvg(clientX, clientY, wheelRect()) });
      setCurrentWord(state.dragPath.map(p => p.letter).join(""));
      drawPath(state.dragPath.map(p => p.point));
    }

    let moveTick = 0;
    function move(clientX, clientY) {
      if (!state.isDragging) return;
      if ((moveTick++ % 6) === 0) refreshCenters();
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
    for (const off of offAll) off();
    offAll = [];
    cleanupWheelOnly();

    const level = state.levels[state.levelIndex];
    state.foundWords = new Set();
    const lid = String(level.id);
    const savedBonus = (state._bonusByLevel && Array.isArray(state._bonusByLevel[lid])) ? state._bonusByLevel[lid] : [];

    // Бонусные слова: только для текущего уровня (из level.bonusWords или fallback-генерации)
    state.bonusAll = getBonusAllForLevel(level);
    const savedSet = new Set(savedBonus.map(normWord));
    state.bonusWords = new Set(Array.from(savedSet).filter(w => state.bonusAll.has(w)));

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

    const fabBtn = document.getElementById("wow-fabBtn");
    const fabMenu = document.getElementById("wow-fabMenu");
    fabBtn?.addEventListener("click", () => {
      fabMenu?.classList.toggle("open");
    });
    listen(document, "pointerdown", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.closest?.("#wow-fabBtn") || t.closest?.("#wow-fabMenu")) return;
      fabMenu?.classList.remove("open");
    }, { passive: true });

    listen(window, "resize", () => {
      renderWheel();
    }, { passive: true });
  }

  // ---- Load levels and start ----
  container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";

  loadPersisted();
  Promise.all([
    loadJSON(levelsUrl),
    safeLoadJSON("data/easy_bible_words.json"),
    safeLoadJSON("data/medium_bible_words.json"),
    safeLoadJSON("data/hard_bible_words.json"),
    safeLoadJSON("data/bible_extra_words.json")
  ])
    .then(([levelsData, easy, medium, hard, extra]) => {
      const levels = (levelsData && levelsData.levels) ? levelsData.levels : [];

      const all = []
        .concat(Array.isArray(easy) ? easy : [])
        .concat(Array.isArray(medium) ? medium : [])
        .concat(Array.isArray(hard) ? hard : [])
        .concat(Array.isArray(extra) ? extra : [])
        .concat(EXTRA_BIBLE_WORDS);
      state.dict = new Set(all.map(normWord).filter(w => w.length >= 3));

      // Build levels (без автодобавления "лишних" слов — только то, что задано в JSON)
      state.levels = levels
        .map(l => {
          const letters = normWord(l.letters);
          const words = Array.from(new Set((l.words || []).map(normWord).filter(w => w.length >= 3)));
          const bonusWords = Array.from(new Set((l.bonusWords || []).map(normWord).filter(w => w.length >= 3)));

          return {
            id: l.id,
            letters,
            words,
            bonusWords
          };
        })
        .filter(l => l.letters.length >= 3 && l.words.length >= 1);

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
