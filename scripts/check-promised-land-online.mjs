// check-promised-land-online.mjs — «Земля обетованная» по сети, целиком.
//
// Комнату как данные проверяет check-promised-land-room.mjs, и там её гоняют
// сотней случайных входов. Здесь проверяется другое: настоящий воркер с
// настоящим Durable Object, поднятый локально, — то есть всё то, что между
// чистым состоянием и игроком.
//
// Стережётся то, ради чего партию и перенесли на сервер:
//
//   * чужим ходом не походить — даже если попросить напрямую, минуя кнопки;
//   * чужим ключом не представиться, а без ключа не войти вовсе;
//   * список ходов закрыт: createGame и clone по имени не позовёшь;
//   * правила на сервере — те же, что в браузере, а не вторая их копия;
//   * партия доходит до конца, и соперников от игры ведёт сервер, а не вкладка.
//
// Воркер поднимается настоящий (wrangler dev --local), потому что половина
// проверяемого живёт не в коде комнаты, а в устройстве: маршруты, run_worker_first
// и то, что window-shim вообще даёт правилам запуститься там, где eval запрещён.

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'cloudflare/promised-land-preview');
const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const port = await freePort();
const worker = spawn(
  path.join(dir, 'node_modules/.bin/wrangler'),
  ['dev', '--local', '--ip', '127.0.0.1', '--port', String(port)],
  { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] },
);
let workerLog = '';
worker.stdout.on('data', (chunk) => { workerLog += chunk; });
worker.stderr.on('data', (chunk) => { workerLog += chunk; });
worker.on('error', (error) => { workerLog += `\nwrangler не запустился: ${error.message}`; });

const base = `http://127.0.0.1:${port}`;
const api = async (method, url, body, token) => {
  const target = new URL(base + url);
  if (token) target.searchParams.set('token', token);
  const response = await fetch(target, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, ...payload };
};

/** Действие и ответ одним запросом: опрос по HTTP — и транспорт, и ход. */
let requestCounter = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/*
  Шаг в 150 мс — не «подождать на всякий случай», а признание того, что сервер
  считает шквалом. Он пропускает шестнадцать действий за две секунды: человеку
  столько не нажать, а этой проверке, играющей за двоих без рук, — запросто.
  Играть быстрее живого игрока значило бы проверять не игру, а защиту от шквала.
*/
const act = async (roomId, token, action, payload = {}) => {
  await pause(150);
  return api('POST', `/api/rooms/${roomId}/poll`, {
    action, payload, requestId: `r${(requestCounter += 1)}`,
  }, token);
};
const look = (roomId, token) => api('POST', `/api/rooms/${roomId}/poll`, {}, token);

