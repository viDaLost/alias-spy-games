# Квартет v2 — Cloudflare backend

Production Worker уже развернут:

`https://alias-spy-games-quartet.vitaledanilov.workers.dev`

Frontend-ветка `agent/quartet-cloudflare-v2` уже использует этот адрес через `quartet-backend` в `index.html`.

## Архитектура

Квартет v2 использует Cloudflare Workers + SQLite Durable Object (`QuartetRoom`) + WebSocket вместо Google Apps Script polling.

- Один Durable Object = одна игровая комната.
- Сервер хранит руки, очередь, таймер и результаты.
- Клиенты получают состояние сразу по WebSocket.
- Чужие руки не отправляются другим игрокам.
- Успешный запрос карты сохраняет ход.
- Промах передает ход следующему игроку.
- Ход ограничен 90 секундами.
- При обрыве сети клиент автоматически переподключается.

## Безопасность

Telegram-клиент отправляет raw `Telegram.WebApp.initData`. Worker валидирует его с `TELEGRAM_BOT_TOKEN`, проверяет `auth_date` и выпускает короткоживущую подписанную WebSocket-сессию.

Гостевой запуск из обычного браузера сейчас разрешен через `ALLOW_GUESTS=true`.

## GitHub Secrets

Deployment использует repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TELEGRAM_BOT_TOKEN`
- `QUARTET_SESSION_SECRET`

Их значения нельзя коммитить в репозиторий.

## Deploy

Для повторного deployment откройте:

`Actions → Deploy Quartet Cloudflare backend → Run workflow`

Если изменения еще находятся только в PR #4, выбирайте ветку:

`agent/quartet-cloudflare-v2`

Workflow выполняет тесты, `wrangler deploy`, а затем обновляет Worker secrets.

## Финальная проверка перед merge PR #4

Автоматически уже проверено:

- project checker;
- Quartet server-engine tests;
- Wrangler install;
- `wrangler deploy --dry-run`;
- production deploy Worker;
- подключение production URL во frontend;
- повторный GitHub Actions CI после подключения URL.

Остался один живой smoke-test минимум на двух телефонах:

1. Открыть приложение из Telegram на обоих телефонах.
2. На телефоне A создать комнату Квартета.
3. На телефоне B войти по коду комнаты.
4. Запустить игру с телефона ведущего.
5. Сделать несколько запросов карты с обоих телефонов и проверить мгновенное обновление хода.
6. Свернуть Telegram на одном телефоне и вернуться — состояние должно переподключиться автоматически.
7. Один раз выйти и снова войти в комнату — состояние комнаты должно сохраниться корректно.
8. Проверить новую партию после завершения.

Если этот тест проходит, PR #4 можно сливать в `main`.

## После перехода

Старый Apps Script endpoint именно Квартета можно отключить. Остальные Apps Script endpoints приложения это изменение не затрагивает.
