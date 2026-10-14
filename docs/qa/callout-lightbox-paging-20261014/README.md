# Callout-only lightbox paging

Implemented on `codex/frontend-adjudicator-20261011`, based on source `f61b339536866d6ca2155e06f4b8109cd4398bd5`.
Release must be assembled from current iOS Preview `0878859ee8f897570969175c3dcbd7ad69bf96d0` (group `0e76064f-9ac6-4777-bb36-310a93b30e2c`, update `01a13775-27a2-71f9-9d0e-16f2ee73e144`, runtime 1.1.10).

## Scope and behavior

Local Events/Specials cards in EventCallout snapshot their already-displayed same-venue list. Horizontal media gestures and arrow taps navigate bounded pages in that order. Events and Specials stay separate, and the lightbox does not switch venues. An upper-left media overlay reads `Event 1/3` or `Special 1/2`; singleton lists show neither counter nor arrows. Header and actions stay fixed horizontally. Swipe down on media closes; description gestures only read/scroll. Existing global, carousel, Trending and list-tab lightbox paths retain their default behavior.

Adjacent content uses two lightweight, noninteractive previews without engagement subscriptions or extra lightbox instances. A synchronous cursor and animation generations prevent duplicate/stale navigation. Native QA exposed an arrow-versus-failed-pan race and a stale native Animated offset on Fabric; the hook now ignores unrecognized-pan failure and explicitly recenters the native graph after committing, with stable adjacent translation nodes.

## Rendered verification

Android `s24`, `emulator-5554`, existing debuggable `com.craigb.gathr` version/runtime 1.1.10 (versionCode 13), served by Metro from this exact worktree. `00-dev-menu.png` verifies localhost:8081 connectivity. Android shared-JavaScript checks are not iOS adoption evidence.

Temporary root/index/map-route replacements mounted the real EventCallout with local fixtures and **no map**. Reproducible fixture sources are saved as `.tsx.txt`; all three app files were restored byte-for-byte from backups before final checks. No map was mounted, manipulated or tested. No new backend code or event documents were created. Real detail lookups for fixture IDs returned expected 404s. The existing authenticated staging harness was retained; no app data was cleared and no APK replaced. One mis-aimed venue-selector tap toggled the staging fixture favorite; it was immediately toggled back and visually confirmed unsaved. No ad was clicked.

Reviewed screenshots:

- `01-callout-list.png`: real callout list, Harbour selected, 3 Events and 2 Specials.
- `02-first-event.png`: first event, compact counter, next arrow.
- `03-mid-drag.png`: neighboring page moves in while current page exits; venue header/actions stay fixed.
- `04-second-event.png`: committed second event, long title, three-image gallery, both arrows, description reset.
- `05-arrow-back-first.png`: arrow returns to correct first event after native recenter fix.
- `07-description-down-at-top.png`, `08-description-horizontal.png`: description gestures neither close nor page.
- `09-description-scroll.png`: description scrolls and existing reading mode activates.
- `10-swipe-down-closed.png`: image swipe closes to the original callout.
- `13-past-end-stays-last.png`: unsupported swipe at last event stays on Event 3/3.
- `16-first-special.png`, `17-second-special.png`: separate bounded Specials list and correct titles/times.
- `20-single-event.png`: single event at another selected venue, no counter/arrows.
- `21-global-mode-unchanged.png`, `22-global-next.png`: global-data path retains legacy appearance/navigation without the new counter.

Hierarchy, alignment, spacing, long-title fit, gallery fit, gesture separation, and settled-page correctness were independently inspected in rendered native screenshots. Original and callout-mode XML bounds match exactly: panel `[0,0][1080,2328]`, header `[0,0][1080,323]`, hero `[0,323][1080,1187]` (864px). Counter consumes no layout height. These are fixture checks, not an on-device iOS or live-data/map acceptance claim.

## Checks

Normal app restored: TypeScript passes; Expo lint exits zero with 0 errors and 213 existing warnings; git diff whitespace check passes. Eight focused suites pass all 69 tests, including 14 new selection/gesture/race tests plus existing callout transition, lightbox navigation, reading mode, layout, gallery and push-registration tests. See `checks.json` for exact suite names. Release checkout is checked independently before publication.

## iOS verification still required

After publication, independently read back platform/runtime/commit/update metadata. Device adoption and iOS gesture acceptance require Craig's compatible Preview device; Android Metro and EAS publication alone do not prove either. Confirm the Profile footer update, open an Events/Specials callout card, test arrows/swipes/boundaries/description protection, and verify swipe-down close. No agent map testing is authorized.
