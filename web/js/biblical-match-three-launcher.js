(() => {
"use strict";
const GAME_KEY="biblical-match-three";
const TITLE="Библейские сокровища";
const VERSION="15";
const ART_SRC=`web/games/biblical-match-three-v5-loader.js?v=${VERSION}`;
const CORE_SRC=`web/games/biblical-match-three-core.js?v=${VERSION}`;
const PROGRESS_SRC=`web/games/biblical-match-three-progress.js?v=${VERSION}`;
const EFFECTS_SRC=`web/games/biblical-match-three-effects.js?v=${VERSION}`;
const GAME_SRC=`web/games/biblical-match-three.js?v=${VERSION}`;
const RUNTIME_SRC=`web/games/biblical-match-three-v10-runtime.js?v=${VERSION}`;
const V15_UI_SRC=`web/games/biblical-match-three-v15-ui.js?v=${VERSION}`;
const V15_POLISH_SRC=`web/games/biblical-match-three-v15-polish.js?v=${VERSION}`;
const LEVELS_SRC=`web/data/biblical_match_three_levels.json?v=${VERSION}`;
const STYLE_SOURCES=[
 `web/styles/biblical-match-three-v2.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v2-polish.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v4.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v5.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v9.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v10.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v11-modal.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v13.css?v=${VERSION}`,
 `web/styles/biblical-match-three-v15-polish.css?v=${VERSION}`
];
const SCRIPT_TIMEOUT=12000;
let launchPromise=null;
let launchAttempt=0;

function menuArt(){return window.BiblicalMatchThreeV5Art?.symbols?.bible||""}
function ensureStylesheet(){STYLE_SOURCES.forEach((href,index)=>{let link=document.querySelector(`link[data-biblical-match-three-style="${index}"]`);if(!link){link=document.createElement("link");link.rel="stylesheet";link.dataset.biblicalMatchThreeStyle=String(index);document.head.appendChild(link)}if(!link.href.includes(href.split("?")[0])||!link.href.includes(`v=${VERSION}`))link.href=href});document.querySelectorAll('link[data-biblical-match-three-style]').forEach((link)=>{const index=Number(link.dataset.biblicalMatchThreeStyle);if(index>=STYLE_SOURCES.length)link.remove()})}
function rememberOpen(){try{let history=JSON.parse(localStorage.getItem("last_games_history")||"[]");if(!Array.isArray(history))history=[];history=[TITLE,...history.filter(item=>item!==TITLE)].slice(0,3);localStorage.setItem("last_games_history",JSON.stringify(history))}catch{}}
function markerReady(marker){return !marker||Boolean(window[marker])}
function canonicalOf(src){return src.split("?")[0]}
function findScript(src){const canonical=canonicalOf(src);return [...document.scripts].find(script=>(script.getAttribute("src")||"").split("?")[0]===canonical)}
function waitForExisting(script,marker){if(markerReady(marker)||script.dataset.loaded==="1")return Promise.resolve();return new Promise((resolve,reject)=>{let done=false;const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);script.removeEventListener("load",onLoad);script.removeEventListener("error",onError);error?reject(error):resolve()};const onLoad=()=>{script.dataset.loaded="1";if(marker&&!window[marker])finish(new Error(`script marker missing: ${marker}`));else finish()};const onError=()=>{script.dataset.bmtFailed="1";finish(new Error(`script failed: ${script.src}`))};const timer=setTimeout(()=>finish(new Error(`script timeout: ${script.src}`)),2200);script.addEventListener("load",onLoad,{once:true});script.addEventListener("error",onError,{once:true})})}
function createScript(src,marker){return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.dataset.bmtSrc=canonicalOf(src);const timer=setTimeout(()=>{script.dataset.bmtFailed="1";reject(new Error(`script timeout: ${src}`))},SCRIPT_TIMEOUT);script.addEventListener("load",()=>{clearTimeout(timer);script.dataset.loaded="1";if(marker&&!window[marker]){script.dataset.bmtFailed="1";reject(new Error(`script marker missing: ${marker}`));return}resolve()},{once:true});script.addEventListener("error",()=>{clearTimeout(timer);script.dataset.bmtFailed="1";reject(new Error(`script failed: ${src}`))},{once:true});document.body.appendChild(script)})}
async function loadScriptOnce(src,marker){if(markerReady(marker))return;let existing=findScript(src);if(existing){if(existing.dataset.bmtFailed==="1"){existing.remove();existing=null}else{try{await waitForExisting(existing,marker);if(markerReady(marker))return}catch{existing.remove();existing=null}}}await createScript(src,marker)}
function purgeFailedScripts(){document.querySelectorAll('script[data-bmt-failed="1"]').forEach(script=>script.remove())}

