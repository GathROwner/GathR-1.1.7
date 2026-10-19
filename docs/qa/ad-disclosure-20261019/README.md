# Portrait Sponsored label refinement - October 19, 2026

Craig confirmed horizontal H2 and then supplied the first vertical video screenshot. Its portrait B proportions, controls and corrected margins were visually accepted. His annotated follow-up requests moving Sponsored to the right-hand details column so the video can use the row above it.

## Change

Only the split portrait feed layout relocates Sponsored into a positioned disclosure area at the top of its details column. That column reserves 26 points above its details plus 24 points on the disclosure's right for the SDK-owned AdChoices corner. The video is not covered by the label. Media width changes from 43% to 47% of the available inner card width, giving a taller video at its original aspect ratio. Its 220-point width / 420-point height bounds remain. Right-hand title/body/CTA registration and existing text limits remain; details can grow for longer content.

The ordinary card owns padding/border; NativeAdView remains inset-free. One SDK ad and one media view remain per card. No ad loading, refresh, object ownership, ranking or list changes. Horizontal/square/unknown/no-media and stacked narrow/large-font layouts retain the previous disclosure row and sizing. Callout parity remains outstanding; CompactSdkAdCard is unchanged in this patch. Production remains held.

## Visual review

[Reviewed screenshot](rendered-fixtures.jpg): actual components rendered through RNW with simulated SDK media/overlay. BEFORE uses both the old component AND old helper from source ae590bb, avoiding mixing new sizing into the comparison. Ten fixtures reviewed: two before views and eight current states including short Tower copy and longer Pokemon copy, light/dark, landscape, square, unknown/no media, narrow and 160% text. Typography, spacing, label/AdChoices separation, CTA and controls remain legible in this rendered evidence.

At a 374-point card width, the normal 9:16 portrait video grows from 153.08 x 272.14 to 167.31 x 297.45 points; its top inset falls from 35 to 9 while bottom remains 9. Total card height remains approximately 316 points. Horizontal media/card measurements are unchanged; no horizontal overflow. This is layout evidence, not native SDK playback or iPhone acceptance. Post-publication phone check pending.

## Checks

Seven existing focused suites / 52 tests pass; TypeScript passes; lint zero errors / 215 existing warnings. No new test cases or dependencies/native changes for this small presentation tweak. The existing suites cover native registration/ownership, ratio fallbacks, inset-free root, and retained feed/save behavior. Export, release identifiers and phone-check status in RELEASE.md. No map interaction, backend/data write, Android release or Production update.

Ignored raw harness, baseline snapshots, metrics and logs: artifacts/ad-disclosure-20261019/.
