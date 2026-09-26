// Съёмка семи игр, которых не было в прошлых роликах: «Поиск библейских слов»,
// «Священное слово», «Соображариум», «Алиас», «Опиши слово», «Соглядатай»,
// «Найди пару для ковчега». Приложение — то же, что открывает Telegram
// (promo/ad/app-harness.mjs); нажатия — настоящие клики, слово в «Поиске» —
// настоящим жестом по буквам.
//
// Подготовлено одно: что выпадает случаем. Слово «Соображариума», слова
// «Алиаса», слово «Опиши», роль «Соглядатая» игра берёт из своих же списков
// случайно — здесь выбраны слова из этих списков, чтобы рассказ ролика
// складывался: НОЙ → буква «Н» на тему «Имя» и так далее. Локация «Соглядатая» —
// «Египет» из её списка.
//
//   node promo/ad-60/capture_new.mjs [wordsearch] [sacred] [coim] [alias] [describe] [spy] [pairs]
//   → promo/ad-60/shots/*.webp + shots/layout.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { serve } from '../ad/serve.mjs';
import { openApp, rectOf, sprite } from '../ad/app-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SHOTS = path.join(HERE, 'shots');
const RAW = path.join(HERE, 'build', 'raw');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SCALE = 3;
const only = new Set(process.argv.slice(2));
const want = (name) => !only.size || only.has(name);

fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
const layoutFile = path.join(SHOTS, 'layout.json');
const layout = fs.existsSync(layoutFile) ? JSON.parse(fs.readFileSync(layoutFile, 'utf8')) : {};
layout.scale = SCALE;
const raw = (name) => path.join(RAW, `${name}.png`);
const made = [];
const shotFile = (name) => { made.push(`${name}.png`); return raw(name); };

const srv = await serve(ROOT);
// «Священное слово» рисует менору в WebGL — программный рендер.
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const failures = [];
const buttonRect = (page, re) => page.evaluate((src) => {
  const r = new RegExp(src);
  const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent && r.test(x.textContent.replace(/\s+/g, ' ')));
  if (!b) return null;
  const q = b.getBoundingClientRect();
  return { x: q.left, y: q.top, w: q.width, h: q.height };
}, re);
const mid = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
/*
  Карточки «Соглядатая» и «Найди пару» игра переворачивает CSS-3D. В ролике этот
  поворот повторяется с теми же перспективой и кривой, а для этого нужны обе
  стороны карточки отдельно и экран без неё — иначе под поворачивающейся
  карточкой просвечивала бы её же копия со снимка.
*/
async function hole(page, selector, name) {
  await page.evaluate((sel) => { document.querySelector(sel).style.visibility = 'hidden'; }, selector);
  await page.screenshot({ path: shotFile(name) });
  await page.evaluate((sel) => { document.querySelector(sel).style.visibility = ''; }, selector);
}

