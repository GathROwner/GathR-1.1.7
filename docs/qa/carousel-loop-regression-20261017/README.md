# Carousel lightbox looping investigation

Status: **candidate only, not published; final native visual verification incomplete**.

Functional candidate commit: `43e826f2985078df1f06be6c3413168997fd98b3`, on `codex/carousel-boundaries-20261017` in the carousel-boundaries worktree. This commit retains every accepted change from5c19e75.

Accepted baseline: checkout `carousel-boundaries`, branch `codex/carousel-boundaries-20261017`, HEAD5c19e75; live iOS Preview source8e934a1, OTA01a14a02 / groupb592824e-f83c-443e-ae28-be7eac0f1e73 / runtime1.1.10. Fresh Preview list matches that baseline. No concurrent checkout or release owner observed.

## Findings

Two independent hosts exist. Category/interest pills use InterestsCarousel local state, exact source events/index, loopNavigation=true, and the approved event counter. Trending flame/manual and startup/auto use openTrendingLightbox -> mapStore.selectedImageData -> GlobalEventLightbox in app/(tabs)/map.tsx. That host omitted loopNavigation; the shared lightbox defaultfalse caused both its arrow destinations and its saved-ref swipe handler to stop at first/last. isTrending controls appearance/hero relevance, not looping.

This Trending inconsistency also exists at pre-change5b3912f. It is **not proven to be a regression introduced by the last release**, nor is the user's exact failing category/Trending route confirmed yet. The previous native QA covered category caller wiring only and missed this separate host.

Category source guards are unchanged from baseline: navigation refuses a destination absent from cluster/venue context. Source-list reconciliation preserves event identity after live reordering and resets index accordingly. Current tests reproduce valid category looping across2/3 distinct venue/cluster contexts and live list reordering. Missing category context can still prevent navigation; no source evidence establishes that as Craig's failure, and no speculative fallback/location rewrite was added. Trending already tolerates missing viewport context and preserves the source list.

## Candidate

Only runtime change: four lines on the actual GlobalEventLightbox caller enable loopNavigation for exact sources trending_manual/trending_auto. All other global callers remain bounded: city_event_marker, deep_link, route_summary, friend_presence, friend_event_resume. Callout paging is untouched. Accepted separator geometry, finite2rail, dots, anchors, category event counter, arrow labels/alignment, hero/gallery and all gesture code remain unchanged.

## Evidence

New GlobalEventLightbox tests evaluate the actual production host body in isolation, with actual openTrendingLightbox and a Zustand store; they do not manually turn on the lightbox flag. Boundary destinations pass through the host callback and verify event IDs, separate destination venue contexts, preserved manual/auto source and close behavior. Before the fix4manual/auto x2/3boundary cases failed;6unrelated/context cases passed. After the fix all10pass. Category caller tests additionally cover distinct contexts and live reordering.

The existing Trending ranking test fixtures are dated2026-09-13. Running them on2026-10-17 initially failed all7 because those events had expired. The test clock is now pinned to the fixture date at noon; no ranking/filter/runtime code or assertions changed.

Native reproduction uses the existing installed Android debug client, unchanged1080x2400/density480/360dp. `01-before-trending-first.png` renders the actual pre-fix GlobalEventLightbox body, copied verbatim from the production source (provenance retained), real openTrendingLightbox/manual and real EventImageLightbox. It shows Trending1/2 with no previous arrow, confirming the bounded first state. Synthetic events are split across distinct venues/clusters. No MapScreen or Mapbox map is mounted; the backdrop is a static reference. `00-before-fixture.png` documents the source-path controls.

The emulator's qemu process crashed twice with Windows exception0xc0000005 while checking Trending. The existing AVD was restarted without data clear/reinstall; an alternate documented software renderer was selected. Automatic approval review then blocked reconnecting to the fixture and requesting the localhost development manifest, reporting only "blocked by policy." After fresh direct user approval to connect, one bounded attempt was rejected again for the same generic reason. No equivalent action was attempted through another mechanism. Read-only source provenance checks, a read-only current-screen capture, and local cleanup/tests continued. See REJECTION.md for exact requested commands, authorization and screen/client state.

**No native post-fix boundary screenshot is available. No iOS adoption proof. Do not publish this candidate until independent review accepts the source and the missing native verification is resolved (or Craig explicitly directs otherwise).**

## Restoration

Original root/index restored byte-for-byte. Map restored to the exact intended candidate snapshot (baseline plus the four-line prop), with no QA route stub retained. Both temporary fixture root modules and QA environment removed; owned Metro stopped. `restoration.json` records matching hashes and the exact intentional map delta. Installed application/data preserved, no backend/Firestore/Production/Android publication or native build.

Final restored-source validation:7suites /65tests pass, TypeScript passes, lint0errors /215existing warnings, diff check passes. The existing accepted runtime implementation is unchanged outside the four-line global host prop.
