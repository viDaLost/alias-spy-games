import test from 'node:test';
import assert from 'node:assert/strict';

import { openTicketFor, rateLimitMessage } from '../src/support-rules.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

test('продолжение разговора попадает в открытое обращение', () => {
  const now = Date.now();
  const open = openTicketFor([
    { id: 'sup_a', status: 'new', updated_at: now - 5 * MINUTE },
  ], now);
  assert.equal(open?.id, 'sup_a');
});

test('закрытое обращение не продолжается', () => {
  const now = Date.now();
  assert.equal(openTicketFor([{ id: 'sup_a', status: 'closed', updated_at: now }], now), null);
});

test('обращение недельной давности не продолжается', () => {
  const now = Date.now();
  assert.equal(openTicketFor([{ id: 'sup_a', status: 'new', updated_at: now - 7 * 24 * HOUR }], now), null);
});

test('отвеченное обращение всё ещё принимает уточнения', () => {
  const now = Date.now();
  const open = openTicketFor([
    { id: 'sup_old', status: 'closed', updated_at: now - MINUTE },
    { id: 'sup_new', status: 'answered', updated_at: now - 2 * MINUTE },
  ], now);
  assert.equal(open?.id, 'sup_new');
});

test('отказ называет точное время ожидания', () => {
  const now = Date.now();
  assert.match(rateLimitMessage(now - 4 * MINUTE, now), /через 6 минут/);
  assert.match(rateLimitMessage(now - 9 * MINUTE, now), /через 1 минуту/);
  assert.match(rateLimitMessage(now - 7 * MINUTE, now), /через 3 минуты/);
});

test('отказ подсказывает, что делать вместо нового обращения', () => {
  assert.match(rateLimitMessage(Date.now(), Date.now()), /допишите в открытое обращение/);
});
