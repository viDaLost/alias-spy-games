from pathlib import Path

# The deployed v3 worker inherits WebSocket handling from index.js through index-v2.js.
# Keep ping heartbeats fresh in the base class, then filter stale sockets in v2 liveSnapshot.
base = Path('cloudflare/app-observability-worker/src/index.js')
base_text = base.read_text()
old = """    if (payload?.type === 'ping') {
      try { webSocket.send(JSON.stringify({ type: 'pong', at: Date.now() })); } catch {}
      return;
    }
"""
new = """    if (payload?.type === 'ping') {
      const attachment = webSocket.deserializeAttachment() || {};
      attachment.updatedAt = Date.now();
      webSocket.serializeAttachment(attachment);
      try { webSocket.send(JSON.stringify({ type: 'pong', at: attachment.updatedAt })); } catch {}
      return;
    }
"""
assert old in base_text
base.write_text(base_text.replace(old, new, 1))

v2 = Path('cloudflare/app-observability-worker/src/index-v2.js')
s = v2.read_text()
old = "const encoder = new TextEncoder();\n"
new = "const encoder = new TextEncoder();\nconst PRESENCE_STALE_MS = 90_000;\n"
assert old in s and 'PRESENCE_STALE_MS' not in s
s = s.replace(old, new, 1)

old = """  liveSnapshot() {
    const sessions = new Map();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      const sid = sanitizeSessionId(attachment.sid);
      if (!sid) continue;
      const current = normalizeAttachment(attachment);
      const previous = sessions.get(sid);
"""
new = """  liveSnapshot() {
    const sessions = new Map();
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      const sid = sanitizeSessionId(attachment.sid);
      if (!sid) continue;
      const current = normalizeAttachment(attachment);
      const updatedAt = Number(current.updatedAt || 0);
      if (!updatedAt || now - updatedAt > PRESENCE_STALE_MS) {
        try { socket.close(1001, 'stale presence'); } catch {}
        continue;
      }
      const previous = sessions.get(sid);
"""
assert old in s
v2.write_text(s.replace(old, new, 1))
