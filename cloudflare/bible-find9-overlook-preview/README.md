# Найди 9 деталей — Иерусалим на Пасху

This isolated preview now shows a new crowded cartoon seek-and-find illustration of Jerusalem during Passover. It updates the existing overhead preview only; the main application, main menu and original Noah preview are unchanged.

## Artwork

The single 1536×1024 master was created with built-in ImageGen in a bright wimmelbuch / Where's Waldo search-book style: fine ink contours, colorful ancient robes, dense pilgrims and lambs, market traders, Roman soldiers, playing children, musicians, flatbread bakers and the Temple. No 3D scene, modern objects or Easter eggs. Nine small targets are integrated into the full city composition: dove with olive twig, scroll, blue zigzag jug, silver fish, grape bunch, clay oil lamp, patterned flatbread, wooden lyre and red pouch with yellow cords.

All nine transparent full-canvas PNG layers come from masking this ONE final scene, retaining bit-identical visible RGB pixels. Their silhouettes determine hits through alpha >16. Tiny target-list cutouts identify the specific object design among similar market goods. Zoom remains available from 1× to 4×.

## Verification

- `scripts/validate_assets.py`: pinned SHA256, PNG dimensions and alpha, source RGB alignment, positive target pixels and negative background/hole points.
- `scripts/test_game.cjs`: Chromium and WebKit, 390/1180 CSS-pixel widths, touch/mouse, all nine targets, wrong/duplicate taps, victory, replay, reset timing, zoom/pan and overflow.
- `scripts/verify_live.py`: downloads every live PNG and checks its exact hash; waits for initial hostname activation.

The deployment workflow only targets `feat/bible-find9-overlook-preview` and this isolated Worker. Version: `jerusalem-1`.
