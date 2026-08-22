import fs from 'node:fs';

const source = fs.readFileSync('web/games/biblical-match-three.js', 'utf8');
const launcher = fs.readFileSync('web/js/biblical-match-three-launcher.js', 'utf8');

const requiredSourceSignatures = [
  'ark: { label: "Ноев ковчег", cost: 8',
  'if (!booster.target) { useNoahArk(); return; }',
  'async function useTargetBooster(id, index)',
  'function useNoahArk()',
  'Особые фишки уже на поле — соедините соседнюю пару',
];
for (const token of requiredSourceSignatures) {
  if (!source.includes(token)) throw new Error(`V45 source patch signature missing from base game: ${token}`);
}

for (const token of [
  'rainbow: { label: "Радуга Завета", cost: 8',
  'Превращает выбранную фишку в радужную',
  'runtime.board[index] = { ...cell, special:"rainbow" }',
  'Радуга готова — смахните её с нужным символом',
  "throw new Error('Biblical Treasures V45 patch signature drift')",
]) {
  if (!launcher.includes(token)) throw new Error(`V45 launcher patch is missing: ${token}`);
}

console.log('Biblical Treasures V45 source patch signatures OK');
