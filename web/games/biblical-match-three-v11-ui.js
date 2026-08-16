(() => {
"use strict";
if (window.__bmtV11UiInstalled) return;
window.__bmtV11UiInstalled = true;

const VERSION = "11";
const SCRIPT_URL = document.currentScript?.src || new URL("web/games/biblical-match-three-v11-ui.js", document.baseURI).href;
const WEB_ROOT = new URL("../", SCRIPT_URL);
const ASSET_BASE = new URL("assets/biblical-match-three/", WEB_ROOT).href;
const ARK_URL = `${new URL("assets/biblical-match-three/hq-v5/symbols/ark.webp", WEB_ROOT).href}?v=${VERSION}`;
const IMPORTANT_NODE = ".bmt-menu,.bmt-board-screen,.bmt-board,.bmt-free-grid,.bmt-sheet-overlay,.bmt-result-overlay,.bmt-pause-overlay";

let enhanceFrame = 0;
let fitFrame = 0;
let arkObjectUrl = "";
let arkPromise = null;
let artDecodePromise = null;
let boardObserver = null;
let observedBoard = null;
let forwardGhostBusy = false;
let reverseGhostBusy = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (node) => node && !node.hidden && getComputedStyle(node).display !== "none";

function telegramTopInset() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return Math.max(8, Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("env(safe-area-inset-top)")) || 0);
  const safe = Math.max(0, Number(tg.safeAreaInset?.top || 0));
  const content = Math.max(0, Number(tg.contentSafeAreaInset?.top || 0));
  const softenedContent = content ? content * 0.64 : 0;
  return Math.round(Math.max(48, Math.min(66, Math.max(safe, softenedContent || safe || 56))));
}

function syncViewport() {
  const vv = window.visualViewport;
  const height = Math.max(320, Number(vv?.height || window.innerHeight || document.documentElement.clientHeight || 0));
  document.documentElement.style.setProperty("--bmt-v11-viewport-height", `${height}px`);
  document.documentElement.style.setProperty("--bmt-v11-top", `${telegramTopInset()}px`);
  document.body.classList.toggle("bmt-v11-board-active", Boolean(document.querySelector(".bmt-board")));
}

function artNow() {
  return window.BiblicalMatchThreeV5Art || window.BiblicalMatchThreeV4Art || window.BiblicalMatchThreeV3Art || {};
}

function patchArkArt(src) {
  if (!src) return;
  for (const key of ["BiblicalMatchThreeV5Art", "BiblicalMatchThreeV4Art", "BiblicalMatchThreeV3Art"]) {
    const art = window[key];
    if (!art) continue;
    art.symbols ||= {};
    art.boosters ||= {};
    art.symbols.ark = src;
    art.boosters.ark = src;
  }
}

async function loadArkRaster() {
  if (arkPromise) return arkPromise;
  arkPromise = (async () => {
    try {
      const response = await fetch(ARK_URL, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Ark raster HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size < 1024) throw new Error("Ark raster is unexpectedly small");
      const url = URL.createObjectURL(blob);
      const probe = new Image();
      probe.decoding = "sync";
      probe.src = url;
      if (probe.decode) await probe.decode();
      else await new Promise((resolve, reject) => { probe.onload = resolve; probe.onerror = reject; });
      if (probe.naturalWidth < 128 || probe.naturalHeight < 128) throw new Error(`Ark raster geometry ${probe.naturalWidth}x${probe.naturalHeight}`);
      arkObjectUrl = url;
      patchArkArt(url);
      patchArkImages(document);
      return url;
    } catch (error) {
      console.warn("Biblical Treasures V11 Ark raster preload failed", error);
      patchArkArt(ARK_URL);
      patchArkImages(document);
      return ARK_URL;
    }
  })();
  return arkPromise;
}

