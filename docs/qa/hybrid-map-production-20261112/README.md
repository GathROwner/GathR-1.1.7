# Hybrid map — iOS Production, November 12, 2026

Craig approved enabling the refined Hybrid markers in the app and explicitly requested an immediate iOS Production OTA. The fourth map-style choice is **Hybrid · Beta**, on the Current basemap. The selector uses two columns with 26-point button rows. Current remains the default; existing Current, Standard and GathR marker styles remain available.

Hybrid's upper strip contains the displayed venue's category icons and counts, divided into sections. Its outline matches the selected segment of the venue-photo ring. The venue rotates every six seconds; rotation pauses for selection, inactive maps and reduced motion. The lower strip stays fixed and contains a neutral segmented house/venue-count icon and cluster-wide event/special totals. Friends attach to their venue's segment, and new-content dots attach to the corresponding category. Timing halos originate at the photo-ring edge. The accepted 36/40/44-point photo sizes and 1.2 selected scaling are retained.

At overview zooms, compact totals prevent dense maps from showing every detailed photo marker. More than twelve venues simplify the photo ring; numeric venue totals remain explicit. The upper strip shows up to three categories plus an overflow indicator. Full content remains in the existing cluster callout. Missing/failed photos use initials. All cluster presses continue through the original native touchable and callout path; no new tap gesture or detail flow was added.

## Visual evidence

The actual React Native components were rendered through React Native Web with iOS props, fixture data/images and an SVG primitive bridge. Legend visibility was frozen open for rendering; marker animations were frozen. Independently reviewed hierarchy, spacing, alignment and containment across nine marker cases, plus the actual selector over Craig's map screenshot. This is equivalent component evidence, **not native iOS device verification**. Busy native-map collisions and on-phone adoption remain to be observed.

- [Actual marker renders](actual-markers.png)
- [Actual compact selector render](actual-selector.png)
- [Geometry checks](VISUAL_CHECKS.json)
- [Reproduction harness](render.cjs)

The harness needs the installed project dependencies and the existing local Chrome/Playwright runtime. It uses Craig's local reference attachment as the selector backdrop. Copy it to `artifacts/hybrid-production-20261112/render.cjs` before running with Node, or adjust its project-root path.

## Release validation

Clean release source starts from live iOS Production `d019fa256c494c45d4fa1e3d0c6e79e1cef6d253` and cherry-picks feature `bf6e724` as `d0e661963531b602e65b038507207addca3da6e3`. All accepted prior ad, readiness and photo-size changes are preserved. No native/configuration/dependency changes are included.

TypeScript, all 48 focused tests, Expo lint (zero errors; 227 existing warnings), Production Firebase/App Check/social environment guard, iOS Production configuration check, Mapbox preflight and clean iOS export passed. Export graph: 2,560 modules. Raw logs are in ignored `artifacts/hybrid-production-20261112/` in the clean release checkout. Publication and EAS readback are recorded in `RELEASE.md` and the JSON receipt.
