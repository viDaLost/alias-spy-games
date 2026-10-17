# Panorama sources and reproduction

## October 16 longitude repairs

All fifteen rear longitude joins now have individual native 1254×1254 ImageGen repairs in `sources/repairs/`. Each repair reconstructs the damaged centre of a 104-degree rectilinear rear view while retaining surrounding composition and story clues. The riverbank, pottery rims, masonry, cloth, tree branches and ground are reconstructed as continuous opaque geometry. The Gideon ridge and sky required a further background refinement before selection.

`seam-repairs.json` records the saved Git blob identities and bounded projection masks. `spherical-repairs.mjs` applies these reviewed sectors **after** the original detail assembly in both native-base and six-direction build paths, so old malformed content cannot be injected over the correction. Original sources and previous bounded anatomy repairs are retained. Feathered borders leave the front and exact poles untouched. Generated source resolution is 1254×1254; assembled sphere resolution remains 4096×2048 lossless WebP.

All panorama URLs receive a `seams2` version because texture responses are immutable. WebGL repeats longitude on supported power-of-two textures; the CPU fallback uses periodic texel-centre interpolation. Legacy non-power-of-two WebGL textures remain clamped. Regression tests compare opaque repaired sectors on both sides of the longitude wrap against every reviewed native source and retain the specific Carmel head/torso check. Game and camera tests cover all fifteen rounds; deployment CI rebuilds every sphere and runs complete asset tests before publishing.

All scene art was created or enhanced with the built-in ImageGen tool. The original three scenes retain their exact PNG sources and prompts in `prompts.json` / `prompts-4k.json`. The twelve new scenes use `prompts-easy.json`, `prompts-easy-b.json`, `prompts-medium-a.json`, `prompts-medium-b.json`, `prompts-hard-a.json`, and `prompts-hard-b.json`, plus `prompts-red-sea-poles.json`; corresponding `qa-*.json` files record checks and limitations.

The native generated direction views are stored losslessly under `sources/directions/`. Six overlapping directions (front, right, back, left, up, down) form each sphere. Whole-scene sources and `*-source.json` provenance live in `sources/`. Derived or repaired bases are explicitly labelled. Original native sources are retained when a replacement assembly needs separate provenance.

`node art/build-4k.mjs prepare` projects source references. `node art/build-4k.mjs build` assembles all fifteen 4096×2048 lossless WebP textures. With no arguments both commands use the full scene catalog; optional scene IDs limit work. `derive-base <id>` recovers a sphere from six retained directions. The normal assembler preserves broad base geometry and blends confidence-weighted generated detail. Source provenance controls the seam band and optional detail confidence thresholds; repaired spheres use stricter confidence to suppress misaligned outlines. Defaults preserve the original three scenes; derived scenes project their saved faces directly. Final textures and intermediate views are ignored and rebuilt by CI with sharp 0.35.4.

Final resolution is 4K; this is not a claim that the whole image was natively generated at 4K. Generative geometry and overlap details can differ slightly. Each scene’s QA records concrete review findings. No stock placeholders replace the requested scenes.

## October 13 visual repair

The diagonal, wrap and exact zenith/nadir audit uses `node art/audit-seams.mjs` (30 rectilinear views per scene). Native bounded ImageGen replacements retain the old sources: `prompts-pole-fixes.json`, `prompts-babel-sky-fix.json`, `prompts-prison-fix.json` and `prompts-natural-camp.json` record exact prompts, native dimensions, hashes and limitations. Scene provenance supports `panoramaSource` and `directionSources` overrides. `dominantDirections` prevents clean repair masks from being diluted by neighboring detail-only faces; it is opt-in for confirmed transparent silhouette defects. Red Sea additionally fades outdated side detail below its cleared foreground (`detailFadeBelow`) so detached horns and fleece cannot be injected into the new ground. `poleBlendStart` / `poleBlendRange` control where a clean perspective pole replaces contamination from a pinched base; defaults remain unchanged for unaffected scenes. Corrected output names are versioned because deployed panorama assets have immutable cache headers.

The night-camp replacement is a native 1774×887 coherent base, with repaired native 1254×1254 upper/lower views and conservative retained direction detail. Final 4096×2048 lossless encoding does not imply independent native 4K generation. Final review is projected asset QA; no physical iPhone or browser interaction test was available in this environment.

`qa-panorama-repairs.json` records the complete audit, rejected intermediate candidates and the final selected files. Expanded 1024px projections were used for the five changed scenes after the initial 512px audit.

## October 14 Carmel person repair

`prompts-carmel-person-fix.json` records a bounded native back edit removing a duplicated head and reconstructing the woman's torso/cloak. `directionPatches` applies only the corrected perspective rectangle with feathered borders; original directional detail remains outside it. The full 4K decoded pixel comparison found zero changes outside the repair sector. `qa-carmel-person-fix.json` records the screenshot view, exact comparison and visual review; `tests/carmel-repair.test.mjs` guards cleaned anatomy at the longitude wrap against old source reinjection.