function isArkImage(img) {
  if (!(img instanceof HTMLImageElement)) return false;
  const src = img.getAttribute("src") || img.currentSrc || "";
  if (/\/ark\.svg(?:\?|$)/i.test(src) || /\/hq-v5\/symbols\/ark\.webp(?:\?|$)/i.test(src)) return true;
  if (img.closest?.('[data-booster="ark"]')) return true;
  return false;
}

function patchArkImages(root = document) {
  const src = arkObjectUrl || ARK_URL;
  root.querySelectorAll?.("img").forEach((img) => {
    if (!isArkImage(img)) return;
    if (img.getAttribute("src") !== src) img.src = src;
    img.dataset.bmtV11Ark = "raster";
    img.decoding = "sync";
    img.loading = "eager";
  });
}

function setBoardDecodeMode(root = document) {
  root.querySelectorAll?.(".bmt-piece").forEach((img) => {
    img.decoding = "sync";
    img.loading = "eager";
  });
}

function predecodeArt() {
  if (artDecodePromise) return artDecodePromise;
  artDecodePromise = (async () => {
    try { if (window.BiblicalMatchThreeV5ArtReady) await window.BiblicalMatchThreeV5ArtReady; } catch {}
    const art = artNow();
    const urls = new Set([
      ...Object.values(art.symbols || {}),
      ...Object.values(art.boosters || {}),
      arkObjectUrl || ARK_URL,
    ].filter(Boolean));
    await Promise.allSettled([...urls].map((src) => new Promise((resolve) => {
      const img = new Image();
      img.decoding = "sync";
      img.onload = resolve;
      img.onerror = resolve;
      img.src = src;
      if (img.complete && img.naturalWidth > 0) resolve();
      else if (img.decode) img.decode().then(resolve, resolve);
    })));
  })();
  return artDecodePromise;
}

function currentLevelNode(campaign) {
  const current = campaign?.querySelector(".bmt-map-node.is-current,.bmt-journey-node.is-current");
  if (current) return current;
  const unlocked = [...(campaign?.querySelectorAll(".bmt-map-node:not([disabled]),.bmt-journey-node:not([disabled])") || [])];
  return unlocked.at(-1) || null;
}

function normalizeChapters(map) {
  let sections = [...map.querySelectorAll(":scope > .bmt-journey-chapter")];
  if (sections.length) return sections;
  const original = [...map.children];
  if (!original.some((node) => node.classList.contains("bmt-map__chapter"))) return [];
  const fragment = document.createDocumentFragment();
  let section = null;
  let path = null;
  let chapterIndex = 0;
  for (const child of original) {
    if (child.classList.contains("bmt-map__chapter")) {
      chapterIndex += 1;
      section = document.createElement("section");
      section.className = "bmt-journey-chapter bmt-v11-chapter";
      section.dataset.chapter = String(chapterIndex);
      const head = document.createElement("header");
      head.className = "bmt-journey-chapter__head";
      head.innerHTML = `<div class="bmt-journey-chapter__copy"><span>Глава ${chapterIndex}</span><strong>${child.textContent?.trim() || `Глава ${chapterIndex}`}</strong></div>`;
      path = document.createElement("div");
      path.className = "bmt-journey-path";
      section.append(head, path);
      fragment.append(section);
    } else if (child.classList.contains("bmt-map-node") && path) {
      child.classList.add("bmt-journey-node");
      path.append(child);
    } else if (section) {
      section.append(child);
    }
  }
  map.replaceChildren(fragment);
  map.dataset.v10Journey = "1";
  map.dataset.v11Journey = "1";
  return [...map.querySelectorAll(":scope > .bmt-journey-chapter")];
}

