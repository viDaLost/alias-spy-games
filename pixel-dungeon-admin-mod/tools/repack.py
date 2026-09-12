#!/usr/bin/env python3
"""Пересобирает APK с новым classes.dex, сохраняя способ хранения записей
и выравнивая несжатые записи по 4 байта (как zipalign)."""
import shutil, sys, zipfile

src, dst, dex = sys.argv[1], sys.argv[2], sys.argv[3]
new_dex = open(dex, 'rb').read()

SKIP = ('META-INF/MANIFEST.MF', 'META-INF/CERT.SF', 'META-INF/CERT.RSA')

zin = zipfile.ZipFile(src, 'r')
zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)

aligned = 0
for item in zin.infolist():
    if item.filename in SKIP or item.filename.upper().startswith('META-INF/') and \
            item.filename.upper().endswith(('.SF', '.RSA', '.DSA', '.EC')):
        continue

    data = new_dex if item.filename == 'classes.dex' else zin.read(item.filename)

    out = zipfile.ZipInfo(item.filename, date_time=item.date_time)
    out.compress_type = item.compress_type
    out.external_attr = item.external_attr
    out.internal_attr = item.internal_attr
    out.create_system = item.create_system

    if out.compress_type == zipfile.ZIP_STORED:
        # данные должны начинаться с адреса, кратного 4
        offset = zout.fp.tell() + 30 + len(out.filename.encode('utf-8'))
        pad = -offset % 4
        if pad:
            out.extra = b'\x00' * pad
            aligned += 1

    zout.writestr(out, data)

zout.close()
zin.close()
print('записей выровнено: %d' % aligned)
