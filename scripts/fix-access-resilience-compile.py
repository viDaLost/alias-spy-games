from pathlib import Path

app_path = Path('android-app/app/src/main/java/com/vidalost/biblegames/App.kt')
app = app_path.read_text()
old = '''                if (!banned && (firstVerification || wasBanned)) {\n                    syncing = true\n                    appScope.launch {\n'''
new = '''                if (!banned && (firstVerification || wasBanned)) {\n                    syncing = true\n                    launch {\n'''
if old not in app:
    raise SystemExit('access monitor appScope launch not found')
app_path.write_text(app.replace(old, new, 1))

core_path = Path('cloudflare/app-core-worker/src/index-v4.js')
core = core_path.read_text()
old = "    'Access-Control-Allow-Methods': 'POST,OPTIONS',\n"
new = "    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',\n"
if old not in core:
    raise SystemExit('CORS methods line not found')
core_path.write_text(core.replace(old, new, 1))

print('Tied profile refresh to access monitor and enabled GET CORS')
