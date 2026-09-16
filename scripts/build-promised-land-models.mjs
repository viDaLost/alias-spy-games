// build-promised-land-models.mjs — постройки «Земли обетованной» из исходников 0 A.D.
//
// На вход идёт распакованный архив с моделями 0 A.D.: DAE — геометрия, DDS и
// PNG — текстуры, XML — сборка. На выход — по одному самодостаточному .glb на
// ступень поселения, с уже вшитой текстурой, вписанный в размер клетки.
//
// Почему конвертер свой, а не редактор. Во-первых, редактора здесь нет и не
// будет: сборка идёт без графической среды. Во-вторых, эти DAE сделаны двумя
// экспортёрами — старым pmd2collada и Blender, — и обоих хватает разобрать
// пятьюстами строк: геометрия, нормали, развёртка и список треугольников.
// Ничего сверх этого игре от постройки не нужно: она стоит на клетке и не
// шевелится.
//
// Авторство моделей: Wildfire Games и участники 0 A.D., CC BY-SA 3.0.
// Изменения: выбрана одна сетка на ступень, сменена система координат (Z-up →
// Y-up), модель вписана в размер клетки, текстура ужата до 256 точек и
// переложена в PNG. Лицензия сохраняется — см. LICENSE рядом с моделями.
//
// Запуск:  node scripts/build-promised-land-models.mjs <путь-к-распакованному-архиву>

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  console.error('Укажите путь к распакованному архиву с моделями 0 A.D.');
  process.exit(1);
}
const art = path.join(source, 'source/art');
const outDir = path.join(root, 'web/assets/promised-land/models');

/*
  Что берём. Пять ступеней поселения — по сетке на каждую. Жертвенника в
  архиве нет (автор модели закрыл скачивание), и он остаётся собранным из
  примитивов, как и был.

  height — во что модель вписывается по высоте в единицах сцены, где сторона
  клетки равна 0.94. Числа подобраны так, чтобы лестница читалась силуэтом:
  колодец ниже шатра, шатёр ниже дома, башня выше всех.
*/
const MODELS = [
  { kind: 'well', mesh: 'props/wrld_well_a.dae', texture: 'skins/props/wrld_well_a_1.dds', height: 0.16 },
  { kind: 'tent', mesh: 'structural/tent_arab.dae', texture: 'skins/structural/tent_arab.png', height: 0.24 },
  { kind: 'house', mesh: 'structural/pers_house_a.dae', texture: 'skins/structural/pers_struct.png', height: 0.3 },
  { kind: 'wall', mesh: 'structural/pers_wall_medium.dae', texture: 'skins/structural/pers_struct.png', height: 0.26 },
  { kind: 'tower', mesh: 'structural/pers_scout_tower_a.dae', texture: 'skins/structural/pers_struct.png', height: 0.44 },
];

/*
  Фишки игроков — шесть персонажей. Устроены они сложнее построек: тело и
  голова лежат в разных файлах, а соединяет их скелет — у тела есть узел
  «prop-head», и голова ставится туда. Поз в архиве целая библиотека, но фишке
  на доске поза не нужна: берётся опорная, в которой тело и записано.

  Ростом все одинаковы: фишки на клетке стоят рядом, и разный рост читался бы
  как разная важность, которой в правилах нет.
*/
const FIGURE_TALL = 0.42;
const FIGURES = [
  {
    kind: 'citizen',
    body: { mesh: 'skeletal/new/f_dress.dae', texture: 'skins/skeletal/pers/dress_female_01_01.dds' },
    head: { mesh: 'props/new/dudette_head_a.dae', texture: 'skins/props/head/pers_fem_a.dds' },
  },
  {
    kind: 'healer',
    body: { mesh: 'skeletal/new/m_dress_sleeves.dae', texture: 'skins/skeletal/pers/robes_healer_01.png' },
    head: { mesh: 'props/new/head_beard_small.dae', texture: 'skins/props/head/pers_face_h_mouth.dds' },
  },
  {
    kind: 'fisher',
    body: { mesh: 'skeletal/new/m_tunic_short.dae', texture: 'skins/skeletal/pers/tunic_basic_01_01.png' },
    head: { mesh: 'props/new/head_beard_small.dae', texture: 'skins/props/head/pers_face_a.png' },
  },
  {
    kind: 'archer',
    body: { mesh: 'skeletal/new/m_tunic_short.dae', texture: 'skins/skeletal/scyth/tunic_coat_01_01.png' },
    head: { mesh: 'props/new/head_beard_small.dae', texture: 'skins/props/head/pers_face_a.png' },
  },
  {
    kind: 'spearman',
    body: { mesh: 'skeletal/new/m_tunic_long.dae', texture: 'skins/skeletal/pers/tunic_basic_01_03.png' },
    head: { mesh: 'props/new/head_beard_small.dae', texture: 'skins/props/head/pers_face_f_y.dds' },
  },
  {
    kind: 'javelin',
    body: { mesh: 'skeletal/new/m_tunic_short.dae', texture: 'skins/skeletal/pers/tunic_basic_01_07.png' },
    head: { mesh: 'props/new/head_beard_small.dae', texture: 'skins/props/head/pers_face_a.png' },
  },
];

