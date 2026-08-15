(() => {
"use strict";
const Core = window.BiblicalMatchThreeCore;
if (!Core) throw new Error("BiblicalMatchThreeCore is not loaded");
const ROWS = 8;
const COLS = 8;
const PROGRESS_KEY = "biblical_match_three_progress_v1";
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
easy: { label: "Лёгкий", symbolCount: 6, hintDelay: 7000 },
medium: { label: "Средний", symbolCount: 7, hintDelay: 10000 },
hard: { label: "Сложный", symbolCount: 9, hintDelay: 14000 },
};
let runtime = null;
function readProgress() {
try {
const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
return {
unlocked: Math.max(1, Number(parsed.unlocked || 1)),
stars: parsed.stars && typeof parsed.stars === "object" ? parsed.stars : {},
bestFree: parsed.bestFree && typeof parsed.bestFree === "object" ? parsed.bestFree : {},
};
} catch {
return { unlocked: 1, stars: {}, bestFree: {} };
}
}
function saveProgress(progress) {
try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch {}
}
function cleanup() {
if (!runtime) return;
if (runtime.hintTimer) clearTimeout(runtime.hintTimer);
runtime.abort?.abort();
runtime = null;
delete document.body.dataset.matchThree;
}
function exitToMenu() {
cleanup();
const goBack = window.appGoToMainMenu || window.goToMainMenu;
if (typeof goBack === "function") goBack();
}
function el(tag, className, text) {
const node = document.createElement(tag);
if (className) node.className = className;
if (text != null) node.textContent = text;
return node;
}
function createButton(text, className, onClick) {
const button = el("button", className, text);
button.type = "button";
button.addEventListener("click", onClick, { signal: runtime.abort.signal });
return button;
}
function getSymbolSet(count) {
return SYMBOLS.slice(0, Math.max(3, Math.min(SYMBOLS.length, count))).map((item) => item.id);
}
async function start(levelsUrl) {
cleanup();
const container = document.getElementById("game-container");
if (!container) return;
runtime = {
abort: new AbortController(),
levels: [],
progress: readProgress(),
screen: "menu",
board: [],
tileNodes: [],
selected: null,
busy: false,
score: 0,
moves: 0,
collected: {},
mode: null,
level: null,
difficulty: null,
hintTimer: null,
lastSwap: null,
cascade: 0,
};
document.body.dataset.matchThree = "1";
try {
const response = await fetch(levelsUrl, { cache: "no-store" });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const data = await response.json();
runtime.levels = Array.isArray(data.levels) ? data.levels : [];
if (!runtime.levels.length) throw new Error("Нет уровней");
renderMenu();
} catch (error) {
console.error("Biblical match-three data error", error);
container.innerHTML = `
<section class="bmt-error">
<h2>Не удалось открыть игру</h2>
<p>Файл уровней недоступен или повреждён.</p>
<button type="button" class="bmt-primary" id="bmt-error-back">В меню</button>
</section>`;
document.getElementById("bmt-error-back")?.addEventListener("click", exitToMenu, { once: true });
}
}
function renderMenu() {
if (!runtime) return;
runtime.screen = "menu";
const container = document.getElementById("game-container");
container.innerHTML = "";
const shell = el("section", "bmt-shell bmt-menu");
const top = el("div", "bmt-topbar");
top.append(
createButton("←", "bmt-icon-button", exitToMenu),
el("div", "bmt-heading-wrap"),
);
top.lastElementChild.append(
el("p", "bmt-kicker", "Библейская головоломка"),
el("h2", "bmt-title", "Три в ряд"),
);
shell.append(top);
const hero = el("div", "bmt-hero");
const heroIcon = new Image();
heroIcon.src = "web/assets/biblical-match-three/bible.svg";
heroIcon.alt = "";
heroIcon.className = "bmt-hero-icon";
const heroText = el("div");
heroText.append(
el("strong", "", "Собирайте библейские символы"),
el("span", "", "Комбинации, каскады, особые фишки и 10 уровней."),
);
hero.append(heroIcon, heroText);
shell.append(hero);
const campaign = el("section", "bmt-panel");
campaign.append(el("h3", "", "Уровни"));
const grid = el("div", "bmt-level-grid");
runtime.levels.forEach((level) => {
const unlocked = level.id <= runtime.progress.unlocked;
const stars = Number(runtime.progress.stars[level.id] || 0);
const button = el("button", `bmt-level-card${unlocked ? "" : " is-locked"}`);
button.type = "button";
button.disabled = !unlocked;
button.innerHTML = `
<span class="bmt-level-number">${unlocked ? level.id : "🔒"}</span>
<span class="bmt-level-name">${escapeHtml(level.title)}</span>
<span class="bmt-stars" aria-label="${stars} звёзд">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span>
`;
if (unlocked) button.addEventListener("click", () => beginLevel(level), { signal: runtime.abort.signal });
grid.append(button);
});
campaign.append(grid);
shell.append(campaign);
const free = el("section", "bmt-panel");
free.append(el("h3", "", "Свободная игра"), el("p", "bmt-muted", "Играйте без лимита ходов и улучшайте рекорд."));
const modes = el("div", "bmt-difficulty-row");
Object.entries(FREE_MODES).forEach(([key, config]) => {
const best = Number(runtime.progress.bestFree[key] || 0);
const button = createButton(
`${config.label}${best ? ` · ${best.toLocaleString("ru-RU")}` : ""}`,
`bmt-difficulty bmt-difficulty--${key}`,
() => beginFree(key),
);
modes.append(button);
});
free.append(modes);
shell.append(free);
container.append(shell);
}
function beginLevel(level) {
const symbolCount = Math.max(6, Math.min(9, Number(level.symbolCount || 6)));
setupBoard({
mode: "level",
level,
difficulty: null,
symbolIds: getSymbolSet(symbolCount),
moves: Number(level.moves || 24),
});
}
function beginFree(difficulty) {
const config = FREE_MODES[difficulty] || FREE_MODES.medium;
setupBoard({
mode: "free",
level: null,
difficulty,
symbolIds: getSymbolSet(config.symbolCount),
moves: Infinity,
});
}
function setupBoard({ mode, level, difficulty, symbolIds, moves }) {
if (!runtime) return;
if (runtime.hintTimer) clearTimeout(runtime.hintTimer);
runtime.screen = "board";
runtime.mode = mode;
runtime.level = level;
runtime.difficulty = difficulty;
runtime.symbolIds = symbolIds;
runtime.board = Core.createBoard(ROWS, COLS, symbolIds);
runtime.score = 0;
runtime.moves = moves;
runtime.collected = {};
runtime.selected = null;
runtime.busy = false;
runtime.cascade = 0;
runtime.lastSwap = null;
runtime.tileNodes = [];
const container = document.getElementById("game-container");
container.innerHTML = "";
const shell = el("section", "bmt-shell bmt-board-screen");
const top = el("div", "bmt-topbar");
top.append(
createButton("←", "bmt-icon-button", renderMenu),
el("div", "bmt-heading-wrap"),
createButton("↻", "bmt-icon-button", () => shuffleBoard(true)),
);
top.children[1].append(
el("p", "bmt-kicker", mode === "level" ? `Уровень ${level.id}` : `Свободно · ${FREE_MODES[difficulty].label}`),
el("h2", "bmt-title", mode === "level" ? level.title : "Три в ряд"),
);
shell.append(top);
const stats = el("div", "bmt-stats");
stats.innerHTML = `
<div><span>Очки</span><strong id="bmt-score">0</strong></div>
<div><span>${mode === "level" ? "Ходы" : "Режим"}</span><strong id="bmt-moves">${mode === "level" ? moves : "∞"}</strong></div>
<div><span>Каскад</span><strong id="bmt-cascade">×1</strong></div>`;
shell.append(stats);
if (mode === "level") {
const goals = el("div", "bmt-goals");
goals.id = "bmt-goals";
shell.append(goals);
}
const board = el("div", "bmt-board");
board.setAttribute("role", "grid");
board.setAttribute("aria-label", "Поле 8 на 8");
for (let index = 0; index < ROWS * COLS; index += 1) {
const tile = el("button", "bmt-tile");
tile.type = "button";
tile.dataset.index = String(index);
tile.setAttribute("role", "gridcell");
const img = new Image();
img.className = "bmt-piece";
img.draggable = false;
img.alt = "";
tile.append(img, el("span", "bmt-special-mark"));
tile.addEventListener("click", () => chooseTile(index), { signal: runtime.abort.signal });
runtime.tileNodes.push(tile);
board.append(tile);
}
shell.append(board);
const actions = el("div", "bmt-actions");
actions.append(
createButton("💡 Подсказка", "bmt-secondary", showHint),
createButton("🔀 Перемешать", "bmt-secondary", () => shuffleBoard(false)),
);
shell.append(actions);
const tip = el("p", "bmt-tip", "Меняйте соседние фишки местами. Четыре и пять в ряд создают особые фишки.");
shell.append(tip);
container.append(shell);
updateAllTiles();
updateHud();
scheduleHint();
}
function chooseTile(index) {
if (!runtime || runtime.busy) return;
clearHint();
if (runtime.selected == null) {
runtime.selected = index;
updateSelection();
scheduleHint();
return;
}
if (runtime.selected === index) {
runtime.selected = null;
updateSelection();
scheduleHint();
return;
}
if (!Core.areAdjacent(runtime.selected, index, COLS)) {
runtime.selected = index;
updateSelection();
scheduleHint();
return;
}
const a = runtime.selected;
runtime.selected = null;
updateSelection();
trySwap(a, index);
}
async function trySwap(a, b) {
if (!runtime || runtime.busy) return;
runtime.busy = true;
runtime.lastSwap = [a, b];
const aCell = runtime.board[a];
const bCell = runtime.board[b];
let swapped = Core.swap(runtime.board, a, b);
if (aCell.special === "rainbow" || bCell.special === "rainbow") {
runtime.board = swapped;
updateAllTiles();
await pause(120);
const rainbowIndex = aCell.special === "rainbow" ? b : a;
const targetType = aCell.special === "rainbow" ? bCell.type : aCell.type;
if (runtime.mode === "level") runtime.moves -= 1;
await clearAndCascade(new Set([
rainbowIndex,
...runtime.board.map((cell, index) => cell.type === targetType ? index : -1).filter((index) => index >= 0),
]), 1);
finishTurn();
return;
}
if (!Core.findMatches(swapped, ROWS, COLS).length) {
runtime.board = swapped;
updateAllTiles();
await pause(130);
runtime.board = Core.swap(runtime.board, a, b);
updateAllTiles();
runtime.tileNodes[a]?.classList.add("is-invalid");
runtime.tileNodes[b]?.classList.add("is-invalid");
await pause(220);
runtime.tileNodes[a]?.classList.remove("is-invalid");
runtime.tileNodes[b]?.classList.remove("is-invalid");
runtime.busy = false;
scheduleHint();
return;
}
runtime.board = swapped;
if (runtime.mode === "level") runtime.moves -= 1;
updateAllTiles();
await pause(100);
await resolveMatches(1);
finishTurn();
}
async function resolveMatches(cascade) {
if (!runtime) return;
const groups = Core.findMatchGroups(runtime.board, ROWS, COLS);
if (!groups.length) return;
const clearSet = new Set();
groups.forEach((group) => group.indices.forEach((index) => clearSet.add(index)));
const intersections = new Map();
groups.forEach((group) => {
group.indices.forEach((index) => {
const value = intersections.get(index) || new Set();
value.add(group.orientation);
intersections.set(index, value);
});
});
const creation = new Map();
const preferred = runtime.lastSwap || [];
const chooseAnchor = (indices) => preferred.find((index) => indices.includes(index)) ?? indices[Math.floor(indices.length / 2)];
for (const [index, orientations] of intersections) {
if (orientations.size > 1) creation.set(index, "burst");
}
for (const group of groups) {
const anchor = chooseAnchor(group.indices);
if (group.indices.length >= 5) creation.set(anchor, "rainbow");
else if (group.indices.length === 4 && !creation.has(anchor)) creation.set(anchor, group.orientation === "h" ? "lineH" : "lineV");
}
for (const [index] of creation) clearSet.delete(index);
await clearAndCascade(clearSet, cascade, creation);
}
async function clearAndCascade(initialSet, cascade, creation = new Map()) {
if (!runtime) return;
const clearSet = expandSpecials(initialSet);
runtime.cascade = cascade;
document.getElementById("bmt-cascade").textContent = `×${cascade}`;
const clearedByType = {};
clearSet.forEach((index) => {
const cell = runtime.board[index];
if (!cell) return;
clearedByType[cell.type] = (clearedByType[cell.type] || 0) + 1;
runtime.tileNodes[index]?.classList.add("is-clearing");
});
const base = clearSet.size * 30;
runtime.score += Math.round(base * (1 + Math.max(0, cascade - 1) * 0.5));
Object.entries(clearedByType).forEach(([type, count]) => {
runtime.collected[type] = (runtime.collected[type] || 0) + count;
});
updateHud();
await pause(160);
clearSet.forEach((index) => { runtime.board[index] = null; });
for (const [index, special] of creation) {
if (runtime.board[index]) runtime.board[index].special = special;
}
collapseBoard();
updateAllTiles();
await pause(170);
const groups = Core.findMatchGroups(runtime.board, ROWS, COLS);
if (groups.length) {
await resolveMatches(cascade + 1);
}
}
function expandSpecials(initialSet) {
const clearSet = new Set(initialSet);
const queue = [...clearSet];
while (queue.length) {
const index = queue.shift();
const cell = runtime.board[index];
if (!cell?.special || cell.special === "rainbow") continue;
const { row, col } = Core.coordinates(index, COLS);
const add = (candidate) => {
if (candidate < 0 || candidate >= runtime.board.length || clearSet.has(candidate)) return;
clearSet.add(candidate);
queue.push(candidate);
};
if (cell.special === "lineH") {
for (let c = 0; c < COLS; c += 1) add(row * COLS + c);
} else if (cell.special === "lineV") {
for (let r = 0; r < ROWS; r += 1) add(r * COLS + col);
} else if (cell.special === "burst") {
for (let dr = -1; dr <= 1; dr += 1) {
for (let dc = -1; dc <= 1; dc += 1) {
const rr = row + dr;
const cc = col + dc;
if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) add(rr * COLS + cc);
}
}
}
}
return clearSet;
}
function collapseBoard() {
for (let col = 0; col < COLS; col += 1) {
const existing = [];
for (let row = ROWS - 1; row >= 0; row -= 1) {
const cell = runtime.board[row * COLS + col];
if (cell) existing.push(cell);
}
let row = ROWS - 1;
existing.forEach((cell) => {
runtime.board[row * COLS + col] = cell;
row -= 1;
});
while (row >= 0) {
const type = runtime.symbolIds[Math.floor(Math.random() * runtime.symbolIds.length)];
runtime.board[row * COLS + col] = { type, special: null };
row -= 1;
}
}
}
function finishTurn() {
if (!runtime) return;
runtime.busy = false;
runtime.cascade = 0;
runtime.lastSwap = null;
updateHud();
if (runtime.mode === "level" && goalsComplete()) {
finishLevel(true);
return;
}
if (runtime.mode === "level" && runtime.moves <= 0) {
finishLevel(false);
return;
}
if (!Core.findHint(runtime.board, ROWS, COLS)) shuffleBoard(false);
scheduleHint();
}
function goalsComplete() {
const level = runtime.level;
if (!level) return false;
if (runtime.score < Number(level.targetScore || 0)) return false;
const collect = level.collect || {};
return Object.entries(collect).every(([type, amount]) => Number(runtime.collected[type] || 0) >= Number(amount));
}
function starsForLevel() {
const level = runtime.level;
if (!level) return 0;
const base = Number(level.targetScore || 1);
if (runtime.score >= base * 1.75) return 3;
if (runtime.score >= base * 1.3) return 2;
return 1;
}
function finishLevel(won) {
runtime.busy = true;
clearHint();
if (won) {
const stars = starsForLevel();
const id = runtime.level.id;
runtime.progress.stars[id] = Math.max(Number(runtime.progress.stars[id] || 0), stars);
runtime.progress.unlocked = Math.max(runtime.progress.unlocked, Math.min(runtime.levels.length, id + 1));
saveProgress(runtime.progress);
}
const overlay = el("div", "bmt-result-overlay");
const card = el("div", "bmt-result-card");
const stars = won ? starsForLevel() : 0;
card.innerHTML = `
<div class="bmt-result-emoji">${won ? "✨" : "⏳"}</div>
<h3>${won ? "Уровень пройден!" : "Ходы закончились"}</h3>
<p>${won ? `${"★".repeat(stars)}${"☆".repeat(3-stars)} · ${runtime.score.toLocaleString("ru-RU")} очков` : "Попробуйте ещё раз — поле будет новым."}</p>`;
const buttons = el("div", "bmt-result-actions");
buttons.append(
createButton(won ? "К уровням" : "Назад", "bmt-secondary", renderMenu),
createButton(won ? "Дальше" : "Ещё раз", "bmt-primary", () => {
overlay.remove();
runtime.busy = false;
if (won) {
const next = runtime.levels.find((item) => item.id === runtime.level.id + 1);
if (next) beginLevel(next); else renderMenu();
} else beginLevel(runtime.level);
}),
);
card.append(buttons);
overlay.append(card);
document.querySelector(".bmt-shell")?.append(overlay);
}
function updateHud() {
if (!runtime) return;
const score = document.getElementById("bmt-score");
const moves = document.getElementById("bmt-moves");
if (score) score.textContent = runtime.score.toLocaleString("ru-RU");
if (moves && runtime.mode === "level") moves.textContent = String(Math.max(0, runtime.moves));
renderGoals();
}
function renderGoals() {
const root = document.getElementById("bmt-goals");
if (!root || runtime.mode !== "level") return;
const level = runtime.level;
const parts = [
`<span class="${runtime.score >= level.targetScore ? "is-done" : ""}"><b>★</b> ${runtime.score}/${level.targetScore}</span>`,
];
Object.entries(level.collect || {}).forEach(([type, amount]) => {
const symbol = SYMBOL_BY_ID[type];
const current = Math.min(Number(runtime.collected[type] || 0), Number(amount));
parts.push(`<span class="${current >= amount ? "is-done" : ""}"><img src="${symbol.asset}" alt=""> ${current}/${amount}</span>`);
});
root.innerHTML = parts.join("");
}
function updateSelection() {
runtime.tileNodes.forEach((tile, index) => tile.classList.toggle("is-selected", index === runtime.selected));
}
function updateAllTiles() {
runtime.tileNodes.forEach((tile, index) => updateTile(tile, runtime.board[index]));
updateSelection();
}
function updateTile(tile, cell) {
tile.classList.remove("is-clearing", "is-invalid", "is-line-h", "is-line-v", "is-burst", "is-rainbow");
const img = tile.querySelector("img");
const mark = tile.querySelector(".bmt-special-mark");
if (!cell) {
tile.classList.add("is-empty");
if (img) img.removeAttribute("src");
if (mark) mark.textContent = "";
return;
}
tile.classList.remove("is-empty");
const symbol = SYMBOL_BY_ID[cell.type];
if (img && img.getAttribute("src") !== symbol.asset) img.src = symbol.asset;
if (img) img.alt = symbol.label;
tile.setAttribute("aria-label", `${symbol.label}${cell.special ? ", особая фишка" : ""}`);
if (cell.special) tile.classList.add(`is-${cell.special.replace("lineH", "line-h").replace("lineV", "line-v")}`);
if (mark) mark.textContent = cell.special === "rainbow" ? "✦" : cell.special === "burst" ? "✺" : "";
}
function showHint() {
if (!runtime || runtime.busy) return;
clearHint();
const hint = Core.findHint(runtime.board, ROWS, COLS);
if (!hint) {
shuffleBoard(false);
return;
}
hint.forEach((index) => runtime.tileNodes[index]?.classList.add("is-hint"));
runtime.hintTimer = setTimeout(clearHint, 1500);
}
function clearHint() {
if (!runtime) return;
if (runtime.hintTimer) clearTimeout(runtime.hintTimer);
runtime.hintTimer = null;
runtime.tileNodes.forEach((tile) => tile.classList.remove("is-hint"));
}
function scheduleHint() {
if (!runtime || runtime.busy || runtime.screen !== "board") return;
clearHint();
const delayMs = runtime.mode === "free"
? FREE_MODES[runtime.difficulty].hintDelay
: Math.max(7000, 12500 - runtime.level.id * 350);
runtime.hintTimer = setTimeout(showHint, delayMs);
}
function shuffleBoard(manual) {
if (!runtime || runtime.busy) return;
clearHint();
runtime.board = Core.reshuffle(runtime.board, ROWS, COLS);
runtime.selected = null;
updateAllTiles();
if (manual && runtime.mode === "level" && runtime.moves > 1) runtime.moves -= 1;
updateHud();
scheduleHint();
}
function pause(ms) {
return new Promise((resolve) => setTimeout(resolve, ms));
}
function escapeHtml(value) {
return String(value)
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#39;");
}
window.startBiblicalMatchThreeGame = start;
window.__biblicalMatchThreeCleanup = cleanup;
})();