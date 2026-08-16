# Biblical Treasures V16 regression target

This change intentionally tests the failure mode seen in Telegram on iPhone: direct `/web/...` images render while runtime `data:image/...` icons can disappear. The automated browser fixture therefore uses `img-src 'self' blob:` and **does not permit `data:` images**. All HQ atlas crops must render through Blob URLs, while the standalone HQ fish WebP remains an ordinary same-origin file.

Access is intentionally limited to Telegram user ID `1288379477`. The visual QA verifies that an unauthorized ID receives no game card, cannot open the game through `window.openBiblicalMatchThree()`, and does not even request the HQ loader/atlas. The authorized ID must receive the card and open the game successfully.
