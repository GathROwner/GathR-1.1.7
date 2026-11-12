# Single-row cluster summary with linked venue outline

Craig clarified that the segmented house/count indicator belongs in the cluster summary. He then refined the proposal: place it in the bottom summary row in place of the split/network icon, remove the entire category row, and match the upper venue-summary outline to the highlighted venue segment. The venue photo, its segment and upper counts/outline should update together, while cluster totals remain fixed.

[Prototype](prototype.html), [initial](now.png), [second venue](selected.png), [Today halo](today.png), [halo origin](origin.png), [expanded](expanded.png), [narrow](narrow.png), [checks](CHECKS.json).

## Current proposal

The top rail contains counts for the displayed venue, followed by its plain 40-point photo. Its outline uses the displayed venue's accent. The bottom is one 132-by-52-point capsule: a 44-point segmented circle containing the house icon and fixed venue count (4), followed by total events (8) and total specials (5). The cluster friend badge (3) remains attached to the lower summary. The category row and split/network icon are removed entirely.

There is only one segmented ring per marker, located in the lower summary. Its highlighted segment follows the displayed venue and matches the top outline. In the four-venue fixture, accents are blue, purple, rose and cyan; none uses the green/yellow timing colors. The photo, upper counts, upper outline and highlighted segment share one active-venue state. Lower numeric totals, background and friend count remain fixed; only the segment highlight moves.

Timing stays cluster-wide: green Now or yellow Today. The halo is emitted from the exact same lower-summary ring geometry and coordinate container, not from a separate outer ring. No green/yellow status dots are present. The labeled initial 35% mid-pulse frame, manual scrubbing, one-shot pulse and reduced-motion handling are retained.

Tapping the house/count ring fans out the venues. Expanded venues use their own matching outline colors, and all their ring segments are visible. The summary totals remain fixed below the branches. Selection returns to the chosen venue. This is an exploratory interaction, not production navigation.

## Verification

Browser checks passed for exactly one ring in the lower summary, house/count containment inside it, a plain photo, absence of category row/network icon, fixed venue and cluster totals, matching outline/segment colors for multiple venues, synchronized photo/count changes, independent Now/Today halo color, exact shared halo origin, house-ring expansion, six-second rotation, fan count sums, zeros, reduced motion and 320px layout without overflow. No page errors. Initial, second-venue, narrow and expanded screenshots were independently reviewed.

Counts and friend activity are fictional sample data. Event/special totals are derived from consistent sample category allocations, although category icons/subtotals are no longer displayed. Photos come from Craig's provided screenshot and are displayed through CSS clipping. Existing accepted photo sizes remain 36/40/44 points; this preview uses 40 points with labeled magnification.

No app source or OTA changed. Busy native-map collision behavior and final tap/navigation behavior are unverified. Real implementation should preserve a venue's accent across filtering/reordering and use photo/position/accessibility identity alongside color; four fixture accents do not establish a unique-color strategy for large clusters.
