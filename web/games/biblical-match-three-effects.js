(() => {
"use strict";

function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function boardRect() {
  return document.querySelector(".bmt-board")?.getBoundingClientRect() || null;
}

function tileCenter(index) {
  const tile = document.querySelector(`.bmt-tile[data-index="${index}"]`);
  const board = document.querySelector(".bmt-board");
  if (!tile || !board) return null;
  const tr = tile.getBoundingClientRect();
  const br = board.getBoundingClientRect();
  return { x: tr.left - br.left + tr.width / 2, y: tr.top - br.top + tr.height / 2, w: tr.width, h: tr.height };
}

function ensureLayer() {
  const board = document.querySelector(".bmt-board");
  if (!board) return null;
  let layer = board.querySelector(".bmt-fx-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "bmt-fx-layer";
    board.append(layer);
  }
  return layer;
}

function particleBurst(index, tone = "gold", count = 8) {
  if (prefersReducedMotion()) return;
  const layer = ensureLayer();
  const center = tileCenter(index);
  if (!layer || !center) return;
  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement("i");
    dot.className = `bmt-fx-dot bmt-fx-dot--${tone}`;
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const distance = center.w * (0.55 + Math.random() * 0.65);
    dot.style.left = `${center.x}px`;
    dot.style.top = `${center.y}px`;
    dot.style.setProperty("--bmt-fx-x", `${Math.cos(angle) * distance}px`);
    dot.style.setProperty("--bmt-fx-y", `${Math.sin(angle) * distance}px`);
    layer.append(dot);
    setTimeout(() => dot.remove(), 620);
  }
}

function beam(index, orientation = "h") {
  if (prefersReducedMotion()) return;
  const layer = ensureLayer();
  const center = tileCenter(index);
  const rect = boardRect();
  if (!layer || !center || !rect) return;
  const node = document.createElement("div");
  node.className = `bmt-fx-beam bmt-fx-beam--${orientation}`;
  if (orientation === "h") {
    node.style.left = "0";
    node.style.top = `${center.y}px`;
    node.style.width = `${rect.width}px`;
  } else {
    node.style.left = `${center.x}px`;
    node.style.top = "0";
    node.style.height = `${rect.height}px`;
  }
  layer.append(node);
  setTimeout(() => node.remove(), 520);
}

function ring(index, tone = "blue") {
  if (prefersReducedMotion()) return;
  const layer = ensureLayer();
  const center = tileCenter(index);
  if (!layer || !center) return;
  const node = document.createElement("div");
  node.className = `bmt-fx-ring bmt-fx-ring--${tone}`;
  node.style.left = `${center.x}px`;
  node.style.top = `${center.y}px`;
  layer.append(node);
  setTimeout(() => node.remove(), 700);
}

function floatText(index, text, tone = "gold") {
  const layer = ensureLayer();
  const center = tileCenter(index);
  if (!layer || !center) return;
  const node = document.createElement("div");
  node.className = `bmt-fx-float bmt-fx-float--${tone}`;
  node.textContent = text;
  node.style.left = `${center.x}px`;
  node.style.top = `${center.y}px`;
  layer.append(node);
  setTimeout(() => node.remove(), prefersReducedMotion() ? 350 : 900);
}

function celebrate(root = document.querySelector(".bmt-shell")) {
  if (!root || prefersReducedMotion()) return;
  const layer = document.createElement("div");
  layer.className = "bmt-celebration";
  for (let i = 0; i < 28; i += 1) {
    const star = document.createElement("i");
    star.textContent = i % 4 === 0 ? "✦" : "•";
    star.style.left = `${5 + Math.random() * 90}%`;
    star.style.setProperty("--bmt-fall-delay", `${Math.random() * 0.45}s`);
    star.style.setProperty("--bmt-fall-drift", `${-40 + Math.random() * 80}px`);
    layer.append(star);
  }
  root.append(layer);
  setTimeout(() => layer.remove(), 1800);
}

function pulseGoal(element) {
  if (!element) return;
  element.classList.remove("is-pulsing");
  void element.offsetWidth;
  element.classList.add("is-pulsing");
  setTimeout(() => element.classList.remove("is-pulsing"), 520);
}

function haptic(kind = "selection") {
  try {
    const h = window.Telegram?.WebApp?.HapticFeedback;
    if (!h) return;
    if (kind === "success") h.notificationOccurred?.("success");
    else if (kind === "error") h.notificationOccurred?.("error");
    else h.selectionChanged?.();
  } catch {}
}

window.BiblicalMatchThreeEffects = { particleBurst, beam, ring, floatText, celebrate, pulseGoal, haptic, prefersReducedMotion };
})();
