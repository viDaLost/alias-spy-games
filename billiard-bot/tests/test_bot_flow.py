"""Сценарии через настоящий Dispatcher и обработчики, но с эмуляцией Bot API.

Это НЕ проверка реального Telegram: сетевой слой заменён MockSession, которая
записывает вызовы методов и возвращает правдоподобные ответы. Проверяется
навигация, кнопки, права и запись в БД.
"""

from __future__ import annotations

import itertools
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

import pytest
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.base import BaseSession
from aiogram.methods import (
    AnswerCallbackQuery,
    DeleteMessage,
    EditMessageMedia,
    EditMessageText,
    SendMessage,
    SendPhoto,
    TelegramMethod,
)
from aiogram.types import Chat, InputFile, Message, PhotoSize, Update

from app.bot.app import build_context, build_dispatcher, make_sender
from app.bot.texts import DEMO_LINE
from app.settings import Settings

from .conftest import ADMIN, GUEST_A, GUEST_B

TOKEN = "123456789:AAFakeTokenForTestsOnly_abcdefghijk"


class MockSession(BaseSession):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[TelegramMethod] = []
        self.ids = itertools.count(1000)
        self.photo_ids = itertools.count(1)

    async def close(self) -> None:
        pass

    async def stream_content(self, *a, **kw):  # pragma: no cover
        raise NotImplementedError
        yield b""

    def _message(self, chat_id: int, **kw: Any) -> Message:
        return Message(
            message_id=next(self.ids), date=datetime.now(UTC),
            chat=Chat(id=chat_id, type="private"), **kw,
        )

    async def make_request(self, bot: Bot, method: TelegramMethod, timeout: int | None = None) -> Any:
        self.calls.append(method)
        if isinstance(method, SendMessage):
            result = self._message(method.chat_id, text=method.text, reply_markup=method.reply_markup)
        elif isinstance(method, SendPhoto):
            fid = method.photo if isinstance(method.photo, str) else f"PHOTO{next(self.photo_ids)}"
            result = self._message(method.chat_id, caption=method.caption, reply_markup=method.reply_markup,
                                   photo=[PhotoSize(file_id=fid, file_unique_id=fid, width=800, height=600)])
        elif isinstance(method, EditMessageText):
            result = self._message(method.chat_id, text=method.text, reply_markup=method.reply_markup)
        elif isinstance(method, EditMessageMedia):
            media = method.media.media
            fid = media if isinstance(media, str) else f"PHOTO{next(self.photo_ids)}"
            result = self._message(method.chat_id, caption=method.media.caption, reply_markup=method.reply_markup,
                                   photo=[PhotoSize(file_id=fid, file_unique_id=fid, width=800, height=600)])
        elif isinstance(method, (AnswerCallbackQuery, DeleteMessage)):
            result = True
        else:
            result = True
        if isinstance(result, Message):
            result = result.as_(bot)
        return result

    def last(self, kind: type) -> Any:
        return next(c for c in reversed(self.calls) if isinstance(c, kind))

    def screens(self) -> list[Any]:
        return [c for c in self.calls if isinstance(c, (SendMessage, EditMessageText, SendPhoto, EditMessageMedia))]


