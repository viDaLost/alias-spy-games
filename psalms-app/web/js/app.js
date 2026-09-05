/* Точка входа: маршрутизация, вкладки и запуск приложения. */

import * as data from './data.js';
import { store } from './store.js';
import { closeSheet, sheetIsOpen, toast } from './ui.js';
import {
  homeScreen, collectionScreen, searchScreen, favoritesScreen, settingsScreen,
  applyTheme, applyTypography,
} from './screens.js';
import { initReader, openReader, closeReader, readerIsOpen } from './reader.js';

const stage = document.getElementById('stage');
const tabbar = document.getElementById('tabbar');
const pill = document.getElementById('tabPill');
const TABS = ['#/home', '#/search', '#/favorites', '#/settings'];

const screens = new Map();
const scrollMemory = new Map();
let activeKey = '';
let lastPage = '#/home';

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
  else if (key === '#/settings') node = settingsScreen();
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
    previous.classList.add('is-back');
    setTimeout(() => previous.classList.remove('is-back'), 340);
  }
  const node = screenFor(key);
  if (!node) return;
  if (node.refresh) node.refresh();
  requestAnimationFrame(() => {
    node.classList.add('is-active');
    const saved = scrollMemory.get(key);
    if (typeof saved === 'number') node.scrollTop = saved;
    if (node.focusInput && key === '#/search') node.focusInput();
  });
  activeKey = key;
  lastPage = key;
  syncTabs(key);
}

function syncTabs(key) {
  const base = key.startsWith('#/c/') ? '#/home' : key;
  const buttons = Array.prototype.slice.call(tabbar.querySelectorAll('.tab'));
  let index = TABS.indexOf(base);
  if (index < 0) index = 0;
  buttons.forEach((button, position) => button.classList.toggle('is-on', position === index));
  const width = tabbar.clientWidth / TABS.length;
  pill.style.transform = `translateX(${(index + 0.5) * width - 17}px)`;
}

function route() {
  const hash = location.hash || '#/home';
  const parts = hash.replace(/^#\//, '').split('/');

  if (parts[0] === 's' && parts.length >= 3) {
    const collectionId = parts[1];
    const number = Number(parts[2]);
    if (!screens.size) activate('#/home');
    openReader(collectionId, number);
    return;
  }

  if (readerIsOpen()) closeReader();

  if (parts[0] === 'c' && parts[1]) {
    activate(`#/c/${parts[1]}`);
    return;
  }

  const key = TABS.indexOf(hash) >= 0 ? hash : '#/home';
  activate(key);
}

/* Аппаратная кнопка «назад» на Android: сначала закрываем то, что поверх. */
window.__psalmsBack = function handleBack() {
  if (sheetIsOpen()) { closeSheet(); return true; }
  return false;
};

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (sheetIsOpen()) { closeSheet(); return; }
  if (readerIsOpen()) history.back();
});

tabbar.addEventListener('click', (event) => {
  const button = event.target.closest('.tab');
  if (!button) return;
  const target = button.dataset.route;
  if (location.hash === target && screens.has(target)) {
    const node = screens.get(target);
    node.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  navigate(target);
});

window.addEventListener('hashchange', route);
window.addEventListener('resize', () => syncTabs(lastPage));

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
      '<div class="empty"><div class="empty__title">Не удалось открыть сборники</div>'
      + '<div class="empty__text">Переустановите приложение — файлы данных повреждены.</div></div>';
    return;
  }

  document.getElementById('app').hidden = false;
  route();
  syncTabs(lastPage);

  const bootNode = document.getElementById('boot');
  bootNode.classList.add('is-gone');
  setTimeout(() => bootNode.remove(), 500);

  const warm = () => data.loadCorpus().catch(() => toast('Не удалось загрузить тексты'));
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 1200 });
  else setTimeout(warm, 300);
}

boot();
