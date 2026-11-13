# Split ads without a usable icon — November 12, 2026

Craig supplied a portrait business ad with a large blank area above its title. Business ads can supply icons too, so presentation follows the actual supplied asset rather than advertiser type. The screenshot does not establish whether the icon was absent, failed, or visually blank.

The old no-icon details column vertically centered the copy beneath an absolute Sponsored label. All split details now flow from Sponsored downward: optional icon, headline, advertiser, body, CTA. Without an icon, the headline sits 8 points below Sponsored. This preserves clear hierarchy and keeps the CTA beside its supporting copy. The video still sets the minimum card height, so short copy can leave trailing space below the CTA.

If a supplied icon fails to load or loads as a one-pixel-wide/high placeholder, its footprint collapses. The registered Image/NativeAsset remains mounted at zero size, retaining the existing SDK asset reference. Failure state is scoped to the exact ad object and URL; late failures from a previous ad cannot overwrite the current ad's state. A normal-size white/transparent image cannot be classified automatically from this metadata; no pixel or advertiser-name guessing is added.

## Rendered review and validation

[Before](before.png), [after](after.png), [failed-image fallback](failed-icon.png), [narrow split](narrow.png), [dark](dark.png).

Actual FullSizeSdkAdCard rendered through React Native Web with simulated SDK media/overlay and synthetic business copy. Reviewed missing and failed icons, 340-point split, 430-point dark, valid Pokémon-style app icon, landscape, 160% text and minimal copy. Ten fixtures have no horizontal overflow. Headline, advertiser, description and CTA are legible and grouped, Sponsored/AdChoices stay clear, spacing is consistent. The typical no-icon headline moves up 47.4 points, with a measured 8-point disclosure-to-title gap. Valid-icon before/after icon, headline and CTA bounds match exactly. Failed-image state is seeded for static rendering; callback handling is tested separately.

Three focused suites / 32 tests passed: FullSizeSdkAdCard, CompactSdkAdCard and nativeAdLayout. Four added regressions cover absent icon assets, image failure without ad/media/asset remount, replacement-ad and late-error ownership, and one-pixel placeholders versus valid images. The FullSize suite passed again after the null guard correction. TypeScript passed; Expo lint passed with 0 errors / 227 existing warnings; git diff --check passed.

The shared component covers list ads and ordinary SDK callout ads. No ad requests, loading/refresh policy, ownership, ranking, media aspect-ratio selection, video controls, runtime/native configuration or backend data changed. The accepted icon and check-in readiness work is retained from baseline bdeac48; live iOS Production source at preparation was 56320ed348dff5a3717d6bad5ae4bea5e53ecba3, group 5cc30b9f-426a-45de-b88d-c98c899a2328.

These renders verify layout, not native SDK playback/click behavior or phone adoption. No device/map manipulation was performed. Publication is under Craig's standing confidence-based iOS Production authority. Release identifiers and adoption status are recorded separately after publication. Raw render harness, fixtures, measurements, checks and release logs are in ignored artifacts/ad-no-icon-20261112/.
