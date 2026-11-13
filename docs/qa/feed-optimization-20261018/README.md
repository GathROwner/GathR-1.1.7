# Targeted feed optimizations — October 18, 2026

Craig approved the two measured frontend candidates: narrow per-card like/interest updates and reuse filtered venue grouping during pagination. Live-count listener changes, broad screen rewrites, backend work and Production releases are outside this patch.

## Baseline

- Owned checkout remains carousel-boundaries/GathR-upgrade-sdk54; new branch codex/feed-optimization-20261018 from accepted checkpoint1808d5f.
- Fresh EAS readback confirmed iOS Preview update01a14b4f-9f31-7e59-9002-7564147d1252/group14c93e61-7c95-4601-8316-cd89f9af0b42, source1416f83882fd4c111d590727f954885c8d518e0e, runtime1.1.10. That source is an ancestor.
- Commit118fd98 carries the10 exact accepted Android dock/check-in/scale runtime/test files fromad38037 into this branch. Preview version/runtime and all native/config/dependency files remain identical to the live Preview baseline. No accepted Android code is silently dropped, and no older shell is renamed to1.1.20.

## Implementation

- Both Events/Specials cards use useEventPreferenceFlags: two primitive per-ID selectors. Other cards' choices no longer cause these subscriptions to redraw the card. Actual optimistic-action snapshots read the complete current arrays from getState at tap time, so another card's choice is retained even when this card did not rerender. Existing service calls, error rollback, calendar actions, analytics, count updates and guest controls are preserved.
- createVenueFeedGrouping creates one membership/key/start-time cache per filtered-input snapshot. Viewport groups preserve ranked-input duplicate precedence and include every matching sibling. Outside venue positions still use the original ranked prefix followed by filtered source order; the full outside input wins duplicate IDs. Only displayed outside groups are chronologically sorted/materialized, with complete page contents and stable group/event-array references reused across pagination.
- Total outside venue count remains distinct from materialized page length. Both screen integrations keep NativeAd demand, every-four-row placements, fallback behavior and divider record counts unchanged. Existing score/filter functions and pagination limits are untouched. The original grouping helper remains available unchanged.
- Caches are scoped to the current filtered snapshot and become collectible when it is replaced. Inputs are not mutated. This trades retained membership indexes for less repeated processing; physical memory/battery/network/store-size savings are not claimed.

## Evidence

- Final focused selection:12 suites/94 tests passed, including new selector/action-time-snapshot, grouping, actual-screen list/ad-builder comparisons, existing venue pager, lightbox navigation, event timing, filter summary, tap guard, check-in control and accepted Android inset/scale tests.
- New grouping test compares480 complete mixed identity/timing/pagination cases against the unchanged original implementation. Additional216 scenarios execute both actual screen list-builder callbacks against frozen pre-change callbacks from118fd98, preserving rows, ad objects/keys/positions, dividers and pagination counts. Explicit tests cover cached array identity, new filtered snapshots, duplicate precedence, complete siblings, partial order and avoiding date resolution for undisplayed venues.
- Real hook/isolated Zustand tests show only the affected one of12 cards rerenders after like/interest or rollback. Actual optimistic-update statements from each screen are executed to verify a choice made on another card survives without an intervening render.
- TypeScript passed. Full Expo lint passed with0errors/215existing warnings. Native/config/dependency comparison against the live Preview source and git diff check passed.
- First combined preserved-feature run hit the existing first check-in test's5-second cold-start timeout, with93others passing. Isolated unchanged check-in suite passed25/25; final entire selection passed94/94 in18.94seconds without changing timeouts.
- Implemented-code benchmark repeats the audit against actual new helper code, not only the detached prototype. Synthetic400-record workload across initial+three pagination steps: venue-key calculations5120→400; schedule-start resolutions4318→400. Local desktop v2 median grouping first pass8.41→1.68ms; three later passes18.43→0.95ms. These are grouping-only Node timings, not phone/app-wide measurements; see ignored artifacts/feed-optimization-20261018/grouping-results.json. A post-commit run will pin final source and be recorded in release evidence.

No map, emulator or physical app operation; no native build, store update, backend deploy or data write. No image/style/layout changes are part of the optimization itself. iOS Preview export/publication and actual adoption will be recorded separately in RELEASE.md. Final device responsiveness remains unmeasured.
