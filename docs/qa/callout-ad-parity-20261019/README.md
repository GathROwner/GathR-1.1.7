# Callout SDK ad formatting parity - October 19, 2026

Craig accepted the feed ad formatting and requested it in callouts too. Normal SDK-backed callout ads now reuse FullSizeSdkAdCard, carrying portrait B / landscape H2, 47% proportionate portrait media, Sponsored above right-hand details, theme, corrected outer spacing, zero-ratio video fallback and SDK-owned media/AdChoices into both callout tabs.

## Implementation and boundaries

CompactSdkAdCard becomes a mount-gate wrapper around the exact shared accepted presentation. It retains the iOS two-animation-frame plus 60ms delay and cancellation; readiness is tied to the exact SDK object, so a replacement cannot inherit the old object's ready state. Android remains immediate. The waiting state is the shared plain loading skeleton with no native ad/asset/media view; it can measure the actual callout width before native attachment. It does not create a hidden ad, clone an ad or reload the pool.

EventCallout.tsx is unchanged: existing SDK mode selection, initial callout layout gates, tab/venue keys, controls, gestures, scrolling and 12-point ad spacing remain. Its ScrollView sizes rows to content; no fixed ad row height needs removing. CompactNativeAdComponent remains the explicitly non-SDK emergency fallback and pre-mode placeholder, with its wrapper/media suppression safeguards unchanged; it is not re-enabled by this change. CompactCalloutAdWarmup is unmodified and has no app import in this baseline. No map operation or device/emulator manipulation occurred.

FullSizeSdkAdCard and nativeAdLayout are unchanged from the user-accepted source 91c044bf889f46bfef23b24e98e303dc8704cd84. Future normal feed/callout style changes now share one implementation instead of two copies. Existing saved-list optimizations/deferral remain intact. Production remains held; only iOS Preview is in scope.

## Verification

- Eight suites / 60 tests pass. Eight new callout integration cases cover two frames + exact 60ms, portrait/landscape/unknown ratios, one original native ad/media/asset set, measurement while waiting, replacement-object readiness, cancellation/unmount, loading/null and immediate Android with disabled media. Existing shared-card and saved-feed suites pass.
- TypeScript passes. Full lint exits zero: 0 errors / 215 existing warnings. Whitespace check passes.
- [Reviewed fixture screenshot](rendered-fixtures.jpg): actual CompactSdkAdCard and FullSizeSdkAdCard through RNW at matching widths. The settled layout uses the immediate non-iOS branch solely for rendering; the iOS mount timing is independently tested in React tests. SDK media/overlay is simulated, not a native map/callout capture. Ten fixtures reviewed, including eight callout states across portrait, landscape, square, zero-ratio video, no media, dark, narrow and large text; matching feed portrait/landscape fixtures have identical rendered card markup and dimensions. No horizontal overflow. Rendered layout is verified; real iPhone callout scrolling/video/SDK click behavior and adoption remain pending.
- Expected live iOS Preview baseline queried before assembly: source 91c044bf889f46bfef23b24e98e303dc8704cd84, OTA01a153c9. Publication/readback in RELEASE.md.
- No native/dependency/config/runtime, backend, live-data, Android release or Production changes; no paid build.

Ignored raw tests, renderer, screenshot, metrics and release checks: artifacts/callout-ad-parity-20261019/.
