# Hybrid zoom coverage and tighter spacing

Craig's device screenshots confirmed the first Hybrid release was working, but full venue detail appeared only at close zoom and the summary pills were too far from the photo ring. This follow-up keeps Hybrid's full photo/category/cluster-summary stack at every zoom. It removes the Hybrid totals-only rendering branch and bypasses the delayed rich-detail gate for Hybrid. Current, Standard and GathR keep their existing presentation policies; cluster taps/callouts are unchanged.

Normal ring-to-summary gaps shrink from 12 points above / 16 below to **4 points on both sides**. Attached friend badges can reserve extra clearance, with two points between the badge and summary. Photo sizes, rotation, static cluster totals, venue/category newness, friend association and timing halos are preserved.

## Reviewed evidence

- [Actual component render](actual-markers.png)
- [Geometry checks](VISUAL_CHECKS.json)
- [Reproduction harness](render.cjs)

Reviewed nine rendered cases, including a single venue without friends, friend-bearing clusters, a selected venue, missing images, category overflow and a 126-venue overview cluster. The no-friend cases measure exactly four points above and below the ring. All rendered friend badges clear both summary pills. Photos and upper categories remain present for the large overview fixture. This is actual React Native component rendering through React Native Web with iOS props and fixture data/SVG bridging, not native iOS device validation. Copy the harness to `artifacts/hybrid-density-20261112/render.cjs` in the project to reproduce.

The focused regression checks a large cluster still rotates its displayed venue while retaining both summaries. Existing rotation/reduced-motion, venue/category newness and static cluster totals checks remain in place.

Live base: `d0e661963531b602e65b038507207addca3da6e3` / group `65e3db2c-c156-4a22-b1eb-5ca6c90d3e57`. Feature: `b9bdf23`; clean release source: `aa25b83fb058af5ca679737ad15d14784a4a972e`. Release metadata is recorded separately after EAS publication/readback. Raw evidence is archived under ignored `artifacts/hybrid-density-20261112/` in the retained app UI checkout.
