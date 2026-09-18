// Размеры и прозрачность картинки — по заголовку файла, без библиотек.
//
// Сюда вынесено то, что нужно сразу двум проверкам набора картинок («Земля
// обетованная» и «Двенадцать колен»). Держать это в каждой из них по копии
// значило бы однажды научить одну читать WebP с прозрачностью, а вторую
// оставить с прежним знанием — и получить два разных ответа про один файл.
//
// Читаются только заголовки: PNG — IHDR, WebP — VP8X, VP8L или VP8. Этого
// хватает на оба вопроса, которые вообще задаются картинке в проекте: какого
// она размера и есть ли у неё прозрачный фон.

import fs from 'node:fs';
import path from 'node:path';

/**
 * @returns {{format: string, width: number, height: number, alpha: boolean}|null}
 *   null — файл не PNG и не WebP (или обрезан).
 */
export function describe(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length > 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    const colorType = buffer[25];
    const hasTRNS = buffer.includes(Buffer.from('tRNS', 'ascii'));
    return {
      format: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      alpha: colorType === 4 || colorType === 6 || (colorType === 3 && hasTRNS),
    };
  }
  if (buffer.length > 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return {
        format: 'webp',
        width: (buffer.readUIntLE(24, 3) & 0xffffff) + 1,
        height: (buffer.readUIntLE(27, 3) & 0xffffff) + 1,
        alpha: Boolean(buffer[20] & 0x10),
      };
    }
    if (chunk === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      return {
        format: 'webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        alpha: Boolean((bits >> 28) & 1),
      };
    }
    if (chunk === 'VP8 ') {
      return {
        format: 'webp',
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
        alpha: false,           // простой lossy WebP прозрачности не несёт
      };
    }
  }
  return null;
}

/** Файл ищется и как .webp, и как .png: перевести в webp можно и потом. */
export function locate(dir, name) {
  for (const ext of ['.webp', '.png']) {
    const file = path.join(dir, name + ext);
    if (fs.existsSync(file)) return file;
  }
  return null;
}
