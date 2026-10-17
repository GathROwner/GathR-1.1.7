# Matched map wordmark size — iOS Preview release

- Source: `12b4d814d26270e81c710bdc9f34437733a3308f`, `codex/carousel-boundaries-20261017`.
- Accepted baseline: `5a415d518c7b009b016061ff5021f1a4385306ac`, OTA `01a14a9a`.
- Target: iOS / Preview / runtime `1.1.10`.
- Update: `01a14aa7-fbed-7090-b9fb-53bbf1ba8b24` (Profile `01a14aa7`).
- Group: `80089ff1-583a-4f06-bfd3-9bb06b73dc55`.
- Published October 17, 2026 at 16:18:05 UTC.
- [EAS dashboard](https://expo.dev/accounts/craigb/projects/gathr/updates/80089ff1-583a-4f06-bfd3-9bb06b73dc55).

The sole runtime delta is SVG dimensions 108x40 -> 70x26 in MapBrandWordmark.tsx. This matches the list PNG's measured visible width of 69.3164 points while preserving vector proportions, colours, paths, transparent pin circle, centering and search behavior. The header host retains its existing dimensions and optical lift. No blue-colour change is included in this size-specific request.

TypeScript, all four existing header lifecycle tests and zero-error lint pass (215 existing warnings). Guarded publisher passes clean worktree/ancestry, iOS Preview auth continuity, both social flags and Mapbox. Clean-cache export: 2506 modules / 2462 source-map sources; eight checked bundled sources match the committed checkout, no QA runtime import, all 111 existing image/font assets byte-identical to the accepted baseline. EAS reports 112 iOS assets including launch bundle; no new image/font uploads.

Bundle: 5,742,960 bytes, SHA256 `8e401a5ee1d4a3639ea0c102d83602297ccf92feaea256f5ecfdcbfa9c91d7b7`. EAS view/list/channel independently confirm exact update/group/source/runtime/platform, newest iOS Preview position and active channel mapping. Authenticated channel manifest launch-asset hash matches the checked local bundle; no independent remote bundle download is claimed. `published-readback.json` and `export-check.json` retain evidence. Existing native fingerprint advisory is unchanged (`9ee0b973a2f53ed5647ccafe1599ef64f1580ffb`), with no native dependency/config changes.

Independently reviewed isolated source-artwork comparison in `matched-logo-sizes.png`; no final native screenshot or map interaction. Craig's standing confidence-based iOS Preview publication authority applies. **Device adoption and final on-iPhone appearance remain pending.** Reopen Preview twice if needed and confirm Profile OTA `01a14aa7`.

No Production/Android release, backend deployment or Firestore change. Following commit contains release evidence only.