class Harness:
    def __init__(self, bot: Bot, dp, session: MockSession, ctx) -> None:
        self.bot, self.dp, self.session, self.ctx = bot, dp, session, ctx
        self.update_ids = itertools.count(1)
        self.screen: dict[int, Any] = {}

    async def _feed(self, data: dict) -> None:
        data["update_id"] = next(self.update_ids)
        await self.dp.feed_update(self.bot, Update.model_validate(data, context={"bot": self.bot}))

    def _user(self, uid: int) -> dict:
        return {"id": uid, "is_bot": False, "first_name": f"U{uid}"}

    async def send(self, uid: int, text: str) -> None:
        await self._feed({"message": {
            "message_id": next(self.session.ids), "date": int(datetime.now(UTC).timestamp()),
            "chat": {"id": uid, "type": "private"}, "from": self._user(uid), "text": text,
            **({"entities": [{"type": "bot_command", "offset": 0, "length": len(text.split()[0])}]}
               if text.startswith("/") else {}),
        }})
        self.screen[uid] = self.session.screens()[-1]

    async def press(self, uid: int, data: str) -> None:
        cur = self.screen.get(uid)
        msg: dict[str, Any] = {
            "message_id": next(self.session.ids), "date": int(datetime.now(UTC).timestamp()),
            "chat": {"id": uid, "type": "private"},
            "from": {"id": 123456789, "is_bot": True, "first_name": "Bot"},
        }
        if isinstance(cur, (SendPhoto, EditMessageMedia)):
            msg["photo"] = [{"file_id": "X", "file_unique_id": "X", "width": 1, "height": 1}]
            msg["caption"] = "card"
        else:
            msg["text"] = "card"
        await self._feed({"callback_query": {
            "id": str(next(self.update_ids)), "from": self._user(uid), "chat_instance": "ci",
            "message": msg, "data": data,
        }})
        screens = self.session.screens()
        if screens:
            self.screen[uid] = screens[-1]

    def text(self, uid: int) -> str:
        s = self.screen[uid]
        if isinstance(s, EditMessageMedia):
            return s.media.caption or ""
        return getattr(s, "text", None) or getattr(s, "caption", None) or ""

    def buttons(self, uid: int) -> list[tuple[str, str]]:
        kb = self.screen[uid].reply_markup
        return [(b.text, b.callback_data) for row in kb.inline_keyboard for b in row] if kb else []

    def button(self, uid: int, starts: str) -> str:
        for text, data in self.buttons(uid):
            if text.startswith(starts):
                return data
        raise AssertionError(f"нет кнопки «{starts}…» среди {[t for t, _ in self.buttons(uid)]}")

    def last_answer(self) -> AnswerCallbackQuery:
        return self.session.last(AnswerCallbackQuery)


@pytest.fixture
async def h(tmp_path):
    settings = Settings(bot_token=TOKEN, admin_ids=frozenset({ADMIN}), database_path=tmp_path / "bot.db",
                        demo_mode=True)
    ctx = await build_context(settings)
    session = MockSession()
    bot = Bot(TOKEN, session=session, default=DefaultBotProperties(parse_mode="HTML"))
    return Harness(bot, build_dispatcher(ctx), session, ctx)


async def book_first_free(h: Harness, uid: int) -> tuple[str, str]:
    """Проходит сценарий бронирования кнопками. Возвращает (callback подтверждения, текст итоговой карточки)."""
    await h.send(uid, "/start")
    await h.press(uid, h.button(uid, "🎱 Забронировать"))
    assert "Шаг 1 из 4" in h.text(uid)
    await h.press(uid, h.button(uid, "Стол № 1"))
    await h.press(uid, h.button(uid, "Завтра"))
    assert "Шаг 3 из 4" in h.text(uid)
    await h.press(uid, h.button(uid, "1,5 часа"))
    assert "Шаг 4 из 4" in h.text(uid)
    times = [(t, d) for t, d in h.buttons(uid) if d.startswith("b:sum:")]
    assert times, "нет свободного времени"
    await h.press(uid, times[0][1])
    assert "Проверьте бронирование" in h.text(uid) and "1 050 ₽" in h.text(uid)
    return h.button(uid, "✅ Подтвердить"), times[0][1]


async def count_reservations(h: Harness, where: str = "source = 'guest'") -> int:
    async with h.ctx.service.db.connect() as conn:
        return (await (await conn.execute(f"SELECT COUNT(*) AS n FROM reservations WHERE {where}")).fetchone())["n"]


async def test_start_shows_demo_line_and_main_menu(h):
    await h.send(GUEST_A, "/start")
    assert DEMO_LINE in h.text(GUEST_A)
    labels = [t for t, _ in h.buttons(GUEST_A)]
    assert labels[:5] == ["🎱 Забронировать стол", "🍽 Меню кафе", "📅 Мои бронирования", "📍 О клубе",
                          "✨ Как работает бот"]
    assert "🛠 Админ-панель" not in labels
    await h.press(GUEST_A, h.button(GUEST_A, "📍 О клубе"))
    assert "Адрес и контакты будут указаны при запуске" in h.text(GUEST_A)
    assert "ежедневно 12:00–02:00 следующего дня" in h.text(GUEST_A)
    await h.press(GUEST_A, h.button(GUEST_A, "🏠"))
    await h.press(GUEST_A, h.button(GUEST_A, "✨"))
    assert "Администратор" in h.text(GUEST_A)