function setupChapterTabs(campaign) {
  const map = campaign?.querySelector(".bmt-map");
  if (!map) return;
  const sections = normalizeChapters(map);
  if (!sections.length) return;
  map.classList.add("bmt-v11-chapter-map");
  let nav = campaign.querySelector(":scope > .bmt-v11-chapter-nav");
  if (!nav) {
    nav = document.createElement("div");
    nav.className = "bmt-v11-chapter-nav";
    campaign.insertBefore(nav, map);
  }
  nav.replaceChildren();
  let activeIndex = sections.findIndex((section) => section.querySelector(".is-current"));
  if (activeIndex < 0) {
    const withUnlocked = sections.map((section, index) => ({ section, index })).filter(({ section }) => section.querySelector(".bmt-journey-node:not([disabled]),.bmt-map-node:not([disabled])"));
    activeIndex = withUnlocked.at(-1)?.index ?? 0;
  }
  const activate = (index) => {
    sections.forEach((section, i) => { section.hidden = i !== index; section.classList.toggle("is-active", i === index); });
    [...nav.children].forEach((button, i) => button.classList.toggle("is-active", i === index));
  };
  sections.forEach((section, index) => {
    const title = section.querySelector(".bmt-journey-chapter__copy strong")?.textContent?.trim() || `Глава ${index + 1}`;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "bmt-v11-chapter-chip";
    chip.innerHTML = `<span>${index + 1}</span><strong>${title}</strong>`;
    chip.addEventListener("click", () => activate(index));
    nav.append(chip);
  });
  activate(Math.max(0, activeIndex));
}

function redesignMenu(root = document) {
  const shell = root.querySelector?.(".bmt-menu") || document.querySelector(".bmt-menu");
  if (!shell) return;
  const campaign = shell.querySelector(".bmt-campaign");
  const free = shell.querySelector(".bmt-free-panel");
  if (!campaign || !free) return;

  shell.classList.add("bmt-v11-menu");
  const title = shell.querySelector(".bmt-homebar .bmt-title");
  const kicker = shell.querySelector(".bmt-homebar .bmt-kicker");
  if (title) title.textContent = "Сокровища";
  if (kicker) kicker.textContent = "Библейская головоломка";
  shell.querySelector(".bmt-hero-v2")?.remove();

  setupChapterTabs(campaign);

  if (shell.dataset.v11Menu !== "1") {
    shell.dataset.v11Menu = "1";
    const daily = shell.querySelector(".bmt-daily");
    const current = currentLevelNode(campaign);
    const currentTitle = current?.querySelector(".bmt-map-node__body strong,.bmt-journey-node .bmt-map-node__body strong")?.textContent?.trim() || "Первый свет";
    const currentNumber = current?.querySelector(".bmt-map-node__medallion")?.textContent?.trim() || "1";
    const summaryText = campaign.querySelector(".bmt-section-summary")?.textContent?.replace(/\s+/g, " ").trim() || "0 / 90 ★";
    const bible = artNow().symbols?.bible || `${ASSET_BASE}bible.svg?v=${VERSION}`;

    const dashboard = document.createElement("section");
    dashboard.className = "bmt-v11-dashboard";
    dashboard.innerHTML = `<div class="bmt-v11-dashboard__icon"><img src="${bible}" alt=""></div><div class="bmt-v11-dashboard__copy"><span>Путь света</span><strong>Уровень ${currentNumber} · ${currentTitle}</strong><small>${summaryText}</small></div><button type="button" class="bmt-v11-continue">Продолжить <span>→</span></button>`;
    dashboard.querySelector(".bmt-v11-continue")?.addEventListener("click", () => current?.click());

    const tabs = document.createElement("div");
    tabs.className = "bmt-v11-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.innerHTML = `<button type="button" class="is-active" data-bmt-v11-tab="campaign" role="tab" aria-selected="true">Путь света</button><button type="button" data-bmt-v11-tab="free" role="tab" aria-selected="false">Свободная игра</button>`;

    const stage = document.createElement("div");
    stage.className = "bmt-v11-stage";
    campaign.classList.add("bmt-v11-pane", "is-active");
    free.classList.add("bmt-v11-pane");
    stage.append(campaign, free);

    const top = shell.querySelector(".bmt-homebar");
    top?.after(dashboard);
    if (daily?.classList.contains("is-ready")) dashboard.after(daily);
    else daily?.remove();
    (daily?.isConnected ? daily : dashboard).after(tabs);
    tabs.after(stage);

    tabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-bmt-v11-tab]");
      if (!button) return;
      const tab = button.dataset.bmtV11Tab;
      [...tabs.querySelectorAll("button")].forEach((node) => {
        const active = node === button;
        node.classList.toggle("is-active", active);
        node.setAttribute("aria-selected", active ? "true" : "false");
      });
      campaign.classList.toggle("is-active", tab === "campaign");
      free.classList.toggle("is-active", tab === "free");
      requestAnimationFrame(() => shell.scrollTo?.({ top: 0, behavior: "auto" }));
    });
  }

  patchArkImages(shell);
}

