from pathlib import Path


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found != count:
        raise SystemExit(f"{path}: expected {count} occurrences, got {found}: {old[:100]!r}")
    p.write_text(text.replace(old, new, count))


game = "web/games/biblical-match-three.js"
patch(game, '''const FREE_MODES = {
  easy: { label: "Лёгкий", symbolCount: 6, rows: 6, hintDelay: 7000, accent: "green" },
  medium: { label: "Средний", symbolCount: 7, rows: 7, hintDelay: 9500, accent: "gold" },
  hard: { label: "Сложный", symbolCount: 9, rows: 8, hintDelay: 12500, accent: "violet" },
};''', '''const FREE_MODES = {
  easy: { label: "Лёгкий", symbolCount: 7, rows: 7, moves: 30, hintDelay: 7000, accent: "green" },
  medium: { label: "Средний", symbolCount: 8, rows: 8, moves: 30, hintDelay: 9500, accent: "gold" },
  hard: { label: "Сложный", symbolCount: 9, rows: 8, moves: 30, hintDelay: 12500, accent: "violet" },
};''')

patch(game, '''function getSymbolSet(count) {
  return SYMBOLS.slice(0, Math.max(3, Math.min(SYMBOLS.length, Number(count || 6)))).map((item) => item.id);
}
''', '''function getSymbolSet(count) {
  return SYMBOLS.slice(0, Math.max(3, Math.min(SYMBOLS.length, Number(count || 6)))).map((item) => item.id);
}

function requiredCollectSymbols(level) {
  return [...new Set((level?.goals || []).filter((goal) => goal.type === "collect" && SYMBOL_BY_ID[goal.symbol]).map((goal) => goal.symbol))];
}

function getLevelSymbolSet(level) {
  const requested = Math.max(3, Math.min(SYMBOLS.length, Number(level?.symbolCount || 6)));
  const required = requiredCollectSymbols(level);
  const pool = getSymbolSet(requested);
  for (const symbol of required) {
    if (pool.includes(symbol)) continue;
    let slot = -1;
    for (let index = pool.length - 1; index >= 0; index -= 1) {
      if (!required.includes(pool[index])) { slot = index; break; }
    }
    if (slot >= 0) pool[slot] = symbol;
    else if (pool.length < SYMBOLS.length) pool.push(symbol);
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
  return LEVEL_SHAPES[Number(level?.id || 1)] || "rect";
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
  for (const group of level?.blockers || []) for (const index of group.cells || []) if (Number(index) >= 0 && Number(index) < mask.length) mask[Number(index)] = true;
  return mask;
}

function isActive(index) { return !runtime?.activeMask || runtime.activeMask[index] !== false; }
function canSwapActive(a, b) { return isActive(a) && isActive(b); }
function findPlayableHint(board = runtime?.board) { return board ? Core.findHint(board, ROWS, COLS, canSwapActive) : null; }

function createPlayableBoard(rows, cols, symbolIds, mask, required = []) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const board = Core.createBoard(rows, cols, symbolIds);
    board.forEach((_, index) => { if (mask[index] === false) board[index] = null; });
    const hasRequired = required.every((symbol) => board.reduce((count, cell) => count + (cell?.type === symbol ? 1 : 0), 0) >= 3);
    if (hasRequired && Core.findMatches(board, rows, cols).length === 0 && Core.findHint(board, rows, cols, (a,b) => mask[a] !== false && mask[b] !== false)) return board;
  }
  throw new Error("Could not generate a playable shaped board");
}

function reshufflePlayable() {
  const required = runtime.mode === "level" ? requiredCollectSymbols(runtime.level) : [];
  const specials = runtime.board.filter((cell) => cell?.special).map((cell) => cell.special);
  const fresh = createPlayableBoard(ROWS, COLS, runtime.symbolIds, runtime.activeMask, required);
  for (const special of specials) {
    const available = fresh.map((cell,index) => (cell && !cell.special ? index : -1)).filter((index) => index >= 0);
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
''')

patch(game, 'freeStarted: false, lastGoalSnapshot: new Map(),', 'freeStarted: false, lastGoalSnapshot: new Map(), activeMask: [], boardShape: "rect",')

patch(game, '''function beginLevel(level, selectedBoosters = new Set()) {
  setupBoard({ mode: "level", level, difficulty: null, symbolIds: getSymbolSet(level.symbolCount || 6), moves: Number(level.moves || 24), selectedBoosters });
}

function beginFree(difficulty) {
  runtime.progress = Progress.beginFreeRun(runtime.progress, difficulty); runtime.freeStarted = true;
  setupBoard({ mode: "free", level: null, difficulty, symbolIds: getSymbolSet(FREE_MODES[difficulty]?.symbolCount || 7), moves: Infinity, selectedBoosters: new Set() });
}''', '''function beginLevel(level, selectedBoosters = new Set()) {
  setupBoard({ mode: "level", level, difficulty: null, symbolIds: getLevelSymbolSet(level), moves: Number(level.moves || 24), selectedBoosters });
}

function beginFree(difficulty) {
  runtime.progress = Progress.beginFreeRun(runtime.progress, difficulty); runtime.freeStarted = true;
  const timed = Boolean(window.__bmtTimedRequested || window.__bmtTimedActive);
  setupBoard({ mode: "free", level: null, difficulty, symbolIds: getSymbolSet(FREE_MODES[difficulty]?.symbolCount || 7), moves: timed ? Infinity : Number(FREE_MODES[difficulty]?.moves || 30), selectedBoosters: new Set() });
}''')

