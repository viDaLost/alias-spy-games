"""Сборка бота: Dispatcher, роутеры, воркер уведомлений, long polling."""

from __future__ import annotations

import asyncio
import contextlib
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import (
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramRetryAfter,
)
from aiogram.types import BotCommand, BotCommandScopeChat, BotCommandScopeDefault, ErrorEvent

from ..club import Club, load_club
from ..core.booking import BookingService
from ..core.db import Database
from ..core.outbox import Outbox, PermanentSendError, RetryLater
from ..core.seed import seed_demo
from ..settings import Settings
from .context import AppContext
from .handlers import admin, booking, common, fallback, menu, my
from .media import MediaStore, load_credits
from .middlewares import AnswerCallbackMiddleware

log = logging.getLogger(__name__)

OUTBOX_INTERVAL = 30


async def build_context(settings: Settings, club: Club | None = None) -> AppContext:
    club = club or load_club(settings.club_config_path)
    db = Database(settings.database_path)
    await db.init()
    service = BookingService(
        db, club, settings.tz,
        admin_ids=settings.admin_ids,
        notify_chats=settings.notification_chats(),
    )
    if settings.demo_mode:
        created = await seed_demo(service)
        if created:
            log.info("demo seed: added %d fictitious reservations", created)
    return AppContext(
        settings=settings, club=club, service=service, outbox=Outbox(db),
        media=MediaStore(db), credits=load_credits(),
    )


def build_dispatcher(ctx: AppContext) -> Dispatcher:
    dp = Dispatcher(ctx=ctx)
    dp.callback_query.outer_middleware(AnswerCallbackMiddleware())
    dp.include_routers(
        common.make_router(),
        admin.make_router(ctx.settings),
        booking.make_router(),
        my.make_router(),
        menu.make_router(),
        fallback.make_router(),  # обязательно последним
    )

    @dp.errors()
    async def on_error(event: ErrorEvent) -> bool:
        log.exception("handler error: %s", type(event.exception).__name__, exc_info=event.exception)
        update = event.update
        with contextlib.suppress(Exception):
            if update.callback_query and update.callback_query.message:
                await update.callback_query.message.answer(
                    "😕 Что-то пошло не так. Попробуйте ещё раз или откройте /start."
                )
            elif update.message:
                await update.message.answer("😕 Что-то пошло не так. Попробуйте ещё раз или откройте /start.")
        return True

    return dp


def make_sender(bot: Bot):
    async def send(chat_id: int, text: str) -> None:
        try:
            await bot.send_message(chat_id, text)
        except TelegramRetryAfter as exc:
            raise RetryLater(exc.retry_after) from exc
        except TelegramForbiddenError as exc:
            raise PermanentSendError("бот не может написать: получатель не нажал /start или заблокировал бота") from exc
        except TelegramBadRequest as exc:
            if "chat not found" in str(exc).lower():
                raise PermanentSendError("чат не найден: получатель ещё не открыл бота") from exc
            raise
        # Не упираться в лимиты Telegram при пачке уведомлений.
        await asyncio.sleep(0.05)

    return send


async def outbox_worker(ctx: AppContext, bot: Bot) -> None:
    send = make_sender(bot)
    while True:
        try:
            await ctx.outbox.deliver_due(send)
        except Exception:  # noqa: BLE001
            log.exception("outbox worker iteration failed")
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(ctx.outbox_wakeup.wait(), timeout=OUTBOX_INTERVAL)
        ctx.outbox_wakeup.clear()


async def set_commands(bot: Bot, settings: Settings) -> None:
    base = [
        BotCommand(command="start", description="Главное меню"),
        BotCommand(command="help", description="Помощь"),
        BotCommand(command="id", description="Мой Telegram ID"),
    ]
    await bot.set_my_commands(base, scope=BotCommandScopeDefault())
    for admin_id in settings.admin_ids:
        # Админ мог ещё не открыть бота — тогда Telegram вернёт ошибку, это не критично.
        with contextlib.suppress(Exception):
            await bot.set_my_commands(
                [*base, BotCommand(command="admin", description="Админ-панель")],
                scope=BotCommandScopeChat(chat_id=admin_id),
            )


def make_bot(settings: Settings, **kwargs) -> Bot:
    return Bot(
        settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML, link_preview_is_disabled=True),
        **kwargs,
    )


async def run_polling(settings: Settings) -> None:
    ctx = await build_context(settings)
    bot = make_bot(settings)
    dp = build_dispatcher(ctx)
    me = await bot.get_me()
    log.info("bot @%s started (admins: %d, demo mode: %s)", me.username, len(settings.admin_ids), settings.demo_mode)
    with contextlib.suppress(Exception):
        await set_commands(bot, settings)
    worker = asyncio.create_task(outbox_worker(ctx, bot))
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types(), handle_signals=True)
    finally:
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker
        await bot.session.close()
