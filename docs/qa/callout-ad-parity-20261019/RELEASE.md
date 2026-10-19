# iOS Preview release - callout ad formatting parity

- Published 2026-10-19 11:15:02 UTC.
- Checkout C:\Users\craig\.codex\worktrees\carousel-boundaries\GathR-upgrade-sdk54; branch codex/feed-optimization-20261018.
- Source commit 948c34900353d9022af41ae3c1a930928f059e00.
- Previous live source 91c044bf889f46bfef23b24e98e303dc8704cd84 verified ancestor (OTA01a153c9).
- Target ios / preview / runtime 1.1.10, existing Preview 1.1.10(78).
- Update 01a153df-40ce-7cb0-85cd-bddb9eab1268; Profile short ID 01a153df.
- Group 68771a44-bd1c-4474-b1eb-77005ff31fd4.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/68771a44-bd1c-4474-b1eb-77005ff31fd4).

Normal SDK-backed callout ads in Events and Specials now reuse the exact accepted feed card presentation, including portrait B, landscape H2, right-column Sponsored and outer spacing correction. The iOS two-frame + 60ms native attachment delay remains; readiness is per SDK object. Waiting uses a plain shared skeleton, not a hidden native view. Android remains immediate in source but was not published. Emergency non-SDK fallback and parent callout logic are unchanged.

## Evidence

- Eight suites / 60 tests pass. Final callout test mount-only logging refinement rerun: 8/8 pass. TypeScript passes; final full lint 0 errors / 215 existing warnings; whitespace check passes.
- Ten actual-component RNW fixtures reviewed: accepted feed comparisons and eight callout card states, including light/dark portrait, landscape, square, unknown/no media, narrow and large text. Matching portrait and landscape cards have identical markup/dimensions. No horizontal overflow. SDK media/overlay simulated, settled layout rendered through immediate non-iOS path; iOS timing covered independently by React tests. This is not native map/callout playback/scroll acceptance.
- FullSizeSdkAdCard, nativeAdLayout, EventCallout, ad pool and loading hook are unchanged from the previous live source. Existing saved-feed behavior is retained.
- Clean-worktree/live-ancestry, iOS Preview auth/social and Mapbox preflights pass.
- Clear-cache export: 2,512 modules / 2,468 source-map sources. Seventeen critical bundled sources match committed files, including both feed screens, shared/wrapper/fallback ad cards, EventCallout, pool/hook and saved-ranking code. No QA runtime sources.
- Bundle 5,745,676 bytes; SHA256 bddffad6d022dcb8ed72090293759e5747187723e80bec8f2dbc48fdbc4dd063.
- 108 unique assets unchanged byte-for-byte; final EAS count 112 iOS assets; no new assets uploaded.
- Independent EAS update:view and update:list confirm exact source/platform/runtime/update and newest Preview group.
- Fingerprint 9ee0b973a2f53ed5647ccafe1599ef64f1580ffb unchanged; compatible-build fingerprint advisory remains separate from runtime compatibility/device adoption.
- No map operation/testing, device/emulator manipulation, native/dependency/config/runtime change, backend/live-data mutation, paid build, Android or Production publication. Production remains held.

## Phone check pending

Close/reopen Preview twice if needed and confirm OTA01a153df. Craig should check normal ads within both callout tabs: portrait versus horizontal formatting, Sponsored placement, margins, playback/controls, scrolling and switching venue/tab. Native callout stability and adoption remain pending his observation. The pre-mode skeleton and explicitly non-SDK emergency fallback are not evidence of an SDK ad or its playback.

Raw checks/render harness/readbacks/metrics: ignored artifacts/callout-ad-parity-20261019/.
