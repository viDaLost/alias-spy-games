// check-promised-land-models.mjs — модели построек «Земли обетованной».
//
// Модели собираются из чужого архива (исходники 0 A.D.) скриптом
// build-promised-land-models.mjs и ложатся в репозиторий готовыми .glb. Архива
// в репозитории нет — он весит семьдесят мегабайт, — и пересобрать их на
// проверке не из чего. Значит, проверять надо то, что и выкладывается: сами
// файлы.
//
// Каждая поломка здесь уже случалась вживую и стоила отдельного захода:
//
//   * фундамент наружу. У этих моделей земля проходит по нулю, и часть
//     геометрии уходит под него — юбка, которую движок 0 A.D. прячет в
//     рельеф: у стены семнадцать единиц из тридцати. Поставить модель «низом
//     коробки на клетку» значит выставить юбку наружу, а постройку укоротить
//     вдвое. Ловится это тем, что у собранной модели подошва ровная и широкая:
//     в самом низу лежит заметная доля всех её точек;
//   * модель выше или шире клетки — накрывает соседние и прячет подписи;
//   * лестница ступеней сбилась: башня должна быть выше дома, дом выше шатра;
//   * текстура не вшилась — постройка приезжает серым силуэтом;
//   * модель раздулась: на телефон едет лишний мегабайт.
//
// Ни одну из них не видно ни в консоли, ни глазом на общем плане доски.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'web/assets/promised-land/models');

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

/*
  Порядок — это и есть лестница поселения. Высоты заданы сборщиком; здесь
  спрашивается, что они не разъехались и идут по возрастанию, кроме ограды:
  ограда — стена, ей положено быть длинной и невысокой, и между домом и башней
  она стоит по цене, а не по росту.
*/
const LADDER = ['well', 'tent', 'house', 'wall', 'tower'];
const RISING = ['well', 'tent', 'house', 'tower'];

/*
  Фишки игроков — шесть человек. Ростом они одинаковы намеренно: фишки стоят на
  клетке рядом, и разный рост читался бы как разная важность, которой в
  правилах нет. Здесь это и спрашивается — вместе с тем, что у каждого на месте
  голова: она приходит отдельным файлом и садится на шею по скелету, а
  промахнуться мимо шеи легче лёгкого.
*/
const PEOPLE = ['citizen', 'healer', 'fisher', 'archer', 'spearman', 'javelin'];
const FIGURE_TALL = 0.42;

const TILE = 0.94;
const MAX_TALL = 0.5;
const MAX_WIDE = 0.46;
const MAX_BYTES = 700 * 1024;
const MAX_TRIANGLES = 6000;

/** Разбор .glb: заголовок, JSON и двоичный кусок. */
function readGlb(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('это не glb');
  if (buffer.readUInt32LE(4) !== 2) throw new Error('не вторая версия glTF');
  let at = 12;
  let json = null;
  let bin = null;
  while (at + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(at);
    const kind = buffer.toString('ascii', at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + size);
    if (kind === 'JSON') json = JSON.parse(body.toString('utf8'));
    if (kind.startsWith('BIN')) bin = body;
    at += 8 + size;
  }
  if (!json) throw new Error('нет JSON');
  return { json, bin, bytes: buffer.length };
}

/** Точки модели: их читает и проверка габаритов, и проверка подошвы. */
function positionsOf(glb) {
  const primitive = glb.json.meshes[0].primitives[0];
  const accessor = glb.json.accessors[primitive.attributes.POSITION];
  const view = glb.json.bufferViews[accessor.bufferView];
  const start = view.byteOffset || 0;
  const out = new Float32Array(accessor.count * 3);
  for (let i = 0; i < accessor.count * 3; i += 1) {
    out[i] = glb.bin.readFloatLE(start + i * 4);
  }
  return out;
}

need(fs.existsSync(dir), `папки моделей нет: ${path.relative(root, dir)}`);

const sizes = new Map();

