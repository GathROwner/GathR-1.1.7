# Check-in readiness presentation — November 12, 2026

The readiness hint opened automatically when its daily prompt became eligible and sat below the interest-pill overlay (bubble z-index 11 versus the rail's parent layer 12). Craig requested manual expansion, a quiet button shimmer, corrected overlap, and dismissal by tapping outside as well as ×.

The automatic prompt effect is removed. Existing readiness validation, location collection, server preparation, countdown/ring presentation, private/public checks and privacy routes are unchanged. The persisted legacy prompt timestamp remains compatible with older clients and is no longer written by this control.

The manually opened hint sits above the pills. A separate transparent Pressable behind the hint consumes the first outside tap, closes the hint and disappears; the tap does not select an underlying marker or interest pill. The × remains. Normal ready-button taps retain the prepared place chooser. Hold the button for readiness details at any stage, or use the screen-reader action. Unready-button taps still show details and now toggle them closed. The touch target gains four points of hit slop. Details close when focus, foreground, enabled state or user changes.

The ready button gets a one-second white sweep after a 1.2-second initial delay, then at most once every 90 seconds. The decorative overlay cannot intercept touches. It uses the native animation driver without an interaction handle; timers and animation stop when inactive, unready, checked in, or the popup/chooser is open. Returning from an interruption retains a cooldown. Reduce Motion suppresses it. The cue follows actual private-check-in availability; it does not imply public-place preparation is complete or advance either ring.

## Visual and behavior review

[Before](before-open-390.png), [after](after-open-390.png), [detail](after-open-detail.png), [frozen shimmer frame](after-shimmer-390.png).

Actual ContextualCheckInControl, ReadinessRings and CheckInReadyShimmer JSX/styles rendered through RNW, with real Ionicons font. The surrounding map/pills, auth/readiness providers and routes are fixture substitutes; manual-open state and a midpoint of the decorative animation are seeded for static snapshots. This is layout/hit-layer evidence, not native Mapbox interaction or iOS adoption. No emulator was running; no device or map manipulation was performed.

Reviewed open and closed ready state, preparing state, the shimmer midpoint, and 320-point/160% text. The panel is complete and legible above the rail, alignment and spacing are preserved, the large-text title/settings wrap, and the prior one-line public-place subtitle truncation is retained. No horizontal overflow. Browser hit testing at the formerly obscured edge returns the hint after the fix instead of an interest pill. The outside area returns the dismissal target while open, and the interest pill again when closed.

Five focused suites / 56 tests passed: ContextualCheckInControl, CheckInReadyShimmer, ReadinessRings, checkInReadinessPresentation and checkInNoDwellCompatibility. Added behavior coverage for no automatic prompt, outside and × dismissal, ready tap versus hold/accessibility action, focus-return closure, cooldown, reduced motion and unmount. TypeScript, focused ESLint and git diff --check passed.

Source baseline: 2176e80 (contains the accepted ad layout and its Production receipt). A reversible checkpoint branch is codex/checkpoint-readiness-ui-20261112. Work remains local on codex/app-ui-changes; no OTA, native build, backend change or publication. Raw fixtures, source hash, browser hit results, screenshots and render script are in ignored artifacts/readiness-ui-20261112/; check logs are ignored artifacts/readiness-tests-final.log and artifacts/readiness-typescript.log.
