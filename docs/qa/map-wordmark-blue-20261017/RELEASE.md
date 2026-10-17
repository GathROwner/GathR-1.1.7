# Bluer lettering — iOS Preview release

- Source: `c5923ddbbac77f3ea014a84a805214b99b1c0107`, `codex/carousel-boundaries-20261017`.
- Accepted baseline: `12b4d814d26270e81c710bdc9f34437733a3308f`, OTA `01a14aa7`.
- Target: iOS / Preview / runtime `1.1.10`.
- Update: `01a14ab7-2853-7fb7-85f8-896ade5ec033` (Profile `01a14ab7`).
- Group: `63a8c1a5-81c0-4c88-b114-20ad2a9976c9`.
- Published October 17, 2026 at 16:34:39 UTC.
- [EAS dashboard](https://expo.dev/accounts/craigb/projects/gathr/updates/63a8c1a5-81c0-4c88-b114-20ad2a9976c9).

Sole runtime change: map logo lettering fill `#131442` -> `#203B65`. The accepted 70x26 size, crimson pin/arcs, transparent pin circle, paths, centering and all other app behavior are retained. This completes the blue adjustment missed in the preceding size-only release.

TypeScript passes; 4/4 existing header lifecycle tests pass; lint 0 errors / 215 pre-existing warnings. Guarded publisher verifies clean worktree/ancestry, iOS Preview auth continuity, both social flags and Mapbox. Clear-cache export: 2506 modules / 2462 source-map sources. Eight bundled runtime sources match the committed checkout, no QA runtime sources, all111image/font asset bytes equal to the accepted baseline. EAS reports112iOS assets including launch bundle; no new image/font uploads.

Checked published export:5,742,948bytes; SHA256 `987fa48c684968d53eb098f5993e804e81a6c3396318e5634b6d54a5c91a2dda`. EAS view/list/channel independently confirm the exact source/update/group/runtime/platform, newest iOS Preview position and active channel mapping. Authenticated channel manifest launch-asset hash equals the checked export. No independent remote-byte download is claimed. Sanitized evidence is in `export-check.json` and `published-readback.json`.

The unchanged native fingerprint (`9ee0b973a2f53ed5647ccafe1599ef64f1580ffb`) emits its existing compatible-build advisory; no native dependency/configuration changes. Isolated render `blue-lettering-comparison.png` was independently reviewed. No map interaction or emulator reconnect; no final native screenshot. **Device adoption and final iPhone appearance remain pending.** Close/reopen Preview twice if needed and confirm Profile OTA `01a14ab7`.

No Production/Android release, backend deployment or data mutation. Following evidence-only commit preserves the published runtime code.
