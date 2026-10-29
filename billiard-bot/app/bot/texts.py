"""Тексты экранов. Значения из конфигурации экранируются для HTML."""

from __future__ import annotations

from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

from ..club import Club, MenuItem, format_money
from ..core import schedule as sch
from ..core.booking import Reservation
from .media import PhotoCredit

DEMO_LINE = "Демонстрационный бот: заведение, меню, цены и бронирования показаны для примера."
NO_CONTACTS = "Адрес и контакты будут указаны при запуске"


def welcome(club: Club) -> str:
    return (
        f"🎱 <b>{escape(club.name)}</b>\n"
        f"<i>{DEMO_LINE}</i>\n\n"
        "Здесь можно забронировать бильярдный стол, посмотреть меню кафе и свои брони.\n"
        "Выберите раздел 👇"
    )


def main_menu(club: Club) -> str:
    return f"🎱 <b>{escape(club.name)}</b>\nВыберите раздел 👇"


def about(club: Club) -> str:
    lines = [f"📍 <b>О клубе «{escape(club.name)}»</b>"]
    if club.tagline:
        lines.append(escape(club.tagline))
    lines.append("")
    lines.append(f"🕛 <b>График:</b> {sch.fmt_schedule(club.schedule)}")
    lines.append("")
    lines.append("🎱 <b>Столы</b> (условные цены):")
    for t in club.tables:
        lines.append(f"• {escape(t.name)} — {escape(t.kind)}, {format_money(t.rate_kop_per_hour)}/час")
    lines.append("")
    if club.address or club.phone or club.links:
        if club.address:
            lines.append(f"🏠 {escape(club.address)}")
        if club.phone:
            lines.append(f"📞 {escape(club.phone)}")
        for link in club.links:
            lines.append(f"🔗 {escape(link)}")
    else:
        lines.append(f"📞 {NO_CONTACTS}.")
    lines.append("")
    lines.append(f"<i>{DEMO_LINE}</i>")
    return "\n".join(lines)


HOW_IT_WORKS = (
    "✨ <b>Как работает бот</b>\n\n"
    "🎱 <b>Бронирование.</b> «Забронировать стол» → стол → дата → длительность → свободное время. "
    "Показываются только интервалы, в которые помещается вся игра. Бронь создаётся только после "
    "кнопки «Подтвердить бронирование» — до этого шаги можно прервать без последствий.\n\n"
    "🍽 <b>Меню.</b> «Меню кафе» — категории и карточки блюд с фото, составом, весом и ценой. "
    "Заказ и оплата в демо не подключены.\n\n"
    "📅 <b>Мои бронирования.</b> Будущие брони и история. Будущую бронь можно отменить — "
    "время сразу снова становится свободным.\n\n"
    "🛠 <b>Администратор.</b> Получает уведомление о каждой новой брони и отмене, видит брони по дням "
    "и расписание каждого стола, может отменить бронь, записать гостя по телефону и заблокировать стол. "
    "Админ-панель доступна только Telegram ID, которые владелец бота указал в настройках.\n\n"
    "🔐 <b>Данные.</b> Имя и телефон не запрашиваются, но для привязки брони бот использует ваш "
    "Telegram ID. Администратор видит условное имя вроде «Гость 104».\n\n"
    f"<i>{DEMO_LINE}</i>"
)

HELP = (
    "ℹ️ <b>Команды</b>\n"
    "/start — главное меню\n"
    "/help — эта подсказка\n"
    "/id — показать ваш Telegram ID (нужен владельцу бота, чтобы выдать доступ администратора)\n"
    "/admin — админ-панель (только для администраторов)\n\n"
    "Всё остальное — кнопками под сообщениями."
)


def status_label(res: Reservation, now: datetime) -> str:
    if res.status == "cancelled":
        if res.cancelled_by is not None and res.cancelled_by != res.tg_user_id:
            return "❌ отменена администратором"
        return "❌ отменена"
    if res.end <= now:
        return "☑️ завершена"
    if res.start <= now:
        return "🎱 идёт сейчас"
    return "✅ подтверждена"


def booking_details(club: Club, tz: ZoneInfo, *, table_id: int, start: datetime, end: datetime,
                    duration: int, price: int | None) -> str:
    table = club.table(table_id)
    s, e = sch.fmt_start_end(start, end, tz)
    lines = [
        f"🎱 {escape(table.title) if table else table_id}",
        f"🕐 Начало: {s}",
        f"🏁 Окончание: {e}",
        f"⏱ Длительность: {sch.fmt_duration(duration)}",
    ]
    if price is not None:
        lines.append(f"💳 Стоимость: <b>{format_money(price)}</b> (условная цена, оплата в клубе)")
    return "\n".join(lines)


def reservation_card(club: Club, tz: ZoneInfo, res: Reservation, now: datetime, *, admin: bool = False) -> str:
    title = f"🔒 Блокировка № {res.id}" if res.is_block else f"Бронь № {res.id}"
    lines = [f"<b>{title}</b>",
             booking_details(club, tz, table_id=res.table_id, start=res.start, end=res.end,
                             duration=res.duration_min, price=None if res.is_block else res.price_kop),
             f"Статус: {status_label(res, now)}"]
    if admin:
        lines.append(f"Гость: {escape(res.guest_name)}")
        origin = {"guest": "через бота", "admin": "вручную администратором", "demo": "демо-данные"}[res.source]
        lines.append(f"Источник: {origin}")
        if res.note:
            lines.append(f"Примечание: {escape(res.note)}")
        lines.append(f"Создана: {res.created_at.astimezone(tz):%d.%m %H:%M}")
    return "\n".join(lines)


def reservation_line(club: Club, tz: ZoneInfo, res: Reservation) -> str:
    table = club.table(res.table_id)
    name = table.name if table else f"Стол {res.table_id}"
    return f"№ {res.id} · {sch.fmt_interval(res.start, res.end, tz)} · {escape(name)}"


def menu_item_caption(item: MenuItem, credit: PhotoCredit | None) -> str:
    lines = [
        f"<b>{escape(item.name)}</b>",
        escape(item.description),
        "",
        f"⚖️ {escape(item.portion)} · 💳 {format_money(item.price_kop)}",
        "",
    ]
    if credit:
        lines.append(f"<i>Фото иллюстративное, не из реального заведения. Фото: {escape(credit.short)}</i>")
    else:
        lines.append("<i>Цена условная.</i>")
    return "\n".join(lines)


def credits_text(credits: dict[str, PhotoCredit]) -> str:
    if not credits:
        return "📷 <b>Фотографии меню</b>\n\nФотографии ещё не добавлены."
    lines = [
        "📷 <b>Авторы фотографий</b>",
        "Фотографии иллюстративные и не являются фотографиями блюд реального заведения.",
        "",
    ]
    for c in credits.values():
        lic = f'<a href="{escape(c.license_url)}">{escape(c.license)}</a>' if c.license_url else escape(c.license)
        lines.append(
            f'• {escape(c.subject)}: {escape(c.author)}, {lic}, '
            f'<a href="{escape(c.source_page)}">источник</a>'
        )
    lines.append("")
    lines.append("Подробности — в файле ASSET_CREDITS.md проекта.")
    return "\n".join(lines)
