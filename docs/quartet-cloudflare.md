# «Квартет»: Cloudflare realtime

«Квартет» использует Cloudflare Workers, Durable Objects и WebSocket. HTTPS polling остаётся резервным transport для сетей, где WebSocket upgrade блокируется.

Production Worker: `https://alias-spy-games-quartet.vitaledanilov.workers.dev`.

## Активный entrypoint

Wrangler запускает `src/index-lobby-resume.js`. Он расширяет `src/index-chat.js` восстановлением игроков в lobby; правила игры находятся в `src/engine.js`, а каталог карточек — в `src/catalog.js`.

Один Durable Object соответствует одной комнате. Сервер хранит состояние, проверяет ходы, выдаёт каждому игроку только разрешённое представление его руки и синхронизирует клиентов через WebSocket или подписанный polling.

## Основные свойства

- автоматическое переподключение и восстановление lobby;
- серверный 90-секундный таймер хода;
- idempotent room creation и защита повторных polling-действий;
- room-scoped chat с rate limiting;
- скрытие чужих рук;
- сохранение успешного хода у спрашивающего и передача хода при промахе;
- удаление неактивных комнат по TTL.

## Проверки

```bash
node --test cloudflare/quartet-worker/test/*.test.mjs
cd cloudflare/quartet-worker
npm install
npm run check
```

Перед production-изменением realtime-кода дополнительно проверьте на двух устройствах создание и повторный вход в комнату, успешный и неуспешный запрос карты, chat, сворачивание приложения, WebSocket reconnect и HTTPS fallback.

## GitHub Secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TELEGRAM_BOT_TOKEN`
- `QUARTET_SESSION_SECRET`