const TEX_SIDE = 256;

// ————————————————————————————————————————————————— разбор COLLADA

/** Числа из <float_array>: они лежат простым списком через пробел. */
function floats(text) {
  const out = [];
  for (const piece of text.trim().split(/\s+/)) out.push(Number(piece));
  return out;
}

const ints = (text) => text.trim().split(/\s+/).map(Number);

/** Все элементы данного тега с их содержимым и разобранными свойствами. */
function tags(xml, name) {
  const found = [];
  const open = new RegExp(`<${name}\\b([^>]*)(/?)>`, 'g');
  let match;
  while ((match = open.exec(xml))) {
    const attrs = {};
    for (const [, key, value] of match[1].matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) attrs[key] = value;
    if (match[2] === '/') { found.push({ attrs, body: '' }); continue; }
    const close = xml.indexOf(`</${name}>`, open.lastIndex);
    found.push({ attrs, body: xml.slice(open.lastIndex, close < 0 ? undefined : close) });
  }
  return found;
}

/**
 * Один поток чисел из <source>: сами числа и сколько их на вершину. Развёртка
 * лежит в тех же <source>, что и точки, поэтому шаг читается из <accessor>, а
 * не угадывается по семантике.
 */
function sourceOf(mesh, id) {
  const clean = id.replace(/^#/, '');
  for (const one of tags(mesh, 'source')) {
    if (one.attrs.id !== clean) continue;
    const array = tags(one.body, 'float_array')[0];
    const accessor = tags(one.body, 'accessor')[0];
    return {
      data: floats(array.body),
      stride: Number(accessor?.attrs.stride || 3),
    };
  }
  return null;
}

/*
  Матрица узла, в котором лежит сетка. Экспорт из Blender кладёт поворот и
  масштаб не в геометрию, а в сцену: без этой матрицы шатёр приезжает лежащим
  на боку и вдесятеро больше нужного.
*/
function nodeMatrix(xml) {
  const scenes = tags(xml, 'library_visual_scenes')[0];
  if (!scenes) return null;
  const matrices = tags(scenes.body, 'matrix');
  if (!matrices.length) return null;
  const m = floats(matrices[0].body);
  return m.length === 16 ? m : null;
}

const applyMatrix = (m, x, y, z) => ([
  m[0] * x + m[1] * y + m[2] * z + m[3],
  m[4] * x + m[5] * y + m[6] * z + m[7],
  m[8] * x + m[9] * y + m[10] * z + m[11],
]);

const applyRotation = (m, x, y, z) => ([
  m[0] * x + m[1] * y + m[2] * z,
  m[4] * x + m[5] * y + m[6] * z,
  m[8] * x + m[9] * y + m[10] * z,
]);

/**
 * Сетка из DAE: точки, нормали, развёртка и треугольники. Два вида разметки
 * встречаются вперемешку — <triangles> у старого экспортёра и <polylist> у
 * Blender, где грани бывают четырёхугольными. Четырёхугольник режется веером:
 * эти сетки выпуклые, и веера довольно.
 */
function readMesh(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const geometry = tags(xml, 'geometry')[0];
  if (!geometry) throw new Error(`в ${path.basename(file)} нет геометрии`);
  const mesh = tags(geometry.body, 'mesh')[0].body;

  // <vertices> — лишнее звено: VERTEX ссылается на него, а оно на точки.
  const vertices = tags(mesh, 'vertices')[0];
  const vertexSource = vertices
    ? tags(vertices.body, 'input').find((i) => i.attrs.semantic === 'POSITION')?.attrs.source
    : null;

  const chunk = tags(mesh, 'triangles')[0] || tags(mesh, 'polylist')[0];
  if (!chunk) throw new Error(`в ${path.basename(file)} нет ни triangles, ни polylist`);
  const polys = Boolean(tags(mesh, 'triangles')[0]) ? null : ints(tags(chunk.body, 'vcount')[0].body);

  const inputs = tags(chunk.body, 'input');
  const wanted = {};
  let stride = 0;
  for (const input of inputs) {
    const offset = Number(input.attrs.offset || 0);
    stride = Math.max(stride, offset + 1);
    const semantic = input.attrs.semantic;
    // Развёрток бывает две — вторая под запечённое затенение; берём первую.
    if (semantic === 'TEXCOORD' && wanted.uv) continue;
    const id = semantic === 'VERTEX' ? (vertexSource || input.attrs.source) : input.attrs.source;
    const data = sourceOf(mesh, id);
    if (!data) continue;
    if (semantic === 'VERTEX') wanted.pos = { offset, ...data };
    if (semantic === 'NORMAL') wanted.nrm = { offset, ...data };
    if (semantic === 'TEXCOORD') wanted.uv = { offset, ...data };
  }
  if (!wanted.pos) throw new Error(`в ${path.basename(file)} не нашлись точки`);

  const p = ints(tags(chunk.body, 'p')[0].body);
  const faces = [];
  if (polys) {
    let at = 0;
    for (const count of polys) {
      const corner = [];
      for (let i = 0; i < count; i += 1) {
        corner.push(p.slice(at + i * stride, at + (i + 1) * stride));
      }
      for (let i = 1; i + 1 < count; i += 1) faces.push([corner[0], corner[i], corner[i + 1]]);
      at += count * stride;
    }
  } else {
    for (let at = 0; at + stride * 3 <= p.length; at += stride * 3) {
      faces.push([
        p.slice(at, at + stride),
        p.slice(at + stride, at + stride * 2),
        p.slice(at + stride * 2, at + stride * 3),
      ]);
    }
  }

  /*
    Вершины склеиваются по набору «точка + нормаль + развёртка»: в glTF на
    вершину приходится по одному значению каждого потока, и два угла с разными
    нормалями — это две вершины, как их ни зови в исходнике.
  */
  const seen = new Map();
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const matrix = nodeMatrix(xml);

  for (const face of faces) {
    for (const corner of face) {
      const key = corner.join(',');
      let at = seen.get(key);
      if (at === undefined) {
        at = positions.length / 3;
        seen.set(key, at);

        const pi = corner[wanted.pos.offset] * wanted.pos.stride;
        let [x, y, z] = [wanted.pos.data[pi], wanted.pos.data[pi + 1], wanted.pos.data[pi + 2]];
        if (matrix) [x, y, z] = applyMatrix(matrix, x, y, z);
        // Z-up у 0 A.D. против Y-up у glTF.
        positions.push(x, z, -y);

        if (wanted.nrm) {
          const ni = corner[wanted.nrm.offset] * wanted.nrm.stride;
          let [nx, ny, nz] = [wanted.nrm.data[ni], wanted.nrm.data[ni + 1], wanted.nrm.data[ni + 2]];
          if (matrix) [nx, ny, nz] = applyRotation(matrix, nx, ny, nz);
          const len = Math.hypot(nx, ny, nz) || 1;
          normals.push(nx / len, nz / len, -ny / len);
        } else {
          normals.push(0, 1, 0);
        }

        if (wanted.uv) {
          const ui = corner[wanted.uv.offset] * wanted.uv.stride;
          // В COLLADA развёртка считается снизу, в glTF — сверху.
          uvs.push(wanted.uv.data[ui], 1 - wanted.uv.data[ui + 1]);
        } else {
          uvs.push(0, 0);
        }
      }
      indices.push(at);
    }
  }
  return { positions, normals, uvs, indices };
}

/*
  Узлы сцены с учётом вложенности. Обычный поиск по тегу здесь не годится:
  скелет — это дерево из сотни узлов, вложенных друг в друга, и первый
  встречный «</node>» закрывает вовсе не тот узел, который открылся.
*/
function nodesOf(chunk) {
  const out = [];
  const open = /<node\b([^>]*?)(\/?)>/g;
  let match;
  while ((match = open.exec(chunk))) {
    const attrs = {};
    for (const [, key, value] of match[1].matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) attrs[key] = value;
    if (match[2] === '/') { out.push({ attrs, body: '' }); continue; }
    let depth = 1;
    const scan = /<node\b[^>]*?(\/?)>|<\/node>/g;
    scan.lastIndex = open.lastIndex;
    let step;
    while ((step = scan.exec(chunk))) {
      if (step[0].startsWith('</')) { depth -= 1; if (!depth) break; }
      else if (step[1] !== '/') depth += 1;
    }
    out.push({ attrs, body: chunk.slice(open.lastIndex, step ? step.index : undefined) });
    if (step) open.lastIndex = scan.lastIndex;
  }
  return out;
}

const mulMatrix = (a, b) => {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      for (let k = 0; k < 4; k += 1) out[row * 4 + col] += a[row * 4 + k] * b[k * 4 + col];
    }
  }
  return out;
};

