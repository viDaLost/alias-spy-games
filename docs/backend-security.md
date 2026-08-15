# Безопасность backend

Канонический backend проекта находится в `cloudflare/app-core-worker`. Клиентский `web/js/backend-bridge.js` перехватывает старый Apps Script URL и направляет запросы в Cloudflare; fallback обратно в Apps Script отключён.

## Границы доверия

- Telegram Mini App отправляет `telegramInitData` в `/compat`.
- Нативное Android-приложение использует подтверждённую Telegram ownership-сессию и `/android/compat`.
- Обычный браузер без подтверждённой личности получает только безопасный локальный guest-режим.
- `ADMIN_TELEGRAM_ID`, `adminId`, `user.id`, username и любые поля из браузерного JSON сами по себе не являются авторизацией.

Core Worker обязан проверять Telegram hash и свежесть `auth_date`, а затем использовать только ID из проверенных данных. Для Android доверенным считается только ID из валидной серверной сессии, а не переданный клиентом `androidUserId`.

## Секреты

Секреты не должны находиться в web-коде, Wrangler config или Git:

- `TELEGRAM_BOT_TOKEN`;
- `QUARTET_SESSION_SECRET`;
- `CLOUDFLARE_API_TOKEN`;
- `CLOUDFLARE_ACCOUNT_ID`;
- Android signing material.

Они передаются через GitHub Secrets и Wrangler secrets. Локальные `.env`, `.dev.vars`, `.wrangler/`, keystore и release-артефакты исключены через `.gitignore`.

## Проверки

```bash
node scripts/check-cloudflare-core-mode.mjs
node scripts/check-android-secure-auth.mjs
node scripts/check-android-ban-enforcement.mjs
node scripts/check-support-center.mjs
```

Эти проверки контролируют Cloudflare-only routing, Telegram/Android authentication boundary, ban enforcement и защищённую поддержку.
