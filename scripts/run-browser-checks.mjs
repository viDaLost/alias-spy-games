// Браузерные проверки — все подряд, а не до первой упавшей, и по нескольку разом.
//
// Раньше они шли цепочкой через &&: первая неудача обрывала прогон, и о
// следующих узнавали только следующим заходом в CI. Проверка поднимает браузер
// и живёт минуты, так что каждый такой заход стоил отдельного круга «пуш —
// ждать — чинить». Теперь падают все, кто падает, и чинить можно разом.
//
// Одна за другой они перестали помещаться в отведённое задаче время: тридцать
// одна проверка, и самые тяжёлые — партия «Земли обетованной» пальцем и разбор
// объёмной сцены — по две-три минуты каждая. Задача обрывалась на полуслове, и
// хвост списка не проверялся вовсе.
//
// Поэтому проверки идут пачками. Соседства большинство из них не боится: каждая
// поднимает свой сервер на свободном порту (listen(0)) и свой браузер, ничего
// общего на диске не трогает.
//
// Но не все. Есть пять, которым сосед мешает, и по двум разным причинам.
//
// Двум нужен настоящий воркер, а wrangler dev держит ещё и порт отладчика —
// один на всех, и две таких рядом подрались бы за него.
//
// Ещё трём мешает не порт, а сама занятая машина: они не нажимают, а мерят —
// считают кадры, ждут, пока сцена уймётся, сравнивают точки движущейся
// картинки. Видеокарты на сборочной машине нет, рисует SwiftShader обычными
// вычислениями, и когда рядом работают два чужих браузера, измерение врёт: не
// потому, что игра сломалась, а потому, что ей не дали посчитать. Проверено:
// разбор объёмной сцены в пачке сообщил, что в покое нарисовано пять кадров и
// карта не взлетела со стола, — та же проверка в одиночку прошла и намерила
// покой без единого кадра и 2.1% изменённой середины поля. Занижать ей пороги
// было бы подлогом: она права, ей просто не дали времени.
//
// Вывод копится по проверке и печатается целиком, когда она кончилась: иначе
// строки пачки перемешались бы, и читать их было бы нельзя.

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const CHECKS = [
  'check-bmt-v46-mechanics.mjs',
  'check-bmt-admin-unlock.mjs',
  'check-admin-button-reliability.mjs',
  'check-game-rules.mjs',
  'check-progress-reset.mjs',
  'check-offline-pwa.mjs',
  'check-outside-telegram.mjs',
  'check-more-screen.mjs',
  'check-app-shell.mjs',
  'check-menu-background.mjs',
  'check-feedback-survey.mjs',
  'check-dark-contrast.mjs',
  'check-theme-switch.mjs',
  'check-bible-wow-bonus.mjs',
  'check-game-chat-toasts.mjs',
  'check-room-backoff.mjs',
  'check-bible-sketch-stage.mjs',
  'check-moses-nile-crocs.mjs',
  'check-moses-nile-crocodile-jump.mjs',
  'check-moses-nile-control-modes.mjs',
  'check-moses-nile-vortex.mjs',
  'check-promised-land-app.mjs',
  'check-promised-land-browser.mjs',
  'check-promised-land-3d.mjs',
  'check-promised-land-online-browser.mjs',
  'check-promised-land-trade-browser.mjs',
  'check-promised-land-frame-fit.mjs',
  'check-promised-land-qr-layout.mjs',
  'check-moses-nile-safe-area.mjs',
  'check-game-scenes.mjs',
  'check-channel-promo.mjs',
  'check-twelve-tribes-browser.mjs',
  'check-twelve-tribes-online.mjs',
];

/** Те, кого нельзя запускать рядом с соседями. Почему — сказано выше. */
const ALONE = new Set([
  // Делят порт отладчика wrangler dev.
  'check-promised-land-online-browser.mjs',
  'check-twelve-tribes-online.mjs',
  // Мерят кадры и точки: чужой браузер рядом подменяет измерение.
  'check-promised-land-3d.mjs',
  'check-moses-nile-crocs.mjs',
  'check-moses-nile-vortex.mjs',
]);

// Три разом: на машине задачи четыре ядра, и каждая проверка — это браузер со
// своим сервером. Четвёртое ядро оставлено тому, кто их запускает.
const LANES = Math.max(1, Math.min(3, (os.availableParallelism?.() ?? os.cpus().length) - 1));

const failed = [];

function run(check) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, check)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (status, signal) => {
      process.stdout.write(`\n— ${check}\n${output.trimEnd()}\n`);
      if (status !== 0) failed.push({ check, status: status ?? `сигнал ${signal}` });
      resolve();
    });
  });
}

const queue = CHECKS.filter((check) => !ALONE.has(check));
const lane = async () => { while (queue.length) await run(queue.shift()); };
await Promise.all(Array.from({ length: LANES }, lane));
for (const check of CHECKS.filter((one) => ALONE.has(one))) await run(check);

if (!failed.length) {
  console.log(`\nБраузерные проверки: ${CHECKS.length}/${CHECKS.length} прошли.`);
  process.exit(0);
}

console.error(`\nБраузерные проверки: ${CHECKS.length - failed.length}/${CHECKS.length} прошли. Упали:`);
for (const item of failed) console.error(`  ✗ ${item.check} (код ${item.status})`);
process.exit(1);
