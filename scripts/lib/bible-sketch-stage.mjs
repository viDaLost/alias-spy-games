// Открывает «Библейского художника» на экране рисования в браузере проверки.
//
// Комната настоящая — вид собран движком, — а связь подменена: WebSocket
// заменён на сокет, который сразу «открылся» и присылает этот вид. Так экран
// рисования получается без второго игрока и без воркера, а проверять на нём
// можно то, ради чего он и нужен: холст, кисти и цвета.

import { sketchView } from './bible-sketch-view.mjs';

const BACKEND = 'https://alias-spy-games-bible-sketch.vitaledanilov.workers.dev';

/** Готовит страницу: подмена связи, комната в localStorage, заглушки Telegram. */
export async function prepareSketchPage(context, page, view = sketchView({ strokes: 2 })) {
  await context.addInitScript(({ state }) => {
    window.__APP_TELEMETRY_DISABLED__ = true;
    window.__sketchState = state;
    localStorage.setItem('bible_sketch_room_id_v1', 'TEST12');
    localStorage.setItem('bible_sketch_player_name_v1', 'Хозяин');
    localStorage.setItem('game_rules_seen_v1', JSON.stringify({ 'bible-sketch': 1 }));

    class StageSocket extends EventTarget {
      constructor() {
        super();
        this.readyState = 1;
        window.__sentActions = [];
        // Ссылка на живой сокет игры: через неё проверка присылает состояние
        // заново — так же, как это делает комната на каждое действие игрока.
        window.__stageSocket = this;
        window.__pushState = () => this.dispatchEvent(Object.assign(new Event('message'), {
          data: JSON.stringify({ type: 'state', state: window.__sketchState }),
        }));
        // Открытие и состояние — разными заходами. Слушателя сообщений игра
        // вешает уже после того, как дождалась открытия, и состояние,
        // отправленное следом в том же кадре, до неё не доходит.
        setTimeout(() => this.dispatchEvent(new Event('open')), 0);
        for (const delay of [40, 120, 260]) {
          setTimeout(() => this.dispatchEvent(Object.assign(new Event('message'), {
            data: JSON.stringify({ type: 'state', state: window.__sketchState }),
          })), delay);
        }
      }
      send(raw) { try { window.__sentActions.push(JSON.parse(raw)); } catch { window.__sentActions.push(raw); } }
      close() { this.readyState = 3; }
    }
    StageSocket.OPEN = 1; StageSocket.CONNECTING = 0; StageSocket.CLOSED = 3;
    window.WebSocket = StageSocket;
  }, { state: view });

  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: 'window.Telegram={WebApp:{initData:"",initDataUnsafe:{user:{id:4242,first_name:"Хозяин"}},ready(){},expand(){},'
      + 'requestFullscreen(){},lockOrientation(){},unlockOrientation(){},setHeaderColor(){},setBackgroundColor(){},'
      + 'disableVerticalSwipes(){},enableClosingConfirmation(){},disableClosingConfirmation(){},'
      + 'viewportStableHeight:0,HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};',
  }));
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**', 'https://alias-spy-games-core.vitaledanilov.workers.dev/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"ok":true}' }));
  }
  await page.route(`${BACKEND}/rooms/*/join`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"ok":true,"sessionToken":"stage","roomId":"TEST12"}',
  }));
}

/** Доводит приложение до экрана рисования. */
export async function openSketchStage(page, baseURL) {
  await page.goto(baseURL, { waitUntil: 'commit', timeout: 25_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 20_000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'), null, { timeout: 20_000 });
  /*
    Экран запуска уходит позже, чем снимается класс app-booting: он держится
    заданное время и ещё доигрывает уход. Пока он на экране, elementFromPoint
    возвращает его, а не кнопки, и проверка «до инструментов не дотянуться»
    падала через раз на коде, которого никто не трогал. Ждём, пока сцену
    уберут из документа.
  */
  await page.waitForFunction(() => !document.getElementById('gamehub-boot-scene'), null, { timeout: 20_000 });
  await page.evaluate(() => window.showGame('bible-sketch'));
  await page.waitForSelector(process.env.SKETCH_STAGE_SELECTOR || '.bsk-canvas', { timeout: 20_000 });
  /*
    И заставка входа в игру: холст уже в документе, а поверх него ещё лежит
    .game-entry-loader. Оба экрана — и запуска приложения, и входа в игру —
    уходят по своим таймерам, а не по готовности игры, поэтому ждать надо
    именно их ухода: иначе elementFromPoint отвечает про заставку.
  */
  await page.waitForFunction(
    () => !document.querySelector('.game-entry-loader.is-active')
      && !document.documentElement.classList.contains('game-entry-loading'),
    null,
    { timeout: 20_000 },
  );
  await waitForStableLayout(page);
}

/*
  Ждать раскладку, а не секундомер.

  Здесь стояла пауза в 300 миллисекунд, и её иногда не хватало: полоса
  инструментов встаёт в две строки не сразу — сначала приезжает альбомный лист,
  потом холст берёт свою высоту, и только после этого кнопки оказываются на
  своих местах. На нагруженной машине замер попадал в середину этого движения,
  и проверка падала на коде, которого никто не трогал.

  Теперь измеряется сама полоса: раскладка считается устоявшейся, когда два
  замера подряд совпали. Дольше обычного это не занимает — на спокойном прогоне
  совпадение наступает со второго замера.
*/
export async function waitForStableLayout(page, { timeout = 6000, step = 120 } = {}) {
  const read = () => page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? `${Math.round(rect.top)}:${Math.round(rect.height)}:${Math.round(rect.width)}` : 'нет';
    };
    return `${box('.bsk-tools')}|${box('.bsk-canvas')}|${document.querySelectorAll('.bsk-tool, .bsk-color').length}`;
  });
  let previous = await read();
  for (const deadline = Date.now() + timeout; Date.now() < deadline;) {
    await page.waitForTimeout(step);
    const current = await read();
    if (current === previous && !current.startsWith('нет')) return;
    previous = current;
  }
}
