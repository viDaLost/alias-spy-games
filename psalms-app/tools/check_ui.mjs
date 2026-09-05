/* Сквозная проверка веб-части приложения в Chromium.
   Запуск: python3 -m http.server 8099 --directory psalms-app/web
           node psalms-app/tools/check_ui.mjs */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = process.env.APP_URL || 'http://localhost:8099/index.html';
const passed = [];
const failed = [];

function check(name, condition, detail) {
  (condition ? passed : failed).push(detail ? `${name} (${detail})` : name);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 412, height: 892 },
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

/* 1. Запуск и главная */
check('главная открывается', await page.isVisible('[data-screen="home"]'));
check('заставка убрана', (await page.$('#boot')) === null);
check('видна строка поиска', await page.isVisible('.searchfield'));
check('сборники показаны карточками',
  (await page.$$eval('[data-screen="home"] .book-card', (nodes) => nodes.length)) === 7);

/* 2. Поиск и его состояния */
await page.click('.searchfield');
await page.waitForTimeout(400);
check('поиск открывается по нажатию на строку', await page.isVisible('[data-screen="search"]'));

await page.fill('[data-screen="search"] input', 'ыыыыы');
await page.waitForTimeout(800);
check('пустой результат объяснён',
  (await page.textContent('[data-screen="search"] .empty__title')).includes('Ничего не найдено'));

await page.fill('[data-screen="search"] input', 'благодать');
await page.waitForTimeout(900);
const results = await page.$$eval('.result', (nodes) => nodes.length);
const filters = await page.$$eval('.filter', (nodes) => nodes.map((n) => n.textContent.trim()));
check('поиск находит песни', results > 5, `${results} на экране`);
check('фильтры по сборникам', filters.length > 2, filters.slice(0, 3).join(' | '));
check('совпадения подсвечены', (await page.$$('.result mark')).length > 0);

await page.fill('[data-screen="search"] input', 'dtkbrbq');
await page.waitForTimeout(900);
check('поиск понимает латинскую раскладку',
  (await page.$$eval('.result', (nodes) => nodes.length)) > 0,
  (await page.textContent('.result-count')) || '');

await page.fill('[data-screen="search"] input', '500');
await page.waitForTimeout(800);
check('поиск по номеру',
  (await page.textContent('.result')).includes('№500'));

/* 3. Экран песни */
await page.fill('[data-screen="search"] input', 'благодать');
await page.waitForTimeout(900);
await page.click('.result');
await page.waitForTimeout(700);
check('песня открывается', await page.isVisible('.reader.is-open'));
check('текст разбит на куплеты', (await page.$$('.verse')).length > 1);
check('припев выделен', (await page.$$('.verse--chorus')).length > 0);

/* 4. Избранное */
await page.click('.favorite-button');
await page.waitForTimeout(300);
check('песня добавлена в избранное',
  await page.$eval('.favorite-button', (n) => n.getAttribute('aria-pressed') === 'true'));
const storedFavorites = await page.evaluate(
  () => JSON.parse(localStorage.getItem('psalms.v1')).favorites.length,
);
check('избранное сохраняется', storedFavorites === 1, `в хранилище: ${storedFavorites}`);

/* 5. Оформление: размер, шрифт, тема */
await page.click('.reader__bar .icon-button--text');
await page.waitForTimeout(400);
check('панель оформления открывается', await page.isVisible('.sheet'));
const sizeBefore = await page.evaluate(
  () => getComputedStyle(document.documentElement).getPropertyValue('--reader-size').trim(),
);
await page.click('.size-control__button[aria-label="Увеличить текст"]');
await page.waitForTimeout(250);
const sizeAfter = await page.evaluate(
  () => getComputedStyle(document.documentElement).getPropertyValue('--reader-size').trim(),
);
check('кнопка A+ увеличивает текст', sizeBefore !== sizeAfter, `${sizeBefore} → ${sizeAfter}`);

await page.click('.sheet .segmented button:has-text("Без засечек")');
await page.waitForTimeout(250);
check('шрифт переключается',
  (await page.evaluate(() => JSON.parse(localStorage.getItem('psalms.v1')).fontFamily)) === 'sans');

await page.click('.sheet .segmented button:has-text("Олива")');
await page.waitForTimeout(250);
check('тема переключается в панели оформления',
  (await page.evaluate(() => document.documentElement.dataset.theme)) === 'olive');

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('панель закрывается по Escape', await page.isHidden('.sheet-host'));

