(() => {
"use strict";
if (window.__bmtV13UiInstalled) return;
window.__bmtV13UiInstalled = true;

const VERSION = "13";
const SCRIPT_URL = document.currentScript?.src || new URL("web/games/biblical-match-three-v13-ui.js", document.baseURI).href;
const WEB_ROOT = new URL("../", SCRIPT_URL);
const ARK_URL = `${new URL("assets/biblical-match-three/hq-v5/symbols/ark.webp", WEB_ROOT).href}?v=${VERSION}`;
const IMPORTANT = ".bmt-shell,.bmt-menu,.bmt-board,.bmt-board-screen,.bmt-sheet-overlay,.bmt-result-overlay,.bmt-pause-overlay,.bmt-tutorial";

let enhanceFrame = 0;
let fitFrame = 0;
let observedBoard = null;
let boardResizeObserver = null;
let arkReady = null;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function visible(node) { return Boolean(node && !node.hidden && getComputedStyle(node).display !== "none"); }

function telegramTopInset() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return Math.max(0, Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("env(safe-area-inset-top)")) || 0);
  const content = Number(tg.contentSafeAreaInset?.top || 0);
  const safe = Number(tg.safeAreaInset?.top || 0);
  const raw = Math.max(content, safe);
  return Math.round(clamp(raw || 104, 82, 146));
}

function syncViewport() {
  const vv = window.visualViewport;
  const height = Math.max(360, Number(vv?.height || window.innerHeight || document.documentElement.clientHeight || 0));
  const top = telegramTopInset();
  document.documentElement.style.setProperty("--bmt-v13-vh", `${height}px`);
  document.documentElement.style.setProperty("--bmt-v13-top", `${top}px`);
  document.documentElement.style.setProperty("--bmt-v13-content-h", `${Math.max(280, height - top)}px`);
  const hasBoard = Boolean(document.querySelector(".bmt-board"));
  const hasMenu = Boolean(document.querySelector(".bmt-menu"));
  document.body.classList.toggle("bmt-v13-board-active", hasBoard);
  document.body.classList.toggle("bmt-v13-menu-active", !hasBoard && hasMenu);
}

function patchArt() {
  for (const key of ["BiblicalMatchThreeV5Art", "BiblicalMatchThreeV4Art", "BiblicalMatchThreeV3Art"]) {
    const art = window[key];
    if (!art) continue;
    art.symbols ||= {};
    art.boosters ||= {};
    art.symbols.ark = ARK_URL;
    art.boosters.ark = ARK_URL;
  }
}

function isArkImage(img) {
  if (!(img instanceof HTMLImageElement)) return false;
  const src = String(img.getAttribute("src") || img.currentSrc || "");
  return /(?:^|\/)ark\.svg(?:\?|$)/i.test(src)
    || /hq-v5\/symbols\/ark\.webp(?:\?|$)/i.test(src)
    || Boolean(img.closest?.('[data-booster="ark"]'));
}

function patchArkImages(root = document) {
  patchArt();
  root.querySelectorAll?.("img").forEach((img) => {
    if (!isArkImage(img)) return;
    if (img.getAttribute("src") !== ARK_URL) img.src = ARK_URL;
    img.dataset.bmtArkRaster = "13";
    img.decoding = "async";
    img.loading = "eager";
    img.draggable = false;
  });
}

function preloadArk() {
  if (arkReady) return arkReady;
  arkReady = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = ARK_URL;
    if (img.complete && img.naturalWidth > 0) resolve(true);
    else img.decode?.().then(() => resolve(true), () => {});
  });
  return arkReady;
}

function currentLevelNode(campaign) {
  const current = campaign?.querySelector(".bmt-map-node.is-current,.bmt-journey-node.is-current");
  if (current) return current;
  const unlocked = [...(campaign?.querySelectorAll(".bmt-map-node:not([disabled]),.bmt-journey-node:not([disabled])") || [])];
  return unlocked.at(-1) || null;
}