function fitBoardNow() {
  fitFrame = 0;
  syncViewport();
  const board = document.querySelector(".bmt-board");
  const shell = board?.closest(".bmt-board-screen");
  const wrap = board?.closest(".bmt-board-wrap");
  if (!board || !shell || !wrap) return;

  const rows = Math.max(1, Number(board.dataset.rows || 8));
  const cols = Math.max(1, Number(board.dataset.cols || 8));
  board.style.setProperty("--bmt-v11-board-width", "100%");

  const shellStyle = getComputedStyle(shell);
  const wrapStyle = getComputedStyle(wrap);
  const viewportHeight = Math.max(320, Number(window.visualViewport?.height || window.innerHeight || shell.clientHeight));
  const shellPadY = (parseFloat(shellStyle.paddingTop) || 0) + (parseFloat(shellStyle.paddingBottom) || 0);
  const wrapPadX = (parseFloat(wrapStyle.paddingLeft) || 0) + (parseFloat(wrapStyle.paddingRight) || 0);
  const wrapPadY = (parseFloat(wrapStyle.paddingTop) || 0) + (parseFloat(wrapStyle.paddingBottom) || 0);
  const siblings = [...shell.children].filter((node) => node !== wrap && visible(node));
  const siblingsHeight = siblings.reduce((sum, node) => sum + node.getBoundingClientRect().height, 0);
  const gap = parseFloat(shellStyle.rowGap || shellStyle.gap) || 0;
  const gapTotal = gap * Math.max(0, siblings.length);
  const maxHeight = Math.max(96, viewportHeight - shellPadY - siblingsHeight - gapTotal - wrapPadY - 2);
  const maxWidth = Math.max(96, wrap.clientWidth - wrapPadX);
  const widthByHeight = maxHeight * cols / rows;
  const width = Math.floor(Math.max(96, Math.min(maxWidth, widthByHeight)));
  board.style.setProperty("--bmt-v11-board-width", `${width}px`);
  setBoardDecodeMode(board);
  patchArkImages(board);
}

function scheduleFit() {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => requestAnimationFrame(fitBoardNow));
}

function createSwapGhost(wrapper, rect) {
  const ghost = wrapper.cloneNode(true);
  ghost.classList.add("bmt-v11-swap-ghost");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    transform: "translate3d(0,0,0)",
    opacity: "1",
    pointerEvents: "none",
  });
  ghost.querySelectorAll("img").forEach((img) => { img.decoding = "sync"; img.loading = "eager"; });
  return ghost;
}

