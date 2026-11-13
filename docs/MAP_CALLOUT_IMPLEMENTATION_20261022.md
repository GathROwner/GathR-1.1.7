# Map and callout implementation handoff — 2026-10-22

## Ownership and release boundary

- Isolated checkout: `C:/Users/craig/Documents/Codex/2026-10-22/task/map-callout`.
- Branch: `codex/map-callout-gestures-20261022`; base: current iOS Production commit `7411351ed7316f9690882daea6d844b2838cab41`, runtime 1.1.20, OTA `01a1658a-8032-7a60-92e4-eb5de6bb963f`. The map commit was rebased cleanly from its original `6899e85` base.
- This is an unpublished implementation. No EAS publication, backend change, event mutation, emulator reset, or credentials change is included.
- The released check-in commit `7411351` from task `01a15f8f-c449-73d2-853d-b251ed70e01c` is now an ancestor of this branch. Its observer, social transport and two tests are preserved byte-for-byte. The updater remains preserved. Future publication must still reconcile any subsequent live changes.
- Updater and check-in files are untouched. Map edits are limited to the cluster-tap camera action, cluster/puck rendering/projection/tap-target coordination, and the location puck's overview visibility. Check-in transport, location observer, radius overlay, confirmation, and permission behavior retain their existing owners.
- Installed dependencies are a local ignored junction to the base checkout's `node_modules`; no dependency or lockfile changes. Use a physical dependency tree for future Metro/native QA as required by the emulator workflow.

## Implemented behavior

1. Cluster selection keeps the camera unchanged. Explicit recenter/zoom controls and startup hotspot camera ownership retain their prior behavior.
2. Content at scroll top can dismiss downward from the hero/description. A gesture starting in a scrolled list remains a list gesture even if it reaches the top during that gesture. Horizontal selectors and browsing retain their own handlers; scrolling is never disabled by a transient drag.
3. Downward motion translates a fixed-size compositor surface. The child iOS sheet keeps its static absolute layout and visibility workaround. Short/reversed/cancelled pulls spring back; release uses a 20%-of-height threshold bounded to 80–140dp or a 900dp/s flick after at least 24dp. Completion is 220ms. Reduce Motion retains direct manipulation and skips settling/completion animation. Close rejection and stale/interrupted completions reset ownership; buttons and accessibility escape remain available.
4. Concept A: actual native screen projections detect puck/count collisions. At most eight eligible nearby clusters are projected after idle/data/location changes. The cluster display moves to a screen-space lane, with a geographic leader and endpoint marking its original anchor. Stored coordinates and the native location puck remain unchanged. Both MarkerView and Android native shape renderers use the displaced display coordinate. Android temporary tap targets and native feature identity follow that displayed marker. The location puck remains visible at overview zoom.

## Validation and evidence

- Final focused matrix: **42 tests passed in 9 suites**, covering distance/velocity/reversal, parent rejection, stale callbacks, Reduce Motion, native gesture argument mapping, mid-list distance isolation, regrab/cancellation, bounded projection work, filtered candidates, close safety, horizontal browsing and modal tabs.
- Integrated production check-in baseline: **86 tests passed in 11 suites** (the 42 map/callout tests plus 44 released check-in observer/transport regressions). Log: `map-callout-integrated-focused.log`. Ancestry and byte-for-byte preservation checks passed.
- TypeScript: `tsc --noEmit --incremental false` passed again on the integrated candidate; log `map-callout-integrated-types.log`.
- Targeted ESLint: zero errors; 118 warnings in the existing large map/callout files. New helper/hook/surface files have no lint warnings.
- `git diff --check` passed.
- Full repository run: 159 suites passed, 6 failed; 1,270 tests passed, 1 timed out,1 skipped. Four fixture/helper files were collected as empty test suites. FloatingMapSearchHeader failed on a missing AsyncStorage native mock; that same failure was reproduced on untouched production base. The unchanged check-in test timeout passed on a focused rerun: 50/50 tests, and also passed on the production baseline. These unrelated fixtures/mock issues were not modified.
- Independent source reviewer `independent_map_review` reported no remaining blocking findings after the gesture and Android hit-target corrections.
- `map-callout-implementation-preview.png` and matching HTML are retained beside this checkout. The actual `CalloutDismissSurface` renders at 0/90/0dp through React Native Web; collision positions use the real policy helper. Content/counts/map artwork are illustrative. This is browser evidence, not a native device capture.
- Preview Library ID: `libfile_68cc894ec8688191ad128ef706d14648`; HTML: `libfile_c62ce339d2ac8191b94e3d305ea411a5`.

## Native checks still required before release

On iOS, verify initial sheet paint, expanded/minimized layouts, repeated open/close, finger tracking, slow pull/flick/reversal/cancellation, and scroll-versus-dismiss arbitration on hero/description. Verify lightbox/buttons, horizontal browsing, modal tab targets, VoiceOver escape and Reduce Motion. This is essential because the static child layout protects a previous native visibility regression; browser rendering and Jest do not prove native paint.

At overview and street zoom, verify both puck and count, true leader anchor, separate marker/recenter taps, nearby clusters, interest/time filters, pan/rotate/zoom transitions and screen edges. Verify Android native markers and temporary retap targets after dismissal. No physical iOS or Android native validation is claimed for this candidate.

## Integration touchpoints

- `app/(tabs)/map.tsx`: removes cluster selection camera movement; wires eligible collision candidates and map-idle refresh; displaces display coordinates in both renderers; adds leaders; preserves Android displaced marker identity and retap geometry; keeps the puck visible at overview zoom.
- `components/map/EventCallout.tsx`: wires the translation surface and content gesture while retaining static iOS layout, stable scroll enablement, resize controls, lightbox and tab behavior.
- New focused files: `CalloutDismissSurface`, `useCalloutPullDismiss`, `useClusterPuckLayout`, two pure policy helpers and their tests.
- Baba's/parser investigation remains separate. No catalog repairs belong to this patch.
