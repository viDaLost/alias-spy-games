# Библейские игры

Набор из 11 библейских мини-игр: статическое веб-приложение для GitHub Pages и Telegram Mini App, нативное Android-приложение и четыре Cloudflare Worker backend-сервиса.

Веб-часть не требует сборки: `index.html` напрямую подключает ресурсы из `web/`. В проекте сознательно нет Service Worker, Web App Manifest и PWA-обвязки.

## Структура репозитория

| Путь | Назначение |
| --- | --- |
| `index.html` | Единственный web entrypoint для GitHub Pages |
| `web/js/` | Клиентский runtime и функциональные дополнения |
| `web/styles/` | Общие и feature-specific стили |
| `web/games/` | Реализации игр и их локальные стили |
| `web/data/` | JSON-каталоги и уровни, используемые web и Android |
| `web/assets/` | Иконки и карточки, используемые web и Android |
| `cloudflare/` | Core, observability и realtime Worker-сервисы |
| `android-app/` | Нативное Kotlin/Jetpack Compose приложение |
| `scripts/` | Статические, интеграционные и браузерные проверки |
| `docs/` | Архитектура, безопасность и эксплуатационные заметки |
| `.github/workflows/` | Действующие проверки, deploy и Android release workflows |

## Локальный запуск web

Из корня репозитория:

```bash
python3 -m http.server 8080
```

Затем откройте `http://localhost:8080`. Открывать `index.html` через `file://` не следует: игры загружают локальные JSON и скрипты через HTTP.

## Проверки

Базовая проверка синтаксиса, JSON и локальных ссылок не требует установки зависимостей:

```bash
npm run check
```

Полный набор браузерных smoke/layout-проверок требует Chromium/Chrome и `playwright-core`:

```bash
npm install
npm run smoke:games
npm run check:mobile
npm run check:home
npm run check:android
npm run check:errors
```

Серверные движки проверяются отдельно:

```bash
node --test cloudflare/quartet-worker/test/*.test.mjs
node --test cloudflare/bible-sketch-worker/test/*.test.mjs
```

## Публикация

- GitHub Pages публикует `main:/`; web build step отсутствует.
- Изменения в `cloudflare/*-worker/` разворачиваются соответствующими workflow.
- Android release запускается вручную либо изменением `.android-release-trigger`; ключ подписи хранится только в GitHub Secrets.

## Документация

- [Структурный аудит](docs/audit.md)
- [Безопасность backend](docs/backend-security.md)
- [Cloudflare-архитектура «Квартета»](docs/quartet-cloudflare.md)
- [Пользовательские данные в Cloudflare](docs/cloudflare-user-data.md)
- [Подпись Android release](android-app/SIGNING.md)