async function animateGhostPair(tiles, reverse = false) {
  if (tiles.length < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  const [a, b] = tiles;
  const wa = a.querySelector(".bmt-piece-wrap");
  const wb = b.querySelector(".bmt-piece-wrap");
  if (!wa || !wb) return;
  const ra = wa.getBoundingClientRect();
  const rb = wb.getBoundingClientRect();
  if (!ra.width || !rb.width) return;

  const layer = document.createElement("div");
  layer.className = "bmt-v11-swap-layer";
  const ga = createSwapGhost(wa, ra);
  const gb = createSwapGhost(wb, rb);
  layer.append(ga, gb);
  document.body.append(layer);
  a.classList.add("bmt-v11-ghosting");
  b.classList.add("bmt-v11-ghosting");

  const duration = reverse ? 124 : 150;
  const hold = reverse ? 44 : 48;
  const easing = reverse ? "cubic-bezier(.28,.72,.3,1)" : "cubic-bezier(.2,.82,.2,1)";
  const dax = rb.left - ra.left;
  const day = rb.top - ra.top;
  const dbx = ra.left - rb.left;
  const dby = ra.top - rb.top;

  try {
    if (ga.animate && gb.animate) {
      const aa = ga.animate([{ transform:"translate3d(0,0,0)" }, { transform:`translate3d(${dax}px,${day}px,0)` }], { duration, easing, fill:"forwards" });
      const ab = gb.animate([{ transform:"translate3d(0,0,0)" }, { transform:`translate3d(${dbx}px,${dby}px,0)` }], { duration, easing, fill:"forwards" });
      await Promise.all([aa.finished.catch(() => {}), ab.finished.catch(() => {})]);
    } else {
      ga.style.transition = `transform ${duration}ms ${easing}`;
      gb.style.transition = `transform ${duration}ms ${easing}`;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      ga.style.transform = `translate3d(${dax}px,${day}px,0)`;
      gb.style.transform = `translate3d(${dbx}px,${dby}px,0)`;
      await delay(duration);
    }
    await delay(hold);
  } finally {
    layer.remove();
    a.classList.remove("bmt-v11-ghosting");
    b.classList.remove("bmt-v11-ghosting");
  }
}

function maybeStartSwapVisual(board) {
  if (!board) return;
  if (!forwardGhostBusy) {
    const tiles = [...board.querySelectorAll(".bmt-tile.is-swapping")].slice(0, 2);
    if (tiles.length === 2) {
      forwardGhostBusy = true;
      animateGhostPair(tiles, false).finally(() => { forwardGhostBusy = false; });
    }
  }
  if (!reverseGhostBusy) {
    const tiles = [...board.querySelectorAll(".bmt-tile.is-swap-back")].slice(0, 2);
    if (tiles.length === 2) {
      reverseGhostBusy = true;
      animateGhostPair(tiles, true).finally(() => { reverseGhostBusy = false; });
    }
  }
}

function attachBoardObserver(board) {
  if (observedBoard === board) return;
  boardObserver?.disconnect();
  observedBoard = board || null;
  if (!board) return;
  boardObserver = new MutationObserver(() => maybeStartSwapVisual(board));
  boardObserver.observe(board, { subtree:true, attributes:true, attributeFilter:["class"] });
  setBoardDecodeMode(board);
  scheduleFit();
}

function enhance(root = document) {
  syncViewport();
  redesignMenu(root);
  const board = document.querySelector(".bmt-board");
  attachBoardObserver(board);
  setBoardDecodeMode(root);
  patchArkImages(root);
  if (board) scheduleFit();
}

function nodeImportant(node) {
  return node?.nodeType === 1 && (node.matches?.(IMPORTANT_NODE) || node.querySelector?.(IMPORTANT_NODE));
}

function scheduleEnhance() {
  if (enhanceFrame) return;
  enhanceFrame = requestAnimationFrame(() => requestAnimationFrame(() => {
    enhanceFrame = 0;
    enhance(document);
  }));
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
window.visualViewport?.addEventListener("scroll", scheduleFit, { passive:true });

loadArkRaster().then(() => predecodeArt());
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => enhance(document), { once:true });
else enhance(document);

window.BiblicalMatchThreeV11 = {
  version: VERSION,
  arkUrl: ARK_URL,
  enhance,
  fitBoard: fitBoardNow,
  loadArkRaster,
};
})();