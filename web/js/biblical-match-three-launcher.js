(() => {
"use strict";
const GAME_KEY="biblical-match-three";
const TITLE="Библейские сокровища";
const VERSION="45";
const MENU_ART_VERSION="39";
const ART_SRC=`web/games/biblical-match-three-v5-loader.js?v=${VERSION}`;
const CORE_SRC=`web/games/biblical-match-three-core.js?v=${VERSION}`;
const SPECIAL_RULES_SRC=`web/js/v45-biblical-treasures-special-swipe.js?v=${VERSION}`;
const PROGRESS_SRC=`web/games/biblical-match-three-progress.js?v=${VERSION}`;
const EFFECTS_SRC=`web/games/biblical-match-three-effects.js?v=${VERSION}`;
const GAME_SRC=`web/games/biblical-match-three.js?v=${VERSION}`;
const RUNTIME_SRC=`web/games/biblical-match-three-v10-runtime.js?v=${VERSION}`;
const UI_SRC=`web/games/biblical-match-three-v15-ui.js?v=${VERSION}`;
const POLISH_SRC=`web/games/biblical-match-three-v15-polish.js?v=${VERSION}`;
const LEVELS_SRC=`web/data/biblical_match_three_levels.json?v=${VERSION}`;
const MENU_ICON=`web/assets/icons/biblical-treasures-v38.webp?v=${MENU_ART_VERSION}`;
const STYLE_SOURCES=[
 `web/styles/biblical-match-three-v2.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v2-polish.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v4.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v5.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v9.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v10.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v11-modal.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v13.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v15-polish.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v21-art.css?v=${VERSION}`
];
const SCRIPT_TIMEOUT=12000;
let launchPromise=null,launchAttempt=0,installed=false,patchedGamePromise=null;
function currentUserId(){const values=[window.Telegram?.WebApp?.initDataUnsafe?.user?.id,window.__ANDROID_TELEGRAM_ID__];for(const value of values){const id=String(value??"").trim();if(/^\d{5,20}$/.test(id))return id}return ""}
function isAllowedUser(){return true}
function ensureStylesheet(){STYLE_SOURCES.forEach((href,index)=>{let link=document.querySelector(`link[data-biblical-match-three-style="${index}"]`);if(!link){link=document.createElement("link");link.rel="stylesheet";link.dataset.biblicalMatchThreeStyle=String(index);document.head.appendChild(link)}if(!link.href.includes(href.split("?")[0])||!link.href.includes(`v=${VERSION}`))link.href=href});document.querySelectorAll('link[data-biblical-match-three-style]').forEach(link=>{if(Number(link.dataset.biblicalMatchThreeStyle)>=STYLE_SOURCES.length)link.remove()})}
function rememberOpen(){try{let history=JSON.parse(localStorage.getItem("last_games_history")||"[]");if(!Array.isArray(history))history=[];history=[TITLE,...history.filter(item=>item!==TITLE)].slice(0,3);localStorage.setItem("last_games_history",JSON.stringify(history))}catch{}}
function markerReady(marker){return !marker||Boolean(window[marker])}
function canonicalOf(src){return src.split("?")[0]}
function findScript(src){const canonical=canonicalOf(src);return [...document.scripts].find(script=>(script.getAttribute("src")||"").split("?")[0]===canonical)}
function waitForExisting(script,marker){if(markerReady(marker)||script.dataset.loaded==="1")return Promise.resolve();return new Promise((resolve,reject)=>{let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(timer);script.removeEventListener("load",onLoad);script.removeEventListener("error",onError);error?reject(error):resolve()};const onLoad=()=>{script.dataset.loaded="1";marker&&!window[marker]?finish(new Error(`script marker missing: ${marker}`)):finish()};const onError=()=>{script.dataset.bmtFailed="1";finish(new Error(`script failed: ${script.src}`))};const timer=setTimeout(()=>finish(new Error(`script timeout: ${script.src}`)),SCRIPT_TIMEOUT);script.addEventListener("load",onLoad,{once:true});script.addEventListener("error",onError,{once:true})})}
function createScript(src,marker){return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.dataset.bmtSrc=canonicalOf(src);const timer=setTimeout(()=>{script.dataset.bmtFailed="1";reject(new Error(`script timeout: ${src}`))},SCRIPT_TIMEOUT);script.addEventListener("load",()=>{clearTimeout(timer);script.dataset.loaded="1";if(marker&&!window[marker]){script.dataset.bmtFailed="1";reject(new Error(`script marker missing: ${marker}`));return}resolve()},{once:true});script.addEventListener("error",()=>{clearTimeout(timer);script.dataset.bmtFailed="1";reject(new Error(`script failed: ${src}`))},{once:true});document.body.appendChild(script)})}
async function loadScriptOnce(src,marker){if(markerReady(marker))return;let existing=findScript(src);if(existing){if(existing.dataset.bmtFailed==="1"){existing.remove();existing=null}else{try{await waitForExisting(existing,marker);if(markerReady(marker))return}catch{existing.remove();existing=null}}}await createScript(src,marker)}
function purgeFailedScripts(){document.querySelectorAll('script[data-bmt-failed="1"]').forEach(script=>script.remove())}
async function ensureArt(){await loadScriptOnce(ART_SRC,"BiblicalMatchThreeV5ArtReady");const art=await Promise.race([window.BiblicalMatchThreeV5ArtReady,new Promise((_,reject)=>setTimeout(()=>reject(new Error("WebP art timeout")),12000))]);if(!art?.symbols?.bible||!art?.symbols?.ark||!art?.boosters?.covenant||art.kind!=="file-webp-v17"||art.transport!=="file")throw new Error("V17 WebP art incomplete");return art}

