// Проверяет кнопки под сообщением рассылки и то, как панель сообщает об ошибках.
//
// Две вещи, которые ломались молча:
//
//   * кнопка была одна, и её поля уезжали на сервер по отдельности. Теперь их
//     две, у них есть раскладка, и весь набор должен доехать до Telegram именно
//     тем, что видит администратор в предпросмотре;
//   * когда мобильная сеть рвала загрузку вложения, в красную плашку уезжала
//     строка браузера — «Load failed». Администратор из неё не мог понять ни
//     что случилось, ни что делать.
//
// Клавиатура собирается на стороне воркера, поэтому её сборка проверяется
// напрямую по исходнику стора: в браузер она не попадает.

import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const client = read('web/js/broadcast-cloudflare.js');
const store = read('cloudflare/app-core-worker/src/broadcast-user-store.js');
const styles = read('web/styles/broadcast-cloudflare.css');

// --- панель ---------------------------------------------------------------------
for (const id of ['bc-button-text', 'bc-button-url', 'bc-button2-text', 'bc-button2-url', 'bc-buttons-layout']) {
  assert.ok(client.includes(`id="${id}"`), `в панели нет поля ${id}`);
}
assert.ok(client.includes('buttons: buttons.items'), 'панель не отправляет список кнопок');
assert.ok(client.includes('buttonsLayout: buttons.layout'), 'панель не отправляет раскладку кнопок');
assert.ok(/Цвет кнопок задать нельзя/.test(client), 'панель не объясняет, почему нет выбора цвета');
assert.ok(client.includes('data-bc-emoji'), 'нет быстрых значков для текста кнопки');
assert.ok(styles.includes('.broadcast-v2__button-row'), 'поля второй кнопки не оформлены');

// --- сообщения об ошибках --------------------------------------------------------
const humanError = new Function(`
  ${client.match(/function humanError\(error\) \{[\s\S]*?\n  \}/)[0]}
  return humanError;
`)();
assert.equal(humanError(new Error('Load failed')), 'Нет связи с сервером рассылки. Проверьте интернет и попробуйте ещё раз');
assert.equal(humanError(new TypeError('Failed to fetch')), 'Нет связи с сервером рассылки. Проверьте интернет и попробуйте ещё раз');
const aborted = new Error('The operation was aborted');
aborted.name = 'AbortError';
assert.equal(humanError(aborted), 'Запрос слишком долго не отвечал. Попробуйте ещё раз');
assert.equal(humanError(new Error('Фото должно быть не больше 10 МБ')), 'Фото должно быть не больше 10 МБ',
  'осмысленное сообщение сервера не должно подменяться');
assert.ok(client.includes('AbortController'), 'загрузка вложения по-прежнему без ограничения по времени');
assert.ok(/for \(let attempt = 1; attempt <= 2/.test(client), 'загрузка вложения не повторяется после обрыва связи');

// --- сборка клавиатуры на сервере -------------------------------------------------
// Собирается в этой же области видимости: объекты из отдельного контекста vm
// приходят с чужими прототипами, и строгое сравнение на них спотыкается.
const keyboardFor = new Function(`
  const MAX_BUTTONS = 2;
  ${store.match(/function keyboardFor\(job = \{\}\) \{[\s\S]*?\n\}/)[0]}
  ${store.match(/function parseButtons\(value\) \{[\s\S]*?\n\}/)[0]}
  return keyboardFor;
`)();

const two = JSON.stringify({ layout: 'row', items: [{ text: 'Играть', url: 'https://a' }, { text: 'Канал', url: 'https://b' }] });
assert.deepEqual(keyboardFor({ buttons: two }), [[{ text: 'Играть', url: 'https://a' }, { text: 'Канал', url: 'https://b' }]],
  'две кнопки в одну строку собираются неверно');

const stacked = JSON.stringify({ layout: 'stack', items: [{ text: 'Играть', url: 'https://a' }, { text: 'Канал', url: 'https://b' }] });
assert.deepEqual(keyboardFor({ buttons: stacked }), [[{ text: 'Играть', url: 'https://a' }], [{ text: 'Канал', url: 'https://b' }]],
  'кнопки друг под другом собираются неверно');

assert.deepEqual(keyboardFor({ buttons: JSON.stringify({ layout: 'stack', items: [{ text: 'Одна', url: 'https://a' }] }) }),
  [[{ text: 'Одна', url: 'https://a' }]], 'одна кнопка не должна зависеть от раскладки');

// Рассылки, созданные до появления списка, лежат в старых колонках.
assert.deepEqual(keyboardFor({ buttons: '[]', button_text: 'Старая', button_url: 'https://old' }),
  [[{ text: 'Старая', url: 'https://old' }]], 'прежние рассылки потеряли свою кнопку');
assert.equal(keyboardFor({ buttons: '[]' }), null, 'без кнопок клавиатуры быть не должно');
assert.equal(keyboardFor({ buttons: 'сломанный json' }), null, 'испорченные данные не должны ронять отправку');

const many = JSON.stringify({ layout: 'row', items: [1, 2, 3].map((n) => ({ text: `К${n}`, url: `https://${n}` })) });
assert.equal(keyboardFor({ buttons: many })[0].length, 2, 'кнопок в сообщении должно быть не больше двух');

// --- разбор причин недоставки ---------------------------------------------------------
// Telegram отвечает по-английски и по-своему. Раньше наверх уезжала одна
// последняя строка вроде «Bad Request: chat not found», и по ней нельзя было
// понять, сломалась рассылка или это обычные недоступные получатели.
const failureReason = new Function(`
  ${client.match(/const FAILURE_REASONS = \[[\s\S]*?\n  \];/)[0]}
  ${client.match(/function failureReason\(message\) \{[\s\S]*?\n  \}/)[0]}
  return failureReason;
`)();

assert.equal(failureReason('Bad Request: chat not found'), 'не начинали диалог с ботом');
assert.equal(failureReason('Forbidden: bot was blocked by the user'), 'заблокировали бота');
assert.equal(failureReason('Forbidden: user is deactivated'), 'аккаунт удалён');
assert.equal(failureReason('Too Many Requests: retry after 5'), 'Telegram придержал отправку');
assert.equal(failureReason(''), 'причина неизвестна');
assert.equal(failureReason('Совсем новая ошибка'), 'Совсем новая ошибка', 'незнакомую причину нельзя прятать');

assert.ok(store.includes('errorBreakdown(job.id)'), 'статус рассылки не отдаёт разбор причин');
assert.ok(/GROUP BY error/.test(store), 'разбор причин не группируется по ошибке');
assert.ok(client.includes('renderBreakdown(job)'), 'панель не показывает разбор причин');

// --- миграция -----------------------------------------------------------------------
assert.ok(/ALTER TABLE broadcast_jobs ADD COLUMN buttons/.test(store),
  'новой колонке нет миграции, а таблица создаётся через CREATE TABLE IF NOT EXISTS');
assert.ok(store.includes('buttons TEXT NOT NULL DEFAULT'), 'колонка buttons не объявлена');

console.log('Кнопки рассылки в порядке: две кнопки с раскладкой доезжают до Telegram, старые рассылки '
  + 'не теряют свою кнопку, недоставка объясняется по причинам, а обрыв связи — человеческими словами вместо «Load failed».');
