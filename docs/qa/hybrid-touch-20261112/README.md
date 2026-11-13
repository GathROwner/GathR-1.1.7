# Hybrid rotation and map gesture candidate

Craig accepted the all-zoom Hybrid marker layout, requested faster venue swaps, and reported that zoom gestures near its large invisible bounds were being missed. The implementation checkpoint is `codex/checkpoint-hybrid-gestures-20261112` / `392b797`.

## Changes

- Venue rotation changes from six seconds to **three seconds**, retaining selected/inactive/reduced-motion pause behavior and static cluster totals.
- Remove the marker's fixed 140-point minimum width, 15-point horizontal outer padding and three-point vertical outer padding. Only attached friend badges may request a minimum width needed for their actual rendered extent. Visible pills/photo sizes, four-point normal ring gaps and all-zoom detail stay intact.
- Remove Hybrid's extra ten-point touch margin. Other styles and tutorial targets keep their existing touchable and margin.
- Hybrid uses a passive `View` touch observer instead of acquiring the React JS responder through `TouchableOpacity`. A single short stationary tap invokes the original cluster callback. Movement beyond six points, multiple touches, a remaining touch, a hold beyond 350 ms or native cancellation cancels the tap. It never reacquires a cancelled tap during the same gesture. Accessibility activation and readiness/processing guards remain wired to the same action.

No callout/navigation route, native module, Mapbox configuration or dependency changed. The native view-annotation rectangle remains; this is not pixel-shaped native hit testing.

## Diagnosis and limits

Installed RNMapbox's `RNMBXMapView.swift` applies `IgnoreRNMBXMakerViewGestureDelegate` to **single taps**, not pinch/pan recognizers. The native exclusion alone therefore does not establish why pinch gestures failed. The confirmed excessive marker bounds and the React touchable's responder ownership are the two scoped targets of this repair. No opt-in diagnostic trace or native iPhone gesture reproduction was collected; do not describe this as a proven native pinch repair or a race condition.

## Validation

All 20 focused tests passed in the clean release checkout, including stationary taps, no responder callbacks/extra hit slop, drags returning to their origin, pinch/second-finger cancellation, native cancellation, long holds, disabled state/accessibility, three-second rotation, static summaries and puck measurement transitions. TypeScript passed. Expo lint passed with zero errors and 227 existing warnings. Production iOS configuration, Firebase/App Check/social guard, Mapbox preflight and clean export passed.

The actual marker and passive wrapper were rendered through React Native Web with iOS props and fixture data/SVG bridging. Reviewed nine cases, including friends, selected, missing photo, category overflow and 126 venues. The accepted visual hierarchy, alignment and badge clearance remain intact. Typical four-venue bounds shrink from 143.34 to 113.34 points wide; a single no-friends case measures 112.98 points instead of 142.98. Actual wrapper and marker bounds match. This is component visual evidence, **not native gesture validation**.

- [Actual render](actual-markers.png)
- [Geometry measurements](VISUAL_CHECKS.json)
- [Reproduction harness](render.cjs) — copy to `artifacts/hybrid-touch-20261112/render.cjs` in the project before running.

Source feature `7bbc6ce`; clean release source `4607456bdeed2a1ded723e0c83580df5c956ccd3`; live base `aa25b83fb058af5ca679737ad15d14784a4a972e` / group `d3764dce-b974-4c85-a4b9-cb96fa095982`. Release IDs and independent EAS readback are recorded separately after publication. Raw evidence is archived under ignored `artifacts/hybrid-touch-20261112/` in the retained app UI checkout.
