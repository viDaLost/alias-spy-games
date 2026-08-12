# Quartet Cloudflare backend

Realtime backend for the existing **Quartet** game. It replaces the Google Apps Script polling backend with Cloudflare Workers + one Durable Object per room + WebSocket Hibernation.

## Why this architecture

- every room is coordinated by one Durable Object, so moves are serialized server-side;
- game state is authoritative on the server and opponents' hands are never sent to other players;
- clients receive changes over WebSocket; native Android automatically uses a
  signed HTTPS polling channel when a carrier, VPN or Private DNS blocks WSS;
- SQLite-backed Durable Objects are used for new namespaces;
- Telegram `initData` is validated server-side before a Telegram identity is trusted;
- rooms expire automatically after inactivity.

## Required Cloudflare secrets

From this directory:

```bash
npm install
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put SESSION_SECRET
npm run deploy
```

`SESSION_SECRET` should be a long random string, for example 32+ random bytes encoded as hex/base64.

The default config allows the GitHub Pages origin `https://vidalost.github.io` and also permits browser guests. Change `ALLOW_GUESTS` to `false` if Quartet must only work from Telegram.

## After deployment

Wrangler prints a URL similar to:

```text
https://alias-spy-games-quartet.<your-workers-subdomain>.workers.dev
```

Put that exact base URL into the `quartet-backend` meta in `/index.html`.

## Endpoints

- `GET /health`
- `POST /rooms` — create room
- `POST /rooms/:code/join` — join/reconnect
- `GET /rooms/:code/ws?token=...` — realtime WebSocket
- `POST /rooms/:code/poll?token=...` — signed HTTPS state/action fallback

An empty polling body (`{}`) returns the player's private state. To perform an
action, send `{"requestId":"uuid","action":"startGame","payload":{}}`.
`requestId` makes a retried mobile request idempotent within the active room
instance.

After the WebSocket opens, client actions are JSON messages:

```json
{"type":"action","action":"startGame","payload":{}}
{"type":"action","action":"askCard","payload":{"targetId":"...","cardId":"..."}}
{"type":"action","action":"restartGame","payload":{}}
{"type":"action","action":"leave","payload":{}}
```
