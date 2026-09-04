// Экран рисования «Библейского художника» в альбомной ориентации.
//
// Отзыв был такой: в горизонтальном положении не пролистнуть вниз и не выбрать
// кисть или цвет, таймер подлагивает, а при стирании начинается заново.
// Причина у всего оказалась общая по духу — экран собирали правила, которые
// перебивали друг друга, — но проверять это чтением стилей бессмысленно: в
// каждом файле по отдельности всё написано верно. Поэтому экран открывается
// по-настоящему, комната берётся из движка, а связь подменяется.
//
// Что здесь стережётся:
//   * холст занимает высоту, а не ладонь — с него игра и начинается;
//   * до каждого инструмента можно дотянуться пальцем, без скрытой прокрутки;
//   * часы показывают время сразу в разметке и переживают перерисовку.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { prepareSketchPage, openSketchStage } from './lib/bible-sketch-stage.mjs';
import { sketchView } from './lib/bible-sketch-view.mjs';

const root = process.cwd();
const failures = [];
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
]);
const check = (condition, message) => { if (!condition) throw new Error(message); };

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
let browser;

try {
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

  await prepareSketchPage(context, page, sketchView({ strokes: 3 }));
  await openSketchStage(page, baseURL);

  // 1. Порядок листов: альбомный обязан идти после базового, иначе он молчит.
  const sheets = await page.evaluate(() => [...document.styleSheets]
    .map((sheet) => String(sheet.href || '')).filter((href) => href.includes('bible-sketch')));
  const base = sheets.findIndex((href) => href.includes('bible-sketch.css'));
  const landscape = sheets.findIndex((href) => href.includes('bible-sketch-landscape-v2.css'));
  check(base >= 0 && landscape > base, `Альбомный лист подключён раньше базового: ${sheets.join(' | ')}`);

  const layout = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const tools = document.querySelector('.bsk-tools');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      canvas: box('.bsk-canvas'),
      tools: box('.bsk-tools'),
      hiddenScroll: tools ? tools.scrollWidth - tools.clientWidth : -1,
      controls: [...document.querySelectorAll('.bsk-color, .bsk-tool, .bsk-finish-turn')].map((element) => {
        const rect = element.getBoundingClientRect();
        const centre = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          name: (element.textContent || element.dataset.action || element.dataset.color || 'цвет').trim().slice(0, 14),
          bottom: rect.bottom,
          reachable: Boolean(centre && (centre === element || element.contains(centre))),
          size: Math.min(rect.width, rect.height),
        };
      }),
    };
  });

  // 2. Холст — это игра. Ему полагается высота, а не остатки.
  check(layout.canvas.height >= layout.viewport.height * 0.5,
    `Холст занимает ${Math.round(layout.canvas.height)} из ${layout.viewport.height} px высоты`);

  // 3. Инструменты доступны пальцем: на экране, не под чужим слоем, не в скрытой
  //    прокрутке и не мельче того, во что можно попасть.
  check(layout.hiddenScroll <= 1, `Полоса инструментов прячет ${layout.hiddenScroll} px в боковой прокрутке`);
  const unreachable = layout.controls.filter((control) => !control.reachable || control.bottom > layout.viewport.height);
  check(!unreachable.length, `До инструментов не дотянуться: ${unreachable.map((c) => c.name).join(', ')}`);
  const tiny = layout.controls.filter((control) => control.size < 22);
  check(!tiny.length, `Слишком мелкие цели: ${tiny.map((c) => `${c.name} ${Math.round(c.size)}px`).join(', ')}`);

  // 4. Часы: время стоит в разметке сразу и переживает перерисовку экрана.
  const first = await page.evaluate(() => document.getElementById('bsk-timer')?.textContent || '');
  check(/^\d+с$/.test(first), `Часы показывают «${first}» вместо секунд`);

  const width = await page.evaluate(() => document.getElementById('bsk-progress')?.style.width || '');
  check(width && width !== '100%', `Полоса времени стоит на ${width || 'пустом значении'} вместо остатка хода`);

  /*
    Перерисовка. Состояние комнаты приходит целиком на каждое действие любого
    игрока — на каждый штрих и на очистку холста, — и экран собирается заново.
    Здесь это и делается: подменённый сокет при создании присылает то же
    состояние. Раньше на этом месте часы показывали «—» и полную полосу, а
    настоящее время возвращалось только со следующим тиком.
  */
  const redrawn = await page.evaluate(async () => {
    // Значение снимается в тот миг, когда разметка встала в документ. Читать его
    // позже бессмысленно: тик часов идёт четыре раза в секунду и успевает
    // поправить что угодно — именно поэтому глазами сброс виден, а проверке нет.
    const seen = { text: '', width: '' };
    const observer = new MutationObserver((records) => {
      if (seen.text) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const timer = node.matches?.('#bsk-timer') ? node : node.querySelector?.('#bsk-timer');
          if (!timer) continue;
          seen.text = timer.textContent || '';
          seen.width = (node.querySelector?.('#bsk-progress') || document.getElementById('bsk-progress'))?.style.width || '';
          return;
        }
      }
    });
    observer.observe(document.getElementById('game-container'), { childList: true, subtree: true });
    window.__pushState();
    await new Promise((resolve) => setTimeout(resolve, 400));
    observer.disconnect();
    return seen;
  });
  check(/^\d+с$/.test(redrawn.text), `После перерисовки часы показывают «${redrawn.text}»`);
  check(redrawn.width !== '100%', `После перерисовки полоса времени прыгнула на ${redrawn.width}`);

  check(pageErrors.length === 0, `pageerror: ${pageErrors.join(' | ')}`);
  await context.close();
  console.log(`OK: экран рисования в альбомной ориентации — холст ${Math.round(layout.canvas.width)}×${Math.round(layout.canvas.height)}, `
    + `${layout.controls.length} инструментов доступны пальцем без скрытой прокрутки, часы не сбрасываются на перерисовке.`);
} catch (error) {
  failures.push(error.message);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Bible Sketch stage check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