const UNIT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * Скелет: где какой узел стоит в опорной позе. Нужен ради одного — точки
 * «prop-head»: голова у этих моделей лежит отдельным файлом, и поставить её
 * на место можно только зная, где у тела шея.
 */
function skeletonOf(xml) {
  const scenes = tags(xml, 'library_visual_scenes')[0];
  const found = new Map();
  if (!scenes) return found;
  const walk = (chunk, parent) => {
    for (const node of nodesOf(chunk)) {
      const own = tags(node.body, 'matrix')[0];
      const here = own ? mulMatrix(parent, floats(own.body)) : parent;
      const name = node.attrs.name || node.attrs.sid || node.attrs.id;
      if (name) found.set(name, here);
      walk(node.body, here);
    }
  };
  walk(scenes.body, UNIT);
  return found;
}

/** Передвинуть сетку матрицей: ею голова и садится на шею. */
function moveMesh(mesh, matrix) {
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const [x, y, z] = applyMatrix(matrix, mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
    mesh.positions[i] = x;
    mesh.positions[i + 1] = y;
    mesh.positions[i + 2] = z;
    const [nx, ny, nz] = applyRotation(matrix, mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
    const len = Math.hypot(nx, ny, nz) || 1;
    mesh.normals[i] = nx / len;
    mesh.normals[i + 1] = ny / len;
    mesh.normals[i + 2] = nz / len;
  }
}

/*
  Тело и голова сшиваются в одну сетку, а их текстуры — в одно полотно: слева
  тело, справа голова. Развёртка при этом сжимается вдвое по ширине и
  сдвигается. Ради чего: фишка с двумя материалами — это два вызова отрисовки
  на каждую, а их на доске шесть, и каждая ещё и в движении.

  Развёртки у этих сеток лежат внутри единичного квадрата (замерено: от 0 до
  1.002), поэтому половинки не перетекают друг в друга. Крохотный вылет за
  единицу подрезается.
*/
function stitch(body, head) {
  const shift = (mesh, half) => {
    for (let i = 0; i < mesh.uvs.length; i += 2) {
      const u = Math.min(1, Math.max(0, mesh.uvs[i]));
      mesh.uvs[i] = u / 2 + half * 0.5;
      mesh.uvs[i + 1] = Math.min(1, Math.max(0, mesh.uvs[i + 1]));
    }
  };
  shift(body, 0);
  shift(head, 1);
  const at = body.positions.length / 3;
  return {
    positions: [...body.positions, ...head.positions],
    normals: [...body.normals, ...head.normals],
    uvs: [...body.uvs, ...head.uvs],
    indices: [...body.indices, ...head.indices.map((i) => i + at)],
  };
}

/** Два квадратных полотна рядом: слева первое, справа второе. */
function sideBySide(left, right) {
  const side = TEX_SIDE;
  const rgba = Buffer.alloc(side * 2 * side * 4);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const from = (y * side + x) * 4;
      left.rgba.copy(rgba, (y * side * 2 + x) * 4, from, from + 4);
      right.rgba.copy(rgba, (y * side * 2 + side + x) * 4, from, from + 4);
    }
  }
  return { width: side * 2, height: side, rgba };
}

