# Lighter blue — iOS Preview release

- Source: `07bbc71b2d463ca5a5f9ed11bba76cc786563131`, branch `codex/carousel-boundaries-20261017`.
- Baseline: `c5923ddbbac77f3ea014a84a805214b99b1c0107`, OTA `01a14ab7`.
- Target: iOS / Preview / runtime `1.1.10`.
- Update: `01a14ac2-ea09-73ac-be4b-06b5d4d903b5` (Profile `01a14ac2`).
- Group: `75803825-5fb7-4c92-b81a-5f45079ab47e`.
- Published October 17, 2026 at 16:47:30 UTC.
- [EAS dashboard](https://expo.dev/accounts/craigb/projects/gathr/updates/75803825-5fb7-4c92-b81a-5f45079ab47e).

Only runtime change: map wordmark lettering `#203B65` -> `#2585E6`, close to but slightly darker than the verified Events-header `#1E90FF`. Preserve accepted 70x26 dimensions, paths, crimson pin/arcs, transparent pin circle, centering and app behavior.

TypeScript passes; 4/4 existing header lifecycle tests pass; lint0errors /215existing warnings. Guarded publisher verifies clean ancestry, iOS Preview auth continuity, both social flags and Mapbox. Clear-cache export2506modules /2462source-map sources; eight bundled sources match committed checkout, no QA runtime imports and all111existing image/font asset bytes preserved. EAS112iOS assets include launch bundle; no new image/font uploads.

Checked bundle5,742,952bytes, SHA256 `ae47cd01d8cfda04362255e87c9c817cd9ab57f842319b15c7d97ca13805b65b`. EAS view/list/channel readbacks confirm exact source/update/group/platform/runtime, newest iOS Preview position and active channel mapping. Authenticated manifest launch-asset hash matches checked local export. No independent remote bundle download is claimed. Sanitized checks retained in `export-check.json` and `published-readback.json`.

Existing compatible-build fingerprint advisory is unchanged (`9ee0b973a2f53ed5647ccafe1599ef64f1580ffb`); no native dependency/configuration changes. Independently reviewed isolated actual-path render `light-blue-comparison.png`. No map interaction or emulator reconnect. **Final native appearance and iPhone adoption remain pending.** Reopen Preview twice if needed and confirm Profile OTA `01a14ac2`.

No Production/Android release, backend deployment or data mutation. Following commit contains release evidence only.
