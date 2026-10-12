# Где я в Библии? — Cloudflare preview

Russian mobile 360° Bible guessing game: three difficulty levels, five scenes each.

- Easy: Babel, Noah boarding the ark, the Red Sea, David and Goliath, Daniel.
- Medium: Solomon’s temple, teaching from Simon’s boat, Gideon’s night attack, Carmel, Philip and the Ethiopian official.
- Hard: the floating iron, the widow’s oil, Gideon’s dry fleece, Eutychus, the prison at Philippi.

Choosing a level opens its panorama immediately. A small drag hint introduces 360° exploration. The bottom answer button opens a compact modal: place → event → period, advancing automatically after each selection. Back, tabs and review allow editing without discarding other answers; submission is explicit. Five rounds award up to 25,000 points. Hints cost 150 points each, at most three per round. Completed-level records are separate and device-local.

## Build and deployment

The dedicated workflow publishes the existing `alias-spy-games-bible-world-preview` Worker from `feat/bible-world-cloudflare-preview`. It rebuilds all fifteen lossless textures from committed ImageGen sources, runs tests and a Worker dry run, deploys, then verifies every served code file and panorama against the local SHA-256. Other games are outside this preview.

```sh
npm ci
npm install --no-save --package-lock=false sharp@0.35.4
node art/build-4k.mjs prepare
node art/build-4k.mjs build
npm test
npm run check
```

## Images and performance

Every final sphere is 4096 × 2048 lossless WebP, assembled from native generated directional views. This is generative detail enhancement and spherical assembly, not a native single-image 4K generation. See [art/README.md](art/README.md) for source and prompt provenance. The renderer keeps one texture/program, renders on changes, caps the Retina buffer at 3.2 million pixels, and provides a CPU fallback. The longer viewport dimension owns the 48–84° field of view, preventing excessive portrait stretching. The panorama is loaded only after level selection.

## Verification scope

Automated tests cover all fifteen rounds, automatic question transitions, back/edit/reopen, duplicate submissions, separate complete-level records, stale image responses, retry, scoring, geographic uncertainty, touch controls, camera bounds, and lossless 4K dimensions. Flow tests execute actual handlers with a DOM/GPU substitute; they do not certify real-browser layout. Physical iPhone/Safari testing was not available. Public deployment verification checks HTTP status and exact file hashes.

Noah’s boarding location is deliberately unspecified; it is not identified with Ararat. Other uncertain locations are labelled in the scene explanation. Scripture references are shown after answering.