patch(game, '''  clearHint(); runtime.screen = "board"; runtime.mode = mode; runtime.level = level; runtime.difficulty = difficulty; runtime.symbolIds = symbolIds;
  ROWS = resolveBoardRows(mode, level, difficulty);
  runtime.board = Core.createBoard(ROWS, COLS, symbolIds); runtime.score = 0; runtime.moves = moves; runtime.collected = {}; runtime.selected = null; runtime.cascade = 0; runtime.maxCascade = 1; runtime.specialsActivated = 0; runtime.lastSwap = null; runtime.tileNodes = []; runtime.activeBooster = null; runtime.freeSessionReward = 0; runtime.lastGoalSnapshot = new Map();
  initBlockers(level); applyPreBoosters(selectedBoosters || new Set());''', '''  clearHint(); runtime.screen = "board"; runtime.mode = mode; runtime.level = level; runtime.difficulty = difficulty; runtime.symbolIds = symbolIds;
  ROWS = resolveBoardRows(mode, level, difficulty); runtime.boardShape = boardShapeFor(mode, level, difficulty); runtime.activeMask = makeActiveMask(runtime.boardShape, ROWS, COLS, level);
  runtime.board = createPlayableBoard(ROWS, COLS, symbolIds, runtime.activeMask, mode === "level" ? requiredCollectSymbols(level) : []); runtime.score = 0; runtime.moves = moves; runtime.collected = {}; runtime.selected = null; runtime.cascade = 0; runtime.maxCascade = 1; runtime.specialsActivated = 0; runtime.lastSwap = null; runtime.tileNodes = []; runtime.activeBooster = null; runtime.freeSessionReward = 0; runtime.lastGoalSnapshot = new Map();
  initBlockers(mode === "free" ? freeChallengeConfig(difficulty) : level); applyPreBoosters(selectedBoosters || new Set());''')

patch(game, '''  const stats = el("section", "bmt-stats-v2"); stats.innerHTML = `<div><span>Очки</span><strong id="bmt-score">0</strong>${mode === "free" ? '<small id="bmt-best">рекорд 0</small>' : ""}</div><div><span>${mode === "level" ? "Ходы" : "Награда"}</span><strong id="bmt-moves">${mode === "level" ? moves : "0 ★"}</strong><small>${mode === "free" ? "за рубежи" : "осталось"}</small></div><div><span>Каскад</span><strong id="bmt-cascade">×1</strong><small id="bmt-special-count">0 особых</small></div>`; shell.append(stats);''', '''  const stats = el("section", "bmt-stats-v2"); stats.innerHTML = `<div><span>Очки</span><strong id="bmt-score">0</strong>${mode === "free" ? '<small id="bmt-best">рекорд 0</small>' : ""}</div><div><span>Ходы</span><strong id="bmt-moves">${Number.isFinite(moves) ? moves : "∞"}</strong><small>осталось</small></div><div><span>Каскад</span><strong id="bmt-cascade">×1</strong><small id="bmt-special-count">0 особых</small></div>`; shell.append(stats);''')

patch(game, 'board.dataset.rows = String(ROWS); board.dataset.cols = String(COLS);', 'board.dataset.rows = String(ROWS); board.dataset.cols = String(COLS); board.dataset.shape = runtime.boardShape; board.dataset.activeCells = String(runtime.activeMask.filter(Boolean).length);')

patch(game, '''    const tile = el("button", "bmt-tile"); tile.type = "button"; tile.dataset.index = String(index); tile.setAttribute("role", "gridcell");
    const piece = el("span", "bmt-piece-wrap"); const img = new Image(); img.className = "bmt-piece"; img.draggable = false; img.alt = ""; piece.append(img); tile.append(piece, el("span", "bmt-special-mark"), el("span", "bmt-blocker"));
    tile.addEventListener("click", () => chooseTile(index), { signal: runtime.abort.signal }); runtime.tileNodes.push(tile); board.append(tile);''', '''    const tile = el("button", "bmt-tile"); tile.type = "button"; tile.dataset.index = String(index); tile.setAttribute("role", "gridcell");
    const active = isActive(index); tile.classList.toggle("is-hole", !active); tile.disabled = !active; if (!active) { tile.tabIndex = -1; tile.setAttribute("aria-hidden", "true"); }
    const piece = el("span", "bmt-piece-wrap"); const img = new Image(); img.className = "bmt-piece"; img.draggable = false; img.alt = ""; piece.append(img); tile.append(piece, el("span", "bmt-special-mark"), el("span", "bmt-blocker"));
    tile.addEventListener("click", () => chooseTile(index), { signal: runtime.abort.signal }); runtime.tileNodes.push(tile); board.append(tile);''')

