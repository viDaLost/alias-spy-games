# Bible geography atlas: location gallery

Every one of the 134 atlas locations has its own generated 1024 × 576 landscape image. These are artistic impressions of the biblical-era setting, not documentary photographs or claims about the exact appearance of ancient settlements. Prompts prioritize known geography and avoid presenting speculative ruins as fact. Approximate locations remain marked as approximate.

Images are resized to 1024 × 576 WebP for mobile loading. Gallery images use lazy loading and asynchronous decoding. External source links are not displayed in the atlas.

`web/data/bible_geography_gallery.json` assigns a unique image to every place in `web/data/bible_geography.json` and carries Russian, English, German, and Spanish labels. `scripts/check-bible-geography-gallery.mjs` checks place coverage, image files and uniqueness, localized data, removal of source links, and map gesture optimizations.
