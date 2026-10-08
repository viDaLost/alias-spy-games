// Собирает основу карты «Библейской географии» — web/data/bible_geography_map.json.
//
//   node scripts/build-bible-geography-map.mjs                 собрать (скачает данные, если их нет)
//   node scripts/build-bible-geography-map.mjs --source DIR    взять слои Natural Earth из папки
//   node scripts/build-bible-geography-map.mjs --check         упасть, если файл отстал от сборщика
//
// Откуда что. Берега, озёра, реки и государственные границы — Natural Earth
// (общественное достояние), масштаб 1:10 000 000. Слои закреплены по sha256:
// ветка однажды поменяется, и пересобранная карта должна отличаться заметно,
// а не молча.
//
// Почему карта рисуется самой игрой, а не только картинкой. Картинку рисует
// модель, и её берега могут лечь на сотню километров мимо — точки городов тогда
// окажутся в море. Векторная основа точна до километра, весит десятки килобайт
// и работает без картинки вовсе. Картинка, когда её нарисуют, ложится под
// вектор ровно в ту же рамку (см. docs/bible-geography-art-brief.md).
//
// Проекция — равнопромежуточная: долгота и широта линейны, 1° долготы равен
// 0,8 градуса широты (это косинус 36,87° — середины рамки). Рамка 10–50° в. д.
// и 25–43° с. ш. даёт ровно 16:9. Единица карты — пиксель эталонной картинки
// 2560×1440: x = (lon − 10) · 64, y = (43 − lat) · 80.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
// Карта лежит в assets, а не в web/data: слов в ней нет, а всё из web/data сборка
// переводов копирует в каждый язык.
const output = path.join(root, 'web/assets/bible-geography/map.json');
const args = process.argv.slice(2);
const check = args.includes('--check');
const sourceDir = args.includes('--source') ? args[args.indexOf('--source') + 1] : path.join(os.tmpdir(), 'bible-geography-ne');

export const FRAME = { lon0: 10, lon1: 50, lat0: 25, lat1: 43, kx: 0.8, unit: 80 };
FRAME.w = (FRAME.lon1 - FRAME.lon0) * FRAME.kx * FRAME.unit;
FRAME.h = (FRAME.lat1 - FRAME.lat0) * FRAME.unit;
export const project = (lon, lat) => [(lon - FRAME.lon0) * FRAME.kx * FRAME.unit, (FRAME.lat1 - lat) * FRAME.unit];

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const LAYERS = {
  land: { file: 'ne_10m_land.geojson', sha256: null },
  minor: { file: 'ne_10m_minor_islands.geojson', sha256: null },
  lakes: { file: 'ne_10m_lakes.geojson', sha256: null },
  rivers: { file: 'ne_10m_rivers_lake_centerlines.geojson', sha256: null },
  borders: { file: 'ne_10m_admin_0_boundary_lines_land.geojson', sha256: null },
};
const PINS = path.join(root, 'scripts/data/bible-geography-ne.json');

// Поле, за которым рисовать уже незачем: окно карты дальше рамки не уходит,
// а обрезанный край многоугольника должен лежать за кадром, чтобы его обводка
// не притворялась берегом.
const MARGIN = 1.2;
const BOX = [FRAME.lon0 - MARGIN, FRAME.lat0 - MARGIN, FRAME.lon1 + MARGIN, FRAME.lat1 + MARGIN];

// Реки, которые рисуются на карте. Остальные реки Natural Earth не нужны: без
// подписи они только путают, где течёт Иордан. Подписи живут в данных игры
// (labels.rivers) — там их переводит сборка.
const RIVERS = {
  nile: ['Nile', 'Damietta Branch', 'Rosetta Branch'],
  jordan: ['Jordan'],
  euphrates: ['Euphrates', 'Al Furat', 'Firat'],
  tigris: ['Tigris', 'Dicle'],
  shatt: ['Shatt al Arab'],
  karkheh: ['Karkheh'],
  tiber: ['Tevere'],
  strymon: ['Strymnas'],
  meander: ['Byk Menderes'],
  halys: ['Kiz?lirmak'],
};

// Оронта у Natural Earth в этом масштабе нет, а у Антиохии он нужен: город стоит
// на нём. Русло снято по точкам вручную (исток у Баальбека, устье у Самандага).
const ORONTES = [[36.36, 34.08], [36.52, 34.40], [36.61, 34.62], [36.72, 34.74], [36.75, 35.13], [36.62, 35.48], [36.32, 35.85], [36.37, 36.05], [36.25, 36.17], [36.10, 36.20], [35.95, 36.05]];

