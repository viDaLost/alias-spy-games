import { table, integer, text, index, uniqueIndex, sql } from 'sdk/db';

// Все суммы хранятся в минимальных единицах (копейках/центах), даты — в unix-секундах (UTC).
// Внешних ключей на платформе нет: связи user_id / category_id поддерживаются кодом.

// Пользователи бота и их настройки.
export const users = table('users', {
  tgId:      integer('tg_id').primaryKey(),
  firstName: text('first_name').default(''),
  username:  text('username').default(''),
  currency:  text('currency').notNull().default('RUB'),
  tzOffset:  integer('tz_offset').notNull().default(180), // минуты от UTC, по умолчанию Москва
  state:     text('state'),                               // JSON диалога (ожидание ввода и т.п.)
  createdAt: integer('created_at').default(sql`(unixepoch())`),
});

// Категории расходов и доходов (свои у каждого пользователя) и их подкатегории.
export const categories = table('categories', {
  id:       integer('id').primaryKey({ autoIncrement: true }),
  userId:   integer('user_id').notNull(),
  kind:     text('kind').notNull(),                  // 'expense' | 'income'
  code:     text('code').default(''),                // код стандартной категории (для словаря)
  name:     text('name').notNull(),
  emoji:    text('emoji').default(''),
  keywords: text('keywords').default(''),            // выученные слова через запятую
  archived: integer('archived').notNull().default(0),
  sort:     integer('sort').notNull().default(0),
  parentId: integer('parent_id').notNull().default(0), // подкатегория: id родителя (одна вложенность), 0 — верхний уровень
}, (t) => ({
  userKindIdx: index('idx_categories_user_kind').on(t.userId, t.kind),
}));

// Операции.
export const transactions = table('transactions', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  userId:     integer('user_id').notNull(),
  kind:       text('kind').notNull(),                // 'expense' | 'income'
  amount:     integer('amount').notNull(),           // в минимальных единицах, > 0
  currency:   text('currency').notNull(),
  categoryId: integer('category_id').notNull(),
  note:       text('note').default(''),
  occurredAt: integer('occurred_at').notNull(),      // когда была трата (unix, UTC)
  createdAt:  integer('created_at').default(sql`(unixepoch())`),
  source:     text('source').default('text'),        // 'text' | 'voice'
  raw:        text('raw').default(''),               // исходный текст / расшифровка
}, (t) => ({
  userTimeIdx: index('idx_transactions_user_time').on(t.userId, t.occurredAt),
}));

// Месячные бюджеты: category_id = 0 — общий бюджет на все расходы.
export const budgets = table('budgets', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  userId:     integer('user_id').notNull(),
  categoryId: integer('category_id').notNull(),
  amount:     integer('amount').notNull(),
}, (t) => ({
  userCatIdx: uniqueIndex('uidx_budgets_user_cat').on(t.userId, t.categoryId),
}));

// Глобальные настройки бота: владелец, ключ распознавания речи и т.п.
export const settings = table('settings', {
  key:   text('key').primaryKey(),
  value: text('value'),
});