for (const kind of LADDER) {
  const file = path.join(dir, `build-${kind}.glb`);
  if (!fs.existsSync(file)) {
    need(false, `нет модели build-${kind}.glb`);
    continue;
  }
  let glb;
  try {
    glb = readGlb(file);
  } catch (error) {
    need(false, `build-${kind}.glb не читается: ${error.message}`);
    continue;
  }

  need(glb.bytes <= MAX_BYTES,
    `build-${kind}.glb весит ${Math.round(glb.bytes / 1024)} КБ при пределе ${MAX_BYTES / 1024}`);

  // Текстура вшита внутрь: без неё постройка приезжает серым силуэтом.
  need(Array.isArray(glb.json.images) && glb.json.images.length > 0
    && glb.json.images[0].bufferView !== undefined,
    `у build-${kind}.glb нет вшитой текстуры`);
  need(Array.isArray(glb.json.materials) && glb.json.materials.length > 0
    && glb.json.materials[0].pbrMetallicRoughness?.baseColorTexture,
    `материал build-${kind}.glb не берёт текстуру`);

  const primitive = glb.json.meshes[0].primitives[0];
  need(primitive.attributes.NORMAL !== undefined, `у build-${kind}.glb нет нормалей`);
  need(primitive.attributes.TEXCOORD_0 !== undefined, `у build-${kind}.glb нет развёртки`);
  const triangles = glb.json.accessors[primitive.indices].count / 3;
  need(triangles > 0 && triangles <= MAX_TRIANGLES,
    `в build-${kind}.glb ${triangles} треугольников при пределе ${MAX_TRIANGLES}`);

  const points = positionsOf(glb);
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    minX = Math.min(minX, points[i]); maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]); maxY = Math.max(maxY, points[i + 1]);
    minZ = Math.min(minZ, points[i + 2]); maxZ = Math.max(maxZ, points[i + 2]);
  }
  const tall = maxY - minY;
  const wide = Math.max(maxX - minX, maxZ - minZ);
  sizes.set(kind, { tall, wide, triangles, bytes: glb.bytes });

  // Подошва на нуле: постройка стоит на клетке, а не висит и не тонет.
  need(Math.abs(minY) < 1e-4, `подошва build-${kind}.glb на высоте ${minY.toFixed(3)}, а не на нуле`);
  need(tall > 0.05 && tall <= MAX_TALL,
    `build-${kind}.glb высотой ${tall.toFixed(2)} при пределе ${MAX_TALL}`);
  need(wide > 0.05 && wide <= MAX_WIDE,
    `build-${kind}.glb шириной ${wide.toFixed(2)} при пределе ${MAX_WIDE}`);
  need(wide < TILE, `build-${kind}.glb шире клетки`);

  /*
    Плоская подошва — след того самого фундамента, выставленного наружу. Когда
    всё, что ниже нуля, прижато к нулю, в самом низу модели скапливается
    заметная доля её точек: вся юбка садится в одну плоскость. Когда фундамент
    оставлен как был, низ модели — это её нижняя грань, и точек там единицы.

    Порог взят с запасом от замера: у собранных моделей на подошве лежит от 7
    до 32 процентов точек, а у колодца, которому прижимать нечего, — ровно
    столько, сколько у него точек в нижнем кольце.
  */
  let onFloor = 0;
  for (let i = 1; i < points.length; i += 3) if (points[i] < tall * 0.002) onFloor += 1;
  const share = onFloor / (points.length / 3);
  sizes.get(kind).share = share;
}

// Лестница силуэтом: башня выше дома, дом выше шатра, шатёр выше колодца.
for (let i = 1; i < RISING.length; i += 1) {
  const low = sizes.get(RISING[i - 1]);
  const high = sizes.get(RISING[i]);
  if (!low || !high) continue;
  need(high.tall > low.tall,
    `${RISING[i]} ростом ${high.tall.toFixed(2)} не выше, чем ${RISING[i - 1]} `
    + `ростом ${low.tall.toFixed(2)} — лестница ступеней не читается силуэтом`);
}

/*
  Фундамент. Стена и башня — те две модели, у которых юбка под землёй больше
  всего, и именно на них поломка видна: без прижатия к нулю их подошва
  перестаёт быть плоской, а видимая часть укорачивается вдвое.
*/
for (const kind of ['wall', 'tower']) {
  const one = sizes.get(kind);
  if (!one) continue;
  need(one.share > 0.05,
    `у build-${kind}.glb на подошве ${(one.share * 100).toFixed(1)}% точек — `
    + 'похоже, фундамент не прижат к нулю и выставлен наружу');
}

