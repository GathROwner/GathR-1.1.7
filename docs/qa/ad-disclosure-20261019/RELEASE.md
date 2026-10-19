# iOS Preview release - portrait disclosure relocation

- Published 2026-10-19 10:51:08 UTC.
- Checkout C:\Users\craig\.codex\worktrees\carousel-boundaries\GathR-upgrade-sdk54; branch codex/feed-optimization-20261018.
- Source commit 91c044bf889f46bfef23b24e98e303dc8704cd84; verified previous live source ae590bbc7a8a290dd2bd921e86089025a8c2fe9f is an ancestor.
- Target ios / preview / runtime 1.1.10, compatible existing Preview 1.1.10(78).
- Update ID 01a153c9-5f15-75af-8f37-494e3436588d; Profile short ID 01a153c9.
- Group 0f404830-1ec8-4451-9faa-351a62945d0e.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/0f404830-1ec8-4451-9faa-351a62945d0e).

Split portrait feed cards move Sponsored above the right-hand details, removing the full-width top row. Video grows proportionately from 43% to 47% inner width. Horizontal and stacked fallbacks retain their previous layout. No crop/stretch, ratio-guessing, pool/ownership, saved-list or callout changes. Production remains held.

## Verification

- Seven focused suites / 52 existing tests pass. TypeScript passes; lint 0 errors / 215 existing warnings; whitespace check passes.
- Ten rendered fixtures reviewed; actual old/new component/helper sources, SDK media/overlay simulated. Standard portrait video 167.31 x 297.45 instead of 153.08 x 272.14 points, top/bottom inset 9/9; card remains about 316 points tall. Label is separated from media/CTA/AdChoices. Dark/light, long/short copy and accessible fallbacks reviewed. No native iPhone post-change acceptance claimed.
- Guarded clean source/ancestry, iOS Preview auth/social and Mapbox checks pass.
- Clear-cache export 2,512 modules / 2,468 source-map sources. Twelve critical sources match committed code; no QA runtime sources. 108 unique asset files byte-identical to prior accepted export; final EAS count 112 iOS assets with no new assets uploaded.
- Bundle 5,750,000 bytes; SHA256 5e6a417f39824436f0a249324a4db1dc18bc001ddce1a81399915807fb112737.
- EAS update:view verifies exact platform/runtime/commit/update; update:list verifies newest Preview group.
- Fingerprint remains 9ee0b973a2f53ed5647ccafe1599ef64f1580ffb; compatible-build fingerprint advisory remains distinct from runtime compatibility/adoption.
- No paid native build, Android publication, Production release, native/config/dependency changes, map testing or backend/data mutation.

## Phone check pending

Close/reopen Preview twice if needed; confirm OTA01a153c9. A split portrait creative should start at the top card padding, with Sponsored in its right-hand column and native controls unobstructed. Existing horizontal layout should match the accepted version. Larger text/narrow-screen stacked mode deliberately retains its disclosure row. Callout ad parity is still open and not delivered by this patch.

Raw checks, baseline snapshots, fixture harness and measurements: ignored artifacts/ad-disclosure-20261019/.
