# Restore trace-logo placement above Mapbox

Craig's screenshot shows the GathR trace button next to the floating bottom
dock. Its separate host used fixed `bottom: 24`, bypassing the normal brand
anchor. Normal non-diagnostic branding already uses `globeBottomOffset`, eight
points above Mapbox's 21-point logo and above the dock.

The trace host now uses that same visual anchor. A 40-point centered touch host
around the existing 24-point image requires bottom `globeBottomOffset - 8`
and left 2 to put the actual image at left 10, matching normal branding.
The fixed bottom offset is removed. Image appearance/size, touch-target size,
press, long-press, accessibility handlers and diagnostic gating are unchanged.
Mapbox's required native attribution/logo and all other map controls are unchanged.

## Visual review

`comparison.png` renders the actual before/after TouchableOpacity JSX, asset and
styles using React Native Web. Mapbox and the dock are explicit layout fixtures
at the existing map chrome offsets, not a native map screenshot. No native map
manipulation was performed, and Craig's private screenshot is not committed.

Independently reviewed the rendered comparison: one GathR icon, above Mapbox,
left alignment matching normal branding, eight-point image-to-Mapbox clearance,
no dock overlap. The 40-point hit box ends at Mapbox's upper edge without
covering it. Fixtures cover iPhone bottom insets 34 and 0, and Android inset 24.
AST-extracted handler source and image styles match the prior accepted source.
`GEOMETRY.json` records the actual browser bounds from those rendered elements.

This is a reversible placement-only edit, so no new unit tests or broad startup
suite reruns were added. Source/render checks, TypeScript, lint, Mapbox and the
production release preflight are the checks for this scope. Native adoption and
appearance remain unverified until Craig observes the update. Startup caching,
guest handling, pulses and tap delivery are preserved.

## Published iOS Production

- Implementation `4c07e39`; clean release source `b06809e0d8e9c26b39815c717eebe340ff1498b5`.
- Runtime `1.1.20`, group `345e9529-555f-4187-b906-197cfa533756`.
- Update `01a1e412-284e-7b96-ab0c-6081a4c3d8a2` (`OTA 01a1e412`).
- EAS view and newest-iOS list independently match source, runtime, platform,
  group and update. Export: 2581 modules, 112 final iOS assets.
- Release render/source checks, TypeScript, lint (zero errors), Mapbox,
  production Firebase/auth/social environment and clean ancestry preflights passed.
- The release comparison PNG is byte-identical to the independently viewed source
  render (SHA-256 `a88ae76082b4d168d96d5cebea30e29a2273d64e7e1f934d8effbd915a0ab457`).
- No other platforms/channels, native builds, startup/cache changes or backend
  changes in this iteration. Native phone adoption/appearance remain unverified.

Receipts: `CHECKS_PASSED.json`, `VISUAL_REVIEW.json`, `PUBLISHED_IOS.json`.
