import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync('web/js/install-app.js', 'utf8');
const shell = 'https://alias-spy-games-app.vitaledanilov.workers.dev';
const cases = [
  { name: 'обычный игрок в Telegram на iPhone', ua: 'Mozilla/5.0 (iPhone)', telegram: true, seen: true },
  { name: 'iOS определяется по Telegram', ua: 'Telegram WebView', telegram: true, platform: 'ios', seen: true },
  { name: 'обычный игрок в Safari', ua: 'Mozilla/5.0 (iPhone) Safari', seen: true },
  { name: 'iPad с desktop user-agent', ua: 'Mozilla/5.0 Macintosh', navPlatform: 'MacIntel', touch: 5, seen: true },
  { name: 'администратор на iPhone', ua: 'Mozilla/5.0 (iPhone)', telegram: true, owner: true, seen: true },
  { name: 'установленная PWA', ua: 'Mozilla/5.0 (iPhone)', installed: true, hidden: true },
  { name: 'Android-приложение', ua: 'Mozilla/5.0 Android', apk: true, hidden: true },
  { name: 'Telegram на Android', ua: 'Mozilla/5.0 Android', telegram: true, platform: 'android', hidden: true },
];
for (const test of cases) {
  const dom = new JSDOM(`<head><meta name="app-shell" content="${shell}"></head><body><section id="system-actions"></section></body>`, {
    url: 'https://app.test/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  const opened = [];
  Object.defineProperties(w.navigator, {
    userAgent: { value: test.ua }, platform: { value: test.navPlatform || '' }, maxTouchPoints: { value: test.touch || 0 },
    standalone: { value: Boolean(test.installed) },
  });
  w.__ANDROID_APK__ = Boolean(test.apk);
  if (test.telegram) w.Telegram = { WebApp: { initData: 'test_player_session', platform: test.platform || '', openLink: (url) => opened.push(url) } };
  w.open = (url) => opened.push(url);
  if (test.owner) w.document.documentElement.classList.add('admin-rbac-root');
  if (test.seen) w.localStorage.setItem('install_hint_seen_v1', '1');
  try {
    w.eval(source);
    w.InstallApp.mount();
    const card = w.document.getElementById('install-app-btn');
    assert.equal(Boolean(card), !test.hidden, test.name);
    if (test.hidden) continue;
    card.click();
    assert.ok(w.document.getElementById('install-ios-sheet'), test.name + ': инструкция не открылась');
    w.document.querySelector('[data-install-safari]').click();
    assert.deepEqual(opened, [shell + '/install.html'], test.name + ': неверный адрес установки');
    w.document.querySelector('[data-install-close]').click();
    assert.equal(w.document.getElementById('install-ios-sheet'), null);
    card.remove(); // Повторная отрисовка меню после закрытия инструкции.
    w.InstallApp.mount();
    assert.ok(w.document.getElementById('install-app-btn'), test.name + ': кнопка исчезла после закрытия инструкции');
  } finally { dom.window.close(); }
}
console.log('Установка на iOS: обычные игроки, администратор, Telegram, Safari и повторное открытие — OK');
