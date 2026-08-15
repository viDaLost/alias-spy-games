(() => {
"use strict";
const GAME_KEY = "biblical-match-three";
const TITLE = "Библейские три в ряд";
const CORE_SRC = "web/games/biblical-match-three-core.js?v=1";
const GAME_SRC = "web/games/biblical-match-three.js?v=1";
const LEVELS_SRC = "web/data/biblical_match_three_levels.json";
function ensureStylesheet() {
if (document.querySelector('link[data-biblical-match-three]')) return;
const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "web/styles/biblical-match-three.css?v=1";
link.dataset.biblicalMatchThree = "1";
document.head.appendChild(link);
}
function rememberOpen() {
try {
let history = JSON.parse(localStorage.getItem("last_games_history") || "[]");
if (!Array.isArray(history)) history = [];
history = [TITLE, ...history.filter((item) => item !== TITLE)].slice(0, 3);
localStorage.setItem("last_games_history", JSON.stringify(history));
} catch {}
}
function loadScriptOnce(src, marker) {
if (window[marker]) return Promise.resolve();
const existing = document.querySelector(`script[data-bmt-src="${src}"]`);
if (existing) {
return new Promise((resolve, reject) => {
if (existing.dataset.loaded === "1") resolve();
else {
existing.addEventListener("load", resolve, { once: true });
existing.addEventListener("error", reject, { once: true });
}
});
}
return new Promise((resolve, reject) => {
const script = document.createElement("script");
script.src = src;
script.dataset.bmtSrc = src;
script.addEventListener("load", () => {
script.dataset.loaded = "1";
resolve();
}, { once: true });
script.addEventListener("error", reject, { once: true });
document.body.appendChild(script);
});
}
async function openGame() {
ensureStylesheet();
rememberOpen();
const menu = document.getElementById("menu-container");
const container = document.getElementById("game-container");
if (!container) return;
window.__biblicalMatchThreeCleanup?.();
menu?.classList.add("hidden");
document.body.dataset.mode = "game";
document.body.dataset.currentGame = GAME_KEY;
container.innerHTML = '<div class="app-game-loading"><div class="app-loader__ring"></div><p>Загрузка игры...</p></div>';
window.scrollTo({ top: 0, behavior: "auto" });
try {
await loadScriptOnce(CORE_SRC, "BiblicalMatchThreeCore");
await loadScriptOnce(GAME_SRC, "startBiblicalMatchThreeGame");
if (typeof window.startBiblicalMatchThreeGame !== "function") throw new Error("start function missing");
await window.startBiblicalMatchThreeGame(LEVELS_SRC);
} catch (error) {
console.error("Biblical match-three launch error", error);
container.innerHTML = `
<section class="app-error-card fade-in">
<h2>Не удалось запустить «Три в ряд»</h2>
<p>Проверьте файлы игры и попробуйте снова.</p>
<button type="button" class="back-button" id="bmt-launch-back">В главное меню</button>
</section>`;
document.getElementById("bmt-launch-back")?.addEventListener("click", () => {
(window.appGoToMainMenu || window.goToMainMenu)?.();
}, { once: true });
}
}
function addMenuCard() {
const root = document.getElementById("kids-games");
if (!root || document.getElementById("biblical-match-three-card")) return false;
const button = document.createElement("button");
button.type = "button";
button.id = "biblical-match-three-card";
button.className = "game-card";
button.setAttribute("aria-label", `Открыть игру ${TITLE}`);
button.innerHTML = `
<span class="game-card__icon game-card__icon--image">
<img class="game-card__img" src="web/assets/biblical-match-three/bible.svg?v=1" alt="Иконка игры ${TITLE}" loading="lazy" decoding="async" draggable="false">
</span>
<span class="game-card__body">
<span class="game-card__title">${TITLE}</span>
<span class="game-card__desc">Комбинации, каскады и 10 уровней</span>
</span>`;
button.addEventListener("click", openGame);
root.appendChild(button);
return true;
}
function install() {
ensureStylesheet();
if (addMenuCard()) return;
const observer = new MutationObserver(() => {
if (addMenuCard()) observer.disconnect();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
setTimeout(() => observer.disconnect(), 12000);
}
window.openBiblicalMatchThree = openGame;
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(install), { once: true });
else requestAnimationFrame(install);
})();