async def test_abandoned_flow_creates_nothing(h):
    await book_first_free(h, GUEST_A)
    await h.press(GUEST_A, h.button(GUEST_A, "🏠"))
    assert await count_reservations(h) == 0
    assert all(c.callback_query_id for c in h.session.calls if isinstance(c, AnswerCallbackQuery))


async def test_full_booking_notify_admin_and_cancel(h):
    confirm, slot = await book_first_free(h, GUEST_A)
    await h.press(GUEST_A, confirm)
    assert "подтверждена" in h.text(GUEST_A)
    assert await count_reservations(h) == 1

    # повторное нажатие той же кнопки — без дубликата
    await h.press(GUEST_A, confirm)
    assert "уже создана" in h.text(GUEST_A)
    assert await count_reservations(h) == 1

    # уведомление администратору уходит через очередь
    sent, errors = await h.ctx.outbox.deliver_due(make_sender(h.bot))
    assert (sent, errors) == (1, 0)
    note = h.session.last(SendMessage)
    assert note.chat_id == ADMIN and "Новая бронь" in note.text and "Стоимость" in note.text

    # второй гость не видит занятое время
    await h.send(GUEST_B, "/start")
    await h.press(GUEST_B, h.button(GUEST_B, "🎱"))
    await h.press(GUEST_B, h.button(GUEST_B, "Стол № 1"))
    await h.press(GUEST_B, h.button(GUEST_B, "Завтра"))
    await h.press(GUEST_B, h.button(GUEST_B, "1,5 часа"))
    assert slot not in [d for _, d in h.buttons(GUEST_B)]
    # даже старая/подделанная кнопка на это время не создаёт вторую бронь
    await h.press(GUEST_B, slot)
    assert "уже занято" in (h.last_answer().text or "")
    forged = confirm.rsplit(":", 1)[0] + ":forged"
    await h.press(GUEST_B, forged)
    assert "заняли" in h.text(GUEST_B)
    assert await count_reservations(h, "status = 'confirmed' AND source = 'guest'") == 1

    # гость B не может открыть или отменить чужую бронь, подставив её номер
    async with h.ctx.service.db.connect() as conn:
        rid = (await (await conn.execute("SELECT id FROM reservations WHERE source = 'guest'")).fetchone())["id"]
    await h.press(GUEST_B, f"m:card:{rid}")
    assert "не найдена" in (h.last_answer().text or "")
    await h.press(GUEST_B, f"m:cx:{rid}")
    assert (await h.ctx.service.get(rid)).status == "confirmed"

    # гость A отменяет свою бронь — с подтверждением
    await h.press(GUEST_A, "n:my")
    assert f"№ {rid}" in h.text(GUEST_A)
    await h.press(GUEST_A, h.button(GUEST_A, f"№ {rid}"))
    await h.press(GUEST_A, h.button(GUEST_A, "❌ Отменить"))
    assert "Отменить бронь?" in h.text(GUEST_A)
    await h.press(GUEST_A, h.button(GUEST_A, "Да, отменить"))
    assert (await h.ctx.service.get(rid)).status == "cancelled"
    await h.ctx.outbox.deliver_due(make_sender(h.bot))
    assert "отменил" in h.session.last(SendMessage).text

    # время снова доступно второму гостю
    await h.press(GUEST_B, "n:book")
    await h.press(GUEST_B, h.button(GUEST_B, "Стол № 1"))
    await h.press(GUEST_B, h.button(GUEST_B, "Завтра"))
    await h.press(GUEST_B, h.button(GUEST_B, "1,5 часа"))
    assert slot in [d for _, d in h.buttons(GUEST_B)]


