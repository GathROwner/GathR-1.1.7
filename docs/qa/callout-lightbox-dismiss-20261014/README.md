# Callout lightbox swipe-down correction

User reported on physical iOS that the new lightbox pulls down then snaps back, including single-event venues. Baseline: source `3d99578`, current iOS Preview release `0fb543a141a768ffeea08fe60a146a75f0805abe`, group `bcc898a5-141c-4a7b-831b-85f3e472fb5c`, update `01a13b26-6ce0-737f-aa2b-8c3c5520cff3`, runtime 1.1.10. EAS list/view independently refreshed before functional edits.

## Diagnosis and correction

The newly introduced handler required END with `oldState === ACTIVE`, finite release velocity, and either 150 points of travel or a 650 points/second flick. It rejected CANCELLED endings that the previously working handler accepted. Separately, the shared drag listener calls `backgroundOpacity.setValue` on every queued gesture event. Such a write after release can interrupt the fade, stop its parallel close animation, and yield `finished:false`; the new completion guard then skipped onClose. The prior completion callback did not require `finished:true`. These are concrete code paths; the exact native event sequence on Craig's iPhone was not captured and is not claimed proven.

Extracted a stable, independently tested callout-only dismiss hook. Accepted close transitions ignore late terminal events and queued fade writes. Completed pulls no longer depend on oldState or finite velocity when sufficient distance exists. Downward distance threshold is 80 points; deliberate flicks need at least 20 points and 300 points/second. CANCELLED pulls close only after sufficient downward distance; FAILED, upward, sideways and tiny gestures stay open. Closing callbacks are current, delivered once, and invalidated on unmount. Reduce Motion remains supported. Removed a redundant disclosure-reset effect (the existing event-ID effect already does it).

The hook remains attached only to callout media; description scrolling cannot dismiss or page. Single-item lists use the same dismissal hook independently of horizontal paging. Global/carousel/list-tab legacy gesture handlers, page layout, hero height, venue identity, native configuration, and the accepted push-token fix remain unchanged.

## Native rendered checks

Existing s24 Android debug client (`emulator-5554`, `com.craigb.gathr`, runtime 1.1.10) served Metro from this worktree. Reused the prior real EventCallout fixture with the map route replaced by an empty component and minimal root/index fixture. No map mounted or interacted with. No APK replacement, app-data clear, backend deploy, event document creation, or ad click. A System UI boot ANR recovered using Wait before acceptance captures.

Reviewed each destination before the next action:

- `01-callout.png`, `02-event-open.png`: fixture callout and Event 1/3.
- `03-short-pull-closes.png`: image pull 285 physical pixels (95 points) over 750ms closes to the original callout.
- `04-reopened.png`, `05-description-protected.png`: reopening works; downward description pull at top does not dismiss.
- `06-horizontal-still-pages.png`: horizontal image swipe reaches Event 2/3 and stays open, with gallery, title and description intact.
- `07-gallery-pull-closes.png`: longer slightly diagonal gallery pull closes correctly.
- `08-single-callout.png`, `09-single-open.png`, `10-single-pull-closes.png`: other venue with one event, no counter/arrows, same shorter image pull closes.

All captures show the existing spacing/hierarchy with no new visible UI. Temporary app/root/map files restored byte-for-byte before final validation; QA environment copy removed, Metro stopped and task-launched emulator closed. Android shared-JavaScript verification is not physical iOS verification. Craig's device must independently confirm the correction after publication.

## Regression checks

The new hook tests cover END without oldState/final velocity, CANCELLED long pulls, duplicate/late terminal events, queued drag fade writes after release, short/up/side/failed gestures, current close callback, interrupted-close retry/unmount, and Reduce Motion. Existing horizontal paging, reading mode, layout, gallery, callout transition and push-registration suites are included in release checks. No production debug logging added.
