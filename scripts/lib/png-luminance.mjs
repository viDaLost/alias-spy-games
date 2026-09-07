/*
  Средняя яркость куска снимка экрана.

  Понадобилось, чтобы проверять читаемость, а не разметку. Заголовок игры стоит
  в верхней трети экрана, а под ним — картина: у «Соглядатая» полная луна, у
  «Алиаса» закатное небо. Пока полог был слабым, «Выберите уровень сложности»
  пропадало в облаках, и никакая проверка структуры этого не видела: элементы на
  месте, цвета заданы, а прочесть нельзя.

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