function patchGameSource(source){
 const replacements=[
  [
`const IN_BOOSTERS = {\n  sling: { label: "Праща Давида", cost: 5, asset: "web/assets/biblical-match-three/crown.svg", desc: "Точный удар по одной клетке.", target: true },\n  staff: { label: "Посох Моисея", cost: 7, asset: "web/assets/biblical-match-three/tablets.svg", desc: "Очищает выбранный столбец.", target: true },\n  jericho: { label: "Трубы Иерихона", cost: 10, asset: "web/assets/biblical-match-three/lamp.svg", desc: "Мощная ударная волна 3×3.", target: true },\n  ark: { label: "Ноев ковчег", cost: 8, asset: "web/assets/biblical-match-three/ark.svg", desc: "Перемешивает поле и дарит две особые фишки.", target: false },\n};`,
`const IN_BOOSTERS = {\n  sling: { label: "Праща Давида", cost: 5, asset: "web/assets/biblical-match-three/crown.svg", desc: "Точный удар по одной клетке.", target: true },\n  staff: { label: "Посох Моисея", cost: 7, asset: "web/assets/biblical-match-three/tablets.svg", desc: "Очищает выбранный столбец.", target: true },\n  jericho: { label: "Трубы Иерихона", cost: 10, asset: "web/assets/biblical-match-three/lamp.svg", desc: "Мощная ударная волна 3×3.", target: true },\n  rainbow: { label: "Радуга Завета", cost: 8, asset: "web/assets/biblical-match-three/icons-v17/covenant.webp", desc: "Превращает выбранную фишку в радужную.", target: true },\n};`
  ],
  [
`function activateBooster(id) {\n  if (!runtime || runtime.busy) return; clearHint(); const booster = IN_BOOSTERS[id]; if (!booster) return;\n  if (!booster.target) { useNoahArk(); return; }\n  if (runtime.activeBooster === id) { runtime.activeBooster = null; updateBoosterState(); toast("Бустер отменён"); return; }\n  runtime.activeBooster = id; runtime.selected = null; updateSelection(); updateBoosterState(); toast(\`${'${booster.label}'}: выберите клетку\`, "info"); FX.haptic?.();\n}`,
`function activateBooster(id) {\n  if (!runtime || runtime.busy) return; clearHint(); const booster = IN_BOOSTERS[id]; if (!booster) return;\n  if (runtime.activeBooster === id) { runtime.activeBooster = null; updateBoosterState(); toast("Бустер отменён"); return; }\n  runtime.activeBooster = id; runtime.selected = null; updateSelection(); updateBoosterState(); toast(\`${'${booster.label}'}: выберите клетку\`, "info"); FX.haptic?.();\n}`
  ],
  [
`async function useTargetBooster(id, index) {\n  if (!runtime || runtime.busy || !isActive(index)) return;\n  if (!spendBooster(id)) { runtime.activeBooster = null; updateBoosterState(); return; }\n  runtime.activeBooster = null; updateBoosterState(); setBusy(true);\n  if (id === "sling") { FX.floatText?.(index, "ПРАЩА", "gold"); FX.ring?.(index, "gold"); await clearAndCascade(new Set([index]), 1, new Map(), { booster: id }); }\n  else if (id === "staff") { FX.floatText?.(index, "ПОСОХ", "blue"); FX.beam?.(index, "v"); await clearAndCascade(new Set(Core.columnIndices(index, ROWS, COLS)), 1, new Map(), { booster: id }); }\n  else if (id === "jericho") { FX.floatText?.(index, "ИЕРИХОН", "violet"); FX.ring?.(index, "violet"); await clearAndCascade(new Set(Core.areaIndices(index, 1, ROWS, COLS)), 1, new Map(), { booster: id }); }\n  finishTurn();\n}`,
`async function useTargetBooster(id, index) {\n  if (!runtime || runtime.busy || !isActive(index)) return;\n  if (id === "rainbow" && runtime.blockers.has(index)) { toast("Выберите фишку без препятствия", "info"); FX.haptic?.("error"); return; }\n  if (!spendBooster(id)) { runtime.activeBooster = null; updateBoosterState(); return; }\n  runtime.activeBooster = null; updateBoosterState(); setBusy(true);\n  if (id === "rainbow") {\n    const cell = runtime.board[index];\n    if (!cell) { setBusy(false); scheduleHint(); return; }\n    runtime.board[index] = { ...cell, special:"rainbow" };\n    updateTile(runtime.tileNodes[index], runtime.board[index], runtime.blockers.get(index));\n    FX.ring?.(index, "rainbow"); FX.floatText?.(index, "РАДУГА", "violet"); FX.haptic?.("success");\n    toast("Радуга готова — смахните её с нужным символом", "success");\n    setBusy(false); scheduleHint(); return;\n  }\n  if (id === "sling") { FX.floatText?.(index, "ПРАЩА", "gold"); FX.ring?.(index, "gold"); await clearAndCascade(new Set([index]), 1, new Map(), { booster: id }); }\n  else if (id === "staff") { FX.floatText?.(index, "ПОСОХ", "blue"); FX.beam?.(index, "v"); await clearAndCascade(new Set(Core.columnIndices(index, ROWS, COLS)), 1, new Map(), { booster: id }); }\n  else if (id === "jericho") { FX.floatText?.(index, "ИЕРИХОН", "violet"); FX.ring?.(index, "violet"); await clearAndCascade(new Set(Core.areaIndices(index, 1, ROWS, COLS)), 1, new Map(), { booster: id }); }\n  finishTurn();\n}`
  ],
  [
`function useNoahArk() {\n  if (!runtime || runtime.busy) return; if (!spendBooster("ark")) return; setBusy(true); FX.haptic?.("success"); document.querySelector(".bmt-board")?.classList.add("is-ark-shuffling"); setTimeout(() => document.querySelector(".bmt-board")?.classList.remove("is-ark-shuffling"), 520);\n  runtime.board = reshufflePlayable(); const available = runtime.board.map((cell, index) => (!cell.special ? index : -1)).filter((index) => index >= 0);\n  if (available.length) { const first = available.splice(Math.floor(Math.random() * available.length), 1)[0]; runtime.board[first].special = "lineH"; }\n  if (available.length) { const second = available[Math.floor(Math.random() * available.length)]; runtime.board[second].special = "lineV"; }\n  updateAllTiles(); toast("Ковчег сохранил поле и принёс две особые фишки", "success"); setTimeout(() => { setBusy(false); scheduleHint(); }, 480);\n}\n\n`,
``
  ],
  [
`if (runtime.seededGoalSpecials > 0) setTimeout(() => toast("Особые фишки уже на поле — соедините соседнюю пару", "info"), 560);`,
`if (runtime.seededGoalSpecials > 0) setTimeout(() => toast("Особые фишки уже на поле — просто смахните нужную фишку", "info"), 560);`
  ]
 ];
 let patched=source;
 for(const [before,after] of replacements){
  if(!patched.includes(before)) throw new Error('Biblical Treasures V45 patch signature drift');
  patched=patched.replace(before,after);
 }
 return patched;
}