// ————————————————————————————————————————————————— текстуры

/** Цвет из пяти-шести-пяти бит, как его хранит DXT. */
function rgb565(value) {
  const r = (value >> 11) & 31;
  const g = (value >> 5) & 63;
  const b = value & 31;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

/*
  DDS со сжатием DXT1, DXT3 и DXT5. Все три хранят цвет одинаково — блоком
  4×4 с двумя опорными цветами и двумя битами выбора на точку; отличается
  прозрачность: у DXT1 её нет вовсе (кроме одного «прозрачного» случая), у
  DXT3 она лежит полубайтами, у DXT5 — своей парой опорных значений.
*/
function decodeDds(buffer) {
  if (buffer.readUInt32LE(0) !== 0x20534444) throw new Error('это не DDS');
  const height = buffer.readUInt32LE(12);
  const width = buffer.readUInt32LE(16);
  const four = buffer.toString('ascii', 84, 88);
  const blockSize = four === 'DXT1' ? 8 : 16;
  const rgba = Buffer.alloc(width * height * 4, 255);
  let at = 128;

  for (let by = 0; by < height; by += 4) {
    for (let bx = 0; bx < width; bx += 4) {
      let alpha = null;
      if (four === 'DXT3') {
        alpha = [];
        for (let i = 0; i < 8; i += 1) {
          const byte = buffer[at + i];
          alpha.push((byte & 15) * 17, (byte >> 4) * 17);
        }
      } else if (four === 'DXT5') {
        const a0 = buffer[at];
        const a1 = buffer[at + 1];
        const table = [a0, a1];
        if (a0 > a1) {
          for (let i = 1; i <= 6; i += 1) table.push(((7 - i) * a0 + i * a1) / 7);
        } else {
          for (let i = 1; i <= 4; i += 1) table.push(((5 - i) * a0 + i * a1) / 5);
          table.push(0, 255);
        }
        let bits = 0n;
        for (let i = 0; i < 6; i += 1) bits |= BigInt(buffer[at + 2 + i]) << BigInt(8 * i);
        alpha = [];
        for (let i = 0; i < 16; i += 1) alpha.push(table[Number((bits >> BigInt(3 * i)) & 7n)]);
      }

      const colorAt = four === 'DXT1' ? at : at + 8;
      const c0 = buffer.readUInt16LE(colorAt);
      const c1 = buffer.readUInt16LE(colorAt + 2);
      const a = rgb565(c0);
      const b = rgb565(c1);
      const colors = [a, b];
      if (c0 > c1 || four !== 'DXT1') {
        colors.push(a.map((v, i) => (2 * v + b[i]) / 3));
        colors.push(a.map((v, i) => (v + 2 * b[i]) / 3));
      } else {
        colors.push(a.map((v, i) => (v + b[i]) / 2));
        colors.push([0, 0, 0]);
      }
      const bits = buffer.readUInt32LE(colorAt + 4);

      for (let i = 0; i < 16; i += 1) {
        const x = bx + (i % 4);
        const y = by + Math.floor(i / 4);
        if (x >= width || y >= height) continue;
        const color = colors[(bits >> (2 * i)) & 3];
        const out = (y * width + x) * 4;
        rgba[out] = color[0];
        rgba[out + 1] = color[1];
        rgba[out + 2] = color[2];
        rgba[out + 3] = alpha ? alpha[i] : 255;
      }
      at += blockSize;
    }
  }
  return { width, height, rgba };
}

/** PNG без чересстрочности: разжать и снять построчный фильтр. */
function decodePng(buffer) {
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let kind = 0;
  const parts = [];
  let palette = null;
  let alphaTable = null;
  while (at < buffer.length) {
    const size = buffer.readUInt32BE(at);
    const name = buffer.toString('ascii', at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + size);
    if (name === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      kind = body[9];
      if (body[12] !== 0) throw new Error('чересстрочный PNG не разбирается');
      if (depth !== 8) throw new Error(`PNG с глубиной ${depth} не разбирается`);
    }
    if (name === 'PLTE') palette = Buffer.from(body);
    if (name === 'tRNS') alphaTable = Buffer.from(body);
    if (name === 'IDAT') parts.push(Buffer.from(body));
    if (name === 'IEND') break;
    at += size + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[kind];
  if (!channels) throw new Error(`PNG вида ${kind} не разбирается`);
  const line = width * channels;
  const flat = Buffer.alloc(height * line);
  let prev = Buffer.alloc(line);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (line + 1)];
    const row = raw.subarray(y * (line + 1) + 1, (y + 1) * (line + 1));
    const now = Buffer.alloc(line);
    for (let i = 0; i < line; i += 1) {
      const left = i >= channels ? now[i - channels] : 0;
      const up = prev[i];
      const corner = i >= channels ? prev[i - channels] : 0;
      let value = row[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        value += (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : corner);
      }
      now[i] = value & 255;
    }
    now.copy(flat, y * line);
    prev = now;
  }

  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i += 1) {
    const from = i * channels;
    const to = i * 4;
    if (kind === 3) {
      const index = flat[from];
      rgba[to] = palette[index * 3];
      rgba[to + 1] = palette[index * 3 + 1];
      rgba[to + 2] = palette[index * 3 + 2];
      rgba[to + 3] = alphaTable && index < alphaTable.length ? alphaTable[index] : 255;
    } else if (kind === 0 || kind === 4) {
      rgba[to] = flat[from];
      rgba[to + 1] = flat[from];
      rgba[to + 2] = flat[from];
      rgba[to + 3] = kind === 4 ? flat[from + 1] : 255;
    } else {
      rgba[to] = flat[from];
      rgba[to + 1] = flat[from + 1];
      rgba[to + 2] = flat[from + 2];
      rgba[to + 3] = kind === 6 ? flat[from + 3] : 255;
    }
  }
  return { width, height, rgba };
}

