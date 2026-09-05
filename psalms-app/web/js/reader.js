/* Экран чтения песни: типографика, жесты, автопрокрутка и избранное. */

import { el, icon, ICONS, toast, haptic, share, copy, keepAwake, openSheet } from './ui.js';
import { store } from './store.js';
import * as data from './data.js';

const REPEAT = /(\/:|:\/)/g;

let host = null;
let nav = null;
let scroll = null;
let page = null;
let progress = null;
let titleNode = null;
let crumbNode = null;
let favButton = null;
let autoButton = null;
let current = null;
let autoTimer = 0;
let immersive = false;

export function initReader(navigate) {
  nav = navigate;
  host = document.getElementById('reader');

  progress = el('span', { class: 'reader__progress' });
  titleNode = el('div', { class: 'reader__title' });
  crumbNode = el('div', { class: 'reader__crumb' });

  favButton = dockButton(ICONS.heart, 'В избранное', toggleFavorite);
  autoButton = dockButton(ICONS.scroll, 'Автопрокрутка', toggleAuto);

  const bar = el('div', { class: 'reader__bar' }, [
    el('button', { class: 'icon-btn', html: icon(ICONS.back), 'aria-label': 'Назад', onclick: () => history.back() }),
    el('div', { class: 'reader__heading' }, [titleNode, crumbNode]),
    el('button', {
      class: 'icon-btn',
      html: icon(ICONS.text),
      'aria-label': 'Вид текста',
      onclick: () => import('./screens.js').then((module) => module.typographySheet()),
    }),
    progress,
  ]);

  page = el('article', { class: 'reader__page' });
  scroll = el('div', { class: 'reader__scroll' }, [page]);

  const dock = el('div', { class: 'reader__dock' }, [
    favButton,
    autoButton,
    dockButton(ICONS.copy, 'Копировать', () => {
      if (current) copy(plainText(current));
    }),
    dockButton(ICONS.share, 'Поделиться', () => {
      if (current) share(current.song.t, plainText(current));
    }),
    dockButton(ICONS.book, 'К сборнику', () => {
      if (current) nav(`#/c/${current.collectionId}`);
    }),
  ]);

  host.append(bar, scroll, dock);

  scroll.addEventListener('scroll', () => {
    const max = scroll.scrollHeight - scroll.clientHeight;
    const ratio = max > 0 ? scroll.scrollTop / max : 0;
    progress.style.width = `${Math.min(100, ratio * 100)}%`;
    host.classList.toggle('is-stuck', scroll.scrollTop > 4);
  }, { passive: true });

  bindGestures();
}

function dockButton(path, label, onClick) {
  return el('button', {
    class: 'dock-btn',
    'aria-label': label,
    html: icon(path),
    onclick: onClick,
  });
}

function plainText(entry) {
  const collection = data.collectionById(entry.collectionId);
  const head = `${entry.song.t} — ${collection ? collection.title : ''} №${entry.song.n}`;
  const body = entry.song.b.map((block) => {
    const label = block.k === 'chorus' ? 'Припев:' : block.k === 'verse' && block.n ? `${block.n}.` : '';
    return (label ? `${label}\n` : '') + block.l.join('\n');
  }).join('\n\n');
  return `${head}\n\n${body}`;
}

function renderBlocks(song) {
  return song.b.map((block, position) => {
    const label = block.k === 'chorus'
      ? 'Припев'
      : block.k === 'verse' && block.n ? `Куплет ${block.n}` : '';
    const html = block.l
      .map((line) => escapeHtml(line).replace(REPEAT, '<span class="repeat">$1</span>'))
      .join('\n');
    const node = el('section', { class: `block block--${block.k}` }, [
      label ? el('span', { class: 'block__label', text: label }) : null,
      el('div', { class: 'block__lines', html }),
    ]);
    node.style.animationDelay = `${Math.min(60 + position * 45, 420)}ms`;
    return node;
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'
  ));
}

function toggleFavorite() {
  if (!current) return;
  const on = store.toggleFavorite({ c: current.collectionId, n: current.song.n, t: current.song.t });
  favButton.classList.toggle('is-fav', on);
  favButton.classList.remove('pop');
  void favButton.offsetWidth;
  favButton.classList.add('pop');
  haptic(on ? 14 : 8);
  toast(on ? 'Добавлено в избранное' : 'Убрано из избранного');
}

function toggleAuto() {
  if (autoTimer) { stopAuto(); return; }
  startAuto(store.get('autoSpeed') || 34);
  autoButton.classList.add('is-on');
  toast('Автопрокрутка включена');
  haptic(10);
}

function startAuto(speed) {
  stopAuto();
  let carry = 0;
  autoTimer = setInterval(() => {
    carry += speed / 60;
    const step = Math.floor(carry);
    if (step >= 1) {
      carry -= step;
      scroll.scrollTop += step;
      if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2) stopAuto();
    }
  }, 1000 / 60);
}

function stopAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = 0;
  autoButton.classList.remove('is-on');
}

