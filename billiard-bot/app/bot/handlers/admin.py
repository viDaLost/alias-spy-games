"""Админ-панель. Доступ — только Telegram ID из ADMIN_IDS.

Права проверяются дважды: фильтром роутера на каждое сообщение и нажатие (в том числе
устаревших кнопок) и в BookingService.require_admin при каждой операции.
"""

from __future__ import annotations

import secrets
from datetime import date, timedelta
from html import escape

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from ...club import format_money
from ...core import schedule as sch
from ...core.booking import REASON_TEXT, Reservation
from ...core.seed import refresh_demo
from ...settings import Settings
from .. import keyboards as kb
from .. import texts
from ..callbacks import Ad, d2i, i2d
from ..context import AppContext
from ..middlewares import Reply
from ..ui import show

MODES = {"v": "🎱 Расписание стола", "b": "➕ Бронь по телефону", "l": "🔒 Блокировка стола"}


def make_router(settings: Settings) -> Router:
    router = Router(name="admin")
    is_admin = F.from_user.id.in_(set(settings.admin_ids))
    router.message.filter(is_admin)
    router.callback_query.filter(is_admin)

    # --- главная панель -----------------------------------------------------------

    async def home(target: CallbackQuery | Message, ctx: AppContext, prefix: str = "") -> None:
        actor = target.from_user.id
        today = ctx.service.today()
        items = await ctx.service.admin_day(actor, today)
        bookings = [r for r in items if not r.is_block]
        blocks = [r for r in items if r.is_block]
        problems, _ = await ctx.outbox.problems(limit=1)
        lines = [prefix + "🛠 <b>Админ-панель</b>",
                 f"Сегодня, {sch.fmt_date(today)}: броней — {len(bookings)}, блокировок — {len(blocks)}."]
        if problems:
            lines.append(f"\n⚠️ <b>Не доставлено уведомлений: {problems}.</b> Откройте «Уведомления».")
        if not ctx.settings.notification_chats():
            lines.append("\nℹ️ Список получателей уведомлений пуст.")
        rows = [
            [kb.btn("📋 Сегодня", Ad(a="day", d=d2i(today))),
             kb.btn("📋 Завтра", Ad(a="day", d=d2i(today + timedelta(days=1))))],
            [kb.btn("📅 Брони на дату", Ad(a="dcal"))],
            [kb.btn(MODES["v"], Ad(a="tbl", x="v"))],
            [kb.btn(MODES["b"], Ad(a="tbl", x="b")), kb.btn(MODES["l"], Ad(a="tbl", x="l"))],
        ]
        if ctx.settings.demo_mode:
            rows.append([kb.btn("🔄 Обновить демо-записи", Ad(a="demo"))])
        rows.append([kb.btn(f"⚠️ Уведомления ({problems})" if problems else "📨 Уведомления", Ad(a="ob"))])
        rows.append(kb.nav_row())
        if isinstance(target, Message):
            await target.answer("\n".join(lines), reply_markup=kb.markup(rows))
        else:
            await show(target, "\n".join(lines), kb.markup(rows))

    @router.message(Command("admin"))
    async def cmd_admin(message: Message, ctx: AppContext) -> None:
        await ctx.outbox.make_chat_due(message.from_user.id)
        ctx.kick_outbox()
        await home(message, ctx)

    @router.callback_query(Ad.filter(F.a == "home"))
    async def cb_home(cb: CallbackQuery, ctx: AppContext) -> None:
        await home(cb, ctx)

    # --- брони по дням ------------------------------------------------------------

    def res_button(ctx: AppContext, r: Reservation, with_table: bool = True) -> list:
        s = r.start.astimezone(ctx.service.tz)
        e = r.end.astimezone(ctx.service.tz)
        label = f"{'🔒' if r.is_block else '№ ' + str(r.id)} · {s:%H:%M}–{e:%H:%M}"
        if with_table:
            label = f"Стол {r.table_id} · " + label
        return [kb.btn(label, Ad(a="card", i=r.id))]

    def res_line(ctx: AppContext, r: Reservation) -> str:
        s = r.start.astimezone(ctx.service.tz)
        e = r.end.astimezone(ctx.service.tz)
        span = f"{s:%H:%M}–{e:%H:%M}" + (f" (до {sch.fmt_date(e.date(), weekday=False)})" if e.date() != s.date() else "")
        if r.is_block:
            return f"  🔒 {span} · блокировка"
        return f"  • {span} · № {r.id} · {escape(r.guest_name)} · {format_money(r.price_kop)}"

    @router.callback_query(Ad.filter(F.a == "day"))
    async def cb_day(cb: CallbackQuery, callback_data: Ad, ctx: AppContext, reply: Reply) -> None:
        d = i2d(callback_data.d) or ctx.service.today()
        items = await ctx.service.admin_day(cb.from_user.id, d)
        lines = [f"📋 <b>Брони на {sch.fmt_date(d)}</b>",
                 f"<i>Рабочий день {ctx.club.schedule.open:%H:%M}–{ctx.club.schedule.close:%H:%M}</i>", ""]
        for table in ctx.club.tables:
            lines.append(f"<b>{escape(table.title)}</b>")
            own = [r for r in items if r.table_id == table.id]
            if own:
                lines.extend(res_line(ctx, r) for r in own)
            else:
                lines.append("  свободен весь день")
        rows = [res_button(ctx, r) for r in items[:40]]
        rows.append([kb.btn("◀ День", Ad(a="day", d=d2i(d - timedelta(days=1)))),
                     kb.btn("День ▶", Ad(a="day", d=d2i(d + timedelta(days=1))))])
        rows.append(kb.nav_row(Ad(a="home")))
        await show(cb, "\n".join(lines), kb.markup(rows))

    @router.callback_query(Ad.filter(F.a == "dcal"))
    async def cb_day_calendar(cb: CallbackQuery, callback_data: Ad, ctx: AppContext) -> None:
        title, markup = kb.calendar_kb(
            ctx.service.bookable_dates(), callback_data.p,
            lambda d: Ad(a="day", d=d2i(d)), lambda p: Ad(a="dcal", p=p), Ad(a="home"),
        )
        await show(cb, f"📅 <b>{title}</b>\nВыберите дату:", markup)

    # --- общий поток: стол → дата → (расписание | длительность → время → проверка) ---

    @router.callback_query(Ad.filter(F.a == "tbl"))
    async def cb_tables(cb: CallbackQuery, callback_data: Ad, ctx: AppContext) -> None:
        x = callback_data.x if callback_data.x in MODES else "v"
        await show(cb, f"<b>{MODES[x]}</b>\n\nВыберите стол:",
                   kb.tables_kb(ctx.club, lambda t: Ad(a="dt", x=x, t=t), Ad(a="home")))

    def after_date(x: str, t: int, d: date) -> Ad:
        return Ad(a="sch", x=x, t=t, d=d2i(d)) if x == "v" else Ad(a="dur", x=x, t=t, d=d2i(d))

    @router.callback_query(Ad.filter(F.a == "dt"))
    async def cb_dates(cb: CallbackQuery, callback_data: Ad, ctx: AppContext, reply: Reply) -> None:
        x, t = callback_data.x, callback_data.t
        table = ctx.club.table(t)
        if table is None or x not in MODES:
            reply.set("Кнопка устарела.", alert=True)
            return await home(cb, ctx)
        await show(cb, f"<b>{MODES[x]}</b>\n{escape(table.title)}\n\nВыберите дату:", kb.dates_kb(
            ctx.service.bookable_dates(), lambda d: after_date(x, t, d),
            Ad(a="tcal", x=x, t=t), Ad(a="tbl", x=x),
        ))

    @router.callback_query(Ad.filter(F.a == "tcal"))
    async def cb_table_calendar(cb: CallbackQuery, callback_data: Ad, ctx: AppContext) -> None:
        x, t = callback_data.x, callback_data.t
        title, markup = kb.calendar_kb(
            ctx.service.bookable_dates(), callback_data.p,
            lambda d: after_date(x, t, d), lambda p: Ad(a="tcal", x=x, t=t, p=p), Ad(a="dt", x=x, t=t),
        )
        await show(cb, f"<b>{MODES.get(x, '')}</b>\n📅 <b>{title}</b>", markup)

    @router.callback_query(Ad.filter(F.a == "sch"))
    async def cb_schedule(cb: CallbackQuery, callback_data: Ad, ctx: AppContext, reply: Reply) -> None:
        t, d = callback_data.t, i2d(callback_data.d)
        table = ctx.club.table(t)
        if table is None or d is None:
            reply.set("Кнопка устарела.", alert=True)
            return await home(cb, ctx)
        items = await ctx.service.admin_day(cb.from_user.id, d, table_id=t)
        win_start, win_end = sch.business_window(d, ctx.club.schedule, ctx.service.tz)
        gaps = sch.free_gaps([(r.start, r.end) for r in items], win_start, win_end)
        tz = ctx.service.tz
        lines = [f"🎱 <b>{escape(table.title)}</b>", f"📅 {sch.fmt_date(d)}", "", "<b>Занято:</b>"]
        if items:
            lines.extend(res_line(ctx, r) for r in items)
        else:
            lines.append("  ничего")
        lines.append("\n<b>Свободно:</b>")
        if gaps:
            lines.extend(f"  ✅ {s.astimezone(tz):%H:%M}–{e.astimezone(tz):%H:%M}" for s, e in gaps)
        else:
            lines.append("  нет свободного времени")
        rows = [res_button(ctx, r, with_table=False) for r in items]
        rows.append([kb.btn("◀ День", Ad(a="sch", x="v", t=t, d=d2i(d - timedelta(days=1)))),
                     kb.btn("День ▶", Ad(a="sch", x="v", t=t, d=d2i(d + timedelta(days=1))))])
        rows.append([kb.btn("➕ Бронь", Ad(a="dur", x="b", t=t, d=d2i(d))),
                     kb.btn("🔒 Блокировка", Ad(a="dur", x="l", t=t, d=d2i(d)))])
        rows.append(kb.nav_row(Ad(a="dt", x="v", t=t)))
        await show(cb, "\n".join(lines), kb.markup(rows))

    @router.callback_query(Ad.filter(F.a == "dur"))
    async def cb_duration(cb: CallbackQuery, callback_data: Ad, ctx: AppContext, reply: Reply) -> None:
        x, t, d = callback_data.x, callback_data.t, i2d(callback_data.d)
        table = ctx.club.table(t)
        if table is None or d is None or x not in ("b", "l"):
            reply.set("Кнопка устарела.", alert=True)
            return await home(cb, ctx)
        price = (lambda u: ctx.service.quote(table, u)) if x == "b" else None
        await show(cb, f"<b>{MODES[x]}</b>\n{escape(table.title)} · {sch.fmt_date(d)}\n\nДлительность:",
                   kb.durations_kb(ctx.club.schedule.durations_minutes, price,
                                   lambda u: Ad(a="tm", x=x, t=t, d=d2i(d), u=u), Ad(a="dt", x=x, t=t)))

    async def show_admin_times(cb: CallbackQuery, ctx: AppContext, x: str, t: int, d: date, u: int,
                               prefix: str = "") -> None:
        table = ctx.club.table(t)
        assert table is not None
        starts = await ctx.service.free_starts(t, d, u)
        text = (f"{prefix}<b>{MODES[x]}</b>\n{escape(table.title)} · {sch.fmt_date(d)} · {sch.fmt_duration(u)}\n\n")
        if not starts:
            text += "Свободного времени такой длительности нет. Существующие брони не отменяются автоматически."
        else:
            text += "Свободное время начала:"
        await show(cb, text, kb.times_kb(starts, lambda m: Ad(a="sum", x=x, t=t, d=d2i(d), u=u, m=m),
                                         Ad(a="dur", x=x, t=t, d=d2i(d))))

    @router.callback_query(Ad.filter(F.a == "tm"))
    async def cb_times(cb: CallbackQuery, callback_data: Ad, ctx: AppContext, reply: Reply) -> None:
        x, t, d, u = callback_data.x, callback_data.t, i2d(callback_data.d), callback_data.u
        if ctx.club.table(t) is None or d is None or x not in ("b", "l") \
                or u not in ctx.club.schedule.durations_minutes:
            reply.set("Кнопка устарела.", alert=True)
            return await home(cb, ctx)
        await show_admin_times(cb, ctx, x, t, d, u)

    @router.callback_query(Ad.filter(F.a == "sum"))
    async def cb_summary(cb: CallbackQuery, callback_data: Ad, ctx: AppContext, reply: Reply) -> None:
        x, t, d, u, m = callback_data.x, callback_data.t, i2d(callback_data.d), callback_data.u, callback_data.m
        table = ctx.club.table(t)
        if table is None or d is None or x not in ("b", "l"):
            reply.set("Кнопка устарела.", alert=True)
            return await home(cb, ctx)
        reason = ctx.service.validate(t, d, m, u, admin=True)
        if reason or m not in await ctx.service.free_starts(t, d, u):
            reply.set(REASON_TEXT.get(reason or "", "Это время уже занято."), alert=True)
            return await show_admin_times(cb, ctx, x, t, d, u)
        start, end = ctx.service.interval(d, m, u)
        details = texts.booking_details(ctx.club, ctx.service.tz, table_id=t, start=start, end=end, duration=u,
                                        price=ctx.service.quote(table, u) if x == "b" else None)
        note = ("Гость получит условное имя «Гость N (по телефону)». Телефон в демо не сохраняется."
                if x == "b" else "На это время стол станет недоступен для бронирования.")
        label = "✅ Создать бронь" if x == "b" else "🔒 Заблокировать"
        await show(cb, f"<b>{MODES[x]}: проверка</b>\n\n{details}\n\n{note}", kb.markup([
            [kb.btn(label, Ad(a="ok", x=x, t=t, d=d2i(d), u=u, m=m, k=secrets.token_urlsafe(6)))],
            kb.nav_row(Ad(a="tm", x=x, t=t, d=d2i(d), u=u)),
        ]))

    @router.callback_query(Ad.filter(F.a == "ok"))
    async def cb_create(cb: CallbackQuery, callback_data: Ad, ctx: AppContext, reply: Reply) -> None:
        x, t, d, u, m, k = (callback_data.x, callback_data.t, i2d(callback_data.d),
                            callback_data.u, callback_data.m, callback_data.k)
        if d is None or not k or x not in ("b", "l"):
            reply.set("Кнопка устарела.", alert=True)
            return await home(cb, ctx)
        create = ctx.service.admin_create_booking if x == "b" else ctx.service.admin_create_block
        result = await create(cb.from_user.id, t, d, m, u, k)
        if result.ok and result.reservation:
            ctx.kick_outbox()
            res = result.reservation
            what = "Блокировка" if res.is_block else "Бронь"
            head = f"✅ {what} № {res.id} создана" if result.status == "created" else f"ℹ️ {what} № {res.id} уже создана"
            reply.set(head.removeprefix("✅ ").removeprefix("ℹ️ "))
            await show(cb, f"<b>{head}</b>\n\n" + texts.reservation_card(ctx.club, ctx.service.tz, res,
                                                                         ctx.service.now(), admin=True),
                       kb.markup([[kb.btn("🎱 Расписание стола", Ad(a="sch", x="v", t=t, d=d2i(d)))],
                                  kb.nav_row(Ad(a="home"))]))
            return
        if result.status == "conflict":
            reply.set("Интервал уже занят", alert=True)
            return await show_admin_times(
                cb, ctx, x, t, d, u,
                prefix="⚠️ <b>Интервал занят.</b> Существующая запись не отменена. Свободные варианты:\n\n")
        reply.set(REASON_TEXT.get(result.reason or "", "Не удалось создать запись."), alert=True)
        await show_admin_times(cb, ctx, x, t, d, u)

    # --- карточка и отмена -------------------------------------------------------

    @router.callback_query(Ad.filter(F.a == "card"))
    async def cb_card(cb: CallbackQuery, callback_data: Ad, ctx: AppContext, reply: Reply) -> None:
        res = await ctx.service.admin_get(cb.from_user.id, callback_data.i)
        if res is None:
            reply.set("Запись не найдена.", alert=True)
            return await home(cb, ctx)
        local_date = sch.business_date(res.start, ctx.club.schedule, ctx.service.tz)
        rows = []
        if res.is_active:
            rows.append([kb.btn("🔓 Снять блокировку" if res.is_block else "🚫 Отменить бронь",
                                Ad(a="cxa", i=res.id))])
        rows.append([kb.btn("🎱 Расписание стола", Ad(a="sch", x="v", t=res.table_id, d=d2i(local_date)))])
        rows.append(kb.nav_row(Ad(a="day", d=d2i(local_date))))
        await show(cb, texts.reservation_card(ctx.club, ctx.service.tz, res, ctx.service.now(), admin=True),
                   kb.markup(rows))

    @router.callback_query(Ad.filter(F.a == "cxa"))
    async def cb_cancel_ask(cb: CallbackQuery, callback_data: Ad, ctx: AppContext, reply: Reply) -> None:
        res = await ctx.service.admin_get(cb.from_user.id, callback_data.i)
        if res is None or not res.is_active:
            reply.set("Запись уже неактивна.", alert=True)
            return await home(cb, ctx)
        question = "Снять блокировку?" if res.is_block else "Отменить бронь? Гость получит уведомление."
        if not res.is_block and res.tg_user_id is None:
            question = "Отменить бронь? (гость записан вручную или это демо-запись — уведомление не отправляется)"
        await show(cb, f"❓ <b>{question}</b>\n\n" + texts.reservation_card(ctx.club, ctx.service.tz, res,
                                                                            ctx.service.now(), admin=True),
                   kb.markup([[kb.btn("Да", Ad(a="cx", i=res.id)), kb.btn("Нет", Ad(a="card", i=res.id))],
                              kb.nav_row(Ad(a="home"))]))

    @router.callback_query(Ad.filter(F.a == "cx"))
    async def cb_cancel(cb: CallbackQuery, callback_data: Ad, ctx: AppContext, reply: Reply) -> None:
        result = await ctx.service.admin_cancel(cb.from_user.id, callback_data.i)
        if result.status == "cancelled" and result.reservation:
            ctx.kick_outbox()
            res = result.reservation
            reply.set("Блокировка снята" if res.is_block else f"Бронь № {res.id} отменена")
            local_date = sch.business_date(res.start, ctx.club.schedule, ctx.service.tz)
            await show(cb, f"✅ <b>{'Блокировка снята' if res.is_block else f'Бронь № {res.id} отменена'}</b>\n"
                           "Время снова доступно для бронирования.",
                       kb.markup([[kb.btn("🎱 Расписание стола",
                                          Ad(a="sch", x="v", t=res.table_id, d=d2i(local_date)))],
                                  kb.nav_row(Ad(a="home"))]))
            return
        reply.set("Запись уже отменена или не найдена.", alert=True)
        await home(cb, ctx)

    # --- демо-данные --------------------------------------------------------------

    @router.callback_query(Ad.filter(F.a == "demo"))
    async def cb_demo_ask(cb: CallbackQuery, ctx: AppContext, reply: Reply) -> None:
        if not ctx.settings.demo_mode:
            reply.set("DEMO_MODE выключен.", alert=True)
            return await home(cb, ctx)
        await show(cb, "🔄 <b>Обновить демо-записи?</b>\n\n"
                       "Будут удалены и созданы заново <b>только фиктивные демо-записи</b> на ближайшие дни. "
                       "Брони гостей, ручные брони и блокировки не изменятся.",
                   kb.markup([[kb.btn("Да, обновить", Ad(a="demook")), kb.btn("Отмена", Ad(a="home"))]]))

    @router.callback_query(Ad.filter(F.a == "demook"))
    async def cb_demo(cb: CallbackQuery, ctx: AppContext, reply: Reply) -> None:
        if not ctx.settings.demo_mode:
            reply.set("DEMO_MODE выключен.", alert=True)
            return await home(cb, ctx)
        removed, created = await refresh_demo(ctx.service, cb.from_user.id)
        reply.set("Демо-записи обновлены")
        await home(cb, ctx, prefix=f"✅ Демо-записи обновлены: удалено {removed}, создано {created}.\n\n")

    # --- уведомления --------------------------------------------------------------

    @router.callback_query(Ad.filter(F.a == "ob"))
    async def cb_outbox(cb: CallbackQuery, ctx: AppContext) -> None:
        total, items = await ctx.outbox.problems()
        chats = ctx.settings.notification_chats()
        lines = ["📨 <b>Уведомления</b>",
                 "Получатели: " + (", ".join(f"<code>{c}</code>" for c in chats) if chats else "не настроены"), ""]
        if not total:
            lines.append("Все уведомления доставлены.")
        else:
            lines.append(f"⚠️ Не доставлено: {total}. Бот повторяет отправку автоматически.")
            lines.append("Частая причина — получатель ещё не открыл бота и не нажал /start.\n")
            for it in items:
                lines.append(f"• чат <code>{it.chat_id}</code>, попыток {it.attempts}: {escape(it.last_error or '')}")
        rows = []
        if total:
            rows.append([kb.btn("🔁 Повторить сейчас", Ad(a="obr"))])
        rows.append(kb.nav_row(Ad(a="home")))
        await show(cb, "\n".join(lines), kb.markup(rows))

    @router.callback_query(Ad.filter(F.a == "obr"))
    async def cb_outbox_retry(cb: CallbackQuery, ctx: AppContext, reply: Reply) -> None:
        n = await ctx.outbox.retry_all()
        ctx.kick_outbox()
        reply.set(f"Поставлено на повтор: {n}")
        await cb_outbox(cb, ctx)

    return router
