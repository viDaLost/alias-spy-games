// Исходники двух иконок «Библейских сокровищ», которых не было в наборе v17:
// тернии и ковчег завета. Рисуются здесь, а не в редакторе, чтобы их можно было
// пересобрать одной командой (scripts/build-bmt-v46-art.mjs) и чтобы правка
// оттенка не требовала бинарного диффа.
//
// Что делает набор v17 узнаваемым и что здесь повторяется: тёплое золото с
// глубокой тенью и резким бликом, тёмная обводка по силуэту, лёгкий наклон
// композиции, предмет занимает почти весь квадрат и пара искр сверху. Всё
// рисуется в квадрате 128×128, а растеризуется вчетверо крупнее — так кромки не
// «звенят» после уменьшения.

const SHARED = `
  <filter id="drop" x="-35%" y="-35%" width="170%" height="180%">
    <feDropShadow dx="0" dy="3.5" stdDeviation="3" flood-color="#2c1e05" flood-opacity=".45"/>
  </filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3"/>
  </filter>
  <filter id="gloss" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="1.4"/>
  </filter>`;

/** Искры набора: маленькие четырёхлучевые звёздочки поверх материала. */
const spark = (x, y, r, opacity = 1) => `
  <path d="M${x} ${y - r}C${x + r * 0.15} ${y - r * 0.28} ${x + r * 0.28} ${y - r * 0.15} ${x + r} ${y}
           C${x + r * 0.28} ${y + r * 0.15} ${x + r * 0.15} ${y + r * 0.28} ${x} ${y + r}
           C${x - r * 0.15} ${y + r * 0.28} ${x - r * 0.28} ${y + r * 0.15} ${x - r} ${y}
           C${x - r * 0.28} ${y - r * 0.15} ${x - r * 0.15} ${y - r * 0.28} ${x} ${y - r}Z"
        fill="#fffdf4" opacity="${opacity}"/>`;

const round = (value) => Math.round(value * 100) / 100;

// --- ковчег завета ------------------------------------------------------------

/** Крыло херувима: серп с зубчатой задней кромкой, поднимающийся от края
 *  крышки к середине. Именно смыкание крыльев над престолом милости и делает
 *  ковчег ковчегом — без него силуэт читается просто как сундук. */
const wing = `
  <path d="M36 58C34 42 44 26 58 19C53 27 51 32 50 38C47 39 45 43 44 47C41 48 39 52 38 57Z"/>
  <path d="M41 55C40 43 47 32 57 25C53 31 51 35 50 40C47 42 45 46 44 51Z" fill="#c08a1b" opacity=".38"/>
  <path d="M40 48c2-9 7-16 15-22" fill="none" stroke="#fff3c9" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>`;

