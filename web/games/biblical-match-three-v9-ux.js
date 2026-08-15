(() => {
"use strict";
if (window.__bmtV9UxInstalled) return;
window.__bmtV9UxInstalled = true;
window.__bmtV4UxInstalled = true;
window.__bmtV3UxInstalled = true;

const VERSION = "9";
const STATIC_BASE = "web/assets/biblical-match-three";
const staticAsset = (name) => `${STATIC_BASE}/${name}.svg?v=${VERSION}`;
const FALLBACK = {
  bible: staticAsset("bible"), fish: staticAsset("fish"), dove: staticAsset("dove"), lamp: staticAsset("lamp"), candle: staticAsset("lamp"),
  crown: staticAsset("crown"), ark: staticAsset("ark"), bread: staticAsset("bread"), grapes: staticAsset("grapes"), tablets: staticAsset("tablets")
};

function patchArt() {
  for (const key of ["BiblicalMatchThreeV5Art", "BiblicalMatchThreeV4Art", "BiblicalMatchThreeV3Art"]) {
    const art = window[key];
    if (!art) continue;
    art.symbols ||= {};
    art.boosters ||= {};
    // iOS/WKWebView was intermittently failing the cropped blob URL for the Ark tile.
    // Keep this symbol on a normal same-origin URL so it can never render as a broken image.
    art.symbols.ark = FALLBACK.ark;
    art.boosters.ark = FALLBACK.ark;
  }
}
patchArt();

const ART = window.BiblicalMatchThreeV5Art || window.BiblicalMatchThreeV4Art || window.BiblicalMatchThreeV3Art || {};
const SYMBOLS = {
  bible: ART.symbols?.bible || FALLBACK.bible,
  fish: ART.symbols?.fish || FALLBACK.fish,
  dove: ART.symbols?.dove || FALLBACK.dove,
  lamp: ART.symbols?.candle || FALLBACK.lamp,
  crown: ART.symbols?.crown || FALLBACK.crown,
  ark: FALLBACK.ark,
  bread: ART.symbols?.bread || FALLBACK.bread,
  grapes: ART.symbols?.grapes || FALLBACK.grapes,
  tablets: ART.symbols?.tablets || FALLBACK.tablets,
};
const BOOSTERS = {
  manna: ART.boosters?.manna || FALLBACK.bread,
  lampOil: ART.boosters?.oil || FALLBACK.lamp,
  covenant: ART.boosters?.covenant || FALLBACK.dove,
  sling: ART.boosters?.sling || FALLBACK.crown,
  staff: ART.boosters?.staff || FALLBACK.tablets,
  jericho: ART.boosters?.jericho || FALLBACK.lamp,
  ark: FALLBACK.ark,
};
const GOALS = { score: ART.goals?.score || FALLBACK.crown, cascade: ART.goals?.cascade || FALLBACK.dove, special: ART.goals?.special || FALLBACK.crown };
const OBSTACLES = { tablet: ART.obstacles?.tablets || FALLBACK.tablets, chain: ART.obstacles?.chains || FALLBACK.tablets, lamp: ART.obstacles?.candle || FALLBACK.lamp };
const SHORT_BOOSTER = { sling: "Праща", staff: "Посох", jericho: "Трубы", ark: "Ковчег" };
const GENERIC_RX = /web\/assets\/biblical-match-three\/(bible|fish|dove|lamp|crown|ark|bread|grapes|tablets)\.svg(?:\?.*)?$/;

const reverseFallback = new Map();
for (const [id, src] of Object.entries(SYMBOLS)) reverseFallback.set(String(src), FALLBACK[id] || FALLBACK[id === "lamp" ? "lamp" : id]);
for (const [id, src] of Object.entries(BOOSTERS)) reverseFallback.set(String(src), id === "ark" ? FALLBACK.ark : (FALLBACK[id] || FALLBACK.crown));

function assetImg(src, className = "", fallback = "") {
  const img = document.createElement("img");
  img.src = src || fallback || FALLBACK.bible;
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  if (className) img.className = className;
  if (fallback) img.dataset.bmtFallback = fallback;
  return img;
}

function installImageSafety(img) {
  if (!(img instanceof HTMLImageElement) || img.dataset.bmtSafe === "1") return;
  img.dataset.bmtSafe = "1";
  const current = img.getAttribute("src") || "";
  const match = current.match(GENERIC_RX);
  if (match) img.dataset.bmtFallback = FALLBACK[match[1]] || FALLBACK.bible;
  else {
    for (const [src, fallback] of reverseFallback) {
      if (src && (current === src || img.src === src)) { img.dataset.bmtFallback = fallback; break; }
    }
  }
  img.addEventListener("error", () => {
    const fallback = img.dataset.bmtFallback || (/(?:^|\/)ark(?:\.|\?|$)/i.test(img.currentSrc || img.src || "") ? FALLBACK.ark : "");
    if (fallback && img.getAttribute("src") !== fallback) img.src = fallback;
  });
}

document.addEventListener("error", (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  const current = img.getAttribute("src") || "";
  let fallback = img.dataset.bmtFallback || "";
  if (!fallback) {
    const match = current.match(GENERIC_RX);
    if (match) fallback = FALLBACK[match[1]] || "";
    if (!fallback && /(?:^|\/)ark(?:\.|\?|$)/i.test(current)) fallback = FALLBACK.ark;
  }
  if (fallback && current !== fallback) img.src = fallback;
}, true);

function replaceGenericImages(root = document) {
  root.querySelectorAll?.('img[src*="web/assets/biblical-match-three/"]').forEach((img) => {
    const current = img.getAttribute("src") || "";
    const match = current.match(GENERIC_RX);
    if (match) {
      const key = match[1];
      const next = key === "ark" ? FALLBACK.ark : SYMBOLS[key];
      if (next && current !== next) img.src = next;
      img.dataset.bmtFallback = FALLBACK[key] || FALLBACK.bible;
    }
    installImageSafety(img);
  });
  root.querySelectorAll?.("img").forEach(installImageSafety);
}

function replaceBoosterImages(root = document) {
  root.querySelectorAll?.("[data-booster]").forEach((node) => {
    const id = node.dataset.booster;
    const img = node.querySelector("img");
    const src = BOOSTERS[id];
    if (img && src && img.getAttribute("src") !== src) img.src = src;
    if (img) { img.dataset.bmtFallback = id === "ark" ? FALLBACK.ark : (FALLBACK[id] || FALLBACK.crown); installImageSafety(img); }
    const name = node.querySelector(".bmt-booster__name");
    if (name && SHORT_BOOSTER[id]) name.textContent = SHORT_BOOSTER[id];
  });
}

function replaceGoalIcon(node, src, fallback) {
  const icon = node.querySelector(":scope > span:first-child, .bmt-goal__icon");
  if (!icon || !src) return;
  const existing = icon.querySelector("img");
  if (existing && existing.getAttribute("src") === src) { existing.dataset.bmtFallback = fallback || ""; installImageSafety(existing); return; }
  icon.replaceChildren(assetImg(src, "bmt-goal-art", fallback));
}

function enhanceGoalIcons(root = document) {
  root.querySelectorAll?.(".bmt-goal, .bmt-prelevel__goals > div").forEach((node) => {
    const text = (node.textContent || "").toLowerCase();
    if (text.includes("набрать") && text.includes("очк")) return replaceGoalIcon(node, GOALS.score, FALLBACK.crown);
    if (text.includes("каскад")) return replaceGoalIcon(node, GOALS.cascade, FALLBACK.dove);
    if (text.includes("особ") && text.includes("фишк")) return replaceGoalIcon(node, GOALS.special, FALLBACK.crown);
    if (text.includes("скрижал")) return replaceGoalIcon(node, OBSTACLES.tablet, FALLBACK.tablets);
    if (text.includes("цеп")) return replaceGoalIcon(node, OBSTACLES.chain, FALLBACK.tablets);
    if (text.includes("зажечь") || text.includes("светильник")) return replaceGoalIcon(node, OBSTACLES.lamp, FALLBACK.lamp);
  });
}

function enhanceObstacles(root = document) {
  const pairs = [[".bmt-blocker__tablet", OBSTACLES.tablet, FALLBACK.tablets],[".bmt-blocker__chain", OBSTACLES.chain, FALLBACK.tablets],[".bmt-blocker__lamp", OBSTACLES.lamp, FALLBACK.lamp]];
  for (const [selector, src, fallback] of pairs) {
    root.querySelectorAll?.(selector).forEach((node) => {
      let img = node.querySelector(":scope > img.bmt-blocker-art");
      if (!img) { img = assetImg(src, "bmt-blocker-art", fallback); node.prepend(img); }
      else if (img.getAttribute("src") !== src) img.src = src;
      img.dataset.bmtFallback = fallback;
      installImageSafety(img);
    });
  }
}

function refineCopy(root = document) {
  root.querySelectorAll?.(".bmt-tutorial p").forEach((node) => {
    if (/Коснитесь двух соседних|соберите три/i.test(node.textContent || "")) node.textContent = "Смахните фишку в сторону соседней клетки. Двигайте коротко и уверенно — поле сразу покажет направление обмена.";
  });
  root.querySelectorAll?.(".bmt-tutorial h3").forEach((node) => {
    if (/Соберите три одинаковых/i.test(node.textContent || "")) node.textContent = "Соберите три одинаковых символа свайпом";
  });
  const hero = root.querySelector?.(".bmt-hero-v2__copy");
  if (hero && !hero.dataset.v9Copy) {
    hero.dataset.v9Copy = "1";
    hero.innerHTML = `<span class="bmt-hero-v2__eyebrow">Библейская головоломка</span><strong>Собирайте символы и проходите Путь света</strong><span>30 уровней · разные размеры поля · бустеры · быстрые свайпы</span>`;
  }
}

function chapterArt(index) {
  return [SYMBOLS.bible, SYMBOLS.dove, SYMBOLS.ark, SYMBOLS.crown][index % 4];
}

function enhanceMap(root = document) {
  const map = root.querySelector?.(".bmt-map:not([data-v9-journey])");
  if (!map) return;
  const original = [...map.children];
  if (!original.some((node) => node.classList.contains("bmt-map__chapter"))) return;
  map.dataset.v9Journey = "1";
  map.classList.add("bmt-journey", "bmt-journey-v9");
  const fragment = document.createDocumentFragment();
  let section = null;
  let path = null;
  let chapterIndex = -1;
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
      child.remove();
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

let scheduled = false;
function enhance(root = document) {
  patchArt();
  replaceGenericImages(root);
  replaceBoosterImages(root);
  enhanceGoalIcons(root);
  enhanceObstacles(root);
  refineCopy(root);
  enhanceMap(root);
  reorderMenu(root);
  mountOverlays(document);
}
function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; enhance(document); });
}