async function loadPatchedGame(){
 if(typeof window.startBiblicalMatchThreeGame==="function"&&window.__bmtPatchedGameVersion===VERSION)return;
 if(patchedGamePromise)return patchedGamePromise;
 patchedGamePromise=(async()=>{
  const response=await fetch(GAME_SRC,{cache:"no-store"});
  if(!response.ok)throw new Error(`game source HTTP ${response.status}`);
  const source=patchGameSource(await response.text());
  const script=document.createElement("script");
  script.dataset.bmtPatchedGame=VERSION;
  script.textContent=`${source}\n//# sourceURL=biblical-match-three-v45-patched.js`;
  document.body.appendChild(script);
  script.remove();
  if(typeof window.startBiblicalMatchThreeGame!=="function")throw new Error("patched start function missing");
  window.__bmtPatchedGameVersion=VERSION;
 })().finally(()=>{patchedGamePromise=null});
 return patchedGamePromise;
}

async function performOpen({retry=false}={}){
 ensureStylesheet();rememberOpen();launchAttempt+=1;const attempt=launchAttempt;const menu=document.getElementById("menu-container"),container=document.getElementById("game-container");if(!container)return false;if(retry)purgeFailedScripts();window.AppErrorBoundary?.close?.();
 try{window.__biblicalMatchThreeCleanup?.()}catch(error){console.warn("Biblical Treasures cleanup warning",error)}
 menu?.classList.add("hidden");document.body.dataset.mode="game";document.body.dataset.currentGame=GAME_KEY;container.innerHTML='<div class="app-game-loading"><div class="app-loader__ring"></div><p>Загрузка «Библейские сокровища»...</p></div>';window.scrollTo({top:0,behavior:"auto"});
 try{
  await ensureArt();await loadScriptOnce(CORE_SRC,"BiblicalMatchThreeCore");await loadScriptOnce(SPECIAL_RULES_SRC,"__bmtV45SpecialSwipeInstalled");await loadScriptOnce(PROGRESS_SRC,"BiblicalMatchThreeProgress");await loadScriptOnce(EFFECTS_SRC,"BiblicalMatchThreeEffects");await loadPatchedGame();await loadScriptOnce(RUNTIME_SRC,"__bmtV10RuntimeInstalled");await loadScriptOnce(UI_SRC,"__bmtV15UiInstalled");await loadScriptOnce(POLISH_SRC,"__bmtV15PolishInstalled");
  if(typeof window.startBiblicalMatchThreeGame!=="function")throw new Error("start function missing");const levels=retry?`${LEVELS_SRC}&retry=${Date.now()}`:LEVELS_SRC;await window.startBiblicalMatchThreeGame(levels);if(attempt!==launchAttempt)return false;window.__BMTV5Raster?.scan?.();window.BiblicalMatchThreeV15UI?.enhance?.(document);window.BiblicalMatchThreeV15?.enhance?.(document);return true;
 }catch(error){console.error("Biblical match-three launch error",error);if(!retry)return false;window.AppErrorBoundary?.report?.(error,{kind:"game-load",source:"biblical-match-three-launcher",fatal:false});container.innerHTML=`<section class="app-error-card fade-in"><h2>Не удалось запустить «Библейские сокровища»</h2><p>Не удалось загрузить новые WebP-иконки или один из файлов игры. Нажмите «Повторить».</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button type="button" class="back-button" id="bmt-launch-retry">Повторить</button><button type="button" class="back-button" id="bmt-launch-back">В главное меню</button></div></section>`;document.getElementById("bmt-launch-retry")?.addEventListener("click",()=>openGame({retry:true}),{once:true});document.getElementById("bmt-launch-back")?.addEventListener("click",()=>{(window.appGoToMainMenu||window.goToMainMenu)?.()},{once:true});return false}
}
function openGame(options={}){if(launchPromise)return launchPromise;launchPromise=performOpen(options).then(result=>{if(result||options.retry)return result;purgeFailedScripts();return new Promise(resolve=>setTimeout(resolve,180)).then(()=>performOpen({retry:true}))}).finally(()=>{launchPromise=null});return launchPromise}
function addMenuCard(){const root=document.getElementById("kids-games");if(!root)return false;if(document.getElementById("biblical-match-three-card"))return true;const card=document.createElement("button");card.type="button";card.id="biblical-match-three-card";card.className="game-card game-card--biblical-treasures-v38";card.setAttribute("aria-label",`Открыть игру ${TITLE}`);card.innerHTML=`<span class="game-card__icon game-card__icon--image"><img class="game-card__img system-art-img" src="${MENU_ICON}" alt="Иконка игры ${TITLE}" loading="eager" decoding="async" fetchpriority="high" draggable="false" data-bmt-menu-art="v39" data-system-icon="biblical" data-icon-version="39"></span><span class="game-card__body"><span class="game-card__title">${TITLE}</span><span class="game-card__desc">Матч‑3 с Путём света, рекордами и быстрыми комбинациями</span></span>`;card.addEventListener("click",async()=>{if(card.dataset.opening==="1")return;card.dataset.opening="1";card.setAttribute("aria-busy","true");const opened=await openGame();if(!opened){delete card.dataset.opening;card.removeAttribute("aria-busy")}});root.append(card);return true}
function installPublic(){if(installed)return false;installed=true;if(addMenuCard())return true;const observer=new MutationObserver(()=>{if(addMenuCard())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),12000);return true}
function install(){installPublic()}
window.openBiblicalMatchThree=openGame;window.BiblicalMatchThreeAccess={publicAccess:true,currentUserId,isAllowedUser};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>requestAnimationFrame(install),{once:true});else requestAnimationFrame(install);
})();
