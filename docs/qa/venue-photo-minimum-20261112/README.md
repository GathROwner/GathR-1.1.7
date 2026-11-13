# Larger minimum GathR venue photos — November 12, 2026

Craig accepted the first 50% increase, then reported that one-/two-venue markers and the larger Merchantman logo still looked small. This additive revision gives rich GathR venue photos explicit low/medium/high interest diameters of 40/44/48 points, replacing 25.92/32.4/38.88. That is approximately 54%/36%/23% more diameter than the accepted live version. Venue count does not determine these sizes; the change compresses interest-based size variation. Existing iOS selection scale remains 1.2, producing a maximum selected photo diameter of 57.6 points.

VenueLens receives its displayed diameter directly. Fallback initials/glyphs scale with it. The core, existing halo sizing and outboard friend-badge positions derive from the same scale, so the photograph remains contained. Category labels, venue-count badges, overview/legacy marker dimensions, data sourcing, image rotation, cluster counts/membership, coordinates and touch handlers keep their behavior. PuckMarkerMeasurement and tutorial geometry read native layout bounds rather than hard-coded circle sizes.

## Visual review and checks

[Before](before.png) and [after](after.png) render the actual TreeMarker, VenueLens, category stage, indicator rail, summary, effects and friend badge through React Native Web. Venue logos and category/interest inputs are fixtures; image/dot animations are frozen visible. Nine cases cover one-event and two-event labels, low/medium/high interest, two venues, selection, missing photos, friend indicators, overview and legacy.

Independent screenshot review found noticeably larger logos, intact circular crops, aligned category labels and venue-count rails, and friend badges outside the photo center. Render assertions check exact 40/44/48-point diameters (57.6 selected), image containment and unchanged category/overview/legacy dimensions. This is actual-component evidence, not a native Mapbox scene or native collision/tap test. Dense-map appearance and phone adoption remain device-unverified.

Five focused suites / 61 tests passed: PuckMarkerMeasurement, clusterPuckLayout, tutorialClusterGeometryGate, tutorialClusterSpotlight and tutorialClusterTarget. TypeScript and Expo lint passed (0 errors / 227 existing warnings); diff whitespace checks passed. Harness, metrics and logs are in ignored artifacts/venue-photo-minimum-20261112/.

Working baseline: fcb23e3, containing the accepted first sizing release and all prior ads/readiness work. Reversible checkpoint: codex/checkpoint-venue-photo-minimum-20261112. Live iOS Production before preparation: source e02d09092bb1a7b864e40017299680878df3a7d9, group ac08b180-0e27-4a9b-88a3-f3ad8feb1264, runtime 1.1.20. Release identifiers are recorded separately after publication under Craig's standing iOS Production authority.
