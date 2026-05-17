# Android callout close visual stability - 2026-05-16

## Problem

After the Android callout closed, the map became interactable much faster after the retap work, but the selected cluster still appeared to "update" visually. On tablet recordings this looked like the cluster tree or rich marker details were recalculating immediately after close.

The concrete visual symptom was narrower than a cluster/data refresh:

- The selected marker stayed in place.
- Event and special totals stayed stable.
- The small category badge above the marker changed shortly after close.

## Evidence

Before this fix, close-burst captures showed stable counts but changing category badges:

- `artifacts/close-burst-20260516-1656-bottom-cluster-crop.png`
- `artifacts/pause-carousel-callback-guard-device-burst-20260516-2136/selected-marker-crop-sheet.png`

The second capture still flipped from a music badge to a dining badge shortly after close, proving that pausing the React `TreeMarker` carousel was not enough for Android.

After freezing the Android native layer category tick during callout close/cooldown, the device-side burst stayed visually stable:

- `artifacts/pause-layer-tick-device-burst-20260516-2142/selected-marker-crop-sheet.png`

Frames 0 through 15 kept the selected marker on the same dining badge with the same `7` event count and `2` special count.

## Fix

Android has two marker rendering paths:

- React marker components such as `TreeMarker` and `CategoryCarousel`.
- Native Mapbox layer markers driven by `androidCategoryCycleTick`.

The visible downtown markers in this test were using the native layer-marker path, so the effective fix was to freeze `androidCategoryCycleTick` while Android marker animations are paused during an open/closing callout lifecycle.

The final patch:

- Pauses marker animations while a callout is presented.
- Keeps marker animations paused for a short Android-only cooldown after close.
- Prevents canceled React carousel fade callbacks from advancing category index.
- Freezes the Android native layer category-cycle timer during that pause instead of resetting or advancing it.

## Result

Measured before/after from this investigation:

- Earlier stable retap path: about `2.02s` from close handler to accepted new cluster tap.
- Prior retap optimization branch: about `0.84s` in the same measurement style.
- This visual-stability branch preserves that faster retap behavior and removes the visible post-close category-badge flip in the captured tablet burst.

Validation performed:

- On-device Android tablet visual check with `adb -s 192.168.4.46:33667`.
- Binary captures used `cmd /c` redirection or device-side `screencap` plus `exec-out cat`.
- No app data was cleared.
- `com.craigb.gathr` was not uninstalled.
- No EAS build was run.
- TypeScript/lint were not run in this pass.