// ——— «Поиск библейских слов»: АВРААМ жестом по буквам ———
if (want('wordsearch')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
  await page.evaluate(() => { window.showGame('bible-wordsearch'); });
  await page.waitForSelector('#ws-board .ws-cell', { timeout: 20_000 });
  await page.waitForTimeout(900);
  const w = {};
  w.theme = await page.evaluate(() => document.getElementById('ws-theme-label')?.textContent);
  w.cells = await page.evaluate(() => [...document.querySelectorAll('#ws-board .ws-cell')].map((c) => {
    const r = c.getBoundingClientRect();
    return { r: +c.dataset.r, c: +c.dataset.c, ch: c.textContent.trim(), x: r.left, y: r.top, w: r.width, h: r.height };
  }));
  w.board = await rectOf(page, '#ws-board');
  // Слово ищется по сетке так же, как его собирает игрок: соседние клетки по стороне.
  const WORD = 'АВРААМ';
  const at = new Map(w.cells.map((c) => [`${c.r},${c.c}`, c]));
  const walk = (cell, i, used) => {
    if (cell.ch !== WORD[i]) return null;
    if (i === WORD.length - 1) return [cell];
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const n = at.get(`${cell.r + dr},${cell.c + dc}`);
      if (!n || used.has(n)) continue;
      const rest = walk(n, i + 1, new Set([...used, n]));
      if (rest) return [cell, ...rest];
    }
    return null;
  };
  let pathCells = null;
  for (const c of w.cells) { pathCells = walk(c, 0, new Set([c])); if (pathCells) break; }
  if (!pathCells) throw new Error(`в сетке нет слова ${WORD}`);
  w.word = WORD;
  w.path = pathCells.map((c) => ({ r: c.r, c: c.c }));
  w.progress0 = await page.evaluate(() => document.getElementById('ws-progress')?.textContent);
  await page.screenshot({ path: shotFile('ws-1') });
  // Жест: палец ложится на первую букву и ведёт через все шесть; снимок — на каждой букве.
  const p0 = mid(pathCells[0]);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.screenshot({ path: shotFile('ws-drag-1') });
  for (let i = 1; i < pathCells.length; i += 1) {
    const a = mid(pathCells[i - 1]); const b = mid(pathCells[i]);
    for (let s = 1; s <= 6; s += 1) await page.mouse.move(a.x + (b.x - a.x) * s / 6, a.y + (b.y - a.y) * s / 6);
    await page.waitForTimeout(120);
    await page.screenshot({ path: shotFile(`ws-drag-${i + 1}`) });
  }
  await page.mouse.up();
  await page.waitForTimeout(900);
  w.progress1 = await page.evaluate(() => document.getElementById('ws-progress')?.textContent);
  await page.screenshot({ path: shotFile('ws-found') });
  if (!/Найдено: 1\//.test(w.progress1 || '')) failures.push(`поиск: слово не засчитано (${w.progress1})`);
  layout.wordsearch = w;
  if (errors.length) failures.push(`поиск: ${errors.join(' | ')}`);
  await context.close();
  console.log(`поиск снят: ${w.theme}, ${WORD} по клеткам ${w.path.map((p) => `${p.r}${p.c}`).join(' ')} · ${w.progress1}`);
}

