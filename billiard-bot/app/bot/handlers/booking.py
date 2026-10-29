"""Сценарий бронирования гостем: стол → дата → длительность → время → проверка → подтверждение.

Состояние сценария хранится в callback_data, поэтому прерывание на любом шаге ничего
не записывает, а перезапуск бота не ломает открытые карточки. Запись появляется
только при нажатии «Подтвердить бронирование».
"""

from __future__ import annotations

import secrets
from datetime import date
from html import escape

from aiogram import F, Router
from aiogram.types import CallbackQuery

from ...club import format_money
from ...core import schedule as sch
from ...core.booking import REASON_TEXT
from .. import keyboards as kb
from .. import texts
from ..callbacks import Bk, My, Nav, d2i, i2d
from ..context import AppContext
from ..middlewares import Reply
from ..ui import show


def make_router() -> Router:
    router = Router(name="booking")

    def _table_header(ctx: AppContext, t: int) -> str:
        table = ctx.club.table(t)
        assert table is not None
        return f"🎱 <b>{escape(table.title)}</b> · {format_money(table.rate_kop_per_hour)}/час"

    async def _stale(cb: CallbackQuery, ctx: AppContext, reply: Reply, text: str = "Кнопка устарела — начните выбор заново.") -> None:
        reply.set(text, alert=True)
        await show_tables(cb, ctx)

    def _valid_date(ctx: AppContext, value: int) -> date | None:
        d = i2d(value)
        return d if d is not None and d in ctx.service.bookable_dates() else None

    async def show_tables(cb: CallbackQuery, ctx: AppContext) -> None:
        text = "🎱 <b>Бронирование стола</b>\n\nШаг 1 из 4 — выберите стол:"
        await show(cb, text, kb.tables_kb(ctx.club, lambda t: Bk(s="date", t=t), None))

    @router.callback_query(Nav.filter(F.to == "book"))
    async def nav_book(cb: CallbackQuery, ctx: AppContext) -> None:
        await show_tables(cb, ctx)

    @router.callback_query(Bk.filter(F.s == "tables"))
    async def step_tables(cb: CallbackQuery, ctx: AppContext) -> None:
        await show_tables(cb, ctx)

    @router.callback_query(Bk.filter(F.s == "date"))
    async def step_date(cb: CallbackQuery, callback_data: Bk, ctx: AppContext, reply: Reply) -> None:
        t = callback_data.t
        if ctx.club.table(t) is None:
            return await _stale(cb, ctx, reply)
        dates = ctx.service.bookable_dates()
        text = f"{_table_header(ctx, t)}\n\nШаг 2 из 4 — выберите дату:"
        await show(cb, text, kb.dates_kb(
            dates,
            lambda d: Bk(s="dur", t=t, d=d2i(d)),
            Bk(s="cal", t=t),
            Bk(s="tables"),
        ))

    @router.callback_query(Bk.filter(F.s == "cal"))
    async def step_calendar(cb: CallbackQuery, callback_data: Bk, ctx: AppContext, reply: Reply) -> None:
        t = callback_data.t
        if ctx.club.table(t) is None:
            return await _stale(cb, ctx, reply)
        title, markup = kb.calendar_kb(
            ctx.service.bookable_dates(),
            callback_data.p,
            lambda d: Bk(s="dur", t=t, d=d2i(d)),
            lambda p: Bk(s="cal", t=t, p=p),
            Bk(s="date", t=t),
        )
        text = (f"{_table_header(ctx, t)}\n\n📅 <b>{title}</b>\n"
                f"Бронирование открыто на {ctx.club.schedule.booking_horizon_days} дней вперёд.")
        await show(cb, text, markup)

    @router.callback_query(Bk.filter(F.s == "dur"))
    async def step_duration(cb: CallbackQuery, callback_data: Bk, ctx: AppContext, reply: Reply) -> None:
        t, d = callback_data.t, _valid_date(ctx, callback_data.d)
        table = ctx.club.table(t)
        if table is None or d is None:
            return await _stale(cb, ctx, reply)
        text = (f"{_table_header(ctx, t)}\n📅 {sch.fmt_date(d)}\n\n"
                "Шаг 3 из 4 — сколько будете играть?")
        await show(cb, text, kb.durations_kb(
            ctx.club.schedule.durations_minutes,
            lambda u: ctx.service.quote(table, u),
            lambda u: Bk(s="time", t=t, d=d2i(d), u=u),
            Bk(s="date", t=t),
        ))

    async def show_times(cb: CallbackQuery, ctx: AppContext, t: int, d: date, u: int, *, prefix: str = "") -> None:
        starts = await ctx.service.free_starts(t, d, u)
        head = (f"{_table_header(ctx, t)}\n📅 {sch.fmt_date(d)} · ⏱ {sch.fmt_duration(u)}\n\n")
        back = Bk(s="dur", t=t, d=d2i(d))
        if not starts:
            text = (prefix + head + "😕 На эту дату нет свободного времени такой длительности.\n"
                    "Попробуйте другую длительность, дату или стол.")
            await show(cb, text, kb.markup([
                [kb.btn("⏱ Другая длительность", back), kb.btn("📅 Другая дата", Bk(s="date", t=t))],
                [kb.btn("🎱 Другой стол", Bk(s="tables"))],
                kb.nav_row(),
            ]))
            return
        night = any(m >= 24 * 60 for m in starts)
        text = prefix + head + "Шаг 4 из 4 — выберите время начала (показано только свободное):"
        if night:
            next_date = kb.next_day(d, 1)
            text += f"\n🌙 — время после полуночи, это уже {sch.fmt_date(next_date)}."
        await show(cb, text, kb.times_kb(starts, lambda m: Bk(s="sum", t=t, d=d2i(d), u=u, m=m), back))

    @router.callback_query(Bk.filter(F.s == "time"))
    async def step_time(cb: CallbackQuery, callback_data: Bk, ctx: AppContext, reply: Reply) -> None:
        t, d, u = callback_data.t, _valid_date(ctx, callback_data.d), callback_data.u
        if ctx.club.table(t) is None or d is None or u not in ctx.club.schedule.durations_minutes:
            return await _stale(cb, ctx, reply)
        await show_times(cb, ctx, t, d, u)

    @router.callback_query(Bk.filter(F.s == "sum"))
    async def step_summary(cb: CallbackQuery, callback_data: Bk, ctx: AppContext, reply: Reply) -> None:
        t, u, m = callback_data.t, callback_data.u, callback_data.m
        d = i2d(callback_data.d)
        if d is None:
            return await _stale(cb, ctx, reply)
        reason = ctx.service.validate(t, d, m, u)
        if reason:
            if reason in ("in_past",) and ctx.club.table(t):
                reply.set(REASON_TEXT[reason], alert=True)
                return await show_times(cb, ctx, t, d, u)
            return await _stale(cb, ctx, reply)
        if m not in await ctx.service.free_starts(t, d, u):
            reply.set("Это время уже занято — выберите другое.", alert=True)
            return await show_times(cb, ctx, t, d, u)
        table = ctx.club.table(t)
        assert table is not None
        start, end = ctx.service.interval(d, m, u)
        token = secrets.token_urlsafe(6)
        text = (
            "🧾 <b>Проверьте бронирование</b>\n\n"
            + texts.booking_details(ctx.club, ctx.service.tz, table_id=t, start=start, end=end,
                                    duration=u, price=ctx.service.quote(table, u))
            + "\n\nБронь будет создана только после нажатия кнопки ниже."
        )
        await show(cb, text, kb.markup([
            [kb.btn("✅ Подтвердить бронирование", Bk(s="ok", t=t, d=d2i(d), u=u, m=m, k=token))],
            kb.nav_row(Bk(s="time", t=t, d=d2i(d), u=u)),
        ]))

    @router.callback_query(Bk.filter(F.s == "ok"))
    async def step_confirm(cb: CallbackQuery, callback_data: Bk, ctx: AppContext, reply: Reply) -> None:
        t, u, m, token = callback_data.t, callback_data.u, callback_data.m, callback_data.k
        d = i2d(callback_data.d)
        if d is None or not token:
            return await _stale(cb, ctx, reply)
        result = await ctx.service.create_guest_booking(cb.from_user.id, t, d, m, u, token)

        if result.status in ("created", "duplicate") and result.reservation:
            res = result.reservation
            if result.status == "created":
                ctx.kick_outbox()
                head = f"✅ <b>Бронь № {res.id} подтверждена</b>"
                reply.set(f"Бронь № {res.id} создана")
            else:
                head = f"✅ <b>Бронь № {res.id} уже создана</b> — повторное нажатие не создаёт дубликат."
            text = (
                f"{head}\n\n"
                + texts.booking_details(ctx.club, ctx.service.tz, table_id=res.table_id, start=res.start,
                                        end=res.end, duration=res.duration_min, price=res.price_kop)
                + "\n\nЖдём вас! Отменить бронь можно в разделе «Мои бронирования».\n"
                f"<i>{texts.DEMO_LINE}</i>"
            )
            await show(cb, text, kb.markup([
                [kb.btn("📅 Мои бронирования", My(a="list")), kb.btn("🍽 Меню кафе", Nav(to="menu"))],
                kb.nav_row(),
            ]))
            return

        if result.status == "conflict":
            reply.set("Это время только что заняли", alert=False)
            prefix = "⚠️ <b>Пока вы выбирали, это время заняли.</b> Вот актуальные свободные интервалы:\n\n"
            return await show_times(cb, ctx, t, d, u, prefix=prefix)

        reason = result.reason or ""
        if reason == "in_past" and ctx.club.table(t):
            reply.set(REASON_TEXT[reason], alert=True)
            return await show_times(cb, ctx, t, d, u, prefix="⚠️ <b>Это время уже прошло.</b>\n\n")
        await _stale(cb, ctx, reply, REASON_TEXT.get(reason, "Кнопка устарела — начните выбор заново."))

    return router
