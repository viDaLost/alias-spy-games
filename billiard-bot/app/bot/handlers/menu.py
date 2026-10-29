"""Меню кафе: категории и карточки блюд с локальными фотографиями."""

from __future__ import annotations

from aiogram import F, Router
from aiogram.types import CallbackQuery

from ...club import format_money
from .. import keyboards as kb
from .. import texts
from ..callbacks import Mn, Nav
from ..context import AppContext
from ..middlewares import Reply
from ..ui import show


def make_router() -> Router:
    router = Router(name="menu")

    MENU_INTRO = (
        "🍽 <b>Меню кафе</b>\n\n"
        "Фотографии иллюстративные и не являются фотографиями блюд реального заведения. "
        "Цены условные. Заказ и оплата в демо не подключены.\n\nВыберите категорию:"
    )

    async def show_categories(cb: CallbackQuery, ctx: AppContext) -> None:
        rows = []
        cats = list(ctx.club.menu)
        for i in range(0, len(cats), 2):
            rows.append([kb.btn(c.title, Mn(a="item", c=c.id, i=0)) for c in cats[i:i + 2]])
        rows.append([kb.btn("📷 Авторы фотографий", Mn(a="credits"))])
        rows.append(kb.nav_row())
        await show(cb, MENU_INTRO, kb.markup(rows))

    @router.callback_query(Nav.filter(F.to == "menu"))
    async def nav_menu(cb: CallbackQuery, ctx: AppContext) -> None:
        await show_categories(cb, ctx)

    @router.callback_query(Mn.filter(F.a == "cats"))
    async def menu_cats(cb: CallbackQuery, ctx: AppContext) -> None:
        await show_categories(cb, ctx)

    @router.callback_query(Mn.filter(F.a == "item"))
    async def menu_item(cb: CallbackQuery, callback_data: Mn, ctx: AppContext, reply: Reply) -> None:
        cat = ctx.club.category(callback_data.c)
        if cat is None or not cat.items:
            reply.set("Раздел меню изменился.", alert=True)
            return await show_categories(cb, ctx)
        count = len(cat.items)
        idx = callback_data.i % count
        item = cat.items[idx]
        credit = ctx.credits.get(item.photo_path.name) if item.photo_path.is_file() else None
        caption = texts.menu_item_caption(item, credit)
        rows = []
        if count > 1:
            rows.append([
                kb.btn("◀", Mn(a="item", c=cat.id, i=(idx - 1) % count)),
                kb.noop(f"{idx + 1} / {count}"),
                kb.btn("▶", Mn(a="item", c=cat.id, i=(idx + 1) % count)),
            ])
        for j, other in enumerate(cat.items):
            if j != idx:
                rows.append([kb.btn(f"{other.name} · {format_money(other.price_kop)}", Mn(a="item", c=cat.id, i=j))])
        rows.append([kb.btn("⬅️ Категории", Mn(a="cats")), kb.btn(kb.BTN_MAIN, Nav(to="main"))])
        await show(cb, caption, kb.markup(rows), photo=item.photo_path, media=ctx.media)

    @router.callback_query(Mn.filter(F.a == "credits"))
    async def menu_credits(cb: CallbackQuery, ctx: AppContext) -> None:
        await show(cb, texts.credits_text(ctx.credits), kb.markup([[kb.btn("⬅️ Категории", Mn(a="cats")),
                                                                  kb.btn(kb.BTN_MAIN, Nav(to="main"))]]))

    return router
