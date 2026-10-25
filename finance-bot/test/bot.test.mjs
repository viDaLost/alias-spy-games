import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resetDb, applySchema, db } from 'sdk/db';
import { calls, files, fetchRoutes, fetchLog } from 'sdk';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import onCallback from '../tgcloud/handlers/callback_query.js';

const OWNER = { id: 111, first_name: 'Аня', is_bot: false };
const OTHER = { id: 222, first_name: 'Боб', is_bot: false };
let mid = 1;
const msg = (from, extra) => ({ message_id: mid++, from, chat: { id: from.id, type: 'private' }, date: 0, ...extra });
const say = (text, from = OWNER) => onMessage(msg(from, { text }));
const press = (data, from = OWNER, message_id = 5000) => onCallback({ id: 'cb' + mid++, from, data, message: { message_id, chat: { id: from.id } } });
const sent = () => calls.filter((c) => c.method === 'sendMessage' || c.method === 'editMessageText');
const lastText = () => sent().at(-1).params.text;
const lastMarkup = () => sent().at(-1).params.reply_markup;
const buttons = () => (lastMarkup()?.inline_keyboard || []).flat();
const txs = () => db.all('SELECT * FROM transactions ORDER BY id');

beforeEach(() => {
  resetDb();
  applySchema(schema);
  calls.length = 0;
  fetchRoutes.length = 0;
  fetchLog.length = 0;
});

test('первый пользователь становится владельцем, чужих не пускает', async () => {
  await say('/start');
  assert.match(lastText(), /Привет, Аня/);
  assert.match(lastText(), /владелец/);
  assert.ok(calls.some((c) => c.method === 'setMyCommands'));
  assert.equal((await db.all("SELECT * FROM categories WHERE user_id = 111")).length > 10, true);
  await say('кофе 250', OTHER);
  assert.match(lastText(), /личный бот/);
  assert.equal((await txs()).length, 0);
  await say('/allow 222');
  await say('кофе 250', OTHER);
  assert.match(lastText(), /Записал расход/);
});

test('запись траты, смена категории с обучением, удаление', async () => {
  await say('/start');
  await say('шаверма у дома 320');
  let [t] = await txs();
  assert.equal(t.amount, 32000);
  assert.match(lastText(), /−320\u00a0₽/);
  assert.match(lastText(), /Кафе/);

  await say('падел 1500');
  t = (await txs())[1];
  assert.match(lastText(), /Не уверен в категории/);
  const fun = await db.get("SELECT id FROM categories WHERE user_id = 111 AND code = 'fun'");
  await press(`t:s:${t.id}:${fun.id}`);
  assert.ok(calls.some((c) => c.method === 'answerCallbackQuery' && /Запомнил: «падел»/.test(c.params.text || '')));
  await say('падел с друзьями 2000');
  assert.match(lastText(), /Развлечения/);
  assert.doesNotMatch(lastText(), /Не уверен/);

  await press(`t:x:${t.id}`);
  assert.match(lastText(), /Удалено/);
  assert.equal((await txs()).length, 2);
  await say('/undo');
  assert.match(lastText(), /Удалил последнюю запись/);
  assert.equal((await txs()).length, 1);
});

test('несколько трат, доход, правка суммы и даты', async () => {
  await say('/start');
  await say('хлеб 60, молоко 90, сыр 300');
  assert.match(lastText(), /Записал 3 операции/);
  assert.match(lastText(), /Итого расходов: <b>450\u00a0₽/);
  await say('+50000 зарплата');
  const all = await txs();
  assert.equal(all.at(-1).kind, 'income');
  assert.match(lastText(), /Зарплата/);

  const t = all[0];
  await press(`t:e:${t.id}`);
  await say('75 хлеб бородинский');
  let fresh = await db.get(`SELECT * FROM transactions WHERE id = ${t.id}`);
  assert.equal(fresh.amount, 7500);
  assert.equal(fresh.note, 'хлеб бородинский');

  await press(`t:dd:${t.id}`);
  await say('3 сентября');
  fresh = await db.get(`SELECT * FROM transactions WHERE id = ${t.id}`);
  assert.equal(new Date((fresh.occurred_at + 3 * 3600) * 1000).getUTCDate(), 3);
});

test('отчёт, бюджет, настройки', async () => {
  await say('/start');
  await say('продукты 3000');
  await say('такси 1000');
  await say('📊 Отчёт');
  assert.match(lastText(), /Расходы: <b>4 000\u00a0₽/);
  assert.match(lastText(), /Продукты — <b>3 000\u00a0₽<\/b> · 75%/);
  assert.ok(buttons().some((b) => b.callback_data.startsWith('x:p:m')));

  await say('/budget продукты 3500');
  assert.match(lastText(), /Бюджет «Продукты»: 3 500\u00a0₽/);
  await say('продукты 600');
  assert.match(lastText(), /🔴 Бюджет «Продукты» превышен/);

  await press('s:cur:USD');
  assert.equal((await db.get('SELECT currency FROM users WHERE tg_id = 111')).currency, 'USD');
  await press('s:tz:300');
  assert.equal((await db.get('SELECT tz_offset FROM users WHERE tg_id = 111')).tz_offset, 300);
});

