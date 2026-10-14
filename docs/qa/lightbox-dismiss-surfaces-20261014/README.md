# Callout lightbox dismissal surfaces and gentler paging

Accepted source baseline `5d8382f7b66363fcac3ba915b3c74908c49cd78a`. Refreshed live iOS Preview: group `05f7b297-cc65-4108-9d5a-915f77bf9fcc`, update `01a13be9-8b83-722b-b19f-ca866e0c56c9`, runtime 1.1.10, release commit `e9e0081b79574a6e689d7f540fb1234dfe952266`. Craig accepted that update and requested downward dismissal from the title and venue header, noting fast horizontal motion.

## Changes

- Reuse the existing guarded dismiss hook through explicit native gesture surfaces on the venue header, image and title/badges. Description and fixed bottom actions remain outside dismissal. No extra rows, height changes or new artwork.
- Title's vertical recognizer fails on upward intent. The title ScrollView waits for both native horizontal and downward recognizers. If a long title has scrolled, downward movement scrolls back; the next downward gesture at the top may close. Only scroll-end/momentum-end updates top status, so reaching the top during a drag cannot enable dismissal mid-scroll. Page changes reset the callout title scroll. Legacy non-callout paths receive none of these new gesture props.
- Horizontal native completion 250 to 340ms; boundary/short-drag return 240 to 300ms, retaining cubic ease-out and Reduce Motion.
- Slower-motion frame review exposed a brief old-page flash. RN's native Animation completion calls user completion before synchronizing the ending value into JS (`node_modules/react-native/Libraries/Animated/animations/Animation.js`), and React layout effects can precede Fabric native mounting. Completion now defers the guarded commit through a microtask; the cached handoff snapshot remains visible until BOTH native recenter completion and destination page layout acknowledge readiness. A keyed inner page View supplies that native layout acknowledgement while the animated surface and its horizontal recognizer stay mounted. Stale layouts/queued commits cannot release a newer handoff. No arbitrary delay or permanent overlay. Current content is interactive after the cover fades.

## Native visual evidence

Existing s24 Android debug client, `emulator-5554`, package `com.craigb.gathr`, runtime 1.1.10; local ordinary dependencies passed Metro preflight and `run-as` succeeded. Exact source worktree served Metro. Minimal root and real EventCallout fixture, with map route replaced by an empty View: **no map was mounted or interacted with**. No APK/data reset, backend deployment or event-document writes. Cold boot had the known Android System UI ANR; dismissing it and force-stop/relaunch recovered. Failed startup and intermediate animation-trial recordings remain under Temp, excluded from final motion evidence.

Retained `isolated-fixture.tsx.txt` adds an overflowing title and a short linked description to the previous fixture. Reviewed:

- `01-title-close.png`, `title-close.mp4`, `title-close-frames.png`: downward drag beginning at title closes smoothly to the original callout. Recording shows the complete pull and dismissal.
- `02-header-close.png`: downward drag from venue header closes.
- `03-title-still-pages.png`: horizontal title swipe reaches Event 2/3.
- `04-long-title-scroll.png`, `05-long-title-return-stays-open.png`: overflowing title scrolls upward, then downward to its start without closing.
- `06-long-title-close-at-top.png`: a new downward title drag at the top closes.
- Final `mounted-page.mp4` / `mounted-page-frames.png`: reviewed left-to-right across rows; forward title swipe with slower eased completion, native-mounted destination handoff, no old-page/blank flash. Header/footer remain fixed. `08-mounted-page.png` shows real target content after handoff, with interactive navigation arrows present.
- Final `09-final-description-scroll.png`: vertical description reading remains on Event 2/3 and enters existing reading mode.
- Final `mounted-reverse.mp4` / `mounted-reverse-frames.png`, `10-description-reverse.png`: right swipe from scrolled description returns to Event 1/3, restores details/top-of-description, and has no previous-page flash.
- Final `11-address-tap.png`: address tap still asks before opening Maps; cancelled without opening another app.
- Final `12-final-title-close.png`: downward title close still works after forward/reverse paging and cancelling the address prompt.

Normal root/index/map files restored byte-for-byte against saved hashes after force-stopping the app; QA env removed after verifying its source hash; Metro and task-launched emulator stopped. iPhone motion/adoption remains a separate check after iOS Preview publication.

Focused tests cover queued commit invalidation, native layout/center ordering, stale layouts/completions, bounds, arrows, cancellation, Reduce Motion, description reading, layout/gallery and the accepted push-token paths. Normal app checks and independent clean-release checks are recorded with the release.
