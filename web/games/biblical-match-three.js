(() => {
"use strict";

const Core = window.BiblicalMatchThreeCore;
const Progress = window.BiblicalMatchThreeProgress;
const FX = window.BiblicalMatchThreeEffects || {};
if (!Core) throw new Error("BiblicalMatchThreeCore is not loaded");
if (!Progress) throw new Error("BiblicalMatchThreeProgress is not loaded");

let ROWS = 8;
const COLS = 8;
const MIN_START_MOVES = 3;

const SYMBOLS = [
  { id: "bible", label: "Библия", asset: "web/assets/biblical-match-three/bible.svg" },
  { id: "fish", label: "Рыба", asset: "web/assets/biblical-match-three/fish.svg" },
  { id: "dove", label: "Голубь", asset: "web/assets/biblical-match-three/dove.svg" },
  { id: "lamp", label: "Светильник", asset: "web/assets/biblical-match-three/lamp.svg" },
  { id: "crown", label: "Венец", asset: "web/assets/biblical-match-three/crown.svg" },
  { id: "ark", label: "Ковчег", asset: "web/assets/biblical-match-three/ark.svg" },
  { id: "bread", label: "Хлеб", asset: "web/assets/biblical-match-three/bread.svg" },
  { id: "grapes", label: "Виноград", asset: "web/assets/biblical-match-three/grapes.svg" },
  { id: "tablets", label: "Скрижали", asset: "web/assets/biblical-match-three/tablets.svg" },
];
const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map((item) => [item.id, item]));

const FREE_MODES = {
  easy: { label: "Лёгкий", symbolCount: 7, rows: 7, moves: 30, hintDelay: 7000, accent: "green" },
  medium: { label: "Средний", symbolCount: 8, rows: 8, moves: 30, hintDelay: 9500, accent: "gold" },
  hard: { label: "Сложный", symbolCount: 9, rows: 8, moves: 30, hintDelay: 12500, accent: "violet" },
};

const PRE_BOOSTERS = {
  manna: { label: "Манна с небес", short: "Манна", cost: 6, asset: "web/assets/biblical-match-three/bread.svg", desc: "Две направленные особые фишки в начале уровня." },
  lampOil: { label: "Масло светильника", short: "Масло", cost: 8, asset: "web/assets/biblical-match-three/lamp.svg", desc: "Один светильник-вспышка в начале уровня." },
  covenant: { label: "Радуга Завета", short: "Радуга", cost: 12, asset: "web/assets/biblical-match-three/dove.svg", desc: "Одна радужная фишка, очищающая выбранный символ." },
};

const IN_BOOSTERS = {
  sling: { label: "Праща Давида", cost: 5, asset: "web/assets/biblical-match-three/crown.svg", desc: "Точный удар по одной клетке.", target: true },
  staff: { label: "Посох Моисея", cost: 7, asset: "web/assets/biblical-match-three/tablets.svg", desc: "Очищает выбранный столбец.", target: true },
  jericho: { label: "Трубы Иерихона", cost: 10, asset: "web/assets/biblical-match-three/lamp.svg", desc: "Мощная ударная волна 3×3.", target: true },
  rainbow: { label: "Радуга Завета", cost: 8, asset: "web/assets/biblical-match-three/icons-v17/covenant.webp", desc: "Превращает выбранную фишку в радужную.", target: true },
};

const BLOCKER_META = {
  tablet: { label: "Скрижали", icon: "▦" },
  chain: { label: "Цепи", icon: "◇" },
  lamp: { label: "Светильники", icon: "✦" },
  vine: { label: "Тернии", icon: "✤" },
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
  const barred = levelRelicCells(level).length && !required.includes("ark") ? "ark" : "";
  const source = SYMBOLS.map((item) => item.id).filter((id) => id !== barred);
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
const SHAPE_LABELS = { rect:"классическое", oval:"овальное", bowl:"полукруг", diamond:"ромб", cross:"крест", shield:"щит" };

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
function isRelic(index) { return Boolean(runtime?.board?.[index]?.relic); }
// Ковчег двигают не рукой, а тем, что убирают из-под него, поэтому он выпадает
// и из свайпов, и из подсказок, и из проверки на мёртвое поле.
function canSwapActive(a, b) { return isActive(a) && isActive(b) && !isRelic(a) && !isRelic(b); }
function bottomActiveIndex(col) { for (let row = ROWS - 1; row >= 0; row -= 1) { const index = row * COLS + col; if (isActive(index)) return index; } return -1; }
function findPlayableMoves(board = runtime?.board, limit = Infinity) { return board ? Core.findMoves(board, ROWS, COLS, canSwapActive, limit) : []; }
function countPlayableMoves(board = runtime?.board, limit = Infinity) { return findPlayableMoves(board, limit).length; }
function findPlayableHint(board = runtime?.board) { return findPlayableMoves(board, 1)[0] || null; }

function createPlayableBoard(rows, cols, symbolIds, mask, required = [], relicCells = []) {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const board = Core.createBoard(rows, cols, symbolIds);
    board.forEach((_, index) => { if (mask[index] === false) board[index] = null; });
    let relicNumber = 0;
    for (const index of relicCells) { if (mask[index] === false || !board[index]) continue; board[index] = { type: `${RELIC_TYPE}${relicNumber += 1}`, special: null, relic: true }; }
    const hasRequired = required.every((symbol) => board.reduce((count, cell) => count + (cell?.type === symbol ? 1 : 0), 0) >= 3);
    const startMoves = Core.findMoves(board, rows, cols, (a,b) => mask[a] !== false && mask[b] !== false && !board[a]?.relic && !board[b]?.relic, MIN_START_MOVES).length;
    if (hasRequired && Core.findMatches(board, rows, cols).length === 0 && startMoves >= MIN_START_MOVES) return board;
  }
  throw new Error(`Could not generate a shaped board with ${MIN_START_MOVES} starting moves`);
}

function reshufflePlayable() {
  const required = runtime.mode === "level" ? requiredCollectSymbols(runtime.level) : [];
  const specials = runtime.board.filter((cell) => cell?.special).map((cell) => cell.special);
  // Перемешивание не должно телепортировать ковчег: он остаётся там, куда упал.
  const relicCells = runtime.board.map((cell, index) => (cell?.relic ? index : -1)).filter((index) => index >= 0);
  const fresh = createPlayableBoard(ROWS, COLS, runtime.symbolIds, runtime.activeMask, required, relicCells);
  for (const special of specials) {
    const available = fresh.map((cell,index) => (cell && !cell.special && !cell.relic ? index : -1)).filter((index) => index >= 0);
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
  // У терний нет растровой картинки в наборе, а слой доски прячет знаковые
  // подстановки: без своего файла препятствие осталось бы вовсе без рисунка.
  if (type === "vine") return "web/assets/biblical-match-three/vine.svg";
  const obstacles = window.BiblicalMatchThreeV5Art?.obstacles || window.BiblicalMatchThreeV4Art?.obstacles || {};
  const key = type === "chain" ? "chains" : type === "tablet" ? "tablets" : type === "lamp" ? "candle" : "";
  return key ? (obstacles[key] || "") : "";
}

function cleanup() {
  if (!runtime) return;
  if (runtime.hintTimer) clearTimeout(runtime.hintTimer);
  runtime.abort?.abort();
  if (runtime.mode === "free" && runtime.screen === "board") {
    try { persistFreeRecord(false); } catch {}
  }
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
  wrap.setAttribute("aria-label", `Баланс ${starBalance()} звёзд`);
  return wrap;
}

function updateWallet() {
  const balance = starBalance();
  document.querySelectorAll("[data-bmt-wallet]").forEach((node) => { node.textContent = String(balance); });
  document.querySelectorAll(".bmt-wallet").forEach((node) => { node.setAttribute("aria-label", `Баланс ${balance} звёзд`); });
  document.querySelectorAll("[data-bmt-pre-balance]").forEach((node) => { node.textContent = `${balance} ★`; });
}
function goalText(goal) {
  if (goal.type === "score") return `Набрать ${Number(goal.count).toLocaleString("ru-RU")} очков`;
  if (goal.type === "collect") return `Собрать «${SYMBOL_BY_ID[goal.symbol]?.label || goal.symbol}» ×${goal.count}`;
  if (goal.type === "clearBlockers") return `Очистить «${BLOCKER_META[goal.blocker]?.label || goal.blocker}» ×${goal.count}`;
  if (goal.type === "lightLamps") return `Зажечь светильники ×${goal.count}`;
  if (goal.type === "activateSpecials") return `Активировать особые фишки ×${goal.count}`;
  if (goal.type === "cascade") return `Достичь каскада ×${goal.count}`;
  if (goal.type === "deliver") return `Опустить ковчег ×${goal.count}`;
  return "Выполнить цель";
}

function goalIcon(goal) {
  if (goal.type === "score") return "★";
  if (goal.type === "collect") return `<img src="${currentSymbolAsset(goal.symbol)}" alt="">`;
  if (goal.type === "clearBlockers") return BLOCKER_META[goal.blocker]?.icon || "▦";
  if (goal.type === "lightLamps") return "✦";
  if (goal.type === "activateSpecials") return "✺";
  if (goal.type === "cascade") return "↯";
  if (goal.type === "deliver") return `<img src="${currentSymbolAsset("ark")}" alt="">`;
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
  return 0;
}

function goalComplete(goal) { return currentGoalValue(goal) >= Number(goal.count || 0); }
function allGoalsComplete() { return runtime?.level?.goals?.every(goalComplete) || false; }

async function start(levelsUrl) {
  cleanup();
  const container = document.getElementById("game-container");
  if (!container) return;
  runtime = {
    abort: new AbortController(), levels: [], levelConfig: {}, progress: Progress.load(), screen: "loading", board: [], tileNodes: [], selected: null, busy: false,
    score: 0, moves: 0, collected: {}, mode: null, level: null, difficulty: null, symbolIds: [], hintTimer: null, lastSwap: null, cascade: 0, maxCascade: 1,
    specialsActivated: 0, blockers: new Map(), initialBlockerCounts: {}, blockerCleared: {}, relicsDelivered: 0, relicTotal: 0, vineGrow: 0, vineCap: 0, vineTurns: 0, preBoosters: new Set(), activeBooster: null, freeSessionReward: 0, freeStarted: false, lastGoalSnapshot: new Map(), activeMask: [], boardShape: "rect",
  };
  document.body.dataset.matchThree = "2";
  try {
    const response = await fetch(levelsUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    runtime.levelConfig = data;
    runtime.levels = Array.isArray(data.levels) ? data.levels : [];
    if (!runtime.levels.length) throw new Error("Нет уровней");
    renderMenu();
  } catch (error) {
    console.error("Biblical match-three v2 data error", error);
    container.innerHTML = `<section class="bmt-error"><div class="bmt-error__icon">!</div><h2>Не удалось открыть игру</h2><p>Данные уровней недоступны или повреждены.</p><button type="button" class="bmt-primary" id="bmt-error-back">В меню</button></section>`;
    document.getElementById("bmt-error-back")?.addEventListener("click", exitToAppMenu, { once: true });
  }
}

function renderMenu() {
  if (!runtime) return;
  persistFreeRecord(false); clearHint(); runtime.screen = "menu"; runtime.mode = null; runtime.activeBooster = null; setBusy(false); runtime.progress = Progress.load();
  const container = document.getElementById("game-container"); container.innerHTML = "";
  const shell = el("section", "bmt-shell bmt-menu bmt-v2");
  const top = el("header", "bmt-homebar");
  const back = button("←", "bmt-icon-button", exitToAppMenu); back.setAttribute("aria-label", "Назад");
  const title = el("div", "bmt-heading-wrap"); title.innerHTML = `<p class="bmt-kicker">Библейская головоломка</p><h2 class="bmt-title">Три в ряд</h2>`;
  top.append(back, title, walletBadge()); shell.append(top);
  const hero = el("section", "bmt-hero-v2");
  hero.innerHTML = `<div class="bmt-hero-v2__glow"></div><div class="bmt-hero-v2__icon"><img src="web/assets/biblical-match-three/bible.svg" alt=""></div><div class="bmt-hero-v2__copy"><span class="bmt-hero-v2__eyebrow">Путь, символы и комбинации</span><strong>Собирайте, создавайте усиления и проходите испытания</strong><span>${runtime.levels.length} уровней · особые фишки · библейские бустеры</span></div>`;
  shell.append(hero, renderDailyBlessing(), renderCampaignMap(), renderFreeModePanel());
  container.append(shell);
}

function renderDailyBlessing() {
  const claimable = Progress.canClaimDaily(runtime.progress);
  const amount = Number(runtime.levelConfig.dailyReward || 5);
  const card = el("section", `bmt-daily${claimable ? " is-ready" : ""}`);
  card.innerHTML = `<div class="bmt-daily__seal">✦</div><div class="bmt-daily__copy"><span>${claimable ? "Дар дня готов" : "Дар дня получен"}</span><strong>${claimable ? `Ежедневное благословение · +${amount} ★` : "Возвращайтесь завтра за новыми звёздами"}</strong></div>`;
  const claim = button(claimable ? `Получить +${amount} ★` : "Получено", "bmt-daily__button", () => {
    const result = Progress.claimDaily(runtime.progress, amount); runtime.progress = result.progress;
    if (result.ok) { updateWallet(); FX.haptic?.("success"); toast(`+${result.amount} ★ в общий баланс`, "success"); renderMenu(); }
  });
  claim.disabled = !claimable; card.append(claim); return card;
}

function renderCampaignMap() {
  const panel = el("section", "bmt-panel-v2 bmt-campaign");
  const totalRatings = Object.values(runtime.progress.levelRatings || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  panel.innerHTML = `<div class="bmt-section-head"><div><span class="bmt-section-kicker">Кампания</span><h3>Путь света</h3></div><div class="bmt-section-summary"><strong>${totalRatings}</strong><span>/ ${runtime.levels.length * 3} ★</span></div></div>`;
  const map = el("div", "bmt-map"); let chapter = "";
  runtime.levels.forEach((level, index) => {
    if (level.chapter !== chapter) { chapter = level.chapter; const chapterNode = el("div", "bmt-map__chapter"); chapterNode.innerHTML = `<span>${escapeHtml(chapter)}</span>`; map.append(chapterNode); }
    const unlocked = level.id <= runtime.progress.unlocked; const rating = Number(runtime.progress.levelRatings?.[String(level.id)] || 0);
    const node = button("", `bmt-map-node ${index % 2 ? "is-right" : "is-left"}${unlocked ? "" : " is-locked"}${level.id === runtime.progress.unlocked ? " is-current" : ""}`, () => { if (unlocked) openPreLevel(level); });
    node.disabled = !unlocked;
    node.innerHTML = `<span class="bmt-map-node__route" aria-hidden="true"></span><span class="bmt-map-node__medallion">${unlocked ? level.id : "◆"}</span><span class="bmt-map-node__body"><strong>${escapeHtml(level.title)}</strong><span>${unlocked ? `${"★".repeat(rating)}${"☆".repeat(3 - rating)}` : "Закрыто"}</span></span>`;
    map.append(node);
  });
  panel.append(map); return panel;
}

function renderFreeModePanel() {
  const panel = el("section", "bmt-panel-v2 bmt-free-panel");
  panel.innerHTML = `<div class="bmt-section-head"><div><span class="bmt-section-kicker">Рекорды</span><h3>Свободная игра</h3></div><p>Новые рекорды открывают награды ★</p></div>`;
  const grid = el("div", "bmt-free-grid");
  for (const [key, config] of Object.entries(FREE_MODES)) {
    const stats = runtime.progress.free?.[key] || {};
    const card = button("", `bmt-free-card bmt-free-card--${config.accent}`, () => beginFree(key));
    card.innerHTML = `<span class="bmt-free-card__mode">${config.label}</span><strong>${Number(stats.bestScore || 0).toLocaleString("ru-RU")}</strong><span class="bmt-free-card__record">лучший счёт</span><div class="bmt-free-card__meta"><span>↯ ×${Math.max(1, Number(stats.bestCascade || 1))}</span><span>✺ ${Number(stats.bestSpecials || 0)}</span><span>▶ ${Number(stats.games || 0)}</span></div><span class="bmt-free-card__cta">Играть →</span>`;
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
  sheet.innerHTML = `<button type="button" class="bmt-sheet__close" aria-label="Закрыть">×</button><div class="bmt-prelevel__head"><span>Уровень ${level.id}</span><h3>${escapeHtml(level.title)}</h3><p>Поле ${previewRows}×${COLS} · награда за первое прохождение: <strong>+${reward} ★</strong></p></div><div class="bmt-prelevel__goals">${level.goals.map((goal) => `<div><span>${goalIcon(goal)}</span><strong>${escapeHtml(goalText(goal))}</strong></div>`).join("")}</div><div class="bmt-prelevel__boost-title"><span>Усилители перед стартом</span><span class="bmt-prelevel__boost-meta"><small>Доступно <strong data-bmt-pre-balance>${starBalance()} ★</strong></small><small>Выбрано <strong data-bmt-pre-total>0 ★</strong></small></span></div><div class="bmt-preboosters"></div>`;
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
      else { FX.haptic?.("error"); toast(`Недостаточно звёзд: доступно ${starBalance()} ★`, "error"); }
      refreshBoosters();
    });
    node.dataset.bmtPreBooster = id; node.setAttribute("aria-pressed", "false");
    node.innerHTML = `<span class="bmt-prebooster__icon"><img src="${booster.asset}" alt=""></span><span class="bmt-prebooster__copy"><strong>${escapeHtml(booster.label)}</strong><small>${escapeHtml(booster.desc)}</small></span><span class="bmt-prebooster__price">${booster.cost} ★</span>`;
    boosters.append(node);
  }
  const actions = el("div", "bmt-prelevel__actions");
  const cancel = button("Назад", "bmt-secondary", () => overlay.remove());
  startButton = button("Начать уровень", "bmt-primary bmt-primary--large", () => {
    const total = selectedCost();
    const selectedBoosters = new Set(runtime.preBoosters);
    let spent = false;
    if (total > 0) {
      const spend = Progress.spendStars(total, `match3-preboost-level-${level.id}`);
      if (!spend.ok) { FX.haptic?.("error"); toast("Недостаточно звёзд", "error"); return; }
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
      setTimeout(() => { openPreLevel(level); toast("Не удалось применить усилитель — звёзды возвращены", "error"); }, 0);
    }
  });
  actions.append(cancel, startButton); sheet.append(actions); overlay.append(sheet); shell.append(overlay);
  refreshBoosters();
  sheet.querySelector(".bmt-sheet__close").addEventListener("click", () => overlay.remove(), { once: true });
}

function beginLevel(level, selectedBoosters = new Set()) {
  setupBoard({ mode: "level", level, difficulty: null, symbolIds: getLevelSymbolSet(level), moves: Number(level.moves || 24), selectedBoosters });
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
  const available = (index) => isActive(index) && runtime.board[index] && !runtime.board[index].special && !runtime.board[index].relic && !runtime.blockers.has(index) && !used.has(index);
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

function setupBoard({ mode, level, difficulty, symbolIds, moves, selectedBoosters }) {
  clearHint(); runtime.screen = "board"; runtime.mode = mode; runtime.level = level; runtime.difficulty = difficulty; runtime.symbolIds = symbolIds;
  ROWS = resolveBoardRows(mode, level, difficulty); runtime.boardShape = boardShapeFor(mode, level, difficulty); runtime.activeMask = makeActiveMask(runtime.boardShape, ROWS, COLS, level);
  const relicCells = mode === "level" ? levelRelicCells(level) : [];
  runtime.relicTotal = relicCells.length; runtime.relicsDelivered = 0;
  runtime.board = createPlayableBoard(ROWS, COLS, symbolIds, runtime.activeMask, mode === "level" ? requiredCollectSymbols(level) : [], relicCells); runtime.score = 0; runtime.moves = moves; runtime.collected = {}; runtime.selected = null; runtime.cascade = 0; runtime.maxCascade = 1; runtime.specialsActivated = 0; runtime.seededGoalSpecials = 0; runtime.lastSwap = null; runtime.tileNodes = []; runtime.activeBooster = null; runtime.freeSessionReward = 0; runtime.lastGoalSnapshot = new Map();
  // Ковчег на закрытой клетке фигурного поля не появится, поэтому цель считают
  // по тому, сколько их реально встало на доску.
  runtime.relicTotal = runtime.board.filter((cell) => cell?.relic).length;
  initBlockers(mode === "free" ? freeChallengeConfig(difficulty) : level); if (mode === "level") applyLevelGoalSpecials(level); applyPreBoosters(selectedBoosters || new Set());
  const container = document.getElementById("game-container"); container.innerHTML = ""; const shell = el("section", "bmt-shell bmt-board-screen bmt-v2");
  const top = el("header", "bmt-gamebar"); const back = button("←", "bmt-icon-button", () => runtime.mode === "free" ? openFreeExit() : openPause()); back.setAttribute("aria-label", runtime.mode === "free" ? "Завершить свободную игру" : "Пауза");
  const heading = el("div", "bmt-heading-wrap"); heading.innerHTML = `<p class="bmt-kicker">${mode === "level" ? `Уровень ${level.id}` : `Свободная игра · ${FREE_MODES[difficulty].label}`}</p><h2 class="bmt-title">${escapeHtml(mode === "level" ? level.title : "Рекордный режим")}</h2>`;
  top.append(back, heading, walletBadge()); shell.append(top);
  const stats = el("section", "bmt-stats-v2"); stats.innerHTML = `<div><span>Очки</span><strong id="bmt-score">0</strong>${mode === "free" ? '<small id="bmt-best">рекорд 0</small>' : ""}</div><div><span>Ходы</span><strong id="bmt-moves">${Number.isFinite(moves) ? moves : "∞"}</strong><small>осталось</small></div><div><span>Каскад</span><strong id="bmt-cascade">×1</strong><small id="bmt-special-count">0 особых</small></div>`; shell.append(stats);
  if (mode === "level") { const goals = el("section", "bmt-goals-v2"); goals.id = "bmt-goals"; shell.append(goals); }
  const boardWrap = el("section", "bmt-board-wrap"); const board = el("div", "bmt-board"); board.setAttribute("role", "grid"); board.setAttribute("aria-label", `Игровое поле ${ROWS} на ${COLS}`); board.style.setProperty("--bmt-rows", String(ROWS)); board.style.setProperty("--bmt-cols", String(COLS)); board.style.setProperty("--bmt-board-ratio", `${COLS} / ${ROWS}`); board.dataset.rows = String(ROWS); board.dataset.cols = String(COLS); board.dataset.shape = runtime.boardShape; board.dataset.activeCells = String(runtime.activeMask.filter(Boolean).length); board.dataset.startMoves = String(countPlayableMoves(runtime.board));
  for (let index = 0; index < ROWS * COLS; index += 1) {
    const tile = el("button", "bmt-tile"); tile.type = "button"; tile.dataset.index = String(index); tile.setAttribute("role", "gridcell");
    const active = isActive(index); tile.classList.toggle("is-hole", !active); tile.disabled = !active; if (!active) { tile.tabIndex = -1; tile.setAttribute("aria-hidden", "true"); }
    const piece = el("span", "bmt-piece-wrap"); const img = new Image(); img.className = "bmt-piece"; img.draggable = false; img.alt = ""; piece.append(img); tile.append(piece, el("span", "bmt-special-mark"), el("span", "bmt-blocker"));
    tile.addEventListener("click", () => chooseTile(index), { signal: runtime.abort.signal }); runtime.tileNodes.push(tile); board.append(tile);
  }
  if (runtime.relicTotal) { board.classList.add("has-relic-gate"); for (let col = 0; col < COLS; col += 1) { const gate = bottomActiveIndex(col); if (gate >= 0) runtime.tileNodes[gate]?.classList.add("is-relic-gate"); } }
  boardWrap.append(board); shell.append(boardWrap);
  const boosters = el("section", "bmt-booster-tray"); boosters.innerHTML = `<div class="bmt-booster-tray__label"><span>Помощь</span><small>за звёзды</small></div>`;
  for (const [id, booster] of Object.entries(IN_BOOSTERS)) {
    const node = button("", "bmt-booster", () => activateBooster(id)); node.dataset.booster = id; node.innerHTML = `<span class="bmt-booster__icon"><img src="${booster.asset}" alt=""></span><span class="bmt-booster__name">${escapeHtml(booster.label)}</span><span class="bmt-booster__cost">${booster.cost} ★</span>`; boosters.append(node);
  }
  shell.append(boosters);
  const actions = el("div", "bmt-actions-v2"); const hint = button("Подсказка", "bmt-action-button", showHint); hint.innerHTML = `<span>✦</span><strong>Подсказка</strong>`; const pauseButton = button(mode === "free" ? "Завершить" : "Пауза", "bmt-action-button", mode === "free" ? openFreeExit : openPause); pauseButton.innerHTML = `<span>${mode === "free" ? "✓" : "Ⅱ"}</span><strong>${mode === "free" ? "Завершить" : "Пауза"}</strong>`; actions.append(hint, pauseButton); shell.append(actions);
  container.append(shell); updateAllTiles(); updateHud(); animateEntrance(); scheduleHint();
  if (runtime.seededGoalSpecials > 0) setTimeout(() => toast("Особые фишки уже на поле — просто смахните нужную фишку", "info"), 560);
  if (!runtime.progress.tutorialSeen?.["v18-first-run"]) setTimeout(showTutorial, 420);
}

function applyPreBoosters(selected) {
  if (!selected?.size) return;
  const randomEmpty = () => {
    const candidates = runtime.board
      .map((cell, index) => (cell && !cell.special && !cell.relic && isActive(index) && !runtime.blockers.has(index) ? index : -1))
      .filter((index) => index >= 0);
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : -1;
  };
  if (selected.has("manna")) { const a = randomEmpty(); if (a >= 0) runtime.board[a].special = "lineH"; const b = randomEmpty(); if (b >= 0) runtime.board[b].special = "lineV"; }
  if (selected.has("lampOil")) { const index = randomEmpty(); if (index >= 0) runtime.board[index].special = "burst"; }
  if (selected.has("covenant")) { const index = randomEmpty(); if (index >= 0) runtime.board[index].special = "rainbow"; }
}

function animateEntrance() {
  if (FX.prefersReducedMotion?.()) return;
  runtime.tileNodes.forEach((tile, index) => { tile.style.setProperty("--bmt-enter-delay", `${Math.min(360, (Math.floor(index / COLS) + (index % COLS) * 0.18) * 28)}ms`); tile.classList.add("is-entering"); });
  setTimeout(() => runtime?.tileNodes?.forEach((tile) => tile.classList.remove("is-entering")), 800);
}

function showTutorial() {
  if (!runtime || runtime.progress.tutorialSeen?.["v18-first-run"]) return;
  const steps = [
    { title:"Соберите три", text:"Смахните фишку к соседней. Совпадение из трёх исчезнет, а новые фишки упадут сверху.", focus:".bmt-board" },
    { title:"Смотрите на цели", text:"В кампании сверху показаны все условия уровня. Нужный символ всегда входит в набор фишек этого уровня.", focus:".bmt-goals-v2" },
    { title:"Форма поля и препятствия", text:"На следующих уровнях поле станет овальным, полукруглым, ромбом, крестом или щитом. Цепи и скрижали разрушаются совпадениями рядом или прямо на них.", focus:".bmt-board" },
    { title:"Тернии и ковчег", text:"Тернии сами разрастаются на соседние клетки, если их не выжигать совпадениями прямо на них. Ковчег двигать нельзя — убирайте фишки под ним, чтобы он опустился на нижний ряд.", focus:".bmt-board" },
    { title:"Особые фишки и помощь", text:"Четыре и пять одинаковых создают усиления. Бустеры снизу помогают пройти сложный момент и не тратят ход.", focus:".bmt-booster-tray" }
  ];
  const shell = document.querySelector(".bmt-shell"); if (!shell) return; const overlay = el("div", "bmt-tutorial bmt-v18-tutorial");
  overlay.innerHTML = `<div class="bmt-tutorial__card"><span class="bmt-tutorial__spark">✦</span><small class="bmt-v18-tutorial-step"></small><h3></h3><p></p><div class="bmt-v18-tutorial-actions"><button type="button" class="bmt-secondary" data-skip>Пропустить</button><button type="button" class="bmt-primary" data-next>Далее</button></div></div>`; shell.append(overlay);
  let index = 0; let focused = null;
  const finish = () => { focused?.classList.remove("is-tutorial-focus"); runtime.progress.tutorialSeen ||= {}; runtime.progress.tutorialSeen["v18-first-run"] = true; Progress.save(runtime.progress); overlay.remove(); scheduleHint(); };
  const render = () => { focused?.classList.remove("is-tutorial-focus"); const step = steps[index]; focused = document.querySelector(step.focus); focused?.classList.add("is-tutorial-focus"); overlay.querySelector(".bmt-v18-tutorial-step").textContent = `${index + 1} / ${steps.length}`; overlay.querySelector("h3").textContent = step.title; overlay.querySelector("p").textContent = step.text; overlay.querySelector("[data-next]").textContent = index === steps.length - 1 ? "Играть" : "Далее"; };
  overlay.querySelector("[data-skip]").addEventListener("click", finish); overlay.querySelector("[data-next]").addEventListener("click", () => { if (index >= steps.length - 1) finish(); else { index += 1; render(); } }); render();
}

function chooseTile(index) {
  if (!runtime || runtime.busy || !isActive(index)) return; clearHint();
  if (runtime.activeBooster) { useTargetBooster(runtime.activeBooster, index); return; }
  if (isRelic(index)) { toast("Ковчег не двигают — убирайте фишки под ним", "info"); FX.haptic?.("error"); return; }
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
  if (!runtime || runtime.busy || !isActive(a) || !isActive(b)) return; setBusy(true); runtime.lastSwap = [a, b];
  const original = Core.cloneBoard(runtime.board); const combo = Core.specialComboClearSet(original, a, b, ROWS, COLS); await animateSwap(a, b); runtime.board = Core.swap(runtime.board, a, b); updateAllTiles();
  if (combo) {
    if (runtime.mode === "level" || (runtime.mode === "free" && Number.isFinite(runtime.moves))) runtime.moves -= 1; FX.haptic?.("success"); await playComboEffect(combo.combo, a, b); await clearAndCascade(combo.clearSet, 1, new Map(), { combo: combo.combo }); finishTurn(); return;
  }
  if (!Core.findMatches(runtime.board, ROWS, COLS).length) {
    await pause(50); await animateSwap(a, b, true); runtime.board = original; updateAllTiles(); runtime.tileNodes[a]?.classList.add("is-invalid"); runtime.tileNodes[b]?.classList.add("is-invalid"); FX.haptic?.("error"); await pause(260); runtime.tileNodes[a]?.classList.remove("is-invalid"); runtime.tileNodes[b]?.classList.remove("is-invalid"); setBusy(false); scheduleHint(); return;
  }
  if (runtime.mode === "level" || (runtime.mode === "free" && Number.isFinite(runtime.moves))) runtime.moves -= 1; await resolveMatches(1); finishTurn();
}

async function resolveMatches(cascade) {
  if (!runtime) return;
  const analysis = Core.analyzeMatches(runtime.board, ROWS, COLS, runtime.lastSwap || []); if (!analysis.groups.length) return;
  await clearAndCascade(analysis.clearSet, cascade, analysis.creations);
}

function expandSpecials(initialSet) {
  const clearSet = new Set(initialSet); const queue = [...clearSet]; const activated = new Set();
  while (queue.length) {
    const index = queue.shift(); const cell = runtime.board[index]; if (!cell?.special || activated.has(index)) continue; activated.add(index);
    const add = (candidate) => { if (candidate < 0 || candidate >= runtime.board.length || clearSet.has(candidate) || runtime.board[candidate]?.relic) return; clearSet.add(candidate); queue.push(candidate); };
    if (cell.special === "lineH") { Core.rowIndices(index, ROWS, COLS).forEach(add); FX.trumpet?.(index, "h"); }
    else if (cell.special === "lineV") { Core.columnIndices(index, ROWS, COLS).forEach(add); FX.trumpet?.(index, "v"); }
    else if (cell.special === "burst") { Core.areaIndices(index, 1, ROWS, COLS).forEach(add); FX.lightBurst?.(index); }
    else if (cell.special === "rainbow") FX.covenant?.(index, [...clearSet].filter((target) => target !== index));
  }
  for (const index of [...clearSet]) if (runtime.board[index]?.relic) clearSet.delete(index);
  return { clearSet, activated };
}

async function clearAndCascade(initialSet, cascade, creations = new Map(), meta = {}) {
  if (!runtime) return;
  const expanded = expandSpecials(initialSet); const clearSet = expanded.clearSet; runtime.specialsActivated += expanded.activated.size; runtime.cascade = cascade; runtime.maxCascade = Math.max(runtime.maxCascade, cascade);
  if (cascade > 1) { const anchor = [...clearSet][0] ?? 0; FX.floatText?.(anchor, `КАСКАД ×${cascade}`, cascade >= 4 ? "violet" : "gold"); FX.haptic?.(); }
  const clearedByType = {};
  for (const index of clearSet) { const cell = runtime.board[index]; if (!cell) continue; clearedByType[cell.type] = (clearedByType[cell.type] || 0) + 1; runtime.tileNodes[index]?.classList.add("is-clearing"); FX.particleBurst?.(index, cell.special ? "gold" : "blue", cell.special ? 10 : 5); }
  const blockerScore = damageBlockers(clearSet); const base = clearSet.size * 34 + blockerScore; const comboBonus = meta.combo ? 240 : 0; runtime.score += Math.round((base + comboBonus) * (1 + Math.max(0, cascade - 1) * 0.55));
  for (const [type, count] of Object.entries(clearedByType)) runtime.collected[type] = (runtime.collected[type] || 0) + count;
  updateHud(true); await pause(205);
  for (const index of clearSet) runtime.board[index] = null;
  for (const [index, special] of creations.entries()) if (runtime.board[index] && !runtime.board[index].relic) { runtime.board[index].special = special; FX.forge?.(index, special); FX.floatText?.(index, specialLabel(special), special === "rainbow" ? "violet" : "gold"); }
  const motion = collapseBoard(); updateAllTiles(); animateDropMotion(motion); await pause(motion.maxDistance > 2 ? 300 : 240);
  if (deliverRelics()) { const landing = collapseBoard(); updateAllTiles(); animateDropMotion(landing); updateHud(true); await pause(260); }
  const next = Core.findMatchGroups(runtime.board, ROWS, COLS); if (next.length) await resolveMatches(cascade + 1);
}

function specialLabel(special) { if (special === "lineH" || special === "lineV") return "ТРУБА"; if (special === "burst") return "СВЕТ"; if (special === "rainbow") return "ЗАВЕТ"; return "ОСОБАЯ"; }

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
  for (const [index, distance] of motion.distanceByDestination.entries()) { const tile = runtime.tileNodes[index]; if (!tile) continue; tile.style.setProperty("--bmt-drop-distance", String(distance)); tile.classList.remove("is-dropping"); void tile.offsetWidth; tile.classList.add("is-dropping"); }
  setTimeout(() => runtime?.tileNodes?.forEach((tile) => tile.classList.remove("is-dropping")), 420);
}

// Ковчег считается доставленным, когда падение приносит его на нижнюю живую
// клетку своего столбца: у фигурных полей это не обязательно последний ряд.
function deliverRelics() {
  if (!runtime?.relicTotal) return 0;
  let delivered = 0;
  for (let index = 0; index < runtime.board.length; index += 1) {
    if (!runtime.board[index]?.relic) continue;
    if (index !== bottomActiveIndex(index % COLS)) continue;
    runtime.board[index] = null; runtime.relicsDelivered += 1; delivered += 1; runtime.score += RELIC_SCORE;
    FX.relicLanded?.(index); FX.floatText?.(index, "КОВЧЕГ", "gold"); FX.haptic?.("success");
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
      if (runtime.blockers.has(target) || !isActive(target) || !runtime.board[target] || runtime.board[target].relic) continue;
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

function damageBlockers(clearSet) {
  if (!runtime.blockers.size) return 0;
  const direct = new Set(clearSet); const adjacent = new Set();
  for (const index of direct) { const { row, col } = Core.coordinates(index, COLS); [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => { const rr = row + dr; const cc = col + dc; if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) adjacent.add(rr * COLS + cc); }); }
  let score = 0;
  for (const [index, blocker] of [...runtime.blockers.entries()]) {
    if (blocker.type === "lamp") { if (!blocker.lit && (direct.has(index) || adjacent.has(index))) { blocker.lit = true; runtime.tileNodes[index]?.classList.add("is-blocker-lit"); setTimeout(() => runtime?.tileNodes?.[index]?.classList.remove("is-blocker-lit"), 360); score += 80; FX.ring?.(index, "gold"); FX.floatText?.(index, "СВЕТ", "gold"); } continue; }
    const hit = blocker.type === "tablet" || blocker.type === "vine" ? direct.has(index) : (direct.has(index) || adjacent.has(index)); if (!hit) continue; blocker.layers -= 1; const tile = runtime.tileNodes[index]; tile?.classList.remove("is-blocker-hit", "is-blocker-breaking"); if (tile) { void tile.offsetWidth; tile.classList.add(blocker.layers <= 0 ? "is-blocker-breaking" : "is-blocker-hit"); setTimeout(() => tile.classList.remove("is-blocker-hit", "is-blocker-breaking"), 360); } score += 45; FX.particleBurst?.(index, blocker.type === "chain" ? "blue" : blocker.type === "vine" ? "green" : "gold", 7);
    if (blocker.layers <= 0) { runtime.blockers.delete(index); runtime.blockerCleared[blocker.type] = (runtime.blockerCleared[blocker.type] || 0) + 1; score += 90; FX.floatText?.(index, blocker.type === "vine" ? "ВЫЖЖЕНО" : "ОЧИЩЕНО", "green"); }
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
    toast("Нет доступных ходов — поле перемешано", "info");
    FX.haptic?.();
    window.setTimeout(() => {
      if (!runtime) return;
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

function finishTurn() {
  if (!runtime) return; runtime.lastSwap = null; runtime.cascade = 0; updateHud();
  if (runtime.mode === "level" && allGoalsComplete()) { finishLevel(true); return; }
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
    const rating = starsForLevel(); const result = Progress.completeLevel(runtime.progress, runtime.level.id, rating, Number(runtime.level.reward || 0), runtime.levels.length); runtime.progress = result.progress; updateWallet(); FX.haptic?.("success"); FX.celebrate?.();
    card.innerHTML = `<div class="bmt-result-card__halo">✦</div><span class="bmt-result-card__eyebrow">Испытание пройдено</span><h3>${escapeHtml(runtime.level.title)}</h3><div class="bmt-result-stars" aria-label="${rating} из 3">${[1,2,3].map((n) => `<span class="${n <= rating ? "is-on" : ""}">★</span>`).join("")}</div><strong class="bmt-result-score">${runtime.score.toLocaleString("ru-RU")} очков</strong><div class="bmt-result-reward"><span>Награда</span><strong>+${result.awarded} ★</strong></div><div class="bmt-result-actions"></div>`;
    const actions = card.querySelector(".bmt-result-actions"); actions.append(button("К карте", "bmt-secondary", () => { overlay.remove(); renderMenu(); }), button("Дальше", "bmt-primary", () => { overlay.remove(); setBusy(false); const next = runtime.levels.find((item) => item.id === runtime.level.id + 1); if (next) openPreLevel(next); else renderMenu(); }));
  } else {
    FX.haptic?.("error"); const noMoves = reason === "noMoves"; const continueCost = Number(runtime.levelConfig.continueCost || 8); const canContinue = !noMoves && starBalance() >= continueCost;
    card.innerHTML = `<div class="bmt-result-card__halo is-muted">◇</div><span class="bmt-result-card__eyebrow">${noMoves ? "Поле исчерпано" : "Почти получилось"}</span><h3>${noMoves ? "Нет доступных ходов" : "Ходы закончились"}</h3><p>${noMoves ? "На поле не осталось допустимых комбинаций. Уровень завершён." : "Можно продолжить ещё 5 ходов или начать заново."}</p><div class="bmt-result-progress">${runtime.level.goals.map((goal) => { const current = Math.min(Number(goal.count), currentGoalValue(goal)); return `<span>${goalIcon(goal)} ${current}/${goal.count}</span>`; }).join("")}</div><div class="bmt-result-actions"></div>`;
    const actions = card.querySelector(".bmt-result-actions"); actions.append(button("Заново", "bmt-secondary", () => { overlay.remove(); setBusy(false); beginLevel(runtime.level); }));
    if (noMoves) actions.append(button("К карте", "bmt-primary", () => { overlay.remove(); renderMenu(); }));
    else { const more = button(`+5 ходов · ${continueCost} ★`, "bmt-primary", () => { const spend = Progress.spendStars(continueCost, `match3-continue-level-${runtime.level.id}`); if (!spend.ok) { toast("Недостаточно звёзд", "error"); return; } updateWallet(); overlay.remove(); runtime.moves = 5; setBusy(false); updateHud(); scheduleHint(); }); more.disabled = !canContinue; actions.append(more); card.append(button("К карте уровней", "bmt-link-button", () => { overlay.remove(); renderMenu(); })); }
  }
  overlay.append(card); document.querySelector(".bmt-shell")?.append(overlay);
}

function persistFreeRecord(showToast) {
  if (!runtime || runtime.mode !== "free" || !runtime.difficulty) return null;
  const result = Progress.recordFree(runtime.progress, runtime.difficulty, { score: runtime.score, maxCascade: runtime.maxCascade, specialsActivated: runtime.specialsActivated }); runtime.progress = result.progress;
  if (result.awarded > 0) { runtime.freeSessionReward += result.awarded; updateWallet(); if (showToast) toast(`Рубеж рекорда: +${result.awarded} ★`, "success"); }
  updateFreeHud(result.stats); return result;
}

function updateFreeHud(stats = runtime?.progress?.free?.[runtime?.difficulty]) {
  if (!runtime || runtime.mode !== "free") return; const best = document.getElementById("bmt-best"); const moves = document.getElementById("bmt-moves"); if (best) best.textContent = `рекорд ${Number(stats?.bestScore || 0).toLocaleString("ru-RU")}`; if (moves) moves.textContent = Number.isFinite(runtime.moves) ? String(Math.max(0, runtime.moves)) : `${runtime.freeSessionReward} ★`;
}

function openFreeExit(reason = "manual") {
  if (!runtime || runtime.mode !== "free") return; persistFreeRecord(false); const stats = runtime.progress.free?.[runtime.difficulty] || {}; const overlay = el("div", "bmt-result-overlay"); const card = el("section", "bmt-result-card"); const isRecord = runtime.score >= Number(stats.bestScore || 0) && runtime.score > 0;
  card.innerHTML = `<div class="bmt-result-card__halo">${isRecord ? "★" : "↯"}</div><span class="bmt-result-card__eyebrow">${reason === "noMoves" ? "Нет доступных ходов" : reason === "moves" ? "30 ходов завершены" : isRecord ? "Новый личный рекорд" : "Свободная игра"}</span><h3>${runtime.score.toLocaleString("ru-RU")} очков</h3>${reason === "noMoves" ? "<p>На поле не осталось допустимых комбинаций. Партия завершена.</p>" : ""}<div class="bmt-free-result"><span><b>↯ ×${runtime.maxCascade}</b> лучший каскад</span><span><b>✺ ${runtime.specialsActivated}</b> особых активировано</span><span><b>+${runtime.freeSessionReward} ★</b> заработано в попытке</span></div><div class="bmt-result-actions"></div>`;
  const actions = card.querySelector(".bmt-result-actions"); actions.append(button("В меню", "bmt-secondary", () => { overlay.remove(); renderMenu(); }), button("Играть ещё", "bmt-primary", () => { overlay.remove(); beginFree(runtime.difficulty); })); overlay.append(card); document.querySelector(".bmt-shell")?.append(overlay);
}

function openPause() {
  if (!runtime || runtime.screen !== "board") return; clearHint(); const overlay = el("div", "bmt-pause-overlay"); overlay.innerHTML = `<section class="bmt-pause-card"><span class="bmt-pause-card__icon">Ⅱ</span><h3>Пауза</h3><p>${runtime.level ? `Уровень ${runtime.level.id} · ${escapeHtml(runtime.level.title)}` : "Свободная игра"}</p><div class="bmt-pause-card__actions"></div></section>`;
  const actions = overlay.querySelector(".bmt-pause-card__actions"); actions.append(button("Продолжить", "bmt-primary", () => { overlay.remove(); scheduleHint(); }), button("Начать заново", "bmt-secondary", () => { overlay.remove(); if (runtime.mode === "level") beginLevel(runtime.level); else beginFree(runtime.difficulty); }), button("В меню игры", "bmt-link-button", () => { overlay.remove(); renderMenu(); })); document.querySelector(".bmt-shell")?.append(overlay);
}

function activateBooster(id) {
  if (!runtime || runtime.busy) return; clearHint(); const booster = IN_BOOSTERS[id]; if (!booster) return;
  if (runtime.activeBooster === id) { runtime.activeBooster = null; updateBoosterState(); toast("Бустер отменён"); return; }
  runtime.activeBooster = id; runtime.selected = null; updateSelection(); updateBoosterState(); toast(`${booster.label}: выберите клетку`, "info"); FX.haptic?.();
}

function updateBoosterState() {
  document.querySelectorAll("[data-booster]").forEach((node) => { node.classList.toggle("is-active", node.dataset.booster === runtime.activeBooster); });
  document.querySelector(".bmt-board")?.classList.toggle("is-targeting", Boolean(runtime.activeBooster));
}

function spendBooster(id) {
  const booster = IN_BOOSTERS[id]; const result = Progress.spendStars(booster.cost, `match3-booster-${id}`);
  if (!result.ok) { toast(`Нужно ${booster.cost} ★`, "error"); FX.haptic?.("error"); return false; }
  runtime.progress = Progress.noteBoosterUse(runtime.progress, id); updateWallet(); return true;
}

async function useTargetBooster(id, index) {
  if (!runtime || runtime.busy || !isActive(index)) return;
  if (id === "rainbow" && (runtime.blockers.has(index) || isRelic(index))) { toast("Выберите фишку без препятствия", "info"); FX.haptic?.("error"); return; }
  if (!spendBooster(id)) { runtime.activeBooster = null; updateBoosterState(); return; }
  runtime.activeBooster = null; updateBoosterState(); setBusy(true);
  if (id === "rainbow") {
    const cell = runtime.board[index];
    if (!cell) { setBusy(false); scheduleHint(); return; }
    runtime.board[index] = { ...cell, special:"rainbow" };
    updateTile(runtime.tileNodes[index], runtime.board[index], runtime.blockers.get(index));
    FX.ring?.(index, "rainbow"); FX.floatText?.(index, "РАДУГА", "violet"); FX.haptic?.("success");
    toast("Радуга готова — смахните её с нужным символом", "success");
    setBusy(false); scheduleHint(); return;
  }
  if (id === "sling") { FX.floatText?.(index, "ПРАЩА", "gold"); FX.ring?.(index, "gold"); await clearAndCascade(new Set([index]), 1, new Map(), { booster: id }); }
  else if (id === "staff") { FX.floatText?.(index, "ПОСОХ", "blue"); FX.trumpet?.(index, "v"); await clearAndCascade(new Set(Core.columnIndices(index, ROWS, COLS)), 1, new Map(), { booster: id }); }
  else if (id === "jericho") { FX.floatText?.(index, "ИЕРИХОН", "violet"); FX.lightBurst?.(index); await clearAndCascade(new Set(Core.areaIndices(index, 1, ROWS, COLS)), 1, new Map(), { booster: id }); }
  finishTurn();
}

function playComboEffect(combo, a, b) {
  const index = b ?? a;
  const everything = runtime?.board?.map((_, position) => position).filter((position) => position !== index && isActive(position)) || [];
  if (combo === "doubleRainbow") { FX.covenant?.(index, everything); FX.floatText?.(index, "РАДУГА ЗАВЕТА", "violet"); }
  else if (combo === "rainbowSpecial") { FX.covenant?.(index, everything.slice(0, 12)); FX.floatText?.(index, "СИЛА ЗАВЕТА", "violet"); }
  else if (combo === "doubleLine") { FX.trumpet?.(index, "h"); FX.trumpet?.(index, "v"); FX.floatText?.(index, "ДВОЙНЫЕ ТРУБЫ", "gold"); }
  else if (combo === "lineBurst") { FX.lightBurst?.(index); FX.trumpet?.(index, "h"); FX.floatText?.(index, "СВЕТ И ТРУБЫ", "gold"); }
  else if (combo === "doubleBurst") { FX.lightBurst?.(a); FX.lightBurst?.(b); FX.floatText?.(index, "ДВОЙНОЙ СВЕТ", "gold"); }
  else FX.floatText?.(index, "КОМБИНАЦИЯ", "gold");
  return pause(180);
}

function updateHud(pulseGoals = false) {
  if (!runtime) return; const score = document.getElementById("bmt-score"); const moves = document.getElementById("bmt-moves"); const cascade = document.getElementById("bmt-cascade"); const specials = document.getElementById("bmt-special-count");
  if (score) score.textContent = runtime.score.toLocaleString("ru-RU"); if (moves && (runtime.mode === "level" || Number.isFinite(runtime.moves))) moves.textContent = String(Math.max(0, runtime.moves)); if (cascade) cascade.textContent = `×${Math.max(1, runtime.cascade || runtime.maxCascade || 1)}`; if (specials) specials.textContent = `${runtime.specialsActivated} особых`; renderGoals(pulseGoals); if (runtime.mode === "free") updateFreeHud(); updateWallet();
}

function renderGoals(pulseChanged = false) {
  const root = document.getElementById("bmt-goals"); if (!root || runtime.mode !== "level") return; const goals = runtime.level.goals || [];
  // Четыре цели не помещаются в три колонки: подпись срезалась многоточием.
  root.dataset.count = String(goals.length);
  root.innerHTML = goals.map((goal, index) => { const current = currentGoalValue(goal); const capped = Math.min(Number(goal.count || 0), current); const done = goalComplete(goal); return `<div class="bmt-goal${done ? " is-done" : ""}" data-goal="${index}"><span class="bmt-goal__icon">${goalIcon(goal)}</span><span class="bmt-goal__copy"><small>${escapeHtml(goalText(goal).replace(/ ×\d+$/, ""))}</small><strong>${capped}/${goal.count}</strong></span><span class="bmt-goal__check">✓</span></div>`; }).join("");
  if (pulseChanged) goals.forEach((goal, index) => { const value = currentGoalValue(goal); const before = runtime.lastGoalSnapshot.get(index); if (before != null && value > before) FX.pulseGoal?.(root.querySelector(`[data-goal="${index}"]`)); runtime.lastGoalSnapshot.set(index, value); }); else goals.forEach((goal, index) => runtime.lastGoalSnapshot.set(index, currentGoalValue(goal)));
}

function updateSelection() { runtime.tileNodes.forEach((tile, index) => tile.classList.toggle("is-selected", index === runtime.selected)); }
function updateAllTiles() { runtime.tileNodes.forEach((tile, index) => updateTile(tile, runtime.board[index], runtime.blockers.get(index))); updateSelection(); updateBoosterState(); }

function updateTile(tile, cell, blocker) {
  tile.classList.remove("is-clearing", "is-invalid", "is-line-h", "is-line-v", "is-burst", "is-rainbow", "has-tablet", "has-chain", "has-lamp", "has-vine", "is-relic", "is-lamp-lit", "is-layer-2", "is-layer-3");
  const img = tile.querySelector(".bmt-piece"); const specialMark = tile.querySelector(".bmt-special-mark"); const blockerMark = tile.querySelector(".bmt-blocker"); const index = Number(tile.dataset.index); const active = isActive(index); tile.classList.toggle("is-hole", !active); tile.disabled = !active;
  if (!active) { tile.classList.add("is-empty"); if (img) img.removeAttribute("src"); if (specialMark) specialMark.textContent = ""; if (blockerMark) blockerMark.innerHTML = ""; return; }
  if (!cell) { tile.classList.add("is-empty"); if (img) img.removeAttribute("src"); if (specialMark) specialMark.textContent = ""; }
  else if (cell.relic) {
    tile.classList.remove("is-empty"); tile.classList.add("is-relic");
    const asset = currentSymbolAsset("ark"); if (img && img.getAttribute("src") !== asset) img.src = asset; if (img) img.alt = "Ковчег";
    if (specialMark) specialMark.textContent = "▼";
    tile.setAttribute("aria-label", "Ковчег, опустите его на нижний ряд");
  }
  else { tile.classList.remove("is-empty"); const symbol = SYMBOL_BY_ID[cell.type]; const asset = currentSymbolAsset(cell.type); if (img && img.getAttribute("src") !== asset) img.src = asset; if (img) img.alt = symbol.label; tile.setAttribute("aria-label", `${symbol.label}${cell.special ? ", особая фишка" : ""}`); if (cell.special) tile.classList.add(`is-${cell.special.replace("lineH", "line-h").replace("lineV", "line-v")}`); if (specialMark) specialMark.textContent = cell.special === "rainbow" ? "✦" : cell.special === "burst" ? "✺" : cell.special ? "↯" : ""; }
  if (blocker && blockerMark) { tile.classList.add(`has-${blocker.type}`); if (blocker.layers >= 2) tile.classList.add("is-layer-2"); if (blocker.layers >= 3) tile.classList.add("is-layer-3"); if (blocker.type === "lamp" && blocker.lit) tile.classList.add("is-lamp-lit"); blockerMark.innerHTML = blockerMarkup(blocker); const label = BLOCKER_META[blocker.type]?.label || blocker.type; tile.setAttribute("aria-label", `${tile.getAttribute("aria-label") || "Фишка"}, препятствие ${label}${blocker.layers > 1 ? `, ${blocker.layers} слоя` : ""}`); } else if (blockerMark) blockerMark.innerHTML = "";
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

window.addEventListener("app:stars-changed", updateWallet);
window.startBiblicalMatchThreeGame = start;
window.__biblicalMatchThreeCleanup = cleanup;
const rulesApi = { version:21, minStartMoves:MIN_START_MOVES, blockerTypes:Object.keys(BLOCKER_META), levelRelicCells, bottomActiveIndex, spreadVines, deliverRelics, getLevelSymbolSet, requiredCollectSymbols, makeActiveMask, boardShapeFor, levelShapes:LEVEL_SHAPES, shapeLabels:SHAPE_LABELS, findPlayableMoves:(limit=Infinity)=>findPlayableMoves(runtime?.board,limit), countPlayableMoves:(limit=Infinity)=>countPlayableMoves(runtime?.board,limit), checkDeadBoard:finishIfNoMoves };
window.BiblicalMatchThreeV18Rules = rulesApi;
window.BiblicalMatchThreeV20Rules = rulesApi;
})();