function normalizeChapters(map) {
  let sections = [...map.querySelectorAll(":scope > .bmt-v13-chapter,:scope > .bmt-journey-chapter")];
  if (sections.length) {
    sections.forEach((section) => section.classList.add("bmt-v13-chapter"));
    return sections;
  }
  const children = [...map.children];
  if (!children.some((node) => node.classList.contains("bmt-map__chapter"))) return [];
  const fragment = document.createDocumentFragment();
  let section = null;
  let grid = null;
  let chapter = 0;
  for (const child of children) {
    if (child.classList.contains("bmt-map__chapter")) {
      chapter += 1;
      section = document.createElement("section");
      section.className = "bmt-v13-chapter";
      section.dataset.chapter = String(chapter);
      const head = document.createElement("header");
      head.className = "bmt-v13-chapter__head";
      head.innerHTML = `<span>Глава ${chapter}</span><strong>${child.textContent?.trim() || `Глава ${chapter}`}</strong>`;
      grid = document.createElement("div");
      grid.className = "bmt-v13-level-grid";
      section.append(head, grid);
      fragment.append(section);
    } else if (child.classList.contains("bmt-map-node") && grid) {
      child.classList.add("bmt-v13-level");
      grid.append(child);
    } else if (section) {
      section.append(child);
    }
  }
  map.replaceChildren(fragment);
  return [...map.querySelectorAll(":scope > .bmt-v13-chapter")];
}

function normalizeExistingJourney(section) {
  if (section.querySelector(":scope > .bmt-v13-level-grid")) return;
  const path = section.querySelector(":scope > .bmt-journey-path");
  const oldHead = section.querySelector(":scope > .bmt-journey-chapter__head");
  const title = oldHead?.querySelector("strong")?.textContent?.trim() || oldHead?.textContent?.trim() || `Глава ${section.dataset.chapter || ""}`;
  if (oldHead) {
    const head = document.createElement("header");
    head.className = "bmt-v13-chapter__head";
    head.innerHTML = `<span>Глава ${section.dataset.chapter || ""}</span><strong>${title}</strong>`;
    oldHead.replaceWith(head);
  }
  if (path) {
    path.classList.add("bmt-v13-level-grid");
    [...path.querySelectorAll(".bmt-map-node,.bmt-journey-node")].forEach((node) => node.classList.add("bmt-v13-level"));
  }
}

function setupChapterNav(campaign) {
  const map = campaign?.querySelector(".bmt-map");
  if (!map) return;
  const sections = normalizeChapters(map);
  if (!sections.length) return;
  sections.forEach(normalizeExistingJourney);
  map.classList.add("bmt-v13-map");
  let nav = campaign.querySelector(":scope > .bmt-v13-chapter-nav");
  if (!nav) {
    nav = document.createElement("div");
    nav.className = "bmt-v13-chapter-nav";
    map.before(nav);
  }
  if (!nav.children.length) {
    sections.forEach((section, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bmt-v13-chapter-tab";
      button.textContent = String(index + 1);
      button.setAttribute("aria-label", `Глава ${index + 1}`);
      button.addEventListener("click", () => activate(index));
      nav.append(button);
    });
  }
  let active = sections.findIndex((section) => section.querySelector(".is-current"));
  if (active < 0) {
    const candidates = sections.map((section, index) => ({ section, index })).filter(({ section }) => section.querySelector(".bmt-map-node:not([disabled]),.bmt-journey-node:not([disabled])"));
    active = candidates.at(-1)?.index ?? 0;
  }
  function activate(index) {
    sections.forEach((section, i) => {
      section.hidden = i !== index;
      section.classList.toggle("is-active", i === index);
    });
    [...nav.children].forEach((button, i) => button.classList.toggle("is-active", i === index));
  }
  activate(active);
}

