# Date-only public activity compatibility and safeguard

**Not published.** Coordinator owns backend/parser work and the release gate. This frontend task changed no backend checkout, Firestore record or live service and performed no map interaction.

## Baseline and diagnosis

Source started clean at `24c79ec8f208ea87b38b47bfb7ad062245fe1c0c`, including accepted festival feature `f679613`. Fresh EAS Preview list/view still identify group `adcc56b3-74a2-4c9b-9e41-ada0a36a1342`, iOS update `01a13d1e-d6fd-73d7-9c19-2c80b36d72fe`, runtime `1.1.10`, release `9c653f0c9bbc8d1faa52655efb970ded46f4a6f1`. Source/release runtime trees matched before this change. Existing festival/browser/lightbox behaviour is retained.

A read-only synthetic probe of that baseline confirmed:

- API normalization/feed/detail preserve v2 unknown clocks and a discovery-only cutoff. Today/Tomorrow/Upcoming and expiry can use this contract; Now remains false.
- Missing start clocks fall back to midnight in the old schedule state. On the date, the shared summary rendered `Today at  • Started`; a future date rendered `Tomorrow at  • Time not provided`. The disclosure incorrectly claimed the organizer provided a start time.
- Calendar export silently defaults a missing start to noon before asking for an ending. A backend-only publication would therefore retain listings but would not be an honest complete UI solution.
- Public recurrence is supplied as resolved backend records; the public frontend does not materialize occurrences. `recurrenceUntilDate` is context, not an occurrence's expiry date. Private recurrence expansion is separate and unchanged.
- Existing multi-day area overview already derives `date_range_overview`; its accepted wording, filter behaviour and rich v2 authority remain separate and unchanged.

Relevant paths: `lib/api/firestoreEvents.ts` normalization/feed/detail; `store/mapStore.ts` detail merge/reconstruction; `utils/eventTiming.ts` state/text/disclosure; `utils/mapEventFilters.ts` filter facts; `utils/eventExpiry.ts` v2 expiry; `utils/eventSeries.ts` recurrence context; `utils/calendarUtils.ts` calendar action.

## Exact producer contract

Read-only inspected the coordinator's `functions/src/parsing/dateOnlyActivity.ts`. The frontend recognizes its exact reviewed policy marker rather than changing all legacy missing-clock records:

```json
{
  "version": 2,
  "timeZone": "America/Halifax",
  "scheduleKind": "timed_session",
  "schedule": {
    "start": { "localDate": "2026-10-16", "localTime": null, "timeZone": "America/Halifax", "status": "unknown" },
    "end": { "localDate": "2026-10-16", "localTime": null, "timeZone": "America/Halifax", "status": "unknown" }
  },
  "estimate": {
    "confidence": "low", "discoveryCutoffDate": "2026-10-16", "discoveryCutoffTime": "23:59",
    "method": "source_dated_activity_unknown_clock", "estimateVersion": "date-only-activity-v1"
  },
  "policyVersion": "honest-end-times-v2"
}
```

Legacy start/end clocks are both blank. Use `multi_day` only for a source-supported bounded range, with its actual final date. Do not invent a longer booking window, use recurrence-until as an occurrence end, infer all-day hours, or substitute post time. Both feed and detail projections must carry the contract; missing v2 otherwise falls back to the existing short unknown-end cutoff. Backend validation, unresolved-meridiem holds, unavailable-source holds and gate enablement remain coordinator responsibilities. Its current producer excludes recurring patterns.

The currently published Preview still has the old wording/calendar behaviour; this safeguard is unshipped. A later iOS Preview release alone would not establish compatibility for Production, Android or older installed bundles. Do not enable broad backend publication solely from Preview publication/fixture proof; the coordinator must account for all consuming release targets or explicitly gate delivery to compatible clients.

## Minimal frontend change

