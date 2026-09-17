// rules.js — правила партии на сервере.
//
// Здесь ничего не написано заново. Импортируются ровно те файлы, что лежат в
// public/ и отдаются браузеру: поле, колоды, движок и соперники. Порядок
// важен — window-shim первым, дальше как в разметке: board знает только себя,
// engine читает board, bots читают оба.
//
// Расходиться этим двум сторонам нельзя ни на строчку: если сервер считает
// партию своим кодом, а клиент рисует своим, первая же правка правил разведёт
// их молча — и разойдутся не числа на экране, а чей-то удел.

import './window-shim.js';
import '../public/board.js';
import '../public/cards.js';
import '../public/engine.js';
import '../public/bots.js';

export const B = globalThis.window.PromisedLandBoard;
export const E = globalThis.window.PromisedLandEngine;
export const Bots = globalThis.window.PromisedLandBots;
export const CARDS = globalThis.window.PromisedLandCards;

/*
  Что игроку разрешено просить у партии. Список закрытый не из осторожности, а
  по необходимости: без него в движок можно было бы позвать что угодно по имени,
  включая createGame и clone. Читающие функции сюда не входят — их клиент
  считает у себя, по тому же состоянию.
*/
export const GAME_ACTIONS = new Set([
  'roll', 'buy', 'decline', 'endTurn',
  'build', 'altar', 'sell', 'redeem',
  'settle', 'serve', 'pledge', 'redeemPledge',
  'takeCard', 'dealBuild', 'keepPromise', 'breakPromise', 'bail',
]);

/** Числа и «да/нет» — всё, что действие может принести с собой. */
export function sanitizeArgs(args) {
  if (!Array.isArray(args)) return [];
  return args.slice(0, 2).map((one) => {
    if (typeof one === 'boolean') return one;
    if (typeof one === 'number' && Number.isFinite(one)) return Math.trunc(one);
    return String(one).slice(0, 32);
  });
}
