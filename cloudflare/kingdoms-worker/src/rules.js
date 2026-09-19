// rules.js — правила партии на сервере.
//
// Здесь ничего не написано заново. Импортируются ровно те файлы, что лежат в
// web/games и отдаются браузеру: карта, движок и соперники от игры. Порядок
// важен — window-shim первым, дальше как в разметке: правила знают только
// себя, движок читает правила, боты читают оба.
//
// Расходиться этим двум сторонам нельзя ни на строчку. Если бы сервер считал
// партию своим кодом, а браузер рисовал своим, первая же правка карты развела
// бы их молча — и разошлась бы не картинка, а чья-то область.

import './window-shim.js';
import '../../../web/games/kingdoms-rules.js';
import '../../../web/games/kingdoms-engine.js';
import '../../../web/games/kingdoms-bots.js';

export const R = globalThis.window.KingdomsRules;
export const E = globalThis.window.KingdomsEngine;
export const Bots = globalThis.window.KingdomsBots;
