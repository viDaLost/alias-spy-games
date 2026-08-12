from pathlib import Path
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/App.kt')
s = p.read_text()
old = '        accessError = null\n'
if old not in s:
    raise SystemExit('stale accessError assignment not found')
p.write_text(s.replace(old, '', 1))
print('Removed stale accessError assignment')
