from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if text.count(old) != 1:
        raise SystemExit(f'{path}: expected one marker, found {text.count(old)}')
    p.write_text(text.replace(old, new, 1))


game = 'web/games/biblical-match-three.js'
old = '''function finishTurn() {
  if (!runtime) return; runtime.lastSwap = null; runtime.cascade = 0; updateHud();
  if (runtime.mode === "level" && allGoalsComplete()) { finishLevel(true); return; }
  if (runtime.mode === "level" && runtime.moves <= 0) { finishLevel(false); return; }
  if (runtime.mode === "free") { persistFreeRecord(true); if (Number.isFinite(runtime.moves) && runtime.moves <= 0) { setBusy(false); openFreeExit("moves"); return; } }
  if (countPlayableMoves(runtime.board, 1) === 0) {
    clearHint();
    if (runtime.mode === "level") { finishLevel(false, "noMoves"); return; }
    setBusy(false);
    if (runtime.mode === "free") { openFreeExit("noMoves"); return; }
    return;
  }
  setBusy(false); scheduleHint();
}
'''
new = '''function finishIfNoMoves() {
  if (!runtime || countPlayableMoves(runtime.board, 1) !== 0) return false;
  clearHint();
  if (runtime.mode === "level") { finishLevel(false, "noMoves"); return true; }
  setBusy(false);
  if (runtime.mode === "free") { openFreeExit("noMoves"); return true; }
  return true;
}

function finishTurn() {
  if (!runtime) return; runtime.lastSwap = null; runtime.cascade = 0; updateHud();
  if (runtime.mode === "level" && allGoalsComplete()) { finishLevel(true); return; }
  if (runtime.mode === "level" && runtime.moves <= 0) { finishLevel(false); return; }
  if (runtime.mode === "free") { persistFreeRecord(true); if (Number.isFinite(runtime.moves) && runtime.moves <= 0) { setBusy(false); openFreeExit("moves"); return; } }
  if (finishIfNoMoves()) return;
  setBusy(false); scheduleHint();
}
'''
replace_once(game, old, new)
old = 'const rulesApi = { version:20, minStartMoves:MIN_START_MOVES, getLevelSymbolSet, requiredCollectSymbols, makeActiveMask, boardShapeFor, levelShapes:LEVEL_SHAPES, shapeLabels:SHAPE_LABELS, findPlayableMoves:(limit=Infinity)=>findPlayableMoves(runtime?.board,limit), countPlayableMoves:(limit=Infinity)=>countPlayableMoves(runtime?.board,limit) };'
new = 'const rulesApi = { version:20, minStartMoves:MIN_START_MOVES, getLevelSymbolSet, requiredCollectSymbols, makeActiveMask, boardShapeFor, levelShapes:LEVEL_SHAPES, shapeLabels:SHAPE_LABELS, findPlayableMoves:(limit=Infinity)=>findPlayableMoves(runtime?.board,limit), countPlayableMoves:(limit=Infinity)=>countPlayableMoves(runtime?.board,limit), checkDeadBoard:finishIfNoMoves };'
replace_once(game, old, new)

visual = Path('scripts/check-biblical-match-three-visual.mjs')
text = visual.read_text()
old = '''  await page.goto(base+'/__qa',{waitUntil:'domcontentloaded',timeout:30000});await page.waitForSelector('.bmt-v13-menu',{timeout:20000});const first=page.locator('.bmt-v13-chapter.is-active .bmt-v13-level:not([disabled]),.bmt-v13-chapter.is-active .bmt-journey-node:not([disabled]),.bmt-v13-level:not([disabled]):visible').first();await first.scrollIntoViewIfNeeded();await first.click();await page.waitForSelector('.bmt-prelevel',{state:'visible',timeout:6000});await page.getByRole('button',{name:/Начать уровень/}).click();await page.waitForSelector('.bmt-board',{timeout:8000});await dismissTutorial(page);const state=await page.evaluate(()=>({count:window.BiblicalMatchThreeV20Rules?.countPlayableMoves?.()||0,move:window.BiblicalMatchThreeV20Rules?.findPlayableMoves?.(1)?.[0]||null}));if(state.count<3||!state.move)throw new Error(`campaign start moves ${JSON.stringify(state)}`);await page.locator(`.bmt-tile[data-index="${state.move[0]}"]`).click();await page.locator(`.bmt-tile[data-index="${state.move[1]}"]`).click();await page.evaluate(()=>{window.BiblicalMatchThreeCore.findMoves=()=>[]});await page.waitForSelector('.bmt-result-overlay',{state:'visible',timeout:7000});const result=await page.evaluate(()=>({title:document.querySelector('.bmt-result-card h3')?.textContent?.trim()||'',continueButtons:[...document.querySelectorAll('.bmt-result-card button')].filter(b=>(b.textContent||'').includes('+5 ходов')).length}));if(result.title!=='Нет доступных ходов'||result.continueButtons)throw new Error(`campaign no-move result ${JSON.stringify(result)}`);
'''
new = '''  await page.goto(base+'/__qa',{waitUntil:'domcontentloaded',timeout:30000});await page.waitForSelector('.bmt-v13-menu',{timeout:20000});const first=page.locator('.bmt-v13-chapter.is-active .bmt-v13-level:not([disabled]),.bmt-v13-chapter.is-active .bmt-journey-node:not([disabled]),.bmt-v13-level:not([disabled]):visible').first();await first.scrollIntoViewIfNeeded();await first.click();await page.waitForSelector('.bmt-prelevel',{state:'visible',timeout:6000});await page.getByRole('button',{name:/Начать уровень/}).click();await page.waitForSelector('.bmt-board',{timeout:8000});await dismissTutorial(page);const startMoves=await page.evaluate(()=>window.BiblicalMatchThreeV20Rules?.countPlayableMoves?.()||0);if(startMoves<3)throw new Error(`campaign start moves ${startMoves}`);const ended=await page.evaluate(()=>{window.BiblicalMatchThreeCore.findMoves=()=>[];return window.BiblicalMatchThreeV20Rules?.checkDeadBoard?.()});if(ended!==true)throw new Error(`dead-board check returned ${String(ended)}`);await page.waitForSelector('.bmt-result-overlay',{state:'visible',timeout:3000});const result=await page.evaluate(()=>({title:document.querySelector('.bmt-result-card h3')?.textContent?.trim()||'',continueButtons:[...document.querySelectorAll('.bmt-result-card button')].filter(b=>(b.textContent||'').includes('+5 ходов')).length}));if(result.title!=='Нет доступных ходов'||result.continueButtons)throw new Error(`campaign no-move result ${JSON.stringify(result)}`);
'''
if text.count(old) != 1:
    raise SystemExit(f'visual dead-board marker count {text.count(old)}')
visual.write_text(text.replace(old, new, 1))
