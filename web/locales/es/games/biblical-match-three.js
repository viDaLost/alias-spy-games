(() => {
"use strict";

const Core = window.BiblicalMatchThreeCore;
const Progress = window.BiblicalMatchThreeProgress;
const reopeningPreview = window.document?.body?.hasAttribute("data-reopening-preview");
const EXCAVATION_ART = "web/assets/biblical-match-three/excavation/";
const treasureArt = (type) => `${EXCAVATION_ART}${type}${window.GameDisplay?.lowGraphics?.() ? "" : "-hd"}.webp`;
const TREASURE_LABELS = {
  coin: "Серебряная драхма",
  amphora: "Глиняная амфора",
  scroll: "Древний свиток",
  chest: "Сундук с сокровищами",
};
const FX = window.BiblicalMatchThreeEffects || {};
if (!Core) throw new Error("BiblicalMatchThreeCore is not loaded");
if (!Progress) throw new Error("BiblicalMatchThreeProgress is not loaded");

let ROWS = 8;
const COLS = 8;
const MIN_START_MOVES = 3;

const SYMBOLS = [
  { id: "bible", label: "Biblia", asset: "web/assets/biblical-match-three/bible.svg" },
  { id: "fish", label: "Pez", asset: "web/assets/biblical-match-three/fish.svg" },
  { id: "dove", label: "Paloma", asset: "web/assets/biblical-match-three/dove.svg" },
  { id: "lamp", label: "Lámpara", asset: "web/assets/biblical-match-three/lamp.svg" },
  { id: "crown", label: "Corona", asset: "web/assets/biblical-match-three/crown.svg" },
  { id: "ark", label: "Arca", asset: "web/assets/biblical-match-three/ark.svg" },
  { id: "bread", label: "Pan", asset: "web/assets/biblical-match-three/bread.svg" },
  { id: "grapes", label: "Uvas", asset: "web/assets/biblical-match-three/grapes.svg" },
  { id: "tablets", label: "Tablas", asset: "web/assets/biblical-match-three/tablets.svg" },
];
const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map((item) => [item.id, item]));

const FREE_MODES = {
  easy: { label: "Fácil", symbolCount: 7, rows: 7, moves: 30, hintDelay: 7000, accent: "green" },
  medium: { label: "Medio", symbolCount: 8, rows: 8, moves: 30, hintDelay: 9500, accent: "gold" },
  hard: { label: "Difícil", symbolCount: 9, rows: 8, moves: 30, hintDelay: 12500, accent: "violet" },
};

const PRE_BOOSTERS = {
  manna: { label: "Maná del cielo", short: "Maná", cost: 6, asset: "web/assets/biblical-match-three/bread.svg", desc: "Dos fichas especiales direccionales al empezar." },
  lampOil: { label: "Aceite de lámpara", short: "Aceite", cost: 8, asset: "web/assets/biblical-match-three/lamp.svg", desc: "Una lámpara de destello al empezar." },
  covenant: { label: "Arcoíris del pacto", short: "Arcoíris", cost: 12, asset: "web/assets/biblical-match-three/dove.svg", desc: "Una ficha arcoíris que elimina el símbolo elegido." },
};

const IN_BOOSTERS = {
  sling: { label: "Honda de David", cost: 5, asset: "web/assets/biblical-match-three/crown.svg", desc: "Un golpe preciso en una casilla.", target: true },
  staff: { label: "Vara de Moisés", cost: 7, asset: "web/assets/biblical-match-three/tablets.svg", desc: "Limpia la columna elegida.", target: true },
  jericho: { label: "Trompetas de Jericó", cost: 10, asset: "web/assets/biblical-match-three/lamp.svg", desc: "Una potente onda de 3×3.", target: true },
  rainbow: { label: "Arcoíris del pacto", cost: 8, asset: "web/assets/biblical-match-three/icons-v17/covenant.webp", desc: "Convierte la ficha elegida en arcoíris.", target: true },
};

const BLOCKER_META = {
  tablet: { label: "Tablas", icon: "▦" },
  chain: { label: "Cadenas", icon: "◇" },
  lamp: { label: "Lámparas", icon: "✦" },
  vine: { label: "Espinas", icon: "✤" },
};

// Ковчег не участвует в совпадениях, поэтому его тип не должен встречаться среди
// обычных символов: каждому дают свой номер, и три одинаковых уже не сложатся.
const RELIC_TYPE = "__relic";
const RELIC_SCORE = 260;

let runtime = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(text, className, onClick) {
  const node = el("button", className, text);
  node.type = "button";
  if (onClick) node.addEventListener("click", onClick, { signal: runtime?.abort?.signal });
  return node;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function getSymbolSet(count) {
  return SYMBOLS.slice(0, Math.max(3, Math.min(SYMBOLS.length, Number(count || 6)))).map((item) => item.id);
}

function levelRelicCells(level) { return (level?.relics || []).map(Number).filter((index) => Number.isInteger(index) && index >= 0); }

function requiredCollectSymbols(level) {
  return [...new Set((level?.goals || []).filter((goal) => goal.type === "collect" && SYMBOL_BY_ID[goal.symbol]).map((goal) => goal.symbol))];
}

function getLevelSymbolSet(level) {
  const required = requiredCollectSymbols(level);
  const source = SYMBOLS.map((item) => item.id);
  const requested = Math.max(3, Math.min(source.length, Number(level?.symbolCount || 6)));
  const pool = source.slice(0, requested);
  for (const symbol of required) {
    if (pool.includes(symbol)) continue;
    let slot = -1;
    for (let index = pool.length - 1; index >= 0; index -= 1) {
      if (!required.includes(pool[index])) { slot = index; break; }
    }
    if (slot >= 0) pool[slot] = symbol;
    else if (pool.length < source.length) pool.push(symbol);
  }
  return [...new Set(pool)];
}

const LEVEL_SHAPES = {
  1:"rect",2:"rect",3:"oval",4:"bowl",5:"diamond",6:"oval",7:"cross",8:"bowl",9:"diamond",10:"cross",
  11:"shield",12:"oval",13:"diamond",14:"bowl",15:"cross",16:"shield",17:"cross",18:"diamond",19:"bowl",20:"shield",
  21:"diamond",22:"cross",23:"bowl",24:"diamond",25:"shield",26:"cross",27:"bowl",28:"diamond",29:"shield",30:"cross"
};
const SHAPE_LABELS = { rect:"clásico", oval:"ovalado", bowl:"semicírculo", diamond:"rombo", cross:"cruz", shield:"escudo" };

function boardShapeFor(mode, level, difficulty) {
  if (mode === "free") {
    if (window.__bmtTimedRequested || window.__bmtTimedActive) return "rect";
    return difficulty === "hard" ? "cross" : difficulty === "medium" ? "bowl" : "oval";
  }
  return level?.shape || LEVEL_SHAPES[Number(level?.id || 1)] || "rect";
}

function makeActiveMask(shape, rows, cols, level = null) {
  const mask = new Array(rows * cols).fill(true); const cx = (cols - 1) / 2; const cy = (rows - 1) / 2;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const dx = Math.abs(col - cx); const dy = Math.abs(row - cy); let active = true;
      if (shape === "oval") active = ((col - cx) / Math.max(1, cols * .53)) ** 2 + ((row - cy) / Math.max(1, rows * .57)) ** 2 <= 1;
      else if (shape === "diamond") active = dx / Math.max(1, cols * .52) + dy / Math.max(1, rows * .55) <= 1;
      else if (shape === "cross") active = dx <= 1.55 || dy <= 1.15;
      else if (shape === "bowl") { const edge = dx / Math.max(1, cx); const minRow = Math.floor(edge * edge * Math.max(1, rows * .38)); active = row >= minRow; }
      else if (shape === "shield") { const t = rows <= 1 ? 0 : row / (rows - 1); const half = t < .42 ? cols * .46 : Math.max(1.35, cols * .46 - (t - .42) * cols * .52); active = dx <= half; }
      mask[row * cols + col] = active;
    }
  }
  for (const group of level?.blockers || []) for (const rawIndex of group.cells || []) { const index = Number(rawIndex); if (index < 0 || index >= mask.length) continue; mask[index] = true; const row = Math.floor(index / cols); const col = index % cols; for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) { const nr=row+dr,nc=col+dc; if(nr>=0&&nr<rows&&nc>=0&&nc<cols) mask[nr*cols+nc]=true; } }
  return mask;
}

function isActive(index) { return !runtime?.activeMask || runtime.activeMask[index] !== false; }
function isRelicCell(cell) { return Boolean(cell) && (cell.relic === true || String(cell.type || "").startsWith(RELIC_TYPE)); }
function isRelic(index) { return isRelicCell(runtime?.board?.[index]); }
// Ковчег двигают не рукой, а тем, что убирают из-под него, поэтому он выпадает
// и из свайпов, и из подсказок, и из проверки на мёртвое поле.
function canSwapActive(a, b) { return isActive(a) && isActive(b) && !isRelic(a) && !isRelic(b); }
function bottomActiveIndex(col) { for (let row = ROWS - 1; row >= 0; row -= 1) { const index = row * COLS + col; if (isActive(index)) return index; } return -1; }
function findPlayableMoves(board = runtime?.board, limit = Infinity) { return board ? Core.findMoves(board, ROWS, COLS, canSwapActive, limit) : []; }
function countPlayableMoves(board = runtime?.board, limit = Infinity) { return findPlayableMoves(board, limit).length; }
function findExcavationMove(board, rows, cols, moves, buried, preferNearby = false) {
  const targets = preferNearby ? [...buried].map((index) => Core.coordinates(index, cols)) : [];
  let bestMove = null;
  let mostLayers = 0;
  let nearbyMove = null;
  let closest = Infinity;
  for (const move of moves) {
    const [a, b] = move;
    const combo = Core.specialComboClearSet(board, a, b, rows, cols);
    const swapped = Core.swap(board, a, b);
    const hits = combo?.clearSet || Core.findMatches(swapped, rows, cols);
    if (preferNearby) {
      for (const index of hits) {
        const special = swapped[index]?.special;
        if (special === "lineH") Core.rowIndices(index, rows, cols).forEach((candidate) => hits.add(candidate));
        if (special === "lineV") Core.columnIndices(index, rows, cols).forEach((candidate) => hits.add(candidate));
        if (special === "burst") Core.areaIndices(index, 1, rows, cols).forEach((candidate) => hits.add(candidate));
      }
    }
    let layers = 0;
    for (const index of hits) {
      if (buried.has(index)) {
        if (!preferNearby) return move;
        layers += 1;
      }
    }
    if (layers > mostLayers) {
      mostLayers = layers;
      bestMove = move;
    }
    if (!preferNearby || mostLayers) continue;
    for (const index of hits) {
      const { row, col } = Core.coordinates(index, cols);
      for (const target of targets) {
        // Clearing below the dig site can move the pieces covering it.
        const distance = Math.abs(target.col - col) * 2 + Math.abs(target.row - row) + (row < target.row ? 3 : 0);
        if (distance >= closest) continue;
        closest = distance;
        nearbyMove = move;
      }
    }
  }
  return bestMove || nearbyMove;
}

function findPlayableHint(board = runtime?.board) {
  if (runtime.excavation?.buried.size) {
    const moves = findPlayableMoves(board);
    return findExcavationMove(board, ROWS, COLS, moves, runtime.excavation.buried, true) || moves[0] || null;
  }
  return findPlayableMoves(board, 1)[0] || null;
}

