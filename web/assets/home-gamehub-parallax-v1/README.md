# Game Hub parallax assets

Upload exactly six source-resolution PNG files into this folder. Keep the canvas/aspect ratio identical for all six images so the artwork aligns pixel-for-pixel.

Required filenames:

1. `01-gamehub-base.PNG` — opaque full background. Use the complete blue/indigo Game Hub scene.
2. `02-atmosphere.PNG` — transparent atmosphere/light layer only: glow, clouds, particles, light trails. No game icons.
3. `03-architecture.PNG` — transparent distant/floating architecture layer only. No repeated icons from other layers.
4. `04-game-icons.PNG` — transparent decorative layer with the first unique set of real app game icons (for example Alias/Spy/Quartet/Guess/Think). Do not repeat these icons on layer 05.
5. `05-game-library.PNG` — transparent decorative layer with the second unique set of real app game icons (for example Biblical Words/Search/Artist/Find a Pair/Treasures). Do not repeat layer 04 icons.
6. `06-foreground-platform.PNG` — transparent nearest foreground/portal/platform layer. Keep its upper boundary feathered/transparent; no repeated game icons.

Rules:
- Do not resize the source files before upload.
- PNG alpha transparency is required for files 02–06.
- Do not add white/black matte backgrounds to transparent layers.
- Do not crop individual layers differently. They must share the same canvas and registration.
- Keep important details away from the extreme left/right edges because mobile `object-fit: cover` uses overscan for parallax movement.

Runtime:
- `web/js/home-parallax-v1.js`
- `web/styles/home-parallax-v1.css`

The runtime loads these files directly after the Telegram ID gate. There is no `.part`, base64 or Blob assembly. Until these six files exist, the previous `home-parallax-v2` artwork is used as a temporary fallback.
