# Larger GathR venue profile circles — November 12, 2026

Craig selected a 50% diameter increase for the small circular venue photos below GathR's dark category labels. The new scale applies to rich/story GathR markers. The surrounding core grows to contain the image; its radius remains circular. Low/medium/high normal photo diameters change from 17.28/21.6/25.92 to 25.92/32.4/38.88 points. Selected iOS markers retain their existing 1.2 selection scale (high-interest photo about 46.66 points).

Category marquees and venue-count badges retain their sizes. Existing broadcast/city/friend halos scale around the larger core. Friend check-in/event badges are moved toward its edge to keep the venue image visible. Missing-photo initials/glyphs scale with the circle; initials use white against the existing dark lens background. The overview and legacy presentations retain their dimensions. Image sourcing, rotation intervals, cluster membership/counts, touch handlers and map coordinates are unchanged. Mapbox's bottom anchor is unchanged; native marker/tutorial bounds continue to be measured from layout.

## Visual evidence and checks

[Before](before.png), [after](after.png), [medium marker detail](detail.png).

The actual TreeMarker, ClusterEventStage, VenueLens, VenueIndicatorRail, summary marker, effects and styles were extracted from the owning map source and rendered through React Native Web. FriendCheckInBadge and icon fonts are the real components/assets. Category-list/user-interest inputs and venue logos are fixtures; image/new-content animations are frozen in visible states. This is actual-component layout evidence, not a native Mapbox scene, collision-engine test or on-device tap/adoption check.

Nine cases before/after were reviewed: low/medium/high interest, multiple venues, selected, missing photo, friend indicators, overview and legacy. Diameter assertions require 1.5×; image bounds stay within the enlarged core; category label dimensions match before/after. Overview/legacy bounds and text match. Review found clearer photos, aligned labels and count rails, visible friend counts and no clipping of the larger images. Dense native-map collision behavior remains device-unverified.

Five focused suites / 61 tests passed: PuckMarkerMeasurement, clusterPuckLayout, tutorialClusterGeometryGate, tutorialClusterSpotlight and tutorialClusterTarget. TypeScript and Expo lint passed (0 errors / 227 existing warnings); diff whitespace checks passed. Render assertions and fixture screenshots are under ignored artifacts/venue-photo-20261112/.

Baseline: 7d15852 on codex/app-ui-changes, retaining the accepted ad and readiness work. Reversible checkpoint: codex/checkpoint-venue-photo-size-20261112. Live iOS Production at preparation: source 81d591a156625138087c077f03d775eba5c47523, group 88122556-dd82-4165-a44d-0115d68c3eeb, runtime 1.1.20. Publication is under Craig's standing authority for confident completed iOS Production UI changes. No native/config/dependency or backend changes; no device/map manipulation was performed. Release identifiers and device adoption are recorded separately after publication.