/* 5б. Панель управления прямо в режиме чтения */
check('панель чтения видна', await page.isVisible('.reader__toolbar'));
const toolbarSize = await page.textContent('.toolbar__value');
await page.click('.toolbar__button[aria-label="Увеличить текст"]');
await page.waitForTimeout(200);
check('размер меняется кнопкой в режиме чтения',
  (await page.textContent('.toolbar__value')) !== toolbarSize,
  `${toolbarSize} → ${await page.textContent('.toolbar__value')}`);

await page.click('.toolbar__button[aria-label="Выбрать шрифт"]');
await page.waitForTimeout(250);
check('выбор шрифта раскрывается', await page.isVisible('.toolbar__option'));
await page.click('.toolbar__option--serif');
await page.waitForTimeout(250);
check('шрифт меняется из режима чтения',
  (await page.evaluate(() => JSON.parse(localStorage.getItem('psalms.v1')).fontFamily)) === 'serif');

await page.click('.toolbar__button[aria-label="Выбрать палитру"]');
await page.waitForTimeout(250);
check('палитры раскрываются', (await page.$$('.swatch')).length === 6);
await page.click('.swatch[aria-label="Палитра: Шоколад"]');
await page.waitForTimeout(250);
check('палитра меняется из режима чтения',
  (await page.evaluate(() => document.documentElement.dataset.theme)) === 'chocolate');

/* 6. Соседние песни и возврат */
const before = await page.textContent('.song-header__title');
await page.click('.pager-button--next');
await page.waitForTimeout(600);
check('переход к следующей песне', (await page.textContent('.song-header__title')) !== before);

await page.evaluate(() => history.back());
await page.waitForTimeout(500);
await page.evaluate(() => history.back());
await page.waitForTimeout(500);
check('возврат закрывает песню', !(await page.isVisible('.reader.is-open')));

/* 7. Недавние и избранное на главной */
await page.evaluate(() => { location.hash = '#/home'; });
await page.waitForTimeout(600);
const homeText = await page.textContent('[data-screen="home"]');
check('карточка «продолжить» на главной', await page.isVisible('.resume-card'));
check('избранное показано на главной', homeText.includes('Избранное'));
check('избранное лентой карточек',
  (await page.$$eval('[data-screen="home"] .song-card', (nodes) => nodes.length)) >= 1);

await page.evaluate(() => { location.hash = '#/favorites'; });
await page.waitForTimeout(500);
check('экран избранного заполнен',
  (await page.$$eval('[data-screen="favorites"] .list-item', (nodes) => nodes.length)) === 1);

await page.click('[data-screen="favorites"] .list-item__trailing');
await page.waitForTimeout(400);
check('песню можно убрать из избранного',
  (await page.textContent('[data-screen="favorites"] .empty__title')).includes('нет избранных'));

/* 8. Доступность */
const unlabelled = await page.$$eval(
  'button.icon-button, button.list-item__trailing, button.nav__item',
  (nodes) => nodes.filter((n) => !n.getAttribute('aria-label') && !n.textContent.trim()).length,
);
check('у кнопок есть подписи', unlabelled === 0, `без подписи: ${unlabelled}`);
const small = await page.$$eval('.icon-button, .nav__item, .list-item', (nodes) => nodes
  .filter((n) => { const r = n.getBoundingClientRect(); return r.height > 0 && r.height < 44; }).length);
check('область нажатия не меньше 44px', small === 0, `мелких: ${small}`);

/* 9. Настройки сохраняются после перезапуска */
const sizeBeforeReload = await page.evaluate(
  () => getComputedStyle(document.documentElement).getPropertyValue('--reader-size').trim(),
);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('тема сохранилась',
  (await page.evaluate(() => document.documentElement.dataset.theme)) === 'chocolate');
check('размер текста сохранился',
  (await page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue('--reader-size').trim(),
  )) === sizeBeforeReload, sizeBeforeReload);

/* 10. Ширина текста на большом экране */
await page.setViewportSize({ width: 1100, height: 900 });
await page.evaluate(() => { location.hash = '#/s/unost/607'; });
await page.waitForTimeout(700);
const pageWidth = await page.$eval('.reader__page', (n) => n.getBoundingClientRect().width);
check('на широком экране текст не растягивается', pageWidth <= 760, `${Math.round(pageWidth)}px`);
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth + 1,
);
check('нет горизонтальной прокрутки', !overflow);

console.log('Пройдено:');
for (const item of passed) console.log('  ✓', item);
if (failed.length) {
  console.log('Провалено:');
  for (const item of failed) console.log('  ✗', item);
}
console.log('Ошибки в консоли:', errors.length ? errors : 'нет');

await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
