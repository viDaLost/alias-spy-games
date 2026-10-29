"""Точка входа.

    python -m app          — запустить бота (long polling)
    python -m app check    — проверить конфигурацию, БД, демо-данные и фото без BOT_TOKEN
"""

from __future__ import annotations

import asyncio
import logging
import sys

from .settings import Settings, SettingsError, load_settings

NO_TOKEN_HELP = """\
BOT_TOKEN не задан — бот не может подключиться к Telegram.

Что сделать:
  1. Откройте @BotFather в Telegram, отправьте /newbot и получите токен.
  2. Скопируйте .env.example в .env и впишите токен в строку BOT_TOKEN=
     (токен вводится только локально — не публикуйте его в переписке и в git).
  3. Запустите снова: python -m app

Проверить проект без токена: python -m app check
"""

BAD_TOKEN_HELP = """\
BOT_TOKEN задан, но не похож на токен Telegram (ожидается вид 123456789:AA…).
Проверьте, что в .env скопирован токен от @BotFather целиком, без пробелов и кавычек.
"""


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # aiogram пишет каждый ответ на callback — это шумно для демо.
    logging.getLogger("aiogram.event").setLevel(logging.WARNING)


async def _check(settings: Settings) -> int:
    from .bot.app import build_context
    from .bot.media import missing_photos

    ctx = await build_context(settings)
    club = ctx.club
    print(f"Клуб: {club.name}; столов: {len(club.tables)}; позиций меню: {len(club.all_items())}")
    print(f"Часовой пояс: {settings.timezone}; база: {settings.database_path}")
    print(f"Администраторов в ADMIN_IDS: {len(settings.admin_ids)}"
          + ("" if settings.admin_ids else " (админ-панель недоступна никому — это значение по умолчанию)"))
    today = ctx.service.today()
    busy = await ctx.service.admin_day(next(iter(settings.admin_ids)), today) if settings.admin_ids else None
    if busy is not None:
        print(f"Записей на сегодня: {len(busy)}")
    missing = missing_photos([i.photo_path for i in club.all_items()])
    uncredited = [i.photo_path.name for i in club.all_items()
                  if i.photo_path.is_file() and i.photo_path.name not in ctx.credits]
    if missing:
        print("Нет фотографий меню:")
        for p in missing:
            print(f"  - {p.relative_to(settings.club_config_path.parent.parent)}")
    if uncredited:
        print("Фото без записи об авторстве в assets/menu/credits.json: " + ", ".join(uncredited))
    if not missing and not uncredited:
        print("Фотографии меню: все на месте, авторство указано.")
    print("Токен: " + ("задан" if settings.bot_token else "не задан (для запуска бота нужен BOT_TOKEN)"))
    return 0 if not missing and not uncredited else 1


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    try:
        settings = load_settings()
    except SettingsError as exc:
        print(f"Ошибка настройки: {exc}", file=sys.stderr)
        return 2
    _setup_logging(settings.log_level)

    if argv and argv[0] == "check":
        return asyncio.run(_check(settings))
    if argv and argv[0] not in ("run",):
        print(__doc__)
        return 2

    if not settings.bot_token:
        print(NO_TOKEN_HELP, file=sys.stderr)
        return 2
    if not settings.token_is_plausible():
        print(BAD_TOKEN_HELP, file=sys.stderr)
        return 2

    from aiogram.exceptions import TelegramNetworkError, TelegramUnauthorizedError

    from .bot.app import run_polling

    try:
        asyncio.run(run_polling(settings))
    except TelegramUnauthorizedError:
        print("Telegram отклонил BOT_TOKEN. Получите актуальный токен у @BotFather (/token) и обновите .env.",
              file=sys.stderr)
        return 2
    except TelegramNetworkError as exc:
        print(f"Нет связи с api.telegram.org: {type(exc).__name__}. Проверьте интернет/прокси и повторите.",
              file=sys.stderr)
        return 3
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
