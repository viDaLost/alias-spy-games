"""Последний роутер: всё, что не разобрали остальные, обрабатывается понятно и безопасно."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from .. import keyboards as kb
from .. import texts
from ..callbacks import Ad
from ..context import AppContext
from ..middlewares import Reply
from ..ui import show


def make_router() -> Router:
    router = Router(name="fallback")

    @router.message(Command("admin"))
    async def admin_denied(message: Message) -> None:
        user_id = message.from_user.id if message.from_user else "—"
        await message.answer(
            "🔐 Админ-панель доступна только администраторам клуба.\n\n"
            f"Ваш ID: <code>{user_id}</code>. Если вам нужен доступ, передайте его владельцу бота — "
            "он добавит ID в настройку ADMIN_IDS и перезапустит бота.",
            reply_markup=kb.markup([kb.nav_row()]),
        )

    @router.callback_query(Ad.filter())
    async def admin_button_denied(cb: CallbackQuery, ctx: AppContext, reply: Reply) -> None:
        reply.set("Нет доступа к админ-панели.", alert=True)
        await show(cb, texts.main_menu(ctx.club), kb.main_menu(False))

    @router.callback_query()
    async def stale_button(cb: CallbackQuery, ctx: AppContext, reply: Reply) -> None:
        reply.set("Эта кнопка устарела. Открываю главное меню.")
        await show(cb, texts.main_menu(ctx.club), kb.main_menu(ctx.is_admin(cb.from_user.id)))

    @router.message(F.chat.type == "private")
    async def unknown_message(message: Message, ctx: AppContext) -> None:
        user_id = message.from_user.id if message.from_user else None
        await message.answer(
            "Я работаю через кнопки 👇 Команды: /start, /help, /id.",
            reply_markup=kb.main_menu(ctx.is_admin(user_id)),
        )

    return router
