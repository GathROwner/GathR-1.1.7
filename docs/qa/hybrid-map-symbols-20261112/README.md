# Hybrid native map graphics and sizing

Craig accepted the preceding Hybrid layout, then requested a ring that touches its venue image, roughly ten percent smaller circles/summaries, and a real fix for pinches starting on the cluster. His phone test established that the preceding passive React touch wrapper did not fix native pinch initiation. Do not treat its synthetic touch tests as native pinch evidence.

## Implementation

Hybrid now uses **Mapbox PointAnnotation graphics**, replacing the UIKit `MarkerView` surface and the failed `HybridMarkerTouchTarget`. A native completed annotation selection invokes the same `handleMarkerPress` callback, with the existing readiness/processing gates. There are no React press/touch/responder handlers over the Hybrid graphic. Native map gestures classify tap, pan and pinch before selection. Other styles and tutorial targets keep their original MarkerView/TouchableOpacity behavior.

The installed RNMapbox iOS implementation snapshots the React children into a `UIImage` and gives that image to the map annotation manager. It does not create a UIKit view annotation at the photo. Its `doHandleTap` invokes the point-annotation hit test only from the native single-tap recognizer. Local owning sources are `node_modules/@rnmapbox/maps/ios/RNMBX/RNMBXPointAnnotation.swift` and `RNMBXMapView.swift`, pinned by the lockfile. The [public PointAnnotation documentation](https://rnmapbox.github.io/docs/components/PointAnnotation) describes bitmap rendering and explicit refresh after image loading.

The photo/category/friend/total graphic refreshes after decoding, layout and the existing three-second venue rotation. Image fades are disabled so snapshots capture decoded content. Two animation frames allow the native view update to commit; repeated refresh requests coalesce. Selected/inactive/reduced-motion pause behavior and static cluster-wide counts remain.

The expanding halo is a separate, noninteractive native CircleLayer with native paint transitions, keeping its motion without rerasterizing the graphic every animation frame. Its center follows the measured photo position and the existing viewport/puck offsets. iOS's four-point snapshot-size rounding is accounted for so the visible graphic and halo retain the original geographic anchor. Compact puck-clearance variants retain the existing measured bounds.

Ignored native selections reset only the affected point when a disabled tap occurs. Normal readiness/processing changes do not remount every annotation or reset every venue's rotation.

Photo and outer-circle diameters, summary text/icons/dividers/padding and friend badges are **90% of their previous dimensions**. The selected arc fills inward to the photo frame, leaving its 0.9-point border. The static house/count ring remains neutral. Normal ring-to-summary gaps scale to 3.6 points. All-zoom detail stays enabled.

## Visual review

Reviewed the [actual component render](actual-markers.png) across nine cases: one/two/three/four/many venues, missing photo, selected, category overflow and 126 venues. All photo widths measure 36 points (selected 43.2) in the medium-interest fixtures, exactly 90% of the old 40/48. The rendered arc inner edge meets the photo-frame outer edge with zero additional gap. Summary counts remain contained and friend badges clear both strips. See [geometry checks](VISUAL_CHECKS.json). These are React Native components rendered via RN Web with iOS props and SVG bridging; they are layout/polish evidence, not a native iPhone screenshot.

## Native Android fixture

The existing s24 debug client ran a standalone, ignored fixture importing the actual `HybridMapAnnotation` and `HybridClusterMarker`. It used fixture data and a local project image, with no Firebase app code or ads imported. No APK install, app-data clearing or production-data operation occurred. The original package entry point was backed up, compared and restored byte-for-byte; the fixture is not part of the production startup. The owned Metro server, temporary injection helper and headless emulator were stopped/removed afterward.

Confirmed native image decoding, rotating category/segment graphics, friend badge and fixed totals. A tap at the photo changed the fixture action counter from 0 to 1. A drag from that photo at screen (230,540) to (500,740) moved the map and photo while the counter stayed 1. A native double-tap zoomed from 15 to 16. Compare [before photo-start pan](native-before-photo-pan.png) and [after photo-start pan](native-after-photo-pan.png); [native receipt](NATIVE_CHECKS.json) records the exact boundaries.

The first SurfaceView capture had software-renderer artifacts; the fixture used TextureView for the input checks. Captures are washed out on this headless renderer, so the RN Web render supplies color/polish acceptance. Injected two-pointer gestures did not zoom **on empty map space either**, so the automated pinch check is **inconclusive**, not passed. Native iPhone snapshot appearance, pinch initiation and accessibility activation remain unverified. Source architecture and the passed native pan/tap checks support the release candidate; do not claim on-device iOS adoption from them.

## Validation and release

Final feature: `661e6a7`; test-only lint cleanup: `bd1c8ff`. Clean release commits: implementation `f883a173df4416cb6dd846bbbd55b615287ed5e9`, final `080c9a0c75f51aef689c86554fd9317055544617`, from live iOS source `4607456bdeed2a1ded723e0c83580df5c956ccd3` / group `9e7c6860-46b1-4d8e-b822-8b5683f4dc30`.

All 20 focused tests, TypeScript, Expo lint (zero errors / 227 existing warnings), Production Firebase/App Check/social guard, iOS Production configuration check, Mapbox preflight, clean source checks and clean iOS export passed. The preflight export used `f883a17`; the final change only cleans up test mocks, with no runtime-file delta. Clear-cache publication exports the final commit again. Native modules, config, dependencies and runtime are unchanged.

Raw logs/scripts are archived under ignored `artifacts/hybrid-map-symbols-20261112/` in the retained app UI checkout. Copy [render.cjs](render.cjs) to that artifact location to reproduce the component review with installed dependencies and local reference assets. Publication IDs and independent EAS readback are recorded separately.
