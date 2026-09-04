// Браузерные проверки — все подряд, а не до первой упавшей.
//
// Раньше они шли цепочкой через &&: первая неудача обрывала прогон, и о
// следующих узнавали только следующим заходом в CI. Проверка поднимает браузер
// и живёт минуты, так что каждый такой заход стоил отдельного круга «пуш —
// ждать — чинить». Теперь падают все, кто падает, и чинить можно разом.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const CHECKS = [
  'check-bmt-v46-mechanics.mjs',
  'check-bmt-admin-unlock.mjs',
  'check-admin-button-reliability.mjs',
  'check-leaderboard.mjs',
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
];

const failed = [];
for (const check of CHECKS) {
  const result = spawnSync(process.execPath, [path.join(here, check)], { stdio: 'inherit' });
  if (result.status !== 0) failed.push({ check, status: result.status ?? 'сигнал ' + result.signal });
}

if (!failed.length) {
  console.log(`\nБраузерные проверки: ${CHECKS.length}/${CHECKS.length} прошли.`);
  process.exit(0);
}

console.error(`\nБраузерные проверки: ${CHECKS.length - failed.length}/${CHECKS.length} прошли. Упали:`);
for (const item of failed) console.error(`  ✗ ${item.check} (код ${item.status})`);
process.exit(1);