async function ensureArt(){
 await loadScriptOnce(ART_SRC,"BiblicalMatchThreeV5ArtReady");
 const art=await Promise.race([
  window.BiblicalMatchThreeV5ArtReady,
  new Promise((_,reject)=>setTimeout(()=>reject(new Error("HQ art timeout")),12000))
 ]);
 if(!art?.symbols?.bible||!art?.symbols?.ark||!art?.boosters?.ark||art.kind!=="raster-hq-v15")throw new Error("HQ art incomplete");
 return art;
}

async function performOpen({retry=false}={}){
 ensureStylesheet();rememberOpen();launchAttempt+=1;const attempt=launchAttempt;const menu=document.getElementById("menu-container"),container=document.getElementById("game-container");if(!container)return;
 if(retry)purgeFailedScripts();
 window.AppErrorBoundary?.close?.();
 try{window.__biblicalMatchThreeCleanup?.()}catch(error){console.warn("Biblical Treasures cleanup warning",error)}
 menu?.classList.add("hidden");document.body.dataset.mode="game";document.body.dataset.currentGame=GAME_KEY;container.innerHTML='<div class="app-game-loading"><div class="app-loader__ring"></div><p>Загрузка «Библейские сокровища»...</p></div>';window.scrollTo({top:0,behavior:"auto"});
 try{
  await ensureArt();
  await loadScriptOnce(CORE_SRC,"BiblicalMatchThreeCore");
  await loadScriptOnce(PROGRESS_SRC,"BiblicalMatchThreeProgress");
  await loadScriptOnce(EFFECTS_SRC,"BiblicalMatchThreeEffects");
  await loadScriptOnce(GAME_SRC,"startBiblicalMatchThreeGame");
  await loadScriptOnce(RUNTIME_SRC,"__bmtV10RuntimeInstalled");
  await loadScriptOnce(V15_UI_SRC,"__bmtV15UiInstalled");
  await loadScriptOnce(V15_POLISH_SRC,"__bmtV15PolishInstalled");
  if(typeof window.startBiblicalMatchThreeGame!=="function")throw new Error("start function missing");
  const levels=retry?`${LEVELS_SRC}&retry=${Date.now()}`:LEVELS_SRC;
  await window.startBiblicalMatchThreeGame(levels);
  if(attempt!==launchAttempt)return;
  window.__BMTV5Raster?.scan?.();
  try{window.BiblicalMatchThreeV15UI?.enhance?.(document)}catch(error){console.warn("Biblical Treasures V15 UI warning",error)}
  try{window.BiblicalMatchThreeV15?.enhance?.(document)}catch(error){console.warn("Biblical Treasures V15 enhancement warning",error)}
 }catch(error){
  console.error("Biblical match-three launch error",error);
  window.AppErrorBoundary?.report?.(error,{kind:"game-load",source:"biblical-match-three-launcher",fatal:false});
  container.innerHTML=`<section class="app-error-card fade-in"><h2>Не удалось запустить «Библейские сокровища»</h2><p>Не удалось загрузить качественную графику или один из файлов игры. Нажмите «Повторить».</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button type="button" class="back-button" id="bmt-launch-retry">Повторить</button><button type="button" class="back-button" id="bmt-launch-back">В главное меню</button></div></section>`;
  document.getElementById("bmt-launch-retry")?.addEventListener("click",()=>openGame({retry:true}),{once:true});
  document.getElementById("bmt-launch-back")?.addEventListener("click",()=>{(window.appGoToMainMenu||window.goToMainMenu)?.()},{once:true});
 }
}

function openGame(options={}){if(launchPromise)return launchPromise;launchPromise=performOpen(options).finally(()=>{launchPromise=null});return launchPromise}
function addMenuCard(){const root=document.getElementById("kids-games");if(!root||document.getElementById("biblical-match-three-card"))return false;const card=document.createElement("button");card.type="button";card.id="biblical-match-three-card";card.className="game-card";card.setAttribute("aria-label",`Открыть игру ${TITLE}`);const art=menuArt();card.innerHTML=`<span class="game-card__icon game-card__icon--image">${art?`<img class="game-card__img" src="${art}" alt="Иконка игры ${TITLE}" loading="eager" decoding="sync" draggable="false" data-bmt-raster="hq-v15">`:""}</span><span class="game-card__body"><span class="game-card__title">${TITLE}</span><span class="game-card__desc">Матч‑3 с Путём света, рекордами и быстрыми комбинациями</span></span>`;card.addEventListener("click",()=>openGame());root.append(card);return true}
async function install(){ensureStylesheet();try{await ensureArt()}catch(error){console.warn("Biblical Treasures menu art preload failed",error)}if(addMenuCard())return;const observer=new MutationObserver(()=>{if(addMenuCard())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),12000)}
window.openBiblicalMatchThree=openGame;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>requestAnimationFrame(install),{once:true});else requestAnimationFrame(install);
})();