/** Ужать усреднением по прямоугольнику: на клетке текстура всё равно с ноготь. */
function resize(image, side) {
  const out = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y += 1) {
    const y0 = Math.floor(y * image.height / side);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * image.height / side));
    for (let x = 0; x < side; x += 1) {
      const x0 = Math.floor(x * image.width / side);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * image.width / side));
      const sum = [0, 0, 0, 0];
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const at = (sy * image.width + sx) * 4;
          for (let c = 0; c < 4; c += 1) sum[c] += image.rgba[at + c];
          count += 1;
        }
      }
      const to = (y * side + x) * 4;
      for (let c = 0; c < 4; c += 1) out[to + c] = Math.round(sum[c] / count);
    }
  }
  return { width: side, height: side, rgba: out };
}

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function encodePng(image) {
  const line = image.width * 4;
  const raw = Buffer.alloc(image.height * (line + 1));
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (line + 1)] = 0;
    image.rgba.copy(raw, y * (line + 1) + 1, y * line, (y + 1) * line);
  }
  const chunk = (name, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(name, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ————————————————————————————————————————————————— сборка GLB

const pad4 = (n) => (n + 3) & ~3;

/**
 * Один .glb: сетка, материал и вшитая текстура. Вшитая — чтобы модель была
 * одним файлом: у выкладки и так хватает путей, по которым что-то может не
 * доехать, а текстура без модели или модель без текстуры одинаково бесполезны.
 */
function writeGlb(mesh, png, cutout = true) {
  const index = new Uint32Array(mesh.indices);
  const position = new Float32Array(mesh.positions);
  const normal = new Float32Array(mesh.normals);
  const uv = new Float32Array(mesh.uvs);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      min[c] = Math.min(min[c], position[i + c]);
      max[c] = Math.max(max[c], position[i + c]);
    }
  }

  const blocks = [
    Buffer.from(index.buffer, index.byteOffset, index.byteLength),
    Buffer.from(position.buffer, position.byteOffset, position.byteLength),
    Buffer.from(normal.buffer, normal.byteOffset, normal.byteLength),
    Buffer.from(uv.buffer, uv.byteOffset, uv.byteLength),
    png,
  ];
  const views = [];
  let at = 0;
  const body = [];
  for (const block of blocks) {
    views.push({ buffer: 0, byteOffset: at, byteLength: block.length });
    body.push(block);
    const pad = pad4(block.length) - block.length;
    if (pad) body.push(Buffer.alloc(pad));
    at = pad4(at + block.length);
  }
  const binary = Buffer.concat(body);

  const json = {
    asset: { version: '2.0', generator: 'build-promised-land-models.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 1, NORMAL: 2, TEXCOORD_0: 3 },
        indices: 0,
        material: 0,
      }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 0.92,
      },
      /*
        У построек прозрачностью вырезаны края полога и растительность — там
        она значит именно прозрачность. У людей она значит другое: 0 A.D.
        держит в ней маску, по которой движок подмешивает цвет игрока, и
        вырезать по ней — значит проделать в тунике дыры. Поэтому фигуры
        собираются непрозрачными, а цвет игрока у них и без того есть — в
        круглой подставке под ногами.
      */
      ...(cutout ? { alphaMode: 'MASK', alphaCutoff: 0.5 } : { alphaMode: 'OPAQUE' }),
      doubleSided: true,
    }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images: [{ bufferView: 4, mimeType: 'image/png' }],
    accessors: [
      { bufferView: 0, componentType: 5125, count: index.length, type: 'SCALAR' },
      { bufferView: 1, componentType: 5126, count: position.length / 3, type: 'VEC3', min, max },
      { bufferView: 2, componentType: 5126, count: normal.length / 3, type: 'VEC3' },
      { bufferView: 3, componentType: 5126, count: uv.length / 2, type: 'VEC2' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: binary.length }],
  };

  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = Buffer.alloc(pad4(jsonBuffer.length) - jsonBuffer.length, 0x20);
  const jsonChunk = Buffer.concat([jsonBuffer, jsonPad]);

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binary.length, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonChunk.length, 0);
  jsonHead.write('JSON', 4, 'ascii');
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binary.length, 0);
  binHead.write('BIN\0', 4, 'ascii');

  return Buffer.concat([header, jsonHead, jsonChunk, binHead, binary]);
}

