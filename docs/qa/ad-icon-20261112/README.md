# Responsive split-ad icon — November 12, 2026

## Current refinement

Craig annotated the remaining space above the icon and asked for equal gaps to Sponsored and the title. Starting from af73713, split cards with an icon now flow the disclosure, icon and copy from the top instead of centering the icon/copy group beneath an absolute disclosure. Both gaps are 8 points. Width is 56% of the column with 64–112-point bounds: 99.109 square at a 390-point viewport, 84.265 at 340, 110.984 at 430 and 112 at 768. The title at 390 moves only about 4 points while the icon grows into the former upper gap. No-icon and non-split layouts retain their previous behavior.

Reviewed actual-component RNW renders at 340, 390, 430/dark and 768: icon centered, equal gaps measured, disclosure/AdChoices clear, text and CTA readable. Narrow cards grow to fit the larger icon/copy. All nine fixtures show no horizontal overflow. [Previous](spacing-before-390.png) and [equal-gap result](spacing-after-390.png). This is simulated SDK layout evidence, with no native device validation or publication. Focused suites / 28 tests, focused ESLint and diff checks passed. The callout test's old absolute-position expectation was updated to require in-flow disclosure height. Harness and measurements: ignored artifacts/ad-icon-20261112-spacing/.

## Larger-icon refinement

Craig reviewed the centered icon and requested a larger result. Starting from db4d743, the width increases to 42% of the details column with 56–88-point bounds. The typical 390-point viewport now renders a 74.328-point square (previously 56.625); 340-point split renders 63.203; 430 renders 83.234; tablet caps at 88. Sizing responds to column width rather than measuring unused vertical space. Narrow cards can grow slightly to accommodate copy without overlap.

Reviewed actual-component RNW renders at 340, 390, 430/dark and 768: centered square icon, clear disclosure, balanced spacing and legible title/body/CTA. All nine fixture measurements show no horizontal overflow; ordinary stacked layouts retain the 36-point icon. [Previous refinement](larger-before-390.png) and [larger result](larger-after-390.png). The SDK media/icon/overlay remain simulated; no native device validation or publication. Three focused suites / 28 tests, focused ESLint and diff whitespace checks passed. Harness and metrics: ignored artifacts/ad-icon-20261112-larger/.

## Initial refinement

Requested change: center and enlarge the app icon in the right-hand column of split portrait ads. Craig asked whether sizing could respond to the available space.

The split icon now occupies 32% of the details column, bounded to 48–64 points, with a square aspect ratio and horizontal centering. At a 390-point viewport / 374-point card it renders at 56.625 × 56.625. Separate split/ordinary styles prevent the ordinary 36-point height from overriding the square ratio. Text remains left-aligned. The shared component covers feed and normal SDK callout cards.

Visual review used the actual FullSizeSdkAdCard through React Native Web with simulated SDK media, icon and AdChoices overlay. Reviewed before/after at 390; narrow stacked at 320; narrow split at 340; dark at 430; tablet at 768; landscape; 160% text; and no-icon fallback. The larger icon stays centered over the copy, disclosure is clear, CTA remains legible, spacing is balanced, and no horizontal overflow was measured. Normal phone icon is about 57 points; wider layouts cap at 64. Existing narrow/large-text stacking is retained. The rendered large-text body retains its existing two-line truncation.

See [before](before-390.png) and [after](after-390.png). The synthetic creative is layout evidence; it is not native SDK playback or iOS/Android device acceptance. No emulator or map interactions, OTA publication, backend writes or native changes were performed.

Validation: 3 existing focused suites / 28 tests passed (FullSizeSdkAdCard, CompactSdkAdCard, nativeAdLayout); focused ESLint and git diff --check passed. No dependency manifest or lockfile changes. Source baseline: dfd642de168760835bfaf328d07b7c11bb270858 on codex/app-ui-changes. Local render harness, all nine screenshots and measurements: ignored artifacts/ad-icon-20261112/.
