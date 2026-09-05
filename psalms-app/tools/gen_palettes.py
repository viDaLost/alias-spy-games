"""Собирает палитры оформления: каждая тема — один тон и его оттенки.

Запуск без аргументов печатает CSS, с ключом --apply — вписывает его
в web/styles/app.css между заголовком «Палитры» и разделом «База».
"""

import colorsys
import os
import sys


def hexc(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)
    return '#{:02x}{:02x}{:02x}'.format(round(r * 255), round(g * 255), round(b * 255))


# hue, saturation базового тона, светлая ли тема
THEMES = [
    ('lavender', 'Лаванда', 252, 62, False),
    ('olive',    'Олива',    82, 40, False),
    ('ocean',    'Море',    198, 52, False),
    ('chocolate','Шоколад',  28, 46, True),
    ('dark',     'Тёмная',  230, 30, True),
]

# Семь ступеней для обложек сборников: тон расходится веером, светлота чередуется,
# чтобы соседние карточки отличались и в цвете, и в глубине.
HUE_SHIFTS = [-12, -4, 4, 12, -8, 0, 8]
LIGHT_STEPS = [38, 45, 33, 48, 35, 42, 30]
LIGHT_SOFT = [92, 89, 94, 87, 91, 90, 95]
DARK_STEPS = [70, 77, 64, 81, 67, 74, 60]
DARK_SOFT = [22, 26, 19, 28, 21, 24, 18]


def light_theme(hue, sat):
    return {
        'bg': hexc(hue, min(sat, 40), 97),
        'surface': hexc(hue, min(sat, 30), 99.5),
        'surface-2': hexc(hue, min(sat, 34), 92),
        'surface-hover': hexc(hue, min(sat, 30), 95),
        'border': f'{hexc(hue, 22, 30)}1c',
        'border-strong': f'{hexc(hue, 22, 30)}33',
        'text': hexc(hue, 26, 12),
        'text-2': hexc(hue, 14, 40),
        'text-3': hexc(hue, 12, 58),
        'accent': hexc(hue, min(sat, 52), 44),
        'accent-soft': f'{hexc(hue, min(sat, 52), 44)}1f',
        'accent-on': '#ffffff',
        'mark': f'{hexc(hue, sat, 42)}2b',
        'scrim': f'{hexc(hue, 20, 10)}61',
        'shadow-1': f'0 1px 2px {hexc(hue, 20, 12)}0f',
        'shadow-2': f'0 4px 18px {hexc(hue, 20, 12)}1a',
        'shadow-3': f'0 -6px 32px {hexc(hue, 20, 12)}2e',
    }


def dark_theme(hue, sat):
    return {
        'bg': hexc(hue, min(sat, 22), 8),
        'surface': hexc(hue, min(sat, 20), 12),
        'surface-2': hexc(hue, min(sat, 18), 17),
        'surface-hover': hexc(hue, min(sat, 18), 14),
        'border': '#ffffff1a',
        'border-strong': '#ffffff33',
        'text': hexc(hue, 14, 93),
        'text-2': hexc(hue, 10, 68),
        'text-3': hexc(hue, 8, 48),
        'accent': hexc(hue, min(sat + 10, 70), 72),
        'accent-soft': f'{hexc(hue, sat, 72)}29',
        'accent-on': hexc(hue, 20, 10),
        'mark': f'{hexc(hue, sat, 72)}3d',
        'scrim': '#00000094',
        'shadow-1': '0 1px 2px #00000066',
        'shadow-2': '0 4px 18px #00000073',
        'shadow-3': '0 -6px 32px #0000008c',
    }


def tints(hue, sat, is_dark):
    steps = DARK_STEPS if is_dark else LIGHT_STEPS
    softs = DARK_SOFT if is_dark else LIGHT_SOFT
    cover_sat = min(sat, 48) if not is_dark else min(sat + 8, 58)
    out = []
    for index in range(7):
        tone = (hue + HUE_SHIFTS[index]) % 360
        out.append((
            f'--tint-{index + 1}: {hexc(tone, cover_sat, steps[index])};',
            f'--tint-soft-{index + 1}: {hexc(tone, min(sat, 40), softs[index])};',
        ))
    return out


def block(selector, name, hue, sat, is_dark):
    colors = dark_theme(hue, sat) if is_dark else light_theme(hue, sat)
    lines = [f'/* {name} */', f'{selector} {{']
    for key, value in colors.items():
        lines.append(f'  --{key}: {value};')
    lines.append(f'  --tint-alpha: {".16" if is_dark else ".1"};')
    lines.append(f'  --cover-ink: {"#12100e" if is_dark else "#ffffff"};')
    for tint, soft in tints(hue, sat, is_dark):
        lines.append(f'  {tint}')
        lines.append(f'  {soft}')
    lines.append('}')
    return '\n'.join(lines)


def build():
    parts = []
    for key, name, hue, sat, is_dark in THEMES:
        selector = f":root,\n[data-theme='{key}']" if key == 'lavender' else f"[data-theme='{key}']"
        parts.append(block(selector, name, hue, sat, is_dark))

    # «как в системе» повторяет тёмную, когда система просит тёмное оформление
    dark_body = block("[data-theme='auto']", 'Как в системе — тёмный вариант', 230, 30, True)
    indented = '\n'.join('  ' + line for line in dark_body.split('\n'))
    parts.append('@media (prefers-color-scheme: dark) {\n' + indented + '\n}')
    return '\n\n'.join(parts)


def apply_to_stylesheet(css):
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.normpath(os.path.join(here, '..', 'web', 'styles', 'app.css'))
    text = open(path, encoding='utf-8').read()
    start = text.index('/* Каждое оформление построено')
    start = text.index('\n\n', start) + 2
    end = text.index('/* --- База ---')
    open(path, 'w', encoding='utf-8').write(text[:start] + css + '\n\n' + text[end:])
    print('Палитры записаны в', path)


if __name__ == '__main__':
    generated = build()
    if '--apply' in sys.argv:
        apply_to_stylesheet(generated)
    else:
        print(generated)