patch(game, '''  container.append(shell); updateAllTiles(); updateHud(); animateEntrance(); scheduleHint();
  if (mode === "level" && level.id <= 3 && !runtime.progress.tutorialSeen?.[`level-${level.id}`]) setTimeout(() => showTutorial(level.id), 480);''', '''  container.append(shell); updateAllTiles(); updateHud(); animateEntrance(); scheduleHint();
  if (!runtime.progress.tutorialSeen?.["v18-first-run"]) setTimeout(showTutorial, 420);''')

old_tutorial = '''function showTutorial(levelId) {
  const copy = { 1: ["Соберите три одинаковых символа", "Коснитесь двух соседних фишек. Четыре и пять в ряд создают особые фишки."], 2: ["Следите за целями", "Прогресс каждой цели обновляется сверху. Каскады дают больше очков."], 3: ["Особые фишки сильнее вместе", "Меняйте особые фишки местами друг с другом, чтобы запускать мощные комбинации."] }[levelId];
  if (!copy) return;
  runtime.progress.tutorialSeen[`level-${levelId}`] = true; Progress.save(runtime.progress);
  const shell = document.querySelector(".bmt-shell"); const overlay = el("div", "bmt-tutorial"); overlay.innerHTML = `<div class="bmt-tutorial__card"><span class="bmt-tutorial__spark">✦</span><h3>${copy[0]}</h3><p>${copy[1]}</p><button type="button" class="bmt-primary">Понятно</button></div>`; shell?.append(overlay); overlay.querySelector("button").addEventListener("click", () => overlay.remove(), { once: true });
}'''
new_tutorial = '''function showTutorial() {
  if (!runtime || runtime.progress.tutorialSeen?.["v18-first-run"]) return;
  const steps = [
    { title:"Соберите три", text:"Смахните фишку к соседней. Совпадение из трёх исчезнет, а новые фишки упадут сверху.", focus:".bmt-board" },
    { title:"Смотрите на цели", text:"В кампании сверху показаны все условия уровня. Нужный символ всегда входит в набор фишек этого уровня.", focus:".bmt-goals-v2" },
    { title:"Форма поля и препятствия", text:"На следующих уровнях поле станет овальным, полукруглым, ромбом, крестом или щитом. Цепи и скрижали разрушаются совпадениями рядом или прямо на них.", focus:".bmt-board" },
    { title:"Особые фишки и помощь", text:"Четыре и пять одинаковых создают усиления. Бустеры снизу помогают пройти сложный момент и не тратят ход.", focus:".bmt-booster-tray" }
  ];
  const shell = document.querySelector(".bmt-shell"); if (!shell) return; const overlay = el("div", "bmt-tutorial bmt-v18-tutorial");
  overlay.innerHTML = `<div class="bmt-tutorial__card"><span class="bmt-tutorial__spark">✦</span><small class="bmt-v18-tutorial-step"></small><h3></h3><p></p><div class="bmt-v18-tutorial-actions"><button type="button" class="bmt-secondary" data-skip>Пропустить</button><button type="button" class="bmt-primary" data-next>Далее</button></div></div>`; shell.append(overlay);
  let index = 0; let focused = null;
  const finish = () => { focused?.classList.remove("is-tutorial-focus"); runtime.progress.tutorialSeen ||= {}; runtime.progress.tutorialSeen["v18-first-run"] = true; Progress.save(runtime.progress); overlay.remove(); scheduleHint(); };
  const render = () => { focused?.classList.remove("is-tutorial-focus"); const step = steps[index]; focused = document.querySelector(step.focus); focused?.classList.add("is-tutorial-focus"); overlay.querySelector(".bmt-v18-tutorial-step").textContent = `${index + 1} / ${steps.length}`; overlay.querySelector("h3").textContent = step.title; overlay.querySelector("p").textContent = step.text; overlay.querySelector("[data-next]").textContent = index === steps.length - 1 ? "Играть" : "Далее"; };
  overlay.querySelector("[data-skip]").addEventListener("click", finish); overlay.querySelector("[data-next]").addEventListener("click", () => { if (index >= steps.length - 1) finish(); else { index += 1; render(); } }); render();
}'''
patch(game, old_tutorial, new_tutorial)

