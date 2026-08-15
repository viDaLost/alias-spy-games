# Пользовательские данные в Cloudflare

После SQL-миграции основная пользовательская база находится в Durable Object `UserStore`, объект с именем `global`, таблица `users`.

## Где смотреть

Cloudflare Dashboard → Durable Objects → `UserStore` → объект `global` → Data Studio.

Основная таблица: `users`.

## Поля

- `telegram_id` — Telegram ID пользователя (TEXT, primary key)
- `username` — Telegram username без `@`
- `telegram_link` — ссылка `https://t.me/...`
- `is_banned` — `0` / `1`
- `wow_stars` — прогресс «Библейские слова»
- `ws_stars` — прогресс «Поиск слов»
- `sacred_level` — уровень «Священное слово»
- `last_games` — JSON последних игр
- `created_at` — время создания записи, Unix ms
- `updated_at` — время последнего изменения, Unix ms
- `last_seen_at` — время последнего открытия приложения, Unix ms

Служебные поля `admin_pending_*` защищают изменение прогресса из админ-панели от немедленной перезаписи старым локальным значением пользователя.

## Примеры запросов

Показать пользователей:

```sql
SELECT telegram_id, username, wow_stars, ws_stars, sacred_level, is_banned, last_seen_at
FROM users
ORDER BY last_seen_at DESC;
```

Найти пользователя:

```sql
SELECT * FROM users
WHERE telegram_id = '1288379477';
```

Изменить прогресс:

```sql
UPDATE users
SET wow_stars = 25,
    updated_at = unixepoch('subsec') * 1000
WHERE telegram_id = '1288379477';
```

Заблокировать пользователя:

```sql
UPDATE users
SET is_banned = 1,
    updated_at = unixepoch('subsec') * 1000
WHERE telegram_id = '123456789';
```

Разблокировать:

```sql
UPDATE users
SET is_banned = 0,
    updated_at = unixepoch('subsec') * 1000
WHERE telegram_id = '123456789';
```

## Резервная копия

Старые записи `user:*`, созданные через KV API внутри SQLite-backed Durable Object, после миграции **не удаляются**. Они остаются резервной копией для отката. Основное приложение после миграции читает и пишет таблицу `users`.

Cloudflare также предоставляет Point-in-Time Recovery для SQLite-backed Durable Objects, поэтому содержимое объекта можно восстановить на состояние из доступного окна восстановления.

## Важно

Перед ручным `UPDATE` лучше сначала выполнить `SELECT` для нужного `telegram_id`. Не используйте `DELETE FROM users` или массовый `UPDATE` без `WHERE`, если вы не намерены изменить всю базу.
