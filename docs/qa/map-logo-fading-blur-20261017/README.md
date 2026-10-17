# Fading logo backdrop with palette E

**Accepted by Craig after iOS Preview publication on October 17, 2026:** “That is perfectly it . Love it”. The preparation-stage visual limits below remain historical evidence; final appearance now has user acceptance. See [accepted baseline](../../ACCEPTED_BASELINE_20261017.md). No assistant-operated device inspection is claimed.

Craig selected palette E (`#1B5C9F` lettering / `#96232B` pin and arcs) and approved mockup A's fading blur, rejecting a frosted pill/button silhouette. Preserve accepted 70x26 wordmark dimensions and geometry. Native code changes are limited to MapBrandWordmark colour, a new decorative MapLogoBackdrop, and mounting it behind the idle brand in FloatingMapSearchHeader.

Baseline independently read with EAS list/view: iOS Preview runtime1.1.10, update `01a14ad9-c577-78ec-9d18-a52f4f20082d`, group `be9ee1bb-1e66-404d-966c-227c970e91ab`, source `4484ccae1f1768a049f5dc3b7199f388b9e358b8`. Current branch retains that source and its evidence-only successor.

Native approach follows the existing status-bar EdgeBlur: Expo BlurView within MaskedView. A108x48radial alpha mask is centered behind the logo's existing108x40host; stops0/55/75/90/100percent use alpha1/1/.8/.3/0. Blur intensity55/tintlight matches the established status-bar strength. No explicit white overlay, background plate, border, radius or shadow; alpha is zero at every outer edge. The sharp foreground logo sits after the backdrop. The entire decorative subtree has pointerEvents none and is hidden from accessibility. It unmounts for active search and submitted-query states.

Reduce Transparency follows the existing status-bar semantics: use the same pale fill through the feathered mask instead of native blur, respond to preference changes and remove the listener on unmount. The asynchronous initial read is guarded against unmount. No map event/camera listeners, animation loops or Android experimental blur method are added. Existing native modules only; no native dependency/configuration change.

Validation: TypeScript passes;3focused suites/7tests pass (existing search lifecycle plus decorative-backdrop visibility, Reduce Transparency transitions/listener cleanup, existing status-bar regression); lint0errors/215existing warnings. App map was not mounted, manipulated or tested; no emulator reconnect.

Visual evidence: independently reviewed `isolated-render.png`, which renders actual wordmark paths and native mask-stop values against pale/blue backgrounds and a conflicting label. Browser backdrop blur is an approximation of UIKit's55intensity; native compositing and iPhone appearance remain unverified. `mask.svg` documents exact alpha geometry. Craig's standing confidence-based iOS Preview release authority applies; the existing working status-bar approach, tests, reviewed source and clean compatible export provide release confidence. Do not claim this isolated render is a native app screenshot.

Release scope: iOS Preview only, preserving runtime, auth continuity, social flags and Mapbox. No Production/Android release, native build, backend deploy or Firestore mutation.
