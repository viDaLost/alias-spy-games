# Найди 9 деталей — isolated artistic preview

Only `feat/bible-find9-preview`, this directory and its dedicated deployment workflow are involved. No main-menu integration.

## Artwork, art-2

`public/assets/00_base_scene.png` is a new 1536×1024 original raster illustration, generated with the built-in ImageGen tool. The nine full-canvas RGBA PNGs are extracted from that exact image by `scripts/extract_layers.py`. Their visible RGB values are byte-identical to the master. Hand-traced silhouettes preserve the open jug handle and harp interior; alpha, never bounding rectangles, controls hits.

Generation brief: premium detailed soft cartoon 3D/painterly hidden-object mobile game, Noah's Ark after rain, warm sunlight, carved wood, paired animals, mountains, waterfall, water, rich foliage and supplies; one dove with olive twig, parchment scroll, terracotta jug, fish, purple grapes, ancient oil lamp, bread loaf, wooden harp and distant rainbow distributed across one complete 3:2 scene. No text/UI, flat vector artwork or old reference image. The final generation prompt was supplied to the built-in tool; no independent target generations or SVG conversion were used.

## Validation

Install Pillow and numpy, then run:

```
python cloudflare/bible-find9-preview/scripts/validate_assets.py
python -m http.server 8765 --directory cloudflare/bible-find9-preview/public
node cloudflare/bible-find9-preview/scripts/test_game.cjs
```

Browser tests require Playwright and Chromium (`ENGINE=webkit` also supported). They exercise real pointer events at 390 and 1180 CSS pixels: all nine target pixels, six background/hole points, duplicate clicks, 9/9 victory, replay, reset while victory is pending, 3× coordinate conversion, drag exclusion and horizontal overflow.

`assets-manifest.json` pins SHA256 for every PNG, representative positive points and negative points. `verify_live.py` downloads and verifies all ten deployed files and checks `/health` for `art-2`, preventing an old PNG set from passing deployment checks. Assets are committed directly: there is no old base64 restoration path.

## Mobile interaction

Use 2×/3× to inspect fine details, drag to pan, tap an object's visible pixels to find it. Dragging never counts as a click. Browser pinch zoom remains available. There are no penalties or personal-data collection.