for (const kind of PEOPLE) {
  const file = path.join(dir, `token-${kind}.glb`);
  if (!fs.existsSync(file)) {
    need(false, `нет фишки token-${kind}.glb`);
    continue;
  }
  let glb;
  try {
    glb = readGlb(file);
  } catch (error) {
    need(false, `token-${kind}.glb не читается: ${error.message}`);
    continue;
  }
  need(glb.bytes <= MAX_BYTES,
    `token-${kind}.glb весит ${Math.round(glb.bytes / 1024)} КБ при пределе ${MAX_BYTES / 1024}`);
  need(Array.isArray(glb.json.images) && glb.json.images[0]?.bufferView !== undefined,
    `у token-${kind}.glb нет вшитой текстуры`);
  /*
    Тело и голова сшиты в одну сетку, а их текстуры — в одно полотно вдвое
    шире высоты. Отдельными материалами это стоило бы двух вызовов отрисовки
    на каждую фишку, а их на доске шесть.
  */
  need(glb.json.meshes[0].primitives.length === 1,
    `token-${kind}.glb собран из ${glb.json.meshes[0].primitives.length} кусков, а нужен один`);
  /*
    Прозрачность у людей выключена намеренно: 0 A.D. держит в ней маску цвета
    игрока, а не вырез. Резать по ней — значит проделать в тунике дыры; цвет
    игрока фишке даёт круглая подставка под ногами.
  */
  need(glb.json.materials[0]?.alphaMode === 'OPAQUE',
    `token-${kind}.glb режется по прозрачности — в одежде будут дыры`);

  const points = positionsOf(glb);
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    minX = Math.min(minX, points[i]); maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]); maxY = Math.max(maxY, points[i + 1]);
  }
  const tall = maxY - minY;
  need(Math.abs(minY) < 1e-4, `token-${kind}.glb стоит на высоте ${minY.toFixed(3)}, а не на нуле`);
  need(Math.abs(tall - FIGURE_TALL) < 0.01,
    `token-${kind}.glb ростом ${tall.toFixed(2)} вместо ${FIGURE_TALL}`);
  need(maxX - minX < tall, `token-${kind}.glb шире, чем выше — на человека не похоже`);

  /*
    Голова на месте. Она приходит отдельным файлом и ставится на шею по узлу
    скелета — промахнуться легче лёгкого, и тогда фигура либо остаётся без
    головы, либо носит её у ног.

    Узнаётся это по ширине макушки. У фигуры с головой верхние четырнадцать
    процентов роста — это череп, и он узкий. У фигуры без головы там плечи, и
    они втрое шире. Замерено: с головой макушка шириной 0.018–0.019 при росте
    0.42, то есть 4–5 процентов роста; без головы — 0.057, то есть 14. Порог
    в восемь процентов лежит ровно между, с запасом в обе стороны.
  */
  let crown = 0;
  let crownWide = 0;
  for (let i = 0; i < points.length; i += 3) {
    if (points[i + 1] < tall * 0.86) continue;
    crown += 1;
    crownWide = Math.max(crownWide, Math.abs(points[i]));
  }
  need(crown > 100, `у token-${kind}.glb под макушкой ${crown} точек — похоже, головы нет`);
  need(crownWide < tall * 0.08,
    `макушка token-${kind}.glb шириной ${(crownWide / tall * 100).toFixed(0)}% роста — `
    + 'это плечи, а не голова: голова не села на шею');
}

// Лицензия едет вместе с моделями: CC BY-SA 3.0 требует указать авторство.
const licence = path.join(dir, 'LICENSE.txt');
need(fs.existsSync(licence), 'рядом с моделями нет LICENSE.txt');
if (fs.existsSync(licence)) {
  const text = fs.readFileSync(licence, 'utf8');
  need(/0 A\.D\./.test(text) && /Wildfire Games/.test(text),
    'в LICENSE.txt не названы авторы моделей');
  need(/CC BY-SA 3\.0/.test(text), 'в LICENSE.txt не названа лицензия');
}

if (problems.length) {
  console.error('Модели построек «Земли обетованной» не прошли проверку:');
  for (const one of problems) console.error(`  ✗ ${one}`);
  process.exit(1);
}

const total = [...sizes.values()].reduce((sum, one) => sum + one.bytes, 0);
console.log(`OK: пять построек и шесть фишек на месте, ${Math.round(total / 1024)} КБ построек. `
  + [...sizes.entries()].map(([kind, one]) => `${kind} ${one.tall.toFixed(2)}×${one.wide.toFixed(2)}`).join(', ')
  + `. Каждая стоит на нуле, влезает в клетку и везёт свою текстуру; лестница читается `
  + `силуэтом, у стены и башни фундамент прижат к земле `
  + `(${(sizes.get('wall').share * 100).toFixed(0)}% и ${(sizes.get('tower').share * 100).toFixed(0)}% точек на подошве). `
  + 'У каждой фишки одна сетка, непрозрачная одежда и голова над серединой. '
  + 'Авторство и лицензия лежат рядом.');
