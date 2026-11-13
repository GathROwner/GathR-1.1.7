# Feed ad spacing refinement - October 19, 2026

Craig supplied six iPhone screenshots showing portrait B and landscape H2, then agreed to correct uneven right/bottom spacing and investigate portrait-looking video inside wide frames. This is additive to the previous ad layout and accepted deferred-save behavior. Target: iOS Preview only; Production remains held.

## Spacing diagnosis and change

Installed app config enables New Architecture. In react-native-google-mobile-ads 16.3.3, ios/RNGoogleMobileAds/RNGoogleMobileAdsNativeView.mm assigns a GADNativeAdView to Fabric contentView and mounts React children inside it. React Native 0.81.5 RCTViewComponentView.mm sets contentView.frame from getContentFrame(); LayoutMetrics.h defines that frame with content inset origin and reduced width/height. Yoga has already positioned the children using their parent's padding/border. Applying padding/border to the SDK view can therefore add a second offset, consistent with Craig's phone screenshots: excess left/top inset and clipped right/bottom content.

Move card padding, border, background and rounding onto a regular outer React Native View. The single SDK NativeAdView inside it has width 100% with no padding or border. Measure the outer card as before; media sizing still subtracts its 8-point padding and 1-point border on each side. All native assets/media/disclosure remain inside the SDK view. No SDK object replacement, pool change, refresh, filter/ranking or native change.

## Visual evidence

[Reviewed rendered comparison](rendered-fixtures.jpg) uses the actual old/new components through React Native Web. The two BEFORE fixtures explicitly model the installed native adapter's extra contentView offset; they are not real iOS captures. The eight AFTER fixtures retain that same modeled adapter, now without SDK-view insets. Independent review: balanced horizontal media margins, CTA inside the right boundary, portrait media bottom inset, readable text/disclosure, dark/light modes, no media, unknown ratio, narrow width and 160% text. Supplementary measurements: normal horizontal frame left/right 9 points, CTA right 9, portrait media bottom 9, no horizontal overflow.

This extends the earlier RNW-only fixtures, which did not model Fabric contentView insets and therefore missed this native-specific spacing problem. Real SDK video/clicks/AdChoices and on-device fix acceptance remain pending. No map interaction or emulator/device manipulation occurred.

## Wide-frame video investigation

The installed SDK returns mediaContent.aspectRatio/hasVideoContent/duration once in its load result. NativeAd.ts stores that snapshot as readonly mediaContent. Its video events signal play/pause/end/mute state, not a new orientation, video URL or inner visible-content bounds. No supported JS API here determines whether an otherwise wide video contains portrait imagery, letterboxing or changing backgrounds. In Craig's Coinbase shots, the interior changes between frames; screenshots cannot establish the reported ratio or prove which padding is baked into the creative versus SDK fitting.

Keep the SDK-reported layout and safe 16:9 fallback for unknown/zero video ratios. Do not guess from advertiser/headline/icon, crop video/controls or change layout after playback starts. No claim that these particular phone ads had ratio zero; exact per-ad SDK metadata is unavailable from the screenshots. No diagnostic flags, noisy logs, ad request preference or native module changes added.

## Checks

Seven focused suites / 52 tests passed, including three new cases protecting an inset-free SDK root and outer decoration. TypeScript passed. Full lint passed with zero errors / 215 existing warnings. No new dependencies, runtime/config, native code, backend or Production changes. Publication/readback and phone adoption status are recorded in RELEASE.md.

Raw render harness, modeled BEFORE source, metrics and checks: ignored artifacts/ad-spacing-20261019/.
