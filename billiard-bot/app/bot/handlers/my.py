"""«Мои бронирования»: список, карточка, отмена с подтверждением.

ID брони приходит из callback и не считается доверенным: сервис ищет бронь только
среди записей текущего пользователя Telegram (cb.from_user.id).
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from ...club import format_money
from .. import keyboards as kb
from .. import texts
from ..callbacks import My, Nav
from ..context import AppContext
from ..middlewares import Reply
from ..ui import show


def make_router() -> Router:
    router = Router(name="my")

    async def show_list(cb: CallbackQuery, ctx: AppContext, prefix: str = "") -> None:
        upcoming, history = await ctx.service.list_for_user(cb.from_user.id)
        now = ctx.service.now()
        tz = ctx.service.tz
        lines = [prefix + "📅 <b>Мои бронирования</b>"]
        rows = []
        if not upcoming and not history:
            lines.append("\nУ вас пока нет бронирований.")
            rows.append([kb.btn("🎱 Забронировать стол", Nav(to="book"))])
        if upcoming:
            lines.append("\n<b>Ближайшие:</b>")
            for res in upcoming:
                lines.append(f"• {texts.reservation_line(ctx.club, tz, res)} · {format_money(res.price_kop)} · "
                             f"{texts.status_label(res, now)}")
                rows.append([kb.btn(f"№ {res.id} · {res.start.astimezone(tz):%d.%m %H:%M} — открыть", My(a="card", i=res.id))])
        if history:
            lines.append("\n<b>История:</b>")
            for res in history:
                lines.append(f"• {texts.reservation_line(ctx.club, tz, res)} · {texts.status_label(res, now)}")
            rows.extend([kb.btn(f"№ {r.id} · история", My(a="card", i=r.id))] for r in history[:5])
        rows.append(kb.nav_row())
        await show(cb, "\n".join(lines), kb.markup(rows))

    @router.callback_query(Nav.filter(F.to == "my"))
    async def nav_my(cb: CallbackQuery, ctx: AppContext) -> None:
        await show_list(cb, ctx)

    @router.callback_query(My.filter(F.a == "list"))
    async def my_list(cb: CallbackQuery, ctx: AppContext) -> None:
        await show_list(cb, ctx)

    @router.callback_query(My.filter(F.a == "card"))
    async def my_card(cb: CallbackQuery, callback_data: My, ctx: AppContext, reply: Reply) -> None:
        res = await ctx.service.get_for_user(cb.from_user.id, callback_data.i)
        if res is None:
            reply.set("Бронь не найдена.", alert=True)
            return await show_list(cb, ctx)
        now = ctx.service.now()
        rows = []
        if res.is_active and res.start > now:
            rows.append([kb.btn("❌ Отменить бронь", My(a="ask", i=res.id))])
        rows.append(kb.nav_row(My(a="list")))
        await show(cb, texts.reservation_card(ctx.club, ctx.service.tz, res, now), kb.markup(rows))

    @router.callback_query(My.filter(F.a == "ask"))
    async def my_cancel_ask(cb: CallbackQuery, callback_data: My, ctx: AppContext, reply: Reply) -> None:
        res = await ctx.service.get_for_user(cb.from_user.id, callback_data.i)
        now = ctx.service.now()
        if res is None or not res.is_active or res.start <= now:
            reply.set("Эту бронь уже нельзя отменить.", alert=True)
            return await show_list(cb, ctx)
        text = ("❓ <b>Отменить бронь?</b>\n\n" + texts.reservation_card(ctx.club, ctx.service.tz, res, now)
                + "\n\nПосле отмены время станет доступно другим гостям.")
        await show(cb, text, kb.markup([
            [kb.btn("Да, отменить", My(a="cx", i=res.id)), kb.btn("Нет, оставить", My(a="card", i=res.id))],
            kb.nav_row(My(a="list")),
        ]))

    @router.callback_query(My.filter(F.a == "cx"))
    async def my_cancel(cb: CallbackQuery, callback_data: My, ctx: AppContext, reply: Reply) -> None:
        result = await ctx.service.cancel_by_guest(cb.from_user.id, callback_data.i)
        if result.status == "cancelled":
            ctx.kick_outbox()
            reply.set("Бронь отменена")
            return await show_list(cb, ctx, prefix=f"✅ Бронь № {callback_data.i} отменена, время снова свободно.\n\n")
        message = {
            "already_cancelled": "Эта бронь уже отменена.",
            "too_late": "Время брони уже наступило — отменить её нельзя.",
            "not_found": "Бронь не найдена.",
        }[result.status]
        reply.set(message, alert=True)
        await show_list(cb, ctx)

    return router