try {
  // Воркер поднимается не мгновенно: первый запуск собирает правила и заводит
  // хранилище. Ждём его ответа, а не отмеренной паузы.
  let ready = null;
  for (let attempt = 0; attempt < 240 && !ready; attempt += 1) {
    await pause(250);
    ready = await fetch(`${base}/api/health`).then((r) => r.json()).catch(() => null);
  }
  if (!ready?.ok) throw new Error(`Воркер не поднялся за отведённое время.\n${workerLog.slice(-1500)}`);
  need(ready.cells === 36, `сервер знает ${ready.cells} клеток вместо 36`);

  // 1. Комната заводится, и код у неё человеческий: без похожих знаков.
  const host = await api('POST', '/api/rooms', { playerId: 'host-1', name: 'Хозяин' });
  need(host.status === 201 && host.ok, `комната не завелась: ${host.error || host.status}`);
  const roomId = host.roomId;
  need(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(String(roomId)), `код комнаты «${roomId}»`);
  need(Boolean(host.token), 'хозяину не выдали ключ');
  need(host.view?.youAreHost === true, 'заведший комнату не стал её хозяином');

  // 2. По коду входит второй, и оба видят друг друга.
  const guestOne = await api('POST', `/api/rooms/${roomId}/join`, { playerId: 'guest-1', name: 'Гостья' });
  need(guestOne.ok, `по коду не вошли: ${guestOne.error}`);
  need(guestOne.view?.players?.length === 2, `в комнате ${guestOne.view?.players?.length} игроков`);
  need(guestOne.view?.youAreHost === false, 'вошедший назвался хозяином');

  // 3. Несуществующей комнаты нет, а чужой ключ не подходит.
  const nowhere = await api('POST', '/api/rooms/ZZZZZ/join', { playerId: 'guest-2', name: 'Никто' });
  need(nowhere.status === 404, `вход в несуществующую комнату ответил ${nowhere.status}`);
  const stolen = await act(roomId, 'нетакогоключа', 'chat', { text: 'я тут' });
  need(stolen.status === 403, `с выдуманным ключом пустили: ${stolen.status}`);
  const noKey = await api('POST', `/api/rooms/${roomId}/poll`, { action: 'chat', payload: { text: 'и я' } });
  need(noKey.status === 403, `без ключа пустили: ${noKey.status}`);

  // 4. Переписка и настройки. Настройки — только хозяину.
  await act(roomId, guestOne.token, 'chat', { text: 'Привет!' });
  const heard = await look(roomId, host.token);
  need(heard.view?.chat?.at(-1)?.text === 'Привет!', 'сообщение гостя не дошло до хозяина');
  const notHost = await act(roomId, guestOne.token, 'settings', { years: 7 });
  need(notHost.status === 409 && notHost.code === 'NOT_HOST', `настройки поменял гость: ${notHost.code}`);
  await act(roomId, host.token, 'settings', { years: 3, mode: 'jubilee', bots: 1 });
  const tuned = await look(roomId, host.token);
  need(tuned.view?.settings?.years === 3, `срок партии ${tuned.view?.settings?.years}`);
  need(tuned.view?.settings?.bots === 1, `соперников от игры ${tuned.view?.settings?.bots}`);
  need(tuned.view?.tableSize === 3, `за столом насчитали ${tuned.view?.tableSize}`);
  // «Сто лет» и «наугад» до партии не доходят: настройки чистятся на сервере.
  await act(roomId, host.token, 'settings', { years: 'сто', mode: 'наугад', bots: 99 });
  const clamped = await look(roomId, host.token);
  need(clamped.view?.settings?.years === 3, `«сто» лет приняли как ${clamped.view?.settings?.years}`);
  need(clamped.view?.settings?.mode === 'jubilee', `режим «наугад» приняли как «${clamped.view?.settings?.mode}»`);
  need(clamped.view?.settings?.bots === 4, `девяносто девять соперников ужали до ${clamped.view?.settings?.bots}`);
  // Партию до конца играют вдвоём: соперник от игры проверяется отдельно, и
  // отдельно не ради чистоты — он ходит по будильнику, и партия с ним идёт
  // столько же времени, сколько шла бы у живых людей.
  await act(roomId, host.token, 'settings', { years: 3, mode: 'jubilee', bots: 0 });

  // 5. Партию начинает хозяин, сразу — гостя дожидаться не нужно.
  const notYours = await act(roomId, guestOne.token, 'start');
  need(notYours.status === 409 && notYours.code === 'NOT_HOST', `партию начал гость: ${notYours.code}`);
  const begun = await act(roomId, host.token, 'start');
  need(begun.ok && begun.view?.phase === 'playing', `партия не началась: ${begun.error}`);
  need(begun.view?.game?.players?.length === 2, `за столом ${begun.view?.game?.players?.length} игроков вместо двоих`);
  need(begun.view?.seat === 'p0', `хозяину досталось место «${begun.view?.seat}»`);
  const guestSeat = await look(roomId, guestOne.token);
  need(guestSeat.view?.seat === 'p1', `гостье досталось место «${guestSeat.view?.seat}»`);

  // 6. В идущую партию не входят со стороны.
  const late = await api('POST', `/api/rooms/${roomId}/join`, { playerId: 'guest-9', name: 'Опоздавший' });
  need(late.status === 409 && late.code === 'ROOM_STARTED', `в идущую партию вошли: ${late.code}`);

  /*
    7. Чужой ход. Это главное, ради чего партия считается на сервере: кнопку
    на экране спрятать легко, а запрос отправить руками — ещё легче.
  */
  const stealTurn = await act(roomId, guestOne.token, 'game', { name: 'roll' });
  need(stealTurn.status === 409 && stealTurn.code === 'NOT_YOUR_TURN',
    `гостья походила за хозяина: ${stealTurn.code || stealTurn.status}`);

  // 8. Список ходов закрыт: по имени не позвать ни createGame, ни clone.
  for (const forbidden of ['createGame', 'clone', 'jubilee', 'toString']) {
    const called = await act(roomId, host.token, 'game', { name: forbidden });
    need(called.status === 409 && called.code === 'UNKNOWN_MOVE',
      `движок отозвался на «${forbidden}»: ${called.code || called.status}`);
  }

  /*
    9. Партия до конца. Ходят все трое: за двоих — эта проверка, за третьего —
    сервер по своему будильнику. Если будильник не заведён или бот не ходит,
    партия встанет на его ходу, и здесь это видно как остановка.
  */
  const tokens = { p0: host.token, p1: guestOne.token };
  let view = begun.view;
  let steps = 0;
  /*
    Застревание ловится отдельно от долготы. Партия, которая идёт долго, и
    партия, которая встала на одном и том же ходу, — это две разные поломки, и
    сообщение «не дошла за столько-то шагов» про вторую не говорит ничего.
  */
  let mark = '';
  let still = 0;
  while (view?.game?.status === 'playing' && steps < 4000) {
    steps += 1;
    const game = view.game;
    const player = game.players[game.turn];
    const answer = await playOne(roomId, tokens[player.id], game, player);
    if (!answer?.view) {
      need(false, `ход оборвался: ${answer?.error || answer?.status}`);
      break;
    }
    view = answer.view;
    const now = `${view.game.turn}|${view.game.phase}|${view.game.pending?.type || '-'}|${view.game.log.length}`;
    still = now === mark ? still + 1 : 0;
    mark = now;
    if (still > 20) { need(false, `партия встала на ${mark}`); break; }
  }
  need(view?.game?.status === 'jubilee', `партия не дошла до конца за ${steps} шагов: «${view?.game?.status}»`);
  need(Array.isArray(view?.game?.scores) && view.game.scores.length === 2, 'в конце не посчитали наследие');

  /*
    Соперник от игры ходит сам. Проверяется буквально это: своя комната, ход
    отдан сопернику — и никто больше ничего не нажимает. Если сервер не заведёт
    будильник или не позовёт разум соперников, партия просто встанет, и здесь
    это видно как неизменившаяся запись в летописи.
  */
  const solo = await api('POST', '/api/rooms', { playerId: 'host-2', name: 'Одиночка' });
  await act(solo.roomId, solo.token, 'settings', { years: 3, mode: 'jubilee', bots: 1 });
  const soloStart = await act(solo.roomId, solo.token, 'start');
  need(soloStart.ok, `партия с соперником от игры не началась: ${soloStart.error}`);
  need(soloStart.view?.game?.players?.[1]?.isBot === true, 'вторым сел не соперник от игры');
  // Ход человека закрывается вручную — дальше очередь соперника, и её ведёт сервер.
  let soloView = soloStart.view;
  while (soloView.game.players[soloView.game.turn].id === 'p0' && soloView.game.status === 'playing') {
    const answer = await playOne(solo.roomId, solo.token, soloView.game, soloView.game.players[soloView.game.turn]);
    if (!answer?.view) break;
    soloView = answer.view;
  }
  const before = soloView.game.log.length;
  let after = before;
  for (let attempt = 0; attempt < 40 && after === before; attempt += 1) {
    await pause(200);
    after = (await look(solo.roomId, solo.token)).view?.game?.log?.length ?? before;
  }
  need(after > before, 'соперник от игры не походил сам — его ходы делает не сервер');
  await act(solo.roomId, solo.token, 'leave');

  /*
    10. «Играть ещё раз». Короткий путь с юбилея: не разводить всех по лобби и
    не спрашивать готовность заново, а сдать новую партию тем же составом.
    Проверяется здесь, на живом воркере, потому что живёт этот путь не в
    правилах комнаты, а в самом Durable Object: комната возвращается в лобби, и
    тут же по её же списку мест собирается новая партия.
  */
  const rematchRoom = await api('POST', '/api/rooms', { playerId: 'host-3', name: 'Заново' });
  await act(rematchRoom.roomId, rematchRoom.token, 'settings', { years: 3, mode: 'jubilee', bots: 1 });
  const firstRun = await act(rematchRoom.roomId, rematchRoom.token, 'start');
  need(firstRun.ok, `партия для повтора не началась: ${firstRun.error}`);
  const firstYear = firstRun.view?.game?.year;
  const strangerAgain = await act(rematchRoom.roomId, 'чужой-ключ', 'playAgain');
  need(!strangerAgain.ok, 'ещё одну партию начали чужим ключом');
  const again = await act(rematchRoom.roomId, rematchRoom.token, 'playAgain');
  need(again.ok, `ещё одна партия не началась: ${again.error}`);
  need(again.view?.phase === 'playing', `после «ещё раз» комната в состоянии «${again.view?.phase}»`);
  need(again.view?.game?.year === firstYear, 'новая партия началась не с начала');
  need(again.view?.game?.log?.length <= 2,
    `в новой партии уже ${again.view?.game?.log?.length} событий — это прежняя`);
  need(again.view?.game?.players?.length === firstRun.view.game.players.length,
    'состав стола в новой партии другой');
  await act(rematchRoom.roomId, rematchRoom.token, 'leave');

  // 11. Вернуться в комнату может хозяин, и партия при этом забывается.
  const back = await act(roomId, host.token, 'backToLobby');
  need(back.ok && back.view?.phase === 'lobby', `в комнату не вернулись: ${back.error}`);
  need(back.view?.game === null || back.view?.game === undefined, 'после возврата партия осталась висеть');

  // 12. Ушли все — комната исчезает вместе с ключами.
  await act(roomId, guestOne.token, 'leave');
  const closed = await act(roomId, host.token, 'leave');
  need(closed.closed === true, 'последний ушёл, а комната осталась');
  const ghost = await look(roomId, host.token);
  need(ghost.status === 403, `в закрытую комнату вошли по старому ключу: ${ghost.status}`);
} finally {
  worker.kill('SIGTERM');
}

