import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const ok = (value, message) => { if (!value) throw new Error(message); };

const loader = read('web/js/v22-game-loader.js');
const special = read('web/js/v36-biblical-treasures-special-art.js');

ok(loader.includes("v36-biblical-treasures-special-art.js?v=36"), 'V36 special-art loader wiring missing');
ok(loader.includes('__bmtV36SpecialArtInstalled'), 'V36 special-art loader guard missing');

for (const token of ['lineH', 'lineV', 'burst', 'rainbow']) {
  ok(special.includes(token), `V36 special-art mapping missing ${token}`);
}
for (const asset of ['staff.webp', 'jericho.webp', 'covenant.webp']) {
  ok(special.includes(asset), `V36 special-art fallback missing ${asset}`);
}
ok(special.includes("boosters.staff"), 'Line specials must use the staff booster artwork');
ok(special.includes("boosters.jericho"), 'Burst specials must use the Jericho booster artwork');
ok(special.includes("boosters.covenant"), 'Rainbow specials must use the covenant booster artwork');
ok(special.includes("mark.textContent = ''"), 'Legacy lightning/special overlay must be removed');
ok(special.includes('.bmt-piece--special-line-h'), 'Horizontal special piece styling missing');
ok(special.includes('transform:rotate(90deg)'), 'Horizontal line special must visually rotate its own booster icon');
ok(special.includes("attributeFilter: ['class', 'src', 'data-current-game']"), 'V36 observer must react to board rerenders without broad attribute churn');
ok(!special.includes('setInterval('), 'V36 special art must not poll continuously');

console.log('OK: combo-created special tiles replace the matched symbol with the actual booster artwork and never render the old lightning overlay');
