# Smaller summary ring with interior clearance

Craig rejected the preceding size as still too large and its house/count as crowded. The preceding stylesheet claimed an 11-point house, but the preview host's important Lucide sizing rule actually rendered it at 16 points. This revision explicitly fixes the rendered icon dimensions and further reduces the ring and count.

[Prototype](prototype.html), [Now](now.png), [second venue](selected.png), [Today](today.png), [halo origin](origin.png), [expanded](expanded.png), [phone width](narrow.png), [checks](CHECKS.json).

The summary ring is 24 points (previously 32), with a 1.25-point stroke. The house is actually 7.5 points and the count 9 points with a 10-point line box and one-point horizontal gap. Their combined box corners are at most 8.40 points from the circle center, leaving 1.72 points before the inside edge of the stroke. The summary event/special icons are explicitly 12 points; their numerals stay 12 points. The summary capsule is 112 by 28 points, with all groups centered. Its ring button retains an invisible 44-point target. Main venue photo, photo ring, upper rail, friend badge and synchronized rotation behavior remain unchanged.

Browser verification passed for actual computed icon/count sizes, interior clearance, button dimensions, both ring highlights and upper outline, fixed totals, halo origin/colors, fan expansion, rotation, zero counts, reduced motion and 320px layout. Now, second-venue, narrow and expanded screenshots were independently inspected before delivery. No runtime errors. This check caught the inherited icon-size override before final capture.

This is a browser-only design mockup using fictional counts/check-ins and Craig's supplied venue images. No app source or OTA changed. Dense native-map collision behavior and multi-digit venue-count layouts remain unverified; production implementation must handle those cases separately.
