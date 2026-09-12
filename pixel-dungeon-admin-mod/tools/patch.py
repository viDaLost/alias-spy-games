#!/usr/bin/env python3
"""Вносит хуки админ-панели в smali оригинальной игры."""
import io, os, re, sys

ROOT = 'smali_out'

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
    # пропускаем директивы .registers/.locals/.param/.prologue
    rest = text[body:]
    m = re.match(r'((?:\s*\.(?:registers|locals|param|prologue|annotation[\s\S]*?\.end annotation)[^\n]*\n)+)', rest)
    off = body + (len(m.group(1)) if m else 0)
    text = text[:off] + code + text[off:]
    write(path, text)
    print('  + %s: %s' % (path, label))

added = 0

# --- 1. Бессмертие: Hero.damage() выходит сразу ---------------------------
insert_at_head(
    'com/watabou/pixeldungeon/actors/hero/Hero.smali',
    '.method public damage(ILjava/lang/Object;)V',
    '''
    sget-boolean v0, Lcom/watabou/pixeldungeon/admin/AdminCore;->invulnerable:Z

    if-eqz v0, :admin_damage_normal

    return-void

    :admin_damage_normal
''',
    'бессмертие в damage()')

# --- 2. Бессмертие: Hero.die() поднимает героя вместо смерти --------------
insert_at_head(
    'com/watabou/pixeldungeon/actors/hero/Hero.smali',
    '.method public die(Ljava/lang/Object;)V',
    '''
    sget-boolean v0, Lcom/watabou/pixeldungeon/admin/AdminCore;->invulnerable:Z

    if-eqz v0, :admin_die_normal

    invoke-static {p0}, Lcom/watabou/pixeldungeon/admin/AdminCore;->godRevive(Lcom/watabou/pixeldungeon/actors/hero/Hero;)V

    return-void

    :admin_die_normal
''',
    'бессмертие в die()')

# --- 3. Кнопка в игровом меню --------------------------------------------
path = 'com/watabou/pixeldungeon/windows/WndGame.smali'
text = read(path)
body, end = method_bounds(text, '.method public constructor <init>()V')
anchor = '    invoke-direct {p0, v0}, Lcom/watabou/pixeldungeon/windows/WndGame;->addButton(Lcom/watabou/pixeldungeon/ui/RedButton;)V\n'
i = text.index(anchor, body, end) + len(anchor)
button = '''
    new-instance v0, Lcom/watabou/pixeldungeon/admin/AdminButton;

    invoke-direct {v0, p0}, Lcom/watabou/pixeldungeon/admin/AdminButton;-><init>(Lcom/watabou/pixeldungeon/ui/Window;)V

    invoke-direct {p0, v0}, Lcom/watabou/pixeldungeon/windows/WndGame;->addButton(Lcom/watabou/pixeldungeon/ui/RedButton;)V

'''
write(path, text[:i] + button + text[i:])
print('  + %s: кнопка АДМИН-ПАНЕЛЬ в меню' % path)

# --- 4. Автооткрытие при входе на уровень --------------------------------
path = 'com/watabou/pixeldungeon/scenes/GameScene.smali'
text = read(path)
body, end = method_bounds(text, '.method public create()V')
segment = text[body:end]
assert segment.count('    return-void\n') == 1, 'ожидался один выход из GameScene.create()'
hook = '''    invoke-static {}, Lcom/watabou/pixeldungeon/admin/AdminCore;->onLevelEntered()V

    return-void
'''
text = text[:body] + segment.replace('    return-void\n', hook) + text[end:]
write(path, text)
print('  + %s: показ панели при входе на уровень' % path)

# --- 5. Все герои разблокированы ----------------------------------------
path = 'com/watabou/pixeldungeon/scenes/StartScene.smali'
lines = read(path).split('\n')
target = [n for n, l in enumerate(lines)
          if 'huntressUnlocked:Z' in l and l.strip().startswith('iput-boolean')]
assert len(target) == 1, 'ожидалась одна запись huntressUnlocked'
n = target[0]
while not lines[n].strip().startswith('move-result'):
    n -= 1
    assert n > 0
lines[n] = '    const/4 v1, 0x1'
write(path, '\n'.join(lines))
print('  + %s: Охотница разблокирована сразу' % path)

print('патчи внесены')
