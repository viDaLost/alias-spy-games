(() => {
"use strict";
if (window.__bmtV14IconsInstalled) return;
window.__bmtV14IconsInstalled = true;

const IMPORTANT = ".bmt-shell,.bmt-menu,.bmt-board,.bmt-booster-tray,.bmt-map,.bmt-free-grid,.bmt-sheet-overlay,.bmt-result-overlay";
let frame = 0;

function pack() { return window.BiblicalMatchThreeRasterPack; }
function art() { return window.BiblicalMatchThreeV3Art || window.BiblicalMatchThreeV5Art || {}; }
function restoreArt() {
  const source = window.BiblicalMatchThreeV3Art;
  if (!source?.symbols?.bible || !source?.symbols?.ark) return;
  window.BiblicalMatchThreeV5Art = source;
  window.BiblicalMatchThreeV4Art = source;
  source.kind = "embedded-webp-v14";
  source.version = 14;
}
function image(src, className) {
  const img = new Image();
  img.src = src || "";
  img.alt = "";
  img.className = className;
  img.decoding = "async";
  img.loading = "eager";
  img.draggable = false;
  img.dataset.bmtRaster = "v14";
  return img;
}
function symbol(key) { return art().symbols?.[key] || ""; }
function booster(key) { return art().boosters?.[key] || ""; }

function decorateResume(root) {
  const resume = root.querySelector?.(".bmt-v13-resume");
  if (!resume || resume.querySelector(":scope > .bmt-v14-resume-icon")) return;
  const src = symbol("bible");
  if (!src) return;
  resume.prepend(image(src, "bmt-v14-resume-icon"));
}

function decorateChapters(root) {
  const chapterArt = ["bible", "dove", "ark", "crown"];
  root.querySelectorAll?.(".bmt-v13-chapter__head").forEach((head, index) => {
    if (head.querySelector(":scope > .bmt-v14-chapter-icon")) return;
    const chapter = Number(head.closest(".bmt-v13-chapter")?.dataset.chapter || index + 1);
    const src = symbol(chapterArt[(Math.max(1, chapter) - 1) % chapterArt.length]);
    if (src) head.prepend(image(src, "bmt-v14-chapter-icon"));
  });
}

function decorateLevels(root) {
  const keys = ["bible", "dove", "bread", "candle", "crown", "fish", "tablets", "ark", "grapes"];
  root.querySelectorAll?.(".bmt-v13-level,.bmt-map-node").forEach((node, index) => {
    if (node.querySelector(":scope > .bmt-v14-level-icon")) return;
    const src = symbol(keys[index % keys.length]);
    if (src) node.append(image(src, "bmt-v14-level-icon"));
  });
}

function decorateFree(root) {
  const keys = ["bible", "dove", "crown", "fish"];
  root.querySelectorAll?.(".bmt-free-card").forEach((node, index) => {
    if (node.querySelector(":scope > .bmt-v14-free-icon")) return;
    const src = symbol(keys[index % keys.length]);
    if (src) node.prepend(image(src, "bmt-v14-free-icon"));
  });
}

function patchBoosters(root) {
  const map = { sling:"sling", staff:"staff", jericho:"jericho", ark:"ark" };
  root.querySelectorAll?.("[data-booster]").forEach((node) => {
    const src = booster(map[node.dataset.booster] || node.dataset.booster);
    const img = node.querySelector("img");
    if (src && img && img.getAttribute("src") !== src) {
      img.src = src;
      img.dataset.bmtRaster = "v14";
      img.decoding = "async";
      img.loading = "eager";
    }
  });
}

function enhance(root = document) {
  restoreArt();
  pack()?.scan?.(root);
  patchBoosters(root);
  decorateResume(root);
  decorateChapters(root);
  decorateLevels(root);
  decorateFree(root);
  pack()?.scan?.(root);
}
function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    enhance(document);
  });
}
function important(node) {
  return node?.nodeType === 1 && (node.matches?.(IMPORTANT) || node.querySelector?.(IMPORTANT));
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if ([...mutation.addedNodes].some(important) || [...mutation.removedNodes].some(important)) {
      schedule();
      break;
    }
  }
});
observer.observe(document.documentElement, { childList:true, subtree:true });

window.BiblicalMatchThreeV14 = { version:14, enhance, restoreArt };
window.BiblicalMatchThreeRasterPackReady?.then(() => schedule()).catch(() => schedule());
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once:true });
else schedule();
})();