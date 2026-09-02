// Собирает web/styles/dark-theme.css из остальных стилей приложения.
//
//   node scripts/build-dark-theme.mjs           записать файл
//   node scripts/build-dark-theme.mjs --check   упасть, если файл отстал от исходников
//
// Тёмную тему нельзя было написать руками: цвет здесь почти всегда записан литералом
// прямо в правиле — 2970 литералов против 709 обращений к токенам, 1225 разных
// значений. Зато 92% из них стоят в background, color и border, где назначение видно
// из самого свойства. Поэтому тема выводится механически: цвет разбирается в HSL,
// светлота отражается (L -> 100-L) с поджатием к краям, чтобы белое стало тёмно-серым,
// а не чёрным. Тон и насыщенность сохраняются, поэтому фирменные синий и золотой
// остаются собой.
//
// Два обстоятельства, на которых первая версия темы провалилась:
//
//   * в проекте 2108 объявлений с !important, и тема без него им проигрывала;
//   * заголовки карточек не имеют своего color и наследуют его от body, а body
//     покрашен селектором «html body» из typography.css — специфичность выше, чем
//     у простого «body».
//
// Отсюда !important на каждом объявлении и та же специфичность в хвосте файла.

import fs from 'node:fs';
import path from 'node:path';
import { styleSources } from './web-sources.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = 'web/styles/dark-theme.css';
const check = process.argv.includes('--check');

// --- цвет ---------------------------------------------------------------------

function parseColor(text) {
  const hex = text.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let body = hex[1];
    if (body.length === 3 || body.length === 4) body = [...body].map((c) => c + c).join('');
    if (body.length !== 6 && body.length !== 8) return null;
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
      a: body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = text.match(/^rgba?\(([^)]*)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1].split(/[,/\s]+/).filter(Boolean);
  if (parts.length < 3 || parts.some((p) => !/^-?[\d.]+%?$/.test(p))) return null;
  const num = (value, scale) => (value.endsWith('%') ? (parseFloat(value) / 100) * scale : parseFloat(value));
  return {
    r: num(parts[0], 255),
    g: num(parts[1], 255),
    b: num(parts[2], 255),
    a: parts[3] === undefined ? 1 : num(parts[3], 1),
  };
}

function toHsl({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  return { h, s, l };
}

function toRgb({ h, s, l }) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: Math.round(channel(h + 1 / 3) * 255),
    g: Math.round(channel(h) * 255),
    b: Math.round(channel(h - 1 / 3) * 255),
  };
}

/**
 * Отражает светлоту и поджимает её к рабочему диапазону.
 *
 * Поверхность, которая и в светлой теме была тёмной — синяя шапка админки, рубашка
 * карты в «Квартете», — в тёмной теме должна остаться тёмной: отражать её значит
 * выжечь на экране светлое пятно. Для текста это не так: тёмный текст обязан стать
 * светлым, иначе его не прочесть.
 */
