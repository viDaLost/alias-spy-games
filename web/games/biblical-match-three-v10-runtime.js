(() => {
"use strict";
if (window.__bmtV10RuntimeInstalled) return;
window.__bmtV10RuntimeInstalled = true;
window.__bmtV9RuntimeInstalled = true;
window.__bmtV6RuntimeInstalled = true;

const TEST_HOST_UNLOCK = (() => {
  try {
    const url = new URL(location.href);
    return url.searchParams.get("unlockAll") === "1" || /workers\.dev$/i.test(location.hostname) || /preview/i.test(location.hostname);
  } catch { return true; }
})();
function isRootAdmin() {
  const root = String(window.APP_ROOT_ADMIN_ID || "").trim();
  if (!/^\d{5,20}$/.test(root)) return false;
  return [window.Telegram?.WebApp?.initDataUnsafe?.user?.id, window.__ANDROID_TELEGRAM_ID__]
    .some((value) => String(value ?? "").trim() === root);
}
function unlockAllLevels() { return TEST_HOST_UNLOCK || isRootAdmin(); }
const TIMED_SECONDS = 90;
const TIMED_KEY = "biblical_match_three_timed_v1";
const IMPORTANT_NODE = ".bmt-shell,.bmt-free-grid,.bmt-board,.bmt-result-overlay,.bmt-result-card,.bmt-map";
let timerHandle = null;
let timerStartedAt = 0;
let timedFinishing = false;
let enhanceFrame = 0;

function userId() {
  try { return String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? "anon"); } catch { return "anon"; }
}
function timedStorageKey() { return `${TIMED_KEY}_${userId()}`; }
function loadTimedStats() {
  try {
    const data = JSON.parse(localStorage.getItem(timedStorageKey()) || "{}");
    return {
      bestScore: Math.max(0, Number(data.bestScore || 0)),
      games: Math.max(0, Number(data.games || 0)),
      bestCascade: Math.max(1, Number(data.bestCascade || 1)),
      bestSpecials: Math.max(0, Number(data.bestSpecials || 0))
    };
  } catch { return { bestScore:0, games:0, bestCascade:1, bestSpecials:0 }; }
}
function saveTimedStats(metrics = {}) {
  const stats = loadTimedStats();
  const score = Math.max(0, Number(metrics.score || 0));
  stats.bestScore = Math.max(stats.bestScore, score);
  stats.bestCascade = Math.max(stats.bestCascade, Number(metrics.maxCascade || 1));
  stats.bestSpecials = Math.max(stats.bestSpecials, Number(metrics.specialsActivated || 0));
  if (metrics.countGame) stats.games += 1;
  try { localStorage.setItem(timedStorageKey(), JSON.stringify(stats)); } catch {}
  return stats;
}
function parseNumber(text) { return Number(String(text || "0").replace(/[^0-9]/g, "")) || 0; }
function formatTime(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`;
}
function clearTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  timerStartedAt = 0;
}

function patchProgress() {
  const P = window.BiblicalMatchThreeProgress;
  if (!P || P.__v10Patched) return;
  P.__v10Patched = true;
  const originalLoad = P.load.bind(P);
  P.load = function() {
    const progress = originalLoad();
    if (unlockAllLevels()) progress.unlocked = Math.max(Number(progress.unlocked || 1), 999);
    return progress;
  };
  const originalBegin = P.beginFreeRun.bind(P);
  P.beginFreeRun = function(progress, mode) {
    if (window.__bmtTimedRequested && mode === "medium") {
      saveTimedStats({ countGame:true });
      return progress;
    }
    return originalBegin(progress, mode);
  };
  const originalRecord = P.recordFree.bind(P);
  P.recordFree = function(progress, mode, metrics = {}) {
    if ((window.__bmtTimedRequested || window.__bmtTimedActive) && mode === "medium") {
      const before = loadTimedStats();
      const stats = saveTimedStats(metrics);
      return { progress, stats, isRecord:Number(metrics.score || 0) > before.bestScore, awarded:0, balance:P.getStars(), nextMilestone:Infinity };
    }
    return originalRecord(progress, mode, metrics);
  };
}
function renameGame(root = document) {
  root.querySelectorAll?.(".bmt-title").forEach((node) => {
    if ((node.textContent || "").trim() === "Три в ряд") node.textContent = "Библейские сокровища";
  });
  const hero = root.querySelector?.(".bmt-hero-v2__copy strong");
  if (hero && /Собирайте|символ/i.test(hero.textContent || "")) hero.textContent = "Собирайте библейские сокровища и проходите Путь света";
}
function unlockMap(root = document) {
  if (!unlockAllLevels()) return;
  root.querySelectorAll?.(".bmt-map-node,.bmt-journey-node").forEach((node) => {
    node.disabled = false;
    node.removeAttribute("disabled");
    node.classList.remove("is-locked");
  });
}
function createTimedCard(grid) {
  if (!grid || grid.querySelector('[data-v10-timed="1"],[data-v9-timed="1"],[data-v6-timed="1"]')) return;
  const stats = loadTimedStats();
  const card = document.createElement("button");
  card.type = "button";
  card.className = "bmt-free-card bmt-free-card--blue";
  card.dataset.v10Timed = "1";
  card.dataset.v9Timed = "1";
  card.dataset.v6Timed = "1";
  card.innerHTML = `
    <span class="bmt-free-card__mode">На время</span>
    <strong>${stats.bestScore.toLocaleString("ru-RU")}</strong>
    <span class="bmt-free-card__record">лучший счёт · 90 сек.</span>
    <div class="bmt-free-card__meta"><span>⏱ 01:30</span><span>↯ ×${stats.bestCascade}</span><span>▶ ${stats.games}</span></div>
    <span class="bmt-free-card__cta">Играть →</span>`;
  card.addEventListener("click", () => {
    window.__bmtTimedRequested = true;
    window.__bmtTimedActive = false;
    timedFinishing = false;
    const medium = [...grid.querySelectorAll(".bmt-free-card")].find((node) => node !== card && /Средний/i.test(node.querySelector(".bmt-free-card__mode")?.textContent || ""));
    medium?.click();
  });
  grid.append(card);
}
function enhanceMenu(root = document) {
  const grid = root.querySelector?.(".bmt-free-grid");
  if (!grid) return false;
  if (window.__bmtTimedActive && !root.querySelector(".bmt-board")) {
    clearTimer();
    window.__bmtTimedActive = false;
    window.__bmtTimedRequested = false;
    timedFinishing = false;
  }
  createTimedCard(grid);
  unlockMap(root);
  renameGame(root);
  return true;
}
function updateTimedHud() {
  if (!window.__bmtTimedActive) return;
  const stats = document.querySelector(".bmt-stats-v2");
  const move = document.getElementById("bmt-moves");
  const middle = move?.closest("div");
  if (middle) {
    const label = middle.querySelector("span");
    const small = middle.querySelector("small");
    if (label) label.textContent = "Время";
    if (small) small.textContent = "осталось";
  }
  const kicker = document.querySelector(".bmt-gamebar .bmt-kicker");
  const title = document.querySelector(".bmt-gamebar .bmt-title");
  if (kicker) kicker.textContent = "Свободная игра · На время";
  if (title) title.textContent = "Библейские сокровища";
  const left = Math.max(0, TIMED_SECONDS - (Date.now() - timerStartedAt) / 1000);
  if (move) move.textContent = formatTime(left);
  stats?.classList.toggle("is-time-critical", left <= 10);
  if (left <= 0 && !timedFinishing) finishTimedRun();
}
function startTimedBoard() {
  if (!window.__bmtTimedRequested || window.__bmtTimedActive) return;
  const board = document.querySelector(".bmt-board");
  if (!board) return;
  window.__bmtTimedActive = true;
  timedFinishing = false;
  clearTimer();
  timerStartedAt = Date.now();
  updateTimedHud();
  timerHandle = setInterval(updateTimedHud, 500);
}
function finishTimedRun() {
  if (timedFinishing) return;
  timedFinishing = true;
  clearTimer();
  const score = parseNumber(document.getElementById("bmt-score")?.textContent);
  const cascade = parseNumber(document.getElementById("bmt-cascade")?.textContent) || 1;
  const specials = parseNumber(document.getElementById("bmt-special-count")?.textContent);
  saveTimedStats({ score, maxCascade:cascade, specialsActivated:specials });
  const finish = [...document.querySelectorAll(".bmt-actions-v2 .bmt-action-button")].find((node) => /Завершить/i.test(node.textContent || ""));
  finish?.click();
  setTimeout(() => {
    const eyebrow = document.querySelector(".bmt-result-card__eyebrow");
    if (eyebrow) eyebrow.textContent = "Время вышло";
  }, 20);
}
function enhanceResult(root = document) {
  if (!window.__bmtTimedActive) return;
  const card = root.querySelector?.(".bmt-result-card");
  if (!card) return;
  const eyebrow = card.querySelector(".bmt-result-card__eyebrow");
  if (eyebrow && timedFinishing) eyebrow.textContent = "Время вышло";
  const replay = [...card.querySelectorAll("button")].find((node) => /Играть ещё/i.test(node.textContent || ""));
  if (replay && !replay.dataset.v10Timed) {
    replay.dataset.v10Timed = "1";
    replay.addEventListener("click", () => {
      window.__bmtTimedRequested = true;
      window.__bmtTimedActive = false;
      timedFinishing = false;
    }, { capture:true });
  }
}
function enhance(root = document) {
  patchProgress();
  renameGame(root);
  unlockMap(root);
  enhanceMenu(root);
  if (window.__bmtTimedRequested) startTimedBoard();
  if (window.__bmtTimedActive) { updateTimedHud(); enhanceResult(root); }
}
function scheduleEnhance() {
  if (enhanceFrame) return;
  enhanceFrame = requestAnimationFrame(() => { enhanceFrame = 0; enhance(document); });
}
function nodeImportant(node) {
  return node?.nodeType === 1 && (node.matches?.(IMPORTANT_NODE) || node.querySelector?.(IMPORTANT_NODE));
}

patchProgress();
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if ([...mutation.addedNodes].some(nodeImportant) || [...mutation.removedNodes].some(nodeImportant)) { scheduleEnhance(); break; }
  }
});
observer.observe(document.documentElement, { childList:true, subtree:true });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => enhance(document), { once:true }); else enhance(document);
window.BiblicalMatchThreeV10 = { enhance, testUnlock:TEST_HOST_UNLOCK, unlockAllLevels, isRootAdmin, timedSeconds:TIMED_SECONDS };
window.BiblicalMatchThreeV9 = window.BiblicalMatchThreeV10;
window.BiblicalMatchThreeV6 = window.BiblicalMatchThreeV10;
})();
