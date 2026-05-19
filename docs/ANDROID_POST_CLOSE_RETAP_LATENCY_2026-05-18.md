# Android post-close retap latency probe - 2026-05-18

Branch: `codex/android-post-close-retap-latency-probe`

Base checkpoint: `244cd30 Stabilize Android marker selection teardown`

## Goal

Measure and reduce the time between the callout physically closing and another map cluster successfully opening on Android tablet.

## Current hypothesis

The native `MarkerView` layer can remain slow to accept touches after the callout teardown. The existing Android synthetic retap overlay helped only during the 900 ms deferred teardown window, then it was explicitly deactivated. If the user taps after that point, the app falls back to the slower native marker hit path.

## Probe added

Runtime logs use the prefix `[RetapLatencyProbe]`.

Tracked phases:

- `close_start`
- `retap_overlay_activated`
- `deferred_teardown_scheduled`
- `ancillary_overlays_released`
- `deferred_teardown_running`
- `deferred_teardown_finished_targets_retained`
- `retap_responder_release`
- `retap_overlay_miss`
- `retap_overlay_blocked`
- `retap_overlay_cluster_press`
- `retap_pressable_cluster_press`
- `marker_press_started`
- `marker_press_blocked_callout_rendered`
- `marker_press_blocked_processing`
- `marker_press_blocked_programmatic`
- `marker_processing_started`
- `marker_processing_completed`

## First code change under test

The projected Android retap targets are no longer removed during deferred callout teardown. After visual closing finishes, the full-screen responder switches to `box-none`, so only retained cluster-sized `Pressable` targets remain above the map. This is meant to preserve fast cluster retaps without blocking map interaction outside clusters.

The retained target window was shortened from 6500 ms to 4500 ms because the target cache is now intentionally kept after teardown instead of being killed at 900 ms.

## Final implementation

The first retained-`Pressable` version was not reliable by itself on the tablet after the full-screen responder stopped capturing. The final version keeps the retap overlay touchable while retained targets exist, but only claims the touch if the down event is within the retained cluster target radius. That preserves the fast synthetic retap path while still letting touches outside retained targets fall through to the map.

Additional changes:

- Added a native camera fallback using `MapView.getVisibleBounds()`, `getZoom()`, and `getCenter()` when cached camera state is missing.
- Retained projected targets after deferred teardown instead of clearing them at 900 ms.
- Deactivated retained targets immediately when any marker press is accepted.
- Left the latency probe code in place but disabled by default with `DEBUG_ANDROID_RETAP_LATENCY_PROBE = false`.

## Measurement protocol

1. Keep app data intact.
2. Use the existing installed dev client; do not uninstall or clear data.
3. Use explicit tablet serial.
4. Let Metro/Fast Refresh load this branch.
5. Open a dense downtown cluster.
6. Close the callout.
7. Tap another visible cluster every 500 ms until a new callout opens.
8. Compare `[RetapLatencyProbe]` timestamps from close start to `marker_processing_started` and `marker_processing_completed`.

## Results

Run artifacts:

- `artifacts/android-post-close-retap-latency-20260518/run1-logcat.txt`
- `artifacts/android-post-close-retap-latency-20260518/run2-logcat.txt`
- `artifacts/android-post-close-retap-latency-20260518/run4-delayed-retap-logcat.txt`
- `artifacts/android-post-close-retap-latency-20260518/run5-delayed-retap-coordinates-logcat.txt`
- `artifacts/android-post-close-retap-latency-20260518/run6-delayed-retap-pressable-logcat.txt`
- `artifacts/android-post-close-retap-latency-20260518/run7-delayed-retap-near-target-responder-logcat.txt`
- `artifacts/android-post-close-retap-latency-20260518/run8-final-repeated-retap-logcat.txt`

Before this pass:

- User-observed post-close dead time was roughly 3-4 seconds on the Samsung tablet.
- `run1` reproduced a concrete failure mode: the retap overlay activated with `targetCount: 0`, the first repeated tap missed at 1338 ms, teardown ran at 1362 ms, and the overlay expired at 4674 ms without a successful marker press.

Intermediate findings:

- `run4` proved cached camera state can be missing even when map dimensions and clusters exist. Native fallback populated 3 targets at 745 ms after close.
- `run4`/`run5` also proved retaining targets was not enough by itself; empty retained `Pressable` targets did not reliably receive post-teardown touches.
- `run7` proved the near-target responder path accepts a delayed post-teardown tap. Deferred teardown finished at 1086 ms, and a deliberately delayed tap opened the next cluster at 2575 ms. The measured number includes the scripted 2300 ms wait before tapping, so the important result is that the first delayed tap after teardown was accepted.

Final measured result:

- `run8` closed an already-open callout, then tapped the next cluster every 500 ms.
- Next cluster processing started at 1024 ms after close.
- Next cluster processing completed at 1043 ms after close.
- Compared with the user-observed 3-4 second dead period, this is roughly a 2-3 second improvement on the tablet.