export const covenantArk = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    ${SHARED}
    <linearGradient id="gold" x1="26" y1="62" x2="98" y2="112" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffe9a0"/><stop offset=".2" stop-color="#efbc44"/>
      <stop offset=".5" stop-color="#cf9420"/><stop offset=".78" stop-color="#9c6510"/>
      <stop offset="1" stop-color="#5f3a06"/>
    </linearGradient>
    <linearGradient id="goldLid" x1="20" y1="54" x2="108" y2="78" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff3c6"/><stop offset=".34" stop-color="#f0bd42"/>
      <stop offset=".74" stop-color="#b07d16"/><stop offset="1" stop-color="#734709"/>
    </linearGradient>
    <linearGradient id="goldRod" x1="0" y1="82" x2="0" y2="92" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff2c0"/><stop offset=".4" stop-color="#dfa227"/>
      <stop offset="1" stop-color="#6d4208"/>
    </linearGradient>
    <linearGradient id="feather" x1="26" y1="12" x2="62" y2="50" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f8dc93"/><stop offset=".3" stop-color="#e7b53e"/>
      <stop offset=".66" stop-color="#c48d1d"/><stop offset="1" stop-color="#7d4f0b"/>
    </linearGradient>
    <linearGradient id="lapis" x1="40" y1="78" x2="90" y2="104" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5773e0"/><stop offset=".4" stop-color="#2c3f96"/>
      <stop offset="1" stop-color="#101847"/>
    </linearGradient>
    <radialGradient id="mercy" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff3b8" stop-opacity=".62"/>
      <stop offset="1" stop-color="#fff3b8" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <ellipse cx="64" cy="115" rx="36" ry="6.5" fill="#3a2705" opacity=".36" filter="url(#soft)"/>
  <ellipse cx="64" cy="34" rx="20" ry="16" fill="url(#mercy)"/>
  <ellipse cx="64" cy="24" rx="6" ry="5" fill="#fff6cd" opacity=".42" filter="url(#gloss)"/>

  <g filter="url(#drop)" transform="rotate(-3 64 70)">
    <!-- Херувимы: два веера перьев сходятся над престолом милости. -->
    <g fill="url(#feather)" stroke="#6b4108" stroke-width="1.6" stroke-linejoin="round">
      ${wing}
      <g transform="translate(128 0) scale(-1 1)">${wing}</g>
    </g>

    <!-- Крышка (престол милости) -->
    <path d="M29 63l7-9h56l7 9z" fill="url(#goldLid)" stroke="#6b4108" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M22 63h84a4 4 0 0 1 4 4v4a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5v-4a4 4 0 0 1 4-4z"
          fill="url(#gold)" stroke="#6b4108" stroke-width="1.8" stroke-linejoin="round"/>

    <!-- Короб -->
    <path d="M29 76h70v25a6 6 0 0 1-6 6H35a6 6 0 0 1-6-6z" fill="url(#gold)" stroke="#6b4108" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M39 82h50v16a3 3 0 0 1-3 3H42a3 3 0 0 1-3-3z" fill="url(#lapis)" stroke="#6b4108" stroke-width="1.5"/>
    <path d="M64 84.5v14M57 90.5h14" stroke="#f8d271" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M32.5 79v25" stroke="#fff3c9" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>

    <!-- Шесты в кольцах -->
    <rect x="8" y="84" width="112" height="6.5" rx="3.2" fill="url(#goldRod)" stroke="#6b4108" stroke-width="1.4"/>
    <path d="M13 86.5h102" stroke="#fff6d5" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>
    <circle cx="31" cy="87" r="6.4" fill="url(#gold)" stroke="#6b4108" stroke-width="1.7"/>
    <circle cx="97" cy="87" r="6.4" fill="url(#gold)" stroke="#6b4108" stroke-width="1.7"/>
  </g>

  <!-- Блик по верхним кромкам -->
  <path d="M31 66h66" stroke="#fffbe8" stroke-width="2.8" stroke-linecap="round" opacity=".8"/>
  <path d="M37 58h54" stroke="#fffbe8" stroke-width="2" stroke-linecap="round" opacity=".5"/>
  ${spark(105, 24, 10)}
  ${spark(21, 38, 6.5, 0.85)}
  ${spark(94, 108, 5, 0.6)}
</svg>`;

// --- тернии -------------------------------------------------------------------
//
// Ветка и шипы считаются из одной кривой: шип ставится на её край по нормали,
// иначе он «отклеивается» от плети и вся иконка рассыпается на пятна.

const BRANCH = [
  [[14, 92], [22, 110], [46, 110], [56, 94]],
  [[56, 94], [66, 78], [60, 62], [72, 51]],
  [[72, 51], [83, 41], [98, 43], [112, 30]],
];

function segmentAt(u) {
  const scaled = Math.min(0.999999, Math.max(0, u)) * BRANCH.length;
  return { curve: BRANCH[Math.floor(scaled)], t: scaled - Math.floor(scaled) };
}
function pointAt(u) {
  const { curve: [p0, p1, p2, p3], t } = segmentAt(u);
  const m = 1 - t;
  return [0, 1].map((axis) => m * m * m * p0[axis] + 3 * m * m * t * p1[axis] + 3 * m * t * t * p2[axis] + t * t * t * p3[axis]);
}
function tangentAt(u) {
  const { curve: [p0, p1, p2, p3], t } = segmentAt(u);
  const m = 1 - t;
  const raw = [0, 1].map((axis) => 3 * m * m * (p1[axis] - p0[axis]) + 6 * m * t * (p2[axis] - p1[axis]) + 3 * t * t * (p3[axis] - p2[axis]));
  const length = Math.hypot(raw[0], raw[1]) || 1;
  return [raw[0] / length, raw[1] / length];
}
/** Плеть сужается к концу — этим она и отличается от ленты. */
function halfWidth(u) { return 10.5 - 6.2 * u ** 1.15; }

/** Замкнутый контур плети: обход по одной стороне и возврат по другой. */
function branchOutline(steps = 44) {
  const left = [];
  const right = [];
  for (let step = 0; step <= steps; step += 1) {
    const u = step / steps;
    const [x, y] = pointAt(u);
    const [tx, ty] = tangentAt(u);
    const w = halfWidth(u);
    left.push(`${round(x - ty * w)} ${round(y + tx * w)}`);
    right.push(`${round(x + ty * w)} ${round(y - tx * w)}`);
  }
  return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}

/** Блик идёт по «солнечной» стороне плети, повторяя её изгиб. */
function branchGloss(steps = 30, from = 0.04, to = 0.9) {
  const points = [];
  for (let step = 0; step <= steps; step += 1) {
    const u = from + (to - from) * (step / steps);
    const [x, y] = pointAt(u);
    const [tx, ty] = tangentAt(u);
    const w = halfWidth(u) * 0.48;
    points.push(`${round(x + ty * w)} ${round(y - tx * w)}`);
  }
  return `M${points.join('L')}`;
}

/** Шип растёт из края плети наружу по нормали, слегка отклоняясь вперёд. */
function thornAt(u, side, length) {
  const [x, y] = pointAt(u);
  const [tx, ty] = tangentAt(u);
  const nx = -ty * side;
  const ny = tx * side;
  const w = halfWidth(u);
  const baseX = x + nx * (w - 1.5);
  const baseY = y + ny * (w - 1.5);
  const half = Math.max(4, w * 0.72);
  const a = `${round(baseX - tx * half)} ${round(baseY - ty * half)}`;
  const b = `${round(baseX + tx * half)} ${round(baseY + ty * half)}`;
  const tipX = baseX + nx * length + tx * length * 0.28;
  const tipY = baseY + ny * length + ty * length * 0.28;
  const tip = `${round(tipX)} ${round(tipY)}`;
  const light = `M${round(baseX - tx * half * 0.35)} ${round(baseY - ty * half * 0.35)}L${round(baseX + (tipX - baseX) * 0.72)} ${round(baseY + (tipY - baseY) * 0.72)}`;
  return `<path d="M${a}L${tip}L${b}Z" fill="url(#thorn)" stroke="#5d3707" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="${light}" stroke="#fff3c9" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".8"/>`;
}

/** Узел на ветке: тёмное пятно, посаженное точно на её ось. */
function knotAt(u) {
  const [x, y] = pointAt(u);
  const [tx, ty] = tangentAt(u);
  const angle = (Math.atan2(ty, tx) * 180) / Math.PI;
  return `<ellipse cx="${round(x)}" cy="${round(y)}" rx="${round(halfWidth(u) * 0.62)}" ry="${round(halfWidth(u) * 0.3)}"
            transform="rotate(${round(angle)} ${round(x)} ${round(y)})" fill="#123420" opacity=".5"/>`;
}

const THORNS = [
  [0.1, -1, 19], [0.27, 1, 17], [0.43, -1, 18],
  [0.59, 1, 15], [0.74, -1, 15], [0.89, 1, 12],
];

export const vine = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    ${SHARED}
    <linearGradient id="bark" x1="20" y1="30" x2="106" y2="106" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#8ad9a4"/><stop offset=".24" stop-color="#4aa373"/>
      <stop offset=".6" stop-color="#256444"/><stop offset="1" stop-color="#0f2e1b"/>
    </linearGradient>
    <linearGradient id="leaf" x1="44" y1="24" x2="98" y2="106" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#bdedcd"/><stop offset=".46" stop-color="#54a677"/>
      <stop offset="1" stop-color="#1b4f33"/>
    </linearGradient>
    <linearGradient id="thorn" x1="0" y1="0" x2="0" y2="128" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff2c0"/><stop offset=".42" stop-color="#eab646"/>
      <stop offset="1" stop-color="#8a5710"/>
    </linearGradient>
  </defs>

  <ellipse cx="64" cy="115" rx="34" ry="6.5" fill="#0d2a13" opacity=".36" filter="url(#soft)"/>

  <g filter="url(#drop)">
    <!-- Листья уходят под плеть, поэтому рисуются первыми. -->
    <g fill="url(#leaf)" stroke="#143a22" stroke-width="1.7" stroke-linejoin="round">
      <path d="M99 74c-18 1-29 15-27 32 18-1 29-15 27-32z"/>
      <path d="M46 16c14 7 19 22 11 37-14-7-18-22-11-37z"/>
    </g>
    <g stroke="#d3f2df" stroke-width="1.7" fill="none" opacity=".8" stroke-linecap="round">
      <path d="M95 79c-10 6-16 16-16 25"/>
      <path d="M50 22c7 8 9 18 6 26"/>
    </g>

    <!-- Шипы прячут основание под плетью, поэтому идут до неё. -->
    ${THORNS.map(([u, side, length]) => thornAt(u, side, length)).join('\n    ')}

    <path d="${branchOutline()}" fill="url(#bark)" stroke="#0e2c19" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="${branchGloss()}" fill="none" stroke="#c6f0d6" stroke-width="3" stroke-linecap="round"
          opacity=".7" filter="url(#gloss)"/>
    ${[0.2, 0.5, 0.78].map(knotAt).join('\n    ')}
  </g>

  ${spark(107, 20, 9)}
  ${spark(18, 72, 5.5, 0.8)}
</svg>`;
