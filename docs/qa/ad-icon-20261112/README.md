# Responsive split-ad icon — November 12, 2026

Requested change: center and enlarge the app icon in the right-hand column of split portrait ads. Craig asked whether sizing could respond to the available space.

The split icon now occupies 32% of the details column, bounded to 48–64 points, with a square aspect ratio and horizontal centering. At a 390-point viewport / 374-point card it renders at 56.625 × 56.625. Separate split/ordinary styles prevent the ordinary 36-point height from overriding the square ratio. Text remains left-aligned. The shared component covers feed and normal SDK callout cards.

Visual review used the actual FullSizeSdkAdCard through React Native Web with simulated SDK media, icon and AdChoices overlay. Reviewed before/after at 390; narrow stacked at 320; narrow split at 340; dark at 430; tablet at 768; landscape; 160% text; and no-icon fallback. The larger icon stays centered over the copy, disclosure is clear, CTA remains legible, spacing is balanced, and no horizontal overflow was measured. Normal phone icon is about 57 points; wider layouts cap at 64. Existing narrow/large-text stacking is retained. The rendered large-text body retains its existing two-line truncation.

See [before](before-390.png) and [after](after-390.png). The synthetic creative is layout evidence; it is not native SDK playback or iOS/Android device acceptance. No emulator or map interactions, OTA publication, backend writes or native changes were performed.

Validation: 3 existing focused suites / 28 tests passed (FullSizeSdkAdCard, CompactSdkAdCard, nativeAdLayout); focused ESLint and git diff --check passed. No dependency manifest or lockfile changes. Source baseline: dfd642de168760835bfaf328d07b7c11bb270858 on codex/app-ui-changes. Local render harness, all nine screenshots and measurements: ignored artifacts/ad-icon-20261112/.
