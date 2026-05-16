# Android callout retap recovery - 2026-05-15

## Goal

Reduce the dead time after an Android map callout is closed, especially on the older Samsung tablet where slow close teardown makes the map feel unresponsive.

The main user-visible problems were:

- The callout can physically disappear before the map feels clickable again.
- Filter/interest controls can remain hidden for several seconds after close.
- Dense downtown clusters make the delay easier to see.

## Test method

Tablet:

- Package: `com.craigb.gathr`
- ADB serial used: `192.168.4.46:33667`
- Screenshots/video captured through `cmd /c` redirection to avoid corrupting binary files on Windows.

Probe flow:

1. Open a dense map cluster.
2. Wait for the callout to finish opening.
3. Start logcat and screen recording.
4. Tap the close button.
5. Send repeated retaps to a visible cluster every roughly 0.5 seconds.
6. Compare close-handler time, retap acceptance, controls visibility, and deferred teardown timing.

Reusable harness:

- `artifacts/run-android-retap-probe.ps1`

## Branch checkpoints

- Stable baseline: `3f44256` on `codex/android-defer-callout-teardown`
- Mounted-controls experiment: `e471381` on `codex/android-controls-mounted-experiment`
- Controls-release experiment: `d37dd57` on `codex/android-controls-release-experiment`
- Retap-during-teardown experiment: `fac83a8` on `codex/android-open-during-teardown`
- Short teardown experiment: `c6c6d15` on `codex/android-open-during-teardown`
- Idle overlay unmount experiment: `d85fec6` on `codex/android-open-during-teardown`

Rejected or non-primary checkpoints:

- `732e3c1` forced broad control restore during close. It regressed retap recovery and should not be merged.
- `42eed04` skipped Android camera movement. It did not materially improve close-to-retap timing for this issue.
- `e52bfeb` released controls with React state only. It proved the direction but could be delayed/stale under retap load.
- `b84c103` added native control release. It needed the follow-up guard in `d37dd57`.

## Measurements

### Stable baseline

Artifact:

- `artifacts/control-baseline-repeat-20260515-160746.mp4`
- `artifacts/control-baseline-repeat-20260515-160746-logcat.txt`

Result:

- Close handler to accepted retap: about 2.02 s.
- First post-close retap was accepted quickly once the overlay had a valid target.
- Filter controls still waited on deferred teardown.

### Mounted controls only

Artifact:

- `artifacts/controls-mounted-standard-close-20260515-163438.mp4`
- `artifacts/controls-mounted-standard-close-20260515-163438-logcat.txt`

Result:

- Retap remained functional.
- Keeping controls mounted was useful groundwork, but by itself did not release controls early because `isCalloutOpen` stayed true until delayed selected-venue teardown.

### Final candidate: native controls release with guard

Artifact:

- `artifacts/guarded-controls-release-dense29-close-20260515-170558.mp4`
- `artifacts/guarded-controls-release-dense29-close-20260515-170558-logcat.txt`
- `artifacts/guarded-release-650ms-after-standard-close.png`
- `artifacts/guarded-release-no-retap-logcat.txt`

Timed retap result:

- Close tap: `17:06:00.255`
- Android close handler: `17:06:01.970`
- Retap overlay activated: `17:06:02.004`
- Accepted retap cluster press: `17:06:03.774`
- No stale `Android ancillary overlays released after close` log fired after the retap attempt.

No-retap visual result:

- Android close handler: `17:09:16.342`
- Deferred teardown scheduled: `17:09:16.413`
- Controls-release state alignment logged: `17:09:16.880`
- Deferred teardown ran: `17:09:18.946`
- Screenshot at about 650 ms after the close tap showed the callout gone and filter controls visible again, well before deferred teardown.

### Follow-up candidate: retap while old callout is closing

Artifacts:

- `artifacts/open-during-teardown-retap-20260516-120015-logcat.txt`
- `artifacts/open-during-teardown-d85fec6-marker-sweep-logcat.txt`
- `artifacts/d85fec6-close-retap-correct-close-20260516-122333.mp4`
- `artifacts/d85fec6-close-retap-correct-close-20260516-122333-logcat.txt`
- `artifacts/d85fec6-full-cycle-close-retap-20260516-122527-logcat.txt`

Invalid or partial runs:

- `artifacts/open-during-teardown-retap-20260516-120015-logcat.txt` showed no retap press or miss logs after close, which suggested the retap layer or native map was not receiving the scripted tap.
- `artifacts/d85fec6-close-retap-open-callout-20260516-121904-logcat.txt` used the wrong close coordinate and opened a special image/detail flow instead of dismissing the callout.
- `artifacts/d85fec6-full-cycle-close-retap-20260516-122527-logcat.txt` did not open the initial callout, so it is not valid close-to-retap evidence.

Useful run:

- Manual marker sweep proved the map can accept successive cluster opens on `d85fec6`: `Prince Edward Island Marathon` opened at `12:17:40.493`, then `Greco Pizza` opened at `12:17:42.533`.
- Corrected close-and-retap run:
- Close tap: `12:23:35.338`
- Android close handler: `12:23:36.258`
- Retap overlay activated: `12:23:36.280`
- Deferred teardown scheduled for `900 ms`: `12:23:36.322`
- Controls released after close: `12:23:37.021`
- Retap overlay cluster press: `12:23:37.680`
- `handleMarkerPress` reached: `12:23:37.746`

Result:

- The app accepted a new cluster press about `1.49 s` after the Android close handler.
- The previous `2500 ms` teardown wait no longer defines the minimum retap latency on this path.
- The old full-screen Android retap overlay no longer remains mounted during idle `hasPresentedCallout` state, reducing the chance that an invisible RN view blocks native Mapbox taps.

## Current interpretation

The expensive part is still the selected-venue/rendered-callout teardown, so that remains deferred. The useful fix is to stop making the map controls wait for that teardown.

The current candidate does that by:

- Keeping ancillary controls mounted while the map tab is focused.
- Hiding them while a callout is open.
- Showing them with native props immediately when Android begins deferred callout close.
- Aligning React state afterward.
- Invalidating pending release work as soon as any cluster press attempt starts, so controls do not stale-release over a new callout.
- Allowing a valid retap to flush the closing callout state and open the next cluster instead of waiting for old teardown.
- Shortening Android deferred selected-venue teardown from `2500 ms` to `900 ms`.
- Unmounting the Android retap overlay when it is idle instead of keeping a full-screen `box-none` view above Mapbox.

Remaining delay:

- Retaps are much better than the original broken state, but not instant.
- Some remaining delay is before the Android close handler fires and some is retap target projection/rendering under dense map load.
- The controls now return before the expensive teardown instead of after it.

## Recommendation

Use `codex/android-open-during-teardown` / `d85fec6` as the current candidate for hands-on tablet testing.

If it feels good, the next cleanup pass should squash the candidate changes into a small branch from stable and remove temporary/high-frequency diagnostic logging before release.
