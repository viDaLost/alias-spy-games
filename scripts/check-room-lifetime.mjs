// Сроки жизни комнаты: двенадцать часов в любом случае и полчаса без людей.
//
// Комнату держит Durable Object, и решает всё его будильник. Проверять это
// чтением исходника бессмысленно — важно не то, что в коде есть нужное число, а
// то, что комната действительно исчезает, когда должна, и не исчезает, когда не
// должна. Поэтому класс комнаты запускается по-настоящему: модуль
// «cloudflare:workers» подменён заглушкой, хранилище и список сокетов —
// обвязкой, а будильник вызывается с нужным временем вместо ожидания.
//
// Полчаса считаются от обрыва последней связи, а не от выхода по кнопке: по
// кнопке выходят немногие, обычно приложение просто закрывают.

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createContext } from './lib/durable-object-harness.mjs';

register('./lib/cloudflare-workers-loader.mjs', import.meta.url);

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const GAMES = [
  {
    name: 'Библейский художник',
    module: 'cloudflare/bible-sketch-worker/src/index.js',
    room: 'BibleSketchRoom',
    playerHeader: 'X-Bible-Sketch-Player-Id',
    create: (roomId, player) => ({ roomId, player, categoryId: 'objects', createRequestId: 'req-1' }),
  },
  {
    name: 'Квартет',
    module: 'cloudflare/quartet-worker/src/index-chat.js',
    room: 'QuartetRoom',
    playerHeader: 'X-Quartet-Player-Id',
    create: (roomId, player) => ({ roomId, player, createRequestId: 'req-1' }),
  },
];

const post = (path, body) => new Request(`https://room.test${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

for (const game of GAMES) {
  const module = await import(pathToFileURL(game.module).href);
  const Room = module[game.room];
  check(Room, `${game.name}: класс комнаты ${game.room} не экспортируется`);
  if (!Room) continue;

  const host = createContext();
  const room = new Room(host.ctx, {});
  const player = { playerId: 'p1', name: 'Хозяин', isHost: true };
  const created = await room.fetch(post('/create', game.create('TEST12', player)));
  const createdBody = await created.json();
  check(createdBody.ok, `${game.name}: комната не создалась — ${createdBody.error || created.status}`);
  if (!createdBody.ok) continue;

  // 1. Пока кто-то на связи, комната не трогается даже спустя сутки.
  const socket = host.connect('p1');
  await room.markOccupied();
  await room.alarm();
  check(room.room, `${game.name}: комната с игроком на связи исчезла`);
  check(host.alarmAt <= Date.now() + 12 * HOUR + MINUTE, `${game.name}: будильник дальше двенадцати часов`);

  // 2. Связь оборвалась — назначен срок в полчаса, а не в двенадцать часов.
  host.disconnect(socket);
  await room.webSocketClose(socket, 1006, 'lost');
  const waiting = host.alarmAt - Date.now();
  check(waiting > 25 * MINUTE && waiting <= 31 * MINUTE,
    `${game.name}: опустевшая комната ждёт ${Math.round(waiting / MINUTE)} мин вместо получаса`);

  // 3. Раньше срока комната цела: связь могла оборваться на минуту.
  room.emptySince = Date.now() - 20 * MINUTE;
  await room.alarm();
  check(room.room, `${game.name}: комната исчезла через двадцать минут пустоты`);

  // 4. Кто-то вернулся — отсчёт начинается заново.
  const again = host.connect('p1');
  await room.alarm();
  check(!room.emptySince, `${game.name}: вернувшийся игрок не сбросил отсчёт пустоты`);
  host.disconnect(again);

  // 5. Полчаса без людей — комнаты нет.
  await room.webSocketClose(again, 1006, 'lost');
  room.emptySince = Date.now() - 31 * MINUTE;
  await room.alarm();
  check(!room.room, `${game.name}: пустая комната пережила полчаса`);
  check(host.storage.size === 0, `${game.name}: от пустой комнаты осталось хранилище`);

  // 6. Двенадцать часов — предел для любой комнаты, даже живой.
  const busy = createContext();
  const longRoom = new Room(busy.ctx, {});
  const started = await longRoom.fetch(post('/create', game.create('TEST34', player)));
  check((await started.json()).ok, `${game.name}: вторая комната не создалась`);
  busy.connect('p1');
  await longRoom.markOccupied();
  longRoom.room.updatedAt = Date.now() - 12 * HOUR - MINUTE;
  await longRoom.alarm();
  check(!longRoom.room, `${game.name}: комната с людьми пережила двенадцать часов`);
}

if (failures.length) {
  console.error(`Room lifetime check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: комнаты «Квартета» и «Библейского художника» живут двенадцать часов, '
  + 'а без людей — полчаса от обрыва последней связи; вернувшийся игрок отсчёт сбрасывает.');