// Мертвое море в библейское время было целым: южная котловина за Лисаном
// стояла под водой до 1970-х. Современный контур Natural Earth — северный
// бассейн и испарительные пруды. Древний контур проведён по уровню
// примерно −390 м (карты середины XX века).
const DEAD_SEA_ANCIENT = [[35.47, 31.78], [35.53, 31.76], [35.57, 31.72], [35.58, 31.62], [35.58, 31.50], [35.57, 31.40], [35.55, 31.35], [35.50, 31.33], [35.47, 31.30], [35.50, 31.26], [35.54, 31.24], [35.55, 31.18], [35.53, 31.10], [35.50, 31.05], [35.44, 31.04], [35.40, 31.08], [35.40, 31.18], [35.40, 31.27], [35.41, 31.38], [35.39, 31.48], [35.40, 31.58], [35.43, 31.68], [35.45, 31.74]];

// Озеро Хула («воды Меромские», Нав 11:5) осушено в 1950-х. На древней карте оно есть.
const HULA_ANCIENT = [[35.60, 33.10], [35.63, 33.10], [35.64, 33.07], [35.635, 33.04], [35.615, 33.03], [35.60, 33.05]];

async function layer(key) {
  const { file } = LAYERS[key];
  const local = path.join(sourceDir, file);
  if (!fs.existsSync(local)) {
    fs.mkdirSync(sourceDir, { recursive: true });
    const response = await fetch(BASE + file);
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    fs.writeFileSync(local, Buffer.from(await response.arrayBuffer()));
  }
  const body = fs.readFileSync(local);
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  const pins = fs.existsSync(PINS) ? JSON.parse(fs.readFileSync(PINS, 'utf8')) : {};
  if (pins[file] && pins[file] !== sha256) throw new Error(`${file}: sha256 ${sha256}, ожидался ${pins[file]}`);
  LAYERS[key].sha256 = sha256;
  return JSON.parse(body.toString('utf8'));
}

// --- геометрия ------------------------------------------------------------------

/** Многоугольник по Сазерленду — Ходжману против прямоугольника BOX. */
function clipRing(ring) {
  let points = ring;
  const edges = [
    (p) => p[0] >= BOX[0], (p) => p[1] >= BOX[1], (p) => p[0] <= BOX[2], (p) => p[1] <= BOX[3],
  ];
  const cross = [
    (a, b) => { const t = (BOX[0] - a[0]) / (b[0] - a[0]); return [BOX[0], a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (BOX[1] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BOX[1]]; },
    (a, b) => { const t = (BOX[2] - a[0]) / (b[0] - a[0]); return [BOX[2], a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (BOX[3] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BOX[3]]; },
  ];
  for (let e = 0; e < 4 && points.length; e += 1) {
    const inside = edges[e];
    const next = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (inside(a)) {
        next.push(a);
        if (!inside(b)) next.push(cross[e](a, b));
      } else if (inside(b)) next.push(cross[e](a, b));
    }
    points = next;
  }
  return points;
}

/** Линия, разрезанная там, где она выходит за BOX. */
function clipLine(line) {
  const inside = (p) => p[0] >= BOX[0] && p[0] <= BOX[2] && p[1] >= BOX[1] && p[1] <= BOX[3];
  const parts = [];
  let current = [];
  for (const p of line) {
    if (inside(p)) current.push(p);
    else if (current.length) { parts.push(current); current = []; }
  }
  if (current.length) parts.push(current);
  return parts.filter((part) => part.length > 1);
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax; const dy = by - ay;
    const length = Math.hypot(dx, dy) || 1e-9;
    let worst = -1; let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = points[i];
      const distance = Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
      if (distance > worst) { worst = distance; index = i; }
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/*
  Замкнутое кольцо упрощается двумя половинами. У кольца первая точка совпадает
  с последней, и прямая «от первой до последней» вырождается в точку: от неё
  все остальные лежат на нулевом расстоянии, и остров целиком схлопывается.
  Так с карты пропадали Кипр, Крит и все острова Эгейского моря.
*/
function simplifyRing(ring, tolerance) {
  const points = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
    ? ring.slice(0, -1) : ring;
  if (points.length < 4) return points;
  let far = 1; let best = -1;
  for (let i = 1; i < points.length; i += 1) {
    const distance = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (distance > best) { best = distance; far = i; }
  }
  const first = simplify(points.slice(0, far + 1), tolerance);
  const second = simplify([...points.slice(far), points[0]], tolerance);
  return [...first, ...second.slice(1, -1)];
}

const area = (ring) => {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i]; const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
};

const r1 = (n) => Math.round(n * 10) / 10;

/** Путь SVG в относительных командах: так он почти вдвое короче абсолютного. */
function pathOf(rings, closed) {
  let d = '';
  for (const ring of rings) {
    let [px, py] = [r1(ring[0][0]), r1(ring[0][1])];
    d += `M${px} ${py}`;
    let body = '';
    for (let i = 1; i < ring.length; i += 1) {
      const x = r1(ring[i][0]); const y = r1(ring[i][1]);
      const dx = r1(x - px); const dy = r1(y - py);
      if (!dx && !dy) continue;
      body += `${body ? ' ' : 'l'}${dx} ${dy}`;
      px = x; py = y;
    }
    d += body + (closed ? 'z' : '');
  }
  return d.replace(/ -/g, '-');
}

const projectRing = (ring) => ring.map(([lon, lat]) => project(lon, lat));

function polygons(geojson, filter = () => true) {
  const rings = [];
  for (const feature of geojson.features) {
    if (!filter(feature.properties || {})) continue;
    const g = feature.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) for (const ring of poly) rings.push(ring);
  }
  return rings;
}