patch(game, '  if (!runtime || runtime.busy) return; clearHint();', '  if (!runtime || runtime.busy || !isActive(index)) return; clearHint();', 1)
patch(game, 'async function trySwap(a, b) {\n  if (!runtime || runtime.busy) return;', 'async function trySwap(a, b) {\n  if (!runtime || runtime.busy || !isActive(a) || !isActive(b)) return;')
patch(game, 'if (runtime.mode === "level") runtime.moves -= 1;', 'if (runtime.mode === "level" || (runtime.mode === "free" && Number.isFinite(runtime.moves))) runtime.moves -= 1;', 2)

old_collapse = '''function collapseBoard() {
  const distanceByDestination = new Map(); let maxDistance = 0;
  for (let col = 0; col < COLS; col += 1) {
    const existing = [];
    for (let row = ROWS - 1; row >= 0; row -= 1) { const sourceIndex = row * COLS + col; const cell = runtime.board[sourceIndex]; if (cell) existing.push({ cell, sourceRow: row }); }
    let destinationRow = ROWS - 1;
    for (const item of existing) { const destination = destinationRow * COLS + col; runtime.board[destination] = item.cell; const distance = Math.max(0, destinationRow - item.sourceRow); if (distance) { distanceByDestination.set(destination, distance); maxDistance = Math.max(maxDistance, distance); } destinationRow -= 1; }
    while (destinationRow >= 0) { const destination = destinationRow * COLS + col; const type = runtime.symbolIds[Math.floor(Math.random() * runtime.symbolIds.length)]; runtime.board[destination] = { type, special: null }; const distance = destinationRow + 2 + Math.random() * 1.5; distanceByDestination.set(destination, distance); maxDistance = Math.max(maxDistance, distance); destinationRow -= 1; }
  }
  return { distanceByDestination, maxDistance };
}'''
new_collapse = '''function collapseBoard() {
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
}'''
patch(game, old_collapse, new_collapse)

patch(game, '''    if (blocker.type === "lamp") { if (!blocker.lit && (direct.has(index) || adjacent.has(index))) { blocker.lit = true; score += 80; FX.ring?.(index, "gold"); FX.floatText?.(index, "СВЕТ", "gold"); } continue; }
    const hit = blocker.type === "tablet" ? direct.has(index) : (direct.has(index) || adjacent.has(index)); if (!hit) continue; blocker.layers -= 1; score += 45; FX.particleBurst?.(index, blocker.type === "chain" ? "blue" : "gold", 7);
    if (blocker.layers <= 0) { runtime.blockers.delete(index); score += 90; FX.floatText?.(index, "ОЧИЩЕНО", "green"); }''', '''    if (blocker.type === "lamp") { if (!blocker.lit && (direct.has(index) || adjacent.has(index))) { blocker.lit = true; runtime.tileNodes[index]?.classList.add("is-blocker-lit"); setTimeout(() => runtime?.tileNodes?.[index]?.classList.remove("is-blocker-lit"), 360); score += 80; FX.ring?.(index, "gold"); FX.floatText?.(index, "СВЕТ", "gold"); } continue; }
    const hit = blocker.type === "tablet" ? direct.has(index) : (direct.has(index) || adjacent.has(index)); if (!hit) continue; blocker.layers -= 1; const tile = runtime.tileNodes[index]; tile?.classList.remove("is-blocker-hit", "is-blocker-breaking"); if (tile) { void tile.offsetWidth; tile.classList.add(blocker.layers <= 0 ? "is-blocker-breaking" : "is-blocker-hit"); setTimeout(() => tile.classList.remove("is-blocker-hit", "is-blocker-breaking"), 360); } score += 45; FX.particleBurst?.(index, blocker.type === "chain" ? "blue" : "gold", 7);
    if (blocker.layers <= 0) { runtime.blockers.delete(index); score += 90; FX.floatText?.(index, "ОЧИЩЕНО", "green"); }''')

patch(game, '''  if (runtime.mode === "level" && runtime.moves <= 0) { finishLevel(false); return; }
  if (runtime.mode === "free") persistFreeRecord(true);
  if (!Core.findHint(runtime.board, ROWS, COLS)) { runtime.board = Core.reshuffle(runtime.board, ROWS, COLS); updateAllTiles(); toast("Поле мягко перемешано — ходов не осталось", "info"); }
  setBusy(false); scheduleHint();''', '''  if (runtime.mode === "level" && runtime.moves <= 0) { finishLevel(false); return; }
  if (runtime.mode === "free") { persistFreeRecord(true); if (Number.isFinite(runtime.moves) && runtime.moves <= 0) { setBusy(false); openFreeExit("moves"); return; } }
  if (!findPlayableHint()) { runtime.board = reshufflePlayable(); updateAllTiles(); toast("Поле перемешано — появился новый доступный ход", "info"); }
  setBusy(false); scheduleHint();''')

