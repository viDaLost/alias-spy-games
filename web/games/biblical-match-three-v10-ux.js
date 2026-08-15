(() => {
"use strict";
if (window.__bmtV10UxInstalled) return;
window.__bmtV10UxInstalled = true;
window.__bmtV9UxInstalled = true;
window.__bmtV4UxInstalled = true;
window.__bmtV3UxInstalled = true;

const VERSION = "10";
const STATIC_BASE = "web/assets/biblical-match-three";
const HQ_BASE = `${STATIC_BASE}/hq-v5/symbols`;
const svg = (name) => `${STATIC_BASE}/${name}.svg?v=${VERSION}`;
const hq = (name) => `${HQ_BASE}/${name}.webp?v=${VERSION}`;
const FALLBACK = {
  bible: svg("bible"), fish: svg("fish"), dove: svg("dove"), lamp: svg("lamp"), candle: svg("lamp"),
  crown: svg("crown"), ark: svg("ark"), bread: svg("bread"), grapes: svg("grapes"), tablets: svg("tablets")
};
const FULL_ARK = hq("ark");
const GENERIC_RX = /web\/assets\/biblical-match-three\/(bible|fish|dove|lamp|crown|ark|bread|grapes|tablets)\.svg(?:\?.*)?$/;
const IMPORTANT_NODE = ".bmt-shell,.bmt-sheet-overlay,.bmt-result-overlay,.bmt-pause-overlay,.bmt-tutorial,.bmt-map,.bmt-goals-v2,.bmt-booster-tray";

function patchArt() {
  for (const key of ["BiblicalMatchThreeV5Art", "BiblicalMatchThreeV4Art", "BiblicalMatchThreeV3Art"]) {
    const art = window[key];
    if (!art) continue;
    art.symbols ||= {};
    art.boosters ||= {};
    art.symbols.ark = FULL_ARK;
    art.boosters.ark = FULL_ARK;
  }
}
patchArt();

function artNow() { return window.BiblicalMatchThreeV5Art || window.BiblicalMatchThreeV4Art || window.BiblicalMatchThreeV3Art || {}; }
function symbolSource(id) {
  if (id === "ark") return FULL_ARK;
  const art = artNow();
  const key = id === "lamp" ? "candle" : id;
  return art.symbols?.[key] || FALLBACK[id] || FALLBACK.bible;
}
function boosterSource(id) {
  if (id === "ark") return FULL_ARK;
  const art = artNow();
  const map = { manna:"manna", lampOil:"oil", covenant:"covenant", sling:"sling", staff:"staff", jericho:"jericho" };
  const fallback = { manna:FALLBACK.bread, lampOil:FALLBACK.lamp, covenant:FALLBACK.dove, sling:FALLBACK.crown, staff:FALLBACK.tablets, jericho:FALLBACK.lamp };
  return art.boosters?.[map[id]] || fallback[id] || FALLBACK.crown;
}
function fallbackForSource(src) {
  if (/ark\.webp/i.test(src || "")) return FALLBACK.ark;
  const match = String(src || "").match(GENERIC_RX);
  return match ? (FALLBACK[match[1]] || FALLBACK.bible) : "";
}
function installImageSafety(img, fallback = "") {
  if (!(img instanceof HTMLImageElement)) return;
  if (fallback) img.dataset.bmtFallback = fallback;
  else if (!img.dataset.bmtFallback) img.dataset.bmtFallback = fallbackForSource(img.getAttribute("src") || img.currentSrc || "");
  if (img.dataset.bmtSafe === "10") return;
  img.dataset.bmtSafe = "10";
  img.decoding = "async";
  img.addEventListener("error", () => {
    const next = img.dataset.bmtFallback || fallbackForSource(img.getAttribute("src") || img.currentSrc || "");
    if (next && img.getAttribute("src") !== next) img.src = next;
  });
}
document.addEventListener("error", (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  const next = img.dataset.bmtFallback || fallbackForSource(img.getAttribute("src") || img.currentSrc || "");
  if (next && img.getAttribute("src") !== next) img.src = next;
}, true);

function replaceImages(root = document) {
  root.querySelectorAll?.('img[src*="web/assets/biblical-match-three/"]').forEach((img) => {
    const current = img.getAttribute("src") || "";
    const match = current.match(GENERIC_RX);
    if (match) {
      const id = match[1];
      const next = symbolSource(id);
      if (next && current !== next) img.src = next;
      installImageSafety(img, FALLBACK[id] || FALLBACK.bible);
    } else if (/ark\.webp/i.test(current)) installImageSafety(img, FALLBACK.ark);
    else installImageSafety(img);
  });
  root.querySelectorAll?.("[data-booster]").forEach((node) => {
    const id = node.dataset.booster;
    const img = node.querySelector("img");
    if (!img) return;
    const next = boosterSource(id);
    if (next && img.getAttribute("src") !== next) img.src = next;
    installImageSafety(img, id === "ark" ? FALLBACK.ark : "");
    const names = { sling:"Праща", staff:"Посох", jericho:"Трубы", ark:"Ковчег" };
    const label = node.querySelector(".bmt-booster__name");
    if (label && names[id]) label.textContent = names[id];
  });
}

function assetImg(src, className = "", fallback = "") {
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  if (className) img.className = className;
  installImageSafety(img, fallback);
  return img;
}
function replaceGoalIcon(node, src, fallback) {
  const icon = node.querySelector(":scope > span:first-child, .bmt-goal__icon");
  if (!icon || !src) return;
  const existing = icon.querySelector("img");
  if (existing && existing.getAttribute("src") === src) { installImageSafety(existing, fallback); return; }
  icon.replaceChildren(assetImg(src, "bmt-goal-art", fallback));
}
function enhanceGoals(root = document) {
  const art = artNow();
  root.querySelectorAll?.(".bmt-goal, .bmt-prelevel__goals > div").forEach((node) => {
    const text = (node.textContent || "").toLowerCase();
    if (text.includes("набрать") && text.includes("очк")) return replaceGoalIcon(node, art.goals?.score || symbolSource("crown"), FALLBACK.crown);
    if (text.includes("каскад")) return replaceGoalIcon(node, art.goals?.cascade || symbolSource("dove"), FALLBACK.dove);
    if (text.includes("особ") && text.includes("фишк")) return replaceGoalIcon(node, art.goals?.special || symbolSource("crown"), FALLBACK.crown);
    if (text.includes("скрижал")) return replaceGoalIcon(node, art.obstacles?.tablets || symbolSource("tablets"), FALLBACK.tablets);
    if (text.includes("цеп")) return replaceGoalIcon(node, art.obstacles?.chains || symbolSource("tablets"), FALLBACK.tablets);
    if (text.includes("зажечь") || text.includes("светильник")) return replaceGoalIcon(node, art.obstacles?.candle || symbolSource("lamp"), FALLBACK.lamp);
  });
}
function enhanceBlockers(root = document) {
  const art = artNow();
  const pairs = [
    [".bmt-blocker__tablet", art.obstacles?.tablets || symbolSource("tablets"), FALLBACK.tablets],
    [".bmt-blocker__chain", art.obstacles?.chains || symbolSource("tablets"), FALLBACK.tablets],
    [".bmt-blocker__lamp", art.obstacles?.candle || symbolSource("lamp"), FALLBACK.lamp],
  ];
  for (const [selector, src, fallback] of pairs) root.querySelectorAll?.(selector).forEach((node) => {
    let img = node.querySelector(":scope > img.bmt-blocker-art");
    if (!img) { img = assetImg(src, "bmt-blocker-art", fallback); node.prepend(img); }
    else if (img.getAttribute("src") !== src) img.src = src;
    installImageSafety(img, fallback);
  });
}

function refineCopy(root = document) {
  root.querySelectorAll?.(".bmt-tutorial p").forEach((node) => {
    if (/Коснитесь двух соседних|соберите три/i.test(node.textContent || "")) node.textContent = "Смахните фишку к соседней клетке. Обмен выполняется коротким плавным движением без перетаскивания картинки.";
  });
  const hero = root.querySelector?.(".bmt-hero-v2__copy");
  if (hero && !hero.dataset.v10Copy) {
    hero.dataset.v10Copy = "1";
    hero.innerHTML = `<span class="bmt-hero-v2__eyebrow">Библейская головоломка</span><strong>Собирайте символы и проходите Путь света</strong><span>30 уровней · адаптивное поле · быстрые свайпы · библейские бустеры</span>`;
  }
}
function chapterArt(index) { return [symbolSource("bible"), symbolSource("dove"), FULL_ARK, symbolSource("crown")][index % 4]; }
function enhanceMap(root = document) {
  const map = root.querySelector?.(".bmt-map:not([data-v10-journey])");
  if (!map) return;
  const original = [...map.children];
  if (!original.some((node) => node.classList.contains("bmt-map__chapter"))) return;
  map.dataset.v10Journey = "1";
  map.classList.add("bmt-journey", "bmt-journey-v9", "bmt-journey-v10");
  const fragment = document.createDocumentFragment();
  let section = null, path = null, chapterIndex = -1;
  for (const child of original) {
    if (child.classList.contains("bmt-map__chapter")) {
      chapterIndex += 1;
      section = document.createElement("section");
      section.className = "bmt-journey-chapter";
      section.dataset.chapter = String(chapterIndex + 1);
      const head = document.createElement("header");
      head.className = "bmt-journey-chapter__head";
      const title = child.textContent?.trim() || `Глава ${chapterIndex + 1}`;
      head.innerHTML = `<div class="bmt-journey-chapter__copy"><span>Глава ${chapterIndex + 1}</span><strong>${title}</strong></div><div class="bmt-journey-chapter__art"></div>`;
      head.querySelector(".bmt-journey-chapter__art")?.append(assetImg(chapterArt(chapterIndex), "", chapterIndex === 2 ? FALLBACK.ark : FALLBACK.bible));
      path = document.createElement("div");
      path.className = "bmt-journey-path";
      section.append(head, path);
      fragment.append(section);
    } else if (child.classList.contains("bmt-map-node") && path) {
      child.classList.add("bmt-journey-node");
      child.style.pointerEvents = "auto";
      path.append(child);
    } else if (section) section.append(child);
  }
  map.replaceChildren(fragment);
}
function reorderMenu(root = document) {
  const shell = root.querySelector?.(".bmt-menu");
  const free = shell?.querySelector(".bmt-free-panel");
  const campaign = shell?.querySelector(".bmt-campaign");
  if (shell && free && campaign && free.nextElementSibling !== campaign) shell.insertBefore(free, campaign);
}
function mountOverlays(root = document) {
  root.querySelectorAll?.(".bmt-sheet-overlay,.bmt-result-overlay,.bmt-pause-overlay,.bmt-tutorial").forEach((overlay) => {
    if (overlay.parentElement !== document.body) document.body.append(overlay);
  });
  document.documentElement.classList.toggle("bmt-modal-open", Boolean(document.querySelector(".bmt-sheet-overlay,.bmt-result-overlay,.bmt-pause-overlay,.bmt-tutorial")));
}

let fitFrame = 0;
function syncViewport() {
  const body = document.body;
  const board = document.querySelector(".bmt-board");
  body.classList.toggle("bmt-board-active", Boolean(board));
  const vv = window.visualViewport;
  const height = Math.max(320, Number(vv?.height || window.innerHeight || document.documentElement.clientHeight || 0));
  document.documentElement.style.setProperty("--bmt-viewport-height", `${height}px`);
  const tg = window.Telegram?.WebApp;
  if (tg) body.dataset.bmtTelegram = "1"; else delete body.dataset.bmtTelegram;
  const rawTop = Number(tg?.contentSafeAreaInset?.top || tg?.safeAreaInset?.top || 0);
  const top = tg ? Math.max(92, Math.min(132, rawTop || 108)) : 0;
  document.documentElement.style.setProperty("--bmt-content-top", `${top}px`);
}
function fitBoardNow() {
  fitFrame = 0;
  syncViewport();
  const board = document.querySelector(".bmt-board");
  const wrap = board?.closest(".bmt-board-wrap");
  if (!board || !wrap || !document.body.classList.contains("bmt-board-active")) return;
  const rows = Math.max(1, Number(board.dataset.rows || 8));
  const cols = Math.max(1, Number(board.dataset.cols || 8));
  const maxW = Math.max(120, wrap.clientWidth - 10);
  const maxH = Math.max(120, wrap.clientHeight - 10);
  let width = Math.min(maxW, maxH * cols / rows);
  let height = width * rows / cols;
  if (height > maxH) { height = maxH; width = height * cols / rows; }
  board.style.width = `${Math.floor(width)}px`;
  board.style.height = `${Math.floor(height)}px`;
}
function scheduleFit() {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => requestAnimationFrame(fitBoardNow));
}

let enhanceFrame = 0;
function enhance(root = document) {
  patchArt();
  replaceImages(root);
  enhanceGoals(root);
  enhanceBlockers(root);
  refineCopy(root);
  enhanceMap(root);
  reorderMenu(root);
  mountOverlays(document);
  syncViewport();
  scheduleFit();
}
function scheduleEnhance() {
  if (enhanceFrame) return;
  enhanceFrame = requestAnimationFrame(() => { enhanceFrame = 0; enhance(document); });
}
function nodeImportant(node) {
  return node?.nodeType === 1 && (node.matches?.(IMPORTANT_NODE) || node.querySelector?.(IMPORTANT_NODE));
}
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if ([...mutation.addedNodes].some(nodeImportant) || [...mutation.removedNodes].some(nodeImportant)) { scheduleEnhance(); break; }
  }
});
observer.observe(document.documentElement, { subtree:true, childList:true });

