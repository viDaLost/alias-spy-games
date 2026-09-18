// rules.js — правила партии на сервере.
//
// Здесь ничего не написано заново. Импортируются ровно те файлы, что лежат в
// web/games и отдаются браузеру: правила, движок и соперники от игры. Порядок
// важен — window-shim первым, дальше как в разметке: правила знают только
// себя, движок читает правила, боты читают оба.
//
// Расходиться этим двум сторонам нельзя ни на строчку. Если бы сервер считал
// партию своим кодом, а браузер рисовал своим, первая же правка правил развела
// бы их молча — и разошлись бы не картинки, а чья-то раздача.

import './window-shim.js';
import '../../../web/games/twelve-tribes-rules.js';
import '../../../web/games/twelve-tribes-engine.js';
import '../../../web/games/twelve-tribes-bots.js';

export const R = globalThis.window.TwelveTribesRules;
export const E = globalThis.window.TwelveTribesEngine;
export const Bots = globalThis.window.TwelveTribesBots;
