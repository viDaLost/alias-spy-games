#!/usr/bin/env python3
"""Собирает иконки приложения из app-icon-source.png.

Исходник — квадратная картинка со скруглёнными углами на белом фоне.
Отсюда получаются:
  * mipmap-*/ic_launcher.png и ic_launcher_round.png — обычные иконки;
  * mipmap-*/ic_launcher_foreground.png и ic_launcher_background.png —
    слои адаптивной иконки, где рисунок занимает центральные 72 из 108 dp,
    а поля добираются продолжением краёв, чтобы маска лаунчера не обрезала лиру;
  * web/assets/icon.png — иконка для заставки и вкладки браузера.
"""

import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(HERE, '..', '..'))
RES = os.path.join(APP, 'android', 'app', 'src', 'main', 'res')
WEB_ICON = os.path.join(APP, 'web', 'assets', 'icon.png')
SOURCE = os.path.join(HERE, 'app-icon-source.png')

DENSITIES = [('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)]
CORNER_RATIO = 0.2          # скругление у самой картинки
INSET_RATIO = 0.06          # срез скруглённых углов перед растягиванием полей
# Маска лаунчера показывает центральные 72 из 108 dp. Рисунок берём крупнее
# безопасной зоны: по краям срезается только фон, а лира и ноты видны целиком.
SAFE_RATIO = 0.855


def content_box(image):
    """Границы самого рисунка: белые поля и мягкая тень вокруг отбрасываются."""
    saturation = image.convert('HSV').getchannel('S').point(lambda v: 255 if v > 40 else 0)
    box = saturation.getbbox()
    if box is None:
        return image.getbbox()
    return box


def rounded(image, radius_ratio=CORNER_RATIO):
    """Скругляет углы, делая всё за их пределами прозрачным."""
    size = image.size
    mask = Image.new('L', size, 0)
    radius = int(min(size) * radius_ratio)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    out = image.convert('RGBA')
    out.putalpha(ImageChops.multiply(out.getchannel('A'), mask))
    return out


def circled(image):
    size = image.size
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size[0] - 1, size[1] - 1], fill=255)
    out = image.convert('RGBA')
    out.putalpha(mask)
    return out


def with_bleed(image, canvas_size):
    """Вписывает рисунок в безопасную зону, а поля заполняет мягко размытой
    копией того же рисунка — маска лаунчера обрезает только фон."""
    inner = int(canvas_size * SAFE_RATIO)
    inner -= inner % 2
    pad = (canvas_size - inner) // 2
    art = image.resize((inner, inner), Image.LANCZOS)

    canvas = Image.new('RGB', (canvas_size, canvas_size))
    canvas.paste(art.crop((0, 0, inner, 2)).resize((inner, pad), Image.BILINEAR), (pad, 0))
    canvas.paste(art.crop((0, inner - 2, inner, inner)).resize((inner, pad), Image.BILINEAR),
                 (pad, pad + inner))
    canvas.paste(art.crop((0, 0, 2, inner)).resize((pad, inner), Image.BILINEAR), (0, pad))
    canvas.paste(art.crop((inner - 2, 0, inner, inner)).resize((pad, inner), Image.BILINEAR),
                 (pad + inner, pad))
    for corner, position in [
        ((0, 0, 2, 2), (0, 0)),
        ((inner - 2, 0, inner, 2), (pad + inner, 0)),
        ((0, inner - 2, 2, inner), (0, pad + inner)),
        ((inner - 2, inner - 2, inner, inner), (pad + inner, pad + inner)),
    ]:
        canvas.paste(art.crop(corner).resize((pad, pad), Image.BILINEAR), position)
    canvas = canvas.filter(ImageFilter.GaussianBlur(pad * 0.5))
    canvas.paste(art, (pad, pad))
    return canvas


def main():
    source = Image.open(SOURCE).convert('RGB')
    square = source.crop(content_box(source))
    side = min(square.size)
    square = square.crop((0, 0, side, side))

    # Срезаем скруглённые углы, чтобы белый фон не размазался по полям.
    inset = int(side * INSET_RATIO)
    art = square.crop((inset, inset, side - inset, side - inset))

    for density, factor in DENSITIES:
        directory = os.path.join(RES, f'mipmap-{density}')
        os.makedirs(directory, exist_ok=True)

        layer = int(108 * factor)
        adaptive = with_bleed(art, layer)
        adaptive.save(os.path.join(directory, 'ic_launcher_background.png'))
        Image.new('RGBA', (layer, layer), (0, 0, 0, 0)).save(
            os.path.join(directory, 'ic_launcher_foreground.png'))

        legacy = int(48 * factor)
        icon = square.resize((legacy, legacy), Image.LANCZOS)
        rounded(icon).save(os.path.join(directory, 'ic_launcher.png'))
        circled(icon).save(os.path.join(directory, 'ic_launcher_round.png'))
        print(f'mipmap-{density}: адаптивная {layer}px, обычная {legacy}px')

    rounded(square.resize((256, 256), Image.LANCZOS), 0.22).save(WEB_ICON)
    print('web/assets/icon.png готова')


if __name__ == '__main__':
    main()