patch(game, '''function updateFreeHud(stats = runtime?.progress?.free?.[runtime?.difficulty]) {
  if (!runtime || runtime.mode !== "free") return; const best = document.getElementById("bmt-best"); const moves = document.getElementById("bmt-moves"); if (best) best.textContent = `рекорд ${Number(stats?.bestScore || 0).toLocaleString("ru-RU")}`; if (moves) moves.textContent = `${runtime.freeSessionReward} ★`;
}''', '''function updateFreeHud(stats = runtime?.progress?.free?.[runtime?.difficulty]) {
  if (!runtime || runtime.mode !== "free") return; const best = document.getElementById("bmt-best"); const moves = document.getElementById("bmt-moves"); if (best) best.textContent = `рекорд ${Number(stats?.bestScore || 0).toLocaleString("ru-RU")}`; if (moves) moves.textContent = Number.isFinite(runtime.moves) ? String(Math.max(0, runtime.moves)) : `${runtime.freeSessionReward} ★`;
}''')

patch(game, 'function openFreeExit() {', 'function openFreeExit(reason = "manual") {')
patch(game, '<span class="bmt-result-card__eyebrow">${isRecord ? "Новый личный рекорд" : "Свободная игра"}</span>', '<span class="bmt-result-card__eyebrow">${reason === "moves" ? "30 ходов завершены" : isRecord ? "Новый личный рекорд" : "Свободная игра"}</span>')
patch(game, 'async function useTargetBooster(id, index) {\n  if (!runtime || runtime.busy) return;', 'async function useTargetBooster(id, index) {\n  if (!runtime || runtime.busy || !isActive(index)) return;')
patch(game, 'runtime.board = Core.reshuffle(runtime.board, ROWS, COLS); const available', 'runtime.board = reshufflePlayable(); const available')
patch(game, 'if (score) score.textContent = runtime.score.toLocaleString("ru-RU"); if (moves && runtime.mode === "level") moves.textContent = String(Math.max(0, runtime.moves));', 'if (score) score.textContent = runtime.score.toLocaleString("ru-RU"); if (moves && (runtime.mode === "level" || Number.isFinite(runtime.moves))) moves.textContent = String(Math.max(0, runtime.moves));')

patch(game, '''function updateTile(tile, cell, blocker) {
  tile.classList.remove("is-clearing", "is-invalid", "is-line-h", "is-line-v", "is-burst", "is-rainbow", "has-tablet", "has-chain", "has-lamp", "is-lamp-lit", "is-layer-2", "is-layer-3");
  const img = tile.querySelector(".bmt-piece"); const specialMark = tile.querySelector(".bmt-special-mark"); const blockerMark = tile.querySelector(".bmt-blocker");
  if (!cell)''', '''function updateTile(tile, cell, blocker) {
  tile.classList.remove("is-clearing", "is-invalid", "is-line-h", "is-line-v", "is-burst", "is-rainbow", "has-tablet", "has-chain", "has-lamp", "is-lamp-lit", "is-layer-2", "is-layer-3");
  const img = tile.querySelector(".bmt-piece"); const specialMark = tile.querySelector(".bmt-special-mark"); const blockerMark = tile.querySelector(".bmt-blocker"); const index = Number(tile.dataset.index); const active = isActive(index); tile.classList.toggle("is-hole", !active); tile.disabled = !active;
  if (!active) { tile.classList.add("is-empty"); if (img) img.removeAttribute("src"); if (specialMark) specialMark.textContent = ""; if (blockerMark) blockerMark.innerHTML = ""; return; }
  if (!cell)''')
patch(game, 'function showHint() { if (!runtime || runtime.busy || runtime.activeBooster) return; clearHint(); const hint = Core.findHint(runtime.board, ROWS, COLS);', 'function showHint() { if (!runtime || runtime.busy || runtime.activeBooster) return; clearHint(); const hint = findPlayableHint();')
patch(game, 'window.__biblicalMatchThreeCleanup = cleanup;', 'window.__biblicalMatchThreeCleanup = cleanup;\nwindow.BiblicalMatchThreeV18Rules = { version:18, getLevelSymbolSet, requiredCollectSymbols, makeActiveMask, boardShapeFor, levelShapes:LEVEL_SHAPES, shapeLabels:SHAPE_LABELS };')

ui = 'web/games/biblical-match-three-v15-ui.js'
patch(ui, 'const tile=event.target.closest(".bmt-tile");if(!tile||!board.contains(tile))return;', 'const tile=event.target.closest(".bmt-tile");if(!tile||!board.contains(tile)||tile.disabled||tile.classList.contains("is-hole"))return;')
patch(ui, 'if(!source||!target)return;', 'if(!source||!target||source.disabled||target.disabled||source.classList.contains("is-hole")||target.classList.contains("is-hole"))return;')
patch(ui, 'window.BiblicalMatchThreeV15UI={version:15,enhance,fit:fitBoardNow};', 'window.BiblicalMatchThreeV15UI={version:18,enhance,fit:fitBoardNow};')

