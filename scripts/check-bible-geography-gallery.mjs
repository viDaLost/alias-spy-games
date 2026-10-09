// Проверяет изображения мест и оптимизированную галерею атласа.

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
const data = readJSON('web/data/bible_geography.json');
const places = data.places;
const gallery = readJSON('web/data/bible_geography_gallery.json');
const placeIds = new Set(places.map((place) => place.id));
const assetIds = new Set(Object.keys(gallery.assets || {}));
const usedAssets = new Set(Object.values(gallery.places || {}));
const imageSources = [];

for (const place of places) {
  const assetKey = gallery.places?.[place.id];
  need(Boolean(assetKey), `${place.id}: нет изображения`);
  if (!assetKey) continue;
  const asset = gallery.assets?.[assetKey];
  need(Boolean(asset), `${place.id}: неизвестный набор изображений ${assetKey}`);
  if (!asset) continue;
  imageSources.push(asset.src);
  need(!asset.sourceUrl && !asset.sourceLabel, `${place.id}: в данных осталась ссылка на источник`);
  need(asset.src === `web/assets/bible-geography/locations/places/${place.id}.webp`, `${place.id}: нет персонального изображения локации`);
  const imagePath = path.join(root, asset.src || '');
  if (!fs.existsSync(imagePath)) { problems.push(`${place.id}: файл изображения не найден (${asset.src})`); continue; }
  const bytes = fs.readFileSync(imagePath);
  need(bytes.length > 10_000 && bytes.length <= 400_000, `${place.id}: подозрительный размер WebP (${bytes.length} байт)`);
  need(bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP', `${place.id}: неверный формат WebP`);
}
for (const id of Object.keys(gallery.places || {})) need(placeIds.has(id), `галерея ссылается на неизвестное место ${id}`);
for (const key of assetIds) need(usedAssets.has(key), `${key}: изображение не назначено ни одному месту`);
need(Object.keys(gallery.places || {}).length === placeIds.size, `назначено мест ${Object.keys(gallery.places || {}).length}, ожидалось ${placeIds.size}`);
need(imageSources.length === placeIds.size && new Set(imageSources).size === placeIds.size, 'у локаций должны быть отдельные файлы изображений');

// Остановки маршрута Иакова из приложенного пользователем экрана имеют
// собственные, созданные для этих мест пейзажи.
const jacob = data.heroes.find((hero) => hero.id === 'jacob');
const jacobStops = jacob?.stops.map((stop) => stop.p) || [];
const jacobSources = jacobStops.map((id) => gallery.assets?.[gallery.places?.[id]]?.src).filter(Boolean);
need(jacobStops.length === 9, `у маршрута Иакова неожиданное число остановок: ${jacobStops.length}`);
need(new Set(jacobSources).size === jacobStops.length, 'остановки маршрута Иакова используют общие изображения');
for (const id of jacobStops) need(gallery.places?.[id] === id, `${id}: маршрут Иакова должен иметь персональное изображение`);

for (const [key, asset] of Object.entries(gallery.assets || {})) {
  need(usedAssets.has(key), `${key}: изображение не назначено ни одному месту`);
  need(!asset.sourceUrl && !asset.sourceLabel, `${key}: обнаружены удалённые источники`);
  if (!fs.existsSync(path.join(root, asset.src || ''))) continue;
}
need(!JSON.stringify(gallery).includes('sourceUrl') && !JSON.stringify(gallery).includes('sourceLabel'), 'в JSON остались поля источников');
need(!/sourceUrl|sourceLabel/.test(game), 'в интерфейсе остались ссылки на источники');
need(!/animation:\s*geo-flow/.test(style), 'маршрут продолжает перерисовываться из-за бесконечной анимации');
need(style.includes('.geo-map.is-moving .geo-map__content') && style.includes('will-change: transform'), 'слой маршрута и подписей не оптимизирован для жестов');
need(game.includes('this.contentLayer.style.transform = transform'), 'живой масштаб не перемещает маршрут вместе с базовой картой');
need(game.includes('this.contentLayer.style.transform = \'\''), 'после жеста не сбрасывается временный transform слоя карты');
need(game.includes('tx - (scale - 1) * this.W / 2') && game.includes('ty - (scale - 1) * this.H / 2'), 'подложка и маршрут масштабируются от разных точек отсчёта');
need(game.includes('const mapScale = Math.min(2.2, Math.max(0.28, z))') && game.includes("marker.dot.setAttribute('r'"), 'точки не привязаны к масштабу карты');
need(game.includes('node.style.strokeWidth') && game.includes('node.style.strokeDasharray'), 'линии маршрута не меняют размер вместе с картой');
need(game.includes('loading="lazy"') && game.includes('decoding="async"'), 'изображения галереи должны загружаться лениво');
need(game.includes('aria-live="polite"') && game.includes('aria-pressed='), 'карусели нужны доступные объявления текущего кадра и состояния миниатюр');
need(style.includes('.geo-gallery__thumbs') && style.includes('overflow-x: auto'), 'лента миниатюр должна прокручиваться по горизонтали');
need(style.includes('@media (max-width: 380px)'), 'нет мобильных правил галереи');
for (const needle of ['web/data/bible_geography_gallery.json', 'web/locales/${lang}/data/bible_geography_gallery.json']) {
  need(builder.includes(needle), `preview builder не копирует ${needle}`);
}
for (const action of ['gallery-prev', 'gallery-next', 'gallery-index', 'gallery-focus']) need(game.includes(`'${action}'`), `нет обработчика ${action}`);

for (const key of ['title', 'position', 'previous', 'next', 'focus', 'places', 'disclaimer', 'landscape']) {
  for (const lang of ['ru', 'en', 'de', 'es']) need(Boolean(gallery.copy?.i18n?.[key]?.[lang]), `нет перевода ${key}.${lang}`);
}

for (const lang of ['en', 'de', 'es']) {
  const file = `web/locales/${lang}/data/bible_geography_gallery.json`;
  if (!fs.existsSync(path.join(root, file))) { problems.push(`${file}: сначала запустите npm run build`); continue; }
  const translated = readJSON(file);
  need(translated.copy?.title && translated.copy?.disclaimer, `${lang}: переводы галереи не собраны`);
  need(!/[А-Яа-яЁё]/.test(JSON.stringify(translated)), `${lang}: в данных галереи остался русский текст`);
  need(Object.keys(translated.places || {}).length === placeIds.size, `${lang}: после перевода изменилось число точек галереи`);
  need(!JSON.stringify(translated).includes('sourceUrl') && !JSON.stringify(translated).includes('sourceLabel'), `${lang}: остались ссылки на источники`);
  const translatedSources = Object.values(translated.assets || {}).map((asset) => asset.src);
  need(new Set(translatedSources).size === placeIds.size, `${lang}: изображения локаций не уникальны`);
}

if (problems.length) {
  console.error(`Галерея библейской географии: ${problems.length} проблем(ы):\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Галерея библейской географии: OK — ${placeIds.size} мест; персональные изображения для ${jacobStops.length} остановок маршрута Иакова; источники скрыты; карта, точки и линии маршрута масштабируются согласованно.`);
}
