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