export function autoSpeedSheet() {
  const value = el('span', { class: 'stepper__value', text: String(store.get('autoSpeed') || 34) });
  const change = (delta) => {
    const next = Math.min(120, Math.max(10, (store.get('autoSpeed') || 34) + delta));
    store.set('autoSpeed', next);
    value.textContent = String(next);
    if (autoTimer) startAuto(next);
    haptic(6);
  };
  return openSheet('Скорость автопрокрутки', el('div', { class: 'card' }, [
    el('div', { class: 'row' }, [
      el('span', { class: 'row__icon', html: icon(ICONS.scroll) }),
      el('span', { class: 'row__body' }, [
        el('span', { class: 'row__title', text: 'Пикселей в секунду' }),
        el('span', { class: 'row__sub', text: 'Удобно для пения по тексту' }),
      ]),
      el('span', { class: 'stepper' }, [
        el('button', { text: '−', onclick: () => change(-6) }),
        value,
        el('button', { text: '+', onclick: () => change(6) }),
      ]),
    ]),
  ]));
}

function bindGestures() {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let moved = false;

  scroll.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    tracking = true;
    moved = false;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, { passive: true });

  scroll.addEventListener('touchmove', (event) => {
    if (!tracking) return;
    const dx = event.touches[0].clientX - startX;
    const dy = event.touches[0].clientY - startY;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) moved = true;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 46) {
      tracking = false;
      stopAuto();
      step(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  scroll.addEventListener('touchend', () => { tracking = false; });

  scroll.addEventListener('click', (event) => {
    if (moved) return;
    if (event.target.closest('a, button')) return;
    immersive = !immersive;
    host.classList.toggle('is-immersive', immersive);
  });

  autoButton.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    autoSpeedSheet();
  });
}

function step(direction) {
  if (!current) return;
  const { prev, next } = data.neighboursOf(current.collectionId, current.song.n);
  const target = direction > 0 ? next : prev;
  if (!target) { toast(direction > 0 ? 'Это последняя песня' : 'Это первая песня'); return; }
  haptic(8);
  nav(`#/s/${current.collectionId}/${target.n}`, { replace: true });
}

export async function openReader(collectionId, number) {
  const collection = data.collectionById(collectionId);
  host.hidden = false;
  requestAnimationFrame(() => host.classList.add('is-open'));
  immersive = false;
  host.classList.remove('is-immersive');
  stopAuto();

  if (!data.corpusReady()) {
    page.replaceChildren(el('div', { class: 'reader__hat' }, [
      el('div', { class: 'skeleton', style: 'height:26px;width:60%' }),
      el('div', { class: 'skeleton', style: 'height:16px;width:40%;margin-top:12px' }),
      el('div', { class: 'skeleton', style: 'height:220px;margin-top:24px' }),
    ]));
    await data.loadCorpus();
  }

  const song = data.songOf(collectionId, number);
  if (!song) {
    page.replaceChildren(el('div', { class: 'empty' }, [
      el('div', { class: 'empty__title', text: 'Песня не найдена' }),
    ]));
    return;
  }

  current = { collectionId, song };
  titleNode.textContent = song.t;
  crumbNode.textContent = `${collection ? collection.title : ''} · №${song.n}`
    + (song.a ? ` · в «Юности» №${song.a}` : '');

  const favorite = store.isFavorite(collectionId, song.n);
  favButton.classList.toggle('is-fav', favorite);

  const { prev, next } = data.neighboursOf(collectionId, song.n);
  const navRow = el('nav', { class: 'reader__nav' }, [
    prev ? el('button', {
      class: 'nav-btn',
      onclick: () => step(-1),
    }, [
      el('span', { html: icon(ICONS.back) }),
      el('span', { class: 'nav-btn__body' }, [
        el('span', { class: 'nav-btn__kicker', text: `№${prev.n}` }),
        el('span', { class: 'nav-btn__title', text: prev.t }),
      ]),
    ]) : null,
    next ? el('button', {
      class: 'nav-btn nav-btn--next',
      onclick: () => step(1),
    }, [
      el('span', { html: icon(ICONS.chevron) }),
      el('span', { class: 'nav-btn__body' }, [
        el('span', { class: 'nav-btn__kicker', text: `№${next.n}` }),
        el('span', { class: 'nav-btn__title', text: next.t }),
      ]),
    ]) : null,
  ]);

  page.replaceChildren(
    el('header', { class: 'reader__hat' }, [
      el('span', {
        class: `reader__num tint-${collectionId}`,
        text: `${collection ? collection.title : ''} · №${song.n}`,
      }),
      el('h1', { class: 'reader__h1', text: song.t }),
    ]),
    ...renderBlocks(song),
    navRow,
  );

  scroll.scrollTop = 0;
  progress.style.width = '0%';
  store.markRead({ c: collectionId, n: song.n, t: song.t });
  if (store.get('keepAwake')) keepAwake(true);
}

export function closeReader() {
  if (host.hidden) return false;
  stopAuto();
  keepAwake(false);
  host.classList.remove('is-open');
  setTimeout(() => { host.hidden = true; }, 420);
  current = null;
  return true;
}

export function readerIsOpen() {
  return host && !host.hidden;
}
