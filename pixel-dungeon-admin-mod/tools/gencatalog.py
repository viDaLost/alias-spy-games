#!/usr/bin/env python3
"""Собирает каталог админ-панели из всех предметов, какие есть в игре.

Проходит по дизассемблированному коду, находит каждого потомка Item, который
можно создать без аргументов, и раскладывает их по категориям. Базовые классы
(те, у кого есть наследники) и абстрактные отбрасываются.
"""
import os
import re
import sys

SMALI_ROOT = sys.argv[1]
OUT = sys.argv[2]

ITEM = 'com/watabou/pixeldungeon/items/Item'

# Служебные основания иерархии: сами по себе предметами не являются.
# Наследование тут не показатель - PotionOfMight, например, наследует
# вполне настоящее зелье силы.
BASES = {
    'com/watabou/pixeldungeon/items/Item',
    'com/watabou/pixeldungeon/items/EquipableItem',
    'com/watabou/pixeldungeon/items/KindOfWeapon',
    'com/watabou/pixeldungeon/items/bags/Bag',
    'com/watabou/pixeldungeon/items/weapon/Weapon',
    'com/watabou/pixeldungeon/items/weapon/melee/MeleeWeapon',
    'com/watabou/pixeldungeon/items/weapon/missiles/MissileWeapon',
    'com/watabou/pixeldungeon/items/armor/Armor',
    'com/watabou/pixeldungeon/items/armor/ClassArmor',
    'com/watabou/pixeldungeon/items/wands/Wand',
    'com/watabou/pixeldungeon/items/rings/Ring',
    'com/watabou/pixeldungeon/items/potions/Potion',
    'com/watabou/pixeldungeon/items/scrolls/Scroll',
    'com/watabou/pixeldungeon/items/scrolls/InventoryScroll',
    'com/watabou/pixeldungeon/items/food/Food',
    'com/watabou/pixeldungeon/items/keys/Key',
    'com/watabou/pixeldungeon/plants/Plant$Seed',
}

# Категория определяется пакетом; порядок здесь же задаёт порядок в панели.
CATEGORIES = [
    ('ОРУЖИЕ',      'com/watabou/pixeldungeon/items/weapon/melee/'),
    ('МЕТАТЕЛЬНОЕ', 'com/watabou/pixeldungeon/items/weapon/missiles/'),
    ('БРОНЯ',       'com/watabou/pixeldungeon/items/armor/'),
    ('ЖЕЗЛЫ',       'com/watabou/pixeldungeon/items/wands/'),
    ('КОЛЬЦА',      'com/watabou/pixeldungeon/items/rings/'),
    ('ЗЕЛЬЯ',       'com/watabou/pixeldungeon/items/potions/'),
    ('СВИТКИ',      'com/watabou/pixeldungeon/items/scrolls/'),
    ('СЕМЕНА',      'com/watabou/pixeldungeon/plants/'),
    ('ЕДА',         'com/watabou/pixeldungeon/items/food/'),
    ('КЛЮЧИ',       'com/watabou/pixeldungeon/items/keys/'),
    ('КВЕСТОВЫЕ',   'com/watabou/pixeldungeon/items/quest/'),
    ('СУМКИ',       'com/watabou/pixeldungeon/items/bags/'),
    ('ПРОЧЕЕ',      'com/watabou/pixeldungeon/items/'),
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
    )

    buckets = [(title, []) for title, _prefix in CATEGORIES]
    for name in usable:
        for i, (_title, prefix) in enumerate(CATEGORIES):
            if name.startswith(prefix):
                buckets[i][1].append(name.replace('/', '.'))
                break

    buckets = [(t, names) for t, names in buckets if names]

    lines = [
        'package com.watabou.pixeldungeon.admin;',
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
        print('  %-14s %d' % (title, len(names)))


main()
