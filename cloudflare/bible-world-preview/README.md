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
renders on camera/size changes, supports Retina DPR up to 3 with a 3.2 million
pixel GPU budget, and has a CPU spherical fallback. The 72° default field of
view belongs to the longer screen dimension; zoom is limited to 48–84°. This
keeps a fullscreen portrait phone from becoming a 120° wide-angle lens.
Touch gestures stay within the panorama. A same-direction overlap softens the wrap seam without mirror
repetitions; AI scene geometry can still differ slightly at the join or poles.

The game loads complete **1774 × 887 lossless WebP** panoramas created from
whole-scene image generations. This is the maximum native size the image
generator returned in this environment. The renderer uses the device's Retina
pixel ratio (up to 3×, within a 3.2-megapixel GPU budget), while preserving the
source panorama's actual detail. The one-piece images remove seams caused by
mixing separate generated crops. See [art/README.md](art/README.md) for prompts,
source images, and reproduction. Assets are versioned in their names.
These are artistic reconstructions, not photographic or architectural evidence.
Approximate answer regions reflect uncertainty in the stories: 200 km for Babel,
70 km for Jerusalem, and 50 km for Galilee.

## Validation

Node tests cover all three scoring rules, region tolerance, hint limits, complete
campaign transitions, record timing, duplicate-submission prevention, image
switching, stale image callbacks, GPU texture reuse, restart, panorama image
dimensions, portrait projection, Retina resolution, drag/pinch limits and
Safari page-gesture prevention. Production GLSL is compiled and inspected
through an offscreen OpenGL ES render using the actual viewer shaders.
After deployment, the workflow fetches the public page, every module, all three
panoramas, and both fonts; it verifies HTTP 200 and exact SHA-256 file matches.
Real-browser layout and real-iPhone touch/WebGL behavior remain unverified in
this environment.
