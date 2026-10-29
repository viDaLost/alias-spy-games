#!/usr/bin/env python3
"""Загрузка фотографий меню из Wikimedia Commons с проверкой лицензии каждого файла.

    python scripts/fetch_menu_photos.py --dry-run     # только показать, какие файлы подходят
    python scripts/fetch_menu_photos.py               # скачать недостающие фото
    python scripts/fetch_menu_photos.py --force       # перезаписать все
    python scripts/fetch_menu_photos.py --only tea --title "File:Some tea.jpg"   # выбрать файл вручную

Что делает скрипт:
* берёт кандидатов только из Wikimedia Commons (весь контент там под свободными лицензиями);
* для каждого файла читает через API лицензию, автора и страницу источника и принимает
  только CC0, Public domain, CC BY и CC BY-SA (без NC/ND и без файлов с пометкой ограничений);
* уменьшает фото до 1280 px по длинной стороне, обрезает до 4:3, сохраняет JPEG без EXIF;
* записывает assets/menu/credits.json (его читает бот) и ASSET_CREDITS.md.

После загрузки ОБЯЗАТЕЛЬНО просмотрите фотографии глазами: поиск по Commons может
вернуть формально подходящее, но неудачное фото. Неподходящее замените через --title.
"""

from __future__ import annotations

import argparse
import html
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MENU_DIR = ROOT / "assets" / "menu"
CREDITS_JSON = MENU_DIR / "credits.json"
CREDITS_MD = ROOT / "ASSET_CREDITS.md"
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "BilliardCafeDemoBot/1.0 (demo project; photo credits in ASSET_CREDITS.md)"
MAX_SIDE = 1280
MIN_WIDTH = 900

# Файл → (что изображено, предпочтительные файлы Commons, поисковые запросы).
CANDIDATES: dict[str, tuple[str, list[str], list[str]]] = {
    "margherita.jpg": ("Пицца «Маргарита»", ["File:Pizza Margherita stu spivack.jpg"],
                       ['incategory:"Pizza Margherita"', "pizza margherita"]),
    "pepperoni.jpg": ("Пицца «Пепперони»", [], ['incategory:"Pepperoni pizza"', "pepperoni pizza"]),
    "burger_classic.jpg": ("Классический бургер", ["File:NCI Visuals Food Hamburger.jpg"],
                           ['incategory:"Cheeseburgers"', "hamburger"]),
    "burger_chicken.jpg": ("Бургер с курицей", [], ["chicken burger", 'incategory:"Chicken sandwiches"']),
    "fries.jpg": ("Картофель фри", [], ['incategory:"French fries"', "french fries"]),
    "caesar.jpg": ("Салат «Цезарь»", [], ['incategory:"Caesar salad"', "caesar salad"]),
    "cappuccino.jpg": ("Капучино", [], ['incategory:"Cappuccino"', "cappuccino cup"]),
    "tea.jpg": ("Чай", [], ['incategory:"Cups of tea"', "cup of black tea"]),
    "lemonade.jpg": ("Лимонад", [], ['incategory:"Lemonade"', "lemonade glass"]),
}

_ALLOWED = re.compile(r"^(cc0|cc-zero|public domain|pd\b|cc[ -]by(-sa)?[ -]\d(\.\d)?)", re.I)
_FORBIDDEN = re.compile(r"\b(nc|nd|non-?commercial|no ?deriv)", re.I)


@dataclass
class Credit:
    file: str
    subject: str
    source_page: str
    original_file: str
    author: str
    license: str
    license_url: str
    attribution_required: bool
    attribution: str
    changes: str


def license_ok(short_name: str, restrictions: str = "") -> bool:
    """Разрешены только лицензии, допускающие коммерческое использование и изменения."""
    name = (short_name or "").strip()
    if not name or _FORBIDDEN.search(name):
        return False
    if restrictions.strip():
        return False  # товарные знаки, права на изображение личности и т. п.
    return bool(_ALLOWED.match(name))


