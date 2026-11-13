# Adaptive native feed ad layouts - October 18, 2026

Craig selected portrait B (compact split) and landscape H2 (media first), and requested iOS Preview. Production remains on hold; no Android publication or native build is authorized here.

## Implementation

- Loaded SDK media proportions choose the layout before media is displayed. Portrait media sits beside details; landscape/square media sits above identity, CTA and body.
- Feed wrappers no longer force a fixed row height. Card dimensions follow content and actual measured row width.
- Unknown/zero-ratio videos retain a visible 16:9 frame. No-media cards are compact. Large text/narrow widths stack portrait content.
- One original NativeAd instance, one media view and one registration per supplied asset; Sponsored label and SDK AdChoices corner remain. SDK video fitting/controls stay SDK-owned. No pool/lifecycle/placement/ranking change.
- NativeMediaView's aspectRatio override remains undefined to prevent zero-ratio video collapse. Images use contain; embedded creative padding cannot be removed reliably.
- Accepted deferred-save movement and feed optimizations remain intact. Events/Specials only change the ad import and remove the wrapper's fixed height.

## Rendered visual review

[Reviewed fixture screenshot](rendered-fixtures.jpg) renders the actual FullSizeSdkAdCard with React Native Web and simulated SDK media/overlay. Eight fixtures: portrait B, landscape H2, square, unknown-ratio video, no media, dark portrait, narrow 320-point screen, and 160% text. Independently reviewed hierarchy, alignment, spacing, disclosure, CTA and next-card separation; no horizontal overflow. Normal portrait media 153 x 272 points; landscape 356 x 200; square 356 x 356. Large/narrow portrait media is capped at 420 points tall.

This is component layout evidence, not native Google SDK playback, ad click/impression or iPhone adoption evidence. Preview on-device acceptance is pending. No map was manipulated or tested. Fixture generator, measurements and raw checks are in ignored artifacts/ad-layout-20261018/.

## Validation

- Seven focused suites / 49 tests passed: new sizing and native asset registration/layout cases, plus retained preference subscription, saved ranking, venue grouping/row and feed integration cases.
- TypeScript passed. Lint result and publication identifiers are recorded in RELEASE.md.
- No dependency, native configuration, runtime, backend or Production change.

Primary references checked: [SDK wrapper native ads](https://docs.page/invertase/react-native-google-mobile-ads/native-ads), [Google media metadata](https://developers.google.com/admob/ios/api/reference/Classes/GADMediaContent), [Google native ad view integration](https://developers.google.com/admob/ios/native/advanced). Installed wrapper 16.3.3 exposes ratio at load; a missing/unknown ratio can be zero.
