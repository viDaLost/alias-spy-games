# Квартет v2 — переход на Cloudflare

Новая версия Квартета использует Cloudflare Workers + Durable Objects + WebSocket вместо Google Apps Script polling.

## Что меняется

- Один Durable Object = одна игровая комната.
- Все руки и правила хранятся и проверяются сервером.
- Клиенты получают изменения по WebSocket сразу после хода.
- Чужие руки никогда не отправляются другим игрокам.
- При обрыве сети клиент автоматически переподключается.
- Ход ограничен 90 секундами; при таймауте очередь автоматически переходит дальше.
- Комнаты удаляются после длительного простоя.

## 1. Добавить GitHub Secrets

Для GitHub Actions нужны repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TELEGRAM_BOT_TOKEN`
- `QUARTET_SESSION_SECRET`

`QUARTET_SESSION_SECRET` — случайная длинная строка (32+ байта).

## 2. Развернуть Worker

В GitHub откройте:

`Actions → Deploy Quartet Cloudflare backend → Run workflow`

Workflow сначала запускает тесты игрового движка, затем устанавливает секреты Worker и выполняет `wrangler deploy`.

## 3. Включить новый frontend

После deploy Cloudflare покажет адрес вида:

`https://alias-spy-games-quartet.<workers-subdomain>.workers.dev`

В `index.html` заполните:

```html
<meta name="quartet-backend" content="https://alias-spy-games-quartet.<workers-subdomain>.workers.dev" />
```

## 4. Проверка

1. Создать комнату из Telegram.
2. Подключить второй телефон по коду.
3. Убедиться, что оба игрока сразу появляются онлайн.
4. Начать игру.
5. Проверить успешный запрос карты: карта переходит сразу, ход остаётся у спрашивающего.
6. Проверить промах: ход сразу переходит следующему игроку.
7. Выключить интернет на одном телефоне и вернуть — WebSocket должен переподключиться автоматически.
8. Проверить новую партию после завершения.

## После успешного перехода

Старый Apps Script endpoint Квартета можно удалить/отключить. Остальные Apps Script endpoints приложения это изменение не затрагивает.