/*
  Вписать в клетку.

  Первое и главное: у этих моделей земля проходит по нулю, и часть геометрии
  уходит под него. Это фундамент — юбка, которую движок 0 A.D. прячет в
  рельеф, и её там до половины всей высоты: у стены под землёй семнадцать
  единиц из тридцати, у башни тринадцать из тридцати трёх. Поставить модель
  «низом коробки на клетку» значит выставить этот фундамент наружу, а саму
  постройку укоротить вдвое — стена от этого превращается в плиту, а башня в
  обрубок. Поэтому всё, что ниже нуля, прижимается к нулю: снаружи остаётся
  ровно то, что и задумано видимым.

  Второе: единицам исходника доверять незачем — где дюймы, где сантиметры, а
  игре нужно, чтобы башня была выше дома, а не ровно шесть метров. Поэтому
  размер берётся от своей же коробки: середина в ноль по горизонтали, и всё
  делится на заданную высоту.
*/
function fit(mesh, height) {
  for (let i = 1; i < mesh.positions.length; i += 3) {
    if (mesh.positions[i] < 0) mesh.positions[i] = 0;
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      min[c] = Math.min(min[c], mesh.positions[i + c]);
      max[c] = Math.max(max[c], mesh.positions[i + c]);
    }
  }
  const tall = max[1] - min[1];
  const wide = Math.max(max[0] - min[0], max[2] - min[2]);
  // Шире этого постройке быть нельзя: она накроет имя клетки и цену.
  const scale = Math.min(height / (tall || 1), 0.44 / (wide || 1));
  const midX = (min[0] + max[0]) / 2;
  const midZ = (min[2] + max[2]) / 2;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    mesh.positions[i] = (mesh.positions[i] - midX) * scale;
    mesh.positions[i + 1] = (mesh.positions[i + 1] - min[1]) * scale;
    mesh.positions[i + 2] = (mesh.positions[i + 2] - midZ) * scale;
  }
  return { scale, tall: tall * scale, wide: wide * scale };
}