css = 'web/styles/biblical-match-three-v15-polish.css'
p = Path(css)
text = p.read_text().replace('/* Biblical Treasures V17 — direct generated WebP icons and transparent cells. */','/* Biblical Treasures V18 — shaped boards, animated obstacles and direct WebP icons. */',1)
text += r'''

/* V18 irregular boards: missing cells are real holes, not playable invisible tiles. */
body[data-current-game="biblical-match-three"] .bmt-tile.is-hole{visibility:hidden!important;pointer-events:none!important;opacity:0!important}
body[data-current-game="biblical-match-three"] .bmt-board[data-shape]:not([data-shape="rect"]){background:transparent!important;box-shadow:none!important;border-color:transparent!important}
body[data-current-game="biblical-match-three"] .bmt-board[data-shape="cross"] .bmt-piece,
body[data-current-game="biblical-match-three"] .bmt-board[data-shape="diamond"] .bmt-piece{filter:drop-shadow(0 4px 4px rgba(38,54,98,.18))!important}

@keyframes bmt-v18-blocker-hit{0%{transform:scale(1) rotate(0);filter:brightness(1)}35%{transform:scale(1.16) rotate(-5deg);filter:brightness(1.35)}100%{transform:scale(1) rotate(0);filter:brightness(1)}}
@keyframes bmt-v18-blocker-break{0%{transform:scale(1);opacity:1;filter:brightness(1)}45%{transform:scale(1.24) rotate(7deg);opacity:1;filter:brightness(1.55)}100%{transform:scale(.45) rotate(-16deg);opacity:0;filter:brightness(1.8)}}
@keyframes bmt-v18-blocker-light{0%{transform:scale(.9);filter:brightness(1)}45%{transform:scale(1.25);filter:brightness(1.8) drop-shadow(0 0 8px rgba(245,183,55,.8))}100%{transform:scale(1);filter:brightness(1)}}
body[data-current-game="biblical-match-three"] .bmt-tile.is-blocker-hit .bmt-blocker{animation:bmt-v18-blocker-hit .28s ease both!important}
body[data-current-game="biblical-match-three"] .bmt-tile.is-blocker-breaking .bmt-blocker{animation:bmt-v18-blocker-break .3s ease both!important}
body[data-current-game="biblical-match-three"] .bmt-tile.is-blocker-lit .bmt-blocker{animation:bmt-v18-blocker-light .34s ease both!important}

/* Free-mode icons sit in their own top-right zone and never cover labels or scores. */
body[data-current-game="biblical-match-three"] .bmt-free-card{padding-left:16px!important;padding-right:82px!important;min-height:154px!important}
body[data-current-game="biblical-match-three"] .bmt-v15-free-icon{left:auto!important;right:12px!important;top:14px!important;width:62px!important;height:62px!important;filter:drop-shadow(0 4px 5px rgba(40,55,90,.16))!important}
body[data-current-game="biblical-match-three"] .bmt-free-card__mode,
body[data-current-game="biblical-match-three"] .bmt-free-card>strong,
body[data-current-game="biblical-match-three"] .bmt-free-card__record{position:relative!important;z-index:2!important;max-width:100%!important}

body[data-current-game="biblical-match-three"] .is-tutorial-focus{position:relative!important;z-index:2147483001!important;filter:drop-shadow(0 0 8px rgba(79,70,229,.45))!important}
body[data-current-game="biblical-match-three"] .bmt-v18-tutorial-step{display:block;margin-bottom:5px;font-weight:900;letter-spacing:.12em;color:#635bdf}
body[data-current-game="biblical-match-three"] .bmt-v18-tutorial-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
@media(max-width:360px){body[data-current-game="biblical-match-three"] .bmt-free-card{padding-right:68px!important}body[data-current-game="biblical-match-three"] .bmt-v15-free-icon{width:50px!important;height:50px!important;right:9px!important}}
'''
p.write_text(text)

launcher = 'web/js/biblical-match-three-launcher.js'
patch(launcher, 'const VERSION="17";', 'const VERSION="18";')
index = Path('index.html')
text = index.read_text()
if 'web/js/biblical-match-three-launcher.js?v=17' not in text:
    raise SystemExit('index launcher cache key missing')
index.write_text(text.replace('web/js/biblical-match-three-launcher.js?v=17','web/js/biblical-match-three-launcher.js?v=18',1))

check = 'scripts/check-biblical-match-three.mjs'
p = Path(check)
text = p.read_text()
old_gate = 'launcher.includes(\'VERSION="17"\')&&launcher.includes(\'ALLOWED_USER_ID="1288379477"\')&&launcher.includes(\'isAllowedUser\')&&launcher.includes(\'removeMenuCard\')'
new_gate = 'launcher.includes(\'VERSION="18"\')&&launcher.includes(\'ALLOWED_USER_ID="1288379477"\')&&launcher.includes(\'5693086211\')&&launcher.includes(\'5502223852\')&&launcher.includes(\'isAllowedUser\')&&launcher.includes(\'removeMenuCard\')'
if old_gate not in text:
    raise SystemExit('static gate check marker missing')
