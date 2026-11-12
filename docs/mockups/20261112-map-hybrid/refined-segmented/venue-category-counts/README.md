# Category counts inside the venue summary

Craig accepted the small summary-ring proportions and asked how to show icons/counts for the types of events inside the displayed venue. This proposal adds a second row inside the upper venue summary, leaving the accepted photo and summary rings unchanged.

[Prototype](prototype.html), [initial venue](now.png), [next venue](selected.png), [Today](today.png), [origin](origin.png), [expanded](expanded.png), [phone width](narrow.png), [checks](CHECKS.json).

The upper row retains venue event/special totals and the house scope icon. Beneath a quiet divider, category icons and counts show only nonzero types belonging to the displayed venue. Event categories are blue and special categories green, with distinct icons and accessible category labels/tooltips. In the initial fictional fixture this is Music 2, Trivia 1 and Happy Hour 1, summing to three events and one special. Every category updates with the photo, totals, ring highlights and outline. Expanded branches show each venue's own categories. The bottom cluster summary still has static total venues, events, specials and cluster friend count.

The additional row takes approximately 20 points of height. The photo/cluster summary are shifted down by that amount to retain spacing. Venue category icons are explicitly 11 points, overriding the preview host's icon sizing rule. The previously accepted summary ring is still 24 points with its 7.5-point house and 9-point numeral; main photo remains 40 points.

Browser checks passed for category membership and per-kind sums across all four venues, synchronized rotation, zero totals, static cluster numbers, accepted summary-ring clearance, both rings, halo origins and colors, expansion, reduced motion and 320px layout. Rendered initial, narrow and expanded screenshots were independently reviewed for spacing, hierarchy and clipping before delivery. No page errors.

Mockup only: no app source or OTA changed. Counts/check-ins are fictional and photos use Craig's supplied screenshot. Dense native-map collisions, very large category sets, multi-digit counts and final navigation behavior need separate implementation validation. Production category totals must respect the same active date/filter scope as the venue totals and avoid double-counting multi-category events.
