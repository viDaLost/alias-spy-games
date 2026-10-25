// Доступ к базе. Используем сырые запросы `sql` — они не привязаны к таблице,
// поэтому все значения приходят «как в SQLite»: числа, строки, 0/1.

import { db } from 'sdk';
import { sql } from 'sdk/db';
import { DEFAULT_CATEGORIES } from './categories.js';

const now = () => Math.floor(Date.now() / 1000);

// ── Настройки бота ─────────────────────────────────────────────────────────

export async function getSetting(key) {
  const row = await db.get(sql`SELECT value FROM settings WHERE key = ${key}`);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  if (value === null || value === undefined) {
    await db.run(sql`DELETE FROM settings WHERE key = ${key}`);
    return;
  }
  await db.run(sql`INSERT INTO settings (key, value) VALUES (${key}, ${String(value)})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
}

// ── Пользователи ───────────────────────────────────────────────────────────

function parseUser(row) {
  if (!row) return null;
  let state = null;
  try { state = row.state ? JSON.parse(row.state) : null; } catch { state = null; }
  return { ...row, state };
}

export async function getUser(tgId) {
  return parseUser(await db.get(sql`SELECT * FROM users WHERE tg_id = ${tgId}`));
}

/** Создаёт пользователя при первом обращении. Возвращает { user, created }. */
export async function ensureUser(from) {
  const existing = await getUser(from.id);
  if (existing) {
    if (existing.first_name !== (from.first_name || '') || existing.username !== (from.username || '')) {
      await db.run(sql`UPDATE users SET first_name = ${from.first_name || ''}, username = ${from.username || ''} WHERE tg_id = ${from.id}`);
    }
    return { user: existing, created: false };
  }
  await db.run(sql`INSERT INTO users (tg_id, first_name, username, created_at)
    VALUES (${from.id}, ${from.first_name || ''}, ${from.username || ''}, ${now()})
    ON CONFLICT(tg_id) DO NOTHING`);
  await seedCategories(from.id);
  return { user: await getUser(from.id), created: true };
}

export async function setUserState(tgId, state) {
  await db.run(sql`UPDATE users SET state = ${state ? JSON.stringify(state) : null} WHERE tg_id = ${tgId}`);
}

export async function setUserCurrency(tgId, currency) {
  await db.run(sql`UPDATE users SET currency = ${currency} WHERE tg_id = ${tgId}`);
}

export async function setUserTz(tgId, tz) {
  await db.run(sql`UPDATE users SET tz_offset = ${tz} WHERE tg_id = ${tgId}`);
}

// Список допущенных к приватному боту хранится в settings: allow:<tg_id> = имя.
export async function isAllowed(tgId) {
  return Boolean(await getSetting(`allow:${tgId}`));
}

export async function setAllowed(tgId, label) {
  await setSetting(`allow:${tgId}`, label ? label : null);
}

export async function listAllowed() {
  const rows = await db.all(sql`SELECT key, value FROM settings WHERE key LIKE 'allow:%' ORDER BY key`);
  return rows.map((r) => ({ id: r.key.slice(6), label: r.value }));
}

// ── Категории ──────────────────────────────────────────────────────────────

export async function seedCategories(userId) {
  const has = await db.get(sql`SELECT count(*) AS c FROM categories WHERE user_id = ${userId}`);
  if (has && has.c > 0) return;
  let sort = 0;
  for (const c of DEFAULT_CATEGORIES) {
    await db.run(sql`INSERT INTO categories (user_id, kind, code, name, emoji, keywords, archived, sort)
      VALUES (${userId}, ${c.kind}, ${c.code}, ${c.name}, ${c.emoji}, '', 0, ${sort++})`);
  }
}

// У подкатегории сразу подтягиваем название и эмодзи родителя (parent_name, parent_emoji).
export async function listCategories(userId, { includeArchived = false } = {}) {
  return includeArchived
    ? db.all(sql`SELECT c.*, p.name AS parent_name, p.emoji AS parent_emoji FROM categories c
        LEFT JOIN categories p ON p.id = c.parent_id AND p.user_id = c.user_id
        WHERE c.user_id = ${userId} ORDER BY c.kind DESC, c.sort, c.id`)
    : db.all(sql`SELECT c.*, p.name AS parent_name, p.emoji AS parent_emoji FROM categories c
        LEFT JOIN categories p ON p.id = c.parent_id AND p.user_id = c.user_id
        WHERE c.user_id = ${userId} AND c.archived = 0 ORDER BY c.kind DESC, c.sort, c.id`);
}

export async function getCategory(userId, id) {
  return db.get(sql`SELECT c.*, p.name AS parent_name, p.emoji AS parent_emoji FROM categories c
    LEFT JOIN categories p ON p.id = c.parent_id AND p.user_id = c.user_id
    WHERE c.user_id = ${userId} AND c.id = ${id}`);
}

export async function addCategory(userId, { kind, name, emoji, parentId = 0 }) {
  const max = await db.get(sql`SELECT max(sort) AS s FROM categories WHERE user_id = ${userId} AND kind = ${kind} AND parent_id = ${parentId}`);
  const res = await db.run(sql`INSERT INTO categories (user_id, kind, code, name, emoji, keywords, archived, sort, parent_id)
    VALUES (${userId}, ${kind}, '', ${name}, ${emoji || ''}, '', 0, ${((max && max.s) || 0) + 1}, ${parentId}) RETURNING id`);
  return (res.rows && res.rows[0] && res.rows[0].id) || res.lastInsertRowid;
}

// Удаление категории убирает и её подкатегории.
export async function archiveCategory(userId, id) {
  await db.run(sql`UPDATE categories SET archived = 1 WHERE user_id = ${userId} AND (id = ${id} OR parent_id = ${id})`);
}

// Возврат категории возвращает её подкатегории, а возврат подкатегории — и её родителя.
export async function restoreCategory(userId, id) {
  await db.run(sql`UPDATE categories SET archived = 0 WHERE user_id = ${userId}
    AND (id = ${id} OR parent_id = ${id} OR id = (SELECT parent_id FROM categories WHERE user_id = ${userId} AND id = ${id}))`);
}

export async function setCategoryParent(userId, id, parentId) {
  await db.run(sql`UPDATE categories SET parent_id = ${parentId} WHERE user_id = ${userId} AND id = ${id}`);
}

export async function updateCategory(userId, id, { name, emoji, keywords }) {
  await db.run(sql`UPDATE categories SET name = ${name}, emoji = ${emoji || ''}, keywords = ${keywords || ''}
    WHERE user_id = ${userId} AND id = ${id}`);
}

export async function setCategorySort(userId, id, sort) {
  await db.run(sql`UPDATE categories SET sort = ${sort} WHERE user_id = ${userId} AND id = ${id}`);
}

export async function setCategoryKeywords(userId, id, keywords) {
  await db.run(sql`UPDATE categories SET keywords = ${keywords} WHERE user_id = ${userId} AND id = ${id}`);
}

// ── Операции ───────────────────────────────────────────────────────────────

export async function addTransaction(userId, t) {
  const res = await db.run(sql`INSERT INTO transactions
    (user_id, kind, amount, currency, category_id, note, occurred_at, created_at, source, raw)
    VALUES (${userId}, ${t.kind}, ${t.amount}, ${t.currency}, ${t.categoryId}, ${t.note || ''},
            ${t.occurredAt}, ${now()}, ${t.source || 'text'}, ${(t.raw || '').slice(0, 1000)})
    RETURNING id`);
  return (res.rows && res.rows[0] && res.rows[0].id) || res.lastInsertRowid;
}

export async function getTransaction(userId, id) {
  return db.get(sql`SELECT * FROM transactions WHERE user_id = ${userId} AND id = ${id}`);
}

export async function deleteTransaction(userId, id) {
  const res = await db.run(sql`DELETE FROM transactions WHERE user_id = ${userId} AND id = ${id}`);
  return res.rowsAffected > 0;
}

export async function setTransactionCategory(userId, id, kind, categoryId) {
  await db.run(sql`UPDATE transactions SET kind = ${kind}, category_id = ${categoryId} WHERE user_id = ${userId} AND id = ${id}`);
}

export async function setTransactionDate(userId, id, occurredAt) {
  await db.run(sql`UPDATE transactions SET occurred_at = ${occurredAt} WHERE user_id = ${userId} AND id = ${id}`);
}

export async function setTransactionAmount(userId, id, amount, currency) {
  await db.run(sql`UPDATE transactions SET amount = ${amount}, currency = ${currency} WHERE user_id = ${userId} AND id = ${id}`);
}

export async function setTransactionNote(userId, id, note) {
  await db.run(sql`UPDATE transactions SET note = ${note} WHERE user_id = ${userId} AND id = ${id}`);
}

export async function updateTransaction(userId, id, t) {
  await db.run(sql`UPDATE transactions SET kind = ${t.kind}, amount = ${t.amount}, currency = ${t.currency},
    category_id = ${t.categoryId}, note = ${t.note || ''}, occurred_at = ${t.occurredAt}
    WHERE user_id = ${userId} AND id = ${id}`);
}

export async function lastTransactions(userId, limit, offset = 0) {
  return db.all(sql`SELECT * FROM transactions WHERE user_id = ${userId}
    ORDER BY occurred_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`);
}

export async function countTransactions(userId) {
  const row = await db.get(sql`SELECT count(*) AS c FROM transactions WHERE user_id = ${userId}`);
  return row ? row.c : 0;
}

export async function lastCreatedTransaction(userId) {
  return db.get(sql`SELECT * FROM transactions WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`);
}

export async function transactionsInRange(userId, from, to) {
  return db.all(sql`SELECT * FROM transactions WHERE user_id = ${userId}
    AND occurred_at >= ${from} AND occurred_at < ${to} ORDER BY occurred_at, id`);
}

/** Суммы по категориям за период: [{ kind, category_id, currency, total, cnt }]. */
export async function totalsByCategory(userId, from, to) {
  return db.all(sql`SELECT kind, category_id, currency, sum(amount) AS total, count(*) AS cnt
    FROM transactions WHERE user_id = ${userId} AND occurred_at >= ${from} AND occurred_at < ${to}
    GROUP BY kind, category_id, currency ORDER BY total DESC`);
}

export async function topExpenses(userId, from, to, currency, limit = 3) {
  return db.all(sql`SELECT * FROM transactions WHERE user_id = ${userId} AND kind = 'expense'
    AND currency = ${currency} AND occurred_at >= ${from} AND occurred_at < ${to}
    ORDER BY amount DESC LIMIT ${limit}`);
}

// Траты категории за период — вместе с её подкатегориями. categoryId = 0 — все расходы.
export async function categoryMonthSpent(userId, categoryId, currency, from, to) {
  const row = categoryId
    ? await db.get(sql`SELECT coalesce(sum(amount), 0) AS s FROM transactions WHERE user_id = ${userId}
        AND kind = 'expense' AND currency = ${currency}
        AND category_id IN (SELECT id FROM categories WHERE user_id = ${userId} AND (id = ${categoryId} OR parent_id = ${categoryId}))
        AND occurred_at >= ${from} AND occurred_at < ${to}`)
    : await db.get(sql`SELECT coalesce(sum(amount), 0) AS s FROM transactions WHERE user_id = ${userId}
        AND kind = 'expense' AND currency = ${currency} AND occurred_at >= ${from} AND occurred_at < ${to}`);
  return row ? row.s : 0;
}

// ── Бюджеты ────────────────────────────────────────────────────────────────

export async function listBudgets(userId) {
  return db.all(sql`SELECT * FROM budgets WHERE user_id = ${userId} ORDER BY category_id`);
}

export async function setBudget(userId, categoryId, amount) {
  if (!amount) {
    await db.run(sql`DELETE FROM budgets WHERE user_id = ${userId} AND category_id = ${categoryId}`);
    return;
  }
  await db.run(sql`INSERT INTO budgets (user_id, category_id, amount) VALUES (${userId}, ${categoryId}, ${amount})
    ON CONFLICT(user_id, category_id) DO UPDATE SET amount = excluded.amount`);
}

// ── Удаление всех данных пользователя ─────────────────────────────────────

export async function wipeUserData(userId) {
  await db.run(sql`DELETE FROM transactions WHERE user_id = ${userId}`);
  await db.run(sql`DELETE FROM budgets WHERE user_id = ${userId}`);
  await db.run(sql`DELETE FROM categories WHERE user_id = ${userId}`);
  await seedCategories(userId);
}