// ————————————————————————————————————————————————— дело

fs.mkdirSync(outDir, { recursive: true });
const report = [];

for (const item of MODELS) {
  const meshFile = path.join(art, 'meshes', item.mesh);
  const texFile = path.join(art, 'textures', item.texture);
  if (!fs.existsSync(meshFile)) throw new Error(`нет сетки ${item.mesh}`);
  if (!fs.existsSync(texFile)) throw new Error(`нет текстуры ${item.texture}`);

  const mesh = readMesh(meshFile);
  const size = fit(mesh, item.height);

  const raw = texFile.endsWith('.dds')
    ? decodeDds(fs.readFileSync(texFile))
    : decodePng(fs.readFileSync(texFile));
  const png = encodePng(resize(raw, TEX_SIDE));

  const glb = writeGlb(mesh, png);
  // Имя с приставкой: в public/art/models/ эти файлы лежат рядом с пальмами и
  // камнями от «Моисея на Ниле», и «tower.glb» там ничего не объяснит.
  const out = path.join(outDir, `build-${item.kind}.glb`);
  fs.writeFileSync(out, glb);

  report.push({
    kind: item.kind,
    triangles: mesh.indices.length / 3,
    vertices: mesh.positions.length / 3,
    tall: size.tall,
    wide: size.wide,
    bytes: glb.length,
  });
}

