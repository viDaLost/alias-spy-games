# Структурный аудит репозитория

Аудит выполнен 15 августа 2026 года. Цель — отделить исполняемый код от документации и инструментов, а также удалить только те файлы, отсутствие которых подтверждено ссылками, import-графом, конфигурацией сборки и историей Git.

## Итоговая схема

- `web/` — все публикуемые ресурсы статического приложения;
- `cloudflare/` — независимые Worker-проекты;
- `android-app/` — нативный Android-клиент;
- `scripts/` — проверки и синхронизация Android assets;
- `docs/` — актуальная документация;
- корень — только entrypoint и общие project-файлы.

Android по-прежнему получает каталоги `assets/` и `data/` внутри APK. Скрипт `scripts/sync-android-assets.mjs` копирует их из `web/assets/` и `web/data/`, сохраняя пути, которые использует Kotlin-код.

## Подтверждённые удаления

| Файл или группа | Основание |
| --- | --- |
| `.upload/chunk-*.b64` и `apply-optimized-upload.yml` | Одноразовый транспорт архива; его единственный workflow уже применил содержимое и не входит в текущий production-процесс |
| `apply-android-network-resilience-273.yml` | Одноразовый branch-specific workflow ссылался на отсутствующий `scripts/apply-android-network-resilience-273.py` |
| `deploy-quartet-preview.yml` | Исторический preview был привязан к старой ветке и датированному Pages-проекту; production deploy выполняет `deploy-quartet-cloudflare.yml` |
| `assets/cards/G` | Случайный файл размером 1 байт без потребителей |
| `bible_dictionary_structured.json` и `bible_extra_words.json` | Нет ссылок из web, Android, Workers, тестов или build-конфигурации |
| `cloudflare/quartet-worker/src/index.js` | Недостижимый старый entrypoint: Wrangler запускает `index-lobby-resume.js`, который импортирует `index-chat.js` |

Все удалённые файлы остаются восстановимыми из истории Git.

## Что проверено и сохранено

- Три крупные PNG-карточки «Шпиона» сохранены: их используют `web/games/spy.js` и нативный `SpyGame.kt`.
- Все игровые JSON, на которые ссылаются web или Android, сохранены.
- Цепочки `index-v3.js` → `index-v7.js` Core Worker и `index.js` → `index-v4.js` Observability Worker сохранены: каждый слой достижим из активного Wrangler entrypoint.
- `.android-release-trigger` сохранён: он является явным release-триггером workflow сборки Android.
- Действующие deploy, quality и Android release workflows сохранены.

## Правила дальнейшего обслуживания

1. Публикуемые web-файлы добавлять только в `web/` и подключать из `index.html` или активного игрового loader.
2. Не хранить в Git временные архивы, `.upload`, локальные Cloudflare state, secrets и результаты сборки.
3. Перед удалением JSON, изображения или entrypoint проверять и web-ссылки, и Kotlin asset paths, и Wrangler-конфигурацию.
4. После изменения путей запускать статические и браузерные проверки из корневого `package.json`.
5. Одноразовые workflow удалять после применения; повторяемые операции оформлять обычным скриптом в `scripts/`.
