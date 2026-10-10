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
The workflow rebuilds the three lossless 4K textures from the committed source
directions before testing and deploying; the large generated textures are not
stored twice in Git.

```sh
npm ci
npm install --no-save --package-lock=false sharp@0.35.4
node art/build-4k.mjs prepare babel temple galilee
node art/build-4k.mjs build babel temple galilee
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
Touch gestures stay within the panorama. The game loads three **4096 × 2048
lossless WebP** panoramas. Six overlapping 104° directions per scene were
generatively detailed at native 1254 × 1254, then projected into each 4K sphere.
The assembler keeps broad geometry from the original 1774 × 887 scenes,
attenuates detail where generated shapes drift, and blends spherical overlaps.
The wrap is baked into each texture; the renderer samples it directly without
applying the old seam crop again. This is a generatively enhanced 4K assembly,
not a single native 4K whole-scene generation. AI geometry can still differ
slightly at the join or poles. See [art/README.md](art/README.md) for exact prompts,
source directions, and reproduction. Assets are versioned in their names.
GPUs supporting 4096-pixel textures receive the full texture; devices with a
smaller maximum texture size use a proportional reduction. The CPU fallback
also reduces texture and framebuffer size for devices without WebGL.
These are artistic reconstructions, not photographic or architectural evidence.
Approximate answer regions reflect uncertainty in the stories: 200 km for Babel,
70 km for Jerusalem, and 50 km for Galilee.

## Validation

Node tests cover all three scoring rules, region tolerance, hint limits, complete
campaign transitions, record timing, duplicate-submission prevention, image
switching, stale image callbacks, GPU texture reuse, restart, panorama image
dimensions, direct sampling of the assembled seam, GPU texture limits, portrait
projection, Retina resolution, drag/pinch limits and Safari page-gesture
prevention. Production GLSL is compiled and inspected
through an offscreen OpenGL ES render using the actual viewer shaders.
After deployment, the workflow fetches the public page, every module, all three
panoramas, and both fonts; it verifies HTTP 200 and exact SHA-256 file matches.
Real-browser layout and real-iPhone touch/WebGL behavior remain unverified in
this environment.
