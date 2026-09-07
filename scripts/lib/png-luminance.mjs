/*
  Средняя яркость куска снимка экрана.

  Понадобилось, чтобы проверять читаемость, а не разметку. Заголовок игры стоит
  в верхней трети экрана, а под ним — картина: у «Соглядатая» полная луна, у
  «Алиаса» закатное небо. Пока полог был слабым, «Выберите уровень сложности»
  пропадало в облаках, и никакая проверка структуры этого не видела: элементы на
  месте, цвета заданы, а прочесть нельзя.

  Светлой теме нужно ровно обратное: там текст тёмный, и опасно уже не светлое
  пятно, а тёмное. Поэтому рядом со средней яркостью живут самый тёмный квадрат
  и сравнение двух снимков.

  Готового декодера в проекте нет, а тянуть зависимость ради одного замера
  незачем: PNG от Playwright всегда восьмибитный RGBA без чересстрочности, и
  такой разбирается двумя десятками строк — заголовок, склейка IDAT, inflate и
  снятие построчных фильтров.
*/
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Разбирает снимок и возвращает { width, height, pixels } — RGBA по строкам. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('это не PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const parts = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (depth !== 8) throw new Error(`ожидалось 8 бит на канал, получено ${depth}`);
      if (interlace) throw new Error('чересстрочный PNG не поддерживается');
      if (colorType !== 6 && colorType !== 2) throw new Error(`неизвестный тип цвета ${colorType}`);
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') parts.push(data);
    else if (type === 'IEND') break;
  }

  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  // Снятие фильтров: каждая строка начинается байтом способа, а дальше значения
  // считаются от левого соседа, верхнего и их среднего — как в спецификации.
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[from + x];
      const left = x >= channels ? pixels[to + x - channels] : 0;
      const up = y > 0 ? pixels[to - stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? pixels[to - stride + x - channels] : 0;
      let restored;
      if (filter === 0) restored = value;
      else if (filter === 1) restored = value + left;
      else if (filter === 2) restored = value + up;
      else if (filter === 3) restored = value + ((left + up) >> 1);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        restored = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      } else throw new Error(`неизвестный фильтр строки ${filter}`);
      pixels[to + x] = restored & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

/** Средняя относительная яркость прямоугольника, 0 — чёрный, 1 — белый. */
export function meanLuminance(image, box = {}) {
  const { width, height, channels, pixels } = image;
  const left = Math.max(0, Math.round(box.left ?? 0));
  const top = Math.max(0, Math.round(box.top ?? 0));
  const right = Math.min(width, Math.round(box.right ?? width));
  const bottom = Math.min(height, Math.round(box.bottom ?? height));
  let sum = 0;
  let count = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = y * width * channels + x * channels;
      // Коэффициенты BT.709: глаз видит зелёный много ярче синего.
      sum += (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255;
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

/*
  Самый тёмный и самый светлый квадрат снимка.

  Средняя яркость по всему экрану лжёт в обе стороны: одно тёмное пятно под
  строкой текста в ней тонет, а на общем числе не сказывается. Читаемости важно
  именно худшее место — тёмное там, где текст тёмный, светлое там, где светлый.
*/
export function blockLuminanceBounds(image, size = 48) {
  let min = 1;
  let max = 0;
  for (let top = 0; top + size <= image.height; top += size) {
    for (let left = 0; left + size <= image.width; left += size) {
      const value = meanLuminance(image, { left, top, right: left + size, bottom: top + size });
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return { min, max };
}

/*
  Насколько два снимка расходятся по яркости — среднее по всем точкам.

  Нужно, чтобы отличить «картина проступает сквозь полог» от «полог закрасил
  её насмерть». Яркость этого не покажет: белый лист и лист с бледным рисунком
  светят одинаково. Сравнение со снимком без слоёв показывает.
*/
export function meanAbsoluteDifference(first, second) {
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error('снимки разного размера — сравнивать нечего');
  }
  const count = first.width * first.height;
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    const at = index * first.channels;
    const a = (0.2126 * first.pixels[at] + 0.7152 * first.pixels[at + 1] + 0.0722 * first.pixels[at + 2]) / 255;
    const b = (0.2126 * second.pixels[at] + 0.7152 * second.pixels[at + 1] + 0.0722 * second.pixels[at + 2]) / 255;
    sum += Math.abs(a - b);
  }
  return count ? sum / count : 0;
}
