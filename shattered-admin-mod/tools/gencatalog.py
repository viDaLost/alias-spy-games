#!/usr/bin/env python3
"""Собирает каталог админ-панели из всех предметов Shattered Pixel Dungeon.

Проходит по дизассемблированному коду, находит каждого потомка Item, который
можно создать без аргументов, и раскладывает по категориям.
"""
import os
import re
import sys

SMALI_ROOT = sys.argv[1]
OUT = sys.argv[2]

PKG = 'com/shatteredpixel/shatteredpixeldungeon/'
ITEM = PKG + 'items/Item'

# Служебные основания иерархии: сами по себе предметами не являются.
# Наследование тут не критерий - ExoticPotion, например, наследует
# вполне настоящее зелье.
BASES = {
    PKG + 'items/Item',
    PKG + 'items/EquipableItem',
    PKG + 'items/KindOfWeapon',
    PKG + 'items/KindofMisc',
    PKG + 'items/bags/Bag',
    PKG + 'items/weapon/Weapon',
    PKG + 'items/weapon/melee/MeleeWeapon',
    PKG + 'items/weapon/missiles/MissileWeapon',
    PKG + 'items/weapon/missiles/darts/Dart',
    PKG + 'items/armor/Armor',
    PKG + 'items/armor/ClassArmor',
    PKG + 'items/wands/Wand',
    PKG + 'items/rings/Ring',
    PKG + 'items/artifacts/Artifact',
    PKG + 'items/potions/Potion',
    PKG + 'items/potions/exotic/ExoticPotion',
    PKG + 'items/potions/brews/Brew',
    PKG + 'items/potions/elixirs/Elixir',
    PKG + 'items/scrolls/Scroll',
    PKG + 'items/scrolls/InventoryScroll',
    PKG + 'items/scrolls/exotic/ExoticScroll',
    PKG + 'items/food/Food',
    PKG + 'items/keys/Key',
    PKG + 'items/spells/Spell',
    PKG + 'items/spells/InventorySpell',
    PKG + 'items/stones/Runestone',
    PKG + 'items/stones/InventoryStone',
    PKG + 'items/trinkets/Trinket',
    PKG + 'items/remains/RemainsItem',
    PKG + 'items/journal/DocumentPage',
    PKG + 'plants/Plant$Seed',
}

# Категория определяется пакетом; порядок задаёт порядок кнопок в панели.
CATEGORIES = [
    ('ОРУЖИЕ',      [PKG + 'items/weapon/melee/']),
    ('МЕТАНИЕ',     [PKG + 'items/weapon/missiles/']),
    ('БРОНЯ',       [PKG + 'items/armor/']),
    ('ЖЕЗЛЫ',       [PKG + 'items/wands/']),
    ('КОЛЬЦА',      [PKG + 'items/rings/']),
    ('АРТЕФАКТЫ',   [PKG + 'items/artifacts/']),
    ('ЗЕЛЬЯ',       [PKG + 'items/potions/']),
    ('СВИТКИ',      [PKG + 'items/scrolls/']),
    ('ЧАРЫ',        [PKG + 'items/spells/']),
    ('РУНЫ',        [PKG + 'items/stones/']),
    ('ТАЛИСМАНЫ',   [PKG + 'items/trinkets/']),
    ('БОМБЫ',       [PKG + 'items/bombs/']),
    ('СЕМЕНА',      [PKG + 'plants/']),
    ('ЕДА',         [PKG + 'items/food/']),
    ('КВЕСТОВЫЕ', [PKG + 'items/keys/', PKG + 'items/quest/',
                       PKG + 'items/remains/', PKG + 'items/journal/']),
    ('СУМКИ',       [PKG + 'items/bags/']),
    ('ПРОЧЕЕ',      [PKG + 'items/']),
]


def scan():
    classes = {}
    for dirpath, _dirs, files in os.walk(SMALI_ROOT):
        for f in files:
            if not f.endswith('.smali'):
                continue
            name, sup, mods, ctor = None, None, [], False
            for line in open(os.path.join(dirpath, f), encoding='utf-8', errors='replace'):
                s = line.strip()
                if s.startswith('.class '):
                    parts = s.split()
                    mods, name = parts[1:-1], parts[-1][1:-1]
                elif s.startswith('.super '):
                    sup = s.split()[1][1:-1]
                elif re.match(r'\.method public constructor <init>\(\)V', s):
                    ctor = True
            if name:
                classes[name] = {'super': sup, 'mods': mods, 'ctor': ctor}
    return classes


def main():
    classes = scan()

    def is_item(name):
        seen = set()
        while name and name not in seen:
            if name == ITEM:
                return True
            seen.add(name)
            entry = classes.get(name)
            if entry is None:
                return False
            name = entry['super']
        return False

    usable = sorted(
        n for n, c in classes.items()
        if is_item(n)
        and n not in BASES
        and c['ctor']
        and 'abstract' not in c['mods']
        and 'synthetic' not in c['mods']
        and not re.search(r'\$\d+$', n)          # анонимные классы - не предметы
        and not n.endswith('$PlaceHolder')        # рамки для журнала, не вещи
    )

    buckets = [(title, []) for title, _prefixes in CATEGORIES]
    for name in usable:
        for i, (_title, prefixes) in enumerate(CATEGORIES):
            if any(name.startswith(p) for p in prefixes):
                buckets[i][1].append(name.replace('/', '.'))
                break

    buckets = [(t, names) for t, names in buckets if names]

    lines = [
        'package com.shatteredpixel.shatteredpixeldungeon.admin;',
        '',
        '/**',
        ' * Каталог всех предметов игры. Файл собирается скриптом build/gencatalog.py',
        ' * по дизассемблированному коду, поэтому в списке оказывается каждый предмет,',
        ' * который игра вообще умеет создавать.',
        ' */',
        'final class AdminCatalog {',
        '',
        '\tstatic final String[] CATEGORIES = {',
    ]
    lines.append('\t\t' + ', '.join('"%s"' % t for t, _ in buckets))
    lines += ['\t};', '']

    for i, (title, names) in enumerate(buckets):
        lines.append('\tprivate static final String[] C%d = {   // %s' % (i, title))
        for name in names:
            lines.append('\t\t"%s",' % name)
        lines += ['\t};', '']

    lines.append('\tprivate static final String[][] ALL = {')
    lines.append('\t\t' + ', '.join('C%d' % i for i in range(len(buckets))))
    lines += [
        '\t};',
        '',
        '\tprivate AdminCatalog() {',
        '\t}',
        '',
        '\tstatic String[] items( int category ) {',
        '\t\treturn ALL[category];',
        '\t}',
        '}',
        '',
    ]

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))

    total = sum(len(n) for _t, n in buckets)
    print('предметов в каталоге: %d, категорий: %d' % (total, len(buckets)))
    for title, names in buckets:
        print('  %-16s %d' % (title, len(names)))


main()
