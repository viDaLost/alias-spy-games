/* Точка входа: маршруты, вкладки и запуск приложения. */

import * as data from './data.js';
import { store } from './store.js';
import { closeSheet, sheetIsOpen, toast } from './ui.js';
import { applyTheme, applyTypography } from './typography.js';
import {
  homeScreen, recentScreen, collectionScreen, searchScreen, favoritesScreen, settingsScreen,
} from './screens.js';
import { initReader, openReader, closeReader, readerIsOpen } from './reader.js';

const stage = document.getElementById('stage');
const nav = document.getElementById('nav');
const TABS = ['#/home', '#/search', '#/favorites'];

const screens = new Map();
const scrollMemory = new Map();
let activeKey = '';

function navigate(hash, options) {
  if (options && options.replace) {
    history.replaceState(null, '', hash);
    route();
  } else if (location.hash !== hash) {
    location.hash = hash;
  } else {
    route();
  }
}

function screenFor(key) {
  if (screens.has(key)) return screens.get(key);
  let node = null;
  if (key === '#/home') node = homeScreen(navigate);
  else if (key === '#/search') node = searchScreen(navigate);
  else if (key === '#/favorites') node = favoritesScreen(navigate);
  else if (key === '#/settings') node = settingsScreen(navigate);
  else if (key === '#/recent') node = recentScreen(navigate);
  else if (key.startsWith('#/c/')) node = collectionScreen(key.slice(4), navigate);
  if (!node) return null;
  screens.set(key, node);
  stage.append(node);
  return node;
}

function activate(key) {
  if (activeKey === key) {
    const same = screens.get(key);
    if (same && same.refresh) same.refresh();
    return;
  }
  const previous = screens.get(activeKey);
  if (previous) {
    scrollMemory.set(activeKey, previous.scrollTop);
    previous.classList.remove('is-active');
  }
  const node = screenFor(key);
  if (!node) return;
  if (node.refresh) node.refresh();
  requestAnimationFrame(() => {
    node.classList.add('is-active');
    const saved = scrollMemory.get(key);
    node.scrollTop = typeof saved === 'number' ? saved : 0;
    if (node.focusInput) node.focusInput();
  });
  activeKey = key;
  syncTabs(key);
}

/* Вкладка «Главная» остаётся подсвеченной на её внутренних экранах. */
function syncTabs(key) {
  const base = TABS.indexOf(key) >= 0 ? key : '#/home';
  for (const button of nav.querySelectorAll('.nav__item')) {
    const isCurrent = button.dataset.route === base;
    if (isCurrent) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function route() {
  const hash = location.hash || '#/home';
  const parts = hash.replace(/^#\//, '').split('/');

  if (parts[0] === 's' && parts.length >= 3) {
    if (!screens.size) activate('#/home');
    openReader(parts[1], Number(parts[2]));
    return;
  }

  if (readerIsOpen()) closeReader();

  if (parts[0] === 'c' && parts[1]) {
    activate(`#/c/${parts[1]}`);
    return;
  }

  const key = ['#/home', '#/search', '#/favorites', '#/settings', '#/recent'].indexOf(hash) >= 0
    ? hash
    : '#/home';
  activate(key);
}

/* Аппаратная кнопка «назад» на Android: сперва закрываем то, что поверх. */
window.__psalmsBack = function handleBack() {
  if (sheetIsOpen()) { closeSheet(); return true; }
  return false;
};

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (sheetIsOpen()) { closeSheet(); return; }
  if (readerIsOpen()) history.back();
});

nav.addEventListener('click', (event) => {
  const button = event.target.closest('.nav__item');
  if (!button) return;
  const target = button.dataset.route;
  if (location.hash === target && screens.has(target)) {
    screens.get(target).scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  navigate(target);
});

window.addEventListener('hashchange', route);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store.get('theme') === 'auto') applyTheme();
});

async function boot() {
  applyTheme();
  applyTypography();
  initReader(navigate);

  try {
    await data.loadIndex();
  } catch (error) {
    document.getElementById('boot').innerHTML =
      '<div class="empty"><p class="empty__title">Не удалось открыть сборники</p>'
      + '<p class="empty__text">Переустановите приложение — файлы данных повреждены.</p></div>';
    return;
  }

  document.getElementById('app').hidden = false;
  route();

  const boot = document.getElementById('boot');
  boot.classList.add('is-gone');
  setTimeout(() => boot.remove(), 280);

  const warm = () => data.loadCorpus().catch(() => toast('Не удалось загрузить тексты песен'));
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 1200 });
  else setTimeout(warm, 250);
}

boot();