test('голосовое: расшифровка + разбор ИИ', async () => {
  await say('/start');
  await say('/setkey gsk_test_key_123');
  assert.ok(calls.some((c) => c.method === 'deleteMessage'));
  assert.match(lastText(), /проверка не прошла|сохранён/);

  fetchRoutes.push({ match: '/audio/transcriptions', reply: () => ({ text: 'Вчера потратил тысячу двести на продукты и триста на такси' }) });
  fetchRoutes.push({
    match: '/chat/completions',
    reply: (url, init) => {
      const body = JSON.parse(init.body);
      assert.match(body.messages[0].content, /Категории расходов: Продукты/);
      return { choices: [{ message: { content: JSON.stringify({ items: [
        { type: 'expense', amount: 1200, currency: 'RUB', category: 'Продукты', note: 'продукты', date: '2026-10-24' },
        { type: 'expense', amount: 300, currency: 'RUB', category: 'Транспорт', note: 'такси', date: '2026-10-24' },
      ] }) } }] };
    },
  });
  files.set('VOICE1', new Uint8Array([1, 2, 3]));
  await onMessage(msg(OWNER, { voice: { file_id: 'VOICE1', duration: 4, file_size: 3 } }));
  const all = await txs();
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((t) => [t.amount, t.note, t.source]), [[120000, 'продукты', 'voice'], [30000, 'такси', 'voice']]);
  assert.match(lastText(), /Записал 2 операции/);
  assert.match(lastText(), /🎙 <i>«Вчера потратил/);
  const stt = fetchLog.find((f) => f.url.includes('/audio/transcriptions'));
  assert.equal(stt.init.headers.Authorization, 'Bearer gsk_test_key_123');
  assert.ok(stt.init.body.fields.some(([k, v]) => k === 'file' && v.name === 'voice.ogg'));
});

test('голосовое без ключа подсказывает, как подключить', async () => {
  await say('/start');
  await onMessage(msg(OWNER, { voice: { file_id: 'X', duration: 4 } }));
  assert.match(lastText(), /setkey/);
});

test('выгрузка Excel', async () => {
  await say('/start');
  for (const t of ['продукты 3000', 'такси 450', 'кофе 250', 'вчера обед 700', '+50000 зарплата', '$12 подписка']) await say(t);
  await say('📥 Excel');
  assert.match(lastText(), /За какой период/);
  const monthBtn = buttons()[0].callback_data;
  await press(monthBtn);
  assert.match(lastText(), /Полный отчёт/);
  const full = buttons().find((b) => b.text.includes('Полный')).callback_data;
  await press(full);
  const doc = calls.filter((c) => c.method === 'sendDocument').at(-1);
  assert.ok(doc, 'документ отправлен');
  assert.match(doc.params.document.name, /^finance_\d{4}-\d{2}\.xlsx$/);
  assert.match(doc.params.caption, /6 операций/);
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./out/full.xlsx', import.meta.url), doc.params.document.bytes);

  const prod = await db.get("SELECT id FROM categories WHERE user_id = 111 AND code = 'food'");
  await press(monthBtn.replace('x:p:', 'x:g:') + ':' + prod.id);
  const one = calls.filter((c) => c.method === 'sendDocument').at(-1);
  assert.match(one.params.document.name, /_produkty\.xlsx$/);
  writeFileSync(new URL('./out/category.xlsx', import.meta.url), one.params.document.bytes);

  await say('/excel всё');
  await press(buttons().find((b) => b.text.includes('Кратко')).callback_data);
  writeFileSync(new URL('./out/list.xlsx', import.meta.url), calls.filter((c) => c.method === 'sendDocument').at(-1).params.document.bytes);
});

test('категории: добавить и удалить', async () => {
  await say('/start');
  await press('c:a:expense');
  await say('🏋️ Спорт');
  assert.match(lastText(), /Категория «Спорт» добавлена/);
  const cat = await db.get("SELECT * FROM categories WHERE name = 'Спорт'");
  assert.equal(cat.emoji, '🏋️');
  await say('спорт 2500');
  assert.match(lastText(), /Спорт/);
  await press(`c:rm:${cat.id}`);
  assert.equal((await db.get(`SELECT archived FROM categories WHERE id = ${cat.id}`)).archived, 1);
});

test('категории: переименовать, вернуть, создать из карточки записи', async () => {
  await say('/start');
  const food = await db.get("SELECT * FROM categories WHERE user_id = 111 AND code = 'food'");
  await press('c:e:expense');
  assert.match(lastText(), /Какую категорию изменить/);
  await press(`c:ed:${food.id}`);
  await say('🥦 Еда домой');
  assert.match(lastText(), /называется «🥦 Еда домой»/);
  assert.equal((await db.get(`SELECT name, emoji FROM categories WHERE id = ${food.id}`)).name, 'Еда домой');
  await press(`c:ed:${food.id}`);
  await say('🍎');
  assert.deepEqual({ ...(await db.get(`SELECT name, emoji FROM categories WHERE id = ${food.id}`)) }, { name: 'Еда домой', emoji: '🍎' });

  await press(`c:rm:${food.id}`);
  await press('c:l:expense');
  assert.ok(buttons().some((b) => b.callback_data === 'c:r:expense'));
  await press(`c:rs:${food.id}`);
  assert.equal((await db.get(`SELECT archived FROM categories WHERE id = ${food.id}`)).archived, 0);

  await say('падел 1500');
  const t = (await txs()).at(-1);
  assert.ok(buttons().some((b) => b.callback_data === `t:n:${t.id}`));
  await press(`t:n:${t.id}`);
  await say('🎾 Падел');
  assert.match(lastText(), /Новая категория «Падел»/);
  const padel = await db.get("SELECT * FROM categories WHERE name = 'Падел'");
  assert.equal((await db.get(`SELECT category_id FROM transactions WHERE id = ${t.id}`)).category_id, padel.id);
  await say('падел вечером 1200');
  assert.match(lastText(), /Падел/);
});

test('/app открывает мини-приложение', async () => {
  await say('/start');
  assert.ok(calls.some((c) => c.method === 'setChatMenuButton' && c.params.menu_button.type === 'web_app'));
  await say('/app');
  assert.ok(buttons().some((b) => b.web_app && /tgcloud\.ai/.test(b.web_app.url)));
});
