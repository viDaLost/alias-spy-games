#!/usr/bin/env python3
"""Сверяет ссылки нового кода с реальными членами классов оригинального dex."""
import os, re, sys

app_root, new_root = sys.argv[1], sys.argv[2]

classes = {}          # внутреннее имя -> {'super':..., 'fields':set, 'methods':set}

def load(root):
    for dirpath, _d, files in os.walk(root):
        for f in files:
            if not f.endswith('.smali'):
                continue
            path = os.path.join(dirpath, f)
            name, sup, fields, methods = None, None, set(), set()
            for line in open(path, encoding='utf-8', errors='replace'):
                s = line.strip()
                if s.startswith('.class '):
                    name = s.split()[-1][1:-1]
                elif s.startswith('.super '):
                    sup = s.split()[1][1:-1]
                elif s.startswith('.field '):
                    m = re.match(r'\.field\s+(?:[\w\-]+\s+)*([\w$\-]+):(\S+)', s)
                    if m:
                        fields.add(m.group(1) + ':' + m.group(2))
                elif s.startswith('.method '):
                    m = re.match(r'\.method\s+(?:[\w\-]+\s+)*(<init>|<clinit>|[\w$\-]+)\((.*?)\)(\S+)', s)
                    if m:
                        methods.add('%s(%s)%s' % (m.group(1), m.group(2), m.group(3)))
            if name:
                classes[name] = {'super': sup, 'fields': fields, 'methods': methods}

load(app_root)
load(new_root)

def has(cls, member, kind):
    seen = set()
    while cls and cls not in seen:
        seen.add(cls)
        c = classes.get(cls)
        if c is None:
            return None            # класс вне dex (java.*/android.*) - не проверяем
        if member in c[kind]:
            return True
        cls = c['super']
    return False

REF = re.compile(r'L([\w/$\-]+);->([\w$\-<>]+)(\((.*?)\)(\S+)|:(\S+))')

bad = []
checked = 0
for dirpath, _d, files in os.walk(new_root):
    for f in files:
        if not f.endswith('.smali'):
            continue
        for line in open(os.path.join(dirpath, f), encoding='utf-8', errors='replace'):
            for m in REF.finditer(line):
                cls, name = m.group(1), m.group(2)
                if not cls.startswith('com/watabou'):
                    continue
                if m.group(3):
                    member, kind = '%s(%s)%s' % (name, m.group(4), m.group(5)), 'methods'
                else:
                    member, kind = '%s:%s' % (name, m.group(6)), 'fields'
                checked += 1
                if has(cls, member, kind) is False:
                    bad.append('%s -> L%s;->%s' % (f, cls, member))

print('проверено ссылок: %d' % checked)
if bad:
    print('НЕ НАЙДЕНО (%d):' % len(set(bad)))
    for b in sorted(set(bad)):
        print('  ' + b)
    sys.exit(1)
print('все ссылки на классы игры разрешаются корректно')