function enhanceMenu(shell) {
  if (!shell) return;
  shell.classList.add("bmt-v13-menu");
  shell.querySelector(".bmt-hero-v2")?.remove();
  const title = shell.querySelector(".bmt-homebar .bmt-title");
  const kicker = shell.querySelector(".bmt-homebar .bmt-kicker");
  if (title) title.textContent = "Библейские сокровища";
  if (kicker) kicker.textContent = "Головоломка";

  const campaign = shell.querySelector(".bmt-campaign");
  const free = shell.querySelector(".bmt-free-panel");
  if (!campaign || !free) return;
  setupChapterNav(campaign);

  const daily = shell.querySelector(".bmt-daily");
  if (daily && !daily.classList.contains("is-ready")) daily.remove();

  if (shell.dataset.v13Menu === "1") return;
  shell.dataset.v13Menu = "1";

  const current = currentLevelNode(campaign);
  const currentTitle = current?.querySelector(".bmt-map-node__body strong")?.textContent?.trim() || "Первый свет";
  const currentNumber = current?.querySelector(".bmt-map-node__medallion")?.textContent?.trim() || "1";
  const summary = campaign.querySelector(".bmt-section-summary")?.textContent?.replace(/\s+/g, " ").trim() || "0 / 90 ★";

  const resume = document.createElement("section");
  resume.className = "bmt-v13-resume";
  resume.innerHTML = `<div><span>Путь света</span><strong>Уровень ${currentNumber} · ${currentTitle}</strong><small>${summary}</small></div><button type="button">Продолжить</button>`;
  resume.querySelector("button")?.addEventListener("click", () => current?.click());

  const tabs = document.createElement("div");
  tabs.className = "bmt-v13-mode-tabs";
  tabs.innerHTML = `<button type="button" class="is-active" data-v13-mode="campaign">Путь света</button><button type="button" data-v13-mode="free">Свободная игра</button>`;

  const stage = document.createElement("div");
  stage.className = "bmt-v13-stage";
  campaign.classList.add("bmt-v13-pane", "is-active");
  free.classList.add("bmt-v13-pane");
  stage.append(campaign, free);

  const homebar = shell.querySelector(".bmt-homebar");
  homebar?.after(resume);
  if (daily?.isConnected) resume.after(daily);
  (daily?.isConnected ? daily : resume).after(tabs);
  tabs.after(stage);

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-v13-mode]");
    if (!button) return;
    const mode = button.dataset.v13Mode;
    tabs.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
    campaign.classList.toggle("is-active", mode === "campaign");
    free.classList.toggle("is-active", mode === "free");
  });
}

function adjacentIndex(index, dx, dy, rows, cols) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const nr = row + dy;
  const nc = col + dx;
  if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return null;
  return nr * cols + nc;
}

function attachSwipe(board) {
  if (!board || board.dataset.v13Swipe === "1") return;
  board.dataset.v13Swipe = "1";
  let pointer = null;
  let synthetic = false;
  let suppressClickUntil = 0;

  board.addEventListener("click", (event) => {
    if (synthetic || performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  board.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    const tile = event.target.closest(".bmt-tile");
    if (!tile || !board.contains(tile)) return;
    pointer = { id:event.pointerId, index:Number(tile.dataset.index), x:event.clientX, y:event.clientY };
    try { board.setPointerCapture?.(event.pointerId); } catch {}
  }, { passive:true });

  board.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) event.preventDefault();
  }, { passive:false });

  board.addEventListener("pointercancel", () => { pointer = null; }, { passive:true });
  board.addEventListener("pointerup", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const state = pointer;
    pointer = null;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    const tile = board.querySelector(`.bmt-tile[data-index="${state.index}"]`);
    const threshold = Math.max(14, Math.min(tile?.clientWidth || 52, tile?.clientHeight || 52) * .22);
    if (Math.hypot(dx, dy) < threshold) return;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const sx = horizontal ? Math.sign(dx) : 0;
    const sy = horizontal ? 0 : Math.sign(dy);
    const rows = Math.max(1, Number(board.dataset.rows || 8));
    const cols = Math.max(1, Number(board.dataset.cols || 8));
    const targetIndex = adjacentIndex(state.index, sx, sy, rows, cols);
    if (targetIndex == null) return;
    const source = board.querySelector(`.bmt-tile[data-index="${state.index}"]`);
    const target = board.querySelector(`.bmt-tile[data-index="${targetIndex}"]`);
    if (!source || !target) return;
    suppressClickUntil = performance.now() + 420;
    event.preventDefault();
    requestAnimationFrame(() => {
      synthetic = true;
      try { source.click(); target.click(); }
      finally { synthetic = false; }
    });
  }, { passive:false });
}

