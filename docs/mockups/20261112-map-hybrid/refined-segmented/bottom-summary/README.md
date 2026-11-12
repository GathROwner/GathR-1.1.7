# Venue above, fixed cluster summary below

Craig asked whether aggregate information should sit above or below, and described the familiar pattern as venue information above and cluster-wide information below. The recommendation is to preserve that order: displayed-venue counts and photo together above, stable combined totals below.

[Prototype](prototype.html), [Now](now.png), [Today](today.png), [halo origin](origin.png), [selected](selected.png), [expanded](expanded.png), [narrow](narrow.png), [checks](CHECKS.json).

The upper house/event/special rail belongs to the displayed venue. The lower pale-blue strip combines the cluster's category count, total venues, events, specials and friends. It stays fixed during photo rotation. In the sample, Hunter's has 3 events, 1 special and 2 friends; the cluster has 4 venues, 8 events, 5 specials, Music category count 4 and 3 friends. Annotations outside the marker identify the scopes explicitly.

The fan-out places the individual venues above and the combined summary below. Picking a venue returns to its selected detail. The marker's visible group is also ordered ahead of the aggregate summary in the DOM.

The halo and segmented ring now share the photo button's coordinate container, viewBox, center and radius, so moving the venue/count layout cannot offset the halo origin. At 0% both start at the same boundary; the timing-colored wave expands/fades outward. There is no permanent outer circle or separate green/yellow status dot. Green means cluster Now; yellow means cluster Today. The initial 35% frame is explicitly labeled mid-pulse. Scrubbing to 0% shows the origin; Pulse halo replays the emission. Reduced motion and manual frame preview are retained.

Browser checks passed for venue counts above the photo, cluster summary below it, exact shared halo origin, Now/Today colors, independent pulse, no timing dots, fixed cluster totals, synchronized venue counts/photo/explanation, six-second rotation, fan-out sums, zero values, friend scopes and 320px layout. No page errors. Now and expanded screenshots were independently reviewed; the earlier phase-origin, yellow and narrow renders were also reviewed during this iteration.

This proposal preserves the accepted 36/40/44-point production photo sizes (the example uses 40 points with labeled preview magnification). Counts and friend activity are fictional sample data. This is a browser design comparison, not an app implementation, native-map collision check or OTA. The preceding top-summary version remains under ../halo-origin-hierarchy/ for comparison.
