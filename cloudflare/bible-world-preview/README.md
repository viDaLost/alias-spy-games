# Где я в Библии? — Cloudflare preview

Standalone, Russian-language mobile game with three spherical 360° scenes:
Babel, Solomon's temple, and Jesus teaching from a boat on the Sea of Galilee.
Guess the place, event, and biblical period. Each round offers up to 5,000 points;
the campaign offers 15,000. Hints cost 150 points each. The campaign record is
stored locally on the player's device, only after finishing all three rounds.

## Deploy

Cloudflare assets-only Worker: `alias-spy-games-bible-world-preview`.
The dedicated GitHub Actions workflow deploys pushes to `main` and
`feat/bible-world-cloudflare-preview` using the repository's existing Cloudflare
secrets. No main-game menu integration or other Worker changes are included.

```sh
npm ci
npm test
npm run check
npm run deploy
```

## Rendering and art

Self-hosted WebP assets and Onest fonts; no CDN, map service, or API key is
required by the game. The renderer uploads one panorama texture at a time,
renders on camera/size changes, caps GPU output to 1.8 million pixels, and has
a CPU spherical fallback. Portrait cameras use the short screen dimension for
field of view. A same-direction overlap softens the wrap seam without mirror
repetitions; AI scene geometry can still differ slightly at the join or poles.

The generated source panoramas are **1774 × 887** (2:1), encoded to WebP at
quality 98. They are not native 4K or 8K. Artificial upscaling is deliberately
not presented as extra captured detail. Assets are versioned in their names.
These are artistic reconstructions, not photographic or architectural evidence.
Approximate answer regions reflect uncertainty in the stories: 200 km for Babel,
70 km for Jerusalem, and 50 km for Galilee.

## Validation

Node tests cover all three scoring rules, region tolerance, hint limits, complete
campaign transitions, record timing, duplicate-submission prevention, image
switching, stale image callbacks, GPU texture reuse, and restart. Rendering is
also inspected with an offline projection using the same camera/seam math.
Real-browser layout and real-iPhone touch/WebGL behavior remain unverified in
this environment.