/*
  Фишки игроков. Тело и голова читаются порознь, голова ставится на своё место
  по скелету тела, обе сетки сшиваются в одну, обе текстуры — в одно полотно.
*/
for (const item of FIGURES) {
  const bodyFile = path.join(art, 'meshes', item.body.mesh);
  const headFile = path.join(art, 'meshes', item.head.mesh);
  if (!fs.existsSync(bodyFile)) throw new Error(`нет тела ${item.body.mesh}`);
  if (!fs.existsSync(headFile)) throw new Error(`нет головы ${item.head.mesh}`);

  const body = readMesh(bodyFile);
  const head = readMesh(headFile);

  /*
    Где у тела шея. Узел «prop-head» лежит в скелете в системе координат
    исходника — Z вверх, — а сетки к этому месту уже переведены в Y вверх.
    Поэтому матрица узла применяется к голове до перевода: голова читается
    тем же readMesh, то есть уже переведённой, и матрицу надо перевести
    тоже. Проще и надёжнее взять из матрицы только её сдвиг: голова у этих
    моделей ни повёрнута, ни смасштабирована относительно тела — она просто
    приставляется к шее.
  */
  const bones = skeletonOf(fs.readFileSync(bodyFile, 'utf8'));
  const neck = bones.get('prop-head') || bones.get('head');
  if (!neck) throw new Error(`у ${item.body.mesh} нет узла головы`);
  moveMesh(head, [
    1, 0, 0, neck[3],
    0, 1, 0, neck[11],
    0, 0, 1, -neck[7],
    0, 0, 0, 1,
  ]);

  const mesh = stitch(body, head);
  const size = fit(mesh, FIGURE_TALL);

  const skin = (file) => {
    const full = path.join(art, 'textures', file);
    if (!fs.existsSync(full)) throw new Error(`нет текстуры ${file}`);
    const raw = full.endsWith('.dds') ? decodeDds(fs.readFileSync(full)) : decodePng(fs.readFileSync(full));
    return resize(raw, TEX_SIDE);
  };
  const cloth = sideBySide(skin(item.body.texture), skin(item.head.texture));
  // Маска цвета игрока — не прозрачность: без этого туника уходит дырами.
  for (let i = 3; i < cloth.rgba.length; i += 4) cloth.rgba[i] = 255;
  const png = encodePng(cloth);

  const glb = writeGlb(mesh, png, false);
  const out = path.join(outDir, `token-${item.kind}.glb`);
  fs.writeFileSync(out, glb);

  report.push({
    kind: item.kind,
    triangles: mesh.indices.length / 3,
    vertices: mesh.positions.length / 3,
    tall: size.tall,
    wide: size.wide,
    bytes: glb.length,
  });
}

/*
  Лицензия едет вместе с моделями. CC BY-SA 3.0 требует указать авторство,
  назвать лицензию и отметить, что именно изменено, — и требует того же от
  переработанного. Файл кладётся рядом с .glb, чтобы его нельзя было потерять
  при переносе папки.
*/
fs.writeFileSync(path.join(outDir, 'LICENSE.txt'), `Модели построек «Земли обетованной»

Источник: художественные материалы игры 0 A.D. (Wildfire Games и участники проекта).
  https://github.com/0ad/0ad
  https://play0ad.com/
Лицензия: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0).
  https://creativecommons.org/licenses/by-sa/3.0/

Что изменено при переносе в эту игру:
  * из архива взята по одной сетке на ступень поселения;
  * система координат сменена с Z-up на Y-up;
  * модель вписана в размер клетки: середина в нуле, низ на нуле, высота задана;
  * текстура ужата до ${TEX_SIDE} точек и переложена из DDS/PNG в PNG;
  * карты нормалей, бликов и затенения отброшены — сцена их не использует;
  * всё собрано в один .glb на постройку, текстура вшита внутрь.
Собрано скриптом scripts/build-promised-land-models.mjs.

Переработанные графические материалы остаются под CC BY-SA 3.0.
`, 'utf8');

const total = report.reduce((sum, one) => sum + one.bytes, 0);
console.log(`OK: собрано ${report.length} построек, ${Math.round(total / 1024)} КБ всего.`);
for (const one of report) {
  console.log(`  ${one.kind.padEnd(6)} ${String(one.triangles).padStart(5)} треугольников, `
    + `${String(one.vertices).padStart(5)} вершин, высота ${one.tall.toFixed(2)}, `
    + `ширина ${one.wide.toFixed(2)}, ${Math.round(one.bytes / 1024)} КБ`);
}
