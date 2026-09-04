#!/usr/bin/env node
/*
  Подготовка присланных владельцем моделей под бюджет игры.

  Исходники лежат в ветке main в корне репозитория (egyptian_ship.glb,
  hippopotamus.glb, papyrus_plant.glb, lowpoly_lotus_flowers_and_leaves.glb) и
  весят 19.5 МБ на четверых. В игру идут сжатые копии из
  web/assets/models/moses-nile — суммарно 1.6 МБ.

  Скрипт разовый: его зависимости (@gltf-transform, sharp, meshoptimizer) в
  package.json намеренно не добавлены, чтобы сборка превью не тянула их на
  каждый деплой. Ставятся вручную:

    npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 \
      @gltf-transform/extensions@4 sharp meshoptimizer

  Команды, которыми получены файлы в репозитории:

    node scripts/prepare-moses-nile-models.mjs hippopotamus.glb \
      web/assets/models/moses-nile/nile-hippo.glb \
      '{"texture":512,"textureFormat":"jpeg","quality":82}'

    node scripts/prepare-moses-nile-models.mjs egyptian_ship.glb \
      web/assets/models/moses-nile/nile-ship.glb \
      '{"simplify":0.4,"error":0.03,"texture":512,"textureFormat":"jpeg","quality":82}'

    node scripts/prepare-moses-nile-models.mjs papyrus_plant.glb \
      web/assets/models/moses-nile/nile-papyrus.glb \
      '{"joinAll":true,"dropNormals":true,"simplify":0.008,"error":0.08,"weld":0.0005}'

    node scripts/prepare-moses-nile-models.mjs lowpoly_lotus_flowers_and_leaves.glb \
      web/assets/models/moses-nile/nile-lotus.glb '{"texture":256,"textureFormat":"png"}'
*/
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, join, simplify, resample, textureCompress, flatten } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [, , src, dst, optsJson] = process.argv;
const opts = JSON.parse(optsJson || '{}');
await MeshoptSimplifier.ready;
const doc = await io.read(src);

const tris = () => doc.getRoot().listMeshes()
  .flatMap((m) => m.listPrimitives())
  .reduce((a, p) => a + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);

const prims = () => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).length;
console.log(`${path.basename(src)}: ${Math.round(tris())} tris, ${prims()} prims in`);

await doc.transform(dedup(), prune({ keepAttributes: false, keepLeaves: false }));
if (opts.joinAll) { await doc.transform(flatten(), join({ keepNamed: false })); console.log(`  after join: ${prims()} prims, ${Math.round(tris())} tris`); }
if (opts.dropNormals) {
  // SketchUp пишет каждый треугольник отдельным островом со своими нормалями:
  // по всем атрибутам сварка не склеивает ничего, и упрощать становится нечего.
  // Нормали пересчитает загрузчик игры.
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) p.setAttribute('NORMAL', null);
  }
}
if (opts.simplify) {
  await doc.transform(weld({ tolerance: opts.weld ?? 0.0001 }));
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: opts.simplify, error: opts.error ?? 0.02, lockBorder: false }));
}
if (opts.texture) {
  await doc.transform(textureCompress({
    encoder: sharp,
    targetFormat: opts.textureFormat || 'jpeg',
    resize: [opts.texture, opts.texture],
    quality: opts.quality ?? 80,
    slots: opts.slots ? new RegExp(opts.slots) : undefined,
  }));
}
if (opts.textureAlpha) {
  await doc.transform(textureCompress({
    encoder: sharp, targetFormat: 'webp',
    resize: [opts.textureAlpha, opts.textureAlpha], quality: opts.quality ?? 82,
  }));
}
await doc.transform(resample(), prune());
await io.write(dst, doc);
console.log(`  -> ${Math.round(tris())} tris, ${prims()} prims, ${(fs.statSync(dst).size / 1024).toFixed(0)} KB`);