function createPlayableBoard(rows, cols, symbolIds, mask, required = [], relicCells = [], openingDigCells = null) {
  let fallback = null;
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const board = Core.createBoard(rows, cols, symbolIds);
    board.forEach((_, index) => { if (mask[index] === false) board[index] = null; });
    let relicNumber = 0;
    for (const index of relicCells) { if (mask[index] === false || !board[index]) continue; board[index] = { type: `${RELIC_TYPE}${relicNumber += 1}`, special: null, relic: true }; }
    const hasRequired = required.every((symbol) => board.reduce((count, cell) => count + (cell?.type === symbol ? 1 : 0), 0) >= 3);
    const startMoves = Core.findMoves(board, rows, cols, (a,b) => mask[a] !== false && mask[b] !== false && !isRelicCell(board[a]) && !isRelicCell(board[b]), openingDigCells ? Infinity : MIN_START_MOVES);
    if (!hasRequired || Core.findMatches(board, rows, cols).length || startMoves.length < MIN_START_MOVES) continue;
    if (!openingDigCells || findExcavationMove(board, rows, cols, startMoves, openingDigCells)) return board;
    fallback = board;
    if (attempt >= 24) return fallback;
  }
  if (fallback) return fallback;
  throw new Error(`Could not generate a shaped board with ${MIN_START_MOVES} starting moves`);
}

function reshufflePlayable() {
  const required = runtime.mode === "level" ? requiredCollectSymbols(runtime.level) : [];
  const specials = runtime.board.filter((cell) => cell?.special).map((cell) => cell.special);
  // Перемешивание не должно телепортировать ковчег: он остаётся там, куда упал.
  const relicCells = runtime.board.map((cell, index) => (isRelicCell(cell) ? index : -1)).filter((index) => index >= 0);
  const fresh = createPlayableBoard(ROWS, COLS, runtime.symbolIds, runtime.activeMask, required, relicCells);
  for (const special of specials) {
    const available = fresh.map((cell,index) => (cell && !cell.special && !isRelicCell(cell) ? index : -1)).filter((index) => index >= 0);
    if (!available.length) break;
    fresh[available[Math.floor(Math.random() * available.length)]].special = special;
  }
  return fresh;
}

function pickChallengeCells(count, offset, used) {
  const active = runtime.activeMask.map((on,index) => on && runtime.board[index] ? index : -1).filter((index) => index >= 0 && !used.has(index));
  const result = [];
  for (let n = 0; n < count && active.length; n += 1) {
    const slot = Math.floor(((n + .5) * active.length / Math.max(1, count) + offset * 3)) % active.length;
    let index = active[slot]; let probe = 0;
    while (used.has(index) && probe < active.length) { index = active[(slot + ++probe) % active.length]; }
    if (!used.has(index)) { used.add(index); result.push(index); }
  }
  return result;
}

function freeChallengeConfig(difficulty) {
  if (window.__bmtTimedRequested || window.__bmtTimedActive || difficulty === "easy") return null;
  const used = new Set();
  if (difficulty === "medium") return { blockers:[
    { type:"chain", cells:pickChallengeCells(6,1,used), layers:1 },
    { type:"tablet", cells:pickChallengeCells(4,3,used), layers:1 }
  ] };
  return { blockers:[
    { type:"chain", cells:pickChallengeCells(8,1,used), layers:2 },
    { type:"tablet", cells:pickChallengeCells(6,4,used), layers:2 },
    { type:"lamp", cells:pickChallengeCells(4,7,used), layers:1 }
  ] };
}

function resolveBoardRows(mode, level, difficulty) {
  const requested = mode === "level" ? Number(level?.rows || runtime?.levelConfig?.rows || 8) : Number(FREE_MODES[difficulty]?.rows || 8);
  return Math.max(5, Math.min(8, Number.isFinite(requested) ? Math.round(requested) : 8));
}

function currentSymbolAsset(id) {
  const symbol = SYMBOL_BY_ID[id];
  if (!symbol) return "";
  const key = id === "lamp" ? "candle" : id;
  return window.BiblicalMatchThreeV5Art?.symbols?.[key] || window.BiblicalMatchThreeV4Art?.symbols?.[key] || symbol.asset;
}

function currentBlockerAsset(type) {
  const obstacles = window.BiblicalMatchThreeV5Art?.obstacles || window.BiblicalMatchThreeV4Art?.obstacles || {};
  const key = type === "chain" ? "chains" : type === "tablet" ? "tablets" : type === "lamp" ? "candle" : type === "vine" ? "vine" : "";
  return key ? (obstacles[key] || "") : "";
}

// У ковчега завета своя модель: рядовой «Ковчег» — это ковчег Ноя, и на доске
// их было не различить.
function currentRelicAsset() {
  const relics = window.BiblicalMatchThreeV5Art?.relics || {};
  return relics.covenantArk || "web/assets/biblical-match-three/icons-v17/covenant-ark.webp";
}

function cleanup() {
  window.BiblicalMatchThreeV10?.cleanup?.();
  if (!runtime) return;
  if (runtime.hintTimer) clearTimeout(runtime.hintTimer);
  clearTimeout(runtime.dropTimer);
  cancelExcavationFlights();
  runtime.abort?.abort();
  if (runtime.mode === "free" && runtime.screen === "board") {
    try { persistFreeRecord(false); } catch {}
  }
  document.querySelectorAll("body > .bmt-sheet-overlay, body > .bmt-result-overlay, body > .bmt-pause-overlay, body > .bmt-tutorial").forEach((node) => node.remove());
  runtime = null;
  delete document.body.dataset.matchThree;
}

function exitToAppMenu() {
  cleanup();
  (window.appGoToMainMenu || window.goToMainMenu)?.();
}

function starBalance() { return Progress.getStars(); }

function setBusy(value) {
  if (!runtime) return;
  runtime.busy = Boolean(value);
  document.querySelector(".bmt-shell")?.classList.toggle("is-busy", runtime.busy);
}

function toast(message, tone = "default") {
  if (!runtime) return;
  const shell = document.querySelector(".bmt-shell");
  if (!shell) return;
  const node = el("div", `bmt-toast bmt-toast--${tone}`, message);
  shell.append(node);
  requestAnimationFrame(() => node.classList.add("is-visible"));
  setTimeout(() => { node.classList.remove("is-visible"); setTimeout(() => node.remove(), 220); }, 1700);
}

function walletBadge() {
  const wrap = el("div", "bmt-wallet");
  wrap.innerHTML = `<span aria-hidden="true">★</span><strong data-bmt-wallet>${starBalance()}</strong>`;
  wrap.setAttribute("aria-label", `Saldo ${starBalance()} estrellas`);
  return wrap;
}

function updateWallet() {
  const balance = starBalance();
  document.querySelectorAll("[data-bmt-wallet]").forEach((node) => { node.textContent = String(balance); });
  document.querySelectorAll(".bmt-wallet").forEach((node) => { node.setAttribute("aria-label", `Saldo ${balance} estrellas`); });
  document.querySelectorAll("[data-bmt-pre-balance]").forEach((node) => { node.textContent = `${balance} ★`; });
}
function goalText(goal) {
  if (goal.type === "score") return `Consigue ${Number(goal.count).toLocaleString("es")} puntos`;
  if (goal.type === "collect") return `Reúne «${SYMBOL_BY_ID[goal.symbol]?.label || goal.symbol}» ×${goal.count}`;
  if (goal.type === "clearBlockers") return `Elimina «${BLOCKER_META[goal.blocker]?.label || goal.blocker}» ×${goal.count}`;
  if (goal.type === "lightLamps") return `Enciende las lámparas ×${goal.count}`;
  if (goal.type === "activateSpecials") return `Activa fichas especiales ×${goal.count}`;
  if (goal.type === "cascade") return `Alcanza una cascada ×${goal.count}`;
  if (goal.type === "deliver") return `Baja el arca ×${goal.count}`;
  if (goal.type === "excavate") return `Раскопать сокровища ×${goal.count}`;
  return "Cumple el objetivo";
}

function goalIcon(goal) {
  if (goal.type === "score") return "★";
  if (goal.type === "collect") return `<img src="${currentSymbolAsset(goal.symbol)}" alt="">`;
  if (goal.type === "clearBlockers") return BLOCKER_META[goal.blocker]?.icon || "▦";
  if (goal.type === "lightLamps") return "✦";
  if (goal.type === "activateSpecials") return "✺";
  if (goal.type === "cascade") return "↯";
  if (goal.type === "deliver") return `<img src="${currentRelicAsset()}" alt="">`;
  if (goal.type === "excavate") return `<img src="${treasureArt("chest")}" alt="">`;
  return "•";
}

function currentGoalValue(goal) {
  if (!runtime) return 0;
  if (goal.type === "score") return runtime.score;
  if (goal.type === "collect") return Number(runtime.collected[goal.symbol] || 0);
  if (goal.type === "clearBlockers") return blockerClearedCount(goal.blocker);
  if (goal.type === "lightLamps") return lampLitCount();
  if (goal.type === "activateSpecials") return runtime.specialsActivated;
  if (goal.type === "cascade") return runtime.maxCascade;
  if (goal.type === "deliver") return runtime.relicsDelivered;
  if (goal.type === "excavate") return runtime.excavation?.found || 0;
  return 0;
}

function goalComplete(goal) { return currentGoalValue(goal) >= Number(goal.count || 0); }
function allGoalsComplete() { return runtime?.level?.goals?.every(goalComplete) || false; }

function canOpenLevel(level) {
  return reopeningPreview || level.id <= runtime.progress.unlocked;
}

function currentCampaignLevel() {
  if (!reopeningPreview) return runtime.progress.unlocked;
  const saved = runtime.levels.find((level) => level.id === runtime.progress.campaignLevel);
  if (saved) return saved.id;
  const completed = runtime.levels.findLastIndex((level) => Number(runtime.progress.levelRatings?.[level.id]) > 0);
  return runtime.levels[Math.min(completed + 1, runtime.levels.length - 1)].id;
}

