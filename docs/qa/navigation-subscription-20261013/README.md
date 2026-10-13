# Main navigation subscription and test repairs

Craig approved repairing the date/check-in control test scaffolding, then narrowing MainNavigator's store subscription with measured evidence. Source baseline: `d8afa6d`, branch `codex/frontend-adjudicator-20261011`. Current iOS Preview baseline: `d91dcffe85b7fb83109418e53904b7a3d1b9c462`, group `075e90e3-c7e1-4dcf-b75f-f24739a5231c`, runtime 1.1.10.

## App change and measurement

The only production change is one line in `app/_layout.tsx`: select `state.setAllEvents` instead of subscribing MainNavigator to the whole map store. The exact same action is used by the unchanged cache/fetch hydration effects. No event data, filtering, UI, ads, check-in, timing, assets, native configuration or dependencies change.

`store/__tests__/mainNavigatorSubscription-test.tsx` extracts the actual checked-in MainNavigator hook declaration into an isolated React probe. It uses the real Zustand store with I/O dependencies mocked. No native app, navigation screen, map, GPS, network or ad surface is mounted. Sixty distinct store writes (20 each to zoom, search and callout-close state) are flushed separately to prevent batching from hiding subscription updates.

| Probe | Before renders | After renders |
| --- | ---: | ---: |
| MainNavigator subscription | 61 | 1 |
| Whole-store control | 61 | 61 |
| Search-only subscriber | 21 | 21 |

Counts include the initial render. This removes all 60 unrelated store-triggered renders in this controlled probe. The original `setAllEvents` action identity is preserved. Replacing that action still triggers a render and calls the new implementation with the original argument, avoiding a stale action reference. The regression test fails against the old declaration (expected 1, received 61) and passes against the candidate. Raw counts are in `subscription-before.json` and `subscription-after.json`.

This does not measure a full navigator tree, device FPS, launch time, RAM, battery, installed/download size or user-perceived latency. It is a contained reduction in unnecessary React work. No phone-speed claim is made.

## Test repairs

The date suite uses explicit Halifax summer offsets for its simulated July/August instants, rather than interpreting them in the test runner's local timezone. Assertions and production date logic are unchanged. The seven historical UTC failures now pass.

The check-in control suite supplies screen focus and canonical-venue service mocks and follows the accepted current flow. Git commit `c79c2a8` moved one-use binding to final privacy confirmation; `6ddb14c` separated canonical venues from the explicit external-place search. Tests no longer expect the previous screen layout, immediate external discovery, or an already-bound eligibility route. They assert readiness routes, no premature grant binding, private routes without coordinates/address, explicit external-place selection, venue selection across jitter, timeout/retry, interruption, late-result dismissal, no automatic navigation and no background-screen hint. There are 24 control tests, including movement clearing an external selection without substituting another business. These are synthetic component tests, not onsite check-in evidence.

## Validation and boundaries

Seventeen focused suites / 183 tests pass independently under UTC and America/Halifax; see `checks.json`. Coverage includes date/timing formats, sorting, expiry and hydration gates, series/cache behavior, Upcoming windows and rendered date components, filter model, readiness/privacy contracts, authenticated routes, check-in control behavior, store callout selection and the subscription measurement. TypeScript passes. Expo lint passes with zero errors / 213 existing warnings. `git diff --check` passes.

A broader diagnostic run also attempted the unchanged `CheckInReadinessObserver-test.tsx`. That separate lifecycle suite cannot load because its setup imports native AsyncStorage without a mock. The same load failure is independently reproduced on the unchanged live release checkout. It is not included in the 17 passing suites and is not fixed or claimed as passing here. This is not a claim that the entire repository test suite is clean.

No new visual/UX behavior was introduced. No runtime map manipulation, emulator QA or fresh visual acceptance occurred. Existing visuals are preserved by the unchanged component/style code; iPhone adoption and runtime behavior require separate device evidence. Publication details belong in RELEASE.md.
