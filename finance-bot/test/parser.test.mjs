import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseText, wordsToDigits, parseBudgetText, parseAmountAndNote } from '../tgcloud/lib/parser.js';
import { parsePeriodText, decodePeriod, findDateInText } from '../tgcloud/lib/dates.js';
import { DEFAULT_CATEGORIES, guessCategory } from '../tgcloud/lib/categories.js';

// 25.10.2026 15:00 по Москве (воскресенье)
const NOW = Date.UTC(2026, 9, 25, 12, 0);
const P = (t) => parseText(t, { tz: 180, currency: 'RUB', nowMs: NOW });
const cats = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: i + 1, keywords: '' }));
const cat = (note, kind = 'expense') => (guessCategory(note, cats, kind) || {}).code;

test('простые записи', () => {
  let r = P('кофе 250');
  assert.equal(r.items.length, 1);
  assert.deepEqual([r.items[0].amount, r.items[0].note, r.items[0].kind], [25000, 'кофе', 'expense']);
  r = P('250 кофе');
  assert.deepEqual([r.items[0].amount, r.items[0].note], [25000, 'кофе']);
  r = P('Такси 1 200 р');
  assert.deepEqual([r.items[0].amount, r.items[0].note, r.items[0].currency], [120000, 'Такси', 'RUB']);
  r = P('продукты в пятёрочке 1 234,50');
  assert.deepEqual([r.items[0].amount, r.items[0].note], [123450, 'продукты в пятёрочке']);
  r = P('потратил 500 рублей на бензин');
  assert.deepEqual([r.items[0].amount, r.items[0].note], [50000, 'бензин']);
});

test('доходы', () => {
  let r = P('+50000 зарплата');
  assert.deepEqual([r.items[0].kind, r.items[0].amount], ['income', 5000000]);
  r = P('зарплата 100к');
  assert.deepEqual([r.items[0].kind, r.items[0].amount, r.items[0].note], ['income', 10000000, 'зарплата']);
  r = P('кэшбэк 350');
  assert.equal(r.items[0].kind, 'income');
  r = P('получил 5 тысяч за фриланс');
  assert.deepEqual([r.items[0].kind, r.items[0].amount, r.items[0].note], ['income', 500000, 'фриланс']);
});

test('несколько операций', () => {
  let r = P('хлеб 60, молоко 90, сыр 300');
  assert.deepEqual(r.items.map((i) => [i.note, i.amount]), [['хлеб', 6000], ['молоко', 9000], ['сыр', 30000]]);
  r = P('кофе 250 и круассан 180');
  assert.deepEqual(r.items.map((i) => [i.note, i.amount]), [['кофе', 25000], ['круассан', 18000]]);
  r = P('60 хлеб 90 молоко');
  assert.deepEqual(r.items.map((i) => [i.note, i.amount]), [['хлеб', 6000], ['молоко', 9000]]);
});

test('даты', () => {
  let r = P('вчера такси 450');
  assert.deepEqual(r.items[0].ymd, { y: 2026, m: 10, d: 24 });
  assert.equal(r.items[0].note, 'такси');
  r = P('12.10 продукты 3400');
  assert.deepEqual([r.items[0].ymd, r.items[0].amount], [{ y: 2026, m: 10, d: 12 }, 340000]);
  r = P('обед 12.09');
  assert.deepEqual([r.items[0].amount, r.items[0].ymd.d], [1209, 25]);
  r = P('кофе 2.50');
  assert.equal(r.items[0].amount, 250);
  r = P('3 сентября кино 800');
  assert.deepEqual([r.items[0].ymd, r.items[0].amount, r.items[0].note], [{ y: 2026, m: 9, d: 3 }, 80000, 'кино']);
  r = P('в пятницу кино 800');
  assert.deepEqual(r.items[0].ymd, { y: 2026, m: 10, d: 23 });
  r = P('20.12 подарок 3000'); // будущая дата без года → прошлый год
  assert.deepEqual(r.items[0].ymd, { y: 2025, m: 12, d: 20 });
});

test('валюты и числа словами', () => {
  let r = P('$20 подписка');
  assert.deepEqual([r.items[0].currency, r.items[0].amount, r.items[0].note], ['USD', 2000, 'подписка']);
  r = P('15 евро обед');
  assert.deepEqual([r.items[0].currency, r.items[0].amount, r.items[0].note], ['EUR', 1500, 'обед']);
  assert.equal(wordsToDigits('потратил две тысячи пятьсот на продукты'), 'потратил 2500 на продукты');
  assert.equal(wordsToDigits('одну шаурму за триста'), 'одну шаурму за 300');
  r = P('полторы тысячи на такси');
  assert.deepEqual([r.items[0].amount, r.items[0].note], [150000, 'такси']);
  r = P('Вчера потратил тысячу двести на продукты и триста на такси');
  assert.deepEqual(r.items.map((i) => [i.note, i.amount]), [['продукты', 120000], ['такси', 30000]]);
  assert.deepEqual(r.items[0].ymd, { y: 2026, m: 10, d: 24 });
});

test('без суммы — пусто', () => {
  assert.equal(P('привет').items.length, 0);
  assert.equal(P('').items.length, 0);
});

test('категории по словарю', () => {
  assert.equal(cat('кофе'), 'cafe');
  assert.equal(cat('продукты в пятёрочке'), 'food');
  assert.equal(cat('Такси'), 'transport');
  assert.equal(cat('бензин'), 'car');
  assert.equal(cat('шаурма'), 'cafe');
  assert.equal(cat('аптека'), 'health');
  assert.equal(cat('барбершоп'), 'beauty');
  assert.equal(cat('netflix'), 'subs');
  assert.equal(cat('корм коту'), 'pets');
  assert.equal(cat('зарплата', 'income'), 'salary');
  assert.equal(cat('кэшбэк', 'income'), 'refund');
  assert.equal(cat('непонятное'), undefined);
  const learned = cats.map((c) => (c.code === 'fun' ? { ...c, keywords: 'падел' } : c));
  assert.equal(guessCategory('падел корт', learned, 'expense').code, 'fun');
});

test('бюджет и правка', () => {
  assert.deepEqual(parseBudgetText('50000'), { amount: 5000000, name: '' });
  assert.deepEqual(parseBudgetText('продукты 15к'), { amount: 1500000, name: 'продукты' });
  assert.deepEqual(parseBudgetText('продукты 0'), { amount: 0, name: 'продукты' });
  assert.deepEqual(parseAmountAndNote('350 кофе с собой'), { amount: 35000, currency: null, note: 'кофе с собой' });
});

test('периоды', () => {
  const p = (t) => parsePeriodText(t, 180, NOW);
  assert.equal(p('сентябрь'), 'm202609');
  assert.equal(p('декабрь'), 'm202512');
  assert.equal(p('сентябрь 2025'), 'm202509');
  assert.equal(p('2025'), 'y2025');
  assert.equal(p('01.09-15.09'), 'r20260901_20260915');
  assert.equal(p('с 1 по 15 октября'), 'r20261001_20261015');
  assert.equal(p('последние 7 дней'), 'r20261019_20261025');
  assert.equal(p('прошлый месяц'), 'm202609');
  assert.equal(p('неделя'), 'w20261019');
  assert.equal(p('всё'), 'a');
  assert.equal(decodePeriod('m202602').toYmd.d, 28);
  assert.equal(decodePeriod('m202613'), null);
  assert.equal(findDateInText('просто текст', 180, NOW), null);
});
