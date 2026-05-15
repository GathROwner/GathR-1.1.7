# Android callout retap investigation - 2026-05-15

Workspace: C:\Windows\System32\GathR-Project\GathR-upgrade-sdk54
Branch: codex/android-defer-callout-teardown
Device: Samsung SM-P610 via adb serial 192.168.4.46:33667

## Problem

After closing a dense Android map callout, visible clusters often did not accept another tap for several seconds. The slow path was clearest in dense downtown callouts.

## Evidence before the final fix

- Earlier dense evidence was about 5.4s from close handling to the next accepted cluster press.
- `deferred-teardown-run3-projected-retap-20260515-153000` still showed close handling at 15:30:04.050 and retap cluster press at 15:30:09.337, about 5.3s.
- The retap overlay target was valid, so the delay was not just bad tap coordinates.

## Fix applied

Android close now uses a soft close path:

- Hide the old callout natively immediately.
- Move the parent callout container offscreen and below the retap layer.
- Arm retap hit targets via refs so the next tap does not wait for React state to commit.
- Defer `selectVenue(null)` and rendered-callout teardown for 2500ms unless a new cluster opens first.
- Keep the retap layer below the active callout while open, then let it become reachable only after the callout container is hidden.

## Final measured run

Artifact set:

- Video: `artifacts\soft-close-run8-clean-20260515-154830.mp4`
- Log: `artifacts\soft-close-run8-clean-20260515-154830-logcat.txt`
- Screenshot: `artifacts\soft-close-run8-clean-20260515-154830-after.png`

Important timestamps:

- `15:48:38.563` close tap sent.
- `15:48:39.439` Android close handler ran (`ANIMATE CLOSE - immediate Android close path`).
- `15:48:39.460` retap overlay activated.
- `15:48:41.371` first post-close retap sent.
- `15:48:41.729` retap overlay accepted cluster press.

Result:

- Close-handler to accepted cluster press: about 2.29s in the clean run.
- First post-close retap was accepted; the previous repeated dead-tap period did not reproduce in this run.
- Compared with the earlier about 5.3s dense run, this is roughly a 57 percent reduction for the measured close-to-accepted-press window.

## Notes

The remaining delay includes adb input overhead and the tablet taking about 0.9s to process the close tap in the clean run. The app-side repeated-retap block is substantially reduced, but this will not be truly instant on the older tablet.
