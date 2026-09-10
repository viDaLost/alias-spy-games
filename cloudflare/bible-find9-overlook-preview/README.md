# Ноев ковчег — вид сверху

Independent harder alternative at `alias-spy-games-bible-find9-overlook-preview.vitaledanilov.workers.dev`, branch `feat/bible-find9-overlook-preview`. The first preview, the main application and its menu are preserved.

The 1536×1024 master is a new overhead illustration generated with built-in ImageGen: a detailed ark unloading scene, animals, camp, cargo, foliage and waterfall. A final local image edit added one small unlit clay lamp to the mossy crate and removed a duplicate grape cluster. All nine target PNGs are extracted from the resulting single final master using traced contours; no target was generated independently. Visible RGB values match the base pixel for pixel. The jug handles and harp interior retain transparency.

The nine targets use about 12 thousand opaque pixels combined, versus about 54 thousand in the first scene, and are blended with natural materials and shadows. Mobile zoom offers 1×/2×/3×/4×. Alpha hit testing, non-penalized misses, victory and restart behave as in the first preview.

## Checks

`python cloudflare/bible-find9-overlook-preview/scripts/validate_assets.py` verifies hashes, PNG dimensions, alpha, RGB alignment and target/background coordinates. `scripts/test_game.cjs` checks touch and mouse play at 390 and 1180 pixels in Chromium and WebKit, including 9/9 victory, replay, zoom and no scores for drags or misses. `scripts/verify_live.py` compares every deployed PNG against its pinned SHA256.

## Generation brief

Create a premium hidden-object scene in soft cartoon-3D painterly style, high bird's-eye view down over Noah's Ark and the entire surrounding camp after the flood. No horizon. Tiny people and animals, detailed cargo, ropes, tents, mossy stones, foliage and river. Warm earthy wood and olive colors; targets small and camouflaged, without outlines or highlights. One dove with olive twig, parchment scroll, terracotta jug, fish beneath shallow water, dusty purple grapes, unlit clay oil lamp, brown bread loaf, wooden harp, and a subtle rainbow in waterfall mist. No labels or UI in artwork. Final edit: add one small brown oil lamp on the mossy cargo crate, remove the extra grape cluster beside the tent, preserve the composition. Built-in ImageGen was used for artwork; Pillow only extracts source pixels through masks.
