# Callout lightbox horizontal motion

User accepted smooth swipe-down close, then reported missed horizontal advances and abrupt snap-back. Source baseline `abeea34`; independently refreshed iOS Preview baseline `1e6262c5bf12e58077668c2fcf31fd36b08d76d4`, group `bd64dc59-9496-4f6f-a5b7-00e22b800418`, update `01a13b5c-988e-7c38-8b00-6429b38719e7`, runtime 1.1.10. All accepted close behavior is retained.

## Findings and final behavior

- Vertical BEGAN previously reset horizontal paging even on an unrecognized vertical candidate (including horizontal swipes and arrow taps). Native media recognizers now compete for one axis; only vertical ACTIVE resets paging. Dismissal thresholds, fade and completion logic are retained.
- Lightbox paging previously reused the callout's stricter 48-point/650-point-per-second threshold and 1.35 axis ratio, and rejected all CANCELLED endings. Its own bounded classifier now accepts 20–32 points (5% of viewport width with clamps), or a same-direction 16-point/300-point-per-second flick. Native axis locking plus a 1.1 release ratio tolerates natural drift. Long recognized CANCELLED drags qualify by distance only; tiny, vertical, failed and duplicate releases do not advance. Missing release velocity cannot invalidate a sufficiently long drag. Actual native QA confirmed activation consumes travel: a 108-pixel finger drag produced a 23.52-point release, not 36 points.
- Page completion is 250ms with cubic ease-out; return is 240ms with the same easing, replacing the abrupt 160ms finish and stiff spring. Native driver remains enabled; Reduce Motion skips visible animation.
- Frame review exposed a separate handoff flicker between native view mutations and recentering. A read-only target snapshot covers that handoff until native recenter completion, then fades over 120ms. Its invisible cached content remains mounted until the next interaction to avoid recreating native animated props during the handoff. No engagement subscriptions, extra full lightboxes, timers or production debug logs. Adjacent/target preview category colors now use the existing category color function.

Scope remains local callout Events/Specials lightboxes, same venue and displayed list only, bounded ends. No venue switching, tab switching, extra counter rows, hero-height changes, description gesture changes or global/list/carousel gesture changes.

## Native rendered evidence

Existing s24 Android debug client, `emulator-5554`, package `com.craigb.gathr`, runtime 1.1.10, Metro from this exact source worktree. Reused the real EventCallout fixture from `../callout-lightbox-paging-20261014/isolated-callout-fixture.tsx.txt` and minimal root; map route replaced by an empty component. **No map was mounted or interacted with.** No app-data clear, APK replacement, backend deploy, event-document writes or ad clicks. Cold boot had launcher/System UI ANRs; acceptance testing began after recovery using the dialog controls/keyboard. Initial failed/revision captures are retained outside the repo under Temp, not presented as final acceptance.

Reviewed final source captures and native screen-recording frame sequences:

- `15-polished-second.png`: short forward drag reaches the correct second event, with gallery, long title and body aligned.
- `16-description-protected.png`: downward drag beginning in description stays open on the same event.
- `17-final-last.png`, `18-final-return.png`: arrow advances to Event 3/3; swiping beyond it returns gently and stays on 3/3.
- `19-final-close.png`: downward hero pull after paging and a boundary return closes to the original callout.
- `page-transition.mp4` and `page-transition-frames.png`: one isolated native swipe, left-to-right frame order across rows. Reviewed the 250ms transition and covered handoff; target content remains the intended event without old/neighbor flashes. Header and footer remain fixed. The snapshot fades into real target content without new UI rows.
- `boundary-return.mp4` and `boundary-return-frames.png`: one isolated native end-of-list pull and eased return; same event throughout. Black unused cells in the contact sheet are tile padding, not a blank app frame.

Earlier native passes also exercised reverse and diagonal swipes. The final timing/handoff was then reviewed independently in the retained frame sequences. Pixel animation feel on Craig's iPhone remains a separate acceptance check; Android Metro is not iOS adoption proof.

Temporary root/index/map files restored byte-for-byte before normal app checks, copied QA environment removed, Metro stopped, task-launched emulator closed. Final tests include native-commit covering, stale callback isolation, swipe sensitivity, axis ownership, duplicate releases, bounds, rapid inputs, arrows, Reduce Motion, reading/layout/gallery and the accepted push-token regression suite.
