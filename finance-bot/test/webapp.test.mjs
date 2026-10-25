import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resetDb, applySchema, db } from 'sdk/db';
import { calls } from 'sdk';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import app from '../tgcloud/endpoints/app.js';

const OWNER = { id: 111, first_name: 'Аня', is_bot: false };
const OTHER = { id: 222, first_name: 'Боб', is_bot: false };
let mid = 1;
const say = (text, from = OWNER) => onMessage({ message_id: mid++, from, chat: { id: from.id, type: 'private' }, date: 0, text });
const call = (op, data = {}, user = OWNER) => app({ op, ...data }, { initData: { user } });
const code = async (p) => { try { await p; return null; } catch (e) { return e.parameters && e.parameters.code; } };

beforeEach(() => {
  resetDb();
  applySchema(schema);
  calls.length = 0;
});

test('доступ: нужен владелец и допуск', async () => {
  assert.equal(await code(call('init')), 'NO_OWNER');
  assert.equal(await code(app({ op: 'init' }, {})), 'NO_USER');
  await say('/start');
  const init = await call('init');
  assert.equal(init.me.isOwner, true);
  assert.ok(init.categories.length > 20);
  assert.match(init.periods.month, /^m\d{6}$/);
  assert.equal(await code(call('init', {}, OTHER)), 'FORBIDDEN');
  await say('/allow 222');
  assert.equal((await call('init', {}, OTHER)).me.isOwner, false);
  assert.equal(await code(call('nope')), 'BAD_OP');
});

test('записи: добавить, изменить, найти, удалить', async () => {
  await say('/start');
  const { categories, today } = await call('init');
  const cafe = categories.find((c) => c.code === 'cafe');
  const r = await call('saveTx', { kind: 'expense', amount: 25000, categoryId: cafe.id, note: 'капучино', date: today });
  assert.equal(r.tx.amount, 25000);
  assert.equal(r.tx.categoryId, cafe.id);
  assert.equal(r.tx.date, today);

  const food = categories.find((c) => c.code === 'food');
  const upd = await call('saveTx', { id: r.tx.id, kind: 'expense', amount: 30000, categoryId: food.id, note: 'сыр', date: '2026-09-03' });
  assert.equal(upd.tx.date, '2026-09-03');
  assert.equal(upd.tx.categoryId, food.id);

  await call('saveTx', { kind: 'income', amount: 5000000, categoryId: 0, note: 'зарплата' });
  const list = await call('list', { period: 'a' });
  assert.equal(list.total, 2);
  assert.equal((await call('list', { period: 'a', q: 'сыр' })).total, 1);
  assert.equal((await call('list', { period: 'a', kind: 'income' })).items[0].note, 'зарплата');
  assert.equal(await code(call('saveTx', { kind: 'expense', amount: 0 })), 'BAD_AMOUNT');

  await call('deleteTx', { id: r.tx.id });
  assert.equal((await call('list', { period: 'a' })).total, 1);
  assert.equal(await code(call('deleteTx', { id: r.tx.id })), 'NOT_FOUND');
});

test('быстрый ввод и сводка', async () => {
  await say('/start');
  const q = await call('quickAdd', { text: 'хлеб 60, такси 450' });
  assert.equal(q.items.length, 2);
  await call('quickAdd', { text: '+50000 зарплата' });
  assert.equal(await code(call('quickAdd', { text: 'просто текст' })), 'NO_AMOUNT');

  const { periods } = await call('init');
  const s = await call('summary', { period: periods.month });
  assert.equal(s.expense, 51000);
  assert.equal(s.income, 5000000);
  assert.equal(s.count, 3);
  assert.equal(s.series.unit, 'day');
  assert.ok(s.series.points.length >= 28);
  assert.equal(s.byCategory.filter((x) => x.kind === 'expense').length, 2);
  assert.equal((await call('summary', { period: periods.year })).series.unit, 'month');
  assert.equal((await call('summary', { period: 'мусор' })).period.code, periods.month);
});

test('свои категории: слова, порядок, удаление и бюджет', async () => {
  await say('/start');
  const made = await call('saveCategory', { kind: 'expense', name: 'Спорт', emoji: '🏋️', keywords: ['падел', 'Теннисом', 'бассейн у дома'] });
  const sport = made.categories.find((c) => c.id === made.id);
  assert.deepEqual(sport.keywords, ['паде', 'теннис', 'бассейн у дома']);
  assert.equal(await code(call('saveCategory', { kind: 'expense', name: 'спорт' })), 'DUPLICATE');

  const q = await call('quickAdd', { text: 'теннис 1500' });
  assert.equal(q.items[0].categoryId, made.id);

  const renamed = await call('saveCategory', { id: made.id, name: 'Спорт и фитнес', emoji: '⚽', keywords: sport.keywords });
  assert.equal(renamed.categories.find((c) => c.id === made.id).name, 'Спорт и фитнес');

  const before = (await call('init')).categories.filter((c) => c.kind === 'expense' && !c.archived).sort((a, b) => a.sort - b.sort);
  const moved = await call('moveCategory', { id: made.id, dir: -1 });
  const after = moved.categories.filter((c) => c.kind === 'expense' && !c.archived).sort((a, b) => a.sort - b.sort);
  assert.equal(after.findIndex((c) => c.id === made.id), before.findIndex((c) => c.id === made.id) - 1);

  const other = before.find((c) => c.code === 'other');
  assert.equal(await code(call('archiveCategory', { id: other.id })), 'FALLBACK');
  const arch = await call('archiveCategory', { id: made.id });
  assert.equal(arch.categories.find((c) => c.id === made.id).archived, true);
  await call('archiveCategory', { id: made.id, archived: false });

  const b = await call('setBudget', { categoryId: made.id, amount: 300000 });
  assert.deepEqual(b.budgets.map((x) => [x.categoryId, x.amount, x.spent]), [[made.id, 300000, 150000]]);
  const income = before.length && (await call('init')).categories.find((c) => c.kind === 'income');
  assert.equal(await code(call('setBudget', { categoryId: income.id, amount: 1 })), 'BAD_CATEGORY');
});

