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
  'tradeOffer', 'tradeAccept', 'tradeDecline',
]);

/*
  Ответ на уговор даёт не тот, чей ход, — в этом весь смысл уговора. Эти два
  хода проверяются иначе: их вправе сделать тот, кому уговор предложен, и
  только пока уговор висит.
*/
export const TRADE_ANSWERS = new Set(['tradeAccept', 'tradeDecline']);

/*
  Уговор приходит с телефона одним свёртком, и доверять ему нельзя ни в одном
  поле: «отдаю» может оказаться строкой, «доплата» — бесконечностью, а уделов
  в списке — тысяча. Здесь свёрток приводится к тому единственному виду, какой
  движок вообще рассматривает; всё остальное движок отвергнет сам.
*/
export function sanitizeTrade(value) {
  const list = (raw) => (Array.isArray(raw) ? raw : [])
    .slice(0, 8)
    .map((one) => Math.trunc(Number(one)))
    .filter((one) => Number.isInteger(one) && one >= 0 && one < 64);
  const silver = Math.trunc(Number(value?.silver));
  return {
    to: String(value?.to || '').slice(0, 8),
    give: list(value?.give),
    take: list(value?.take),
    silver: Number.isFinite(silver) ? Math.max(-100000, Math.min(100000, silver)) : 0,
  };
}

/** Числа и «да/нет» — всё, что действие может принести с собой. */
export function sanitizeArgs(args) {
  if (!Array.isArray(args)) return [];
  return args.slice(0, 2).map((one) => {
    if (typeof one === 'boolean') return one;
    if (typeof one === 'number' && Number.isFinite(one)) return Math.trunc(one);
    return String(one).slice(0, 32);
  });
}