let syntheticClick = false;
let pointer = null;
let suppressClickUntil = 0;
function adjacentIndex(index, dx, dy, rows, cols) {
  const row = Math.floor(index / cols), col = index % cols;
  const nr = row + dy, nc = col + dx;
  if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return null;
  return nr * cols + nc;
}
function clearPointerVisual(state = pointer) {
  state?.tile?.classList.remove("is-swipe-dragging", "is-swipe-ready");
  pointer = null;
}
function runSyntheticSwap(a, b) {
  const source = document.querySelector(`.bmt-tile[data-index="${a}"]`);
  const target = document.querySelector(`.bmt-tile[data-index="${b}"]`);
  if (!source || !target) return;
  syntheticClick = true;
  try { source.click(); target.click(); } finally { syntheticClick = false; }
}
function onPointerDown(event) {
  const tile = event.target.closest?.(".bmt-tile");
  const board = tile?.closest?.(".bmt-board");
  if (!tile || !board || board.classList.contains("is-targeting") || tile.closest(".bmt-shell")?.classList.contains("is-busy")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  pointer = { id:event.pointerId, index:Number(tile.dataset.index), x:event.clientX, y:event.clientY, tile, board, rows:Number(board.dataset.rows || 8), cols:Number(board.dataset.cols || 8) };
  tile.setPointerCapture?.(event.pointerId);
  tile.classList.add("is-swipe-dragging");
}
function onPointerMove(event) {
  if (!pointer || event.pointerId !== pointer.id) return;
  const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
  if (Math.hypot(dx, dy) > 7) {
    pointer.tile.classList.add("is-swipe-ready");
    event.preventDefault();
  }
}
function onPointerUp(event) {
  if (!pointer || event.pointerId !== pointer.id) return;
  const state = pointer;
  const dx = event.clientX - state.x, dy = event.clientY - state.y;
  const threshold = Math.max(12, Math.min(state.tile.clientWidth || 48, state.tile.clientHeight || 48) * .20);
  if (Math.hypot(dx, dy) < threshold) { clearPointerVisual(state); return; }
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sx = horizontal ? (dx > 0 ? 1 : -1) : 0;
  const sy = horizontal ? 0 : (dy > 0 ? 1 : -1);
  const target = adjacentIndex(state.index, sx, sy, state.rows, state.cols);
  suppressClickUntil = performance.now() + 260;
  if (target == null) { state.tile.classList.add("is-swipe-edge"); setTimeout(() => state.tile.classList.remove("is-swipe-edge"), 120); clearPointerVisual(state); return; }
  runSyntheticSwap(state.index, target);
  window.dispatchEvent(new CustomEvent("bmt:swipe", { detail:{ from:state.index, to:target, rows:state.rows, cols:state.cols } }));
  clearPointerVisual(state);
}
function onPointerCancel(event) { if (pointer && (event.pointerId == null || event.pointerId === pointer.id)) clearPointerVisual(pointer); }
function onClickCapture(event) {
  const tile = event.target.closest?.(".bmt-tile");
  if (!tile || syntheticClick) return;
  const board = tile.closest(".bmt-board");
  if (board?.classList.contains("is-targeting")) {
    const active = document.querySelector(".bmt-booster.is-active")?.dataset.booster;
    if (active) window.BiblicalMatchThreeEffects?.boosterImpact?.(active, Number(tile.dataset.index));
    return;
  }
  if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
}
function onBoosterCapture(event) {
  const booster = event.target.closest?.(".bmt-booster[data-booster]");
  if (booster) window.BiblicalMatchThreeEffects?.boosterRitual?.(booster.dataset.booster, booster);
}

document.addEventListener("pointerdown", onPointerDown, { capture:true, passive:true });
document.addEventListener("pointermove", onPointerMove, { capture:true, passive:false });
document.addEventListener("pointerup", onPointerUp, { capture:true, passive:true });
document.addEventListener("pointercancel", onPointerCancel, { capture:true, passive:true });
document.addEventListener("click", onClickCapture, true);
document.addEventListener("click", onBoosterCapture, true);
window.addEventListener("resize", scheduleFit, { passive:true });
window.addEventListener("orientationchange", scheduleFit, { passive:true });
window.visualViewport?.addEventListener("resize", scheduleFit, { passive:true });
window.visualViewport?.addEventListener("scroll", scheduleFit, { passive:true });

window.BiblicalMatchThreeV10Assets = { FALLBACK, FULL_ARK, symbolSource, boosterSource };
window.BiblicalMatchThreeV9Assets = window.BiblicalMatchThreeV10Assets;
enhance(document);
})();