function lines(geojson, filter = () => true) {
  const out = [];
  for (const feature of geojson.features) {
    if (!filter(feature.properties || {})) continue;
    const g = feature.geometry;
    if (!g) continue;
    const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    out.push(...parts);
  }
  return out;
}

function shape(rings, { tolerance, minArea }) {
  const out = [];
  for (const ring of rings) {
    const clipped = clipRing(ring);
    if (clipped.length < 3) continue;
    const projected = simplifyRing(projectRing(clipped), tolerance);
    if (projected.length < 3 || area(projected) < minArea) continue;
    out.push(projected);
  }
  return out;
}

/** Где подписать реку: середина самого длинного куска, который виден в рамке. */
function anchor(lines) {
  const inFrame = ([x, y]) => x > 40 && y > 40 && x < FRAME.w - 40 && y < FRAME.h - 40;
  const longest = lines.map((line) => line.filter(inFrame)).sort((a, b) => b.length - a.length)[0] || [];
  const middle = longest[Math.floor(longest.length / 2)] || [0, 0];
  return [r1(middle[0]), r1(middle[1])];
}

function strokes(parts, tolerance) {
  return parts.flatMap(clipLine).map((line) => simplify(projectRing(line), tolerance)).filter((line) => line.length > 1);
}

export async function buildMap() {
  const [land, minor, lakes, rivers, borders] = await Promise.all(
    ['land', 'minor', 'lakes', 'rivers', 'borders'].map(layer),
  );
  const coast = shape([...polygons(land), ...polygons(minor)], { tolerance: 0.45, minArea: 3 });
  // Водохранилища — XX век: на древней карте их быть не должно, на современной
  // они только отвлекают от библейских мест.
  const lakeRings = (feature) => feature.featurecla !== 'Reservoir' && !/Dead Sea|Razazah|Habbaniyah/.test(feature.name || '');
  const lakeShapes = shape(polygons(lakes, lakeRings), { tolerance: 0.35, minArea: 4 });
  const deadSeaModern = shape(polygons(lakes, (p) => /Dead Sea/.test(p.name || '')), { tolerance: 0.25, minArea: 0.5 });
  const riverOut = {};
  for (const [id, names] of Object.entries(RIVERS)) {
    const parts = lines(rivers, (p) => names.some((name) => new RegExp(`^${name.replace('?', '.')}$`).test(p.name || '')));
    const drawn = strokes(parts, 0.5);
    riverOut[id] = { at: anchor(drawn), d: pathOf(drawn, false) };
  }
  const orontes = strokes([ORONTES], 0.5);
  riverOut.orontes = { at: anchor(orontes), d: pathOf(orontes, false) };
  const borderLine = (kinds) => pathOf(strokes(lines(borders, (p) => kinds.test(p.FEATURECLA || '')), 0.5), false);
  const map = {
    note: 'Built by scripts/build-bible-geography-map.mjs from Natural Earth 1:10m. Unit: one pixel of the 2560x1440 reference image.',
    frame: FRAME,
    land: pathOf(coast, true),
    lakes: pathOf(lakeShapes, true),
    deadSea: { ancient: pathOf([projectRing(DEAD_SEA_ANCIENT)], true), modern: pathOf(deadSeaModern, true) },
    hula: pathOf([projectRing(HULA_ANCIENT)], true),
    rivers: riverOut,
    borders: {
      international: borderLine(/^International boundary/),
      disputed: borderLine(/^(Disputed|Indefinite|Line of control)/),
    },
  };
  return map;
}

if (process.argv[1] === import.meta.filename) {
  const map = await buildMap();
  const text = `${JSON.stringify(map)}\n`;
  const pins = Object.fromEntries(Object.values(LAYERS).map(({ file, sha256 }) => [file, sha256]));
  if (check) {
    const current = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
    if (current !== text) {
      console.error('web/assets/bible-geography/map.json отстал от сборщика: node scripts/build-bible-geography-map.mjs');
      process.exit(1);
    }
    console.log('Bible geography map: up to date.');
  } else {
    fs.writeFileSync(output, text);
    fs.writeFileSync(PINS, `${JSON.stringify(pins, null, 2)}\n`);
    console.log(`Bible geography map: ${(text.length / 1024).toFixed(1)} KB, land ${(map.land.length / 1024).toFixed(1)} KB.`);
  }
}
