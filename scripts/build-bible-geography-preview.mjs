// Собирает отдельное превью «Библейской географии».
//
//   node scripts/build-bible-geography-preview.mjs [папка]   (по умолчанию preview-dist/bible-geography)
//
// Игру показывают до того, как она попадёт в main и в меню приложения. Целиком
// приложение для этого не годится: его ядро отвечает только страницам с
// vidalost.github.io, и копия на другом адресе осталась бы без входа и комнат.
// Игре же сервер не нужен — она живёт в своих файлах и localStorage. Поэтому
// превью — одна страница с этой игрой: те же файлы, тот же общий стиль
// приложения, переключатель языка и темы. Ничего из основного приложения оно не
// трогает и ни с какими его серверами не говорит.
//
// Результат — папка public/ и wrangler.jsonc для воркера без кода, который
// только раздаёт файлы. Выкладывает её .github/workflows/deploy-bible-geography-preview.yml.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, process.argv[2] || 'preview-dist/bible-geography');
const pub = path.join(out, 'public');
export const WORKER = 'alias-spy-games-bible-geography-preview';
const LANGS = ['en', 'de', 'es'];

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// Общий стиль приложения — тот же бандл, что у страницы: кнопки, шрифт,
// загрузчик и тёмная тема выглядят так же, как будут в меню.
const css = index.match(/href="(web\/dist\/app\.[0-9a-f]+\.css)"/)?.[1];
if (!css) throw new Error('в index.html не нашёлся бандл стилей web/dist/app.*.css');

