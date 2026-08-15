(() => {
"use strict";

const ART = window.BiblicalMatchThreeV3Art || {};
const SYMBOLS = {
  bible: ART.symbols?.bible, fish: ART.symbols?.fish, dove: ART.symbols?.dove, lamp: ART.symbols?.candle,
  crown: ART.symbols?.crown, ark: ART.symbols?.ark, bread: ART.symbols?.bread, grapes: ART.symbols?.grapes, tablets: ART.symbols?.tablets,
};
const BOOSTERS = {
  manna: ART.boosters?.manna, lampOil: ART.boosters?.oil, covenant: ART.boosters?.covenant,
  sling: ART.boosters?.sling, staff: ART.boosters?.staff, jericho: ART.boosters?.jericho, ark: ART.boosters?.ark,
};
const GOALS = { score: ART.goals?.score, cascade: ART.goals?.cascade, special: ART.goals?.special };
const OBSTACLES = { tablet: ART.obstacles?.tablets, chain: ART.obstacles?.chains, lamp: ART.obstacles?.candle };
const GENERIC_RX = /web\/assets\/biblical-match-three\/(bible|fish|dove|lamp|crown|ark|bread|grapes|tablets)\.svg(?:\?.*)?$/;
let observer = null;
let scheduled = false;
let syntheticClick = false;
let pointer = null;
let suppressClickUntil = 0;

function assetImg(src, className = "") {
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  if (className) img.className = className;
  return img;
}

function replaceGenericImages(root = document) {
  root.querySelectorAll?.('img[src*="web/assets/biblical-match-three/"]').forEach((img) => {
    const current = img.getAttribute("src") || "";
    const match = current.match(GENERIC_RX);
    if (match && SYMBOLS[match[1]] && current !== SYMBOLS[match[1]]) img.src = SYMBOLS[match[1]];
  });
  const hero = root.querySelector?.(".bmt-hero-v2__icon img");
  if (hero) hero.src = SYMBOLS.bible;
}

function replaceBoosterImages(root = document) {
  root.querySelectorAll?.("[data-booster]").forEach((node) => {
    const src = BOOSTERS[node.dataset.booster];
    const img = node.querySelector("img");
    if (src && img && img.getAttribute("src") !== src) img.src = src;
  });
  root.querySelectorAll?.(".bmt-prebooster").forEach((node) => {
    const label = node.querySelector("strong")?.textContent || "";
    let src = null;
    if (label.includes("Манна")) src = BOOSTERS.manna;
    else if (label.includes("Масло")) src = BOOSTERS.lampOil;
    else if (label.includes("Радуга")) src = BOOSTERS.covenant;
    const img = node.querySelector("img");
    if (src && img && img.getAttribute("src") !== src) img.src = src;
  });
}

function replaceGoalIcon(node, src) {
  const icon = node.querySelector(":scope > span:first-child, .bmt-goal__icon");
  if (!icon || !src || icon.querySelector(`img[src="${src}"]`)) return;
  icon.replaceChildren(assetImg(src, "bmt-goal-art"));
}

function enhanceGoalIcons(root = document) {
  root.querySelectorAll?.(".bmt-goal, .bmt-prelevel__goals > div").forEach((node) => {
    const text = (node.textContent || "").toLowerCase();
    if (text.includes("набрать") && text.includes("очк")) return replaceGoalIcon(node, GOALS.score);
    if (text.includes("каскад")) return replaceGoalIcon(node, GOALS.cascade);
    if (text.includes("особ") && text.includes("фишк")) return replaceGoalIcon(node, GOALS.special);
    if (text.includes("скрижал")) return replaceGoalIcon(node, OBSTACLES.tablet);
    if (text.includes("цеп")) return replaceGoalIcon(node, OBSTACLES.chain);
    if (text.includes("зажечь") || text.includes("светильник")) return replaceGoalIcon(node, OBSTACLES.lamp);
  });
}

function enhanceCopy(root = document) {
  root.querySelectorAll?.(".bmt-tutorial p").forEach((node) => {
    if ((node.textContent || "").includes("Коснитесь двух соседних фишек")) {
      node.textContent = "Проведите фишку свайпом вверх, вниз, влево или вправо. Четыре и пять в ряд создают особые фишки.";
    }
  });
  root.querySelectorAll?.(".bmt-tutorial h3").forEach((node) => {
    if ((node.textContent || "").includes("Соберите три одинаковых")) node.textContent = "Соберите три одинаковых символа свайпом";
  });
}

function removeDaily(root = document) {
  root.querySelectorAll?.(".bmt-daily").forEach((node) => node.remove());
}

function journeySvg() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("bmt-journey-route");
  svg.setAttribute("viewBox", "0 0 360 1100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const glow = document.createElementNS(ns, "path");
  glow.setAttribute("d", "M180 0 C68 80 78 165 180 220 S292 362 180 440 S68 582 180 660 S292 802 180 880 S68 1020 180 1100");
  glow.setAttribute("class", "bmt-journey-route__glow");
  const line = glow.cloneNode(); line.setAttribute("class", "bmt-journey-route__line");
  svg.append(glow, line);
  return svg;
}

function chapterArt(index) {
  return [SYMBOLS.bible, SYMBOLS.dove, SYMBOLS.ark, SYMBOLS.crown][index % 4];
}

function enhanceMap(root = document) {
  const map = root.querySelector?.(".bmt-map:not([data-journey-enhanced])");
  if (!map) return;
  const original = [...map.children];
  if (!original.some((node) => node.classList.contains("bmt-map__chapter"))) return;
  map.dataset.journeyEnhanced = "1";
  map.classList.add("bmt-journey");
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
      const chapterImage = chapterArt(chapterIndex);
      if (chapterImage) head.querySelector(".bmt-journey-chapter__art").append(assetImg(chapterImage));
      path = document.createElement("div");
      path.className = "bmt-journey-path";
      path.append(journeySvg());
      section.append(head, path);
      fragment.append(section);
      child.remove();
    } else if (child.classList.contains("bmt-map-node") && path) {
      child.classList.add("bmt-journey-node");
      const body = child.querySelector(".bmt-map-node__body");
      if (body) {
        const stars = body.querySelector("span")?.textContent || "";
        body.dataset.stars = stars;
      }
      path.append(child);
    } else if (section) {
      section.append(child);
    }
  }
  map.replaceChildren(fragment);
}

