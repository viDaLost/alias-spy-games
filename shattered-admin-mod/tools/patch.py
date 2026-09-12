#!/usr/bin/env python3
"""Вносит хуки админ-панели в smali Shattered Pixel Dungeon."""
import io
import os
import re

ROOT = 'smali_out'
PKG = 'Lcom/shatteredpixel/shatteredpixeldungeon'
ADMIN = PKG + '/admin/AdminCore;'


def read(p):
    return io.open(os.path.join(ROOT, p), encoding='utf-8').read()


def write(p, s):
    io.open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(s)


def method_bounds(text, header):
    """Возвращает (начало тела, конец метода) для метода с данной сигнатурой."""
    i = text.index(header)
    body = text.index('\n', i) + 1
    end = text.index('.end method', body)
    return body, end


def insert_at_head(path, header, code, label):
    text = read(path)
    assert header in text, 'нет метода %s в %s' % (header, path)
    body, _end = method_bounds(text, header)
    rest = text[body:]
    m = re.match(r'((?:\s*\.(?:registers|locals|param|prologue|annotation[\s\S]*?\.end annotation)[^\n]*\n)+)', rest)
    off = body + (len(m.group(1)) if m else 0)
    write(path, text[:off] + code + text[off:])
    print('  + %s: %s' % (path, label))


def insert_before_return(path, header, code, label):
    """Вставляет код перед единственным выходом метода."""
    text = read(path)
    body, end = method_bounds(text, header)
    segment = text[body:end]
    assert segment.count('    return-void\n') == 1, 'ожидался один выход из %s' % header
    write(path, text[:body] + segment.replace('    return-void\n', code) + text[end:])
    print('  + %s: %s' % (path, label))


def replace_method(path, header, body, label):
    """Заменяет метод целиком - без недостижимого кода."""
    text = read(path)
    i = text.index(header)
    end = text.index('.end method', i) + len('.end method')
    write(path, text[:i] + body.strip('\n') + text[end:])
    print('  + %s: %s' % (path, label))


# --- 1. Бессмертие: Hero.damage() выходит сразу ---------------------------
insert_at_head(
    'com/shatteredpixel/shatteredpixeldungeon/actors/hero/Hero.smali',
    '.method public damage(ILjava/lang/Object;)V',
    '''
    sget-boolean v0, %s->invulnerable:Z

    if-eqz v0, :admin_damage_normal

    return-void

    :admin_damage_normal
''' % ADMIN,
    'бессмертие в damage()')

# --- 2. Бессмертие: Hero.die() поднимает героя вместо смерти --------------
insert_at_head(
    'com/shatteredpixel/shatteredpixeldungeon/actors/hero/Hero.smali',
    '.method public die(Ljava/lang/Object;)V',
    '''
    sget-boolean v0, %s->invulnerable:Z

    if-eqz v0, :admin_die_normal

    invoke-static {p0}, %s->godRevive(%s/actors/hero/Hero;)V

    return-void

    :admin_die_normal
''' % (ADMIN, ADMIN, PKG),
    'бессмертие в die()')

# --- 3. Жезлы не тратят заряды -------------------------------------------
insert_before_return(
    'com/shatteredpixel/shatteredpixeldungeon/items/wands/Wand.smali',
    '.method public wandUsed()V',
    '''    invoke-static {p0}, %s->refill(%s/items/wands/Wand;)V

    return-void
''' % (ADMIN, PKG),
    'вечные заряды жезлов')

# --- 4. Кнопка в игровом меню --------------------------------------------
path = 'com/shatteredpixel/shatteredpixeldungeon/windows/WndGame.smali'
text = read(path)
body, end = method_bounds(text, '.method public constructor <init>()V')
anchor = '    invoke-direct {p0, v0}, %s/windows/WndGame;->addButton(%s/ui/RedButton;)V\n' % (PKG, PKG)
i = text.index(anchor, body, end) + len(anchor)
button = '''
    new-instance v0, %s/admin/AdminButton;

    invoke-direct {v0, p0}, %s/admin/AdminButton;-><init>(%s/ui/Window;)V

    invoke-direct {p0, v0}, %s/windows/WndGame;->addButton(%s/ui/RedButton;)V

''' % (PKG, PKG, PKG, PKG, PKG)
write(path, text[:i] + button + text[i:])
print('  + %s: кнопка АДМИН-ПАНЕЛЬ в меню' % path)

# --- 5. Ярлык и автооткрытие, когда экран уровня готов -------------------
insert_at_head(
    'com/shatteredpixel/shatteredpixeldungeon/scenes/GameScene.smali',
    '.method public static ready()V',
    '''
    invoke-static {}, %s->onSceneReady()V
''' % ADMIN,
    'ярлык и показ панели на уровне')

# --- 6. Все классы героев открыты ----------------------------------------
replace_method(
    'com/shatteredpixel/shatteredpixeldungeon/actors/hero/HeroClass.smali',
    '.method public isUnlocked()Z',
    '''
.method public isUnlocked()Z
    .registers 2

    const/4 v0, 0x1

    return v0
.end method
''',
    'все классы героев открыты')

print('патчи внесены')