text = text.replace(old_gate, new_gate, 1).replace("'V17 private access gate missing'", "'V18 three-user private access gate missing'", 1)
marker = "const syms=['bible','fish','dove','lamp','crown','ark'];"
audit = r'''const campaignSymbols=['bible','fish','dove','lamp','crown','ark','bread','grapes','tablets'];
const levelShapes={1:'rect',2:'rect',3:'oval',4:'bowl',5:'diamond',6:'oval',7:'cross',8:'bowl',9:'diamond',10:'cross',11:'shield',12:'oval',13:'diamond',14:'bowl',15:'cross',16:'shield',17:'cross',18:'diamond',19:'bowl',20:'shield',21:'diamond',22:'cross',23:'bowl',24:'diamond',25:'shield',26:'cross',27:'bowl',28:'diamond',29:'shield',30:'cross'};
const maskFor=(shape,rows,cols,level)=>{const mask=new Array(rows*cols).fill(true),cx=(cols-1)/2,cy=(rows-1)/2;for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const dx=Math.abs(col-cx),dy=Math.abs(row-cy);let active=true;if(shape==='oval')active=((col-cx)/Math.max(1,cols*.53))**2+((row-cy)/Math.max(1,rows*.57))**2<=1;else if(shape==='diamond')active=dx/Math.max(1,cols*.52)+dy/Math.max(1,rows*.55)<=1;else if(shape==='cross')active=dx<=1.55||dy<=1.15;else if(shape==='bowl'){const edge=dx/Math.max(1,cx),minRow=Math.floor(edge*edge*Math.max(1,rows*.38));active=row>=minRow}else if(shape==='shield'){const t=rows<=1?0:row/(rows-1),half=t<.42?cols*.46:Math.max(1.35,cols*.46-(t-.42)*cols*.52);active=dx<=half}mask[row*cols+col]=active}for(const group of level.blockers||[])for(const index of group.cells||[])mask[Number(index)]=true;return mask};
for(const level of data.levels){const required=[...new Set((level.goals||[]).filter(g=>g.type==='collect').map(g=>g.symbol))];let pool=campaignSymbols.slice(0,Math.max(3,Math.min(campaignSymbols.length,Number(level.symbolCount||6))));for(const symbol of required){if(pool.includes(symbol))continue;let slot=-1;for(let i=pool.length-1;i>=0;i--)if(!required.includes(pool[i])){slot=i;break}if(slot>=0)pool[slot]=symbol;else pool.push(symbol)}for(const symbol of required)ok(pool.includes(symbol),`level ${level.id} target ${symbol} absent from symbol pool`);for(const goal of level.goals||[]){if(goal.type==='clearBlockers'){const total=(level.blockers||[]).filter(b=>b.type===goal.blocker).reduce((sum,b)=>sum+(b.cells||[]).length,0);ok(total>=Number(goal.count||0),`level ${level.id} blocker goal impossible`)}if(goal.type==='lightLamps'){const total=(level.blockers||[]).filter(b=>b.type==='lamp').reduce((sum,b)=>sum+(b.cells||[]).length,0);ok(total>=Number(goal.count||0),`level ${level.id} lamp goal impossible`)}}const rows=Number(level.rows||data.rows),mask=maskFor(levelShapes[level.id]||'rect',rows,data.cols,level);ok(mask.filter(Boolean).length>=24,`level ${level.id} shaped board too small`);for(const group of level.blockers||[])for(const cell of group.cells||[])ok(mask[Number(cell)],`level ${level.id} blocker placed in a hole`);for(let seed=1;seed<=12;seed++){let s=seed+level.id*997;const rng=()=>{s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296};let playable=false;for(let attempt=0;attempt<30&&!playable;attempt++){const board=Core.createBoard(rows,data.cols,pool,rng);board.forEach((_,i)=>{if(!mask[i])board[i]=null});playable=Core.findMatches(board,rows,data.cols).length===0&&Boolean(Core.findHint(board,rows,data.cols,(a,b)=>mask[a]&&mask[b]))&&required.every(sym=>board.filter(cell=>cell?.type===sym).length>=3)}ok(playable,`level ${level.id} seed ${seed} cannot produce playable shaped board`)}}
ok(game.includes('getLevelSymbolSet')&&game.includes('LEVEL_SHAPES')&&game.includes('createPlayableBoard')&&game.includes('freeChallengeConfig'),'V18 campaign rules missing');ok(game.includes('moves: 30')&&game.includes('rows: 7')&&game.includes('rows: 8'),'V18 free board sizing/move limits missing');ok(game.includes('is-blocker-breaking')&&css15.includes('bmt-v18-blocker-break'),'V18 obstacle animation missing');ok(css15.includes('.bmt-tile.is-hole')&&css15.includes('width:62px'),'V18 shaped board/free icon polish missing');
'''
if marker not in text:
    raise SystemExit('static QA marker missing')