const files = [
  css,
  'web/games/bible-geography.js',
  'web/games/bible-geography-logic.js',
  'web/games/bible-geography.css',
  'web/data/bible_geography.json',
  'web/assets/icons/unified-v1/bible-geography.svg',
  ...LANGS.flatMap((lang) => [
    `web/locales/${lang}/games/bible-geography.js`,
    `web/locales/${lang}/games/bible-geography-logic.js`,
    `web/locales/${lang}/games/bible-geography.css`,
    `web/locales/${lang}/data/bible_geography.json`,
  ]),
];
// Шрифты, на которые ссылается бандл стилей.
const bundle = fs.readFileSync(path.join(root, css), 'utf8');
for (const [, url] of bundle.matchAll(/url\((\.\.\/assets\/fonts\/[^)?#]+)/g)) {
  files.push(path.posix.join('web/dist', url));
}
// Карта и всё, что для неё нарисуют: art.json и картинки слоёв.
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
files.push(...walk('web/assets/bible-geography'));

fs.rmSync(out, { recursive: true, force: true });
for (const file of new Set(files)) {
  const from = path.join(root, file);
  if (!fs.existsSync(from)) throw new Error(`нет файла ${file} — запустите npm run build`);
  fs.mkdirSync(path.dirname(path.join(pub, file)), { recursive: true });
  fs.copyFileSync(from, path.join(pub, file));
}

const commit = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local';
fs.writeFileSync(path.join(pub, 'index.html'), `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <script>
    (() => {
      try {
        var choice = localStorage.getItem('theme_choice_v1');
        var dark = choice === 'dark' || (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('theme-dark', dark);
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      } catch (error) { /* приватный режим */ }
    })();
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <meta name="preview-build" content="bible-geography-${commit}" />
  <title>Библейская география · превью</title>
  <link rel="icon" href="web/assets/icons/unified-v1/bible-geography.svg" />
  <link rel="stylesheet" href="${css}" />
  <style>
    .geo-preview-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px 10px; flex-wrap: wrap; max-width: 760px; margin: 0 auto; padding: calc(10px + env(safe-area-inset-top)) 16px 0; font: 700 13px/1.2 system-ui, sans-serif; }
    .geo-preview-bar b { padding: 5px 10px; border-radius: 999px; background: #b45309; color: #fff; letter-spacing: .08em; font-size: 11px; }
    .geo-preview-bar span { color: #667085; }
    .geo-preview-tools { display: flex; gap: 6px; }
    .geo-preview-bar button { min-width: 40px; padding: 7px 10px; border: 1px solid rgba(79, 70, 229, .25); border-radius: 10px; background: rgba(255, 255, 255, .8); color: #312e81; font: inherit; cursor: pointer; }
    .geo-preview-bar button[aria-pressed="true"] { background: #4f46e5; border-color: #4f46e5; color: #fff; }
    html.theme-dark .geo-preview-bar span { color: #9096b0; }
    html.theme-dark .geo-preview-bar button { background: #141a2e; border-color: #2b3360; color: #c2cde4; }
    html.theme-dark .geo-preview-bar button[aria-pressed="true"] { background: #3b33c9; color: #fff; }
  </style>
</head>
<body data-current-game="bible-geography">
  <nav class="geo-preview-bar" aria-label="Превью">
    <div><b>ПРЕВЬЮ</b> <span>не опубликовано · ${commit}</span></div>
    <div class="geo-preview-tools">
      <button type="button" data-lang="ru">RU</button><button type="button" data-lang="en">EN</button><button type="button" data-lang="de">DE</button><button type="button" data-lang="es">ES</button>
      <button type="button" data-theme aria-label="Тема">◐</button>
    </div>
  </nav>
  <main id="game-container"></main>
  <script>
    (() => {
      const LANGS = ['ru', ${LANGS.map((lang) => `'${lang}'`).join(', ')}];
      const asked = new URLSearchParams(location.search).get('lang');
      let lang = 'ru';
      try { lang = LANGS.includes(asked) ? asked : (localStorage.getItem('app_language_v1') || 'ru'); } catch (error) { /* приватный режим */ }
      if (!LANGS.includes(lang)) lang = 'ru';
      document.documentElement.lang = lang;
      for (const button of document.querySelectorAll('[data-lang]')) {
        button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
        button.addEventListener('click', () => {
          try { localStorage.setItem('app_language_v1', button.dataset.lang); } catch (error) { /* приватный режим */ }
          const url = new URL(location.href);
          url.searchParams.set('lang', button.dataset.lang);
          location.href = url.toString();
        });
      }
      document.querySelector('[data-theme]').addEventListener('click', () => {
        const dark = !document.documentElement.classList.contains('theme-dark');
        document.documentElement.classList.toggle('theme-dark', dark);
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
        try { localStorage.setItem('theme_choice_v1', dark ? 'dark' : 'light'); } catch (error) { /* приватный режим */ }
      });
      // В приложении «В главное меню» уводит в меню; здесь меню нет — игра
      // открывается заново, на выборе режима.
      window.goToMainMenu = () => window.startBibleGeographyGame?.();
      window.appGoToMainMenu = window.goToMainMenu;
      const script = document.createElement('script');
      script.src = (lang === 'ru' ? 'web/games/bible-geography.js' : 'web/locales/' + lang + '/games/bible-geography.js') + '?b=${commit}';
      script.onload = () => window.startBibleGeographyGame();
      document.body.appendChild(script);
    })();
  </script>
</body>
</html>
`);

fs.writeFileSync(path.join(out, 'wrangler.jsonc'), `// Собрано scripts/build-bible-geography-preview.mjs. Воркер без кода: только раздаёт public/.
{
  "name": "${WORKER}",
  "compatibility_date": "2026-08-01",
  "workers_dev": true,
  "assets": { "directory": "./public" }
}
`);

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((sum, entry) => sum + (entry.isDirectory() ? size(path.join(dir, entry.name)) : fs.statSync(path.join(dir, entry.name)).size), 0);
console.log(`Превью «Библейской географии»: ${path.relative(root, out) || out}, ${new Set(files).size + 1} файлов, ${(size(pub) / 1024 / 1024).toFixed(1)} МБ.`);