// ——— «Священное слово»: НОЙ по буквам, свечи меноры горят ———
if (want('sacred')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
  await page.evaluate(() => { window.showGame('sacred-word'); });
  await page.waitForSelector('button[data-letter]', { timeout: 20_000 });
  await page.waitForTimeout(2500);
  const s = {};
  s.slots0 = await page.evaluate(() => [...document.querySelectorAll('.sw-word .sw-letter')].map((n) => n.textContent.trim()).join(''));
  const keyRect = (ch) => rectOf(page, `button[data-letter="${ch}"]`);
  s.keys = {};
  for (const ch of ['Н', 'О', 'Й']) s.keys[ch] = await keyRect(ch);
  s.slots = await page.evaluate(() => [...document.querySelectorAll('.sw-word .sw-letter')].map((n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
  s.lamp = await rectOf(page, '.sw-lamp-card');
  s.hint = await page.evaluate(() => document.querySelector('.sw-hintbox')?.textContent.trim());
  if (s.slots.length !== 3) throw new Error(`на первом уровне не три буквы: ${s.slots0}`);
  await page.screenshot({ path: shotFile('sacred-1') });
  let i = 2;
  for (const ch of ['Н', 'О', 'Й']) {
    await page.click(`button[data-letter="${ch}"]`);
    await page.waitForTimeout(ch === 'Й' ? 1400 : 700);
    await page.screenshot({ path: shotFile(`sacred-${i}`) });
    i += 1;
  }
  s.solved = await page.evaluate(() => [...document.querySelectorAll('.sw-word .sw-letter')].map((n) => n.textContent.trim()).join(''));
  s.message = await page.evaluate(() => document.querySelector('.sw-message')?.textContent.trim());
  s.slotsSolved = await page.evaluate(() => [...document.querySelectorAll('.sw-word .sw-letter')].map((n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
  if (s.solved !== 'НОЙ') failures.push(`священное слово: открыто «${s.solved}»`);
  layout.sacred = s;
  if (errors.length) failures.push(`священное слово: ${errors.join(' | ')}`);
  await context.close();
  console.log(`священное слово снято: ${s.slots0} → ${s.solved} · «${s.message}»`);
}

// ——— «Соображариум»: тема «Имя», буква «Н»; «Новый раунд» → «Еда», «М» ———
if (want('coim')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
  await page.evaluate(() => { window.showGame('coimaginarium'); });
  await page.waitForSelector('.premium-theme-card', { timeout: 20_000 });
  await page.waitForTimeout(600);
  // Первая тема и буква раунда — из списков игры: «Имя» и «Н» (НОЙ).
  await page.evaluate(() => {
    const i = coimaginariumThemes.indexOf('Имя');
    if (i >= 0) coimaginariumThemes.splice(i, 1);
    coimaginariumThemes.push(currentTheme);
    shownThemes[shownThemes.length - 1] = 'Имя';
    currentTheme = 'Имя'; currentLetter = 'Н'; recentLetters[recentLetters.length - 1] = 'Н';
    displayCoimaginariumUI();
  });
  await page.waitForTimeout(500);
  const c = {};
  c.card = await rectOf(page, '.premium-theme-card');
  c.letter = await rectOf(page, '.theme-letter-big');
  c.next = await buttonRect(page, 'Новый раунд');
  c.text1 = await page.evaluate(() => document.querySelector('.premium-theme-card')?.textContent.replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: shotFile('coim-1') });
  // «Новый раунд»: следующий случай игры — «Еда» и «М».
  await page.evaluate(() => {
    const i = coimaginariumThemes.indexOf('Еда');
    coimaginariumThemes.splice(i, 1); coimaginariumThemes.unshift('Еда');
    const letters = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split('').filter((l) => !recentLetters.includes(l));
    const seq = [0, (letters.indexOf('М') + 0.5) / letters.length];
    const own = Math.random;
    Math.random = () => (seq.length ? seq.shift() : own());
  });
  await page.click('button:has-text("Новый раунд")');
  await page.waitForTimeout(600);
  c.text2 = await page.evaluate(() => document.querySelector('.premium-theme-card')?.textContent.replace(/\s+/g, ' ').trim());
  c.letter2 = await rectOf(page, '.theme-letter-big');
  await page.screenshot({ path: shotFile('coim-2') });
  if (!/Еда/.test(c.text2) || !/М/.test(c.text2)) failures.push(`соображариум: второй раунд «${c.text2}»`);
  layout.coim = c;
  if (errors.length) failures.push(`соображариум: ${errors.join(' | ')}`);
  await context.close();
  console.log(`соображариум снят: «${c.text1}» → «${c.text2}»`);
}

// ——— «Алиас»: раунд 60 секунд, слова из списка «Средний» ———
if (want('alias')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
  await page.evaluate(() => { window.showGame('alias'); });
  await page.getByRole('button', { name: 'Средний' }).click();
  await page.waitForSelector('button:has-text("Начать раунд")', { timeout: 20_000 });
  // Время страницы — под управлением: таймер раунда идёт ровно на секунду между нажатиями,
  // сколько бы ни снимался кадр.
  await page.clock.install({ time: new Date('2026-01-01T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T10:00:01Z'));
  const tap = (re) => page.evaluate((src) => { const r = new RegExp(src); [...document.querySelectorAll('button')].find((b) => b.offsetParent && r.test(b.textContent)).click(); }, re);
  await tap('Начать раунд');
  for (let i = 0; i < 50 && !(await page.evaluate(() => document.getElementById('alias-word')?.textContent)); i += 1) await page.clock.runFor(20);
  const WORDS = ['Завет', 'Пасха', 'Агнец', 'Облако'];
  await page.evaluate((list) => {
    const all = wordsCache.get('medium') || [];
    const missing = list.filter((x) => !all.includes(x));
    if (missing.length) throw new Error(`нет в списке «Средний»: ${missing}`);
    aliasWords = [...list, ...aliasWords.filter((x) => !list.includes(x))];
    aliasIndex = 0;
    aliasShowNextWord();
  }, WORDS);
  const a = { words: WORDS, shots: [] };
  a.word = await rectOf(page, '#alias-word');
  a.timer = await rectOf(page, '#alias-timer');
  a.good = await buttonRect(page, '^Отгадано');
  a.skip = await buttonRect(page, '^Пропустить');
  const snap = async (name) => { a.shots.push(await page.evaluate(() => `${document.getElementById('alias-timer').textContent} · ${document.getElementById('alias-word').textContent}`)); await page.screenshot({ path: shotFile(name) }); };
  await snap('alias-1');
  // По нажатию в секунду: таймер идёт сам.
  for (const [n, re] of [[2, '^Отгадано'], [3, '^Отгадано'], [4, '^Пропустить']]) {
    await page.clock.runFor(1000);
    await tap(re);
    await page.clock.runFor(40);
    await snap(`alias-${n}`);
  }
  if (!/^60/.test(a.shots[0]) || !/^57/.test(a.shots[3])) failures.push(`алиас: таймер ${a.shots.join(' | ')}`);
  layout.alias = a;
  if (errors.length) failures.push(`алиас: ${errors.join(' | ')}`);
  await context.close();
  console.log(`алиас снят: ${a.shots.join(' | ')}`);
}

// ——— «Опиши слово»: игрок 1 из 4 — «радуга» ———
if (want('describe')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
  await page.evaluate(() => { window.showGame('describe'); });
  await page.getByRole('button', { name: 'Начать игру' }).click();
  await page.waitForSelector('button:has-text("Показать слово")', { timeout: 20_000 });
  await page.evaluate(() => { describePlayers[0] = 'радуга'; });
  const d = {};
  d.card1 = await rectOf(page, '#game-container .card');
  d.show = await buttonRect(page, 'Показать слово');
  await page.screenshot({ path: shotFile('describe-1') });
  await page.getByRole('button', { name: 'Показать слово' }).click();
  await page.waitForTimeout(400);
  d.card2 = await rectOf(page, '#game-container .card');
  d.word = await rectOf(page, '#game-container .card h3');
  d.next = await buttonRect(page, 'Следующий игрок');
  d.text = await page.evaluate(() => document.querySelector('#game-container .card')?.textContent.replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: shotFile('describe-2') });
  await page.getByRole('button', { name: 'Следующий игрок' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotFile('describe-3') });
  layout.describe = d;
  if (errors.length) failures.push(`опиши: ${errors.join(' | ')}`);
  await context.close();
  console.log(`опиши снято: ${d.text}`);
}

// ——— «Соглядатай»: на одном телефоне, игрок 1 — соглядатай ———
if (want('spy')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
  await page.evaluate(() => { window.showGame('spy'); });
  await page.getByRole('button', { name: /На одном телефоне/ }).click();
  await page.getByRole('button', { name: 'Начать игру' }).click();
  await page.waitForSelector('#spy-role-card', { timeout: 20_000 });
  // Кому выпала роль — случай игры; в ролике первым смотрит соглядатай.
  await page.evaluate(() => {
    spyPlayers.forEach((p, i) => { p.role = i === 0 ? 'соглядатай' : 'локация'; });
    sharedLocation = 'Египет';
    currentSpyIndex = 0;
    showNextPlayerRole();
  });
  await page.waitForTimeout(1200);
  const s = {};
  s.card = await rectOf(page, '#spy-role-card');
  s.reveal = await buttonRect(page, 'Перевернуть карточку');
  await page.screenshot({ path: shotFile('spy-1') });
  await hole(page, '#spy-role-card', 'spy-1-hole');
  s.sprite = await sprite(page, '#spy-role-card', shotFile('spy-card-back'), 40);
  await page.getByRole('button', { name: 'Перевернуть карточку' }).click();
  await page.waitForTimeout(1600);
  await sprite(page, '#spy-role-card', shotFile('spy-card-role1'), 40);
  s.next = await buttonRect(page, 'Передать следующему');
  s.text = await page.evaluate(() => document.querySelector('#spy-role-card .spy-card-value')?.textContent.replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: shotFile('spy-2') });
  // Телефон — следующему: у игрока 2 локация.
  await page.getByRole('button', { name: 'Передать следующему' }).click();
  await page.waitForTimeout(1200);
  s.card3 = await rectOf(page, '#spy-role-card');
  await page.screenshot({ path: shotFile('spy-3') });
  await hole(page, '#spy-role-card', 'spy-3-hole');
  await page.getByRole('button', { name: 'Перевернуть карточку' }).click();
  await page.waitForTimeout(1600);
  await sprite(page, '#spy-role-card', shotFile('spy-card-role2'), 40);
  s.text2 = await page.evaluate(() => document.querySelector('#spy-role-card .spy-card-value')?.textContent.replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: shotFile('spy-4') });
  if (!/Египет/.test(s.text2 || '')) failures.push(`соглядатай: у игрока 2 «${s.text2}»`);
  layout.spy = s;
  if (errors.length) failures.push(`соглядатай: ${errors.join(' | ')}`);
  await context.close();
  console.log(`соглядатай снят: ${s.text} · игрок 2: ${s.text2}`);
}

// ——— «Найди пару для ковчега»: киты и черепахи ———
if (want('pairs')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
  await page.evaluate(() => { window.showGame('kids-ark-pairs'); });
  await page.waitForSelector('[data-mode]', { timeout: 20_000 });
  await page.locator('[data-mode]').first().click();
  // «У воды» — звери моря и берегов: из последней пары в ролике разливается Нил.
  await page.locator('[data-collection]', { hasText: 'У воды' }).click();
  await page.locator('[data-diff]').first().click();
  await page.waitForSelector('.kids-card', { timeout: 20_000 });
  await page.waitForTimeout(1600);
  const p = {};
  p.cards = await page.evaluate(() => [...document.querySelectorAll('.kids-card')].map((c) => { const r = c.getBoundingClientRect(); return { idx: +c.dataset.idx, emoji: c.dataset.emoji, label: c.dataset.label, x: r.left, y: r.top, w: r.width, h: r.height }; }));
  const pair = (emoji) => p.cards.filter((c) => c.emoji === emoji).map((c) => c.idx);
  // Раскладка — случай игры: первыми открываются две пары, что лежат ближе к началу поля.
  p.firstEmoji = p.cards[0].emoji;
  p.first = pair(p.firstEmoji);
  p.lastEmoji = p.cards.find((c) => c.emoji !== p.firstEmoji).emoji;
  p.last = pair(p.lastEmoji);
  p.header = await page.evaluate(() => document.querySelector('.kids-card')?.closest('section, main, div')?.parentElement?.querySelector('h2, h1')?.textContent.trim());
  const progress = () => page.evaluate(() => [...document.querySelectorAll('.kids-metric')].map((m) => m.textContent.replace(/\s+/g, ' ').trim()).join(' · '));
  p.progress = [await progress()];
  await page.screenshot({ path: shotFile('pairs-1') });
  p.sprite = await sprite(page, `.kids-card[data-idx="${p.first[0]}"]`, shotFile('pairs-card-closed'), 12);
  let n = 2;
  for (const idx of [p.first[0], p.first[1], p.last[0], p.last[1]]) {
    await hole(page, `.kids-card[data-idx="${idx}"]`, `pairs-hole-${n}`);
    await page.click(`.kids-card[data-idx="${idx}"]`);
    await page.waitForTimeout(n % 2 ? 1300 : 700);
    p.progress.push(await progress());
    await page.screenshot({ path: shotFile(`pairs-${n}`) });
    await sprite(page, `.kids-card[data-idx="${idx}"]`, shotFile(`pairs-card-open-${n}`), 12);
    n += 1;
  }
  layout.pairs = p;
  if (errors.length) failures.push(`пары: ${errors.join(' | ')}`);
  await context.close();
  console.log(`пары сняты: ${p.firstEmoji} ${p.first}, ${p.lastEmoji} ${p.last} · ${p.progress.join(' → ')}`);
}

fs.writeFileSync(layoutFile, JSON.stringify(layout, null, 1));
fs.writeFileSync(path.join(SHOTS, 'layout.js'), `window.LAYOUT60 = ${JSON.stringify(layout)};\n`);
await browser.close();
await srv.close();

execFileSync('python3', ['-c', `
import sys, os
from PIL import Image
raw, out, names = sys.argv[1], sys.argv[2], sys.argv[3:]
for n in names:
    im = Image.open(os.path.join(raw, n))
    dst = os.path.join(out, n[:-4] + '.webp')
    # проверка проекта не пускает картинки больше 600 КиБ
    for q in (90, 86, 82, 78, 74):
        im.save(dst, 'WEBP', quality=q, method=6)
        if os.path.getsize(dst) <= 600 * 1024:
            break
`, RAW, SHOTS, ...made]);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`готово: ${made.length} файлов в promo/ad-60/shots`);
