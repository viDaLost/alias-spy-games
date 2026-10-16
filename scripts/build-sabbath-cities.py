"""Compact a GeoNames cities1000.txt extract for private, offline city search.

Usage: python scripts/build-sabbath-cities.py cities1000.txt 2026-10-16
Source and license: https://download.geonames.org/export/dump/ (CC BY 4.0).
"""
import json
import re
import sys
import unicodedata
from pathlib import Path


def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower().replace('ё', 'е'))
                   if unicodedata.category(c) != 'Mn')


rows, zones, zone_ids = [], [], {}
for line in Path(sys.argv[1]).read_text().splitlines():
    fields = line.split('\t')
    name, ascii_name, aliases = fields[1:4]
    zone = fields[17]
    if not zone:
        continue
    if zone not in zone_ids:
        zone_ids[zone] = len(zones)
        zones.append(zone)
    names = [name, ascii_name]
    alternate = aliases.split(',')
    names.extend([n for n in alternate if re.search('[А-Яа-яІіЇїЄєҐґ]', n)][:4])
    seen = set()
    for candidate in alternate:
        if len(candidate) > 70:
            continue
        scripts = {unicodedata.name(c, '').split()[0] for c in candidate if c.isalpha()}
        if not scripts or scripts.issubset(seen):
            continue
        if scripts == {'LATIN'} and len(names) > 6:
            continue
        names.append(candidate)
        seen |= scripts
    search = '|'.join(dict.fromkeys(normalize(n) for n in names if n))
    display = name
    if fields[8] in ('RU', 'BY', 'UA'):
        display = next((n for n in names if re.fullmatch('[А-Яа-яЁёІіЇїЄєҐґьъЬЪ -]+', n)), name)
    row = [display, search, fields[8], round(float(fields[4]), 5),
           round(float(fields[5]), 5), zone_ids[zone]]
    rows.append((int(fields[14] or 0), row))
rows.sort(key=lambda item: (-item[0], item[1][0]))
data = dict(version=1, source='GeoNames cities1000, ' + sys.argv[2],
            license='CC BY 4.0', zones=zones, cities=[item[1] for item in rows])
output = Path(__file__).resolve().parent.parent / 'web/data/sabbath-cities.json'
output.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'{len(rows)} cities, {len(zones)} time zones, {output.stat().st_size} bytes')
