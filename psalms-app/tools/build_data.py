#!/usr/bin/env python3
"""Собирает JSON-данные приложения из исходной базы сборников.

Источник — Base_psal.db из оригинального приложения: одна таблица Psalmi,
где для каждого сборника есть колонка с текстом и колонка «_2» с заголовком.
Номер песни равен rowid, строки в таблице идут подряд без пропусков.

На выходе:
  web/data/index.json       — метаданные сборников и заголовки (быстрый старт)
  web/data/songs-<id>.json  — тексты песен сборника, разобранные на блоки
"""

import json
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, 'Base_psal.db')
OUT_DIR = os.path.normpath(os.path.join(HERE, '..', 'web', 'data'))

COLLECTIONS = [
    {'id': 'unost', 'column': 'Unost', 'title': 'Юность', 'prefix': 'П',
     'subtitle': 'Песнь возрождения', 'accent': 'amber'},
    {'id': 'gorlica', 'column': 'Gorlica', 'title': 'Горлица', 'prefix': 'Г',
     'subtitle': 'Сборник духовных песен', 'accent': 'rose'},
    {'id': 'sion', 'column': 'Sion', 'title': 'Сион', 'prefix': 'С',
     'subtitle': 'Песни хвалы и поклонения', 'accent': 'indigo'},
    {'id': 'poems', 'column': 'My poem', 'title': 'Мои стихи', 'prefix': 'М',
     'subtitle': 'Избранное и авторское', 'accent': 'teal'},
]

CHORUS_RE = re.compile(r'^\s*(?:припев|прип|пр)\s*[.:]+\s*', re.I)
VERSE_RE = re.compile(r'^\s*(\d{1,2})\s*[.)]\s*')
TITLE_RE = re.compile(r'^\s*[А-ЯA-Z]?\s*(\d+)\s*[.)]?\s*')
ALT_RE = re.compile(r'^\s*\((\d+)\)\s*')


def clean_line(line):
    line = line.replace(' ', ' ').replace('\t', ' ')
    line = re.sub(r'[ ]{2,}', ' ', line)
    return line.strip()


def parse_title(raw, number):
    """«П500.  Я так хочу…» → ('Я так хочу…', None); «М20. (124) Текст» → ('Текст', 124)."""
    if not raw:
        return '', None
    text = clean_line(raw)
    text = TITLE_RE.sub('', text, count=1)
    alt = None
    match = ALT_RE.match(text)
    if match:
        alt = int(match.group(1))
        text = ALT_RE.sub('', text, count=1)
    text = text.strip(' .;-–—')
    return text, alt


def parse_body(raw):
    """Разбирает текст песни на блоки: куплеты, припевы и прочие строфы."""
    if not raw:
        return []
    text = raw.replace('\r\n', '\n').replace('\r', '\n')
    chunks = re.split(r'\n\s*\n+', text)
    blocks = []
    for chunk in chunks:
        lines = [clean_line(line) for line in chunk.split('\n')]
        lines = [line for line in lines if line]
        if not lines:
            continue
        kind = 'stanza'
        label = None
        first = lines[0]
        if CHORUS_RE.match(first):
            kind = 'chorus'
            stripped = CHORUS_RE.sub('', first).strip()
            lines = [stripped] + lines[1:] if stripped else lines[1:]
        else:
            match = VERSE_RE.match(first)
            if match:
                kind = 'verse'
                label = match.group(1)
                stripped = VERSE_RE.sub('', first).strip()
                lines = [stripped] + lines[1:] if stripped else lines[1:]
        lines = [line for line in lines if line]
        if not lines:
            continue
        blocks.append({'k': kind, 'n': label, 'l': lines})

    # Куплеты без пустых строк между ними: делим по маркерам «2.», «3.» внутри блока.
    if len(blocks) == 1 and blocks[0]['k'] in ('verse', 'stanza'):
        blocks = split_inline_verses(blocks[0])
    return blocks


def split_inline_verses(block):
    """Если вся песня пришла одним блоком, режет её по номерам куплетов."""
    out = []
    current = {'k': block['k'], 'n': block['n'], 'l': []}
    for line in block['l']:
        match = VERSE_RE.match(line)
        chorus = CHORUS_RE.match(line)
        if (match or chorus) and current['l']:
            out.append(current)
            if chorus:
                rest = CHORUS_RE.sub('', line).strip()
                current = {'k': 'chorus', 'n': None, 'l': [rest] if rest else []}
            else:
                rest = VERSE_RE.sub('', line).strip()
                current = {'k': 'verse', 'n': match.group(1), 'l': [rest] if rest else []}
            continue
        current['l'].append(line)
    if current['l']:
        out.append(current)
    return out or [block]


def first_line(blocks, skip=None):
    """Первая содержательная строка; строку, повторяющую заголовок, пропускаем."""
    normal = normalize(skip) if skip else None
    fallback = ''
    for block in blocks:
        for line in block['l']:
            if not line:
                continue
            if not fallback:
                fallback = line
            if normal and normalize(line).startswith(normal):
                continue
            return line
    return fallback


def normalize(value):
    return re.sub(r'[^\w\s]', '', value.lower().replace('ё', 'е')).strip()


def build():
    if not os.path.exists(DB_PATH):
        sys.exit(f'Не найдена база: {DB_PATH}')
    connection = sqlite3.connect(DB_PATH)
    cursor = connection.cursor()
    os.makedirs(OUT_DIR, exist_ok=True)

    index = {'collections': [], 'songs': []}
    total = 0

    for meta in COLLECTIONS:
        column = meta['column']
        rows = cursor.execute(
            f'SELECT rowid, [{column}], [{column}_2] FROM Psalmi ORDER BY rowid'
        ).fetchall()
        songs = []
        for number, body_raw, title_raw in rows:
            has_body = bool(body_raw and body_raw.strip())
            has_title = bool(title_raw and title_raw.strip())
            if not has_body and not has_title:
                continue
            blocks = parse_body(body_raw)
            title, alt = parse_title(title_raw, number)
            if not title:
                title = re.sub(r'[,;:.]?\s*$', '', first_line(blocks))[:60]
            preview = first_line(blocks, title)
            songs.append({
                'n': number,
                't': title,
                'a': alt,
                'p': preview,
                'b': blocks,
            })

        collection_out = {
            'id': meta['id'],
            'title': meta['title'],
            'songs': [{'n': s['n'], 't': s['t'], 'a': s['a'], 'b': s['b']}
                      for s in songs],
        }
        path = os.path.join(OUT_DIR, f'songs-{meta["id"]}.json')
        with open(path, 'w', encoding='utf-8') as handle:
            json.dump(collection_out, handle, ensure_ascii=False, separators=(',', ':'))

        index['collections'].append({
            'id': meta['id'],
            'title': meta['title'],
            'subtitle': meta['subtitle'],
            'prefix': meta['prefix'],
            'accent': meta['accent'],
            'count': len(songs),
        })
        index['songs'].append({
            'c': meta['id'],
            'items': [[s['n'], s['t'], s['p']] for s in songs],
        })
        total += len(songs)
        print(f'{meta["title"]:>10}: {len(songs):>4} песен → {os.path.basename(path)}'
              f' ({os.path.getsize(path)/1024:.0f} КБ)')

    index_path = os.path.join(OUT_DIR, 'index.json')
    with open(index_path, 'w', encoding='utf-8') as handle:
        json.dump(index, handle, ensure_ascii=False, separators=(',', ':'))
    print(f'{"Итого":>10}: {total} песен, индекс {os.path.getsize(index_path)/1024:.0f} КБ')


if __name__ == '__main__':
    build()
