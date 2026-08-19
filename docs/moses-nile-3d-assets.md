# Moses Nile 3D asset credits

## Closed woven basket

- Base model: **Woven Basket Low Poly**
- Author: **nyilonelycompany / lonely_company**
- Source: https://sketchfab.com/3d-models/woven-basket-low-poly-f60f6cf9eb5548a890b0b4c1e8c85245
- License: **CC BY 4.0**
- Project modification: geometry extracted from the user-supplied GLB, re-oriented to Y-up and stored as a lightweight OBJ. V7.3 turns the open basket into a closed basket at runtime with a woven lid, rim and handle while preserving the original base geometry and lightweight woven material.

## Crocodile

- Model: **crocodile high quality**
- Author: **Beerus**
- Original source: https://sketchfab.com/3d-models/crocodile-high-quality-a242e4634a234d3fb909c54b2c39d7b8
- License: **CC BY 4.0**
- Repository mirror used by the preview build: `sandeshdamkondwar/3d-viewer`, pinned to commit `a33f107378e79b4458d2a400bb5e32fddcedbf73`.
- V7.3 uses this higher-detail model for gameplay crocodiles instead of the previous procedural box/cone crocodile.

## Quaternius Nile environment models

Quaternius assets are CC0. The preview build pins the showcase mirror to commit `d6aacfb25dd969ead90cddd94ad901e74aede5d8` and bundles the files same-origin with the Cloudflare preview.

Used models:

- `public/glb/nature_pack/Rock_1.glb`
- `public/glb/nature_pack/Plant_1.glb`
- `public/glb/nature_pack/Plant_2.glb`
- `public/glb/nature_pack/Bush_1.glb`
- `public/glb/nature_pack/Grass.glb`
- `public/glb/nature_pack/PalmTree_4.glb`
- `public/glb/nature_pack/Flowers.glb` — real flower geometry used for the V7.3 lotus pickup styling
- `public/glb/survival_pack/WoodLog.glb`
- `public/glb/cute_fish_pack/Boat.glb` — wooden boat replacing the previous raft/inflatable-looking prop

## River-bank people

- Base model: original rigged Quaternius human distributed as `assets/human.glb` by `UMRAM-Bilkent/supine-human-model`.
- Pinned source revision: `728f23ab5eb9d6cb2c8fb39acb3440bd81db0d3e`.
- License: **CC0 1.0**.
- V7.3 keeps the rigged source so arm bones can be animated in Three.js. Lightweight project-owned linen tunics/robes, belts and optional collars are added at runtime. Clothing is stylised ancient-Egypt-inspired game art rather than an archaeological reconstruction.
- Characters are placed on both banks and periodically wave one arm; timing is randomized per character.

## Project-owned environment graphics

The V7.3 river banks are generated as sloped, irregular Three.js `BufferGeometry` meshes rather than flat planes. The game applies a project-owned procedural sand texture, darker wet shoreline strips and green riparian strips. Existing Quaternius rocks, grasses, bushes, plants and palms dress the bank geometry.

The animated Nile surface, contact effects, stepped Giza-inspired background pyramids, UI and gameplay logic remain project-owned procedural/runtime graphics.
