(() => {
"use strict";
const GAME_KEY="biblical-match-three";
const TITLE="Библейские сокровища";
const VERSION="8";
const ART_SRC=`web/games/biblical-match-three-v5-loader.js?v=${VERSION}`;
const CORE_SRC=`web/games/biblical-match-three-core.js?v=${VERSION}`;
const PROGRESS_SRC=`web/games/biblical-match-three-progress.js?v=${VERSION}`;
const EFFECTS_SRC=`web/games/biblical-match-three-effects.js?v=${VERSION}`;
const GAME_SRC=`web/games/biblical-match-three.js?v=${VERSION}`;
const UX_SRC=`web/games/biblical-match-three-v2-ux.js?v=${VERSION}`;
const V6_SRC=`web/games/biblical-match-three-v6-runtime.js?v=${VERSION}`;
const LEVELS_SRC=`web/data/biblical_match_three_levels.json?v=${VERSION}`;
const STYLE_SOURCES=[`web/styles/biblical-match-three-v2.css?v=${VERSION}`,`web/styles/biblical-match-three-v2-polish.css?v=${VERSION}`,`web/styles/biblical-match-three-v4.css?v=${VERSION}`,`web/styles/biblical-match-three-v5.css?v=${VERSION}`];
function menuArt(){return window.BiblicalMatchThreeV5Art?.symbols?.bible||`web/assets/biblical-match-three/bible.svg?v=${VERSION}`}
function ensureStylesheet(){STYLE_SOURCES.forEach((href,index)=>{let link=document.querySelector(`link[data-biblical-match-three-style="${index}"]`);if(!link){link=document.createElement("link");link.rel="stylesheet";link.dataset.biblicalMatchThreeStyle=String(index);document.head.appendChild(link)}if(!link.href.includes(href.split("?")[0]))link.href=href})}
function rememberOpen(){try{let history=JSON.parse(localStorage.getItem("last_games_history")||"[]");if(!Array.isArray(history))history=[];history=[TITLE,...history.filter(item=>item!==TITLE)].slice(0,3);localStorage.setItem("last_games_history",JSON.stringify(history))}catch{}}
function loadScriptOnce(src,marker){if(marker&&window[marker])return Promise.resolve();const canonical=src.split("?")[0];const existing=[...document.scripts].find(script=>(script.getAttribute("src")||"").split("?")[0]===canonical);if(existing)return new Promise((resolve,reject)=>{if((marker&&window[marker])||existing.dataset.loaded==="1")resolve();else{existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",reject,{once:true})}});return new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.dataset.bmtSrc=canonical;script.addEventListener("load",()=>{script.dataset.loaded="1";resolve()},{once:true});script.addEventListener("error",reject,{once:true});document.body.appendChild(script)})}
async function ensureArt(){
 try{
  await loadScriptOnce(ART_SRC,"BiblicalMatchThreeV5ArtReady");
  if(window.BiblicalMatchThreeV5ArtReady)await Promise.race([window.BiblicalMatchThreeV5ArtReady,new Promise(resolve=>setTimeout(resolve,12000))]);
 }catch(error){console.warn("Biblical Treasures art preload failed; continuing with fallback",error)}
 return window.BiblicalMatchThreeV5Art||null;
}
async function openGame(){ensureStylesheet();rememberOpen();const menu=document.getElementById("menu-container"),container=document.getElementById("game-container");if(!container)return;window.__biblicalMatchThreeCleanup?.();menu?.classList.add("hidden");document.body.dataset.mode="game";document.body.dataset.currentGame=GAME_KEY;container.innerHTML='<div class="app-game-loading"><div class="app-loader__ring"></div><p>Загрузка «Библейские сокровища»...</p></div>';window.scrollTo({top:0,behavior:"auto"});try{await ensureArt();await loadScriptOnce(CORE_SRC,"BiblicalMatchThreeCore");await loadScriptOnce(PROGRESS_SRC,"BiblicalMatchThreeProgress");await loadScriptOnce(EFFECTS_SRC,"BiblicalMatchThreeEffects");await loadScriptOnce(GAME_SRC,"startBiblicalMatchThreeGame");await loadScriptOnce(V6_SRC,"__bmtV6RuntimeInstalled");await loadScriptOnce(UX_SRC,"__bmtV4UxInstalled");if(typeof window.startBiblicalMatchThreeGame!=="function")throw new Error("start function missing");await window.startBiblicalMatchThreeGame(LEVELS_SRC);window.__BMTV5Raster?.scan?.()}catch(error){console.error("Biblical match-three launch error",error);container.innerHTML=`<section class="app-error-card fade-in"><h2>Не удалось запустить «Библейские сокровища»</h2><p>Не удалось загрузить один из файлов игры. Нажмите «Повторить».</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button type="button" class="back-button" id="bmt-launch-retry">Повторить</button><button type="button" class="back-button" id="bmt-launch-back">В главное меню</button></div></section>`;document.getElementById("bmt-launch-retry")?.addEventListener("click",openGame,{once:true});document.getElementById("bmt-launch-back")?.addEventListener("click",()=>{(window.appGoToMainMenu||window.goToMainMenu)?.()},{once:true})}}
function addMenuCard(){const root=document.getElementById("kids-games");if(!root||document.getElementById("biblical-match-three-card"))return false;const card=document.createElement("button");card.type="button";card.id="biblical-match-three-card";card.className="game-card";card.setAttribute("aria-label",`Открыть игру ${TITLE}`);card.innerHTML=`<span class="game-card__icon game-card__icon--image"><img class="game-card__img" src="${menuArt()}" alt="Иконка игры ${TITLE}" loading="lazy" decoding="async" draggable="false"></span><span class="game-card__body"><span class="game-card__title">${TITLE}</span><span class="game-card__desc">30 уровней, режим на время, HQ-иконки, свайпы и библейские бустеры</span></span>`;card.addEventListener("click",openGame);root.append(card);return true}
async function install(){ensureStylesheet();ensureArt().catch(()=>{});if(addMenuCard())return;const observer=new MutationObserver(()=>{if(addMenuCard())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),12000)}
window.openBiblicalMatchThree=openGame;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>requestAnimationFrame(install),{once:true});else requestAnimationFrame(install);
})();
