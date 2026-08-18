# Moses Nile 3D asset credits

## Woven basket

- Model: **Woven Basket Low Poly**
- Author: **nyilonelycompany / lonely_company**
- Source: https://sketchfab.com/3d-models/woven-basket-low-poly-f60f6cf9eb5548a890b0b4c1e8c85245
- License: **CC BY 4.0**
- Project modification: geometry extracted from the user-supplied GLB, re-oriented to Y-up and stored as a lightweight OBJ for the mobile runner. Textures were intentionally omitted; the game applies a lightweight runtime material.

## Nile environment models

Environment foliage and props are loaded lazily from the Quaternius showcase packs pinned to commit `d6aacfb25dd969ead90cddd94ad901e74aede5d8`:

- `public/glb/nature_pack/Rock_1.glb`
- `public/glb/nature_pack/Plant_1.glb`
- `public/glb/nature_pack/Plant_2.glb`
- `public/glb/nature_pack/Bush_1.glb`
- `public/glb/nature_pack/Grass.glb`
- `public/glb/nature_pack/PalmTree_4.glb`
- `public/glb/survival_pack/WoodLog.glb`
- `public/glb/survival_pack/Raft.glb`

Quaternius assets are released under CC0. Runtime URLs are pinned to the same revision so an upstream change cannot silently alter the game.

## Project-owned lightweight scenery

The river banks, animated two-layer water surface, papyrus obstacle, crocodile and stepped Giza-inspired background pyramids are generated from small project-owned Three.js meshes/textures. This avoids adding large terrain and architectural files to Telegram WebView while retaining real 3D geometry. The pyramid geometry is deliberately independent from the downloadable CC-BY Sketchfab reference models reviewed during research.
