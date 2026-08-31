import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => { throw new Error(message); };
const requireText = (text, needle, message) => { if (!text.includes(needle)) fail(message); };

function webpDimensions(buffer) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === 'VP8 ' && data + 10 <= buffer.length) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    if (type === 'VP8L' && data + 5 <= buffer.length && buffer[data] === 0x2f) {
      return {
        width: 1 + buffer[data + 1] + ((buffer[data + 2] & 0x3f) << 8),
        height: 1 + ((buffer[data + 2] & 0xc0) >> 6) + (buffer[data + 3] << 2) + ((buffer[data + 4] & 0x0f) << 10),
      };
    }
    if (type === 'VP8X' && data + 10 <= buffer.length) {
      return {
        width: 1 + buffer.readUIntLE(data + 4, 3),
        height: 1 + buffer.readUIntLE(data + 7, 3),
      };
    }
    offset = data + size + (size % 2);
  }
  return null;
}

const catalog = JSON.parse(read('web/data/quartet_bible.json'));
if (catalog.version !== 3) fail(`Expected quartet catalog v3, received ${catalog.version}`);
if (!Array.isArray(catalog.quartets) || catalog.quartets.length !== 12) fail('Quartet must contain 12 categories');

const cards = catalog.quartets.flatMap((quartet) => quartet.cards || []);
if (cards.length !== 48) fail(`Quartet must contain 48 cards, received ${cards.length}`);

const ids = new Set();
const hashes = new Set();
let totalBytes = 0;
for (const card of cards) {
  if (!card.id || ids.has(card.id)) fail(`Duplicate or empty card id: ${card.id || '<empty>'}`);
  ids.add(card.id);
  const expected = `web/assets/quartet/cards/${card.id}.webp`;
  if (card.art !== expected) fail(`Card ${card.id} has unexpected art path: ${card.art}`);
  const absolute = path.join(root, card.art);
  if (!fs.existsSync(absolute)) fail(`Missing artwork for ${card.id}`);
  const buffer = fs.readFileSync(absolute);
  if (buffer.length < 12 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    fail(`Artwork is not a valid WebP container: ${card.art}`);
  }
  const dimensions = webpDimensions(buffer);
  if (!dimensions || dimensions.width < 700 || dimensions.height < 890) {
    fail(`Artwork is below the high-resolution floor: ${card.art} (${dimensions?.width || 0}x${dimensions?.height || 0})`);
  }
  if (buffer.length > 160 * 1024) fail(`Artwork is too large for mobile delivery: ${card.art}`);
  totalBytes += buffer.length;
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  if (hashes.has(hash)) fail(`Artwork is duplicated: ${card.art}`);
  hashes.add(hash);
}
if (totalBytes > 4 * 1024 * 1024) fail(`Quartet artwork bundle is too large: ${totalBytes} bytes`);

const web = read('web/games/quartet.js');
const css = read('web/games/quartet-v2.css');
const android = read('android-app/app/src/main/java/com/vidalost/biblegames/games/OnlineGames.kt');
const repository = read('android-app/app/src/main/java/com/vidalost/biblegames/data/AssetRepository.kt');
const androidBuild = read('android-app/app/build.gradle');

// The web table dropped its step rail: the sticky action dock shows the same two
// selections permanently, and carrying both pushed the hand off the phone screen.
// What has to stay true is that the dock is there and that the cards come first.
// (Android keeps its own rail -- it has no dock -- and is asserted separately below.)
for (const [needle, message] of [
  ['renderActionDock(myTurn)', 'Web action dock is missing'],
  ['qv3-card-fan', 'Web opponent card fan is missing'],
  ['cardArtUrl(card)', 'Web card artwork resolver is missing'],
  ['qv3-card-back', 'Web missing-card back is missing'],
  ['loading="lazy"', 'Web card images must lazy load'],
]) requireText(web, needle, message);

for (const [needle, message] of [
  ['.qv2-game > .qv3-hand-table { order: 3; }', 'Web phone layout no longer puts the hand ahead of the roster'],
  ['.qv2-action-dock', 'Web action dock styles are missing'],
  ['grid-template-columns: repeat(4,minmax(0,1fr))', 'Web card row must show a full quartet'],
  ['.qv3-card-art img', 'Web card artwork styles are missing'],
  ['.qv3-card-back', 'Web card-back styles are missing'],
  ['Quartet v3 — light tactile card table', 'Web v3 visual layer is missing'],
]) requireText(css, needle, message);

for (const [needle, message] of [
  ['QuartetStepRail(', 'Android turn step rail is missing'],
  ['QuartetMiniCardFan(', 'Android opponent card fan is missing'],
  ['QuartetHandPanel(', 'Android horizontal quartet panel is missing'],
  ['QuartetPlayingCard(', 'Android illustrated card component is missing'],
  ['ContentScale.Crop', 'Android artwork must use a stable crop'],
]) requireText(android, needle, message);
requireText(repository, 'raw.optString("art").removePrefix("web/")', 'Android does not parse shared card artwork paths');
const bundlesWholeWebTree = androidBuild.includes("include 'web/**'");
const bundlesLegacyArtworkSet = androidBuild.includes("include 'web/assets/icons/**', 'web/assets/cards/**', 'web/assets/biblical-match-three/**', 'web/assets/quartet/**', 'web/data/**'");
if (!bundlesWholeWebTree && !bundlesLegacyArtworkSet) fail('Android Gradle inputs do not include Quartet artwork');

console.log(`OK: Quartet v3 has ${catalog.quartets.length} categories, ${cards.length} unique illustrated cards and ${(totalBytes / 1024 / 1024).toFixed(2)} MiB of WebP artwork.`);
