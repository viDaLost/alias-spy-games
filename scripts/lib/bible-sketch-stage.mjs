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
  await page.evaluate(() => window.showGame('bible-sketch'));
  await page.waitForSelector(process.env.SKETCH_STAGE_SELECTOR || '.bsk-canvas', { timeout: 20_000 });
  await page.waitForTimeout(300);
}