test('настройки и выгрузка Excel в чат', async () => {
  await say('/start');
  const s = await call('saveSettings', { currency: 'USD', tz: 300 });
  assert.equal(s.me.currency, 'USD');
  assert.equal(s.me.tz, 300);
  assert.equal(await code(call('saveSettings', { currency: 'XXX' })), 'BAD_CURRENCY');
  await call('saveSettings', { currency: 'RUB', tz: 180 });

  assert.equal(await code(call('exportExcel', { period: 'a' })), 'EMPTY');
  for (const t of ['продукты 3000', 'такси 450', 'вчера обед 700', '+50000 зарплата']) await call('quickAdd', { text: t });
  const r = await call('exportExcel', { period: 'a', mode: 'full' });
  assert.equal(r.count, 4);
  const doc = calls.filter((c) => c.method === 'sendDocument').at(-1);
  assert.equal(doc.params.chat_id, 111);
  assert.match(doc.params.document.name, /^finance_all-time\.xlsx$/);
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./out/app-full.xlsx', import.meta.url), doc.params.document.bytes);
});

test('подкатегории в приложении', async () => {
  await say('/start');
  const { categories } = await call('init');
  const health = categories.find((c) => c.code === 'health');
  const food = categories.find((c) => c.code === 'food');
  const r = await call('addSubs', { parentId: health.id, names: ['Аптека', 'Врачи', 'аптека', ''] });
  assert.equal(r.added.length, 2);
  const pharmacy = r.categories.find((c) => c.name === 'Аптека');
  assert.equal(pharmacy.parentId, health.id);
  assert.ok((await call('init')).suggestions.health.includes('Стоматолог'));

  assert.equal(await code(call('saveCategory', { kind: 'expense', name: 'Аптека', parentId: health.id })), 'DUPLICATE');
  const sameName = await call('saveCategory', { kind: 'expense', name: 'Аптека', parentId: food.id });
  assert.ok(sameName.id, 'в другой категории такое имя можно');
  assert.equal(await code(call('saveCategory', { kind: 'expense', name: 'Икс', parentId: pharmacy.id })), 'BAD_PARENT');
  assert.equal(await code(call('saveCategory', { id: health.id, name: 'Здоровье', parentId: food.id })), 'HAS_SUBS');

  await call('saveTx', { kind: 'expense', amount: 50000, categoryId: pharmacy.id, note: 'нурофен' });
  await call('saveTx', { kind: 'expense', amount: 20000, categoryId: health.id, note: 'витамины' });
  const all = await call('list', { period: 'a', categoryId: health.id });
  assert.equal(all.total, 2, 'фильтр по категории включает подкатегории');
  assert.equal((await call('list', { period: 'a', categoryId: pharmacy.id })).total, 1);
  const q = await call('quickAdd', { text: 'нурофен 300' });
  assert.equal(q.items[0].categoryId, pharmacy.id, 'выученное слово ведёт в подкатегорию');

  await call('setBudget', { categoryId: health.id, amount: 100000 });
  const s = await call('summary', { period: 'a' });
  assert.equal(s.budgets[0].spent, 100000, 'бюджет категории считает подкатегории');

  // Подкатегории видны в Excel: отдельная колонка в «Операциях» и строки «↳» в сводке.
  await call('exportExcel', { period: 'a', mode: 'full' });
  const xlsx = new TextDecoder().decode(calls.filter((x) => x.method === 'sendDocument').at(-1).params.document.bytes);
  assert.match(xlsx, />Подкатегория</);
  assert.match(xlsx, /↳ Аптека/);
  assert.match(xlsx, /↳ без уточнения/);
  await call('exportExcel', { period: 'a', categoryId: health.id });
  const one = new TextDecoder().decode(calls.filter((x) => x.method === 'sendDocument').at(-1).params.document.bytes);
  assert.match(one, />Подкатегория</, 'и в выгрузке одной категории');

  const moved = await call('saveCategory', { id: pharmacy.id, name: 'Аптека', parentId: 0 });
  assert.equal(moved.categories.find((c) => c.id === pharmacy.id).parentId, 0, 'подкатегорию можно сделать самостоятельной');
});
