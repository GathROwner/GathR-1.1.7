# Interest carousel boundaries and lightbox event position

Runtime candidate: `e4a2d26`, descending from accepted iOS Preview `5b3912f925efdcb4f769c8c5f1bf0724d5c6ce9e` (group `9c307e8f-a5ee-427e-a116-232d2378f2ca`). Runtime 1.1.10. Only the interest-carousel caller enables the new lightbox badge/destination labels.

## Native evidence

Existing s24 / emulator-5554, installed debuggable com.craigb.gathr 1.1.10 (13), framebuffer 1080x2400, original density480 / 360dp window. Data and installed package preserved. Actual production InterestsCarousel, EventImageLightbox and ScrollingTabBar rendered against synthetic local events. A static user-supplied map reference plus fixture credit/scale/info chrome provides context; no Mapbox map was mounted or manipulated. This does not prove live map ornament integration, iOS device adoption, authentication or guest-description styling.

The 320dp rail is a real measured component-container constraint inside the unchanged 360dp device, not a density/font/screen-size change. Source marker171c296 is the last behavior commit; the final style-only alignment commit e4a2d26 was adopted after clearing Metro cache and reconnecting the native client. Refreshed06/07 XML places both arrow glyphs at y697..813; old labelled arrows were39px higher. Coordinator independently accepted refreshed06/07 and the360/320 carousel layouts.

- 01/02: exactly two finite cards, no duplicate peeks/separator; overswipe leaves the finite rail intact.
- 03: thirteen sources, preserving the currently anchored second source after a count change.
- 04: reverse swipe from first reaches last + passive separator + first, two whole144dp cards at360dp; straight arrows, equal halves and centered divider.
- 05: resizing preserves last/first boundary; two whole126dp cards +28dp separator at320dp.
- 06/07: Event1of2 / Event2of2; Last event / First event labels below horizontally aligned arrow circles.
- 09/10: settled native right/left hero swipes wrap first to last and last to first. Transitional captures were replaced only after verifying settled destination XML.
- 11: carousel at first after lightbox navigation from13to1, with original event identity/dots synchronized.
- 13/14: tapping last source opens Event13of13 and Exploring Visual Arts; First event returns to Event1of13 and Beginner Step & Tap. Each event has four gallery sources, proving the event badge is independent of photo count.
- 16/17: changing13to3to2 updates dots/geometry; two becomes finite again with no separator/clones.

No social, zoom, gallery, description, safe-area or dock layout changes were introduced. Other lightbox callers retain their existing loopNavigation behavior. Existing description/close gestures were not changed by this batch.

## Fixture restoration

`fixture.tsx.txt` is an inert reproducibility record, never a runtime entrypoint. Temporary root/index/map routes and qaCarouselFixture.tsx were used only for this isolated QA session. The original three routes were restored byte-for-byte; `restored-hashes.json` records SHA256 values matching the pre-QA snapshot. Root fixture removed, QA environment removed, app force-stopped, owned Metro stopped. No app data clear, installation, build, backend deployment or Firestore write.

## Validation

Focused tests cover finite1/2, looping3/13/20, variable-width slot geometry and real-only snap stops, responsive fractional anchors, missing source reset, first-drag ownership after a coalesced native layout notification, real source identity/count passed to lightbox, and caller-specific boundary labels. Existing programme/membership/cache/timing/source-order/gallery suites are included in the restored-app release check.

An earlier broad run against temporary QA routes failed the static cache-selector check because root/map were intentionally replaced. Those routes were restored before the release validation; no cache code or test assertions were changed to accommodate the fixture.
