(() => {
"use strict";
if (window.__bmtV14RasterPackInstalled) return;
window.__bmtV14RasterPackInstalled = true;

const VERSION = "14";
const FILES = [
  "biblical-match-three-art-symbols-bible.js",
  "biblical-match-three-art-symbols-fish.js",
  "biblical-match-three-art-symbols-dove.js",
  "biblical-match-three-art-symbols-candle.js",
  "biblical-match-three-art-symbols-crown.js",
  "biblical-match-three-art-symbols-ark.js",
  "biblical-match-three-art-symbols-bread.js",
  "biblical-match-three-art-symbols-grapes.js",
  "biblical-match-three-art-symbols-tablets.js",
  "biblical-match-three-art-boosters-manna.js",
  "biblical-match-three-art-boosters-oil.js",
  "biblical-match-three-art-boosters-covenant.js",
  "biblical-match-three-art-boosters-sling.js",
  "biblical-match-three-art-boosters-staff.js",
  "biblical-match-three-art-boosters-jericho.js",
  "biblical-match-three-art-boosters-ark.js",
  "biblical-match-three-art-goals-score.js",
  "biblical-match-three-art-goals-cascade.js",
  "biblical-match-three-art-goals-special.js",
  "biblical-match-three-art-obstacles-candle.js",
  "biblical-match-three-art-obstacles-chains.js",
  "biblical-match-three-art-obstacles-tablets.js"
];
const SYMBOL_KEYS = ["bible","fish","dove","candle","crown","ark","bread","grapes","tablets"];
const BOOSTER_KEYS = ["manna","oil","covenant","sling","staff","jericho","ark"];
const GENERIC_SYMBOL = /web\/assets\/biblical-match-three\/(bible|fish|dove|lamp|crown|ark|bread|grapes|tablets)\.svg(?:\?.*)?$/i;
const BOOSTER_MAP = { manna:"manna", lampOil:"oil", covenant:"covenant", sling:"sling", staff:"staff", jericho:"jericho", ark:"ark" };

function scriptUrl(file) { return `web/games/${file}?v=${VERSION}`; }
function load(file) {
  const canonical = `web/games/${file}`;
  const existing = [...document.scripts].find((node) => (node.getAttribute("src") || "").split("?")[0].endsWith(canonical));
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl(file);
    script.dataset.bmtV14RasterAsset = file;
    script.addEventListener("load", resolve, { once:true });
    script.addEventListener("error", () => reject(new Error(`Raster asset failed: ${file}`)), { once:true });
    document.body.append(script);
  });
}

function isWebpData(value) { return /^data:image\/webp;base64,/i.test(String(value || "")); }
function validate(art) {
  const missingSymbols = SYMBOL_KEYS.filter((key) => !isWebpData(art.symbols?.[key]));
  const missingBoosters = BOOSTER_KEYS.filter((key) => !isWebpData(art.boosters?.[key]));
  if (missingSymbols.length || missingBoosters.length) {
    throw new Error(`Embedded raster pack incomplete: symbols=${missingSymbols.join(",")}; boosters=${missingBoosters.join(",")}`);
  }
}

function publish() {
  const art = window.BiblicalMatchThreeV3Art ||= { symbols:{}, boosters:{}, goals:{}, obstacles:{} };
  validate(art);
  art.version = 14;
  art.kind = "embedded-webp-v14";
  art.sourceSize = 80;
  window.BiblicalMatchThreeV5Art = art;
  window.BiblicalMatchThreeV4Art = art;
  window.__bmtV5ArtReady = true;
  document.documentElement.dataset.bmtArt = art.kind;
  return art;
}

function symbolSource(id) {
  const art = window.BiblicalMatchThreeV3Art || window.BiblicalMatchThreeV5Art;
  const key = id === "lamp" ? "candle" : id;
  return art?.symbols?.[key] || "";
}
function boosterSource(id) {
  const art = window.BiblicalMatchThreeV3Art || window.BiblicalMatchThreeV5Art;
  return art?.boosters?.[BOOSTER_MAP[id] || id] || "";
}
function patchImage(img) {
  if (!(img instanceof HTMLImageElement)) return;
  const current = img.getAttribute("src") || "";
  const booster = img.closest?.("[data-booster]")?.dataset.booster;
  let next = booster ? boosterSource(booster) : "";
  if (!next) {
    const match = current.match(GENERIC_SYMBOL);
    if (match) next = symbolSource(match[1]);
  }
  if (!next && /(?:ark\.svg|hq-v5\/symbols\/ark\.webp)/i.test(current)) next = symbolSource("ark") || boosterSource("ark");
  if (next && current !== next) img.src = next;
  if (next) {
    img.dataset.bmtRaster = "v14";
    img.decoding = "async";
    img.loading = "eager";
    img.draggable = false;
  }
}
function scan(root = document) {
  root.querySelectorAll?.("img").forEach(patchImage);
  const appCard = document.querySelector("#biblical-match-three-card img");
  const bible = symbolSource("bible");
  if (appCard && bible && appCard.getAttribute("src") !== bible) appCard.src = bible;
}

const ready = (async () => {
  await Promise.all(FILES.map(load));
  const art = publish();
  scan(document);
  return art;
})().catch((error) => {
  console.error("Biblical Treasures V14 raster pack failed", error);
  throw error;
});

window.BiblicalMatchThreeRasterPackReady = ready;
window.BiblicalMatchThreeRasterPack = { version:14, ready, publish, scan, symbolSource, boosterSource };
})();