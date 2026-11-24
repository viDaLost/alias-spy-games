import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { extraScenes } from '../web/assets/bible-world-v2/extra-scenes.mjs';
import { createJourney, epochs, eventChoices, levels, regions, scenes } from '../web/assets/bible-world-v2/rules.mjs';

assert.equal(scenes.length, 60);
assert.equal(levels.length, 3);
for (const field of ['id', 'image', 'event', 'title']) {
  assert.equal(new Set(scenes.map(scene => scene[field])).size, 60, `Unique ${field}`);
}
assert.equal(extraScenes.length, 30);
const newIds = new Set(extraScenes.map(scene => scene.id));
const files = await readdir(new URL('../cloudflare/bible-world-assets/sources/', import.meta.url));
assert.deepEqual(files.sort(), [...newIds].map(id => id + '.webp').sort());

for (const { id, sceneIds } of levels) {
  assert.equal(sceneIds.length, 20);
  assert.ok(sceneIds.slice(0, 10).every(scene => !newIds.has(scene)));
  assert.ok(sceneIds.slice(10).every(scene => newIds.has(scene)));
  const journey = createJourney(id);
  assert.equal(journey.maxScore, 100_000);
  for (let index = 0; index < 20; index++) {
    const { id: sceneId, region, event, epoch } = journey.scene;
    assert.ok(regions.some(item => item.id === region));
    assert.ok(epochs.some(item => item.id === epoch));
    assert.equal(journey.index, index);
    assert.equal(createJourney(id, index).scene.id, sceneId);
    const choices = eventChoices(id, sceneId);
    assert.equal(choices.length, 7);
    assert.ok(choices.some(choice => choice.id === event));
    assert.equal(journey.submit({ guess: { region }, event, epoch }).total, 5000);
    assert.equal(journey.next(), index < 19);
  }
  assert.equal(journey.complete, true);
  assert.equal(journey.total, 100_000);
  assert.throws(() => createJourney(id, 20));
}

for (const scene of extraScenes) {
  assert.equal(scene.hints.length, 3);
  assert.equal(scene.visualClues.length, 3);
  assert.ok(scene.quote && scene.quoteSource && scene.description && scene.locationNote);
  assert.match(scene.sourceUrl, /^https:\/\/bible\.by\/syn\/\d+\/\d+\/$/);
}
console.log('All 60 Bible World locations, 20-round campaigns, answers, and art sources passed.');