let syntheticClick = false;
let pointer = null;
let dragFrame = 0;
let suppressClickUntil = 0;

function boardDimensions(tile) {
  const board = tile?.closest?.(".bmt-board");
  return { board, rows: Math.max(1, Number(board?.dataset.rows || 8)), cols: Math.max(1, Number(board?.dataset.cols || 8)) };
}
function adjacentIndex(index, dx, dy, rows, cols) {
  const row = Math.floor(index / cols), col = index % cols;
  const nextRow = row + dy, nextCol = col + dx;
  if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) return null;
  return nextRow * cols + nextCol;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function clearDragVisuals() {
  if (dragFrame) cancelAnimationFrame(dragFrame);
  dragFrame = 0;
  if (!pointer) return;
  pointer.tile?.classList.remove("is-swipe-dragging");
  pointer.tile?.style.removeProperty("--bmt-drag-x");
  pointer.tile?.style.removeProperty("--bmt-drag-y");
  pointer.previewTile?.classList.remove("is-swipe-preview");
  pointer.previewTile?.style.removeProperty("--bmt-preview-x");
  pointer.previewTile?.style.removeProperty("--bmt-preview-y");
  pointer.previewTile = null;
}

function applyDragFrame() {
  dragFrame = 0;
  if (!pointer) return;
  const dx = pointer.currentX - pointer.x;
  const dy = pointer.currentY - pointer.y;
  const rect = pointer.tile.getBoundingClientRect();
  const cell = Math.max(20, Math.min(rect.width, rect.height));
  const max = Math.min(30, cell * 0.34);
  pointer.tile.style.setProperty("--bmt-drag-x", `${clamp(dx, -max, max)}px`);
  pointer.tile.style.setProperty("--bmt-drag-y", `${clamp(dy, -max, max)}px`);

  if (pointer.previewTile) {
    pointer.previewTile.classList.remove("is-swipe-preview");
    pointer.previewTile.style.removeProperty("--bmt-preview-x");
    pointer.previewTile.style.removeProperty("--bmt-preview-y");
    pointer.previewTile = null;
  }
  if (Math.hypot(dx, dy) < 8) return;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sx = horizontal ? (dx > 0 ? 1 : -1) : 0;
  const sy = horizontal ? 0 : (dy > 0 ? 1 : -1);
  const targetIndex = adjacentIndex(pointer.index, sx, sy, pointer.rows, pointer.cols);
  if (targetIndex == null) return;
  const target = pointer.board.querySelector(`.bmt-tile[data-index="${targetIndex}"]`);
  if (!target) return;
  const nudge = Math.min(10, cell * 0.16);
  target.classList.add("is-swipe-preview");
  target.style.setProperty("--bmt-preview-x", `${-sx * nudge}px`);
  target.style.setProperty("--bmt-preview-y", `${-sy * nudge}px`);
  pointer.previewTile = target;
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
  if (!tile) return;
  const shell = tile.closest(".bmt-shell");
  const { board, rows, cols } = boardDimensions(tile);
  if (!board || board.classList.contains("is-targeting") || shell?.classList.contains("is-busy")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  pointer = { id: event.pointerId, index: Number(tile.dataset.index), x: event.clientX, y: event.clientY, currentX: event.clientX, currentY: event.clientY, tile, board, rows, cols, moved: false, previewTile: null };
  tile.setPointerCapture?.(event.pointerId);
  tile.classList.add("is-swipe-dragging");
}
function onPointerMove(event) {
  if (!pointer || event.pointerId !== pointer.id) return;
  pointer.currentX = event.clientX;
  pointer.currentY = event.clientY;
  const dx = pointer.currentX - pointer.x, dy = pointer.currentY - pointer.y;
  if (Math.hypot(dx, dy) > 5) pointer.moved = true;
  if (!dragFrame) dragFrame = requestAnimationFrame(applyDragFrame);
  if (pointer.moved) event.preventDefault();
}
function onPointerUp(event) {
  if (!pointer || event.pointerId !== pointer.id) return;
  const state = pointer;
  const dx = event.clientX - state.x, dy = event.clientY - state.y;
  const rect = state.tile.getBoundingClientRect();
  const threshold = Math.max(12, Math.min(rect.width, rect.height) * 0.18);
  clearDragVisuals();
  pointer = null;
  if (Math.hypot(dx, dy) < threshold) return;
  suppressClickUntil = performance.now() + 300;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const stepX = horizontal ? (dx > 0 ? 1 : -1) : 0;
  const stepY = horizontal ? 0 : (dy > 0 ? 1 : -1);
  const target = adjacentIndex(state.index, stepX, stepY, state.rows, state.cols);
  if (target == null) {
    state.tile.classList.add("is-swipe-edge");
    setTimeout(() => state.tile.classList.remove("is-swipe-edge"), 160);
    return;
  }
  const targetTile = state.board.querySelector(`.bmt-tile[data-index="${target}"]`);
  state.tile.classList.add("is-swipe-committing");
  targetTile?.classList.add("is-swipe-receiving");
  setTimeout(() => { state.tile.classList.remove("is-swipe-committing"); targetTile?.classList.remove("is-swipe-receiving"); }, 180);
  window.BiblicalMatchThreeEffects?.swipeIntent?.(state.index, target);
  window.dispatchEvent(new CustomEvent("bmt:swipe", { detail: { from: state.index, to: target, rows: state.rows, cols: state.cols } }));
  runSyntheticSwap(state.index, target);
}
function onPointerCancel(event) {
  if (!pointer || (event?.pointerId != null && event.pointerId !== pointer.id)) return;
  clearDragVisuals();
  pointer = null;
}
function onClickCapture(event) {
  const tile = event.target.closest?.(".bmt-tile");
  if (!tile || syntheticClick) return;
  const board = tile.closest(".bmt-board");
  if (board?.classList.contains("is-targeting")) {
    const active = document.querySelector(".bmt-booster.is-active")?.dataset.booster;
    if (active) window.BiblicalMatchThreeEffects?.boosterImpact?.(active, Number(tile.dataset.index));
    return;
  }
  if (performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
function onBoosterCapture(event) {
  const booster = event.target.closest?.(".bmt-booster[data-booster]");
  if (booster) window.BiblicalMatchThreeEffects?.boosterRitual?.(booster.dataset.booster, booster);
}

const observer = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.addedNodes.length || mutation.removedNodes.length)) scheduleEnhance();
});
observer.observe(document.documentElement, { subtree: true, childList: true });

document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
document.addEventListener("pointerup", onPointerUp, { capture: true, passive: true });
document.addEventListener("pointercancel", onPointerCancel, { capture: true, passive: true });
document.addEventListener("click", onClickCapture, true);
document.addEventListener("click", onBoosterCapture, true);

window.BiblicalMatchThreeV9Assets = { SYMBOLS, BOOSTERS, GOALS, OBSTACLES, FALLBACK };
window.BiblicalMatchThreeV5Assets = window.BiblicalMatchThreeV9Assets;
window.BiblicalMatchThreeV4Assets = window.BiblicalMatchThreeV9Assets;
enhance(document);
})();
