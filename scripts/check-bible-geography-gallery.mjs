// Проверяет галерею региональных иллюстраций в атласе: 134 точки,
// изображения, источники географического контекста и локализованный интерфейс.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJSON = (file) => JSON.parse(read(file));
const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

const game = read('web/games/bible-geography.js');
const style = read('web/games/bible-geography.css');
const builder = read('scripts/build-bible-geography-preview.mjs');
const places = readJSON('web/data/bible_geography.json').places;
const gallery = readJSON('web/data/bible_geography_gallery.json');
const placeIds = new Set(places.map((place) => place.id));
const assetIds = new Set(Object.keys(gallery.assets || {}));
const referencedAssets = new Set(Object.values(gallery.places || {}));

for (const place of places) {
  const assetKey = gallery.places?.[place.id];
  need(Boolean(assetKey), `${place.id}: нет региональной иллюстрации`);
  if (!assetKey) continue;
  need(Boolean(gallery.assets?.[assetKey]), `${place.id}: неизвестный набор изображений ${assetKey}`);
}
for (const id of Object.keys(gallery.places || {})) need(placeIds.has(id), `галерея ссылается на неизвестное место ${id}`);
for (const key of assetIds) {
  const asset = gallery.assets[key];
  need(referencedAssets.has(key), `${key}: иллюстрация не назначена ни одному месту`);
  need(/^https:\/\//.test(asset.sourceUrl || ''), `${key}: нужен HTTPS-источник географического контекста`);
  need(asset.region && asset.sourceLabel, `${key}: нужны подпись региона и источник`);
  const imagePath = path.join(root, asset.src || '');
  need(asset.src.startsWith('web/assets/bible-geography/locations/'), `${key}: изображение лежит вне каталога атласа`);
  if (!fs.existsSync(imagePath)) { problems.push(`${key}: файл изображения не найден (${asset.src})`); continue; }
  const bytes = fs.readFileSync(imagePath);
  need(bytes.length > 10_000 && bytes.length <= 400_000, `${key}: подозрительный размер WebP (${bytes.length} байт)`);
  need(bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP', `${key}: неверный формат WebP`);
  for (const lang of ['ru', 'en', 'de', 'es']) {
    need(Boolean(asset.i18n?.region?.[lang]), `${key}: нет перевода региона ${lang}`);
    need(Boolean(asset.i18n?.sourceLabel?.[lang]), `${key}: нет перевода ссылки ${lang}`);
  }
}
need(Object.keys(gallery.places || {}).length === placeIds.size, `назначено мест ${Object.keys(gallery.places || {}).length}, ожидалось ${placeIds.size}`);
need(assetIds.size === 28, `наборов региональных иллюстраций ${assetIds.size}, ожидалось 28`);

for (const key of ['title', 'position', 'previous', 'next', 'focus', 'places', 'disclaimer', 'context', 'landscape']) {
  for (const lang of ['ru', 'en', 'de', 'es']) need(Boolean(gallery.copy?.i18n?.[key]?.[lang]), `нет перевода ${key}.${lang}`);
}
for (const needle of [
  'web/data/bible_geography_gallery.json',
  'web/locales/${lang}/data/bible_geography_gallery.json',
]) need(builder.includes(needle), `preview builder не копирует ${needle}`);
for (const action of ['gallery-prev', 'gallery-next', 'gallery-index', 'gallery-focus']) need(game.includes(`'${action}'`), `нет обработчика ${action}`);
need(game.includes('loading="lazy"') && game.includes('decoding="async"'), 'изображения галереи должны загружаться лениво');
need(game.includes('aria-live="polite"') && game.includes('aria-pressed='), 'карусели нужны доступные объявления текущего кадра и состояния миниатюр');
need(style.includes('.geo-gallery__thumbs') && style.includes('overflow-x: auto'), 'лента миниатюр должна прокручиваться по горизонтали');
need(style.includes('@media (max-width: 380px)'), 'нет мобильных правил галереи');

for (const lang of ['en', 'de', 'es']) {
  const file = `web/locales/${lang}/data/bible_geography_gallery.json`;
  if (!fs.existsSync(path.join(root, file))) { problems.push(`${file}: сначала запустите npm run build`); continue; }
  const translated = readJSON(file);
  need(translated.copy?.title && translated.copy?.disclaimer, `${lang}: переводы галереи не собраны`);
  need(!/[А-Яа-яЁё]/.test(JSON.stringify(translated)), `${lang}: в данных галереи остался русский текст`);
  need(Object.keys(translated.places || {}).length === placeIds.size, `${lang}: после перевода изменилось число точек галереи`);
}

if (problems.length) {
  console.error(`Галерея библейской географии: ${problems.length} проблем(ы):\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Галерея библейской географии: OK — ${placeIds.size} мест, ${assetIds.size} регионов, 4 языка.`);
}
