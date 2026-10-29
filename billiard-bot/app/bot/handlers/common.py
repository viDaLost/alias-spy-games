"""/start, /help, /id и простые разделы главного меню."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import CallbackQuery, Message

from .. import keyboards as kb
from .. import texts
from ..callbacks import Nav
from ..context import AppContext
from ..middlewares import Reply
from ..ui import show


def make_router() -> Router:
    router = Router(name="common")

    @router.message(CommandStart())
    async def cmd_start(message: Message, ctx: AppContext) -> None:
        user_id = message.from_user.id if message.from_user else None
        if user_id is not None and ctx.is_admin(user_id):
            # Админ открыл чат — можно доставить отложенные уведомления.
            await ctx.outbox.make_chat_due(user_id)
            ctx.kick_outbox()
        await message.answer(texts.welcome(ctx.club), reply_markup=kb.main_menu(ctx.is_admin(user_id)))

    @router.message(Command("help"))
    async def cmd_help(message: Message) -> None:
        await message.answer(texts.HELP, reply_markup=kb.markup([kb.nav_row()]))

    @router.message(Command("id"))
    async def cmd_id(message: Message) -> None:
        if message.from_user is None:
            return
        await message.answer(
            f"🆔 Ваш Telegram ID: <code>{message.from_user.id}</code>\n\n"
            "Он нужен владельцу бота, чтобы выдать вам доступ администратора "
            "(переменная ADMIN_IDS). Показывается только вам."
        )

    @router.callback_query(Nav.filter(F.to == "main"))
    async def nav_main(cb: CallbackQuery, ctx: AppContext) -> None:
        await show(cb, texts.main_menu(ctx.club), kb.main_menu(ctx.is_admin(cb.from_user.id)))

    @router.callback_query(Nav.filter(F.to == "about"))
    async def nav_about(cb: CallbackQuery, ctx: AppContext) -> None:
        await show(cb, texts.about(ctx.club), kb.markup([kb.nav_row()]))

    @router.callback_query(Nav.filter(F.to == "how"))
    async def nav_how(cb: CallbackQuery) -> None:
        await show(cb, texts.HOW_IT_WORKS, kb.markup([[kb.btn("🎱 Попробовать забронировать", Nav(to="book"))],
                                                       kb.nav_row()]))

    @router.callback_query(Nav.filter(F.to == "noop"))
    async def nav_noop(cb: CallbackQuery, reply: Reply) -> None:
        pass

    return router