function invert(color, { surface = false, ink = false } = {}) {
  const hsl = toHsl(color);
  if (surface && hsl.l < 0.46) return null;
  // Обратное правило для текста. Белые буквы в светлой теме белые не случайно:
  // под ними цветная или тёмная кнопка — на белом фоне их было бы не видно, и
  // такого в исходниках просто нет. Фон под ними тёмным и остаётся: правило
  // поверхности выше не пускает тёмное в светлое, а цветное темнеет. Значит и
  // буквы должны остаться светлыми. Отражённые, они превращались в #141414 —
  // почти чёрное на тёмно-синей кнопке.
  if (ink && hsl.l > 0.62) return null;
  const l = 0.08 + (1 - hsl.l) * 0.84;
  // У очень тёмных поверхностей гасим насыщенность: иначе подложка читается как
  // заливка цветом, а не как поверхность.
  const s = l < 0.3 ? hsl.s * 0.7 : hsl.s;
  const { r, g, b } = toRgb({ h: hsl.h, s, l });
  return color.a < 1
    ? `rgba(${r}, ${g}, ${b}, ${Number(color.a.toFixed(3))})`
    : `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// --- разбор CSS ----------------------------------------------------------------

const COLOR_PROPERTIES = /^(?:background|background-color|color|border|border-[a-z]+|border-[a-z]+-color|outline|outline-color|fill|stroke|caret-color|text-decoration-color|column-rule-color|accent-color|--[\w-]+)$/;
const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

/** Разворачивает файл в правила { at, selector, body }. */
function readRules(css) {
  const rules = [];
  const stack = [];
  let index = 0;
  let buffer = '';

  while (index < css.length) {
    const char = css[index];
    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2);
      index = end === -1 ? css.length : end + 2;
      continue;
    }
    if (char === '{') {
      const head = buffer.trim();
      buffer = '';
      if (head.startsWith('@')) {
        // @media/@supports сохраняем как контекст; @keyframes и @font-face в тёмной
        // теме не участвуют — переносить кадры анимаций незачем.
        const nested = /^@(?:media|supports|layer)/i.test(head);
        stack.push({ at: nested ? head : null, skip: !nested });
        index += 1;
        continue;
      }
      let depth = 1;
      let body = '';
      index += 1;
      while (index < css.length && depth > 0) {
        if (css[index] === '{') depth += 1;
        else if (css[index] === '}') { depth -= 1; if (!depth) break; }
        body += css[index];
        index += 1;
      }
      index += 1;
      if (!stack.some((frame) => frame.skip)) {
        rules.push({ at: stack.map((frame) => frame.at).filter(Boolean), selector: head, body });
      }
      continue;
    }
    if (char === '}') {
      stack.pop();
      buffer = '';
      index += 1;
      continue;
    }
    buffer += char;
    index += 1;
  }
  return rules;
}

function darkDeclarations(body) {
  // Текст, закрашенный градиентом через background-clip: text, берёт цвет из
  // background: отражать его нельзя, заголовок станет тёмным на тёмном.
  if (/background-clip\s*:\s*text|-webkit-text-fill-color/i.test(body)) return [];

  const out = [];
  // Комментарии надо убрать и внутри правила: объявление, стоящее сразу за
  // комментарием, иначе склеивается с ним, и его имя перестаёт быть именем
  // свойства. Так терялся --ink, а с ним цвет текста всех карточек меню.
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const piece of clean.split(';')) {
    const at = piece.indexOf(':');
    if (at === -1) continue;
    const prop = piece.slice(0, at).trim().toLowerCase();
    const raw = piece.slice(at + 1).trim();
    if (!prop || !raw || !COLOR_PROPERTIES.test(prop)) continue;

    const value = raw.replace(/\s*!important\s*$/i, '');
    COLOR_TOKEN.lastIndex = 0;
    if (!COLOR_TOKEN.test(value)) continue;
    COLOR_TOKEN.lastIndex = 0;

    // Переменные могут значить что угодно, поэтому к ним правило поверхности не
    // применяется — иначе тёмный токен текста остался бы тёмным.
    const surface = /^(?:background|background-color|border|border-[a-z-]+|outline|outline-color)$/.test(prop);
    // Только color: переменная с тем же белым может оказаться фоном карточки
    // (--surface-solid), и оставить её светлой значит выжечь белое пятно.
    const ink = prop === 'color';
    let changed = false;
    let kept = false;
    const next = value.replace(COLOR_TOKEN, (match) => {
      const parsed = parseColor(match);
      if (!parsed) return match;
      const inverted = invert(parsed, { surface, ink });
      if (inverted === null) { kept = true; return match; }
      changed = true;
      return inverted;
    });
    if (!changed && kept) continue;
    // !important на каждом объявлении: в приложении 2108 таких правил в светлой
    // палитре, и без этого тема проигрывает им везде, где они есть.
    if (changed) out.push(`${prop}: ${next} !important`);
  }
  return out;
}

// --- сборка --------------------------------------------------------------------

// Часть стилей в бандл не входит: их подключают лаунчеры игр уже после него.
// Тема обязана покрывать и их, иначе экраны этих игр остаются светлыми на тёмном.
// Порядок им она проигрывает, но выигрывает специфичностью — см. префикс html ниже.
const LAUNCHED_SEPARATELY = [
  'web/games/quartet-v2.css',
  'web/games/quartet-mobile.css',
  'web/games/bible-sketch.css',
  'web/games/bible-sketch-landscape-v2.css',
  'web/styles/biblical-match-three.css',
  'web/styles/biblical-match-three-v23-polish.css',
  'web/styles/biblical-match-three-v24-board.css',
  'web/styles/biblical-match-three-v45.css',
  'web/styles/game-entry-loader.css',
  'web/styles/game-friend-invites.css',
  'web/styles/social-dock-v2.css',
  'web/styles/v22-home-art.css',
  'web/styles/v22-visual-polish.css',
];

const sources = [...new Set([...styleSources, ...LAUNCHED_SEPARATELY])]
  .filter((source) => fs.existsSync(path.join(root, source)));

const chunks = [];
for (const source of sources) {
  if (source === output) continue;
  const css = fs.readFileSync(path.join(root, source), 'utf8');
  const parts = [];
  for (const rule of readRules(css)) {
    const declarations = darkDeclarations(rule.body);
    if (!declarations.length) continue;
    // Часть игровых стилей подключается лаунчером уже после бандла, поэтому при
    // равном !important они выигрывают у темы просто порядком. Префикс html поднимает
    // специфичность каждого правила темы на единицу и возвращает ей верх.
    const selector = rule.selector
      .split(',')
      .map((one) => one.trim())
      .filter(Boolean)
      .map((one) => (/^(?:html|:root)\b/.test(one) ? one : `html ${one}`))
      .join(',\n');
    const block = `${selector} {\n  ${declarations.join(';\n  ')};\n}`;
    parts.push(rule.at.length ? `${rule.at.join(' {\n')} {\n${block}\n${'}'.repeat(rule.at.length)}` : block);
  }
  if (parts.length) chunks.push(`/* ${source} */\n${parts.join('\n')}`);
}

// «html body», а не «body»: typography.css красит текст именно так, и простой
// селектор ему проигрывает по специфичности. Заголовки карточек своего цвета не
// имеют и наследуют его отсюда.
const tail = `
/* Подложка и наследуемый цвет текста. */
html, html body {
  background: #12151c !important;
  color: #d6dae3 !important;
}

/* Иконки и картинки нарисованы для светлого фона: на тёмном они выжигают экран. */
img, video, .game-card__img, .home-continue__icon img {
  filter: brightness(.88) contrast(1.02) !important;
}
/* Фон главного меню — светлая иллюстрация во весь экран, и прямо по ней идут
   подписи секций. Без затемнения они тонут в её подсветке. */
.home-gamehub-parallax__scene,
.home-gamehub-parallax__layer,
.gamehub-boot__scene,
.gamehub-boot__layer {
  filter: brightness(.4) saturate(.88) !important;
}
`;

const content = `/* Собрано scripts/build-dark-theme.mjs — не редактируйте вручную.
   Светлота каждого цвета отражена, тон и насыщенность сохранены. */

:root[data-theme="dark"] { color-scheme: dark; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; }

${chunks.join('\n\n')}
${tail}
}
`;

const target = path.join(root, output);
const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
if (check) {
  if (previous !== content) {
    console.error(`${output} отстал от исходников. Выполните "npm run build:dark" и закоммитьте результат.`);
    process.exit(1);
  }
  console.log(`Тёмная тема свежая: ${output} соответствует исходникам.`);
} else {
  fs.writeFileSync(target, content);
  console.log(`${output}  ${(content.length / 1024).toFixed(0)} KiB, ${(content.match(/\{/g) || []).length} блоков`);
}
