# Где я в Библии? — Cloudflare preview

Russian mobile 360° Bible guessing game: three difficulty levels, ten scenes each.

- Easy adds the angels and shepherds, Jericho, Joseph interpreting Pharaoh’s dreams, Jonah, and the empty tomb.
- Medium adds Jacob at Bethel, Ruth’s gleaning, Nehemiah’s wall, Naaman at the Jordan, and the wedding at Cana.
- Hard adds Hagar’s well, Hezekiah’s waterworks, Jeremiah at the potter’s, Peter’s rooftop vision, and the Bereans studying Scripture.

Choosing a difficulty opens a numbered location picker. Players can replay any single round or play all ten in order. Individual rounds leave full-journey records untouched. A small drag hint introduces 360° exploration. The bottom answer button opens a compact modal: place → event → period, advancing automatically after each selection. Back, tabs and review allow editing without discarding other answers; submission is explicit. Ten rounds award up to 50,000 points. Hints cost 150 points each, at most three per round. Completed-level records are separate and device-local. Earlier five-scene best scores are retained in their original storage keys, separate from ten-scene scores.

## Build and deployment

The dedicated workflow publishes the existing `alias-spy-games-bible-world-preview` Worker from `feat/bible-world-cloudflare-preview`. It rebuilds all thirty lossless textures from committed ImageGen sources, runs tests and a Worker dry run, deploys, then verifies every served code file and panorama against the local SHA-256. Other games are outside this preview.

```sh
npm ci
npm install --no-save --package-lock=false sharp@0.35.4
node art/build-4k.mjs prepare
node art/build-4k.mjs build
npm test
npm run check
```

## Images and performance

Every final sphere is 4096 × 2048 lossless WebP. The original panoramas use native generated directional views and individual rear repairs. The additions use generated 2:1 sources with a continuous longitude overlap, stabilized poles, and upscaling to the final texture size. See [art/README.md](art/README.md) for source and prompt provenance. The renderer keeps one texture/program, renders on changes, caps the Retina buffer at 3.2 million pixels, and provides a CPU fallback. The longer viewport dimension owns the 48–84° field of view, preventing excessive portrait stretching. The panorama is loaded only after level selection.

## Verification scope

Automated tests cover all thirty rounds, automatic question transitions, back/edit/reopen, duplicate submissions, separate complete-level records, stale image responses, retry, scoring, geographic uncertainty, touch controls, camera bounds, and lossless 4K dimensions. Flow tests execute actual handlers with a DOM/GPU substitute; they do not certify real-browser layout. Physical iPhone/Safari testing was not available. Public deployment verification checks HTTP status and exact file hashes.

Noah’s boarding location is deliberately unspecified; it is not identified with Ararat. Other uncertain locations are labelled in the scene explanation. Scripture references are shown after answering.
