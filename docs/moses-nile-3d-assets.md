# Moses Nile 3D asset credits

## Closed woven basket

- Base model: **Woven basket low poly**
- Author: **FunWithBlender**
- Source: https://sketchfab.com/3d-models/woven-basket-low-poly-e544ba80962043448ab96498a7696310
- License: **CC Attribution / CC BY**
- Project modification: geometry extracted from the user-supplied GLB, re-oriented to Y-up and stored as a lightweight OBJ. V7.3+ turns the open basket into a visually closed basket at runtime with a woven lid, rim and handle while preserving the original base geometry and lightweight woven material.

## Crocodile

- Model: **crocodile high quality**
- Author: **Beerus**
- Original source: https://sketchfab.com/3d-models/crocodile-high-quality-a242e4634a234d3fb909c54b2c39d7b8
- License: **CC BY 4.0**
- Repository mirror used by the preview build: `sandeshdamkondwar/3d-viewer`, pinned to commit `a33f107378e79b4458d2a400bb5e32fddcedbf73`.
- V7.3 uses this higher-detail model for gameplay crocodiles instead of the previous procedural box/cone crocodile. V7.3.1+ resizes embedded textures to a maximum of 512 px during the preview build when the optimizer is available; if optimization fails, the original licensed GLB is retained.

## Nile lotus

- Primary V7.3.2 model: project-owned low-poly OBJ at `web/games/moses-nile-v7/models/lotus-flower.obj`.
- The geometry was created specifically for this game: three radial petal layers, a raised flower center and small stamens, with no external textures or third-party model dependency.
- Geometry budget: **957 vertices / 1,260 triangular faces**.
- Runtime: the preview copies the OBJ to `models/v73/lotus-flower.obj`; `v732-lotus.js` loads it with the local OBJLoader, applies pink petal layers plus a gold center and supplies it to the existing lily-pad pickup.
- The Quaternius `Flowers.glb` asset remains bundled only as a lightweight fallback if the project-owned lotus cannot load.

## Quaternius Nile environment models

Quaternius assets are CC0. The preview build pins the showcase mirror to commit `d6aacfb25dd969ead90cddd94ad901e74aede5d8` and bundles the files same-origin with the Cloudflare preview.

Used models:

- `public/glb/nature_pack/Rock_1.glb`
- `public/glb/nature_pack/Plant_1.glb`
- `public/glb/nature_pack/Plant_2.glb`
- `public/glb/nature_pack/Bush_1.glb`
- `public/glb/nature_pack/Grass.glb`
- `public/glb/nature_pack/PalmTree_4.glb`
- `public/glb/nature_pack/Flowers.glb` — fallback flower only; V7.3.2 uses the project-owned lotus OBJ as the primary pickup model
- `public/glb/survival_pack/WoodLog.glb`
- `public/glb/cute_fish_pack/Boat.glb` — wooden boat replacing the previous raft/inflatable-looking prop

## River-bank people

- Base model: **Quaternius Ultimate Modular Men / Farmer** (`public/glb/modular_men/Farmer.glb`).
- Pinned source revision: `d6aacfb25dd969ead90cddd94ad901e74aede5d8`.
- License: **CC0 1.0**.
- V7.3.1 uses the upright low-poly character as the body and adds lightweight project-owned linen-like tunics/robes, belts and optional collars at runtime. Clothing is stylised ancient-Egypt-inspired game art rather than an archaeological reconstruction.
- Characters are placed on both banks and periodically wave one arm. If a compatible arm bone exists it is animated directly; otherwise V7.3.1 adds a lightweight articulated fallback arm so waving is always visible. Timing is randomized per character.

## Project-owned environment graphics

The V7.3 river banks are generated as sloped, irregular Three.js `BufferGeometry` meshes rather than flat planes. The game applies a project-owned procedural sand texture, darker wet shoreline strips and green riparian strips. Existing Quaternius rocks, grasses, bushes, plants and palms dress the bank geometry.

The animated Nile surface, contact effects, stepped Giza-inspired background pyramids, UI and gameplay logic remain project-owned procedural/runtime graphics.
