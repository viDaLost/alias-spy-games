#!/usr/bin/env python3
"""Generate compilable Java API stubs from baksmali output.

The stubs are only ever used as a javac -classpath: they give the admin panel
sources the exact field/method signatures of the game's own classes so that the
dex references we emit resolve against the real implementations at runtime.
"""
import os, re, sys

SMALI_ROOT = sys.argv[1]
OUT_ROOT = sys.argv[2]
PREFIXES = ('com/watabou/',)

PRIM = {'V': 'void', 'Z': 'boolean', 'B': 'byte', 'S': 'short', 'C': 'char',
        'I': 'int', 'J': 'long', 'F': 'float', 'D': 'double'}

KEYWORDS = set("""abstract assert boolean break byte case catch char class const continue default do
double else enum extends final finally float for goto if implements import instanceof int interface
long native new package private protected public return short static strictfp super switch
synchronized this throw throws transient try void volatile while _""".split())


def collect(root):
    out = {}
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if not f.endswith('.smali'):
                continue
            p = os.path.join(dirpath, f)
            rel = os.path.relpath(p, root)[:-len('.smali')]
            if rel.replace(os.sep, '/').startswith(PREFIXES):
                out[rel.replace(os.sep, '/')] = p
    return out


class Cls:
    pass


def parse(path):
    c = Cls()
    c.mods, c.name, c.super, c.fields, c.methods = [], None, None, [], []
    skip_block = False
    with open(path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            s = line.strip()
            if skip_block:
                if s.startswith('.end annotation'):
                    skip_block = False
                continue
            if s.startswith('.annotation'):
                skip_block = True
                continue
            if s.startswith('.class '):
                parts = s.split()
                c.mods = parts[1:-1]
                c.name = parts[-1]
            elif s.startswith('.super '):
                c.super = s.split()[1]
            elif s.startswith('.field '):
                m = re.match(r'\.field\s+(.*?)([\w$\-]+):(\S+)', s)
                if m:
                    c.fields.append((m.group(1).split(), m.group(2), m.group(3)))
            elif s.startswith('.method '):
                m = re.match(r'\.method\s+(.*?)(<init>|<clinit>|[\w$\-]+)\((.*?)\)(\S+)', s)
                if m:
                    c.methods.append((m.group(1).split(), m.group(2), m.group(3), m.group(4)))
    return c


def split_params(desc):
    out, i = [], 0
    while i < len(desc):
        j = i
        while desc[j] == '[':
            j += 1
        if desc[j] == 'L':
            j = desc.index(';', j)
        out.append(desc[i:j + 1])
        i = j + 1
    return out


def jtype(desc, known):
    arr = 0
    while desc.startswith('['):
        arr += 1
        desc = desc[1:]
    if desc in PRIM:
        base = PRIM[desc]
    elif desc.startswith('L'):
        internal = desc[1:-1]
        if internal in known:
            base = internal.replace('/', '.')
        elif internal.startswith('java/'):
            base = internal.replace('/', '.').replace('$', '.')
        else:
            base = 'java.lang.Object'
    else:
        base = 'java.lang.Object'
    return base + '[]' * arr


def main():
    files = collect(SMALI_ROOT)
    known = set(files)
    made = 0
    for internal, path in sorted(files.items()):
        c = parse(path)
        if not c.name or 'synthetic' in c.mods or 'annotation' in c.mods:
            continue
        pkg, _, simple = internal.rpartition('/')
        pkg = pkg.replace('/', '.')
        is_iface = 'interface' in c.mods
        lines = ['package %s;' % pkg, '', '/** API stub generated from %s. */' % internal]
        head = 'public ' + ('interface ' if is_iface else 'class ') + simple
        if not is_iface and c.super:
            sup = c.super[1:-1]
            if sup in known:
                head += ' extends ' + sup.replace('/', '.')
        lines.append(head + ' {')

        seen_f = set()
        if not is_iface:
            for mods, name, desc in c.fields:
                if 'private' in mods or 'synthetic' in mods or name in KEYWORDS or name in seen_f:
                    continue
                seen_f.add(name)
                pre = 'public ' + ('static ' if 'static' in mods else '')
                lines.append('    %s%s %s;' % (pre, jtype(desc, known), name))

        seen_m = set()
        has_noarg_ctor = False
        for mods, name, params, ret in c.methods:
            if ('private' in mods or 'synthetic' in mods or 'bridge' in mods
                    or name == '<clinit>' or name in KEYWORDS):
                continue
            ptypes = [jtype(p, known) for p in split_params(params)]
            key = (name, tuple(ptypes))
            if key in seen_m:
                continue
            seen_m.add(key)
            args = ', '.join('%s a%d' % (t, i) for i, t in enumerate(ptypes))
            if name == '<init>':
                if is_iface:
                    continue
                has_noarg_ctor = has_noarg_ctor or not ptypes
                lines.append('    public %s(%s) { }' % (simple, args))
            elif is_iface:
                lines.append('    %s %s(%s);' % (jtype(ret, known), name, args))
            else:
                rt = jtype(ret, known)
                body = ' { throw new RuntimeException("stub"); }' if rt != 'void' else ' { }'
                pre = 'public ' + ('static ' if 'static' in mods else '')
                lines.append('    %s%s %s(%s)%s' % (pre, rt, name, args, body))

        if not is_iface and not has_noarg_ctor:
            lines.append('    public %s() { }' % simple)
        lines.append('}')

        d = os.path.join(OUT_ROOT, pkg.replace('.', os.sep))
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, simple + '.java'), 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(lines) + '\n')
        made += 1
    print('generated %d stubs' % made)


main()
