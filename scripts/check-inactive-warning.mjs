// Предупреждение за сутки до удаления профиля — на настоящей SQLite.
//
// Профиль, забытый на пятнадцать дней, удаляется вместе со звёздами и
// уровнями. За день до этого бот пишет человеку в личные сообщения. Здесь
// проверяется не то, что письмо «где-то отправляется», а сам отбор: кому
// пишут, кого удаляют и, главное, кого не удаляют.
//
// Запросы берутся те же самые, что работают в Durable Object
// (cloudflare/app-core-worker/src/retention-sql.js), и выполняются над
// временной базой в памяти. Пересказывать их здесь было бы бессмысленно:
// проверка повторила бы ошибку вместе с кодом.
//
//     node scripts/check-inactive-warning.mjs

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import {
  PENDING_WARNINGS_SQL,
  PURGE_INACTIVE_SQL,
  WARNINGS_TABLE_SQL,
} from '../cloudflare/app-core-worker/src/retention-sql.js';

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 20, 3, 17);
const INACTIVE_DAYS = 15;
const WARN_BEFORE = NOW - (INACTIVE_DAYS - 1) * DAY;   // не заходил дольше 14 суток
const PURGE_CUTOFF = NOW - INACTIVE_DAYS * DAY;        // не заходил дольше 15 суток
const WARNED_BEFORE = NOW - 20 * 60 * 60 * 1000;       // письмо ушло почти сутки назад
const ADMIN = '111';

/** Стол под опыт: пустые таблицы того же вида, что и в хранилище. */
function bench() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      telegram_id TEXT PRIMARY KEY,
      is_banned INTEGER NOT NULL DEFAULT 0,
      last_seen_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE android_sessions (
      telegram_id TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL DEFAULT 0,
      last_seen_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(WARNINGS_TABLE_SQL);
  return db;
}

