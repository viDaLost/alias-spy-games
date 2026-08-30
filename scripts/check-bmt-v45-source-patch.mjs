// The V45 booster changes now live in the game source itself.
//
// They used to be applied at runtime: the launcher fetched biblical-match-three.js
// as text, ran ten exact string replacements over it, and injected the result as an
// inline script. This check existed to catch "patch signature drift" -- a single
// changed space in the source silently broke the game. The patch is inlined now, so
// this checks the features are present and the runtime patching has not come back.

import fs from 'node:fs';

const source = fs.readFileSync('web/games/biblical-match-three.js', 'utf8');
const launcher = fs.readFileSync('web/js/biblical-match-three-launcher.js', 'utf8');

for (const token of [
  'rainbow: { label: "Радуга Завета", cost: 8',
  'Превращает выбранную фишку в радужную',
  'runtime.board[index] = { ...cell, special:"rainbow" }',
  'Радуга готова — смахните её с нужным символом',
  'async function useTargetBooster(id, index)',
]) {
  if (!source.includes(token)) throw new Error(`V45 rainbow booster is missing from the game source: ${token}`);
}

// The Noah's Ark booster was replaced by the rainbow one; its remnants must not
// linger, or the booster rail would offer an action nothing implements.
for (const token of [
  'ark: { label: "Ноев ковчег"',
  'if (!booster.target) { useNoahArk(); return; }',
  'function useNoahArk()',
]) {
  if (source.includes(token)) throw new Error(`Replaced Noah's Ark booster is still present in the game source: ${token}`);
}

for (const token of ['patchGameSource', 'patch signature drift', "cache:\"no-store\"", 'script.textContent']) {
  if (launcher.includes(token)) {
    throw new Error(`The launcher is rewriting the game source at runtime again (${token}); inline the change into the source instead`);
  }
}
if (!launcher.includes('loadScriptOnce(GAME_SRC')) {
  throw new Error('The launcher no longer loads the game as an ordinary script');
}

console.log('Biblical Treasures V45 boosters ship in the game source; the launcher loads it as a plain script.');
