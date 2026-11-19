// Assemble a continuous equirectangular texture from a single generated panorama.
import sharp from 'sharp';

const width4k = 4096;
const height4k = 2048;
const smooth = t => t * t * (3 - 2 * t);

export async function closePanorama(file, overlapFraction = 0.08) {
 const {data, info: {width, height}} = await sharp(file)
  .removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject: true});
 if (width !== 2 * height) throw Error(`Expected a 2:1 spherical source: ${file}`);

 // Place the two rear edges in one shared strip, sampled continuously through
 // longitude 180°. Shift by half the strip so the front stays centered.
 const overlap = Math.round(width * overlapFraction / 2) * 2;
 const period = width - overlap;
 const pixels = Buffer.alloc(period * height * 3);
 const polarRows = Math.round(height * 0.06);
 for (let y = 0; y < height; y++) {
  const latitude = Math.min(1, Math.min(y, height - 1 - y) / polarRows);
  const detail = smooth(latitude);
  const row = y * width * 3;
  const mean = [0, 0, 0];
  if (detail < 1) {
   for (let x = 0; x < width; x++) {
    for (let c = 0; c < 3; c++) mean[c] += data[row + x * 3 + c] / width;
   }
  }
  for (let x = 0; x < period; x++) {
   const sourceX = (x + overlap / 2) % period;
   const opacity = smooth(Math.min(1, sourceX / overlap));
   for (let c = 0; c < 3; c++) {
    const near = data[row + sourceX * 3 + c];
    const color = sourceX < overlap
     ? near * opacity + data[row + (sourceX + period) * 3 + c] * (1 - opacity)
     : near;
    pixels[(y * period + x) * 3 + c] = Math.round(detail * color + (1 - detail) * mean[c]);
   }
  }
 }
 // Provide real neighboring samples to the resize kernel at both wrap edges.
 const padding = 16;
 const paddedWidth = period + 2 * padding;
 const padded = Buffer.alloc(paddedWidth * height * 3);
 for (let y = 0; y < height; y++) {
  const source = y * period * 3;
  const target = y * paddedWidth * 3;
  pixels.copy(padded, target, source + (period - padding) * 3, source + period * 3);
  pixels.copy(padded, target + padding * 3, source, source + period * 3);
  pixels.copy(padded, target + (period + padding) * 3, source, source + padding * 3);
 }
 const resizedPadding = Math.round(padding * width4k / period);
 const resized = await sharp(padded, {raw: {width: paddedWidth, height, channels: 3}})
  .resize(width4k + 2 * resizedPadding, height4k, {fit: 'fill'}).raw().toBuffer();
 return sharp(resized, {raw: {width: width4k + 2 * resizedPadding, height: height4k, channels: 3}})
  .extract({left: resizedPadding, top: 0, width: width4k, height: height4k})
  .webp({lossless: true, effort: 4}).toBuffer();
}
