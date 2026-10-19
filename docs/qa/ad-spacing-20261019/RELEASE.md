# iOS Preview release - native ad card spacing

- Published 2026-10-19 10:31:13 UTC.
- Checkout: C:\Users\craig\.codex\worktrees\carousel-boundaries\GathR-upgrade-sdk54
- Branch: codex/feed-optimization-20261018
- Source commit: ae590bbc7a8a290dd2bd921e86089025a8c2fe9f.
- Previous live source e751ef5ee4590efafc67d069567b7b3239e2aa13 verified ancestor; B/H2 and all earlier saved-feed changes retained.
- Target ios / preview / runtime 1.1.10, existing Preview build 1.1.10(78).
- Update: 01a153b7-21b9-7757-b373-eb5f68cdda6d; Profile short ID 01a153b7.
- Group: b11a2670-8ff0-4d09-b507-4232f5123783.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/b11a2670-8ff0-4d09-b507-4232f5123783).

Move padding/border decoration from the SDK native ad view to its ordinary outer card, avoiding the Fabric contentView double inset. Both feeds keep adaptive portrait B / landscape H2. Wide/unknown video fitting remains unchanged after API investigation; no guessed orientation or cropping added. See README.md for source evidence and explicit limits.

## Verified

- Seven suites / 52 tests pass; TypeScript passes; lint zero errors / 215 existing warnings; whitespace check passes.
- Ten rendered actual-component fixtures reviewed: two modeled BEFORE cases plus eight current layouts. Media and SDK overlay simulated, Fabric offset modeled from installed native source. This is rendered component evidence, not native iPhone post-fix acceptance.
- Auth/social/Mapbox, clean status, compatibility and live ancestry preflights pass.
- Clear-cache iOS export: 2,512 modules / 2,468 source-map sources; twelve critical bundled sources match committed code; no QA runtime imports.
- Bundle 5,749,916 bytes, SHA256 07b61144e46531d2ec6c09f6ff4ed73f1e513e6270ea5287763337af45236872.
- 108 unique asset files unchanged byte-for-byte; EAS final count 112 iOS assets, no new assets uploaded.
- Independent EAS update:view and update:list confirm exact iOS/runtime/source/update and newest Preview group. Fingerprint 9ee0b973a2f53ed5647ccafe1599ef64f1580ffb unchanged; compatible-fingerprint advisory remains separate from the 1.1.10 runtime gate and device adoption.
- No native build, dependencies/config/runtime changes, Android release, map testing, backend/data writes, Production publication or costed build.

## Pending phone acceptance

Reopen Preview twice if needed; confirm Profile OTA01a153b7. Check symmetric horizontal media padding, CTA right margin, portrait media bottom margin, readable body/disclosure and native video controls. Real iPhone adoption and corrected spacing are pending Craig's observation. Exact SDK aspect ratios of the supplied screenshots were not captured; do not retroactively label those ads as zero-ratio or padded creatives with certainty.

Ignored raw logs/export check/harness/metrics: artifacts/ad-spacing-20261019/.
