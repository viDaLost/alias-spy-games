import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scenes } from '../../web/assets/bible-world-v2/scenes.mjs';
import { extraScenes } from '../../web/assets/bible-world-v2/extra-scenes.mjs';

const source = process.argv[2];
if (!source) throw new Error('Pass the built Bible World public directory.');
const destination = fileURLToPath(new URL('./panoramas', import.meta.url));
const sourceArt = fileURLToPath(new URL('./sources', import.meta.url));
const { closePanorama } = await import(pathToFileURL(path.resolve(source, '../art/close-panorama.mjs')));
const extraImages = new Map(extraScenes.map(({ id, image }) => [image, id]));
const files = new Set(scenes.map((scene) => scene.image));
if (files.size !== 60 || extraImages.size !== 30) throw new Error('Expected 60 unique panoramas, including 30 new ones.');

await mkdir(destination, { recursive: true });
async function prepare(file) {
  const output = path.join(destination, path.basename(file));
  const newScene = extraImages.get(file);
  if (newScene) {
    const panorama = await closePanorama(path.join(sourceArt, newScene + '.webp'));
    await writeFile(output, panorama);
  } else {
    await copyFile(path.join(source, file), output);
  }
  const { size } = await stat(output);
  if (size <= 0 || size > 25 * 1024 * 1024) throw new Error(`Invalid Worker asset size for ${file}: ${size}`);
}
const panoramas = [...files];
for (let offset = 0; offset < panoramas.length; offset += 4) {
  await Promise.all(panoramas.slice(offset, offset + 4).map(prepare));
}
console.log(`Prepared ${files.size} Bible World panoramas.`);