text = text.replace(marker, audit + marker, 1).replace('V17 private direct-WebP checks passed','V18 shaped-board logic/direct-WebP checks passed',1)
p.write_text(text)

visual = 'scripts/check-biblical-match-three-visual.mjs'
p = Path(visual)
text = p.read_text().replace("const V='17';", "const V='18';", 1)
insert = r'''
async function checkV18Rules(){
 const page=await context.newPage();
 try{
  await page.goto(base+'/__qa?unlockAll=1',{waitUntil:'domcontentloaded',timeout:30000});await page.waitForSelector('.bmt-v13-menu',{timeout:20000});
  const level3=page.locator('.bmt-v13-level').filter({hasText:'Хлеб жизни'}).first();await level3.click();await page.waitForSelector('.bmt-prelevel',{state:'visible',timeout:6000});await page.getByRole('button',{name:/Начать уровень/}).click();await page.waitForSelector('.bmt-board',{timeout:8000});await dismissTutorial(page);
  const l3=await page.evaluate(()=>({shape:document.querySelector('.bmt-board')?.dataset.shape,holes:document.querySelectorAll('.bmt-tile.is-hole').length,bread:[...document.querySelectorAll('.bmt-piece')].filter(img=>img.alt==='Хлеб'&&img.naturalWidth>=64).length,active:Number(document.querySelector('.bmt-board')?.dataset.activeCells||0)}));
  if(l3.shape!=='oval'||l3.holes<1||l3.bread<3||l3.active<24)throw new Error(`level3 rules ${JSON.stringify(l3)}`);
  await page.locator('.bmt-gamebar .bmt-icon-button').click();await page.waitForSelector('.bmt-pause-overlay',{timeout:3000});await page.getByRole('button',{name:/В меню игры/}).click();await page.waitForSelector('.bmt-v13-menu',{timeout:5000});await page.locator('[data-v13-mode="free"]').click();
  const iconLayout=await page.evaluate(()=>[...document.querySelectorAll('.bmt-free-card')].map(card=>{const img=card.querySelector('.bmt-v15-free-icon'),label=card.querySelector('.bmt-free-card__mode'),ir=img?.getBoundingClientRect(),lr=label?.getBoundingClientRect();return{w:ir?.width||0,overlap:ir&&lr?!(ir.right<=lr.left||ir.left>=lr.right||ir.bottom<=lr.top||ir.top>=lr.bottom):false}}));
  if(iconLayout.length<4||iconLayout.some(x=>x.w<48||x.overlap))throw new Error(`free icon layout ${JSON.stringify(iconLayout)}`);
  const medium=page.locator('.bmt-free-card').filter({hasText:'Средний'}).first();await medium.click();await page.waitForSelector('.bmt-board',{timeout:5000});const med=await page.evaluate(()=>({rows:+document.querySelector('.bmt-board')?.dataset.rows,moves:document.getElementById('bmt-moves')?.textContent?.trim(),shape:document.querySelector('.bmt-board')?.dataset.shape,blockers:document.querySelectorAll('.bmt-tile.has-chain,.bmt-tile.has-tablet').length}));if(med.rows!==8||med.moves!=='30'||med.shape!=='bowl'||med.blockers<8)throw new Error(`medium ${JSON.stringify(med)}`);
  await page.locator('.bmt-gamebar .bmt-icon-button').click();await page.waitForSelector('.bmt-result-overlay',{timeout:3000});await page.getByRole('button',{name:/В меню/}).click();await page.waitForSelector('.bmt-v13-menu',{timeout:5000});await page.locator('[data-v13-mode="free"]').click();const hard=page.locator('.bmt-free-card').filter({hasText:'Сложный'}).first();await hard.click();await page.waitForSelector('.bmt-board',{timeout:5000});const hardState=await page.evaluate(()=>({rows:+document.querySelector('.bmt-board')?.dataset.rows,moves:document.getElementById('bmt-moves')?.textContent?.trim(),shape:document.querySelector('.bmt-board')?.dataset.shape,blockers:document.querySelectorAll('.bmt-tile.has-chain,.bmt-tile.has-tablet,.bmt-tile.has-lamp').length}));if(hardState.rows!==8||hardState.moves!=='30'||hardState.shape!=='cross'||hardState.blockers<14)throw new Error(`hard ${JSON.stringify(hardState)}`);
 }finally{await page.close()}
}
'''
needle = 'try{await checkAccess();await checkGame();'
if needle not in text:
    raise SystemExit('visual QA footer missing')
text = text.replace(needle, insert + '\ntry{await checkAccess();await checkGame();await checkV18Rules();', 1).replace('V17 private access + direct WebP icons + transparent cells + visible swipe passed','V18 private access + goals + shapes + free difficulty + direct WebP + visible swipe passed',1)
p.write_text(text)

print('V18 source patch applied')
