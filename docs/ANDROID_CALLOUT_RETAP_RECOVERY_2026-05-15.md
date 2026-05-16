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
- Map-freeze experiment: `e4adc16` on `codex/android-freeze-map-during-callout`

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

### Follow-up candidate: keep clusters stable while callout opens

Artifacts:

- `artifacts/freeze-map-recompute-probe-20260516-130602-logcat.txt`
- `artifacts/freeze-map-skip-camera-marker-sweep-logcat.txt`
- `artifacts/freeze-map-skip-camera-close-retap-20260516-132154.mp4`
- `artifacts/freeze-map-skip-camera-close-retap-20260516-132154-logcat.txt`

Finding:

- The remaining lag was not caused by event data refetching.
- In the pre-fix probe, `events` stayed at `491` and `viewportEvents` stayed at `472`, but `clusters` changed from `14` to `22` while the callout was open.
- That cluster change happened after the Android delayed callout camera move, which re-centered/zoomed the map and forced reclustering.

Change:

- On Android, cluster taps now open the callout without scheduling the programmatic camera recenter/zoom.
- iOS keeps the existing camera behavior.

No-camera result:

- After opening a 7-venue callout, `events`, `viewportEvents`, and `clusters` stayed stable at `484 / 465 / 21` across callout render commits.
- During close-and-retap, those counts stayed stable at `484 / 465 / 21`.
- Close handler: `13:21:57.446`
- Retap overlay cluster press: `13:21:58.223`
- New `handleMarkerPress`: `13:21:58.285`
- New accepted cluster press was about `0.84 s` after the Android close handler in that run.

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
- Skipping Android callout camera recenter/zoom so opening a callout does not force a viewport cluster recomputation.

Remaining delay:

- Retaps are much better than the original broken state, but not instant.
- Some remaining delay is before the Android close handler fires and some is retap target projection/rendering under dense map load.
- The controls now return before the expensive teardown instead of after it.

## Recommendation

Use `codex/android-freeze-map-during-callout` / `e4adc16` as the current candidate for hands-on tablet testing.

If it feels good, the next cleanup pass should squash the candidate changes into a small branch from stable and remove temporary/high-frequency diagnostic logging before release.

## 2026-05-16 follow-up probes: remaining post-close lag

Branch checkpoints created during this round:
- `codex/android-disable-selected-marker-scale-probe` -> `165dcb9 Probe Android selected marker scale removal`.
- `codex/android-ref-retap-arm-probe` was tested and rejected; no keeper commit beyond its branch point.
- `codex/android-shorter-teardown-probe` was tested and reset to clean baseline; no keeper commit.
- `codex/android-retap-log-trim-probe` -> `2826114 Gate Android retap target projection logs`.

Tested hypotheses:
- Pre-mounting the Android retap overlay was rejected. Even when set inactive, the full-screen native layer made normal marker taps unreliable in this Mapbox view.
- Keeping Android retap hit targets warm after close prevented `androidHitTargets` from dropping from `13` to `0`, but did not materially improve close-to-retap timing by itself.
- Disabling Android selected-marker scale removed the visible selected-marker shrink, but timing stayed around `1.45s` to `1.51s` from close handler to accepted retap in comparable runs. Not a strong speed fix.
- Ref-only retap arming did not improve the first close path; first accepted retap stayed around `1.67s` after the close handler.
- Reducing deferred teardown from `900ms` to `450ms` did not materially improve the first close path. The scheduled teardown timer often did not run before the retap, indicating JS was busy during close.
- The heaviest remaining safe cleanup was the retap target projection console dump. It logged arrays of projected targets during callout close/effect cycles. `2826114` gates that log behind `MAP_TRACE_UI_ENABLED` and trims the sample from 12 targets to 3 when enabled.

Timing notes from this round:
- Prior stable baseline from earlier evidence: close handler to accepted new cluster was about `2.02s`.
- No-camera/stable-cluster candidate best earlier run: about `0.84s` close handler to accepted new cluster.
- Marker hydration / warm-target runs in this round were typically `1.45s` to `1.7s`, but were affected by temporary high-volume probe logging and noisy adb coordinates.
- After log trimming, one warmed segment showed about `1.10s` from close handler (`16:37:34.142`) to accepted retap (`16:37:35.244`), but the full harness run was not clean enough to treat that as final proof.

Current interpretation:
- The visible marker shrink is real, but it is not the main source of the remaining delay.
- The remaining delay is mostly the JS/render workload immediately after close starts. Timers and tap handling are both delayed while that work runs.
- Heavy debug logging in this path is worth removing/gating because it can distort tablet dev measurements and is not production-safe in a high-frequency map path.
- Further automated adb testing needs a clean visible marker target or manual tablet assistance; repeated branch switching/Fast Refresh left the viewport in states where visible markers did not receive adb taps even though the app process received touch events.
