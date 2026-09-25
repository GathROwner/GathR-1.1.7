# Upcoming interest carousel ordering

Implemented on `codex/upcoming-carousel-order-20260924` in
`C:\Users\craig\.codex\worktrees\f00f\GathR-upgrade-sdk54`, starting exactly at accepted
commit `eb7741974619281b6eea5659f8783d7f0d867a21`.

Code and automated verification are complete. **The candidate is not visually
verified on a device. No OTA was published and no backend, Firestore, or OSM data
was changed.**

## Root cause and actual data path

1. `lib/api/firestoreEvents.ts:fetchAllFirestoreEvents` accumulates API pages and
   retains insertion order when normalizing/deduplicating by identity.
   `lib/api/events.ts:fetchMinimalEventsFromSource` merges private-shared records;
   the map can also reuse its existing `allEvents` cache.
2. `store/mapStore.ts:fetchViewportEvents` composes public and friend candidates,
   partitions them by viewport membership without sorting, and assigns
   `viewportEvents` to `onScreenEvents`.
3. Camera reconciliation in `app/(tabs)/map.tsx` filters `viewportEvents` to the
   actual visible bounds, again preserving input order.
4. `InterestsCarousel` overlays the active interest/category criteria, then used
   only `doesEventMatchInterestCarouselActiveCategory`. The resulting array went
   directly to the `FlatList` and its lightbox navigation.

Consequently the cards inherited fetch/cache order. There was no chronological
sort or interest ranking in this carousel path. Sep 28 before Sep 25 was possible
even with correct category and time membership.

## Change and boundaries

- `components/map/InterestsCarousel.tsx` now calls the final card selector.
- `utils/interestCarouselOrder.ts` applies the existing selection predicate
  unchanged, then sorts Event slots only when Events time is Upcoming. It uses
  resolved schedule start ascending, then string event ID ascending. The sort
  works on new arrays and preserves event objects and membership.
- `utils/eventTiming.ts` exposes the schedule state's existing start calculation
  through `getEventScheduleStartLocalScalar`. The schedule state uses that same
  extracted calculation. V2 schedule fields, legacy fallback, instant-only
  timezone resolution, and date-only/missing-time fallback retain their existing
  meaning. These are event-local schedule minutes, not a new UTC interpretation.
  The materialized occurrence start is used, not the recurrence-until boundary.
- `utils/__tests__/interestCarouselOrder-test.ts` adds 15 regression cases.

Same-time events use stable identity even when incoming fetch order changes.
Unresolved dates do not gain eligibility; nonfinite sort keys are placed after
resolved keys if such a record ever qualifies. Date-only starts retain the
existing midnight ordering fallback without displaying an invented start time.

Now, Today, Tomorrow, and All keep their original filtered order. Specials keep
their exact positions and order, including mixed Family Friendly and City
carousels. Map-store arrays, cluster counts, category predicates, venue grouping,
check-in/social code, and card layout/styles are unchanged. No shared sorter used
by other surfaces was modified.

## Verification

All commands ran in the task worktree unless explicitly noted.

| Check | Result |
| --- | --- |
| Focused Jest: order, timing, Family Friendly | 3 suites, 30 tests passed |
| Relevant broader Jest | 7 suites, 75 tests passed |
| Full Jest confirmation | 86 suites passed, 2 failed; 541 tests passed, 9 failed; 1 snapshot passed |
| Baseline control of failing suites plus check-in suite | 9 identical failures on untouched `eb774197`; 24 tests passed |
| `npx tsc --noEmit --pretty false` | Passed |
| `npm run lint` with `CI=1` | Passed; 0 errors, 219 existing warnings |
| ESLint on all four changed source/test files | Passed; 0 errors, 0 warnings |
| `git diff --check` | Passed |

Relevant broader command:

```powershell
npx jest --runInBand --watch=false --silent utils/__tests__/interestCarouselOrder-test.ts utils/__tests__/eventTiming-test.ts utils/__tests__/eventScheduleStateCache-test.ts utils/__tests__/interestCarouselFamilyFriendly-test.ts utils/__tests__/eventViewport-test.ts store/__tests__/mapStoreExpiryGate-test.ts lib/api/__tests__/firestoreTimingFields-test.ts
```

Full confirmation: `npx jest --runInBand --watch=false --silent --json` (38.657 s).
The nine remaining failures are seven in `trendingUtils-test.ts` and two in
`cityEventLightbox-test.ts`. Their fixed Sep 13, 2026 fixtures are expired at the
Sep 24 test clock. The same nine failing names were verified against the accepted
baseline, using read-only test execution in
`C:\Windows\System32\GathR-Project\GathR-nearby-preview-release`; that checkout
remained clean.

The first full run had 539 passes and 11 failures, including a check-in timeout
and follow-on assertion. All check-in tests passed in both the isolated baseline
control and the complete confirmation run. Those transient failures remain
recorded in the raw initial log.

The first TypeScript/lint attempt used an incomplete dependency folder from an
older worktree. The task's local dependency junction was switched to the accepted
baseline's installed dependencies after verifying identical package-lock hashes.
Final checks above use that matching folder. No package or lockfile was changed,
and no shared dependency directory was modified.

Machine-readable counts and baseline failing names:
[check-evidence.json](check-evidence.json). Raw logs/JSON remain under
`artifacts/upcoming-carousel-20260924/` in the task worktree, including
`focused-tests.log`, `relevant-tests.json`, `full-jest-results.json`,
`full-jest-final.log`, `full-jest-confirmation.log`, `baseline-failure-results.json`,
`typescript-final.log`, `lint-final.log`, and `touched-eslint.log`.

## Device evidence and visual limitation

The GathR Android emulator QA workflow was used, preserving app data and Emma's
existing session. The existing `s24` AVD needed a cold boot without snapshot
loading after its normal startup stalled. Windows capture failed with
`SetIsBorderRequired failed: No such interface supported (0x80004002)`; binary-safe
ADB captures were used instead.

- Device: `emulator-5554`, 1080 x 2400.
- Package: `com.craigb.gathr`, version `1.1.10` (13).
- `run-as`: **package not debuggable**.
- Visible footer: **GathR 1.1.10 (13) · Preview**, **Runtime 1.1.10 · OTA 01a0bd13**.
- [Device probe](emulator-device-check.txt).
- [Existing OTA runtime screenshot](emulator-runtime-existing-ota.png), captured
  from the installed app and independently inspected. It confirms the existing
  runtime, not adoption of this candidate.

The installed release binary cannot run the candidate via Metro. The exact
[QA skill](C:/Users/craig/.codex/skills/gathr-android-emulator-qa/SKILL.md) says:
"Use a compatible OTA for runtime validation when authorized, or stop at static
validation and say why." This task explicitly prohibits OTA publication and
does not authorize replacing the APK. Neither action was taken.

**There is no trustworthy screenshot of the changed Upcoming carousel.** Its
chronological order, completeness, hierarchy, alignment, spacing, and polish are
therefore not visually accepted. No style/layout edits were made, but that alone
does not satisfy device visual QA. A compatible development client or a separately
authorized deployment is needed before checking the filtered carousel and its
swipe sequence on-device. Do not release on the basis of the existing-OTA image.

## Remaining risks

Device visual acceptance and iPhone behavior remain unverified. The nine baseline
fixture failures and the initial transient check-in failures are separate from
this patch. The sorter preserves existing event-local timing semantics and does
not expand recurring schedules or reinterpret ambiguous dates.
