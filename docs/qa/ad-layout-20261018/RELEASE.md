# iOS Preview release - adaptive feed ad layouts

- Published 2026-10-19 01:28:46 UTC (October 18 Atlantic).
- Checkout: C:\Users\craig\.codex\worktrees\carousel-boundaries\GathR-upgrade-sdk54
- Branch: codex/feed-optimization-20261018
- Source commit: e751ef5ee4590efafc67d069567b7b3239e2aa13
- Previous live source: a5caa593d4a8d5a4311b7c8fc11081caf392a60f (verified ancestor).
- Target: ios / preview / runtime 1.1.10; existing Preview 1.1.10(78).
- Update ID: 01a151c6-842e-7368-afe0-0bfd376bcc83 (Profile short ID 01a151c6).
- Group: 10d4cedd-4365-45e6-9ffc-1d6673e648ac.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/10d4cedd-4365-45e6-9ffc-1d6673e648ac).

Implemented selected portrait B and landscape H2 for Events/Specials feed ads. Preserves accepted saved-card deferral, clipping setting, subscriptions, grouping, ad ownership and loading. Production remains on hold. No Android release, native build, backend/data changes or paid build.

## Evidence

- Seven focused suites / 49 tests pass. Final component mock adjustment independently rerun: 8/8 pass.
- TypeScript passes; full lint exits zero with 0 errors / 215 existing warnings; changed files have no lint warnings. Git diff whitespace check passes.
- Actual component rendered through React Native Web: eight fixtures independently reviewed. Screenshot and limits in README.md. Native SDK media/overlay is simulated; playback/clicks and iPhone acceptance are pending.
- Guarded clean-worktree/ancestry, social flags, iOS Preview auth, and Mapbox preflight pass.
- Clear-cache export: 2,468 source-map sources. Twelve critical bundled sources match the committed files exactly after newline normalization, including both feed screens, adaptive ad component/helper, deferred-save hook and prior accepted components. No QA sources in bundle.
- Bundle 5,749,796 bytes; SHA256 da197757777d97b57af55b7da430759a1f13dd83f30e5ce2a763a91fe438dab3.
- 108 unique asset files byte-identical to earlier accepted export; EAS reports 112 iOS assets. No new uploaded assets.
- EAS update:view confirms exact iOS platform/runtime/source/update; update:list confirms newest Preview group. Device adoption is not inferred.
- Fingerprint 9ee0b973a2f53ed5647ccafe1599ef64f1580ffb unchanged from prior release; EAS's compatible-fingerprint advisory remains. Runtime compatibility is 1.1.10; no native dependency/config change.

## Phone check pending

Close/reopen Preview twice as needed and confirm Profile OTA01a151c6. Inspect portrait and landscape ads in Events/Specials: aspect/layout, text/CTA, native video controls, dark mode, and continued stable save/scroll behavior. Unknown-ratio creatives and advertiser-embedded padding may still show space. Do not claim native ad playback or user acceptance before Craig checks.

Raw logs/readbacks/export check and reproducible fixture harness: artifacts/ad-layout-20261018/ (ignored local artifacts).
