# Static cluster-summary ring

Craig pointed out that a moving selected segment beside static cluster totals suggests those totals also describe the selected venue. This revision removes selected-position feedback from the lower summary ring entirely. Its four segments use one neutral color and stay identical as venue photos rotate. Its house/count and small dimensions remain unchanged.

[Prototype](prototype.html), [first venue](today-736.png), [second venue](next-venue-736.png), [second venue at phone width](next-venue-320.png), [dark appearance](today-dark.png), [checks](CHECKS.json).

The photo ring still highlights the displayed venue's segment, matching the category-summary outline. Photo, category counts and upper accent remain synchronized. The lower ring does not adopt that accent and its button no longer announces a selected venue position. Cluster totals remain fixed within the chosen time window; date-window changes can still recalculate actual totals. The ring's neutral segment markup is also independent of expanded/collapsed venue state. Existing cluster timing halo behavior is unchanged.

Browser checks verified identical summary-ring markup across four manual changes and automatic six-second rotation, a stable cluster-summary button label, uniform neutral segments, and the expected purple photo segment/upper outline for venue two. Existing category membership/sums, rare overflow detail, dismissal, time-window totals, accepted ring sizes, count-group spacing and 320px layout checks also passed. First/second-venue, phone-width and dark screenshots were independently reviewed. No page errors.

Browser mockup only; no app source or OTA changed. Fictional fixture counts/check-ins and supplied screenshot photos remain as described in [single-row categories](../venue-category-strip/README.md). Native map collision and final navigation behavior are not verified by this preview.