- `utils/eventTiming.ts`: recognize complete reviewed one-off contracts, validate matching real dates and final-date 23:59 cutoff, reject clocks/display estimates/recurrence. Explicit date-only states retain date-window discovery but never Now. Text says `Time not provided`; badge/disclosure identify both unknown clocks. Nonmatching policies and rich timed/all-day/until-close/area contracts retain existing handling. The normal timed path rejects the date-only policy marker immediately.
- `utils/dateUtils.ts`: omit `at` when no clock exists; show a bounded offer's source date range without hours.
- `utils/eventScheduleStateCache.ts`: include recurrence flags/pattern in invalidation because classification now depends on them.
- `utils/calendarUtils.ts`: this new policy's unknown start cannot become noon. Explain the missing start, offer the original source when supplied, and return without a calendar write. Timed calendar paths are unchanged. A user-selected start-time flow is not added by this small safeguard.

## Validation and rendered evidence

31 relevant Jest suites: **276 passed**, one existing opt-in synthetic detail-merge benchmark skipped. Coverage includes API metadata normalization for event/special, raw detail refresh/reconstruction, future/Today/Tomorrow/Upcoming, never Now, final-date midnight expiry, DST, recurrence exclusion/cache invalidation, invalid dates/stale contracts, overnight/timed/calendar preservation and accepted area overview. TypeScript passed; focused lint zero errors, existing warnings retained. Final small policy fast-path/import-order cleanup was rechecked separately.

Native `s24` / `emulator-5554`, existing debuggable `com.craigb.gathr`, runtime `1.1.10`, Metro from this source checkout. Genuine rendered shared `EventTimingSummaryText`, `EventTimingBadge` and calendar action use synthetic fixtures only. No AuthProvider, live event IDs, Firestore loader, map component or calendar write is invoked by the fixture. The normal route map was temporarily stubbed. Initial bundle resolution rejected a fixture import under the test directory; copying the synthetic factory into the documented temporary fixture resolved it. This initial error frame was not accepted as visual evidence.

- `01-today-tomorrow.png`: source-date labels and both-clock uncertainty badge; readable two-line wrap for Tomorrow.
- `02-disclosure.png`: honest explanation, without claiming a supplied start time.
- `03-calendar-guard.png`: no noon or calendar export, only the missing-time explanation.
- `04-date-range-offer.png`: full bounded-range label, no invented hours.

These frames were visually inspected for hierarchy, alignment and clipping. They prove native shared-component rendering, not a complete feed/lightbox interaction pass or iOS device adoption. The existing feed/lightbox components consume these same timing helpers/components and have no source edits here. Coordinator must independently review this evidence before any release.

Temporary root/index/map files were restored byte-for-byte and their hashes checked. Fixture source/data are retained as `.txt` documentation, not imported by runtime routes. Metro/emulator were stopped and the copied QA environment removed after hash verification. No OTA or new native build was performed.

## Recurrence string compatibility correction

Independent coordinator review found that saved one-offs use `isRecurring: "No"`; the original API mapping passed that string through, and the date-only guard rejected its truthiness. This was corrected before publication.

`utils/eventRecurrence.ts` now normalizes boolean/numeric flags and the legacy string false tokens (`No`, `false`, `0`, blank; trimmed, case-insensitive). Yes/true and other nonempty values remain true, preserving conservative handling of ambiguous flags. Feed normalization and raw detail refresh/reconstruction apply this to both `isRecurring` and `isRecurringInstance`, retaining absent detail flags rather than overwriting existing state. The date-only guard also uses it for already-persisted cached strings. The raw Firestore types now admit those saved representations; normalized app records remain boolean.

New synthetic tests cover top-level/metadata feed flags for events and specials, raw detail refresh/reconstruction, cached No→Yes→false and instance flag transitions, unknown-token exclusion, calendar protection for string No, and confirmed timed recurring calendar behaviour for string Yes. Ten focused suites pass: **82 tests**, with the existing opt-in benchmark skipped. TypeScript, focused lint (zero errors) and diff checks pass.

The coordinator independently reviewed and accepted the four shared-component screenshots. This correction changes data interpretation only; no layout/style change or repeat emulator run was needed. No OTA or backend/data change was performed. Broad backend enablement remains gated for all consuming clients.