async function start(levelsUrl, { levelId } = {}) {
  if(window.SabbathAccess&&!window.SabbathAccess.authorize("biblical-match-three"))return;
  cleanup();
  const container = document.getElementById("game-container");
  if (!container) return;
  runtime = {
    abort: new AbortController(), levels: [], levelConfig: {}, progress: Progress.load(), screen: "loading", board: [], tileNodes: [], selected: null, busy: false,
    score: 0, moves: 0, collected: {}, mode: null, level: null, difficulty: null, symbolIds: [], hintTimer: null, lastSwap: null, cascade: 0, maxCascade: 1,
    specialsActivated: 0, blockers: new Map(), initialBlockerCounts: {}, blockerCleared: {}, relicsDelivered: 0, relicTotal: 0, vineGrow: 0, vineCap: 0, vineTurns: 0, preBoosters: new Set(), activeBooster: null, freeSessionReward: 0, freeStarted: false, lastGoalSnapshot: new Map(), activeMask: [], boardShape: "rect",
  };
  const session = runtime;
  document.body.dataset.matchThree = "2";
  try {
    const response = await fetch(levelsUrl, { signal: session.abort.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if(runtime!==session||session.abort.signal.aborted)return;
    if(window.SabbathAccess&&!window.SabbathAccess.authorize("biblical-match-three"))return;
    runtime.levelConfig = data;
    runtime.levels = Array.isArray(data.levels) ? data.levels : [];
    if (!runtime.levels.length) throw new Error("Sin niveles");
    renderMenu();
    const requested = runtime.levels.find((level) => level.id === levelId && canOpenLevel(level));
    if (requested) openPreLevel(requested);
  } catch (error) {
    if(runtime!==session||session.abort.signal.aborted)return;
    console.error("Biblical match-three v2 data error", error);
    container.innerHTML = `<section class="bmt-error"><div class="bmt-error__icon">!</div><h2>No se pudo abrir el juego</h2><p>Los datos de niveles no están disponibles o están dañados.</p><button type="button" class="bmt-primary" id="bmt-error-back">Al menú</button></section>`;
    document.getElementById("bmt-error-back")?.addEventListener("click", exitToAppMenu, { once: true });
  }
}

function renderMenu() {
  if (!runtime) return;
  cancelExcavationFlights();
  persistFreeRecord(false); clearHint(); runtime.screen = "menu"; runtime.mode = null; runtime.activeBooster = null; setBusy(false); runtime.progress = Progress.load();
  const container = document.getElementById("game-container"); container.innerHTML = "";
  const shell = el("section", "bmt-shell bmt-menu bmt-v2");
  const top = el("header", "bmt-homebar");
  const back = button("←", "bmt-icon-button", exitToAppMenu); back.setAttribute("aria-label", "Atrás");
  const title = el("div", "bmt-heading-wrap"); title.innerHTML = `<p class="bmt-kicker">Rompecabezas bíblico</p><h2 class="bmt-title">Combina 3</h2>`;
  top.append(back, title, walletBadge()); shell.append(top);
  const hero = el("section", "bmt-hero-v2");
  hero.innerHTML = `<div class="bmt-hero-v2__glow"></div><div class="bmt-hero-v2__icon"><img src="web/assets/biblical-match-three/bible.svg" alt=""></div><div class="bmt-hero-v2__copy"><span class="bmt-hero-v2__eyebrow">Camino, símbolos y combinaciones</span><strong>Reúne, crea potenciadores y supera desafíos</strong><span>${runtime.levels.length} niveles · fichas especiales · potenciadores bíblicos</span></div>`;
  shell.append(hero, renderDailyBlessing(), renderCampaignMap(), renderFreeModePanel());
  container.append(shell);
}

function renderDailyBlessing() {
  const claimable = Progress.canClaimDaily(runtime.progress);
  const amount = Number(runtime.levelConfig.dailyReward || 5);
  const card = el("section", `bmt-daily${claimable ? " is-ready" : ""}`);
  card.innerHTML = `<div class="bmt-daily__seal">✦</div><div class="bmt-daily__copy"><span>${claimable ? "Regalo diario listo" : "Regalo diario recibido"}</span><strong>${claimable ? `Bendición diaria · +${amount} ★` : "Vuelve mañana para conseguir más estrellas"}</strong></div>`;
  const claim = button(claimable ? `Recibir +${amount} ★` : "Recibido", "bmt-daily__button", () => {
    const result = Progress.claimDaily(runtime.progress, amount); runtime.progress = result.progress;
    if (result.ok) { updateWallet(); FX.haptic?.("success"); toast(`+${result.amount} ★ al saldo compartido`, "success"); renderMenu(); }
  });
  claim.disabled = !claimable; card.append(claim); return card;
}

function renderCampaignMap() {
  const panel = el("section", "bmt-panel-v2 bmt-campaign");
  const currentLevel = currentCampaignLevel();
  const totalRatings = Object.values(runtime.progress.levelRatings || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  panel.innerHTML = `<div class="bmt-section-head"><div><span class="bmt-section-kicker">Campaña</span><h3>Camino de la Luz</h3></div><div class="bmt-section-summary"><strong>${totalRatings}</strong><span>/ ${runtime.levels.length * 3} ★</span></div></div>`;
  const map = el("div", "bmt-map"); let chapter = "";
  runtime.levels.forEach((level, index) => {
    if (level.chapter !== chapter) { chapter = level.chapter; const chapterNode = el("div", "bmt-map__chapter"); chapterNode.innerHTML = `<span>${escapeHtml(chapter)}</span>`; map.append(chapterNode); }
    const unlocked = canOpenLevel(level); const rating = Number(runtime.progress.levelRatings?.[String(level.id)] || 0);
    const node = button("", `bmt-map-node ${index % 2 ? "is-right" : "is-left"}${unlocked ? "" : " is-locked"}${level.id === currentLevel ? " is-current" : ""}`, () => { if (unlocked) openPreLevel(level); });
    node.disabled = !unlocked;
    node.innerHTML = `<span class="bmt-map-node__route" aria-hidden="true"></span><span class="bmt-map-node__medallion">${unlocked ? level.id : "◆"}</span><span class="bmt-map-node__body"><strong>${escapeHtml(level.title)}</strong><span>${unlocked ? `${"★".repeat(rating)}${"☆".repeat(3 - rating)}` : "Cerrada"}</span></span>`;
    map.append(node);
  });
  panel.append(map); return panel;
}

function renderFreeModePanel() {
  const panel = el("section", "bmt-panel-v2 bmt-free-panel");
  panel.innerHTML = `<div class="bmt-section-head"><div><span class="bmt-section-kicker">Récords</span><h3>Juego libre</h3></div><p>Los nuevos récords desbloquean recompensas ★</p></div>`;
  const grid = el("div", "bmt-free-grid");
  for (const [key, config] of Object.entries(FREE_MODES)) {
    const stats = runtime.progress.free?.[key] || {};
    const card = button("", `bmt-free-card bmt-free-card--${config.accent}`, () => beginFree(key));
    card.innerHTML = `<span class="bmt-free-card__mode">${config.label}</span><strong>${Number(stats.bestScore || 0).toLocaleString("es")}</strong><span class="bmt-free-card__record">mejor puntuación</span><div class="bmt-free-card__meta"><span>↯ ×${Math.max(1, Number(stats.bestCascade || 1))}</span><span>✺ ${Number(stats.bestSpecials || 0)}</span><span>▶ ${Number(stats.games || 0)}</span></div><span class="bmt-free-card__cta">Jugar →</span>`;
    grid.append(card);
  }
  panel.append(grid); return panel;
}

function openPreLevel(level) {
  if (!runtime) return;
  runtime.preBoosters = new Set();
  const shell = document.querySelector(".bmt-shell"); if (!shell) return;
  const overlay = el("div", "bmt-sheet-overlay"); const sheet = el("section", "bmt-sheet bmt-prelevel"); const reward = Number(level.reward || 0);
  const previewRows = resolveBoardRows("level", level, null);
  sheet.innerHTML = `<button type="button" class="bmt-sheet__close" aria-label="Cerrar">×</button><div class="bmt-prelevel__head"><span>Nivel ${level.id}</span><h3>${escapeHtml(level.title)}</h3><p>Tablero ${previewRows}×${COLS} · recompensa por completarlo por primera vez: <strong>+${reward} ★</strong></p></div><div class="bmt-prelevel__goals">${level.goals.map((goal) => `<div><span>${goalIcon(goal)}</span><strong>${escapeHtml(goalText(goal))}</strong></div>`).join("")}</div><div class="bmt-prelevel__boost-title"><span>Potenciadores antes de empezar</span><span class="bmt-prelevel__boost-meta"><small>Disponible <strong data-bmt-pre-balance>${starBalance()} ★</strong></small><small>Seleccionado <strong data-bmt-pre-total>0 ★</strong></small></span></div><div class="bmt-preboosters"></div>`;
  if (level.excavation) sheet.querySelector(".bmt-prelevel__goals").after(excavationGuide());
  const boosters = sheet.querySelector(".bmt-preboosters"); let startButton;
  const selectedCost = () => [...runtime.preBoosters].reduce((sum, key) => sum + PRE_BOOSTERS[key].cost, 0);
  const refreshBoosters = () => {
    const balance = starBalance(); const total = selectedCost();
    const balanceNode = sheet.querySelector("[data-bmt-pre-balance]");
    const totalNode = sheet.querySelector("[data-bmt-pre-total]");
    if (balanceNode) balanceNode.textContent = `${balance} ★`;
    if (totalNode) totalNode.textContent = `${total} ★`;
    boosters.querySelectorAll("[data-bmt-pre-booster]").forEach((node) => {
      const id = node.dataset.bmtPreBooster; const selected = runtime.preBoosters.has(id);
      const unaffordable = !selected && total + PRE_BOOSTERS[id].cost > balance;
      node.classList.toggle("is-selected", selected); node.classList.toggle("is-unaffordable", unaffordable);
      node.setAttribute("aria-pressed", String(selected)); node.setAttribute("aria-disabled", String(unaffordable));
    });
    if (startButton) {
      startButton.disabled = total > balance;
      startButton.classList.toggle("is-disabled", startButton.disabled);
    }
  };
  for (const [id, booster] of Object.entries(PRE_BOOSTERS)) {
    const node = button("", "bmt-prebooster", () => {
      if (runtime.preBoosters.has(id)) runtime.preBoosters.delete(id);
      else if (selectedCost() + booster.cost <= starBalance()) runtime.preBoosters.add(id);
      else { FX.haptic?.("error"); toast(`No hay suficientes estrellas. Disponibles: ${starBalance()} ★`, "error"); }
      refreshBoosters();
    });
    node.dataset.bmtPreBooster = id; node.setAttribute("aria-pressed", "false");
    node.innerHTML = `<span class="bmt-prebooster__icon"><img src="${booster.asset}" alt=""></span><span class="bmt-prebooster__copy"><strong>${escapeHtml(booster.label)}</strong><small>${escapeHtml(booster.desc)}</small></span><span class="bmt-prebooster__price">${booster.cost} ★</span>`;
    boosters.append(node);
  }
  const actions = el("div", "bmt-prelevel__actions");
  const cancel = button("Atrás", "bmt-secondary", () => overlay.remove());
  startButton = button("Empezar nivel", "bmt-primary bmt-primary--large", () => {
    const total = selectedCost();
    const selectedBoosters = new Set(runtime.preBoosters);
    let spent = false;
    if (total > 0) {
      const spend = Progress.spendStars(total, `match3-preboost-level-${level.id}`);
      if (!spend.ok) { FX.haptic?.("error"); toast("No hay suficientes estrellas", "error"); return; }
      spent = true;
    }
    try {
      beginLevel(level, selectedBoosters);
      if (spent) selectedBoosters.forEach((id) => { runtime.progress = Progress.noteBoosterUse(runtime.progress, id); });
      updateWallet(); overlay.remove();
    } catch (error) {
      if (spent) Progress.addStars(total, `match3-preboost-refund-level-${level.id}`);
      window.AppErrorBoundary?.report?.(error, { kind:"prelevel-booster", source:"biblical-match-three.js", fatal:false });
      FX.haptic?.("error"); overlay.remove(); renderMenu();
      setTimeout(() => { openPreLevel(level); toast("No se pudo aplicar el potenciador — estrellas devueltas", "error"); }, 0);
    }
  });
  actions.append(cancel, startButton); sheet.append(actions); overlay.append(sheet); shell.append(overlay);
  refreshBoosters();
  sheet.querySelector(".bmt-sheet__close").addEventListener("click", () => overlay.remove(), { once: true });
}

function beginLevel(level, selectedBoosters = new Set()) {
  setupBoard({ mode: "level", level, difficulty: null, symbolIds: getLevelSymbolSet(level), moves: Number(level.moves || 24), selectedBoosters });
  if (reopeningPreview) runtime.progress = Progress.save({ ...Progress.load(), campaignLevel: level.id });
}

function beginFree(difficulty) {
  runtime.progress = Progress.beginFreeRun(runtime.progress, difficulty); runtime.freeStarted = true;
  const timed = Boolean(window.__bmtTimedRequested || window.__bmtTimedActive);
  setupBoard({ mode: "free", level: null, difficulty, symbolIds: getSymbolSet(FREE_MODES[difficulty]?.symbolCount || 7), moves: timed ? Infinity : Number(FREE_MODES[difficulty]?.moves || 30), selectedBoosters: new Set() });
}

function initBlockers(level) {
  runtime.blockers = new Map(); runtime.initialBlockerCounts = {}; runtime.blockerCleared = {};
  runtime.vineGrow = 0; runtime.vineCap = 0; runtime.vineTurns = 0;
  for (const group of level?.blockers || []) {
    const type = group.type;
    if (type === "vine") {
      const seeded = (group.cells || []).length;
      runtime.vineGrow = Math.max(1, Number(group.grow || 2));
      runtime.vineCap = Math.max(seeded, Number(group.max || seeded * 2));
    }
    for (const index of group.cells || []) {
      runtime.blockers.set(Number(index), { type, layers: Math.max(1, Number(group.layers || 1)), maxLayers: Math.max(1, Number(group.layers || 1)), lit: false });
      runtime.initialBlockerCounts[type] = (runtime.initialBlockerCounts[type] || 0) + 1;
    }
  }
}

function applyLevelGoalSpecials(level) {
  const goal = level?.goals?.find((item) => item.type === "activateSpecials");
  if (!goal) return 0;
  const target = Math.min(10, Math.ceil(Math.max(2, Number(goal.count || 0)) / 2) * 2);
  const used = new Set(); let placed = 0;
  const available = (index) => isActive(index) && runtime.board[index] && !runtime.board[index].special && !isRelicCell(runtime.board[index]) && !runtime.blockers.has(index) && !used.has(index);
  const pairs = [];
  for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS - 1; col += 1) pairs.push([row * COLS + col, row * COLS + col + 1]);
  for (let col = 0; col < COLS; col += 1) for (let row = 0; row < ROWS - 1; row += 1) pairs.push([row * COLS + col, (row + 1) * COLS + col]);
  for (const [a, b] of pairs) {
    if (placed >= target) break;
    if (!available(a) || !available(b)) continue;
    runtime.board[a].special = "lineH"; runtime.board[b].special = "lineV";
    used.add(a); used.add(b); placed += 2;
  }
  runtime.seededGoalSpecials = placed;
  return placed;
}

function excavationGuide(treasures = []) {
  const guide = el("div", "bmt-dig-guide");
  guide.innerHTML = '<div class="bmt-dig-instruction"><strong>Tesoros antiguos</strong><small>Собирайте комбинации на земле, чтобы открыть части находки. Раскопайте предмет целиком, чтобы забрать его.</small></div>';
  if (treasures.length) {
    const inventory = el("div", "bmt-dig-found");
    const title = el("strong", "bmt-dig-found-title");
    title.textContent = "Найденные";
    const list = el("div", "bmt-dig-inventory");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Найденные сокровища");
    for (const treasure of treasures) {
      const name = TREASURE_LABELS[treasure.type];
      const item = el("span", "bmt-dig-item");
      item.dataset.treasure = treasure.id;
      item.title = name;
      item.innerHTML = `<span class="bmt-dig-slot"><img src="${treasureArt(treasure.type)}" alt=""></span><small>0/${treasure.size}</small>`;
      item.setAttribute("aria-label", `${name}, открыто 0 из ${treasure.size} клеток`);
      list.append(item);
    }
    inventory.append(title, list);
    guide.append(inventory);
  }
  return guide;
}

function excavationMarker({ treasure, x, y }) {
  const marker = el("span", "bmt-dig-marker");
  marker.setAttribute("aria-hidden", "true");
  const fragment = el("span", "bmt-dig-fragment");
  const asset = new URL(treasureArt(treasure.type), document.baseURI);
  fragment.style.setProperty("--bmt-dig-art", `url("${asset.href}")`);
  fragment.style.setProperty("--bmt-dig-art-width", `calc(${treasure.width * 100}% + ${treasure.width - 1} * var(--bmt-dig-gap))`);
  fragment.style.setProperty("--bmt-dig-art-height", `calc(${treasure.height * 100}% + ${treasure.height - 1} * var(--bmt-dig-gap))`);
  fragment.style.setProperty("--bmt-dig-art-x", `calc(${-x * 100}% - ${x} * var(--bmt-dig-gap))`);
  fragment.style.setProperty("--bmt-dig-art-y", `calc(${-y * 100}% - ${y} * var(--bmt-dig-gap))`);
  marker.append(fragment, el("small", "bmt-dig-depth"));
  return marker;
}

function updateExcavationEdges(excavation) {
  const offsets = [["top", 0, -1], ["right", 1, 0], ["bottom", 0, 1], ["left", -1, 0]];
  for (const [index, cell] of excavation.cells) {
    const tile = runtime.tileNodes[index];
    if (cell.depth || cell.treasure.uncovered === cell.treasure.size) continue;
    tile.dataset.digEdges = offsets.filter(([, dx, dy]) => {
      if (cell.x + dx < 0 || cell.x + dx >= cell.treasure.width) return true;
      const neighbor = excavation.cells.get(index + dx + dy * COLS);
      return neighbor?.treasure !== cell.treasure || neighbor.depth > 0;
    }).map(([edge]) => edge).join(" ");
  }
}

function cancelExcavationFlights() {
  const flights = runtime.digFlights;
  if (!flights) return;
  for (const animation of flights.keys()) animation.cancel();
  flights.clear();
}

function flyExcavationTreasure(treasure, item) {
  if (FX.prefersReducedMotion?.() || typeof item.animate !== "function") return;
  const first = runtime.tileNodes[treasure.origin].getBoundingClientRect();
  const lastIndex = treasure.origin + (treasure.height - 1) * COLS + treasure.width - 1;
  const last = runtime.tileNodes[lastIndex].getBoundingClientRect();
  const icon = item.querySelector("img");
  const target = icon.getBoundingClientRect();
  if (!first.width || !target.width || target.bottom <= 0 || target.top >= window.innerHeight) return;

  const width = last.right - first.left;
  const height = last.bottom - first.top;
  const dx = target.left + target.width / 2 - (first.left + width / 2);
  const dy = target.top + target.height / 2 - (first.top + height / 2);
  const shrink = Math.min(target.width / width, target.height / height);
  const flyer = icon.cloneNode();
  flyer.className = "bmt-dig-flight";
  flyer.setAttribute("aria-hidden", "true");
  Object.assign(flyer.style, { left: `${first.left}px`, top: `${first.top}px`, width: `${width}px`, height: `${height}px` });
  item.classList.add("is-arriving");
  document.body.append(flyer);
  const animation = flyer.animate([
    { opacity: 1, transform: "translateY(0) scale(.91)" },
    { offset: .27, opacity: 1, transform: `translate(${dx * .14}px, ${dy * .22 - 13}px) scale(.8)` },
    { opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(${shrink})` },
  ], { duration: window.GameDisplay?.get().animations === "high" ? 630 : 500, easing: "cubic-bezier(.23,.76,.24,1)", fill: "both" });
  const flights = runtime.digFlights;
  const land = () => {
    flights.delete(animation);
    flyer.remove();
    item.classList.remove("is-arriving");
  };
  flights.set(animation, animation.finished.then(land, land));
}

function setupBoard({ mode, level, difficulty, symbolIds, moves, selectedBoosters }) {
  cancelExcavationFlights();
  runtime.digFlights = new Map();
  clearHint(); runtime.screen = "board"; runtime.mode = mode; runtime.level = level; runtime.difficulty = difficulty; runtime.symbolIds = symbolIds;
  clearTimeout(runtime.dropTimer);
  runtime.dropTiles = [];
  runtime.renderedSelection = null;
  ROWS = resolveBoardRows(mode, level, difficulty); runtime.boardShape = boardShapeFor(mode, level, difficulty); runtime.activeMask = makeActiveMask(runtime.boardShape, ROWS, COLS, level);
  const relicCells = mode === "level" ? levelRelicCells(level) : [];
  runtime.relicTotal = relicCells.length; runtime.relicsDelivered = 0;
  runtime.excavation = level?.excavation
    ? Core.createExcavation(level.excavation, ROWS, COLS, runtime.activeMask) : null;
  runtime.board = createPlayableBoard(ROWS, COLS, symbolIds, runtime.activeMask,
    mode === "level" ? requiredCollectSymbols(level) : [], relicCells, runtime.excavation?.buried);
  runtime.score = 0; runtime.moves = moves; runtime.collected = {}; runtime.selected = null; runtime.cascade = 0; runtime.maxCascade = 1; runtime.specialsActivated = 0; runtime.seededGoalSpecials = 0; runtime.lastSwap = null; runtime.tileNodes = []; runtime.activeBooster = null; runtime.freeSessionReward = 0; runtime.lastGoalSnapshot = new Map();
  // Ковчег на закрытой клетке фигурного поля не появится, поэтому цель считают
  // по тому, сколько их реально встало на доску.
  runtime.relicTotal = runtime.board.filter(isRelicCell).length;
  initBlockers(mode === "free" ? freeChallengeConfig(difficulty) : level); if (mode === "level") applyLevelGoalSpecials(level); applyPreBoosters(selectedBoosters || new Set());
  const container = document.getElementById("game-container"); container.innerHTML = ""; const shell = el("section", "bmt-shell bmt-board-screen bmt-v2");
  const top = el("header", "bmt-gamebar"); const back = button("←", "bmt-icon-button", () => runtime.mode === "free" ? openFreeExit() : openPause()); back.setAttribute("aria-label", runtime.mode === "free" ? "Terminar juego libre" : "Pausa");
  const heading = el("div", "bmt-heading-wrap"); heading.innerHTML = `<p class="bmt-kicker">${mode === "level" ? `Nivel ${level.id}` : `Juego libre · ${FREE_MODES[difficulty].label}`}</p><h2 class="bmt-title">${escapeHtml(mode === "level" ? level.title : "Modo récord")}</h2>`;
  top.append(back, heading, walletBadge()); shell.append(top);
  const stats = el("section", "bmt-stats-v2"); stats.innerHTML = `<div><span>Puntos</span><strong id="bmt-score">0</strong>${mode === "free" ? '<small id="bmt-best">récord 0</small>' : ""}</div><div><span>Movimientos</span><strong id="bmt-moves">${Number.isFinite(moves) ? moves : "∞"}</strong><small>restantes</small></div><div><span>Cascada</span><strong id="bmt-cascade">×1</strong><small id="bmt-special-count">0 especiales</small></div>`; shell.append(stats);
  if (mode === "level") { const goals = el("section", "bmt-goals-v2"); goals.id = "bmt-goals"; shell.append(goals); }
  if (runtime.excavation) shell.append(excavationGuide(runtime.excavation.treasures));
  const boardWrap = el("section", "bmt-board-wrap"); const board = el("div", "bmt-board"); board.setAttribute("role", "grid"); board.setAttribute("aria-label", `Tablero ${ROWS} en ${COLS}`); board.style.setProperty("--bmt-rows", String(ROWS)); board.style.setProperty("--bmt-cols", String(COLS)); board.style.setProperty("--bmt-board-ratio", `${COLS} / ${ROWS}`); board.dataset.rows = String(ROWS); board.dataset.cols = String(COLS); board.dataset.shape = runtime.boardShape; board.dataset.activeCells = String(runtime.activeMask.filter(Boolean).length); board.dataset.startMoves = String(countPlayableMoves(runtime.board));
  if (runtime.excavation) board.classList.add("has-excavation");
  for (let index = 0; index < ROWS * COLS; index += 1) {
    const tile = el("button", "bmt-tile"); tile.type = "button"; tile.dataset.index = String(index); tile.setAttribute("role", "gridcell");
    const active = isActive(index); tile.classList.toggle("is-hole", !active); tile.disabled = !active; if (!active) { tile.tabIndex = -1; tile.setAttribute("aria-hidden", "true"); }
    const piece = el("span", "bmt-piece-wrap"); const img = new Image(); img.className = "bmt-piece"; img.draggable = false; img.decoding = "async"; img.alt = ""; piece.append(img); tile.append(piece, el("span", "bmt-special-mark"), el("span", "bmt-blocker"));
    const digCell = runtime.excavation?.cells.get(index);
    if (digCell) tile.prepend(excavationMarker(digCell));
    tile.addEventListener("click", () => chooseTile(index), { signal: runtime.abort.signal }); runtime.tileNodes.push(tile); board.append(tile);
  }
  board.addEventListener("bmt:swipe", ({ detail }) => {
    if (runtime.busy || runtime.activeBooster || !Core.areAdjacent(detail.from, detail.to, COLS)) return;
    clearHint();
    runtime.selected = null;
    updateSelection();
    trySwap(detail.from, detail.to);
  }, { signal: runtime.abort.signal });
  if (runtime.relicTotal) { board.classList.add("has-relic-gate"); for (let col = 0; col < COLS; col += 1) { const gate = bottomActiveIndex(col); if (gate >= 0) runtime.tileNodes[gate]?.classList.add("is-relic-gate"); } }
  boardWrap.append(board); shell.append(boardWrap);
  const boosters = el("section", "bmt-booster-tray"); boosters.innerHTML = `<div class="bmt-booster-tray__label"><span>Ayuda</span><small>por estrellas</small></div>`;
  for (const [id, booster] of Object.entries(IN_BOOSTERS)) {
    const node = button("", "bmt-booster", () => activateBooster(id)); node.dataset.booster = id; node.innerHTML = `<span class="bmt-booster__icon"><img src="${booster.asset}" alt=""></span><span class="bmt-booster__name">${escapeHtml(booster.label)}</span><span class="bmt-booster__cost">${booster.cost} ★</span>`; boosters.append(node);
  }
  shell.append(boosters);
  const actions = el("div", "bmt-actions-v2"); const hint = button("Pista", "bmt-action-button", showHint); hint.innerHTML = `<span>✦</span><strong>Pista</strong>`; const pauseButton = button(mode === "free" ? "Terminar" : "Pausa", "bmt-action-button", mode === "free" ? openFreeExit : openPause); pauseButton.innerHTML = `<span>${mode === "free" ? "✓" : "Ⅱ"}</span><strong>${mode === "free" ? "Terminar" : "Pausa"}</strong>`; actions.append(hint, pauseButton); shell.append(actions);
  container.append(shell); updateAllTiles(); updateHud(); animateEntrance(); scheduleHint();
  if (runtime.seededGoalSpecials > 0) setTimeout(() => toast("Las fichas especiales ya están en el tablero: desliza la que quieras", "info"), 560);
  if (!runtime.progress.tutorialSeen?.["v18-first-run"]) setTimeout(showTutorial, 420);
}

function applyPreBoosters(selected) {
  if (!selected?.size) return;
  const randomEmpty = () => {
    const candidates = runtime.board
      .map((cell, index) => (cell && !cell.special && !isRelicCell(cell) && isActive(index) && !runtime.blockers.has(index) ? index : -1))
      .filter((index) => index >= 0);
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : -1;
  };
  if (selected.has("manna")) { const a = randomEmpty(); if (a >= 0) runtime.board[a].special = "lineH"; const b = randomEmpty(); if (b >= 0) runtime.board[b].special = "lineV"; }
  if (selected.has("lampOil")) { const index = randomEmpty(); if (index >= 0) runtime.board[index].special = "burst"; }
  if (selected.has("covenant")) { const index = randomEmpty(); if (index >= 0) runtime.board[index].special = "rainbow"; }
}

function animateEntrance() {
  if (FX.prefersReducedMotion?.() || FX.lowPower?.()) return;
  const tiles = runtime.tileNodes;
  tiles.forEach((tile, index) => { tile.style.setProperty("--bmt-enter-delay", `${Math.min(360, (Math.floor(index / COLS) + (index % COLS) * 0.18) * 28)}ms`); tile.classList.add("is-entering"); });
  setTimeout(() => tiles.forEach((tile) => tile.classList.remove("is-entering")), 800);
}

function showTutorial() {
  if (!runtime || runtime.progress.tutorialSeen?.["v18-first-run"]) return;
  const steps = [
    { title:"Combina tres", text:"Desliza hacia una ficha vecina. Tres iguales desaparecen y caen otras nuevas.", focus:".bmt-board" },
    { title:"Mira los objetivos", text:"Los objetivos de campaña aparecen arriba. Los símbolos necesarios siempre están incluidos en el nivel.", focus:".bmt-goals-v2" },
    { title:"Forma del tablero y obstáculos", text:"Los siguientes tableros tienen formas variadas. Las cadenas se rompen con combinaciones directas o adyacentes; las tablas necesitan directas.", focus:".bmt-board" },
    { title:"Espinas y arca", text:"Las espinas crecen si no se eliminan directamente. El arca no se mueve: elimina fichas debajo para que llegue a la última fila.", focus:".bmt-board" },
    { title:"Fichas especiales y ayuda", text:"Cuatro o cinco iguales crean potenciadores. Los de abajo ayudan sin gastar un movimiento.", focus:".bmt-booster-tray" }
  ];
  const shell = document.querySelector(".bmt-shell"); if (!shell) return; const overlay = el("div", "bmt-tutorial bmt-v18-tutorial");
  overlay.innerHTML = `<div class="bmt-tutorial__card"><span class="bmt-tutorial__spark">✦</span><small class="bmt-v18-tutorial-step"></small><h3></h3><p></p><div class="bmt-v18-tutorial-actions"><button type="button" class="bmt-secondary" data-skip>Saltar</button><button type="button" class="bmt-primary" data-next>Siguiente</button></div></div>`; shell.append(overlay);
  let index = 0; let focused = null;
  const finish = () => { focused?.classList.remove("is-tutorial-focus"); runtime.progress.tutorialSeen ||= {}; runtime.progress.tutorialSeen["v18-first-run"] = true; Progress.save(runtime.progress); overlay.remove(); scheduleHint(); };
  const render = () => { focused?.classList.remove("is-tutorial-focus"); const step = steps[index]; focused = document.querySelector(step.focus); focused?.classList.add("is-tutorial-focus"); overlay.querySelector(".bmt-v18-tutorial-step").textContent = `${index + 1} / ${steps.length}`; overlay.querySelector("h3").textContent = step.title; overlay.querySelector("p").textContent = step.text; overlay.querySelector("[data-next]").textContent = index === steps.length - 1 ? "Jugar" : "Siguiente"; };
  overlay.querySelector("[data-skip]").addEventListener("click", finish); overlay.querySelector("[data-next]").addEventListener("click", () => { if (index >= steps.length - 1) finish(); else { index += 1; render(); } }); render();
}

function chooseTile(index) {
  if (!runtime || runtime.busy || !isActive(index)) return; clearHint();
  if (runtime.activeBooster) { useTargetBooster(runtime.activeBooster, index); return; }
  if (isRelic(index)) { toast("No muevas el arca: elimina las fichas de debajo", "info"); FX.haptic?.("error"); return; }
  if (runtime.selected == null) { runtime.selected = index; FX.haptic?.(); updateSelection(); scheduleHint(); return; }
  if (runtime.selected === index) { runtime.selected = null; updateSelection(); scheduleHint(); return; }
  if (!Core.areAdjacent(runtime.selected, index, COLS)) { runtime.selected = index; FX.haptic?.(); updateSelection(); scheduleHint(); return; }
  const a = runtime.selected; runtime.selected = null; updateSelection(); trySwap(a, index);
}

async function animateSwap(a, b, reverse = false) {
  if (FX.prefersReducedMotion?.()) return;
  const ta = runtime.tileNodes[a]; const tb = runtime.tileNodes[b]; if (!ta || !tb) return;
  const ra = ta.getBoundingClientRect(); const rb = tb.getBoundingClientRect(); const ax = rb.left - ra.left; const ay = rb.top - ra.top; const bx = ra.left - rb.left; const by = ra.top - rb.top;
  ta.style.setProperty("--bmt-swap-x", `${ax}px`); ta.style.setProperty("--bmt-swap-y", `${ay}px`); tb.style.setProperty("--bmt-swap-x", `${bx}px`); tb.style.setProperty("--bmt-swap-y", `${by}px`);
  ta.classList.add(reverse ? "is-swap-back" : "is-swapping"); tb.classList.add(reverse ? "is-swap-back" : "is-swapping"); await pause(reverse ? 155 : 180);
  ta.classList.remove("is-swapping", "is-swap-back"); tb.classList.remove("is-swapping", "is-swap-back"); [ta,tb].forEach((node) => { node.style.removeProperty("--bmt-swap-x"); node.style.removeProperty("--bmt-swap-y"); });
}

async function trySwap(a, b) {
  if (!runtime || runtime.busy || !canSwapActive(a, b)) return;
  setBusy(true);
  runtime.lastSwap = [a, b];
  const tiles = runtime.tileNodes;
  const original = runtime.board;
  const combo = Core.specialComboClearSet(original, a, b, ROWS, COLS);
  await animateSwap(a, b);
  if (!isCurrentBoard(tiles)) return;
  runtime.board = Core.swap(original, a, b);
  updateTiles([a, b]);
  if (combo) {
    if (Number.isFinite(runtime.moves)) runtime.moves -= 1;
    FX.haptic?.("success");
    await playComboEffect(combo.combo, a, b);
    if (!isCurrentBoard(tiles)) return;
    await clearAndCascade(combo.clearSet, 1, new Map(), { combo: combo.combo });
    if (isCurrentBoard(tiles)) finishTurn();
    return;
  }
  const analysis = Core.analyzeMatches(runtime.board, ROWS, COLS, runtime.lastSwap);
  if (!analysis.groups.length) {
    await animateSwap(a, b, true);
    if (!isCurrentBoard(tiles)) return;
    runtime.board = original;
    updateTiles([a, b]);
    tiles[a]?.classList.add("is-invalid");
    tiles[b]?.classList.add("is-invalid");
    FX.haptic?.("error");
    await pauseEffect(220);
    if (!isCurrentBoard(tiles)) return;
    tiles[a]?.classList.remove("is-invalid");
    tiles[b]?.classList.remove("is-invalid");
    setBusy(false);
    scheduleHint();
    return;
  }
  if (Number.isFinite(runtime.moves)) runtime.moves -= 1;
  await clearAndCascade(analysis.clearSet, 1, analysis.creations);
  if (isCurrentBoard(tiles)) finishTurn();
}

function isCurrentBoard(tiles) {
  return runtime?.screen === "board" && runtime.tileNodes === tiles;
}

function expandSpecials(initialSet) {
  const clearSet = new Set(initialSet); const queue = [...clearSet]; const activated = new Set();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor]; const cell = runtime.board[index]; if (!cell?.special || activated.has(index)) continue; activated.add(index);
    const animate = activated.size <= (FX.lowPower?.() ? 2 : 5);
    const add = (candidate) => { if (clearSet.has(candidate) || !runtime.board[candidate] || isRelicCell(runtime.board[candidate])) return; clearSet.add(candidate); queue.push(candidate); };
    if (cell.special === "lineH") { Core.rowIndices(index, ROWS, COLS).forEach(add); if (animate) FX.trumpet?.(index, "h"); }
    else if (cell.special === "lineV") { Core.columnIndices(index, ROWS, COLS).forEach(add); if (animate) FX.trumpet?.(index, "v"); }
    else if (cell.special === "burst") { Core.areaIndices(index, 1, ROWS, COLS).forEach(add); if (animate) FX.lightBurst?.(index); }
    else if (cell.special === "rainbow" && animate) FX.covenant?.(index, [...clearSet].filter((target) => target !== index));
  }
  for (const index of clearSet) if (!runtime.board[index] || isRelicCell(runtime.board[index])) clearSet.delete(index);
  return { clearSet, activated };
}

async function clearAndCascade(initialSet, cascade, creations = new Map(), meta = {}) {
  if (!runtime) return;
  const tiles = runtime.tileNodes;
  const expanded = expandSpecials(initialSet); const clearSet = expanded.clearSet; runtime.specialsActivated += expanded.activated.size; runtime.cascade = cascade; runtime.maxCascade = Math.max(runtime.maxCascade, cascade);
  if (cascade > 1) { const anchor = [...clearSet][0] ?? 0; FX.floatText?.(anchor, `CASCADA ×${cascade}`, cascade >= 4 ? "violet" : "gold"); FX.haptic?.(); }
  const clearedByType = {};
  for (const index of clearSet) {
    const cell = runtime.board[index];
    clearedByType[cell.type] = (clearedByType[cell.type] || 0) + 1;
    tiles[index]?.classList.add("is-clearing");
  }
  let particleBudget = FX.lowPower?.() ? 4 : 10;
  for (const index of clearSet) {
    if (particleBudget-- <= 0) break;
    const special = runtime.board[index].special;
    FX.particleBurst?.(index, special ? "gold" : "blue", special ? 8 : 4);
  }
  const dirty = new Set(clearSet);
  const blockerScore = damageBlockers(clearSet, dirty);
  const digScore = advanceExcavation(clearSet, creations, dirty);
  const base = clearSet.size * 34 + blockerScore + digScore; const comboBonus = meta.combo ? 240 : 0; runtime.score += Math.round((base + comboBonus) * (1 + Math.max(0, cascade - 1) * 0.55));
  for (const [type, count] of Object.entries(clearedByType)) runtime.collected[type] = (runtime.collected[type] || 0) + count;
  updateHud(true);
  await pauseEffect(135);
  if (!isCurrentBoard(tiles)) return;
  for (const index of clearSet) runtime.board[index] = null;
  for (const [index, special] of creations.entries()) if (runtime.board[index] && !isRelicCell(runtime.board[index])) { runtime.board[index].special = special; dirty.add(index); FX.forge?.(index, special); FX.floatText?.(index, specialLabel(special), special === "rainbow" ? "violet" : "gold"); }
  const motion = collapseBoard();
  for (const index of motion.distanceByDestination.keys()) dirty.add(index);
  updateTiles(dirty);
  animateDropMotion(motion);
  await pauseEffect(motion.maxDistance > 2 ? 225 : 180);
  if (!isCurrentBoard(tiles)) return;
  if (deliverRelics()) {
    const landing = collapseBoard();
    updateTiles(landing.distanceByDestination.keys());
    animateDropMotion(landing);
    updateHud(true);
    await pauseEffect(225);
    if (!isCurrentBoard(tiles)) return;
  }
  const next = Core.analyzeMatches(runtime.board, ROWS, COLS, runtime.lastSwap || []);
  if (next.groups.length) await clearAndCascade(next.clearSet, cascade + 1, next.creations);
}

function specialLabel(special) { if (special === "lineH" || special === "lineV") return "TROMPETA"; if (special === "burst") return "LUZ"; if (special === "rainbow") return "PACTO"; return "ESPECIAL"; }

function collapseBoard() {
  const distanceByDestination = new Map(); let maxDistance = 0;
  for (let col = 0; col < COLS; col += 1) {
    const activeRows = []; for (let row = 0; row < ROWS; row += 1) if (isActive(row * COLS + col)) activeRows.push(row);
    const existing = []; for (let p = activeRows.length - 1; p >= 0; p -= 1) { const row = activeRows[p]; const cell = runtime.board[row * COLS + col]; if (cell) existing.push({ cell, sourceRow:row }); }
    for (const row of activeRows) runtime.board[row * COLS + col] = null;
    let destinationPos = activeRows.length - 1;
    for (const item of existing) { const destinationRow = activeRows[destinationPos--]; const destination = destinationRow * COLS + col; runtime.board[destination] = item.cell; const distance = Math.max(0, destinationRow - item.sourceRow); if (distance) { distanceByDestination.set(destination, distance); maxDistance = Math.max(maxDistance, distance); } }
    while (destinationPos >= 0) { const destinationRow = activeRows[destinationPos--]; const destination = destinationRow * COLS + col; const type = runtime.symbolIds[Math.floor(Math.random() * runtime.symbolIds.length)]; runtime.board[destination] = { type, special:null }; const distance = destinationRow + 2 + Math.random() * 1.5; distanceByDestination.set(destination, distance); maxDistance = Math.max(maxDistance, distance); }
  }
  return { distanceByDestination, maxDistance };
}

function animateDropMotion(motion) {
  if (FX.prefersReducedMotion?.()) return;
  clearTimeout(runtime.dropTimer);
  const previous = runtime.dropTiles;
  for (const tile of previous) tile.classList.remove("is-dropping");
  if (previous.length) void previous[0].offsetWidth;
  const animated = [];
  for (const [index, distance] of motion.distanceByDestination.entries()) {
    const tile = runtime.tileNodes[index];
    tile.style.setProperty("--bmt-drop-distance", String(distance));
    tile.classList.add("is-dropping");
    animated.push(tile);
  }
  runtime.dropTiles = animated;
  const session = runtime;
  runtime.dropTimer = setTimeout(() => {
    for (const tile of animated) tile.classList.remove("is-dropping");
    if (session.dropTiles === animated) session.dropTiles = [];
  }, 240);
}

// Ковчег считается доставленным, когда падение приносит его на нижнюю живую
// клетку своего столбца: у фигурных полей это не обязательно последний ряд.
function deliverRelics() {
  if (!runtime?.relicTotal) return 0;
  let delivered = 0;
  for (let index = 0; index < runtime.board.length; index += 1) {
    if (!isRelicCell(runtime.board[index])) continue;
    if (index !== bottomActiveIndex(index % COLS)) continue;
    runtime.board[index] = null; runtime.relicsDelivered += 1; delivered += 1; runtime.score += RELIC_SCORE;
    FX.relicLanded?.(index); FX.floatText?.(index, "ARCA", "gold"); FX.haptic?.("success");
  }
  return delivered;
}

// Тернии — единственное препятствие, которое растёт само: пока их выжигают
// медленнее, чем они разрастаются, поле постепенно зарастает.
function spreadVines() {
  if (!runtime?.vineGrow) return 0;
  const vines = [...runtime.blockers.entries()].filter(([, blocker]) => blocker.type === "vine");
  if (!vines.length) return 0;
  runtime.vineTurns += 1;
  if (runtime.vineTurns % runtime.vineGrow !== 0 || vines.length >= runtime.vineCap) return 0;
  const options = [];
  for (const [index] of vines) {
    const { row, col } = Core.coordinates(index, COLS);
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const rr = row + dr; const cc = col + dc;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
      const target = rr * COLS + cc;
      if (runtime.blockers.has(target) || !isActive(target) || !runtime.board[target] || isRelicCell(runtime.board[target])) continue;
      options.push(target);
    }
  }
  if (!options.length) return 0;
  const target = options[Math.floor(Math.random() * options.length)];
  runtime.blockers.set(target, { type:"vine", layers:1, maxLayers:1, lit:false });
  updateTile(runtime.tileNodes[target], runtime.board[target], runtime.blockers.get(target));
  FX.vineSprout?.(target); FX.haptic?.();
  return 1;
}

function advanceExcavation(clearSet, creations, dirty) {
  const excavation = runtime.excavation;
  if (!excavation?.buried.size) return 0;
  const { changed, found } = Core.excavate(excavation, new Set([...clearSet, ...creations.keys()]));
  const affected = new Set();
  for (const index of changed) {
    dirty.add(index);
    affected.add(excavation.cells.get(index).treasure);
  }
  for (const treasure of affected) {
    const item = document.querySelector(`.bmt-dig-item[data-treasure="${treasure.id}"]`);
    const label = TREASURE_LABELS[treasure.type];
    const done = treasure.uncovered === treasure.size;
    if (item) {
      item.classList.toggle("is-found", done);
      item.querySelector("small").textContent = `${treasure.uncovered}/${treasure.size}`;
      item.setAttribute("aria-label", done ? `Найдено. ${label}` : `${label}, revelado ${treasure.uncovered} de ${treasure.size} клеток`);
    }
    if (!done) continue;
    for (let row = 0; row < treasure.height; row += 1) {
      for (let col = 0; col < treasure.width; col += 1) {
        const index = treasure.origin + row * COLS + col;
        const tile = runtime.tileNodes[index];
        tile.querySelector(".bmt-dig-marker")?.remove();
        delete tile.dataset.digDepth;
        delete tile.dataset.digEdges;
        dirty.add(index);
      }
    }
    if (item) flyExcavationTreasure(treasure, item);
  }
  if (changed.length) updateExcavationEdges(excavation);
  if (found.length) {
    toast(`Encontrados: ${found.map(({ type }) => TREASURE_LABELS[type]).join(", ")}`, "success");
  }
  return changed.length * 55 + found.length * 160;
}

function damageBlockers(clearSet, dirty) {
  if (!runtime.blockers.size) return 0;
  const direct = new Set(clearSet); const adjacent = new Set();
  for (const index of direct) { const { row, col } = Core.coordinates(index, COLS); [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => { const rr = row + dr; const cc = col + dc; if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) adjacent.add(rr * COLS + cc); }); }
  let score = 0;
  for (const [index, blocker] of [...runtime.blockers.entries()]) {
    const tile = runtime.tileNodes[index];
    if (blocker.type === "lamp") { if (!blocker.lit && (direct.has(index) || adjacent.has(index))) { blocker.lit = true; dirty.add(index); tile?.classList.add("is-blocker-lit"); setTimeout(() => tile?.classList.remove("is-blocker-lit"), 360); score += 80; FX.ring?.(index, "gold"); FX.floatText?.(index, "LUZ", "gold"); } continue; }
    const hit = blocker.type === "tablet" || blocker.type === "vine" ? direct.has(index) : (direct.has(index) || adjacent.has(index)); if (!hit) continue; blocker.layers -= 1; dirty.add(index); tile?.classList.remove("is-blocker-hit", "is-blocker-breaking"); if (tile) { tile.classList.add(blocker.layers <= 0 ? "is-blocker-breaking" : "is-blocker-hit"); setTimeout(() => tile.classList.remove("is-blocker-hit", "is-blocker-breaking"), 300); } score += 45;
    if (blocker.layers <= 0) { runtime.blockers.delete(index); runtime.blockerCleared[blocker.type] = (runtime.blockerCleared[blocker.type] || 0) + 1; score += 90; FX.floatText?.(index, blocker.type === "vine" ? "QUEMADO" : "ELIMINADO", "green"); }
  }
  return score;
}

function blockerClearedCount(type) { return Number(runtime?.blockerCleared?.[type] || 0); }
function lampLitCount() { let count = 0; for (const blocker of runtime.blockers.values()) if (blocker.type === "lamp" && blocker.lit) count += 1; return count; }

function finishIfNoMoves() {
  if (!runtime || countPlayableMoves(runtime.board, 1) !== 0) return false;
  clearHint();
  setBusy(true);
  try {
    runtime.board = reshufflePlayable();
    updateAllTiles();
    document.querySelector(".bmt-board")?.classList.add("is-auto-shuffling");
    toast("Sin movimientos disponibles: tablero mezclado", "info");
    FX.haptic?.();
    const tiles = runtime.tileNodes;
    window.setTimeout(() => {
      if (!isCurrentBoard(tiles)) return;
      document.querySelector(".bmt-board")?.classList.remove("is-auto-shuffling");
      setBusy(false);
      scheduleHint();
    }, 560);
  } catch (error) {
    console.error("[Biblical Treasures] reshuffle failed", error);
    setBusy(false);
    if (runtime.mode === "level") finishLevel(false, "noMoves");
    else if (runtime.mode === "free") openFreeExit("noMoves");
  }
  return true;
}

async function finishTurn() {
  if (!runtime) return; runtime.lastSwap = null; runtime.cascade = 0; updateHud();
  if (runtime.mode === "level" && allGoalsComplete()) {
    if (runtime.digFlights?.size) {
      const tiles = runtime.tileNodes;
      await Promise.all(runtime.digFlights.values());
      if (!isCurrentBoard(tiles)) return;
    }
    finishLevel(true);
    return;
  }
  if (runtime.mode === "level" && runtime.moves <= 0) { finishLevel(false); return; }
  if (runtime.mode === "level") spreadVines();
  if (runtime.mode === "free") { persistFreeRecord(true); if (Number.isFinite(runtime.moves) && runtime.moves <= 0) { setBusy(false); openFreeExit("moves"); return; } }
  if (finishIfNoMoves()) return;
  setBusy(false); scheduleHint();
}

function starsForLevel() { const thresholds = runtime.level?.starThresholds || []; let rating = 1; if (runtime.score >= Number(thresholds[1] || Infinity)) rating = 2; if (runtime.score >= Number(thresholds[2] || Infinity)) rating = 3; return rating; }

function finishLevel(won, reason = "moves") {
  clearHint(); setBusy(true); const overlay = el("div", "bmt-result-overlay"); const card = el("section", `bmt-result-card ${won ? "is-win" : "is-lose"}`);
  if (won) {
    const next = runtime.levels.find((item) => item.id === runtime.level.id + 1);
    if (reopeningPreview) runtime.progress.campaignLevel = next?.id ?? runtime.level.id;
    const rating = starsForLevel(); const result = Progress.completeLevel(runtime.progress, runtime.level.id, rating, Number(runtime.level.reward || 0), runtime.levels.length); runtime.progress = result.progress; updateWallet(); FX.haptic?.("success"); FX.celebrate?.();
    card.innerHTML = `<div class="bmt-result-card__halo">✦</div><span class="bmt-result-card__eyebrow">Desafío superado</span><h3>${escapeHtml(runtime.level.title)}</h3><div class="bmt-result-stars" aria-label="${rating} de 3">${[1,2,3].map((n) => `<span class="${n <= rating ? "is-on" : ""}">★</span>`).join("")}</div><strong class="bmt-result-score">${runtime.score.toLocaleString("es")} puntos</strong><div class="bmt-result-reward"><span>Recompensa</span><strong>+${result.awarded} ★</strong></div><div class="bmt-result-actions"></div>`;
    const actions = card.querySelector(".bmt-result-actions"); actions.append(button("Al mapa", "bmt-secondary", () => { overlay.remove(); renderMenu(); }), button("Siguiente", "bmt-primary", () => { overlay.remove(); setBusy(false); if (next) openPreLevel(next); else renderMenu(); }));
  } else {
    FX.haptic?.("error"); const noMoves = reason === "noMoves"; const continueCost = Number(runtime.levelConfig.continueCost || 8); const canContinue = !noMoves && starBalance() >= continueCost;
    card.innerHTML = `<div class="bmt-result-card__halo is-muted">◇</div><span class="bmt-result-card__eyebrow">${noMoves ? "Tablero agotado" : "Casi lo consigues"}</span><h3>${noMoves ? "No hay movimientos disponibles" : "Sin movimientos"}</h3><p>${noMoves ? "No quedan combinaciones válidas. El nivel ha terminado." : "Continúa con 5 movimientos más o empieza de nuevo."}</p><div class="bmt-result-progress">${runtime.level.goals.map((goal) => { const current = Math.min(Number(goal.count), currentGoalValue(goal)); return `<span>${goalIcon(goal)} ${current}/${goal.count}</span>`; }).join("")}</div><div class="bmt-result-actions"></div>`;
    const actions = card.querySelector(".bmt-result-actions"); actions.append(button("Reiniciar", "bmt-secondary", () => { overlay.remove(); setBusy(false); beginLevel(runtime.level); }));
    if (noMoves) actions.append(button("Al mapa", "bmt-primary", () => { overlay.remove(); renderMenu(); }));
    else { const more = button(`+5 movimientos · ${continueCost} ★`, "bmt-primary", () => { const spend = Progress.spendStars(continueCost, `match3-continue-level-${runtime.level.id}`); if (!spend.ok) { toast("No hay suficientes estrellas", "error"); return; } updateWallet(); overlay.remove(); runtime.moves = 5; setBusy(false); updateHud(); scheduleHint(); }); more.disabled = !canContinue; actions.append(more); card.append(button("Al mapa de niveles", "bmt-link-button", () => { overlay.remove(); renderMenu(); })); }
  }
  overlay.append(card); document.querySelector(".bmt-shell")?.append(overlay);
}

function persistFreeRecord(showToast) {
  if (!runtime || runtime.mode !== "free" || !runtime.difficulty) return null;
  const result = Progress.recordFree(runtime.progress, runtime.difficulty, { score: runtime.score, maxCascade: runtime.maxCascade, specialsActivated: runtime.specialsActivated }); runtime.progress = result.progress;
  if (result.awarded > 0) { runtime.freeSessionReward += result.awarded; updateWallet(); if (showToast) toast(`Hito de récord: +${result.awarded} ★`, "success"); }
  updateFreeHud(result.stats); return result;
}

function updateFreeHud(stats = runtime?.progress?.free?.[runtime?.difficulty]) {
  if (!runtime || runtime.mode !== "free") return; const best = document.getElementById("bmt-best"); const moves = document.getElementById("bmt-moves"); if (best) best.textContent = `récord ${Number(stats?.bestScore || 0).toLocaleString("es")}`; if (moves) moves.textContent = Number.isFinite(runtime.moves) ? String(Math.max(0, runtime.moves)) : `${runtime.freeSessionReward} ★`;
}

function openFreeExit(reason = "manual") {
  if (!runtime || runtime.mode !== "free") return; persistFreeRecord(false); const stats = runtime.progress.free?.[runtime.difficulty] || {}; const overlay = el("div", "bmt-result-overlay"); const card = el("section", "bmt-result-card"); const isRecord = runtime.score >= Number(stats.bestScore || 0) && runtime.score > 0;
  card.innerHTML = `<div class="bmt-result-card__halo">${isRecord ? "★" : "↯"}</div><span class="bmt-result-card__eyebrow">${reason === "noMoves" ? "No hay movimientos disponibles" : reason === "moves" ? "30 movimientos completados" : isRecord ? "Nuevo récord personal" : "Juego libre"}</span><h3>${runtime.score.toLocaleString("es")} puntos</h3>${reason === "noMoves" ? "<p>No quedan combinaciones válidas. La partida ha terminado.</p>" : ""}<div class="bmt-free-result"><span><b>↯ ×${runtime.maxCascade}</b> mejor cascada</span><span><b>✺ ${runtime.specialsActivated}</b> especiales activadas</span><span><b>+${runtime.freeSessionReward} ★</b> ganado en este intento</span></div><div class="bmt-result-actions"></div>`;
  const actions = card.querySelector(".bmt-result-actions"); actions.append(button("Al menú", "bmt-secondary", () => { overlay.remove(); renderMenu(); }), button("Volver a jugar", "bmt-primary", () => { overlay.remove(); beginFree(runtime.difficulty); })); overlay.append(card); document.querySelector(".bmt-shell")?.append(overlay);
}

function openPause() {
  if (!runtime || runtime.screen !== "board") return; clearHint(); const overlay = el("div", "bmt-pause-overlay"); overlay.innerHTML = `<section class="bmt-pause-card"><span class="bmt-pause-card__icon">Ⅱ</span><h3>Pausa</h3><p>${runtime.level ? `Nivel ${runtime.level.id} · ${escapeHtml(runtime.level.title)}` : "Juego libre"}</p><div class="bmt-pause-card__actions"></div></section>`;
  const actions = overlay.querySelector(".bmt-pause-card__actions"); actions.append(button("Continuar", "bmt-primary", () => { overlay.remove(); scheduleHint(); }), button("Empezar de nuevo", "bmt-secondary", () => { overlay.remove(); if (runtime.mode === "level") beginLevel(runtime.level); else beginFree(runtime.difficulty); }), button("Al menú del juego", "bmt-link-button", () => { overlay.remove(); renderMenu(); })); document.querySelector(".bmt-shell")?.append(overlay);
}

function activateBooster(id) {
  if (!runtime || runtime.busy) return; clearHint(); const booster = IN_BOOSTERS[id]; if (!booster) return;
  if (runtime.activeBooster === id) { runtime.activeBooster = null; updateBoosterState(); toast("Potenciador cancelado"); return; }
  runtime.activeBooster = id; runtime.selected = null; updateSelection(); updateBoosterState(); toast(`${booster.label}: elige una casilla`, "info"); FX.haptic?.();
}

function updateBoosterState() {
  document.querySelectorAll("[data-booster]").forEach((node) => { node.classList.toggle("is-active", node.dataset.booster === runtime.activeBooster); });
  document.querySelector(".bmt-board")?.classList.toggle("is-targeting", Boolean(runtime.activeBooster));
}

function spendBooster(id) {
  const booster = IN_BOOSTERS[id]; const result = Progress.spendStars(booster.cost, `match3-booster-${id}`);
  if (!result.ok) { toast(`Necesitas ${booster.cost} ★`, "error"); FX.haptic?.("error"); return false; }
  runtime.progress = Progress.noteBoosterUse(runtime.progress, id); updateWallet(); return true;
}

async function useTargetBooster(id, index) {
  if (!runtime || runtime.busy || !isActive(index)) return;
  if (id === "rainbow" && (runtime.blockers.has(index) || isRelic(index))) { toast("Elige una ficha sin obstáculo", "info"); FX.haptic?.("error"); return; }
  if (!spendBooster(id)) { runtime.activeBooster = null; updateBoosterState(); return; }
  runtime.activeBooster = null; updateBoosterState(); setBusy(true);
  if (id === "rainbow") {
    const cell = runtime.board[index];
    if (!cell) { setBusy(false); scheduleHint(); return; }
    runtime.board[index] = { ...cell, special:"rainbow" };
    updateTile(runtime.tileNodes[index], runtime.board[index], runtime.blockers.get(index));
    FX.ring?.(index, "rainbow"); FX.floatText?.(index, "ARCOÍRIS", "violet"); FX.haptic?.("success");
    toast("Arcoíris listo: intercámbialo con el símbolo deseado", "success");
    setBusy(false); scheduleHint(); return;
  }
  const tiles = runtime.tileNodes;
  if (id === "sling") { FX.floatText?.(index, "HONDA", "gold"); FX.ring?.(index, "gold"); await clearAndCascade(new Set([index]), 1, new Map(), { booster: id }); }
  else if (id === "staff") { FX.floatText?.(index, "VARA", "blue"); FX.trumpet?.(index, "v"); await clearAndCascade(new Set(Core.columnIndices(index, ROWS, COLS)), 1, new Map(), { booster: id }); }
  else if (id === "jericho") { FX.floatText?.(index, "JERICÓ", "violet"); FX.lightBurst?.(index); await clearAndCascade(new Set(Core.areaIndices(index, 1, ROWS, COLS)), 1, new Map(), { booster: id }); }
  if (isCurrentBoard(tiles)) finishTurn();
}

function playComboEffect(combo, a, b) {
  const index = b ?? a;
  const everything = runtime?.board?.map((_, position) => position).filter((position) => position !== index && isActive(position)) || [];
  if (combo === "doubleRainbow") { FX.covenant?.(index, everything); FX.floatText?.(index, "ARCOÍRIS DEL PACTO", "violet"); }
  else if (combo === "rainbowSpecial") { FX.covenant?.(index, everything.slice(0, 12)); FX.floatText?.(index, "PODER DEL PACTO", "violet"); }
  else if (combo === "doubleLine") { FX.trumpet?.(index, "h"); FX.trumpet?.(index, "v"); FX.floatText?.(index, "DOBLE TROMPETA", "gold"); }
  else if (combo === "lineBurst") { FX.lightBurst?.(index); FX.trumpet?.(index, "h"); FX.floatText?.(index, "LUZ Y TROMPETAS", "gold"); }
  else if (combo === "doubleBurst") { FX.lightBurst?.(a); FX.lightBurst?.(b); FX.floatText?.(index, "DOBLE LUZ", "gold"); }
  else FX.floatText?.(index, "COMBINACIÓN", "gold");
  return pauseEffect(135);
}

function updateHud(pulseGoals = false) {
  if (!runtime) return; const score = document.getElementById("bmt-score"); const moves = document.getElementById("bmt-moves"); const cascade = document.getElementById("bmt-cascade"); const specials = document.getElementById("bmt-special-count");
  if (score) score.textContent = runtime.score.toLocaleString("es"); if (moves && (runtime.mode === "level" || Number.isFinite(runtime.moves))) moves.textContent = String(Math.max(0, runtime.moves)); if (cascade) cascade.textContent = `×${Math.max(1, runtime.cascade || runtime.maxCascade || 1)}`; if (specials) specials.textContent = `${runtime.specialsActivated} especiales`; renderGoals(pulseGoals); if (runtime.mode === "free") updateFreeHud(); updateWallet();
}

function renderGoals(pulseChanged = false) {
  const root = document.getElementById("bmt-goals"); if (!root || runtime.mode !== "level") return; const goals = runtime.level.goals || [];
  if (!root.children.length) {
    root.dataset.count = String(goals.length);
    root.innerHTML = goals.map((goal, index) => `<div class="bmt-goal" data-goal="${index}"><span class="bmt-goal__icon">${goalIcon(goal)}</span><span class="bmt-goal__copy"><small>${escapeHtml(goalText(goal).replace(/ ×\d+$/, ""))}</small><strong></strong></span><span class="bmt-goal__check">✓</span></div>`).join("");
  }
  goals.forEach((goal, index) => {
    const value = Math.min(Number(goal.count), currentGoalValue(goal));
    const before = runtime.lastGoalSnapshot.get(index);
    if (before === value) return;
    const node = root.children[index];
    node.querySelector("strong").textContent = `${value}/${goal.count}`;
    node.classList.toggle("is-done", value >= Number(goal.count));
    if (pulseChanged && before != null && value > before) FX.pulseGoal?.(node);
    runtime.lastGoalSnapshot.set(index, value);
  });
}

function updateSelection() {
  runtime.tileNodes[runtime.renderedSelection]?.classList.remove("is-selected");
  runtime.tileNodes[runtime.selected]?.classList.add("is-selected");
  runtime.renderedSelection = runtime.selected;
}
function updateAllTiles() { runtime.tileNodes.forEach((tile, index) => updateTile(tile, runtime.board[index], runtime.blockers.get(index))); updateSelection(); updateBoosterState(); }

function updateTiles(indices) {
  for (const index of indices) {
    updateTile(runtime.tileNodes[index], runtime.board[index], runtime.blockers.get(index));
  }
}

function updateTile(tile, cell, blocker) {
  tile.classList.remove("is-clearing", "is-invalid", "is-line-h", "is-line-v", "is-burst", "is-rainbow", "has-tablet", "has-chain", "has-lamp", "has-vine", "is-relic", "is-lamp-lit", "is-layer-2", "is-layer-3");
  const img = tile.querySelector(".bmt-piece"); const specialMark = tile.querySelector(".bmt-special-mark"); const blockerMark = tile.querySelector(".bmt-blocker"); const index = Number(tile.dataset.index); const active = isActive(index); tile.classList.toggle("is-hole", !active); tile.disabled = !active;
  if (!active) { tile.classList.add("is-empty"); if (img) img.removeAttribute("src"); if (specialMark) specialMark.textContent = ""; if (blockerMark) blockerMark.innerHTML = ""; return; }
  if (!cell) { tile.classList.add("is-empty"); tile.setAttribute("aria-label", "Пустая клетка"); if (img) img.removeAttribute("src"); if (specialMark) specialMark.textContent = ""; }
  else if (isRelicCell(cell)) {
    tile.classList.remove("is-empty"); tile.classList.add("is-relic");
    // Подпись не «Ковчег»: по ней загрузчик набора подменяет картинку фишки, и
    // святыня снова стала бы ковчегом Ноя.
    const asset = currentRelicAsset(); if (img && img.getAttribute("src") !== asset) img.src = asset; if (img) img.alt = "Arca de la Alianza";
    if (specialMark) specialMark.textContent = "▼";
    tile.setAttribute("aria-label", "Arca: bájala hasta la última fila");
  }
  else { tile.classList.remove("is-empty"); const symbol = SYMBOL_BY_ID[cell.type]; const asset = currentSymbolAsset(cell.type); if (img && img.getAttribute("src") !== asset) img.src = asset; if (img) img.alt = symbol.label; tile.setAttribute("aria-label", `${symbol.label}${cell.special ? ", ficha especial" : ""}`); if (cell.special) tile.classList.add(`is-${cell.special.replace("lineH", "line-h").replace("lineV", "line-v")}`); if (specialMark) specialMark.textContent = cell.special === "rainbow" ? "✦" : cell.special === "burst" ? "✺" : cell.special ? "↯" : ""; }
  const blockerState = blocker ? `${blocker.type}:${blocker.layers}:${blocker.lit}` : "";
  if (blockerMark && (blockerMark.dataset.state || "") !== blockerState) {
    blockerMark.dataset.state = blockerState;
    blockerMark.innerHTML = blocker ? blockerMarkup(blocker) : "";
  }
  if (blocker) {
    tile.classList.add(`has-${blocker.type}`);
    if (blocker.layers >= 2) tile.classList.add("is-layer-2");
    if (blocker.layers >= 3) tile.classList.add("is-layer-3");
    if (blocker.type === "lamp" && blocker.lit) tile.classList.add("is-lamp-lit");
    const label = BLOCKER_META[blocker.type]?.label || blocker.type;
    tile.setAttribute("aria-label", `${tile.getAttribute("aria-label") || "Ficha"}, obstáculo ${label}${blocker.layers > 1 ? `, ${blocker.layers} capas` : ""}`);
  }
  const digCell = runtime.excavation?.cells.get(index);
  if (digCell && digCell.treasure.uncovered < digCell.treasure.size) {
    tile.dataset.digDepth = digCell.depth;
    const depth = tile.querySelector(".bmt-dig-depth");
    if (depth) depth.textContent = digCell.depth > 1 ? String(digCell.depth) : "";
    const label = digCell.depth === 0 ? "открыта часть находки" : `слоёв земли ${digCell.depth}`;
    tile.setAttribute("aria-label", `${tile.getAttribute("aria-label") || "Ficha"}, ${label}`);
  }
}

function blockerMarkup(blocker) {
  const src = currentBlockerAsset(blocker.type);
  const art = src ? `<img class="bmt-blocker-art" src="${src}" alt="" aria-hidden="true" draggable="false" loading="eager" decoding="async" data-bmt-raster="webp-v17">` : "";
  const badge = blocker.layers > 1 ? `<b class="bmt-blocker__layers" aria-hidden="true">${blocker.layers}</b>` : "";
  if (blocker.type === "tablet") return `<span class="bmt-blocker__tablet" data-blocker-type="tablet">${art || '<i class="bmt-blocker-fallback">▦</i>'}${badge}</span>`;
  if (blocker.type === "chain") return `<span class="bmt-blocker__chain" data-blocker-type="chain">${art || '<i class="bmt-blocker-fallback">◇</i>'}${badge}</span>`;
  if (blocker.type === "vine") return `<span class="bmt-blocker__vine" data-blocker-type="vine">${art || '<i class="bmt-blocker-fallback">✤</i>'}${badge}</span>`;
  if (blocker.type === "lamp") return `<span class="bmt-blocker__lamp" data-blocker-type="lamp" data-blocker-lit="${blocker.lit ? "true" : "false"}">${blocker.lit ? '<i class="bmt-blocker__lamp-state" aria-hidden="true">✦</i>' : (art || '<i class="bmt-blocker-fallback">✦</i>')}</span>`;
  return "";
}

function showHint() { if (!runtime || runtime.busy || runtime.activeBooster) return; clearHint(); const hint = findPlayableHint(); if (!hint) return; hint.forEach((index) => runtime.tileNodes[index]?.classList.add("is-hint")); runtime.hintTimer = setTimeout(clearHint, 1650); }
function clearHint() { if (!runtime) return; if (runtime.hintTimer) clearTimeout(runtime.hintTimer); runtime.hintTimer = null; runtime.tileNodes?.forEach((tile) => tile.classList.remove("is-hint")); }
function scheduleHint() { if (!runtime || runtime.busy || runtime.screen !== "board" || runtime.activeBooster) return; clearHint(); const delay = runtime.mode === "free" ? FREE_MODES[runtime.difficulty].hintDelay : Math.max(6500, 11200 - Number(runtime.level?.id || 1) * 90); runtime.hintTimer = setTimeout(showHint, delay); }
function pause(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function pauseEffect(ms) { return FX.prefersReducedMotion?.() ? Promise.resolve() : pause(ms); }

window.addEventListener("app:stars-changed", updateWallet);
window.startBiblicalMatchThreeGame = start;
window.__biblicalMatchThreeCleanup = cleanup;
const rulesApi = { version:21, minStartMoves:MIN_START_MOVES, blockerTypes:Object.keys(BLOCKER_META), levelRelicCells, bottomActiveIndex, spreadVines, deliverRelics, getLevelSymbolSet, requiredCollectSymbols, makeActiveMask, boardShapeFor, levelShapes:LEVEL_SHAPES, shapeLabels:SHAPE_LABELS, findPlayableMoves:(limit=Infinity)=>findPlayableMoves(runtime?.board,limit), countPlayableMoves:(limit=Infinity)=>countPlayableMoves(runtime?.board,limit), checkDeadBoard:finishIfNoMoves };
window.BiblicalMatchThreeV18Rules = rulesApi;
window.BiblicalMatchThreeV20Rules = rulesApi;
})();
