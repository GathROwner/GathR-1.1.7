# Upcoming date refinement

The Events panel owns this refinement; no extra map pill or native dependency is required.

## Calendar rules

- Any date retains the existing Upcoming definition: not Now, not Today, and not ended. The new windows are intersections with that definition. An already-active multi-day event does not become Upcoming merely because it extends into the chosen dates.
- Next 7 days is tomorrow through today + 7, inclusive, using device-local calendar addition rather than elapsed milliseconds.
- This weekend is Saturday–Sunday of the current local weekend. On Saturday only Sunday's eligible occurrences remain; on Sunday the window rolls to the next Saturday–Sunday because today is excluded from Upcoming. Monday through Friday target the coming Saturday–Sunday. Today is never added to Upcoming.
- Custom endpoints are inclusive calendar dates. Matching uses overlap with the resolved occurrence's active span, including multi-day and overnight occurrences. Version 2 observed/estimated endpoints, all-day dates, and conservative unknown-end discovery cutoffs follow the existing timing contract. Recurrence metadata never expands an occurrence or extends it to `recurrenceUntilDate`.
- Entirely elapsed, invalid, or reversed custom ranges become Any date. A partly elapsed range is trimmed to tomorrow. Leaving Upcoming clears its refinement. The existing active-app expiry ticker and foreground check normalize selections and re-evaluate rolling windows at the next local day.

## Shared filtering

`utils/mapEventFilters.ts` supplies schedule context, time/category/search matching, and pending date counts. Map store filtering, cached time/category counts, interest side-pill counts, carousel filtering, and Area lightboxes use it. Schedule evaluations are shared through the existing schedule cache; window resolution is cached within each evaluation context.

The selected Upcoming chip and Events numerator reflect the applied refinement. Other When chips show the results of switching to that time filter. Date choices ignore the currently applied window while retaining category, search, and type visibility. Choose date initially counts tomorrow, or the applied custom selection, matching the calendar's initial pending selection. The existing Events denominator remains the viewport total.

Category counts retain their existing faceted behavior: selected time/date and search apply, while the current category is excluded so users can switch categories. Interest carousel contents retain the accepted chronological ordering. Clusters are built from the filtered event set, so callouts do not inherit out-of-range events from nearby venues. Date changes close a prior callout snapshot.

## Interaction

Upcoming reveals a compact two-column date-choice section. Category is initially collapsed and can be expanded. The custom-date sheet applies only on **Show N events**; closing it discards pending changes. Its count updates against the same viewport and other filters. Single-day/range modes and month navigation use plain React Native components.

## Verification

Focused tests live in `utils/__tests__/upcomingDateWindow-test.ts` and `store/__tests__/upcomingDateFilter-test.ts`. Run them with `TZ=America/Halifax` and `TZ=UTC`, plus the existing expiry, latency/cache, callout-selection, and carousel-order suites. Android evidence and test logs are kept in ignored `artifacts/upcoming-date-filter-20260925/`.
