# Map wordmark — published iOS Preview

- Source: `5a415d518c7b009b016061ff5021f1a4385306ac`, `codex/carousel-boundaries-20261017`.
- Baseline: `d4a058cefe61ea503b785a6cd2cca4d3df14b372`, accepted iOS OTA `01a14a65`.
- Target: iOS / Preview only; runtime `1.1.10`.
- Update: `01a14a9a-2347-7f2f-bd42-a38878950764` (Profile short ID `01a14a9a`).
- Group: `a5164736-0184-40a8-83e8-b4a01d2b2f93`.
- Published: October 17, 2026, 16:02:57 UTC.
- [EAS dashboard](https://expo.dev/accounts/craigb/projects/gathr/updates/a5164736-0184-40a8-83e8-b4a01d2b2f93).

Only two runtime files differ from the accepted live baseline: `FloatingMapSearchHeader.tsx` and the new `MapBrandWordmark.tsx`. Idle map header now uses the approved navy/crimson vector logo with diagonal pin and transparent circular centre, without the blue pill. Search/query/settings behavior remains intact; all other accepted app code and all 111 image/font asset bytes are preserved.

TypeScript passes. Existing header suite: 4/4 tests pass. Lint: 0 errors, 215 pre-existing warnings. Clean-worktree/ancestry, iOS auth continuity, both social flags and Mapbox preflights pass. Two clean-cache iOS exports include 2506 modules / 2462 source-map sources. Reviewed export and published local bundle are byte-identical: 5,742,960 bytes, SHA256 `2847453551b93fc01bb6bae2c32d3136c99c34e467795423df32f5dad571141c`. EAS reports 112 iOS assets including launch bundle and no new image/font uploads.

Independent EAS update:view, update:list and channel readbacks confirm exact source/update/group/platform/runtime and active Preview mapping. The authenticated channel manifest's launch-asset SHA256 matches the reviewed bundle. Direct permalink download returned HTTP403, so remote bytes were not independently downloaded; server-recorded hash verification is recorded separately in `published-readback.json`. No claim of remote-download verification is made.

Unchanged fingerprint `9ee0b973a2f53ed5647ccafe1599ef64f1580ffb` emitted the existing compatible-build advisory; runtime1.1.10 is unchanged and no native configuration/dependency changed.

Visual evidence: independently reviewed isolated vector/path renders at native header sizes; no final native app screenshot, no map interaction and no emulator reconnection. Craig explicitly requested publication for iPhone visual review. **iPhone adoption and final in-app appearance are pending.** Close/reopen Preview twice if needed and confirm Profile OTA `01a14a9a`.

No Production/Android update, native build, backend deploy or Firestore mutation. The following evidence-only commit does not change the published runtime code.