def strip_html(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", value or ""))).strip()


def make_attribution(c: Credit) -> str:
    lic = f"{c.license} ({c.license_url})" if c.license_url else c.license
    return f"«{c.original_file}» — {c.author}, {lic}, {c.source_page}. Изменения: {c.changes}."


def _api(params: dict) -> dict:
    params = {**params, "format": "json", "formatversion": "2"}
    req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def _imageinfo_params() -> dict:
    return {"prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": str(MAX_SIDE)}


def _pages_for_titles(titles: list[str]) -> list[dict]:
    if not titles:
        return []
    data = _api({"action": "query", "titles": "|".join(titles), **_imageinfo_params()})
    return [p for p in data.get("query", {}).get("pages", []) if not p.get("missing")]


def _pages_for_search(query: str) -> list[dict]:
    data = _api({
        "action": "query", "generator": "search", "gsrsearch": f"{query} filetype:bitmap",
        "gsrnamespace": "6", "gsrlimit": "15", **_imageinfo_params(),
    })
    pages = data.get("query", {}).get("pages", [])
    return sorted(pages, key=lambda p: p.get("index", 0))


def evaluate(page: dict) -> tuple[bool, str, dict]:
    info = (page.get("imageinfo") or [{}])[0]
    meta = info.get("extmetadata", {})
    get = lambda k: (meta.get(k) or {}).get("value", "")  # noqa: E731
    if info.get("mime") not in ("image/jpeg", "image/png"):
        return False, f"формат {info.get('mime')}", info
    if int(info.get("width", 0)) < MIN_WIDTH:
        return False, f"мало пикселей ({info.get('width')} px)", info
    lic = strip_html(get("LicenseShortName"))
    if not license_ok(lic, strip_html(get("Restrictions"))):
        return False, f"лицензия «{lic or '—'}» не подходит", info
    if not strip_html(get("Artist")) and not strip_html(get("Credit")):
        return False, "не указан автор", info
    return True, lic, info


def choose(subject: str, titles: list[str], queries: list[str], *, used: set[str]) -> tuple[dict, dict] | None:
    seen: set[str] = set()
    for source in [lambda: _pages_for_titles(titles)] + [lambda q=q: _pages_for_search(q) for q in queries]:
        try:
            pages = source()
        except Exception as exc:  # noqa: BLE001
            print(f"    ! запрос к Commons не удался: {type(exc).__name__}: {exc}")
            continue
        for page in pages:
            title = page.get("title", "")
            if title in seen or title in used:
                continue
            seen.add(title)
            ok, why, info = evaluate(page)
            print(f"    {'✔' if ok else '✘'} {title} — {why}")
            if ok:
                return page, info
        time.sleep(0.5)
    return None


def optimize(raw: bytes, dest: Path) -> None:
    from PIL import Image, ImageOps

    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    img = ImageOps.fit(img, _fit_size(img.size), method=Image.Resampling.LANCZOS)
    img.save(dest, "JPEG", quality=85, optimize=True, progressive=True)


def _fit_size(size: tuple[int, int]) -> tuple[int, int]:
    w, h = size
    target_w = min(MAX_SIDE, w, int(h * 4 / 3))
    return target_w, int(target_w * 3 / 4)


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def credit_from(file: str, subject: str, page: dict, info: dict) -> Credit:
    meta = info.get("extmetadata", {})
    get = lambda k: strip_html((meta.get(k) or {}).get("value", ""))  # noqa: E731
    c = Credit(
        file=file,
        subject=subject,
        source_page=info.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(page['title'])}",
        original_file=page["title"].removeprefix("File:"),
        author=get("Artist") or get("Credit"),
        license=get("LicenseShortName"),
        license_url=get("LicenseUrl"),
        attribution_required=get("AttributionRequired").lower() != "false",
        attribution="",
        changes="уменьшено, обрезано до 4:3, пересжато в JPEG",
    )
    c.attribution = get("Attribution") or make_attribution(c)
    return c


def write_credits(credits: list[Credit]) -> None:
    CREDITS_JSON.write_text(
        json.dumps({"source": "Wikimedia Commons", "images": [asdict(c) for c in credits]},
                   ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    CREDITS_MD.write_text(render_markdown(credits), encoding="utf-8")


def render_markdown(credits: list[Credit]) -> str:
    lines = [
        "# Авторство фотографий меню",
        "",
        "Фотографии в `assets/menu/` иллюстративные: это не фотографии блюд реального заведения.",
        "Все файлы взяты из Wikimedia Commons; лицензия каждого проверена скриптом",
        "`scripts/fetch_menu_photos.py` по метаданным Commons (допускаются CC0, Public domain, CC BY, CC BY-SA).",
        "Указание авторства доступно и в боте: «Меню кафе» → «📷 Авторы фотографий», а также в подписи к каждому фото.",
        "",
        "Для файлов под CC BY-SA производные версии (уменьшенные и обрезанные копии в этом проекте)",
        "распространяются на условиях той же лицензии.",
        "",
        "| Файл | Блюдо | Автор | Лицензия | Источник | Изменения |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for c in credits:
        lic = f"[{c.license}]({c.license_url})" if c.license_url else c.license
        author = c.author.replace("|", "/")
        lines.append(f"| `{c.file}` | {c.subject} | {author} | {lic} | [{c.original_file}]({c.source_page}) | {c.changes} |")
    lines += ["", "## Требуемая атрибуция", ""]
    lines += [f"- `{c.file}`: {c.attribution}" for c in credits]
    lines.append("")
    return "\n".join(lines)


def load_existing() -> dict[str, Credit]:
    if not CREDITS_JSON.is_file():
        return {}
    data = json.loads(CREDITS_JSON.read_text(encoding="utf-8"))
    return {e["file"]: Credit(**e) for e in data.get("images", [])}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", help="имя файла без расширения, например tea")
    ap.add_argument("--title", help="точное название файла Commons для --only")
    args = ap.parse_args()

    MENU_DIR.mkdir(parents=True, exist_ok=True)
    existing = load_existing()
    used = {f"File:{c.original_file}" for c in existing.values()}
    missing = []
    for file, (subject, titles, queries) in CANDIDATES.items():
        if args.only and file.removesuffix(".jpg") != args.only:
            continue
        dest = MENU_DIR / file
        if dest.is_file() and file in existing and not args.force and not args.title:
            print(f"= {file}: уже есть ({existing[file].license})")
            continue
        print(f"→ {file} ({subject})")
        found = choose(subject, [args.title] if args.title else titles, [] if args.title else queries,
                       used=used - ({f"File:{existing[file].original_file}"} if file in existing else set()))
        if not found:
            print(f"  ✘ подходящее фото не найдено для {file}")
            missing.append(file)
            continue
        page, info = found
        credit = credit_from(file, subject, page, info)
        print(f"  ✔ {credit.original_file} — {credit.author}, {credit.license}")
        if args.dry_run:
            continue
        optimize(download(info.get("thumburl") or info["url"]), dest)
        existing[file] = credit
        used.add(page["title"])
        print(f"  сохранено {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} КБ)")
        time.sleep(1)

    if not args.dry_run:
        ordered = [existing[f] for f in CANDIDATES if f in existing]
        write_credits(ordered)
        print(f"Записаны {CREDITS_JSON.relative_to(ROOT)} и {CREDITS_MD.relative_to(ROOT)}")
    if missing:
        print("Не хватает фото: " + ", ".join(missing))
        return 1
    print("Готово. Просмотрите фото глазами перед показом заказчику.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