function reorderMenu(root = document) {
  const shell = root.querySelector?.(".bmt-menu");
  const free = shell?.querySelector(".bmt-free-panel");
  const campaign = shell?.querySelector(".bmt-campaign");
  if (shell && free && campaign && free.nextElementSibling !== campaign) shell.insertBefore(free, campaign);
}

function enhance(root = document) {
  removeDaily(root);
  replaceGenericImages(root);
  replaceBoosterImages(root);
  enhanceGoalIcons(root);
  enhanceCopy(root);
  reorderMenu(root);
  enhanceMap(root);
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; enhance(document); });
}

function clearDrag() {
  if (!pointer) return;
  pointer.tile?.classList.remove("is-swipe-dragging");
  pointer.tile?.style.removeProperty("--bmt-drag-x");
  pointer.tile?.style.removeProperty("--bmt-drag-y");
  pointer = null;
}

function adjacentIndex(index, dx, dy) {
  const row = Math.floor(index / 8); const col = index % 8;
  const nextRow = row + dy; const nextCol = col + dx;
  if (nextRow < 0 || nextRow >= 8 || nextCol < 0 || nextCol >= 8) return null;
  return nextRow * 8 + nextCol;
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
  if (!tile || document.querySelector(".bmt-board.is-targeting")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  pointer = { id: event.pointerId, index: Number(tile.dataset.index), x: event.clientX, y: event.clientY, tile, moved: false };
  tile.setPointerCapture?.(event.pointerId);
  tile.classList.add("is-swipe-dragging");
}

function onPointerMove(event) {
  if (!pointer || event.pointerId !== pointer.id) return;
  const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y;
  if (Math.hypot(dx, dy) > 5) pointer.moved = true;
  const rect = pointer.tile.getBoundingClientRect();
  const max = Math.max(12, Math.min(rect.width, rect.height) * 0.34);
  pointer.tile.style.setProperty("--bmt-drag-x", `${Math.max(-max, Math.min(max, dx))}px`);
  pointer.tile.style.setProperty("--bmt-drag-y", `${Math.max(-max, Math.min(max, dy))}px`);
  if (pointer.moved) event.preventDefault();
}

function onPointerUp(event) {
  if (!pointer || event.pointerId !== pointer.id) return;
  const state = pointer;
  const dx = event.clientX - state.x; const dy = event.clientY - state.y;
  clearDrag();
  const distance = Math.hypot(dx, dy);
  suppressClickUntil = performance.now() + 450;
  if (distance < 14) return;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const stepX = horizontal ? (dx > 0 ? 1 : -1) : 0;
  const stepY = horizontal ? 0 : (dy > 0 ? 1 : -1);
  const target = adjacentIndex(state.index, stepX, stepY);
  if (target == null) {
    state.tile.classList.add("is-swipe-edge");
    setTimeout(() => state.tile.classList.remove("is-swipe-edge"), 220);
    return;
  }
  window.BiblicalMatchThreeEffects?.swipeIntent?.(state.index, target);
  window.dispatchEvent(new CustomEvent("bmt:swipe", { detail: { from: state.index, to: target } }));
  runSyntheticSwap(state.index, target);
}

function onClickCapture(event) {
  const tile = event.target.closest?.(".bmt-tile");
  if (!tile || syntheticClick) return;
  if (event.detail === 0) return;
  const board = tile.closest(".bmt-board");
  if (board?.classList.contains("is-targeting")) {
    const active = document.querySelector(".bmt-booster.is-active")?.dataset.booster;
    if (active) window.BiblicalMatchThreeEffects?.boosterImpact?.(active, Number(tile.dataset.index));
    return;
  }
  if (performance.now() < suppressClickUntil || event.isTrusted) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function onBoosterCapture(event) {
  const booster = event.target.closest?.(".bmt-booster[data-booster]");
  if (!booster) return;
  window.BiblicalMatchThreeEffects?.boosterRitual?.(booster.dataset.booster, booster);
}

function install() {
  if (window.__bmtV3UxInstalled) return;
  window.__bmtV3UxInstalled = true;
  document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
  document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
  document.addEventListener("pointerup", onPointerUp, { capture: true, passive: false });
  document.addEventListener("pointercancel", clearDrag, { capture: true });
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("click", onBoosterCapture, true);
  observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "class"] });
  enhance(document);
}

window.BiblicalMatchThreeV3Assets = { SYMBOLS, BOOSTERS, GOALS, OBSTACLES };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
})();
