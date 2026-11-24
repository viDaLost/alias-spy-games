import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenes } from '../../web/assets/bible-world-v1/scenes.mjs';

const source = process.argv[2];
if (!source) throw new Error('Pass the built Bible World public directory.');
const destination = fileURLToPath(new URL('./panoramas', import.meta.url));
const files = new Set(scenes.map((scene) => scene.image));
if (files.size !== 30) throw new Error(`Expected 30 unique panoramas, found ${files.size}.`);

await mkdir(destination, { recursive: true });
for (const file of files) {
  const input = path.join(source, file);
  const { size } = await stat(input);
  if (size <= 0 || size > 25 * 1024 * 1024) throw new Error(`Invalid Worker asset size for ${file}: ${size}`);
  await copyFile(input, path.join(destination, path.basename(file)));
}
console.log(`Prepared ${files.size} Bible World panoramas.`);