function fitBoardNow() {
  fitFrame = 0;
  syncViewport();
  const board = document.querySelector(".bmt-board");
  const wrap = board?.closest(".bmt-board-wrap");
  if (!board || !wrap) return;
  attachSwipe(board);
  const rows = Math.max(1, Number(board.dataset.rows || 8));
  const cols = Math.max(1, Number(board.dataset.cols || 8));
  const style = getComputedStyle(wrap);
  const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const maxW = Math.max(120, wrap.clientWidth - padX);
  const maxH = Math.max(120, wrap.clientHeight - padY);
  let width = Math.min(maxW, maxH * cols / rows);
  let height = width * rows / cols;
  if (height > maxH) { height = maxH; width = height * cols / rows; }
  board.style.width = `${Math.floor(width)}px`;
  board.style.height = `${Math.floor(height)}px`;
  board.style.maxWidth = "100%";
  board.style.maxHeight = "100%";
}

function scheduleFit() {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => requestAnimationFrame(fitBoardNow));
}

function watchBoard(board) {
  if (observedBoard === board) return;
  boardResizeObserver?.disconnect();
  observedBoard = board || null;
  if (!board) return;
  boardResizeObserver = new ResizeObserver(scheduleFit);
  const wrap = board.closest(".bmt-board-wrap");
  if (wrap) boardResizeObserver.observe(wrap);
  attachSwipe(board);
  scheduleFit();
}

function mountOverlays() {
  document.querySelectorAll("#game-container .bmt-sheet-overlay,#game-container .bmt-result-overlay,#game-container .bmt-pause-overlay,#game-container .bmt-tutorial").forEach((overlay) => document.body.append(overlay));
}

function cleanupLegacyVisuals() {
  document.querySelectorAll(".bmt-v11-swap-layer").forEach((node) => node.remove());
  document.querySelectorAll(".bmt-v11-ghosting").forEach((node) => node.classList.remove("bmt-v11-ghosting"));
}

function enhance(root = document) {
  patchArt();
  patchArkImages(root);
  cleanupLegacyVisuals();
  mountOverlays();
  const menu = document.querySelector(".bmt-menu");
  if (menu) enhanceMenu(menu);
  const board = document.querySelector(".bmt-board");
  watchBoard(board);
  syncViewport();
  scheduleFit();
}

function nodeImportant(node) {
  return node?.nodeType === 1 && (node.matches?.(IMPORTANT) || node.querySelector?.(IMPORTANT));
}
function scheduleEnhance() {
  if (enhanceFrame) return;
  enhanceFrame = requestAnimationFrame(() => { enhanceFrame = 0; enhance(document); });
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if ([...mutation.addedNodes].some(nodeImportant) || [...mutation.removedNodes].some(nodeImportant)) {
      scheduleEnhance();
      return;
    }
  }
});
observer.observe(document.documentElement, { childList:true, subtree:true });

window.addEventListener("resize", scheduleFit, { passive:true });
window.addEventListener("orientationchange", scheduleFit, { passive:true });
window.visualViewport?.addEventListener("resize", scheduleFit, { passive:true });

preloadArk().then(() => patchArkImages(document));
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => enhance(document), { once:true });
else enhance(document);

window.BiblicalMatchThreeV13 = { enhance, fit:fitBoardNow, arkUrl:ARK_URL };
})();