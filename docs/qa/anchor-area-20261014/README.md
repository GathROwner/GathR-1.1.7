# Festival locations and linked activities

Accepted source baseline: `a43cb201c26cdbbb7c1a7c30967625d4c7b4bf6a`. Current accepted iOS Preview baseline independently read from EAS: `61000417e27035c3884277b19ab2acb1c2c69f3f`, group `403b82f8-b605-4680-ac14-1a693c6f304b`, update `01a13c34-27e1-71dc-ad41-3b97f6a5d162`, runtime `1.1.10`. These are sibling histories with equivalent application/config/dependency/asset trees; release must start at the exact live commit and cherry-pick this feature.

## Behaviour

- Unordered area points retain verified coordinates. Identical coordinates form one pin with a venue chooser; no route line or invented coordinate offsets.
- Native hitboxes can return several adjacent features in drawing order. Select the nearest returned group to the tap coordinate rather than taking the first result.
- Venue programmes fetch explicit canonical `linkedEventIds` only. Require the linked venue and umbrella source date range, excluding missing, moved, cancelled, expired, private and recurrence-generated records. No title matching or venue/date discovery queries.
- Opening an activity checks its canonical record again. Its existing lightbox uses its own venue, media and timing; closing returns to the same venue programme. Existing callout paging and dismissal hooks are unchanged.
- Known venues without links retain location context and an honest empty state. Existing area points without canonical venue links retain their context callout.
- Blank-clock multi-day area overviews display the source date range and “See individual event times”. They remain discoverable through the final source date, never claim Happening Now, and do not display a fabricated estimate. Rich version-2 observed/estimated/all-day/until-close timing remains authoritative. Backend compatibility remains existing `multi_day` plus discovery-only cutoff; `date_range_overview` is derived in the app only.
- Both feed and raw detail reconstruction retain metadata area links and rich timing/timezone. Schedule-cache invalidation includes location scope because overview interpretation now depends on it.

## Native visual evidence

Android `s24`, `emulator-5554`, existing debuggable `com.craigb.gathr`, native runtime `1.1.10`, served this checkout via Metro 8081. No APK replacement or app-data reset. A cold-start System UI ANR was dismissed before acceptance captures.

`isolated-fixture.tsx.txt` records the temporary harness. `fixture-data.json` contains whitelisted public snapshot fields, exact eight-location/seventeen-child membership, and the proposed backend-compatible date-range contract. It preserves the existing Buy Tickets URL. Detail loading is local in this fixture; background live-detail replacement is disabled. This proves proposed-state shared-JS rendering and interaction, not the pending live Firestore repair or iOS adoption.

The real production `AreaLocationLayer`, `AreaLocationBrowser`, `EventImageLightbox` and paging/dismiss hooks were mounted. Map camera was fixed; scroll, zoom, rotation and pitch controls disabled. Only targeted visible pin taps were performed. No map panning/zooming/scrolling/recentering exploration.

1. `01-overview.png`: source date range, clean description, existing Buy Tickets, View Locations.
2. `02-fixed-map.png`: actual Mapbox point geometry, six selectable positions for eight venues, no connecting line. **Rendering limitation:** Lavapipe map colors/halos appear imperfect; this frame proves geometry and routing, not marker color polish or count badges.
3. `03-shared-pin-venues.png`: 155 Kent pin opens Tivoli, Trailside and Dali choices after nearest-feature correction.
4. `04-tivoli-programme.png`: eight explicit Tivoli activities, chronological dates and canonical clocks.
5. `05-canonical-lightbox.png`: first activity in the existing lightbox, own poster/venue/time.
6. `06-next-linked-event.png`: horizontal title swipe advances Event 1/8 to Event 2/8.
7. `07-return-to-programme.png`: downward title close returns to the same Tivoli programme.
8. `08-unlinked-venue-context.png`: Dali context with zero linked activities and no invented schedule.
9. `09-return-to-festival.png`: close browser and reopen the festival overview.

`linked-event-page.mp4` and `return-to-programme.mp4` record the native gestures. Screens were independently reviewed by the coordinating task before release authorization.

## Validation and restoration

27 relevant Jest suites: 257 passing tests, one existing opt-in synthetic detail-merge benchmark skipped (runs only when `GATHR_DETAIL_MERGE_REPORT` is set). Two city-lightbox tests initially failed because their September fixtures had expired; their test clock is now fixed to the fixture date. Follow-up focused checks cover final raw metadata scope and cache invalidation changes. TypeScript passed; full app lint exited zero with zero errors and 213 existing warnings; final changed-source lint and diff check passed.

Temporary app root and index were restored byte-for-byte before validation. The production map route was restored with only the intended feature integration. Fixture data/source and QA media live under docs and are not imported by runtime routes. Metro/app were stopped before restoration. Release export must independently confirm normal root/index/map sources and absence of fixture/test sources.

No backend service, Firestore record, Production channel, Android release or native configuration was changed by this frontend task. Coordinator owns the exact pending two-record live data approval/application. Publication and iPhone adoption are separate checks; release details are recorded separately after publication.