async def test_admin_access_and_schedule(h):
    # не-админ: команда и даже правильно сформированные админские кнопки не работают
    await h.send(GUEST_A, "/admin")
    assert "только администраторам" in h.text(GUEST_A)
    for data in ("a:home::0:0:0:-1:0:0:", "a:demook::0:0:0:-1:0:0:", "a:cx::0:0:0:-1:0:1:"):
        await h.press(GUEST_A, data)
        assert "Нет доступа" in (h.last_answer().text or "")
    assert await count_reservations(h, "source = 'demo' AND status = 'confirmed'") > 0

    confirm, _ = await book_first_free(h, GUEST_A)
    await h.press(GUEST_A, confirm)

    await h.send(ADMIN, "/admin")
    assert "Админ-панель" in h.text(ADMIN)
    await h.press(ADMIN, h.button(ADMIN, "📋 Завтра"))
    assert "Гость 101" in h.text(ADMIN)
    await h.press(ADMIN, h.button(ADMIN, "Стол 1 · № "))
    assert "Источник: через бота" in h.text(ADMIN)
    await h.press(ADMIN, h.button(ADMIN, "🚫 Отменить бронь"))
    await h.press(ADMIN, h.button(ADMIN, "Да"))
    assert "отменена" in h.text(ADMIN)
    await h.ctx.outbox.deliver_due(make_sender(h.bot))
    guest_msgs = [c for c in h.session.calls if isinstance(c, SendMessage) and c.chat_id == GUEST_A]
    assert any("отменена администратором" in m.text for m in guest_msgs)

    # блокировка стола через панель
    await h.press(ADMIN, "a:home::0:0:0:-1:0:0:")
    await h.press(ADMIN, h.button(ADMIN, "🔒 Блокировка"))
    await h.press(ADMIN, h.button(ADMIN, "Стол № 2"))
    await h.press(ADMIN, h.button(ADMIN, "Завтра"))
    await h.press(ADMIN, h.button(ADMIN, "2 часа"))
    await h.press(ADMIN, [d for _, d in h.buttons(ADMIN) if d.startswith("a:sum:")][0])
    await h.press(ADMIN, h.button(ADMIN, "🔒 Заблокировать"))
    assert "Блокировка №" in h.text(ADMIN)
    assert await count_reservations(h, "kind = 'block' AND source = 'admin'") == 1

    # обновление демо-данных — только после подтверждения
    before = await count_reservations(h, "source <> 'demo'")
    await h.press(ADMIN, "a:demo::0:0:0:-1:0:0:")
    assert "только фиктивные" in h.text(ADMIN)
    await h.press(ADMIN, h.button(ADMIN, "Да, обновить"))
    assert "Демо-записи обновлены" in h.text(ADMIN)
    assert await count_reservations(h, "source <> 'demo'") == before


async def test_stale_and_unknown_input(h):
    await h.send(GUEST_A, "привет")
    assert "через кнопки" in h.text(GUEST_A)
    await h.press(GUEST_A, "zz:unknown")
    assert "устарела" in (h.last_answer().text or "")
    await h.press(GUEST_A, "b:dur:9:20991231:0:-1:0:")
    assert "устарела" in (h.last_answer().text or "")
    await h.send(GUEST_A, "/id")
    assert str(GUEST_A) in h.text(GUEST_A)


async def test_menu_cards_with_photo_cache(h, tmp_path):
    from PIL import Image

    # Подменяем фото одной позиции временным файлом, чтобы проверить загрузку и кэш file_id.
    photo = tmp_path / "test.jpg"
    Image.new("RGB", (64, 48), (200, 30, 30)).save(photo, "JPEG")
    club = h.ctx.club
    cat = club.menu[0]
    item = replace(cat.items[0], photo=str(photo))
    new_cat = replace(cat, items=(item, *cat.items[1:]))
    h.ctx.club = replace(club, menu=(new_cat, *club.menu[1:]))

    await h.send(GUEST_A, "/start")
    await h.press(GUEST_A, h.button(GUEST_A, "🍽"))
    assert "иллюстративные" in h.text(GUEST_A)
    await h.press(GUEST_A, h.button(GUEST_A, cat.title))
    first = h.session.last(SendPhoto)
    assert isinstance(first.photo, InputFile)  # первый раз — загрузка локального файла
    assert item.name in first.caption and "590" in first.caption
    await h.press(GUEST_A, h.button(GUEST_A, "⬅️ Категории"))
    await h.press(GUEST_A, h.button(GUEST_A, cat.title))
    second = h.session.last(SendPhoto)
    assert second.photo == "PHOTO1"  # повторно — по кэшированному file_id
    await h.press(GUEST_A, h.button(GUEST_A, "▶"))  # фото → фото: правка текущей карточки
    assert isinstance(h.screen[GUEST_A], (EditMessageMedia, EditMessageText, SendMessage))
    await h.press(GUEST_A, h.button(GUEST_A, "⬅️ Категории"))
    await h.press(GUEST_A, h.button(GUEST_A, "📷"))
    assert "Авторы фотографий" in h.text(GUEST_A) or "Фотографии ещё не добавлены" in h.text(GUEST_A)