const addUser = (db, id, seen, extra = {}) => {
  db.prepare('INSERT INTO users (telegram_id, is_banned, last_seen_at, updated_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, extra.banned ? 1 : 0, seen, seen, seen);
};
const addWarning = (db, id, seen, warnedAt) => {
  db.prepare('INSERT INTO inactive_warnings (user_id, warned_at, last_seen_at) VALUES (?, ?, ?)')
    .run(id, warnedAt, seen);
};
const toWarn = (db) => db.prepare(PENDING_WARNINGS_SQL)
  .all(ADMIN, ADMIN, WARN_BEFORE, NOW, WARN_BEFORE).map((row) => String(row.id));
const toPurge = (db) => db.prepare(PURGE_INACTIVE_SQL)
  .all(ADMIN, ADMIN, PURGE_CUTOFF, WARNED_BEFORE, NOW, PURGE_CUTOFF).map((row) => String(row.telegram_id));

// ——— кого предупреждать ———
{
  const db = bench();
  addUser(db, '201', NOW - 2 * DAY);              // заходил позавчера
  addUser(db, '202', NOW - 13 * DAY);             // почти срок, но ещё рано
  addUser(db, '203', NOW - 14 * DAY - 1);         // ровно тот, кому пора
  addUser(db, '204', NOW - 40 * DAY);             // забыт давно — тем более пора
  addUser(db, '205', NOW - 30 * DAY, { banned: true });
  addUser(db, ADMIN, NOW - 90 * DAY);             // сам администратор

  const warn = toWarn(db);
  need(!warn.includes('201'), 'предупредили того, кто заходил позавчера');
  need(!warn.includes('202'), 'предупредили раньше срока');
  need(warn.includes('203'), 'не предупредили того, кому завтра удалять профиль');
  need(warn.includes('204'), 'забытого давно не предупредили вовсе');
  need(!warn.includes('205'), 'написали заблокированному');
  need(!warn.includes(ADMIN), 'написали самому администратору');
}

// ——— второй раз не пишут, а вернувшемуся пишут заново ———
{
  const db = bench();
  const seen = NOW - 14 * DAY - 1;
  addUser(db, '301', seen);
  addWarning(db, '301', seen, NOW - 2 * DAY);
  need(!toWarn(db).includes('301'), 'письмо ушло второй раз за ту же отлучку');

  /*
    Человек зашёл и снова забыл. Отметка осталась от прошлой отлучки, и
    удалить по ней нельзя — а предупредить заново нужно.
  */
  const again = NOW - 14 * DAY - 2000;
  db.prepare('UPDATE users SET last_seen_at = ?, updated_at = ? WHERE telegram_id = ?').run(again, again, '301');
  need(toWarn(db).includes('301'), 'вернувшегося и снова забывшего не предупредили заново');
}

// ——— кого удалять ———
{
  const db = bench();
  const long = NOW - 16 * DAY;

  addUser(db, '401', long);                                   // срок вышел, но не писали
  addUser(db, '402', long);
  addWarning(db, '402', long, NOW - 2 * DAY);                  // писали позавчера
  addUser(db, '403', long);
  addWarning(db, '403', long, NOW - 60 * 60 * 1000);           // писали час назад
  addUser(db, '404', NOW - 10 * DAY);
  addWarning(db, '404', NOW - 10 * DAY, NOW - 5 * DAY);        // срок ещё не вышел
  addUser(db, '405', long, { banned: true });
  addWarning(db, '405', long, NOW - 2 * DAY);
  addUser(db, ADMIN, long);
  addWarning(db, ADMIN, long, NOW - 2 * DAY);

  const purge = toPurge(db);
  need(!purge.includes('401'), 'удалили того, кого не предупреждали');
  need(purge.includes('402'), 'предупреждённого сутки назад так и не удалили');
  need(!purge.includes('403'), 'удалили через час после письма, а обещали через день');
  need(!purge.includes('404'), 'удалили раньше срока');
  need(!purge.includes('405'), 'удалили заблокированного');
  need(!purge.includes(ADMIN), 'удалили самого администратора');
}

// ——— вернувшийся не удаляется по старому письму ———
{
  const db = bench();
  const long = NOW - 16 * DAY;
  addUser(db, '501', long);
  addWarning(db, '501', long, NOW - 2 * DAY);
  need(toPurge(db).includes('501'), 'подготовка опыта не сработала');

  const back = NOW - 1 * DAY;
  db.prepare('UPDATE users SET last_seen_at = ?, updated_at = ? WHERE telegram_id = ?').run(back, back, '501');
  need(!toPurge(db).includes('501'), 'вернувшегося удалили по письму, прочитанному до возвращения');
}

// ——— живое приложение на телефоне считается за приход ———
{
  const db = bench();
  const long = NOW - 16 * DAY;
  addUser(db, '601', long);
  addWarning(db, '601', long, NOW - 2 * DAY);
  db.prepare('INSERT INTO android_sessions (telegram_id, revoked, expires_at, last_seen_at) VALUES (?, 0, ?, ?)')
    .run('601', NOW + DAY, NOW - DAY);
  need(!toPurge(db).includes('601'), 'удалили того, кто заходит из приложения на телефоне');
  need(!toWarn(db).includes('601'), 'написали тому, кто заходит из приложения на телефоне');
}

// ——— письмо говорит человеку то, что с ним будет ———
{
  const worker = fs.readFileSync('cloudflare/app-core-worker/src/index-v6.js', 'utf8');
  need(/будет удалён завтра/.test(worker), 'в письме не сказано, что профиль удалят завтра');
  need(/откройте приложение/i.test(worker), 'в письме не сказано, как этого избежать');
  need(worker.includes('runInactiveWarnings(env)'), 'предупреждения не рассылаются по расписанию');
  /*
    Порядок в задаче: сперва письма, потом чистка. Наоборот — и в первый же
    запуск удалятся те, кто письма так и не получил.
  */
  const warnAt = worker.indexOf('runInactiveWarnings(env)');
  const purgeAt = worker.indexOf('runInactiveCleanup(env, warned)');
  need(warnAt > 0 && purgeAt > warnAt, 'чистка идёт раньше предупреждений');
}

if (problems.length) {
  console.error(`Предупреждение перед удалением профиля не прошло проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: за сутки до удаления письмо уходит тому, кто забыл про игру, и не уходит тем, кто '
  + 'заходил на днях, заблокирован или сам администратор; второй раз за ту же отлучку не пишут, а '
  + 'вернувшемуся и снова забывшему пишут заново. Удаляется только тот, кому письмо ушло и с тех '
  + 'пор прошли почти сутки: непредупреждённый, предупреждённый час назад и вернувшийся после '
  + 'письма остаются с профилем. Запросы взяты те же, что работают в хранилище.');