/*
  Один ход за одного игрока. Выбор здесь нарочно самый простой: проверяется не
  умение играть, а то, что сервер принимает ход и партия движется. Разум
  соперников проверяется отдельно, шестьюстами партиями в check-promised-land.
*/
async function playOne(roomId, token, game, player) {
  if (!token) throw new Error(`за ${player.id} играть некому`);
  const pending = game.pending;
  if (pending?.type === 'card') return act(roomId, token, 'game', { name: 'takeCard' });
  if (pending?.type === 'promise') return act(roomId, token, 'game', { name: 'breakPromise' });
  if (pending?.type === 'pay') {
    if (player.silver >= pending.amount) return act(roomId, token, 'game', { name: 'settle' });
    return act(roomId, token, 'game', { name: 'serve' });
  }
  if (pending?.type === 'buy') {
    const wants = player.silver > 900;
    return act(roomId, token, 'game', { name: wants ? 'buy' : 'decline' });
  }
  if (game.phase === 'roll') return act(roomId, token, 'game', { name: 'roll' });
  return act(roomId, token, 'game', { name: 'endTurn' });
}

if (problems.length) {
  console.error('«Земля обетованная» по сети не прошла проверку:');
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: комната заводится и пускает по коду, чужим ключом не представиться, настройки и '
  + 'начало партии — за хозяином, чужим ходом не походить и незнакомого хода не позвать, а партия '
  + 'на живом воркере доходит до юбилея, и соперника от игры ведёт сервер; «играть ещё раз» сдаёт '
  + 'новую партию тем же составом, и только по просьбе хозяина.');
